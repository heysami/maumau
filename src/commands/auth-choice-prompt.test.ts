import { describe, expect, it, vi } from "vitest";
import type { AuthProfileStore } from "../agents/auth-profiles.js";
import { promptAuthChoiceGrouped } from "./auth-choice-prompt.js";

const buildAuthChoiceGroups = vi.hoisted(() => vi.fn());

vi.mock("./auth-choice-options.js", () => ({
  buildAuthChoiceGroups,
}));

const EMPTY_STORE: AuthProfileStore = { version: 1, profiles: {} };

describe("promptAuthChoiceGrouped", () => {
  it("retries with runtime fallback when the manifest-backed catalog is empty", async () => {
    buildAuthChoiceGroups
      .mockReturnValueOnce({
        groups: [],
        skipOption: undefined,
      })
      .mockReturnValueOnce({
        groups: [
          {
            value: "openai",
            label: "OpenAI",
            options: [{ value: "openai-api-key", label: "OpenAI API key" }],
          },
        ],
        skipOption: undefined,
      });

    const prompter = {
      select: vi.fn(async () => "openai"),
      note: vi.fn(async () => {}),
    };

    await expect(
      promptAuthChoiceGrouped({
        prompter: prompter as never,
        store: EMPTY_STORE,
        includeSkip: false,
        includeRuntimeFallbackProviders: false,
        embedded: true,
      }),
    ).resolves.toBe("openai-api-key");

    expect(buildAuthChoiceGroups).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        embedded: true,
        includeRuntimeFallbackProviders: false,
      }),
    );
    expect(buildAuthChoiceGroups).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        embedded: true,
        includeRuntimeFallbackProviders: true,
      }),
    );
    expect(prompter.select).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "AI service",
      }),
    );
  });
});
