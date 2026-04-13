import AppKit
import Foundation
import MaumauDiscovery
import MaumauIPC
import MaumauKit
import SwiftUI

extension OnboardingView {
    static func reconnectModeAfterSuccessfulOnboarding(
        connectionMode: AppState.ConnectionMode
    ) -> AppState.ConnectionMode? {
        switch connectionMode {
        case .local, .remote:
            return connectionMode
        case .unconfigured:
            return nil
        }
    }

    static func managedBrowserStartParams(profile: String = "maumau") -> [String: AnyCodable] {
        ManagedBrowserSignInLauncher.startParams(profile: profile)
    }

    private func resetWizardAfterNavigation() {
        Task {
            await self.onboardingWizard.cancelIfRunning()
            self.onboardingWizard.reset()
        }
    }

    func selectLocalGateway() {
        self.state.connectionMode = .local
        self.preferredGatewayID = nil
        self.showAdvancedConnection = false
        GatewayDiscoveryPreferences.setPreferredStableID(nil)
    }

    func selectUnconfiguredGateway() {
        Task { await self.onboardingWizard.cancelIfRunning() }
        self.state.connectionMode = .unconfigured
        self.preferredGatewayID = nil
        self.showAdvancedConnection = false
        GatewayDiscoveryPreferences.setPreferredStableID(nil)
    }

    func selectRemoteGateway(_ gateway: GatewayDiscoveryModel.DiscoveredGateway) {
        Task { await self.onboardingWizard.cancelIfRunning() }
        self.preferredGatewayID = gateway.stableID
        GatewayDiscoveryPreferences.setPreferredStableID(gateway.stableID)
        GatewayDiscoverySelectionSupport.applyRemoteSelection(gateway: gateway, state: self.state)

        self.state.connectionMode = .remote
        MacNodeModeCoordinator.shared.setPreferredGatewayStableID(gateway.stableID)
    }

