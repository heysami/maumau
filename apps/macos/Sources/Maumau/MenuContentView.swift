import AppKit
import AVFoundation
import Foundation
import Observation
import SwiftUI

/// Menu contents for the Maumau menu bar extra.
struct MenuContent: View {
    @Bindable var state: AppState
    let updater: UpdaterProviding?
    @Bindable private var updateStatus: UpdateStatus
    private let gatewayManager = GatewayProcessManager.shared
    private let healthStore = HealthStore.shared
    private let heartbeatStore = HeartbeatStore.shared
    private let controlChannel = ControlChannel.shared
    private let activityStore = WorkActivityStore.shared
    @Bindable private var pairingPrompter = NodePairingApprovalPrompter.shared
    @Bindable private var devicePairingPrompter = DevicePairingApprovalPrompter.shared
    @Environment(\.openSettings) private var openSettings
    @State private var availableMics: [AudioInputDevice] = []
    @State private var loadingMics = false
    @State private var micObserver = AudioInputDeviceObserver()
    @State private var micRefreshTask: Task<Void, Never>?
    @State private var browserControlEnabled = true
    @AppStorage(cameraEnabledKey) private var cameraEnabled: Bool = false
    @AppStorage(appLogLevelKey) private var appLogLevelRaw: String = AppLogLevel.default.rawValue
    @AppStorage(debugFileLogEnabledKey) private var appFileLoggingEnabled: Bool = false

    init(state: AppState, updater: UpdaterProviding?) {
        self._state = Bindable(wrappedValue: state)
        self.updater = updater
        self._updateStatus = Bindable(wrappedValue: updater?.updateStatus ?? UpdateStatus.disabled)
    }

    private var execApprovalModeBinding: Binding<ExecApprovalQuickMode> {
        Binding(
            get: { self.state.execApprovalMode },
            set: { self.state.execApprovalMode = $0 })
    }

    var body: some View {
        let language = self.state.effectiveOnboardingLanguage
        VStack(alignment: .leading, spacing: 8) {
            Toggle(isOn: self.activeBinding) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(self.connectionLabel)
                    self.statusLine(label: self.healthStatus.label, color: self.healthStatus.color)
                    if self.pairingPrompter.pendingCount > 0 {
                        self.statusLine(
                            label: macPairingPendingText(
                                count: self.pairingPrompter.pendingCount,
                                repairCount: self.pairingPrompter.pendingRepairCount,
                                device: false,
                                language: language),
                            color: .orange)
                    }
                    if self.devicePairingPrompter.pendingCount > 0 {
                        self.statusLine(
                            label: macPairingPendingText(
                                count: self.devicePairingPrompter.pendingCount,
                                repairCount: self.devicePairingPrompter.pendingRepairCount,
                                device: true,
                                language: language),
                            color: .orange)
                    }
                }
            }
            .disabled(self.state.connectionMode == .unconfigured)

