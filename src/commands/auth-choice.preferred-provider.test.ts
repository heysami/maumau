import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveManifestProviderAuthChoice = vi.hoisted(() => vi.fn());
const resolveProviderPluginChoice = vi.hoisted(() => vi.fn());
const resolvePluginProviders = vi.hoisted(() => vi.fn(() => []));

vi.mock("../plugins/provider-auth-choices.js", () => ({
  resolveManifestProviderAuthChoice,
}));

vi.mock("../plugins/provider-wizard.js", () => ({
  resolveProviderPluginChoice,
}));

vi.mock("../plugins/providers.runtime.js", () => ({
  resolvePluginProviders,
}));

import {
  resolvePreferredProviderForAuthChoice,
  resolvePreferredProvidersForAuthChoices,
} from "./auth-choice.preferred-provider.js";

describe("resolvePreferredProviderForAuthChoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveManifestProviderAuthChoice.mockReturnValue(undefined);
    resolvePluginProviders.mockReturnValue([]);
    resolveProviderPluginChoice.mockReturnValue(null);
  });

  it("prefers manifest metadata when available", async () => {
    resolveManifestProviderAuthChoice.mockReturnValue({
      pluginId: "openai",
      providerId: "openai",
      methodId: "api-key",
      choiceId: "openai-api-key",
      choiceLabel: "OpenAI API key",
    });

    await expect(resolvePreferredProviderForAuthChoice({ choice: "openai-api-key" })).resolves.toBe(
      "openai",
    );
    expect(resolvePluginProviders).not.toHaveBeenCalled();
  });

  it("normalizes legacy auth choices before plugin lookup", async () => {
    resolveProviderPluginChoice.mockReturnValue({
      provider: { id: "anthropic", label: "Anthropic", auth: [] },
      method: { id: "setup-token", label: "setup-token", kind: "token" },
    });

    await expect(resolvePreferredProviderForAuthChoice({ choice: "claude-cli" })).resolves.toBe(
      "anthropic",
    );
    expect(resolveProviderPluginChoice).toHaveBeenCalledWith(
      expect.objectContaining({
        choice: "setup-token",
      }),
    );
    expect(resolvePluginProviders).toHaveBeenCalledWith(
      expect.objectContaining({
        bundledProviderAllowlistCompat: true,
        bundledProviderVitestCompat: true,
      }),
    );
  });

  it("falls back to static core choices when no provider plugin claims the choice", async () => {
    await expect(resolvePreferredProviderForAuthChoice({ choice: "chutes" })).resolves.toBe(
      "chutes",
    );
  });

  it("reuses one provider snapshot for multiple auth choices", async () => {
    resolveProviderPluginChoice.mockImplementation(({ choice }) => {
      if (choice === "setup-token") {
        return {
          provider: { id: "anthropic", label: "Anthropic", auth: [] },
          method: { id: "setup-token", label: "setup-token", kind: "token" },
        };
      }
      if (choice === "openai-codex") {
        return {
          provider: { id: "openai-codex", label: "OpenAI Codex", auth: [] },
          method: { id: "openai-codex", label: "openai-codex", kind: "oauth" },
        };
      }
      return null;
    });

    const resolved = await resolvePreferredProvidersForAuthChoices({
      choices: ["claude-cli", "codex-cli", "chutes"],
    });

    expect(Array.from(resolved.entries())).toEqual([
      ["claude-cli", "anthropic"],
      ["codex-cli", "openai-codex"],
      ["chutes", "chutes"],
    ]);
    expect(resolvePluginProviders).toHaveBeenCalledTimes(1);
  });
});
