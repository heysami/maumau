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

private enum VoiceSetupExternalURL {
    static let twilioConsole = "https://console.twilio.com"
    static let twilioGuide = "https://www.twilio.com/docs/voice/quickstart/server"
    static let telnyxPortal = "https://portal.telnyx.com"
    static let telnyxGuide = "https://developers.telnyx.com/docs/voice/programmable-voice/quickstart-call-control"
    static let plivoConsole = "https://console.plivo.com"
    static let plivoGuide = "https://docs.plivo.com/docs/voice/api/call/make-a-call"
    static let deepgramConsole = "https://console.deepgram.com/project"
    static let deepgramGuide = "https://developers.deepgram.com/guides/fundamentals/authenticating"
    static let openAIAPIKeys = "https://platform.openai.com/api-keys"
    static let openAIRealtimeGuide = "https://developers.openai.com/api/docs/guides/realtime-websocket"
    static let elevenLabsAuthGuide = "https://elevenlabs.io/docs/api-reference/authentication"
    static let elevenLabsVoiceLibrary = "https://elevenlabs.io/app/voice-library"
}

extension OnboardingView {
    @ViewBuilder
    func pageView(for pageIndex: Int) -> some View {
        Group {
            switch pageIndex {
            case self.languagePageIndex:
                self.languagePage()
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
            case 11:
                self.conversationAutomationPage()
            case 12:
                self.privateAccessPage()
            case 13:
                self.skillsSetupPage()
            case 9:
                self.readyPage()
            default:
                EmptyView()
            }
        }
        .id("onboarding-page-\(pageIndex)")
    }

    func languagePage() -> some View {
        self.onboardingPage(pageID: self.languagePageIndex) {
            VStack(spacing: 22) {
                Text(self.strings.languagePageTitle)
                    .font(.largeTitle.weight(.semibold))

                Text(self.strings.languagePageSubtitle)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 560)
                    .fixedSize(horizontal: false, vertical: true)

                self.onboardingCard(spacing: 12, padding: 16) {
                    ForEach(OnboardingLanguage.allCases, id: \.rawValue) { language in
                        Button {
                            self.state.onboardingLanguage = language
                        } label: {
                            HStack(alignment: .top, spacing: 12) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(language.nativeName)
                                        .font(.headline)
                                        .foregroundStyle(.primary)
                                    Text(language.displayName)
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer(minLength: 0)
                                SelectionStateIndicator(
                                    selected: self.state.onboardingLanguage == language)
                            }
                            .maumauSelectableRowChrome(selected: self.state.onboardingLanguage == language)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .frame(maxWidth: 420)

                Text(self.strings.languagePageFootnote)
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 420)
            }
            .padding(.top, 24)
        }
    }

    func welcomePage() -> some View {
        return self.onboardingPage(pageID: 0) {
            VStack(spacing: 22) {
                Text(self.strings.windowTitle)
                    .font(.largeTitle.weight(.semibold))
                Text(self.strings.welcomeIntro(mode: self.state.connectionMode))
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 560)
                    .fixedSize(horizontal: false, vertical: true)

                self.onboardingCard(spacing: 12, padding: 16) {
                    Text(self.strings.nextStepsMeaningTitle)
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
                            detailNote: step.preparationNote,
                            language: self.state.effectiveOnboardingLanguage)
                    }

                    Divider()

                    Text(self.strings.setupLegend)
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
                            Text(self.strings.securityNoticeTitle)
                                .font(.headline)
                            Text(self.strings.securityNoticeBody)
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
            Text(self.strings.connectionTitle)
                .font(.largeTitle.weight(.semibold))
            Text(self.strings.connectionIntro)
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 520)
                .fixedSize(horizontal: false, vertical: true)

            self.onboardingCard(spacing: 12, padding: 16) {
                OnboardingMeaningCard(
                    stage: .home,
                    title: OnboardingHeaderStage.home.explainerTitle(in: self.state.effectiveOnboardingLanguage),
                    bodyText: OnboardingHeaderStage.home.explainerBody(in: self.state.effectiveOnboardingLanguage),
                    badges: self.setupStepDefinition(for: self.connectionPageIndex)?.badges ?? [],
                    detailNote: self.setupStepDefinition(for: self.connectionPageIndex)?.preparationNote,
                    language: self.state.effectiveOnboardingLanguage)
            }

