import AppKit
import Observation
import MaumauChatUI
import MaumauDiscovery
import MaumauIPC
import SwiftUI

enum RemoteOnboardingProbeState: Equatable {
    case idle
    case checking
    case ok(RemoteGatewayProbeSuccess)
    case failed(String)
}

enum ConversationAutomationSttProvider: String, CaseIterable, Sendable {
    case deepgramRealtime = "deepgram-realtime"
    case openaiRealtime = "openai-realtime"

    static func loadSelection(from rawValue: String?) -> Self? {
        guard let rawValue else { return nil }
        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !trimmed.isEmpty else { return nil }
        switch trimmed {
        case Self.deepgramRealtime.rawValue, "deepgram":
            return .deepgramRealtime
        case Self.openaiRealtime.rawValue, "openai":
            return .openaiRealtime
        default:
            return nil
        }
    }
}

enum ConversationAutomationTelephonyProvider: String, CaseIterable, Sendable {
    case twilio
    case telnyx
    case plivo

    static func loadSelection(from rawValue: String?) -> Self? {
        guard let rawValue else { return nil }
        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !trimmed.isEmpty else { return nil }
        return Self(rawValue: trimmed)
    }
}

enum ConversationAutomationVoiceMode: String, CaseIterable, Sendable {
    case simpleVapi = "vapi"
    case advancedSelfHosted = "self-hosted"

    static func loadSelection(from rawValue: String?) -> Self? {
        guard let rawValue else { return nil }
        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !trimmed.isEmpty else { return nil }
        return Self(rawValue: trimmed)
    }
}

enum ConversationAutomationVapiBridgeMode: String, CaseIterable, Sendable {
    case autoBridge = "auto"
    case manualPublicURL = "manual-public-url"

    static func loadSelection(from rawValue: String?) -> Self? {
        guard let rawValue else { return nil }
        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !trimmed.isEmpty else { return nil }
        return Self(rawValue: trimmed)
    }

    static func resolveSelection(
        configuredMode: Self?,
        configuredBridgeURL: String,
        autoBridgeURL: String?)
        -> Self
    {
        if let configuredMode {
            return configuredMode
        }

        let trimmedBridgeURL = configuredBridgeURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedBridgeURL.isEmpty else {
            return .autoBridge
        }
        if let autoBridgeURL,
           trimmedBridgeURL.caseInsensitiveCompare(autoBridgeURL) == .orderedSame
        {
            return .autoBridge
        }
        if let url = URL(string: trimmedBridgeURL),
           let host = url.host?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        {
            let port = url.port ?? 443
            if host.hasSuffix(".ts.net"),
               [443, OnboardingView.conversationAutomationVapiAutoBridgeHTTPSPort].contains(port),
               url.path == OnboardingView.conversationAutomationVapiBridgePath
            {
                return .autoBridge
            }
        }
        return .manualPublicURL
    }
}

enum ConversationAutomationWebhookMode: String, CaseIterable, Sendable {
    case tailscaleFunnel = "tailscale-funnel"
    case publicUrl = "public-url"

    static func loadSelection(
        publicUrl: String?,
        tunnelProvider: String?,
        tailscaleMode: String?)
        -> Self
    {
        let trimmedPublicUrl = publicUrl?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !trimmedPublicUrl.isEmpty {
            return .publicUrl
        }

        let normalizedTunnelProvider =
            tunnelProvider?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        if normalizedTunnelProvider == "tailscale-funnel" {
            return .tailscaleFunnel
        }

        let normalizedTailscaleMode =
            tailscaleMode?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        if normalizedTailscaleMode == "funnel" {
            return .tailscaleFunnel
        }

        return .tailscaleFunnel
    }
}

struct ConversationAutomationVoiceDraftUpdate {
    let path: ConfigPath
    let value: Any?
}

@MainActor
final class OnboardingController: NSObject, NSWindowDelegate {
    static let shared = OnboardingController()
    private var window: NSWindow?
    private var requiresCompletionToContinue = false
    private var isHandlingRequiredDismissal = false

    override private init() {
        super.init()
    }

    var isPresented: Bool {
        self.window?.isVisible == true
    }

    private func activateAndFocus(_ window: NSWindow) {
        NSRunningApplication.current.activate(options: [.activateAllWindows])
        window.orderFrontRegardless()
        window.makeKeyAndOrderFront(nil)
        window.makeMain()
        NSApp.activate(ignoringOtherApps: true)
    }

    private func present(_ window: NSWindow, recenter: Bool) {
        if recenter {
            window.center()
        }
        let originalLevel = window.level
        window.level = .floating
        window.collectionBehavior.formUnion([.moveToActiveSpace, .fullScreenAuxiliary])
        DockIconManager.shared.temporarilyShowDock()
        self.activateAndFocus(window)
        // Menu bar launches can report the window as visible before AppKit actually makes it key.
        // Retry once after the activation handoff so onboarding does not end up on a hidden Space.
        Task { @MainActor [weak self, weak window] in
            try? await Task.sleep(for: .milliseconds(150))
            guard let self, let window, window.isVisible else { return }
            if !window.isKeyWindow || !window.isMainWindow {
                self.activateAndFocus(window)
            }
            window.level = originalLevel
        }
    }

    static func shouldTerminateAfterClosingOnboarding(requiresCompletion: Bool, onboardingSeen: Bool) -> Bool {
        requiresCompletion && !onboardingSeen
    }

    func show(requiresCompletion: Bool = false) {
        guard !self.isHandlingRequiredDismissal else { return }
        self.requiresCompletionToContinue = self.requiresCompletionToContinue || requiresCompletion
        if ProcessInfo.processInfo.isNixMode {
            // Nix mode is fully declarative; onboarding would suggest interactive setup that doesn't apply.
            UserDefaults.standard.set(true, forKey: "maumau.onboardingSeen")
            UserDefaults.standard.set(currentOnboardingVersion, forKey: onboardingVersionKey)
            AppStateStore.shared.onboardingSeen = true
            self.requiresCompletionToContinue = false
            return
        }
        if let window {
            if window.isVisible {
                self.present(window, recenter: false)
                return
            }

            // If the onboarding window was closed outside the controller, drop the stale
            // reference and rebuild it so "show onboarding" always works.
            self.window = nil
        }
        let hosting = NSHostingController(rootView: OnboardingView().environment(TailscaleService.shared))
        let window = NSWindow(contentViewController: hosting)
        window.title = OnboardingStrings(
            language: AppStateStore.shared.effectiveOnboardingLanguage).windowTitle
        window.setContentSize(NSSize(width: OnboardingView.windowWidth, height: OnboardingView.windowHeight))
        window.minSize = NSSize(width: OnboardingView.windowWidth, height: OnboardingView.minimumWindowHeight)
        window.styleMask = [.titled, .closable, .resizable, .fullSizeContentView]
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.isMovableByWindowBackground = true
        window.isReleasedWhenClosed = false
        window.delegate = self
        self.window = window
        self.present(window, recenter: true)
    }

    func close() {
        let window = self.window
        self.window = nil
        self.requiresCompletionToContinue = false
        window?.delegate = nil
        window?.close()
    }

    func restart() {
        self.close()
        self.show()
    }

    private func abortIncompleteOnboardingAndTerminate() async {
        let state = AppStateStore.shared
        await ConnectionModeCoordinator.shared.apply(mode: .unconfigured, paused: state.isPaused)
        _ = await GatewayLaunchAgentManager.set(
            enabled: false,
            bundlePath: Bundle.main.bundleURL.path,
            port: GatewayEnvironment.gatewayPort())
        NSApp.terminate(nil)
    }

    func windowWillClose(_ notification: Notification) {
        guard let closingWindow = notification.object as? NSWindow else { return }
        if closingWindow === self.window {
            let shouldTerminate = Self.shouldTerminateAfterClosingOnboarding(
                requiresCompletion: self.requiresCompletionToContinue,
                onboardingSeen: AppStateStore.shared.onboardingSeen)
            self.window = nil
            self.requiresCompletionToContinue = false
            guard shouldTerminate, !self.isHandlingRequiredDismissal else { return }
            self.isHandlingRequiredDismissal = true
            Task { @MainActor [weak self] in
                guard let self else { return }
                await self.abortIncompleteOnboardingAndTerminate()
            }
        }
    }
}

struct OnboardingView: View {
    struct SetupStepDefinition: Equatable {
        let stage: OnboardingHeaderStage
        let title: String
        let progressTitle: String
        let pageID: Int
        let bodyText: String
        let badges: [OnboardingStepBadge]
        let preparationNote: String?
        let headerMetaText: String?
    }