            Divider()
            Toggle(isOn: self.heartbeatsBinding) {
                HStack(spacing: 8) {
                    Label(macLocalized("Send Heartbeats", language: language), systemImage: "waveform.path.ecg")
                    Spacer(minLength: 0)
                    self.statusLine(label: self.heartbeatStatus.label, color: self.heartbeatStatus.color)
                }
            }
            Toggle(
                isOn: Binding(
                    get: { self.browserControlEnabled },
                    set: { enabled in
                        self.browserControlEnabled = enabled
                        Task { await self.saveBrowserControlEnabled(enabled) }
                    })) {
                Label(macLocalized("Browser Control", language: language), systemImage: "globe")
            }
            Toggle(isOn: self.$cameraEnabled) {
                Label(macLocalized("Allow Camera", language: language), systemImage: "camera")
            }
            Picker(selection: self.execApprovalModeBinding) {
                ForEach(ExecApprovalQuickMode.allCases) { mode in
                    Text(macLocalized(mode.title, language: language)).tag(mode)
                }
            } label: {
                Label(macLocalized("Exec Approvals", language: language), systemImage: "terminal")
            }
            Toggle(isOn: Binding(get: { self.state.canvasEnabled }, set: { self.state.canvasEnabled = $0 })) {
                Label(macLocalized("Allow Canvas", language: language), systemImage: "rectangle.and.pencil.and.ellipsis")
            }
            .onChange(of: self.state.canvasEnabled) { _, enabled in
                if !enabled {
                    CanvasManager.shared.hideAll()
                }
            }
            Toggle(isOn: self.voiceWakeBinding) {
                Label(macLocalized("Voice Wake", language: language), systemImage: "mic.fill")
            }
            .disabled(!voiceWakeSupported)
            .opacity(voiceWakeSupported ? 1 : 0.5)
            if self.showVoiceWakeMicPicker {
                self.voiceWakeMicMenu
            }
            Divider()
            Button {
                Task { @MainActor in
                    await self.openDashboard()
                }
            } label: {
                Label(macLocalized("Open Dashboard", language: language), systemImage: "gauge")
            }
            Button {
                Task { @MainActor in
                    let sessionKey = await WebChatManager.shared.preferredSessionKey()
                    WebChatManager.shared.show(sessionKey: sessionKey)
                }
            } label: {
                Label(macLocalized("Open Chat", language: language), systemImage: "bubble.left.and.bubble.right")
            }
            if self.state.canvasEnabled {
                Button {
                    Task { @MainActor in
                        if self.state.canvasPanelVisible {
                            CanvasManager.shared.hideAll()
                        } else {
                            let sessionKey = await GatewayConnection.shared.mainSessionKey()
                            // Don't force a navigation on re-open: preserve the current web view state.
                            _ = try? CanvasManager.shared.show(sessionKey: sessionKey, path: nil)
                        }
                    }
                } label: {
                    Label(
                        self.state.canvasPanelVisible
                            ? macLocalized("Close Canvas", language: language)
                            : macLocalized("Open Canvas", language: language),
                        systemImage: "rectangle.inset.filled.on.rectangle")
                }
            }
            Button {
                Task { await self.state.setTalkEnabled(!self.state.talkEnabled) }
            } label: {
                Label(
                    self.state.talkEnabled
                        ? macLocalized("Stop Talk Mode", language: language)
                        : macLocalized("Talk Mode", language: language),
                    systemImage: "waveform.circle.fill")
            }
            .disabled(!voiceWakeSupported)
            .opacity(voiceWakeSupported ? 1 : 0.5)
            Divider()
            Button(macLocalized("Settings…", language: language)) { self.open(tab: .general) }
                .keyboardShortcut(",", modifiers: [.command])
            self.debugMenu
            Button(macLocalized("About Maumau", language: language)) { self.open(tab: .about) }
            if let updater, updater.isAvailable, self.updateStatus.isUpdateReady {
                Button(macLocalized("Update ready, restart now?", language: language)) { updater.checkForUpdates(nil) }
            }
            Button(macLocalized("Quit", language: language)) { NSApplication.shared.terminate(nil) }
        }
        .task(id: self.state.swabbleEnabled) {
            if self.state.swabbleEnabled {
                await self.loadMicrophones(force: true)
            }
        }
        .task {
            VoicePushToTalkHotkey.shared.setEnabled(voiceWakeSupported && self.state.voicePushToTalkEnabled)
        }
        .onChange(of: self.state.voicePushToTalkEnabled) { _, enabled in
            VoicePushToTalkHotkey.shared.setEnabled(voiceWakeSupported && enabled)
        }
        .task(id: self.state.connectionMode) {
            await self.loadBrowserControlEnabled()
        }
        .onAppear {
            MicRefreshSupport.startObserver(self.micObserver) {
                MicRefreshSupport.schedule(refreshTask: &self.micRefreshTask) {
                    await self.loadMicrophones(force: true)
                }
            }
        }
        .onDisappear {
            self.micRefreshTask?.cancel()
            self.micRefreshTask = nil
            self.micObserver.stop()
        }
        .task { @MainActor in
            SettingsWindowOpener.shared.register(openSettings: self.openSettings)
        }
    }

    private var connectionLabel: String {
        switch self.state.connectionMode {
        case .unconfigured:
            macLocalized("Maumau Not Configured", language: self.state.effectiveOnboardingLanguage)
        case .remote:
            macLocalized("Remote Maumau Active", language: self.state.effectiveOnboardingLanguage)
        case .local:
            macLocalized("Maumau Active", language: self.state.effectiveOnboardingLanguage)
        }
    }

    private func loadBrowserControlEnabled() async {
        let root = await ConfigStore.load()
        let browser = root["browser"] as? [String: Any]
        let enabled = browser?["enabled"] as? Bool ?? true
        await MainActor.run { self.browserControlEnabled = enabled }
    }

    private func saveBrowserControlEnabled(_ enabled: Bool) async {
        let (success, _) = await MenuContent.buildAndSaveBrowserEnabled(enabled)

        if !success {
            await self.loadBrowserControlEnabled()
        }
    }

    @MainActor
    private static func buildAndSaveBrowserEnabled(_ enabled: Bool) async -> (Bool, ()) {
        var root = await ConfigStore.load()
        var browser = root["browser"] as? [String: Any] ?? [:]
        browser["enabled"] = enabled
        root["browser"] = browser
        do {
            try await ConfigStore.save(root)
            return (true, ())
        } catch {
            return (false, ())
        }
    }

    @ViewBuilder
    private var debugMenu: some View {
        if self.state.debugPaneEnabled {
            let language = self.state.effectiveOnboardingLanguage
            Menu(macLocalized("Debug", language: language)) {
                Button {
                    DebugActions.openConfigFolder()
                } label: {
                    Label(macLocalized("Open Config Folder", language: language), systemImage: "folder")
                }
                Button {
                    Task { await DebugActions.runHealthCheckNow() }
                } label: {
                    Label(macLocalized("Run Health Check Now", language: language), systemImage: "stethoscope")
                }
                Button {
                    Task { _ = await DebugActions.sendTestHeartbeat() }
                } label: {
                    Label(macLocalized("Send Test Heartbeat", language: language), systemImage: "waveform.path.ecg")
                }
                if self.state.connectionMode == .remote {
                    Button {
                        Task { @MainActor in
                            let result = await DebugActions.resetGatewayTunnel()
                            self.presentDebugResult(result, title: macLocalized("Remote Tunnel", language: language))
                        }
                    } label: {
                        Label(macLocalized("Reset Remote Tunnel", language: language), systemImage: "arrow.triangle.2.circlepath")
                    }
                }
                Button {
                    Task { _ = await DebugActions.toggleVerboseLoggingMain() }
                } label: {
                    Label(
                        DebugActions.verboseLoggingEnabledMain
                            ? macLocalized("Verbose Logging (Main): On", language: language)
                            : macLocalized("Verbose Logging (Main): Off", language: language),
                        systemImage: "text.alignleft")
                }
                Menu {
                    Picker(macLocalized("Verbosity", language: language), selection: self.$appLogLevelRaw) {
                        ForEach(AppLogLevel.allCases) { level in
                            Text(macLocalized(level.title, language: language)).tag(level.rawValue)
                        }
                    }
                    Toggle(isOn: self.$appFileLoggingEnabled) {
                        Label(
                            self.appFileLoggingEnabled
                                ? macLocalized("File Logging: On", language: language)
                                : macLocalized("File Logging: Off", language: language),
                            systemImage: "doc.text.magnifyingglass")
                    }
                } label: {
                    Label(macLocalized("App Logging", language: language), systemImage: "doc.text")
                }
                Button {
                    DebugActions.openSessionStore()
                } label: {
                    Label(macLocalized("Open Session Store", language: language), systemImage: "externaldrive")
                }
                Divider()
                Button {
                    DebugActions.openAgentEventsWindow()
                } label: {
                    Label(macLocalized("Open Agent Events…", language: language), systemImage: "bolt.horizontal.circle")
                }
                Button {
                    DebugActions.openLog()
                } label: {
                    Label(macLocalized("Open Log", language: language), systemImage: "doc.text.magnifyingglass")
                }
                Button {
                    Task { _ = await DebugActions.sendDebugVoice() }
                } label: {
                    Label(macLocalized("Send Debug Voice Text", language: language), systemImage: "waveform.circle")
                }
                Button {
                    Task { await DebugActions.sendTestNotification() }
                } label: {
                    Label(macLocalized("Send Test Notification", language: language), systemImage: "bell")
                }
                Divider()
                if self.state.connectionMode == .local {
                    Button {
                        DebugActions.restartGateway()
                    } label: {
                        Label(macLocalized("Restart Gateway", language: language), systemImage: "arrow.clockwise")
                    }
                }
                Button {
                    DebugActions.restartOnboarding()
                } label: {
                    Label(macLocalized("Restart onboarding", language: language), systemImage: "arrow.counterclockwise")
                }
                Button {
                    DebugActions.restartApp()
                } label: {
                    Label(macLocalized("Restart App", language: language), systemImage: "arrow.triangle.2.circlepath")
                }
            }
        }
    }

    private func open(tab: SettingsTab) {
        SettingsTabRouter.request(tab)
        NSApp.activate(ignoringOtherApps: true)
        self.openSettings()
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: .maumauSelectSettingsTab, object: tab)
        }
    }

    @MainActor
    private func openDashboard() async {
        do {
            let config = try await GatewayEndpointStore.shared.requireConfig()
            let url = try GatewayEndpointStore.dashboardURL(for: config, mode: self.state.connectionMode)
            NSWorkspace.shared.open(url)
        } catch {
            let alert = NSAlert()
            alert.messageText = macLocalized("Dashboard unavailable", language: self.state.effectiveOnboardingLanguage)
            alert.informativeText = error.localizedDescription
            alert.runModal()
        }
    }

    private var healthStatus: (label: String, color: Color) {
        if let activity = self.activityStore.current {
            let color: Color = activity.role == .main ? .accentColor : .gray
            let roleLabel = activity.role == .main
                ? macLocalized("Main", language: self.state.effectiveOnboardingLanguage)
                : macLocalized("Other", language: self.state.effectiveOnboardingLanguage)
            let text = "\(roleLabel) · \(activity.label)"
            return (text, color)
        }

        let health = self.healthStore.state
        let isRefreshing = self.healthStore.isRefreshing
        let lastAge = self.healthStore.lastSuccess.map { age(from: $0) }

        if isRefreshing {
            return (macLocalized("Health check running…", language: self.state.effectiveOnboardingLanguage), health.tint)
        }

        switch health {
        case .ok:
            let ageText = lastAge.map { " · \(macLocalized("checked", language: self.state.effectiveOnboardingLanguage)) \($0)" } ?? ""
            return ("\(macLocalized("Health ok", language: self.state.effectiveOnboardingLanguage))\(ageText)", .green)
        case .linkingNeeded:
            return (macLocalized("Health: login required", language: self.state.effectiveOnboardingLanguage), .red)
        case let .degraded(reason):
            let detail = HealthStore.shared.degradedSummary ?? reason
            let ageText = lastAge.map { " · \(macLocalized("checked", language: self.state.effectiveOnboardingLanguage)) \($0)" } ?? ""
            return ("\(detail)\(ageText)", .orange)
        case .unknown:
            return (macLocalized("Health pending", language: self.state.effectiveOnboardingLanguage), .secondary)
        }
    }

    private var heartbeatStatus: (label: String, color: Color) {
        if case .degraded = self.controlChannel.state {
            return (macLocalized("Control channel disconnected", language: self.state.effectiveOnboardingLanguage), .red)
        } else if let evt = self.heartbeatStore.lastEvent {
            let ageText = age(from: Date(timeIntervalSince1970: evt.ts / 1000))
            switch evt.status {
            case "sent":
                return ("\(macLocalized("Last heartbeat sent", language: self.state.effectiveOnboardingLanguage)) · \(ageText)", .blue)
            case "ok-empty", "ok-token":
                return ("\(macLocalized("Heartbeat ok", language: self.state.effectiveOnboardingLanguage)) · \(ageText)", .green)
            case "skipped":
                return ("\(macLocalized("Heartbeat skipped", language: self.state.effectiveOnboardingLanguage)) · \(ageText)", .secondary)
            case "failed":
                return ("\(macLocalized("Heartbeat failed", language: self.state.effectiveOnboardingLanguage)) · \(ageText)", .red)
            default:
                return ("\(macLocalized("Heartbeat", language: self.state.effectiveOnboardingLanguage)) · \(ageText)", .secondary)
            }
        } else {
            return (macLocalized("No heartbeat yet", language: self.state.effectiveOnboardingLanguage), .secondary)
        }
    }

    private func statusLine(label: String, color: Color) -> some View {
        HStack(spacing: 6) {
            Circle()
                .fill(color)
                .frame(width: 6, height: 6)
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.leading)
                .lineLimit(nil)
                .fixedSize(horizontal: false, vertical: true)
                .layoutPriority(1)
        }
        .padding(.top, 2)
    }

    private var activeBinding: Binding<Bool> {
        Binding(get: { !self.state.isPaused }, set: { self.state.isPaused = !$0 })
    }

    private var heartbeatsBinding: Binding<Bool> {
        Binding(get: { self.state.heartbeatsEnabled }, set: { self.state.heartbeatsEnabled = $0 })
    }

    private var voiceWakeBinding: Binding<Bool> {
        MicRefreshSupport.voiceWakeBinding(for: self.state)
    }

    private var showVoiceWakeMicPicker: Bool {
        voiceWakeSupported && self.state.swabbleEnabled
    }

    private var voiceWakeMicMenu: some View {
        Menu {
            self.microphoneMenuItems

            if self.loadingMics {
                Divider()
                Label(
                    macLocalized("Refreshing microphones…", language: self.state.effectiveOnboardingLanguage),
                    systemImage: "arrow.triangle.2.circlepath")
                    .labelStyle(.titleOnly)
                    .foregroundStyle(.secondary)
                    .disabled(true)
            }
        } label: {
            HStack {
                Text(macLocalized("Microphone", language: self.state.effectiveOnboardingLanguage))
                Spacer()
                Text(self.selectedMicLabel)
                    .foregroundStyle(.secondary)
            }
        }
        .task { await self.loadMicrophones() }
    }

    private var selectedMicLabel: String {
        if self.state.voiceWakeMicID.isEmpty { return self.defaultMicLabel }
        if let match = self.availableMics.first(where: { $0.uid == self.state.voiceWakeMicID }) {
            return match.name
        }
        if !self.state.voiceWakeMicName.isEmpty { return self.state.voiceWakeMicName }
        return macLocalized("Unavailable", language: self.state.effectiveOnboardingLanguage)
    }

    private var microphoneMenuItems: some View {
        Group {
            if self.isSelectedMicUnavailable {
                Label(
                    macLocalized("Disconnected (using System default)", language: self.state.effectiveOnboardingLanguage),
                    systemImage: "exclamationmark.triangle")
                    .labelStyle(.titleAndIcon)
                    .foregroundStyle(.secondary)
                    .disabled(true)
                Divider()
            }
            Button {
                self.state.voiceWakeMicID = ""
                self.state.voiceWakeMicName = ""
            } label: {
                Label(self.defaultMicLabel, systemImage: self.state.voiceWakeMicID.isEmpty ? "checkmark" : "")
                    .labelStyle(.titleAndIcon)
            }
            .buttonStyle(.plain)

            ForEach(self.availableMics) { mic in
                Button {
                    self.state.voiceWakeMicID = mic.uid
                    self.state.voiceWakeMicName = mic.name
                } label: {
                    Label(mic.name, systemImage: self.state.voiceWakeMicID == mic.uid ? "checkmark" : "")
                        .labelStyle(.titleAndIcon)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var isSelectedMicUnavailable: Bool {
        let selected = self.state.voiceWakeMicID
        guard !selected.isEmpty else { return false }
        return !self.availableMics.contains(where: { $0.uid == selected })
    }

    private var defaultMicLabel: String {
        if let host = Host.current().localizedName, !host.isEmpty {
            if self.state.effectiveOnboardingLanguage == .id {
                return "Deteksi otomatis (\(host))"
            }
            return "Auto-detect (\(host))"
        }
        return macLocalized("System default", language: self.state.effectiveOnboardingLanguage)
    }

    @MainActor
    private func presentDebugResult(_ result: Result<String, DebugActionError>, title: String) {
        let alert = NSAlert()
        alert.messageText = title
        switch result {
        case let .success(message):
            alert.informativeText = message
            alert.alertStyle = .informational
        case let .failure(error):
            alert.informativeText = error.localizedDescription
            alert.alertStyle = .warning
        }
        alert.runModal()
    }

    @MainActor
    private func loadMicrophones(force: Bool = false) async {
        guard self.showVoiceWakeMicPicker else {
            self.availableMics = []
            self.loadingMics = false
            return
        }
        if !force, !self.availableMics.isEmpty { return }
        self.loadingMics = true
        let discovery = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.external, .microphone],
            mediaType: .audio,
            position: .unspecified)
        let connectedDevices = discovery.devices.filter(\.isConnected)
        self.availableMics = connectedDevices
            .sorted { lhs, rhs in
                lhs.localizedName.localizedCaseInsensitiveCompare(rhs.localizedName) == .orderedAscending
            }
            .map { AudioInputDevice(uid: $0.uniqueID, name: $0.localizedName) }
        self.availableMics = self.filterAliveInputs(self.availableMics)
        self.state.voiceWakeMicName = MicRefreshSupport.selectedMicName(
            selectedID: self.state.voiceWakeMicID,
            in: self.availableMics,
            uid: \.uid,
            name: \.name)
        self.loadingMics = false
    }

    private func filterAliveInputs(_ inputs: [AudioInputDevice]) -> [AudioInputDevice] {
        let aliveUIDs = AudioInputDeviceObserver.aliveInputDeviceUIDs()
        guard !aliveUIDs.isEmpty else { return inputs }
        return inputs.filter { aliveUIDs.contains($0.uid) }
    }

    private struct AudioInputDevice: Identifiable, Equatable {
        let uid: String
        let name: String
        var id: String {
            self.uid
        }
    }
}
