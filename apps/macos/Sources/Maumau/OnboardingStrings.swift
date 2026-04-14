import Foundation

struct OnboardingWizardExplanationCopy: Sendable {
    let title: String
    let bodyText: String
}

enum OnboardingWizardExplanationKind: String, Sendable {
    case setupMode
    case existingSetup
    case pickBrain
    case liveSearch
    case connectBrain
    case workspace
    case preparingSetup
}

private struct LocalizedOnboardingToolHighlight: Decodable, Sendable {
    let title: String
    let subtitle: String
    let systemImage: String
}

struct OnboardingStrings: Sendable {
    let language: OnboardingLanguage

    private var languageID: String {
        self.language.replyLanguageID
    }

    private func onboardingPath(_ key: String) -> [String] {
        ["mac", "onboarding"] + key.split(separator: ".").map(String.init)
    }

    private func localized(_ key: String, parameters: [String: String] = [:], fallback: String) -> String {
        SharedLocalizationStore.string(path: self.onboardingPath(key), languageID: self.languageID, parameters: parameters)
            ?? SharedLocalizationStore.interpolate(fallback, parameters: parameters)
    }

    private func highlights(_ key: String, fallback: [OnboardingToolHighlight]) -> [OnboardingToolHighlight] {
        guard let rows = SharedLocalizationStore.decode([LocalizedOnboardingToolHighlight].self, path: self.onboardingPath(key), languageID: self.languageID) else {
            return fallback
        }
        return rows.map { row in
            OnboardingToolHighlight(title: row.title, subtitle: row.subtitle, systemImage: row.systemImage)
        }
    }

    var windowTitle: String {
        self.localized("windowTitle", fallback: "Welcome to Maumau")
    }

    var nextButtonTitle: String {
        self.localized("nextButtonTitle", fallback: "Next")
    }

    var finishButtonTitle: String {
        self.localized("finishButtonTitle", fallback: "Finish")
    }

    var backButtonTitle: String {
        self.localized("backButtonTitle", fallback: "Back")
    }

    var previousStepButtonTitle: String {
        self.localized("previousStepButtonTitle", fallback: "Previous step")
    }

    var backToWorkspaceButtonTitle: String {
        self.localized("backToWorkspaceButtonTitle", fallback: "Back to workspace")
    }

    var setUpLaterButtonTitle: String {
        self.localized("setUpLaterButtonTitle", fallback: "Set up later")
    }

    var languagePageTitle: String {
        self.localized("languagePageTitle", fallback: "Choose your language")
    }

    var languagePageGreeting: String {
        self.localized("languagePageGreeting", fallback: "Hi! Welcome to Maumau!")
    }

    var languagePageSubtitle: String {
        self.localized("languagePageSubtitle", fallback: "Choose the language Maumau should use during onboarding and chat replies. Internal prompts and skills stay in English.")
    }

    var languagePageFootnote: String {
        self.localized("languagePageFootnote", fallback: "You can change this during onboarding by going back to this step.")
    }

    var nextStepsMeaningTitle: String {
        self.localized("nextStepsMeaningTitle", fallback: "Here’s what the next steps mean")
    }

    var setupLegend: String {
        self.localized("setupLegend", fallback: "Required steps are marked Required. Optional steps can be done later. Needs prep means you may need another app, account, or device ready for that step.")
    }

    var securityNoticeTitle: String {
        self.localized("securityNoticeTitle", fallback: "Security notice")
    }

    var securityNoticeBody: String {
        self.localized("securityNoticeBody", fallback: "Maumau can do real things on your Mac if you turn them on, like run commands, read or change files, and take screenshots.\n\nOnly continue if that makes sense to you and you trust the AI and tools you connect.")
    }

    var connectionTitle: String {
        self.localized("connectionTitle", fallback: "Set up the Gateway")
    }

    var connectionIntro: String {
        self.localized("connectionIntro", fallback: "Gateway means Maumau's home. Most people choose This Mac, which means this computer keeps the tools and does the work here.")
    }

    var preparingThisMacLabel: String {
        self.localized("preparingThisMacLabel", fallback: "Preparing this Mac…")
    }

    var checkingHelperToolsLabel: String {
        self.localized("checkingHelperToolsLabel", fallback: "Checking the helper tools this Mac needs…")
    }

    var runtimeAlreadyAvailableHint: String {
        self.localized("runtimeAlreadyAvailableHint", fallback: "If Node 22+ is already here, Maumau can keep going without reinstalling anything.")
    }

    var localSetupRunningHint: String {
        self.localized("localSetupRunningHint", fallback: "Maumau is getting this Mac ready before the next step.")
    }

    var retryLocalSetupButtonTitle: String {
        self.localized("retryLocalSetupButtonTitle", fallback: "Retry local setup")
    }

    var localSetupReadyHint: String {
        self.localized("localSetupReadyHint", fallback: "This Mac is ready. Continue to the brain setup.")
    }

    var nearbyGatewaysLabel: String {
        self.localized("nearbyGatewaysLabel", fallback: "Nearby gateways")
    }

    var searchingNearbyGatewaysLabel: String {
        self.localized("searchingNearbyGatewaysLabel", fallback: "Searching for nearby gateways…")
    }

    var permissionsTitle: String {
        self.localized("permissionsTitle", fallback: "Allow Mac access")
    }

    var permissionsIntro: String {
        self.localized("permissionsIntro", fallback: "These are the main Mac permissions Maumau uses when it helps with apps, windows, or screenshots. Turn on only the ones you want.")
    }

    var refreshButtonTitle: String {
        self.localized("refreshButtonTitle", fallback: "Refresh")
    }

    var openPermissionsSettingsButtonTitle: String {
        self.localized("openPermissionsSettingsButtonTitle", fallback: "Open full Permissions settings")
    }

    var optionalLaterTitle: String {
        self.localized("optionalLaterTitle", fallback: "Optional later")
    }

    var optionalLaterBody: String {
        self.localized("optionalLaterBody", fallback: "Voice Wake, camera, and location stay out of the way here. If you want those later, you can turn them on in Settings.")
    }

    var wizardTitle: String {
        self.localized("wizardTitle", fallback: "Choose the brain")
    }

    var wizardIntro: String {
        self.localized("wizardIntro", fallback: "Brain means the AI service Maumau uses for thinking and writing. Choose it once, sign in once, and Maumau will remember your default choice.")
    }

    var wizardErrorTitle: String {
        self.localized("wizardErrorTitle", fallback: "Wizard error")
    }

    var startingWizardTitle: String {
        self.localized("startingWizardTitle", fallback: "Starting wizard…")
    }

    var wizardCompleteTitle: String {
        self.localized("wizardCompleteTitle", fallback: "Wizard complete. Continue to the next step.")
    }

    var wizardSkippedTitle: String {
        self.localized("wizardSkippedTitle", fallback: "Brain setup skipped for now. You can finish it later in Settings.")
    }

    var waitingForWizardTitle: String {
        self.localized("waitingForWizardTitle", fallback: "Waiting for wizard…")
    }

    var channelsTitle: String {
        self.localized("channelsTitle", fallback: "Pick a Channel")
    }

