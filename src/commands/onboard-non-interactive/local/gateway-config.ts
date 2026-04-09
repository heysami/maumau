import type { MaumauConfig } from "../../../config/config.js";
import { ensureControlUiAllowedOriginsForNonLoopbackBind } from "../../../config/gateway-control-ui-origins.js";
import { isValidEnvSecretRefId } from "../../../config/types.secrets.js";
import { maybeAddTailnetOriginToControlUiAllowedOrigins } from "../../../gateway/gateway-config-prompts.shared.js";
import { findTailscaleBinary } from "../../../infra/tailscale.js";
import type { RuntimeEnv } from "../../../runtime.js";
import { resolveDefaultSecretProviderAlias } from "../../../secrets/ref-contract.js";
import { applyOnboardingTailscaleGatewayAuth } from "../../onboard-gateway-tailscale-auth.js";
import { normalizeGatewayTokenInput, randomToken } from "../../onboard-helpers.js";
import type { OnboardOptions } from "../../onboard-types.js";

export async function applyNonInteractiveGatewayConfig(params: {
  nextConfig: MaumauConfig;
  opts: OnboardOptions;
  runtime: RuntimeEnv;
  defaultPort: number;
  detectedTailscaleMode?: "off" | "serve" | "funnel";
}): Promise<{
  nextConfig: MaumauConfig;
  port: number;
  bind: string;
  authMode: string;
  tailscaleMode: string;
  tailscaleResetOnExit: boolean;
  gatewayToken?: string;
} | null> {
  const { opts, runtime } = params;

  const hasGatewayPort = opts.gatewayPort !== undefined;
  if (hasGatewayPort && (!Number.isFinite(opts.gatewayPort) || (opts.gatewayPort ?? 0) <= 0)) {
    runtime.error("Invalid --gateway-port");
    runtime.exit(1);
    return null;
  }

  const port = hasGatewayPort ? (opts.gatewayPort as number) : params.defaultPort;
  let bind = opts.gatewayBind ?? "loopback";
  const authModeRaw = opts.gatewayAuth ?? "token";
  if (authModeRaw !== "token" && authModeRaw !== "password") {
    runtime.error("Invalid --gateway-auth (use token|password).");
    runtime.exit(1);
    return null;
  }
  let authMode = authModeRaw;
  const tailscaleMode = opts.tailscale ?? params.detectedTailscaleMode ?? "off";
  const tailscaleResetOnExit = Boolean(opts.tailscaleResetOnExit);

  // Tighten config to safe combos:
  // - If Tailscale is on, force loopback bind (the tunnel handles external access).
  // - If using Tailscale Funnel, require password auth.
  if (tailscaleMode !== "off" && bind !== "loopback") {
    bind = "loopback";
  }
  if (tailscaleMode === "funnel" && authMode !== "password") {
    authMode = "password";
  }

  let nextConfig = params.nextConfig;
  const explicitGatewayToken = normalizeGatewayTokenInput(opts.gatewayToken);
  const envGatewayToken = normalizeGatewayTokenInput(process.env.MAUMAU_GATEWAY_TOKEN);
  let gatewayToken = explicitGatewayToken || envGatewayToken || undefined;
  const gatewayTokenRefEnv = String(opts.gatewayTokenRefEnv ?? "").trim();

  if (authMode === "token") {
    if (gatewayTokenRefEnv) {
      if (!isValidEnvSecretRefId(gatewayTokenRefEnv)) {
        runtime.error(
          "Invalid --gateway-token-ref-env (use env var name like MAUMAU_GATEWAY_TOKEN).",
        );
        runtime.exit(1);
        return null;
      }
      if (explicitGatewayToken) {
        runtime.error("Use either --gateway-token or --gateway-token-ref-env, not both.");
        runtime.exit(1);
        return null;
      }
      const resolvedFromEnv = process.env[gatewayTokenRefEnv]?.trim();
      if (!resolvedFromEnv) {
        runtime.error(`Environment variable "${gatewayTokenRefEnv}" is missing or empty.`);
        runtime.exit(1);
        return null;
      }
      gatewayToken = resolvedFromEnv;
      nextConfig = {
        ...nextConfig,
        gateway: {
          ...nextConfig.gateway,
          auth: {
            ...nextConfig.gateway?.auth,
            mode: "token",
            token: {
              source: "env",
              provider: resolveDefaultSecretProviderAlias(nextConfig, "env", {
                preferFirstProviderForSource: true,
              }),
              id: gatewayTokenRefEnv,
            },
          },
        },
      };
    } else {
      if (!gatewayToken) {
        gatewayToken = randomToken();
      }
      nextConfig = {
        ...nextConfig,
        gateway: {
          ...nextConfig.gateway,
          auth: {
            ...nextConfig.gateway?.auth,
            mode: "token",
            token: gatewayToken,
          },
        },
      };
    }
  }

  if (authMode === "password") {
    const password = opts.gatewayPassword?.trim();
    if (!password) {
      runtime.error("Missing --gateway-password for password auth.");
      runtime.exit(1);
      return null;
    }
    nextConfig = {
      ...nextConfig,
      gateway: {
        ...nextConfig.gateway,
        auth: {
          ...nextConfig.gateway?.auth,
          mode: "password",
          password,
        },
      },
    };
  }

  nextConfig = {
    ...nextConfig,
    gateway: {
      ...nextConfig.gateway,
      port,
      bind,
      tailscale: {
        ...nextConfig.gateway?.tailscale,
        mode: tailscaleMode,
        resetOnExit: tailscaleResetOnExit,
      },
    },
  };
  nextConfig = applyOnboardingTailscaleGatewayAuth({
    cfg: nextConfig,
    tailscaleMode,
    authMode: authMode as "token" | "password",
  });
  nextConfig = ensureControlUiAllowedOriginsForNonLoopbackBind(nextConfig, {
    requireControlUiEnabled: true,
  }).config;
  const tailscaleBin =
    tailscaleMode === "serve" || tailscaleMode === "funnel"
      ? await findTailscaleBinary()
      : undefined;
  nextConfig = await maybeAddTailnetOriginToControlUiAllowedOrigins({
    config: nextConfig,
    tailscaleMode,
    tailscaleBin,
  });

  return {
    nextConfig,
    port,
    bind,
    authMode,
    tailscaleMode,
    tailscaleResetOnExit,
    gatewayToken,
  };
}