    func openSettings(tab: SettingsTab) {
        SettingsTabRouter.request(tab)
        self.openSettings()
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: .maumauSelectSettingsTab, object: tab)
        }
    }

    func goToOnboardingPage(_ pageID: Int) {
        guard let cursor = self.pageOrder.firstIndex(of: pageID) else { return }
        withAnimation { self.currentPage = cursor }
    }

    func maybeDefaultToLocalConnectionMode() {
        guard Self.shouldDefaultToLocalConnectionMode(
            connectionMode: self.state.connectionMode,
            onboardingSeen: self.state.onboardingSeen,
            remoteUrl: self.state.remoteUrl,
            hasSelectedOnboardingLanguage: self.state.hasSelectedOnboardingLanguage)
        else { return }
        self.selectLocalGateway()
    }

    func handleBack() {
        guard !self.onboardingFinishing else { return }
        let leavingWizard = self.activePageIndex == self.wizardPageIndex
        if leavingWizard, !self.onboardingWizard.isSatisfiedForOnboarding {
            self.resetWizardAfterNavigation()
        }
        withAnimation {
            self.currentPage = max(0, self.currentPage - 1)
        }
    }

    func handleNext() {
        if self.isWizardBlocking || self.onboardingFinishing { return }
        let leavingWizard = self.activePageIndex == self.wizardPageIndex
        if leavingWizard, !self.onboardingWizard.isSatisfiedForOnboarding {
            self.resetWizardAfterNavigation()
        }
        if self.currentPage < self.pageCount - 1 {
            withAnimation { self.currentPage += 1 }
        } else {
            self.finish()
        }
    }

    func finish() {
        guard !self.onboardingFinishing else { return }
        self.onboardingFinishing = true
        self.onboardingFinishStatus = macLocalized(
            "Applying setup changes...",
            language: self.state.effectiveOnboardingLanguage)
        self.onboardingFinishStatusIsError = false

        Task { @MainActor in
            guard self.state.connectionMode == .local, !self.state.onboardingSeen else { return }
            await self.maybeLoadOnboardingSkills()
            await self.maybeAutoInstallDefaultSkills()
        }

        Task { @MainActor in
            // A lingering setup wizard session can defer gateway restarts triggered by
            // the final config apply, so end it before waiting for restart readiness.
            await self.onboardingWizard.cancelIfRunning()
            let applied = await self.onboardingChannelsStore.applyDeferredConfigChanges()
            guard applied else {
                self.onboardingFinishing = false
                self.onboardingFinishStatus =
                    self.onboardingChannelsStore.configStatus
                    ?? macLocalized(
                        "Could not finish setup. Review the saved settings and try again.",
                        language: self.state.effectiveOnboardingLanguage)
                self.onboardingFinishStatusIsError = true
                return
            }

            let reconnectMode = Self.reconnectModeAfterSuccessfulOnboarding(
                connectionMode: self.state.connectionMode)
            let paused = self.state.isPaused
            do {
                try await Self.finalizeSuccessfulOnboarding(
                    reconnectMode: reconnectMode,
                    paused: paused,
                    refreshGateway: { mode, paused in
                        try await self.refreshGatewayBeforeClosing(mode: mode, paused: paused)
                    },
                    markSeen: {
                        AppStateStore.shared.onboardingSeen = true
                        UserDefaults.standard.set(true, forKey: "maumau.onboardingSeen")
                        UserDefaults.standard.set(currentOnboardingVersion, forKey: onboardingVersionKey)
                    },
                    closeWindow: {
                        self.onboardingFinishStatus = nil
                        self.onboardingFinishStatusIsError = false
                        OnboardingController.shared.close()
                    })
            } catch {
                self.onboardingFinishing = false
                self.onboardingFinishStatus = self.gatewayRefreshFailureStatus(detail: error.localizedDescription)
                self.onboardingFinishStatusIsError = true
            }
        }
    }

    @MainActor
    static func finalizeSuccessfulOnboarding(
        reconnectMode: AppState.ConnectionMode?,
        paused: Bool,
        refreshGateway: @escaping @MainActor @Sendable (AppState.ConnectionMode, Bool) async throws -> Void,
        markSeen: @escaping @MainActor @Sendable () -> Void,
        closeWindow: @escaping @MainActor @Sendable () -> Void
    ) async throws {
        if let reconnectMode {
            try await refreshGateway(reconnectMode, paused)
        }
        markSeen()
        closeWindow()
    }

    @MainActor
    static func refreshStatusAfterSuccessfulOnboarding(
        language: OnboardingLanguage,
        timeoutMs: Int = 30_000,
        refreshHealthStore: @escaping @MainActor @Sendable () async -> Void,
        currentHealthError: @escaping @MainActor @Sendable () -> String?
    ) async throws {
        _ = try await AsyncTimeout.withTimeoutMs(
            timeoutMs: timeoutMs,
            onTimeout: {
                NSError(
                    domain: "Onboarding",
                    code: 4,
                    userInfo: [
                        NSLocalizedDescriptionKey: macLocalized(
                            "Refreshing Maumau status timed out. Wait a moment, then press Finish again.",
                            language: language),
                    ])
            },
            operation: {
                await refreshHealthStore()
                return true
            })

        if let lastError = currentHealthError()?
            .trimmingCharacters(in: .whitespacesAndNewlines),
           !lastError.isEmpty
        {
            throw NSError(
                domain: "Onboarding",
                code: 3,
                userInfo: [NSLocalizedDescriptionKey: lastError])
        }
    }

    @MainActor
    private func refreshGatewayBeforeClosing(
        mode: AppState.ConnectionMode,
        paused: Bool
    ) async throws {
        let language = self.state.effectiveOnboardingLanguage

        // If the app is intentionally paused, keep the saved setup and allow the
        // user to resume the gateway later instead of forcing an unexpected start.
        if mode == .local, paused {
            return
        }

        self.onboardingFinishStatus = macLocalized(
            "Refreshing gateway...",
            language: language)
        self.onboardingFinishStatusIsError = false
        await ConnectionModeCoordinator.shared.apply(mode: mode, paused: paused)

        self.onboardingFinishStatus = macLocalized(
            "Checking gateway health...",
            language: language)
        _ = try await AsyncTimeout.withTimeoutMs(
            timeoutMs: 20_000,
            onTimeout: {
                NSError(
                    domain: "Onboarding",
                    code: 2,
                    userInfo: [
                        NSLocalizedDescriptionKey: macLocalized(
                            "Gateway health check timed out. Fix the gateway, then press Finish again.",
                            language: language),
                    ])
            },
            operation: {
                try await GatewayConnection.shared.healthSnapshot(timeoutMs: 10_000)
            })

        self.onboardingFinishStatus = macLocalized(
            "Refreshing Maumau status...",
            language: language)
        try await Self.refreshStatusAfterSuccessfulOnboarding(
            language: language,
            refreshHealthStore: {
                await HealthStore.shared.refresh(onDemand: true)
            },
            currentHealthError: {
                HealthStore.shared.lastError
            })
    }

    @MainActor
    private func gatewayRefreshFailureStatus(detail: String) -> String {
        let trimmed = detail.trimmingCharacters(in: .whitespacesAndNewlines)
        let prefix = macLocalized(
            "Setup is saved, but Maumau could not refresh the gateway yet. Keep this window open, fix the gateway, and press Finish again.",
            language: self.state.effectiveOnboardingLanguage)
        guard !trimmed.isEmpty else { return prefix }
        return "\(prefix)\n\n\(trimmed)"
    }

    func copyToPasteboard(_ text: String) {
        let pb = NSPasteboard.general
        pb.clearContents()
        pb.setString(text, forType: .string)
        self.copied = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { self.copied = false }
    }

    func skipWizardForLater() {
        Task { await self.onboardingWizard.skipForNow() }
    }

    @discardableResult
    func openManagedBrowserForSignIn(profile: String = "maumau") async -> Bool {
        guard !self.managedBrowserSignInLaunching else { return false }
        self.managedBrowserSignInLaunching = true
        defer { self.managedBrowserSignInLaunching = false }

        do {
            try await ManagedBrowserSignInLauncher.start(profile: profile)
            self.managedBrowserSignInStatus = self.strings.managedBrowserSignInOpenedStatus
            return true
        } catch {
            self.managedBrowserSignInStatus =
                "\(self.strings.managedBrowserSignInFailedStatusPrefix) \(error.localizedDescription)"
            return false
        }
    }
}