    var channelsIntro: String {
        self.localized("channelsIntro", fallback: "Channel means the app where people text Maumau. Think of it like giving Maumau a phone line or inbox. Pick one now, and you can add more later.")
    }

    var availableChatAppsTitle: String {
        self.localized("availableChatAppsTitle", fallback: "Available chat apps")
    }

    var finishInSettingsTitle: String {
        self.localized("finishInSettingsTitle", fallback: "Finish in Settings")
    }

    var loadingChatAppsTitle: String {
        self.localized("loadingChatAppsTitle", fallback: "Loading chat apps from the Gateway…")
    }

    var loadingChatAppsHint: String {
        self.localized("loadingChatAppsHint", fallback: "If this stays empty, make sure the Gateway is running, then hit Refresh.")
    }

    var privateAccessTitle: String {
        self.localized("privateAccessTitle", fallback: "Private access from your devices")
    }

    var privateAccessIntro: String {
        self.localized("privateAccessIntro", fallback: "This gives Maumau's home a private driveway. It lets your phone, laptop, or browser reach Maumau privately without putting Maumau on the public internet.")
    }

    var privateAccessThisMacTitle: String {
        self.localized("privateAccessThisMacTitle", fallback: "This Mac, now")
    }

    var privateAccessThisMacSubtitle: String {
        self.localized("privateAccessThisMacSubtitle", fallback: "Use Install on this Mac below. Maumau downloads the official Tailscale installer here, macOS asks for your administrator password, then you sign in here.")
    }

    var privateAccessOtherDevicesTitle: String {
        self.localized("privateAccessOtherDevicesTitle", fallback: "Other devices, later")
    }

    var privateAccessOtherDevicesSubtitle: String {
        self.localized("privateAccessOtherDevicesSubtitle", fallback: "When you want to open Maumau from your phone or another laptop, install Tailscale on that device later and sign in to the same private network there.")
    }

    var privateAccessDefaultPrivacyTitle: String {
        self.localized("privateAccessDefaultPrivacyTitle", fallback: "Private by default")
    }

    var privateAccessDefaultPrivacySubtitle: String {
        self.localized("privateAccessDefaultPrivacySubtitle", fallback: "Private mode keeps Maumau off the public internet. Only devices you add to the same private Tailscale network can open the private link.")
    }

    var privateAccessSafetyTitle: String {
        self.localized("privateAccessSafetyTitle", fallback: "How Maumau checks this safely")
    }

    var privateAccessSafetySubtitle: String {
        self.localized("privateAccessSafetySubtitle", fallback: "In private mode, Maumau accepts only Tailscale's verified private-network identity for the dashboard and live connection. If you want an extra lock, require a Maumau password too.")
    }

    var privateAccessLaterTitle: String {
        self.localized("privateAccessLaterTitle", fallback: "Come back to this later")
    }

    var privateAccessLaterSubtitle: String {
        self.localized("privateAccessLaterSubtitle", fallback: "The same guide stays in Settings → General, so you can run the install here later, sign in later, or add password protection later if you skip this for now.")
    }

    var privateAccessLaterButtonTitle: String {
        self.localized("privateAccessLaterButtonTitle", fallback: "Open Settings → General")
    }

    var conversationAutomationTitle: String {
        self.localized("conversationAutomationTitle", fallback: "Voice calls")
    }

    var conversationAutomationIntro: String {
        self.localized("conversationAutomationIntro", fallback: "Choose the simple Vapi path or keep the advanced self-hosted path for real phone calls. Both options stay inside the built-in voice-call plugin.")
    }

    var conversationAutomationTelephonyTitle: String {
        self.localized("conversationAutomationTelephonyTitle", fallback: "Turn on phone calls")
    }

    var conversationAutomationTelephonySubtitle: String {
        self.localized("conversationAutomationTelephonySubtitle", fallback: "Maumau will only save voice-call settings when every required provider key and callback route is ready.")
    }

    var conversationAutomationChecklistTitle: String {
        self.localized("conversationAutomationChecklistTitle", fallback: "What this step completes")
    }

    var conversationAutomationChecklistSubtitle: String {
        self.localized("conversationAutomationChecklistSubtitle", fallback: "Simple with Vapi: Vapi API key, one assistant, one imported Twilio number, and Private Access ready. Advanced self-hosted: phone provider credentials, a public callback URL, realtime speech-to-text, and ElevenLabs.")
    }

    var conversationAutomationModeTitle: String {
        self.localized("conversationAutomationModeTitle", fallback: "Setup mode")
    }

    var conversationAutomationModeSubtitle: String {
        self.localized("conversationAutomationModeSubtitle", fallback: "Simple with Vapi is the quick outbound calling path. Advanced self-hosted keeps the current direct-provider flow.")
    }

    var conversationAutomationModeSimpleLabel: String {
        self.localized("conversationAutomationModeSimpleLabel", fallback: "Simple with Vapi")
    }

    var conversationAutomationModeAdvancedLabel: String {
        self.localized("conversationAutomationModeAdvancedLabel", fallback: "Advanced self-hosted")
    }

    var conversationAutomationVapiTitle: String {
        self.localized("conversationAutomationVapiTitle", fallback: "Vapi setup")
    }

    var conversationAutomationVapiSubtitle: String {
        self.localized("conversationAutomationVapiSubtitle", fallback: "Use Vapi for the live voice pipeline, import a Twilio number there, and let Maumau handle the conversation brain and memory.")
    }

    var conversationAutomationVapiAPIKeyTitle: String {
        self.localized("conversationAutomationVapiAPIKeyTitle", fallback: "Vapi API key")
    }

    var conversationAutomationVapiAPIKeySubtitle: String {
        self.localized("conversationAutomationVapiAPIKeySubtitle", fallback: "Paste your Vapi private API key, then connect to load assistants and phone numbers from your Vapi account.")
    }

    var conversationAutomationVapiAPIKeyPlaceholder: String {
        self.localized("conversationAutomationVapiAPIKeyPlaceholder", fallback: "vapi_...")
    }

    var conversationAutomationVapiRefreshButtonTitle: String {
        self.localized("conversationAutomationVapiRefreshButtonTitle", fallback: "Connect / Refresh")
    }

    var conversationAutomationVapiRefreshingButtonTitle: String {
        self.localized("conversationAutomationVapiRefreshingButtonTitle", fallback: "Refreshing…")
    }

    var conversationAutomationOpenTwilioNumberGuideButtonTitle: String {
        self.localized("conversationAutomationOpenTwilioNumberGuideButtonTitle", fallback: "Buy or port in Twilio")
    }

    var conversationAutomationOpenVapiImportButtonTitle: String {
        self.localized("conversationAutomationOpenVapiImportButtonTitle", fallback: "Import into Vapi")
    }

    var conversationAutomationOpenVapiAssistantsButtonTitle: String {
        self.localized("conversationAutomationOpenVapiAssistantsButtonTitle", fallback: "Open Vapi assistants")
    }

    var conversationAutomationVapiAssistantTitle: String {
        self.localized("conversationAutomationVapiAssistantTitle", fallback: "Assistant")
    }

