import AppKit
import Observation
import MaumauDiscovery
import MaumauIPC
import MaumauKit
import SwiftUI

struct GeneralSettings: View {
    @Bindable var state: AppState
    @AppStorage(cameraEnabledKey) private var cameraEnabled: Bool = false
    private let healthStore = HealthStore.shared
    private let gatewayManager = GatewayProcessManager.shared
    @State private var gatewayDiscovery = GatewayDiscoveryModel(
        localDisplayName: InstanceIdentity.displayName)
    @State private var gatewayStatus: GatewayEnvironmentStatus = .checking
    @State private var remoteStatus: RemoteStatus = .idle
    @State private var installingCLI = false
    @State private var cliInstallStatus: String?
    @State private var cliInstallLocation: String?
    @State private var didAutoInstallCLIForLocalMode = false
    @State private var showRemoteAdvanced = false
    private let isPreview = ProcessInfo.processInfo.isPreview
    private var isNixMode: Bool {
        ProcessInfo.processInfo.isNixMode
    }

    private var remoteLabelWidth: CGFloat {
        88
    }

    private var languageBinding: Binding<OnboardingLanguage> {
        Binding(
            get: { self.state.onboardingLanguage ?? .fallback },
            set: { self.state.onboardingLanguage = $0 })
    }

