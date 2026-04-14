import { describe, expect, it } from "vitest";
import type { MaumauConfig } from "../config/config.js";
import { applyOnboardingTailscaleGatewayAuth } from "./onboard-gateway-tailscale-auth.js";

describe("applyOnboardingTailscaleGatewayAuth", () => {
  it("enables Tailscale auth for private serve onboarding", () => {
    const result = applyOnboardingTailscaleGatewayAuth({
      cfg: {
        gateway: {
          auth: {
            mode: "token",
            token: "secret",
          },
        },
      } as MaumauConfig,
      tailscaleMode: "serve",
      authMode: "token",
    });

    expect(result.gateway?.auth?.allowTailscale).toBe(true);
  });

  it("disables Tailscale auth when serve requires password", () => {
    const result = applyOnboardingTailscaleGatewayAuth({
      cfg: {
        gateway: {
          auth: {
            mode: "password",
            password: "secret",
            allowTailscale: true,
          },
        },
      } as MaumauConfig,
      tailscaleMode: "serve",
      authMode: "password",
    });

    expect(result.gateway?.auth?.allowTailscale).toBe(false);
  });

  it("clears Tailscale auth when onboarding turns Tailscale off", () => {
    const result = applyOnboardingTailscaleGatewayAuth({
      cfg: {
        gateway: {
          auth: {
            mode: "token",
            token: "secret",
            allowTailscale: true,
          },
        },
      } as MaumauConfig,
      tailscaleMode: "off",
      authMode: "token",
    });

    expect(result.gateway?.auth?.allowTailscale).toBe(false);
  });
});
