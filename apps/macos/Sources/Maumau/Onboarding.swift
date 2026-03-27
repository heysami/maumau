import AppKit
import Observation
import MaumauChatUI
import MaumauDiscovery
import MaumauIPC
import SwiftUI

enum UIStrings {
    static let welcomeTitle = "Welcome to Maumau"
}

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

    private func present(_ window: NSWindow, recenter: Bool) {
        if recenter {
            window.center()
        }
        DockIconManager.shared.temporarilyShowDock()
        window.orderFrontRegardless()
        window.makeKeyAndOrderFront(nil)
        window.makeMain()
        NSApp.activate(ignoringOtherApps: true)
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
        window.title = UIStrings.welcomeTitle
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

        var headerMetaText: String? {
            let text = self.badges.map(\.compactTitle).joined(separator: " · ")
            return text.isEmpty ? nil : text
        }
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
        Self.pageOrder(for: self.state.connectionMode, showOnboardingChat: self.showOnboardingChat)
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
                    title: "Set up the Gateway",
                    progressTitle: "Set up Gateway",
                    pageID: self.connectionPageIndex,
                    bodyText: "Gateway is Maumau's home. Choose which machine it lives on and works from.",
                    badges: [.required],
                    preparationNote: nil),
                SetupStepDefinition(
                    stage: .chat,
                    title: "Pick a Channel",
                    progressTitle: "Pick Channel",
                    pageID: self.channelsSetupPageIndex,
                    bodyText: "Channel means the app where people can message Maumau and get replies back.",
                    badges: [.optional, .needsPrep],
                    preparationNote: "Needs setup in the chat app you choose, like signing in, connecting a bot, or pairing a bridge."),
            ]
        case .unconfigured, .local:
            [
                SetupStepDefinition(
                    stage: .home,
                    title: "Set up the Gateway",
                    progressTitle: "Set up Gateway",
                    pageID: self.connectionPageIndex,
                    bodyText: "Gateway is Maumau's home. Choose which machine it lives on and works from.",
                    badges: [.required],
                    preparationNote: nil),
                SetupStepDefinition(
                    stage: .brain,
                    title: "Choose the brain",
                    progressTitle: "Choose brain",
                    pageID: self.wizardPageIndex,
                    bodyText: "Brain means the AI service that does the thinking and writing.",
                    badges: [.required, .needsPrep],
                    preparationNote: "Needs a provider account, sign-in, or API key from the AI service you choose."),
                SetupStepDefinition(
                    stage: .chat,
                    title: "Pick a Channel",
                    progressTitle: "Pick Channel",
                    pageID: self.channelsSetupPageIndex,
                    bodyText: "Channel means the app where people can message Maumau and get replies back.",
                    badges: [.optional, .needsPrep],
                    preparationNote: "Needs setup in the chat app you choose, like signing in, connecting a bot, or pairing a bridge."),
                SetupStepDefinition(
                    stage: .access,
                    title: "Private access",
                    progressTitle: "Private access",
                    pageID: self.privateAccessPageIndex,
                    bodyText: "This gives Maumau's home a private driveway so your own devices can reach it privately later.",
                    badges: [.optional, .needsPrep],
                    preparationNote: "Needs Tailscale on this Mac now, and on any other phone or laptop later if you want to open Maumau there."),
                SetupStepDefinition(
                    stage: .permissions,
                    title: "Allow Mac access",
                    progressTitle: "Allow access",
                    pageID: self.permissionsPageIndex,
                    bodyText: "This is where you choose what Maumau is allowed to do on this Mac, like work with apps or look at the screen.",
                    badges: [.optional],
                    preparationNote: nil),
                SetupStepDefinition(
                    stage: .tools,
                    title: "Review included tools",
                    progressTitle: "Review tools",
                    pageID: self.skillsSetupPageIndex,
                    bodyText: "This is a quick look at the main tools Maumau already comes with, so you know what is ready to use.",
                    badges: [.optional],
                    preparationNote: nil),
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
        self.currentPage == self.pageCount - 1 ? "Finish" : "Next"
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
        !self.isWizardBlocking && !self.isCLIBlocking && !self.isWorkspaceBlocking
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
        remoteUrl: String) -> Bool
    {
        let _ = remoteUrl
        return connectionMode != .local && !onboardingSeen
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
}
