import { execFile } from "node:child_process";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  resolveGatewayBindUrl,
  resolveGatewayPort,
  resolveTailnetHostWithRunner,
  type MaumauConfig,
  type MaumauPluginApi,
} from "../api.js";
import { resolveMultiUserMemoryConfig, type MultiUserMemoryConfig } from "./config.js";
import { normalizeLanguageId, translate, type SupportedLanguageId } from "./language.js";
import type { MultiUserMemoryStore, ProposalRecord } from "./store.js";

const execFileAsync = promisify(execFile);

export const APPROVAL_CENTER_PATH = "/plugins/multi-user-memory/approvals";
export const DEFAULT_APPROVAL_LINK_TTL_MS = 30 * 60 * 1000;

type ApprovalCenterTokenPayload = {
  v: 1;
  userId: string;
  exp: number;
};

type ApprovalCenterTokenCheck =
  | { ok: true; payload: ApprovalCenterTokenPayload }
  | { ok: false; reason: "invalid" | "expired" };

type ApprovalCenterNotice =
  | "approved"
  | "rejected"
  | "already-decided"
  | "denied"
  | "not-found"
  | "invalid";

function normalizeOptionalString(value?: string | null): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resolveApprovalCenterSecretPath(stateDir: string): string {
  return path.join(stateDir, "plugins", "multi-user-memory", "approval-center-secret");
}

async function loadApprovalCenterSecret(stateDir: string): Promise<Buffer> {
  const secretPath = resolveApprovalCenterSecretPath(stateDir);
  try {
    const existing = await fs.readFile(secretPath);
    if (existing.length >= 32) {
      return existing;
    }
  } catch {
    // Generate a new secret below.
  }
  const next = randomBytes(32);
  await fs.mkdir(path.dirname(secretPath), { recursive: true });
  await fs.writeFile(secretPath, next, { mode: 0o600 });
  return next;
}

function signApprovalCenterPayload(secret: Buffer, payloadBase64: string): string {
  return createHmac("sha256", secret).update(payloadBase64).digest("base64url");
}

export async function issueApprovalCenterToken(params: {
  stateDir: string;
  userId: string;
  ttlMs?: number;
  nowMs?: number;
}): Promise<{ token: string; expiresAt: number }> {
  const ttlMs = Math.max(60_000, params.ttlMs ?? DEFAULT_APPROVAL_LINK_TTL_MS);
  const expiresAt = (params.nowMs ?? Date.now()) + ttlMs;
  const payload: ApprovalCenterTokenPayload = {
    v: 1,
    userId: params.userId,
    exp: expiresAt,
  };
  const payloadBase64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const secret = await loadApprovalCenterSecret(params.stateDir);
  const signature = signApprovalCenterPayload(secret, payloadBase64);
  return {
    token: `${payloadBase64}.${signature}`,
    expiresAt,
  };
}

export async function verifyApprovalCenterToken(params: {
  stateDir: string;
  token?: string | null;
  nowMs?: number;
}): Promise<ApprovalCenterTokenCheck> {
  const token = normalizeOptionalString(params.token);
  if (!token) {
    return { ok: false, reason: "invalid" };
  }
  const [payloadBase64, signature] = token.split(".", 2);
  if (!payloadBase64 || !signature) {
    return { ok: false, reason: "invalid" };
  }
  let payload: ApprovalCenterTokenPayload;
  try {
    payload = JSON.parse(
      Buffer.from(payloadBase64, "base64url").toString("utf8"),
    ) as ApprovalCenterTokenPayload;
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (
    payload?.v !== 1 ||
    !normalizeOptionalString(payload.userId) ||
    !Number.isFinite(payload.exp)
  ) {
    return { ok: false, reason: "invalid" };
  }
  const secret = await loadApprovalCenterSecret(params.stateDir);
  const expected = Buffer.from(signApprovalCenterPayload(secret, payloadBase64), "utf8");
  const received = Buffer.from(signature, "utf8");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return { ok: false, reason: "invalid" };
  }
  if (payload.exp <= (params.nowMs ?? Date.now())) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, payload };
}

function normalizeApprovalBaseUrl(raw?: string): string | null {
  const trimmed = normalizeOptionalString(raw);
  if (!trimmed) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol === "ws:" || parsed.protocol === "wss:") {
    parsed.protocol = parsed.protocol === "wss:" ? "https:" : "http:";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  parsed.hash = "";
  parsed.search = "";
  const pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.pathname = pathname || "/";
  return parsed.toString().replace(/\/$/, "");
}

function isLoopbackHost(hostname: string): boolean {
  const lower = hostname.trim().toLowerCase();
  return lower === "localhost" || lower === "127.0.0.1" || lower === "::1" || lower === "[::1]";
}

