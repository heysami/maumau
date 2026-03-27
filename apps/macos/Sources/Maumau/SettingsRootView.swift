import AppKit
import Observation
import SwiftUI

struct SettingsRootView: View {
    @Bindable var state: AppState
    private let permissionMonitor = PermissionMonitor.shared
    @State private var monitoringPermissions = false
    @State private var selectedTab: SettingsTab = .general
    @State private var availableContentHeight: CGFloat = SettingsWindowSizing.defaultContentHeight()
    @State private var snapshotPaths: (configPath: String?, stateDir: String?) = (nil, nil)
    let updater: UpdaterProviding?
    private let isPreview = ProcessInfo.processInfo.isPreview
    private let isNixMode = ProcessInfo.processInfo.isNixMode

    init(state: AppState, updater: UpdaterProviding?, initialTab: SettingsTab? = nil) {
        self.state = state
        self.updater = updater
        self._selectedTab = State(initialValue: initialTab ?? .general)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if self.isNixMode {
                self.nixManagedBanner
            }
            TabView(selection: self.$selectedTab) {
                GeneralSettings(state: self.state)
                    .tabItem { Label("General", systemImage: "gearshape") }
                    .tag(SettingsTab.general)

                ChannelsSettings()
                    .tabItem { Label("Channels", systemImage: "link") }
                    .tag(SettingsTab.channels)

                VoiceWakeSettings(state: self.state, isActive: self.selectedTab == .voiceWake)
                    .tabItem { Label("Voice Wake", systemImage: "waveform.circle") }
                    .tag(SettingsTab.voiceWake)

                ConfigSettings()
                    .tabItem { Label("Config", systemImage: "slider.horizontal.3") }
                    .tag(SettingsTab.config)

                InstancesSettings()
                    .tabItem { Label("Instances", systemImage: "network") }
                    .tag(SettingsTab.instances)

                SessionsSettings()
                    .tabItem { Label("Sessions", systemImage: "clock.arrow.circlepath") }
                    .tag(SettingsTab.sessions)

                CronSettings()
                    .tabItem { Label("Cron", systemImage: "calendar") }
                    .tag(SettingsTab.cron)

                SkillsSettings(state: self.state)
                    .tabItem { Label("Skills", systemImage: "sparkles") }
                    .tag(SettingsTab.skills)

                PluginsSettings()
                    .tabItem { Label("Plugins", systemImage: "puzzlepiece") }
                    .tag(SettingsTab.plugins)

                PermissionsSettings(
                    status: self.permissionMonitor.status,
                    refresh: self.refreshPerms,
                    showOnboarding: { DebugActions.restartOnboarding() })
                    .tabItem { Label("Permissions", systemImage: "lock.shield") }
                    .tag(SettingsTab.permissions)

                if self.state.debugPaneEnabled {
                    DebugSettings(state: self.state)
                        .tabItem { Label("Debug", systemImage: "ant") }
                        .tag(SettingsTab.debug)
                }

                AboutSettings(updater: self.updater)
                    .tabItem { Label("About", systemImage: "info.circle") }
                    .tag(SettingsTab.about)
            }
        }
        .padding(.horizontal, 28)
        .padding(.vertical, 22)
        .frame(
            minWidth: nil,
            idealWidth: SettingsTab.windowWidth,
            maxWidth: .infinity,
            minHeight: nil,
            idealHeight: min(SettingsWindowSizing.desiredContentHeight, self.availableContentHeight),
            maxHeight: self.availableContentHeight,
            alignment: .topLeading)
        .frame(
            maxWidth: .infinity,
            maxHeight: self.availableContentHeight,
            alignment: .topLeading)
        .background(
            SettingsWindowFrameClamp(
                selectedTab: self.selectedTab,
                availableContentHeight: self.$availableContentHeight))
        .onReceive(NotificationCenter.default.publisher(for: .maumauSelectSettingsTab)) { note in
            if let tab = note.object as? SettingsTab {
                withAnimation(.spring(response: 0.32, dampingFraction: 0.85)) {
                    self.selectedTab = tab
                }
            }
        }
        .onAppear {
            if let pending = SettingsTabRouter.consumePending() {
                self.selectedTab = self.validTab(for: pending)
            }
            self.updatePermissionMonitoring(for: self.selectedTab)
        }
        .onChange(of: self.state.debugPaneEnabled) { _, enabled in
            if !enabled, self.selectedTab == .debug {
                self.selectedTab = .general
            }
        }
        .onChange(of: self.selectedTab) { _, newValue in
            self.updatePermissionMonitoring(for: newValue)
        }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            guard self.selectedTab == .permissions else { return }
            Task { await self.refreshPerms() }
        }
        .onDisappear { self.stopPermissionMonitoring() }
        .task {
            guard !self.isPreview else { return }
            await self.refreshPerms()
        }
        .task(id: self.state.connectionMode) {
            guard !self.isPreview else { return }
            await self.refreshSnapshotPaths()
        }
    }

    private var nixManagedBanner: some View {
        // Prefer gateway-resolved paths; fall back to local env defaults if disconnected.
        let configPath = self.snapshotPaths.configPath ?? MaumauPaths.configURL.path
        let stateDir = self.snapshotPaths.stateDir ?? MaumauPaths.stateDirURL.path

        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Image(systemName: "gearshape.2.fill")
                    .foregroundStyle(.secondary)
                Text("Managed by Nix")
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(.secondary)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text("Config: \(configPath)")
                Text("State:  \(stateDir)")
            }
            .font(.caption.monospaced())
            .foregroundStyle(.secondary)
            .textSelection(.enabled)
            .lineLimit(1)
            .truncationMode(.middle)
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 10)
        .background(Color.gray.opacity(0.12))
        .cornerRadius(10)
    }

    private func validTab(for requested: SettingsTab) -> SettingsTab {
        if requested == .debug, !self.state.debugPaneEnabled { return .general }
        return requested
    }

    @MainActor
    private func refreshSnapshotPaths() async {
        let paths = await GatewayConnection.shared.snapshotPaths()
        self.snapshotPaths = paths
    }

    @MainActor
    private func refreshPerms() async {
        guard !self.isPreview else { return }
        await self.permissionMonitor.refreshNow()
    }

    private func updatePermissionMonitoring(for tab: SettingsTab) {
        guard !self.isPreview else { return }
        PermissionMonitoringSupport.setMonitoring(tab == .permissions, monitoring: &self.monitoringPermissions)
    }

    private func stopPermissionMonitoring() {
        PermissionMonitoringSupport.stopMonitoring(&self.monitoringPermissions)
    }
}

