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
    static let conversationAutomationVoiceWebhookPath = "/voice/webhook"

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
        showOnboardingChat: Bool) -> [Int]
    {
        switch mode {
        case .remote:
            // Remote onboarding should stop after gateway connection + first channel.
            // Remote brain/provider setup belongs on the remote host itself.
            [0, 1, 10, 9]
        case .unconfigured:
            [0, 1, 9]
        case .local:
            // Local setup still performs CLI/workspace prep automatically, then helps people
            // review the Mac permissions and included tools that matter most.
            [0, 1, 3, 10, 12, 5, 11, 13, 9]
        }
    }

    var showOnboardingChat: Bool {
        self.state.connectionMode == .local && self.needsBootstrap
    }

    var pageOrder: [Int] {
        [self.languagePageIndex]
            + Self.pageOrder(for: self.state.connectionMode, showOnboardingChat: self.showOnboardingChat)
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
        activePageIndex: Int,
        skillsSetupPageIndex: Int,
        didAutoInstallDefaultSkills: Bool,
        isLoadingSkills: Bool,
        hasSkills: Bool) -> Bool
    {
        mode == .local &&
            !onboardingSeen &&
            activePageIndex == skillsSetupPageIndex &&
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
                return "Needs phone-provider, speech, and voice credentials plus a public callback URL."
            case .id:
                return "Perlu kredensial provider telepon, speech, dan voice plus URL callback publik."
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

    private func restoreConversationAutomationVoiceConfig() {
        self.restoreConversationAutomationVoiceToolExposure()
        let voicePaths: [ConfigPath] = [
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("enabled")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("enabled")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("provider")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("fromNumber")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("inboundPolicy")],
            [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("allowFrom")],
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
        let telephonyDefaultsPrepared =
            voiceCallEnabled &&
            voiceCallConfigEnabled &&
            configuredPhoneProvider != nil &&
            voiceCallTtsProvider == "elevenlabs" &&
            elevenLabsModelId == "eleven_multilingual_v2" &&
            configuredSttProvider != nil

        self.conversationAutomationPresetEnabled = automationEnabled && automationConfigEnabled
        self.conversationAutomationTelephonyEnabled = telephonyDefaultsPrepared
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

        self.onboardingChannelsStore.updateConfigValue(
            path: [.key("tools"), .key("alsoAllow")],
            value: toolsAllow)
        for update in Self.conversationAutomationVoiceDraftUpdates(
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
            publicWebhookURL: self.conversationAutomationPublicWebhookURL)
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
        publicWebhookURL: String) -> [ConversationAutomationVoiceDraftUpdate]
    {
        func optionalValue(_ value: String) -> String? {
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        }

        let inboundPolicy = phoneAllowFrom.isEmpty ? "disabled" : "allowlist"
        let voiceWebhookPath = Self.conversationAutomationVoiceWebhookPath

        return [
            ConversationAutomationVoiceDraftUpdate(
                path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("enabled")],
                value: true),
            ConversationAutomationVoiceDraftUpdate(
                path: [.key("plugins"), .key("entries"), .key("voice-call"), .key("config"), .key("enabled")],
                value: true),
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

    private func headerMetaText(for badges: [OnboardingStepBadge]) -> String? {
        let text = badges
            .map { $0.compactTitle(in: self.state.effectiveOnboardingLanguage) }
            .joined(separator: " · ")
        return text.isEmpty ? nil : text
    }
}
