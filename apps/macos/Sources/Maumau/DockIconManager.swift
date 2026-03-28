import AppKit

/// Central manager for Dock icon visibility.
/// Shows the Dock icon while any windows are visible, regardless of user preference.
final class DockIconManager: NSObject, @unchecked Sendable {
    static let shared = DockIconManager()
    private static let transientDockVisibilityHold = Duration.seconds(3)

    private var windowsObservation: NSKeyValueObservation?
    private var forceDockVisibleUntil: Date?
    private var holdReleaseTask: Task<Void, Never>?
    private let logger = Logger(subsystem: "ai.maumau", category: "DockIconManager")

    override private init() {
        super.init()
        self.setupObservers()
        Task { @MainActor in
            self.updateDockVisibility()
        }
    }

    deinit {
        self.holdReleaseTask?.cancel()
        self.windowsObservation?.invalidate()
        NotificationCenter.default.removeObserver(self)
    }

    static func shouldUseRegularActivationPolicy(
        userWantsDockHidden: Bool,
        hasVisibleWindows: Bool,
        forceDockVisible: Bool) -> Bool
    {
        forceDockVisible || !userWantsDockHidden || hasVisibleWindows
    }

    func updateDockVisibility() {
        Task { @MainActor in
            guard NSApp != nil else {
                self.logger.warning("NSApp not ready, skipping Dock visibility update")
                return
            }

            let userWantsDockHidden = !UserDefaults.standard.bool(forKey: showDockIconKey)
            let visibleWindows = NSApp?.windows.filter { window in
                window.isVisible &&
                    window.frame.width > 1 &&
                    window.frame.height > 1 &&
                    !window.isKind(of: NSPanel.self) &&
                    "\(type(of: window))" != "NSPopupMenuWindow" &&
                    window.contentViewController != nil
            } ?? []

            let hasVisibleWindows = !visibleWindows.isEmpty
            let forceDockVisible = self.forceDockVisibleUntil.map { $0 > Date() } ?? false
            if hasVisibleWindows {
                self.forceDockVisibleUntil = nil
                self.holdReleaseTask?.cancel()
                self.holdReleaseTask = nil
            }

            if Self.shouldUseRegularActivationPolicy(
                userWantsDockHidden: userWantsDockHidden,
                hasVisibleWindows: hasVisibleWindows,
                forceDockVisible: forceDockVisible)
            {
                NSApp?.setActivationPolicy(.regular)
            } else {
                NSApp?.setActivationPolicy(.accessory)
            }
        }
    }

    @MainActor
    func temporarilyShowDock() {
        guard NSApp != nil else {
            self.logger.warning("NSApp not ready, cannot show Dock icon")
            return
        }
        self.forceDockVisibleUntil = Date().addingTimeInterval(3)
        self.holdReleaseTask?.cancel()
        self.holdReleaseTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: Self.transientDockVisibilityHold)
            guard let self else { return }
            if let until = self.forceDockVisibleUntil, until <= Date() {
                self.forceDockVisibleUntil = nil
            }
            self.updateDockVisibility()
        }
        NSApp.setActivationPolicy(.regular)
    }

    private func setupObservers() {
        Task { @MainActor in
            guard let app = NSApp else {
                self.logger.warning("NSApp not ready, delaying Dock observers")
                try? await Task.sleep(for: .milliseconds(200))
                self.setupObservers()
                return
            }

            self.windowsObservation = app.observe(\.windows, options: [.new]) { [weak self] _, _ in
                Task { @MainActor in
                    try? await Task.sleep(for: .milliseconds(50))
                    self?.updateDockVisibility()
                }
            }

            NotificationCenter.default.addObserver(
                self,
                selector: #selector(self.windowVisibilityChanged),
                name: NSWindow.didBecomeKeyNotification,
                object: nil)
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(self.windowVisibilityChanged),
                name: NSWindow.didResignKeyNotification,
                object: nil)
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(self.windowVisibilityChanged),
                name: NSWindow.willCloseNotification,
                object: nil)
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(self.dockPreferenceChanged),
                name: UserDefaults.didChangeNotification,
                object: nil)
        }
    }

    @objc
    private func windowVisibilityChanged(_: Notification) {
        Task { @MainActor in
            self.updateDockVisibility()
        }
    }

    @objc
    private func dockPreferenceChanged(_ notification: Notification) {
        guard let userDefaults = notification.object as? UserDefaults,
              userDefaults == UserDefaults.standard
        else { return }

        Task { @MainActor in
            self.updateDockVisibility()
        }
    }
}
