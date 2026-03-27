import SwiftUI

private enum GatewayTailscaleMode: String, CaseIterable, Identifiable {
    case off
    case serve
    case funnel

    var id: String {
        self.rawValue
    }

    var label: String {
        switch self {
        case .off: "Off"
        case .serve: "Private (Serve)"
        case .funnel: "Public (Funnel)"
        }
    }

    var description: String {
        switch self {
        case .off:
            "No private Tailscale access."
        case .serve:
            "Private HTTPS for devices in your Tailscale network."
        case .funnel:
            "Public HTTPS link. Maumau requires its own password."
        }
    }
}

enum TailscaleIntegrationPresentation {
    case settings
    case onboarding
}

struct TailscaleIntegrationSection: View {
    let connectionMode: AppState.ConnectionMode
    let isPaused: Bool
    let presentation: TailscaleIntegrationPresentation
    private var tailscaleService: TailscaleService

    @State private var hasLoaded = false
    @State private var tailscaleMode: GatewayTailscaleMode = .serve
    @State private var requireCredentialsForServe = false
    @State private var password: String = ""
    @State private var statusMessage: String?
    @State private var validationMessage: String?
    @State private var actionMessage: String?
    @State private var actionMessageIsError = false
    @State private var isInstallingTailscale = false
    @State private var isOpeningBrowserSignIn = false
    @State private var statusTimer: Timer?

    init(
        connectionMode: AppState.ConnectionMode,
        isPaused: Bool,
        presentation: TailscaleIntegrationPresentation = .settings,
        service: TailscaleService = .shared)
    {
        self.connectionMode = connectionMode
        self.isPaused = isPaused
        self.presentation = presentation
        self.tailscaleService = service
    }