function resolveLanHost(): string | null {
  const interfaces = networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.internal || entry.family !== "IPv4") {
        continue;
      }
      if (
        entry.address.startsWith("10.") ||
        entry.address.startsWith("192.168.") ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(entry.address)
      ) {
        return entry.address;
      }
    }
  }
  return null;
}

function resolveTailnetAddress(): string | null {
  const interfaces = networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.internal) {
        continue;
      }
      if (
        entry.family === "IPv4" &&
        /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(entry.address)
      ) {
        return entry.address;
      }
      if (entry.family === "IPv6" && entry.address.toLowerCase().startsWith("fd7a:115c:a1e0:")) {
        return entry.address;
      }
    }
  }
  return null;
}

async function runTailscaleStatus(argv: string[], opts: { timeoutMs: number }) {
  const [command, ...args] = argv;
  try {
    const result = await execFileAsync(command, args, {
      timeout: opts.timeoutMs,
      maxBuffer: 400_000,
    });
    return {
      code: 0,
      stdout: result.stdout ?? "",
    };
  } catch (error) {
    const failure = error as {
      code?: number | string | null;
      stdout?: string;
    };
    return {
      code: typeof failure.code === "number" ? failure.code : null,
      stdout: failure.stdout ?? "",
    };
  }
}

export async function resolveApprovalCenterBaseUrl(params: {
  cfg: MaumauConfig;
  pluginConfig: MultiUserMemoryConfig;
}): Promise<string | null> {
  const explicit = normalizeApprovalBaseUrl(params.pluginConfig.approvalCenterBaseUrl);
  if (explicit) {
    return explicit;
  }

  const tailscaleMode = params.cfg.gateway?.tailscale?.mode ?? "off";
  if (tailscaleMode === "serve" || tailscaleMode === "funnel") {
    const host = await resolveTailnetHostWithRunner(runTailscaleStatus);
    if (host) {
      return `https://${host}`;
    }
  }

  const remoteUrl = normalizeApprovalBaseUrl(params.cfg.gateway?.remote?.url);
  if (remoteUrl) {
    const parsed = new URL(remoteUrl);
    if (!isLoopbackHost(parsed.hostname)) {
      return remoteUrl;
    }
  }

  const bindUrl = resolveGatewayBindUrl({
    bind: params.cfg.gateway?.bind,
    customBindHost: params.cfg.gateway?.customBindHost,
    scheme: "ws",
    port: resolveGatewayPort(params.cfg),
    pickTailnetHost: resolveTailnetAddress,
    pickLanHost: resolveLanHost,
  });
  if (!bindUrl || "error" in bindUrl) {
    return null;
  }
  const reachable = normalizeApprovalBaseUrl(bindUrl.url);
  if (!reachable) {
    return null;
  }
  const parsed = new URL(reachable);
  return isLoopbackHost(parsed.hostname) ? null : reachable;
}