enum SettingsTab: CaseIterable {
    case general, channels, skills, plugins, sessions, cron, config, instances, voiceWake, permissions, debug, about
    static let windowWidth: CGFloat = 824 // wider
    static let windowHeight: CGFloat = 790 // +10% (more room)
    var title: String {
        switch self {
        case .general: "General"
        case .channels: "Channels"
        case .skills: "Skills"
        case .plugins: "Plugins"
        case .sessions: "Sessions"
        case .cron: "Cron"
        case .config: "Config"
        case .instances: "Instances"
        case .voiceWake: "Voice Wake"
        case .permissions: "Permissions"
        case .debug: "Debug"
        case .about: "About"
        }
    }

    var systemImage: String {
        switch self {
        case .general: "gearshape"
        case .channels: "link"
        case .skills: "sparkles"
        case .plugins: "puzzlepiece"
        case .sessions: "clock.arrow.circlepath"
        case .cron: "calendar"
        case .config: "slider.horizontal.3"
        case .instances: "network"
        case .voiceWake: "waveform.circle"
        case .permissions: "lock.shield"
        case .debug: "ant"
        case .about: "info.circle"
        }
    }
}

@MainActor
enum SettingsTabRouter {
    private static var pending: SettingsTab?

    static func request(_ tab: SettingsTab) {
        self.pending = tab
    }

    static func consumePending() -> SettingsTab? {
        defer { self.pending = nil }
        return self.pending
    }
}

extension Notification.Name {
    static let maumauSelectSettingsTab = Notification.Name("maumauSelectSettingsTab")
}

private struct SettingsWindowFrameClamp: NSViewRepresentable {
    let selectedTab: SettingsTab
    @Binding var availableContentHeight: CGFloat

    func makeNSView(context _: Context) -> SettingsWindowFrameClampView { SettingsWindowFrameClampView() }

    func updateNSView(_ nsView: SettingsWindowFrameClampView, context _: Context) {
        nsView.selectedTab = self.selectedTab
        nsView.availableContentHeight = self.$availableContentHeight
        nsView.refreshConstraintsFromWindow()
        nsView.clampIfNeeded()
    }
}

@MainActor
enum SettingsWindowSizing {
    static let styleMask: NSWindow.StyleMask = [.titled, .closable, .miniaturizable, .resizable]
    // SwiftUI Settings adds extra title/toolbar chrome beyond the base window style math.
    static let settingsToolbarHeightAllowance: CGFloat = 48
    static let desiredFrameSize = NSSize(width: SettingsTab.windowWidth, height: SettingsTab.windowHeight)
    static var desiredContentHeight: CGFloat {
        max(
            1,
            floor(NSWindow.contentRect(
                forFrameRect: NSRect(origin: .zero, size: self.desiredFrameSize),
                styleMask: self.styleMask).height - self.settingsToolbarHeightAllowance))
    }