    var body: some View {
        let language = self.state.effectiveOnboardingLanguage
        ScrollView(.vertical) {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 12) {
                    SettingsToggleRow(
                        title: macLocalized("Maumau active", language: language),
                        subtitle: macLocalized(
                            "Pause to stop the Maumau gateway; no messages will be processed.",
                            language: language),
                        binding: self.activeBinding)

                    self.connectionSection

                    self.languageSection

                    Divider()

                    SettingsToggleRow(
                        title: macLocalized("Launch at login", language: language),
                        subtitle: macLocalized("Automatically start Maumau after you sign in.", language: language),
                        binding: self.$state.launchAtLogin)

                    SettingsToggleRow(
                        title: macLocalized("Show Dock icon", language: language),
                        subtitle: macLocalized(
                            "Keep Maumau visible in the Dock instead of menu-bar-only mode.",
                            language: language),
                        binding: self.$state.showDockIcon)

                    SettingsToggleRow(
                        title: macLocalized("Play menu bar icon animations", language: language),
                        subtitle: macLocalized("Enable idle blinks and wiggles on the status icon.", language: language),
                        binding: self.$state.iconAnimationsEnabled)

                    SettingsToggleRow(
                        title: macLocalized("Allow Canvas", language: language),
                        subtitle: macLocalized("Allow the agent to show and control the Canvas panel.", language: language),
                        binding: self.$state.canvasEnabled)

                    SettingsToggleRow(
                        title: macLocalized("Allow Camera", language: language),
                        subtitle: macLocalized(
                            "Allow the agent to capture a photo or short video via the built-in camera.",
                            language: language),
                        binding: self.$cameraEnabled)

                    if PeekabooBridgeHostCoordinator.isAvailable {
                        SettingsToggleRow(
                            title: macLocalized("Enable Peekaboo Bridge", language: language),
                            subtitle: macLocalized(
                                "Allow signed tools (e.g. `peekaboo`) to drive UI automation via PeekabooBridge.",
                                language: language),
                            binding: self.$state.peekabooBridgeEnabled)
                    }

                    SettingsToggleRow(
                        title: macLocalized("Enable debug tools", language: language),
                        subtitle: macLocalized("Show the Debug tab with development utilities.", language: language),
                        binding: self.$state.debugPaneEnabled)
                }

                Spacer(minLength: 12)
                HStack {
                    Spacer()
                    Button(macLocalized("Quit Maumau", language: language)) { NSApp.terminate(nil) }
                        .buttonStyle(.borderedProminent)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 22)
            .padding(.bottom, 16)
        }
        .onAppear {
            guard !self.isPreview else { return }
            self.refreshGatewayStatus()
        }
        .onChange(of: self.state.connectionMode) { _, newValue in
            if newValue != .local {
                self.didAutoInstallCLIForLocalMode = false
            }
            guard !self.isPreview else { return }
            self.refreshGatewayStatus()
        }
        .onChange(of: self.state.onboardingLanguage) { _, newValue in
            guard !self.isPreview, let newValue else { return }
            Task { await SessionActions.syncReplyLanguagePreference(newValue) }
        }
        .onChange(of: self.state.canvasEnabled) { _, enabled in
            if !enabled {
                CanvasManager.shared.hideAll()
            }
        }
    }

    private var activeBinding: Binding<Bool> {
        Binding(
            get: { !self.state.isPaused },
            set: { self.state.isPaused = !$0 })
    }

    private var connectionSection: some View {
        let language = self.state.effectiveOnboardingLanguage
        return VStack(alignment: .leading, spacing: 10) {
            Text(macLocalized("Maumau runs", language: language))
                .font(.title3.weight(.semibold))
                .frame(maxWidth: .infinity, alignment: .leading)

            Picker("Mode", selection: self.$state.connectionMode) {
                Text(macLocalized("Not configured", language: language)).tag(AppState.ConnectionMode.unconfigured)
                Text(macLocalized("Local (this Mac)", language: language)).tag(AppState.ConnectionMode.local)
                Text(macLocalized("Remote (another host)", language: language)).tag(AppState.ConnectionMode.remote)
            }
            .pickerStyle(.menu)
            .labelsHidden()
            .frame(width: 260, alignment: .leading)

            if self.state.connectionMode == .unconfigured {
                Text(macLocalized("Pick Local or Remote to start the Gateway.", language: language))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if self.state.connectionMode == .local {
                // In Nix mode, gateway is managed declaratively - no install buttons.
                if !self.isNixMode {
                    self.gatewayInstallerCard
                }
                TailscaleIntegrationSection(
                    connectionMode: self.state.connectionMode,
                    isPaused: self.state.isPaused)
                self.healthRow
            }

            if self.state.connectionMode == .remote {
                self.remoteCard
            }
        }
    }

    private var languageSection: some View {
        let language = self.state.effectiveOnboardingLanguage
        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(macLocalized("Language", language: language))
                    .font(.callout.weight(.semibold))
                    .frame(width: self.remoteLabelWidth, alignment: .leading)

                Picker(macLocalized("Language", language: language), selection: self.languageBinding) {
                    ForEach(OnboardingLanguage.allCases, id: \.rawValue) { option in
                        Text(option.nativeName).tag(option)
                    }
                }
                .labelsHidden()
                .frame(width: 260, alignment: .leading)
            }

            HStack(spacing: 10) {
                Color.clear.frame(width: self.remoteLabelWidth, height: 1)
                Text(macLocalized(
                    "Use the same language for the Maumau app and chat replies.",
                    language: language))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var remoteCard: some View {
        let language = self.state.effectiveOnboardingLanguage
        return VStack(alignment: .leading, spacing: 10) {
            self.remoteTransportRow

            if self.state.remoteTransport == .ssh {
                self.remoteSshRow
            } else {
                self.remoteDirectRow
            }
            self.remoteTokenRow

            GatewayDiscoveryInlineList(
                discovery: self.gatewayDiscovery,
                currentTarget: self.state.remoteTarget,
                currentUrl: self.state.remoteUrl,
                transport: self.state.remoteTransport)
            { gateway in
                self.applyDiscoveredGateway(gateway)
            }
            .padding(.leading, self.remoteLabelWidth + 10)

            self.remoteStatusView
                .padding(.leading, self.remoteLabelWidth + 10)

            if self.state.remoteTransport == .ssh {
                DisclosureGroup(isExpanded: self.$showRemoteAdvanced) {
                    VStack(alignment: .leading, spacing: 8) {
                        LabeledContent(macLocalized("Identity file", language: language)) {
                            TextField("/Users/you/.ssh/id_ed25519", text: self.$state.remoteIdentity)
                                .textFieldStyle(.roundedBorder)
                                .frame(width: 280)
                        }
                        LabeledContent(macLocalized("Project root", language: language)) {
                            TextField("/home/you/Projects/maumau", text: self.$state.remoteProjectRoot)
                                .textFieldStyle(.roundedBorder)
                                .frame(width: 280)
                        }
                        LabeledContent(macLocalized("CLI path", language: language)) {
                            TextField("/Applications/Maumau.app/.../maumau", text: self.$state.remoteCliPath)
                                .textFieldStyle(.roundedBorder)
                                .frame(width: 280)
                        }
                    }
                    .padding(.top, 4)
                } label: {
                    Text(macLocalized("Advanced", language: language))
                        .font(.callout.weight(.semibold))
                }
            }

            // Diagnostics
            VStack(alignment: .leading, spacing: 4) {
                Text(macLocalized("Control channel", language: language))
                    .font(.caption.weight(.semibold))
                if !self.isControlStatusDuplicate || ControlChannel.shared.lastPingMs != nil {
                    let status = self.isControlStatusDuplicate ? nil : self.controlStatusLine
                    let ping = ControlChannel.shared.lastPingMs.map { "Ping \(Int($0)) ms" }
                    let line = [status, ping].compactMap(\.self).joined(separator: " · ")
                    if !line.isEmpty {
                        Text(line)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                if let hb = HeartbeatStore.shared.lastEvent {
                    let ageText = age(from: Date(timeIntervalSince1970: hb.ts / 1000))
                    Text("\(macLocalized("Last heartbeat", language: language)): \(hb.status) · \(ageText)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if let authLabel = ControlChannel.shared.authSourceLabel {
                    Text(authLabel)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if self.state.remoteTransport == .ssh {
                Text(macLocalized("Tip: enable Tailscale for stable remote access.", language: language))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            } else {
                Text(macLocalized("Tip: use Tailscale Serve so the gateway has a valid HTTPS cert.", language: language))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .transition(.opacity)
        .onAppear { self.gatewayDiscovery.start() }
        .onDisappear { self.gatewayDiscovery.stop() }
    }

    private var remoteTransportRow: some View {
        HStack(alignment: .center, spacing: 10) {
            Text(macLocalized("Transport", language: self.state.effectiveOnboardingLanguage))
                .font(.callout.weight(.semibold))
                .frame(width: self.remoteLabelWidth, alignment: .leading)
            Picker("Transport", selection: self.$state.remoteTransport) {
                Text(macLocalized("SSH tunnel", language: self.state.effectiveOnboardingLanguage))
                    .tag(AppState.RemoteTransport.ssh)
                Text(macLocalized("Direct (ws/wss)", language: self.state.effectiveOnboardingLanguage))
                    .tag(AppState.RemoteTransport.direct)
            }
            .pickerStyle(.segmented)
            .frame(maxWidth: 320)
        }
    }

    private var remoteSshRow: some View {
        let trimmedTarget = self.state.remoteTarget.trimmingCharacters(in: .whitespacesAndNewlines)
        let validationMessage = CommandResolver.sshTargetValidationMessage(trimmedTarget)
        let canTest = !trimmedTarget.isEmpty && validationMessage == nil

        return VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .center, spacing: 10) {
                Text(macLocalized("SSH target", language: self.state.effectiveOnboardingLanguage))
                    .font(.callout.weight(.semibold))
                    .frame(width: self.remoteLabelWidth, alignment: .leading)
                TextField("user@host[:22]", text: self.$state.remoteTarget)
                    .textFieldStyle(.roundedBorder)
                    .frame(maxWidth: .infinity)
                self.remoteTestButton(disabled: !canTest)
            }
            if let validationMessage {
                Text(validationMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .padding(.leading, self.remoteLabelWidth + 10)
            }
        }
    }

    private var remoteDirectRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .center, spacing: 10) {
                Text(macLocalized("Gateway", language: self.state.effectiveOnboardingLanguage))
                    .font(.callout.weight(.semibold))
                    .frame(width: self.remoteLabelWidth, alignment: .leading)
                TextField("wss://gateway.example.ts.net", text: self.$state.remoteUrl)
                    .textFieldStyle(.roundedBorder)
                    .frame(maxWidth: .infinity)
                self.remoteTestButton(
                    disabled: self.state.remoteUrl.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            Text(
                self.state.effectiveOnboardingLanguage == .en
                    ? "Direct mode requires wss:// for remote hosts. ws:// is only allowed for localhost/127.0.0.1."
                    : "Mode langsung memerlukan wss:// untuk host remote. ws:// hanya diizinkan untuk localhost/127.0.0.1.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.leading, self.remoteLabelWidth + 10)
        }
    }

    private var remoteTokenRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .center, spacing: 10) {
                Text(macLocalized("Gateway token", language: self.state.effectiveOnboardingLanguage))
                    .font(.callout.weight(.semibold))
                    .frame(width: self.remoteLabelWidth, alignment: .leading)
                SecureField("remote gateway auth token (gateway.remote.token)", text: self.$state.remoteToken)
                    .textFieldStyle(.roundedBorder)
                    .frame(maxWidth: .infinity)
            }
            Text(macLocalized("Used when the remote gateway requires token auth.", language: self.state.effectiveOnboardingLanguage))
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.leading, self.remoteLabelWidth + 10)
            if self.state.remoteTokenUnsupported {
                Text(
                    macLocalized(
                        "The current gateway.remote.token value is not plain text. Maumau for macOS cannot use it directly; enter a plaintext token here to replace it.",
                        language: self.state.effectiveOnboardingLanguage))
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .padding(.leading, self.remoteLabelWidth + 10)
            }
        }
    }

    private func remoteTestButton(disabled: Bool) -> some View {
        Button {
            Task { await self.testRemote() }
        } label: {
            if self.remoteStatus == .checking {
                ProgressView().controlSize(.small)
            } else {
                Text(macLocalized("Test remote", language: self.state.effectiveOnboardingLanguage))
            }
        }
        .buttonStyle(.borderedProminent)
        .disabled(self.remoteStatus == .checking || disabled)
    }

    private var controlStatusLine: String {
        switch ControlChannel.shared.state {
        case .connected: macLocalized("Connected", language: self.state.effectiveOnboardingLanguage)
        case .connecting: macLocalized("Connecting…", language: self.state.effectiveOnboardingLanguage)
        case .disconnected: macLocalized("Disconnected", language: self.state.effectiveOnboardingLanguage)
        case let .degraded(msg): msg
        }
    }

    @ViewBuilder
    private var remoteStatusView: some View {
        switch self.remoteStatus {
        case .idle:
            EmptyView()
        case .checking:
            Text(macLocalized("Testing…", language: self.state.effectiveOnboardingLanguage))
                .font(.caption)
                .foregroundStyle(.secondary)
        case let .ok(success):
            VStack(alignment: .leading, spacing: 2) {
                Label(
                    macGatewayStatusTitle(success.title, language: self.state.effectiveOnboardingLanguage),
                    systemImage: "checkmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(.green)
                if let detail = macGatewayStatusDetail(success.detail, language: self.state.effectiveOnboardingLanguage) {
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        case let .failed(message):
            Text(message)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
    }

    private var isControlStatusDuplicate: Bool {
        guard case let .failed(message) = self.remoteStatus else { return false }
        return message == self.controlStatusLine
    }

    private var gatewayInstallerCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Circle()
                    .fill(self.gatewayStatusColor)
                    .frame(width: 10, height: 10)
                Text(self.gatewayStatus.message)
                    .font(.callout)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            if let gatewayVersion = self.gatewayStatus.gatewayVersion,
               let required = self.gatewayStatus.requiredGateway,
               gatewayVersion != required
            {
                Text(macInstalledRequired(
                    installed: gatewayVersion,
                    required: required,
                    language: self.state.effectiveOnboardingLanguage))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else if let gatewayVersion = self.gatewayStatus.gatewayVersion {
                Text(macGatewayDetected(version: gatewayVersion, language: self.state.effectiveOnboardingLanguage))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let node = self.gatewayStatus.nodeVersion {
                Text("Node \(node)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if case let .attachedExisting(details) = self.gatewayManager.status {
                Text(details ?? macLocalized("Using existing gateway instance", language: self.state.effectiveOnboardingLanguage))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let failure = self.gatewayManager.lastFailureReason {
                Text(macLastFailure(failure, language: self.state.effectiveOnboardingLanguage))
                    .font(.caption)
                    .foregroundStyle(.red)
            }

            if let cliInstallStatus, !cliInstallStatus.isEmpty {
                Text(cliInstallStatus)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            } else if let cliInstallLocation {
                Text(macCliInstalledAt(cliInstallLocation, language: self.state.effectiveOnboardingLanguage))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: 10) {
                if self.shouldOfferCLIInstall {
                    Button {
                        Task { await self.installCLIFromSettings() }
                    } label: {
                        ZStack {
                            Text(self.cliInstallButtonTitle)
                                .opacity(self.installingCLI ? 0 : 1)
                            if self.installingCLI {
                                ProgressView()
                                    .controlSize(.small)
                            }
                        }
                        .frame(minWidth: 112)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(self.installingCLI)
                }

                Button(macLocalized("Recheck", language: self.state.effectiveOnboardingLanguage)) {
                    self.refreshGatewayStatus()
                }
                    .buttonStyle(.bordered)
                    .disabled(self.installingCLI)
            }

            Text(macLaunchdAutostart(gatewayLaunchdLabel, language: self.state.effectiveOnboardingLanguage))
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
        .padding(12)
        .background(Color.gray.opacity(0.08))
        .cornerRadius(10)
    }

    private func refreshGatewayStatus() {
        Task { @MainActor in
            let status = await Task.detached(priority: .utility) {
                GatewayEnvironment.check()
            }.value
            self.gatewayStatus = status
            self.cliInstallLocation = CLIInstaller.installedLocation()
            if self.state.connectionMode == .local {
                await self.healthStore.refresh(onDemand: true)
                if self.healthStore.lastError == nil {
                    // Clear stale attach/start failures once the gateway responds again.
                    self.gatewayManager.clearLastFailure()
                }
            }
            self.maybeAutoInstallCLIForLocalMode()
        }
    }

    private var shouldOfferCLIInstall: Bool {
        switch self.gatewayStatus.kind {
        case .missingNode, .missingGateway, .incompatible:
            return true
        case .checking, .ok, .error:
            return self.cliInstallLocation == nil
        }
    }

    private var cliInstallButtonTitle: String {
        self.cliInstallLocation == nil
            ? macLocalized("Install CLI", language: self.state.effectiveOnboardingLanguage)
            : macLocalized("Reinstall CLI", language: self.state.effectiveOnboardingLanguage)
    }

    private static func shouldAutoInstallCLIForLocalMode(
        connectionMode: AppState.ConnectionMode,
        isNixMode: Bool,
        cliInstallLocation: String?,
        installingCLI: Bool,
        didAutoInstallCLI: Bool) -> Bool
    {
        connectionMode == .local &&
            !isNixMode &&
            cliInstallLocation == nil &&
            !installingCLI &&
            !didAutoInstallCLI
    }

    private func maybeAutoInstallCLIForLocalMode() {
        guard Self.shouldAutoInstallCLIForLocalMode(
            connectionMode: self.state.connectionMode,
            isNixMode: self.isNixMode,
            cliInstallLocation: self.cliInstallLocation,
            installingCLI: self.installingCLI,
            didAutoInstallCLI: self.didAutoInstallCLIForLocalMode)
        else {
            return
        }

        self.didAutoInstallCLIForLocalMode = true
        Task { await self.installCLIFromSettings() }
    }

    @MainActor
    private func installCLIFromSettings() async {
        guard !self.installingCLI else { return }
        self.installingCLI = true
        self.cliInstallStatus = nil
        defer { self.installingCLI = false }

        await CLIInstaller.install { message in
            self.cliInstallStatus = message
        }

        self.cliInstallLocation = CLIInstaller.installedLocation()
        self.refreshGatewayStatus()
    }

    private var gatewayStatusColor: Color {
        switch self.gatewayStatus.kind {
        case .ok: .green
        case .checking: .secondary
        case .missingNode, .missingGateway, .incompatible, .error: .orange
        }
    }

    private var healthCard: some View {
        let snapshot = self.healthStore.snapshot
        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Circle()
                    .fill(self.healthStore.state.tint)
                    .frame(width: 10, height: 10)
                Text(self.healthStore.summaryLine)
                    .font(.callout.weight(.semibold))
            }

            if let snap = snapshot {
                let linkId = snap.channelOrder?.first(where: {
                    if let summary = snap.channels[$0] { return summary.linked != nil }
                    return false
                }) ?? snap.channels.keys.first(where: {
                    if let summary = snap.channels[$0] { return summary.linked != nil }
                    return false
                })
                let linkLabel =
                    linkId.flatMap { snap.channelLabels?[$0] } ??
                    linkId?.capitalized ??
                    "Link channel"
                let linkAge = linkId.flatMap { snap.channels[$0]?.authAgeMs }
                Text(macHealthAuthAge(
                    label: linkLabel,
                    age: healthAgeString(linkAge),
                    language: self.state.effectiveOnboardingLanguage))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(macSessionStoreStatus(
                    path: snap.sessions.path,
                    count: snap.sessions.count,
                    language: self.state.effectiveOnboardingLanguage))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if let recent = snap.sessions.recent.first {
                    let lastActivity = recent.updatedAt != nil
                        ? relativeAge(from: Date(timeIntervalSince1970: (recent.updatedAt ?? 0) / 1000))
                        : "unknown"
                    Text(macLastActivity(
                        key: recent.key,
                        age: lastActivity,
                        language: self.state.effectiveOnboardingLanguage))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Text("\(macLocalized("Last check", language: self.state.effectiveOnboardingLanguage)): \(relativeAge(from: self.healthStore.lastSuccess))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else if let error = self.healthStore.lastError {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
            } else {
                Text(macLocalized("Health check pending…", language: self.state.effectiveOnboardingLanguage))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            HStack(spacing: 12) {
                Button {
                    Task { await self.healthStore.refresh(onDemand: true) }
                } label: {
                    if self.healthStore.isRefreshing {
                        ProgressView().controlSize(.small)
                    } else {
                        Label(
                            macLocalized("Run Health Check", language: self.state.effectiveOnboardingLanguage),
                            systemImage: "arrow.clockwise")
                    }
                }
                .disabled(self.healthStore.isRefreshing)

                Divider().frame(height: 18)

                Button {
                    self.revealLogs()
                } label: {
                    Label(
                        macLocalized("Reveal Logs", language: self.state.effectiveOnboardingLanguage),
                        systemImage: "doc.text.magnifyingglass")
                }
            }
        }
        .padding(12)
        .background(Color.gray.opacity(0.08))
        .cornerRadius(10)
    }
}

private enum RemoteStatus: Equatable {
    case idle
    case checking
    case ok(RemoteGatewayProbeSuccess)
    case failed(String)
}

extension GeneralSettings {
    private var healthRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                Circle()
                    .fill(self.healthStore.state.tint)
                    .frame(width: 10, height: 10)
                Text(self.healthStore.summaryLine)
                    .font(.callout)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            Text(macLocalized(
                "Checks that the Gateway responds and that your linked channel still looks signed in.",
                language: self.state.effectiveOnboardingLanguage))
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            if let detail = self.healthStore.detailLine {
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: 10) {
                Button(macLocalized("Check now", language: self.state.effectiveOnboardingLanguage)) {
                    Task { await HealthStore.shared.refresh(onDemand: true) }
                }
                .disabled(self.healthStore.isRefreshing)

                Button(macLocalized("Open logs", language: self.state.effectiveOnboardingLanguage)) {
                    self.revealLogs()
                }
                    .buttonStyle(.link)
                    .foregroundStyle(.secondary)
            }
            .font(.caption)
        }
    }

    @MainActor
    func testRemote() async {
        self.remoteStatus = .checking
        switch await RemoteGatewayProbe.run() {
        case let .ready(success):
            self.remoteStatus = .ok(success)
        case let .authIssue(issue):
            self.remoteStatus = .failed(
                macAuthIssueText(issue.statusMessage, language: self.state.effectiveOnboardingLanguage))
        case let .failed(message):
            self.remoteStatus = .failed(macLocalized(message, language: self.state.effectiveOnboardingLanguage))
        }
    }

    private func revealLogs() {
        let target = LogLocator.bestLogFile()

        if let target {
            NSWorkspace.shared.selectFile(
                target.path,
                inFileViewerRootedAtPath: target.deletingLastPathComponent().path)
            return
        }

        let alert = NSAlert()
        alert.messageText = macLocalized("Log file not found", language: self.state.effectiveOnboardingLanguage)
        alert.informativeText = macLocalized(
            """
            Looked for maumau logs in /tmp/maumau/.
            Run a health check or send a message to generate activity, then try again.
            """,
            language: self.state.effectiveOnboardingLanguage)
        alert.alertStyle = .informational
        alert.addButton(withTitle: macLocalized("OK", language: self.state.effectiveOnboardingLanguage))
        alert.runModal()
    }

    private func applyDiscoveredGateway(_ gateway: GatewayDiscoveryModel.DiscoveredGateway) {
        MacNodeModeCoordinator.shared.setPreferredGatewayStableID(gateway.stableID)
        GatewayDiscoverySelectionSupport.applyRemoteSelection(gateway: gateway, state: self.state)
    }
}

private func healthAgeString(_ ms: Double?) -> String {
    guard let ms else { return "unknown" }
    return msToAge(ms)
}

#if DEBUG
struct GeneralSettings_Previews: PreviewProvider {
    static var previews: some View {
        GeneralSettings(state: .preview)
            .frame(width: SettingsTab.windowWidth, height: SettingsTab.windowHeight)
            .environment(TailscaleService.shared)
    }
}

@MainActor
extension GeneralSettings {
    static func exerciseForTesting() {
        let state = AppState(preview: true)
        state.connectionMode = .remote
        state.remoteTransport = .ssh
        state.remoteTarget = "user@host:2222"
        state.remoteUrl = "wss://gateway.example.ts.net"
        state.remoteToken = "example-token"
        state.remoteIdentity = "/tmp/id_ed25519"
        state.remoteProjectRoot = "/tmp/maumau"
        state.remoteCliPath = "/tmp/maumau"

        let view = GeneralSettings(state: state)
        view.gatewayStatus = GatewayEnvironmentStatus(
            kind: .ok,
            nodeVersion: "1.0.0",
            gatewayVersion: "1.0.0",
            requiredGateway: nil,
            message: "Gateway ready")
        view.remoteStatus = .failed("SSH failed")
        view.showRemoteAdvanced = true
        _ = view.body

        state.connectionMode = .unconfigured
        _ = view.body

        state.connectionMode = .local
        view.gatewayStatus = GatewayEnvironmentStatus(
            kind: .error("Gateway offline"),
            nodeVersion: nil,
            gatewayVersion: nil,
            requiredGateway: nil,
            message: "Gateway offline")
        _ = view.body
    }
}
#endif
