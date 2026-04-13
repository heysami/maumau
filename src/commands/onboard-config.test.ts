import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MaumauConfig } from "../config/config.js";
const readTailscaleStatusJson = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("../infra/tailscale.js", () => ({
  readTailscaleStatusJson,
}));
import {
  applyLocalSetupWorkspaceConfig,
  detectFreshInstallTailscaleMode,
  ONBOARDING_DEFAULT_DM_SCOPE,
  ONBOARDING_DEFAULT_OPTIONAL_PLUGIN_TOOLS,
  ONBOARDING_DEFAULT_TOOLS_PROFILE,
} from "./onboard-config.js";

describe("applyLocalSetupWorkspaceConfig", () => {
  beforeEach(() => {
    readTailscaleStatusJson.mockReset();
    readTailscaleStatusJson.mockResolvedValue({});
  });

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

  it("makes the managed browser lane the default on fresh local installs", () => {
    const result = applyLocalSetupWorkspaceConfig({}, "/tmp/workspace", { freshInstall: true });

    expect(result.browser?.defaultProfile).toBe("maumau");
    expect(result.browser?.profiles?.desktop).toEqual(
      expect.objectContaining({
        driver: "clawd",
      }),
    );
    expect(typeof result.browser?.profiles?.desktop?.cdpPort).toBe("number");
  });

  it("adds mauworld plugin defaults on fresh local installs", () => {
    const result = applyLocalSetupWorkspaceConfig({}, "/tmp/workspace", { freshInstall: true });

    expect(result.plugins?.entries?.mauworld).toEqual({
      enabled: true,
      config: {
        apiBaseUrl: "https://mauworld-api.onrender.com/api",
        autoHeartbeat: true,
        autoLinkOnFreshInstall: true,
        mainAgentId: "main",
        timeoutMs: 15_000,
        displayName: "Main Mau Agent",
      },
    });
  });

  it("preserves existing mauworld config while filling fresh-install defaults", () => {
    const baseConfig: MaumauConfig = {
      plugins: {
        entries: {
          mauworld: {
            enabled: false,
            config: {
              mainAgentId: "ops",
              timeoutMs: 20_000,
            },
          },
        },
      },
    };

    const result = applyLocalSetupWorkspaceConfig(baseConfig, "/tmp/workspace", {
      freshInstall: true,
    });

    expect(result.plugins?.entries?.mauworld).toEqual({
      enabled: false,
      config: {
        apiBaseUrl: "https://mauworld-api.onrender.com/api",
        autoHeartbeat: true,
        autoLinkOnFreshInstall: true,
        mainAgentId: "ops",
        timeoutMs: 20_000,
        displayName: "Main Mau Agent",
      },
    });
  });

  it("preserves an existing clawd fallback profile on fresh installs", () => {
    const baseConfig: MaumauConfig = {
      browser: {
        defaultProfile: "custom-browser",
        profiles: {
          desktop: {
            driver: "clawd",
            cdpPort: 18901,
            color: "#123456",
          },
        },
      },
    };

    const result = applyLocalSetupWorkspaceConfig(baseConfig, "/tmp/workspace", {
      freshInstall: true,
    });

    expect(result.browser?.defaultProfile).toBe("custom-browser");
    expect(result.browser?.profiles?.desktop).toEqual({
      driver: "clawd",
      cdpPort: 18901,
      color: "#123456",
    });
  });

  it("writes the bundled orchestrator defaults onto an existing fresh-install main agent", () => {
    const baseConfig: MaumauConfig = {
      agents: {
        list: [{ id: "main", default: true, name: "Main" }],
      },
    };

    const result = applyLocalSetupWorkspaceConfig(baseConfig, "/tmp/workspace", {
      freshInstall: true,
    });

    expect(result.agents?.defaults).toMatchObject({
      workspace: "/tmp/workspace",
      executionStyle: "orchestrator",
      executionWorkerAgentId: "main-worker",
    });
    expect(result.agents?.list?.find((agent) => agent.id === "main")).toEqual(
      expect.objectContaining({
        id: "main",
        default: true,
        name: "Main",
        executionStyle: "orchestrator",
        executionWorkerAgentId: "main-worker",
        subagents: {
          allowAgents: ["main-worker"],
        },
        tools: expect.objectContaining({
          profile: "messaging",
          alsoAllow: expect.arrayContaining(["sessions_spawn", "sessions_yield", "teams_run"]),
        }),
      }),
    );
    expect(result.teams?.list?.map((team) => team.id)).toEqual(
      expect.arrayContaining(["main", "vibe-coder", "life-improvement"]),
    );
  });

  it("detects serve as the fresh-install default when Tailscale is running", async () => {
    readTailscaleStatusJson.mockResolvedValue({
      BackendState: "Running",
      Self: {
        DNSName: "samiadjis-mac-mini.tailnet.ts.net.",
      },
    });

    await expect(detectFreshInstallTailscaleMode({})).resolves.toBe("serve");
  });

  it("keeps off as the fresh-install default when Tailscale is unavailable", async () => {
    readTailscaleStatusJson.mockRejectedValue(new Error("tailscale unavailable"));

    await expect(detectFreshInstallTailscaleMode({})).resolves.toBe("off");
  });
});
