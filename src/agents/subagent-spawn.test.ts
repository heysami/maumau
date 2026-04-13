import os from "node:os";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultSessionHelperMocks,
  identityDeliveryContext,
} from "./subagent-spawn.test-helpers.js";
import { installAcceptedSubagentGatewayMock } from "./test-helpers/subagent-gateway.js";

const hoisted = vi.hoisted(() => ({
  callGatewayMock: vi.fn(),
  loadSessionStoreMock: vi.fn(),
  updateSessionStoreMock: vi.fn(),
  pruneLegacyStoreKeysMock: vi.fn(),
  ensureRuntimePluginsLoadedMock: vi.fn(),
  ensureContextEnginesInitializedMock: vi.fn(),
  resolveContextEngineMock: vi.fn(),
  rollbackMock: vi.fn(async () => {}),
  registerSubagentRunMock: vi.fn(),
  emitSessionLifecycleEventMock: vi.fn(),
  configOverride: {} as Record<string, unknown>,
}));

vi.mock("../gateway/call.js", () => ({
  callGateway: (opts: unknown) => hoisted.callGatewayMock(opts),
}));

vi.mock("../config/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/config.js")>();
  return {
    ...actual,
    loadConfig: () => hoisted.configOverride,
  };
});

vi.mock("../config/sessions.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/sessions.js")>();
  return {
    ...actual,
    loadSessionStore: (...args: unknown[]) => hoisted.loadSessionStoreMock(...args),
    updateSessionStore: (...args: unknown[]) => hoisted.updateSessionStoreMock(...args),
  };
});

vi.mock("../gateway/session-utils.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../gateway/session-utils.js")>();
  return {
    ...actual,
    resolveGatewaySessionStoreTarget: (params: { key: string }) => ({
      agentId: "main",
      storePath: "/tmp/subagent-spawn-session-store.json",
      canonicalKey: params.key,
      storeKeys: [params.key],
    }),
    pruneLegacyStoreKeys: (...args: unknown[]) => hoisted.pruneLegacyStoreKeysMock(...args),
  };
});

vi.mock("./subagent-registry.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./subagent-registry.js")>();
  return {
    ...actual,
    countActiveRunsForSession: () => 0,
    registerSubagentRun: (args: unknown) => hoisted.registerSubagentRunMock(args),
  };
});

vi.mock("./runtime-plugins.js", () => ({
  ensureRuntimePluginsLoaded: (...args: unknown[]) =>
    hoisted.ensureRuntimePluginsLoadedMock(...args),
}));

vi.mock("../context-engine/init.js", () => ({
  ensureContextEnginesInitialized: (...args: unknown[]) =>
    hoisted.ensureContextEnginesInitializedMock(...args),
}));

vi.mock("../context-engine/registry.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../context-engine/registry.js")>();
  return {
    ...actual,
    resolveContextEngine: (...args: unknown[]) => hoisted.resolveContextEngineMock(...args),
  };
});

vi.mock("../sessions/session-lifecycle-events.js", () => ({
  emitSessionLifecycleEvent: (args: unknown) => hoisted.emitSessionLifecycleEventMock(args),
}));

vi.mock("./subagent-announce.js", () => ({
  buildSubagentSystemPrompt: () => "system-prompt",
}));

vi.mock("./subagent-depth.js", () => ({
  getSubagentDepthFromSessionStore: () => 0,
}));

vi.mock("./model-selection.js", () => ({
  resolveSubagentSpawnModelSelection: () => "openai-codex/gpt-5.4",
}));

vi.mock("./sandbox/runtime-status.js", () => ({
  resolveSandboxRuntimeStatus: () => ({ sandboxed: false }),
}));

vi.mock("../plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: () => ({ hasHooks: () => false }),
}));

vi.mock("../utils/delivery-context.js", () => ({
  normalizeDeliveryContext: identityDeliveryContext,
}));

vi.mock("./tools/sessions-helpers.js", () => createDefaultSessionHelperMocks());

vi.mock("./agent-scope.js", () => ({
  resolveAgentConfig: () => undefined,
}));

function createConfigOverride(overrides?: Record<string, unknown>) {
  return {
    session: {
      mainKey: "main",
      scope: "per-sender",
    },
    agents: {
      defaults: {
        workspace: os.tmpdir(),
      },
      list: [
        {
          id: "main",
          workspace: "/tmp/workspace-main",
        },
      ],
    },
    ...overrides,
  };
}

