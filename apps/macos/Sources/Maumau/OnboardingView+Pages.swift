import AppKit
import MaumauChatUI
import MaumauDiscovery
import MaumauIPC
import MaumauKit
import SwiftUI

struct OnboardingToolHighlight: Identifiable, Equatable {
    let title: String
    let subtitle: String
    let systemImage: String

    var id: String {
        self.title
    }
}

extension OnboardingView {
    @ViewBuilder
    func pageView(for pageIndex: Int) -> some View {
        Group {
            switch pageIndex {
            case 0:
                self.welcomePage()
            case 1:
                self.connectionPage()
            case 3:
                self.wizardPage()
            case 5:
                self.permissionsPage()
            case 6:
                self.cliPage()
            case 7:
                self.workspacePage()
            case 8:
                self.onboardingChatPage()
            case 10:
                self.channelsSetupPage()
            case 12:
                self.privateAccessPage()
            case 11:
                self.skillsSetupPage()
            case 9:
                self.readyPage()
            default:
                EmptyView()
            }
        }
        .id("onboarding-page-\(pageIndex)")
    }

    func welcomePage() -> some View {
        let introText = self.state.connectionMode == .remote
            ? "Setup is simpler than it looks: set up the Gateway, then pick a Channel for messages."
            : "Setup is simpler than it looks: set up the Gateway, choose the brain, pick a Channel, then review Mac access and the included tools."
        return self.onboardingPage(pageID: 0) {
            VStack(spacing: 22) {
                Text("Welcome to Maumau")
                    .font(.largeTitle.weight(.semibold))
                Text(introText)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 560)
                    .fixedSize(horizontal: false, vertical: true)

                self.onboardingCard(spacing: 12, padding: 16) {
                    Text("Here’s what the next steps mean")
                        .font(.headline)

                    ForEach(Array(self.setupStepDefinitions.enumerated()), id: \.element.pageID) { index, step in
                        if index > 0 {
                            Divider()
                        }
                        OnboardingMeaningCard(
                            stage: step.stage,
                            title: step.title,
                            bodyText: step.bodyText,
                            badges: step.badges,
                            detailNote: step.preparationNote)
                    }

                    Divider()

                    Text("Required steps are marked Required. Optional steps can be done later. Needs prep means you may need another app, account, or device ready for that step.")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: 560)

                self.onboardingCard(spacing: 10, padding: 14) {
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(Color(nsColor: .systemOrange))
                            .frame(width: 22)
                            .padding(.top, 1)

                        VStack(alignment: .leading, spacing: 6) {
                            Text("Security notice")
                                .font(.headline)
                            Text(
                                "Maumau can do real things on your Mac if you turn them on, like run commands, read or change files, and take screenshots.\n\n" +
                                    "Only continue if that makes sense to you and you trust the AI and tools you connect.")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .frame(maxWidth: 560)
            }
            .padding(.top, 16)
        }
    }

    func connectionPage() -> some View {
        self.onboardingPage(pageID: 1) {
            Text("Set up the Gateway")
                .font(.largeTitle.weight(.semibold))
            Text(
                "Gateway means Maumau's home. Most people choose This Mac, which means this computer keeps the tools and does the work here."
            )
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 520)
                .fixedSize(horizontal: false, vertical: true)

            self.onboardingCard(spacing: 12, padding: 16) {
                OnboardingMeaningCard(
                    stage: .home,
                    title: OnboardingHeaderStage.home.explainerTitle,
                    bodyText: OnboardingHeaderStage.home.explainerBody,
                    badges: self.setupStepDefinition(for: self.connectionPageIndex)?.badges ?? [],
                    detailNote: self.setupStepDefinition(for: self.connectionPageIndex)?.preparationNote)
            }

            self.onboardingCard(spacing: 12, padding: 14) {
                VStack(alignment: .leading, spacing: 10) {
                    self.featureRow(
                        title: "This Mac",
                        subtitle: self.localGatewaySubtitle,
                        systemImage: "desktopcomputer")

                    self.localSetupStatusSection()
                }
            }
        }
        .onChange(of: self.state.connectionMode) { _, newValue in
            guard Self.shouldResetRemoteProbeFeedback(
                for: newValue,
                suppressReset: self.suppressRemoteProbeReset)
            else { return }
            self.resetRemoteProbeFeedback()
        }
        .onChange(of: self.state.remoteTransport) { _, _ in
            self.resetRemoteProbeFeedback()
        }
        .onChange(of: self.state.remoteTarget) { _, _ in
            self.resetRemoteProbeFeedback()
        }
        .onChange(of: self.state.remoteUrl) { _, _ in
            self.resetRemoteProbeFeedback()
        }
    }

    private var localGatewaySubtitle: String {
        if self.installingCLI {
            return "Getting this Mac ready so Maumau can live and work here…"
        }
        if self.isCheckingLocalGatewaySetup {
            return "Checking whether this Mac already has the helper tools Maumau needs…"
        }
        if self.localGatewaySetupAvailable {
            if let probe = self.localGatewayProbe {
                let base = probe.expected
                    ? "Existing local gateway detected"
                    : "Port \(probe.port) already in use"
                let command = probe.command.isEmpty ? "" : " (\(probe.command) pid \(probe.pid))"
                return "\(base)\(command). Maumau will attach automatically."
            }
            return "Recommended. Maumau can use this Mac as its home and finish setup for you."
        }
        guard let probe = self.localGatewayProbe else {
            return "Recommended. Maumau will install what it needs and make this Mac its home automatically."
        }
        let base = probe.expected
            ? "Existing gateway detected"
            : "Port \(probe.port) already in use"
        let command = probe.command.isEmpty ? "" : " (\(probe.command) pid \(probe.pid))"
        return "\(base)\(command). Will attach."
    }

