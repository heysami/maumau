import type { MaumauConfig } from "../config/config.js";

export function applyOnboardingTailscaleGatewayAuth(params: {
  cfg: MaumauConfig;
  tailscaleMode: "off" | "serve" | "funnel";
  authMode: "token" | "password";
}): MaumauConfig {
  const nextAllowTailscale = params.tailscaleMode === "serve" && params.authMode !== "password";
  return {
    ...params.cfg,
    gateway: {
      ...params.cfg.gateway,
      auth: {
        ...params.cfg.gateway?.auth,
        allowTailscale: nextAllowTailscale,
      },
    },
  };
}