    @Environment(\.openSettings) var openSettings
    @State var currentPage = 0
    @State var isRequesting = false
    @State var installingCLI = false
    @State var cliStatus: String?
    @State var copied = false
    @State var monitoringPermissions = false
    @State var monitoringDiscovery = false
    @State var cliInstalled = false
    @State var cliInstallLocation: String?
    @State var workspacePath: String = ""
    @State var workspaceStatus: String?
    @State var workspaceApplying = false
    @State var needsBootstrap = false
    @State var didAutoKickoff = false
    @State var showAdvancedConnection = false
    @State var preferredGatewayID: String?
    @State var remoteProbeState: RemoteOnboardingProbeState = .idle
    @State var remoteAuthIssue: RemoteGatewayAuthIssue?
    @State var suppressRemoteProbeReset = false
    @State var gatewayDiscovery: GatewayDiscoveryModel
    @State var onboardingChatModel: MaumauChatViewModel
    @State var onboardingChannelsStore: ChannelsStore
    @State var onboardingSkillsModel = SkillsSettingsModel()
    @State var onboardingWizard = OnboardingWizardModel()
    @State var didLoadOnboardingSkills = false
    @State var managedBrowserSignInStatus: String?
    @State var managedBrowserSignInLaunching = false
    @State var conversationAutomationPresetEnabled = false
    @State var conversationAutomationTelephonyEnabled = false
    @State var conversationAutomationVoiceMode: ConversationAutomationVoiceMode = .simpleVapi
    @State var conversationAutomationPhoneProvider: ConversationAutomationTelephonyProvider = .twilio
    @State var conversationAutomationSttProvider: ConversationAutomationSttProvider = .deepgramRealtime
    @State var conversationAutomationWebhookMode: ConversationAutomationWebhookMode = .tailscaleFunnel
    @State var conversationAutomationFromNumber = ""
    @State var conversationAutomationTwilioAccountSID = ""
    @State var conversationAutomationTwilioAuthToken = ""
    @State var conversationAutomationTelnyxAPIKey = ""
    @State var conversationAutomationTelnyxConnectionID = ""
    @State var conversationAutomationTelnyxPublicKey = ""
    @State var conversationAutomationPlivoAuthID = ""
    @State var conversationAutomationPlivoAuthToken = ""
    @State var conversationAutomationDeepgramAPIKey = ""
    @State var conversationAutomationOpenAIAPIKey = ""
    @State var conversationAutomationElevenLabsAPIKey = ""
    @State var conversationAutomationElevenLabsVoiceID = ""
    @State var conversationAutomationPublicWebhookURL = ""
    @State var conversationAutomationVapiAPIKey = ""
    @State var conversationAutomationVapiAssistantID = ""
    @State var conversationAutomationVapiPhoneNumberID = ""
    @State var conversationAutomationVapiPreferredLanguage: OnboardingLanguage = .fallback
    @State var conversationAutomationVapiBridgeMode: ConversationAutomationVapiBridgeMode = .autoBridge
    @State var conversationAutomationVapiManualBridgeURL = ""
    @State var conversationAutomationVapiBridgeAuthToken = ""
    @State var conversationAutomationVapiAssistants: [ConversationAutomationVapiAssistant] = []
    @State var conversationAutomationVapiPhoneNumbers: [ConversationAutomationVapiPhoneNumber] = []
    @State var conversationAutomationVapiRefreshing = false
    @State var conversationAutomationVapiStatus: String?
    @State var conversationAutomationVapiStatusIsError = false
    @State var conversationAutomationAllowFrom = ""
    @State var didSeedConversationAutomationPreset = false
    @State var onboardingFinishing = false
    @State var onboardingFinishStatus: String?
    @State var onboardingFinishStatusIsError = false
    @State var localGatewayProbe: LocalGatewayProbe?
    @State var localRuntimeAvailable: Bool?
    @State var didAutoInstallCLI = false
    @State var didAutoInstallDefaultSkills = false
    @Bindable var state: AppState
    var permissionMonitor: PermissionMonitor
    let tailscaleService = TailscaleService.shared

    static let windowWidth: CGFloat = 630
    static let windowHeight: CGFloat = 752 // ~+10% to fit full onboarding content
    static let headerHeight: CGFloat = 88
    static let navigationHeight: CGFloat = 60
    static let minimumContentHeight: CGFloat = 300
    static let minimumWindowHeight: CGFloat =
        Self.headerHeight + Self.navigationHeight + Self.minimumContentHeight
    nonisolated static let conversationAutomationVoiceWebhookPath = "/voice/webhook"
    nonisolated static let conversationAutomationVapiBridgePath = "/plugins/voice-call/vapi"
    nonisolated static let conversationAutomationVapiAutoBridgeHTTPSPort = 8443

    @State var pageWidth: CGFloat = Self.windowWidth
    let languagePageIndex = -1
    let connectionPageIndex = 1
    let cliPageIndex = 6
    let workspacePageIndex = 7
    let wizardPageIndex = 3
    let onboardingChatPageIndex = 8
    let channelsSetupPageIndex = 10
    let conversationAutomationPageIndex = 11
    let skillsSetupPageIndex = 13
    let privateAccessPageIndex = 12

    let permissionsPageIndex = 5
    static func pageOrder(
        for mode: AppState.ConnectionMode,
        showOnboardingChat: Bool,
        showConnectionStep: Bool = true,
        showIncludedToolsStep: Bool = false) -> [Int]
    {
        switch mode {
        case .remote:
            // Remote onboarding should stop after gateway connection + first channel.
            // Remote brain/provider setup belongs on the remote host itself.
            return [0, 1, 10, 9]
        case .unconfigured:
            return [0, 1, 9]
        case .local:
            // Local setup still performs CLI/workspace prep automatically, then helps people
            // turn on the Mac access and extras that matter most.
            var pages = [0]
            if showConnectionStep {
                pages.append(1)
            }
            pages.append(contentsOf: [3, 10, 12, 5, 11])
            if showIncludedToolsStep {
                pages.append(13)
            }
            pages.append(9)
            return pages
        }
    }

    var showOnboardingChat: Bool {
        self.state.connectionMode == .local && self.needsBootstrap
    }

    var pageOrder: [Int] {
        [self.languagePageIndex]
            + Self.pageOrder(
                for: self.state.connectionMode,
                showOnboardingChat: self.showOnboardingChat,
                showConnectionStep: self.shouldShowConnectionSetupPage)
    }

    var pageCount: Int {
        self.pageOrder.count
    }

    var setupStepDefinitions: [SetupStepDefinition] {
        switch self.state.connectionMode {
        case .remote:
            [
                SetupStepDefinition(
                    stage: .home,
                    title: self.strings.connectionTitle,
                    progressTitle: self.strings.connectionTitle,
                    pageID: self.connectionPageIndex,
                    bodyText: self.strings.stageExplainerBody(.home),
                    badges: [.required],
                    preparationNote: nil,
                    headerMetaText: self.headerMetaText(for: [.required])),
                SetupStepDefinition(
                    stage: .chat,
                    title: self.strings.channelsTitle,
                    progressTitle: self.strings.channelsTitle,
                    pageID: self.channelsSetupPageIndex,
                    bodyText: self.strings.stageExplainerBody(.chat),
                    badges: [.optional, .needsPrep],
                    preparationNote: self.preparationNote(for: self.channelsSetupPageIndex),
                    headerMetaText: self.headerMetaText(for: [.optional, .needsPrep])),
            ]
        case .unconfigured, .local:
            [
                SetupStepDefinition(
                    stage: .home,
                    title: self.strings.connectionTitle,
                    progressTitle: self.strings.connectionTitle,
                    pageID: self.connectionPageIndex,
                    bodyText: self.strings.stageExplainerBody(.home),
                    badges: [.required],
                    preparationNote: nil,
                    headerMetaText: self.headerMetaText(for: [.required])),
                SetupStepDefinition(
                    stage: .brain,
                    title: self.strings.wizardTitle,
                    progressTitle: self.strings.wizardTitle,
                    pageID: self.wizardPageIndex,
                    bodyText: self.strings.stageExplainerBody(.brain),
                    badges: [.required, .needsPrep],
                    preparationNote: self.preparationNote(for: self.wizardPageIndex),
                    headerMetaText: self.headerMetaText(for: [.required, .needsPrep])),
                SetupStepDefinition(
                    stage: .chat,
                    title: self.strings.channelsTitle,
                    progressTitle: self.strings.channelsTitle,
                    pageID: self.channelsSetupPageIndex,
                    bodyText: self.strings.stageExplainerBody(.chat),
                    badges: [.optional, .needsPrep],
                    preparationNote: self.preparationNote(for: self.channelsSetupPageIndex),
                    headerMetaText: self.headerMetaText(for: [.optional, .needsPrep])),
                SetupStepDefinition(
                    stage: .access,
                    title: self.strings.privateAccessTitle,
                    progressTitle: self.strings.privateAccessTitle,
                    pageID: self.privateAccessPageIndex,
                    bodyText: self.strings.stageExplainerBody(.access),
                    badges: [.optional, .needsPrep],
                    preparationNote: self.preparationNote(for: self.privateAccessPageIndex),
                    headerMetaText: self.headerMetaText(for: [.optional, .needsPrep])),
                SetupStepDefinition(
                    stage: .permissions,
                    title: self.strings.permissionsTitle,
                    progressTitle: self.strings.permissionsTitle,
                    pageID: self.permissionsPageIndex,
                    bodyText: self.strings.stageExplainerBody(.permissions),
                    badges: [.optional],
                    preparationNote: nil,
                    headerMetaText: self.headerMetaText(for: [.optional])),
                SetupStepDefinition(
                    stage: .automation,
                    title: self.strings.conversationAutomationTitle,
                    progressTitle: self.strings.conversationAutomationTitle,
                    pageID: self.conversationAutomationPageIndex,
                    bodyText: self.strings.stageExplainerBody(.automation),
                    badges: [.optional, .needsPrep],
                    preparationNote: self.preparationNote(for: self.conversationAutomationPageIndex),
                    headerMetaText: self.headerMetaText(for: [.optional, .needsPrep])),
                SetupStepDefinition(
                    stage: .tools,
                    title: self.strings.skillsTitle,
                    progressTitle: self.strings.skillsTitle,
                    pageID: self.skillsSetupPageIndex,
                    bodyText: self.strings.stageExplainerBody(.tools),
                    badges: [.optional],
                    preparationNote: nil,
                    headerMetaText: self.headerMetaText(for: [.optional])),
            ]
        }
    }