    var conversationAutomationVapiAssistantSubtitle: String {
        self.localized("conversationAutomationVapiAssistantSubtitle", fallback: "Choose the Vapi assistant Maumau should use as the base for outbound calls.")
    }

    var conversationAutomationVapiAssistantEmptySubtitle: String {
        self.localized("conversationAutomationVapiAssistantEmptySubtitle", fallback: "Connect to Vapi first, then choose one assistant here.")
    }

    var conversationAutomationVapiPhoneNumberTitle: String {
        self.localized("conversationAutomationVapiPhoneNumberTitle", fallback: "Phone number")
    }

    var conversationAutomationVapiPhoneNumberSubtitle: String {
        self.localized("conversationAutomationVapiPhoneNumberSubtitle", fallback: "Choose the imported Twilio number Vapi should call from.")
    }

    var conversationAutomationVapiPhoneNumberEmptySubtitle: String {
        self.localized("conversationAutomationVapiPhoneNumberEmptySubtitle", fallback: "Connect to Vapi after importing a Twilio number, then choose that number here.")
    }

    var conversationAutomationVapiPreferredLanguageTitle: String {
        self.localized("conversationAutomationVapiPreferredLanguageTitle", fallback: "Preferred call language")
    }

    var conversationAutomationVapiPreferredLanguageSubtitle: String {
        self.localized("conversationAutomationVapiPreferredLanguageSubtitle", fallback: "Default spoken replies to the language you want callers to hear first.")
    }

    var conversationAutomationVapiBridgeModeTitle: String {
        self.localized("conversationAutomationVapiBridgeModeTitle", fallback: "Bridge mode")
    }

    var conversationAutomationVapiBridgeModeSubtitle: String {
        self.localized("conversationAutomationVapiBridgeModeSubtitle", fallback: "Auto bridge publishes a public callback for Vapi on a separate Tailscale Funnel port. Manual public URL lets you point Vapi at another public bridge.")
    }

    var conversationAutomationVapiBridgeModeAutoLabel: String {
        self.localized("conversationAutomationVapiBridgeModeAutoLabel", fallback: "Auto bridge")
    }

    var conversationAutomationVapiBridgeModeManualLabel: String {
        self.localized("conversationAutomationVapiBridgeModeManualLabel", fallback: "Manual public URL")
    }

    var conversationAutomationVapiBridgeTitle: String {
        self.localized("conversationAutomationVapiBridgeTitle", fallback: "Maumau bridge URL")
    }

    var conversationAutomationVapiAutoBridgeWaitingSubtitle: String {
        self.localized("conversationAutomationVapiAutoBridgeWaitingSubtitle", fallback: "Auto bridge uses Tailscale Funnel on public port 8443. Finish Private Access first so Maumau can publish that bridge URL.")
    }

    var conversationAutomationVapiBridgeWaitingSubtitle: String {
        self.localized("conversationAutomationVapiBridgeWaitingSubtitle", fallback: "Finish Private Access first so Maumau has a public bridge URL for Vapi.")
    }

    var conversationAutomationVapiManualBridgeTitle: String {
        self.localized("conversationAutomationVapiManualBridgeTitle", fallback: "Manual bridge URL")
    }

    var conversationAutomationVapiManualBridgeSubtitle: String {
        self.localized("conversationAutomationVapiManualBridgeSubtitle", fallback: "Paste a public HTTPS URL if you want Vapi to call Maumau through another bridge instead of the auto-managed Tailscale path.")
    }

    var conversationAutomationVapiManualBridgePlaceholder: String {
        self.localized("conversationAutomationVapiManualBridgePlaceholder", fallback: "https://your.domain/plugins/voice-call/vapi")
    }

    var conversationAutomationVapiOutboundOnlyTitle: String {
        self.localized("conversationAutomationVapiOutboundOnlyTitle", fallback: "Outbound-first in this version")
    }

    var conversationAutomationVapiOutboundOnlySubtitle: String {
        self.localized("conversationAutomationVapiOutboundOnlySubtitle", fallback: "This simple path is for outbound calls first. Inbound routing and manual live call controls stay in Advanced self-hosted.")
    }

    var conversationAutomationVapiIndonesiaNoticeTitle: String {
        self.localized("conversationAutomationVapiIndonesiaNoticeTitle", fallback: "Indonesia number availability")
    }

    var conversationAutomationVapiIndonesiaNoticeSubtitle: String {
        self.localized("conversationAutomationVapiIndonesiaNoticeSubtitle", fallback: "Indonesia numbers depend on Twilio inventory and regulation. If +62 is not available right now, buy or port in Twilio first, then import that number into Vapi.")
    }

    var conversationAutomationPhoneProviderTitle: String {
        self.localized("conversationAutomationPhoneProviderTitle", fallback: "1. Phone provider")
    }

    var conversationAutomationPhoneProviderSubtitle: String {
        self.localized("conversationAutomationPhoneProviderSubtitle", fallback: "Choose the built-in phone provider Maumau should use for live calls, then add that provider's number and credentials below.")
    }

    var conversationAutomationPhoneProviderTwilioLabel: String {
        self.localized("conversationAutomationPhoneProviderTwilioLabel", fallback: "Twilio")
    }

    var conversationAutomationPhoneProviderTelnyxLabel: String {
        self.localized("conversationAutomationPhoneProviderTelnyxLabel", fallback: "Telnyx")
    }

    var conversationAutomationPhoneProviderPlivoLabel: String {
        self.localized("conversationAutomationPhoneProviderPlivoLabel", fallback: "Plivo")
    }

    var conversationAutomationPhoneNumberTitle: String {
        self.localized("conversationAutomationPhoneNumberTitle", fallback: "Phone number")
    }

    var conversationAutomationPhoneNumberSubtitle: String {
        self.localized("conversationAutomationPhoneNumberSubtitle", fallback: "Paste the E.164 number Maumau should call from, like +628123456789.")
    }

    var conversationAutomationPhoneNumberPlaceholder: String {
        self.localized("conversationAutomationPhoneNumberPlaceholder", fallback: "+628123456789")
    }

    var conversationAutomationTwilioSectionTitle: String {
        self.localized("conversationAutomationTwilioSectionTitle", fallback: "Twilio setup")
    }

    var conversationAutomationTwilioSectionSubtitle: String {
        self.localized("conversationAutomationTwilioSectionSubtitle", fallback: "Use the Twilio Console to get a voice-capable number and copy the account credentials Maumau needs for calls.")
    }

    var conversationAutomationTwilioAccountSIDTitle: String {
        self.localized("conversationAutomationTwilioAccountSIDTitle", fallback: "Twilio Account SID")
    }

    var conversationAutomationTwilioAccountSIDSubtitle: String {
        self.localized("conversationAutomationTwilioAccountSIDSubtitle", fallback: "Copy the Account SID from your Twilio Console project.")
    }

    var conversationAutomationTwilioAccountSIDPlaceholder: String {
        self.localized("conversationAutomationTwilioAccountSIDPlaceholder", fallback: "AC...")
    }

    var conversationAutomationTwilioAuthTokenTitle: String {
        self.localized("conversationAutomationTwilioAuthTokenTitle", fallback: "Twilio Auth Token")
    }

