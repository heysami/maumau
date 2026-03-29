import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthProfileStore } from "../agents/auth-profiles.js";
import type { ProviderAuthChoiceMetadata } from "../plugins/provider-auth-choices.js";
import type { ProviderWizardOption } from "../plugins/provider-wizard.js";
import {
  buildAuthChoiceGroups,
  buildAuthChoiceOptions,
  formatAuthChoiceChoicesForCli,
} from "./auth-choice-options.js";
import { formatStaticAuthChoiceChoicesForCli } from "./auth-choice-options.static.js";

const resolveManifestProviderAuthChoices = vi.hoisted(() =>
  vi.fn<() => ProviderAuthChoiceMetadata[]>(() => []),
);
const resolveProviderWizardOptions = vi.hoisted(() =>
  vi.fn<() => ProviderWizardOption[]>(() => []),
);
vi.mock("../plugins/provider-auth-choices.js", () => ({
  resolveManifestProviderAuthChoices,
}));
vi.mock("../plugins/provider-wizard.js", () => ({
  resolveProviderWizardOptions,
}));

const EMPTY_STORE: AuthProfileStore = { version: 1, profiles: {} };

function getOptions(includeSkip = false) {
  return buildAuthChoiceOptions({
    store: EMPTY_STORE,
    includeSkip,
  });
}