    func setupStepDefinition(for pageID: Int) -> SetupStepDefinition? {
        self.setupStepDefinitions.first { $0.pageID == pageID }
    }

    var activePageIndex: Int {
        self.activePageIndex(for: self.currentPage)
    }

    var buttonTitle: String {
        if self.onboardingFinishing {
            return macLocalized("Applying setup changes...", language: self.state.effectiveOnboardingLanguage)
        }
        return self.currentPage == self.pageCount - 1
            ? self.strings.finishButtonTitle
            : self.strings.nextButtonTitle
    }

    var strings: OnboardingStrings {
        OnboardingStrings(language: self.state.effectiveOnboardingLanguage)
    }

    var wizardPageOrderIndex: Int? {
        self.pageOrder.firstIndex(of: self.wizardPageIndex)
    }

    var isWizardBlocking: Bool {
        self.activePageIndex == self.wizardPageIndex && self.onboardingWizard.isBlocking
    }

    var isCLIBlocking: Bool {
        self.state.connectionMode == .local &&
            self.activePageIndex == self.connectionPageIndex &&
            (self.installingCLI || !self.localGatewaySetupAvailable)
    }

    var isWorkspaceBlocking: Bool {
        self.activePageIndex == self.workspacePageIndex && self.state.connectionMode == .local &&
            self.localWorkspaceSafetyMessage != nil
    }

    var isPrivateAccessBlocking: Bool {
        Self.shouldBlockPrivateAccessAdvance(
            mode: self.state.connectionMode,
            activePageIndex: self.activePageIndex,
            privateAccessPageIndex: self.privateAccessPageIndex,
            accessFlow: self.tailscaleService.accessFlow)
    }

    var isConversationAutomationVoiceBlocking: Bool {
        self.activePageIndex == self.conversationAutomationPageIndex &&
            self.conversationAutomationTelephonyEnabled &&
            !self.conversationAutomationVoiceValidationMessages.isEmpty
    }

    var canAdvance: Bool {
        (self.activePageIndex != self.languagePageIndex || self.state.hasSelectedOnboardingLanguage)
            && !self.isWizardBlocking
            && !self.isCLIBlocking
            && !self.isWorkspaceBlocking
            && !self.isPrivateAccessBlocking
            && !self.isConversationAutomationVoiceBlocking
            && !self.onboardingFinishing
    }

    var isCheckingLocalGatewaySetup: Bool {
        !self.cliInstalled &&
            self.localRuntimeAvailable == nil &&
            CommandResolver.gatewayEntrypoint(in: CommandResolver.projectRoot()) != nil
    }

    var localGatewaySetupAvailable: Bool {
        Self.canStartLocalGateway(
            cliInstalled: self.cliInstalled,
            runtimeAvailable: self.localRuntimeAvailable)
    }

    var shouldShowConnectionSetupPage: Bool {
        guard self.state.connectionMode == .local else { return true }
        guard self.localGatewaySetupAvailable else { return true }
        guard let probe = self.localGatewayProbe else { return false }
        return !probe.expected
    }

    var devLinkCommand: String {
        let version = GatewayEnvironment.expectedGatewayVersionString() ?? "latest"
        return "npm install -g maumau@\(version)"
    }

    static func canStartLocalGateway(
        cliInstalled: Bool,
        projectRoot: URL = CommandResolver.projectRoot(),
        runtimeAvailable: Bool? = nil) -> Bool
    {
        if cliInstalled { return true }
        guard CommandResolver.gatewayEntrypoint(in: projectRoot) != nil else { return false }
        return runtimeAvailable ?? false
    }

    static func shouldDefaultToLocalConnectionMode(
        connectionMode: AppState.ConnectionMode,
        onboardingSeen: Bool,
        remoteUrl: String,
        hasSelectedOnboardingLanguage: Bool) -> Bool
    {
        let _ = remoteUrl
        return hasSelectedOnboardingLanguage && connectionMode != .local && !onboardingSeen
    }

    static func initialPageCursor(hasSelectedOnboardingLanguage: Bool, onboardingSeen: Bool) -> Int {
        hasSelectedOnboardingLanguage && onboardingSeen ? 1 : 0
    }

    static func shouldAutoInstallCLI(
        mode: AppState.ConnectionMode,
        activePageIndex: Int,
        connectionPageIndex: Int,
        wizardPageIndex: Int,
        cliInstalled: Bool,
        installingCLI: Bool,
        didAutoInstallCLI: Bool) -> Bool
    {
        mode == .local &&
            (activePageIndex == connectionPageIndex || activePageIndex == wizardPageIndex) &&
            !cliInstalled &&
            !installingCLI &&
            !didAutoInstallCLI
    }

    static let defaultFirstRunSkillKeys = ["nano-pdf", "openai-whisper", "skill-creator", "summarize"]

    static func shouldAutoInstallDefaultSkills(
        mode: AppState.ConnectionMode,
        onboardingSeen: Bool,
        didAutoInstallDefaultSkills: Bool,
        isLoadingSkills: Bool,
        hasSkills: Bool) -> Bool
    {
        mode == .local &&
            !onboardingSeen &&
            !didAutoInstallDefaultSkills &&
            !isLoadingSkills &&
            hasSkills
    }

    static func shouldOfferManagedBrowserSignIn(
        mode: AppState.ConnectionMode,
        browserControlEnabled _: Bool) -> Bool
    {
        mode == .local
    }

    static func shouldWaitForLocalSetupBeforeWizard(
        mode: AppState.ConnectionMode,
        installingCLI: Bool,
        isCheckingLocalGatewaySetup: Bool,
        localGatewaySetupAvailable: Bool) -> Bool
    {
        mode == .local && (installingCLI || isCheckingLocalGatewaySetup || !localGatewaySetupAvailable)
    }

    static func shouldLockForwardNavigation(
        currentPage: Int,
        targetPage: Int,
        canAdvance: Bool,
        requiredSetupPageIndex: Int?,
        wizardPageOrderIndex: Int?,
        wizardComplete: Bool) -> Bool
    {
        let blockedByCurrentStep = !canAdvance && targetPage > currentPage
        let blockedByRequiredSetup = requiredSetupPageIndex != nil &&
            targetPage > (requiredSetupPageIndex ?? 0) &&
            targetPage > currentPage
        let blockedByWizard = wizardPageOrderIndex != nil && !wizardComplete &&
            targetPage > (wizardPageOrderIndex ?? 0)
        return blockedByCurrentStep || blockedByRequiredSetup || blockedByWizard
    }

    static func shouldBlockPrivateAccessAdvance(
        mode: AppState.ConnectionMode,
        activePageIndex: Int,
        privateAccessPageIndex: Int,
        accessFlow: TailscaleService.AccessFlowState) -> Bool
    {
        mode == .local &&
            activePageIndex == privateAccessPageIndex &&
            accessFlow.blocksOnboardingAdvance
    }

    struct LocalGatewayProbe: Equatable {
        let port: Int
        let pid: Int32
        let command: String
        let expected: Bool
    }

