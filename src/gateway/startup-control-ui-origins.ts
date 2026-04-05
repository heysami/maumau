import type { MaumauConfig } from "../config/config.js";
import {
  ensureControlUiAllowedOriginsForNonLoopbackBind,
  type GatewayNonLoopbackBindMode,
} from "../config/gateway-control-ui-origins.js";
import { maybeAddTailnetOriginToControlUiAllowedOrigins } from "./gateway-config-prompts.shared.js";

export async function maybeSeedControlUiAllowedOriginsAtStartup(params: {
  config: MaumauConfig;
  writeConfig: (config: MaumauConfig) => Promise<void>;
  log: { info: (msg: string) => void; warn: (msg: string) => void };
}): Promise<MaumauConfig> {
  const seeded = ensureControlUiAllowedOriginsForNonLoopbackBind(params.config);
  const withTailnetOrigin = await maybeAddTailnetOriginForStartup(seeded.config);
  if (!seeded.seededOrigins && withTailnetOrigin.addedOrigins.length === 0) {
    return params.config;
  }
  try {
    await params.writeConfig(withTailnetOrigin.config);
    if (seeded.seededOrigins && seeded.bind) {
      params.log.info(buildSeededOriginsInfoLog(seeded.seededOrigins, seeded.bind));
    }
    if (withTailnetOrigin.addedOrigins.length > 0 && withTailnetOrigin.tailscaleMode) {
      params.log.info(
        buildTailnetSeededOriginsInfoLog(
          withTailnetOrigin.addedOrigins,
          withTailnetOrigin.tailscaleMode,
        ),
      );
    }
  } catch (err) {
    params.log.warn(
      `gateway: failed to persist gateway.controlUi.allowedOrigins seed: ${String(err)}. The gateway will start with the in-memory value but config was not saved.`,
    );
  }
  return withTailnetOrigin.config;
}

function buildSeededOriginsInfoLog(origins: string[], bind: GatewayNonLoopbackBindMode): string {
  return (
    `gateway: seeded gateway.controlUi.allowedOrigins ${JSON.stringify(origins)} ` +
    `for bind=${bind} (required since v2026.2.26; see issue #29385). ` +
    "Add other origins to gateway.controlUi.allowedOrigins if needed."
  );
}

async function maybeAddTailnetOriginForStartup(
  config: MaumauConfig,
): Promise<{
  config: MaumauConfig;
  addedOrigins: string[];
  tailscaleMode?: "serve" | "funnel";
}> {
  const tailscaleMode = config.gateway?.tailscale?.mode;
  if (
    config.gateway?.controlUi?.enabled === false ||
    (tailscaleMode !== "serve" && tailscaleMode !== "funnel")
  ) {
    return { config, addedOrigins: [] };
  }
  const before = normalizeOrigins(config.gateway?.controlUi?.allowedOrigins);
  const nextConfig = await maybeAddTailnetOriginToControlUiAllowedOrigins({
    config,
    tailscaleMode,
  });
  const after = normalizeOrigins(nextConfig.gateway?.controlUi?.allowedOrigins);
  return {
    config: nextConfig,
    addedOrigins: after.filter((origin) => !before.includes(origin)),
    tailscaleMode,
  };
}

function normalizeOrigins(origins: string[] | undefined): string[] {
  return (origins ?? []).map((origin) => origin.trim().toLowerCase()).filter(Boolean);
}

function buildTailnetSeededOriginsInfoLog(
  origins: string[],
  tailscaleMode: "serve" | "funnel",
): string {
  return (
    `gateway: appended Tailscale Control UI origin(s) ${JSON.stringify(origins)} ` +
    `for tailscale.mode=${tailscaleMode}.`
  );
}