describe("spawnSubagentDirect seam flow", () => {
  beforeEach(() => {
    vi.resetModules();
    hoisted.callGatewayMock.mockReset();
    hoisted.loadSessionStoreMock.mockReset();
    hoisted.updateSessionStoreMock.mockReset();
    hoisted.pruneLegacyStoreKeysMock.mockReset();
    hoisted.ensureRuntimePluginsLoadedMock.mockReset();
    hoisted.ensureContextEnginesInitializedMock.mockReset();
    hoisted.resolveContextEngineMock.mockReset();
    hoisted.rollbackMock.mockReset();
    hoisted.registerSubagentRunMock.mockReset();
    hoisted.emitSessionLifecycleEventMock.mockReset();
    hoisted.configOverride = createConfigOverride();
    installAcceptedSubagentGatewayMock(hoisted.callGatewayMock);
    hoisted.loadSessionStoreMock.mockReturnValue({});
    hoisted.resolveContextEngineMock.mockResolvedValue({});

    hoisted.updateSessionStoreMock.mockImplementation(
      async (
        _storePath: string,
        mutator: (store: Record<string, Record<string, unknown>>) => unknown,
      ) => {
        const store: Record<string, Record<string, unknown>> = {};
        await mutator(store);
        return store;
      },
    );
  });

  it("accepts a spawned run across session patching, runtime-model persistence, registry registration, and lifecycle emission", async () => {
    const { spawnSubagentDirect } = await import("./subagent-spawn.js");
    const operations: string[] = [];
    let persistedStore: Record<string, Record<string, unknown>> | undefined;
    let initialPatchRequest: { params?: Record<string, unknown> } | undefined;

    hoisted.callGatewayMock.mockImplementation(
      async (request: { method?: string; params?: Record<string, unknown> }) => {
        operations.push(`gateway:${request.method ?? "unknown"}`);
        if (request.method === "sessions.patch" && !initialPatchRequest) {
          initialPatchRequest = request;
        }
        if (request.method === "agent") {
          return { runId: "run-1" };
        }
        if (request.method?.startsWith("sessions.")) {
          return { ok: true };
        }
        return {};
      },
    );
    hoisted.updateSessionStoreMock.mockImplementation(
      async (
        _storePath: string,
        mutator: (store: Record<string, Record<string, unknown>>) => unknown,
      ) => {
        operations.push("store:update");
        const store: Record<string, Record<string, unknown>> = {};
        await mutator(store);
        persistedStore = store;
        return store;
      },
    );

    const result = await spawnSubagentDirect(
      {
        task: "inspect the spawn seam",
        model: "openai-codex/gpt-5.4",
      },
      {
        agentSessionKey: "agent:main:main",
        agentChannel: "discord",
        agentAccountId: "acct-1",
        agentTo: "user-1",
        senderIsOwner: true,
        requesterTailscaleLogin: "owner@example.com",
        workspaceDir: "/tmp/requester-workspace",
      },
    );

    expect(result).toMatchObject({
      status: "accepted",
      runId: "run-1",
      mode: "run",
      modelApplied: true,
    });
    expect(result.childSessionKey).toMatch(/^agent:main:subagent:/);

    const childSessionKey = result.childSessionKey as string;
    expect(hoisted.pruneLegacyStoreKeysMock).toHaveBeenCalledTimes(2);
    expect(hoisted.updateSessionStoreMock).toHaveBeenCalledTimes(1);
    expect(hoisted.registerSubagentRunMock).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        childSessionKey,
        requesterSessionKey: "agent:main:main",
        requesterDisplayKey: "agent:main:main",
        requesterOrigin: {
          channel: "discord",
          accountId: "acct-1",
          to: "user-1",
          threadId: undefined,
        },
        task: "inspect the spawn seam",
        cleanup: "keep",
        model: "openai-codex/gpt-5.4",
        workspaceDir: "/tmp/requester-workspace",
        expectsCompletionMessage: true,
        spawnMode: "run",
      }),
    );
    expect(hoisted.emitSessionLifecycleEventMock).toHaveBeenCalledWith({
      sessionKey: childSessionKey,
      reason: "create",
      parentSessionKey: "agent:main:main",
      label: undefined,
    });

    const [persistedKey, persistedEntry] = Object.entries(persistedStore ?? {})[0] ?? [];
    expect(persistedKey).toBe(childSessionKey);
    expect(persistedEntry).toMatchObject({
      modelProvider: "openai-codex",
      model: "gpt-5.4",
    });
    expect(operations.indexOf("gateway:sessions.patch")).toBeGreaterThan(-1);
    expect(initialPatchRequest?.params).toMatchObject({
      requesterSenderIsOwner: true,
      requesterTailscaleLogin: "owner@example.com",
    });
    expect(operations.indexOf("store:update")).toBeGreaterThan(
      operations.indexOf("gateway:sessions.patch"),
    );
    expect(operations.indexOf("gateway:agent")).toBeGreaterThan(operations.indexOf("store:update"));
  });

  it("inherits the requester memory principal and prepares context continuity before starting the child run", async () => {
    const { spawnSubagentDirect } = await import("./subagent-spawn.js");
    const operations: string[] = [];
    const persistedStores: Array<Record<string, Record<string, unknown>>> = [];
    const prepareSubagentSpawnMock = vi.fn(async () => {
      operations.push("context:prepare");
      return { rollback: hoisted.rollbackMock };
    });

    hoisted.loadSessionStoreMock.mockReturnValue({
      "agent:main:main": {
        memoryPrincipal: {
          resolvedUserId: "user-1",
          channelId: "discord",
          requesterSenderId: "sender-1",
          effectiveLanguage: "en",
          capturedAt: 123,
        },
      },
    });
    hoisted.resolveContextEngineMock.mockResolvedValue({
      prepareSubagentSpawn: prepareSubagentSpawnMock,
    });
    hoisted.callGatewayMock.mockImplementation(
      async (request: { method?: string; params?: Record<string, unknown> }) => {
        operations.push(`gateway:${request.method ?? "unknown"}`);
        if (request.method === "agent") {
          return { runId: "run-1" };
        }
        if (request.method?.startsWith("sessions.")) {
          return { ok: true };
        }
        return {};
      },
    );
    hoisted.updateSessionStoreMock.mockImplementation(
      async (
        _storePath: string,
        mutator: (store: Record<string, Record<string, unknown>>) => unknown,
      ) => {
        const store: Record<string, Record<string, unknown>> = {};
        await mutator(store);
        persistedStores.push(store);
        return store;
      },
    );

    const result = await spawnSubagentDirect(
      {
        task: "carry continuity forward",
      },
      {
        agentSessionKey: "agent:main:main",
        agentChannel: "discord",
        workspaceDir: "/tmp/requester-workspace",
      },
    );

    expect(result.status).toBe("accepted");
    expect(hoisted.loadSessionStoreMock).toHaveBeenCalled();
    expect(hoisted.ensureRuntimePluginsLoadedMock).toHaveBeenCalledWith({
      config: hoisted.configOverride,
      workspaceDir: "/tmp/requester-workspace",
      allowGatewaySubagentBinding: true,
    });
    expect(hoisted.ensureContextEnginesInitializedMock).toHaveBeenCalledTimes(1);
    expect(prepareSubagentSpawnMock).toHaveBeenCalledWith({
      parentSessionKey: "agent:main:main",
      childSessionKey: result.childSessionKey,
      ttlMs: undefined,
    });
    expect(operations.indexOf("context:prepare")).toBeGreaterThan(
      operations.indexOf("gateway:sessions.patch"),
    );
    expect(operations.indexOf("gateway:agent")).toBeGreaterThan(
      operations.indexOf("context:prepare"),
    );

    const principalStore = persistedStores.find((store) => {
      const entry = result.childSessionKey ? store[result.childSessionKey] : undefined;
      return Boolean(entry && "memoryPrincipal" in entry);
    });
    expect(principalStore?.[result.childSessionKey as string]).toMatchObject({
      memoryPrincipal: {
        resolvedUserId: "user-1",
        requesterSenderId: "sender-1",
        effectiveLanguage: "en",
      },
    });
  });

  it("rolls back prepared context continuity when the child run fails to start", async () => {
    const { spawnSubagentDirect } = await import("./subagent-spawn.js");

    hoisted.resolveContextEngineMock.mockResolvedValue({
      prepareSubagentSpawn: vi.fn(async () => ({ rollback: hoisted.rollbackMock })),
    });
    hoisted.callGatewayMock.mockImplementation(async (request: { method?: string }) => {
      if (request.method === "agent") {
        throw new Error("agent failed");
      }
      if (request.method?.startsWith("sessions.")) {
        return { ok: true };
      }
      return {};
    });

    const result = await spawnSubagentDirect(
      {
        task: "this child will fail",
      },
      {
        agentSessionKey: "agent:main:main",
        workspaceDir: "/tmp/requester-workspace",
      },
    );

    expect(result).toMatchObject({
      status: "error",
      error: "agent failed",
    });
    expect(hoisted.rollbackMock).toHaveBeenCalledTimes(1);
    expect(hoisted.registerSubagentRunMock).not.toHaveBeenCalled();
  });
});
