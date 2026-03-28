import MaumauKit
import MaumauProtocol
import SwiftUI
import Testing
@testable import Maumau

private typealias ProtoAnyCodable = MaumauProtocol.AnyCodable

@Suite(.serialized)
@MainActor
struct OnboardingWizardStepViewTests {
    @Test func `note step builds`() {
        let wizard = OnboardingWizardModel()
        let step = WizardStep(
            id: "step-1",
            type: ProtoAnyCodable("note"),
            title: "Welcome",
            message: "Hello",
            options: nil,
            initialvalue: nil,
            placeholder: nil,
            sensitive: nil,
            executor: nil)
        let view = OnboardingWizardStepView(
            step: step,
            wizard: wizard,
            isSubmitting: false,
            language: .en)
        _ = view.body
    }

    @Test func `select step builds`() {
        let wizard = OnboardingWizardModel()
        let options: [[String: ProtoAnyCodable]] = [
            [
                "value": ProtoAnyCodable("local"),
                "label": ProtoAnyCodable("Local"),
                "hint": ProtoAnyCodable(
                    "Best for: Using this Mac.\nWhat you need: Local access.\nHow to get it: Keep going.")
            ],
            ["value": ProtoAnyCodable("remote"), "label": ProtoAnyCodable("Remote")],
        ]
        let step = WizardStep(
            id: "step-2",
            type: ProtoAnyCodable("select"),
            title: "Mode",
            message: "Choose a mode",
            options: options,
            initialvalue: ProtoAnyCodable("local"),
            placeholder: nil,
            sensitive: nil,
            executor: nil)
        let view = OnboardingWizardStepView(
            step: step,
            wizard: wizard,
            isSubmitting: false,
            language: .en)
        _ = view.body
    }

    @Test func `progress step builds and is recognized as auto running`() {
        let wizard = OnboardingWizardModel()
        let step = WizardStep(
            id: "step-progress",
            type: ProtoAnyCodable("progress"),
            title: "Gateway service",
            message: "Installing Gateway service...",
            options: nil,
            initialvalue: nil,
            placeholder: nil,
            sensitive: nil,
            executor: nil)
        let view = OnboardingWizardStepView(
            step: step,
            wizard: wizard,
            isSubmitting: false,
            language: .en)
        _ = view.body

        #expect(OnboardingWizardModel.isProgressStep(step))
    }

    @Test func `legacy wizard fallback detects old gateway schema errors`() {
        let error = GatewayResponseError(
            method: GatewayConnection.Method.wizardStart.rawValue,
            code: ErrorCode.invalidRequest.rawValue,
            message:
                "invalid wizard.start params: at root: unexpected property 'embedded'; at root: unexpected property 'flow'; at root: unexpected property 'acceptRisk'; at root: unexpected property 'skipUi'; at root: unexpected property 'fresh'",
            details: nil)

        #expect(OnboardingWizardModel.shouldRetryLegacyStart(for: error))
    }

    @Test func `legacy wizard fallback drops embedded only params`() {
        let params = OnboardingWizardModel.startParams(
            mode: .local,
            workspace: "/tmp/agent",
            useEmbeddedProtocol: false)

        #expect(params["mode"] == AnyCodable("local"))
        #expect(params["workspace"] == AnyCodable("/tmp/agent"))
        #expect(params["skipChannels"] == AnyCodable(true))
        #expect(params["skipSkills"] == AnyCodable(true))
        #expect(params["skipSearch"] == nil)
        #expect(params["flow"] == nil)
        #expect(params["acceptRisk"] == nil)
        #expect(params["skipUi"] == nil)
        #expect(params["embedded"] == nil)
        #expect(params["fresh"] == nil)
    }

