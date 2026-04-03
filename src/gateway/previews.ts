import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolveGatewayPort, resolveStateDir } from "../config/paths.js";
import type { MaumauConfig } from "../config/config.js";
import { getTailnetHostname, probeTailscaleExposure } from "../infra/tailscale.js";
import { isWithinDir } from "../infra/path-safety.js";
import { isRequesterTrustedForPrivatePreview } from "../utils/private-preview-route.js";
import type { AuthRateLimiter } from "./auth-rate-limit.js";
import { authorizeWsControlUiGatewayConnect, type ResolvedGatewayAuth } from "./auth.js";
import { sendGatewayAuthFailure } from "./http-common.js";
import { getBearerToken } from "./http-utils.js";

export type PreviewVisibility = "private" | "public-share";
export type PreviewRecipientHintSource =
  | "sender_username"
  | "sender_name"
  | "tailscale_login"
  | "fallback";
export type PreviewPublishStatus =
  | "published"
  | "blocked"
  | "share_consent_required"
  | "invalid_source";

export type PreviewLeaseRecord = {
  id: string;
  visibility: PreviewVisibility;
  sourcePath: string;
  storedPath: string;
  isDirectory: boolean;
  rootFileName?: string;
  recipientHintSource: PreviewRecipientHintSource;
  recipientHintNormalizedSlug: string;
  recipientHintMaskedSlug: string;
  recipientHintDisplayLabel: string;
  recipientHintVerified: boolean;
  expiresAt: string;
  createdAt: string;
  createdBySessionId?: string;
};

export type PreviewAccessState = {
  ready: boolean;
  baseUrl?: string;
  userOnTailscale?: boolean;
  blockedReason?:
    | "not_configured"
    | "service_not_running"
    | "doctor_failed"
    | "user_not_on_tailscale"
    | "share_consent_required";
  suggestedFix?: string;
};

export type PreviewPublishResult = {
  previewId?: string;
  shareId?: string;
  url?: string;
  expiresAt?: string;
  sourcePath: string;
  status: PreviewPublishStatus;
  visibility: PreviewVisibility;
  recipientHint: string;
  confirmRequired: boolean;
  blockedReason?: PreviewAccessState["blockedReason"];
  suggestedFix?: string;
};

const PREVIEW_STORE_DIRNAME = "previews";
const PREVIEW_LEASES_DIRNAME = "leases";
const PREVIEW_CONTENT_DIRNAME = "content";
const DEFAULT_PRIVATE_TTL_MS = 24 * 60 * 60_000;
const DEFAULT_PUBLIC_SHARE_TTL_MS = 60 * 60_000;
const MAX_PRIVATE_TTL_MS = 7 * 24 * 60 * 60_000;
const MAX_PUBLIC_SHARE_TTL_MS = 24 * 60 * 60_000;
const STATIC_ASSET_EXTENSIONS = new Set([
  ".js",
  ".css",
  ".json",
  ".map",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".txt",
  ".woff",
  ".woff2",
]);

