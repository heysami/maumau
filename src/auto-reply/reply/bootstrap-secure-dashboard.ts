import fs from "node:fs";
import path from "node:path";
import { bootstrapOwnerAllowFromIfUnset } from "../../channels/owner-bootstrap.js";
import { readConfigFileSnapshot, type MaumauConfig } from "../../config/config.js";
import { resolveGatewayAuth } from "../../gateway/auth.js";
import { normalizeControlUiBasePath } from "../../gateway/control-ui-shared.js";
import { resolveTailnetDnsHint } from "../../gateway/server-discovery.js";
import { resolveCommandAuthorization } from "../command-auth.js";
import type { MsgContext } from "../templating.js";
import type { ReplyPayload } from "../types.js";

const BOOTSTRAP_SECURE_DASHBOARD_PREFIX = "Phone dashboard:";
const BOOTSTRAP_SECURE_DASHBOARD_PAIRING_HINT =
  "If your computer shows a pairing request, approve it there first before this link will work.";

function buildDashboardPath(basePath?: string) {
  const normalizedBasePath = normalizeControlUiBasePath(basePath);
  return normalizedBasePath ? `${normalizedBasePath}/dashboard/today` : "/dashboard/today";
}

export async function resolveBootstrapSecureDashboardUrl(params: {
  cfg: MaumauConfig;
  workspaceDir: string;
  isFirstTurnInSession: boolean;
  originatingChannel?: string;
  chatType?: string;
  senderIsOwner: boolean;
  requesterSenderIsOwner?: boolean;
  ctx?: MsgContext;
  commandAuthorized?: boolean;
}): Promise<string | undefined> {
  if (!params.isFirstTurnInSession) {
    return undefined;
  }
  if ((params.chatType ?? "direct") !== "direct") {
    return undefined;
  }
  const originatingChannel = params.originatingChannel?.trim().toLowerCase();
  if (!originatingChannel || originatingChannel === "webchat") {
    return undefined;
  }
  if (!fs.existsSync(path.join(params.workspaceDir, "BOOTSTRAP.md"))) {
    return undefined;
  }
  const baseCfg = await resolveBootstrapSecureDashboardConfig(params.cfg);
  const effectiveCfg = bootstrapBootstrapOwnerAllowFromIfUnset({
    cfg: baseCfg,
    originatingChannel,
    chatType: params.chatType,
    ctx: params.ctx,
  });
  if (
    !(await canSenderAccessBootstrapSecureDashboard({
      ...params,
      cfg: effectiveCfg,
    }))
  ) {
    return undefined;
  }

  const tailscaleMode = effectiveCfg.gateway?.tailscale?.mode ?? "off";
  if (tailscaleMode !== "serve" && tailscaleMode !== "funnel") {
    return undefined;
  }

  const tailnetHost = await resolveTailnetDnsHint({ enabled: true });
  if (!tailnetHost) {
    return undefined;
  }

  const auth = resolveGatewayAuth({
    authConfig: effectiveCfg.gateway?.auth,
    tailscaleMode,
  });
  const dashboardUrl = `https://${tailnetHost}${buildDashboardPath(
    effectiveCfg.gateway?.controlUi?.basePath,
  )}`;

  if (tailscaleMode === "serve" && auth.allowTailscale) {
    return dashboardUrl;
  }
  if (auth.mode === "token" && auth.token?.trim()) {
    return `${dashboardUrl}#token=${encodeURIComponent(auth.token.trim())}`;
  }
  return dashboardUrl;
}

export async function buildBootstrapSecureDashboardSystemPrompt(params: {
  cfg: MaumauConfig;
  workspaceDir: string;
  isFirstTurnInSession: boolean;
  originatingChannel?: string;
  chatType?: string;
  senderIsOwner: boolean;
  requesterSenderIsOwner?: boolean;
  ctx?: MsgContext;
  commandAuthorized?: boolean;
}): Promise<string> {
  const secureDashboardUrl = await resolveBootstrapSecureDashboardUrl(params);
  if (!secureDashboardUrl) {
    return "";
  }
  return [
    "A dashboard URL is already available during this bootstrap.",
    "Mention this exact URL early in the conversation so the user can open Maumau on their phone right away:",
    secureDashboardUrl,
    "Also tell them that if their computer shows a pairing request, they need to approve it there before the link will work.",
  ].join("\n");
}

export function injectBootstrapSecureDashboardUrlIntoPayloads(
  payloads: ReplyPayload[],
  secureDashboardUrl?: string,
): ReplyPayload[] {
  const trimmedUrl = secureDashboardUrl?.trim();
  if (!trimmedUrl) {
    return payloads;
  }
  if (
    payloads.some(
      (payload) => typeof payload.text === "string" && payload.text.includes(trimmedUrl),
    )
  ) {
    return payloads;
  }
  const firstTextPayloadIndex = payloads.findIndex(
    (payload) => !payload.isError && typeof payload.text === "string" && payload.text.trim(),
  );
  if (firstTextPayloadIndex < 0) {
    return payloads;
  }

  const nextPayloads = [...payloads];
  const targetPayload = nextPayloads[firstTextPayloadIndex]!;
  const text = targetPayload.text?.trim();
  if (!text) {
    return payloads;
  }

  nextPayloads[firstTextPayloadIndex] = {
    ...targetPayload,
    text: [
      `${BOOTSTRAP_SECURE_DASHBOARD_PREFIX} ${trimmedUrl}`,
      BOOTSTRAP_SECURE_DASHBOARD_PAIRING_HINT,
      text,
    ].join("\n\n"),
  };
  return nextPayloads;
}

async function resolveBootstrapSecureDashboardConfig(cfg: MaumauConfig): Promise<MaumauConfig> {
  try {
    const snapshot = await readConfigFileSnapshot();
    if (snapshot.valid && snapshot.exists) {
      return snapshot.config;
    }
  } catch {
    // Fall back to the current turn snapshot when the on-disk config is unavailable.
  }
  return cfg;
}

function bootstrapBootstrapOwnerAllowFromIfUnset(params: {
  cfg: MaumauConfig;
  originatingChannel: string;
  chatType?: string;
  ctx?: MsgContext;
}): MaumauConfig {
  if ((params.chatType ?? "direct") !== "direct" || !params.ctx) {
    return params.cfg;
  }
  const allowFrom = collectBootstrapOwnerIdentities(params.ctx);
  if (allowFrom.length === 0) {
    return params.cfg;
  }
  return bootstrapOwnerAllowFromIfUnset({
    cfg: params.cfg,
    channelId: params.originatingChannel,
    accountId: params.ctx.AccountId,
    allowFrom,
  }).cfg;
}

function collectBootstrapOwnerIdentities(ctx: MsgContext): string[] {
  const candidates = [ctx.SenderE164, ctx.SenderId];
  if ((ctx.ChatType ?? "direct") === "direct") {
    candidates.push(ctx.From);
  }
  return Array.from(
    new Set(
      candidates
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value) => value.length > 0),
    ),
  );
}

async function canSenderAccessBootstrapSecureDashboard(params: {
  cfg: MaumauConfig;
  senderIsOwner: boolean;
  requesterSenderIsOwner?: boolean;
  ctx?: MsgContext;
  commandAuthorized?: boolean;
}): Promise<boolean> {
  if (params.senderIsOwner || params.requesterSenderIsOwner === true) {
    return true;
  }
  if (!params.ctx) {
    return false;
  }
  try {
    return resolveCommandAuthorization({
      ctx: params.ctx,
      cfg: params.cfg,
      commandAuthorized: params.commandAuthorized === true,
    }).senderIsOwner;
  } catch {
    return false;
  }
}