    @Test func `wizard auto fetches next step when gateway is still running without a step`() {
        #expect(
            OnboardingWizardModel.shouldAutoFetchNextStep(
                done: false,
                status: AnyCodable("running"),
                rawStep: nil))
    }

    @Test func `wizard does not auto fetch when a step is already present or terminal`() {
        #expect(
            !OnboardingWizardModel.shouldAutoFetchNextStep(
                done: false,
                status: AnyCodable("running"),
                rawStep: ["id": AnyCodable("step-1")]))
        #expect(
            !OnboardingWizardModel.shouldAutoFetchNextStep(
                done: true,
                status: AnyCodable("done"),
                rawStep: nil))
        #expect(
            !OnboardingWizardModel.shouldAutoFetchNextStep(
                done: false,
                status: AnyCodable("error"),
                rawStep: nil))
    }

    @Test func `persisted local onboard metadata counts as completed setup`() {
        #expect(
            OnboardingWizardModel.shouldTreatPersistedSetupAsComplete([
                "wizard": [
                    "lastRunAt": "2026-03-26T09:29:20.866Z",
                    "lastRunCommand": "onboard",
                    "lastRunMode": "local",
                ],
            ]))
    }

    @Test func `remote onboard metadata does not count as completed local setup`() {
        #expect(
            !OnboardingWizardModel.shouldTreatPersistedSetupAsComplete([
                "wizard": [
                    "lastRunAt": "2026-03-26T09:29:20.866Z",
                    "lastRunCommand": "onboard",
                    "lastRunMode": "remote",
                ],
            ]))
    }

    @Test func `doctor metadata does not count as completed setup`() {
        #expect(
            !OnboardingWizardModel.shouldTreatPersistedSetupAsComplete([
                "wizard": [
                    "lastRunAt": "2026-03-26T09:29:20.866Z",
                    "lastRunCommand": "doctor",
                    "lastRunMode": "local",
                ],
            ]))
    }

    @Test func `wizard metadata alone does not count as completed setup`() {
        #expect(
            !OnboardingWizardModel.shouldTreatPersistedSetupAsComplete([
                "wizard": ["lastRunAt": "2026-03-26T09:29:20.866Z"],
            ]))
    }

    @Test func `gateway auth alone does not count as completed setup`() {
        #expect(
            !OnboardingWizardModel.shouldTreatPersistedSetupAsComplete([
                "gateway": [
                    "auth": [
                        "mode": "token",
                        "token": "abc123",
                    ],
                ],
            ]))
    }

    @Test func `empty config does not count as completed setup`() {
        #expect(!OnboardingWizardModel.shouldTreatPersistedSetupAsComplete([:]))
    }

    @Test func `legacy compatibility auto selects quickstart and later`() {
        let setupMode = WizardStep(
            id: "setup-mode",
            type: ProtoAnyCodable("select"),
            title: nil,
            message: "Setup mode",
            options: [
                ["value": ProtoAnyCodable("quickstart"), "label": ProtoAnyCodable("QuickStart")],
                ["value": ProtoAnyCodable("advanced"), "label": ProtoAnyCodable("Manual")],
            ],
            initialvalue: nil,
            placeholder: nil,
            sensitive: nil,
            executor: nil)
        let hatch = WizardStep(
            id: "hatch",
            type: ProtoAnyCodable("select"),
            title: nil,
            message: "How do you want to hatch your bot?",
            options: [
                ["value": ProtoAnyCodable("web"), "label": ProtoAnyCodable("Open the Web UI")],
                ["value": ProtoAnyCodable("later"), "label": ProtoAnyCodable("Do this later")],
            ],
            initialvalue: nil,
            placeholder: nil,
            sensitive: nil,
            executor: nil)

        #expect(OnboardingWizardModel.shouldAutoAdvanceLegacyCompatibilityStep(setupMode))
        #expect(OnboardingWizardModel.autoAdvanceValueForLegacyCompatibilityStep(setupMode) == AnyCodable("quickstart"))
        #expect(OnboardingWizardModel.shouldAutoAdvanceLegacyCompatibilityStep(hatch))
        #expect(OnboardingWizardModel.autoAdvanceValueForLegacyCompatibilityStep(hatch) == AnyCodable("later"))
    }

    @Test func `legacy compatibility skips optional automations`() {
        let note = WizardStep(
            id: "optional-automations-note",
            type: ProtoAnyCodable("note"),
            title: "Optional automations",
            message: "These are optional automations.",
            options: nil,
            initialvalue: nil,
            placeholder: nil,
            sensitive: nil,
            executor: nil)
        let multiselect = WizardStep(
            id: "optional-automations-select",
            type: ProtoAnyCodable("multiselect"),
            title: nil,
            message: "Choose optional automations",
            options: [
                ["value": ProtoAnyCodable("__skip__"), "label": ProtoAnyCodable("Skip for now")],
                ["value": ProtoAnyCodable("session-memory"), "label": ProtoAnyCodable("Save chat context for later")],
            ],
            initialvalue: nil,
            placeholder: nil,
            sensitive: nil,
            executor: nil)

        #expect(OnboardingWizardModel.shouldAutoAdvanceLegacyCompatibilityStep(note))
        #expect(OnboardingWizardModel.shouldAutoAdvanceLegacyCompatibilityStep(multiselect))
        #expect(
            OnboardingWizardModel.autoAdvanceValueForLegacyCompatibilityStep(multiselect) ==
                AnyCodable([AnyCodable("__skip__")]))
    }

    @Test func `client open url action steps auto-handle in onboarding`() {
        let step = WizardStep(
            id: "open-browser",
            type: ProtoAnyCodable("action"),
            title: "Open browser sign-in",
            message: "Open the sign-in page in your browser.",
            options: nil,
            initialvalue: ProtoAnyCodable([
                "action": ProtoAnyCodable("open_url"),
                "url": ProtoAnyCodable("https://auth.openai.com/oauth/authorize?state=test"),
            ]),
            placeholder: nil,
            sensitive: nil,
            executor: ProtoAnyCodable("client"))

        #expect(OnboardingWizardModel.shouldAutoHandleClientActionStep(step))
    }

    @Test func `wizard step explanation recognizes brain selection`() {
        let step = WizardStep(
            id: "model-step",
            type: ProtoAnyCodable("select"),
            title: "Default model",
            message: "Choose a default model",
            options: nil,
            initialvalue: nil,
            placeholder: nil,
            sensitive: nil,
            executor: nil)

        let explanation = OnboardingWizardStepView.resolveStepExplanation(for: step, language: .en)

        #expect(explanation?.stage == .brain)
        #expect(explanation?.title == "Pick the brain")
    }

    @Test func `wizard step explanation recognizes auth setup`() {
        let step = WizardStep(
            id: "auth-step",
            type: ProtoAnyCodable("text"),
            title: nil,
            message: "Paste your API key",
            options: nil,
            initialvalue: nil,
            placeholder: nil,
            sensitive: true,
            executor: nil)

        let explanation = OnboardingWizardStepView.resolveStepExplanation(for: step, language: .en)

        #expect(OnboardingWizardStepView.shouldShowStepExplanation(for: step))
        #expect(explanation?.stage == .brain)
        #expect(explanation?.title == "Connect the brain")
    }

    @Test func `wizard step explanation recognizes web search setup`() {
        let step = WizardStep(
            id: "search-step",
            type: ProtoAnyCodable("select"),
            title: "Web search",
            message: "Search provider",
            options: nil,
            initialvalue: nil,
            placeholder: nil,
            sensitive: nil,
            executor: nil)

        let explanation = OnboardingWizardStepView.resolveStepExplanation(for: step, language: .en)

        #expect(OnboardingWizardStepView.shouldShowStepExplanation(for: step))
        #expect(explanation?.stage == .brain)
        #expect(explanation?.title == "Add live search")
    }

    @Test func `wizard step explanation hides for model check notes`() {
        let step = WizardStep(
            id: "model-check",
            type: ProtoAnyCodable("note"),
            title: "Model check",
            message: "No auth configured for provider \"anthropic\".",
            options: nil,
            initialvalue: nil,
            placeholder: nil,
            sensitive: nil,
            executor: nil)

        #expect(!OnboardingWizardStepView.shouldShowStepExplanation(for: step))
        #expect(OnboardingWizardStepView.resolveStepExplanation(for: step, language: .en)?.title == "Connect the brain")
    }

    @Test func `wizard localization translates onboarding auth templates in indonesian`() {
        #expect(macLocalized("AI service", language: .id) == "Layanan AI")
        #expect(
            macLocalized("How do you want to connect OpenAI?", language: .id) ==
                "Bagaimana Anda ingin menghubungkan OpenAI?")
        #expect(
            macLocalized("How do you want to connect Custom Provider?", language: .id) ==
                "Bagaimana Anda ingin menghubungkan Provider kustom?")
        #expect(
            macLocalized("OpenAI API key", language: .id) ==
                "API key OpenAI")
        #expect(
            macLocalized("Default model set to openai/gpt-5.4", language: .id) ==
                "Model default diatur ke openai/gpt-5.4")
        #expect(
            macLocalized("Settings, logins, and chat sessions", language: .id) ==
                "Pengaturan, login, dan sesi chat")
        #expect(
            macLocalized("Read what you need below each option before continuing.", language: .id) ==
                "Baca apa yang Anda butuhkan di bawah setiap opsi sebelum melanjutkan.")
        #expect(
            macLocalized("Before you choose OpenAI", language: .id) ==
                "Sebelum memilih OpenAI")
        #expect(
            macLocalized(
                "Best for: The easiest OpenAI setup if you already use ChatGPT.",
                language: .id) ==
                "Cocok untuk: Pengaturan OpenAI termudah jika Anda sudah menggunakan ChatGPT.")
        #expect(
            macLocalized(
                "What you need: A ChatGPT account and a browser sign-in. No API key.",
                language: .id) ==
                "Yang Anda butuhkan: Akun ChatGPT dan login lewat browser. Tidak perlu API key.")
        #expect(
            macLocalized(
                "How to get it: Open the OpenAI Platform, add a payment method if needed, then create a secret key from the API keys page.",
                language: .id) ==
                "Cara mendapatkannya: Buka OpenAI Platform, tambahkan metode pembayaran jika perlu, lalu buat secret key dari halaman API keys.")
    }

    @Test func `wizard localization translates config refresh errors in indonesian`() {
        let message =
            """
            ConfigRuntimeRefreshError: Config was written to /Users/example/.maumau/maumau.json, but runtime snapshot refresh failed: Environment variable "OPENAI_API_KEY" is missing or empty.
            """

        #expect(
            macLocalized(message, language: .id) ==
                """
                Konfigurasi ditulis ke /Users/example/.maumau/maumau.json, tetapi refresh snapshot runtime gagal: Variabel lingkungan "OPENAI_API_KEY" tidak ada atau kosong.
                """)
    }
}
