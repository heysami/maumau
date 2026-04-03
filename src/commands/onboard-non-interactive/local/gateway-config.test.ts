import { describe, expect, it } from "vitest";
import type { RuntimeEnv } from "../../../runtime.js";
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
  it("defaults fresh local setup to Tailscale Serve when detected", () => {
    const result = applyNonInteractiveGatewayConfig({
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
  });

  it("keeps explicit tailscale flags over the detected default", () => {
    const result = applyNonInteractiveGatewayConfig({
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
});
