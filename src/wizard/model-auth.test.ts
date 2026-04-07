import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readConfigFileSnapshot: vi.fn(),
  writeConfigFile: vi.fn(),
  buildAuthChoiceGroups: vi.fn(),
  resolvePreferredProvidersForAuthChoices: vi.fn(),
  applyAuthChoice: vi.fn(),
  resolvePreferredProviderForAuthChoice: vi.fn(),
  warnIfModelConfigLooksOff: vi.fn(),
  applyPrimaryModel: vi.fn(),
  promptDefaultModel: vi.fn(),
  promptAuthChoiceGrouped: vi.fn(),
  resolveDefaultAgentWorkspaceDir: vi.fn(() => "/tmp/workspace"),
}));

vi.mock("../config/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/config.js")>();
  return {
    ...actual,
    readConfigFileSnapshot: (...args: unknown[]) => mocks.readConfigFileSnapshot(...args),
    writeConfigFile: (...args: unknown[]) => mocks.writeConfigFile(...args),
  };
});

vi.mock("../commands/auth-choice-options.js", () => ({
  buildAuthChoiceGroups: (...args: unknown[]) => mocks.buildAuthChoiceGroups(...args),
}));

vi.mock("../plugins/provider-auth-choice-preference.js", () => ({
  resolvePreferredProvidersForAuthChoices: (...args: unknown[]) =>
    mocks.resolvePreferredProvidersForAuthChoices(...args),
}));

vi.mock("../commands/auth-choice.js", () => ({
  applyAuthChoice: (...args: unknown[]) => mocks.applyAuthChoice(...args),
  resolvePreferredProviderForAuthChoice: (...args: unknown[]) =>
    mocks.resolvePreferredProviderForAuthChoice(...args),
  warnIfModelConfigLooksOff: (...args: unknown[]) => mocks.warnIfModelConfigLooksOff(...args),
}));

vi.mock("../commands/model-picker.js", () => ({
  applyPrimaryModel: (...args: unknown[]) => mocks.applyPrimaryModel(...args),
  promptDefaultModel: (...args: unknown[]) => mocks.promptDefaultModel(...args),
}));

vi.mock("../commands/auth-choice-prompt.js", () => ({
  promptAuthChoiceGrouped: (...args: unknown[]) => mocks.promptAuthChoiceGrouped(...args),
}));

vi.mock("../agents/workspace.js", () => ({
  resolveDefaultAgentWorkspaceDir: (...args: unknown[]) =>
    mocks.resolveDefaultAgentWorkspaceDir(...args),
}));

vi.mock("../agents/auth-profiles.js", () => ({
  ensureAuthProfileStore: vi.fn(() => ({ profiles: {}, order: {} })),
}));

const prompter = {
  note: vi.fn(async () => {}),
} as const;

const runtime = {} as const;

describe("runModelAuthWizard", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.readConfigFileSnapshot.mockReset();
    mocks.writeConfigFile.mockReset();
    mocks.buildAuthChoiceGroups.mockReset();
    mocks.resolvePreferredProvidersForAuthChoices.mockReset();
    mocks.applyAuthChoice.mockReset();
    mocks.resolvePreferredProviderForAuthChoice.mockReset();
    mocks.warnIfModelConfigLooksOff.mockReset();
    mocks.applyPrimaryModel.mockReset();
    mocks.promptDefaultModel.mockReset();
    mocks.promptAuthChoiceGrouped.mockReset();
    mocks.resolveDefaultAgentWorkspaceDir.mockReset();

    mocks.resolveDefaultAgentWorkspaceDir.mockReturnValue("/tmp/workspace");
    mocks.buildAuthChoiceGroups.mockReturnValue({
      groups: [
        {
          value: "google",
          label: "Google",
          options: [{ value: "gemini-api-key", label: "API key" }],
        },
      ],
    });
    mocks.resolvePreferredProvidersForAuthChoices.mockResolvedValue(
      new Map<string, string>([["gemini-api-key", "google"]]),
    );
    mocks.promptAuthChoiceGrouped.mockResolvedValue("gemini-api-key");
    mocks.warnIfModelConfigLooksOff.mockResolvedValue(undefined);
    mocks.applyPrimaryModel.mockImplementation((cfg: unknown) => cfg);
    mocks.promptDefaultModel.mockResolvedValue({});
  });

  it("preserves the existing default model when setDefaultModel is false", async () => {
    const existingConfig = {
      agents: {
        defaults: {
          model: { primary: "openai-codex/gpt-5.4" },
        },
      },
    };
    mocks.readConfigFileSnapshot.mockResolvedValue({
      exists: true,
      valid: true,
      config: existingConfig,
    });
    mocks.applyAuthChoice.mockResolvedValue({
      config: {
        ...existingConfig,
        auth: {
          profiles: {
            "google:default": {
              provider: "google",
              mode: "api_key",
            },
          },
        },
      },
      agentModelOverride: "google/gemini-3.1-pro-preview",
    });

    const { runModelAuthWizard } = await import("./model-auth.js");

    await runModelAuthWizard(
      { authChoice: "gemini-api-key", setDefaultModel: false },
      runtime as never,
      prompter as never,
    );

    expect(mocks.applyAuthChoice).toHaveBeenCalledWith(
      expect.objectContaining({
        authChoice: "gemini-api-key",
        setDefaultModel: false,
      }),
    );
    expect(mocks.applyPrimaryModel).not.toHaveBeenCalled();
    expect(mocks.promptDefaultModel).not.toHaveBeenCalled();
    expect(mocks.writeConfigFile).toHaveBeenCalledWith(
      expect.objectContaining({
        agents: {
          defaults: {
            model: { primary: "openai-codex/gpt-5.4" },
          },
        },
      }),
    );
  });

  it("annotates grouped auth choices with provider ids from the batched resolver", async () => {
    mocks.buildAuthChoiceGroups.mockReturnValue({
      groups: [
        {
          value: "openai",
          label: "OpenAI",
          options: [{ value: "openai-api-key", label: "API key" }],
        },
        {
          value: "anthropic",
          label: "Anthropic",
          options: [{ value: "claude-cli", label: "Claude CLI" }],
        },
      ],
    });
    mocks.resolvePreferredProvidersForAuthChoices.mockResolvedValue(
      new Map<string, string>([
        ["openai-api-key", "openai"],
        ["claude-cli", "anthropic"],
      ]),
    );

    const { resolveModelAuthChoiceGroups } = await import("./model-auth.js");
    const groups = await resolveModelAuthChoiceGroups();

    expect(groups).toEqual([
      {
        value: "openai",
        label: "OpenAI",
        options: [{ value: "openai-api-key", label: "API key", providerId: "openai" }],
      },
      {
        value: "anthropic",
        label: "Anthropic",
        options: [{ value: "claude-cli", label: "Claude CLI", providerId: "anthropic" }],
      },
    ]);
    expect(mocks.resolvePreferredProvidersForAuthChoices).toHaveBeenCalledWith(
      expect.objectContaining({
        choices: ["openai-api-key", "claude-cli"],
      }),
    );
  });
});