function contentTypeForExt(ext: string): string {
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
    case ".map":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".ico":
      return "image/x-icon";
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeRecipientHint(raw: string | undefined): string {
  const collapsed = (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
  return collapsed || "requester";
}

export function maskRecipientHintSlug(slug: string): string {
  if (slug.length >= 6) {
    return `${slug.slice(0, 3)}-${slug.slice(-2)}`;
  }
  if (slug.length >= 4) {
    return `${slug.slice(0, 2)}-${slug.slice(-1)}`;
  }
  if (slug.length >= 2) {
    return `${slug.slice(0, 1)}-${slug.slice(-1)}`;
  }
  return slug;
}

export function deriveRecipientHint(params: {
  senderUsername?: string | null;
  senderName?: string | null;
  requesterTailscaleLogin?: string | null;
}): {
  source: PreviewRecipientHintSource;
  normalizedSlug: string;
  maskedSlug: string;
  displayLabel: string;
  verified: boolean;
} {
  const username = params.senderUsername?.trim();
  if (username) {
    const displayLabel = username.startsWith("@") ? username : `@${username}`;
    const normalizedSlug = normalizeRecipientHint(username);
    return {
      source: "sender_username",
      normalizedSlug,
      maskedSlug: maskRecipientHintSlug(normalizedSlug),
      displayLabel,
      verified: true,
    };
  }
  const senderName = params.senderName?.trim();
  if (senderName) {
    const normalizedSlug = normalizeRecipientHint(senderName);
    return {
      source: "sender_name",
      normalizedSlug,
      maskedSlug: maskRecipientHintSlug(normalizedSlug),
      displayLabel: senderName,
      verified: true,
    };
  }
  const tailscaleLogin = params.requesterTailscaleLogin?.trim();
  if (tailscaleLogin) {
    const normalizedSlug = normalizeRecipientHint(tailscaleLogin);
    return {
      source: "tailscale_login",
      normalizedSlug,
      maskedSlug: maskRecipientHintSlug(normalizedSlug),
      displayLabel: tailscaleLogin,
      verified: true,
    };
  }
  const normalizedSlug = "requester";
  return {
    source: "fallback",
    normalizedSlug,
    maskedSlug: maskRecipientHintSlug(normalizedSlug),
    displayLabel: "requester",
    verified: false,
  };
}

function normalizeTtlMs(params: { visibility: PreviewVisibility; ttlSeconds?: number }): number {
  const fallback =
    params.visibility === "private" ? DEFAULT_PRIVATE_TTL_MS : DEFAULT_PUBLIC_SHARE_TTL_MS;
  const max = params.visibility === "private" ? MAX_PRIVATE_TTL_MS : MAX_PUBLIC_SHARE_TTL_MS;
  const requestedMs =
    typeof params.ttlSeconds === "number" && Number.isFinite(params.ttlSeconds)
      ? Math.max(1, Math.floor(params.ttlSeconds)) * 1000
      : fallback;
  return Math.min(requestedMs, max);
}

function getPreviewRoot(stateDir = resolveStateDir()) {
  return path.join(stateDir, PREVIEW_STORE_DIRNAME);
}

function getPreviewLeaseDir(id: string, stateDir = resolveStateDir()) {
  return path.join(getPreviewRoot(stateDir), PREVIEW_LEASES_DIRNAME, id);
}

function getPreviewLeaseFile(id: string, stateDir = resolveStateDir()) {
  return path.join(getPreviewLeaseDir(id, stateDir), "lease.json");
}

function getPreviewContentRoot(id: string, stateDir = resolveStateDir()) {
  return path.join(getPreviewLeaseDir(id, stateDir), PREVIEW_CONTENT_DIRNAME);
}

function buildPreviewPath(params: {
  visibility: PreviewVisibility;
  maskedSlug: string;
  id: string;
  relativePath?: string;
}): string {
  const prefix = params.visibility === "private" ? "preview" : "share";
  const relative = params.relativePath?.replace(/^\/+/, "") ?? "";
  const base = `/${prefix}/for-${params.maskedSlug}/${params.id}/`;
  return relative ? `${base}${relative}` : base;
}

async function buildPrivateBaseUrl(cfg: MaumauConfig): Promise<string | undefined> {
  if (cfg.gateway?.tailscale?.mode !== "serve") {
    return undefined;
  }
  const host = await getTailnetHostname().catch(() => null);
  return host ? `https://${host}` : undefined;
}

async function buildPublicBaseUrl(cfg: MaumauConfig): Promise<string | undefined> {
  if (cfg.gateway?.tailscale?.mode !== "funnel") {
    return undefined;
  }
  const host = await getTailnetHostname().catch(() => null);
  return host ? `https://${host}` : undefined;
}

export async function resolvePrivatePreviewAccess(params: {
  cfg: MaumauConfig;
  senderIsOwner?: boolean;
  requesterTailscaleLogin?: string | null;
  messageChannel?: string | null;
  groupId?: string | null;
  groupChannel?: string | null;
  groupSpace?: string | null;
}): Promise<PreviewAccessState> {
  const baseUrl = await buildPrivateBaseUrl(params.cfg);
  if (!baseUrl) {
    return {
      ready: false,
      blockedReason: "not_configured",
      suggestedFix: "Enable gateway.tailscale.mode=serve so private preview links have private ingress.",
    };
  }
  const ingress = await probeTailscaleExposure("serve");
  if (!ingress.active) {
    return {
      ready: false,
      baseUrl,
      blockedReason: ingress.blockedReason,
      suggestedFix: ingress.suggestedFix,
    };
  }
  const requesterTrusted = isRequesterTrustedForPrivatePreview({
    senderIsOwner: params.senderIsOwner,
    requesterTailscaleLogin: params.requesterTailscaleLogin,
    messageChannel: params.messageChannel,
    groupId: params.groupId,
    groupChannel: params.groupChannel,
    groupSpace: params.groupSpace,
  });
  const userOnTailscale = Boolean(params.requesterTailscaleLogin?.trim());
  if (!requesterTrusted) {
    return {
      ready: false,
      baseUrl,
      userOnTailscale,
      blockedReason: "user_not_on_tailscale",
      suggestedFix:
        "The requester is not verified on Tailscale for this session. Offer a temporary public share instead.",
    };
  }
  return { ready: true, baseUrl, userOnTailscale };
}

export async function resolvePublicShareAccess(params: {
  cfg: MaumauConfig;
}): Promise<PreviewAccessState> {
  const baseUrl = await buildPublicBaseUrl(params.cfg);
  if (!baseUrl) {
    return {
      ready: false,
      blockedReason: "not_configured",
      suggestedFix:
        "Enable gateway.tailscale.mode=funnel before creating temporary public share links.",
    };
  }
  const ingress = await probeTailscaleExposure("funnel");
  if (!ingress.active) {
    return {
      ready: false,
      baseUrl,
      blockedReason: ingress.blockedReason,
      suggestedFix: ingress.suggestedFix,
    };
  }
  return { ready: true, baseUrl };
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeLease(lease: PreviewLeaseRecord, stateDir = resolveStateDir()): Promise<void> {
  const leaseDir = getPreviewLeaseDir(lease.id, stateDir);
  await ensureDir(leaseDir);
  await fs.writeFile(getPreviewLeaseFile(lease.id, stateDir), `${JSON.stringify(lease, null, 2)}\n`);
}

async function readLease(id: string, stateDir = resolveStateDir()): Promise<PreviewLeaseRecord | null> {
  try {
    const raw = await fs.readFile(getPreviewLeaseFile(id, stateDir), "utf8");
    return JSON.parse(raw) as PreviewLeaseRecord;
  } catch {
    return null;
  }
}

async function deleteLease(id: string, stateDir = resolveStateDir()): Promise<void> {
  await fs.rm(getPreviewLeaseDir(id, stateDir), { recursive: true, force: true });
}

async function pruneExpiredLeases(stateDir = resolveStateDir()): Promise<void> {
  const leasesRoot = path.join(getPreviewRoot(stateDir), PREVIEW_LEASES_DIRNAME);
  let entries: string[] = [];
  try {
    entries = await fs.readdir(leasesRoot);
  } catch {
    return;
  }
  const now = Date.now();
  await Promise.all(
    entries.map(async (entry) => {
      const lease = await readLease(entry, stateDir);
      if (!lease) {
        return;
      }
      if (Date.parse(lease.expiresAt) <= now) {
        await deleteLease(entry, stateDir);
      }
    }),
  );
}

function resolveSourcePath(params: {
  sourcePath: string;
  workspaceDir?: string;
}): string | null {
  const raw = params.sourcePath.trim();
  if (!raw) {
    return null;
  }
  const resolved = params.workspaceDir ? path.resolve(params.workspaceDir, raw) : path.resolve(raw);
  if (params.workspaceDir) {
    const root = path.resolve(params.workspaceDir);
    if (resolved !== root && !isWithinDir(root, resolved)) {
      return null;
    }
  }
  return resolved;
}

async function copySourceIntoLease(params: {
  sourcePath: string;
  leaseId: string;
  stateDir?: string;
}): Promise<{ storedPath: string; isDirectory: boolean; rootFileName?: string } | null> {
  const stateDir = params.stateDir ?? resolveStateDir();
  const contentRoot = getPreviewContentRoot(params.leaseId, stateDir);
  await ensureDir(contentRoot);
  const stat = await fs.stat(params.sourcePath).catch(() => null);
  if (!stat) {
    return null;
  }
  if (stat.isDirectory()) {
    await fs.cp(params.sourcePath, contentRoot, { recursive: true, force: true });
    return { storedPath: contentRoot, isDirectory: true };
  }
  if (!stat.isFile()) {
    return null;
  }
  const rootFileName = path.basename(params.sourcePath);
  const storedPath = path.join(contentRoot, rootFileName);
  await fs.cp(params.sourcePath, storedPath, { force: true });
  return { storedPath, isDirectory: false, rootFileName };
}

function joinUrl(baseUrl: string, pathname: string): string {
  return new URL(pathname.replace(/^\//, ""), `${baseUrl.replace(/\/+$/, "")}/`).toString();
}

export async function publishPreviewArtifact(params: {
  cfg: MaumauConfig;
  sourcePath: string;
  workspaceDir?: string;
  visibility?: PreviewVisibility;
  confirmPublicShare?: boolean;
  ttlSeconds?: number;
  senderIsOwner?: boolean;
  senderUsername?: string | null;
  senderName?: string | null;
  requesterTailscaleLogin?: string | null;
  messageChannel?: string | null;
  groupId?: string | null;
  groupChannel?: string | null;
  groupSpace?: string | null;
  createdBySessionId?: string;
}): Promise<PreviewPublishResult> {
  await pruneExpiredLeases();
  const visibility = params.visibility === "public-share" ? "public-share" : "private";
  const recipientHint = deriveRecipientHint({
    senderUsername: params.senderUsername,
    senderName: params.senderName,
    requesterTailscaleLogin: params.requesterTailscaleLogin,
  });
  const resolvedSourcePath = resolveSourcePath({
    sourcePath: params.sourcePath,
    workspaceDir: params.workspaceDir,
  });
  if (!resolvedSourcePath) {
    return {
      sourcePath: params.sourcePath,
      status: "invalid_source",
      visibility,
      recipientHint: recipientHint.maskedSlug,
      confirmRequired: false,
      blockedReason: "not_configured",
      suggestedFix: "Pass a file or directory path inside the current workspace.",
    };
  }

  if (visibility === "private") {
    const access = await resolvePrivatePreviewAccess({
      cfg: params.cfg,
      senderIsOwner: params.senderIsOwner,
      requesterTailscaleLogin: params.requesterTailscaleLogin,
      messageChannel: params.messageChannel,
      groupId: params.groupId,
      groupChannel: params.groupChannel,
      groupSpace: params.groupSpace,
    });
    if (!access.ready) {
      if (access.blockedReason === "user_not_on_tailscale") {
        return {
          sourcePath: resolvedSourcePath,
          status: "share_consent_required",
          visibility: "public-share",
          recipientHint: recipientHint.maskedSlug,
          confirmRequired: true,
          blockedReason: access.blockedReason,
          suggestedFix: access.suggestedFix,
        };
      }
      return {
        sourcePath: resolvedSourcePath,
        status: "blocked",
        visibility,
        recipientHint: recipientHint.maskedSlug,
        confirmRequired: false,
        blockedReason: access.blockedReason,
        suggestedFix: access.suggestedFix,
      };
    }
  } else {
    const access = await resolvePublicShareAccess({ cfg: params.cfg });
    if (!params.confirmPublicShare) {
      return {
        sourcePath: resolvedSourcePath,
        status: "share_consent_required",
        visibility,
        recipientHint: recipientHint.maskedSlug,
        confirmRequired: true,
        blockedReason: "share_consent_required",
        suggestedFix:
          "Ask the user to confirm a temporary public share. Default TTL is 1 hour and anyone with the link can access it until expiry.",
      };
    }
    if (!access.ready) {
      return {
        sourcePath: resolvedSourcePath,
        status: "blocked",
        visibility,
        recipientHint: recipientHint.maskedSlug,
        confirmRequired: false,
        blockedReason: access.blockedReason,
        suggestedFix: access.suggestedFix,
      };
    }
  }

  const access =
    visibility === "private"
      ? await resolvePrivatePreviewAccess({
          cfg: params.cfg,
          senderIsOwner: params.senderIsOwner,
          requesterTailscaleLogin: params.requesterTailscaleLogin,
          messageChannel: params.messageChannel,
          groupId: params.groupId,
          groupChannel: params.groupChannel,
          groupSpace: params.groupSpace,
        })
      : await resolvePublicShareAccess({ cfg: params.cfg });
  if (!access.ready || !access.baseUrl) {
    return {
      sourcePath: resolvedSourcePath,
      status: "blocked",
      visibility,
      recipientHint: recipientHint.maskedSlug,
      confirmRequired: false,
      blockedReason: access.blockedReason,
      suggestedFix: access.suggestedFix,
    };
  }

  const leaseId = randomUUID().replaceAll("-", "");
  const copied = await copySourceIntoLease({
    sourcePath: resolvedSourcePath,
    leaseId,
  });
  if (!copied) {
    return {
      sourcePath: resolvedSourcePath,
      status: "invalid_source",
      visibility,
      recipientHint: recipientHint.maskedSlug,
      confirmRequired: false,
      blockedReason: "not_configured",
      suggestedFix: "Pass a readable file or directory artifact inside the current workspace.",
    };
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + normalizeTtlMs({ visibility, ttlSeconds: params.ttlSeconds }));
  const lease: PreviewLeaseRecord = {
    id: leaseId,
    visibility,
    sourcePath: resolvedSourcePath,
    storedPath: copied.storedPath,
    isDirectory: copied.isDirectory,
    rootFileName: copied.rootFileName,
    recipientHintSource: recipientHint.source,
    recipientHintNormalizedSlug: recipientHint.normalizedSlug,
    recipientHintMaskedSlug: recipientHint.maskedSlug,
    recipientHintDisplayLabel: recipientHint.displayLabel,
    recipientHintVerified: recipientHint.verified,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    createdBySessionId: params.createdBySessionId,
  };
  await writeLease(lease);

  const url = joinUrl(
    access.baseUrl,
    buildPreviewPath({
      visibility,
      maskedSlug: recipientHint.maskedSlug,
      id: leaseId,
    }),
  );
  return {
    previewId: visibility === "private" ? leaseId : undefined,
    shareId: visibility === "public-share" ? leaseId : undefined,
    url,
    expiresAt: lease.expiresAt,
    sourcePath: resolvedSourcePath,
    status: "published",
    visibility,
    recipientHint: recipientHint.maskedSlug,
    confirmRequired: false,
  };
}

function injectPreviewBanner(
  html: string,
  lease: PreviewLeaseRecord,
  displayLabel: string,
  authRequired: boolean,
): string {
  const banner = [
    '<div style="position:sticky;top:0;z-index:2147483647;padding:10px 14px;background:#111827;color:#f9fafb;font:13px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;border-bottom:1px solid rgba(255,255,255,0.12)">',
    authRequired
      ? `Created for ${escapeHtml(displayLabel)}`
      : `Created for for-${escapeHtml(lease.recipientHintMaskedSlug)}`,
    "</div>",
  ].join("");
  const bodyMatch = html.match(/<body[^>]*>/i);
  if (!bodyMatch || bodyMatch.index == null) {
    return `${banner}${html}`;
  }
  const insertAt = bodyMatch.index + bodyMatch[0].length;
  return `${html.slice(0, insertAt)}${banner}${html.slice(insertAt)}`;
}

function buildGenericInvalidPage(): string {
  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8"><title>Preview unavailable</title></head>',
    '<body style="font:16px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;padding:32px;color:#111827;background:#f9fafb">',
    "<h1 style=\"margin:0 0 12px\">Preview unavailable</h1>",
    "<p style=\"margin:0\">This link is invalid or expired.</p>",
    "</body></html>",
  ].join("");
}

function buildFileLandingPage(lease: PreviewLeaseRecord, href: string): string {
  const label =
    lease.visibility === "private"
      ? `Created for ${escapeHtml(lease.recipientHintDisplayLabel)}`
      : `Created for for-${escapeHtml(lease.recipientHintMaskedSlug)}`;
  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8"><title>Preview</title></head>',
    '<body style="font:16px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;padding:32px;color:#111827;background:#f9fafb">',
    `<p style="margin:0 0 12px;color:#374151">${label}</p>`,
    '<h1 style="margin:0 0 12px">Preview ready</h1>',
    `<p style="margin:0"><a href="${escapeHtml(href)}">Open artifact</a></p>`,
    "</body></html>",
  ].join("");
}

function setPreviewResponseHeaders(res: ServerResponse, contentType: string): void {
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function parsePreviewRequestPath(pathname: string):
  | { visibility: PreviewVisibility; maskedSlug: string; id: string; relativePath: string }
  | null {
  const match = pathname.match(/^\/(preview|share)\/for-([^/]+)\/([^/]+)\/?(.*)$/);
  if (!match) {
    return null;
  }
  return {
    visibility: match[1] === "preview" ? "private" : "public-share",
    maskedSlug: match[2] ?? "",
    id: match[3] ?? "",
    relativePath: match[4] ?? "",
  };
}

async function authorizePrivatePreviewRequest(params: {
  req: IncomingMessage;
  res: ServerResponse;
  auth: ResolvedGatewayAuth;
  trustedProxies: string[];
  allowRealIpFallback: boolean;
  rateLimiter?: AuthRateLimiter;
}): Promise<boolean> {
  const token = getBearerToken(params.req);
  const authResult = await authorizeWsControlUiGatewayConnect({
    auth: params.auth,
    connectAuth: token ? { token, password: token } : null,
    req: params.req,
    trustedProxies: params.trustedProxies,
    allowRealIpFallback: params.allowRealIpFallback,
    rateLimiter: params.rateLimiter,
  });
  if (!authResult.ok) {
    sendGatewayAuthFailure(params.res, authResult);
    return false;
  }
  return true;
}

async function serveHtmlFile(params: {
  req: IncomingMessage;
  res: ServerResponse;
  filePath: string;
  lease: PreviewLeaseRecord;
  authRequired: boolean;
}): Promise<void> {
  const html = await fs.readFile(params.filePath, "utf8");
  const body = injectPreviewBanner(
    html,
    params.lease,
    params.lease.recipientHintDisplayLabel,
    params.authRequired,
  );
  setPreviewResponseHeaders(params.res, "text/html; charset=utf-8");
  if ((params.req.method ?? "GET").toUpperCase() === "HEAD") {
    params.res.statusCode = 200;
    params.res.end();
    return;
  }
  params.res.statusCode = 200;
  params.res.end(body);
}

async function serveLeaseContent(params: {
  req: IncomingMessage;
  res: ServerResponse;
  lease: PreviewLeaseRecord;
  relativePath: string;
}): Promise<void> {
  const requestedRelative = params.relativePath.replace(/^\/+/, "");
  const root = params.lease.isDirectory
    ? params.lease.storedPath
    : path.dirname(params.lease.storedPath);
  const defaultRelative = params.lease.isDirectory
    ? "index.html"
    : (params.lease.rootFileName ?? path.basename(params.lease.storedPath));

  const resolvedRelative = requestedRelative || defaultRelative;
  let targetPath = path.resolve(root, resolvedRelative);
  if (targetPath !== root && !isWithinDir(root, targetPath)) {
    params.res.statusCode = 404;
    setPreviewResponseHeaders(params.res, "text/html; charset=utf-8");
    params.res.end(buildGenericInvalidPage());
    return;
  }

  let stat = await fs.stat(targetPath).catch(() => null);
  if (stat?.isDirectory()) {
    targetPath = path.join(targetPath, "index.html");
    stat = await fs.stat(targetPath).catch(() => null);
  }
  if (!stat && params.lease.isDirectory && !STATIC_ASSET_EXTENSIONS.has(path.extname(resolvedRelative))) {
    targetPath = path.join(root, "index.html");
    stat = await fs.stat(targetPath).catch(() => null);
  }

  if (!stat || !stat.isFile()) {
    params.res.statusCode = 404;
    setPreviewResponseHeaders(params.res, "text/html; charset=utf-8");
    params.res.end(buildGenericInvalidPage());
    return;
  }

  const ext = path.extname(targetPath).toLowerCase();
  if (!params.lease.isDirectory && !requestedRelative && ext !== ".html") {
    const href = buildPreviewPath({
      visibility: params.lease.visibility,
      maskedSlug: params.lease.recipientHintMaskedSlug,
      id: params.lease.id,
      relativePath: params.lease.rootFileName,
    });
    params.res.statusCode = 200;
    setPreviewResponseHeaders(params.res, "text/html; charset=utf-8");
    if ((params.req.method ?? "GET").toUpperCase() === "HEAD") {
      params.res.end();
      return;
    }
    params.res.end(buildFileLandingPage(params.lease, href));
    return;
  }
  if (ext === ".html") {
    await serveHtmlFile({
      req: params.req,
      res: params.res,
      filePath: targetPath,
      lease: params.lease,
      authRequired: params.lease.visibility === "private",
    });
    return;
  }
  const body = await fs.readFile(targetPath);
  params.res.statusCode = 200;
  setPreviewResponseHeaders(params.res, contentTypeForExt(ext));
  if ((params.req.method ?? "GET").toUpperCase() === "HEAD") {
    params.res.end();
    return;
  }
  params.res.end(body);
}

export async function handlePreviewHttpRequest(params: {
  req: IncomingMessage;
  res: ServerResponse;
  auth: ResolvedGatewayAuth;
  trustedProxies: string[];
  allowRealIpFallback: boolean;
  rateLimiter?: AuthRateLimiter;
}): Promise<boolean> {
  const pathname = new URL(params.req.url ?? "/", "http://localhost").pathname;
  const parsed = parsePreviewRequestPath(pathname);
  if (!parsed) {
    return false;
  }
  const method = (params.req.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    params.res.statusCode = 405;
    params.res.setHeader("Allow", "GET, HEAD");
    params.res.end("Method Not Allowed");
    return true;
  }
  await pruneExpiredLeases();
  const lease = await readLease(parsed.id);
  if (
    !lease ||
    lease.visibility !== parsed.visibility ||
    lease.recipientHintMaskedSlug !== parsed.maskedSlug ||
    Date.parse(lease.expiresAt) <= Date.now()
  ) {
    params.res.statusCode = 404;
    setPreviewResponseHeaders(params.res, "text/html; charset=utf-8");
    params.res.end(buildGenericInvalidPage());
    return true;
  }
  if (lease.visibility === "private") {
    const ok = await authorizePrivatePreviewRequest(params);
    if (!ok) {
      return true;
    }
  }
  await serveLeaseContent({
    req: params.req,
    res: params.res,
    lease,
    relativePath: parsed.relativePath,
  });
  return true;
}

export function buildPreviewCapabilityBaseUrl(params: {
  cfg: MaumauConfig;
  visibility: PreviewVisibility;
}): Promise<string | undefined> {
  return params.visibility === "private"
    ? buildPrivateBaseUrl(params.cfg)
    : buildPublicBaseUrl(params.cfg);
}

export function resolvePreviewGatewayUrl(cfg: MaumauConfig): string {
  return `http://127.0.0.1:${resolveGatewayPort(cfg)}`;
}
