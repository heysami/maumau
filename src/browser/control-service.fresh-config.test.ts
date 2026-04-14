import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedBrowserConfig } from "./config.js";

const resolvedConfig: ResolvedBrowserConfig = {
  enabled: true,
  evaluateEnabled: false,
  controlPort: 18791,
  cdpPortRangeStart: 18800,
  cdpPortRangeEnd: 18810,
  cdpProtocol: "http",
  cdpHost: "127.0.0.1",
  cdpIsLoopback: true,
  remoteCdpTimeoutMs: 1500,
  remoteCdpHandshakeTimeoutMs: 3000,
  color: "#FF4500",
  headless: true,
  noSandbox: false,
  attachOnly: false,
  defaultProfile: "maumau",
  profiles: {
    maumau: {
      cdpPort: 18800,
      color: "#FF4500",
    },
  },
  ssrfPolicy: { allowPrivateNetwork: true },
  extraArgs: [],
};

const mocks = vi.hoisted(() => ({
  getRuntimeConfigSnapshot: vi.fn(() => null),
  loadConfigFresh: vi.fn(() => ({
    browser: { enabled: true },
    gateway: { port: 18789 },
  })),
  createConfigIO: vi.fn(),
  resolveBrowserConfig: vi.fn(() => resolvedConfig),
  ensureBrowserControlAuth: vi.fn(async () => ({ generatedToken: false })),
  createBrowserRuntimeState: vi.fn(
    async ({ port, resolved }: { port: number; resolved: ResolvedBrowserConfig }) => ({
      server: null,
      port,
      resolved,
      profiles: new Map(),
    }),
  ),
}));

vi.mock("../config/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/config.js")>();
  return {
    ...actual,
    createConfigIO: mocks.createConfigIO,
    getRuntimeConfigSnapshot: mocks.getRuntimeConfigSnapshot,
  };
});

vi.mock("./config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./config.js")>();
  return {
    ...actual,
    resolveBrowserConfig: mocks.resolveBrowserConfig,
  };
});

vi.mock("./control-auth.js", () => ({
  ensureBrowserControlAuth: mocks.ensureBrowserControlAuth,
}));

vi.mock("./runtime-lifecycle.js", () => ({
  createBrowserRuntimeState: mocks.createBrowserRuntimeState,
  stopBrowserRuntime: vi.fn(async () => {}),
}));

let startBrowserControlServiceFromConfig: typeof import("./control-service.js").startBrowserControlServiceFromConfig;

describe("browser control service startup config source", () => {
  beforeAll(async () => {
    vi.resetModules();
    ({ startBrowserControlServiceFromConfig } = await import("./control-service.js"));
  });

  beforeEach(() => {
    mocks.getRuntimeConfigSnapshot.mockReset().mockReturnValue(null);
    mocks.loadConfigFresh.mockReset().mockReturnValue({
      browser: { enabled: true },
      gateway: { port: 18789 },
    });
    mocks.createConfigIO.mockReset().mockReturnValue({
      loadConfig: mocks.loadConfigFresh,
    });
    mocks.resolveBrowserConfig.mockClear().mockReturnValue(resolvedConfig);
    mocks.ensureBrowserControlAuth.mockReset().mockResolvedValue({ generatedToken: false });
    mocks.createBrowserRuntimeState.mockClear().mockResolvedValue({
      server: null,
      port: resolvedConfig.controlPort,
      resolved: resolvedConfig,
      profiles: new Map(),
    });
  });

  it("reads a fresh config snapshot when startup is triggered on demand", async () => {
    const state = await startBrowserControlServiceFromConfig();

    expect(mocks.getRuntimeConfigSnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.createConfigIO).toHaveBeenCalledTimes(1);
    expect(mocks.loadConfigFresh).toHaveBeenCalledTimes(1);
    expect(mocks.resolveBrowserConfig).toHaveBeenCalledWith(
      { enabled: true },
      expect.objectContaining({
        browser: { enabled: true },
        gateway: { port: 18789 },
      }),
    );
    expect(mocks.createBrowserRuntimeState).toHaveBeenCalledTimes(1);
    expect(state?.port).toBe(18791);
  });
});