    static func defaultFrameHeight(visibleFrame: NSRect? = nil) -> CGFloat {
        let visibleFrame = visibleFrame ?? self.mainVisibleFrame()
        guard visibleFrame != .zero else { return self.desiredFrameSize.height }
        return max(1, floor(min(self.desiredFrameSize.height, visibleFrame.height)))
    }

    static func defaultFrameSize(for visibleFrame: NSRect? = nil) -> NSSize {
        let visibleFrame = visibleFrame ?? self.mainVisibleFrame()
        return NSSize(
            width: self.desiredFrameSize.width,
            height: self.defaultFrameHeight(visibleFrame: visibleFrame))
    }

    static func defaultContentHeight(visibleFrame: NSRect? = nil) -> CGFloat {
        let visibleFrame = visibleFrame ?? self.mainVisibleFrame()
        guard visibleFrame != .zero else { return self.desiredContentHeight }
        return min(self.desiredContentHeight, self.maxContentHeight(within: visibleFrame))
    }

    static func apply(to window: NSWindow, visibleFrame: NSRect? = nil) {
        self.apply(
            to: window,
            baseConstraints: Constraints(window: window),
            visibleFrame: visibleFrame)
    }

    static func apply(to window: NSWindow, baseConstraints: Constraints, visibleFrame: NSRect? = nil) {
        let visibleFrame = visibleFrame ?? self.visibleFrame(for: window)
        guard visibleFrame != .zero else { return }

        // Keep both the frame and content constraints within the visible screen so tab changes
        // cannot grow the Settings window past the display bounds.
        let maxFrameSize = NSSize(
            width: min(baseConstraints.maxFrameSize.width, visibleFrame.width),
            height: min(baseConstraints.maxFrameSize.height, visibleFrame.height))
        let maxContentSize = NSSize(
            width: window.contentRect(forFrameRect: NSRect(origin: .zero, size: maxFrameSize)).width,
            height: self.maxContentHeight(within: visibleFrame))

        window.maxSize = maxFrameSize
        window.contentMaxSize = NSSize(
            width: min(baseConstraints.maxContentSize.width, maxContentSize.width),
            height: min(baseConstraints.maxContentSize.height, maxContentSize.height))
        window.minSize = NSSize(
            width: min(baseConstraints.minFrameSize.width, maxFrameSize.width),
            height: min(baseConstraints.minFrameSize.height, maxFrameSize.height))
        window.contentMinSize = NSSize(
            width: min(baseConstraints.minContentSize.width, window.contentMaxSize.width),
            height: min(baseConstraints.minContentSize.height, window.contentMaxSize.height))

        let currentFrame = window.frame
        let currentContentRect = window.contentRect(forFrameRect: currentFrame)
        let clampedContentSize = NSSize(
            width: min(currentContentRect.width, window.contentMaxSize.width),
            height: min(currentContentRect.height, window.contentMaxSize.height))
        var clampedFrame = window.frameRect(forContentRect: NSRect(origin: .zero, size: clampedContentSize))
        clampedFrame.origin.x = currentFrame.origin.x
        clampedFrame.origin.y = currentFrame.maxY - clampedFrame.height
        clampedFrame = self.clampedFrame(clampedFrame, within: visibleFrame)
        if clampedFrame != currentFrame {
            window.setFrame(clampedFrame, display: false)
        }

        WindowPlacement.ensureOnScreen(window: window, defaultSize: self.defaultFrameSize(for: visibleFrame))
    }

    static func visibleFrame(for window: NSWindow) -> NSRect {
        window.screen?.visibleFrame ?? NSScreen.main?.visibleFrame ?? NSScreen.screens.first?.visibleFrame ?? .zero
    }

    static func mainVisibleFrame() -> NSRect {
        NSScreen.main?.visibleFrame ?? NSScreen.screens.first?.visibleFrame ?? .zero
    }

    static func maxContentHeight(within visibleFrame: NSRect) -> CGFloat {
        guard visibleFrame != .zero else { return self.desiredContentHeight }
        return max(
            1,
            floor(NSWindow.contentRect(
                forFrameRect: NSRect(origin: .zero, size: visibleFrame.size),
                styleMask: self.styleMask).height - self.settingsToolbarHeightAllowance))
    }

