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

  it("shows the embedded setup note before auto-continuing single-method providers", async () => {
    buildAuthChoiceGroups.mockReturnValue({
      groups: [
        {
          value: "ollama",
          label: "Ollama",
          options: [{ value: "ollama", label: "Ollama", hint: "Local runtime" }],
        },
      ],
      skipOption: undefined,
    });

    const prompter = {
      select: vi.fn(async () => "ollama"),
      note: vi.fn(async () => {}),
    };

    await expect(
      promptAuthChoiceGrouped({
        prompter: prompter as never,
        store: EMPTY_STORE,
        includeSkip: false,
        embedded: true,
      }),
    ).resolves.toBe("ollama");

    expect(prompter.note).toHaveBeenCalledWith(
      expect.stringContaining("Best for:"),
      "Before you choose Ollama",
    );
  });

  it("does not show the detached note for multi-method embedded providers", async () => {
    buildAuthChoiceGroups.mockReturnValue({
      groups: [
        {
          value: "openai",
          label: "OpenAI",
          options: [
            { value: "openai-codex", label: "OpenAI Codex (ChatGPT OAuth)" },
            { value: "openai-api-key", label: "OpenAI API key" },
          ],
        },
      ],
      skipOption: undefined,
    });

    const prompter = {
      select: vi.fn().mockResolvedValueOnce("openai").mockResolvedValueOnce("openai-codex"),
      note: vi.fn(async () => {}),
    };

    await expect(
      promptAuthChoiceGrouped({
        prompter: prompter as never,
        store: EMPTY_STORE,
        includeSkip: false,
        embedded: true,
      }),
    ).resolves.toBe("openai-codex");

    expect(prompter.note).not.toHaveBeenCalled();
  });
});
