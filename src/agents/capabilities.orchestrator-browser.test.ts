import { beforeEach, describe, expect, it, vi } from "vitest";

const childProcessMocks = vi.hoisted(() => ({
  spawnSync: vi.fn(() => ({
    status: 0,
    stdout: "true",
    stderr: "",
  })),
}));
vi.mock("node:child_process", () => childProcessMocks);

const browserClientMocks = vi.hoisted(() => ({
  browserStatus: vi.fn(async () => ({
    chosenBrowser: "Chromium",
    detectedExecutablePath: "/Applications/Chromium.app",
    running: true,
    cdpReady: true,
    cdpHttp: true,
  })),
}));
vi.mock("../browser/client.js", () => browserClientMocks);

const chromeMcpMocks = vi.hoisted(() => ({
  ensureChromeMcpAvailable: vi.fn(async () => {}),
  listChromeMcpTabs: vi.fn(async () => []),
}));
vi.mock("../browser/chrome-mcp.js", () => chromeMcpMocks);

const browserConfigMocks = vi.hoisted(() => ({
  resolveBrowserConfig: vi.fn((browser: { profiles?: Record<string, unknown> } | undefined) => ({
    enabled: true,
    defaultProfile: "maumau",
    profiles: browser?.profiles ?? {},
  })),
  resolveProfile: vi.fn(
    (
      resolved: { profiles?: Record<string, Record<string, unknown>> },
      name: string,
    ): Record<string, unknown> | null => {
      const profile = resolved.profiles?.[name];
      return profile ? { ...profile, name } : null;
    },
  ),
}));
vi.mock("../browser/config.js", () => browserConfigMocks);

const onboardingMocks = vi.hoisted(() => ({
  findClawdCursorBinaryOnHost: vi.fn(async () => "/usr/local/bin/clawd-cursor"),
  hasClawdCursorManagedConfig: vi.fn(async () => false),
  readClawdCursorConsentAccepted: vi.fn(async () => false),
}));
vi.mock("../commands/onboard-bundled-tools.js", () => onboardingMocks);

const previewMocks = vi.hoisted(() => ({
  resolvePrivatePreviewAccess: vi.fn(async () => ({
    ready: false,
    blockedReason: "not_configured",
    suggestedFix: "private preview unavailable",
  })),
  resolvePublicShareAccess: vi.fn(async () => ({
    ready: false,
    blockedReason: "not_configured",
    suggestedFix: "public share unavailable",
  })),
}));
vi.mock("../gateway/previews.js", () => previewMocks);

const tailscaleMocks = vi.hoisted(() => ({
  readTailscaleStatusJson: vi.fn(async () => ({})),
}));
vi.mock("../infra/tailscale.js", () => tailscaleMocks);

const teamContractsMocks = vi.hoisted(() => ({
  evaluateTeamWorkflowContractReadiness: vi.fn(() => ({
    contractReady: true,
    blockingReasons: [],
  })),
}));
vi.mock("../teams/contracts.js", () => teamContractsMocks);

const teamModelMocks = vi.hoisted(() => ({
  findTeamWorkflow: vi.fn(),
  listAccessibleTeams: vi.fn(() => []),
  listConfiguredTeams: vi.fn(() => []),
  listLinkedAgentIds: vi.fn(() => []),
  listTeamMemberAgentIds: vi.fn(
    (team: { managerAgentId?: string; members?: Array<{ agentId: string }> }) => [
      ...(team.managerAgentId ? [team.managerAgentId] : []),
      ...(team.members ?? []).map((member) => member.agentId),
    ],
  ),
  resolveDefaultTeamWorkflowId: vi.fn(),
}));
vi.mock("../teams/model.js", () => teamModelMocks);

const teamRuntimeMocks = vi.hoisted(() => ({
  resolveSessionTeamContext: vi.fn(() => undefined),
  resolveTeamAgentAccess: vi.fn(() => ({
    allowed: false,
    error: "not linked",
  })),
}));
vi.mock("../teams/runtime.js", () => teamRuntimeMocks);

describe("listSessionCapabilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("surfaces browser access through the configured execution worker for orchestrator sessions", async () => {
    const { formatCapabilityPromptSummaryLine, listSessionCapabilities } =
      await import("./capabilities.js");

    const capabilities = await listSessionCapabilities({
      config: {
        agents: {
          defaults: {
            executionStyle: "orchestrator",
            executionWorkerAgentId: "main-worker",
          },
          list: [
            {
              id: "main",
              default: true,
              executionStyle: "orchestrator",
              executionWorkerAgentId: "main-worker",
              subagents: {
                allowAgents: ["main-worker"],
              },
              tools: {
                profile: "messaging",
                alsoAllow: ["capabilities_list", "sessions_spawn"],
              },
            },
            {
              id: "main-worker",
              tools: {
                profile: "coding",
                alsoAllow: ["browser"],
              },
            },
          ],
        },
        browser: {
          enabled: true,
          defaultProfile: "maumau",
          profiles: {
            user: {
              driver: "existing-session",
              userDataDir: "/tmp/maumau-user-browser",
              color: "#1f8b4c",
            },
            maumau: {
              driver: "maumau",
              cdpPort: 18792,
              cdpUrl: "http://127.0.0.1:18792",
              color: "#4455aa",
            },
          },
        },
      },
      agentSessionKey: "agent:main:telegram:direct:123",
      senderIsOwner: true,
      messageChannel: "telegram",
    });

    const browserTool = capabilities.find((row) => row.id === "browser");
    expect(browserTool).toMatchObject({
      kind: "tool",
      exposedToSession: false,
      ready: true,
      delegatedAgentId: "main-worker",
    });
    expect(browserTool?.suggestedFix).toContain('sessions_spawn with agentId="main-worker"');

    const browserExisting = capabilities.find((row) => row.id === "browser-existing-session");
    expect(browserExisting).toMatchObject({
      kind: "browser",
      exposedToSession: true,
      delegatedAgentId: "main-worker",
      driver: "existing-session",
    });
    expect(browserExisting?.blockedReason).not.toBe("not_in_profile");

    expect(
      formatCapabilityPromptSummaryLine({
        id: "browser-existing-session",
        kind: "browser",
        declared: true,
        exposedToSession: true,
        installed: true,
        ready: true,
        delegatedAgentId: "main-worker",
      }),
    ).toContain("sessions_spawn");
    expect(
      formatCapabilityPromptSummaryLine({
        id: "browser-existing-session",
        kind: "browser",
        declared: true,
        exposedToSession: true,
        installed: true,
        ready: true,
        delegatedAgentId: "main-worker",
      }),
    ).toContain("main-worker");
  });
});
