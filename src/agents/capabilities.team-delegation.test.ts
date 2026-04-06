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

describe("listSessionCapabilities team delegation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("surfaces image_generate through a team specialist when the manager can spawn sessions", async () => {
    const { resolveEffectiveToolPolicy } = await import("./pi-tools.policy.js");
    const { isToolAllowedByPolicies } = await import("./tool-policy-match.js");
    const { mergeAlsoAllowPolicy, resolveToolProfilePolicy } = await import("./tool-policy.js");
    const { resolveSessionTeamContext, resolveTeamAgentAccess } =
      await import("../teams/runtime.js");
    const { formatCapabilityPromptSummaryLine, listSessionCapabilities } =
      await import("./capabilities.js");
    const config = {
      agents: {
        list: [
          {
            id: "design-studio-manager",
            tools: {
              allow: ["capabilities_list", "image", "read", "sessions_spawn", "sessions_yield"],
            },
          },
          {
            id: "design-studio-image-visual-designer",
            tools: {
              allow: [
                "capabilities_list",
                "image",
                "image_generate",
                "read",
                "sessions_spawn",
                "sessions_yield",
              ],
            },
          },
        ],
      },
      teams: {
        list: [
          {
            id: "design-studio",
            managerAgentId: "design-studio-manager",
            implicitForManagerSessions: true,
            members: [
              {
                agentId: "design-studio-image-visual-designer",
                role: "image visual designer",
              },
            ],
          },
        ],
      },
    };

    expect(
      resolveSessionTeamContext({
        cfg: config,
        sessionKey: "agent:design-studio-manager:telegram:direct:123",
      }),
    ).toMatchObject({
      teamId: "design-studio",
      sessionAgentId: "design-studio-manager",
    });
    expect(
      resolveTeamAgentAccess({
        cfg: config,
        sourceTeamId: "design-studio",
        targetAgentId: "design-studio-image-visual-designer",
      }),
    ).toMatchObject({
      allowed: true,
    });
    const policy = resolveEffectiveToolPolicy({
      config,
      sessionKey: "agent:design-studio-manager:telegram:direct:123",
      agentId: "design-studio-image-visual-designer",
    });
    const profilePolicy = mergeAlsoAllowPolicy(
      resolveToolProfilePolicy(policy.profile),
      policy.profileAlsoAllow,
    );
    const providerProfilePolicy = mergeAlsoAllowPolicy(
      resolveToolProfilePolicy(policy.providerProfile),
      policy.providerProfileAlsoAllow,
    );
    expect(
      isToolAllowedByPolicies("image_generate", [
        profilePolicy,
        providerProfilePolicy,
        policy.globalPolicy,
        policy.globalProviderPolicy,
        policy.agentPolicy,
        policy.agentProviderPolicy,
      ]),
    ).toBe(true);

    const capabilities = await listSessionCapabilities({
      config,
      agentSessionKey: "agent:design-studio-manager:telegram:direct:123",
      senderIsOwner: true,
      messageChannel: "telegram",
    });

    const imageGenerate = capabilities.find((row) => row.id === "image_generate");
    expect(imageGenerate).toMatchObject({
      kind: "tool",
      exposedToSession: false,
      ready: true,
      delegatedAgentId: "design-studio-image-visual-designer",
    });
    expect(imageGenerate?.blockedReason).toBeUndefined();
    expect(imageGenerate?.suggestedFix).toContain(
      'sessions_spawn with agentId="design-studio-image-visual-designer"',
    );
    expect(
      formatCapabilityPromptSummaryLine({
        id: "image_generate",
        kind: "tool",
        declared: true,
        exposedToSession: false,
        installed: true,
        ready: true,
        delegatedAgentId: "design-studio-image-visual-designer",
      }),
    ).toContain('sessions_spawn with agentId="design-studio-image-visual-designer"');
  });
});
