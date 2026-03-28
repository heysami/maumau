import Testing
import MaumauProtocol
@testable import Maumau

struct ModelsSettingsTests {
    @Test func `model auth selection prefers requested group and choice`() {
        let groups = [
            ModelAuthChoiceGroup(
                id: "openai",
                label: "OpenAI",
                hint: nil,
                options: [
                    ModelAuthChoiceOption(id: "openai-codex", label: "Codex", hint: nil, providerId: "openai-codex"),
                    ModelAuthChoiceOption(id: "openai-api-key", label: "API key", hint: nil, providerId: "openai"),
                ]),
            ModelAuthChoiceGroup(
                id: "anthropic",
                label: "Anthropic",
                hint: nil,
                options: [
                    ModelAuthChoiceOption(id: "apiKey", label: "API key", hint: nil, providerId: "anthropic"),
                ]),
        ]

        let selection = resolveModelAuthSelection(
            groups: groups,
            preferredGroupId: "openai",
            preferredChoiceId: "openai-api-key")

        #expect(selection == ModelAuthSelection(groupId: "openai", choiceId: "openai-api-key"))
    }

    @Test func `model auth selection falls back to first available option`() {
        let groups = [
            ModelAuthChoiceGroup(
                id: "anthropic",
                label: "Anthropic",
                hint: nil,
                options: [
                    ModelAuthChoiceOption(id: "apiKey", label: "API key", hint: nil, providerId: "anthropic"),
                ]),
        ]

        let selection = resolveModelAuthSelection(
            groups: groups,
            preferredGroupId: "missing",
            preferredChoiceId: "missing")

        #expect(selection == ModelAuthSelection(groupId: "anthropic", choiceId: "apiKey"))
    }

    @Test func `visible model options only show connected providers but keep saved refs`() {
        let openAI = self.option(ref: "openai/gpt-5.4", providerId: "openai", modelId: "gpt-5.4", displayName: "GPT-5.4")
        let anthropic = self.option(
            ref: "anthropic/claude-opus-4-6",
            providerId: "anthropic",
            modelId: "claude-opus-4-6",
            displayName: "Claude Opus 4.6")

        let visible = buildVisibleModelSettingsOptions(
            catalogOptions: [anthropic],
            modelOptions: [openAI],
            savedRefs: [anthropic.ref],
            connectedProviderIds: ["openai"])

        #expect(visible.map(\.ref) == [openAI.ref, anthropic.ref])
        #expect(visible.last?.synthetic == true)
    }

    @Test func `primary provider filtering stays scoped to the selected provider`() {
        let openAI = self.option(ref: "openai/gpt-5.4", providerId: "openai", modelId: "gpt-5.4", displayName: "GPT-5.4")
        let anthropic = self.option(
            ref: "anthropic/claude-opus-4-6",
            providerId: "anthropic",
            modelId: "claude-opus-4-6",
            displayName: "Claude Opus 4.6")

        let filtered = filterPrimaryModelSettingsOptions(
            selectedProviderId: "anthropic",
            currentPrimaryRef: openAI.ref,
            options: [openAI, anthropic])

        #expect(filtered.map(\.ref) == [anthropic.ref])
    }

    @Test func `displayed primary picker selection clears mismatched provider values`() {
        let selection = displayedPrimaryPickerSelection(
            selectedProviderId: "openai-codex",
            primaryRef: "ollama/llama2:latest")

        #expect(selection.isEmpty)
    }

    @Test func `displayed primary model id clears mismatched provider values`() {
        let modelId = displayedPrimaryModelIdForEditing(
            providerId: "openai-codex",
            primaryRef: "ollama/llama2:latest")

        #expect(modelId.isEmpty)
    }

    @Test func `next fallback skips primary and existing fallbacks`() {
        let openAI = self.option(ref: "openai/gpt-5.4", providerId: "openai", modelId: "gpt-5.4", displayName: "GPT-5.4")
        let anthropic = self.option(
            ref: "anthropic/claude-opus-4-6",
            providerId: "anthropic",
            modelId: "claude-opus-4-6",
            displayName: "Claude Opus 4.6")
        let google = self.option(
            ref: "google/gemini-2.5-pro",
            providerId: "google",
            modelId: "gemini-2.5-pro",
            displayName: "Gemini 2.5 Pro")

        let next = nextAvailableFallbackRef(
            primaryRef: openAI.ref,
            fallbackRefs: [anthropic.ref],
            options: [openAI, anthropic, google])

        #expect(next == google.ref)
    }

