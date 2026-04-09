import AppKit
import Foundation
import SwiftUI

private enum PhoneCallsSettingsExternalURL {
    static let twilioConsole = "https://console.twilio.com/"
    static let twilioGuide = "https://docs.maumau.ai/plugins/voice-call"
    static let twilioPhoneNumbers = "https://www.twilio.com/docs/phone-numbers"
    static let telnyxPortal = "https://portal.telnyx.com/"
    static let telnyxGuide = "https://docs.maumau.ai/plugins/voice-call"
    static let plivoConsole = "https://console.plivo.com/"
    static let plivoGuide = "https://docs.maumau.ai/plugins/voice-call"
    static let deepgramConsole = "https://console.deepgram.com/project/"
    static let deepgramGuide = "https://developers.deepgram.com/docs/voice-agent"
    static let openAIAPIKeys = "https://platform.openai.com/api-keys"
    static let openAIRealtimeGuide = "https://platform.openai.com/docs/guides/realtime"
    static let elevenLabsAuthGuide = "https://elevenlabs.io/docs/api-reference/authentication"
    static let elevenLabsVoiceLibrary = "https://elevenlabs.io/voice-library"
    static let vapiAssistants = "https://docs.vapi.ai/assistants"
    static let vapiImportTwilio = "https://docs.vapi.ai/phone-numbers/import-twilio/"
}

private struct PhoneCallsSettingsDraft: Equatable {
    var enabled: Bool
    var mode: ConversationAutomationVoiceMode
    var phoneProvider: ConversationAutomationTelephonyProvider
    var sttProvider: ConversationAutomationSttProvider
    var webhookMode: ConversationAutomationWebhookMode
    var fromNumber: String
    var twilioAccountSID: String
    var twilioAuthToken: String
    var telnyxAPIKey: String
    var telnyxConnectionID: String
    var telnyxPublicKey: String
    var plivoAuthID: String
    var plivoAuthToken: String
    var deepgramAPIKey: String
    var openAIAPIKey: String
    var elevenLabsAPIKey: String
    var elevenLabsVoiceID: String
    var publicWebhookURL: String
    var vapiAPIKey: String
    var vapiAssistantID: String
    var vapiPhoneNumberID: String
    var vapiPreferredLanguage: OnboardingLanguage
    var vapiBridgeMode: ConversationAutomationVapiBridgeMode
    var vapiManualBridgeURL: String
    var vapiBridgeAuthToken: String
    var allowFrom: [String]

    init(onboardingLanguage: OnboardingLanguage) {
        self.enabled = false
        self.mode = .simpleVapi
        self.phoneProvider = .twilio
        self.sttProvider = .deepgramRealtime
        self.webhookMode = .tailscaleFunnel
        self.fromNumber = ""
        self.twilioAccountSID = ""
        self.twilioAuthToken = ""
        self.telnyxAPIKey = ""
        self.telnyxConnectionID = ""
        self.telnyxPublicKey = ""
        self.plivoAuthID = ""
        self.plivoAuthToken = ""
        self.deepgramAPIKey = ""
        self.openAIAPIKey = ""
        self.elevenLabsAPIKey = ""
        self.elevenLabsVoiceID = ""
        self.publicWebhookURL = ""
        self.vapiAPIKey = ""
        self.vapiAssistantID = ""
        self.vapiPhoneNumberID = ""
        self.vapiPreferredLanguage = onboardingLanguage
        self.vapiBridgeMode = .autoBridge
        self.vapiManualBridgeURL = ""
        self.vapiBridgeAuthToken = ""
        self.allowFrom = []
    }

