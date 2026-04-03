import { Type } from "@sinclair/typebox";
import { loadConfig, type MaumauConfig } from "../../config/config.js";
import {
  publishPreviewArtifact,
  type PreviewVisibility,
} from "../../gateway/previews.js";
import type { GatewayMessageChannel } from "../../utils/message-channel.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam } from "./common.js";

const PreviewPublishToolSchema = Type.Object({
  sourcePath: Type.String({
    minLength: 1,
    description: "Workspace-relative file or directory to publish as a preview artifact.",
  }),
  visibility: Type.Optional(
    Type.String({
      enum: ["private", "public-share"],
      description: "private for tailnet-only preview, or public-share for explicit temporary public links.",
    }),
  ),
  confirmPublicShare: Type.Optional(
    Type.Boolean({
      description:
        "Set true only after the user explicitly confirms the temporary public share and its privacy warning.",
    }),
  ),
  ttlSeconds: Type.Optional(
    Type.Number({
      minimum: 60,
      maximum: 604800,
      description: "Optional lease TTL in seconds. Public share defaults to 1 hour.",
    }),
  ),
});

function isDirectRoute(opts: {
  agentGroupId?: string | null;
  agentGroupChannel?: string | null;
  agentGroupSpace?: string | null;
}) {
  return !opts.agentGroupId && !opts.agentGroupChannel && !opts.agentGroupSpace;
}

export function createPreviewPublishTool(opts?: {
  config?: MaumauConfig;
  workspaceDir?: string;
  sessionId?: string;
  senderName?: string | null;
  senderUsername?: string | null;
  senderIsOwner?: boolean;
  requesterTailscaleLogin?: string | null;
  agentChannel?: GatewayMessageChannel;
  agentGroupId?: string | null;
  agentGroupChannel?: string | null;
  agentGroupSpace?: string | null;
}): AnyAgentTool {
  return {
    label: "Preview Publish",
    name: "preview_publish",
    ownerOnly: true,
    description:
      "Publish a workspace file or static web artifact as a durable gateway-served preview or an explicit temporary public share.",
    parameters: PreviewPublishToolSchema,
    execute: async (_toolCallId, args) => {
      if (!opts?.senderIsOwner || !isDirectRoute(opts)) {
        throw new Error("preview_publish is only available in owner direct chats.");
      }
      const cfg = opts?.config ?? loadConfig();
      const params = args as Record<string, unknown>;
      const sourcePath = readStringParam(params, "sourcePath", {
        required: true,
        label: "sourcePath",
      });
      const visibilityRaw = readStringParam(params, "visibility");
      const visibility: PreviewVisibility =
        visibilityRaw === "public-share" ? "public-share" : "private";
      const ttlSeconds =
        typeof params.ttlSeconds === "number" && Number.isFinite(params.ttlSeconds)
          ? params.ttlSeconds
          : undefined;
      const confirmPublicShare = params.confirmPublicShare === true;
      const result = await publishPreviewArtifact({
        cfg,
        sourcePath,
        workspaceDir: opts?.workspaceDir,
        visibility,
        confirmPublicShare,
        ttlSeconds,
        senderIsOwner: opts?.senderIsOwner,
        senderName: opts?.senderName,
        senderUsername: opts?.senderUsername,
        requesterTailscaleLogin: opts?.requesterTailscaleLogin,
        messageChannel: opts?.agentChannel,
        groupId: opts?.agentGroupId,
        groupChannel: opts?.agentGroupChannel,
        groupSpace: opts?.agentGroupSpace,
        createdBySessionId: opts?.sessionId,
      });
      return jsonResult(result);
    },
  };
}
