import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WizardPrompter } from "../wizard/prompts.js";
import { warnIfModelConfigLooksOff } from "./auth-choice.model-check.js";

const ensureAuthProfileStore = vi.hoisted(() => vi.fn(() => ({ profiles: {} })));
const listProfilesForProvider = vi.hoisted(() => vi.fn(() => []));
const hasUsableCustomProviderApiKey = vi.hoisted(() => vi.fn(() => false));
const resolveEnvApiKey = vi.hoisted(() => vi.fn(() => undefined));
const loadModelCatalog = vi.hoisted(() =>
  vi.fn(async () => [{ provider: "anthropic", id: "claude-sonnet-4-6" }]),
);
const resolveDefaultModelForAgent = vi.hoisted(() =>
  vi.fn(() => ({ provider: "anthropic", model: "claude-sonnet-4-6" })),
);

vi.mock("../agents/auth-profiles.js", () => ({
  ensureAuthProfileStore,
  listProfilesForProvider,
}));

vi.mock("../agents/model-auth.js", () => ({
  hasUsableCustomProviderApiKey,
  resolveEnvApiKey,
}));

vi.mock("../agents/model-catalog.js", () => ({
  loadModelCatalog,
}));

vi.mock("../agents/model-selection.js", () => ({
  resolveDefaultModelForAgent,
}));

vi.mock("./provider-auth-guidance.js", () => ({
  buildProviderAuthRecoveryHint: () => "Add credentials.",
}));

describe("warnIfModelConfigLooksOff", () => {
  beforeEach(() => {
    ensureAuthProfileStore.mockClear();
    listProfilesForProvider.mockClear();
    hasUsableCustomProviderApiKey.mockClear();
    resolveEnvApiKey.mockClear();
    loadModelCatalog.mockClear();
    resolveDefaultModelForAgent.mockClear();
  });

  it("does not warn when config already carries an auth profile for the selected provider", async () => {
    const prompter = { note: vi.fn() } as unknown as WizardPrompter;

    await warnIfModelConfigLooksOff(
      {
        agents: { defaults: { model: "anthropic/claude-sonnet-4-6" } },
        auth: {
          profiles: {
            "anthropic:default": {
              provider: "anthropic",
              mode: "api_key",
            },
          },
        },
      },
      prompter,
    );

    expect(prompter.note).not.toHaveBeenCalled();
  });

  it("still warns when auth is missing everywhere", async () => {
    const prompter = { note: vi.fn() } as unknown as WizardPrompter;

    await warnIfModelConfigLooksOff(
      {
        agents: { defaults: { model: "anthropic/claude-sonnet-4-6" } },
      },
      prompter,
    );

    expect(prompter.note).toHaveBeenCalledWith(
      expect.stringContaining('No auth configured for provider "anthropic".'),
      "Model check",
    );
  });
});
