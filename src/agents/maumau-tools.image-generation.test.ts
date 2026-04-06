import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MaumauConfig } from "../config/config.js";
import * as imageGenerationRuntime from "../image-generation/runtime.js";
import {
  clearRuntimeAuthProfileStoreSnapshots,
  replaceRuntimeAuthProfileStoreSnapshots,
} from "./auth-profiles.js";
import { createMaumauTools } from "./maumau-tools.js";

vi.mock("../plugins/tools.js", () => ({
  resolvePluginTools: () => [],
}));

function asConfig(value: unknown): MaumauConfig {
  return value as MaumauConfig;
}

function stubImageGenerationProviders() {
  vi.spyOn(imageGenerationRuntime, "listRuntimeImageGenerationProviders").mockReturnValue([
    {
      id: "openai",
      defaultModel: "gpt-image-1",
      models: ["gpt-image-1"],
      capabilities: {
        generate: {
          supportsSize: true,
        },
        edit: {
          enabled: false,
        },
        geometry: {
          sizes: ["1024x1024"],
        },
      },
      generateImage: vi.fn(async () => {
        throw new Error("not used");
      }),
    },
  ]);
}

describe("maumau tools image generation registration", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEYS", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEYS", "");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    clearRuntimeAuthProfileStoreSnapshots();
  });

  it("registers image_generate when image-generation config is present", () => {
    const tools = createMaumauTools({
      config: asConfig({
        agents: {
          defaults: {
            imageGenerationModel: {
              primary: "openai/gpt-image-1",
            },
          },
        },
      }),
      agentDir: "/tmp/maumau-agent-main",
    });

    expect(tools.map((tool) => tool.name)).toContain("image_generate");
  });

  it("registers image_generate when a compatible provider has env-backed auth", () => {
    stubImageGenerationProviders();
    vi.stubEnv("OPENAI_API_KEY", "openai-test");

    const tools = createMaumauTools({
      config: asConfig({}),
      agentDir: "/tmp/maumau-agent-main",
    });

    expect(tools.map((tool) => tool.name)).toContain("image_generate");
  });

  it("omits image_generate when config is absent and no compatible provider auth exists", () => {
    stubImageGenerationProviders();

    const tools = createMaumauTools({
      config: asConfig({}),
      agentDir: "/tmp/maumau-agent-main",
    });

    expect(tools.map((tool) => tool.name)).not.toContain("image_generate");
  });

  it("omits image_generate when provider auth only points to an unresolved env ref", () => {
    stubImageGenerationProviders();
    replaceRuntimeAuthProfileStoreSnapshots([
      {
        agentDir: "/tmp/maumau-agent-main",
        store: {
          version: 1,
          profiles: {
            "openai:default": {
              type: "api_key",
              provider: "openai",
              keyRef: {
                source: "env",
                provider: "default",
                id: "OPENAI_API_KEY",
              },
            },
          },
        },
      },
    ]);

    const tools = createMaumauTools({
      config: asConfig({}),
      agentDir: "/tmp/maumau-agent-main",
    });

    expect(tools.map((tool) => tool.name)).not.toContain("image_generate");
  });
});
