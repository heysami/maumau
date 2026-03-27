import SwiftUI

extension ChannelsSettings {
    private var whatsAppLinkedIdentity: String? {
        let status = self.store.snapshot?.decodeChannel("whatsapp", as: ChannelsStatusSnapshot.WhatsAppStatus.self)
        return status?.`self`?.e164 ?? status?.`self`?.jid
    }

    private var whatsAppIdentityBadgeText: String {
        Self.whatsAppIdentityBadgeText(
            linkedIdentity: self.whatsAppLinkedIdentity,
            qrVisible: self.store.whatsappLoginQrDataUrl != nil)
    }

    private var whatsAppIdentityHeadline: String {
        Self.whatsAppIdentityHeadline(linkedIdentity: self.whatsAppLinkedIdentity)
    }

    private var whatsAppIdentityBodyText: String {
        Self.whatsAppIdentityBodyText(
            linkedIdentity: self.whatsAppLinkedIdentity,
            qrVisible: self.store.whatsappLoginQrDataUrl != nil)
    }

    private var whatsAppPrimaryButtonTitle: String {
        self.store.whatsappLoginQrDataUrl == nil ? "Link WhatsApp" : "Refresh QR"
    }

    func formSection(_ title: String, @ViewBuilder content: () -> some View) -> some View {
        GroupBox(title) {
            VStack(alignment: .leading, spacing: 10) {
                content()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    func channelHeaderActions(_ channel: ChannelItem) -> some View {
        HStack(spacing: 8) {
            if channel.id == "whatsapp" {
                Button("Logout") {
                    Task { await self.store.logoutWhatsApp() }
                }
                .buttonStyle(.bordered)
                .disabled(self.store.whatsappBusy)
            }

            if channel.id == "telegram" {
                Button("Logout") {
                    Task { await self.store.logoutTelegram() }
                }
                .buttonStyle(.bordered)
                .disabled(self.store.telegramBusy)
            }

            Button {
                Task { await self.store.refresh(probe: true) }
            } label: {
                if self.store.isRefreshing {
                    ProgressView().controlSize(.small)
                } else {
                    Text("Refresh")
                }
            }
            .buttonStyle(.bordered)
            .disabled(self.store.isRefreshing)
        }
        .controlSize(.small)
    }

    var whatsAppSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            self.channelGuidanceSection(channelId: "whatsapp")
            self.whatsAppLinkingSection

            self.configEditorSection(channelId: "whatsapp")
        }
    }

    var onboardingWhatsAppSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            self.onboardingGuidanceSection(channelId: "whatsapp")
            self.whatsAppLinkingSection
            self.onboardingSetupOnlyNote(
                "Onboarding links the WhatsApp identity and opens direct chats so the linked number can reply right away. Advanced access or routing changes stay in full Settings → Channels.")
        }
    }

    func supportsInlineOnboardingSetup(_ channelId: String) -> Bool {
        ChannelsStore.inlineOnboardingChannelIDs.contains(channelId)
    }

    func genericChannelSection(_ channel: ChannelItem) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            self.channelGuidanceSection(channelId: channel.id)
            self.configEditorSection(channelId: channel.id)
        }
    }

    func onboardingChannelSetupSection(_ channel: ChannelItem) -> some View {
        switch channel.id {
        case "whatsapp":
            return AnyView(self.onboardingWhatsAppSection)
        case "telegram":
            return AnyView(self.onboardingTelegramSection)
        case "discord":
            return AnyView(self.onboardingDiscordSection)
        case "slack":
            return AnyView(self.onboardingSlackSection)
        case "line":
            return AnyView(self.onboardingLineSection)
        case "imessage":
            return AnyView(self.onboardingIMessageSection)
        default:
            return AnyView(self.onboardingGenericChannelSection(channel))
        }
    }

    private var onboardingTelegramSection: some View {
        let handle = self.telegramBotHandle
        let tokenSaved = self.hasSavedStringValue(at: self.channelConfigPath("telegram", "botToken"))
        let headline = handle.map { "@\($0)" } ?? (tokenSaved ? "Bot token saved" : "No bot token saved yet")
        let body = handle != nil
            ? "This Telegram bot is the agent identity. People message that bot handle to talk to the agent."
            : tokenSaved
                ? "Maumau already has a Telegram bot token saved. Refresh after the bot is live to show the handle here."
                : "Paste the bot token from BotFather. Maumau will open Telegram DMs so the bot can reply right away, while still requiring mentions in groups."
        let badge = handle != nil ? "Ready to message" : (tokenSaved ? "Token saved" : "Needs token")

        return VStack(alignment: .leading, spacing: 16) {
            self.onboardingGuidanceSection(channelId: "telegram")
            OnboardingSingleSecretSetupCard(
                store: self.store,
                channelId: "telegram",
                sectionTitle: "Bot identity",
                title: "Telegram Agent",
                headline: headline,
                message: body,
                badge: badge,
                systemImage: "paperplane.circle.fill",
                tint: handle != nil || tokenSaved ? .green : .accentColor,
                fieldLabel: "Telegram bot token",
                placeholder: "1234567890:AAExampleTelegramBotToken",
                existingCredentialNote: tokenSaved
                    ? "A Telegram bot token is already saved. Paste a new one only if you want to replace it."
                    : nil,
                buttonTitle: "Save Telegram bot",
                successMessage: "Telegram bot saved. Direct messages are open so it replies right away.",
                buildUpdates: { token in
                    [
                        (self.channelConfigPath("telegram", "enabled"), true),
                        (self.channelConfigPath("telegram", "botToken"), token),
                        (self.channelConfigPath("telegram", "groups", "*", "requireMention"), true),
                    ]
                })
            self.configStatusMessage
            self.onboardingSetupOnlyNote(
                "Onboarding opens Telegram DMs so you can message the bot immediately, and keeps group mention gating on. Tighten DM access later in full Settings → Channels if you want pairing or an allowlist.")
        }
    }

    private var onboardingDiscordSection: some View {
        let handle = self.discordBotHandle
        let tokenSaved = self.hasSavedStringValue(at: self.channelConfigPath("discord", "token"))
        let headline = handle.map { "@\($0)" } ?? (tokenSaved ? "Bot token saved" : "No bot token saved yet")
        let body = handle != nil
            ? "This Discord bot is the agent identity. People DM it or talk to it in the servers where you install it."
            : tokenSaved
                ? "Maumau already has a Discord bot token saved. Refresh after the bot is installed to show the bot name here."
                : "Paste the Discord bot token from the Developer Portal. Maumau will open direct messages so the bot can reply right away after you install it."
        let badge = handle != nil ? "Ready in Discord" : (tokenSaved ? "Token saved" : "Needs token")

        return VStack(alignment: .leading, spacing: 16) {
            self.onboardingGuidanceSection(channelId: "discord")
            OnboardingSingleSecretSetupCard(
                store: self.store,
                channelId: "discord",
                sectionTitle: "Bot identity",
                title: "Discord Agent",
                headline: headline,
                message: body,
                badge: badge,
                systemImage: "gamecontroller.fill",
                tint: handle != nil || tokenSaved ? .green : .accentColor,
                fieldLabel: "Discord bot token",
                placeholder: "Paste the Discord bot token",
                existingCredentialNote: tokenSaved
                    ? "A Discord bot token is already saved. Paste a new one only if you want to replace it."
                    : nil,
                buttonTitle: "Save Discord bot",
                successMessage: "Discord bot saved. Direct messages are open so it replies right away after install.",
                buildUpdates: { token in
                    [
                        (self.channelConfigPath("discord", "enabled"), true),
                        (self.channelConfigPath("discord", "token"), token),
                    ]
                })
            self.configStatusMessage
            self.onboardingSetupOnlyNote(
                "Onboarding opens Discord DMs so people can message the bot immediately after you invite or install it. Tighten DM access later in full Settings → Channels if you want pairing or an allowlist.")
        }
    }

    private var onboardingSlackSection: some View {
        let botTokenSaved = self.hasSavedStringValue(at: self.channelConfigPath("slack", "botToken"))
        let appTokenSaved = self.hasSavedStringValue(at: self.channelConfigPath("slack", "appToken"))
        let saved = botTokenSaved && appTokenSaved
        let headline = saved ? "Slack app tokens saved" : "No Slack app tokens saved yet"
        let body = saved
            ? "This Slack app becomes the agent identity inside the workspace. People DM it or mention it where the app is installed."
            : "Paste the bot token and app token from your Slack app. Maumau uses Socket Mode and opens direct messages so the app can reply right away after install."
        let badge = saved ? "Tokens saved" : "Needs tokens"

        return VStack(alignment: .leading, spacing: 16) {
            self.onboardingGuidanceSection(channelId: "slack")
            OnboardingDualSecretSetupCard(
                store: self.store,
                channelId: "slack",
                sectionTitle: "App identity",
                title: "Slack Agent",
                headline: headline,
                message: body,
                badge: badge,
                systemImage: "number.square.fill",
                tint: saved ? .green : .accentColor,
                firstFieldLabel: "Slack bot token",
                firstPlaceholder: "xoxb-...",
                secondFieldLabel: "Slack app token",
                secondPlaceholder: "xapp-...",
                existingCredentialNote: saved
                    ? "Slack bot and app tokens are already saved. Paste new ones only if you want to replace them."
                    : nil,
                buttonTitle: "Save Slack app",
                successMessage: "Slack app saved. Direct messages are open so it replies right away after install.",
                buildUpdates: { botToken, appToken in
                    [
                        (self.channelConfigPath("slack", "enabled"), true),
                        (self.channelConfigPath("slack", "mode"), "socket"),
                        (self.channelConfigPath("slack", "botToken"), botToken),
                        (self.channelConfigPath("slack", "appToken"), appToken),
                    ]
                })
            self.configStatusMessage
            self.onboardingSetupOnlyNote(
                "Onboarding opens Slack DMs so people can message the app immediately after install. Tighten DM access later in full Settings → Channels if you want pairing or an allowlist.")
        }
    }

    private var onboardingLineSection: some View {
        let tokenSaved = self.hasSavedStringValue(at: self.channelConfigPath("line", "channelAccessToken"))
        let secretSaved = self.hasSavedStringValue(at: self.channelConfigPath("line", "channelSecret"))
        let saved = tokenSaved && secretSaved
        let headline = saved ? "LINE channel credentials saved" : "No LINE channel linked yet"
        let body = saved
            ? "This LINE Official Account is the agent identity. People message that account, and the agent replies there."
            : "Paste the Channel access token and Channel secret from the LINE Developers Console. Maumau will open direct messages so the account can reply right away once the webhook is live."
        let badge = saved ? "Credentials saved" : "Needs credentials"

        return VStack(alignment: .leading, spacing: 16) {
            self.onboardingGuidanceSection(channelId: "line")
            OnboardingDualSecretSetupCard(
                store: self.store,
                channelId: "line",
                sectionTitle: "Bot identity",
                title: "LINE Agent",
                headline: headline,
                message: body,
                badge: badge,
                systemImage: "message.badge.circle.fill",
                tint: saved ? .green : .accentColor,
                firstFieldLabel: "LINE Channel access token",
                firstPlaceholder: "Paste the Channel access token",
                secondFieldLabel: "LINE Channel secret",
                secondPlaceholder: "Paste the Channel secret",
                existingCredentialNote: saved
                    ? "LINE credentials are already saved. Paste new ones only if you want to replace them."
                    : nil,
                buttonTitle: "Save LINE bot",
                successMessage: "LINE bot saved. Direct messages are open so it replies right away once the webhook is live.",
                buildUpdates: { accessToken, channelSecret in
                    [
                        (self.channelConfigPath("line", "enabled"), true),
                        (self.channelConfigPath("line", "channelAccessToken"), accessToken),
                        (self.channelConfigPath("line", "channelSecret"), channelSecret),
                    ]
                })
            self.configStatusMessage
            self.onboardingSetupOnlyNote(
                "Onboarding opens LINE DMs so people can message the account immediately once the webhook is live. Tighten DM access later in full Settings → Channels if you want pairing or an allowlist.")
        }
    }

    private var onboardingIMessageSection: some View {
        let status = self.store.snapshot?.decodeChannel("imessage", as: ChannelsStatusSnapshot.IMessageStatus.self)
        let savedCliPath = self.savedStringValue(at: self.channelConfigPath("imessage", "cliPath")) ?? "imsg"
        let configured = status?.configured == true || self.hasSavedStringValue(at: self.channelConfigPath("imessage", "cliPath"))
        let headline = configured ? "Messages on this Mac" : "No Messages bridge saved yet"
        let body = configured
            ? "Maumau uses the Messages identity already signed into this Mac. If you installed imsg somewhere custom, the saved path is \(savedCliPath)."
            : "Use the Messages identity already signed into this Mac. If you installed imsg somewhere custom, change the CLI path before saving."
        let badge = configured ? "Ready on this Mac" : "Needs bridge"

        return VStack(alignment: .leading, spacing: 16) {
            self.onboardingGuidanceSection(channelId: "imessage")
            OnboardingIMessageSetupCard(
                store: self.store,
                channelId: "imessage",
                sectionTitle: "Agent identity",
                title: "Messages Agent",
                headline: headline,
                message: body,
                badge: badge,
                systemImage: "message.fill",
                tint: configured ? .green : .accentColor,
                initialCliPath: savedCliPath,
                successMessage: "Messages on this Mac saved. Direct messages are open so it replies right away.",
                buildUpdates: { cliPath in
                    [
                        (self.channelConfigPath("imessage", "enabled"), true),
                        (self.channelConfigPath("imessage", "cliPath"), cliPath),
                    ]
                })
            self.configStatusMessage
            self.onboardingSetupOnlyNote(
                "Onboarding points Maumau at imsg on this Mac and opens direct messages so it replies right away. Tighten DM access later in full Settings → Channels if you want pairing or an allowlist.")
        }
    }

    private var telegramBotHandle: String? {
        let status = self.store.snapshot?.decodeChannel("telegram", as: ChannelsStatusSnapshot.TelegramStatus.self)
        return status?.probe?.bot?.username?.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var discordBotHandle: String? {
        let status = self.store.snapshot?.decodeChannel("discord", as: ChannelsStatusSnapshot.DiscordStatus.self)
        return status?.probe?.bot?.username?.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func channelConfigPath(_ channelId: String, _ keys: String...) -> ConfigPath {
        [.key("channels"), .key(channelId)] + keys.map(ConfigPathSegment.key)
    }

    private func savedStringValue(at path: ConfigPath) -> String? {
        guard let value = self.store.configValue(at: path) as? String else {
            return nil
        }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private func hasSavedStringValue(at path: ConfigPath) -> Bool {
        self.savedStringValue(at: path) != nil
    }

    private func onboardingGenericChannelSection(_ channel: ChannelItem) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            self.onboardingGuidanceSection(channelId: channel.id)
            self.onboardingSetupOnlyNote(
                self.channelEnabled(channel)
                    ? "This channel is already connected. Maumau is using the recommended defaults unless you change them later in full Settings → Channels."
                    : "Onboarding only shows the key setup information for this app. When you connect it later, Maumau will use the recommended defaults automatically unless you change them in full Settings → Channels.")
        }
    }

    private var whatsAppLinkingSection: some View {
        self.formSection("Bot identity") {
            self.whatsAppIdentityCard

            if let message = self.store.whatsappLoginMessage {
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let qr = self.store.whatsappLoginQrDataUrl, let image = self.qrImage(from: qr) {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Scan this QR with the WhatsApp number the bot will use")
                        .font(.headline)
                    Text(
                        "The WhatsApp number or linked device that scans this QR becomes the bot identity. When people message that number, they are talking to the agent."
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                    Image(nsImage: image)
                        .resizable()
                        .interpolation(.none)
                        .frame(width: 220, height: 220)
                        .cornerRadius(12)
                }
            }

            HStack(spacing: 12) {
                Button {
                    Task { await self.store.startWhatsAppLogin(force: false) }
                } label: {
                    if self.store.whatsappBusy {
                        ProgressView().controlSize(.small)
                    } else {
                        Text(self.whatsAppPrimaryButtonTitle)
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(self.store.whatsappBusy)

                Button("Relink WhatsApp") {
                    Task { await self.store.startWhatsAppLogin(force: true) }
                }
                .buttonStyle(.bordered)
                .disabled(self.store.whatsappBusy)
            }
            .font(.caption)
        }
    }

    private var whatsAppIdentityCard: some View {
        let linked = self.whatsAppLinkedIdentity != nil
        let tint = linked ? Color.green : Color.accentColor

        return HStack(alignment: .center, spacing: 16) {
            ZStack {
                Circle()
                    .fill(tint.opacity(0.14))
                    .frame(width: 72, height: 72)
                Image(systemName: linked ? "message.circle.fill" : "qrcode.viewfinder")
                    .font(.system(size: 30, weight: .semibold))
                    .foregroundStyle(tint)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("WhatsApp Agent")
                    .font(.title3.weight(.semibold))
                Text(self.whatsAppIdentityHeadline)
                    .font(.headline)
                    .foregroundStyle(linked ? .primary : .secondary)
                    .textSelection(.enabled)
                Text(self.whatsAppIdentityBodyText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)

            Text(self.whatsAppIdentityBadgeText)
                .font(.caption2.weight(.semibold))
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(tint.opacity(0.14))
                .foregroundStyle(tint)
                .clipShape(Capsule())
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color(NSColor.windowBackgroundColor)))
    }

    static func whatsAppIdentityBadgeText(linkedIdentity: String?, qrVisible: Bool) -> String {
        if linkedIdentity != nil {
            return "Ready to message"
        }
        return qrVisible ? "Waiting for scan" : "Not linked"
    }

    static func whatsAppIdentityHeadline(linkedIdentity: String?) -> String {
        linkedIdentity ?? "No number linked yet"
    }

    static func whatsAppIdentityBodyText(linkedIdentity: String?, qrVisible: Bool) -> String {
        if let linkedIdentity {
            return "This linked WhatsApp account is the bot identity. Message \(linkedIdentity) from a normal WhatsApp account to talk to the agent."
        }
        if qrVisible {
            return "Scan the QR with the WhatsApp number or linked device the bot will use. Maumau cannot create a WhatsApp number for you."
        }
        return "Link the WhatsApp number or linked device the bot will use. Maumau cannot create a WhatsApp number for you."
    }

    private func onboardingSetupOnlyNote(_ message: String) -> some View {
        self.formSection("Setup for now") {
            Text(message)
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder
    private func onboardingGuidanceSection(channelId: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            self.channelPlainTextSection(
                title: "Agent identity",
                message: self.channelIdentityExplanation(channelId: channelId))
            self.channelChecklistSection(
                title: "What you need first",
                items: self.channelRequirements(channelId: channelId))
            self.channelChecklistSection(
                title: "How to get it",
                items: self.channelSetupSteps(channelId: channelId),
                ordered: true)

            let artifacts = self.channelArtifacts(channelId: channelId)
            if !artifacts.isEmpty {
                self.channelChecklistSection(
                    title: "Bring this back to Maumau",
                    items: artifacts)
            }
        }
    }

    @ViewBuilder
    private func channelPlainTextSection(title: String, message: String) -> some View {
        self.formSection(title) {
            Text(message)
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder
    private func channelChecklistSection(
        title: String,
        items: [String],
        ordered: Bool = false) -> some View
    {
        self.formSection(title) {
            ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                HStack(alignment: .top, spacing: 8) {
                    Text(ordered ? "\(index + 1)." : "•")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .frame(width: 18, alignment: .leading)
                    Text(item)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    @ViewBuilder
    private func channelLinksSection(_ links: [ChannelGuidanceLink]) -> some View {
        self.formSection("Official guides") {
            ForEach(links, id: \.title) { link in
                if let url = URL(string: link.url) {
                    Link(destination: url) {
                        Text(link.title)
                            .font(.caption)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func channelGuidanceSection(channelId: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            self.channelPlainTextSection(
                title: "Agent identity",
                message: self.channelIdentityExplanation(channelId: channelId))
            self.channelChecklistSection(
                title: "What we need from you",
                items: self.channelRequirements(channelId: channelId))
            self.channelChecklistSection(
                title: "How to get it",
                items: self.channelSetupSteps(channelId: channelId),
                ordered: true)

            let artifacts = self.channelArtifacts(channelId: channelId)
            if !artifacts.isEmpty {
                self.channelChecklistSection(
                    title: "What you will paste or link here",
                    items: artifacts)
            }

            self.channelPlainTextSection(
                title: "After setup",
                message: self.channelUsageExplanation(channelId: channelId))

            let links = self.channelQuickLinks(channelId: channelId)
            if !links.isEmpty {
                self.channelLinksSection(links)
            }
        }
    }

    @ViewBuilder
    private func configEditorSection(channelId: String) -> some View {
        self.formSection("Configuration") {
            ChannelConfigForm(store: self.store, channelId: channelId)
        }

        self.configStatusMessage

        HStack(spacing: 12) {
            Button {
                Task { await self.store.saveConfigDraft() }
            } label: {
                if self.store.isSavingConfig {
                    ProgressView().controlSize(.small)
                } else {
                    Text("Save")
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(self.store.isSavingConfig || !self.store.configDirty)

            Button("Reload") {
                Task { await self.store.reloadConfigDraft() }
            }
            .buttonStyle(.bordered)
            .disabled(self.store.isSavingConfig)

            Spacer()
        }
        .font(.caption)
    }

    @ViewBuilder
    var configStatusMessage: some View {
        if let status = self.store.configStatus {
            Text(status)
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

private struct OnboardingIdentityCardView: View {
    let title: String
    let headline: String
    let message: String
    let badge: String
    let systemImage: String
    let tint: Color

    var bodyView: some View {
        HStack(alignment: .center, spacing: 16) {
            ZStack {
                Circle()
                    .fill(self.tint.opacity(0.14))
                    .frame(width: 72, height: 72)
                Image(systemName: self.systemImage)
                    .font(.system(size: 30, weight: .semibold))
                    .foregroundStyle(self.tint)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text(self.title)
                    .font(.title3.weight(.semibold))
                Text(self.headline)
                    .font(.headline)
                    .foregroundStyle(.primary)
                    .textSelection(.enabled)
                Text(self.message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)

            Text(self.badge)
                .font(.caption2.weight(.semibold))
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(self.tint.opacity(0.14))
                .foregroundStyle(self.tint)
                .clipShape(Capsule())
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color(NSColor.windowBackgroundColor)))
    }

    var body: some View {
        self.bodyView
    }
}

private struct OnboardingSingleSecretSetupCard: View {
    @Bindable var store: ChannelsStore

    let channelId: String
    let sectionTitle: String
    let title: String
    let headline: String
    let message: String
    let badge: String
    let systemImage: String
    let tint: Color
    let fieldLabel: String
    let placeholder: String
    let existingCredentialNote: String?
    let buttonTitle: String
    let successMessage: String
    let buildUpdates: (String) -> [(path: ConfigPath, value: Any?)]

    @State private var secret = ""

    private var trimmedSecret: String {
        self.secret.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        GroupBox(self.sectionTitle) {
            VStack(alignment: .leading, spacing: 12) {
                OnboardingIdentityCardView(
                    title: self.title,
                    headline: self.headline,
                    message: self.message,
                    badge: self.badge,
                    systemImage: self.systemImage,
                    tint: self.tint)

                if let existingCredentialNote {
                    Text(existingCredentialNote)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Text(self.fieldLabel)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                SecureField(self.placeholder, text: self.$secret)
                    .textFieldStyle(.roundedBorder)

                Button {
                    let secret = self.trimmedSecret
                    Task {
                        let saved = await self.store.saveQuickSetupUpdates(
                            channelId: self.channelId,
                            self.buildUpdates(secret),
                            successMessage: self.successMessage)
                        if saved {
                            self.secret = ""
                        }
                    }
                } label: {
                    if self.store.isSavingConfig {
                        ProgressView().controlSize(.small)
                    } else {
                        Text(self.buttonTitle)
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(self.store.isSavingConfig || self.trimmedSecret.isEmpty)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct OnboardingDualSecretSetupCard: View {
    @Bindable var store: ChannelsStore

    let channelId: String
    let sectionTitle: String
    let title: String
    let headline: String
    let message: String
    let badge: String
    let systemImage: String
    let tint: Color
    let firstFieldLabel: String
    let firstPlaceholder: String
    let secondFieldLabel: String
    let secondPlaceholder: String
    let existingCredentialNote: String?
    let buttonTitle: String
    let successMessage: String
    let buildUpdates: (String, String) -> [(path: ConfigPath, value: Any?)]

    @State private var firstSecret = ""
    @State private var secondSecret = ""

    private var trimmedFirstSecret: String {
        self.firstSecret.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var trimmedSecondSecret: String {
        self.secondSecret.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        GroupBox(self.sectionTitle) {
            VStack(alignment: .leading, spacing: 12) {
                OnboardingIdentityCardView(
                    title: self.title,
                    headline: self.headline,
                    message: self.message,
                    badge: self.badge,
                    systemImage: self.systemImage,
                    tint: self.tint)

                if let existingCredentialNote {
                    Text(existingCredentialNote)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Text(self.firstFieldLabel)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                SecureField(self.firstPlaceholder, text: self.$firstSecret)
                    .textFieldStyle(.roundedBorder)

                Text(self.secondFieldLabel)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                SecureField(self.secondPlaceholder, text: self.$secondSecret)
                    .textFieldStyle(.roundedBorder)

                Button {
                    let firstSecret = self.trimmedFirstSecret
                    let secondSecret = self.trimmedSecondSecret
                    Task {
                        let saved = await self.store.saveQuickSetupUpdates(
                            channelId: self.channelId,
                            self.buildUpdates(firstSecret, secondSecret),
                            successMessage: self.successMessage)
                        if saved {
                            self.firstSecret = ""
                            self.secondSecret = ""
                        }
                    }
                } label: {
                    if self.store.isSavingConfig {
                        ProgressView().controlSize(.small)
                    } else {
                        Text(self.buttonTitle)
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(
                    self.store.isSavingConfig ||
                    self.trimmedFirstSecret.isEmpty ||
                    self.trimmedSecondSecret.isEmpty)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct OnboardingIMessageSetupCard: View {
    @Bindable var store: ChannelsStore

    let channelId: String
    let sectionTitle: String
    let title: String
    let headline: String
    let message: String
    let badge: String
    let systemImage: String
    let tint: Color
    let initialCliPath: String
    let successMessage: String
    let buildUpdates: (String) -> [(path: ConfigPath, value: Any?)]

    @State private var cliPath: String

    init(
        store: ChannelsStore,
        channelId: String,
        sectionTitle: String,
        title: String,
        headline: String,
        message: String,
        badge: String,
        systemImage: String,
        tint: Color,
        initialCliPath: String,
        successMessage: String,
        buildUpdates: @escaping (String) -> [(path: ConfigPath, value: Any?)])
    {
        self.store = store
        self.channelId = channelId
        self.sectionTitle = sectionTitle
        self.title = title
        self.headline = headline
        self.message = message
        self.badge = badge
        self.systemImage = systemImage
        self.tint = tint
        self.initialCliPath = initialCliPath
        self.successMessage = successMessage
        self.buildUpdates = buildUpdates
        self._cliPath = State(initialValue: initialCliPath)
    }

    private var trimmedCliPath: String {
        self.cliPath.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        GroupBox(self.sectionTitle) {
            VStack(alignment: .leading, spacing: 12) {
                OnboardingIdentityCardView(
                    title: self.title,
                    headline: self.headline,
                    message: self.message,
                    badge: self.badge,
                    systemImage: self.systemImage,
                    tint: self.tint)

                Text("imsg CLI path")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                TextField("imsg", text: self.$cliPath)
                    .textFieldStyle(.roundedBorder)

                Text(
                    "Use the default path if imsg is installed on this Mac normally. Only change it if you installed imsg somewhere custom or through a wrapper script."
                )
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

                Button {
                    let cliPath = self.trimmedCliPath
                    Task {
                        _ = await self.store.saveQuickSetupUpdates(
                            channelId: self.channelId,
                            self.buildUpdates(cliPath),
                            successMessage: self.successMessage)
                    }
                } label: {
                    if self.store.isSavingConfig {
                        ProgressView().controlSize(.small)
                    } else {
                        Text("Use Messages on this Mac")
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(self.store.isSavingConfig || self.trimmedCliPath.isEmpty)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