            self.onboardingCard(spacing: 12, padding: 14) {
                VStack(alignment: .leading, spacing: 10) {
                    self.featureRow(
                        title: self.state.effectiveOnboardingLanguage == .en ? "This Mac" : "Mac ini",
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
            return self.state.effectiveOnboardingLanguage == .en
                ? "Getting this Mac ready so Maumau can live and work here…"
                : "Menyiapkan Mac ini agar Maumau bisa tinggal dan bekerja di sini…"
        }
        if self.isCheckingLocalGatewaySetup {
            return self.state.effectiveOnboardingLanguage == .en
                ? "Checking whether this Mac already has the helper tools Maumau needs…"
                : "Memeriksa apakah Mac ini sudah memiliki tool bantu yang dibutuhkan Maumau…"
        }
        if self.localGatewaySetupAvailable {
            if let probe = self.localGatewayProbe {
                let base = probe.expected
                    ? (self.state.effectiveOnboardingLanguage == .en
                        ? "Existing local gateway detected"
                        : "Gateway lokal yang ada terdeteksi")
                    : (self.state.effectiveOnboardingLanguage == .en
                        ? "Port \(probe.port) already in use"
                        : "Port \(probe.port) sudah digunakan")
                let command = probe.command.isEmpty ? "" : " (\(probe.command) pid \(probe.pid))"
                let suffix = self.state.effectiveOnboardingLanguage == .en
                    ? "Maumau will attach automatically."
                    : "Maumau akan terhubung otomatis."
                return "\(base)\(command). \(suffix)"
            }
            return self.state.effectiveOnboardingLanguage == .en
                ? "Recommended. Maumau can use this Mac as its home and finish setup for you."
                : "Direkomendasikan. Maumau bisa memakai Mac ini sebagai rumahnya dan menyelesaikan pengaturan untuk Anda."
        }
        guard let probe = self.localGatewayProbe else {
            return self.state.effectiveOnboardingLanguage == .en
                ? "Recommended. Maumau will install what it needs and make this Mac its home automatically."
                : "Direkomendasikan. Maumau akan memasang yang dibutuhkannya dan menjadikan Mac ini rumahnya secara otomatis."
        }
        let base = probe.expected
            ? (self.state.effectiveOnboardingLanguage == .en
                ? "Existing gateway detected"
                : "Gateway yang ada terdeteksi")
            : (self.state.effectiveOnboardingLanguage == .en
                ? "Port \(probe.port) already in use"
                : "Port \(probe.port) sudah digunakan")
        let command = probe.command.isEmpty ? "" : " (\(probe.command) pid \(probe.pid))"
        return self.state.effectiveOnboardingLanguage == .en
            ? "\(base)\(command). Will attach."
            : "\(base)\(command). Akan terhubung."
    }

    @ViewBuilder
    private func localSetupStatusSection() -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if self.installingCLI {
                HStack(spacing: 8) {
                    ProgressView()
                        .controlSize(.small)
                    Text(self.strings.preparingThisMacLabel)
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
                    Text(self.strings.checkingHelperToolsLabel)
                        .font(.caption.weight(.semibold))
                }
                Text(self.strings.runtimeAlreadyAvailableHint)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            } else if !self.localGatewaySetupAvailable {
                Text(self.strings.localSetupRunningHint)
                    .font(.caption.weight(.semibold))
                if let cliStatus, !cliStatus.isEmpty {
                    Text(cliStatus)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Button(self.strings.retryLocalSetupButtonTitle) {
                    Task { await self.installCLI() }
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            } else if let cliInstallLocation, !cliInstallLocation.isEmpty {
                Label(self.strings.localCliReadyLabel(location: cliInstallLocation), systemImage: "checkmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(.green)
            } else {
                Text(self.strings.localSetupReadyHint)
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
            Text(macDiscoveryStatus(
                self.gatewayDiscovery.statusText,
                language: self.state.effectiveOnboardingLanguage))
                .font(.caption)
                .foregroundStyle(.secondary)
            if self.gatewayDiscovery.gateways.isEmpty {
                ProgressView().controlSize(.small)
                Button(macLocalized("Refresh", language: self.state.effectiveOnboardingLanguage)) {
                    self.gatewayDiscovery.refreshRemoteFallbackNow(timeoutSeconds: 5.0)
                }
                .buttonStyle(.link)
                .help(
                    macLocalized(
                        "Retry remote discovery (Tailscale DNS-SD + Serve probe).",
                        language: self.state.effectiveOnboardingLanguage))
            }
            Spacer(minLength: 0)
        }

        if self.gatewayDiscovery.gateways.isEmpty {
            Text(self.strings.searchingNearbyGatewaysLabel)
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.leading, 4)
        } else {
            VStack(alignment: .leading, spacing: 6) {
                Text(self.strings.nearbyGatewaysLabel)
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

        Button(macLocalized(buttonTitle, language: self.state.effectiveOnboardingLanguage)) {
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
                        Text(macLocalized("Transport", language: self.state.effectiveOnboardingLanguage))
                            .font(.callout.weight(.semibold))
                            .frame(width: labelWidth, alignment: .leading)
                        Picker(macLocalized("Transport", language: self.state.effectiveOnboardingLanguage), selection: self.$state.remoteTransport) {
                            Text(macLocalized("SSH tunnel", language: self.state.effectiveOnboardingLanguage))
                                .tag(AppState.RemoteTransport.ssh)
                            Text(macLocalized("Direct (ws/wss)", language: self.state.effectiveOnboardingLanguage))
                                .tag(AppState.RemoteTransport.direct)
                        }
                        .pickerStyle(.segmented)
                        .frame(width: fieldWidth)
                    }
                    if self.state.remoteTransport == .direct {
                        GridRow {
                            Text(macLocalized("Gateway URL", language: self.state.effectiveOnboardingLanguage))
                                .font(.callout.weight(.semibold))
                                .frame(width: labelWidth, alignment: .leading)
                            TextField("wss://gateway.example.ts.net", text: self.$state.remoteUrl)
                                .textFieldStyle(.roundedBorder)
                                .frame(width: fieldWidth)
                        }
                    }
                    if self.state.remoteTransport == .ssh {
                        GridRow {
                            Text(macLocalized("SSH target", language: self.state.effectiveOnboardingLanguage))
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
                            Text(macLocalized("Identity file", language: self.state.effectiveOnboardingLanguage))
                                .font(.callout.weight(.semibold))
                                .frame(width: labelWidth, alignment: .leading)
                            TextField("/Users/you/.ssh/id_ed25519", text: self.$state.remoteIdentity)
                                .textFieldStyle(.roundedBorder)
                                .frame(width: fieldWidth)
                        }
                        GridRow {
                            Text(macLocalized("Project root", language: self.state.effectiveOnboardingLanguage))
                                .font(.callout.weight(.semibold))
                                .frame(width: labelWidth, alignment: .leading)
                            TextField("/home/you/Projects/maumau", text: self.$state.remoteProjectRoot)
                                .textFieldStyle(.roundedBorder)
                                .frame(width: fieldWidth)
                        }
                        GridRow {
                            Text(macLocalized("CLI path", language: self.state.effectiveOnboardingLanguage))
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

                Text(
                    macLocalized(
                        self.state.remoteTransport == .direct
                            ? "Tip: use Tailscale Serve so the gateway has a valid HTTPS cert."
                            : "Tip: keep Tailscale enabled so your gateway stays reachable.",
                        language: self.state.effectiveOnboardingLanguage))
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
                return macLocalized(
                    "Select a nearby gateway or open Advanced to enter a gateway URL.",
                    language: self.state.effectiveOnboardingLanguage)
            }
            if GatewayRemoteConfig.normalizeGatewayUrl(trimmedUrl) == nil {
                return macLocalized(
                    "Gateway URL must use wss:// for remote hosts (ws:// only for localhost).",
                    language: self.state.effectiveOnboardingLanguage)
            }
            return nil
        case .ssh:
            let trimmedTarget = self.state.remoteTarget.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmedTarget.isEmpty {
                return macLocalized(
                    "Select a nearby gateway or open Advanced to enter an SSH target.",
                    language: self.state.effectiveOnboardingLanguage)
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
                    Text(macLocalized("Remote connection", language: self.state.effectiveOnboardingLanguage))
                        .font(.callout.weight(.semibold))
                    Text(
                        macLocalized(
                            "Checks the real remote websocket and auth handshake.",
                            language: self.state.effectiveOnboardingLanguage))
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
                        Text(macLocalized("Check connection", language: self.state.effectiveOnboardingLanguage))
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
                Text(macLocalized("Gateway token", language: self.state.effectiveOnboardingLanguage))
                    .font(.callout.weight(.semibold))
                    .frame(width: 110, alignment: .leading)
                SecureField("remote gateway auth token (gateway.remote.token)", text: self.$state.remoteToken)
                    .textFieldStyle(.roundedBorder)
                    .frame(maxWidth: 320)
            }
            Text(macLocalized("Used when the remote gateway requires token auth.", language: self.state.effectiveOnboardingLanguage))
                .font(.caption)
                .foregroundStyle(.secondary)
            if self.state.remoteTokenUnsupported {
                Text(
                    macLocalized(
                        "The current gateway.remote.token value is not plain text. Maumau for macOS cannot use it directly; enter a plaintext token here to replace it.",
                        language: self.state.effectiveOnboardingLanguage))
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
            Text(macLocalized("Checking remote gateway…", language: self.state.effectiveOnboardingLanguage))
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
                Text(macAuthIssueText(issue.title, language: self.state.effectiveOnboardingLanguage))
                    .font(.caption.weight(.semibold))
                Text(.init(macAuthIssueText(issue.body, language: self.state.effectiveOnboardingLanguage)))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                if let footnote = issue.footnote {
                    Text(.init(macAuthIssueText(footnote, language: self.state.effectiveOnboardingLanguage)))
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
            self.remoteProbeState = .failed(
                macAuthIssueText(issue.statusMessage, language: self.state.effectiveOnboardingLanguage))
        case let .failed(message):
            self.remoteProbeState = .failed(macLocalized(message, language: self.state.effectiveOnboardingLanguage))
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
            return GatewayDiscoveryHelpers.directUrl(for: gateway)
                ?? macLocalized("Gateway pairing only", language: self.state.effectiveOnboardingLanguage)
        }
        if let target = GatewayDiscoveryHelpers.sshTarget(for: gateway),
           let parsed = CommandResolver.parseSSHTarget(target)
        {
            let portSuffix = parsed.port != 22 ? " · ssh \(parsed.port)" : ""
            return "\(parsed.host)\(portSuffix)"
        }
        return macLocalized("Gateway pairing only", language: self.state.effectiveOnboardingLanguage)
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
                Text(self.strings.permissionsTitle)
                    .font(.largeTitle.weight(.semibold))
                Text(self.strings.permissionsIntro)
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
                            Label(self.strings.refreshButtonTitle, systemImage: "arrow.clockwise")
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .help(self.strings.refreshButtonTitle)

                        Button(self.strings.openPermissionsSettingsButtonTitle) {
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
                            Text(self.strings.optionalLaterTitle)
                                .font(.headline)
                            Text(self.strings.optionalLaterBody)
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
            Text(macLocalized("Install the CLI", language: self.state.effectiveOnboardingLanguage))
                .font(.largeTitle.weight(.semibold))
            Text(
                macLocalized(
                    "This is the small helper app Maumau uses behind the scenes when it lives on this Mac.",
                    language: self.state.effectiveOnboardingLanguage))
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
                            Text(macLocalized(title, language: self.state.effectiveOnboardingLanguage))
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

                    Button(
                        self.copied
                            ? macLocalized("Copied", language: self.state.effectiveOnboardingLanguage)
                            : macLocalized("Copy install command", language: self.state.effectiveOnboardingLanguage))
                    {
                        self.copyToPasteboard(self.devLinkCommand)
                    }
                    .disabled(self.installingCLI)

                    if self.cliInstalled, let loc = self.cliInstallLocation {
                        Label(
                            self.state.effectiveOnboardingLanguage == .id
                                ? "Terpasang di \(loc)"
                                : "Installed at \(loc)",
                            systemImage: "checkmark.circle.fill")
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
                        macLocalized(
                            """
                            Maumau normally does this for you the first time you choose This Mac.
                            It installs the helper pieces it needs in your user account.
                            Use Install CLI if you want to retry or reinstall.
                            """,
                            language: self.state.effectiveOnboardingLanguage))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    func workspacePage() -> some View {
        self.onboardingPage(pageID: 7) {
            Text(macLocalized("Agent workspace", language: self.state.effectiveOnboardingLanguage))
                .font(.largeTitle.weight(.semibold))
            Text(
                macLocalized(
                    "Think of this as Maumau’s room. It is the folder where it keeps notes, reads instructions, and makes files.",
                    language: self.state.effectiveOnboardingLanguage))
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 560)
                .fixedSize(horizontal: false, vertical: true)

            self.onboardingCard(spacing: 10) {
                if self.state.connectionMode == .remote {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(macLocalized("Remote gateway detected", language: self.state.effectiveOnboardingLanguage))
                            .font(.headline)
                        Text(
                            macLocalized(
                                "Choose the remote workspace path now. The gateway wizard will use it, and you can copy a bootstrap command if you want to seed files manually.",
                                language: self.state.effectiveOnboardingLanguage))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)

                        Text(macLocalized("Workspace folder", language: self.state.effectiveOnboardingLanguage))
                            .font(.headline)
                        TextField("~/.maumau/workspace", text: self.$workspacePath)
                            .textFieldStyle(.roundedBorder)

                        HStack(spacing: 12) {
                            Button(macLocalized("Save in config", language: self.state.effectiveOnboardingLanguage)) {
                                Task {
                                    let url = AgentWorkspace.resolveWorkspaceURL(from: self.workspacePath)
                                    let saved = await self.saveAgentWorkspace(AgentWorkspace.displayPath(for: url))
                                    if saved {
                                        self.workspaceStatus =
                                            macLocalized(
                                                "Saved workspace path to the remote gateway config.",
                                                language: self.state.effectiveOnboardingLanguage)
                                    }
                                }
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(self.workspaceApplying)

                            Button(
                                self.copied
                                    ? macLocalized("Copied", language: self.state.effectiveOnboardingLanguage)
                                    : macLocalized("Copy setup command", language: self.state.effectiveOnboardingLanguage))
                            {
                                self.copyToPasteboard(self.workspaceBootstrapCommand)
                            }
                            .buttonStyle(.bordered)
                            .disabled(self.workspaceApplying)
                        }
                    }
                } else {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(macLocalized("Workspace folder", language: self.state.effectiveOnboardingLanguage))
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
                                    Text(macLocalized("Create workspace", language: self.state.effectiveOnboardingLanguage))
                                }
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(self.workspaceApplying)

                            Button(macLocalized("Open folder", language: self.state.effectiveOnboardingLanguage)) {
                                let url = AgentWorkspace.resolveWorkspaceURL(from: self.workspacePath)
                                NSWorkspace.shared.open(url)
                            }
                            .buttonStyle(.bordered)
                            .disabled(self.workspaceApplying)

                            Button(macLocalized("Save in config", language: self.state.effectiveOnboardingLanguage)) {
                                Task {
                                    let url = AgentWorkspace.resolveWorkspaceURL(from: self.workspacePath)
                                    let saved = await self.saveAgentWorkspace(AgentWorkspace.displayPath(for: url))
                                    if saved {
                                        self.workspaceStatus =
                                            macLocalized(
                                                "Saved to ~/.maumau/maumau.json (agents.defaults.workspace)",
                                                language: self.state.effectiveOnboardingLanguage)
                                    }
                                }
                            }
                            .buttonStyle(.bordered)
                            .disabled(self.workspaceApplying)
                        }
                    }

                    Text(
                        macLocalized(
                            "Maumau will use this folder during setup. If it doesn’t exist yet, the setup wizard can create it and seed the bootstrap files.",
                            language: self.state.effectiveOnboardingLanguage)
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
                        macLocalized(
                            "Tip: edit AGENTS.md in this folder to shape the assistant’s behavior. For backup, make the workspace a private git repo so your agent’s “memory” is versioned.",
                            language: self.state.effectiveOnboardingLanguage))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }
        }
    }

    func onboardingChatPage() -> some View {
        VStack(spacing: 16) {
            Text(macLocalized("Meet your agent", language: self.state.effectiveOnboardingLanguage))
                .font(.largeTitle.weight(.semibold))
            Text(
                macLocalized(
                    "This is a dedicated onboarding chat. Your agent will introduce itself, learn who you are, and help you connect WhatsApp or Telegram if you want.",
                    language: self.state.effectiveOnboardingLanguage))
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
                Text(self.strings.channelsTitle)
                    .font(.largeTitle.weight(.semibold))
                Text(self.strings.channelsIntro)
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 560)
                .fixedSize(horizontal: false, vertical: true)

                self.onboardingCard(spacing: 12, padding: 16) {
                    OnboardingMeaningCard(
                        stage: .chat,
                        title: OnboardingHeaderStage.chat.explainerTitle(in: self.state.effectiveOnboardingLanguage),
                        bodyText: OnboardingHeaderStage.chat.explainerBody(in: self.state.effectiveOnboardingLanguage),
                        badges: self.setupStepDefinition(for: self.channelsSetupPageIndex)?.badges ?? [],
                        detailNote: self.setupStepDefinition(for: self.channelsSetupPageIndex)?.preparationNote,
                        language: self.state.effectiveOnboardingLanguage)
                }

                self.onboardingCard(spacing: 14, padding: 18) {
                    OnboardingChannelsSetupView(
                        store: self.onboardingChannelsStore,
                        openFullChannelsSettings: { self.openSettings(tab: .channels) },
                        isActive: Self.shouldActivateOnboardingPageSideEffects(
                            activePageIndex: self.activePageIndex,
                            pageIndex: self.channelsSetupPageIndex),
                        language: self.state.effectiveOnboardingLanguage)
                }
            }
        }
    }

    func privateAccessPage() -> some View {
        self.onboardingPage(pageID: self.privateAccessPageIndex) {
            VStack(spacing: 16) {
                Text(self.strings.privateAccessTitle)
                    .font(.largeTitle.weight(.semibold))
                Text(self.strings.privateAccessIntro)
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 560)
                .fixedSize(horizontal: false, vertical: true)

                self.onboardingCard(spacing: 12, padding: 16) {
                    OnboardingMeaningCard(
                        stage: .access,
                        title: OnboardingHeaderStage.access.explainerTitle(in: self.state.effectiveOnboardingLanguage),
                        bodyText: OnboardingHeaderStage.access.explainerBody(in: self.state.effectiveOnboardingLanguage),
                        badges: self.setupStepDefinition(for: self.privateAccessPageIndex)?.badges ?? [],
                        detailNote: self.setupStepDefinition(for: self.privateAccessPageIndex)?.preparationNote,
                        language: self.state.effectiveOnboardingLanguage)
                }

                self.onboardingCard(spacing: 10, padding: 14) {
                    self.featureRow(
                        title: self.strings.privateAccessThisMacTitle,
                        subtitle: self.strings.privateAccessThisMacSubtitle,
                        systemImage: "desktopcomputer")
                    Divider()
                    self.featureRow(
                        title: self.strings.privateAccessOtherDevicesTitle,
                        subtitle: self.strings.privateAccessOtherDevicesSubtitle,
                        systemImage: "iphone")
                    Divider()
                    self.featureRow(
                        title: self.strings.privateAccessDefaultPrivacyTitle,
                        subtitle: self.strings.privateAccessDefaultPrivacySubtitle,
                        systemImage: "lock.shield")
                }

                self.onboardingCard(spacing: 10, padding: 14) {
                    self.featureRow(
                        title: self.strings.privateAccessSafetyTitle,
                        subtitle: self.strings.privateAccessSafetySubtitle,
                        systemImage: "checkmark.shield")
                }

                TailscaleIntegrationSection(
                    connectionMode: self.state.connectionMode,
                    isPaused: self.state.isPaused,
                    presentation: .onboarding,
                    isActive: Self.shouldActivateOnboardingPageSideEffects(
                        activePageIndex: self.activePageIndex,
                        pageIndex: self.privateAccessPageIndex),
                    draftStore: self.onboardingChannelsStore)

                self.onboardingCard {
                    self.featureActionRow(
                        title: self.strings.privateAccessLaterTitle,
                        subtitle: self.strings.privateAccessLaterSubtitle,
                        systemImage: "gearshape",
                        buttonTitle: self.strings.privateAccessLaterButtonTitle)
                    {
                        self.openSettings(tab: .general)
                    }
                }
            }
        }
    }

    func conversationAutomationPage() -> some View {
        self.onboardingPage(pageID: self.conversationAutomationPageIndex) {
            VStack(spacing: 16) {
                Text(self.strings.conversationAutomationTitle)
                    .font(.largeTitle.weight(.semibold))
                Text(self.strings.conversationAutomationIntro)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 560)
                    .fixedSize(horizontal: false, vertical: true)

                self.onboardingCard(spacing: 12, padding: 16) {
                    OnboardingMeaningCard(
                        stage: .automation,
                        title: OnboardingHeaderStage.automation.explainerTitle(in: self.state.effectiveOnboardingLanguage),
                        bodyText: OnboardingHeaderStage.automation.explainerBody(in: self.state.effectiveOnboardingLanguage),
                        badges: self.setupStepDefinition(for: self.conversationAutomationPageIndex)?.badges ?? [],
                        detailNote: self.setupStepDefinition(for: self.conversationAutomationPageIndex)?.preparationNote,
                        language: self.state.effectiveOnboardingLanguage)
                }

                self.onboardingCard(spacing: 14, padding: 18) {
                    Toggle(
                        isOn: Binding(
                            get: { self.conversationAutomationTelephonyEnabled },
                            set: { newValue in
                                self.conversationAutomationTelephonyEnabled = newValue
                                self.applyConversationAutomationVoiceDraft()
                            }))
                    {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(self.strings.conversationAutomationTelephonyTitle)
                                .font(.headline)
                            Text(self.strings.conversationAutomationTelephonySubtitle)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }

                if self.conversationAutomationTelephonyEnabled {
                    self.onboardingCard(spacing: 10, padding: 14) {
                        self.featureRow(
                            title: self.strings.conversationAutomationChecklistTitle,
                            subtitle: self.strings.conversationAutomationChecklistSubtitle,
                            systemImage: "list.bullet.clipboard")
                    }

                    self.onboardingCard(spacing: 14, padding: 18) {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(self.strings.conversationAutomationPhoneProviderTitle)
                                .font(.headline)
                            Text(self.strings.conversationAutomationPhoneProviderSubtitle)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                            Picker(
                                self.strings.conversationAutomationPhoneProviderTitle,
                                selection: Binding(
                                    get: { self.conversationAutomationPhoneProvider },
                                    set: { newValue in
                                        self.conversationAutomationPhoneProvider = newValue
                                        self.applyConversationAutomationVoiceDraft()
                                    }))
                            {
                                Text(self.strings.conversationAutomationPhoneProviderTwilioLabel)
                                    .tag(ConversationAutomationTelephonyProvider.twilio)
                                Text(self.strings.conversationAutomationPhoneProviderTelnyxLabel)
                                    .tag(ConversationAutomationTelephonyProvider.telnyx)
                                Text(self.strings.conversationAutomationPhoneProviderPlivoLabel)
                                    .tag(ConversationAutomationTelephonyProvider.plivo)
                            }
                            .pickerStyle(.segmented)

                            self.conversationAutomationTextField(
                                title: self.strings.conversationAutomationPhoneNumberTitle,
                                subtitle: self.strings.conversationAutomationPhoneNumberSubtitle,
                                placeholder: self.strings.conversationAutomationPhoneNumberPlaceholder,
                                text: self.$conversationAutomationFromNumber)

                            switch self.conversationAutomationPhoneProvider {
                            case .twilio:
                                Divider()
                                Text(self.strings.conversationAutomationTwilioSectionTitle)
                                    .font(.headline)
                                Text(self.strings.conversationAutomationTwilioSectionSubtitle)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                                self.conversationAutomationExternalLinks([
                                    (self.strings.conversationAutomationOpenConsoleButtonTitle, VoiceSetupExternalURL.twilioConsole),
                                    (self.strings.conversationAutomationOpenGuideButtonTitle, VoiceSetupExternalURL.twilioGuide),
                                ])
                                self.conversationAutomationTextField(
                                    title: self.strings.conversationAutomationTwilioAccountSIDTitle,
                                    subtitle: self.strings.conversationAutomationTwilioAccountSIDSubtitle,
                                    placeholder: self.strings.conversationAutomationTwilioAccountSIDPlaceholder,
                                    text: self.$conversationAutomationTwilioAccountSID)
                                self.conversationAutomationSecureField(
                                    title: self.strings.conversationAutomationTwilioAuthTokenTitle,
                                    subtitle: self.strings.conversationAutomationTwilioAuthTokenSubtitle,
                                    placeholder: self.strings.conversationAutomationTwilioAuthTokenPlaceholder,
                                    text: self.$conversationAutomationTwilioAuthToken)
                            case .telnyx:
                                Divider()
                                Text(self.strings.conversationAutomationTelnyxSectionTitle)
                                    .font(.headline)
                                Text(self.strings.conversationAutomationTelnyxSectionSubtitle)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                                self.conversationAutomationExternalLinks([
                                    (self.strings.conversationAutomationOpenPortalButtonTitle, VoiceSetupExternalURL.telnyxPortal),
                                    (self.strings.conversationAutomationOpenGuideButtonTitle, VoiceSetupExternalURL.telnyxGuide),
                                ])
                                self.conversationAutomationSecureField(
                                    title: self.strings.conversationAutomationTelnyxAPIKeyTitle,
                                    subtitle: self.strings.conversationAutomationTelnyxAPIKeySubtitle,
                                    placeholder: self.strings.conversationAutomationTelnyxAPIKeyPlaceholder,
                                    text: self.$conversationAutomationTelnyxAPIKey)
                                self.conversationAutomationTextField(
                                    title: self.strings.conversationAutomationTelnyxConnectionIDTitle,
                                    subtitle: self.strings.conversationAutomationTelnyxConnectionIDSubtitle,
                                    placeholder: self.strings.conversationAutomationTelnyxConnectionIDPlaceholder,
                                    text: self.$conversationAutomationTelnyxConnectionID)
                                self.conversationAutomationSecureField(
                                    title: self.strings.conversationAutomationTelnyxPublicKeyTitle,
                                    subtitle: self.strings.conversationAutomationTelnyxPublicKeySubtitle,
                                    placeholder: self.strings.conversationAutomationTelnyxPublicKeyPlaceholder,
                                    text: self.$conversationAutomationTelnyxPublicKey)
                            case .plivo:
                                Divider()
                                Text(self.strings.conversationAutomationPlivoSectionTitle)
                                    .font(.headline)
                                Text(self.strings.conversationAutomationPlivoSectionSubtitle)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                                self.conversationAutomationExternalLinks([
                                    (self.strings.conversationAutomationOpenConsoleButtonTitle, VoiceSetupExternalURL.plivoConsole),
                                    (self.strings.conversationAutomationOpenGuideButtonTitle, VoiceSetupExternalURL.plivoGuide),
                                ])
                                self.conversationAutomationTextField(
                                    title: self.strings.conversationAutomationPlivoAuthIDTitle,
                                    subtitle: self.strings.conversationAutomationPlivoAuthIDSubtitle,
                                    placeholder: self.strings.conversationAutomationPlivoAuthIDPlaceholder,
                                    text: self.$conversationAutomationPlivoAuthID)
                                self.conversationAutomationSecureField(
                                    title: self.strings.conversationAutomationPlivoAuthTokenTitle,
                                    subtitle: self.strings.conversationAutomationPlivoAuthTokenSubtitle,
                                    placeholder: self.strings.conversationAutomationPlivoAuthTokenPlaceholder,
                                    text: self.$conversationAutomationPlivoAuthToken)
                            }
                        }
                    }

                    self.onboardingCard(spacing: 14, padding: 18) {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(self.strings.conversationAutomationWebhookTitle)
                                .font(.headline)
                            Text(self.strings.conversationAutomationWebhookSubtitle)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                            Picker(
                                self.strings.conversationAutomationWebhookTitle,
                                selection: Binding(
                                    get: { self.conversationAutomationWebhookMode },
                                    set: { newValue in
                                        self.conversationAutomationWebhookMode = newValue
                                        self.applyConversationAutomationVoiceDraft()
                                    }))
                            {
                                Text(self.strings.conversationAutomationWebhookTailscaleLabel)
                                    .tag(ConversationAutomationWebhookMode.tailscaleFunnel)
                                Text(self.strings.conversationAutomationWebhookManualLabel)
                                    .tag(ConversationAutomationWebhookMode.publicUrl)
                            }
                            .pickerStyle(.segmented)

                            switch self.conversationAutomationWebhookMode {
                            case .tailscaleFunnel:
                                if let callbackURL = self.conversationAutomationExpectedWebhookURL {
                                    self.conversationAutomationReadOnlyValue(
                                        title: self.strings.conversationAutomationTailscaleReadyTitle,
                                        subtitle: self.strings.conversationAutomationWebhookTailscaleSubtitle(expectedURL: callbackURL),
                                        value: callbackURL)
                                } else {
                                    self.featureRow(
                                        title: self.strings.conversationAutomationTailscaleReadyTitle,
                                        subtitle: self.strings.conversationAutomationWebhookTailscaleSubtitle(expectedURL: nil),
                                        systemImage: "point.3.connected.trianglepath.dotted")
                                }

                                if !self.tailscaleService.isInstalled || !self.tailscaleService.isRunning {
                                    Divider()
                                    self.featureActionRow(
                                        title: self.strings.conversationAutomationTailscaleUnavailableTitle,
                                        subtitle: self.strings.conversationAutomationWebhookPrivateAccessSubtitle,
                                        systemImage: "exclamationmark.triangle",
                                        buttonTitle: self.strings.conversationAutomationGoToPrivateAccessButtonTitle)
                                    {
                                        self.goToOnboardingPage(self.privateAccessPageIndex)
                                    }
                                } else if self.tailscaleService.funnelExposure.checked,
                                          !self.tailscaleService.funnelExposure.featureEnabled,
                                          let enableURL = self.tailscaleService.funnelExposure.enableURL,
                                          let url = URL(string: enableURL)
                                {
                                    Divider()
                                    self.featureActionRow(
                                        title: self.strings.conversationAutomationTailscaleUnavailableTitle,
                                        subtitle: self.strings.conversationAutomationWebhookAdminSubtitle,
                                        systemImage: "arrow.up.forward.app",
                                        buttonTitle: self.strings.conversationAutomationOpenAdminButtonTitle)
                                    {
                                        NSWorkspace.shared.open(url)
                                    }
                                }
                            case .publicUrl:
                                self.conversationAutomationTextField(
                                    title: self.strings.conversationAutomationWebhookPublicURLTitle,
                                    subtitle: self.strings.conversationAutomationWebhookPublicURLSubtitle,
                                    placeholder: self.strings.conversationAutomationWebhookPublicURLPlaceholder,
                                    text: self.$conversationAutomationPublicWebhookURL)
                            }
                        }
                    }

                    self.onboardingCard(spacing: 14, padding: 18) {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(self.strings.conversationAutomationSttTitle)
                                .font(.headline)
                            Text(self.strings.conversationAutomationSttSubtitle)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                            Picker(
                                self.strings.conversationAutomationSttTitle,
                                selection: Binding(
                                    get: { self.conversationAutomationSttProvider },
                                    set: { newValue in
                                        self.conversationAutomationSttProvider = newValue
                                        self.applyConversationAutomationVoiceDraft()
                                    }))
                            {
                                Text(self.strings.conversationAutomationSttDeepgramLabel)
                                    .tag(ConversationAutomationSttProvider.deepgramRealtime)
                                Text(self.strings.conversationAutomationSttOpenAILabel)
                                    .tag(ConversationAutomationSttProvider.openaiRealtime)
                            }
                            .pickerStyle(.segmented)

                            switch self.conversationAutomationSttProvider {
                            case .deepgramRealtime:
                                self.conversationAutomationExternalLinks([
                                    (self.strings.conversationAutomationOpenConsoleButtonTitle, VoiceSetupExternalURL.deepgramConsole),
                                    (self.strings.conversationAutomationOpenGuideButtonTitle, VoiceSetupExternalURL.deepgramGuide),
                                ])
                                self.conversationAutomationSecureField(
                                    title: self.strings.conversationAutomationDeepgramAPIKeyTitle,
                                    subtitle: self.strings.conversationAutomationDeepgramAPIKeySubtitle,
                                    placeholder: self.strings.conversationAutomationDeepgramAPIKeyPlaceholder,
                                    text: self.$conversationAutomationDeepgramAPIKey)
                            case .openaiRealtime:
                                self.conversationAutomationExternalLinks([
                                    (self.strings.conversationAutomationOpenAPIKeysButtonTitle, VoiceSetupExternalURL.openAIAPIKeys),
                                    (self.strings.conversationAutomationOpenGuideButtonTitle, VoiceSetupExternalURL.openAIRealtimeGuide),
                                ])
                                self.conversationAutomationSecureField(
                                    title: self.strings.conversationAutomationOpenAIAPIKeyTitle,
                                    subtitle: self.strings.conversationAutomationOpenAIAPIKeySubtitle,
                                    placeholder: self.strings.conversationAutomationOpenAIAPIKeyPlaceholder,
                                    text: self.$conversationAutomationOpenAIAPIKey)
                            }
                        }
                    }

                    self.onboardingCard(spacing: 14, padding: 18) {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(self.strings.conversationAutomationTtsTitle)
                                .font(.headline)
                            Text(self.strings.conversationAutomationTtsSubtitle)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                            self.conversationAutomationExternalLinks([
                                (self.strings.conversationAutomationOpenGuideButtonTitle, VoiceSetupExternalURL.elevenLabsAuthGuide),
                                (self.strings.conversationAutomationOpenVoiceLibraryButtonTitle, VoiceSetupExternalURL.elevenLabsVoiceLibrary),
                            ])
                            self.conversationAutomationSecureField(
                                title: self.strings.conversationAutomationElevenLabsAPIKeyTitle,
                                subtitle: self.strings.conversationAutomationElevenLabsAPIKeySubtitle,
                                placeholder: self.strings.conversationAutomationElevenLabsAPIKeyPlaceholder,
                                text: self.$conversationAutomationElevenLabsAPIKey)
                            self.conversationAutomationTextField(
                                title: self.strings.conversationAutomationElevenLabsVoiceIDTitle,
                                subtitle: self.strings.conversationAutomationElevenLabsVoiceIDSubtitle,
                                placeholder: self.strings.conversationAutomationElevenLabsVoiceIDPlaceholder,
                                text: self.$conversationAutomationElevenLabsVoiceID)
                        }
                    }

                    self.onboardingCard(spacing: 12, padding: 16) {
                        if self.conversationAutomationVoiceValidationMessages.isEmpty {
                            self.featureRow(
                                title: self.strings.conversationAutomationReadyTitle,
                                subtitle: self.strings.conversationAutomationReadySubtitle,
                                systemImage: "checkmark.circle")
                        } else {
                            VStack(alignment: .leading, spacing: 8) {
                                self.featureRow(
                                    title: self.strings.conversationAutomationBeforeFinishTitle,
                                    subtitle: self.strings.conversationAutomationValidationListHeader,
                                    systemImage: "exclamationmark.triangle")
                                ForEach(self.conversationAutomationVoiceValidationMessages, id: \.self) { message in
                                    Text("• \(message)")
                                        .font(.footnote)
                                        .foregroundStyle(.secondary)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                            }
                        }
                    }
                }
            }
        }
        .task(id: self.activePageIndex) {
            guard Self.shouldActivateOnboardingPageSideEffects(
                activePageIndex: self.activePageIndex,
                pageIndex: self.conversationAutomationPageIndex)
            else { return }
            await self.prepareConversationAutomationPage()
        }
    }

    @ViewBuilder
    private func conversationAutomationExternalLinks(_ links: [(String, String)]) -> some View {
        HStack(spacing: 14) {
            ForEach(Array(links.enumerated()), id: \.offset) { entry in
                let link = entry.element
                if let url = URL(string: link.1) {
                    Link(destination: url) {
                        Label(link.0, systemImage: "arrow.up.right.square")
                    }
                    .buttonStyle(.link)
                }
            }
        }
    }

    @ViewBuilder
    private func conversationAutomationTextField(
        title: String,
        subtitle: String,
        placeholder: String,
        text: Binding<String>) -> some View
    {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.headline)
            Text(subtitle)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            TextField(placeholder, text: text)
                .textFieldStyle(.roundedBorder)
                .onChange(of: text.wrappedValue) { _, _ in
                    self.applyConversationAutomationVoiceDraft()
                }
        }
    }

    @ViewBuilder
    private func conversationAutomationSecureField(
        title: String,
        subtitle: String,
        placeholder: String,
        text: Binding<String>) -> some View
    {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.headline)
            Text(subtitle)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            SecureField(placeholder, text: text)
                .textFieldStyle(.roundedBorder)
                .onChange(of: text.wrappedValue) { _, _ in
                    self.applyConversationAutomationVoiceDraft()
                }
        }
    }

    @ViewBuilder
    private func conversationAutomationReadOnlyValue(
        title: String,
        subtitle: String,
        value: String) -> some View
    {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.headline)
            Text(subtitle)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 10) {
                TextField("", text: .constant(value))
                    .textFieldStyle(.roundedBorder)
                    .disabled(true)
                Button(self.strings.conversationAutomationCopyURLButtonTitle) {
                    self.copyToPasteboard(value)
                }
                .buttonStyle(.bordered)
            }
        }
    }

    @ViewBuilder
    func managedBrowserSignInSection() -> some View {
        if Self.shouldOfferManagedBrowserSignIn(
            mode: self.state.connectionMode,
            browserControlEnabled: MaumauConfigFile.browserControlEnabled())
        {
            self.featureActionRow(
                title: self.strings.managedBrowserSignInTitle,
                subtitle: self.strings.managedBrowserSignInSubtitle,
                systemImage: "globe",
                buttonTitle: self.managedBrowserSignInLaunching
                    ? self.strings.managedBrowserSignInOpeningButtonTitle
                    : self.strings.managedBrowserSignInButtonTitle,
                disabled: self.managedBrowserSignInLaunching)
            {
                Task {
                    _ = await self.openManagedBrowserForSignIn()
                }
            }

            if let managedBrowserSignInStatus,
               !managedBrowserSignInStatus.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            {
                Text(managedBrowserSignInStatus)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    func skillsSetupPage() -> some View {
        self.onboardingPage(pageID: self.skillsSetupPageIndex) {
            VStack(spacing: 16) {
                Text(self.strings.skillsTitle)
                    .font(.largeTitle.weight(.semibold))
                Text(self.strings.skillsIntro)
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

                    ForEach(Array(self.strings.includedToolHighlights().enumerated()), id: \.element.id) { index, highlight in
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
                        Text(self.strings.dailyLifeHelpersTitle)
                            .font(.headline)
                        Spacer(minLength: 0)
                    }

                    ForEach(Array(self.strings.includedHelperHighlights().enumerated()), id: \.element.id) { index, highlight in
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
                        title: self.strings.memoryTitle,
                        subtitle: self.strings.memorySubtitle,
                        systemImage: "brain.head.profile")
                }

                self.onboardingCard {
                    self.featureActionRow(
                        title: self.strings.openFullSkillsTitle,
                        subtitle: self.strings.openFullSkillsSubtitle,
                        systemImage: "sparkles",
                        buttonTitle: self.strings.openFullSkillsButtonTitle)
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
                            StatusPill(
                                text: badge.title(in: self.state.effectiveOnboardingLanguage),
                                tint: badge.tint)
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
            Text(self.strings.readyTitle)
                .font(.largeTitle.weight(.semibold))
            self.onboardingCard {
                Text(self.strings.readyHeadline)
                    .font(.headline)
                Text(self.strings.readyBody)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                Divider()
                    .padding(.vertical, 6)

                if self.state.connectionMode == .unconfigured {
                    self.featureRow(
                        title: self.strings.configureLaterTitle,
                        subtitle: self.strings.configureLaterSubtitle,
                        systemImage: "gearshape")
                    Divider()
                        .padding(.vertical, 6)
                }
                if self.state.connectionMode == .local {
                    if Self.shouldOfferManagedBrowserSignIn(
                        mode: self.state.connectionMode,
                        browserControlEnabled: MaumauConfigFile.browserControlEnabled())
                    {
                        self.managedBrowserSignInSection()
                        Divider()
                            .padding(.vertical, 6)
                    }
                    self.featureActionRow(
                        title: macLocalized("Change Mac access or tools later", language: self.state.effectiveOnboardingLanguage),
                        subtitle: macLocalized(
                            "Permissions and the full Skills list stay available in Settings whenever you want to fine-tune things.",
                            language: self.state.effectiveOnboardingLanguage),
                        systemImage: "lock.shield",
                        buttonTitle: macLocalized(
                            "Open Settings → Permissions",
                            language: self.state.effectiveOnboardingLanguage))
                    {
                        self.openSettings(tab: .permissions)
                    }
                    Divider()
                        .padding(.vertical, 6)
                    self.featureActionRow(
                        title: macLocalized("Manage private access later", language: self.state.effectiveOnboardingLanguage),
                        subtitle: macLocalized(
                            "Open Settings → General any time to install Tailscale on this Mac, sign this Mac in, turn private access on, or revisit the steps for adding your phone later.",
                            language: self.state.effectiveOnboardingLanguage),
                        systemImage: "point.3.connected.trianglepath.dotted",
                        buttonTitle: macLocalized(
                            "Open Settings → General",
                            language: self.state.effectiveOnboardingLanguage))
                    {
                        self.openSettings(tab: .general)
                    }
                    Divider()
                        .padding(.vertical, 6)
                }
                if self.state.connectionMode == .remote {
                    self.featureRow(
                        title: macLocalized("Remote gateway checklist", language: self.state.effectiveOnboardingLanguage),
                        subtitle: macLocalized(
                            """
                            On your gateway host: install/update the `maumau` package and make sure credentials exist
                            (typically `~/.maumau/credentials/oauth.json`). Then connect again if needed.
                            """,
                            language: self.state.effectiveOnboardingLanguage),
                        systemImage: "network")
                    Divider()
                        .padding(.vertical, 6)
                }
                self.featureRow(
                    title: self.strings.menuBarPanelTitle,
                    subtitle: self.strings.menuBarPanelSubtitle,
                    systemImage: "bubble.left.and.bubble.right")
                self.featureRow(
                    title: self.strings.voiceWakeTitle,
                    subtitle: self.strings.voiceWakeSubtitle,
                    systemImage: "waveform.circle")
                self.featureRow(
                    title: self.strings.panelCanvasTitle,
                    subtitle: self.strings.panelCanvasSubtitle,
                    systemImage: "rectangle.inset.filled.and.person.filled")
                Toggle(self.strings.launchAtLoginTitle, isOn: self.$state.launchAtLogin)
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
                Text(self.strings.includedSkillsTitle)
                    .font(.headline)
                Spacer(minLength: 0)
                if self.onboardingSkillsModel.isLoading {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Button(self.strings.refreshButtonTitle) {
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
                    Text(
                        self.state.effectiveOnboardingLanguage == .en
                            ? "Couldn’t check the included skills yet."
                            : "Belum bisa memeriksa skill bawaan.")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.orange)
                    Text(
                        self.state.effectiveOnboardingLanguage == .en
                            ? "Make sure the Gateway is running and connected, then hit Refresh or open Settings → Skills."
                            : "Pastikan Gateway sedang berjalan dan terhubung, lalu tekan Segarkan atau buka Pengaturan → Skill.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(
                        self.state.effectiveOnboardingLanguage == .en
                            ? "Details: \(error)"
                            : "Detail: \(error)")
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
                        Text(self.strings.checkingIncludedSkillsTitle)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    } else {
                        Text(
                            self.state.effectiveOnboardingLanguage == .en
                                ? (self.readyOnboardingSkillCount == 1
                                    ? "1 included skill is ready on this Mac right now."
                                    : "\(self.readyOnboardingSkillCount) included skills are ready on this Mac right now.")
                                : (self.readyOnboardingSkillCount == 1
                                    ? "1 skill bawaan siap di Mac ini sekarang."
                                    : "\(self.readyOnboardingSkillCount) skill bawaan siap di Mac ini sekarang."))
                            .font(.footnote.weight(.semibold))
                        Text(
                            self.state.effectiveOnboardingLanguage == .en
                                ? "First-time local setup auto-installs nano-pdf, OpenAI Whisper, and summarize when they are missing. Skill Creator is already bundled and ready."
                                : "Pengaturan lokal pertama akan memasang nano-pdf, OpenAI Whisper, dan summarize secara otomatis jika belum ada. Skill Creator sudah dibundel dan siap."
                        )
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                        Text(
                            self.state.effectiveOnboardingLanguage == .en
                                ? "Browser control, the core Mac tools above, and the default daily-life helpers stay separate from the longer Skills list, so the detailed inventory stays in Settings → Skills."
                                : "Kontrol browser, tool inti Mac di atas, dan helper harian default tetap terpisah dari daftar Skill yang lebih panjang, jadi inventaris detailnya tetap ada di Pengaturan → Skill."
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

    static func includedToolHighlights(language: OnboardingLanguage = .en) -> [OnboardingToolHighlight] {
        OnboardingStrings(language: language).includedToolHighlights()
    }

    static func includedHelperHighlights(language: OnboardingLanguage = .en) -> [OnboardingToolHighlight] {
        OnboardingStrings(language: language).includedHelperHighlights()
    }
}

private struct OnboardingChannelsSetupView: View {
    @Bindable var store: ChannelsStore
    let openFullChannelsSettings: () -> Void
    let isActive: Bool
    let language: OnboardingLanguage
    @State private var selectedChannelID: String?

    init(
        store: ChannelsStore,
        openFullChannelsSettings: @escaping () -> Void,
        isActive: Bool,
        language: OnboardingLanguage)
    {
        self.store = store
        self.openFullChannelsSettings = openFullChannelsSettings
        self.isActive = isActive
        self.language = language
    }

    private var settingsView: ChannelsSettings {
        ChannelsSettings(store: self.store)
    }

    private var channels: [ChannelsSettings.ChannelItem] {
        self.settingsView.onboardingOrderedChannels
    }

    private var strings: OnboardingStrings {
        OnboardingStrings(language: self.language)
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
                Label(self.strings.availableChatAppsTitle, systemImage: "bubble.left.and.bubble.right")
                    .font(.headline)
                Spacer(minLength: 0)
                if self.store.isRefreshing && self.store.snapshot == nil {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Button(self.strings.refreshButtonTitle) {
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
                Text(
                    self.language == .en
                        ? "Gateway status warning: \(lastError)"
                        : "Peringatan status Gateway: \(lastError)")
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
        GroupBox(self.strings.finishInSettingsTitle) {
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
            switch (self.language, alreadyConnected) {
            case (.en, true):
                return "WhatsApp is ready. Maumau is already using the recommended defaults, and you can change advanced routing or access rules later in full Settings → Channels."
            case (.en, false):
                return "If you want to change approved numbers, routing, or other advanced WhatsApp behavior later, use full Settings → Channels. Maumau keeps the recommended defaults unless you change them."
            case (.id, true):
                return "WhatsApp sudah siap. Maumau sudah menggunakan default yang direkomendasikan, dan Anda bisa mengubah routing lanjutan atau aturan akses nanti di Pengaturan lengkap → Channel."
            case (.id, false):
                return "Jika nanti Anda ingin mengubah nomor yang diizinkan, routing, atau perilaku WhatsApp lanjutan lainnya, gunakan Pengaturan lengkap → Channel. Maumau akan tetap memakai default yang direkomendasikan sampai Anda mengubahnya."
            }
        }

        if alreadyConnected {
            return self.language == .en
                ? "\(channel.title) is already connected. Maumau is using the recommended defaults, and you can review or override them later in full Settings → Channels."
                : "\(channel.title) sudah terhubung. Maumau menggunakan default yang direkomendasikan, dan Anda bisa meninjaunya atau menggantinya nanti di Pengaturan lengkap → Channel."
        }

        return self.language == .en
            ? "Onboarding is only showing the key setup details for \(channel.title). When you are ready, open full Settings → Channels to paste the token or finish the account/device connection. Maumau will use the recommended defaults automatically for the rest."
            : "Onboarding hanya menampilkan detail pengaturan utama untuk \(channel.title). Saat Anda siap, buka Pengaturan lengkap → Channel untuk menempelkan token atau menyelesaikan koneksi akun/perangkat. Maumau akan memakai default yang direkomendasikan secara otomatis untuk sisanya."
    }

    private func settingsHandoffButtonTitle(
        for channel: ChannelsSettings.ChannelItem,
        alreadyConnected: Bool) -> String
    {
        if alreadyConnected {
            return self.language == .en
                ? "Review \(channel.title) in Settings"
                : "Tinjau \(channel.title) di Pengaturan"
        }

        switch channel.id {
        case "discord":
            return self.language == .en ? "Open Settings for Discord bot" : "Buka Pengaturan untuk bot Discord"
        case "googlechat":
            return self.language == .en ? "Open Settings for Google Chat" : "Buka Pengaturan untuk Google Chat"
        case "imessage":
            return self.language == .en ? "Open Settings for Messages" : "Buka Pengaturan untuk Messages"
        case "line":
            return self.language == .en ? "Open Settings for LINE bot" : "Buka Pengaturan untuk bot LINE"
        case "slack":
            return self.language == .en ? "Open Settings for Slack app" : "Buka Pengaturan untuk aplikasi Slack"
        case "telegram":
            return self.language == .en ? "Open Settings for Telegram bot" : "Buka Pengaturan untuk bot Telegram"
        case "whatsapp":
            return self.language == .en ? "Open full WhatsApp settings" : "Buka pengaturan WhatsApp lengkap"
        default:
            return self.language == .en ? "Open Settings → Channels" : "Buka Pengaturan → Channel"
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
                Text(self.strings.loadingChatAppsTitle)
                    .font(.callout.weight(.medium))
            }

            Text(self.strings.loadingChatAppsHint)
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