    @Test func `next fallback prefers the newly connected provider`() {
        let openAI = self.option(ref: "openai/gpt-5.4", providerId: "openai", modelId: "gpt-5.4", displayName: "GPT-5.4")
        let anthropic = self.option(
            ref: "anthropic/claude-opus-4-6",
            providerId: "anthropic",
            modelId: "claude-opus-4-6",
            displayName: "Claude Opus 4.6")
        let google = self.option(
            ref: "google/gemini-2.5-pro",
            providerId: "google",
            modelId: "gemini-2.5-pro",
            displayName: "Gemini 2.5 Pro")

        let next = nextAvailableFallbackRef(
            preferredProviderId: "google",
            primaryRef: openAI.ref,
            fallbackRefs: [],
            options: [openAI, anthropic, google])

        #expect(next == google.ref)
    }

    @Test func `next fallback returns nil when every known model is already taken`() {
        let openAI = self.option(ref: "openai/gpt-5.4", providerId: "openai", modelId: "gpt-5.4", displayName: "GPT-5.4")
        let anthropic = self.option(
            ref: "anthropic/claude-opus-4-6",
            providerId: "anthropic",
            modelId: "claude-opus-4-6",
            displayName: "Claude Opus 4.6")

        let next = nextAvailableFallbackRef(
            primaryRef: openAI.ref,
            fallbackRefs: [anthropic.ref],
            options: [openAI, anthropic])

        #expect(next == nil)
    }

    @Test func `provider connect completion prefers the selected provider when it is connected`() {
        let providerId = resolveProviderConnectCompletionProviderId(
            previousProviderIds: ["openai"],
            currentProviderIds: ["openai", "anthropic"],
            preferredProviderId: "anthropic")

        #expect(providerId == "anthropic")
    }

    @Test func `provider connect completion falls back to a newly added provider`() {
        let providerId = resolveProviderConnectCompletionProviderId(
            previousProviderIds: ["openai"],
            currentProviderIds: ["openai", "google"],
            preferredProviderId: nil)

        #expect(providerId == "google")
    }

    @Test func `background automation draft trims hydrated values`() {
        let draft = resolveBackgroundAutomationSettingsDraft(
            modelRaw: "  openai/gpt-5.4-mini  ",
            thinkingRaw: "  low  ")

        #expect(draft == BackgroundAutomationSettingsDraft(
            modelRef: "openai/gpt-5.4-mini",
            thinking: "low"))
    }

    @Test func `background automation updates clear root then set leaf values`() {
        let backgroundConfigPath: ConfigPath = [.key("agents"), .key("defaults"), .key("background")]
        let backgroundModelConfigPath: ConfigPath = [
            .key("agents"), .key("defaults"), .key("background"), .key("model"),
        ]
        let backgroundThinkingConfigPath: ConfigPath = [
            .key("agents"), .key("defaults"), .key("background"), .key("thinking"),
        ]

        let updates = buildBackgroundAutomationSettingsUpdates(
            backgroundConfigPath: backgroundConfigPath,
            backgroundModelConfigPath: backgroundModelConfigPath,
            backgroundThinkingConfigPath: backgroundThinkingConfigPath,
            modelRef: "  openai/gpt-5.4-mini  ",
            thinking: " low ")

        #expect(updates.count == 3)
        #expect(updates[0].path == backgroundConfigPath)
        #expect(updates[0].value == nil)
        #expect(updates[1].path == backgroundModelConfigPath)
        #expect((updates[1].value as? String) == "openai/gpt-5.4-mini")
        #expect(updates[2].path == backgroundThinkingConfigPath)
        #expect((updates[2].value as? String) == "low")
    }

    private func option(
        ref: String,
        providerId: String,
        modelId: String,
        displayName: String) -> ModelSettingsOption
    {
        ModelSettingsOption(
            ref: ref,
            providerId: providerId,
            modelId: modelId,
            displayName: displayName,
            contextWindow: nil,
            reasoning: true,
            synthetic: false)
    }
}
