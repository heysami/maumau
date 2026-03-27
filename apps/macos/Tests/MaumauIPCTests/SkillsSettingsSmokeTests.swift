import MaumauProtocol
import Testing
@testable import Maumau

private func makeSkillStatus(
    name: String,
    description: String,
    source: String,
    filePath: String,
    skillKey: String,
    primaryEnv: String? = nil,
    emoji: String,
    homepage: String? = nil,
    disabled: Bool = false,
    eligible: Bool,
    requirements: SkillRequirements = SkillRequirements(bins: [], env: [], config: []),
    missing: SkillMissing = SkillMissing(bins: [], env: [], config: []),
    configChecks: [SkillStatusConfigCheck] = [],
    install: [SkillInstallOption] = [])
    -> SkillStatus
{
    SkillStatus(
        name: name,
        description: description,
        source: source,
        filePath: filePath,
        baseDir: "/tmp/skills",
        skillKey: skillKey,
        primaryEnv: primaryEnv,
        emoji: emoji,
        homepage: homepage,
        always: false,
        disabled: disabled,
        eligible: eligible,
        requirements: requirements,
        missing: missing,
        configChecks: configChecks,
        install: install)
}

@Suite(.serialized)
@MainActor
struct SkillsSettingsSmokeTests {
    @Test func `default auto install candidates only include missing installable defaults`() {
        let candidates = SkillsSettingsModel.autoInstallCandidates(
            from: [
                makeSkillStatus(
                    name: "summarize",
                    description: "Summary helper",
                    source: "maumau-bundled",
                    filePath: "/tmp/skills/summarize",
                    skillKey: "summarize",
                    emoji: "📝",
                    eligible: false,
                    missing: SkillMissing(bins: ["summarize"], env: [], config: []),
                    install: [
                        SkillInstallOption(
                            id: "brew",
                            kind: "brew",
                            label: "Install summarize (brew)",
                            bins: ["summarize"]),
                    ]),
                makeSkillStatus(
                    name: "skill-creator",
                    description: "Already bundled",
                    source: "maumau-bundled",
                    filePath: "/tmp/skills/skill-creator",
                    skillKey: "skill-creator",
                    emoji: "🛠️",
                    eligible: true),
                makeSkillStatus(
                    name: "nano-pdf",
                    description: "No install option",
                    source: "maumau-bundled",
                    filePath: "/tmp/skills/nano-pdf",
                    skillKey: "nano-pdf",
                    emoji: "📄",
                    eligible: false,
                    missing: SkillMissing(bins: ["nano-pdf"], env: [], config: [])),
            ],
            preferredSkillKeys: ["nano-pdf", "skill-creator", "summarize"])

        #expect(candidates == [
            SkillAutoInstallCandidate(
                skillKey: "summarize",
                skillName: "summarize",
                installId: "brew"),
        ])
    }

    @Test func `skills settings builds body with skills remote`() {
        let model = SkillsSettingsModel()
        model.statusMessage = "Loaded"
        model.skills = [
            makeSkillStatus(
                name: "Needs Setup",
                description: "Missing bins and env",
                source: "maumau-managed",
                filePath: "/tmp/skills/needs-setup",
                skillKey: "needs-setup",
                primaryEnv: "API_KEY",
                emoji: "🧰",
                homepage: "https://example.com/needs-setup",
                eligible: false,
                requirements: SkillRequirements(
                    bins: ["python3"],
                    env: ["API_KEY"],
                    config: ["skills.needs-setup"]),
                missing: SkillMissing(
                    bins: ["python3"],
                    env: ["API_KEY"],
                    config: ["skills.needs-setup"]),
                configChecks: [
                    SkillStatusConfigCheck(path: "skills.needs-setup", value: AnyCodable(false), satisfied: false),
                ],
                install: [
                    SkillInstallOption(id: "brew", kind: "brew", label: "brew install python", bins: ["python3"]),
                ]),
            makeSkillStatus(
                name: "Ready Skill",
                description: "All set",
                source: "maumau-bundled",
                filePath: "/tmp/skills/ready",
                skillKey: "ready",
                emoji: "✅",
                homepage: "https://example.com/ready",
                eligible: true,
                configChecks: [
                    SkillStatusConfigCheck(path: "skills.ready", value: AnyCodable(true), satisfied: true),
                    SkillStatusConfigCheck(path: "skills.limit", value: AnyCodable(5), satisfied: true),
                ],
                install: []),
            makeSkillStatus(
                name: "Disabled Skill",
                description: "Disabled in config",
                source: "maumau-extra",
                filePath: "/tmp/skills/disabled",
                skillKey: "disabled",
                emoji: "🚫",
                disabled: true,
                eligible: false),
        ]

        let state = AppState(preview: true)
        state.connectionMode = .remote
        var view = SkillsSettings(state: state, model: model)
        view.setFilterForTesting("all")
        _ = view.body
        view.setFilterForTesting("needsSetup")
        _ = view.body
    }

    @Test func `skills settings builds body with local mode`() {
        let model = SkillsSettingsModel()
        model.skills = [
            makeSkillStatus(
                name: "Local Skill",
                description: "Local ready",
                source: "maumau-workspace",
                filePath: "/tmp/skills/local",
                skillKey: "local",
                emoji: "🏠",
                eligible: true),
        ]

        let state = AppState(preview: true)
        state.connectionMode = .local
        var view = SkillsSettings(state: state, model: model)
        view.setFilterForTesting("ready")
        _ = view.body
    }

    @Test func `skills settings exercises private views`() {
        SkillsSettings.exerciseForTesting()
    }
}