    @ViewBuilder
    private func localSetupStatusSection() -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if self.installingCLI {
                HStack(spacing: 8) {
                    ProgressView()
                        .controlSize(.small)
                    Text("Preparing this Mac…")
                        .font(.caption.weight(.semibold))
                }
                if let cliStatus, !cliStatus.isEmpty {
                    Text(cliStatus)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else if self.isCheckingLocalGatewaySetup {
                HStack(spacing: 8) {
                    ProgressView()
                        .controlSize(.small)
                    Text("Checking the helper tools this Mac needs…")
                        .font(.caption.weight(.semibold))
                }
                Text("If Node 22+ is already here, Maumau can keep going without reinstalling anything.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            } else if !self.localGatewaySetupAvailable {
                Text("Maumau is getting this Mac ready before the next step.")
                    .font(.caption.weight(.semibold))
                if let cliStatus, !cliStatus.isEmpty {
                    Text(cliStatus)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Button("Retry local setup") {
                    Task { await self.installCLI() }
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            } else if let cliInstallLocation, !cliInstallLocation.isEmpty {
                Label("Local CLI ready at \(cliInstallLocation)", systemImage: "checkmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(.green)
            } else {
                Text("This Mac is ready. Continue to the brain setup.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.leading, 4)
    }

    @ViewBuilder
    private func gatewayDiscoverySection() -> some View {
        HStack(spacing: 8) {
            Image(systemName: "dot.radiowaves.left.and.right")
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(self.gatewayDiscovery.statusText)
                .font(.caption)
                .foregroundStyle(.secondary)
            if self.gatewayDiscovery.gateways.isEmpty {
                ProgressView().controlSize(.small)
                Button("Refresh") {
                    self.gatewayDiscovery.refreshRemoteFallbackNow(timeoutSeconds: 5.0)
                }
                .buttonStyle(.link)
                .help("Retry remote discovery (Tailscale DNS-SD + Serve probe).")
            }
            Spacer(minLength: 0)
        }

        if self.gatewayDiscovery.gateways.isEmpty {
            Text("Searching for nearby gateways…")
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.leading, 4)
        } else {
            VStack(alignment: .leading, spacing: 6) {
                Text("Nearby gateways")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.leading, 4)
                ForEach(self.gatewayDiscovery.gateways.prefix(6)) { gateway in
                    self.connectionChoiceButton(
                        title: gateway.displayName,
                        subtitle: self.gatewaySubtitle(for: gateway),
                        selected: self.isSelectedGateway(gateway))
                    {
                        self.selectRemoteGateway(gateway)
                    }
                }
            }
            .padding(8)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(Color(NSColor.controlBackgroundColor)))
        }
    }

    @ViewBuilder
    private func advancedConnectionSection() -> some View {
        let buttonTitle =
            self.state.connectionMode == .remote || self.showAdvancedConnection
            ? (self.showAdvancedConnection ? "Hide advanced remote fields" : "Advanced remote fields")
            : "Connect to an existing gateway instead"

        Button(buttonTitle) {
            withAnimation(.spring(response: 0.25, dampingFraction: 0.9)) {
                self.showAdvancedConnection.toggle()
            }
            if self.showAdvancedConnection, self.state.connectionMode != .remote {
                self.state.connectionMode = .remote
            }
        }
        .buttonStyle(.link)

        if self.showAdvancedConnection {
            let labelWidth: CGFloat = 110
            let fieldWidth: CGFloat = 320

            VStack(alignment: .leading, spacing: 10) {
                Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 8) {
                    GridRow {
                        Text("Transport")
                            .font(.callout.weight(.semibold))
                            .frame(width: labelWidth, alignment: .leading)
                        Picker("Transport", selection: self.$state.remoteTransport) {
                            Text("SSH tunnel").tag(AppState.RemoteTransport.ssh)
                            Text("Direct (ws/wss)").tag(AppState.RemoteTransport.direct)
                        }
                        .pickerStyle(.segmented)
                        .frame(width: fieldWidth)
                    }
                    if self.state.remoteTransport == .direct {
                        GridRow {
                            Text("Gateway URL")
                                .font(.callout.weight(.semibold))
                                .frame(width: labelWidth, alignment: .leading)
                            TextField("wss://gateway.example.ts.net", text: self.$state.remoteUrl)
                                .textFieldStyle(.roundedBorder)
                                .frame(width: fieldWidth)
                        }
                    }
                    if self.state.remoteTransport == .ssh {
                        GridRow {
                            Text("SSH target")
                                .font(.callout.weight(.semibold))
                                .frame(width: labelWidth, alignment: .leading)
                            TextField("user@host[:port]", text: self.$state.remoteTarget)
                                .textFieldStyle(.roundedBorder)
                                .frame(width: fieldWidth)
                        }
                        if let message = CommandResolver
                            .sshTargetValidationMessage(self.state.remoteTarget)
                        {
                            GridRow {
                                Text("")
                                    .frame(width: labelWidth, alignment: .leading)
                                Text(message)
                                    .font(.caption)
                                    .foregroundStyle(.red)
                                    .frame(width: fieldWidth, alignment: .leading)
                            }
                        }
                        GridRow {
                            Text("Identity file")
                                .font(.callout.weight(.semibold))
                                .frame(width: labelWidth, alignment: .leading)
                            TextField("/Users/you/.ssh/id_ed25519", text: self.$state.remoteIdentity)
                                .textFieldStyle(.roundedBorder)
                                .frame(width: fieldWidth)
                        }
                        GridRow {
                            Text("Project root")
                                .font(.callout.weight(.semibold))
                                .frame(width: labelWidth, alignment: .leading)
                            TextField("/home/you/Projects/maumau", text: self.$state.remoteProjectRoot)
                                .textFieldStyle(.roundedBorder)
                                .frame(width: fieldWidth)
                        }
                        GridRow {
                            Text("CLI path")
                                .font(.callout.weight(.semibold))
                                .frame(width: labelWidth, alignment: .leading)
                            TextField(
                                "/Applications/Maumau.app/.../maumau",
                                text: self.$state.remoteCliPath)
                                .textFieldStyle(.roundedBorder)
                                .frame(width: fieldWidth)
                        }
                    }
                }

                Text(self.state.remoteTransport == .direct
                    ? "Tip: use Tailscale Serve so the gateway has a valid HTTPS cert."
                    : "Tip: keep Tailscale enabled so your gateway stays reachable.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            .transition(.opacity.combined(with: .move(edge: .top)))
        }
    }

    private var shouldShowRemoteConnectionSection: Bool {
        self.state.connectionMode == .remote ||
            self.showAdvancedConnection ||
            self.remoteProbeState != .idle ||
            self.remoteAuthIssue != nil ||
            Self.shouldShowRemoteTokenField(
                showAdvancedConnection: self.showAdvancedConnection,
                remoteToken: self.state.remoteToken,
                remoteTokenUnsupported: self.state.remoteTokenUnsupported,
                authIssue: self.remoteAuthIssue)
    }

    private var shouldShowRemoteTokenField: Bool {
        guard self.shouldShowRemoteConnectionSection else { return false }
        return Self.shouldShowRemoteTokenField(
            showAdvancedConnection: self.showAdvancedConnection,
            remoteToken: self.state.remoteToken,
            remoteTokenUnsupported: self.state.remoteTokenUnsupported,
            authIssue: self.remoteAuthIssue)
    }

    private var remoteProbePreflightMessage: String? {
        switch self.state.remoteTransport {
        case .direct:
            let trimmedUrl = self.state.remoteUrl.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmedUrl.isEmpty {
                return "Select a nearby gateway or open Advanced to enter a gateway URL."
            }
            if GatewayRemoteConfig.normalizeGatewayUrl(trimmedUrl) == nil {
                return "Gateway URL must use wss:// for remote hosts (ws:// only for localhost)."
            }
            return nil
        case .ssh:
            let trimmedTarget = self.state.remoteTarget.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmedTarget.isEmpty {
                return "Select a nearby gateway or open Advanced to enter an SSH target."
            }
            return CommandResolver.sshTargetValidationMessage(trimmedTarget)
        }
    }

    private var canProbeRemoteConnection: Bool {
        self.remoteProbePreflightMessage == nil && self.remoteProbeState != .checking
    }

    private func remoteConnectionSection() -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Remote connection")
                        .font(.callout.weight(.semibold))
                    Text("Checks the real remote websocket and auth handshake.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                Button {
                    Task { await self.probeRemoteConnection() }
                } label: {
                    if self.remoteProbeState == .checking {
                        ProgressView()
                            .controlSize(.small)
                            .frame(minWidth: 120)
                    } else {
                        Text("Check connection")
                            .frame(minWidth: 120)
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(!self.canProbeRemoteConnection)
            }

            if self.shouldShowRemoteTokenField {
                self.remoteTokenField()
            }

            if let message = self.remoteProbePreflightMessage, self.remoteProbeState != .checking {
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            self.remoteProbeStatusView()

            if let issue = self.remoteAuthIssue {
                self.remoteAuthPromptView(issue: issue)
            }
        }
    }

    private func remoteTokenField() -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .center, spacing: 12) {
                Text("Gateway token")
                    .font(.callout.weight(.semibold))
                    .frame(width: 110, alignment: .leading)
                SecureField("remote gateway auth token (gateway.remote.token)", text: self.$state.remoteToken)
                    .textFieldStyle(.roundedBorder)
                    .frame(maxWidth: 320)
            }
            Text("Used when the remote gateway requires token auth.")
                .font(.caption)
                .foregroundStyle(.secondary)
            if self.state.remoteTokenUnsupported {
                Text(
                    "The current gateway.remote.token value is not plain text. Maumau for macOS cannot use it directly; enter a plaintext token here to replace it.")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    @ViewBuilder
    private func remoteProbeStatusView() -> some View {
        switch self.remoteProbeState {
        case .idle:
            EmptyView()
        case .checking:
            Text("Checking remote gateway…")
                .font(.caption)
                .foregroundStyle(.secondary)
        case let .ok(success):
            VStack(alignment: .leading, spacing: 2) {
                Label(success.title, systemImage: "checkmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(.green)
                if let detail = success.detail {
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        case let .failed(message):
            if self.remoteAuthIssue == nil {
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func remoteAuthPromptView(issue: RemoteGatewayAuthIssue) -> some View {
        let promptStyle = Self.remoteAuthPromptStyle(for: issue)
        return HStack(alignment: .top, spacing: 10) {
            Image(systemName: promptStyle.systemImage)
                .font(.caption.weight(.semibold))
                .foregroundStyle(promptStyle.tint)
                .frame(width: 16, alignment: .center)
                .padding(.top, 1)
            VStack(alignment: .leading, spacing: 4) {
                Text(issue.title)
                    .font(.caption.weight(.semibold))
                Text(.init(issue.body))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                if let footnote = issue.footnote {
                    Text(.init(footnote))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    @MainActor
    private func probeRemoteConnection() async {
        let originalMode = self.state.connectionMode
        let shouldRestoreMode = originalMode != .remote
        if shouldRestoreMode {
            // Reuse the shared remote endpoint stack for probing without committing the user's mode choice.
            self.state.connectionMode = .remote
        }
        self.remoteProbeState = .checking
        self.remoteAuthIssue = nil
        defer {
            if shouldRestoreMode {
                self.suppressRemoteProbeReset = true
                self.state.connectionMode = originalMode
                self.suppressRemoteProbeReset = false
            }
        }

        switch await RemoteGatewayProbe.run() {
        case let .ready(success):
            self.remoteProbeState = .ok(success)
        case let .authIssue(issue):
            self.remoteAuthIssue = issue
            self.remoteProbeState = .failed(issue.statusMessage)
        case let .failed(message):
            self.remoteProbeState = .failed(message)
        }
    }

    private func resetRemoteProbeFeedback() {
        self.remoteProbeState = .idle
        self.remoteAuthIssue = nil
    }

    static func remoteAuthPromptStyle(
        for issue: RemoteGatewayAuthIssue)
        -> (systemImage: String, tint: Color)
    {
        switch issue {
        case .tokenRequired:
            ("key.fill", .orange)
        case .tokenMismatch:
            ("exclamationmark.triangle.fill", .orange)
        case .gatewayTokenNotConfigured:
            ("wrench.and.screwdriver.fill", .orange)
        case .setupCodeExpired:
            ("qrcode.viewfinder", .orange)
        case .passwordRequired:
            ("lock.slash.fill", .orange)
        case .pairingRequired:
            ("link.badge.plus", .orange)
        }
    }

    static func shouldShowRemoteTokenField(
        showAdvancedConnection: Bool,
        remoteToken: String,
        remoteTokenUnsupported: Bool,
        authIssue: RemoteGatewayAuthIssue?) -> Bool
    {
        showAdvancedConnection ||
            remoteTokenUnsupported ||
            !remoteToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
            authIssue?.showsTokenField == true
    }

    static func shouldResetRemoteProbeFeedback(
        for connectionMode: AppState.ConnectionMode,
        suppressReset: Bool) -> Bool
    {
        !suppressReset && connectionMode != .remote
    }

    func gatewaySubtitle(for gateway: GatewayDiscoveryModel.DiscoveredGateway) -> String? {
        if self.state.remoteTransport == .direct {
            return GatewayDiscoveryHelpers.directUrl(for: gateway) ?? "Gateway pairing only"
        }
        if let target = GatewayDiscoveryHelpers.sshTarget(for: gateway),
           let parsed = CommandResolver.parseSSHTarget(target)
        {
            let portSuffix = parsed.port != 22 ? " · ssh \(parsed.port)" : ""
            return "\(parsed.host)\(portSuffix)"
        }
        return "Gateway pairing only"
    }

    func isSelectedGateway(_ gateway: GatewayDiscoveryModel.DiscoveredGateway) -> Bool {
        guard self.state.connectionMode == .remote else { return false }
        let preferred = self.preferredGatewayID ?? GatewayDiscoveryPreferences.preferredStableID()
        return preferred == gateway.stableID
    }

    func connectionChoiceButton(
        title: String,
        subtitle: String?,
        selected: Bool,
        action: @escaping () -> Void) -> some View
    {
        Button {
            withAnimation(.spring(response: 0.25, dampingFraction: 0.9)) {
                action()
            }
        } label: {
            HStack(alignment: .center, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.callout.weight(.semibold))
                        .lineLimit(1)
                        .truncationMode(.tail)
                    if let subtitle {
                        Text(subtitle)
                            .font(.caption.monospaced())
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .truncationMode(.middle)
                    }
                }
                Spacer(minLength: 0)
                SelectionStateIndicator(selected: selected)
            }
            .maumauSelectableRowChrome(selected: selected)
        }
        .buttonStyle(.plain)
    }

    func permissionsPage() -> some View {
        self.onboardingPage(pageID: 5) {
            VStack(spacing: 16) {
                Text("Allow Mac access")
                    .font(.largeTitle.weight(.semibold))
                Text(
                    "These are the main Mac permissions Maumau uses when it helps with apps, windows, or screenshots. Turn on only the ones you want."
                )
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 560)
                .fixedSize(horizontal: false, vertical: true)

                self.onboardingCard(spacing: 8, padding: 12) {
                    self.setupMetadataRow(for: self.permissionsPageIndex)

                    if let step = self.setupStepDefinition(for: self.permissionsPageIndex),
                       !step.badges.isEmpty || !(step.preparationNote?.isEmpty ?? true)
                    {
                        Divider()
                    }

                    ForEach(self.onboardingPermissionCapabilities, id: \.self) { cap in
                        PermissionRow(
                            capability: cap,
                            status: self.permissionMonitor.status[cap] ?? false,
                            compact: true)
                        {
                            Task { await self.request(cap) }
                        }
                    }

                    HStack(spacing: 12) {
                        Button {
                            Task { await self.refreshPerms() }
                        } label: {
                            Label("Refresh", systemImage: "arrow.clockwise")
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .help("Refresh status")

                        Button("Open full Permissions settings") {
                            self.openSettings(tab: .permissions)
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)

                        if self.isRequesting {
                            ProgressView()
                                .controlSize(.small)
                        }
                    }
                    .padding(.top, 4)
                }

                self.onboardingCard(spacing: 10, padding: 14) {
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: "info.circle.fill")
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .frame(width: 22)
                            .padding(.top, 1)

                        VStack(alignment: .leading, spacing: 6) {
                            Text("Optional later")
                                .font(.headline)
                            Text(
                                "Voice Wake, camera, and location stay out of the way here. If you want those later, you can turn them on in Settings."
                            )
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
        }
    }

    func cliPage() -> some View {
        self.onboardingPage(pageID: 6) {
            Text("Install the CLI")
                .font(.largeTitle.weight(.semibold))
            Text("This is the small helper app Maumau uses behind the scenes when it lives on this Mac.")
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 520)
                .fixedSize(horizontal: false, vertical: true)

            self.onboardingCard(spacing: 10) {
                HStack(spacing: 12) {
                    Button {
                        Task { await self.installCLI() }
                    } label: {
                        let title = self.cliInstalled ? "Reinstall CLI" : "Install CLI"
                        ZStack {
                            Text(title)
                                .opacity(self.installingCLI ? 0 : 1)
                            if self.installingCLI {
                                ProgressView()
                                    .controlSize(.mini)
                            }
                        }
                        .frame(minWidth: 120)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(self.installingCLI)

                    Button(self.copied ? "Copied" : "Copy install command") {
                        self.copyToPasteboard(self.devLinkCommand)
                    }
                    .disabled(self.installingCLI)

                    if self.cliInstalled, let loc = self.cliInstallLocation {
                        Label("Installed at \(loc)", systemImage: "checkmark.circle.fill")
                            .font(.footnote)
                            .foregroundStyle(.green)
                    }
                }

                if let cliStatus {
                    Text(cliStatus)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else if !self.cliInstalled, self.cliInstallLocation == nil {
                    Text(
                        """
                        Maumau normally does this for you the first time you choose This Mac.
                        It installs the helper pieces it needs in your user account.
                        Use Install CLI if you want to retry or reinstall.
                        """)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    func workspacePage() -> some View {
        self.onboardingPage(pageID: 7) {
            Text("Agent workspace")
                .font(.largeTitle.weight(.semibold))
            Text(
                "Think of this as Maumau’s room. It is the folder where it keeps notes, reads instructions, and makes files.")
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 560)
                .fixedSize(horizontal: false, vertical: true)

            self.onboardingCard(spacing: 10) {
                if self.state.connectionMode == .remote {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Remote gateway detected")
                            .font(.headline)
                        Text(
                            "Choose the remote workspace path now. The gateway wizard will use it, " +
                                "and you can copy a bootstrap command if you want to seed files manually.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)

                        Text("Workspace folder")
                            .font(.headline)
                        TextField("~/.maumau/workspace", text: self.$workspacePath)
                            .textFieldStyle(.roundedBorder)

                        HStack(spacing: 12) {
                            Button("Save in config") {
                                Task {
                                    let url = AgentWorkspace.resolveWorkspaceURL(from: self.workspacePath)
                                    let saved = await self.saveAgentWorkspace(AgentWorkspace.displayPath(for: url))
                                    if saved {
                                        self.workspaceStatus =
                                            "Saved workspace path to the remote gateway config."
                                    }
                                }
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(self.workspaceApplying)

                            Button(self.copied ? "Copied" : "Copy setup command") {
                                self.copyToPasteboard(self.workspaceBootstrapCommand)
                            }
                            .buttonStyle(.bordered)
                            .disabled(self.workspaceApplying)
                        }
                    }
                } else {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Workspace folder")
                            .font(.headline)
                        TextField(
                            AgentWorkspace.displayPath(for: MaumauConfigFile.defaultWorkspaceURL()),
                            text: self.$workspacePath)
                            .textFieldStyle(.roundedBorder)

                        HStack(spacing: 12) {
                            Button {
                                Task { await self.applyWorkspace() }
                            } label: {
                                if self.workspaceApplying {
                                    ProgressView()
                                } else {
                                    Text("Create workspace")
                                }
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(self.workspaceApplying)

                            Button("Open folder") {
                                let url = AgentWorkspace.resolveWorkspaceURL(from: self.workspacePath)
                                NSWorkspace.shared.open(url)
                            }
                            .buttonStyle(.bordered)
                            .disabled(self.workspaceApplying)

                            Button("Save in config") {
                                Task {
                                    let url = AgentWorkspace.resolveWorkspaceURL(from: self.workspacePath)
                                    let saved = await self.saveAgentWorkspace(AgentWorkspace.displayPath(for: url))
                                    if saved {
                                        self.workspaceStatus =
                                            "Saved to ~/.maumau/maumau.json (agents.defaults.workspace)"
                                    }
                                }
                            }
                            .buttonStyle(.bordered)
                            .disabled(self.workspaceApplying)
                        }
                    }

                    Text(
                        "Maumau will use this folder during setup. If it doesn’t exist yet, the setup wizard can create it and seed the bootstrap files."
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                }

                if let workspaceStatus {
                    Text(workspaceStatus)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                } else if let safetyMessage = self.localWorkspaceSafetyMessage {
                    Text(safetyMessage)
                        .font(.caption)
                        .foregroundStyle(.orange)
                        .fixedSize(horizontal: false, vertical: true)
                } else if self.state.connectionMode != .remote {
                    Text(
                        "Tip: edit AGENTS.md in this folder to shape the assistant’s behavior. " +
                            "For backup, make the workspace a private git repo so your agent’s " +
                            "“memory” is versioned.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }
        }
    }

    func onboardingChatPage() -> some View {
        VStack(spacing: 16) {
            Text("Meet your agent")
                .font(.largeTitle.weight(.semibold))
            Text(
                "This is a dedicated onboarding chat. Your agent will introduce itself, " +
                    "learn who you are, and help you connect WhatsApp or Telegram if you want.")
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 520)
                .fixedSize(horizontal: false, vertical: true)

            self.onboardingGlassCard(padding: 8) {
                MaumauChatView(viewModel: self.onboardingChatModel, style: .onboarding)
                    .frame(maxHeight: .infinity)
            }
            .frame(maxHeight: .infinity)
        }
        .padding(.horizontal, 28)
        .frame(width: self.pageWidth, alignment: .top)
        .frame(maxHeight: .infinity, alignment: .top)
        .id("onboarding-page-\(self.onboardingChatPageIndex)")
    }

    func channelsSetupPage() -> some View {
        self.onboardingPage(pageID: self.channelsSetupPageIndex) {
            VStack(spacing: 16) {
                Text("Pick a Channel")
                    .font(.largeTitle.weight(.semibold))
                Text(
                    "Channel means the app where people text Maumau. Think of it like giving Maumau a phone line or inbox. Pick one now, and you can add more later."
                )
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 560)
                .fixedSize(horizontal: false, vertical: true)

                self.onboardingCard(spacing: 12, padding: 16) {
                    OnboardingMeaningCard(
                        stage: .chat,
                        title: OnboardingHeaderStage.chat.explainerTitle,
                        bodyText: OnboardingHeaderStage.chat.explainerBody,
                        badges: self.setupStepDefinition(for: self.channelsSetupPageIndex)?.badges ?? [],
                        detailNote: self.setupStepDefinition(for: self.channelsSetupPageIndex)?.preparationNote)
                }

                self.onboardingCard(spacing: 14, padding: 18) {
                    OnboardingChannelsSetupView(
                        store: self.onboardingChannelsStore,
                        openFullChannelsSettings: { self.openSettings(tab: .channels) },
                        isActive: Self.shouldActivateOnboardingPageSideEffects(
                            activePageIndex: self.activePageIndex,
                            pageIndex: self.channelsSetupPageIndex))
                }
            }
        }
    }

    func privateAccessPage() -> some View {
        self.onboardingPage(pageID: self.privateAccessPageIndex) {
            VStack(spacing: 16) {
                Text("Private access from your devices")
                    .font(.largeTitle.weight(.semibold))
                Text(
                    "This gives Maumau's home a private driveway. It lets your phone, laptop, or browser reach Maumau privately without putting Maumau on the public internet."
                )
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 560)
                .fixedSize(horizontal: false, vertical: true)

                self.onboardingCard(spacing: 12, padding: 16) {
                    OnboardingMeaningCard(
                        stage: .access,
                        title: OnboardingHeaderStage.access.explainerTitle,
                        bodyText: OnboardingHeaderStage.access.explainerBody,
                        badges: self.setupStepDefinition(for: self.privateAccessPageIndex)?.badges ?? [],
                        detailNote: self.setupStepDefinition(for: self.privateAccessPageIndex)?.preparationNote)
                }

                self.onboardingCard(spacing: 10, padding: 14) {
                    self.featureRow(
                        title: "This Mac, now",
                        subtitle: "Use Install on this Mac below. Maumau downloads the official Tailscale installer here, macOS asks for your administrator password, then you sign in here.",
                        systemImage: "desktopcomputer")
                    Divider()
                    self.featureRow(
                        title: "Other devices, later",
                        subtitle: "When you want to open Maumau from your phone or another laptop, install Tailscale on that device later and sign in to the same private network there.",
                        systemImage: "iphone")
                    Divider()
                    self.featureRow(
                        title: "Private by default",
                        subtitle: "Private mode keeps Maumau off the public internet. Only devices you add to the same private Tailscale network can open the private link.",
                        systemImage: "lock.shield")
                }

                self.onboardingCard(spacing: 10, padding: 14) {
                    self.featureRow(
                        title: "How Maumau checks this safely",
                        subtitle: "In private mode, Maumau accepts only Tailscale's verified private-network identity for the dashboard and live connection. If you want an extra lock, require a Maumau password too.",
                        systemImage: "checkmark.shield")
                }

                TailscaleIntegrationSection(
                    connectionMode: self.state.connectionMode,
                    isPaused: self.state.isPaused,
                    presentation: .onboarding)

                self.onboardingCard {
                    self.featureActionRow(
                        title: "Come back to this later",
                        subtitle: "The same guide stays in Settings → General, so you can run the install here later, sign in later, or add password protection later if you skip this for now.",
                        systemImage: "gearshape",
                        buttonTitle: "Open Settings → General")
                    {
                        self.openSettings(tab: .general)
                    }
                }
            }
        }
    }

    func skillsSetupPage() -> some View {
        self.onboardingPage(pageID: self.skillsSetupPageIndex) {
            VStack(spacing: 16) {
                Text("Review included tools")
                    .font(.largeTitle.weight(.semibold))
                Text(
                    "This is the short version of the core tools Maumau already comes with on this Mac. On first-time local setup, Maumau also installs nano-pdf, OpenAI Whisper, and summarize automatically when they are missing, while bundled setup guides like Clawd Cursor help you turn on extra capabilities later."
                )
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 560)
                .fixedSize(horizontal: false, vertical: true)

                self.onboardingCard(spacing: 10, padding: 14) {
                    self.setupMetadataRow(for: self.skillsSetupPageIndex)

                    if let step = self.setupStepDefinition(for: self.skillsSetupPageIndex),
                       !step.badges.isEmpty || !(step.preparationNote?.isEmpty ?? true)
                    {
                        Divider()
                    }

                    ForEach(Array(Self.includedToolHighlights().enumerated()), id: \.element.id) { index, highlight in
                        if index > 0 {
                            Divider()
                        }
                        self.featureRow(
                            title: highlight.title,
                            subtitle: highlight.subtitle,
                            systemImage: highlight.systemImage)
                    }
                }

                self.onboardingCard(spacing: 10, padding: 14) {
                    HStack(spacing: 10) {
                        Text("Daily-life helpers enabled by default")
                            .font(.headline)
                        Spacer(minLength: 0)
                    }

                    ForEach(Array(Self.includedHelperHighlights().enumerated()), id: \.element.id) { index, highlight in
                        if index > 0 {
                            Divider()
                        }
                        self.featureRow(
                            title: highlight.title,
                            subtitle: highlight.subtitle,
                            systemImage: highlight.systemImage)
                    }
                }

                self.onboardingCard(spacing: 10, padding: 14) {
                    self.featureRow(
                        title: "Long-term memory, when you want it",
                        subtitle: "Add a memory backend later if you want Maumau to retain preferences, facts, and past decisions across sessions instead of starting fresh each time.",
                        systemImage: "brain.head.profile")
                }

                self.onboardingCard {
                    self.featureActionRow(
                        title: "Open the full Skills list",
                        subtitle: "See everything that is available, including the bundled Clawd Cursor setup guide, Cursor-compatible bundles, and extra tools you can turn on or off later.",
                        systemImage: "sparkles",
                        buttonTitle: "Open Settings → Skills")
                    {
                        self.openSettings(tab: .skills)
                    }

                    self.skillsOverview
                }
            }
        }
        .task(id: self.activePageIndex) {
            guard Self.shouldActivateOnboardingPageSideEffects(
                activePageIndex: self.activePageIndex,
                pageIndex: self.skillsSetupPageIndex)
            else { return }
            await self.maybeLoadOnboardingSkills()
            await self.maybeAutoInstallDefaultSkills()
        }
    }

    @ViewBuilder
    private func setupMetadataRow(for pageID: Int) -> some View {
        if let step = self.setupStepDefinition(for: pageID),
           !step.badges.isEmpty || !(step.preparationNote?.isEmpty ?? true)
        {
            VStack(alignment: .leading, spacing: 6) {
                if !step.badges.isEmpty {
                    HStack(spacing: 6) {
                        ForEach(step.badges) { badge in
                            StatusPill(text: badge.title, tint: badge.tint)
                        }
                    }
                }

                if let preparationNote = step.preparationNote, !preparationNote.isEmpty {
                    Text(preparationNote)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    func readyPage() -> some View {
        self.onboardingPage(pageID: 9) {
            Text("All set")
                .font(.largeTitle.weight(.semibold))
            self.onboardingCard {
                Text("Maumau now has a home, a brain, and a place people can reach it.")
                    .font(.headline)
                Text("You can keep things simple for now and fine-tune the rest later in Settings.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                Divider()
                    .padding(.vertical, 6)

                if self.state.connectionMode == .unconfigured {
                    self.featureRow(
                        title: "Configure later",
                        subtitle: "Pick Local or Remote in Settings → General whenever you’re ready.",
                        systemImage: "gearshape")
                    Divider()
                        .padding(.vertical, 6)
                }
                if self.state.connectionMode == .local {
                    self.featureActionRow(
                        title: "Change Mac access or tools later",
                        subtitle: "Permissions and the full Skills list stay available in Settings whenever you want to fine-tune things.",
                        systemImage: "lock.shield",
                        buttonTitle: "Open Settings → Permissions")
                    {
                        self.openSettings(tab: .permissions)
                    }
                    Divider()
                        .padding(.vertical, 6)
                    self.featureActionRow(
                        title: "Manage private access later",
                        subtitle: "Open Settings → General any time to install Tailscale on this Mac, sign this Mac in, turn private access on, or revisit the steps for adding your phone later.",
                        systemImage: "point.3.connected.trianglepath.dotted",
                        buttonTitle: "Open Settings → General")
                    {
                        self.openSettings(tab: .general)
                    }
                    Divider()
                        .padding(.vertical, 6)
                }
                if self.state.connectionMode == .remote {
                    self.featureRow(
                        title: "Remote gateway checklist",
                        subtitle: """
                        On your gateway host: install/update the `maumau` package and make sure credentials exist
                        (typically `~/.maumau/credentials/oauth.json`). Then connect again if needed.
                        """,
                        systemImage: "network")
                    Divider()
                        .padding(.vertical, 6)
                }
                self.featureRow(
                    title: "Open the menu bar panel",
                    subtitle: "Click the Maumau menu bar icon for quick chat and status.",
                    systemImage: "bubble.left.and.bubble.right")
                self.featureRow(
                    title: "Try Voice Wake",
                    subtitle: "Enable Voice Wake in Settings for hands-free commands with a live transcript overlay.",
                    systemImage: "waveform.circle")
                self.featureRow(
                    title: "Use the panel + Canvas",
                    subtitle: "Open the menu bar panel for quick chat; the agent can show previews " +
                        "and richer visuals in Canvas.",
                    systemImage: "rectangle.inset.filled.and.person.filled")
                Toggle("Launch at login", isOn: self.$state.launchAtLogin)
                    .onChange(of: self.state.launchAtLogin) { _, newValue in
                        AppStateStore.updateLaunchAtLogin(enabled: newValue)
                    }
            }
        }
    }

    private func maybeLoadOnboardingSkills() async {
        guard !self.didLoadOnboardingSkills else { return }
        self.didLoadOnboardingSkills = true
        await self.onboardingSkillsModel.refresh()
    }

    private func maybeAutoInstallDefaultSkills() async {
        guard Self.shouldAutoInstallDefaultSkills(
            mode: self.state.connectionMode,
            onboardingSeen: self.state.onboardingSeen,
            activePageIndex: self.activePageIndex,
            skillsSetupPageIndex: self.skillsSetupPageIndex,
            didAutoInstallDefaultSkills: self.didAutoInstallDefaultSkills,
            isLoadingSkills: self.onboardingSkillsModel.isLoading,
            hasSkills: !self.onboardingSkillsModel.skills.isEmpty)
        else { return }

        self.didAutoInstallDefaultSkills = true
        await self.onboardingSkillsModel.autoInstallSkills(
            skillKeys: Self.defaultFirstRunSkillKeys)
    }

    static func shouldActivateOnboardingPageSideEffects(
        activePageIndex: Int,
        pageIndex: Int) -> Bool
    {
        activePageIndex == pageIndex
    }

    private var onboardingPermissionCapabilities: [Capability] {
        [.appleScript, .accessibility, .screenRecording, .notifications]
    }

    private var skillsOverview: some View {
        VStack(alignment: .leading, spacing: 8) {
            Divider()
                .padding(.vertical, 6)

            HStack(spacing: 10) {
                Text("Included skills on this Mac")
                    .font(.headline)
                Spacer(minLength: 0)
                if self.onboardingSkillsModel.isLoading {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Button("Refresh") {
                        Task {
                            await self.onboardingSkillsModel.refresh()
                            await self.maybeAutoInstallDefaultSkills()
                        }
                    }
                    .buttonStyle(.link)
                }
            }

            if let error = self.onboardingSkillsModel.error {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Couldn’t check the included skills yet.")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.orange)
                    Text(
                        "Make sure the Gateway is running and connected, " +
                            "then hit Refresh or open Settings → Skills.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Details: \(error)")
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    if let statusMessage = self.onboardingSkillsModel.statusMessage,
                       !statusMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    {
                        Text(statusMessage)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    if self.onboardingSkillsModel.skills.isEmpty {
                        Text("Checking which included skills are available here…")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    } else {
                        Text(
                            self.readyOnboardingSkillCount == 1
                                ? "1 included skill is ready on this Mac right now."
                                : "\(self.readyOnboardingSkillCount) included skills are ready on this Mac right now.")
                            .font(.footnote.weight(.semibold))
                        Text(
                            "First-time local setup auto-installs nano-pdf, OpenAI Whisper, and summarize when they are missing. Skill Creator is already bundled and ready."
                        )
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                        Text(
                            "Browser control, the core Mac tools above, and the default daily-life helpers stay separate from the longer Skills list, so the detailed inventory stays in Settings → Skills."
                        )
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
    }

    private var readyOnboardingSkillCount: Int {
        self.onboardingSkillsModel.skills.filter { skill in
            !skill.disabled &&
                skill.missing.bins.isEmpty &&
                skill.missing.env.isEmpty &&
                skill.missing.config.isEmpty
        }.count
    }

    static func includedToolHighlights() -> [OnboardingToolHighlight] {
        [
            OnboardingToolHighlight(
                title: "Files and folders",
                subtitle: "Read, organize, and change things on this Mac when you allow it.",
                systemImage: "folder"),
            OnboardingToolHighlight(
                title: "Apps and screen context",
                subtitle: "Work with Mac apps and screenshots when the matching permissions are on.",
                systemImage: "macwindow.on.rectangle"),
            OnboardingToolHighlight(
                title: "Browser control",
                subtitle: "Open websites, follow links, and work through everyday web tasks in a browser.",
                systemImage: "globe"),
            OnboardingToolHighlight(
                title: "Commands",
                subtitle: "Run Terminal commands when you approve them or allow them.",
                systemImage: "terminal"),
            OnboardingToolHighlight(
                title: "Messages and connected services",
                subtitle: "Reply in the Channel you picked and use any extra services you connect later.",
                systemImage: "bubble.left.and.bubble.right"),
        ]
    }

    static func includedHelperHighlights() -> [OnboardingToolHighlight] {
        [
            OnboardingToolHighlight(
                title: "Clawd Cursor",
                subtitle: "Includes a bundled Skill that helps you set up the upstream clawdcursor helper for native desktop control across apps. The helper itself is installed separately.",
                systemImage: "desktopcomputer"),
            OnboardingToolHighlight(
                title: "Maumau Guardrails",
                subtitle: "Keeps prompts, tool calls, and outgoing replies inside your policy once you connect a guardrails sidecar.",
                systemImage: "checkmark.shield"),
            OnboardingToolHighlight(
                title: "Lobster workflows",
                subtitle: "Automates repeatable, multi-step tasks with resumable approvals instead of making the agent improvise every step.",
                systemImage: "point.3.connected.trianglepath.dotted"),
            OnboardingToolHighlight(
                title: "Structured AI tasks",
                subtitle: "Uses LLM Task for clean JSON output, which helps with forms, extraction, handoffs, and workflow steps.",
                systemImage: "curlybraces.square"),
        ]
    }
}

private struct OnboardingChannelsSetupView: View {
    @Bindable var store: ChannelsStore
    let openFullChannelsSettings: () -> Void
    let isActive: Bool
    @State private var selectedChannelID: String?

    init(store: ChannelsStore, openFullChannelsSettings: @escaping () -> Void, isActive: Bool) {
        self.store = store
        self.openFullChannelsSettings = openFullChannelsSettings
        self.isActive = isActive
    }

    private var settingsView: ChannelsSettings {
        ChannelsSettings(store: self.store)
    }

    private var channels: [ChannelsSettings.ChannelItem] {
        self.settingsView.onboardingOrderedChannels
    }

    private var channelIDs: [String] {
        self.channels.map(\.id)
    }

    private var selectedChannel: ChannelsSettings.ChannelItem? {
        if let selectedChannelID,
            let matching = self.channels.first(where: { $0.id == selectedChannelID })
        {
            return matching
        }
        return self.channels.first
    }

    var body: some View {
        let settingsView = self.settingsView

        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .center, spacing: 10) {
                Label("Available chat apps", systemImage: "bubble.left.and.bubble.right")
                    .font(.headline)
                Spacer(minLength: 0)
                if self.store.isRefreshing && self.store.snapshot == nil {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Button("Refresh") {
                        Task {
                            await self.store.refresh(probe: true)
                            await self.store.loadConfigSchema()
                            await self.store.loadConfig()
                        }
                    }
                    .buttonStyle(.link)
                    .controlSize(.small)
                }
            }

            if self.channels.isEmpty {
                self.loadingState
            } else {
                ScrollView(.horizontal) {
                    HStack(spacing: 10) {
                        ForEach(self.channels) { channel in
                            self.channelPickerButton(channel, settingsView: settingsView)
                        }
                    }
                    .padding(.vertical, 2)
                }
                .scrollIndicators(.never)

                if let channel = self.selectedChannel {
                    VStack(alignment: .leading, spacing: 16) {
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Label(channel.title, systemImage: channel.systemImage)
                                .font(.title3.weight(.semibold))
                            self.statusBadge(
                                settingsView.channelSummary(channel),
                                tint: settingsView.channelTint(channel))
                            Spacer(minLength: 0)
                            settingsView.channelHeaderActions(channel)
                        }

                        settingsView.onboardingChannelSetupSection(channel)

                        if !settingsView.supportsInlineOnboardingSetup(channel.id) {
                            self.settingsHandoffSection(for: channel, settingsView: settingsView)
                        }
                    }
                }
            }

            if let lastError = self.store.lastError, !lastError.isEmpty {
                Text("Gateway status warning: \(lastError)")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .onAppear {
            self.updatePollingState()
            self.ensureSelection()
        }
        .onChange(of: self.isActive) { _, _ in
            self.updatePollingState()
        }
        .onChange(of: self.channelIDs) { _, _ in
            self.ensureSelection()
        }
        .onDisappear {
            self.store.stop()
        }
    }

    @ViewBuilder
    private func settingsHandoffSection(
        for channel: ChannelsSettings.ChannelItem,
        settingsView: ChannelsSettings) -> some View
    {
        let alreadyConnected = settingsView.channelEnabled(channel)
        GroupBox("Finish in Settings") {
            VStack(alignment: .leading, spacing: 10) {
                Text(self.settingsHandoffMessage(for: channel, alreadyConnected: alreadyConnected))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: 12) {
                    Button(self.settingsHandoffButtonTitle(for: channel, alreadyConnected: alreadyConnected)) {
                        self.openFullChannelsSettings()
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)

                    Spacer(minLength: 0)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func settingsHandoffMessage(
        for channel: ChannelsSettings.ChannelItem,
        alreadyConnected: Bool) -> String
    {
        if channel.id == "whatsapp" {
            return alreadyConnected
                ? "WhatsApp is ready. Maumau is already using the recommended defaults, and you can change advanced routing or access rules later in full Settings → Channels."
                : "If you want to change approved numbers, routing, or other advanced WhatsApp behavior later, use full Settings → Channels. Maumau keeps the recommended defaults unless you change them."
        }

        if alreadyConnected {
            return "\(channel.title) is already connected. Maumau is using the recommended defaults, and you can review or override them later in full Settings → Channels."
        }

        return "Onboarding is only showing the key setup details for \(channel.title). When you are ready, open full Settings → Channels to paste the token or finish the account/device connection. Maumau will use the recommended defaults automatically for the rest."
    }

    private func settingsHandoffButtonTitle(
        for channel: ChannelsSettings.ChannelItem,
        alreadyConnected: Bool) -> String
    {
        if alreadyConnected {
            return "Review \(channel.title) in Settings"
        }

        switch channel.id {
        case "discord":
            return "Open Settings for Discord bot"
        case "googlechat":
            return "Open Settings for Google Chat"
        case "imessage":
            return "Open Settings for Messages"
        case "line":
            return "Open Settings for LINE bot"
        case "slack":
            return "Open Settings for Slack app"
        case "telegram":
            return "Open Settings for Telegram bot"
        case "whatsapp":
            return "Open full WhatsApp settings"
        default:
            return "Open Settings → Channels"
        }
    }

    private func updatePollingState() {
        if self.isActive {
            self.store.start()
        } else {
            self.store.stop()
        }
    }

    private var loadingState: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                if self.store.isRefreshing {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Image(systemName: "arrow.triangle.2.circlepath")
                        .foregroundStyle(.secondary)
                }
                Text("Loading chat apps from the Gateway…")
                    .font(.callout.weight(.medium))
            }

            Text("If this stays empty, make sure the Gateway is running, then hit Refresh.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color(NSColor.windowBackgroundColor)))
    }

    private func channelPickerButton(
        _ channel: ChannelsSettings.ChannelItem,
        settingsView: ChannelsSettings) -> some View
    {
        let isSelected = self.selectedChannelID == channel.id || (self.selectedChannelID == nil && self.selectedChannel?.id == channel.id)
        let tint = settingsView.channelTint(channel)
        return Button {
            self.selectedChannelID = channel.id
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    Image(systemName: channel.systemImage)
                        .font(.callout.weight(.semibold))
                    Text(channel.title)
                        .font(.callout.weight(.semibold))
                    Spacer(minLength: 0)
                }

                Text(settingsView.channelSummary(channel))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(width: 148, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(isSelected ? tint.opacity(0.16) : Color(NSColor.windowBackgroundColor)))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(isSelected ? tint : Color.secondary.opacity(0.14), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private func statusBadge(_ text: String, tint: Color) -> some View {
        Text(text)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(tint.opacity(0.16))
            .foregroundStyle(tint)
            .clipShape(Capsule())
    }

    private func ensureSelection() {
        guard !self.channels.isEmpty else {
            self.selectedChannelID = nil
            return
        }

        if let selectedChannelID, self.channels.contains(where: { $0.id == selectedChannelID }) {
            return
        }

        self.selectedChannelID = self.channels.first?.id
    }
}