    init(
        state: AppState = AppStateStore.shared,
        permissionMonitor: PermissionMonitor = .shared,
        discoveryModel: GatewayDiscoveryModel = GatewayDiscoveryModel(
            localDisplayName: InstanceIdentity.displayName,
            filterLocalGateways: false))
    {
        self.state = state
        self.permissionMonitor = permissionMonitor
        self._gatewayDiscovery = State(initialValue: discoveryModel)
        self._onboardingChannelsStore = State(initialValue: ChannelsStore(deferConfigSaves: true))
        self._onboardingChatModel = State(
            initialValue: MaumauChatViewModel(
                sessionKey: "onboarding",
                transport: MacGatewayChatTransport()))
    }

    func preparationNote(for pageID: Int) -> String? {
        switch pageID {
        case self.wizardPageIndex:
            switch self.state.effectiveOnboardingLanguage {
            case .en:
                return "Needs a provider account, sign-in, or API key from the AI service you choose."
            case .id:
                return "Perlu akun penyedia, login, atau API key dari layanan AI yang Anda pilih."
            }
        case self.channelsSetupPageIndex:
            switch self.state.effectiveOnboardingLanguage {
            case .en:
                return "Needs setup in the chat app you choose, like signing in, connecting a bot, or pairing a bridge."
            case .id:
                return "Perlu pengaturan di aplikasi chat yang Anda pilih, seperti login, menghubungkan bot, atau memasangkan bridge."
            }
        case self.privateAccessPageIndex:
            switch self.state.effectiveOnboardingLanguage {
            case .en:
                return "Needs Tailscale on this Mac now, and on any other phone or laptop later if you want to open Maumau there."
            case .id:
                return "Perlu Tailscale di Mac ini sekarang, dan di ponsel atau laptop lain nanti jika Anda ingin membuka Maumau di sana."
            }
        case self.conversationAutomationPageIndex:
            switch self.state.effectiveOnboardingLanguage {
            case .en:
                return "Needs either Vapi plus an imported Twilio number, or the full self-hosted phone, speech, and callback setup."
            case .id:
                return "Perlu Vapi plus nomor Twilio yang diimpor, atau setup self-hosted lengkap untuk telepon, speech, dan callback."
            }
        default:
            return nil
        }
    }

    private func conversationAutomationAllowFromValues(for rawValue: String) -> [String] {
        rawValue
            .split(whereSeparator: { $0 == "," || $0 == "\n" })
            .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .reduce(into: [String]()) { result, value in
                if !result.contains(where: { $0.caseInsensitiveCompare(value) == .orderedSame }) {
                    result.append(value)
                }
            }
    }

    private var conversationAutomationAllowFromValues: [String] {
        self.conversationAutomationAllowFromValues(for: self.conversationAutomationAllowFrom)
    }

    static func resolveConversationAutomationVoiceMode(
        configuredMode: ConversationAutomationVoiceMode?,
        hasSavedSelfHostedVoiceConfig: Bool) -> ConversationAutomationVoiceMode
    {
        configuredMode ?? (hasSavedSelfHostedVoiceConfig ? .advancedSelfHosted : .simpleVapi)
    }

    static func resolveConversationAutomationVapiPreferredLanguage(
        configuredLanguage: OnboardingLanguage?,
        onboardingLanguage: OnboardingLanguage) -> OnboardingLanguage
    {
        configuredLanguage ?? onboardingLanguage
    }