    var conversationAutomationTwilioAuthTokenSubtitle: String {
        self.localized("conversationAutomationTwilioAuthTokenSubtitle", fallback: "Reveal or create the Auth Token in Twilio Console, then paste it here.")
    }

    var conversationAutomationTwilioAuthTokenPlaceholder: String {
        self.localized("conversationAutomationTwilioAuthTokenPlaceholder", fallback: "Twilio auth token")
    }

    var conversationAutomationOpenPortalButtonTitle: String {
        self.localized("conversationAutomationOpenPortalButtonTitle", fallback: "Open portal")
    }

    var conversationAutomationOpenGuideButtonTitle: String {
        self.localized("conversationAutomationOpenGuideButtonTitle", fallback: "Open guide")
    }

    var conversationAutomationOpenConsoleButtonTitle: String {
        self.localized("conversationAutomationOpenConsoleButtonTitle", fallback: "Open console")
    }

    var conversationAutomationOpenAPIKeysButtonTitle: String {
        self.localized("conversationAutomationOpenAPIKeysButtonTitle", fallback: "Open API keys")
    }

    var conversationAutomationOpenVoiceLibraryButtonTitle: String {
        self.localized("conversationAutomationOpenVoiceLibraryButtonTitle", fallback: "Open voice library")
    }

    var conversationAutomationCopyURLButtonTitle: String {
        self.localized("conversationAutomationCopyURLButtonTitle", fallback: "Copy URL")
    }

    var conversationAutomationGoToPrivateAccessButtonTitle: String {
        self.localized("conversationAutomationGoToPrivateAccessButtonTitle", fallback: "Go to Private access")
    }

    var conversationAutomationOpenAdminButtonTitle: String {
        self.localized("conversationAutomationOpenAdminButtonTitle", fallback: "Open admin page")
    }

    var conversationAutomationTelnyxSectionTitle: String {
        self.localized("conversationAutomationTelnyxSectionTitle", fallback: "Telnyx setup")
    }

    var conversationAutomationTelnyxSectionSubtitle: String {
        self.localized("conversationAutomationTelnyxSectionSubtitle", fallback: "Use Telnyx Mission Control to get a voice-capable number, create an API key, and open the Call Control connection or application you want Maumau to use.")
    }

    var conversationAutomationPlivoSectionTitle: String {
        self.localized("conversationAutomationPlivoSectionTitle", fallback: "Plivo setup")
    }

    var conversationAutomationPlivoSectionSubtitle: String {
        self.localized("conversationAutomationPlivoSectionSubtitle", fallback: "Use the Plivo Console to buy or assign a voice-capable number, then copy the auth credentials Maumau needs.")
    }

    var conversationAutomationPlivoAuthIDTitle: String {
        self.localized("conversationAutomationPlivoAuthIDTitle", fallback: "Plivo Auth ID")
    }

    var conversationAutomationPlivoAuthIDSubtitle: String {
        self.localized("conversationAutomationPlivoAuthIDSubtitle", fallback: "Copy the Auth ID from your Plivo Console account.")
    }

    var conversationAutomationPlivoAuthIDPlaceholder: String {
        self.localized("conversationAutomationPlivoAuthIDPlaceholder", fallback: "MA...")
    }

    var conversationAutomationPlivoAuthTokenTitle: String {
        self.localized("conversationAutomationPlivoAuthTokenTitle", fallback: "Plivo Auth Token")
    }

    var conversationAutomationPlivoAuthTokenSubtitle: String {
        self.localized("conversationAutomationPlivoAuthTokenSubtitle", fallback: "Copy the Auth Token from your Plivo Console account.")
    }

    var conversationAutomationPlivoAuthTokenPlaceholder: String {
        self.localized("conversationAutomationPlivoAuthTokenPlaceholder", fallback: "Plivo auth token")
    }

    var conversationAutomationTelnyxAPIKeyTitle: String {
        self.localized("conversationAutomationTelnyxAPIKeyTitle", fallback: "Telnyx API key")
    }

    var conversationAutomationTelnyxAPIKeySubtitle: String {
        self.localized("conversationAutomationTelnyxAPIKeySubtitle", fallback: "Create a Telnyx API v2 key and paste it here.")
    }

    var conversationAutomationTelnyxAPIKeyPlaceholder: String {
        self.localized("conversationAutomationTelnyxAPIKeyPlaceholder", fallback: "KEY...")
    }

    var conversationAutomationTelnyxConnectionIDTitle: String {
        self.localized("conversationAutomationTelnyxConnectionIDTitle", fallback: "Call Control connection ID")
    }

    var conversationAutomationTelnyxConnectionIDSubtitle: String {
        self.localized("conversationAutomationTelnyxConnectionIDSubtitle", fallback: "Paste the connection or application ID from the Telnyx Call Control setup.")
    }

    var conversationAutomationTelnyxConnectionIDPlaceholder: String {
        self.localized("conversationAutomationTelnyxConnectionIDPlaceholder", fallback: "CONNxxxx")
    }

    var conversationAutomationTelnyxPublicKeyTitle: String {
        self.localized("conversationAutomationTelnyxPublicKeyTitle", fallback: "Telnyx public key")
    }

    var conversationAutomationTelnyxPublicKeySubtitle: String {
        self.localized("conversationAutomationTelnyxPublicKeySubtitle", fallback: "Maumau uses this to verify signed Telnyx webhooks.")
    }

    var conversationAutomationTelnyxPublicKeyPlaceholder: String {
        self.localized("conversationAutomationTelnyxPublicKeyPlaceholder", fallback: "Paste the public key from Telnyx")
    }

    var conversationAutomationWebhookTitle: String {
        self.localized("conversationAutomationWebhookTitle", fallback: "2. Callback URL")
    }

    var conversationAutomationWebhookSubtitle: String {
        self.localized("conversationAutomationWebhookSubtitle", fallback: "Your chosen phone provider must be able to reach Maumau over HTTPS during live calls. Pick the public route Maumau should use.")
    }

    var conversationAutomationWebhookTailscaleLabel: String {
        self.localized("conversationAutomationWebhookTailscaleLabel", fallback: "Automatic with Tailscale Funnel")
    }

    var conversationAutomationWebhookManualLabel: String {
        self.localized("conversationAutomationWebhookManualLabel", fallback: "I already have a public webhook URL")
    }

    var conversationAutomationWebhookPublicURLTitle: String {
        self.localized("conversationAutomationWebhookPublicURLTitle", fallback: "Public webhook URL")
    }

    var conversationAutomationWebhookPublicURLSubtitle: String {
        self.localized("conversationAutomationWebhookPublicURLSubtitle", fallback: "Paste the exact HTTPS webhook URL that your phone provider should call, for example https://your.domain/voice/webhook.")
    }

    var conversationAutomationWebhookPublicURLPlaceholder: String {
        self.localized("conversationAutomationWebhookPublicURLPlaceholder", fallback: "https://your.domain/voice/webhook")
    }

    var conversationAutomationWebhookPrivateAccessSubtitle: String {
        self.localized("conversationAutomationWebhookPrivateAccessSubtitle", fallback: "Tailscale is not ready on this Mac yet. Finish that setup first, then come back here.")
    }