    @MainActor
    static func load(from root: [String: Any], onboardingLanguage: OnboardingLanguage) -> Self {
        let configuredMode = ConversationAutomationVoiceMode.loadSelection(
            from: value(in: root, at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("mode")]) as? String)
        let configuredPhoneProvider = ConversationAutomationTelephonyProvider.loadSelection(
            from: value(in: root, at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("provider")]) as? String)
        let configuredPublicWebhookURL = stringValue(
            in: root,
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("publicUrl")])
        let configuredTunnelProvider = stringValue(
            in: root,
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tunnel"), .key("provider")])
        let configuredTailscaleMode = stringValue(
            in: root,
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tailscale"), .key("mode")])
        let configuredVapiBridgeMode = ConversationAutomationVapiBridgeMode.loadSelection(
            from: value(
                in: root,
                at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("bridgeMode")]) as? String)
        let configuredVapiBridgeURL = stringValue(
            in: root,
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("bridgeUrl")])
        let configuredSttProvider = ConversationAutomationSttProvider.loadSelection(
            from: value(
                in: root,
                at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming"), .key("sttProvider")]) as? String)
        let hasSavedSelfHostedVoiceConfig =
            configuredPhoneProvider != nil ||
            !stringValue(
                in: root,
                at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("twilio"), .key("accountSid")]).isEmpty ||
            !stringValue(
                in: root,
                at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("twilio"), .key("authToken")]).isEmpty ||
            !stringValue(
                in: root,
                at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("telnyx"), .key("apiKey")]).isEmpty ||
            !stringValue(
                in: root,
                at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("plivo"), .key("authId")]).isEmpty ||
            value(
                in: root,
                at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming")]) != nil ||
            value(
                in: root,
                at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tts")]) != nil

        var draft = Self(onboardingLanguage: onboardingLanguage)
        let voiceCallEnabled =
            (value(in: root, at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("enabled")]) as? Bool)
                ?? false
        let voiceCallConfigEnabled =
            (value(
                in: root,
                at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("enabled")]) as? Bool)
                ?? voiceCallEnabled

        draft.enabled = voiceCallEnabled && voiceCallConfigEnabled
        draft.mode = Self.resolveVoiceMode(
            configuredMode: configuredMode,
            hasSavedSelfHostedVoiceConfig: hasSavedSelfHostedVoiceConfig)
        draft.phoneProvider = configuredPhoneProvider ?? .twilio
        draft.sttProvider = configuredSttProvider ?? .deepgramRealtime
        draft.webhookMode = ConversationAutomationWebhookMode.loadSelection(
            publicUrl: configuredPublicWebhookURL,
            tunnelProvider: configuredTunnelProvider,
            tailscaleMode: configuredTailscaleMode)
        draft.fromNumber = stringValue(
            in: root,
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("fromNumber")])
        draft.twilioAccountSID = stringValue(
            in: root,
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("twilio"), .key("accountSid")])
        draft.twilioAuthToken = stringValue(
            in: root,
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("twilio"), .key("authToken")])
        draft.telnyxAPIKey = stringValue(
            in: root,
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("telnyx"), .key("apiKey")])
        draft.telnyxConnectionID = stringValue(
            in: root,
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("telnyx"), .key("connectionId")])
        draft.telnyxPublicKey = stringValue(
            in: root,
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("telnyx"), .key("publicKey")])
        draft.plivoAuthID = stringValue(
            in: root,
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("plivo"), .key("authId")])
        draft.plivoAuthToken = stringValue(
            in: root,
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("plivo"), .key("authToken")])
        draft.deepgramAPIKey = stringValue(
            in: root,
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming"), .key("deepgram"), .key("apiKey")])
        draft.openAIAPIKey = stringValue(
            in: root,
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming"), .key("openai"), .key("apiKey")])
        draft.elevenLabsAPIKey = stringValue(
            in: root,
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tts"), .key("elevenlabs"), .key("apiKey")])
        draft.elevenLabsVoiceID = stringValue(
            in: root,
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tts"), .key("elevenlabs"), .key("voiceId")])
        draft.publicWebhookURL = configuredPublicWebhookURL
        draft.vapiAPIKey = stringValue(
            in: root,
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("apiKey")])
        draft.vapiAssistantID = stringValue(
            in: root,
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("assistantId")])
        draft.vapiPhoneNumberID = stringValue(
            in: root,
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("phoneNumberId")])
        draft.vapiPreferredLanguage = Self.resolvePreferredLanguage(
            configuredLanguage: OnboardingLanguage.loadSelection(
                from: value(
                    in: root,
                    at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("preferredLanguage")]) as? String),
            onboardingLanguage: onboardingLanguage)
        let autoBridgeURL =
            TailscaleService.shared.tailscaleHostname
            .map { OnboardingView.conversationAutomationVapiAutoBridgeURL(hostname: $0) }
        draft.vapiBridgeMode = ConversationAutomationVapiBridgeMode.resolveSelection(
            configuredMode: configuredVapiBridgeMode,
            configuredBridgeURL: configuredVapiBridgeURL,
            autoBridgeURL: autoBridgeURL)
        draft.vapiManualBridgeURL =
            draft.vapiBridgeMode == .manualPublicURL
            ? configuredVapiBridgeURL
            : ""
        draft.vapiBridgeAuthToken = stringValue(
            in: root,
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("bridgeAuthToken")])
        draft.allowFrom = stringArrayValue(
            in: root,
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("allowFrom")])
            .filter { $0.hasPrefix("+") }
        return draft
    }

    private static func value(in root: [String: Any], at path: ConfigPath) -> Any? {
        var current: Any? = root
        for segment in path {
            switch segment {
            case let .key(key):
                guard let dict = current as? [String: Any] else { return nil }
                current = dict[key]
            case let .index(index):
                guard let array = current as? [Any], array.indices.contains(index) else { return nil }
                current = array[index]
            }
        }
        return current
    }

    private static func stringValue(in root: [String: Any], at path: ConfigPath) -> String {
        ((value(in: root, at: path) as? String) ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func stringArrayValue(in root: [String: Any], at path: ConfigPath) -> [String] {
        (value(in: root, at: path) as? [Any])?
            .compactMap { ($0 as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty } ?? []
    }

    private static func resolveVoiceMode(
        configuredMode: ConversationAutomationVoiceMode?,
        hasSavedSelfHostedVoiceConfig: Bool) -> ConversationAutomationVoiceMode
    {
        configuredMode ?? (hasSavedSelfHostedVoiceConfig ? .advancedSelfHosted : .simpleVapi)
    }

    private static func resolvePreferredLanguage(
        configuredLanguage: OnboardingLanguage?,
        onboardingLanguage: OnboardingLanguage) -> OnboardingLanguage
    {
        configuredLanguage ?? onboardingLanguage
    }
}

@MainActor
struct PhoneCallsSettings: View {
    @Bindable var state: AppState
    @Bindable var store: ChannelsStore

    @State private var hasLoaded = false
    @State private var draft: PhoneCallsSettingsDraft
    @State private var draftDirty = false
    @State private var vapiAssistants: [ConversationAutomationVapiAssistant] = []
    @State private var vapiPhoneNumbers: [ConversationAutomationVapiPhoneNumber] = []
    @State private var vapiRefreshing = false
    @State private var vapiStatus: String?
    @State private var vapiStatusIsError = false
    @State private var saveStatus: String?
    @State private var saveStatusIsError = false
    @State private var testToNumber = ""
    @State private var testMessage = ""
    @State private var testCallID = ""
    @State private var testCallBusy = false
    @State private var testCallStatus: String?
    @State private var testCallStatusIsError = false

    private let tailscaleService: TailscaleService
    private let isPreview = ProcessInfo.processInfo.isPreview

    init(
        state: AppState,
        store: ChannelsStore = .shared,
        tailscaleService: TailscaleService = .shared)
    {
        self.state = state
        self.store = store
        self.tailscaleService = tailscaleService
        self._draft = State(initialValue: PhoneCallsSettingsDraft(onboardingLanguage: state.effectiveOnboardingLanguage))
    }

    private var language: OnboardingLanguage {
        self.state.effectiveOnboardingLanguage
    }

    private var strings: OnboardingStrings {
        OnboardingStrings(language: self.language)
    }

    private var selectedVapiPhoneNumber: ConversationAutomationVapiPhoneNumber? {
        self.vapiPhoneNumbers.first {
            $0.id.caseInsensitiveCompare(self.draft.vapiPhoneNumberID) == .orderedSame
        }
    }

    private var selectedVapiPhoneNumberProviderLabel: String? {
        let trimmed =
            self.selectedVapiPhoneNumber?.phoneCallProvider?.trimmingCharacters(in: .whitespacesAndNewlines)
            ?? self.selectedVapiPhoneNumber?.provider?.trimmingCharacters(in: .whitespacesAndNewlines)
            ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }

    private var expectedVapiAutoBridgeURL: String? {
        guard let hostname = self.tailscaleService.tailscaleHostname else { return nil }
        return OnboardingView.conversationAutomationVapiAutoBridgeURL(hostname: hostname)
    }

    private var resolvedVapiBridgeURL: String? {
        switch self.draft.vapiBridgeMode {
        case .autoBridge:
            return self.expectedVapiAutoBridgeURL
        case .manualPublicURL:
            let trimmed = self.draft.vapiManualBridgeURL.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        }
    }

    private var expectedWebhookURL: String? {
        switch self.draft.webhookMode {
        case .tailscaleFunnel:
            guard let hostname = self.tailscaleService.tailscaleHostname else { return nil }
            return "https://\(hostname)\(OnboardingView.conversationAutomationVoiceWebhookPath)"
        case .publicUrl:
            let trimmed = self.draft.publicWebhookURL.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        }
    }

    private var validationMessages: [String] {
        OnboardingView.conversationAutomationVoiceValidationMessages(
            telephonyEnabled: self.draft.enabled,
            mode: self.draft.mode,
            phoneProvider: self.draft.phoneProvider,
            sttProvider: self.draft.sttProvider,
            webhookMode: self.draft.webhookMode,
            fromNumber: self.draft.fromNumber,
            twilioAccountSID: self.draft.twilioAccountSID,
            twilioAuthToken: self.draft.twilioAuthToken,
            telnyxAPIKey: self.draft.telnyxAPIKey,
            telnyxConnectionID: self.draft.telnyxConnectionID,
            telnyxPublicKey: self.draft.telnyxPublicKey,
            plivoAuthID: self.draft.plivoAuthID,
            plivoAuthToken: self.draft.plivoAuthToken,
            deepgramAPIKey: self.draft.deepgramAPIKey,
            openAIAPIKey: self.draft.openAIAPIKey,
            elevenLabsAPIKey: self.draft.elevenLabsAPIKey,
            publicWebhookURL: self.draft.publicWebhookURL,
            vapiAPIKey: self.draft.vapiAPIKey,
            vapiAssistantID: self.draft.vapiAssistantID,
            vapiPhoneNumberID: self.draft.vapiPhoneNumberID,
            vapiBridgeMode: self.draft.vapiBridgeMode,
            vapiManualBridgeURL: self.draft.vapiManualBridgeURL,
            vapiAutoBridgeURL: self.expectedVapiAutoBridgeURL,
            tailscaleInstalled: self.tailscaleService.isInstalled,
            tailscaleRunning: self.tailscaleService.isRunning,
            tailscaleFunnelChecked: self.tailscaleService.funnelExposure.checked,
            tailscaleFunnelEnabled: self.tailscaleService.funnelExposure.featureEnabled,
            strings: self.strings)
    }

    var body: some View {
        ScrollView(.vertical) {
            VStack(alignment: .leading, spacing: 16) {
                self.header
                if self.state.connectionMode != .local {
                    self.remoteModeCard
                } else {
                    self.actionRow
                    if let saveStatus, !saveStatus.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        self.statusBanner(
                            text: saveStatus,
                            isError: saveStatusIsError)
                    }
                    self.overviewCard
                    self.modeCard
                    if self.draft.mode == .simpleVapi {
                        self.simpleVapiCard
                    } else {
                        self.advancedProviderCard
                        self.advancedWebhookCard
                        self.advancedSttCard
                        self.advancedTtsCard
                    }
                    self.readinessCard
                    self.testCallCard
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 24)
            .padding(.vertical, 18)
            .groupBoxStyle(PlainSettingsGroupBoxStyle())
        }
        .task {
            guard !self.hasLoaded else { return }
            self.hasLoaded = true
            guard !self.isPreview else { return }
            await self.loadFromStore()
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(macLocalized("Phone Calls", language: self.language))
                .font(.title3.weight(.semibold))
            Text(macLocalized(
                "Change how Maumau makes real phone calls. Use the same guided Vapi flow as onboarding, or switch back to the advanced self-hosted path.",
                language: self.language))
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var remoteModeCard: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 10) {
                Text(macLocalized("This screen is for the local Mac gateway.", language: self.language))
                    .font(.headline)
                Text(macLocalized(
                    "If Maumau runs on another host right now, keep using Settings → Config on that host for phone-call changes. Switch Maumau runs back to Local on this Mac when you want the guided phone-call flow here.",
                    language: self.language))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Button(macLocalized("Open Settings → Config", language: self.language)) {
                    self.selectSettingsTab(.config)
                }
                .buttonStyle(.bordered)
            }
        }
    }

    private var actionRow: some View {
        HStack(spacing: 10) {
            Button(macLocalized("Reload saved setup", language: self.language)) {
                Task { await self.loadFromStore(forceReload: true) }
            }
            .buttonStyle(.bordered)
            .disabled(self.store.isSavingConfig || self.vapiRefreshing || self.testCallBusy)

            Button(self.store.isSavingConfig
                ? macLocalized("Saving…", language: self.language)
                : macLocalized("Save phone-call settings", language: self.language))
            {
                Task { await self.saveSettings() }
            }
            .buttonStyle(.borderedProminent)
            .disabled(self.store.isSavingConfig || self.vapiRefreshing || self.testCallBusy)

            Button(macLocalized("Open Settings → Config", language: self.language)) {
                self.selectSettingsTab(.config)
            }
            .buttonStyle(.bordered)
        }
    }

    private var overviewCard: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 10) {
                self.sectionTitle(
                    self.strings.conversationAutomationTitle,
                    subtitle: self.strings.conversationAutomationIntro)
                Toggle(
                    isOn: self.binding(for: \.enabled))
                {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(self.strings.conversationAutomationTelephonyTitle)
                            .font(.headline)
                        Text(self.strings.conversationAutomationTelephonySubtitle)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                if !self.draft.enabled {
                    Text(macLocalized(
                        "Phone calls are off. You can finish configuring the flow now and turn it on later.",
                        language: self.language))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    private var modeCard: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 10) {
                self.sectionTitle(
                    self.strings.conversationAutomationModeTitle,
                    subtitle: self.strings.conversationAutomationModeSubtitle)
                Picker(
                    self.strings.conversationAutomationModeTitle,
                    selection: self.binding(for: \.mode))
                {
                    Text(self.strings.conversationAutomationModeSimpleLabel)
                        .tag(ConversationAutomationVoiceMode.simpleVapi)
                    Text(self.strings.conversationAutomationModeAdvancedLabel)
                        .tag(ConversationAutomationVoiceMode.advancedSelfHosted)
                }
                .pickerStyle(.segmented)
            }
        }
    }

    private var simpleVapiCard: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 12) {
                self.sectionTitle(
                    self.strings.conversationAutomationVapiTitle,
                    subtitle: self.strings.conversationAutomationVapiSubtitle)
                self.externalLinks([
                    (self.strings.conversationAutomationOpenTwilioNumberGuideButtonTitle, PhoneCallsSettingsExternalURL.twilioPhoneNumbers),
                    (self.strings.conversationAutomationOpenVapiImportButtonTitle, PhoneCallsSettingsExternalURL.vapiImportTwilio),
                    (self.strings.conversationAutomationOpenVapiAssistantsButtonTitle, PhoneCallsSettingsExternalURL.vapiAssistants),
                ])
                self.secureField(
                    title: self.strings.conversationAutomationVapiAPIKeyTitle,
                    subtitle: self.strings.conversationAutomationVapiAPIKeySubtitle,
                    placeholder: self.strings.conversationAutomationVapiAPIKeyPlaceholder,
                    text: self.binding(for: \.vapiAPIKey))

                HStack(spacing: 10) {
                    Button(
                        self.vapiRefreshing
                            ? self.strings.conversationAutomationVapiRefreshingButtonTitle
                            : self.strings.conversationAutomationVapiRefreshButtonTitle)
                    {
                        Task { await self.refreshVapiSelections() }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(self.vapiRefreshing)

                    if self.vapiRefreshing {
                        ProgressView()
                            .controlSize(.small)
                    }
                }

                if let vapiStatus, !vapiStatus.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    self.statusBanner(text: vapiStatus, isError: vapiStatusIsError)
                }

                Divider()

                if self.vapiAssistants.isEmpty {
                    self.infoRow(
                        title: self.strings.conversationAutomationVapiAssistantTitle,
                        subtitle: self.strings.conversationAutomationVapiAssistantEmptySubtitle,
                        systemImage: "person.wave.2")
                } else {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(self.strings.conversationAutomationVapiAssistantTitle)
                            .font(.headline)
                        Text(self.strings.conversationAutomationVapiAssistantSubtitle)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                        Picker(
                            self.strings.conversationAutomationVapiAssistantTitle,
                            selection: self.binding(for: \.vapiAssistantID))
                        {
                            if !self.draft.vapiAssistantID.isEmpty,
                               !self.vapiAssistants.contains(where: {
                                   $0.id.caseInsensitiveCompare(self.draft.vapiAssistantID) == .orderedSame
                               })
                            {
                                Text(
                                    self.strings.conversationAutomationVapiSavedSelectionLabel(
                                        id: self.draft.vapiAssistantID))
                                    .tag(self.draft.vapiAssistantID)
                            }
                            ForEach(self.vapiAssistants) { assistant in
                                Text(assistant.displayLabel)
                                    .tag(assistant.id)
                            }
                        }
                        .pickerStyle(.menu)
                    }
                }

                if self.vapiPhoneNumbers.isEmpty {
                    self.infoRow(
                        title: self.strings.conversationAutomationVapiPhoneNumberTitle,
                        subtitle: self.strings.conversationAutomationVapiPhoneNumberEmptySubtitle,
                        systemImage: "phone.arrow.up.right")
                } else {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(self.strings.conversationAutomationVapiPhoneNumberTitle)
                            .font(.headline)
                        Text(self.strings.conversationAutomationVapiPhoneNumberSubtitle)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                        Picker(
                            self.strings.conversationAutomationVapiPhoneNumberTitle,
                            selection: self.binding(for: \.vapiPhoneNumberID))
                        {
                            if !self.draft.vapiPhoneNumberID.isEmpty,
                               !self.vapiPhoneNumbers.contains(where: {
                                   $0.id.caseInsensitiveCompare(self.draft.vapiPhoneNumberID) == .orderedSame
                               })
                            {
                                Text(
                                    self.strings.conversationAutomationVapiSavedSelectionLabel(
                                        id: self.draft.vapiPhoneNumberID))
                                    .tag(self.draft.vapiPhoneNumberID)
                            }
                            ForEach(self.vapiPhoneNumbers) { phoneNumber in
                                Text(phoneNumber.displayLabel)
                                    .tag(phoneNumber.id)
                            }
                        }
                        .pickerStyle(.menu)
                    }
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text(self.strings.conversationAutomationVapiPreferredLanguageTitle)
                        .font(.headline)
                    Text(self.strings.conversationAutomationVapiPreferredLanguageSubtitle)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Picker(
                        self.strings.conversationAutomationVapiPreferredLanguageTitle,
                        selection: self.binding(for: \.vapiPreferredLanguage))
                    {
                        ForEach(OnboardingLanguage.allCases, id: \.rawValue) { option in
                            Text(option.displayName)
                                .tag(option)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                self.infoRow(
                    title: macLocalized(
                        "Use a Vapi assistant voice that already supports your call language.",
                        language: self.language),
                    subtitle: macLocalized(
                        "Maumau keeps the selected Vapi assistant voice. If you want Bahasa Indonesia or another language to sound right, configure a multilingual voice inside Vapi before running live calls.",
                        language: self.language),
                    systemImage: "waveform")

                if let provider = self.selectedVapiPhoneNumberProviderLabel,
                   provider.localizedCaseInsensitiveContains("twilio") == false
                {
                    self.infoRow(
                        title: macLocalized("Twilio import recommended", language: self.language),
                        subtitle: String(
                            format: macLocalized(
                                "This selected Vapi number shows %@. The simple path is designed around importing a Twilio voice number into Vapi.",
                                language: self.language),
                            provider),
                        systemImage: "phone.arrow.up.right")
                }

                Divider()

                VStack(alignment: .leading, spacing: 6) {
                    Text(self.strings.conversationAutomationVapiBridgeModeTitle)
                        .font(.headline)
                    Text(self.strings.conversationAutomationVapiBridgeModeSubtitle)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Picker(
                        self.strings.conversationAutomationVapiBridgeModeTitle,
                        selection: self.binding(for: \.vapiBridgeMode))
                    {
                        Text(self.strings.conversationAutomationVapiBridgeModeAutoLabel)
                            .tag(ConversationAutomationVapiBridgeMode.autoBridge)
                        Text(self.strings.conversationAutomationVapiBridgeModeManualLabel)
                            .tag(ConversationAutomationVapiBridgeMode.manualPublicURL)
                    }
                    .pickerStyle(.segmented)
                }

                switch self.draft.vapiBridgeMode {
                case .autoBridge:
                    if let bridgeURL = self.expectedVapiAutoBridgeURL {
                        self.readOnlyValue(
                            title: self.strings.conversationAutomationVapiBridgeTitle,
                            subtitle: self.strings.conversationAutomationVapiAutoBridgeSubtitle(bridgeURL: bridgeURL),
                            value: bridgeURL)
                    } else {
                        self.infoRow(
                            title: self.strings.conversationAutomationVapiBridgeTitle,
                            subtitle: self.strings.conversationAutomationVapiAutoBridgeWaitingSubtitle,
                            systemImage: "point.3.connected.trianglepath.dotted")
                    }

                    if !self.tailscaleService.isInstalled || !self.tailscaleService.isRunning {
                        self.actionInfoRow(
                            title: self.strings.conversationAutomationTailscaleUnavailableTitle,
                            subtitle: self.strings.conversationAutomationWebhookPrivateAccessSubtitle,
                            systemImage: "exclamationmark.triangle",
                            buttonTitle: macLocalized("Open Settings → General", language: self.language))
                        {
                            self.selectSettingsTab(.general)
                        }
                    } else if self.tailscaleService.funnelExposure.checked,
                              !self.tailscaleService.funnelExposure.featureEnabled,
                              let enableURL = self.tailscaleService.funnelExposure.enableURL,
                              let url = URL(string: enableURL)
                    {
                        self.actionInfoRow(
                            title: self.strings.conversationAutomationTailscaleUnavailableTitle,
                            subtitle: self.strings.conversationAutomationWebhookAdminSubtitle,
                            systemImage: "arrow.up.forward.app",
                            buttonTitle: self.strings.conversationAutomationOpenAdminButtonTitle)
                        {
                            NSWorkspace.shared.open(url)
                        }
                    }
                case .manualPublicURL:
                    self.textField(
                        title: self.strings.conversationAutomationVapiManualBridgeTitle,
                        subtitle: self.strings.conversationAutomationVapiManualBridgeSubtitle,
                        placeholder: self.strings.conversationAutomationVapiManualBridgePlaceholder,
                        text: self.binding(for: \.vapiManualBridgeURL))
                }

                self.infoRow(
                    title: self.strings.conversationAutomationVapiOutboundOnlyTitle,
                    subtitle: self.strings.conversationAutomationVapiOutboundOnlySubtitle,
                    systemImage: "phone.badge.waveform")
                self.infoRow(
                    title: self.strings.conversationAutomationVapiIndonesiaNoticeTitle,
                    subtitle: self.strings.conversationAutomationVapiIndonesiaNoticeSubtitle,
                    systemImage: "globe")
            }
        }
    }

    private var advancedProviderCard: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 10) {
                self.sectionTitle(
                    self.strings.conversationAutomationPhoneProviderTitle,
                    subtitle: self.strings.conversationAutomationPhoneProviderSubtitle)
                Picker(
                    self.strings.conversationAutomationPhoneProviderTitle,
                    selection: self.binding(for: \.phoneProvider))
                {
                    Text(self.strings.conversationAutomationPhoneProviderTwilioLabel)
                        .tag(ConversationAutomationTelephonyProvider.twilio)
                    Text(self.strings.conversationAutomationPhoneProviderTelnyxLabel)
                        .tag(ConversationAutomationTelephonyProvider.telnyx)
                    Text(self.strings.conversationAutomationPhoneProviderPlivoLabel)
                        .tag(ConversationAutomationTelephonyProvider.plivo)
                }
                .pickerStyle(.segmented)

                self.textField(
                    title: self.strings.conversationAutomationPhoneNumberTitle,
                    subtitle: self.strings.conversationAutomationPhoneNumberSubtitle,
                    placeholder: self.strings.conversationAutomationPhoneNumberPlaceholder,
                    text: self.binding(for: \.fromNumber))

                switch self.draft.phoneProvider {
                case .twilio:
                    Divider()
                    self.sectionTitle(
                        self.strings.conversationAutomationTwilioSectionTitle,
                        subtitle: self.strings.conversationAutomationTwilioSectionSubtitle)
                    self.externalLinks([
                        (self.strings.conversationAutomationOpenConsoleButtonTitle, PhoneCallsSettingsExternalURL.twilioConsole),
                        (self.strings.conversationAutomationOpenGuideButtonTitle, PhoneCallsSettingsExternalURL.twilioGuide),
                    ])
                    self.textField(
                        title: self.strings.conversationAutomationTwilioAccountSIDTitle,
                        subtitle: self.strings.conversationAutomationTwilioAccountSIDSubtitle,
                        placeholder: self.strings.conversationAutomationTwilioAccountSIDPlaceholder,
                        text: self.binding(for: \.twilioAccountSID))
                    self.secureField(
                        title: self.strings.conversationAutomationTwilioAuthTokenTitle,
                        subtitle: self.strings.conversationAutomationTwilioAuthTokenSubtitle,
                        placeholder: self.strings.conversationAutomationTwilioAuthTokenPlaceholder,
                        text: self.binding(for: \.twilioAuthToken))
                case .telnyx:
                    Divider()
                    self.sectionTitle(
                        self.strings.conversationAutomationTelnyxSectionTitle,
                        subtitle: self.strings.conversationAutomationTelnyxSectionSubtitle)
                    self.externalLinks([
                        (self.strings.conversationAutomationOpenPortalButtonTitle, PhoneCallsSettingsExternalURL.telnyxPortal),
                        (self.strings.conversationAutomationOpenGuideButtonTitle, PhoneCallsSettingsExternalURL.telnyxGuide),
                    ])
                    self.secureField(
                        title: self.strings.conversationAutomationTelnyxAPIKeyTitle,
                        subtitle: self.strings.conversationAutomationTelnyxAPIKeySubtitle,
                        placeholder: self.strings.conversationAutomationTelnyxAPIKeyPlaceholder,
                        text: self.binding(for: \.telnyxAPIKey))
                    self.textField(
                        title: self.strings.conversationAutomationTelnyxConnectionIDTitle,
                        subtitle: self.strings.conversationAutomationTelnyxConnectionIDSubtitle,
                        placeholder: self.strings.conversationAutomationTelnyxConnectionIDPlaceholder,
                        text: self.binding(for: \.telnyxConnectionID))
                    self.secureField(
                        title: self.strings.conversationAutomationTelnyxPublicKeyTitle,
                        subtitle: self.strings.conversationAutomationTelnyxPublicKeySubtitle,
                        placeholder: self.strings.conversationAutomationTelnyxPublicKeyPlaceholder,
                        text: self.binding(for: \.telnyxPublicKey))
                case .plivo:
                    Divider()
                    self.sectionTitle(
                        self.strings.conversationAutomationPlivoSectionTitle,
                        subtitle: self.strings.conversationAutomationPlivoSectionSubtitle)
                    self.externalLinks([
                        (self.strings.conversationAutomationOpenConsoleButtonTitle, PhoneCallsSettingsExternalURL.plivoConsole),
                        (self.strings.conversationAutomationOpenGuideButtonTitle, PhoneCallsSettingsExternalURL.plivoGuide),
                    ])
                    self.textField(
                        title: self.strings.conversationAutomationPlivoAuthIDTitle,
                        subtitle: self.strings.conversationAutomationPlivoAuthIDSubtitle,
                        placeholder: self.strings.conversationAutomationPlivoAuthIDPlaceholder,
                        text: self.binding(for: \.plivoAuthID))
                    self.secureField(
                        title: self.strings.conversationAutomationPlivoAuthTokenTitle,
                        subtitle: self.strings.conversationAutomationPlivoAuthTokenSubtitle,
                        placeholder: self.strings.conversationAutomationPlivoAuthTokenPlaceholder,
                        text: self.binding(for: \.plivoAuthToken))
                }
            }
        }
    }

    private var advancedWebhookCard: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 10) {
                self.sectionTitle(
                    self.strings.conversationAutomationWebhookTitle,
                    subtitle: self.strings.conversationAutomationWebhookSubtitle)
                Picker(
                    self.strings.conversationAutomationWebhookTitle,
                    selection: self.binding(for: \.webhookMode))
                {
                    Text(self.strings.conversationAutomationWebhookTailscaleLabel)
                        .tag(ConversationAutomationWebhookMode.tailscaleFunnel)
                    Text(self.strings.conversationAutomationWebhookManualLabel)
                        .tag(ConversationAutomationWebhookMode.publicUrl)
                }
                .pickerStyle(.segmented)

                switch self.draft.webhookMode {
                case .tailscaleFunnel:
                    if let callbackURL = self.expectedWebhookURL {
                        self.readOnlyValue(
                            title: self.strings.conversationAutomationTailscaleReadyTitle,
                            subtitle: self.strings.conversationAutomationWebhookTailscaleSubtitle(expectedURL: callbackURL),
                            value: callbackURL)
                    } else {
                        self.infoRow(
                            title: self.strings.conversationAutomationTailscaleReadyTitle,
                            subtitle: self.strings.conversationAutomationWebhookTailscaleSubtitle(expectedURL: nil),
                            systemImage: "point.3.connected.trianglepath.dotted")
                    }

                    if !self.tailscaleService.isInstalled || !self.tailscaleService.isRunning {
                        self.actionInfoRow(
                            title: self.strings.conversationAutomationTailscaleUnavailableTitle,
                            subtitle: self.strings.conversationAutomationWebhookPrivateAccessSubtitle,
                            systemImage: "exclamationmark.triangle",
                            buttonTitle: macLocalized("Open Settings → General", language: self.language))
                        {
                            self.selectSettingsTab(.general)
                        }
                    } else if self.tailscaleService.funnelExposure.checked,
                              !self.tailscaleService.funnelExposure.featureEnabled,
                              let enableURL = self.tailscaleService.funnelExposure.enableURL,
                              let url = URL(string: enableURL)
                    {
                        self.actionInfoRow(
                            title: self.strings.conversationAutomationTailscaleUnavailableTitle,
                            subtitle: self.strings.conversationAutomationWebhookAdminSubtitle,
                            systemImage: "arrow.up.forward.app",
                            buttonTitle: self.strings.conversationAutomationOpenAdminButtonTitle)
                        {
                            NSWorkspace.shared.open(url)
                        }
                    }
                case .publicUrl:
                    self.textField(
                        title: self.strings.conversationAutomationWebhookPublicURLTitle,
                        subtitle: self.strings.conversationAutomationWebhookPublicURLSubtitle,
                        placeholder: self.strings.conversationAutomationWebhookPublicURLPlaceholder,
                        text: self.binding(for: \.publicWebhookURL))
                }
            }
        }
    }

    private var advancedSttCard: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 10) {
                self.sectionTitle(
                    self.strings.conversationAutomationSttTitle,
                    subtitle: self.strings.conversationAutomationSttSubtitle)
                Picker(
                    self.strings.conversationAutomationSttTitle,
                    selection: self.binding(for: \.sttProvider))
                {
                    Text(self.strings.conversationAutomationSttDeepgramLabel)
                        .tag(ConversationAutomationSttProvider.deepgramRealtime)
                    Text(self.strings.conversationAutomationSttOpenAILabel)
                        .tag(ConversationAutomationSttProvider.openaiRealtime)
                }
                .pickerStyle(.segmented)

                switch self.draft.sttProvider {
                case .deepgramRealtime:
                    self.externalLinks([
                        (self.strings.conversationAutomationOpenConsoleButtonTitle, PhoneCallsSettingsExternalURL.deepgramConsole),
                        (self.strings.conversationAutomationOpenGuideButtonTitle, PhoneCallsSettingsExternalURL.deepgramGuide),
                    ])
                    self.secureField(
                        title: self.strings.conversationAutomationDeepgramAPIKeyTitle,
                        subtitle: self.strings.conversationAutomationDeepgramAPIKeySubtitle,
                        placeholder: self.strings.conversationAutomationDeepgramAPIKeyPlaceholder,
                        text: self.binding(for: \.deepgramAPIKey))
                case .openaiRealtime:
                    self.externalLinks([
                        (self.strings.conversationAutomationOpenAPIKeysButtonTitle, PhoneCallsSettingsExternalURL.openAIAPIKeys),
                        (self.strings.conversationAutomationOpenGuideButtonTitle, PhoneCallsSettingsExternalURL.openAIRealtimeGuide),
                    ])
                    self.secureField(
                        title: self.strings.conversationAutomationOpenAIAPIKeyTitle,
                        subtitle: self.strings.conversationAutomationOpenAIAPIKeySubtitle,
                        placeholder: self.strings.conversationAutomationOpenAIAPIKeyPlaceholder,
                        text: self.binding(for: \.openAIAPIKey))
                }
            }
        }
    }

    private var advancedTtsCard: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 10) {
                self.sectionTitle(
                    self.strings.conversationAutomationTtsTitle,
                    subtitle: self.strings.conversationAutomationTtsSubtitle)
                self.externalLinks([
                    (self.strings.conversationAutomationOpenGuideButtonTitle, PhoneCallsSettingsExternalURL.elevenLabsAuthGuide),
                    (self.strings.conversationAutomationOpenVoiceLibraryButtonTitle, PhoneCallsSettingsExternalURL.elevenLabsVoiceLibrary),
                ])
                self.secureField(
                    title: self.strings.conversationAutomationElevenLabsAPIKeyTitle,
                    subtitle: self.strings.conversationAutomationElevenLabsAPIKeySubtitle,
                    placeholder: self.strings.conversationAutomationElevenLabsAPIKeyPlaceholder,
                    text: self.binding(for: \.elevenLabsAPIKey))
                self.textField(
                    title: self.strings.conversationAutomationElevenLabsVoiceIDTitle,
                    subtitle: self.strings.conversationAutomationElevenLabsVoiceIDSubtitle,
                    placeholder: self.strings.conversationAutomationElevenLabsVoiceIDPlaceholder,
                    text: self.binding(for: \.elevenLabsVoiceID))
            }
        }
    }

    private var readinessCard: some View {
        GroupBox {
            if !self.draft.enabled {
                self.infoRow(
                    title: macLocalized("Setup saved for later", language: self.language),
                    subtitle: macLocalized(
                        "Keep editing here, then turn phone calls on when you want Maumau to place live calls.",
                        language: self.language),
                    systemImage: "tray")
            } else if self.validationMessages.isEmpty {
                self.infoRow(
                    title: self.strings.conversationAutomationReadyTitle,
                    subtitle: self.strings.conversationAutomationReadySubtitle,
                    systemImage: "checkmark.circle")
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    self.infoRow(
                        title: self.strings.conversationAutomationBeforeFinishTitle,
                        subtitle: self.strings.conversationAutomationValidationListHeader,
                        systemImage: "exclamationmark.triangle")
                    ForEach(self.validationMessages, id: \.self) { message in
                        Text("• \(message)")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
    }

    private var testCallCard: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 10) {
                self.sectionTitle(
                    macLocalized("Test call", language: self.language),
                    subtitle: macLocalized(
                        "Start a real outbound call with the current settings so you can hear the voice pipeline end to end.",
                        language: self.language))
                self.textField(
                    title: macLocalized("To number", language: self.language),
                    subtitle: macLocalized("Use a real E.164 number like +628123456789.", language: self.language),
                    placeholder: "+628123456789",
                    text: self.$testToNumber)
                VStack(alignment: .leading, spacing: 6) {
                    Text(macLocalized("What Maumau should say first", language: self.language))
                        .font(.headline)
                    Text(macLocalized(
                        "This becomes the opening message for the test call.",
                        language: self.language))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    TextField(
                        macLocalized("Hi, this is a Maumau test call.", language: self.language),
                        text: self.$testMessage)
                        .textFieldStyle(.roundedBorder)
                }

                HStack(spacing: 10) {
                    Button(self.testCallBusy
                        ? macLocalized("Starting…", language: self.language)
                        : macLocalized("Start test call", language: self.language))
                    {
                        Task { await self.startTestCall() }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(self.testCallBusy || self.store.isSavingConfig)

                    Button(macLocalized("Check status", language: self.language)) {
                        Task { await self.refreshTestCallStatus() }
                    }
                    .buttonStyle(.bordered)
                    .disabled(self.testCallID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || self.testCallBusy)

                    Button(macLocalized("End call", language: self.language)) {
                        Task { await self.endTestCall() }
                    }
                    .buttonStyle(.bordered)
                    .disabled(self.testCallID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || self.testCallBusy)
                }

                if !self.testCallID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    self.readOnlyValue(
                        title: macLocalized("Latest test call ID", language: self.language),
                        subtitle: macLocalized(
                            "Use this to check status again or end the same test call.",
                            language: self.language),
                        value: self.testCallID)
                }

                if let testCallStatus, !testCallStatus.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    self.statusBanner(text: testCallStatus, isError: self.testCallStatusIsError)
                }
            }
        }
    }

    private func sectionTitle(_ title: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.headline)
            Text(subtitle)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func statusBanner(text: String, isError: Bool) -> some View {
        Text(text)
            .font(.footnote)
            .foregroundStyle(isError ? .red : .secondary)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func infoRow(title: String, subtitle: String, systemImage: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: systemImage)
                .font(.body.weight(.semibold))
                .foregroundStyle(.secondary)
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.headline)
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func actionInfoRow(
        title: String,
        subtitle: String,
        systemImage: String,
        buttonTitle: String,
        action: @escaping () -> Void) -> some View
    {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: systemImage)
                .font(.body.weight(.semibold))
                .foregroundStyle(.secondary)
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(.headline)
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Button(buttonTitle, action: action)
                    .buttonStyle(.bordered)
            }
        }
    }

    private func externalLinks(_ links: [(String, String)]) -> some View {
        HStack(spacing: 14) {
            ForEach(Array(links.enumerated()), id: \.offset) { entry in
                if let url = URL(string: entry.element.1) {
                    Link(destination: url) {
                        Label(entry.element.0, systemImage: "arrow.up.right.square")
                    }
                    .buttonStyle(.link)
                }
            }
        }
    }

    private func textField(
        title: String,
        subtitle: String,
        placeholder: String,
        text: Binding<String>) -> some View
    {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.headline)
            Text(subtitle)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            TextField(placeholder, text: text)
                .textFieldStyle(.roundedBorder)
        }
    }

    private func secureField(
        title: String,
        subtitle: String,
        placeholder: String,
        text: Binding<String>) -> some View
    {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.headline)
            Text(subtitle)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            SecureField(placeholder, text: text)
                .textFieldStyle(.roundedBorder)
        }
    }

    private func readOnlyValue(
        title: String,
        subtitle: String,
        value: String) -> some View
    {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.headline)
            Text(subtitle)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 10) {
                TextField("", text: .constant(value))
                    .textFieldStyle(.roundedBorder)
                    .disabled(true)
                Button(self.strings.conversationAutomationCopyURLButtonTitle) {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(value, forType: .string)
                }
                .buttonStyle(.bordered)
            }
        }
    }

    private func binding<Value>(for keyPath: WritableKeyPath<PhoneCallsSettingsDraft, Value>) -> Binding<Value> {
        Binding(
            get: { self.draft[keyPath: keyPath] },
            set: { newValue in
                self.draft[keyPath: keyPath] = newValue
                self.draftDirty = true
                self.saveStatus = nil
            })
    }

    private func selectSettingsTab(_ tab: SettingsTab) {
        NotificationCenter.default.post(name: .maumauSelectSettingsTab, object: tab)
    }

    private func mergedStringValues(existing: [String], additions: [String], enabled: Bool) -> [String] {
        let normalizedAdditions = additions.map { $0.lowercased() }
        var result: [String] = []
        for value in existing {
            let keep = enabled || !normalizedAdditions.contains(value.lowercased())
            if keep && !result.contains(where: { $0.caseInsensitiveCompare(value) == .orderedSame }) {
                result.append(value)
            }
        }
        if enabled {
            for value in additions where !result.contains(where: { $0.caseInsensitiveCompare(value) == .orderedSame }) {
                result.append(value)
            }
        }
        return result
    }

    private func stringArrayValue(at path: ConfigPath) -> [String] {
        (self.store.configValue(at: path) as? [Any])?
            .compactMap { ($0 as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty } ?? []
    }

    private func resolvedVapiBridgeAuthToken() -> String {
        let trimmed = self.draft.vapiBridgeAuthToken.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty {
            return trimmed
        }
        let generated = UUID().uuidString.lowercased()
        self.draft.vapiBridgeAuthToken = generated
        return generated
    }

    private func applyDraftToStore() {
        let bridgeAuthToken = self.draft.mode == .simpleVapi ? self.resolvedVapiBridgeAuthToken() : self.draft.vapiBridgeAuthToken
        let updates = OnboardingView.conversationAutomationVoiceDraftUpdates(
            mode: self.draft.mode,
            phoneAllowFrom: self.draft.allowFrom,
            phoneProvider: self.draft.phoneProvider,
            selectedSttProvider: self.draft.sttProvider,
            webhookMode: self.draft.webhookMode,
            replyLanguageCode: self.language.replyLanguageID,
            fromNumber: self.draft.fromNumber,
            twilioAccountSID: self.draft.twilioAccountSID,
            twilioAuthToken: self.draft.twilioAuthToken,
            telnyxAPIKey: self.draft.telnyxAPIKey,
            telnyxConnectionID: self.draft.telnyxConnectionID,
            telnyxPublicKey: self.draft.telnyxPublicKey,
            plivoAuthID: self.draft.plivoAuthID,
            plivoAuthToken: self.draft.plivoAuthToken,
            deepgramAPIKey: self.draft.deepgramAPIKey,
            openAIAPIKey: self.draft.openAIAPIKey,
            elevenLabsAPIKey: self.draft.elevenLabsAPIKey,
            elevenLabsVoiceID: self.draft.elevenLabsVoiceID,
            publicWebhookURL: self.draft.publicWebhookURL,
            vapiAPIKey: self.draft.vapiAPIKey,
            vapiAssistantID: self.draft.vapiAssistantID,
            vapiPhoneNumberID: self.draft.vapiPhoneNumberID,
            vapiFromNumber: self.selectedVapiPhoneNumber?.number ?? self.draft.fromNumber,
            vapiPreferredLanguageCode: self.draft.vapiPreferredLanguage.replyLanguageID,
            vapiBridgeMode: self.draft.vapiBridgeMode,
            vapiManualBridgeURL: self.draft.vapiManualBridgeURL,
            vapiBridgeAuthToken: bridgeAuthToken)

        for update in updates {
            self.store.updateConfigValue(path: update.path, value: update.value)
        }
        self.store.updateConfigValue(
            path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("enabled")],
            value: self.draft.enabled)
        self.store.updateConfigValue(
            path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("enabled")],
            value: self.draft.enabled)

        let toolsPath: ConfigPath = [.key("tools"), .key("alsoAllow")]
        let tools = self.mergedStringValues(
            existing: self.stringArrayValue(at: toolsPath),
            additions: ["voice-call"],
            enabled: self.draft.enabled)
        self.store.updateConfigValue(path: toolsPath, value: tools.isEmpty ? nil : tools)
    }

    private func loadDraftFromStore() {
        self.draft = PhoneCallsSettingsDraft.load(
            from: self.store.configDraft,
            onboardingLanguage: self.language)
        self.draftDirty = false
    }

    private func loadFromStore(forceReload: Bool = false) async {
        await self.tailscaleService.checkTailscaleStatus()
        if forceReload || !self.store.configLoaded {
            await self.store.loadConfig()
        }
        self.loadDraftFromStore()
        self.saveStatus = nil
        self.saveStatusIsError = false
        self.testCallStatus = nil
        self.testCallStatusIsError = false
        await self.refreshVapiSelectionsIfNeeded()
    }

    private func refreshVapiSelectionsIfNeeded() async {
        guard self.draft.mode == .simpleVapi else { return }
        let trimmedAPIKey = self.draft.vapiAPIKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedAPIKey.isEmpty else { return }
        guard self.vapiAssistants.isEmpty || self.vapiPhoneNumbers.isEmpty else { return }
        await self.refreshVapiSelections()
    }

    private func refreshVapiSelections() async {
        guard !self.vapiRefreshing else { return }
        let trimmedAPIKey = self.draft.vapiAPIKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedAPIKey.isEmpty else {
            self.vapiStatus = self.strings.conversationAutomationValidationVapiAPIKeyMissing
            self.vapiStatusIsError = true
            self.vapiAssistants = []
            self.vapiPhoneNumbers = []
            return
        }

        self.vapiRefreshing = true
        defer { self.vapiRefreshing = false }

        do {
            let client = ConversationAutomationVapiClient(apiKey: trimmedAPIKey)
            async let assistantsTask = client.listAssistants()
            async let phoneNumbersTask = client.listPhoneNumbers()
            let assistants = try await assistantsTask.sorted {
                $0.displayLabel.localizedCaseInsensitiveCompare($1.displayLabel) == .orderedAscending
            }
            let phoneNumbers = try await phoneNumbersTask.sorted {
                $0.displayLabel.localizedCaseInsensitiveCompare($1.displayLabel) == .orderedAscending
            }

            self.vapiAssistants = assistants
            self.vapiPhoneNumbers = phoneNumbers

            if self.draft.vapiAssistantID.isEmpty, assistants.count == 1 {
                self.draft.vapiAssistantID = assistants[0].id
            }
            if self.draft.vapiPhoneNumberID.isEmpty, phoneNumbers.count == 1 {
                self.draft.vapiPhoneNumberID = phoneNumbers[0].id
            }

            self.vapiStatus = self.strings.conversationAutomationVapiRefreshReady(
                assistantCount: assistants.count,
                phoneNumberCount: phoneNumbers.count)
            self.vapiStatusIsError = false
        } catch {
            self.vapiAssistants = []
            self.vapiPhoneNumbers = []
            self.vapiStatus = self.strings.conversationAutomationVapiRefreshFailed(
                detail: error.localizedDescription)
            self.vapiStatusIsError = true
        }
    }

    private func saveSettings() async {
        await self.tailscaleService.checkTailscaleStatus()
        let messages = self.validationMessages
        if self.draft.enabled, !messages.isEmpty {
            self.saveStatus = messages.joined(separator: "\n")
            self.saveStatusIsError = true
            return
        }

        if !self.store.configLoaded {
            await self.store.loadConfig()
        }

        self.applyDraftToStore()
        let saved = await self.store.saveConfigDraft()
        if saved {
            self.loadDraftFromStore()
            self.saveStatus = macLocalized("Phone-call settings saved.", language: self.language)
            self.saveStatusIsError = false
            await self.refreshVapiSelectionsIfNeeded()
        } else {
            self.saveStatus = self.store.configStatus ?? macLocalized("Could not save phone-call settings.", language: self.language)
            self.saveStatusIsError = true
        }
    }

    private func requestJSONObject(
        method: String,
        params: [String: AnyCodable],
        timeoutMs: Double = 20_000) async throws -> [String: Any]
    {
        let data = try await GatewayConnection.shared.requestRaw(
            method: method,
            params: params,
            timeoutMs: timeoutMs)
        let object = try JSONSerialization.jsonObject(with: data)
        guard let json = object as? [String: Any] else {
            throw NSError(
                domain: "PhoneCallsSettings",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Gateway returned an unexpected response."])
        }
        return json
    }

    private func startTestCall() async {
        guard self.state.connectionMode == .local else {
            self.testCallStatus = macLocalized(
                "Switch Maumau runs back to Local before starting a test call here.",
                language: self.language)
            self.testCallStatusIsError = true
            return
        }

        self.testCallBusy = true
        defer { self.testCallBusy = false }

        let trimmedTo = self.testToNumber.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedMessage = self.testMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard self.draft.enabled else {
            self.testCallStatus = macLocalized("Enable phone calls and save first.", language: self.language)
            self.testCallStatusIsError = true
            return
        }
        guard OnboardingView.isValidE164PhoneNumber(trimmedTo) else {
            self.testCallStatus = macLocalized(
                "Enter a valid E.164 phone number for the test call.",
                language: self.language)
            self.testCallStatusIsError = true
            return
        }
        guard !trimmedMessage.isEmpty else {
            self.testCallStatus = macLocalized(
                "Enter the first message Maumau should say on the test call.",
                language: self.language)
            self.testCallStatusIsError = true
            return
        }

        await self.saveSettings()
        guard self.saveStatusIsError == false else {
            self.testCallStatus = self.saveStatus
            self.testCallStatusIsError = true
            return
        }

        do {
            let json = try await self.requestJSONObject(
                method: "voicecall.start",
                params: [
                    "to": AnyCodable(trimmedTo),
                    "message": AnyCodable(trimmedMessage),
                ])
            if let error = json["error"] as? String, !error.isEmpty {
                self.testCallStatus = error
                self.testCallStatusIsError = true
                return
            }
            self.testCallID = ((json["callId"] as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            self.testCallStatus = macLocalized("Started test call.", language: self.language)
            self.testCallStatusIsError = false
        } catch {
            self.testCallStatus = error.localizedDescription
            self.testCallStatusIsError = true
        }
    }

    private func refreshTestCallStatus() async {
        let trimmedCallID = self.testCallID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedCallID.isEmpty else { return }
        self.testCallBusy = true
        defer { self.testCallBusy = false }

        do {
            let json = try await self.requestJSONObject(
                method: "voicecall.status",
                params: ["callId": AnyCodable(trimmedCallID)])
            if let error = json["error"] as? String, !error.isEmpty {
                self.testCallStatus = error
                self.testCallStatusIsError = true
                return
            }
            let found = (json["found"] as? Bool) ?? false
            guard found, let call = json["call"] as? [String: Any] else {
                self.testCallStatus = macLocalized("No matching call was found.", language: self.language)
                self.testCallStatusIsError = true
                return
            }
            let state = (call["state"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "unknown"
            self.testCallStatus = "\(macLocalized("Latest call status", language: self.language)): \(state)"
            self.testCallStatusIsError = false
        } catch {
            self.testCallStatus = error.localizedDescription
            self.testCallStatusIsError = true
        }
    }

    private func endTestCall() async {
        let trimmedCallID = self.testCallID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedCallID.isEmpty else { return }
        self.testCallBusy = true
        defer { self.testCallBusy = false }

        do {
            let json = try await self.requestJSONObject(
                method: "voicecall.end",
                params: ["callId": AnyCodable(trimmedCallID)])
            if let error = json["error"] as? String, !error.isEmpty {
                self.testCallStatus = error
                self.testCallStatusIsError = true
                return
            }
            self.testCallStatus = macLocalized("Ended test call.", language: self.language)
            self.testCallStatusIsError = false
        } catch {
            self.testCallStatus = error.localizedDescription
            self.testCallStatusIsError = true
        }
    }
}

struct PhoneCallsSettings_Previews: PreviewProvider {
    static var previews: some View {
        PhoneCallsSettings(state: .preview, store: ChannelsStore(isPreview: true))
            .frame(width: SettingsTab.windowWidth, height: SettingsTab.windowHeight)
    }
}
