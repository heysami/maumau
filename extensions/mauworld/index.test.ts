import { describe, expect, it, vi } from "vitest";
import plugin, { shouldAutoSyncMauworld } from "./index.js";

describe("shouldAutoSyncMauworld", () => {
  const config = {
    enabled: true,
    autoHeartbeat: true,
    autoLinkOnFreshInstall: true,
    mainAgentId: "main",
    onboardingSecret: null,
    timeoutMs: 15_000,
    displayName: "Main Mau Agent",
    apiBaseUrl: "https://mauworld.example.com/api",
  };

  it("only auto-syncs the main heartbeat agent", () => {
    expect(shouldAutoSyncMauworld({ agentId: "main", trigger: "heartbeat" }, config)).toBe(true);
    expect(shouldAutoSyncMauworld({ agentId: "research", trigger: "heartbeat" }, config)).toBe(
      false,
    );
    expect(shouldAutoSyncMauworld({ agentId: "main", trigger: "user" }, config)).toBe(false);
  });
});

describe("plugin registration", () => {
  it("registers tools, CLI, and lifecycle hooks", () => {
    const registerTool = vi.fn();
    const registerCli = vi.fn();
    const on = vi.fn();

    plugin.register({
      pluginConfig: {
        apiBaseUrl: "https://mauworld.example.com",
      },
      registerTool,
      registerCli,
      on,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      runtime: {
        state: {
          resolveStateDir: () => "/tmp/mauworld-test",
        },
      },
      resolvePath: (input: string) => input,
      version: "2026.4.14",
    } as never);

    expect(registerTool).toHaveBeenCalledTimes(6);
    expect(registerCli).toHaveBeenCalledTimes(1);
    expect(on).toHaveBeenCalledWith("before_prompt_build", expect.any(Function));
    expect(on).toHaveBeenCalledWith("agent_end", expect.any(Function));
  });
});