    var conversationAutomationWebhookAdminSubtitle: String {
        self.localized("conversationAutomationWebhookAdminSubtitle", fallback: "Your tailnet still has Funnel disabled. Open the admin page to enable it, or switch to a manual public webhook URL instead.")
    }

    var conversationAutomationSttTitle: String {
        self.localized("conversationAutomationSttTitle", fallback: "3. Realtime speech-to-text")
    }

    var conversationAutomationSttSubtitle: String {
        self.localized("conversationAutomationSttSubtitle", fallback: "Choose the engine Maumau should use while a phone call is live. Both options need their own API key.")
    }

    var conversationAutomationSttDeepgramLabel: String {
        self.localized("conversationAutomationSttDeepgramLabel", fallback: "Deepgram Nova-3")
    }

    var conversationAutomationSttOpenAILabel: String {
        self.localized("conversationAutomationSttOpenAILabel", fallback: "OpenAI Realtime")
    }

    var conversationAutomationDeepgramAPIKeyTitle: String {
        self.localized("conversationAutomationDeepgramAPIKeyTitle", fallback: "Deepgram API key")
    }

    var conversationAutomationDeepgramAPIKeySubtitle: String {
        self.localized("conversationAutomationDeepgramAPIKeySubtitle", fallback: "Open the Deepgram console, create or copy a project API key, then paste it here.")
    }

    var conversationAutomationDeepgramAPIKeyPlaceholder: String {
        self.localized("conversationAutomationDeepgramAPIKeyPlaceholder", fallback: "dg...")
    }

    var conversationAutomationOpenAIAPIKeyTitle: String {
        self.localized("conversationAutomationOpenAIAPIKeyTitle", fallback: "OpenAI API key")
    }

    var conversationAutomationOpenAIAPIKeySubtitle: String {
        self.localized("conversationAutomationOpenAIAPIKeySubtitle", fallback: "Open the OpenAI API keys page, create a key for the Realtime API, then paste it here.")
    }

    var conversationAutomationOpenAIAPIKeyPlaceholder: String {
        self.localized("conversationAutomationOpenAIAPIKeyPlaceholder", fallback: "sk-...")
    }

    var conversationAutomationTtsTitle: String {
        self.localized("conversationAutomationTtsTitle", fallback: "4. Spoken replies")
    }

    var conversationAutomationTtsSubtitle: String {
        self.localized("conversationAutomationTtsSubtitle", fallback: "Maumau uses ElevenLabs with eleven_multilingual_v2 for call replies. Add the API key here, and optionally override the default voice.")
    }

    var conversationAutomationElevenLabsAPIKeyTitle: String {
        self.localized("conversationAutomationElevenLabsAPIKeyTitle", fallback: "ElevenLabs API key")
    }

    var conversationAutomationElevenLabsAPIKeySubtitle: String {
        self.localized("conversationAutomationElevenLabsAPIKeySubtitle", fallback: "Open ElevenLabs API authentication docs or your workspace settings, then paste the key here.")
    }

    var conversationAutomationElevenLabsAPIKeyPlaceholder: String {
        self.localized("conversationAutomationElevenLabsAPIKeyPlaceholder", fallback: "xi-...")
    }

    var conversationAutomationElevenLabsVoiceIDTitle: String {
        self.localized("conversationAutomationElevenLabsVoiceIDTitle", fallback: "Optional ElevenLabs voice ID")
    }

    var conversationAutomationElevenLabsVoiceIDSubtitle: String {
        self.localized("conversationAutomationElevenLabsVoiceIDSubtitle", fallback: "Leave this blank to use Maumau’s multilingual default voice, or paste a voice ID from the ElevenLabs voice library.")
    }

    var conversationAutomationElevenLabsVoiceIDPlaceholder: String {
        self.localized("conversationAutomationElevenLabsVoiceIDPlaceholder", fallback: "Optional voice ID")
    }

    var conversationAutomationReadyTitle: String {
        self.localized("conversationAutomationReadyTitle", fallback: "Ready to finish")
    }

    var conversationAutomationReadySubtitle: String {
        self.localized("conversationAutomationReadySubtitle", fallback: "This voice-call setup now has the required configuration for the mode you chose.")
    }

    var conversationAutomationBeforeFinishTitle: String {
        self.localized("conversationAutomationBeforeFinishTitle", fallback: "Finish is blocked until these are added")
    }

    var conversationAutomationValidationFromNumberMissing: String {
        self.localized("conversationAutomationValidationFromNumberMissing", fallback: "Add the phone number Maumau should call from.")
    }

    var conversationAutomationValidationFromNumberInvalid: String {
        self.localized("conversationAutomationValidationFromNumberInvalid", fallback: "Use E.164 format for the phone number, for example +628123456789.")
    }

    var conversationAutomationValidationTwilioAccountSIDMissing: String {
        self.localized("conversationAutomationValidationTwilioAccountSIDMissing", fallback: "Add the Twilio Account SID.")
    }

    var conversationAutomationValidationTwilioAuthTokenMissing: String {
        self.localized("conversationAutomationValidationTwilioAuthTokenMissing", fallback: "Add the Twilio Auth Token.")
    }

    var conversationAutomationValidationVapiAPIKeyMissing: String {
        self.localized("conversationAutomationValidationVapiAPIKeyMissing", fallback: "Add the Vapi API key, then connect to load assistants and phone numbers.")
    }

    var conversationAutomationValidationVapiAssistantMissing: String {
        self.localized("conversationAutomationValidationVapiAssistantMissing", fallback: "Choose one Vapi assistant.")
    }

    var conversationAutomationValidationVapiPhoneNumberMissing: String {
        self.localized("conversationAutomationValidationVapiPhoneNumberMissing", fallback: "Choose one imported Twilio phone number from Vapi.")
    }

    var conversationAutomationValidationVapiBridgeMissing: String {
        self.localized("conversationAutomationValidationVapiBridgeMissing", fallback: "Finish Private Access first so Maumau has a public bridge URL for Vapi.")
    }

    var conversationAutomationValidationTelnyxAPIKeyMissing: String {
        self.localized("conversationAutomationValidationTelnyxAPIKeyMissing", fallback: "Add the Telnyx API key.")
    }

    var conversationAutomationValidationTelnyxConnectionIDMissing: String {
        self.localized("conversationAutomationValidationTelnyxConnectionIDMissing", fallback: "Add the Telnyx Call Control connection or application ID.")
    }

    var conversationAutomationValidationTelnyxPublicKeyMissing: String {
        self.localized("conversationAutomationValidationTelnyxPublicKeyMissing", fallback: "Add the Telnyx public key for webhook verification.")
    }

    var conversationAutomationValidationPlivoAuthIDMissing: String {
        self.localized("conversationAutomationValidationPlivoAuthIDMissing", fallback: "Add the Plivo Auth ID.")
    }

    var conversationAutomationValidationPlivoAuthTokenMissing: String {
        self.localized("conversationAutomationValidationPlivoAuthTokenMissing", fallback: "Add the Plivo Auth Token.")
    }

    var conversationAutomationValidationTailscaleInstallMissing: String {
        self.localized("conversationAutomationValidationTailscaleInstallMissing", fallback: "Install Tailscale on this Mac or switch to a manual public webhook URL.")
    }

