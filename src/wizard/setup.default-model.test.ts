import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelCatalogEntry } from "../agents/model-catalog.js";
import type { MaumauConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "./prompts.js";
import { ensureSetupDefaultModelSelected } from "./setup.default-model.js";

const ensureAuthProfileStore = vi.hoisted(() => vi.fn(() => ({ profiles: {} })));
const listProfilesForProvider = vi.hoisted(() =>
  vi.fn<(store: unknown, provider: string) => string[]>(() => []),
);
const loadModelCatalog = vi.hoisted(() =>
  vi.fn<() => Promise<ModelCatalogEntry[]>>(async () => []),
);
const resolveEnvApiKey = vi.hoisted(() => vi.fn(() => undefined));
const hasUsableCustomProviderApiKey = vi.hoisted(() => vi.fn(() => false));
const promptDefaultModel = vi.hoisted(() =>
  vi.fn<() => Promise<{ model?: string; config?: MaumauConfig }>>(async () => ({
    model: undefined,
    config: undefined,
  })),
);
const applyPrimaryModel = vi.hoisted(() =>
  vi.fn((cfg: MaumauConfig, model: string) => ({
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        model: {
          primary: model,
        },
      },
    },
  })),
);

vi.mock("../agents/auth-profiles.js", () => ({
  ensureAuthProfileStore,
  listProfilesForProvider,
}));

vi.mock("../agents/model-catalog.js", () => ({
  loadModelCatalog,
}));

vi.mock("../agents/model-auth.js", () => ({
  resolveEnvApiKey,
  hasUsableCustomProviderApiKey,
}));

vi.mock("../commands/model-picker.js", () => ({
  promptDefaultModel,
  applyPrimaryModel,
}));

function makePrompter(): WizardPrompter {
  return {
    intro: async () => {},
    outro: async () => {},
    note: async () => {},
    select: (async <T>() => "" as T) as WizardPrompter["select"],
    multiselect: (async <T>() => [] as T[]) as WizardPrompter["multiselect"],
    text: async () => "",
    confirm: async () => false,
    progress: () => ({ update: () => {}, stop: () => {} }),
  };
}

function makeRuntime(): RuntimeEnv {
  return {
    log: () => {},
    error: () => {},
    exit: () => {},
  };
}

describe("ensureSetupDefaultModelSelected", () => {
  beforeEach(() => {
    ensureAuthProfileStore.mockClear();
    listProfilesForProvider.mockReset();
    listProfilesForProvider.mockReturnValue([]);
    loadModelCatalog.mockReset();
    loadModelCatalog.mockResolvedValue([]);
    resolveEnvApiKey.mockReset();
    resolveEnvApiKey.mockReturnValue(undefined);
    hasUsableCustomProviderApiKey.mockReset();
    hasUsableCustomProviderApiKey.mockReturnValue(false);
    promptDefaultModel.mockReset();
    promptDefaultModel.mockResolvedValue({ model: undefined, config: undefined });
    applyPrimaryModel.mockClear();
  });

  it("keeps the config unchanged when a default model is already set", async () => {
    const config: MaumauConfig = {
      agents: {
        defaults: {
          model: {
            primary: "openai/gpt-5.4",
          },
        },
      },
    };

    const next = await ensureSetupDefaultModelSelected({
      config,
      prompter: makePrompter(),
      runtime: makeRuntime(),
      workspaceDir: "/tmp/workspace",
    });

    expect(next).toBe(config);
    expect(loadModelCatalog).not.toHaveBeenCalled();
    expect(promptDefaultModel).not.toHaveBeenCalled();
  });

  it("prompts for a default model when auth exists but config has none", async () => {
    const note = vi.fn(async () => {});
    const prompter = makePrompter();
    prompter.note = note;
    loadModelCatalog.mockResolvedValueOnce([
      { provider: "openai-codex", id: "gpt-5.4", name: "gpt-5.4" },
      { provider: "openai-codex", id: "gpt-5.3-codex-spark", name: "gpt-5.3-codex-spark" },
    ]);
    listProfilesForProvider.mockImplementation((_store: unknown, provider: string) =>
      provider === "openai-codex" ? ["openai-codex:default"] : [],
    );
    promptDefaultModel.mockResolvedValueOnce({
      model: "openai-codex/gpt-5.4",
      config: undefined,
    });

    const next = await ensureSetupDefaultModelSelected({
      config: {},
      prompter,
      runtime: makeRuntime(),
      workspaceDir: "/tmp/workspace",
    });

    expect(note).toHaveBeenCalledWith(
      expect.stringContaining("Found existing auth for openai-codex"),
      "Default model",
    );
    expect(promptDefaultModel).toHaveBeenCalledWith(
      expect.objectContaining({
        allowKeep: false,
        preferredProvider: "openai-codex",
        message: "Choose a default model",
      }),
    );
    expect(applyPrimaryModel).toHaveBeenCalledWith({}, "openai-codex/gpt-5.4");
    expect(next.agents?.defaults?.model).toEqual({ primary: "openai-codex/gpt-5.4" });
  });

  it("does not prompt when no authed providers are available", async () => {
    loadModelCatalog.mockResolvedValueOnce([
      { provider: "openai-codex", id: "gpt-5.4", name: "gpt-5.4" },
    ]);
    listProfilesForProvider.mockReturnValue([]);
    resolveEnvApiKey.mockReturnValue(undefined);
    hasUsableCustomProviderApiKey.mockReturnValue(false);

    const next = await ensureSetupDefaultModelSelected({
      config: {},
      prompter: makePrompter(),
      runtime: makeRuntime(),
      workspaceDir: "/tmp/workspace",
    });

    expect(next).toEqual({});
    expect(promptDefaultModel).not.toHaveBeenCalled();
  });
});
