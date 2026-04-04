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
    let isActive: Bool
    let draftStore: ChannelsStore?
    private var tailscaleService: TailscaleService

    @State private var hasLoadedConfig = false
    @State private var tailscaleMode: GatewayTailscaleMode = .off
    @State private var requireCredentialsForServe = false
    @State private var password: String = ""
    @State private var statusMessage: String?
    @State private var validationMessage: String?
    @State private var actionMessage: String?
    @State private var actionMessageIsError = false
    @State private var isInstallingTailscale = false
    @State private var isOpeningBrowserSignIn = false
    @State private var statusTimer: Timer?
    @State private var lastAppliedTailscaleMode: GatewayTailscaleMode = .off
    @State private var lastAppliedRequireCredentialsForServe = false
    @State private var lastAppliedPassword: String = ""
    @State private var suppressedSelectionChanges = 0

    init(
        connectionMode: AppState.ConnectionMode,
        isPaused: Bool,
        presentation: TailscaleIntegrationPresentation = .settings,
        isActive: Bool = true,
        draftStore: ChannelsStore? = nil,
        service: TailscaleService = .shared)
    {
        self.connectionMode = connectionMode
        self.isPaused = isPaused
        self.presentation = presentation
        self.isActive = isActive
        self.draftStore = draftStore
        self.tailscaleService = service
    }

    private var effectiveService: TailscaleService {
        return self.tailscaleService
    }

    private var language: OnboardingLanguage {
        AppStateStore.shared.effectiveOnboardingLanguage
    }

    private var defersOnboardingConfigSave: Bool {
        self.draftStore?.defersConfigSaves == true
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(macLocalized("Private access", language: self.language))
                .font(.callout.weight(.semibold))
            Text(self.introText)
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            if self.presentation == .settings {
                self.settingsGuide
            }

            self.statusRow

            if !self.hasLoadedConfig {
                self.loadingState
            } else {
                self.modePicker
                if self.tailscaleMode != .off {
                    self.guidanceCard
                }
                if !self.effectiveService.isInstalled {
                    self.installButtons
                }
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
                Text(macLocalized("Local mode required. Update settings on the gateway host.", language: self.language))
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
        .task(id: self.isActive) {
            guard self.isActive else { return }
            await self.syncConfigAndServiceState(showLoading: true)
            self.startStatusTimer()
        }
        .onDisappear {
            self.stopStatusTimer()
        }
        .onChange(of: self.tailscaleMode) { _, _ in
            guard self.suppressedSelectionChanges == 0 else {
                self.suppressedSelectionChanges -= 1
                return
            }
            Task { await self.applySettings() }
        }
        .onChange(of: self.requireCredentialsForServe) { _, _ in
            guard self.suppressedSelectionChanges == 0 else {
                self.suppressedSelectionChanges -= 1
                return
            }
            Task { await self.applySettings() }
        }
    }

    private var introText: String {
        switch self.presentation {
        case .settings:
            if !self.effectiveService.isInstalled {
                return macLocalized(
                    "Install Tailscale here to turn on private access for this Gateway.",
                    language: self.language)
            }
            if !self.effectiveService.isRunning {
                return macLocalized(
                    "Finish Tailscale sign-in on this Mac, then choose how this Gateway is shared.",
                    language: self.language)
            }
            return macLocalized(
                "Manage how this Gateway is shared through Tailscale.",
                language: self.language)
        case .onboarding:
            return macLocalized(
                "Powered by Tailscale. Use the install button here on this Mac first, then add your phone or other devices later when you want them.",
                language: self.language)
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
            Button(macLocalized("Refresh", language: self.language)) {
                Task { await self.refreshAndRetrySelection() }
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
    }

    private var settingsGuide: some View {
        DisclosureGroup(macLocalized("Need help adding another device later?", language: self.language)) {
            VStack(alignment: .leading, spacing: 4) {
                Text(macLocalized("Install Tailscale on that phone or laptop later.", language: self.language))
                Text(macLocalized("Sign in there with the same Tailscale account or private network.", language: self.language))
                Text(macLocalized("Then open the private link shown here.", language: self.language))
            }
            .padding(.top, 4)
        }
        .font(.caption)
        .foregroundStyle(.secondary)
    }

    private var statusColor: Color {
        if !self.effectiveService.isInstalled { return .yellow }
        if self.hasLoadedConfig,
           self.tailscaleMode != .off,
           let exposure = self.selectedExposureStatus,
           self.effectiveService.isRunning
        {
            return exposure.active ? .green : .orange
        }
        if self.effectiveService.isRunning { return .green }
        return .orange
    }

    private var statusText: String {
        if !self.effectiveService.isInstalled {
            return macLocalized("Tailscale is not installed on this Mac yet", language: self.language)
        }
        if self.hasLoadedConfig,
           self.tailscaleMode == .serve,
           let exposure = self.selectedExposureStatus,
           self.effectiveService.isRunning
        {
            if exposure.active {
                return macLocalized("Tailscale Serve is active on this Mac", language: self.language)
            }
            return macLocalized("Tailscale is signed in, but Serve is not active on this Mac.", language: self.language)
        }
        if self.hasLoadedConfig,
           self.tailscaleMode == .funnel,
           let exposure = self.selectedExposureStatus,
           self.effectiveService.isRunning
        {
            if exposure.active {
                return macLocalized("Tailscale Funnel is active on this Mac", language: self.language)
            }
            return macLocalized("Tailscale is signed in, but Funnel is not active on this Mac.", language: self.language)
        }
        if self.effectiveService.isRunning {
            return macLocalized("Tailscale is installed and signed in on this Mac", language: self.language)
        }
        return macLocalized("Tailscale is installed, but this Mac is not signed in yet", language: self.language)
    }

    private var installButtons: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button(action: self.installTailscale) {
                if self.isInstallingTailscale {
                    self.busyLabel("Installing on this Mac…")
                } else {
                    Text(macLocalized("Install on this Mac", language: self.language))
                }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.small)
            .disabled(self.isActionBusy)

            Text(
                macLocalized(
                    "Maumau downloads the official Tailscale macOS package and runs the installer command here. macOS will ask for your administrator password.",
                    language: self.language))
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Button(macLocalized("Open Tailscale guide", language: self.language)) {
                self.effectiveService.openSetupGuide()
            }
                .buttonStyle(.link)
        }
    }

    private var loadingState: some View {
        HStack(spacing: 8) {
            ProgressView()
                .controlSize(.small)
            Text(macLocalized("Loading private access settings…", language: self.language))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var modePicker: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(macLocalized("Access mode", language: self.language))
                .font(.callout.weight(.semibold))
            Picker(macLocalized("Access", language: self.language), selection: self.$tailscaleMode) {
                ForEach(GatewayTailscaleMode.allCases) { mode in
                    Text(macLocalized(mode.label, language: self.language)).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            Text(macLocalized(self.tailscaleMode.description, language: self.language))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private var accessURLRow: some View {
        if let host = self.verifiedAccessHost {
            let url = "https://\(host)/ui/"
            HStack(spacing: 8) {
                Text(macPrivateLinkLabel(isPublic: self.tailscaleMode == .funnel, language: self.language))
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
        } else if let detail = self.accessDetailText {
            VStack(alignment: .leading, spacing: 4) {
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if let enableURL = self.accessEnableURL,
                   let link = URL(string: enableURL)
                {
                    Link(enableURL, destination: link)
                        .font(.system(.caption, design: .monospaced))
                }
            }
        } else if !self.effectiveService.isRunning {
            Text(
                macLocalized(
                    "Sign in on this Mac first. Tailscale can open your browser, and then you can come back here for the private link.",
                    language: self.language))
                .font(.caption)
                .foregroundStyle(.secondary)
        }

        if self.effectiveService.isInstalled, !self.effectiveService.isRunning {
            Button(action: self.openBrowserSignIn) {
                if self.isOpeningBrowserSignIn {
                    self.busyLabel("Opening browser sign-in…")
                } else {
                    Text(macLocalized("Open browser sign-in", language: self.language))
                }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.small)
            .disabled(self.isActionBusy)
        }
    }

    @ViewBuilder
    private var guidanceCard: some View {
        let flow = self.currentAccessFlow
        if self.shouldShowGuidanceCard(flow: flow) {
            VStack(alignment: .leading, spacing: 8) {
                Text(
                    macLocalized(
                        flow.phase == .activating
                            ? self.activatingMessage(for: self.tailscaleMode)
                            : "Finish these steps to turn on this access mode.",
                        language: self.language))
                    .font(.callout.weight(.semibold))

                if self.tailscaleMode != self.lastAppliedTailscaleMode || flow.phase != .active {
                    Text(
                        macLocalized(
                            "This selection is not saved yet. Maumau keeps the current access mode until setup is complete.",
                            language: self.language))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(
                        "\(macLocalized("Current access mode", language: self.language)): \(macLocalized(self.lastAppliedTailscaleMode.label, language: self.language))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if flow.phase == .activating {
                    ProgressView()
                        .controlSize(.small)
                }

                ForEach(flow.requirements) { requirement in
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Image(systemName: self.requirementSymbol(for: requirement))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text(macLocalized(self.requirementText(for: requirement), language: self.language))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }

                if flow.requirements.isEmpty,
                   flow.phase != .activating,
                   let detail = flow.detail
                {
                    Text(macLocalized(detail, language: self.language))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if let enableURL = self.accessEnableURL,
                   flow.requirements.contains(where: { $0.kind == .enableFeature })
                {
                    Button(macLocalized(self.enableFeatureButtonTitle(for: self.tailscaleMode), language: self.language)) {
                        self.openEnableSetupURL(enableURL)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)

                    Text(enableURL)
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.secondary)
                }

                if self.shouldShowRetryButton(flow: flow) {
                    Button(macLocalized("Retry activation", language: self.language)) {
                        Task { await self.refreshAndRetrySelection() }
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }
            }
            .padding(10)
            .background(Color.gray.opacity(0.06))
            .cornerRadius(8)
        }
    }

    private var serveAuthSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Toggle(macLocalized("Require credentials", language: self.language), isOn: self.$requireCredentialsForServe)
                .toggleStyle(.checkbox)
            if self.requireCredentialsForServe {
                self.authFields
            } else {
                Text(
                    macLocalized(
                        "Private mode trusts Tailscale's verified identity, so Maumau does not need its own password here.",
                        language: self.language))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var funnelAuthSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(macLocalized("Public mode requires a Maumau password.", language: self.language))
                .font(.caption)
                .foregroundStyle(.secondary)
            self.authFields
        }
    }

    @ViewBuilder
    private var authFields: some View {
        SecureField(macLocalized("Password", language: self.language), text: self.$password)
            .textFieldStyle(.roundedBorder)
            .frame(maxWidth: 240)
            .onSubmit { Task { await self.applySettings() } }
        Text(
            macLocalized(
                "Stored in ~/.maumau/maumau.json. Prefer MAUMAU_GATEWAY_PASSWORD if you want to manage it outside the app.",
                language: self.language))
            .font(.caption)
            .foregroundStyle(.secondary)
        Button(macLocalized("Update password", language: self.language)) {
            Task { await self.applySettings() }
        }
            .buttonStyle(.bordered)
            .controlSize(.small)
    }

    private func loadConfig() async {
        let root = await self.loadEffectiveConfigRoot()
        let gateway = root["gateway"] as? [String: Any] ?? [:]
        let auth = gateway["auth"] as? [String: Any] ?? [:]
        let appliedMode = GatewayTailscaleMode(
            rawValue: Self.resolveConfiguredTailscaleModeRaw(gateway: gateway)) ?? .off
        let appliedPassword = auth["password"] as? String ?? ""
        let appliedRequireCredentials = appliedMode == .serve
            ? Self.resolveRequireCredentialsForServe(auth: auth)
            : false

        self.lastAppliedTailscaleMode = appliedMode
        self.lastAppliedRequireCredentialsForServe = appliedRequireCredentials
        self.lastAppliedPassword = appliedPassword

        if !Self.shouldPreserveRequestedSelection(accessFlow: self.effectiveService.accessFlow) {
            self.setRequestedSelection(
                mode: appliedMode,
                requireCredentialsForServe: appliedRequireCredentials,
                password: appliedPassword)
        }
    }

    private func applySettings() async {
        guard self.hasLoadedConfig else { return }
        self.validationMessage = nil
        self.statusMessage = nil
        self.clearActionMessage()
        if self.tailscaleMode == .off {
            await self.persistOffSelection()
            return
        }
        await self.evaluateCurrentSelection(allowActivation: true, refreshStatus: true)
    }

    @MainActor
    private func persistTailscaleConfig(
        tailscaleMode: GatewayTailscaleMode,
        requireCredentialsForServe: Bool,
        password: String,
    ) async -> (Bool, String?)
    {
        let existingRoot = await self.loadEffectiveConfigRoot()
        let root = Self.buildTailscaleConfigRoot(
            existingRoot: existingRoot,
            tailscaleMode: tailscaleMode,
            requireCredentialsForServe: requireCredentialsForServe,
            password: password)

        do {
            try await self.saveEffectiveConfigRoot(root)
            return (true, nil)
        } catch {
            return (false, error.localizedDescription)
        }
    }

    @MainActor
    private func loadEffectiveConfigRoot() async -> [String: Any] {
        let persisted = await Self.loadPersistedConfigRoot(connectionMode: self.connectionMode)
        guard let draftStore else { return persisted }
        return draftStore.editableConfigRoot(fallback: persisted)
    }

    @MainActor
    private func saveEffectiveConfigRoot(_ root: [String: Any]) async throws {
        if let draftStore {
            draftStore.replaceConfigDraft(root, dirty: true)
            draftStore.configStatus = nil
            return
        }
        try await ConfigStore.save(root)
    }

    private func startStatusTimer() {
        self.stopStatusTimer()
        if ProcessInfo.processInfo.isRunningTests {
            return
        }
        self.statusTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { _ in
            Task { await self.syncConfigAndServiceState(showLoading: false) }
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
            Text(macLocalized(title, language: self.language))
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
        self.setActionMessage(
            macLocalized("Downloading the official Tailscale installer…", language: self.language),
            isError: false)
        self.isInstallingTailscale = true

        Task {
            let outcome = await self.effectiveService.installOnThisMac()
            self.isInstallingTailscale = false
            self.setActionMessage(
                macLocalized(outcome.message, language: self.language),
                isError: !outcome.success)
        }
    }

    private func openBrowserSignIn() {
        guard !self.isActionBusy else { return }
        self.validationMessage = nil
        self.statusMessage = nil
        self.setActionMessage(
            macLocalized("Preparing browser sign-in…", language: self.language),
            isError: false)
        self.isOpeningBrowserSignIn = true

        Task {
            let outcome = await self.effectiveService.openBrowserSignIn()
            self.isOpeningBrowserSignIn = false
            self.setActionMessage(
                macLocalized(outcome.message, language: self.language),
                isError: !outcome.success)
        }
    }

    private func openEnableSetupURL(_ urlString: String) {
        guard self.effectiveService.openExternalURL(urlString) else { return }
    }

    private func refreshAndRetrySelection() async {
        guard self.hasLoadedConfig else { return }
        self.validationMessage = nil
        self.clearActionMessage()
        if self.tailscaleMode == .off {
            await self.syncConfigAndServiceState(showLoading: false)
            return
        }
        await self.evaluateCurrentSelection(allowActivation: true, refreshStatus: true)
    }

    private func persistOffSelection() async {
        let previousMode = self.lastAppliedTailscaleMode
        let previousRequireCredentials = self.lastAppliedRequireCredentialsForServe
        let previousPassword = self.lastAppliedPassword
        let (success, errorMessage) = await self.persistTailscaleConfig(
            tailscaleMode: .off,
            requireCredentialsForServe: false,
            password: self.password.trimmingCharacters(in: .whitespacesAndNewlines))

        guard success else {
            self.statusMessage = macLocalized(
                errorMessage ?? "Could not apply private access settings on this Mac.",
                language: self.language)
            self.setRequestedSelection(
                mode: previousMode,
                requireCredentialsForServe: previousRequireCredentials,
                password: previousPassword)
            return
        }

        self.lastAppliedTailscaleMode = .off
        self.lastAppliedRequireCredentialsForServe = false
        self.lastAppliedPassword = self.password
        self.effectiveService.clearAccessFlow(appliedMode: GatewayTailscaleMode.off.rawValue)

        if self.connectionMode == .local, !self.isPaused {
            let applyResult = await self.effectiveService.applyExposureSelection(
                mode: GatewayTailscaleMode.off.rawValue,
                port: GatewayEnvironment.gatewayPort())
            if !applyResult.ok, let message = applyResult.message, !message.isEmpty {
                self.statusMessage = macLocalized(message, language: self.language)
            } else {
                self.statusMessage = macLocalized(
                    self.defersOnboardingConfigSave
                        ? "Private access settings are ready. Maumau will apply them when you finish setup."
                        : "Saved private access settings.",
                    language: self.language)
            }
            await self.effectiveService.checkTailscaleStatus()
        } else {
            self.statusMessage = macLocalized(
                self.defersOnboardingConfigSave
                    ? "Private access settings are ready. Maumau will apply them when you finish setup."
                    : "Saved private access settings. Restart the gateway to apply.",
                language: self.language)
        }
    }

    private func evaluateCurrentSelection(allowActivation: Bool, refreshStatus: Bool) async {
        let trimmedPassword = self.password.trimmingCharacters(in: .whitespacesAndNewlines)
        let requiresPassword = self.modeRequiresPassword
        let readiness = await self.effectiveService.readinessForSelection(
            mode: self.tailscaleMode.rawValue,
            requiresPassword: requiresPassword,
            password: trimmedPassword,
            refreshStatus: refreshStatus)

        if !readiness.requirements.isEmpty {
            if readiness.requirements.contains(where: { $0.kind == .password }) {
                self.validationMessage = macLocalized("Password required for this mode.", language: self.language)
            }
            self.statusMessage = readiness.detail.map { macLocalized($0, language: self.language) }
            self.effectiveService.updateAccessFlow(
                appliedMode: self.lastAppliedTailscaleMode.rawValue,
                requestedMode: self.tailscaleMode.rawValue,
                phase: .blocked,
                requirements: readiness.requirements,
                detail: readiness.detail,
                exposure: readiness.exposure)
            return
        }

        let hasConfigChanges = self.hasPendingConfigChanges(trimmedPassword: trimmedPassword)
        if !allowActivation {
            if !hasConfigChanges, readiness.isActive {
                self.statusMessage = nil
                self.effectiveService.updateAccessFlow(
                    appliedMode: self.lastAppliedTailscaleMode.rawValue,
                    requestedMode: self.tailscaleMode.rawValue,
                    phase: .active,
                    detail: nil,
                    exposure: readiness.exposure)
            } else {
                let phase: TailscaleService.AccessFlowPhase =
                    self.tailscaleMode == self.lastAppliedTailscaleMode && !hasConfigChanges
                    ? .failed
                    : .blocked
                let detail = readiness.detail
                    ?? (phase == .blocked
                        ? "Ready to activate. Press Refresh to finish turning this on."
                        : self.inactiveSelectionMessage(for: self.tailscaleMode))
                self.statusMessage = macLocalized(detail, language: self.language)
                self.effectiveService.updateAccessFlow(
                    appliedMode: self.lastAppliedTailscaleMode.rawValue,
                    requestedMode: self.tailscaleMode.rawValue,
                    phase: phase,
                    detail: detail,
                    exposure: readiness.exposure)
            }
            return
        }

        let needsExposureApply = self.connectionMode == .local
            && !self.isPaused
            && (self.tailscaleMode != self.lastAppliedTailscaleMode || !readiness.isActive)
        if needsExposureApply {
            let activatingDetail = self.activatingMessage(for: self.tailscaleMode)
            self.statusMessage = macLocalized(activatingDetail, language: self.language)
            self.effectiveService.updateAccessFlow(
                appliedMode: self.lastAppliedTailscaleMode.rawValue,
                requestedMode: self.tailscaleMode.rawValue,
                phase: .activating,
                detail: activatingDetail,
                exposure: readiness.exposure)

            let applyResult = await self.effectiveService.applyExposureSelection(
                mode: self.tailscaleMode.rawValue,
                port: GatewayEnvironment.gatewayPort())
            guard applyResult.ok else {
                let refreshed = await self.effectiveService.readinessForSelection(
                    mode: self.tailscaleMode.rawValue,
                    requiresPassword: requiresPassword,
                    password: trimmedPassword,
                    refreshStatus: false)
                let detail = applyResult.message
                    ?? refreshed.detail
                    ?? "Could not apply private access settings on this Mac."
                self.statusMessage = macLocalized(detail, language: self.language)
                if refreshed.requirements.contains(where: { $0.kind == .password }) {
                    self.validationMessage = macLocalized("Password required for this mode.", language: self.language)
                }
                self.effectiveService.updateAccessFlow(
                    appliedMode: self.lastAppliedTailscaleMode.rawValue,
                    requestedMode: self.tailscaleMode.rawValue,
                    phase: .failed,
                    requirements: refreshed.requirements,
                    detail: detail,
                    exposure: refreshed.exposure)
                return
            }
        }

        if hasConfigChanges {
            let saveResult = await self.persistTailscaleConfig(
                tailscaleMode: self.tailscaleMode,
                requireCredentialsForServe: self.requireCredentialsForServe,
                password: trimmedPassword)
            guard saveResult.0 else {
                if needsExposureApply, self.tailscaleMode != self.lastAppliedTailscaleMode {
                    _ = await self.effectiveService.applyExposureSelection(
                        mode: self.lastAppliedTailscaleMode.rawValue,
                        port: GatewayEnvironment.gatewayPort())
                }
                let detail = saveResult.1 ?? "Could not apply private access settings on this Mac."
                self.statusMessage = macLocalized(detail, language: self.language)
                self.effectiveService.updateAccessFlow(
                    appliedMode: self.lastAppliedTailscaleMode.rawValue,
                    requestedMode: self.tailscaleMode.rawValue,
                    phase: .failed,
                    detail: detail,
                    exposure: readiness.exposure)
                return
            }
        }

        self.lastAppliedTailscaleMode = self.tailscaleMode
        self.lastAppliedRequireCredentialsForServe = self.requireCredentialsForServe
        self.lastAppliedPassword = self.password
        if hasConfigChanges {
            self.statusMessage = macLocalized(
                self.defersOnboardingConfigSave
                    ? "Private access settings are ready. Maumau will apply them when you finish setup."
                    : self.connectionMode == .local && !self.isPaused
                        ? "Saved private access settings."
                        : "Saved private access settings. Restart the gateway to apply.",
                language: self.language)
        } else {
            self.statusMessage = nil
        }
        let refreshed = await self.effectiveService.readinessForSelection(
            mode: self.tailscaleMode.rawValue,
            requiresPassword: requiresPassword,
            password: trimmedPassword,
            refreshStatus: false)
        self.effectiveService.updateAccessFlow(
            appliedMode: self.lastAppliedTailscaleMode.rawValue,
            requestedMode: self.tailscaleMode.rawValue,
            phase: refreshed.isActive ? .active : .failed,
            detail: refreshed.isActive ? nil : refreshed.detail,
            exposure: refreshed.exposure)
    }

    private func syncConfigAndServiceState(showLoading: Bool) async {
        if showLoading {
            self.hasLoadedConfig = false
        }
        await self.loadConfig()
        await self.effectiveService.checkTailscaleStatus()
        self.hasLoadedConfig = true

        if self.tailscaleMode == .off {
            self.effectiveService.clearAccessFlow(appliedMode: self.lastAppliedTailscaleMode.rawValue)
            return
        }
        await self.evaluateCurrentSelection(allowActivation: false, refreshStatus: false)
    }

    private var modeRequiresPassword: Bool {
        self.tailscaleMode == .funnel || (self.tailscaleMode == .serve && self.requireCredentialsForServe)
    }

    private func hasPendingConfigChanges(trimmedPassword: String) -> Bool {
        if self.tailscaleMode != self.lastAppliedTailscaleMode {
            return true
        }
        switch self.tailscaleMode {
        case .serve:
            if self.requireCredentialsForServe != self.lastAppliedRequireCredentialsForServe {
                return true
            }
            if self.requireCredentialsForServe {
                return trimmedPassword != self.lastAppliedPassword.trimmingCharacters(in: .whitespacesAndNewlines)
            }
            return false
        case .funnel:
            return trimmedPassword != self.lastAppliedPassword.trimmingCharacters(in: .whitespacesAndNewlines)
        case .off:
            return false
        }
    }

    private func setRequestedSelection(
        mode: GatewayTailscaleMode,
        requireCredentialsForServe: Bool,
        password: String)
    {
        let changedCount =
            (self.tailscaleMode == mode ? 0 : 1)
            + (self.requireCredentialsForServe == requireCredentialsForServe ? 0 : 1)
        self.suppressedSelectionChanges += changedCount
        if self.tailscaleMode != mode {
            self.tailscaleMode = mode
        }
        if self.requireCredentialsForServe != requireCredentialsForServe {
            self.requireCredentialsForServe = requireCredentialsForServe
        }
        self.password = password
    }

    private func activatingMessage(for mode: GatewayTailscaleMode) -> String {
        switch mode {
        case .serve:
            return "Activating Tailscale Serve on this Mac…"
        case .funnel:
            return "Activating Tailscale Funnel on this Mac…"
        case .off:
            return "Saved private access settings."
        }
    }

    private func inactiveSelectionMessage(for mode: GatewayTailscaleMode) -> String {
        switch mode {
        case .serve:
            return "Tailscale Serve is selected, but it is not active on this Mac yet."
        case .funnel:
            return "Tailscale Funnel is selected, but it is not active on this Mac yet."
        case .off:
            return "Saved private access settings."
        }
    }

    private func shouldShowGuidanceCard(flow: TailscaleService.AccessFlowState) -> Bool {
        guard self.tailscaleMode != .off else { return false }
        if self.tailscaleMode != self.lastAppliedTailscaleMode {
            return true
        }
        switch flow.phase {
        case .blocked, .activating, .failed:
            return true
        case .idle, .active:
            return false
        }
    }

    private func shouldShowRetryButton(flow: TailscaleService.AccessFlowState) -> Bool {
        guard flow.phase != .activating && flow.phase != .active else { return false }
        return !flow.requirements.contains(where: { $0.kind == .install || $0.kind == .signIn || $0.kind == .enableFeature })
    }

    private func requirementSymbol(for requirement: TailscaleService.AccessRequirement) -> String {
        switch requirement.kind {
        case .install:
            return "arrow.down.circle"
        case .signIn:
            return "person.crop.circle.badge.checkmark"
        case .enableFeature:
            return "link.badge.plus"
        case .password:
            return "key"
        }
    }

    private func requirementText(for requirement: TailscaleService.AccessRequirement) -> String {
        switch requirement.kind {
        case .install:
            return "Install Tailscale on this Mac."
        case .signIn:
            return "Sign in to Tailscale on this Mac."
        case .enableFeature:
            return requirement.mode == GatewayTailscaleMode.serve.rawValue
                ? "Enable Tailscale Serve for this device in Tailscale."
                : "Enable Tailscale Funnel for this device in Tailscale."
        case .password:
            return "Set a Maumau password for this mode."
        }
    }

    private func enableFeatureButtonTitle(for mode: GatewayTailscaleMode) -> String {
        switch mode {
        case .serve:
            return "Open Tailscale Serve setup"
        case .funnel:
            return "Open Tailscale Funnel setup"
        case .off:
            return "Refresh"
        }
    }

    private var selectedExposureStatus: TailscaleService.ExposureStatus? {
        switch self.tailscaleMode {
        case .serve:
            return self.effectiveService.serveExposure
        case .funnel:
            return self.effectiveService.funnelExposure
        case .off:
            return nil
        }
    }

    private var currentAccessFlow: TailscaleService.AccessFlowState {
        let accessFlow = self.effectiveService.accessFlow
        if accessFlow.requestedMode == self.tailscaleMode.rawValue {
            return accessFlow
        }
        return .idle(appliedMode: self.lastAppliedTailscaleMode.rawValue)
    }

    private var verifiedAccessHost: String? {
        return Self.resolveVerifiedAccessHost(
            host: self.effectiveService.tailscaleHostname,
            exposure: self.selectedExposureStatus)
    }

    private var exposureStatusDetail: String? {
        guard let exposure = self.selectedExposureStatus else {
            return nil
        }
        if self.effectiveService.isRunning == false {
            return nil
        }
        if exposure.active {
            return nil
        }
        if let detail = exposure.detail, !detail.isEmpty {
            return macLocalized(detail, language: self.language)
        }
        switch self.tailscaleMode {
        case .serve:
            return macLocalized(
                "Tailscale Serve is selected, but it is not active on this Mac yet.",
                language: self.language)
        case .funnel:
            return macLocalized(
                "Tailscale Funnel is selected, but it is not active on this Mac yet.",
                language: self.language)
        case .off:
            return nil
        }
    }

    private var accessDetailText: String? {
        if let detail = self.currentAccessFlow.detail,
           self.tailscaleMode != .off,
           self.currentAccessFlow.phase != .active
        {
            return macLocalized(detail, language: self.language)
        }
        if let statusMessage = self.statusMessage?.trimmingCharacters(in: .whitespacesAndNewlines),
           !statusMessage.isEmpty,
           self.tailscaleMode != .off,
           !statusMessage.hasPrefix("Saved private access settings")
        {
            return statusMessage
        }
        return self.exposureStatusDetail
    }

    private var accessEnableURL: String? {
        if let statusMessage = self.statusMessage?.trimmingCharacters(in: .whitespacesAndNewlines),
           !statusMessage.isEmpty,
           self.tailscaleMode != .off,
           let enableURL = TailscaleInstaller.extractFirstHTTPSURL(from: statusMessage)
        {
            return enableURL
        }
        if let enableURL = self.currentAccessFlow.enableURL {
            return enableURL
        }
        return self.selectedExposureStatus?.enableURL
    }
}

extension TailscaleIntegrationSection {
    static func resolveRequireCredentialsForServe(auth: [String: Any]) -> Bool {
        if let allowTailscale = auth["allowTailscale"] as? Bool {
            return !allowTailscale
        }
        return (auth["mode"] as? String) == "password"
    }

    fileprivate static func buildTailscaleConfigRoot(
        existingRoot: [String: Any],
        tailscaleMode: GatewayTailscaleMode,
        requireCredentialsForServe: Bool,
        password: String) -> [String: Any]
    {
        var root = existingRoot
        var gateway = root["gateway"] as? [String: Any] ?? [:]
        var tailscale = gateway["tailscale"] as? [String: Any] ?? [:]
        tailscale["mode"] = tailscaleMode.rawValue
        gateway["tailscale"] = tailscale

        if tailscaleMode != .off {
            gateway["bind"] = "loopback"
        }

        var auth = gateway["auth"] as? [String: Any] ?? [:]
        switch tailscaleMode {
        case .off:
            if !auth.isEmpty {
                auth["allowTailscale"] = false
            }
        case .serve:
            if requireCredentialsForServe {
                auth["allowTailscale"] = false
                auth["mode"] = "password"
                auth["password"] = password
            } else {
                auth["allowTailscale"] = true
            }
        case .funnel:
            auth["allowTailscale"] = false
            auth["mode"] = "password"
            auth["password"] = password
        }

        if !Self.shouldPersistGatewayAuth(auth) {
            gateway.removeValue(forKey: "auth")
        } else {
            gateway["auth"] = auth
        }

        if gateway.isEmpty {
            root.removeValue(forKey: "gateway")
        } else {
            root["gateway"] = gateway
        }
        return root
    }

    static func shouldPersistGatewayAuth(_ auth: [String: Any]) -> Bool {
        for (key, value) in auth {
            switch key {
            case "allowTailscale":
                if let allowTailscale = value as? Bool, allowTailscale {
                    return true
                }
            case "mode", "password", "token", "trustedProxy", "rateLimit":
                return true
            default:
                return true
            }
        }
        return false
    }

    static func loadPersistedConfigRoot(connectionMode: AppState.ConnectionMode) async -> [String: Any] {
        // This panel only works in local mode. Read the local config file directly so
        // onboarding and Settings reflect the persisted choice even while the running
        // gateway is restarting or serving a stale snapshot.
        if connectionMode == .local {
            return MaumauConfigFile.loadDict()
        }
        return await ConfigStore.load()
    }

    static func resolveConfiguredTailscaleModeRaw(gateway: [String: Any]) -> String {
        let tailscale = gateway["tailscale"] as? [String: Any] ?? [:]
        guard let modeRaw = tailscale["mode"] as? String,
              GatewayTailscaleMode(rawValue: modeRaw) != nil
        else {
            return "off"
        }
        return modeRaw
    }

    static func shouldPreserveRequestedSelection(accessFlow: TailscaleService.AccessFlowState) -> Bool {
        switch accessFlow.phase {
        case .blocked, .activating, .failed:
            return accessFlow.requestedMode != GatewayTailscaleMode.off.rawValue
        case .idle, .active:
            return false
        }
    }

    static func resolveVerifiedAccessHost(
        host: String?,
        exposure: TailscaleService.ExposureStatus?) -> String?
    {
        guard exposure?.active == true else {
            return nil
        }
        return host
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
        self.hasLoadedConfig = true
        self.requireCredentialsForServe = requireCredentials
        self.password = password
        self.statusMessage = statusMessage
        self.validationMessage = validationMessage
    }

    static func _testBuildTailscaleConfigRoot(
        existingRoot: [String: Any],
        mode: String,
        requireCredentialsForServe: Bool,
        password: String = "secret") -> [String: Any]
    {
        self.buildTailscaleConfigRoot(
            existingRoot: existingRoot,
            tailscaleMode: GatewayTailscaleMode(rawValue: mode) ?? .off,
            requireCredentialsForServe: requireCredentialsForServe,
            password: password)
    }

}
#endif