    var conversationAutomationValidationTailscaleInstallMissingForVapi: String {
        self.localized("conversationAutomationValidationTailscaleInstallMissingForVapi", fallback: "Install Tailscale on this Mac for Auto bridge, or switch the Vapi bridge to Manual public URL.")
    }

    var conversationAutomationValidationTailscaleRunningMissing: String {
        self.localized("conversationAutomationValidationTailscaleRunningMissing", fallback: "Sign in to Tailscale on this Mac or switch to a manual public webhook URL.")
    }

    var conversationAutomationValidationTailscaleRunningMissingForVapi: String {
        self.localized("conversationAutomationValidationTailscaleRunningMissingForVapi", fallback: "Sign in to Tailscale on this Mac for Auto bridge, or switch the Vapi bridge to Manual public URL.")
    }

    var conversationAutomationValidationTailscaleFunnelMissing: String {
        self.localized("conversationAutomationValidationTailscaleFunnelMissing", fallback: "Enable Tailscale Funnel for this tailnet or switch to a manual public webhook URL.")
    }

    var conversationAutomationValidationTailscaleFunnelMissingForVapi: String {
        self.localized("conversationAutomationValidationTailscaleFunnelMissingForVapi", fallback: "Enable Tailscale Funnel for this tailnet for Auto bridge, or switch the Vapi bridge to Manual public URL.")
    }

    var conversationAutomationValidationVapiManualBridgeMissing: String {
        self.localized("conversationAutomationValidationVapiManualBridgeMissing", fallback: "Add the public HTTPS URL that Vapi should use for the Maumau bridge.")
    }

    var conversationAutomationValidationVapiManualBridgeInvalid: String {
        self.localized("conversationAutomationValidationVapiManualBridgeInvalid", fallback: "Use a valid HTTPS bridge URL, for example https://your.domain/plugins/voice-call/vapi.")
    }

    var conversationAutomationValidationPublicWebhookMissing: String {
        self.localized("conversationAutomationValidationPublicWebhookMissing", fallback: "Add the public HTTPS webhook URL that your phone provider should call.")
    }

    var conversationAutomationValidationPublicWebhookInvalid: String {
        self.localized("conversationAutomationValidationPublicWebhookInvalid", fallback: "Use a valid HTTPS webhook URL, for example https://your.domain/voice/webhook.")
    }

    var conversationAutomationValidationDeepgramAPIKeyMissing: String {
        self.localized("conversationAutomationValidationDeepgramAPIKeyMissing", fallback: "Add the Deepgram API key or switch the speech engine to OpenAI Realtime.")
    }

    var conversationAutomationValidationOpenAIAPIKeyMissing: String {
        self.localized("conversationAutomationValidationOpenAIAPIKeyMissing", fallback: "Add the OpenAI API key or switch the speech engine to Deepgram Nova-3.")
    }

    var conversationAutomationValidationElevenLabsAPIKeyMissing: String {
        self.localized("conversationAutomationValidationElevenLabsAPIKeyMissing", fallback: "Add the ElevenLabs API key for spoken replies.")
    }

    var conversationAutomationValidationListHeader: String {
        self.localized("conversationAutomationValidationListHeader", fallback: "Add the missing items below, then Finish will save a working voice-call config.")
    }

    var conversationAutomationTailscaleUnavailableTitle: String {
        self.localized("conversationAutomationTailscaleUnavailableTitle", fallback: "Tailscale Funnel is not ready yet")
    }

    var conversationAutomationTailscaleReadyTitle: String {
        self.localized("conversationAutomationTailscaleReadyTitle", fallback: "Use this callback URL in your phone provider")
    }

    var skillsTitle: String {
        self.localized("skillsTitle", fallback: "Review included tools")
    }

    var skillsIntro: String {
        self.localized("skillsIntro", fallback: "This is the short version of the core tools Maumau already comes with on this Mac. On first-time local setup, Maumau also installs nano-pdf, OpenAI Whisper, and summarize automatically when they are missing, while bundled setup guides like Clawd Cursor help you turn on extra capabilities later.")
    }

    var dailyLifeHelpersTitle: String {
        self.localized("dailyLifeHelpersTitle", fallback: "Daily-life helpers enabled by default")
    }

    var memoryTitle: String {
        self.localized("memoryTitle", fallback: "Long-term memory, when you want it")
    }

    var memorySubtitle: String {
        self.localized("memorySubtitle", fallback: "Maumau keeps long-term memory private for each user while also sharing approved context with the groups they belong to. Open Users later for details on people, groups, and sharing.")
    }

    var openFullSkillsTitle: String {
        self.localized("openFullSkillsTitle", fallback: "Open the full Skills list")
    }

    var openFullSkillsSubtitle: String {
        self.localized("openFullSkillsSubtitle", fallback: "See everything that is available, including the bundled Clawd Cursor setup guide, Cursor-compatible bundles, and extra tools you can turn on or off later.")
    }

    var openFullSkillsButtonTitle: String {
        self.localized("openFullSkillsButtonTitle", fallback: "Open Settings → Skills")
    }

    var includedSkillsTitle: String {
        self.localized("includedSkillsTitle", fallback: "Included skills on this Mac")
    }

    var checkingIncludedSkillsTitle: String {
        self.localized("checkingIncludedSkillsTitle", fallback: "Checking which included skills are available here…")
    }

    var readyTitle: String {
        self.localized("readyTitle", fallback: "All set")
    }

    var readyHeadline: String {
        self.localized("readyHeadline", fallback: "Maumau now has a home, a brain, and a place people can reach it.")
    }

    var readyBody: String {
        self.localized("readyBody", fallback: "You can keep things simple for now and fine-tune the rest later in Settings.")
    }

    var managedBrowserSignInTitle: String {
        self.localized("managedBrowserSignInTitle", fallback: "Sign in once to Maumau's browser")
    }

    var managedBrowserSignInSubtitle: String {
        self.localized("managedBrowserSignInSubtitle", fallback: "This opens Maumau's separate browser profile on this Mac. Sign in there to any sites you want browser automation to reuse later. You can close it afterward.")
    }

    var managedBrowserSignInButtonTitle: String {
        self.localized("managedBrowserSignInButtonTitle", fallback: "Open Maumau browser")
    }

    var managedBrowserSignInOpeningButtonTitle: String {
        self.localized("managedBrowserSignInOpeningButtonTitle", fallback: "Opening…")
    }

    var managedBrowserSignInOpenedStatus: String {
        self.localized("managedBrowserSignInOpenedStatus", fallback: "Maumau's browser profile is open. Sign in there once, and Maumau can reopen that same profile later.")
    }

    var managedBrowserSignInFailedStatusPrefix: String {
        self.localized("managedBrowserSignInFailedStatusPrefix", fallback: "Couldn’t open Maumau's browser profile yet.")
    }

    var configureLaterTitle: String {
        self.localized("configureLaterTitle", fallback: "Configure later")
    }

    var configureLaterSubtitle: String {
        self.localized("configureLaterSubtitle", fallback: "Pick Local or Remote in Settings → General whenever you’re ready.")
    }

