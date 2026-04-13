import os from "node:os";
import { vi } from "vitest";

type MockFn = (...args: unknown[]) => unknown;
type MockImplementationTarget = {
  mockImplementation: (implementation: (opts: { method?: string }) => Promise<unknown>) => unknown;
};

export function createSubagentSpawnTestConfig(workspaceDir = os.tmpdir()) {
  return {
    session: {
      mainKey: "main",
      scope: "per-sender",
    },
    tools: {
      sessions_spawn: {
        attachments: {
          enabled: true,
          maxFiles: 50,
          maxFileBytes: 1 * 1024 * 1024,
          maxTotalBytes: 5 * 1024 * 1024,
        },
      },
    },
    agents: {
      defaults: {
        workspace: workspaceDir,
      },
    },
  };
}

export function setupAcceptedSubagentGatewayMock(callGatewayMock: MockImplementationTarget) {
  callGatewayMock.mockImplementation(async (opts: { method?: string }) => {
    if (opts.method === "sessions.patch") {
      return { ok: true };
    }
    if (opts.method === "sessions.delete") {
      return { ok: true };
    }
    if (opts.method === "agent") {
      return { runId: "run-1", status: "accepted", acceptedAt: 1000 };
    }
    return {};
  });
}

export function identityDeliveryContext(value: unknown) {
  return value;
}

export function createDefaultSessionHelperMocks() {
  return {
    resolveMainSessionAlias: () => ({ mainKey: "main", alias: "main" }),
    resolveInternalSessionKey: ({ key }: { key?: string }) => key ?? "agent:main:main",
    resolveDisplaySessionKey: ({ key }: { key?: string }) => key ?? "agent:main:main",
  };
}

export async function loadSubagentSpawnModuleForTest(params: {
  callGatewayMock: MockFn;
  loadConfig?: () => Record<string, unknown>;
  loadSessionStoreMock?: MockFn;
  updateSessionStoreMock?: MockFn;
  pruneLegacyStoreKeysMock?: MockFn;
  ensureRuntimePluginsLoadedMock?: MockFn;
  ensureContextEnginesInitializedMock?: MockFn;
  resolveContextEngineMock?: MockFn;
  workspaceDir?: string;
  sessionStorePath?: string;
}) {
  vi.resetModules();

  vi.doMock("../gateway/call.js", () => ({
    callGateway: (opts: unknown) => params.callGatewayMock(opts),
  }));

  vi.doMock("../config/config.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../config/config.js")>();
    return {
      ...actual,
      loadConfig: () =>
        params.loadConfig?.() ?? createSubagentSpawnTestConfig(params.workspaceDir ?? os.tmpdir()),
    };
  });

  if (params.updateSessionStoreMock || params.loadSessionStoreMock) {
    vi.doMock("../config/sessions.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../config/sessions.js")>();
      return {
        ...actual,
        ...(params.loadSessionStoreMock
          ? {
              loadSessionStore: (...args: unknown[]) => params.loadSessionStoreMock?.(...args),
            }
          : {}),
        updateSessionStore: (...args: unknown[]) => params.updateSessionStoreMock?.(...args),
      };
    });
  }

  if (params.pruneLegacyStoreKeysMock) {
    vi.doMock("../gateway/session-utils.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../gateway/session-utils.js")>();
      return {
        ...actual,
        resolveGatewaySessionStoreTarget: (targetParams: { key: string }) => ({
          agentId: "main",
          storePath: params.sessionStorePath ?? "/tmp/subagent-spawn-model-session.json",
          canonicalKey: targetParams.key,
          storeKeys: [targetParams.key],
        }),
        pruneLegacyStoreKeys: (...args: unknown[]) => params.pruneLegacyStoreKeysMock?.(...args),
      };
    });
  }

  vi.doMock("./subagent-registry.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./subagent-registry.js")>();
    return {
      ...actual,
      countActiveRunsForSession: () => 0,
      registerSubagentRun: () => {},
    };
  });

  vi.doMock("./subagent-announce.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./subagent-announce.js")>();
    return {
      ...actual,
      buildSubagentSystemPrompt: () => "system-prompt",
    };
  });

  vi.doMock("./agent-scope.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./agent-scope.js")>();
    return {
      ...actual,
      resolveAgentWorkspaceDir: () => params.workspaceDir ?? os.tmpdir(),
    };
  });

  vi.doMock("./subagent-depth.js", () => ({
    getSubagentDepthFromSessionStore: () => 0,
  }));

  vi.doMock("../plugins/hook-runner-global.js", () => ({
    getGlobalHookRunner: () => ({ hasHooks: () => false }),
  }));

  vi.doMock("./runtime-plugins.js", () => ({
    ensureRuntimePluginsLoaded: (...args: unknown[]) =>
      params.ensureRuntimePluginsLoadedMock?.(...args),
  }));

  vi.doMock("../context-engine/init.js", () => ({
    ensureContextEnginesInitialized: (...args: unknown[]) =>
      params.ensureContextEnginesInitializedMock?.(...args),
  }));

  vi.doMock("../context-engine/registry.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../context-engine/registry.js")>();
    return {
      ...actual,
      resolveContextEngine: (...args: unknown[]) =>
        params.resolveContextEngineMock?.(...args) ?? Promise.resolve({}),
    };
  });

  vi.doMock("../utils/delivery-context.js", () => ({
    normalizeDeliveryContext: identityDeliveryContext,
  }));

  vi.doMock("./tools/sessions-helpers.js", () => createDefaultSessionHelperMocks());

  const { resetSubagentRegistryForTests } = await import("./subagent-registry.js");
  return {
    ...(await import("./subagent-spawn.js")),
    resetSubagentRegistryForTests,
  };
}
