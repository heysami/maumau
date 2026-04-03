import fs from "node:fs/promises";
import path from "node:path";
import { resolveAgentWorkspaceDir, resolveSessionAgentId } from "../agents/agent-scope.js";
import type { ReplyPayload } from "../auto-reply/types.js";
import type { MaumauConfig } from "../config/config.js";
import type { SessionEntry } from "../config/sessions.js";
import { isTrustedOwnerDirectPreviewRoute } from "../utils/private-preview-route.js";
import { isInternalMessageChannel, normalizeMessageChannel } from "../utils/message-channel.js";
import { publishPreviewArtifact } from "./previews.js";

const FILE_TEXT_LINE_RE = /^FILE:(.+)$/gm;
const PREVIEWABLE_FILE_EXTENSIONS = new Set([".htm", ".html"]);
const PREVIEWABLE_INDEX_FILES = ["index.html", "index.htm"];

type PreviewDeliverySessionEntry = Pick<
  SessionEntry,
  | "spawnedWorkspaceDir"
  | "requesterSenderIsOwner"
  | "requesterTailscaleLogin"
  | "groupId"
  | "groupChannel"
  | "space"
>;

function normalizeOptionalText(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

async function isPreviewableArtifactPath(params: {
  sourcePath: string;
  workspaceDir?: string;
}): Promise<boolean> {
  const trimmedSource = params.sourcePath.trim();
  if (!trimmedSource) {
    return false;
  }
  const resolvedPath = params.workspaceDir
    ? path.resolve(params.workspaceDir, trimmedSource)
    : path.resolve(trimmedSource);
  const stat = await fs.stat(resolvedPath).catch(() => null);
  if (!stat) {
    return false;
  }
  if (stat.isDirectory()) {
    for (const candidate of PREVIEWABLE_INDEX_FILES) {
      const indexStat = await fs.stat(path.join(resolvedPath, candidate)).catch(() => null);
      if (indexStat?.isFile()) {
        return true;
      }
    }
    return false;
  }
  if (!stat.isFile()) {
    return false;
  }
  return PREVIEWABLE_FILE_EXTENSIONS.has(path.extname(resolvedPath).toLowerCase());
}

async function findPreviewableArtifactSource(params: {
  payloads: readonly ReplyPayload[];
  workspaceDir?: string;
}): Promise<string | undefined> {
  const seen = new Set<string>();
  for (const payload of params.payloads) {
    const text = payload.text ?? "";
    for (const match of text.matchAll(FILE_TEXT_LINE_RE)) {
      const sourcePath = match[1]?.trim();
      if (!sourcePath || seen.has(sourcePath)) {
        continue;
      }
      seen.add(sourcePath);
      if (await isPreviewableArtifactPath({ sourcePath, workspaceDir: params.workspaceDir })) {
        return sourcePath;
      }
    }
  }
  return undefined;
}

function formatPreviewDeliveryReceipt(params: {
  result: Awaited<ReturnType<typeof publishPreviewArtifact>>;
}): string | undefined {
  const recipientHint = params.result.recipientHint || "requester";
  if (params.result.status === "published" && params.result.url) {
    return `Private preview for ${recipientHint}: ${params.result.url}`;
  }
  if (params.result.status === "share_consent_required") {
    return [
      `Private preview for ${recipientHint} was not auto-sent because this requester is not verified on Tailscale for the current session.`,
      "Temporary public share is available on request for 1 hour.",
      "Privacy warning: anyone with the link can access it until expiry.",
      "Next step: ask me to create the temporary public share.",
    ].join(" ");
  }
  if (params.result.status === "blocked") {
    const reason = params.result.blockedReason ? ` (${params.result.blockedReason})` : "";
    const fix = params.result.suggestedFix ? ` ${params.result.suggestedFix}` : "";
    return `Private preview for ${recipientHint} is unavailable${reason}.${fix}`;
  }
  return undefined;
}

function resolvePreviewWorkspaceDir(params: {
  cfg: MaumauConfig;
  workspaceDir?: string;
  sessionKey?: string;
  sessionEntry?: PreviewDeliverySessionEntry;
}): string | undefined {
  const explicitWorkspaceDir = normalizeOptionalText(params.workspaceDir);
  if (explicitWorkspaceDir) {
    return explicitWorkspaceDir;
  }
  const spawnedWorkspaceDir = normalizeOptionalText(params.sessionEntry?.spawnedWorkspaceDir);
  if (spawnedWorkspaceDir) {
    return spawnedWorkspaceDir;
  }
  const sessionKey = normalizeOptionalText(params.sessionKey);
  if (!sessionKey) {
    return undefined;
  }
  return resolveAgentWorkspaceDir(
    params.cfg,
    resolveSessionAgentId({
      sessionKey,
      config: params.cfg,
    }),
  );
}

export async function maybeBuildPreviewReceiptPayloads(params: {
  cfg: MaumauConfig;
  payloads: readonly ReplyPayload[];
  workspaceDir?: string;
  sessionKey?: string;
  sessionEntry?: PreviewDeliverySessionEntry;
  messageChannel?: string;
  senderIsOwner?: boolean;
  requesterTailscaleLogin?: string | null;
  senderName?: string | null;
  senderUsername?: string | null;
  groupId?: string | null;
  groupChannel?: string | null;
  groupSpace?: string | null;
  createdBySessionId?: string;
  onError?: (message: string) => void;
}): Promise<ReplyPayload[]> {
  const messageChannel = normalizeMessageChannel(params.messageChannel);
  if (!messageChannel || isInternalMessageChannel(messageChannel)) {
    return [];
  }

  const workspaceDir = resolvePreviewWorkspaceDir({
    cfg: params.cfg,
    workspaceDir: params.workspaceDir,
    sessionKey: params.sessionKey,
    sessionEntry: params.sessionEntry,
  });
  const sourcePath = await findPreviewableArtifactSource({
    payloads: params.payloads,
    workspaceDir,
  });
  if (!sourcePath) {
    return [];
  }

  const senderIsOwner =
    params.senderIsOwner === true || params.sessionEntry?.requesterSenderIsOwner === true;
  const requesterTailscaleLogin =
    normalizeOptionalText(params.requesterTailscaleLogin) ??
    normalizeOptionalText(params.sessionEntry?.requesterTailscaleLogin);
  const groupId = normalizeOptionalText(params.groupId) ?? normalizeOptionalText(params.sessionEntry?.groupId);
  const groupChannel =
    normalizeOptionalText(params.groupChannel) ?? normalizeOptionalText(params.sessionEntry?.groupChannel);
  const groupSpace =
    normalizeOptionalText(params.groupSpace) ?? normalizeOptionalText(params.sessionEntry?.space);

  if (
    !requesterTailscaleLogin &&
    !isTrustedOwnerDirectPreviewRoute({
      senderIsOwner,
      messageChannel,
      groupId,
      groupChannel,
      groupSpace,
    })
  ) {
    return [];
  }

  try {
    const published = await publishPreviewArtifact({
      cfg: params.cfg,
      sourcePath,
      workspaceDir,
      visibility: "private",
      senderIsOwner,
      senderName: params.senderName ?? undefined,
      senderUsername: params.senderUsername ?? undefined,
      requesterTailscaleLogin,
      messageChannel,
      groupId,
      groupChannel,
      groupSpace,
      createdBySessionId: params.createdBySessionId,
    });
    const text = formatPreviewDeliveryReceipt({ result: published });
    return text ? [{ text }] : [];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    params.onError?.(`Preview auto-publish failed: ${message}`);
    return [];
  }
}
