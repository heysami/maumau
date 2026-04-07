import Foundation
import MaumauDiscovery
import MaumauKit
import SwiftUI
import Testing
@testable import Maumau

@Suite(.serialized)
@MainActor
struct OnboardingViewSmokeTests {
    @Test func `onboarding view builds body`() {
        let state = AppState(preview: true)
        let view = OnboardingView(
            state: state,
            permissionMonitor: PermissionMonitor.shared,
            discoveryModel: GatewayDiscoveryModel(localDisplayName: InstanceIdentity.displayName))
        _ = view.body
    }

    @Test func `onboarding controller show and close`() {
        OnboardingController.shared.close()
        OnboardingController.shared.show()
        #expect(OnboardingController.shared.isPresented)
        OnboardingController.shared.close()
        #expect(!OnboardingController.shared.isPresented)
    }

    @Test func `onboarding kickoff message includes secure dashboard URL when available`() {
        let prompt = OnboardingView.onboardingKickoffMessage(
            secureDashboardUrl: "https://maumau.tailnet.ts.net/dashboard/today#token=abc123")
        #expect(prompt.contains("BOOTSTRAP.md"))
        #expect(prompt.contains("https://maumau.tailnet.ts.net/dashboard/today#token=abc123"))
        #expect(prompt.contains("secure dashboard on my phone"))
    }

    @Test func `local page order adds private access before permissions and included tools`() {
        let order = OnboardingView.pageOrder(for: .local, showOnboardingChat: false)
        #expect(order == [0, 1, 3, 10, 12, 5, 11, 13, 9])
        let channelsIndex = order.firstIndex(of: 10)
        let privateAccessIndex = order.firstIndex(of: 12)
        let permissionsIndex = order.firstIndex(of: 5)
        let automationIndex = order.firstIndex(of: 11)
        let toolsIndex = order.firstIndex(of: 13)
        #expect(privateAccessIndex == channelsIndex.map { $0 + 1 })
        #expect(permissionsIndex == privateAccessIndex.map { $0 + 1 })
        #expect(automationIndex == permissionsIndex.map { $0 + 1 })
        #expect(toolsIndex == automationIndex.map { $0 + 1 })
        #expect(!order.contains(6))
        #expect(!order.contains(7))
        #expect(!order.contains(8))
    }

    @Test func `local onboarding step metadata marks required optional and voice prep`() {
        let state = AppState(preview: true)
        state.connectionMode = .local
        let view = OnboardingView(
            state: state,
            permissionMonitor: PermissionMonitor.shared,
            discoveryModel: GatewayDiscoveryModel(localDisplayName: InstanceIdentity.displayName))

        let steps = view.setupStepDefinitions

        #expect(steps.first(where: { $0.pageID == view.connectionPageIndex })?.badges == [.required])
        #expect(steps.first(where: { $0.pageID == view.wizardPageIndex })?.badges == [.required, .needsPrep])
        #expect(steps.first(where: { $0.pageID == view.channelsSetupPageIndex })?.badges == [.optional, .needsPrep])
        #expect(steps.first(where: { $0.pageID == view.privateAccessPageIndex })?.badges == [.optional, .needsPrep])
        #expect(steps.first(where: { $0.pageID == view.permissionsPageIndex })?.badges == [.optional])
        #expect(steps.first(where: { $0.pageID == view.conversationAutomationPageIndex })?.badges == [.optional, .needsPrep])
        #expect(steps.first(where: { $0.pageID == view.skillsSetupPageIndex })?.badges == [.optional])
    }