    private var effectiveService: TailscaleService {
        return self.tailscaleService
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Private access")
                .font(.callout.weight(.semibold))
            Text(self.introText)
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            if self.presentation == .settings {
                self.settingsGuide
            }

            self.statusRow

            if !self.effectiveService.isInstalled {
                self.installButtons
            } else {
                self.modePicker
                if self.tailscaleMode != .off {
                    self.accessURLRow
                }
                if self.tailscaleMode == .serve {
                    self.serveAuthSection
                }
                if self.tailscaleMode == .funnel {
                    self.funnelAuthSection
                }
            }

            if self.connectionMode != .local {
                Text("Local mode required. Update settings on the gateway host.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let validationMessage {
                Text(validationMessage)
                    .font(.caption)
                    .foregroundStyle(.orange)
            } else if let actionMessage {
                Text(actionMessage)
                    .font(.caption)
                    .foregroundStyle(self.actionMessageIsError ? .orange : .secondary)
            } else if let statusMessage {
                Text(statusMessage)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(12)
        .background(Color.gray.opacity(0.08))
        .cornerRadius(10)
        .disabled(self.connectionMode != .local)
        .task {
            guard !self.hasLoaded else { return }
            await self.loadConfig()
            self.hasLoaded = true
            await self.effectiveService.checkTailscaleStatus()
            self.startStatusTimer()
        }
        .onDisappear {
            self.stopStatusTimer()
        }
        .onChange(of: self.tailscaleMode) { _, _ in
            Task { await self.applySettings() }
        }
        .onChange(of: self.requireCredentialsForServe) { _, _ in
            Task { await self.applySettings() }
        }
    }

    private var introText: String {
        switch self.presentation {
        case .settings:
            if !self.effectiveService.isInstalled {
                return "Install Tailscale here to turn on private access for this Gateway."
            }
            if !self.effectiveService.isRunning {
                return "Finish Tailscale sign-in on this Mac, then choose how this Gateway is shared."
            }
            return "Manage how this Gateway is shared through Tailscale."
        case .onboarding:
            return "Powered by Tailscale. Use the install button here on this Mac first, then add your phone or other devices later when you want them."
        }
    }

    private var statusRow: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(self.statusColor)
                .frame(width: 10, height: 10)
            Text(self.statusText)
                .font(.callout)
            Spacer()
            Button("Refresh") {
                Task { await self.effectiveService.checkTailscaleStatus() }
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
    }

    private var settingsGuide: some View {
        DisclosureGroup("Need help adding another device later?") {
            VStack(alignment: .leading, spacing: 4) {
                Text("Install Tailscale on that phone or laptop later.")
                Text("Sign in there with the same Tailscale account or private network.")
                Text("Then open the private link shown here.")
            }
            .padding(.top, 4)
        }
        .font(.caption)
        .foregroundStyle(.secondary)
    }

    private var statusColor: Color {
        if !self.effectiveService.isInstalled { return .yellow }
        if self.effectiveService.isRunning { return .green }
        return .orange
    }

    private var statusText: String {
        if !self.effectiveService.isInstalled { return "Tailscale is not installed on this Mac yet" }
        if self.effectiveService.isRunning { return "Tailscale is installed and signed in on this Mac" }
        return "Tailscale is installed, but this Mac is not signed in yet"
    }

    private var installButtons: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button(action: self.installTailscale) {
                if self.isInstallingTailscale {
                    self.busyLabel("Installing on this Mac…")
                } else {
                    Text("Install on this Mac")
                }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.small)
            .disabled(self.isActionBusy)

            Text("Maumau downloads the official Tailscale macOS package and runs the installer command here. macOS will ask for your administrator password.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Button("Open Tailscale guide") { self.effectiveService.openSetupGuide() }
                .buttonStyle(.link)
        }
    }

    private var modePicker: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Access mode")
                .font(.callout.weight(.semibold))
            Picker("Access", selection: self.$tailscaleMode) {
                ForEach(GatewayTailscaleMode.allCases) { mode in
                    Text(mode.label).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            Text(self.tailscaleMode.description)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private var accessURLRow: some View {
        if let host = self.effectiveService.tailscaleHostname {
            let url = "https://\(host)/ui/"
            HStack(spacing: 8) {
                Text(self.tailscaleMode == .funnel ? "Public link:" : "Private link:")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if let link = URL(string: url) {
                    Link(url, destination: link)
                        .font(.system(.caption, design: .monospaced))
                } else {
                    Text(url)
                        .font(.system(.caption, design: .monospaced))
                }
            }
        } else if !self.effectiveService.isRunning {
            Text("Sign in on this Mac first. Tailscale can open your browser, and then you can come back here for the private link.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }

        if self.effectiveService.isInstalled, !self.effectiveService.isRunning {
            Button(action: self.openBrowserSignIn) {
                if self.isOpeningBrowserSignIn {
                    self.busyLabel("Opening browser sign-in…")
                } else {
                    Text("Open browser sign-in")
                }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.small)
            .disabled(self.isActionBusy)
        }
    }

    private var serveAuthSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Toggle("Require credentials", isOn: self.$requireCredentialsForServe)
                .toggleStyle(.checkbox)
            if self.requireCredentialsForServe {
                self.authFields
            } else {
                Text("Private mode trusts Tailscale's verified identity, so Maumau does not need its own password here.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var funnelAuthSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Public mode requires a Maumau password.")
                .font(.caption)
                .foregroundStyle(.secondary)
            self.authFields
        }
    }

    @ViewBuilder
    private var authFields: some View {
        SecureField("Password", text: self.$password)
            .textFieldStyle(.roundedBorder)
            .frame(maxWidth: 240)
            .onSubmit { Task { await self.applySettings() } }
        Text("Stored in ~/.maumau/maumau.json. Prefer MAUMAU_GATEWAY_PASSWORD if you want to manage it outside the app.")
            .font(.caption)
            .foregroundStyle(.secondary)
        Button("Update password") { Task { await self.applySettings() } }
            .buttonStyle(.bordered)
            .controlSize(.small)
    }

    private func loadConfig() async {
        let root = await ConfigStore.load()
        let gateway = root["gateway"] as? [String: Any] ?? [:]
        let tailscale = gateway["tailscale"] as? [String: Any] ?? [:]
        let modeRaw = (tailscale["mode"] as? String) ?? "serve"
        self.tailscaleMode = GatewayTailscaleMode(rawValue: modeRaw) ?? .off

        let auth = gateway["auth"] as? [String: Any] ?? [:]
        let authModeRaw = auth["mode"] as? String
        let allowTailscale = auth["allowTailscale"] as? Bool

        self.password = auth["password"] as? String ?? ""

        if self.tailscaleMode == .serve {
            let usesExplicitAuth = authModeRaw == "password"
            if let allowTailscale, allowTailscale == false {
                self.requireCredentialsForServe = true
            } else {
                self.requireCredentialsForServe = usesExplicitAuth
            }
        } else {
            self.requireCredentialsForServe = false
        }
    }

    private func applySettings() async {
        guard self.hasLoaded else { return }
        self.validationMessage = nil
        self.statusMessage = nil
        self.clearActionMessage()

        let trimmedPassword = self.password.trimmingCharacters(in: .whitespacesAndNewlines)
        let requiresPassword = self.tailscaleMode == .funnel
            || (self.tailscaleMode == .serve && self.requireCredentialsForServe)
        if requiresPassword, trimmedPassword.isEmpty {
            self.validationMessage = "Password required for this mode."
            return
        }

        let (success, errorMessage) = await TailscaleIntegrationSection.buildAndSaveTailscaleConfig(
            tailscaleMode: self.tailscaleMode,
            requireCredentialsForServe: self.requireCredentialsForServe,
            password: trimmedPassword,
            connectionMode: self.connectionMode,
            isPaused: self.isPaused)

        if !success, let errorMessage {
            self.statusMessage = errorMessage
            return
        }

        if self.connectionMode == .local, !self.isPaused {
            self.statusMessage = "Saved private access settings. Restarting gateway…"
        } else {
            self.statusMessage = "Saved private access settings. Restart the gateway to apply."
        }
        self.restartGatewayIfNeeded()
    }

    @MainActor
    private static func buildAndSaveTailscaleConfig(
        tailscaleMode: GatewayTailscaleMode,
        requireCredentialsForServe: Bool,
        password: String,
        connectionMode: AppState.ConnectionMode,
        isPaused: Bool) async -> (Bool, String?)
    {
        var root = await ConfigStore.load()
        var gateway = root["gateway"] as? [String: Any] ?? [:]
        var tailscale = gateway["tailscale"] as? [String: Any] ?? [:]
        tailscale["mode"] = tailscaleMode.rawValue
        gateway["tailscale"] = tailscale

        if tailscaleMode != .off {
            gateway["bind"] = "loopback"
        }

        if tailscaleMode == .off {
            gateway.removeValue(forKey: "auth")
        } else {
            var auth = gateway["auth"] as? [String: Any] ?? [:]
            if tailscaleMode == .serve, !requireCredentialsForServe {
                auth["allowTailscale"] = true
                auth.removeValue(forKey: "mode")
                auth.removeValue(forKey: "password")
            } else {
                auth["allowTailscale"] = false
                auth["mode"] = "password"
                auth["password"] = password
            }

            if auth.isEmpty {
                gateway.removeValue(forKey: "auth")
            } else {
                gateway["auth"] = auth
            }
        }

        if gateway.isEmpty {
            root.removeValue(forKey: "gateway")
        } else {
            root["gateway"] = gateway
        }

        do {
            try await ConfigStore.save(root)
            return (true, nil)
        } catch {
            return (false, error.localizedDescription)
        }
    }

    private func restartGatewayIfNeeded() {
        guard self.connectionMode == .local, !self.isPaused else { return }
        Task { await GatewayLaunchAgentManager.kickstart() }
    }

    private func startStatusTimer() {
        self.stopStatusTimer()
        if ProcessInfo.processInfo.isRunningTests {
            return
        }
        self.statusTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { _ in
            Task { await self.effectiveService.checkTailscaleStatus() }
        }
    }

    private func stopStatusTimer() {
        self.statusTimer?.invalidate()
        self.statusTimer = nil
    }

    private var isActionBusy: Bool {
        self.isInstallingTailscale || self.isOpeningBrowserSignIn
    }

    private func busyLabel(_ title: String) -> some View {
        HStack(spacing: 8) {
            ProgressView()
                .controlSize(.small)
            Text(title)
        }
    }

    private func clearActionMessage() {
        self.actionMessage = nil
        self.actionMessageIsError = false
    }

    private func setActionMessage(_ message: String, isError: Bool) {
        self.actionMessage = message
        self.actionMessageIsError = isError
    }

    private func installTailscale() {
        guard !self.isActionBusy else { return }
        self.validationMessage = nil
        self.statusMessage = nil
        self.setActionMessage("Downloading the official Tailscale installer…", isError: false)
        self.isInstallingTailscale = true

        Task {
            let outcome = await self.effectiveService.installOnThisMac()
            self.isInstallingTailscale = false
            self.setActionMessage(outcome.message, isError: !outcome.success)
        }
    }

    private func openBrowserSignIn() {
        guard !self.isActionBusy else { return }
        self.validationMessage = nil
        self.statusMessage = nil
        self.setActionMessage("Preparing browser sign-in…", isError: false)
        self.isOpeningBrowserSignIn = true

        Task {
            let outcome = await self.effectiveService.openBrowserSignIn()
            self.isOpeningBrowserSignIn = false
            self.setActionMessage(outcome.message, isError: !outcome.success)
        }
    }
}

#if DEBUG
extension TailscaleIntegrationSection {
    mutating func setTestingState(
        mode: String,
        requireCredentials: Bool,
        password: String = "secret",
        statusMessage: String? = nil,
        validationMessage: String? = nil)
    {
        if let mode = GatewayTailscaleMode(rawValue: mode) {
            self.tailscaleMode = mode
        }
        self.requireCredentialsForServe = requireCredentials
        self.password = password
        self.statusMessage = statusMessage
        self.validationMessage = validationMessage
    }

}
#endif
