import { createHmac, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";
import { isWithinDir } from "../infra/path-safety.js";
import type { AuthRateLimiter } from "./auth-rate-limit.js";
import { authorizeWsControlUiGatewayConnect, type ResolvedGatewayAuth } from "./auth.js";
import type { DashboardWorkItemStatus } from "./dashboard-types.js";
import { sendGatewayAuthFailure } from "./http-common.js";
import { getBearerToken } from "./http-utils.js";

const DASHBOARD_DIRNAME = "dashboard";
const WORKSHOP_STORE_FILENAME = "workshop.json";
const SAVED_CONTENT_DIRNAME = "saved-workshop";
const SAVED_EMBED_TTL_MS = 15 * 60 * 1_000;
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

export type DashboardWorkshopProjectBinding = {
  name: string;
  key: string;
  updatedAtMs: number;
};

export type DashboardWorkshopSavedItemRecord = {
  id: string;
  sessionKey?: string;
  taskId?: string;
  sourceIdentity: string;
  title: string;
  summary?: string;
  taskTitle?: string;
  updatedAtMs: number;
  savedAtMs: number;
  agentId?: string;
  artifactPath?: string;
  embeddable: boolean;
  taskStatus: DashboardWorkItemStatus;
  taskAssigneeLabel?: string;
  workspaceId?: string;
  workspaceLabel?: string;
  projectName?: string;
  projectKey?: string;
  sourcePreviewUrl?: string;
  storedPath: string;
  isDirectory: boolean;
  rootFileName?: string;
};

export type DashboardWorkshopStore = {
  version: 1;
  updatedAtMs: number;
  projectByWorkspace: Record<string, DashboardWorkshopProjectBinding>;
  savedItems: DashboardWorkshopSavedItemRecord[];
};

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

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function setSavedArtifactResponseHeaders(res: ServerResponse, contentType: string): void {
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function buildSavedArtifactInvalidPage(): string {
  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8"><title>Saved artifact unavailable</title></head>',
    '<body style="font:16px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;padding:32px;color:#111827;background:#f9fafb">',
    '<h1 style="margin:0 0 12px">Saved artifact unavailable</h1>',
    '<p style="margin:0">This saved artifact link is invalid or expired.</p>',
    "</body></html>",
  ].join("");
}

function buildSavedArtifactLandingPage(
  record: DashboardWorkshopSavedItemRecord,
  href: string,
): string {
  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8"><title>Saved artifact</title></head>',
    '<body style="font:16px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;padding:32px;color:#111827;background:#f9fafb">',
    `<p style="margin:0 0 12px;color:#374151">${escapeHtml(record.title)}</p>`,
    '<h1 style="margin:0 0 12px">Saved artifact ready</h1>',
    `<p style="margin:0"><a href="${escapeHtml(href)}">Open file</a></p>`,
    "</body></html>",
  ].join("");
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeJsonFile(filePath: string, payload: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now().toString(36)}`;
  await fs.writeFile(tmpPath, payload, "utf8");
  await fs.rename(tmpPath, filePath);
}

function resolveDashboardWorkshopStorePath(stateDir = resolveStateDir()): string {
  return path.join(stateDir, DASHBOARD_DIRNAME, WORKSHOP_STORE_FILENAME);
}

function resolveSavedContentRoot(stateDir = resolveStateDir()): string {
  return path.join(stateDir, DASHBOARD_DIRNAME, SAVED_CONTENT_DIRNAME);
}

function resolveSavedContentDir(id: string, stateDir = resolveStateDir()): string {
  return path.join(resolveSavedContentRoot(stateDir), id);
}

export async function readDashboardWorkshopStore(params?: {
  stateDir?: string;
}): Promise<DashboardWorkshopStore> {
  const filePath = resolveDashboardWorkshopStorePath(params?.stateDir);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<DashboardWorkshopStore>;
    return {
      version: 1,
      updatedAtMs: typeof parsed.updatedAtMs === "number" ? parsed.updatedAtMs : 0,
      projectByWorkspace:
        parsed.projectByWorkspace && typeof parsed.projectByWorkspace === "object"
          ? parsed.projectByWorkspace
          : {},
      savedItems: Array.isArray(parsed.savedItems) ? parsed.savedItems : [],
    };
  } catch {
    return {
      version: 1,
      updatedAtMs: 0,
      projectByWorkspace: {},
      savedItems: [],
    };
  }
}

export async function writeDashboardWorkshopStore(
  store: DashboardWorkshopStore,
  stateDir = resolveStateDir(),
): Promise<void> {
  const filePath = resolveDashboardWorkshopStorePath(stateDir);
  await writeJsonFile(filePath, `${JSON.stringify(store, null, 2)}\n`);
}

export function normalizeDashboardProjectName(raw: string | undefined): {
  name?: string;
  key?: string;
} {
  const collapsed = normalizeText(raw).replace(/\s+/g, " ");
  if (!collapsed) {
    return {};
  }
  return {
    name: collapsed,
    key: collapsed.toLowerCase(),
  };
}

export async function copySourceIntoSavedWorkshopStore(params: {
  sourcePath: string;
  id?: string;
  stateDir?: string;
}): Promise<{
  id: string;
  storedPath: string;
  isDirectory: boolean;
  rootFileName?: string;
} | null> {
  const id = params.id ?? randomUUID().replaceAll("-", "");
  const stateDir = params.stateDir ?? resolveStateDir();
  const sourcePath = path.resolve(params.sourcePath);
  const stat = await fs.stat(sourcePath).catch(() => null);
  if (!stat) {
    return null;
  }
  const targetDir = resolveSavedContentDir(id, stateDir);
  await fs.rm(targetDir, { recursive: true, force: true });
  await ensureDir(targetDir);
  if (stat.isDirectory()) {
    await fs.cp(sourcePath, targetDir, { recursive: true, force: true });
    return {
      id,
      storedPath: targetDir,
      isDirectory: true,
    };
  }
  if (!stat.isFile()) {
    return null;
  }
  const rootFileName = path.basename(sourcePath);
  const storedPath = path.join(targetDir, rootFileName);
  await fs.cp(sourcePath, storedPath, { force: true });
  return {
    id,
    storedPath,
    isDirectory: false,
    rootFileName,
  };
}

type ParsedSavedArtifactPath = {
  id: string;
  relativePath: string;
  isEmbed: boolean;
  embedExpiresAtMs?: number;
  embedSignature?: string;
};

function parseSavedArtifactPath(pathname: string): ParsedSavedArtifactPath | null {
  const embedMatch = pathname.match(
    /^\/dashboard-workshop-embed\/saved\/([^/]+)\/(\d+)\/([^/]+)\/?(.*)$/,
  );
  if (embedMatch) {
    const expiresAtMs = Number(embedMatch[2] ?? "");
    if (!Number.isFinite(expiresAtMs)) {
      return null;
    }
    return {
      id: embedMatch[1] ?? "",
      isEmbed: true,
      embedExpiresAtMs: expiresAtMs,
      embedSignature: embedMatch[3] ?? "",
      relativePath: embedMatch[4] ?? "",
    };
  }
  const match = pathname.match(/^\/dashboard-workshop\/saved\/([^/]+)\/?(.*)$/);
  if (!match) {
    return null;
  }
  return {
    id: match[1] ?? "",
    isEmbed: false,
    relativePath: match[2] ?? "",
  };
}

function resolveSavedArtifactSecret(auth: ResolvedGatewayAuth): string | undefined {
  return auth.token?.trim() || auth.password?.trim() || undefined;
}

function signSavedArtifactPath(params: {
  secret: string;
  id: string;
  expiresAtMs: number;
}): string {
  return createHmac("sha256", params.secret)
    .update(`dashboard-workshop-saved:${params.id}:${params.expiresAtMs}`)
    .digest("base64url");
}

function isValidSavedArtifactEmbedRequest(params: {
  parsed: ParsedSavedArtifactPath;
  auth: ResolvedGatewayAuth;
  nowMs?: number;
}): boolean {
  if (typeof params.parsed.embedExpiresAtMs !== "number" || !params.parsed.embedSignature) {
    return false;
  }
  if (params.parsed.embedExpiresAtMs < (params.nowMs ?? Date.now())) {
    return false;
  }
  const secret = resolveSavedArtifactSecret(params.auth);
  if (!secret) {
    return false;
  }
  const expected = signSavedArtifactPath({
    secret,
    id: params.parsed.id,
    expiresAtMs: params.parsed.embedExpiresAtMs,
  });
  return expected === params.parsed.embedSignature;
}

export function buildSavedWorkshopEmbedPath(params: {
  savedItemId?: string;
  auth: ResolvedGatewayAuth;
  nowMs?: number;
}): string | undefined {
  const secret = resolveSavedArtifactSecret(params.auth);
  const savedItemId = normalizeText(params.savedItemId);
  if (!secret || !savedItemId) {
    return undefined;
  }
  const expiresAtMs = (params.nowMs ?? Date.now()) + SAVED_EMBED_TTL_MS;
  const signature = signSavedArtifactPath({
    secret,
    id: savedItemId,
    expiresAtMs,
  });
  return `/dashboard-workshop-embed/saved/${savedItemId}/${expiresAtMs}/${signature}/`;
}

async function authorizeSavedArtifactRequest(params: {
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

async function resolveSavedArtifactFile(params: {
  record: DashboardWorkshopSavedItemRecord;
  relativePath: string;
}): Promise<string | undefined> {
  const requestedRelative = params.relativePath.replace(/^\/+/, "");
  const root = params.record.isDirectory
    ? params.record.storedPath
    : path.dirname(params.record.storedPath);
  const defaultRelative = params.record.isDirectory
    ? "index.html"
    : (params.record.rootFileName ?? path.basename(params.record.storedPath));
  const resolvedRelative = requestedRelative || defaultRelative;
  let targetPath = path.resolve(root, resolvedRelative);
  if (targetPath !== root && !isWithinDir(root, targetPath)) {
    return undefined;
  }
  let stat = await fs.stat(targetPath).catch(() => null);
  if (stat?.isDirectory()) {
    targetPath = path.join(targetPath, "index.html");
    stat = await fs.stat(targetPath).catch(() => null);
  }
  if (
    !stat &&
    params.record.isDirectory &&
    !STATIC_ASSET_EXTENSIONS.has(path.extname(resolvedRelative))
  ) {
    targetPath = path.join(root, "index.html");
    stat = await fs.stat(targetPath).catch(() => null);
  }
  if (!stat?.isFile()) {
    return undefined;
  }
  return targetPath;
}

async function serveSavedArtifactFile(params: {
  req: IncomingMessage;
  res: ServerResponse;
  filePath: string;
}): Promise<void> {
  const ext = path.extname(params.filePath).toLowerCase();
  if (ext === ".html") {
    const html = await fs.readFile(params.filePath, "utf8");
    params.res.statusCode = 200;
    setSavedArtifactResponseHeaders(params.res, "text/html; charset=utf-8");
    if ((params.req.method ?? "GET").toUpperCase() === "HEAD") {
      params.res.end();
      return;
    }
    params.res.end(html);
    return;
  }
  const body = await fs.readFile(params.filePath);
  params.res.statusCode = 200;
  setSavedArtifactResponseHeaders(params.res, contentTypeForExt(ext));
  if ((params.req.method ?? "GET").toUpperCase() === "HEAD") {
    params.res.end();
    return;
  }
  params.res.end(body);
}

async function serveSavedArtifactContent(params: {
  req: IncomingMessage;
  res: ServerResponse;
  record: DashboardWorkshopSavedItemRecord;
  relativePath: string;
  fileHref?: string;
}): Promise<void> {
  const requestedRelative = params.relativePath.replace(/^\/+/, "");
  const targetPath = await resolveSavedArtifactFile({
    record: params.record,
    relativePath: params.relativePath,
  });
  if (!targetPath) {
    params.res.statusCode = 404;
    setSavedArtifactResponseHeaders(params.res, "text/html; charset=utf-8");
    params.res.end(buildSavedArtifactInvalidPage());
    return;
  }
  const ext = path.extname(targetPath).toLowerCase();
  if (!params.record.isDirectory && !requestedRelative && ext !== ".html") {
    const href = params.fileHref ?? params.record.rootFileName ?? "";
    params.res.statusCode = 200;
    setSavedArtifactResponseHeaders(params.res, "text/html; charset=utf-8");
    if ((params.req.method ?? "GET").toUpperCase() === "HEAD") {
      params.res.end();
      return;
    }
    params.res.end(buildSavedArtifactLandingPage(params.record, href));
    return;
  }
  await serveSavedArtifactFile({
    req: params.req,
    res: params.res,
    filePath: targetPath,
  });
}

export async function handleDashboardWorkshopSavedHttpRequest(params: {
  req: IncomingMessage;
  res: ServerResponse;
  auth: ResolvedGatewayAuth;
  trustedProxies: string[];
  allowRealIpFallback: boolean;
  rateLimiter?: AuthRateLimiter;
  stateDir?: string;
}): Promise<boolean> {
  const pathname = new URL(params.req.url ?? "/", "http://localhost").pathname;
  const parsed = parseSavedArtifactPath(pathname);
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
  const embedAuthorized = isValidSavedArtifactEmbedRequest({
    parsed,
    auth: params.auth,
  });
  if (!parsed.isEmbed || !embedAuthorized) {
    const ok = await authorizeSavedArtifactRequest(params);
    if (!ok) {
      return true;
    }
  }
  const store = await readDashboardWorkshopStore({ stateDir: params.stateDir });
  const record = store.savedItems.find((entry) => entry.id === parsed.id);
  if (!record) {
    params.res.statusCode = 404;
    setSavedArtifactResponseHeaders(params.res, "text/html; charset=utf-8");
    params.res.end(buildSavedArtifactInvalidPage());
    return true;
  }
  await serveSavedArtifactContent({
    req: params.req,
    res: params.res,
    record,
    relativePath: parsed.relativePath,
    fileHref: params.req.url?.endsWith("/") ? record.rootFileName : undefined,
  });
  return true;
}
