import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEnv } from "../../../runtime.js";

const mocks = vi.hoisted(() => ({
  findTailscaleBinary: vi.fn(),
  getTailnetHostname: vi.fn(),
}));

vi.mock("../../../infra/tailscale.js", () => ({
  findTailscaleBinary: mocks.findTailscaleBinary,
  getTailnetHostname: mocks.getTailnetHostname,
}));

import { applyNonInteractiveGatewayConfig } from "./gateway-config.js";

function createRuntime(): RuntimeEnv {
  return {
    log: () => {},
    error: (message?: unknown) => {
      throw new Error(String(message ?? "runtime error"));
    },
    exit: (code: number) => {
      throw new Error(`exit:${code}`);
    },
  };
}

describe("applyNonInteractiveGatewayConfig", () => {
  beforeEach(() => {
    mocks.findTailscaleBinary.mockReset();
    mocks.getTailnetHostname.mockReset();
    mocks.findTailscaleBinary.mockResolvedValue(undefined);
    mocks.getTailnetHostname.mockResolvedValue("maumau.tailnet.ts.net");
  });

  it("defaults fresh local setup to Tailscale Serve when detected", async () => {
    const result = await applyNonInteractiveGatewayConfig({
      nextConfig: {},
      opts: {},
      runtime: createRuntime(),
      defaultPort: 18789,
      detectedTailscaleMode: "serve",
    });

    expect(result).toMatchObject({
      tailscaleMode: "serve",
      bind: "loopback",
      authMode: "token",
    });
    expect(result?.nextConfig.gateway?.tailscale?.mode).toBe("serve");
    expect(result?.nextConfig.gateway?.auth?.allowTailscale).toBe(true);
    expect(result?.nextConfig.gateway?.controlUi?.allowedOrigins).toContain(
      "https://maumau.tailnet.ts.net",
    );
  });

  it("keeps explicit tailscale flags over the detected default", async () => {
    const result = await applyNonInteractiveGatewayConfig({
      nextConfig: {},
      opts: {
        tailscale: "off",
      },
      runtime: createRuntime(),
      defaultPort: 18789,
      detectedTailscaleMode: "serve",
    });

    expect(result?.tailscaleMode).toBe("off");
    expect(result?.nextConfig.gateway?.tailscale?.mode).toBe("off");
    expect(result?.nextConfig.gateway?.auth?.allowTailscale).toBe(false);
  });

  it("seeds non-loopback Control UI origins during non-interactive setup", async () => {
    const result = await applyNonInteractiveGatewayConfig({
      nextConfig: {},
      opts: {
        gatewayBind: "lan",
        tailscale: "off",
      },
      runtime: createRuntime(),
      defaultPort: 18789,
    });

    expect(result?.nextConfig.gateway?.controlUi?.allowedOrigins).toEqual([
      "http://localhost:18789",
      "http://127.0.0.1:18789",
    ]);
  });
});
