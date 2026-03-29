import { describe, expect, it } from "vitest";
import type { MaumauConfig } from "../config/config.js";
import {
  applyLocalSetupWorkspaceConfig,
  ONBOARDING_DEFAULT_DM_SCOPE,
  ONBOARDING_DEFAULT_OPTIONAL_PLUGIN_TOOLS,
  ONBOARDING_DEFAULT_TOOLS_PROFILE,
} from "./onboard-config.js";

describe("applyLocalSetupWorkspaceConfig", () => {
  it("defaults local setup tool profile to coding", () => {
    expect(ONBOARDING_DEFAULT_TOOLS_PROFILE).toBe("coding");
  });

  it("sets secure dmScope default when unset", () => {
    const baseConfig: MaumauConfig = {};
    const result = applyLocalSetupWorkspaceConfig(baseConfig, "/tmp/workspace");

    expect(result.session?.dmScope).toBe(ONBOARDING_DEFAULT_DM_SCOPE);
    expect(result.gateway?.mode).toBe("local");
    expect(result.agents?.defaults?.workspace).toBe("/tmp/workspace");
    expect(result.tools?.profile).toBe(ONBOARDING_DEFAULT_TOOLS_PROFILE);
    expect(result.tools?.alsoAllow).toEqual([...ONBOARDING_DEFAULT_OPTIONAL_PLUGIN_TOOLS]);
    expect(result.tools?.sessions?.visibility).toBe("all");
    expect(result.tools?.agentToAgent).toEqual({
      enabled: true,
      allow: ["*"],
    });
  });

  it("preserves existing dmScope when already configured", () => {
    const baseConfig: MaumauConfig = {
      session: {
        dmScope: "main",
      },
    };
    const result = applyLocalSetupWorkspaceConfig(baseConfig, "/tmp/workspace");

    expect(result.session?.dmScope).toBe("main");
  });

  it("preserves explicit non-main dmScope values", () => {
    const baseConfig: MaumauConfig = {
      session: {
        dmScope: "per-account-channel-peer",
      },
    };
    const result = applyLocalSetupWorkspaceConfig(baseConfig, "/tmp/workspace");

    expect(result.session?.dmScope).toBe("per-account-channel-peer");
  });

  it("preserves an explicit tools.profile when already configured", () => {
    const baseConfig: MaumauConfig = {
      tools: {
        profile: "full",
      },
    };
    const result = applyLocalSetupWorkspaceConfig(baseConfig, "/tmp/workspace");

    expect(result.tools?.profile).toBe("full");
  });

  it("merges onboarding plugin tool defaults into existing alsoAllow entries", () => {
    const baseConfig: MaumauConfig = {
      tools: {
        alsoAllow: ["web_search"],
      },
    };

    const result = applyLocalSetupWorkspaceConfig(baseConfig, "/tmp/workspace");

    expect(result.tools?.alsoAllow).toEqual([
      "web_search",
      ...ONBOARDING_DEFAULT_OPTIONAL_PLUGIN_TOOLS,
    ]);
  });

  it("does not add alsoAllow when the config already uses an explicit tools.allow list", () => {
    const baseConfig: MaumauConfig = {
      tools: {
        allow: ["read", "write"],
      },
    };

    const result = applyLocalSetupWorkspaceConfig(baseConfig, "/tmp/workspace");

    expect(result.tools?.allow).toEqual(["read", "write"]);
    expect(result.tools?.alsoAllow).toBeUndefined();
  });

  it("preserves explicit session visibility and agent-to-agent settings", () => {
    const baseConfig: MaumauConfig = {
      tools: {
        sessions: {
          visibility: "agent",
        },
        agentToAgent: {
          enabled: false,
          allow: ["ops"],
        },
      },
    };

    const result = applyLocalSetupWorkspaceConfig(baseConfig, "/tmp/workspace");

    expect(result.tools?.sessions?.visibility).toBe("agent");
    expect(result.tools?.agentToAgent).toEqual({
      enabled: false,
      allow: ["ops"],
    });
  });
});