    static func clampedFrame(_ frame: NSRect, within visibleFrame: NSRect) -> NSRect {
        guard visibleFrame != .zero else { return frame }

        var next = frame
        next.size.width = min(next.size.width, visibleFrame.width)
        next.size.height = min(next.size.height, visibleFrame.height)

        let maxX = visibleFrame.maxX - next.size.width
        let maxY = visibleFrame.maxY - next.size.height

        next.origin.x = maxX >= visibleFrame.minX
            ? min(max(next.origin.x, visibleFrame.minX), maxX)
            : visibleFrame.minX
        next.origin.y = maxY >= visibleFrame.minY
            ? min(max(next.origin.y, visibleFrame.minY), maxY)
            : visibleFrame.minY

        next.origin.x = round(next.origin.x)
        next.origin.y = round(next.origin.y)
        next.size.width = round(next.size.width)
        next.size.height = round(next.size.height)
        return next
    }

    struct Constraints {
        let minFrameSize: NSSize
        let minContentSize: NSSize
        let maxFrameSize: NSSize
        let maxContentSize: NSSize

        @MainActor
        init(window: NSWindow) {
            self.minFrameSize = window.minSize
            self.minContentSize = window.contentMinSize
            self.maxFrameSize = window.maxSize
            self.maxContentSize = window.contentMaxSize
        }
    }
}

private final class SettingsWindowFrameClampView: NSView {
    var selectedTab: SettingsTab = .general
    var availableContentHeight: Binding<CGFloat>?
    private var observedWindow: NSWindow?
    private var observerTokens: [NSObjectProtocol] = []
    private var baseConstraints: SettingsWindowSizing.Constraints?
    private var scheduledClampGeneration = 0
    private var lastClampedTab: SettingsTab = .general

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        self.updateWindowObservation()
        self.clampIfNeeded(forceRepeatedPasses: true)
    }

    override func viewDidMoveToSuperview() {
        super.viewDidMoveToSuperview()
        self.clampIfNeeded(forceRepeatedPasses: true)
    }

    deinit {
        MainActor.assumeIsolated {
            self.removeWindowObservation()
        }
    }

    private func updateWindowObservation() {
        guard self.window !== self.observedWindow else { return }
        self.removeWindowObservation()
        guard let window = self.window else { return }

        self.observedWindow = window
        self.baseConstraints = SettingsWindowSizing.Constraints(window: window)
        let center = NotificationCenter.default
        let names: [Notification.Name] = [
            NSWindow.didResizeNotification,
            NSWindow.didChangeScreenNotification,
            NSWindow.didBecomeKeyNotification,
        ]
        self.observerTokens = names.map { name in
            center.addObserver(forName: name, object: window, queue: .main) { [weak self] _ in
                Task { @MainActor [weak self] in
                    self?.refreshConstraintsFromWindow()
                    self?.clampIfNeeded(forceRepeatedPasses: true)
                }
            }
        }
    }

    private func removeWindowObservation() {
        let center = NotificationCenter.default
        for token in self.observerTokens {
            center.removeObserver(token)
        }
        self.observerTokens.removeAll()
        self.observedWindow = nil
        self.baseConstraints = nil
    }

    func refreshConstraintsFromWindow() {
        guard let window = self.window else { return }
        self.baseConstraints = SettingsWindowSizing.Constraints(window: window)
        let nextContentHeight = SettingsWindowSizing.maxContentHeight(
            within: SettingsWindowSizing.visibleFrame(for: window))
        if self.availableContentHeight?.wrappedValue != nextContentHeight {
            self.availableContentHeight?.wrappedValue = nextContentHeight
        }
    }

    func clampIfNeeded(forceRepeatedPasses: Bool = false) {
        guard let window = self.window else { return }
        let shouldRepeat = forceRepeatedPasses || self.lastClampedTab != self.selectedTab
        self.lastClampedTab = self.selectedTab
        self.scheduledClampGeneration += 1
        let generation = self.scheduledClampGeneration
        let delays: [TimeInterval] = shouldRepeat ? [0, 0.05, 0.15, 0.3] : [0]

        for delay in delays {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self, weak window] in
                guard let self, let window, generation == self.scheduledClampGeneration else { return }
                self.refreshConstraintsFromWindow()
                let constraints = self.baseConstraints ?? SettingsWindowSizing.Constraints(window: window)
                SettingsWindowSizing.apply(to: window, baseConstraints: constraints)
            }
        }
    }
}

#if DEBUG
struct SettingsRootView_Previews: PreviewProvider {
    static var previews: some View {
        ForEach(SettingsTab.allCases, id: \.self) { tab in
            SettingsRootView(state: .preview, updater: DisabledUpdaterController(), initialTab: tab)
                .previewDisplayName(tab.title)
                .frame(width: SettingsTab.windowWidth, height: SettingsTab.windowHeight)
        }
    }
}
#endif