    var menuBarPanelTitle: String {
        self.localized("menuBarPanelTitle", fallback: "Open the menu bar panel")
    }

    var menuBarPanelSubtitle: String {
        self.localized("menuBarPanelSubtitle", fallback: "Click the Maumau menu bar icon for quick chat and status.")
    }

    var voiceWakeTitle: String {
        self.localized("voiceWakeTitle", fallback: "Try Voice Wake")
    }

    var voiceWakeSubtitle: String {
        self.localized("voiceWakeSubtitle", fallback: "Enable Voice Wake in Settings for hands-free commands with a live transcript overlay.")
    }

    var panelCanvasTitle: String {
        self.localized("panelCanvasTitle", fallback: "Use the panel + Canvas")
    }

    var panelCanvasSubtitle: String {
        self.localized("panelCanvasSubtitle", fallback: "Open the menu bar panel for quick chat; the agent can show previews and richer visuals in Canvas.")
    }

    var launchAtLoginTitle: String {
        self.localized("launchAtLoginTitle", fallback: "Launch at login")
    }

    func localCliReadyLabel(location: String) -> String {
        self.localized("localCliReadyLabel", parameters: ["location": location], fallback: "Local CLI ready at {location}")
    }

    func conversationAutomationVapiAutoBridgeSubtitle(bridgeURL: String) -> String {
        self.localized("conversationAutomationVapiAutoBridgeSubtitle", parameters: ["bridgeURL": bridgeURL], fallback: "Maumau will publish {bridgeURL} through Tailscale Funnel so Vapi can reach the live tool-calls bridge without changing your normal private-access path.")
    }

    func conversationAutomationVapiBridgeSubtitle(bridgeURL: String) -> String {
        self.localized("conversationAutomationVapiBridgeSubtitle", parameters: ["bridgeURL": bridgeURL], fallback: "Vapi will call {bridgeURL} so Maumau can generate each spoken reply with tools and memory.")
    }

    func conversationAutomationVapiSavedSelectionLabel(id: String) -> String {
        self.localized("conversationAutomationVapiSavedSelectionLabel", parameters: ["id": id], fallback: "Saved selection ({id})")
    }

    func conversationAutomationVapiRefreshReady(assistantCount: Int, phoneNumberCount: Int) -> String {
        self.localized("conversationAutomationVapiRefreshReady", parameters: ["assistantCount": String(assistantCount), "phoneNumberCount": String(phoneNumberCount)], fallback: "Connected to Vapi. Found {assistantCount} assistant(s) and {phoneNumberCount} phone number(s).")
    }

    func conversationAutomationVapiRefreshFailed(detail: String) -> String {
        self.localized("conversationAutomationVapiRefreshFailed", parameters: ["detail": detail], fallback: "Could not load your Vapi assistants or phone numbers. {detail}")
    }

    func welcomeIntro(mode: AppState.ConnectionMode) -> String {
        switch mode {
        case .remote:
            self.localized("welcomeIntro.remote", fallback: "Setup is simpler than it looks: set up the Gateway, then pick a Channel for messages.")
        default:
            self.localized("welcomeIntro.local", fallback: "Setup is simpler than it looks: choose the brain, pick a Channel, then turn on any Mac access or extras you want.")
        }
    }

    func localSetupPreparationTitle(isBusy: Bool) -> String {
        if isBusy {
            return self.localized("localSetupPreparationTitle.busy", fallback: "Getting Maumau’s home ready before the brain step starts…")
        }
        return self.localized("localSetupPreparationTitle.idle", fallback: "This Mac still needs a little setup first")
    }