function joinApprovalCenterPath(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${APPROVAL_CENTER_PATH}`;
}

export async function buildApprovalCenterLink(params: {
  cfg: MaumauConfig;
  pluginConfig: MultiUserMemoryConfig;
  stateDir: string;
  userId: string;
  ttlMs?: number;
}): Promise<{ url: string; expiresAt: number } | null> {
  const baseUrl = await resolveApprovalCenterBaseUrl({
    cfg: params.cfg,
    pluginConfig: params.pluginConfig,
  });
  if (!baseUrl) {
    return null;
  }
  const issued = await issueApprovalCenterToken({
    stateDir: params.stateDir,
    userId: params.userId,
    ttlMs: params.ttlMs,
  });
  return {
    url: `${joinApprovalCenterPath(baseUrl)}?t=${encodeURIComponent(issued.token)}`,
    expiresAt: issued.expiresAt,
  };
}

function resolveNoticeMessage(
  language: SupportedLanguageId | undefined,
  notice: ApprovalCenterNotice | undefined,
): string | undefined {
  switch (notice) {
    case "approved":
      return translate(language, "approvalCenterBannerApproved");
    case "rejected":
      return translate(language, "approvalCenterBannerRejected");
    case "already-decided":
      return translate(language, "approvalCenterBannerAlreadyDecided");
    case "denied":
      return translate(language, "approvalCenterBannerDenied");
    case "not-found":
      return translate(language, "approvalCenterBannerNotFound");
    case "invalid":
      return translate(language, "approvalCenterBannerInvalid");
    default:
      return undefined;
  }
}

function renderApprovalCenterHtml(params: {
  language: SupportedLanguageId | undefined;
  userLabel: string;
  token: string;
  proposals: ProposalRecord[];
  notice?: ApprovalCenterNotice;
  invalidReason?: "invalid" | "expired";
}): string {
  const title = translate(params.language, "approvalCenterTitle", {
    user: params.userLabel,
  });
  const intro = translate(params.language, "approvalCenterIntro");
  const banner =
    params.invalidReason === "expired"
      ? translate(params.language, "approvalCenterExpired")
      : params.invalidReason === "invalid"
        ? translate(params.language, "approvalCenterInvalid")
        : resolveNoticeMessage(params.language, params.notice);

  const cards =
    params.invalidReason != null
      ? ""
      : params.proposals.length === 0
        ? `<p class="empty">${escapeHtml(translate(params.language, "approvalCenterNoPending"))}</p>`
        : params.proposals
            .map(
              (proposal) => `
        <article class="card">
          <div class="meta">${escapeHtml(proposal.proposalId)}</div>
          <div class="field">
            <div class="label">${escapeHtml(translate(params.language, "approvalCenterTargetGroup"))}</div>
            <div>${escapeHtml(proposal.targetGroupId)}</div>
          </div>
          <div class="field">
            <div class="label">${escapeHtml(translate(params.language, "approvalCenterWhyShared"))}</div>
            <div>${escapeHtml(proposal.whyShared)}</div>
          </div>
          <div class="field">
            <div class="label">${escapeHtml(translate(params.language, "approvalCenterPreview"))}</div>
            <div>${escapeHtml(proposal.preview)}</div>
          </div>
          ${
            proposal.sensitivity
              ? `
          <div class="field">
            <div class="label">${escapeHtml(translate(params.language, "approvalCenterSensitivity"))}</div>
            <div>${escapeHtml(proposal.sensitivity)}</div>
          </div>`
              : ""
          }
          <form method="post" action="${APPROVAL_CENTER_PATH}">
            <input type="hidden" name="t" value="${escapeHtml(params.token)}" />
            <input type="hidden" name="proposalId" value="${escapeHtml(proposal.proposalId)}" />
            <div class="actions">
              <button class="approve" type="submit" name="action" value="approve">${escapeHtml(translate(params.language, "approvalCenterApprove"))}</button>
              <button class="reject" type="submit" name="action" value="reject">${escapeHtml(translate(params.language, "approvalCenterReject"))}</button>
            </div>
          </form>
        </article>`,
            )
            .join("");

  return `<!DOCTYPE html>
<html lang="${escapeHtml(params.language ?? "en")}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f3efe4;
        --card: #fffaf2;
        --ink: #1f1c16;
        --muted: #6f6659;
        --line: #d4c8b5;
        --approve: #275d38;
        --reject: #8e352b;
        --banner: #e7dfcf;
      }
      body {
        margin: 0;
        font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
        background: radial-gradient(circle at top, #fbf7ef 0%, var(--bg) 65%);
        color: var(--ink);
      }
      main {
        max-width: 780px;
        margin: 0 auto;
        padding: 32px 18px 48px;
      }
      h1 {
        margin: 0 0 10px;
        font-size: 2rem;
        line-height: 1.1;
      }
      p.intro {
        margin: 0 0 22px;
        color: var(--muted);
      }
      .banner {
        margin: 0 0 18px;
        padding: 14px 16px;
        border: 1px solid var(--line);
        background: var(--banner);
        border-radius: 14px;
      }
      .empty,
      .card {
        border: 1px solid var(--line);
        border-radius: 18px;
        background: var(--card);
        box-shadow: 0 10px 25px rgba(45, 35, 24, 0.06);
      }
      .empty {
        padding: 18px;
      }
      .card {
        padding: 18px;
        margin: 0 0 16px;
      }
      .meta {
        margin: 0 0 10px;
        font-size: 0.84rem;
        color: var(--muted);
      }
      .field {
        margin: 0 0 12px;
      }
      .label {
        margin: 0 0 4px;
        font-size: 0.86rem;
        font-weight: 700;
        color: var(--muted);
      }
      .actions {
        display: flex;
        gap: 10px;
        margin-top: 14px;
      }
      button {
        border: none;
        border-radius: 999px;
        padding: 10px 16px;
        font: inherit;
        color: #fff;
        cursor: pointer;
      }
      button.approve {
        background: var(--approve);
      }
      button.reject {
        background: var(--reject);
      }
      @media (max-width: 640px) {
        h1 {
          font-size: 1.7rem;
        }
        .actions {
          flex-direction: column;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p class="intro">${escapeHtml(intro)}</p>
      ${banner ? `<div class="banner">${escapeHtml(banner)}</div>` : ""}
      ${cards}
    </main>
  </body>
</html>`;
}

async function readUrlEncodedBody(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk);
    size += buffer.length;
    if (size > 32_768) {
      throw new Error("approval center payload too large");
    }
    chunks.push(buffer);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

function sendHtml(res: ServerResponse, statusCode: number, html: string): boolean {
  if (!res.headersSent) {
    res.statusCode = statusCode;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
  }
  res.end(html);
  return true;
}

function redirectToNotice(
  res: ServerResponse,
  token: string,
  notice: ApprovalCenterNotice,
): boolean {
  const location = `${APPROVAL_CENTER_PATH}?t=${encodeURIComponent(token)}&notice=${encodeURIComponent(notice)}`;
  res.statusCode = 303;
  res.setHeader("Location", location);
  res.setHeader("Cache-Control", "no-store");
  res.end("");
  return true;
}

function normalizeApprovalNotice(value?: string | null): ApprovalCenterNotice | undefined {
  const normalized = normalizeOptionalString(value);
  switch (normalized) {
    case "approved":
    case "rejected":
    case "already-decided":
    case "denied":
    case "not-found":
    case "invalid":
      return normalized;
    default:
      return undefined;
  }
}

function resolveUserLanguage(
  pluginConfig: MultiUserMemoryConfig,
  userId: string,
): SupportedLanguageId | undefined {
  return (
    normalizeLanguageId(pluginConfig.users[userId]?.preferredLanguage) ??
    pluginConfig.defaultLanguage
  );
}

function resolveUserLabel(pluginConfig: MultiUserMemoryConfig, userId: string): string {
  return pluginConfig.users[userId]?.displayName?.trim() || userId;
}

export function createApprovalCenterHttpHandler(params: {
  api: MaumauPluginApi;
  store: MultiUserMemoryStore;
}): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  const stateDir = params.api.runtime.state.resolveStateDir();

  return async (req, res) => {
    const url = new URL(req.url ?? APPROVAL_CENTER_PATH, "http://localhost");
    const pluginConfig = resolveMultiUserMemoryConfig(params.api.config);
    const queryToken = normalizeOptionalString(url.searchParams.get("t"));

    if (req.method === "POST") {
      const form = await readUrlEncodedBody(req).catch(() => null);
      const token = normalizeOptionalString(form?.get("t")) ?? queryToken;
      const verified = await verifyApprovalCenterToken({ stateDir, token });
      const fallbackLanguage = pluginConfig.defaultLanguage;
      if (!verified.ok) {
        return sendHtml(
          res,
          verified.reason === "expired" ? 401 : 403,
          renderApprovalCenterHtml({
            language: fallbackLanguage,
            userLabel: "user",
            token: token ?? "",
            proposals: [],
            invalidReason: verified.reason,
          }),
        );
      }
      const action = normalizeOptionalString(form?.get("action"));
      const proposalId = normalizeOptionalString(form?.get("proposalId"));
      if (!proposalId || (action !== "approve" && action !== "reject")) {
        return redirectToNotice(res, token ?? "", "invalid");
      }
      const proposal = params.store.getProposal(proposalId);
      if (!proposal) {
        return redirectToNotice(res, token ?? "", "not-found");
      }
      if (proposal.sourceUserId !== verified.payload.userId) {
        return redirectToNotice(res, token ?? "", "denied");
      }
      if (proposal.status !== "pending") {
        return redirectToNotice(res, token ?? "", "already-decided");
      }
      params.store.decideProposal({
        proposalId,
        userId: verified.payload.userId,
        action,
      });
      return redirectToNotice(res, token ?? "", action === "approve" ? "approved" : "rejected");
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.statusCode = 405;
      res.setHeader("Allow", "GET, HEAD, POST");
      res.end("");
      return true;
    }

    const verified = await verifyApprovalCenterToken({ stateDir, token: queryToken });
    const fallbackLanguage = pluginConfig.defaultLanguage;
    if (!verified.ok) {
      return sendHtml(
        res,
        verified.reason === "expired" ? 401 : 403,
        renderApprovalCenterHtml({
          language: fallbackLanguage,
          userLabel: "user",
          token: queryToken ?? "",
          proposals: [],
          invalidReason: verified.reason,
        }),
      );
    }

    const language = resolveUserLanguage(pluginConfig, verified.payload.userId);
    const userLabel = resolveUserLabel(pluginConfig, verified.payload.userId);
    const html = renderApprovalCenterHtml({
      language,
      userLabel,
      token: queryToken ?? "",
      proposals: params.store.listPendingProposalsForUser(verified.payload.userId),
      notice: normalizeApprovalNotice(url.searchParams.get("notice")),
    });
    return sendHtml(res, 200, html);
  };
}