describe("buildAuthChoiceOptions", () => {
  beforeEach(() => {
    resolveManifestProviderAuthChoices.mockReset();
    resolveProviderWizardOptions.mockReset();
    resolveManifestProviderAuthChoices.mockReturnValue([]);
    resolveProviderWizardOptions.mockReturnValue([]);
  });

  it("includes core and provider-specific auth choices", () => {
    resolveManifestProviderAuthChoices.mockReturnValue([
      {
        pluginId: "github-copilot",
        providerId: "github-copilot",
        methodId: "device",
        choiceId: "github-copilot",
        choiceLabel: "GitHub Copilot",
        groupId: "copilot",
        groupLabel: "Copilot",
      },
      {
        pluginId: "anthropic",
        providerId: "anthropic",
        methodId: "setup-token",
        choiceId: "token",
        choiceLabel: "Anthropic token (paste setup-token)",
        groupId: "anthropic",
        groupLabel: "Anthropic",
      },
      {
        pluginId: "openai",
        providerId: "openai",
        methodId: "api-key",
        choiceId: "openai-api-key",
        choiceLabel: "OpenAI API key",
        groupId: "openai",
        groupLabel: "OpenAI",
      },
      {
        pluginId: "moonshot",
        providerId: "moonshot",
        methodId: "api-key",
        choiceId: "moonshot-api-key",
        choiceLabel: "Kimi API key (.ai)",
        groupId: "moonshot",
        groupLabel: "Moonshot AI (Kimi K2.5)",
      },
      {
        pluginId: "minimax",
        providerId: "minimax",
        methodId: "api-global",
        choiceId: "minimax-global-api",
        choiceLabel: "MiniMax API key (Global)",
        groupId: "minimax",
        groupLabel: "MiniMax",
      },
      {
        pluginId: "zai",
        providerId: "zai",
        methodId: "api-key",
        choiceId: "zai-api-key",
        choiceLabel: "Z.AI API key",
        groupId: "zai",
        groupLabel: "Z.AI",
      },
      {
        pluginId: "xiaomi",
        providerId: "xiaomi",
        methodId: "api-key",
        choiceId: "xiaomi-api-key",
        choiceLabel: "Xiaomi API key",
        groupId: "xiaomi",
        groupLabel: "Xiaomi",
      },
      {
        pluginId: "together",
        providerId: "together",
        methodId: "api-key",
        choiceId: "together-api-key",
        choiceLabel: "Together AI API key",
        groupId: "together",
        groupLabel: "Together AI",
      },
      {
        pluginId: "qwen-portal-auth",
        providerId: "qwen-portal",
        methodId: "device",
        choiceId: "qwen-portal",
        choiceLabel: "Qwen OAuth",
        groupId: "qwen",
        groupLabel: "Qwen",
      },
      {
        pluginId: "xai",
        providerId: "xai",
        methodId: "api-key",
        choiceId: "xai-api-key",
        choiceLabel: "xAI API key",
        groupId: "xai",
        groupLabel: "xAI (Grok)",
      },
      {
        pluginId: "mistral",
        providerId: "mistral",
        methodId: "api-key",
        choiceId: "mistral-api-key",
        choiceLabel: "Mistral API key",
        groupId: "mistral",
        groupLabel: "Mistral AI",
      },
      {
        pluginId: "volcengine",
        providerId: "volcengine",
        methodId: "api-key",
        choiceId: "volcengine-api-key",
        choiceLabel: "Volcano Engine API key",
        groupId: "volcengine",
        groupLabel: "Volcano Engine",
      },
      {
        pluginId: "byteplus",
        providerId: "byteplus",
        methodId: "api-key",
        choiceId: "byteplus-api-key",
        choiceLabel: "BytePlus API key",
        groupId: "byteplus",
        groupLabel: "BytePlus",
      },
      {
        pluginId: "opencode-go",
        providerId: "opencode-go",
        methodId: "api-key",
        choiceId: "opencode-go",
        choiceLabel: "OpenCode Go catalog",
        groupId: "opencode",
        groupLabel: "OpenCode",
      },
    ]);
    resolveProviderWizardOptions.mockReturnValue([
      {
        value: "ollama",
        label: "Ollama",
        hint: "Cloud and local open models",
        groupId: "ollama",
        groupLabel: "Ollama",
      },
      {
        value: "vllm",
        label: "vLLM",
        hint: "Local/self-hosted OpenAI-compatible server",
        groupId: "vllm",
        groupLabel: "vLLM",
      },
      {
        value: "sglang",
        label: "SGLang",
        hint: "Fast self-hosted OpenAI-compatible server",
        groupId: "sglang",
        groupLabel: "SGLang",
      },
    ]);
    const options = getOptions();

    for (const value of [
      "github-copilot",
      "token",
      "zai-api-key",
      "xiaomi-api-key",
      "minimax-global-api",
      "moonshot-api-key",
      "together-api-key",
      "chutes",
      "qwen-portal",
      "xai-api-key",
      "mistral-api-key",
      "volcengine-api-key",
      "byteplus-api-key",
      "vllm",
      "opencode-go",
      "ollama",
      "sglang",
    ]) {
      expect(options.some((opt) => opt.value === value)).toBe(true);
    }
  });

  it("builds cli help choices from the same catalog", () => {
    resolveManifestProviderAuthChoices.mockReturnValue([
      {
        pluginId: "openai",
        providerId: "openai",
        methodId: "api-key",
        choiceId: "openai-api-key",
        choiceLabel: "OpenAI API key",
      },
    ]);
    resolveProviderWizardOptions.mockReturnValue([
      {
        value: "ollama",
        label: "Ollama",
        hint: "Cloud and local open models",
        groupId: "ollama",
        groupLabel: "Ollama",
      },
    ]);
    const options = getOptions(true);
    const cliChoices = formatAuthChoiceChoicesForCli({
      includeLegacyAliases: false,
      includeSkip: true,
    }).split("|");

    expect(cliChoices).toContain("openai-api-key");
    expect(cliChoices).toContain("chutes");
    expect(cliChoices).toContain("litellm-api-key");
    expect(cliChoices).toContain("custom-api-key");
    expect(cliChoices).toContain("skip");
    expect(options.some((option) => option.value === "ollama")).toBe(true);
    expect(cliChoices).not.toContain("ollama");
  });

  it("can include legacy aliases in cli help choices", () => {
    const cliChoices = formatAuthChoiceChoicesForCli({
      includeLegacyAliases: true,
      includeSkip: true,
    }).split("|");

    expect(cliChoices).toContain("setup-token");
    expect(cliChoices).toContain("oauth");
    expect(cliChoices).toContain("claude-cli");
    expect(cliChoices).toContain("codex-cli");
  });

  it("keeps static cli help choices off the plugin-backed catalog", () => {
    resolveManifestProviderAuthChoices.mockReturnValue([
      {
        pluginId: "openai",
        providerId: "openai",
        methodId: "api-key",
        choiceId: "openai-api-key",
        choiceLabel: "OpenAI API key",
      },
    ]);
    resolveProviderWizardOptions.mockReturnValue([
      {
        value: "ollama",
        label: "Ollama",
        hint: "Cloud and local open models",
        groupId: "ollama",
        groupLabel: "Ollama",
      },
    ]);

    const cliChoices = formatStaticAuthChoiceChoicesForCli({
      includeLegacyAliases: false,
      includeSkip: true,
    }).split("|");

    expect(cliChoices).not.toContain("ollama");
    expect(cliChoices).not.toContain("openai-api-key");
    expect(cliChoices).toContain("skip");
  });

  it("shows Chutes in grouped provider selection", () => {
    resolveManifestProviderAuthChoices.mockReturnValue([]);
    const { groups } = buildAuthChoiceGroups({
      store: EMPTY_STORE,
      includeSkip: false,
    });
    const chutesGroup = groups.find((group) => group.value === "chutes");

    expect(chutesGroup).toBeDefined();
    expect(chutesGroup?.options.some((opt) => opt.value === "chutes")).toBe(true);
  });

  it("groups OpenCode Zen and Go under one OpenCode entry", () => {
    resolveManifestProviderAuthChoices.mockReturnValue([
      {
        pluginId: "opencode",
        providerId: "opencode",
        methodId: "api-key",
        choiceId: "opencode-zen",
        choiceLabel: "OpenCode Zen catalog",
        groupId: "opencode",
        groupLabel: "OpenCode",
      },
      {
        pluginId: "opencode-go",
        providerId: "opencode-go",
        methodId: "api-key",
        choiceId: "opencode-go",
        choiceLabel: "OpenCode Go catalog",
        groupId: "opencode",
        groupLabel: "OpenCode",
      },
    ]);
    const { groups } = buildAuthChoiceGroups({
      store: EMPTY_STORE,
      includeSkip: false,
    });
    const openCodeGroup = groups.find((group) => group.value === "opencode");

    expect(openCodeGroup).toBeDefined();
    expect(openCodeGroup?.options.some((opt) => opt.value === "opencode-zen")).toBe(true);
    expect(openCodeGroup?.options.some((opt) => opt.value === "opencode-go")).toBe(true);
  });

  it("shows Ollama in grouped provider selection", () => {
    resolveManifestProviderAuthChoices.mockReturnValue([]);
    resolveProviderWizardOptions.mockReturnValue([
      {
        value: "ollama",
        label: "Ollama",
        hint: "Cloud and local open models",
        groupId: "ollama",
        groupLabel: "Ollama",
      },
    ]);
    const { groups } = buildAuthChoiceGroups({
      store: EMPTY_STORE,
      includeSkip: false,
    });
    const ollamaGroup = groups.find((group) => group.value === "ollama");

    expect(ollamaGroup).toBeDefined();
    expect(ollamaGroup?.options.some((opt) => opt.value === "ollama")).toBe(true);
  });

  it("can skip runtime fallback providers when the manifest catalog is sufficient", () => {
    resolveManifestProviderAuthChoices.mockReturnValue([
      {
        pluginId: "openai",
        providerId: "openai",
        methodId: "api-key",
        choiceId: "openai-api-key",
        choiceLabel: "OpenAI API key",
        groupId: "openai",
        groupLabel: "OpenAI",
      },
    ]);
    resolveProviderWizardOptions.mockReturnValue([
      {
        value: "ollama",
        label: "Ollama",
        hint: "Cloud and local open models",
        groupId: "ollama",
        groupLabel: "Ollama",
      },
    ]);

    const options = buildAuthChoiceOptions({
      store: EMPTY_STORE,
      includeSkip: false,
      includeRuntimeFallbackProviders: false,
    });

    expect(resolveProviderWizardOptions).not.toHaveBeenCalled();
    expect(options.some((option) => option.value === "openai-api-key")).toBe(true);
    expect(options.some((option) => option.value === "ollama")).toBe(false);
  });

  it("hides image-generation-only providers from the interactive auth picker", () => {
    resolveManifestProviderAuthChoices.mockReturnValue([
      {
        pluginId: "fal",
        providerId: "fal",
        methodId: "api-key",
        choiceId: "fal-api-key",
        choiceLabel: "fal API key",
        groupId: "fal",
        groupLabel: "fal",
        onboardingScopes: ["image-generation"],
      },
      {
        pluginId: "openai",
        providerId: "openai",
        methodId: "api-key",
        choiceId: "openai-api-key",
        choiceLabel: "OpenAI API key",
        groupId: "openai",
        groupLabel: "OpenAI",
      },
    ]);
    resolveProviderWizardOptions.mockReturnValue([
      {
        value: "local-image-runtime",
        label: "Local image runtime",
        groupId: "local-image-runtime",
        groupLabel: "Local image runtime",
        onboardingScopes: ["image-generation"],
      },
      {
        value: "ollama",
        label: "Ollama",
        groupId: "ollama",
        groupLabel: "Ollama",
      },
    ]);

    const options = getOptions();

    expect(options.some((option) => option.value === "openai-api-key")).toBe(true);
    expect(options.some((option) => option.value === "ollama")).toBe(true);
    expect(options.some((option) => option.value === "fal-api-key")).toBe(false);
    expect(options.some((option) => option.value === "local-image-runtime")).toBe(false);
  });

  it("hides GitHub Copilot from embedded onboarding only", () => {
    resolveManifestProviderAuthChoices.mockReturnValue([
      {
        pluginId: "github-copilot",
        providerId: "github-copilot",
        methodId: "device",
        choiceId: "github-copilot",
        choiceLabel: "GitHub Copilot",
        groupId: "copilot",
        groupLabel: "Copilot",
      },
      {
        pluginId: "openai",
        providerId: "openai",
        methodId: "api-key",
        choiceId: "openai-api-key",
        choiceLabel: "OpenAI API key",
        groupId: "openai",
        groupLabel: "OpenAI",
      },
    ]);

    const embeddedOptions = buildAuthChoiceOptions({
      store: EMPTY_STORE,
      includeSkip: false,
      embedded: true,
    });
    const normalOptions = buildAuthChoiceOptions({
      store: EMPTY_STORE,
      includeSkip: false,
      embedded: false,
    });

    expect(embeddedOptions.some((option) => option.value === "github-copilot")).toBe(false);
    expect(embeddedOptions.some((option) => option.value === "openai-api-key")).toBe(true);
    expect(normalOptions.some((option) => option.value === "github-copilot")).toBe(true);
  });

  it("orders embedded provider groups by ease and popularity instead of alphabetically", () => {
    resolveManifestProviderAuthChoices.mockReturnValue([
      {
        pluginId: "openrouter",
        providerId: "openrouter",
        methodId: "api-key",
        choiceId: "openrouter-api-key",
        choiceLabel: "OpenRouter API key",
        groupId: "openrouter",
        groupLabel: "OpenRouter",
      },
      {
        pluginId: "google",
        providerId: "google",
        methodId: "api-key",
        choiceId: "gemini-api-key",
        choiceLabel: "Gemini API key",
        groupId: "google",
        groupLabel: "Google",
      },
      {
        pluginId: "anthropic",
        providerId: "anthropic",
        methodId: "api-key",
        choiceId: "apiKey",
        choiceLabel: "Anthropic API key",
        groupId: "anthropic",
        groupLabel: "Anthropic",
      },
      {
        pluginId: "openai",
        providerId: "openai",
        methodId: "oauth",
        choiceId: "openai-codex",
        choiceLabel: "OpenAI Codex (ChatGPT OAuth)",
        groupId: "openai",
        groupLabel: "OpenAI",
      },
    ]);
    resolveProviderWizardOptions.mockReturnValue([
      {
        value: "ollama",
        label: "Ollama",
        hint: "Run local models on this Mac",
        groupId: "ollama",
        groupLabel: "Ollama",
      },
    ]);

    const { groups } = buildAuthChoiceGroups({
      store: EMPTY_STORE,
      includeSkip: false,
      embedded: true,
    });

    expect(groups.slice(0, 5).map((group) => group.label)).toEqual([
      "OpenAI",
      "Anthropic",
      "Google",
      "Ollama",
      "OpenRouter",
    ]);
    expect(groups[0]?.hint).toBe("ChatGPT sign-in or API key");
  });

  it("orders embedded auth methods with the provider-specific ranking and detailed hints", () => {
    resolveManifestProviderAuthChoices.mockReturnValue([
      {
        pluginId: "openai",
        providerId: "openai",
        methodId: "api-key",
        choiceId: "openai-api-key",
        choiceLabel: "OpenAI API key",
        groupId: "openai",
        groupLabel: "OpenAI",
      },
      {
        pluginId: "openai",
        providerId: "openai",
        methodId: "oauth",
        choiceId: "openai-codex",
        choiceLabel: "OpenAI Codex (ChatGPT OAuth)",
        groupId: "openai",
        groupLabel: "OpenAI",
      },
      {
        pluginId: "anthropic",
        providerId: "anthropic",
        methodId: "setup-token",
        choiceId: "token",
        choiceLabel: "Anthropic setup-token",
        groupId: "anthropic",
        groupLabel: "Anthropic",
      },
      {
        pluginId: "anthropic",
        providerId: "anthropic",
        methodId: "api-key",
        choiceId: "apiKey",
        choiceLabel: "Anthropic API key",
        groupId: "anthropic",
        groupLabel: "Anthropic",
      },
      {
        pluginId: "google",
        providerId: "google",
        methodId: "oauth",
        choiceId: "google-gemini-cli",
        choiceLabel: "Gemini CLI OAuth",
        groupId: "google",
        groupLabel: "Google",
      },
      {
        pluginId: "google",
        providerId: "google",
        methodId: "api-key",
        choiceId: "gemini-api-key",
        choiceLabel: "Gemini API key",
        groupId: "google",
        groupLabel: "Google",
      },
      {
        pluginId: "minimax",
        providerId: "minimax",
        methodId: "cn-oauth",
        choiceId: "minimax-cn-oauth",
        choiceLabel: "MiniMax OAuth (CN)",
        groupId: "minimax",
        groupLabel: "MiniMax",
      },
      {
        pluginId: "minimax",
        providerId: "minimax",
        methodId: "global-api",
        choiceId: "minimax-global-api",
        choiceLabel: "MiniMax API key (Global)",
        groupId: "minimax",
        groupLabel: "MiniMax",
      },
      {
        pluginId: "minimax",
        providerId: "minimax",
        methodId: "cn-api",
        choiceId: "minimax-cn-api",
        choiceLabel: "MiniMax API key (CN)",
        groupId: "minimax",
        groupLabel: "MiniMax",
      },
      {
        pluginId: "minimax",
        providerId: "minimax",
        methodId: "global-oauth",
        choiceId: "minimax-global-oauth",
        choiceLabel: "MiniMax OAuth (Global)",
        groupId: "minimax",
        groupLabel: "MiniMax",
      },
      {
        pluginId: "zai",
        providerId: "zai",
        methodId: "cn",
        choiceId: "zai-cn",
        choiceLabel: "Z.AI CN",
        groupId: "zai",
        groupLabel: "Z.AI",
      },
      {
        pluginId: "zai",
        providerId: "zai",
        methodId: "global",
        choiceId: "zai-global",
        choiceLabel: "Z.AI Global",
        groupId: "zai",
        groupLabel: "Z.AI",
      },
      {
        pluginId: "zai",
        providerId: "zai",
        methodId: "coding-cn",
        choiceId: "zai-coding-cn",
        choiceLabel: "Z.AI Coding Plan (CN)",
        groupId: "zai",
        groupLabel: "Z.AI",
      },
      {
        pluginId: "zai",
        providerId: "zai",
        methodId: "api-key",
        choiceId: "zai-api-key",
        choiceLabel: "Z.AI API key",
        groupId: "zai",
        groupLabel: "Z.AI",
      },
      {
        pluginId: "zai",
        providerId: "zai",
        methodId: "coding-global",
        choiceId: "zai-coding-global",
        choiceLabel: "Z.AI Coding Plan (Global)",
        groupId: "zai",
        groupLabel: "Z.AI",
      },
    ]);

    const { groups } = buildAuthChoiceGroups({
      store: EMPTY_STORE,
      includeSkip: false,
      embedded: true,
    });

    expect(groups.find((group) => group.value === "openai")?.options.map((option) => option.value)).toEqual([
      "openai-codex",
      "openai-api-key",
    ]);
    expect(groups.find((group) => group.value === "anthropic")?.options.map((option) => option.value)).toEqual([
      "apiKey",
      "token",
    ]);
    expect(groups.find((group) => group.value === "google")?.options.map((option) => option.value)).toEqual([
      "gemini-api-key",
      "google-gemini-cli",
    ]);
    expect(groups.find((group) => group.value === "minimax")?.options.map((option) => option.value)).toEqual([
      "minimax-global-api",
      "minimax-global-oauth",
      "minimax-cn-api",
      "minimax-cn-oauth",
    ]);
    expect(groups.find((group) => group.value === "zai")?.options.map((option) => option.value)).toEqual([
      "zai-api-key",
      "zai-global",
      "zai-coding-global",
      "zai-cn",
      "zai-coding-cn",
    ]);
    expect(groups.find((group) => group.value === "openai")?.options[0]?.hint).toContain(
      "Best for:",
    );
    expect(groups.find((group) => group.value === "openai")?.options[0]?.hint).toContain(
      "What you need:",
    );
  });
});