    func localSetupPreparationMessage(cliStatus: String?, installingCLI: Bool, isCheckingLocalGatewaySetup: Bool) -> String {
        if let cliStatus, !cliStatus.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return cliStatus
        }
        if installingCLI {
            return self.localized("localSetupPreparationMessage.installingCLI", fallback: "Maumau is installing the helper pieces it needs on this Mac.")
        }
        if isCheckingLocalGatewaySetup {
            return self.localized("localSetupPreparationMessage.checkingLocalGateway", fallback: "Maumau is checking whether this Mac already has what it needs.")
        }
        return self.localized("localSetupPreparationMessage.finishLocal", fallback: "Finish getting this Mac ready first. Once that is done, the brain setup continues automatically.")
    }

    func conversationAutomationWebhookTailscaleSubtitle(expectedURL: String?) -> String {
        if let expectedURL, !expectedURL.isEmpty {
            return self.localized("conversationAutomationWebhookTailscaleSubtitle.expectedURL", parameters: ["expectedURL": expectedURL], fallback: "Maumau will publish {expectedURL} and you should use that same URL in your phone provider's webhook setting.")
        }
        return self.localized("conversationAutomationWebhookTailscaleSubtitle.default", fallback: "Maumau will publish /voice/webhook over Tailscale Funnel and you should use that same URL in your phone provider's webhook setting.")
    }

    func badgeTitle(_ badge: OnboardingStepBadge, compact: Bool = false) -> String {
        let variant = compact ? "compact" : "default"
        let fallback: String
        switch (badge, compact) {
        case (.required, _):
            fallback = "Required"
        case (.optional, _):
            fallback = "Optional"
        case (.needsPrep, false):
            fallback = "Needs prep elsewhere"
        case (.needsPrep, true):
            fallback = "Needs prep"
        }
        return self.localized("badges.\(badge.rawValue).\(variant)", fallback: fallback)
    }

    func stageTitle(_ stage: OnboardingHeaderStage) -> String {
        let fallback: String
        switch stage {
        case .home:
            fallback = "Gateway"
        case .brain:
            fallback = "Brain"
        case .chat:
            fallback = "Channel"
        case .access:
            fallback = "Private access"
        case .permissions:
            fallback = "Permissions"
        case .automation:
            fallback = "Voice"
        case .tools:
            fallback = "Tools"
        }
        return self.localized("stages.\(stage.rawValue).title", fallback: fallback)
    }

    func stageHeaderSubtitle(_ stage: OnboardingHeaderStage) -> String {
        let fallback: String
        switch stage {
        case .home:
            fallback = "Maumau's home"
        case .brain:
            fallback = "AI service"
        case .chat:
            fallback = "Where people text it"
        case .access:
            fallback = "Private driveway"
        case .permissions:
            fallback = "What Maumau can do on this Mac"
        case .automation:
            fallback = "Live phone setup"
        case .tools:
            fallback = "Included tools"
        }
        return self.localized("stages.\(stage.rawValue).headerSubtitle", fallback: fallback)
    }

    func stageExplainerTitle(_ stage: OnboardingHeaderStage) -> String {
        let fallback = stage == .permissions ? "Mac access" : self.stageTitle(stage)
        return self.localized("stages.\(stage.rawValue).explainerTitle", fallback: fallback)
    }

    func stageExplainerBody(_ stage: OnboardingHeaderStage) -> String {
        let fallback: String
        switch stage {
        case .home:
            fallback = "Gateway means Maumau's home. It keeps its tools here and does its work from here."
        case .brain:
            fallback = "Brain means the AI service. You are choosing what does the thinking and writing."
        case .chat:
            fallback = "Channel means where people can reach Maumau. Think of it like giving it a phone line or inbox."
        case .access:
            fallback = "This gives Maumau's home a private driveway. It lets your phone, laptop, or browser reach Maumau privately without putting it on the public internet."
        case .permissions:
            fallback = "This is where you decide what Maumau can do on this Mac, like work with apps or see the screen."
        case .automation:
            fallback = "This optional step finishes the provider keys and public callback route that the built-in voice-call plugin needs before real phone calls can work."
        case .tools:
            fallback = "This is a quick look at the main tools Maumau already has, so you know what comes with it."
        }
        return self.localized("stages.\(stage.rawValue).explainerBody", fallback: fallback)
    }

    func includedToolHighlights() -> [OnboardingToolHighlight] {
        self.highlights("includedToolHighlights", fallback: [
            OnboardingToolHighlight(title: "Files and folders", subtitle: "Read, organize, and change things on this Mac when you allow it.", systemImage: "folder"),
            OnboardingToolHighlight(title: "Apps and screen context", subtitle: "Work with Mac apps and screenshots when the matching permissions are on.", systemImage: "macwindow.on.rectangle"),
            OnboardingToolHighlight(title: "Browser control", subtitle: "Open websites, follow links, and work through everyday web tasks in a browser.", systemImage: "globe"),
            OnboardingToolHighlight(title: "Commands", subtitle: "Run Terminal commands when you approve them or allow them.", systemImage: "terminal"),
            OnboardingToolHighlight(title: "Messages and connected services", subtitle: "Reply in the Channel you picked and use any extra services you connect later.", systemImage: "bubble.left.and.bubble.right")
        ])
    }

    func includedHelperHighlights() -> [OnboardingToolHighlight] {
        self.highlights("includedHelperHighlights", fallback: [
            OnboardingToolHighlight(title: "Clawd Cursor", subtitle: "Fresh local setup installs the upstream clawdcursor helper for native desktop control across apps, then Maumau keeps checking readiness and permissions truthfully.", systemImage: "desktopcomputer"),
            OnboardingToolHighlight(title: "Maumau Guardrails", subtitle: "Keeps prompts, tool calls, and outgoing replies inside your policy once you connect a guardrails sidecar.", systemImage: "checkmark.shield"),
            OnboardingToolHighlight(title: "Lobster workflows", subtitle: "Automates repeatable, multi-step tasks with resumable approvals instead of making the agent improvise every step.", systemImage: "point.3.connected.trianglepath.dotted"),
            OnboardingToolHighlight(title: "Structured AI tasks", subtitle: "Uses LLM Task for clean JSON output, which helps with forms, extraction, handoffs, and workflow steps.", systemImage: "curlybraces.square")
        ])
    }

    func gatewayStatusWarning(_ error: String) -> String {
        self.localized("settingsHandoff.gatewayStatusWarning", parameters: ["error": error], fallback: "Gateway status warning: {error}")
    }

    func settingsHandoffMessage(forChannelTitle channelTitle: String, channelID: String, alreadyConnected: Bool) -> String {
        let key: String
        let fallback: String
        if channelID == "whatsapp" {
            key = alreadyConnected ? "settingsHandoff.messages.whatsappConnected" : "settingsHandoff.messages.whatsappDisconnected"
            fallback = alreadyConnected
                ? "WhatsApp is ready. Maumau is already using the recommended defaults, and you can change advanced routing or access rules later in full Settings → Channels."
                : "If you want to change approved numbers, routing, or other advanced WhatsApp behavior later, use full Settings → Channels. Maumau keeps the recommended defaults unless you change them."
        } else {
            key = alreadyConnected ? "settingsHandoff.messages.connectedGeneric" : "settingsHandoff.messages.disconnectedGeneric"
            fallback = alreadyConnected
                ? "{channelTitle} is already connected. Maumau is using the recommended defaults, and you can review or override them later in full Settings → Channels."
                : "Onboarding is only showing the key setup details for {channelTitle}. When you are ready, open full Settings → Channels to paste the token or finish the account/device connection. Maumau will use the recommended defaults automatically for the rest."
        }
        return self.localized(key, parameters: ["channelTitle": channelTitle], fallback: fallback)
    }

    func settingsHandoffButtonTitle(forChannelTitle channelTitle: String, channelID: String, alreadyConnected: Bool) -> String {
        if alreadyConnected {
            return self.localized("settingsHandoff.buttons.connectedReview", parameters: ["channelTitle": channelTitle], fallback: "Review {channelTitle} in Settings")
        }
        let key: String
        let fallback: String
        switch channelID {
        case "discord":
            key = "settingsHandoff.buttons.discord"
            fallback = "Open Settings for Discord bot"
        case "googlechat":
            key = "settingsHandoff.buttons.googlechat"
            fallback = "Open Settings for Google Chat"
        case "imessage":
            key = "settingsHandoff.buttons.imessage"
            fallback = "Open Settings for Messages"
        case "line":
            key = "settingsHandoff.buttons.line"
            fallback = "Open Settings for LINE bot"
        case "slack":
            key = "settingsHandoff.buttons.slack"
            fallback = "Open Settings for Slack app"
        case "telegram":
            key = "settingsHandoff.buttons.telegram"
            fallback = "Open Settings for Telegram bot"
        case "whatsapp":
            key = "settingsHandoff.buttons.whatsapp"
            fallback = "Open full WhatsApp settings"
        default:
            key = "settingsHandoff.buttons.default"
            fallback = "Open Settings → Channels"
        }
        return self.localized(key, fallback: fallback)
    }

    func wizardExplanation(_ kind: OnboardingWizardExplanationKind) -> OnboardingWizardExplanationCopy {
        let base = "wizardExplanations.\(kind.rawValue)"
        let fallback: OnboardingWizardExplanationCopy
        switch kind {
        case .setupMode:
            fallback = .init(
                title: "Simple or custom",
                bodyText: "This is Maumau asking how much of the setup work you want it to handle for you.")
        case .existingSetup:
            fallback = .init(
                title: "Keep or reset",
                bodyText: "Maumau found an older home setup and wants to know whether to reuse it or start fresh.")
        case .pickBrain:
            fallback = .init(
                title: "Pick the brain",
                bodyText: "You are choosing which AI service or model does the thinking for Maumau.")
        case .liveSearch:
            fallback = .init(
                title: "Add live search",
                bodyText: "This optional step lets Maumau look up current information on the web when it needs it.")
        case .connectBrain:
            fallback = .init(
                title: "Connect the brain",
                bodyText: "This is the sign-in step so Maumau can actually talk to the AI service you picked.")
        case .workspace:
            fallback = .init(
                title: "Pick Maumau’s room",
                bodyText: "This is the folder where Maumau keeps notes, reads instructions, and makes files.")
        case .preparingSetup:
            fallback = .init(
                title: "A quick setup moment",
                bodyText: "Maumau is just getting the next brain setup step ready for you.")
        }
        return OnboardingWizardExplanationCopy(
            title: self.localized("\(base).title", fallback: fallback.title),
            bodyText: self.localized("\(base).bodyText", fallback: fallback.bodyText))
    }
}
