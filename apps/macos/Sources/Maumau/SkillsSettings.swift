import Observation
import MaumauProtocol
import SwiftUI

struct SkillsSettings: View {
    @Bindable var state: AppState
    @State private var model = SkillsSettingsModel()
    @State private var envEditor: EnvEditorState?
    @State private var filter: SkillsFilter = .all

    init(state: AppState = AppStateStore.shared, model: SkillsSettingsModel = SkillsSettingsModel()) {
        self.state = state
        self._model = State(initialValue: model)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            self.header
            self.statusBanner
            self.skillsList
            Spacer(minLength: 0)
        }
        .task { await self.model.refresh() }
        .sheet(item: self.$envEditor) { editor in
            EnvEditorView(editor: editor) { value in
                Task {
                    await self.model.updateEnv(
                        skillKey: editor.skillKey,
                        envKey: editor.envKey,
                        value: value,
                        isPrimary: editor.isPrimary)
                }
            }
        }
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(macLocalized("Skills", language: self.state.effectiveOnboardingLanguage))
                    .font(.headline)
                Text(
                    macLocalized(
                        "Skills are enabled when requirements are met (binaries, env, config). This is not a full plugin list.",
                        language: self.state.effectiveOnboardingLanguage))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if self.model.isLoading {
                ProgressView()
            } else {
                Button {
                    Task { await self.model.refresh() }
                } label: {
                    Label(macLocalized("Refresh", language: self.state.effectiveOnboardingLanguage), systemImage: "arrow.clockwise")
                }
                .buttonStyle(.bordered)
                .help(macLocalized("Refresh", language: self.state.effectiveOnboardingLanguage))
            }
            self.headerFilter
        }
    }

    @ViewBuilder
    private var statusBanner: some View {
        if let error = self.model.error {
            Text(error)
                .font(.footnote)
                .foregroundStyle(.orange)
        } else if let message = self.model.statusMessage {
            Text(macWizardText(message, language: self.state.effectiveOnboardingLanguage) ?? message)
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private var skillsList: some View {
        if self.model.skills.isEmpty {
            Text(macLocalized("No skills reported yet.", language: self.state.effectiveOnboardingLanguage))
                .foregroundStyle(.secondary)
        } else {
            List {
                ForEach(self.filteredSkills) { skill in
                    SkillRow(
                        skill: skill,
                        isBusy: self.model.isBusy(skill: skill),
                        connectionMode: self.state.connectionMode,
                        onToggleEnabled: { enabled in
                            Task { await self.model.setEnabled(skillKey: skill.skillKey, enabled: enabled) }
                        },
                        onInstall: { option, target in
                            Task { await self.model.install(skill: skill, option: option, target: target) }
                        },
                        onSetEnv: { envKey, isPrimary in
                            self.envEditor = EnvEditorState(
                                skillKey: skill.skillKey,
                                skillName: skill.name,
                                envKey: envKey,
                                isPrimary: isPrimary,
                                homepage: skill.homepage)
                        })
                }
                if !self.model.skills.isEmpty, self.filteredSkills.isEmpty {
                    Text(macLocalized("No skills match this filter.", language: self.state.effectiveOnboardingLanguage))
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
            }
            .listStyle(.inset)
        }
    }

    private var headerFilter: some View {
        Picker(macLocalized("Filter", language: self.state.effectiveOnboardingLanguage), selection: self.$filter) {
            ForEach(SkillsFilter.allCases) { filter in
                Text(filter.title)
                    .tag(filter)
            }
        }
        .labelsHidden()
        .pickerStyle(.menu)
        .frame(width: 160, alignment: .trailing)
    }

    private var filteredSkills: [SkillStatus] {
        self.model.skills.filter { skill in
            switch self.filter {
            case .all:
                true
            case .ready:
                !skill.disabled && skill.eligible
            case .needsSetup:
                !skill.disabled && !skill.eligible
            case .disabled:
                skill.disabled
            }
        }
    }
}

private enum SkillsFilter: String, CaseIterable, Identifiable {
    case all
    case ready
    case needsSetup
    case disabled

    var id: String {
        self.rawValue
    }

    var title: String {
        switch self {
        case .all:
            macLocalized("All")
        case .ready:
            macLocalized("Ready")
        case .needsSetup:
            macLocalized("Needs Setup")
        case .disabled:
            macLocalized("Disabled")
        }
    }
}

private enum InstallTarget: String, CaseIterable {
    case gateway
    case local
}

struct SkillAutoInstallCandidate: Equatable {
    let skillKey: String
    let skillName: String
    let installId: String
}

private struct SkillRow: View {
    let skill: SkillStatus
    let isBusy: Bool
    let connectionMode: AppState.ConnectionMode
    let onToggleEnabled: (Bool) -> Void
    let onInstall: (SkillInstallOption, InstallTarget) -> Void
    let onSetEnv: (String, Bool) -> Void

    private var missingBins: [String] {
        self.skill.missing.bins
    }

    private var missingEnv: [String] {
        self.skill.missing.env
    }

    private var missingConfig: [String] {
        self.skill.missing.config
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text(self.skill.emoji ?? "✨")
                .font(.title2)

            VStack(alignment: .leading, spacing: 6) {
                Text(self.skill.name)
                    .font(.headline)
                Text(self.skill.description)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                self.metaRow

                if self.skill.disabled {
                    Text(macLocalized("Disabled in config"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else if !self.requirementsMet, self.shouldShowMissingSummary {
                    self.missingSummary
                }

                if !self.skill.configChecks.isEmpty {
                    self.configChecksView
                }

                if !self.missingEnv.isEmpty {
                    self.envActionRow
                }
            }

            Spacer(minLength: 0)

            self.trailingActions
        }
        .padding(.vertical, 6)
    }

    private var sourceLabel: String {
        switch self.skill.source {
        case "maumau-bundled":
            macLocalized("Bundled")
        case "maumau-managed":
            macLocalized("Managed")
        case "maumau-workspace":
            macLocalized("Workspace")
        case "maumau-extra":
            macLocalized("Extra")
        case "maumau-plugin":
            macLocalized("Plugin")
        default:
            self.skill.source
        }
    }

    private var metaRow: some View {
        HStack(spacing: 10) {
            SkillTag(text: self.sourceLabel)
            if let url = self.homepageUrl {
                Link(destination: url) {
                    Label(macLocalized("Website"), systemImage: "link")
                        .font(.caption2.weight(.semibold))
                }
                .buttonStyle(.link)
            }
            Spacer(minLength: 0)
        }
    }

    private var homepageUrl: URL? {
        guard let raw = self.skill.homepage?.trimmingCharacters(in: .whitespacesAndNewlines) else {
            return nil
        }
        guard !raw.isEmpty, let url = URL(string: raw),
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https" else {
            return nil
        }
        return url
    }

    private var enabledBinding: Binding<Bool> {
        Binding(
            get: { !self.skill.disabled },
            set: { self.onToggleEnabled($0) })
    }

    private var missingSummary: some View {
        VStack(alignment: .leading, spacing: 4) {
            if self.shouldShowMissingBins {
                Text("\(macLocalized("Missing binaries:")) \(self.missingBins.joined(separator: ", "))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if !self.missingEnv.isEmpty {
                Text("\(macLocalized("Missing env:")) \(self.missingEnv.joined(separator: ", "))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if !self.missingConfig.isEmpty {
                Text("\(macLocalized("Requires config:")) \(self.missingConfig.joined(separator: ", "))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var configChecksView: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(self.skill.configChecks) { check in
                HStack(spacing: 6) {
                    Image(systemName: check.satisfied ? "checkmark.circle" : "xmark.circle")
                        .foregroundStyle(check.satisfied ? .green : .secondary)
                    Text(check.path)
                        .font(.caption)
                    Text(self.formatConfigValue(check.value))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var envActionRow: some View {
        HStack(spacing: 8) {
            ForEach(self.missingEnv, id: \.self) { envKey in
                let isPrimary = envKey == self.skill.primaryEnv
                Button(isPrimary ? macLocalized("Set API Key") : "\(macLocalized("Set")) \(envKey)") {
                    self.onSetEnv(envKey, isPrimary)
                }
                .buttonStyle(.bordered)
                .disabled(self.isBusy)
            }
            Spacer(minLength: 0)
        }
    }

    private var trailingActions: some View {
        VStack(alignment: .trailing, spacing: 8) {
            if !self.installOptions.isEmpty {
                ForEach(self.installOptions, id: \.id) { (option: SkillInstallOption) in
                    HStack(spacing: 6) {
                        if self.showGatewayInstall {
                            Button(macLocalized("Install on Gateway")) { self.onInstall(option, .gateway) }
                                .buttonStyle(.borderedProminent)
                                .disabled(self.isBusy)
                        }
                        if self.showGatewayInstall {
                            Button(macLocalized("Install on This Mac")) { self.onInstall(option, .local) }
                                .buttonStyle(.bordered)
                                .disabled(self.isBusy)
                                .help(
                                    self.localInstallNeedsSwitch
                                        ? macLocalized("Switches to Local mode to install on this Mac.")
                                        : "")
                        } else {
                            Button(macLocalized("Install on This Mac")) { self.onInstall(option, .local) }
                                .buttonStyle(.borderedProminent)
                                .disabled(self.isBusy)
                                .help(
                                    self.localInstallNeedsSwitch
                                        ? macLocalized("Switches to Local mode to install on this Mac.")
                                        : "")
                        }
                    }
                }
            } else {
                Toggle("", isOn: self.enabledBinding)
                    .toggleStyle(.switch)
                    .labelsHidden()
                    .disabled(self.isBusy || !self.requirementsMet)
            }

            if self.isBusy {
                ProgressView()
                    .controlSize(.small)
            }
        }
    }

    private var installOptions: [SkillInstallOption] {
        guard !self.missingBins.isEmpty else { return [] }
        let missing = Set(self.missingBins)
        return self.skill.install.filter { option in
            if option.bins.isEmpty { return true }
            return !missing.isDisjoint(with: option.bins)
        }
    }

    private var requirementsMet: Bool {
        self.missingBins.isEmpty && self.missingEnv.isEmpty && self.missingConfig.isEmpty
    }

    private var shouldShowMissingBins: Bool {
        !self.missingBins.isEmpty && self.installOptions.isEmpty
    }

    private var shouldShowMissingSummary: Bool {
        self.shouldShowMissingBins ||
            !self.missingEnv.isEmpty ||
            !self.missingConfig.isEmpty
    }

    private var showGatewayInstall: Bool {
        self.connectionMode == .remote
    }

    private var localInstallNeedsSwitch: Bool {
        self.connectionMode != .local
    }

    private func formatConfigValue(_ value: AnyCodable?) -> String {
        guard let value else { return "" }
        switch value.value {
        case let bool as Bool:
            return bool ? "true" : "false"
        case let int as Int:
            return String(int)
        case let double as Double:
            return String(double)
        case let string as String:
            return string
        default:
            return ""
        }
    }
}

private struct SkillTag: View {
    let text: String

    var body: some View {
        Text(self.text)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 8)
            .padding(.vertical, 2)
            .background(Color.secondary.opacity(0.12))
            .clipShape(Capsule())
    }
}

private struct EnvEditorState: Identifiable {
    let skillKey: String
    let skillName: String
    let envKey: String
    let isPrimary: Bool
    let homepage: String?

    var id: String {
        "\(self.skillKey)::\(self.envKey)"
    }
}

private struct EnvEditorView: View {
    let editor: EnvEditorState
    let onSave: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var value: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(self.title)
                .font(.headline)
            Text(self.subtitle)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            if let homepageUrl = self.homepageUrl {
                Link(macLocalized("Get your key →"), destination: homepageUrl)
                    .font(.caption)
            }
            SecureField(self.editor.envKey, text: self.$value)
                .textFieldStyle(.roundedBorder)
            Text("\(macLocalized("Saved to maumau.json under skills.entries."))\(self.editor.skillKey)")
                .font(.caption2)
                .foregroundStyle(.tertiary)
            HStack {
                Button(macLocalized("Cancel")) { self.dismiss() }
                Spacer()
                Button(macLocalized("Save")) {
                    self.onSave(self.value)
                    self.dismiss()
                }
                .buttonStyle(.borderedProminent)
                .disabled(self.value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(20)
        .frame(width: 420)
    }

    private var homepageUrl: URL? {
        guard let raw = self.editor.homepage?.trimmingCharacters(in: .whitespacesAndNewlines) else {
            return nil
        }
        guard !raw.isEmpty, let url = URL(string: raw),
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https" else {
            return nil
        }
        return url
    }

    private var title: String {
        self.editor.isPrimary ? macLocalized("Set API Key") : macLocalized("Set Environment Variable")
    }

    private var subtitle: String {
        "\(macLocalized("Skill")): \(self.editor.skillName)"
    }
}

@MainActor
@Observable
final class SkillsSettingsModel {
    var skills: [SkillStatus] = []
    var isLoading = false
    var error: String?
    var statusMessage: String?
    private var busySkills: Set<String> = []

    func isBusy(skill: SkillStatus) -> Bool {
        self.busySkills.contains(skill.skillKey)
    }

    func refresh() async {
        guard !self.isLoading else { return }
        self.isLoading = true
        self.error = nil
        do {
            let report = try await GatewayConnection.shared.skillsStatus()
            self.skills = report.skills.sorted { $0.name < $1.name }
        } catch {
            self.error = error.localizedDescription
        }
        self.isLoading = false
    }

    static func autoInstallCandidates(
        from skills: [SkillStatus],
        preferredSkillKeys: Set<String>) -> [SkillAutoInstallCandidate]
    {
        skills
            .filter { preferredSkillKeys.contains($0.skillKey) && !$0.disabled }
            .compactMap { skill in
                let missing = Set(skill.missing.bins)
                guard !missing.isEmpty else { return nil }
                guard let option = skill.install.first(where: { option in
                    option.bins.isEmpty || !missing.isDisjoint(with: option.bins)
                }) else {
                    return nil
                }
                return SkillAutoInstallCandidate(
                    skillKey: skill.skillKey,
                    skillName: skill.name,
                    installId: option.id)
            }
            .sorted { $0.skillName.localizedCaseInsensitiveCompare($1.skillName) == .orderedAscending }
    }

    func autoInstallSkills(skillKeys: [String]) async {
        let preferredSkillKeys = Set(skillKeys)
        let candidates = Self.autoInstallCandidates(
            from: self.skills,
            preferredSkillKeys: preferredSkillKeys)

        guard !candidates.isEmpty else {
            let readyDefaults = self.skills
                .filter { preferredSkillKeys.contains($0.skillKey) && !$0.disabled && $0.missing.bins.isEmpty }
                .map(\.name)
                .sorted()
            if !readyDefaults.isEmpty {
                self.statusMessage = macDefaultSkillsReady(
                    readyDefaults.joined(separator: ", "),
                    language: AppStateStore.shared.effectiveOnboardingLanguage)
            }
            return
        }

        if AppStateStore.shared.connectionMode != .local {
            AppStateStore.shared.connectionMode = .local
        }

        var installedNames: [String] = []
        var failedNames: [String] = []
        self.statusMessage = macInstallingDefaultSkills(language: AppStateStore.shared.effectiveOnboardingLanguage)

        for candidate in candidates {
            await self.withBusy(candidate.skillKey) {
                do {
                    let result = try await GatewayConnection.shared.skillsInstall(
                        name: candidate.skillName,
                        installId: candidate.installId,
                        timeoutMs: 300_000)
                    if result.ok {
                        installedNames.append(candidate.skillName)
                    } else {
                        failedNames.append(candidate.skillName)
                    }
                } catch {
                    failedNames.append(candidate.skillName)
                }
                await self.refresh()
            }
        }

        if !installedNames.isEmpty && failedNames.isEmpty {
            self.statusMessage = macInstalledDefaultSkills(
                installedNames.joined(separator: ", "),
                retry: nil,
                language: AppStateStore.shared.effectiveOnboardingLanguage)
        } else if !installedNames.isEmpty {
            self.statusMessage = macInstalledDefaultSkills(
                installedNames.joined(separator: ", "),
                retry: failedNames.joined(separator: ", "),
                language: AppStateStore.shared.effectiveOnboardingLanguage)
        } else if !failedNames.isEmpty {
            self.statusMessage = macAutoInstallDefaultSkillsFailed(
                failedNames.joined(separator: ", "),
                language: AppStateStore.shared.effectiveOnboardingLanguage)
        }
    }

    fileprivate func install(skill: SkillStatus, option: SkillInstallOption, target: InstallTarget) async {
        await self.withBusy(skill.skillKey) {
            do {
                if target == .local, AppStateStore.shared.connectionMode != .local {
                    AppStateStore.shared.connectionMode = .local
                    self.statusMessage = macSwitchedToLocalModeForInstall(
                        language: AppStateStore.shared.effectiveOnboardingLanguage)
                }
                let result = try await GatewayConnection.shared.skillsInstall(
                    name: skill.name,
                    installId: option.id,
                    timeoutMs: 300_000)
                self.statusMessage = macLocalized(
                    result.message,
                    language: AppStateStore.shared.effectiveOnboardingLanguage)
            } catch {
                self.statusMessage = error.localizedDescription
            }
            await self.refresh()
        }
    }

    func setEnabled(skillKey: String, enabled: Bool) async {
        await self.withBusy(skillKey) {
            do {
                _ = try await GatewayConnection.shared.skillsUpdate(
                    skillKey: skillKey,
                    enabled: enabled)
                self.statusMessage = macSkillEnabledChanged(
                    enabled: enabled,
                    language: AppStateStore.shared.effectiveOnboardingLanguage)
            } catch {
                self.statusMessage = error.localizedDescription
            }
            await self.refresh()
        }
    }

    func updateEnv(skillKey: String, envKey: String, value: String, isPrimary: Bool) async {
        await self.withBusy(skillKey) {
            do {
                if isPrimary {
                    _ = try await GatewayConnection.shared.skillsUpdate(
                        skillKey: skillKey,
                        apiKey: value)
                    self.statusMessage = macSavedApiKeyStatus(
                        skillKey: skillKey,
                        language: AppStateStore.shared.effectiveOnboardingLanguage)
                } else {
                    _ = try await GatewayConnection.shared.skillsUpdate(
                        skillKey: skillKey,
                        env: [envKey: value])
                    self.statusMessage = macSavedEnvStatus(
                        envKey: envKey,
                        skillKey: skillKey,
                        language: AppStateStore.shared.effectiveOnboardingLanguage)
                }
            } catch {
                self.statusMessage = error.localizedDescription
            }
            await self.refresh()
        }
    }

    private func withBusy(_ id: String, _ work: @escaping () async -> Void) async {
        self.busySkills.insert(id)
        defer { self.busySkills.remove(id) }
        await work()
    }
}

#if DEBUG
struct SkillsSettings_Previews: PreviewProvider {
    static var previews: some View {
        SkillsSettings(state: .preview)
            .frame(width: SettingsTab.windowWidth, height: SettingsTab.windowHeight)
    }
}

extension SkillsSettings {
    static func exerciseForTesting() {
        let skill = SkillStatus(
            name: "Test Skill",
            description: "Test description",
            source: "maumau-bundled",
            filePath: "/tmp/skills/test",
            baseDir: "/tmp/skills",
            skillKey: "test",
            primaryEnv: "API_KEY",
            emoji: "🧪",
            homepage: "https://example.com",
            always: false,
            disabled: false,
            eligible: false,
            requirements: SkillRequirements(bins: ["python3"], env: ["API_KEY"], config: ["skills.test"]),
            missing: SkillMissing(bins: ["python3"], env: ["API_KEY"], config: ["skills.test"]),
            configChecks: [
                SkillStatusConfigCheck(path: "skills.test", value: AnyCodable(false), satisfied: false),
            ],
            install: [
                SkillInstallOption(id: "brew", kind: "brew", label: "brew install python", bins: ["python3"]),
            ])

        let row = SkillRow(
            skill: skill,
            isBusy: false,
            connectionMode: .remote,
            onToggleEnabled: { _ in },
            onInstall: { _, _ in },
            onSetEnv: { _, _ in })
        _ = row.body

        _ = SkillTag(text: "Bundled").body

        let editor = EnvEditorView(
            editor: EnvEditorState(
                skillKey: "test",
                skillName: "Test Skill",
                envKey: "API_KEY",
                isPrimary: true,
                homepage: "https://example.com"),
            onSave: { _ in })
        _ = editor.body
    }

    mutating func setFilterForTesting(_ rawValue: String) {
        guard let filter = SkillsFilter(rawValue: rawValue) else { return }
        self.filter = filter
    }
}
#endif