    @Test func `included tool highlights keep browser control in onboarding essentials`() {
        let highlights = OnboardingView.includedToolHighlights()
        let titles = highlights.map(\.title)
        #expect(titles == [
            "Files and folders",
            "Apps and screen context",
            "Browser control",
            "Commands",
            "Messages and connected services",
        ])
    }

    @Test func `included helper highlights keep daily-life defaults visible in onboarding`() {
        let highlights = OnboardingView.includedHelperHighlights()
        let titles = highlights.map(\.title)
        #expect(titles == [
            "Clawd Cursor",
            "Maumau Guardrails",
            "Lobster workflows",
            "Structured AI tasks",
        ])
    }

    @Test func `page order omits onboarding chat when identity known`() {
        let order = OnboardingView.pageOrder(for: .local, showOnboardingChat: false)
        #expect(!order.contains(8))
    }

    @Test func `remote page order skips brain setup and keeps onboarding focused on channels`() {
        let order = OnboardingView.pageOrder(for: .remote, showOnboardingChat: false)
        #expect(order == [0, 1, 10, 9])
        #expect(!order.contains(3))
        #expect(!order.contains(12))
        #expect(!order.contains(5))
        #expect(!order.contains(7))
        #expect(!order.contains(8))
        #expect(!order.contains(11))
    }

    @Test func `fresh onboarding defaults to local setup`() {
        #expect(OnboardingView.shouldDefaultToLocalConnectionMode(
            connectionMode: .unconfigured,
            onboardingSeen: false,
            remoteUrl: "",
            hasSelectedOnboardingLanguage: true))
        #expect(OnboardingView.shouldDefaultToLocalConnectionMode(
            connectionMode: .unconfigured,
            onboardingSeen: false,
            remoteUrl: "   ",
            hasSelectedOnboardingLanguage: true))
        #expect(OnboardingView.shouldDefaultToLocalConnectionMode(
            connectionMode: .remote,
            onboardingSeen: false,
            remoteUrl: "wss://gateway.example",
            hasSelectedOnboardingLanguage: true))
        #expect(OnboardingView.shouldDefaultToLocalConnectionMode(
            connectionMode: .local,
            onboardingSeen: false,
            remoteUrl: "",
            hasSelectedOnboardingLanguage: true) == false)
        #expect(OnboardingView.shouldDefaultToLocalConnectionMode(
            connectionMode: .unconfigured,
            onboardingSeen: true,
            remoteUrl: "",
            hasSelectedOnboardingLanguage: true) == false)
        #expect(OnboardingView.shouldDefaultToLocalConnectionMode(
            connectionMode: .unconfigured,
            onboardingSeen: false,
            remoteUrl: "",
            hasSelectedOnboardingLanguage: false) == false)
    }

    @Test func `language selection is the first onboarding cursor until chosen`() {
        #expect(OnboardingView.initialPageCursor(hasSelectedOnboardingLanguage: false, onboardingSeen: false) == 0)
        #expect(OnboardingView.initialPageCursor(hasSelectedOnboardingLanguage: true, onboardingSeen: false) == 0)
        #expect(OnboardingView.initialPageCursor(hasSelectedOnboardingLanguage: true, onboardingSeen: true) == 1)
    }

    @Test func `language catalog defaults to english and supports indonesian`() {
        #expect(OnboardingLanguage.loadSelection(from: nil) == nil)
        #expect(OnboardingLanguage.loadSelection(from: "id") == .id)
        #expect(AppState(preview: true).effectiveOnboardingLanguage == .en)
    }

    @Test func `memory onboarding copy explains private and shared users model`() {
        #expect(OnboardingStrings(language: .en).memorySubtitle.contains("private for each user"))
        #expect(OnboardingStrings(language: .en).memorySubtitle.contains("Open Users later"))
        #expect(OnboardingStrings(language: .id).memorySubtitle.contains("privat untuk tiap pengguna"))
        #expect(OnboardingStrings(language: .id).memorySubtitle.contains("Buka Users nanti"))
    }

    @Test func `managed browser sign-in appears for local onboarding flows`() {
        #expect(OnboardingView.shouldOfferManagedBrowserSignIn(
            mode: .local,
            browserControlEnabled: true))
        #expect(OnboardingView.shouldOfferManagedBrowserSignIn(
            mode: .local,
            browserControlEnabled: false))
        #expect(!OnboardingView.shouldOfferManagedBrowserSignIn(
            mode: .remote,
            browserControlEnabled: true))
    }

    @Test func `successful onboarding reconnects configured modes`() {
        #expect(OnboardingView.reconnectModeAfterSuccessfulOnboarding(connectionMode: .local) == .local)
        #expect(OnboardingView.reconnectModeAfterSuccessfulOnboarding(connectionMode: .remote) == .remote)
        #expect(OnboardingView.reconnectModeAfterSuccessfulOnboarding(connectionMode: .unconfigured) == nil)
    }

    @Test func `local onboarding uses a deferred config draft store`() {
        let state = AppState(preview: true)
        state.connectionMode = .local
        let view = OnboardingView(
            state: state,
            permissionMonitor: PermissionMonitor.shared,
            discoveryModel: GatewayDiscoveryModel(localDisplayName: InstanceIdentity.displayName))

        #expect(view.onboardingChannelsStore.defersConfigSaves)
    }

    @Test func `local onboarding workspace save stages config without persisting`() async {
        var persistedSaveCount = 0
        await ConfigStore._withTestOverrides(.init(
            isRemoteMode: { false },
            loadLocal: { [:] },
            saveLocal: { _ in persistedSaveCount += 1 }))
        {
            let state = AppState(preview: true)
            state.connectionMode = .local
            let view = OnboardingView(
                state: state,
                permissionMonitor: PermissionMonitor.shared,
                discoveryModel: GatewayDiscoveryModel(localDisplayName: InstanceIdentity.displayName))

            let saved = await view.saveAgentWorkspace("~/maumau-workspace")

            #expect(saved)
            #expect(persistedSaveCount == 0)
            #expect(view.onboardingChannelsStore.configDirty)
            #expect(
                AgentWorkspaceConfig.workspace(from: view.onboardingChannelsStore.configDraft)
                    == "~/maumau-workspace")
        }
    }

    @Test func `conversation automation page prep does not overwrite earlier voice settings`() async {
        let state = AppState(preview: true)
        state.connectionMode = .local
        let view = OnboardingView(
            state: state,
            permissionMonitor: PermissionMonitor.shared,
            discoveryModel: GatewayDiscoveryModel(localDisplayName: InstanceIdentity.displayName))

        view.onboardingChannelsStore.replaceConfigDraft([
            "messages": [
                "tts": [
                    "provider": "openai",
                    "elevenlabs": [
                        "modelId": "kept-model",
                        "languageCode": "en",
                    ],
                ],
            ],
            "plugins": [
                "entries": [
                    "voice-call": [
                        "enabled": true,
                        "config": [
                            "enabled": true,
                            "provider": "custom-provider",
                            "inboundPolicy": "open",
                            "allowFrom": ["+15551234567"],
                            "streaming": [
                                "enabled": true,
                                "sttProvider": "deepgram",
                                "languageCode": "en",
                            ],
                            "tts": [
                                "provider": "openai",
                                "elevenlabs": [
                                    "modelId": "kept-model",
                                    "languageCode": "en",
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ], dirty: false)

        await view.prepareConversationAutomationPage()

        #expect(view.onboardingChannelsStore.configDirty == false)
        #expect(view.onboardingChannelsStore.configValue(
            at: [.key("messages"), .key("tts"), .key("provider")]) as? String == "openai")
        #expect(view.onboardingChannelsStore.configValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("provider")]) as? String == "custom-provider")
        #expect(view.onboardingChannelsStore.configValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming"), .key("sttProvider")]) as? String == "deepgram")
    }

    @Test func `conversation automation preset does not overwrite existing voice settings`() async {
        let state = AppState(preview: true)
        state.connectionMode = .local
        let view = OnboardingView(
            state: state,
            permissionMonitor: PermissionMonitor.shared,
            discoveryModel: GatewayDiscoveryModel(localDisplayName: InstanceIdentity.displayName))

        view.onboardingChannelsStore.replaceConfigDraft([
            "messages": [
                "tts": [
                    "provider": "openai",
                    "elevenlabs": [
                        "modelId": "kept-model",
                        "languageCode": "en",
                    ],
                ],
            ],
            "plugins": [
                "entries": [
                    "voice-call": [
                        "enabled": true,
                        "config": [
                            "enabled": true,
                            "provider": "custom-provider",
                            "inboundPolicy": "open",
                            "allowFrom": ["+15551234567"],
                            "streaming": [
                                "enabled": true,
                                "sttProvider": "deepgram",
                                "languageCode": "en",
                            ],
                            "tts": [
                                "provider": "openai",
                                "elevenlabs": [
                                    "modelId": "kept-model",
                                    "languageCode": "en",
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ], dirty: false)

        await view.prepareConversationAutomationPage()

        view.applyConversationAutomationPresetDraft(enabled: true)

        #expect(view.onboardingChannelsStore.configValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("enabled")]) as? Bool == true)
        #expect(view.onboardingChannelsStore.configValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("provider")]) as? String == "custom-provider")
        #expect(view.onboardingChannelsStore.configValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming"), .key("sttProvider")]) as? String == "deepgram")
        #expect(view.onboardingChannelsStore.configValue(
            at: [.key("plugins"), .key("entries"), .key("automation-runner"), .key("enabled")]) as? Bool == true)

        view.applyConversationAutomationPresetDraft(enabled: false)

        #expect(view.onboardingChannelsStore.configValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("enabled")]) as? Bool == true)
        #expect(view.onboardingChannelsStore.configValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("provider")]) as? String == "custom-provider")
        #expect(view.onboardingChannelsStore.configValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming"), .key("sttProvider")]) as? String == "deepgram")
        #expect(view.onboardingChannelsStore.configValue(
            at: [.key("plugins"), .key("entries"), .key("automation-runner"), .key("enabled")]) as? Bool == false)
    }

    @Test func `conversation automation telephony defaults can be applied and restored`() async {
        let state = AppState(preview: true)
        state.connectionMode = .local
        state.onboardingLanguage = .id
        let view = OnboardingView(
            state: state,
            permissionMonitor: PermissionMonitor.shared,
            discoveryModel: GatewayDiscoveryModel(localDisplayName: InstanceIdentity.displayName))

        view.onboardingChannelsStore.replaceConfigDraft([
            "plugins": [
                "entries": [
                    "voice-call": [
                        "enabled": true,
                        "config": [
                            "enabled": true,
                            "provider": "custom-provider",
                            "inboundPolicy": "open",
                            "allowFrom": ["+15551234567"],
                            "streaming": [
                                "enabled": true,
                                "sttProvider": "deepgram",
                                "languageCode": "en",
                            ],
                            "tts": [
                                "provider": "openai",
                                "elevenlabs": [
                                    "modelId": "kept-model",
                                    "languageCode": "en",
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ], dirty: false)

        await view.prepareConversationAutomationPage()

        view.applyConversationAutomationPresetDraft(
            enabled: nil,
            telephonyEnabled: true,
            sttProvider: .deepgramRealtime)

        #expect(view.onboardingChannelsStore.configValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("provider")]) as? String == "twilio")
        #expect(view.onboardingChannelsStore.configValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("inboundPolicy")]) as? String == "allowlist")
        #expect(view.onboardingChannelsStore.configValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("allowFrom")]) as? [String] == ["+15551234567"])
        #expect(view.onboardingChannelsStore.configValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming"), .key("sttProvider")]) as? String == "deepgram-realtime")
        #expect(view.onboardingChannelsStore.configValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming"), .key("languageCode")]) as? String == "id")
        #expect(view.onboardingChannelsStore.configValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming"), .key("deepgram"), .key("model")]) as? String == "nova-3")
        #expect(view.onboardingChannelsStore.configValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tts"), .key("provider")]) as? String == "elevenlabs")
        #expect(view.onboardingChannelsStore.configValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tts"), .key("elevenlabs"), .key("modelId")]) as? String == "eleven_multilingual_v2")
        #expect(view.onboardingChannelsStore.configValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tts"), .key("elevenlabs"), .key("languageCode")]) as? String == "id")
        #expect(view.onboardingChannelsStore.configValue(
            at: [.key("tools"), .key("alsoAllow")]) as? [String] == ["voice-call"])
        #expect(view.onboardingChannelsStore.configValue(
            at: [.key("plugins"), .key("entries"), .key("automation-runner"), .key("enabled")]) == nil)

        view.applyConversationAutomationPresetDraft(
            enabled: nil,
            telephonyEnabled: true,
            sttProvider: .openaiRealtime)

        #expect(view.onboardingChannelsStore.configValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming"), .key("sttProvider")]) as? String == "openai-realtime")
        #expect(view.onboardingChannelsStore.configValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming"), .key("deepgram"), .key("model")]) == nil)

        view.applyConversationAutomationPresetDraft(
            enabled: nil,
            telephonyEnabled: false)

        #expect(view.onboardingChannelsStore.configValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("enabled")]) as? Bool == true)
        #expect(view.onboardingChannelsStore.configValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("provider")]) as? String == "custom-provider")
        #expect(view.onboardingChannelsStore.configValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming"), .key("sttProvider")]) as? String == "deepgram")
        #expect(view.onboardingChannelsStore.configValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tts"), .key("provider")]) as? String == "openai")
        #expect(view.onboardingChannelsStore.configValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tts"), .key("elevenlabs"), .key("modelId")]) as? String == "kept-model")
        #expect(view.onboardingChannelsStore.configValue(
            at: [.key("tools"), .key("alsoAllow")]) == nil)
        #expect(view.onboardingChannelsStore.configValue(
            at: [.key("plugins"), .key("entries"), .key("automation-runner"), .key("enabled")]) == nil)
    }

    @Test func `conversation automation voice setup writes provider credentials and callback route`() {
        let updates = OnboardingView.conversationAutomationVoiceDraftUpdates(
            phoneAllowFrom: [],
            phoneProvider: .telnyx,
            selectedSttProvider: .deepgramRealtime,
            webhookMode: .publicUrl,
            replyLanguageCode: "id",
            fromNumber: "+628123456789",
            twilioAccountSID: "",
            twilioAuthToken: "",
            telnyxAPIKey: "telnyx-key",
            telnyxConnectionID: "CONN123",
            telnyxPublicKey: "pub-key",
            plivoAuthID: "",
            plivoAuthToken: "",
            deepgramAPIKey: "deepgram-key",
            openAIAPIKey: "",
            elevenLabsAPIKey: "eleven-key",
            elevenLabsVoiceID: "voice-123",
            publicWebhookURL: "https://voice.example.com/voice/webhook")

        func updateValue(at path: ConfigPath) -> Any? {
            updates.first(where: { $0.path == path })?.value
        }

        #expect(updateValue(at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("fromNumber")]) as? String == "+628123456789")
        #expect(updateValue(at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("telnyx"), .key("apiKey")]) as? String == "telnyx-key")
        #expect(updateValue(at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("telnyx"), .key("connectionId")]) as? String == "CONN123")
        #expect(updateValue(at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("telnyx"), .key("publicKey")]) as? String == "pub-key")
        #expect(updateValue(at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("publicUrl")]) as? String == "https://voice.example.com/voice/webhook")
        #expect(updateValue(at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tunnel"), .key("provider")]) as? String == "none")
        #expect(updateValue(at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming"), .key("deepgram"), .key("apiKey")]) as? String == "deepgram-key")
        #expect(updateValue(at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tts"), .key("elevenlabs"), .key("apiKey")]) as? String == "eleven-key")
        #expect(updateValue(at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tts"), .key("elevenlabs"), .key("voiceId")]) as? String == "voice-123")
    }

    @Test func `conversation automation voice step blocks advance until required fields exist`() {
        let strings = OnboardingStrings(language: .en)
        let missing = OnboardingView.conversationAutomationVoiceValidationMessages(
            telephonyEnabled: true,
            phoneProvider: .twilio,
            sttProvider: .openaiRealtime,
            webhookMode: .publicUrl,
            fromNumber: "",
            twilioAccountSID: "",
            twilioAuthToken: "",
            telnyxAPIKey: "",
            telnyxConnectionID: "",
            telnyxPublicKey: "",
            plivoAuthID: "",
            plivoAuthToken: "",
            deepgramAPIKey: "",
            openAIAPIKey: "",
            elevenLabsAPIKey: "",
            publicWebhookURL: "",
            tailscaleInstalled: false,
            tailscaleRunning: false,
            tailscaleFunnelChecked: false,
            tailscaleFunnelEnabled: false,
            strings: strings)

        #expect(!missing.isEmpty)

        let ready = OnboardingView.conversationAutomationVoiceValidationMessages(
            telephonyEnabled: true,
            phoneProvider: .twilio,
            sttProvider: .openaiRealtime,
            webhookMode: .publicUrl,
            fromNumber: "+15551234567",
            twilioAccountSID: "AC123",
            twilioAuthToken: "twilio-token",
            telnyxAPIKey: "",
            telnyxConnectionID: "",
            telnyxPublicKey: "",
            plivoAuthID: "",
            plivoAuthToken: "",
            deepgramAPIKey: "",
            openAIAPIKey: "sk-test",
            elevenLabsAPIKey: "xi-test",
            publicWebhookURL: "https://voice.example.com/voice/webhook",
            tailscaleInstalled: false,
            tailscaleRunning: false,
            tailscaleFunnelChecked: false,
            tailscaleFunnelEnabled: false,
            strings: strings)

        #expect(ready.isEmpty)
    }

    @Test func `managed browser sign-in waits for the brain step to finish`() {
        #expect(!OnboardingView.shouldShowManagedBrowserSignInOnWizard(
            mode: .local,
            wizardSatisfied: false,
            browserControlEnabled: true))
        #expect(OnboardingView.shouldShowManagedBrowserSignInOnWizard(
            mode: .local,
            wizardSatisfied: true,
            browserControlEnabled: true))
        #expect(!OnboardingView.shouldShowManagedBrowserSignInOnWizard(
            mode: .remote,
            wizardSatisfied: true,
            browserControlEnabled: true))
    }

    @Test func `local wizard completion stays on the brain page for browser sign-in`() {
        #expect(!OnboardingView.shouldAutoAdvanceAfterWizardCompletion(
            mode: .local,
            browserControlEnabled: true))
        #expect(OnboardingView.shouldAutoAdvanceAfterWizardCompletion(
            mode: .remote,
            browserControlEnabled: true))
    }

    @Test func `managed browser sign-in request targets the managed profile`() {
        let params = OnboardingView.managedBrowserStartParams()
        #expect(params["method"] == AnyCodable("POST"))
        #expect(params["path"] == AnyCodable("/start"))
        #expect(params["query"] == AnyCodable([
            "profile": AnyCodable("maumau"),
        ]))
        #expect(params["timeoutMs"] == AnyCodable(15000))
    }

    @Test func `wizard start waits until the wizard page is active`() {
        #expect(!OnboardingView.shouldStartWizardForActivePage(
            activePageIndex: 1,
            wizardPageIndex: 3,
            shouldWaitForLocalSetup: false))
        #expect(!OnboardingView.shouldStartWizardForActivePage(
            activePageIndex: 3,
            wizardPageIndex: 3,
            shouldWaitForLocalSetup: true))
        #expect(OnboardingView.shouldStartWizardForActivePage(
            activePageIndex: 3,
            wizardPageIndex: 3,
            shouldWaitForLocalSetup: false))
    }

    @Test func `page side effects stay idle for offscreen onboarding pages`() {
        #expect(!OnboardingView.shouldActivateOnboardingPageSideEffects(
            activePageIndex: 3,
            pageIndex: 10))
        #expect(!OnboardingView.shouldActivateOnboardingPageSideEffects(
            activePageIndex: 3,
            pageIndex: 11))
        #expect(OnboardingView.shouldActivateOnboardingPageSideEffects(
            activePageIndex: 10,
            pageIndex: 10))
        #expect(OnboardingView.shouldActivateOnboardingPageSideEffects(
            activePageIndex: 11,
            pageIndex: 11))
    }

    @Test func `fresh launch defers startup apply until onboarding finishes`() {
        #expect(AppDelegate.shouldApplyInitialConnectionMode(mode: .unconfigured, onboardingSeen: false) == false)
        #expect(AppDelegate.shouldApplyInitialConnectionMode(mode: .local, onboardingSeen: false) == false)
        #expect(AppDelegate.shouldApplyInitialConnectionMode(mode: .remote, onboardingSeen: false) == false)
        #expect(AppDelegate.shouldApplyInitialConnectionMode(mode: .unconfigured, onboardingSeen: true))
        #expect(AppDelegate.shouldApplyInitialConnectionMode(mode: .local, onboardingSeen: true))
    }

    @Test func `fresh launch keeps retrying onboarding until it is visible or no longer needed`() {
        #expect(AppDelegate.shouldShowInitialOnboarding(seenVersion: 0, onboardingSeen: false))
        #expect(AppDelegate.shouldRetryInitialOnboardingPresentation(
            seenVersion: 0,
            onboardingSeen: false,
            onboardingPresented: false))
        #expect(!AppDelegate.shouldRetryInitialOnboardingPresentation(
            seenVersion: currentOnboardingVersion,
            onboardingSeen: true,
            onboardingPresented: false))
        #expect(!AppDelegate.shouldRetryInitialOnboardingPresentation(
            seenVersion: 0,
            onboardingSeen: false,
            onboardingPresented: true))
    }

    @Test func `closing required onboarding only quits before completion`() {
        #expect(OnboardingController.shouldTerminateAfterClosingOnboarding(
            requiresCompletion: true,
            onboardingSeen: false))
        #expect(!OnboardingController.shouldTerminateAfterClosingOnboarding(
            requiresCompletion: true,
            onboardingSeen: true))
        #expect(!OnboardingController.shouldTerminateAfterClosingOnboarding(
            requiresCompletion: false,
            onboardingSeen: false))
    }

    @Test func `local gateway setup requires cli or local project gateway`() throws {
        let tmp = try makeTempDirForTests()
        #expect(OnboardingView.canStartLocalGateway(
            cliInstalled: false,
            projectRoot: tmp,
            runtimeAvailable: true) == false)

        try FileManager.default.createDirectory(
            at: tmp.appendingPathComponent("dist"),
            withIntermediateDirectories: true)
        try "console.log('ok')".write(
            to: tmp.appendingPathComponent("dist/index.js"),
            atomically: true,
            encoding: .utf8)

        #expect(OnboardingView.canStartLocalGateway(
            cliInstalled: false,
            projectRoot: tmp,
            runtimeAvailable: true))
        #expect(OnboardingView.canStartLocalGateway(
            cliInstalled: true,
            projectRoot: tmp,
            runtimeAvailable: false))
    }

    @Test func `local gateway setup stays unavailable until runtime probe finishes`() throws {
        let tmp = try makeTempDirForTests()
        try FileManager.default.createDirectory(
            at: tmp.appendingPathComponent("dist"),
            withIntermediateDirectories: true)
        try "console.log('ok')".write(
            to: tmp.appendingPathComponent("dist/index.js"),
            atomically: true,
            encoding: .utf8)

        #expect(OnboardingView.canStartLocalGateway(
            cliInstalled: false,
            projectRoot: tmp,
            runtimeAvailable: nil) == false)
    }

    @Test func `building connection page does not spawn runtime probes`() throws {
        let tmp = try makeTempDirForTests()
        let previousRoot = CommandResolver.projectRootPath()
        defer { CommandResolver.setProjectRoot(previousRoot) }
        CommandResolver.setProjectRoot(tmp.path)

        try FileManager.default.createDirectory(
            at: tmp.appendingPathComponent("dist"),
            withIntermediateDirectories: true)
        try "console.log('ok')".write(
            to: tmp.appendingPathComponent("dist/index.js"),
            atomically: true,
            encoding: .utf8)

        let sentinel = tmp.appendingPathComponent("runtime-probe.txt")
        let node = tmp.appendingPathComponent("node_modules/.bin/node")
        try FileManager.default.createDirectory(
            at: node.deletingLastPathComponent(),
            withIntermediateDirectories: true)
        try """
        #!/bin/sh
        echo runtime-probe > '\(sentinel.path)'
        echo v22.16.0
        """.write(to: node, atomically: true, encoding: .utf8)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: node.path)

        let state = AppState(preview: true)
        let view = OnboardingView(
            state: state,
            permissionMonitor: PermissionMonitor.shared,
            discoveryModel: GatewayDiscoveryModel(localDisplayName: InstanceIdentity.displayName))

        _ = view.connectionPage()

        #expect(FileManager.default.fileExists(atPath: sentinel.path) == false)
    }

    @Test func `auto install runs once on local setup pages`() {
        #expect(OnboardingView.shouldAutoInstallCLI(
            mode: .local,
            activePageIndex: 1,
            connectionPageIndex: 1,
            wizardPageIndex: 3,
            cliInstalled: false,
            installingCLI: false,
            didAutoInstallCLI: false))
        #expect(OnboardingView.shouldAutoInstallCLI(
            mode: .remote,
            activePageIndex: 1,
            connectionPageIndex: 1,
            wizardPageIndex: 3,
            cliInstalled: false,
            installingCLI: false,
            didAutoInstallCLI: false) == false)
        #expect(OnboardingView.shouldAutoInstallCLI(
            mode: .local,
            activePageIndex: 3,
            connectionPageIndex: 1,
            wizardPageIndex: 3,
            cliInstalled: false,
            installingCLI: false,
            didAutoInstallCLI: false))
        #expect(OnboardingView.shouldAutoInstallCLI(
            mode: .local,
            activePageIndex: 10,
            connectionPageIndex: 1,
            wizardPageIndex: 3,
            cliInstalled: true,
            installingCLI: false,
            didAutoInstallCLI: false) == false)
        #expect(OnboardingView.shouldAutoInstallCLI(
            mode: .local,
            activePageIndex: 1,
            connectionPageIndex: 1,
            wizardPageIndex: 3,
            cliInstalled: false,
            installingCLI: true,
            didAutoInstallCLI: false) == false)
        #expect(OnboardingView.shouldAutoInstallCLI(
            mode: .local,
            activePageIndex: 1,
            connectionPageIndex: 1,
            wizardPageIndex: 3,
            cliInstalled: false,
            installingCLI: false,
            didAutoInstallCLI: true) == false)
    }

    @Test func `default skill installs only auto run on first local onboarding skills page`() {
        #expect(OnboardingView.shouldAutoInstallDefaultSkills(
            mode: .local,
            onboardingSeen: false,
            activePageIndex: 11,
            skillsSetupPageIndex: 11,
            didAutoInstallDefaultSkills: false,
            isLoadingSkills: false,
            hasSkills: true))
        #expect(OnboardingView.shouldAutoInstallDefaultSkills(
            mode: .remote,
            onboardingSeen: false,
            activePageIndex: 11,
            skillsSetupPageIndex: 11,
            didAutoInstallDefaultSkills: false,
            isLoadingSkills: false,
            hasSkills: true) == false)
        #expect(OnboardingView.shouldAutoInstallDefaultSkills(
            mode: .local,
            onboardingSeen: true,
            activePageIndex: 11,
            skillsSetupPageIndex: 11,
            didAutoInstallDefaultSkills: false,
            isLoadingSkills: false,
            hasSkills: true) == false)
        #expect(OnboardingView.shouldAutoInstallDefaultSkills(
            mode: .local,
            onboardingSeen: false,
            activePageIndex: 10,
            skillsSetupPageIndex: 11,
            didAutoInstallDefaultSkills: false,
            isLoadingSkills: false,
            hasSkills: true) == false)
        #expect(OnboardingView.shouldAutoInstallDefaultSkills(
            mode: .local,
            onboardingSeen: false,
            activePageIndex: 11,
            skillsSetupPageIndex: 11,
            didAutoInstallDefaultSkills: true,
            isLoadingSkills: false,
            hasSkills: true) == false)
        #expect(OnboardingView.shouldAutoInstallDefaultSkills(
            mode: .local,
            onboardingSeen: false,
            activePageIndex: 11,
            skillsSetupPageIndex: 11,
            didAutoInstallDefaultSkills: false,
            isLoadingSkills: true,
            hasSkills: true) == false)
        #expect(OnboardingView.shouldAutoInstallDefaultSkills(
            mode: .local,
            onboardingSeen: false,
            activePageIndex: 11,
            skillsSetupPageIndex: 11,
            didAutoInstallDefaultSkills: false,
            isLoadingSkills: false,
            hasSkills: false) == false)
    }

    @Test func `wizard waits for local setup before starting`() {
        #expect(OnboardingView.shouldWaitForLocalSetupBeforeWizard(
            mode: .local,
            installingCLI: true,
            isCheckingLocalGatewaySetup: false,
            localGatewaySetupAvailable: false))
        #expect(OnboardingView.shouldWaitForLocalSetupBeforeWizard(
            mode: .local,
            installingCLI: false,
            isCheckingLocalGatewaySetup: true,
            localGatewaySetupAvailable: false))
        #expect(OnboardingView.shouldWaitForLocalSetupBeforeWizard(
            mode: .local,
            installingCLI: false,
            isCheckingLocalGatewaySetup: false,
            localGatewaySetupAvailable: false))
        #expect(OnboardingView.shouldWaitForLocalSetupBeforeWizard(
            mode: .local,
            installingCLI: false,
            isCheckingLocalGatewaySetup: false,
            localGatewaySetupAvailable: true) == false)
        #expect(OnboardingView.shouldWaitForLocalSetupBeforeWizard(
            mode: .remote,
            installingCLI: false,
            isCheckingLocalGatewaySetup: false,
            localGatewaySetupAvailable: false) == false)
    }

    @Test func `forward navigation dots stay locked while setup is blocked`() {
        #expect(OnboardingView.shouldLockForwardNavigation(
            currentPage: 1,
            targetPage: 2,
            canAdvance: false,
            requiredSetupPageIndex: nil,
            wizardPageOrderIndex: 2,
            wizardComplete: false))
        #expect(OnboardingView.shouldLockForwardNavigation(
            currentPage: 1,
            targetPage: 0,
            canAdvance: false,
            requiredSetupPageIndex: nil,
            wizardPageOrderIndex: 2,
            wizardComplete: false) == false)
        #expect(OnboardingView.shouldLockForwardNavigation(
            currentPage: 2,
            targetPage: 4,
            canAdvance: true,
            requiredSetupPageIndex: nil,
            wizardPageOrderIndex: 2,
            wizardComplete: false))
        #expect(OnboardingView.shouldLockForwardNavigation(
            currentPage: 2,
            targetPage: 4,
            canAdvance: true,
            requiredSetupPageIndex: nil,
            wizardPageOrderIndex: 2,
            wizardComplete: true) == false)
        #expect(OnboardingView.shouldLockForwardNavigation(
            currentPage: 0,
            targetPage: 2,
            canAdvance: true,
            requiredSetupPageIndex: 1,
            wizardPageOrderIndex: 2,
            wizardComplete: false))
        #expect(OnboardingView.shouldLockForwardNavigation(
            currentPage: 0,
            targetPage: 1,
            canAdvance: true,
            requiredSetupPageIndex: 1,
            wizardPageOrderIndex: 2,
            wizardComplete: false) == false)
    }

    @Test func `select remote gateway clears stale ssh target when endpoint unresolved`() async {
        let override = FileManager().temporaryDirectory
            .appendingPathComponent("maumau-config-\(UUID().uuidString)")
            .appendingPathComponent("maumau.json")
            .path

        await TestIsolation.withEnvValues(["MAUMAU_CONFIG_PATH": override]) {
            let state = AppState(preview: true)
            state.remoteTransport = .ssh
            state.remoteTarget = "user@old-host:2222"
            let view = OnboardingView(
                state: state,
                permissionMonitor: PermissionMonitor.shared,
                discoveryModel: GatewayDiscoveryModel(localDisplayName: InstanceIdentity.displayName))
            let gateway = GatewayDiscoveryModel.DiscoveredGateway(
                displayName: "Unresolved",
                serviceHost: nil,
                servicePort: nil,
                lanHost: "txt-host.local",
                tailnetDns: "txt-host.ts.net",
                sshPort: 22,
                gatewayPort: 18789,
                cliPath: "/tmp/maumau",
                stableID: UUID().uuidString,
                debugID: UUID().uuidString,
                isLocal: false)

            view.selectRemoteGateway(gateway)
            #expect(state.remoteTarget.isEmpty)
        }
    }

    @Test func `private access page blocks forward progress for blocked serve request`() {
        #expect(OnboardingView.shouldBlockPrivateAccessAdvance(
            mode: .local,
            activePageIndex: 12,
            privateAccessPageIndex: 12,
            accessFlow: .init(
                appliedMode: "off",
                requestedMode: "serve",
                phase: .blocked,
                requirements: [],
                detail: "Install Tailscale on this Mac first.",
                exposure: nil)))
    }

    @Test func `private access page blocks forward progress for blocked funnel request`() {
        #expect(OnboardingView.shouldBlockPrivateAccessAdvance(
            mode: .local,
            activePageIndex: 12,
            privateAccessPageIndex: 12,
            accessFlow: .init(
                appliedMode: "off",
                requestedMode: "funnel",
                phase: .failed,
                requirements: [],
                detail: "Tailscale Funnel is not enabled on this tailnet yet.",
                exposure: nil)))
    }

    @Test func `private access page stays optional when effective mode is off`() {
        #expect(OnboardingView.shouldBlockPrivateAccessAdvance(
            mode: .local,
            activePageIndex: 12,
            privateAccessPageIndex: 12,
            accessFlow: .idle(appliedMode: "off")) == false)
        #expect(OnboardingView.shouldBlockPrivateAccessAdvance(
            mode: .remote,
            activePageIndex: 12,
            privateAccessPageIndex: 12,
            accessFlow: .init(
                appliedMode: "off",
                requestedMode: "serve",
                phase: .blocked,
                requirements: [],
                detail: "Install Tailscale on this Mac first.",
                exposure: nil)) == false)
    }
}
