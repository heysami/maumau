import Foundation

extension OnboardingView {
    static func onboardingKickoffMessage(secureDashboardUrl: String?) -> String {
        let base =
            "Hi! I just installed Maumau and you’re my brand‑new agent. " +
            "Please start the first‑run ritual from BOOTSTRAP.md, ask one question at a time, " +
            "and before we talk about channels, visit SOUL.md with me to craft it: " +
            "ask what matters to me and how you should be. Then guide me through choosing " +
            "how we should talk for now, and remind me that WhatsApp or Telegram can be linked later in Settings → Channels."
        let link = secureDashboardUrl?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !link.isEmpty else {
            return base
        }
        return
            base +
            "\n\nIf private access is ready, also tell me I can open the secure dashboard on my phone here:\n" +
            link +
            "\nMention that exact link early in the conversation so I can tap it."
    }

    func resolveOnboardingSecureDashboardUrl() async -> String? {
        guard self.state.connectionMode == .local else {
            return nil
        }

        let root = MaumauConfigFile.loadDict()
        let gateway = root["gateway"] as? [String: Any] ?? [:]
        let tailscaleMode = TailscaleIntegrationSection.resolveConfiguredTailscaleModeRaw(
            gateway: gateway)
        guard tailscaleMode == "serve" || tailscaleMode == "funnel" else {
            return nil
        }

        if self.state.connectionMode == .local,
           self.state.onboardingSeen == false,
           TailscaleService.shared.tailscaleHostname == nil
        {
            await TailscaleService.shared.checkTailscaleStatus()
        }

        let secureUrl = GatewayEndpointStore.secureDashboardURL(
            root: root,
            tailscaleHostname: TailscaleService.shared.tailscaleHostname,
            locale: self.state.effectiveOnboardingLanguage.controlUILocaleID)
        return secureUrl?.absoluteString
    }

    func maybeKickoffOnboardingChat(for pageIndex: Int) {
        guard pageIndex == self.onboardingChatPageIndex else { return }
        guard self.showOnboardingChat else { return }
        guard !self.didAutoKickoff else { return }
        self.didAutoKickoff = true

        Task { @MainActor in
            for _ in 0..<20 {
                if !self.onboardingChatModel.isLoading { break }
                try? await Task.sleep(nanoseconds: 200_000_000)
            }
            guard self.onboardingChatModel.messages.isEmpty else { return }
            let secureDashboardUrl = await self.resolveOnboardingSecureDashboardUrl()
            let kickoff = Self.onboardingKickoffMessage(secureDashboardUrl: secureDashboardUrl)
            self.onboardingChatModel.input = kickoff
            self.onboardingChatModel.send()
        }
    }
}