    private func configRootValue(at path: ConfigPath) -> Any? {
        var current: Any? = self.onboardingChannelsStore.configRoot
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

    private func restoreConfigValueFromRoot(at path: ConfigPath) {
        self.onboardingChannelsStore.updateConfigValue(
            path: path,
            value: self.configRootValue(at: path))
    }

    private var conversationAutomationPhoneAllowFromValues: [String] {
        self.stringArrayValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("allowFrom")])
            .filter { $0.hasPrefix("+") }
    }

    private var conversationAutomationReplyLanguageCode: String {
        self.state.effectiveOnboardingLanguage.replyLanguageID
    }

    private var conversationAutomationSelectedVapiAssistant: ConversationAutomationVapiAssistant? {
        self.conversationAutomationVapiAssistants.first {
            $0.id.caseInsensitiveCompare(self.conversationAutomationVapiAssistantID) == .orderedSame
        }
    }

    private var conversationAutomationSelectedVapiPhoneNumber: ConversationAutomationVapiPhoneNumber? {
        self.conversationAutomationVapiPhoneNumbers.first {
            $0.id.caseInsensitiveCompare(self.conversationAutomationVapiPhoneNumberID) == .orderedSame
        }
    }

    nonisolated static func conversationAutomationVapiAutoBridgeURL(hostname: String) -> String {
        "https://\(hostname):\(Self.conversationAutomationVapiAutoBridgeHTTPSPort)\(Self.conversationAutomationVapiBridgePath)"
    }

    var conversationAutomationExpectedVapiAutoBridgeURL: String? {
        guard let hostname = self.tailscaleService.tailscaleHostname else { return nil }
        return Self.conversationAutomationVapiAutoBridgeURL(hostname: hostname)
    }

    var conversationAutomationResolvedVapiBridgeURL: String? {
        switch self.conversationAutomationVapiBridgeMode {
        case .autoBridge:
            return self.conversationAutomationExpectedVapiAutoBridgeURL
        case .manualPublicURL:
            let trimmed = self.conversationAutomationVapiManualBridgeURL
                .trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        }
    }

    private func resolvedConversationAutomationVapiBridgeAuthToken() -> String {
        let trimmed = self.conversationAutomationVapiBridgeAuthToken
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty {
            return trimmed
        }
        let generated = UUID().uuidString.lowercased()
        self.conversationAutomationVapiBridgeAuthToken = generated
        return generated
    }

    private func restoreConversationAutomationVoiceConfig() {
        self.restoreConversationAutomationVoiceToolExposure()
        let voicePaths: [ConfigPath] = [
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("enabled")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("enabled")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("mode")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("provider")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("fromNumber")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("inboundPolicy")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("allowFrom")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("enabled")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("apiKey")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("assistantId")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("phoneNumberId")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("telephonyProvider")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("preferredLanguage")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("bridgeMode")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("bridgeUrl")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("bridgePath")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("bridgeAuthToken")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("twilio"), .key("accountSid")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("twilio"), .key("authToken")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("telnyx"), .key("apiKey")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("telnyx"), .key("connectionId")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("telnyx"), .key("publicKey")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("plivo"), .key("authId")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("plivo"), .key("authToken")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tailscale"), .key("mode")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tailscale"), .key("path")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tunnel"), .key("provider")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("publicUrl")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming"), .key("enabled")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming"), .key("sttProvider")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming"), .key("languageCode")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming"), .key("openai"), .key("apiKey")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming"), .key("deepgram"), .key("model")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming"), .key("deepgram"), .key("apiKey")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tts"), .key("provider")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tts"), .key("elevenlabs"), .key("modelId")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tts"), .key("elevenlabs"), .key("apiKey")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tts"), .key("elevenlabs"), .key("voiceId")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tts"), .key("elevenlabs"), .key("languageCode")],
        ]
        for path in voicePaths {
            self.restoreConfigValueFromRoot(at: path)
        }
    }

    private func restoreConversationAutomationVoiceToolExposure() {
        let path: ConfigPath = [.key("tools"), .key("alsoAllow")]
        let currentTools = self.stringArrayValue(at: path)
        let rootTools = self.rootStringArrayValue(at: path)
        let shouldKeepVoiceCall = rootTools.contains {
            $0.caseInsensitiveCompare("voice-call") == .orderedSame
        }
        let restoredTools = self.mergeStringValues(
            existing: currentTools,
            additions: ["voice-call"],
            enabled: shouldKeepVoiceCall)
        self.onboardingChannelsStore.updateConfigValue(
            path: path,
            value: restoredTools.isEmpty ? nil : restoredTools)
    }

    private func stringArrayValue(at path: ConfigPath) -> [String] {
        (self.onboardingChannelsStore.configValue(at: path) as? [Any])?
            .compactMap { ($0 as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty } ?? []
    }

    private func stringValue(at path: ConfigPath) -> String {
        ((self.onboardingChannelsStore.configValue(at: path) as? String) ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func rootStringArrayValue(at path: ConfigPath) -> [String] {
        (self.configRootValue(at: path) as? [Any])?
            .compactMap { ($0 as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty } ?? []
    }

    private func rootStringValue(at path: ConfigPath) -> String {
        ((self.configRootValue(at: path) as? String) ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func mergeStringValues(
        existing: [String],
        additions: [String],
        enabled: Bool) -> [String]
    {
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

    func prepareConversationAutomationPage() async {
        await self.tailscaleService.checkTailscaleStatus()
        await self.seedConversationAutomationPresetFromConfigIfNeeded()
        await self.refreshConversationAutomationVapiSelectionsIfNeeded()
    }

    func seedConversationAutomationPresetFromConfigIfNeeded() async {
        guard !self.didSeedConversationAutomationPreset else { return }
        if !self.onboardingChannelsStore.configLoaded {
            await self.onboardingChannelsStore.loadConfig()
        }

        let automationEnabled =
            (self.onboardingChannelsStore.configValue(
                at: [.key("plugins"), .key("entries"), .key("automation-runner"), .key("enabled")]) as? Bool)
                ?? false
        let automationConfigEnabled =
            (self.onboardingChannelsStore.configValue(
                at: [.key("plugins"), .key("entries"), .key("automation-runner"), .key("config"), .key("enabled")]) as? Bool)
                ?? automationEnabled
        let allowFrom = self.stringArrayValue(
            at: [.key("plugins"), .key("entries"), .key("automation-runner"), .key("config"), .key("accessPolicy"), .key("allowFrom")])
        let voiceCallEnabled =
            (self.onboardingChannelsStore.configValue(
                at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("enabled")]) as? Bool)
                ?? false
        let voiceCallConfigEnabled =
            (self.onboardingChannelsStore.configValue(
                at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("enabled")]) as? Bool)
                ?? voiceCallEnabled
        let configuredVoiceMode = ConversationAutomationVoiceMode.loadSelection(
            from: self.configRootValue(
                at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("mode")]) as? String)
        let voiceCallProvider =
            (self.onboardingChannelsStore.configValue(
                at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("provider")]) as? String)?
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
        let voiceCallTtsProvider =
            (self.onboardingChannelsStore.configValue(
                at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tts"), .key("provider")]) as? String)?
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
        let elevenLabsModelId =
            (self.onboardingChannelsStore.configValue(
                at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tts"), .key("elevenlabs"), .key("modelId")]) as? String)?
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
        let configuredPublicWebhookURL = self.stringValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("publicUrl")])
        let configuredTunnelProvider = self.stringValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tunnel"), .key("provider")])
        let configuredTailscaleMode = self.stringValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tailscale"), .key("mode")])
        let configuredSttProvider = ConversationAutomationSttProvider.loadSelection(
            from: self.onboardingChannelsStore.configValue(
                at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming"), .key("sttProvider")]) as? String)
        let configuredPhoneProvider = ConversationAutomationTelephonyProvider.loadSelection(from: voiceCallProvider)
        let seededSttProvider = configuredSttProvider ?? .deepgramRealtime
        let configuredVapiEnabled =
            (self.onboardingChannelsStore.configValue(
                at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("enabled")]) as? Bool)
                ?? true
        let configuredVapiBridgeMode = ConversationAutomationVapiBridgeMode.loadSelection(
            from: self.configRootValue(
                at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("bridgeMode")]) as? String)
        let configuredVapiBridgeURL = self.stringValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("bridgeUrl")])
        let advancedDefaultsPrepared =
            voiceCallEnabled &&
            voiceCallConfigEnabled &&
            configuredPhoneProvider != nil &&
            voiceCallTtsProvider == "elevenlabs" &&
            elevenLabsModelId == "eleven_multilingual_v2" &&
            configuredSttProvider != nil
        let vapiDefaultsPrepared =
            voiceCallEnabled &&
            voiceCallConfigEnabled &&
            configuredVoiceMode == .simpleVapi &&
            configuredVapiEnabled
        let telephonyDefaultsPrepared = vapiDefaultsPrepared || advancedDefaultsPrepared
        let hasSavedSelfHostedVoiceConfig =
            configuredPhoneProvider != nil ||
            !self.rootStringValue(
                at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("twilio"), .key("accountSid")]).isEmpty ||
            !self.rootStringValue(
                at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("twilio"), .key("authToken")]).isEmpty ||
            !self.rootStringValue(
                at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("telnyx"), .key("apiKey")]).isEmpty ||
            !self.rootStringValue(
                at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("plivo"), .key("authId")]).isEmpty ||
            self.configRootValue(
                at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming")]) != nil ||
            self.configRootValue(
                at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tts")]) != nil
        let seededVoiceMode = Self.resolveConversationAutomationVoiceMode(
            configuredMode: configuredVoiceMode,
            hasSavedSelfHostedVoiceConfig: hasSavedSelfHostedVoiceConfig)

        self.conversationAutomationPresetEnabled = automationEnabled && automationConfigEnabled
        self.conversationAutomationTelephonyEnabled = telephonyDefaultsPrepared
        self.conversationAutomationVoiceMode = seededVoiceMode
        self.conversationAutomationPhoneProvider = configuredPhoneProvider ?? .twilio
        self.conversationAutomationSttProvider = seededSttProvider
        self.conversationAutomationWebhookMode = ConversationAutomationWebhookMode.loadSelection(
            publicUrl: configuredPublicWebhookURL,
            tunnelProvider: configuredTunnelProvider,
            tailscaleMode: configuredTailscaleMode)
        self.conversationAutomationFromNumber = self.stringValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("fromNumber")])
        self.conversationAutomationTwilioAccountSID = self.stringValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("twilio"), .key("accountSid")])
        self.conversationAutomationTwilioAuthToken = self.stringValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("twilio"), .key("authToken")])
        self.conversationAutomationTelnyxAPIKey = self.stringValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("telnyx"), .key("apiKey")])
        self.conversationAutomationTelnyxConnectionID = self.stringValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("telnyx"), .key("connectionId")])
        self.conversationAutomationTelnyxPublicKey = self.stringValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("telnyx"), .key("publicKey")])
        self.conversationAutomationPlivoAuthID = self.stringValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("plivo"), .key("authId")])
        self.conversationAutomationPlivoAuthToken = self.stringValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("plivo"), .key("authToken")])
        self.conversationAutomationDeepgramAPIKey = self.stringValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming"), .key("deepgram"), .key("apiKey")])
        self.conversationAutomationOpenAIAPIKey = self.stringValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming"), .key("openai"), .key("apiKey")])
        self.conversationAutomationElevenLabsAPIKey = self.stringValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tts"), .key("elevenlabs"), .key("apiKey")])
        self.conversationAutomationElevenLabsVoiceID = self.stringValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tts"), .key("elevenlabs"), .key("voiceId")])
        self.conversationAutomationPublicWebhookURL = configuredPublicWebhookURL
        self.conversationAutomationVapiAPIKey = self.stringValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("apiKey")])
        self.conversationAutomationVapiAssistantID = self.stringValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("assistantId")])
        self.conversationAutomationVapiPhoneNumberID = self.stringValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("phoneNumberId")])
        self.conversationAutomationVapiPreferredLanguage = Self.resolveConversationAutomationVapiPreferredLanguage(
            configuredLanguage: OnboardingLanguage.loadSelection(
                from: self.configRootValue(
                    at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("preferredLanguage")]) as? String),
            onboardingLanguage: self.state.effectiveOnboardingLanguage)
        self.conversationAutomationVapiBridgeMode = ConversationAutomationVapiBridgeMode.resolveSelection(
            configuredMode: configuredVapiBridgeMode,
            configuredBridgeURL: configuredVapiBridgeURL,
            autoBridgeURL: self.conversationAutomationExpectedVapiAutoBridgeURL)
        self.conversationAutomationVapiManualBridgeURL =
            self.conversationAutomationVapiBridgeMode == .manualPublicURL
            ? configuredVapiBridgeURL
            : ""
        self.conversationAutomationVapiBridgeAuthToken = self.stringValue(
            at: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("bridgeAuthToken")])
        self.conversationAutomationAllowFrom = allowFrom.joined(separator: ", ")
        self.didSeedConversationAutomationPreset = true
    }

    func applyConversationAutomationPresetDraft() {
        self.applyConversationAutomationPresetDraft(
            enabled: self.conversationAutomationPresetEnabled,
            telephonyEnabled: self.conversationAutomationTelephonyEnabled,
            sttProvider: self.conversationAutomationSttProvider)
    }

    func applyConversationAutomationVoiceDraft() {
        self.applyConversationAutomationPresetDraft(
            enabled: nil,
            telephonyEnabled: self.conversationAutomationTelephonyEnabled,
            sttProvider: self.conversationAutomationSttProvider)
    }

    func applyConversationAutomationPresetDraft(
        enabled: Bool? = nil,
        telephonyEnabled: Bool? = nil,
        sttProvider: ConversationAutomationSttProvider? = nil)
    {
        if let enabled {
            let allowFrom = self.conversationAutomationAllowFromValues
            let accessMode =
                enabled
                ? (allowFrom.isEmpty ? "owner" : "allowlist")
                : "disabled"
            let toolsAllow = self.mergeStringValues(
                existing: self.stringArrayValue(at: [.key("tools"), .key("alsoAllow")]),
                additions: ["automation-runner"],
                enabled: enabled)
            let bundledSkills = self.mergeStringValues(
                existing: self.stringArrayValue(at: [.key("skills"), .key("allowBundled")]),
                additions: ["conversation-automation"],
                enabled: enabled)

            self.onboardingChannelsStore.updateConfigValue(
                path: [.key("tools"), .key("alsoAllow")],
                value: toolsAllow)
            self.onboardingChannelsStore.updateConfigValue(
                path: [.key("skills"), .key("allowBundled")],
                value: bundledSkills)

            self.onboardingChannelsStore.updateConfigValue(
                path: [.key("plugins"), .key("entries"), .key("automation-runner"), .key("enabled")],
                value: enabled)
            self.onboardingChannelsStore.updateConfigValue(
                path: [.key("plugins"), .key("entries"), .key("automation-runner"), .key("config"), .key("enabled")],
                value: enabled)
            self.onboardingChannelsStore.updateConfigValue(
                path: [.key("plugins"), .key("entries"), .key("automation-runner"), .key("config"), .key("accessPolicy"), .key("mode")],
                value: accessMode)
            self.onboardingChannelsStore.updateConfigValue(
                path: [.key("plugins"), .key("entries"), .key("automation-runner"), .key("config"), .key("accessPolicy"), .key("allowFrom")],
                value: allowFrom)
            self.onboardingChannelsStore.updateConfigValue(
                path: [.key("plugins"), .key("entries"), .key("automation-runner"), .key("config"), .key("requireApproval")],
                value: true)
        }

        let shouldApplyTelephonyDefaults = telephonyEnabled ?? self.conversationAutomationTelephonyEnabled
        guard shouldApplyTelephonyDefaults else {
            self.restoreConversationAutomationVoiceConfig()
            return
        }

        let selectedSttProvider = sttProvider ?? self.conversationAutomationSttProvider
        let phoneAllowFrom = self.conversationAutomationPhoneAllowFromValues
        let toolsAllow = self.mergeStringValues(
            existing: self.stringArrayValue(at: [.key("tools"), .key("alsoAllow")]),
            additions: ["voice-call"],
            enabled: true)
        let vapiBridgeAuthToken = self.resolvedConversationAutomationVapiBridgeAuthToken()

        self.onboardingChannelsStore.updateConfigValue(
            path: [.key("tools"), .key("alsoAllow")],
            value: toolsAllow)
        for update in Self.conversationAutomationVoiceDraftUpdates(
            mode: self.conversationAutomationVoiceMode,
            phoneAllowFrom: phoneAllowFrom,
            phoneProvider: self.conversationAutomationPhoneProvider,
            selectedSttProvider: selectedSttProvider,
            webhookMode: self.conversationAutomationWebhookMode,
            replyLanguageCode: self.conversationAutomationReplyLanguageCode,
            fromNumber: self.conversationAutomationFromNumber,
            twilioAccountSID: self.conversationAutomationTwilioAccountSID,
            twilioAuthToken: self.conversationAutomationTwilioAuthToken,
            telnyxAPIKey: self.conversationAutomationTelnyxAPIKey,
            telnyxConnectionID: self.conversationAutomationTelnyxConnectionID,
            telnyxPublicKey: self.conversationAutomationTelnyxPublicKey,
            plivoAuthID: self.conversationAutomationPlivoAuthID,
            plivoAuthToken: self.conversationAutomationPlivoAuthToken,
            deepgramAPIKey: self.conversationAutomationDeepgramAPIKey,
            openAIAPIKey: self.conversationAutomationOpenAIAPIKey,
            elevenLabsAPIKey: self.conversationAutomationElevenLabsAPIKey,
            elevenLabsVoiceID: self.conversationAutomationElevenLabsVoiceID,
            publicWebhookURL: self.conversationAutomationPublicWebhookURL,
            vapiAPIKey: self.conversationAutomationVapiAPIKey,
            vapiAssistantID: self.conversationAutomationVapiAssistantID,
            vapiPhoneNumberID: self.conversationAutomationVapiPhoneNumberID,
            vapiFromNumber: self.conversationAutomationSelectedVapiPhoneNumber?.number ?? "",
            vapiPreferredLanguageCode: self.conversationAutomationVapiPreferredLanguage.replyLanguageID,
            vapiBridgeMode: self.conversationAutomationVapiBridgeMode,
            vapiManualBridgeURL: self.conversationAutomationVapiManualBridgeURL,
            vapiBridgeAuthToken: vapiBridgeAuthToken)
        {
            self.onboardingChannelsStore.updateConfigValue(path: update.path, value: update.value)
        }
    }

    var conversationAutomationExpectedWebhookURL: String? {
        switch self.conversationAutomationWebhookMode {
        case .tailscaleFunnel:
            guard let hostname = self.tailscaleService.tailscaleHostname else { return nil }
            return "https://\(hostname)\(Self.conversationAutomationVoiceWebhookPath)"
        case .publicUrl:
            let trimmed = self.conversationAutomationPublicWebhookURL
                .trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        }
    }

    var conversationAutomationVoiceValidationMessages: [String] {
        Self.conversationAutomationVoiceValidationMessages(
            telephonyEnabled: self.conversationAutomationTelephonyEnabled,
            mode: self.conversationAutomationVoiceMode,
            phoneProvider: self.conversationAutomationPhoneProvider,
            sttProvider: self.conversationAutomationSttProvider,
            webhookMode: self.conversationAutomationWebhookMode,
            fromNumber: self.conversationAutomationFromNumber,
            twilioAccountSID: self.conversationAutomationTwilioAccountSID,
            twilioAuthToken: self.conversationAutomationTwilioAuthToken,
            telnyxAPIKey: self.conversationAutomationTelnyxAPIKey,
            telnyxConnectionID: self.conversationAutomationTelnyxConnectionID,
            telnyxPublicKey: self.conversationAutomationTelnyxPublicKey,
            plivoAuthID: self.conversationAutomationPlivoAuthID,
            plivoAuthToken: self.conversationAutomationPlivoAuthToken,
            deepgramAPIKey: self.conversationAutomationDeepgramAPIKey,
            openAIAPIKey: self.conversationAutomationOpenAIAPIKey,
            elevenLabsAPIKey: self.conversationAutomationElevenLabsAPIKey,
            publicWebhookURL: self.conversationAutomationPublicWebhookURL,
            vapiAPIKey: self.conversationAutomationVapiAPIKey,
            vapiAssistantID: self.conversationAutomationVapiAssistantID,
            vapiPhoneNumberID: self.conversationAutomationVapiPhoneNumberID,
            vapiBridgeMode: self.conversationAutomationVapiBridgeMode,
            vapiManualBridgeURL: self.conversationAutomationVapiManualBridgeURL,
            vapiAutoBridgeURL: self.conversationAutomationExpectedVapiAutoBridgeURL,
            tailscaleInstalled: self.tailscaleService.isInstalled,
            tailscaleRunning: self.tailscaleService.isRunning,
            tailscaleFunnelChecked: self.tailscaleService.funnelExposure.checked,
            tailscaleFunnelEnabled: self.tailscaleService.funnelExposure.featureEnabled,
            strings: self.strings)
    }

    static func isValidE164PhoneNumber(_ rawValue: String) -> Bool {
        let pattern = #"^\+[1-9]\d{1,14}$"#
        return rawValue.range(of: pattern, options: .regularExpression) != nil
    }

    static func isValidConversationAutomationHTTPSURL(_ rawValue: String) -> Bool {
        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty,
              let url = URL(string: trimmed),
              let scheme = url.scheme?.lowercased(),
              scheme == "https",
              url.host != nil
        else {
            return false
        }
        return true
    }

    static func conversationAutomationVoiceValidationMessages(
        telephonyEnabled: Bool,
        mode: ConversationAutomationVoiceMode,
        phoneProvider: ConversationAutomationTelephonyProvider,
        sttProvider: ConversationAutomationSttProvider,
        webhookMode: ConversationAutomationWebhookMode,
        fromNumber: String,
        twilioAccountSID: String,
        twilioAuthToken: String,
        telnyxAPIKey: String,
        telnyxConnectionID: String,
        telnyxPublicKey: String,
        plivoAuthID: String,
        plivoAuthToken: String,
        deepgramAPIKey: String,
        openAIAPIKey: String,
        elevenLabsAPIKey: String,
        publicWebhookURL: String,
        vapiAPIKey: String,
        vapiAssistantID: String,
        vapiPhoneNumberID: String,
        vapiBridgeMode: ConversationAutomationVapiBridgeMode,
        vapiManualBridgeURL: String,
        vapiAutoBridgeURL: String?,
        tailscaleInstalled: Bool,
        tailscaleRunning: Bool,
        tailscaleFunnelChecked: Bool,
        tailscaleFunnelEnabled: Bool,
        strings: OnboardingStrings) -> [String]
    {
        func trimmed(_ value: String) -> String {
            value.trimmingCharacters(in: .whitespacesAndNewlines)
        }

        guard telephonyEnabled else { return [] }
        var messages: [String] = []

        if mode == .simpleVapi {
            if trimmed(vapiAPIKey).isEmpty {
                messages.append(strings.conversationAutomationValidationVapiAPIKeyMissing)
            }
            if trimmed(vapiAssistantID).isEmpty {
                messages.append(strings.conversationAutomationValidationVapiAssistantMissing)
            }
            if trimmed(vapiPhoneNumberID).isEmpty {
                messages.append(strings.conversationAutomationValidationVapiPhoneNumberMissing)
            }
            switch vapiBridgeMode {
            case .autoBridge:
                if !tailscaleInstalled {
                    messages.append(strings.conversationAutomationValidationTailscaleInstallMissingForVapi)
                } else if !tailscaleRunning {
                    messages.append(strings.conversationAutomationValidationTailscaleRunningMissingForVapi)
                } else if tailscaleFunnelChecked && !tailscaleFunnelEnabled {
                    messages.append(strings.conversationAutomationValidationTailscaleFunnelMissingForVapi)
                }
                if (vapiAutoBridgeURL?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true) {
                    messages.append(strings.conversationAutomationValidationVapiBridgeMissing)
                }
            case .manualPublicURL:
                let normalizedBridgeURL = trimmed(vapiManualBridgeURL)
                if normalizedBridgeURL.isEmpty {
                    messages.append(strings.conversationAutomationValidationVapiManualBridgeMissing)
                } else if !Self.isValidConversationAutomationHTTPSURL(normalizedBridgeURL) {
                    messages.append(strings.conversationAutomationValidationVapiManualBridgeInvalid)
                }
            }
            return messages
        }

        let normalizedFromNumber = trimmed(fromNumber)
        if normalizedFromNumber.isEmpty {
            messages.append(strings.conversationAutomationValidationFromNumberMissing)
        } else if !Self.isValidE164PhoneNumber(normalizedFromNumber) {
            messages.append(strings.conversationAutomationValidationFromNumberInvalid)
        }

        switch phoneProvider {
        case .twilio:
            if trimmed(twilioAccountSID).isEmpty {
                messages.append(strings.conversationAutomationValidationTwilioAccountSIDMissing)
            }
            if trimmed(twilioAuthToken).isEmpty {
                messages.append(strings.conversationAutomationValidationTwilioAuthTokenMissing)
            }
        case .telnyx:
            if trimmed(telnyxAPIKey).isEmpty {
                messages.append(strings.conversationAutomationValidationTelnyxAPIKeyMissing)
            }
            if trimmed(telnyxConnectionID).isEmpty {
                messages.append(strings.conversationAutomationValidationTelnyxConnectionIDMissing)
            }
            if trimmed(telnyxPublicKey).isEmpty {
                messages.append(strings.conversationAutomationValidationTelnyxPublicKeyMissing)
            }
        case .plivo:
            if trimmed(plivoAuthID).isEmpty {
                messages.append(strings.conversationAutomationValidationPlivoAuthIDMissing)
            }
            if trimmed(plivoAuthToken).isEmpty {
                messages.append(strings.conversationAutomationValidationPlivoAuthTokenMissing)
            }
        }

        switch webhookMode {
        case .tailscaleFunnel:
            if !tailscaleInstalled {
                messages.append(strings.conversationAutomationValidationTailscaleInstallMissing)
            } else if !tailscaleRunning {
                messages.append(strings.conversationAutomationValidationTailscaleRunningMissing)
            } else if tailscaleFunnelChecked && !tailscaleFunnelEnabled {
                messages.append(strings.conversationAutomationValidationTailscaleFunnelMissing)
            }
        case .publicUrl:
            let normalizedPublicWebhookURL = trimmed(publicWebhookURL)
            if normalizedPublicWebhookURL.isEmpty {
                messages.append(strings.conversationAutomationValidationPublicWebhookMissing)
            } else if !Self.isValidConversationAutomationHTTPSURL(normalizedPublicWebhookURL) {
                messages.append(strings.conversationAutomationValidationPublicWebhookInvalid)
            }
        }

        switch sttProvider {
        case .deepgramRealtime:
            if trimmed(deepgramAPIKey).isEmpty {
                messages.append(strings.conversationAutomationValidationDeepgramAPIKeyMissing)
            }
        case .openaiRealtime:
            if trimmed(openAIAPIKey).isEmpty {
                messages.append(strings.conversationAutomationValidationOpenAIAPIKeyMissing)
            }
        }

        if trimmed(elevenLabsAPIKey).isEmpty {
            messages.append(strings.conversationAutomationValidationElevenLabsAPIKeyMissing)
        }

        return messages
    }

    static func conversationAutomationVoiceDraftUpdates(
        mode: ConversationAutomationVoiceMode,
        phoneAllowFrom: [String],
        phoneProvider: ConversationAutomationTelephonyProvider,
        selectedSttProvider: ConversationAutomationSttProvider,
        webhookMode: ConversationAutomationWebhookMode,
        replyLanguageCode: String,
        fromNumber: String,
        twilioAccountSID: String,
        twilioAuthToken: String,
        telnyxAPIKey: String,
        telnyxConnectionID: String,
        telnyxPublicKey: String,
        plivoAuthID: String,
        plivoAuthToken: String,
        deepgramAPIKey: String,
        openAIAPIKey: String,
        elevenLabsAPIKey: String,
        elevenLabsVoiceID: String,
        publicWebhookURL: String,
        vapiAPIKey: String,
        vapiAssistantID: String,
        vapiPhoneNumberID: String,
        vapiFromNumber: String,
        vapiPreferredLanguageCode: String,
        vapiBridgeMode: ConversationAutomationVapiBridgeMode,
        vapiManualBridgeURL: String,
        vapiBridgeAuthToken: String) -> [ConversationAutomationVoiceDraftUpdate]
    {
        func optionalValue(_ value: String) -> String? {
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        }

        let inboundPolicy = phoneAllowFrom.isEmpty ? "disabled" : "allowlist"
        let voiceWebhookPath = Self.conversationAutomationVoiceWebhookPath
        let vapiBridgePath = Self.conversationAutomationVapiBridgePath

        if mode == .simpleVapi {
            return [
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("enabled")],
                    value: true),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("enabled")],
                    value: true),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("mode")],
                    value: ConversationAutomationVoiceMode.simpleVapi.rawValue),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("provider")],
                    value: nil),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("fromNumber")],
                    value: optionalValue(vapiFromNumber)),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("inboundPolicy")],
                    value: "disabled"),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("allowFrom")],
                    value: [String]()),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("enabled")],
                    value: true),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("apiKey")],
                    value: optionalValue(vapiAPIKey)),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("assistantId")],
                    value: optionalValue(vapiAssistantID)),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("phoneNumberId")],
                    value: optionalValue(vapiPhoneNumberID)),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("telephonyProvider")],
                    value: "twilio"),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("preferredLanguage")],
                    value: optionalValue(vapiPreferredLanguageCode)),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("bridgeMode")],
                    value: vapiBridgeMode.rawValue),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("bridgeUrl")],
                    value: vapiBridgeMode == .manualPublicURL ? optionalValue(vapiManualBridgeURL) : nil),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("bridgePath")],
                    value: vapiBridgePath),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("bridgeAuthToken")],
                    value: optionalValue(vapiBridgeAuthToken)),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("twilio"), .key("accountSid")],
                    value: nil),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("twilio"), .key("authToken")],
                    value: nil),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("telnyx"), .key("apiKey")],
                    value: nil),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("telnyx"), .key("connectionId")],
                    value: nil),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("telnyx"), .key("publicKey")],
                    value: nil),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("plivo"), .key("authId")],
                    value: nil),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("plivo"), .key("authToken")],
                    value: nil),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tailscale"), .key("mode")],
                    value: nil),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tailscale"), .key("path")],
                    value: nil),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tunnel"), .key("provider")],
                    value: nil),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("publicUrl")],
                    value: nil),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming"), .key("enabled")],
                    value: nil),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming"), .key("sttProvider")],
                    value: nil),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming"), .key("languageCode")],
                    value: nil),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming"), .key("openai"), .key("apiKey")],
                    value: nil),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming"), .key("deepgram"), .key("model")],
                    value: nil),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming"), .key("deepgram"), .key("apiKey")],
                    value: nil),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tts"), .key("provider")],
                    value: nil),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tts"), .key("elevenlabs"), .key("modelId")],
                    value: nil),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tts"), .key("elevenlabs"), .key("apiKey")],
                    value: nil),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tts"), .key("elevenlabs"), .key("voiceId")],
                    value: nil),
                ConversationAutomationVoiceDraftUpdate(
                    path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tts"), .key("elevenlabs"), .key("languageCode")],
                    value: nil),
            ]
        }

        return [
            ConversationAutomationVoiceDraftUpdate(
                path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("enabled")],
                value: true),
            ConversationAutomationVoiceDraftUpdate(
                path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("enabled")],
                value: true),
            ConversationAutomationVoiceDraftUpdate(
                path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("mode")],
                value: ConversationAutomationVoiceMode.advancedSelfHosted.rawValue),
            ConversationAutomationVoiceDraftUpdate(
                path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("provider")],
                value: phoneProvider.rawValue),
            ConversationAutomationVoiceDraftUpdate(
                path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("fromNumber")],
                value: optionalValue(fromNumber)),
            ConversationAutomationVoiceDraftUpdate(
                path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("inboundPolicy")],
                value: inboundPolicy),
            ConversationAutomationVoiceDraftUpdate(
                path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("allowFrom")],
                value: phoneAllowFrom),
            ConversationAutomationVoiceDraftUpdate(
                path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("enabled")],
                value: false),
            ConversationAutomationVoiceDraftUpdate(
                path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("bridgeMode")],
                value: nil),
            ConversationAutomationVoiceDraftUpdate(
                path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("vapi"), .key("bridgeUrl")],
                value: nil),
            ConversationAutomationVoiceDraftUpdate(
                path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("twilio"), .key("accountSid")],
                value: phoneProvider == .twilio ? optionalValue(twilioAccountSID) : nil),
            ConversationAutomationVoiceDraftUpdate(
                path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("twilio"), .key("authToken")],
                value: phoneProvider == .twilio ? optionalValue(twilioAuthToken) : nil),
            ConversationAutomationVoiceDraftUpdate(
                path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("telnyx"), .key("apiKey")],
                value: phoneProvider == .telnyx ? optionalValue(telnyxAPIKey) : nil),
            ConversationAutomationVoiceDraftUpdate(
                path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("telnyx"), .key("connectionId")],
                value: phoneProvider == .telnyx ? optionalValue(telnyxConnectionID) : nil),
            ConversationAutomationVoiceDraftUpdate(
                path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("telnyx"), .key("publicKey")],
                value: phoneProvider == .telnyx ? optionalValue(telnyxPublicKey) : nil),
            ConversationAutomationVoiceDraftUpdate(
                path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("plivo"), .key("authId")],
                value: phoneProvider == .plivo ? optionalValue(plivoAuthID) : nil),
            ConversationAutomationVoiceDraftUpdate(
                path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("plivo"), .key("authToken")],
                value: phoneProvider == .plivo ? optionalValue(plivoAuthToken) : nil),
            ConversationAutomationVoiceDraftUpdate(
                path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tunnel"), .key("provider")],
                value: webhookMode == .tailscaleFunnel ? "tailscale-funnel" : "none"),
            ConversationAutomationVoiceDraftUpdate(
                path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tailscale"), .key("mode")],
                value: webhookMode == .tailscaleFunnel ? "funnel" : "off"),
            ConversationAutomationVoiceDraftUpdate(
                path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tailscale"), .key("path")],
                value: voiceWebhookPath),
            ConversationAutomationVoiceDraftUpdate(
                path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("publicUrl")],
                value: webhookMode == .publicUrl ? optionalValue(publicWebhookURL) : nil),
            ConversationAutomationVoiceDraftUpdate(
                path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming"), .key("enabled")],
                value: true),
            ConversationAutomationVoiceDraftUpdate(
                path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming"), .key("sttProvider")],
                value: selectedSttProvider.rawValue),
            ConversationAutomationVoiceDraftUpdate(
                path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming"), .key("languageCode")],
                value: replyLanguageCode),
            ConversationAutomationVoiceDraftUpdate(
                path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming"), .key("openai"), .key("apiKey")],
                value: optionalValue(openAIAPIKey)),
            ConversationAutomationVoiceDraftUpdate(
                path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming"), .key("deepgram"), .key("model")],
                value: selectedSttProvider == .deepgramRealtime ? "nova-3" : nil),
            ConversationAutomationVoiceDraftUpdate(
                path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("streaming"), .key("deepgram"), .key("apiKey")],
                value: optionalValue(deepgramAPIKey)),
            ConversationAutomationVoiceDraftUpdate(
                path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tts"), .key("provider")],
                value: "elevenlabs"),
            ConversationAutomationVoiceDraftUpdate(
                path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tts"), .key("elevenlabs"), .key("modelId")],
                value: "eleven_multilingual_v2"),
            ConversationAutomationVoiceDraftUpdate(
                path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tts"), .key("elevenlabs"), .key("apiKey")],
                value: optionalValue(elevenLabsAPIKey)),
            ConversationAutomationVoiceDraftUpdate(
                path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tts"), .key("elevenlabs"), .key("voiceId")],
                value: optionalValue(elevenLabsVoiceID)),
            ConversationAutomationVoiceDraftUpdate(
                path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("tts"), .key("elevenlabs"), .key("languageCode")],
                value: replyLanguageCode),
        ]
    }

    func refreshConversationAutomationVapiSelectionsIfNeeded() async {
        guard self.conversationAutomationVoiceMode == .simpleVapi else { return }
        let trimmedAPIKey = self.conversationAutomationVapiAPIKey
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedAPIKey.isEmpty else { return }
        guard self.conversationAutomationVapiAssistants.isEmpty || self.conversationAutomationVapiPhoneNumbers.isEmpty else {
            return
        }
        await self.refreshConversationAutomationVapiSelections()
    }

    func refreshConversationAutomationVapiSelections() async {
        guard !self.conversationAutomationVapiRefreshing else { return }
        let trimmedAPIKey = self.conversationAutomationVapiAPIKey
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedAPIKey.isEmpty else {
            self.conversationAutomationVapiStatus = self.strings.conversationAutomationValidationVapiAPIKeyMissing
            self.conversationAutomationVapiStatusIsError = true
            self.conversationAutomationVapiAssistants = []
            self.conversationAutomationVapiPhoneNumbers = []
            return
        }

        self.conversationAutomationVapiRefreshing = true
        defer { self.conversationAutomationVapiRefreshing = false }

        do {
            let client = ConversationAutomationVapiClient(apiKey: trimmedAPIKey)
            async let assistantsTask = client.listAssistants()
            async let phoneNumbersTask = client.listPhoneNumbers()
            let assistants = try await assistantsTask
            let phoneNumbers = try await phoneNumbersTask
            let sortedAssistants = assistants.sorted {
                $0.displayLabel.localizedCaseInsensitiveCompare($1.displayLabel) == .orderedAscending
            }
            let sortedPhoneNumbers = phoneNumbers.sorted {
                $0.displayLabel.localizedCaseInsensitiveCompare($1.displayLabel) == .orderedAscending
            }
            self.conversationAutomationVapiAssistants = sortedAssistants
            self.conversationAutomationVapiPhoneNumbers = sortedPhoneNumbers

            if !sortedAssistants.contains(where: {
                $0.id.caseInsensitiveCompare(self.conversationAutomationVapiAssistantID) == .orderedSame
            }) {
                self.conversationAutomationVapiAssistantID =
                    sortedAssistants.count == 1 ? sortedAssistants[0].id : ""
            }
            if !sortedPhoneNumbers.contains(where: {
                $0.id.caseInsensitiveCompare(self.conversationAutomationVapiPhoneNumberID) == .orderedSame
            }) {
                self.conversationAutomationVapiPhoneNumberID =
                    sortedPhoneNumbers.count == 1 ? sortedPhoneNumbers[0].id : ""
            }

            self.conversationAutomationVapiStatus = self.strings.conversationAutomationVapiRefreshReady(
                assistantCount: sortedAssistants.count,
                phoneNumberCount: sortedPhoneNumbers.count)
            self.conversationAutomationVapiStatusIsError = false
            self.applyConversationAutomationVoiceDraft()
        } catch {
            self.conversationAutomationVapiStatus = self.strings.conversationAutomationVapiRefreshFailed(
                detail: error.localizedDescription)
            self.conversationAutomationVapiStatusIsError = true
        }
    }

    private func headerMetaText(for badges: [OnboardingStepBadge]) -> String? {
        let text = badges
            .map { $0.compactTitle(in: self.state.effectiveOnboardingLanguage) }
            .joined(separator: " · ")
        return text.isEmpty ? nil : text
    }
}
