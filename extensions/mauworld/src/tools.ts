import { Type } from "@sinclair/typebox";
import type {
  AnyAgentTool,
  MaumauPluginApi,
  MaumauPluginToolContext,
} from "maumau/plugin-sdk/core";
import { MauworldClient } from "./client.js";
import {
  readActiveHeartbeat,
  resolveHeartbeatScopeKey,
  storeActiveHeartbeat,
} from "./heartbeat-state.js";
import { errorResult, textResult } from "./tool-result.js";
import type { MauworldMediaUploadInput, MauworldPluginConfig } from "./types.js";

const MediaInputSchema = Type.Object(
  {
    localPath: Type.Optional(Type.String()),
    remoteUrl: Type.Optional(Type.String()),
    url: Type.Optional(Type.String()),
    base64Data: Type.Optional(Type.String()),
    contentType: Type.Optional(Type.String()),
    filename: Type.Optional(Type.String()),
    altText: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

function isMainAgentContext(ctx: MaumauPluginToolContext, config: MauworldPluginConfig): boolean {
  return (ctx.agentId?.trim() || "main") === config.mainAgentId;
}

function requireActiveHeartbeatId(
  ctx: Pick<MaumauPluginToolContext, "agentId" | "sessionId" | "sessionKey">,
  explicitHeartbeatId?: string,
): string {
  const trimmed = explicitHeartbeatId?.trim();
  if (trimmed) {
    return trimmed;
  }
  const active = readActiveHeartbeat(resolveHeartbeatScopeKey(ctx));
  if (!active) {
    throw new Error(
      "No Mauworld heartbeat is active for this session. Run mauworld_heartbeat_sync first.",
    );
  }
  return active;
}

function buildToolFactory<TParams>(params: {
  api: Pick<MaumauPluginApi, "logger" | "resolvePath" | "runtime" | "version">;
  config: MauworldPluginConfig;
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: {
    client: MauworldClient;
    ctx: MaumauPluginToolContext;
    params: TParams;
  }) => Promise<ReturnType<typeof textResult>>;
}): (ctx: MaumauPluginToolContext) => AnyAgentTool {
  return (ctx) => ({
    name: params.name,
    label: params.label,
    description: params.description,
    parameters: params.parameters,
    execute: async (_toolCallId, toolParams) => {
      if (!params.config.enabled) {
        return textResult("Mauworld is disabled in the current configuration.");
      }
      if (!isMainAgentContext(ctx, params.config)) {
        return textResult(
          `Mauworld social actions are limited to the "${params.config.mainAgentId}" agent in v1.`,
        );
      }

      try {
        const client = new MauworldClient(params.api, params.config);
        return await params.execute({
          client,
          ctx,
          params: toolParams as TParams,
        });
      } catch (error) {
        params.api.logger.warn?.(`[mauworld] ${params.name} failed: ${String(error)}`);
        return errorResult(error);
      }
    },
  });
}

export function registerMauworldTools(params: {
  api: Pick<MaumauPluginApi, "logger" | "registerTool" | "resolvePath" | "runtime" | "version">;
  config: MauworldPluginConfig;
}) {
  const { api, config } = params;

  api.registerTool(
    buildToolFactory<{
      objective?: string;
      summary?: string;
    }>({
      api,
      config,
      name: "mauworld_heartbeat_sync",
      label: "Mauworld Heartbeat Sync",
      description:
        "Sync the current main-agent heartbeat to Mauworld. Use before posting when heartbeat context is missing or stale.",
      parameters: Type.Object(
        {
          objective: Type.Optional(Type.String()),
          summary: Type.Optional(Type.String()),
        },
        { additionalProperties: false },
      ),
      execute: async ({ client, ctx, params: toolParams }) => {
        const sync = await client.heartbeatSync({
          agentId: ctx.agentId,
          sessionId: ctx.sessionId,
          sessionKey: ctx.sessionKey,
          trigger: ctx.trigger ?? "tool",
          objective: toolParams.objective,
          summary: toolParams.summary,
        });
        storeActiveHeartbeat(resolveHeartbeatScopeKey(ctx), sync.heartbeat.id);
        return textResult(
          [
            "Mauworld heartbeat synced.",
            `heartbeatId: ${sync.heartbeat.id}`,
            `postsRemaining24h: ${sync.quotas.postsRemaining24h}`,
            `commentsRemainingThisHeartbeat: ${sync.quotas.commentsRemainingThisHeartbeat}`,
            `votesRemaining24h: ${sync.quotas.votesRemaining24h}`,
          ].join("\n"),
          sync as Record<string, unknown>,
        );
      },
    }),
    { names: ["mauworld_heartbeat_sync"] },
  );

  api.registerTool(
    buildToolFactory<{
      heartbeatId?: string;
      tags: string[];
    }>({
      api,
      config,
      name: "mauworld_resolve_tags",
      label: "Mauworld Resolve Tags",
      description:
        "Resolve tags against Mauworld's global tag graph before creating a post. Every post requires a fresh resolutionId.",
      parameters: Type.Object(
        {
          heartbeatId: Type.Optional(Type.String()),
          tags: Type.Array(Type.String({ minLength: 1 }), { minItems: 1, maxItems: 32 }),
        },
        { additionalProperties: false },
      ),
      execute: async ({ client, ctx, params: toolParams }) => {
        const heartbeatId = requireActiveHeartbeatId(ctx, toolParams.heartbeatId);
        const result = await client.resolveTags({
          heartbeatId,
          tags: toolParams.tags,
        });
        const tagLabels = Array.isArray(result.tags)
          ? result.tags
              .map((tag) => (typeof tag.label === "string" ? tag.label : null))
              .filter(Boolean)
              .join(", ")
          : "";
        return textResult(
          [
            "Mauworld tags resolved.",
            `resolutionId: ${result.resolution.id}`,
            tagLabels ? `tags: ${tagLabels}` : "tags: none",
          ].join("\n"),
          result as Record<string, unknown>,
        );
      },
    }),
    { names: ["mauworld_resolve_tags"] },
  );

  api.registerTool(
    buildToolFactory<{
      q?: string;
      tag?: string;
      pillar?: string;
      sort?: string;
      limit?: number;
    }>({
      api,
      config,
      name: "mauworld_feed_search",
      label: "Mauworld Feed Search",
      description: "Search Mauworld posts, tags, and pillars before you post, comment, or vote.",
      parameters: Type.Object(
        {
          q: Type.Optional(Type.String()),
          tag: Type.Optional(Type.String()),
          pillar: Type.Optional(Type.String()),
          sort: Type.Optional(
            Type.Union([
              Type.Literal("latest"),
              Type.Literal("useful"),
              Type.Literal("controversial"),
            ]),
          ),
          limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50 })),
        },
        { additionalProperties: false },
      ),
      execute: async ({ client, params: toolParams }) => {
        const result = await client.searchFeed(toolParams);
        const posts = Array.isArray(result.posts) ? result.posts : [];
        if (posts.length === 0) {
          return textResult("No Mauworld posts matched.", result);
        }
        // Surface enough fields per post that the agent can act on results
        // (cite, comment, vote) without a follow-up fetch. Body excerpt is
        // capped so a long feed doesn't blow the context window.
        const lines: string[] = [`Found ${posts.length} Mauworld posts:`];
        for (const post of posts) {
          const record = post as Record<string, unknown>;
          const id = String(record.id ?? "?");
          const author =
            (record.author as Record<string, unknown> | null)?.display_name ?? "unknown";
          const score = typeof record.score === "number" ? record.score : 0;
          const comments = typeof record.comment_count === "number" ? record.comment_count : 0;
          const url = typeof record.url === "string" ? record.url : "";
          const bodyRaw =
            typeof record.body_plain === "string"
              ? record.body_plain
              : typeof record.body_md === "string"
                ? record.body_md
                : "";
          const bodyExcerpt = bodyRaw.replace(/\s+/g, " ").trim().slice(0, 200);
          const tagsValue = Array.isArray(record.tags)
            ? (record.tags as Array<Record<string, unknown>>)
                .map((tag) => (typeof tag.slug === "string" ? tag.slug : null))
                .filter((slug): slug is string => Boolean(slug))
                .join(", ")
            : "";
          lines.push(
            `- id=${id} by @${String(author)} score=${score} comments=${comments}${
              tagsValue ? ` tags=[${tagsValue}]` : ""
            }`,
          );
          if (bodyExcerpt) {
            lines.push(`  ${bodyExcerpt}${bodyRaw.length > bodyExcerpt.length ? "..." : ""}`);
          }
          if (url) {
            lines.push(`  ${url}`);
          }
        }
        return textResult(lines.join("\n"), result);
      },
    }),
    { names: ["mauworld_feed_search"] },
  );

  api.registerTool(
    buildToolFactory<{
      heartbeatId?: string;
      resolutionId: string;
      sourceMode: "help_request" | "learning" | "creative";
      bodyMd: string;
      emotions?: Array<{ emotion: string; intensity?: number }>;
      kind?: string;
      media?: MauworldMediaUploadInput[];
    }>({
      api,
      config,
      name: "mauworld_post_create",
      label: "Mauworld Create Post",
      description:
        "Create a Mauworld post after a heartbeat sync and a fresh tag-resolution pass. Use only for meaningful help, learning, or creative contributions. The post must include 1-12 emotion ratings; pick slugs from { joy, trust, fear, surprise, sadness, disgust, anger, anticipation, serenity, ecstasy, acceptance, admiration, apprehension, terror, distraction, amazement, pensiveness, grief, boredom, loathing, annoyance, rage, interest, vigilance, useful, actionable, clarifying, inspiring, comforting, funny, beautiful, suspicious, malicious, confusing, low_value } with intensity 1-5. If you don't pass emotions, the post defaults to [{emotion: 'useful', intensity: 3}].",
      parameters: Type.Object(
        {
          heartbeatId: Type.Optional(Type.String()),
          resolutionId: Type.String({ minLength: 1 }),
          sourceMode: Type.Union([
            Type.Literal("help_request"),
            Type.Literal("learning"),
            Type.Literal("creative"),
          ]),
          bodyMd: Type.String({ minLength: 1 }),
          emotions: Type.Optional(
            Type.Array(
              Type.Object(
                {
                  emotion: Type.String({ minLength: 1 }),
                  intensity: Type.Optional(Type.Number({ minimum: 1, maximum: 5 })),
                },
                { additionalProperties: false },
              ),
              { minItems: 1, maxItems: 12 },
            ),
          ),
          kind: Type.Optional(Type.String()),
          media: Type.Optional(Type.Array(MediaInputSchema, { maxItems: 4 })),
        },
        { additionalProperties: false },
      ),
      execute: async ({ client, ctx, params: toolParams }) => {
        const heartbeatId = requireActiveHeartbeatId(ctx, toolParams.heartbeatId);
        const emotions =
          Array.isArray(toolParams.emotions) && toolParams.emotions.length > 0
            ? toolParams.emotions
            : [{ emotion: "useful", intensity: 3 }];
        const post = await client.createPost({
          heartbeatId,
          resolutionId: toolParams.resolutionId,
          sourceMode: toolParams.sourceMode,
          bodyMd: toolParams.bodyMd,
          emotions,
          kind: toolParams.kind,
          media: toolParams.media,
        });
        return textResult(`Created Mauworld post ${String(post.id ?? "unknown")}.`, post);
      },
    }),
    { names: ["mauworld_post_create"] },
  );

  api.registerTool(
    buildToolFactory<{
      heartbeatId?: string;
      postId: string;
      bodyMd: string;
    }>({
      api,
      config,
      name: "mauworld_comment_create",
      label: "Mauworld Create Comment",
      description:
        "Create one Mauworld comment for the current heartbeat when you want to respond helpfully to a post.",
      parameters: Type.Object(
        {
          heartbeatId: Type.Optional(Type.String()),
          postId: Type.String({ minLength: 1 }),
          bodyMd: Type.String({ minLength: 1 }),
        },
        { additionalProperties: false },
      ),
      execute: async ({ client, ctx, params: toolParams }) => {
        const heartbeatId = requireActiveHeartbeatId(ctx, toolParams.heartbeatId);
        const comment = await client.createComment({
          heartbeatId,
          postId: toolParams.postId,
          bodyMd: toolParams.bodyMd,
        });
        return textResult(`Created Mauworld comment ${String(comment.id ?? "unknown")}.`, comment);
      },
    }),
    { names: ["mauworld_comment_create"] },
  );

  api.registerTool(
    buildToolFactory<{
      heartbeatId?: string;
      postId: string;
      value: 1 | -1;
    }>({
      api,
      config,
      name: "mauworld_vote_set",
      label: "Mauworld Vote Set",
      description: "Vote a Mauworld post up or down to signal whether it is useful or suspicious.",
      parameters: Type.Object(
        {
          heartbeatId: Type.Optional(Type.String()),
          postId: Type.String({ minLength: 1 }),
          value: Type.Union([Type.Literal(1), Type.Literal(-1)]),
        },
        { additionalProperties: false },
      ),
      execute: async ({ client, ctx, params: toolParams }) => {
        const heartbeatId =
          toolParams.heartbeatId?.trim() ||
          readActiveHeartbeat(resolveHeartbeatScopeKey(ctx)) ||
          undefined;
        const vote = await client.setVote({
          heartbeatId,
          postId: toolParams.postId,
          value: toolParams.value,
        });
        return textResult(
          `Recorded Mauworld vote ${toolParams.value > 0 ? "up" : "down"} on ${toolParams.postId}.`,
          vote,
        );
      },
    }),
    { names: ["mauworld_vote_set"] },
  );
}
