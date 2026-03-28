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

@MainActor
final class OnboardingController: NSObject, NSWindowDelegate {
    static let shared = OnboardingController()
    private var window: NSWindow?

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

    func show() {
        if ProcessInfo.processInfo.isNixMode {
            // Nix mode is fully declarative; onboarding would suggest interactive setup that doesn't apply.
            UserDefaults.standard.set(true, forKey: "maumau.onboardingSeen")
            UserDefaults.standard.set(currentOnboardingVersion, forKey: onboardingVersionKey)
            AppStateStore.shared.onboardingSeen = true
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
        window?.delegate = nil
        window?.close()
    }

    func restart() {
        self.close()
        self.show()
    }

    func windowWillClose(_ notification: Notification) {
        guard let closingWindow = notification.object as? NSWindow else { return }
        if closingWindow === self.window {
            self.window = nil
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
    @State var onboardingChannelsStore = ChannelsStore()
    @State var onboardingSkillsModel = SkillsSettingsModel()
    @State var onboardingWizard = OnboardingWizardModel()
    @State var didLoadOnboardingSkills = false
    @State var localGatewayProbe: LocalGatewayProbe?
    @State var localRuntimeAvailable: Bool?
    @State var didAutoInstallCLI = false
    @State var didAutoInstallDefaultSkills = false
    @Bindable var state: AppState
    var permissionMonitor: PermissionMonitor

    static let windowWidth: CGFloat = 630
    static let windowHeight: CGFloat = 752 // ~+10% to fit full onboarding content
    static let headerHeight: CGFloat = 88
    static let navigationHeight: CGFloat = 60
    static let minimumContentHeight: CGFloat = 300
    static let minimumWindowHeight: CGFloat =
        Self.headerHeight + Self.navigationHeight + Self.minimumContentHeight

    @State var pageWidth: CGFloat = Self.windowWidth
    let languagePageIndex = -1
    let connectionPageIndex = 1
    let cliPageIndex = 6
    let workspacePageIndex = 7
    let wizardPageIndex = 3
    let onboardingChatPageIndex = 8
    let channelsSetupPageIndex = 10
    let skillsSetupPageIndex = 11
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
            [0, 1, 3, 10, 12, 5, 11, 9]
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
        self.currentPage == self.pageCount - 1 ? self.strings.finishButtonTitle : self.strings.nextButtonTitle
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

    var canAdvance: Bool {
        (self.activePageIndex != self.languagePageIndex || self.state.hasSelectedOnboardingLanguage)
            && !self.isWizardBlocking
            && !self.isCLIBlocking
            && !self.isWorkspaceBlocking
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
        default:
            return nil
        }
    }

    private func headerMetaText(for badges: [OnboardingStepBadge]) -> String? {
        let text = badges
            .map { $0.compactTitle(in: self.state.effectiveOnboardingLanguage) }
            .joined(separator: " · ")
        return text.isEmpty ? nil : text
    }
}
