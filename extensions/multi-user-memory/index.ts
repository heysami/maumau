import { Type } from "@sinclair/typebox";
import {
  definePluginEntry,
  jsonResult,
  readNumberParam,
  readStringParam,
  resolveSessionStoreEntry,
  resolveStorePath,
  type AnyAgentTool,
  type MaumauPluginApi,
  type MaumauPluginToolContext,
  updateSessionStore,
} from "./api.js";
import { ADMIN_API_PATH, createAdminApiHttpHandler } from "./src/admin-api.js";
import {
  APPROVAL_CENTER_PATH,
  DEFAULT_APPROVAL_LINK_TTL_MS,
  buildApprovalCenterLink,
  createApprovalCenterHttpHandler,
} from "./src/approval-center.js";
import {
  buildVisibleScopeKeys,
  pickNarrowestGroup,
  resolveConfiguredUserMatch,
  resolveEffectiveGroupIds,
  resolveGroupsContainingUsers,
  type MultiUserMemoryConfig,
} from "./src/config.js";
import { maybeBootstrapFirstObservedUser } from "./src/first-user.js";
import { DEFAULT_LANGUAGE_ID, normalizeLanguageId, translate } from "./src/language.js";
import { resolveCurrentMultiUserMemoryConfig } from "./src/runtime-config.js";
import { MultiUserMemoryStore, resolveDefaultStorePath, type ProposalRecord } from "./src/store.js";

const SEARCH_SCHEMA = Type.Object(
  {
    query: Type.String(),
    maxResults: Type.Optional(Type.Number({ minimum: 1, maximum: 25 })),
    minScore: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  },
  { additionalProperties: false },
);

const GET_SCHEMA = Type.Object(
  {
    path: Type.String(),
    from: Type.Optional(Type.Number({ minimum: 1 })),
    lines: Type.Optional(Type.Number({ minimum: 1 })),
  },
  { additionalProperties: false },
);

const LIST_PROVISIONAL_SCHEMA = Type.Object({}, { additionalProperties: false });

const EXPLAIN_IDENTITY_SCHEMA = Type.Object(
  {
    channelId: Type.String(),
    senderId: Type.String(),
    accountId: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

const EXPORT_PROVISIONAL_SCHEMA = Type.Object(
  {
    provisionalUserId: Type.String(),
    displayName: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

const LIST_PROPOSALS_SCHEMA = Type.Object({}, { additionalProperties: false });

const GENERATE_APPROVAL_LINK_SCHEMA = Type.Object(
  {
    userId: Type.String(),
    ttlMinutes: Type.Optional(Type.Number({ minimum: 1, maximum: 1_440 })),
  },
  { additionalProperties: false },
);

const DECIDE_PROPOSAL_SCHEMA = Type.Object(
  {
    proposalId: Type.String(),
    note: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

const CURATE_SCHEMA = Type.Object(
  {
    maxItems: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
  },
  { additionalProperties: false },
);

const STORE_ITEM_SCHEMA = Type.Object(
  {
    scopeType: Type.String({ enum: ["global", "group", "private"] }),
    scopeId: Type.Optional(Type.String()),
    text: Type.String(),
    summary: Type.Optional(Type.String()),
    kind: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

type ActivePrincipal = {
  displayName: string;
  language: string;
  configuredUserId?: string;
  provisionalUserId?: string;
  scopeKeys: string[];
};

type ImpactCandidate = {
  whyShared: string;
  sensitivity?: string;
  affectedUserIds: string[];
};

const PRIVATE_CAPTURE_PATTERNS: Array<{ kind: string; pattern: RegExp }> = [
  { kind: "preference", pattern: /\b(i prefer|i like|i love|i hate|prefer|favorite|allergic)\b/i },
  {
    kind: "relationship",
    pattern: /\b(my father|my mother|my dad|my mom|my wife|my husband|my son|my daughter)\b/i,
  },
  {
    kind: "event",
    pattern: /\b(attend|attending|join|joining|coming|travel|schedule|tomorrow|tonight|weekend)\b/i,
  },
  {
    kind: "availability",
    pattern: /\b(late|available|not available|busy|pickup|drop off|meeting)\b/i,
  },
  { kind: "remember", pattern: /\bremember|please remember|keep in mind\b/i },
];

const PROPOSAL_IMPACT_PATTERNS: Array<{ reason: string; pattern: RegExp; sensitivity?: string }> = [
  {
    reason: "shared planning or attendance could be affected",
    pattern:
      /\b(attend|attending|join|joining|coming|travel|trip|schedule|tomorrow|tonight|weekend)\b/i,
  },
  {
    reason: "household logistics could be affected",
    pattern: /\b(late|pickup|drop off|school|bill|rent|delivery|visit)\b/i,
  },
  {
    reason: "health or safety context could affect others",
    pattern: /\b(allergic|cannot eat|sick|medication|doctor)\b/i,
    sensitivity: "medium",
  },
  {
    reason: "relationship context changes how other members should respond",
    pattern: /\b(my father|my mother|my dad|my mom|my wife|my husband|my son|my daughter)\b/i,
  },
];

function trimPreview(text: string, maxChars = 180): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars - 1)}...` : normalized;
}

function resolveScopedStore(api: MaumauPluginApi): MultiUserMemoryStore {
  const stateDir = api.runtime.state.resolveStateDir();
  return new MultiUserMemoryStore(resolveDefaultStorePath(stateDir));
}

function resolveDisplayName(params: {
  configuredUserId?: string;
  configuredDisplayName?: string;
  provisionalUserId?: string;
  senderName?: string;
  senderUsername?: string;
  senderId?: string;
}): string {
  return (
    params.configuredDisplayName ??
    params.senderName?.trim() ??
    params.senderUsername?.trim() ??
    params.configuredUserId ??
    params.provisionalUserId ??
    params.senderId ??
    "unknown-user"
  );
}

function listPendingProvisionalUsers(
  store: MultiUserMemoryStore,
  pluginConfig: MultiUserMemoryConfig,
): Array<{
  provisionalUserId: string;
  channelId: string;
  accountId?: string;
  senderId: string;
  senderName?: string;
  senderUsername?: string;
  firstSeenAt: number;
  lastSeenAt: number;
  messageCount: number;
}> {
  return store.listProvisionalUsers().filter(
    (provisional) =>
      !resolveConfiguredUserMatch(pluginConfig, {
        channelId: provisional.channelId,
        accountId: provisional.accountId,
        senderId: provisional.senderId,
      }),
  );
}

function resolveToolPrincipal(params: {
  store: MultiUserMemoryStore;
  pluginConfig: MultiUserMemoryConfig;
  toolCtx: MaumauPluginToolContext;
}): ActivePrincipal | null {
  const channelId = params.toolCtx.messageChannel?.trim();
  const senderId = params.toolCtx.requesterSenderId?.trim();
  if (channelId && senderId) {
    const match = resolveConfiguredUserMatch(params.pluginConfig, {
      channelId,
      accountId: params.toolCtx.agentAccountId,
      senderId,
    });
    if (match) {
      const provisionalIds = params.store.findProvisionalIdsForConfiguredUser(match.user);
      return {
        configuredUserId: match.userId,
        displayName: resolveDisplayName({
          configuredUserId: match.userId,
          configuredDisplayName: match.user.displayName,
          senderId,
        }),
        language: match.user.preferredLanguage ?? params.pluginConfig.defaultLanguage,
        scopeKeys: buildVisibleScopeKeys({
          config: params.pluginConfig,
          userId: match.userId,
          provisionalIds,
        }),
      };
    }
    const provisional = params.store.findProvisionalUserByIdentity({
      channelId,
      accountId: params.toolCtx.agentAccountId,
      senderId,
    });
    if (provisional) {
      return {
        provisionalUserId: provisional.provisionalUserId,
        displayName: provisional.provisionalUserId,
        language: provisional.preferredLanguage ?? params.pluginConfig.defaultLanguage,
        scopeKeys: buildVisibleScopeKeys({
          config: params.pluginConfig,
          provisionalIds: [provisional.provisionalUserId],
        }),
      };
    }
  }
  if (!params.toolCtx.sessionKey) {
    return null;
  }
  const sessionContext = params.store.getSessionContext(params.toolCtx.sessionKey);
  if (!sessionContext) {
    return null;
  }
  if (sessionContext.resolvedUserId) {
    const user = params.pluginConfig.users[sessionContext.resolvedUserId];
    const provisionalIds = user ? params.store.findProvisionalIdsForConfiguredUser(user) : [];
    return {
      configuredUserId: sessionContext.resolvedUserId,
      displayName: resolveDisplayName({
        configuredUserId: sessionContext.resolvedUserId,
        configuredDisplayName: user?.displayName,
        provisionalUserId: sessionContext.provisionalUserId,
        senderName: sessionContext.requesterSenderName,
        senderUsername: sessionContext.requesterSenderUsername,
        senderId: sessionContext.requesterSenderId,
      }),
      language:
        sessionContext.effectiveLanguage ??
        user?.preferredLanguage ??
        params.pluginConfig.defaultLanguage,
      scopeKeys: buildVisibleScopeKeys({
        config: params.pluginConfig,
        userId: sessionContext.resolvedUserId,
        provisionalIds,
      }),
    };
  }
  if (sessionContext.provisionalUserId) {
    return {
      provisionalUserId: sessionContext.provisionalUserId,
      displayName: resolveDisplayName({
        provisionalUserId: sessionContext.provisionalUserId,
        senderName: sessionContext.requesterSenderName,
        senderUsername: sessionContext.requesterSenderUsername,
        senderId: sessionContext.requesterSenderId,
      }),
      language: sessionContext.effectiveLanguage ?? params.pluginConfig.defaultLanguage,
      scopeKeys: buildVisibleScopeKeys({
        config: params.pluginConfig,
        provisionalIds: [sessionContext.provisionalUserId],
      }),
    };
  }
  return null;
}

function buildPrincipalPrompt(principal: ActivePrincipal, pendingApprovalPrompt?: string): string {
  const visibleScopes = principal.scopeKeys.join(", ");
  const heading = translate(normalizeLanguageId(principal.language), "principalHeading");
  const body = translate(normalizeLanguageId(principal.language), "principalBody", {
    user: principal.displayName,
    language: principal.language,
    scopes: visibleScopes,
  });
  return pendingApprovalPrompt
    ? `${heading}\n${body}\n${pendingApprovalPrompt}`
    : `${heading}\n${body}`;
}

function normalizeCaptureCandidate(prompt: string): { kind: string; summary: string } | null {
  const text = prompt.trim();
  if (!text || text.startsWith("/")) {
    return null;
  }
  for (const entry of PRIVATE_CAPTURE_PATTERNS) {
    if (entry.pattern.test(text)) {
      return {
        kind: entry.kind,
        summary: trimPreview(text, 120),
      };
    }
  }
  return null;
}

function collectMentionedUsers(
  config: MultiUserMemoryConfig,
  text: string,
  excludeUserId?: string,
): string[] {
  const lower = text.toLowerCase();
  const matches = new Set<string>();
  for (const [userId, user] of Object.entries(config.users)) {
    if (userId === excludeUserId || !user.active) {
      continue;
    }
    const display = user.displayName?.trim().toLowerCase();
    if (display && display.length >= 3 && lower.includes(display)) {
      matches.add(userId);
    }
  }
  return [...matches];
}

function detectImpactCandidate(
  config: MultiUserMemoryConfig,
  params: { text: string; sourceUserId: string },
): ImpactCandidate | null {
  const mentionedUsers = collectMentionedUsers(config, params.text, params.sourceUserId);
  for (const entry of PROPOSAL_IMPACT_PATTERNS) {
    if (!entry.pattern.test(params.text)) {
      continue;
    }
    return {
      whyShared: entry.reason,
      sensitivity: entry.sensitivity,
      affectedUserIds: mentionedUsers,
    };
  }
  return null;
}

function resolveTargetGroup(params: {
  config: MultiUserMemoryConfig;
  sourceUserId: string;
  affectedUserIds: string[];
}): string | undefined {
  const memberIds = [params.sourceUserId, ...params.affectedUserIds];
  if (memberIds.length > 1) {
    const sharedGroups = resolveGroupsContainingUsers(params.config, memberIds);
    const narrowestShared = pickNarrowestGroup(params.config, sharedGroups);
    if (narrowestShared) {
      return narrowestShared;
    }
  }
  return pickNarrowestGroup(
    params.config,
    resolveEffectiveGroupIds(params.config, params.sourceUserId),
  );
}

async function persistReplyLanguage(params: {
  api: MaumauPluginApi;
  sessionKey?: string;
  agentId?: string;
  replyLanguage?: string;
}): Promise<void> {
  const replyLanguage = normalizeLanguageId(params.replyLanguage);
  if (!replyLanguage || !params.sessionKey || !params.agentId) {
    return;
  }
  const storePath = resolveStorePath(params.api.config.session?.store, {
    agentId: params.agentId,
  });
  await updateSessionStore(storePath, (store) => {
    const { normalizedKey, existing } = resolveSessionStoreEntry({
      store,
      sessionKey: params.sessionKey!,
    });
    if (!existing) {
      return undefined;
    }
    store[normalizedKey] = {
      ...existing,
      replyLanguage,
      updatedAt: Date.now(),
    };
    return store[normalizedKey];
  });
}

async function handlePrincipalTurn(params: {
  api: MaumauPluginApi;
  store: MultiUserMemoryStore;
  event: { prompt: string };
  ctx: {
    agentId?: string;
    sessionKey?: string;
    channelId?: string;
    accountId?: string;
    requesterSenderId?: string;
    requesterSenderName?: string;
    requesterSenderUsername?: string;
    conversationId?: string;
    isGroup?: boolean;
    trigger?: string;
  };
}): Promise<ActivePrincipal | null> {
  let pluginConfig = resolveCurrentMultiUserMemoryConfig(params.api);
  if (!pluginConfig.enabled) {
    return null;
  }

  const senderId = params.ctx.requesterSenderId?.trim();
  const channelId = params.ctx.channelId?.trim();
  let principal: ActivePrincipal | null = null;

  if (senderId && channelId) {
    let match = resolveConfiguredUserMatch(pluginConfig, {
      channelId,
      accountId: params.ctx.accountId,
      senderId,
      senderName: params.ctx.requesterSenderName,
      senderUsername: params.ctx.requesterSenderUsername,
    });
    let provisionalIds = match ? params.store.findProvisionalIdsForConfiguredUser(match.user) : [];
    let effectiveLanguage =
      match?.user.preferredLanguage ?? pluginConfig.defaultLanguage ?? DEFAULT_LANGUAGE_ID;
    const observed = params.store.observeIdentity({
      channelId,
      accountId: params.ctx.accountId,
      senderId,
      senderName: params.ctx.requesterSenderName,
      senderUsername: params.ctx.requesterSenderUsername,
      sessionKey: params.ctx.sessionKey,
      conversationId: params.ctx.conversationId,
      agentId: params.ctx.agentId,
      isGroup: params.ctx.isGroup,
      resolvedUserId: match?.userId,
      effectiveLanguage,
      previewText: params.event.prompt,
      createProvisional: pluginConfig.autoDiscover,
    });

    if (!match && params.ctx.isGroup !== true) {
      const bootstrapped = await maybeBootstrapFirstObservedUser({
        api: params.api,
        pluginConfig,
        channelId,
        accountId: params.ctx.accountId,
        senderId,
        senderName: params.ctx.requesterSenderName,
        senderUsername: params.ctx.requesterSenderUsername,
      }).catch((err: unknown) => {
        params.api.logger.warn?.(
          `multi-user-memory: failed auto-bootstrapping first user: ${String(err)}`,
        );
        return null;
      });
      if (bootstrapped) {
        pluginConfig = bootstrapped.config;
        match = {
          userId: bootstrapped.userId,
          user: bootstrapped.user,
          identity: bootstrapped.user.identities[0]!,
        };
        provisionalIds = params.store.findProvisionalIdsForConfiguredUser(bootstrapped.user);
        effectiveLanguage =
          bootstrapped.user.preferredLanguage ??
          pluginConfig.defaultLanguage ??
          DEFAULT_LANGUAGE_ID;
      }
    }

    principal = match
      ? {
          configuredUserId: match.userId,
          displayName: resolveDisplayName({
            configuredUserId: match.userId,
            configuredDisplayName: match.user.displayName,
            provisionalUserId: observed.provisionalUserId,
            senderName: params.ctx.requesterSenderName,
            senderUsername: params.ctx.requesterSenderUsername,
            senderId,
          }),
          language: effectiveLanguage,
          scopeKeys: buildVisibleScopeKeys({
            config: pluginConfig,
            userId: match.userId,
            provisionalIds,
          }),
        }
      : observed.provisionalUserId
        ? {
            provisionalUserId: observed.provisionalUserId,
            displayName: resolveDisplayName({
              provisionalUserId: observed.provisionalUserId,
              senderName: params.ctx.requesterSenderName,
              senderUsername: params.ctx.requesterSenderUsername,
              senderId,
            }),
            language: effectiveLanguage,
            scopeKeys: buildVisibleScopeKeys({
              config: pluginConfig,
              provisionalIds: [observed.provisionalUserId],
            }),
          }
        : null;

    if (principal?.configuredUserId && params.ctx.isGroup !== true) {
      await persistReplyLanguage({
        api: params.api,
        agentId: params.ctx.agentId,
        sessionKey: params.ctx.sessionKey,
        replyLanguage: principal.language,
      }).catch((err: unknown) => {
        params.api.logger.warn?.(
          `multi-user-memory: failed persisting reply language: ${String(err)}`,
        );
      });
    }

    const capture = normalizeCaptureCandidate(params.event.prompt);
    if (capture) {
      if (principal?.configuredUserId) {
        const duplicate = params.store.hasDuplicateRecentPrivateItem({
          scopeId: principal.configuredUserId,
          body: params.event.prompt,
          sinceMs: Date.now() - 24 * 60 * 60 * 1000,
        });
        if (!duplicate) {
          params.store.createMemoryItem({
            scopeType: "private",
            scopeId: principal.configuredUserId,
            body: params.event.prompt,
            summary: capture.summary,
            itemKind: capture.kind,
            sourceUserId: principal.configuredUserId,
          });
        }
      } else if (principal?.provisionalUserId) {
        params.store.createMemoryItem({
          scopeType: "provisional",
          scopeId: principal.provisionalUserId,
          body: params.event.prompt,
          summary: capture.summary,
          itemKind: capture.kind,
        });
      }
    }
  }

  if (!principal && params.ctx.sessionKey) {
    const sessionContext = params.store.getSessionContext(params.ctx.sessionKey);
    if (sessionContext?.resolvedUserId) {
      const user = pluginConfig.users[sessionContext.resolvedUserId];
      const provisionalIds = user ? params.store.findProvisionalIdsForConfiguredUser(user) : [];
      principal = {
        configuredUserId: sessionContext.resolvedUserId,
        displayName: resolveDisplayName({
          configuredUserId: sessionContext.resolvedUserId,
          configuredDisplayName: user?.displayName,
          senderName: sessionContext.requesterSenderName,
          senderUsername: sessionContext.requesterSenderUsername,
          senderId: sessionContext.requesterSenderId,
        }),
        language:
          sessionContext.effectiveLanguage ??
          user?.preferredLanguage ??
          pluginConfig.defaultLanguage,
        scopeKeys: buildVisibleScopeKeys({
          config: pluginConfig,
          userId: sessionContext.resolvedUserId,
          provisionalIds,
        }),
      };
    } else if (sessionContext?.provisionalUserId) {
      principal = {
        provisionalUserId: sessionContext.provisionalUserId,
        displayName: resolveDisplayName({
          provisionalUserId: sessionContext.provisionalUserId,
          senderName: sessionContext.requesterSenderName,
          senderUsername: sessionContext.requesterSenderUsername,
          senderId: sessionContext.requesterSenderId,
        }),
        language: sessionContext.effectiveLanguage ?? pluginConfig.defaultLanguage,
        scopeKeys: buildVisibleScopeKeys({
          config: pluginConfig,
          provisionalIds: [sessionContext.provisionalUserId],
        }),
      };
    }
  }

  return principal;
}

function formatProposalList(
  language: string,
  proposals: ProposalRecord[],
  userLabel: string,
  approvalCenterUrl?: string,
): string {
  const intro = translate(normalizeLanguageId(language), "proposalReviewIntro", {
    user: userLabel,
  });
  const lines = proposals.map(
    (proposal) =>
      `- ${proposal.proposalId}: ${proposal.targetGroupId} - ${proposal.preview} (${proposal.whyShared})`,
  );
  if (approvalCenterUrl) {
    lines.push("");
    lines.push(
      translate(normalizeLanguageId(language), "approvalCenterLink", {
        url: approvalCenterUrl,
      }),
    );
  }
  return [intro, ...lines].join("\n");
}

async function resolveApprovalCenterLinkForUser(params: {
  api: MaumauPluginApi;
  pluginConfig: MultiUserMemoryConfig;
  userId: string;
  ttlMinutes?: number;
}): Promise<{ url: string; expiresAt: number } | null> {
  if (!params.pluginConfig.users[params.userId]) {
    return null;
  }
  const ttlMs =
    params.ttlMinutes && Number.isFinite(params.ttlMinutes)
      ? Math.max(1, Math.floor(params.ttlMinutes)) * 60_000
      : DEFAULT_APPROVAL_LINK_TTL_MS;
  return buildApprovalCenterLink({
    cfg: params.api.config,
    pluginConfig: params.pluginConfig,
    stateDir: params.api.runtime.state.resolveStateDir(),
    userId: params.userId,
    ttlMs,
  });
}

function isAdminPrincipal(params: {
  pluginConfig: MultiUserMemoryConfig;
  principal: ActivePrincipal | null;
  senderIsOwner: boolean;
}): boolean {
  if (params.senderIsOwner) {
    return true;
  }
  const userId = params.principal?.configuredUserId;
  return Boolean(userId && params.pluginConfig.adminUserIds.includes(userId));
}

function isCuratorAllowed(params: {
  pluginConfig: MultiUserMemoryConfig;
  principal: ActivePrincipal | null;
  senderIsOwner: boolean;
  agentId?: string;
}): boolean {
  return (
    isAdminPrincipal(params) ||
    Boolean(
      params.pluginConfig.curatorAgentId && params.agentId === params.pluginConfig.curatorAgentId,
    )
  );
}

function buildMemorySearchTool(params: {
  api: MaumauPluginApi;
  store: MultiUserMemoryStore;
  toolCtx: MaumauPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_search",
    label: "Memory Search",
    description:
      "Search scoped private, group, and global multi-user memory visible to the active sender.",
    parameters: SEARCH_SCHEMA,
    async execute(_toolCallId, rawParams) {
      const pluginConfig = resolveCurrentMultiUserMemoryConfig(params.api);
      const query = readStringParam(rawParams, "query", { required: true });
      const maxResults = readNumberParam(rawParams, "maxResults", { integer: true });
      const minScore = readNumberParam(rawParams, "minScore");
      const principal = resolveToolPrincipal({
        store: params.store,
        pluginConfig,
        toolCtx: params.toolCtx,
      });
      if (!principal) {
        return jsonResult({
          results: [],
          disabled: true,
          error: "No active user context is available for scoped memory search.",
        });
      }
      return jsonResult({
        results: params.store.search({
          query,
          maxResults: maxResults ?? undefined,
          minScore: minScore ?? undefined,
          scopeKeys: principal.scopeKeys,
        }),
        principal: {
          configuredUserId: principal.configuredUserId,
          provisionalUserId: principal.provisionalUserId,
          displayName: principal.displayName,
          language: principal.language,
        },
      });
    },
  };
}

function buildMemoryGetTool(params: {
  api: MaumauPluginApi;
  store: MultiUserMemoryStore;
  toolCtx: MaumauPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_get",
    label: "Memory Get",
    description: "Read one scoped multi-user memory item by synthetic path.",
    parameters: GET_SCHEMA,
    async execute(_toolCallId, rawParams) {
      const pluginConfig = resolveCurrentMultiUserMemoryConfig(params.api);
      const relPath = readStringParam(rawParams, "path", { required: true });
      const from = readNumberParam(rawParams, "from", { integer: true });
      const lines = readNumberParam(rawParams, "lines", { integer: true });
      const principal = resolveToolPrincipal({
        store: params.store,
        pluginConfig,
        toolCtx: params.toolCtx,
      });
      if (!principal) {
        return jsonResult({
          path: relPath,
          text: "",
          disabled: true,
          error: "No active user context is available for scoped memory reads.",
        });
      }
      return jsonResult(
        params.store.readScopedPath({
          relPath,
          scopeKeys: principal.scopeKeys,
          from: from ?? undefined,
          lines: lines ?? undefined,
        }),
      );
    },
  };
}

function buildAdminTools(params: {
  api: MaumauPluginApi;
  store: MultiUserMemoryStore;
  toolCtx: MaumauPluginToolContext;
}): AnyAgentTool[] {
  const pluginConfig = resolveCurrentMultiUserMemoryConfig(params.api);
  const principal = resolveToolPrincipal({
    store: params.store,
    pluginConfig,
    toolCtx: params.toolCtx,
  });
  const senderIsOwner = params.toolCtx.senderIsOwner === true;

  const requireAdmin = () => {
    if (!isAdminPrincipal({ pluginConfig, principal, senderIsOwner })) {
      throw new Error("Multi-user-memory admin access required.");
    }
  };

  const requireCurator = () => {
    if (
      !isCuratorAllowed({
        pluginConfig,
        principal,
        senderIsOwner,
        agentId: params.toolCtx.agentId,
      })
    ) {
      throw new Error("Curator access required.");
    }
  };

  return [
    {
      name: "multi_user_memory_admin_list_provisional",
      label: "Multi-User Memory: List Provisional Users",
      description: "List runtime-discovered provisional users that still need curation in config.",
      parameters: LIST_PROVISIONAL_SCHEMA,
      async execute() {
        requireAdmin();
        const provisional = listPendingProvisionalUsers(params.store, pluginConfig);
        if (provisional.length === 0) {
          return jsonResult({
            text: translate(normalizeLanguageId(principal?.language), "provisionalEmpty"),
            provisionalUsers: [],
          });
        }
        return jsonResult({ provisionalUsers: provisional });
      },
    },
    {
      name: "multi_user_memory_admin_explain_identity",
      label: "Multi-User Memory: Explain Identity",
      description: "Explain how one sender identity currently resolves in runtime state.",
      parameters: EXPLAIN_IDENTITY_SCHEMA,
      async execute(_toolCallId, rawParams) {
        requireAdmin();
        const channelId = readStringParam(rawParams, "channelId", { required: true });
        const senderId = readStringParam(rawParams, "senderId", { required: true });
        const accountId = readStringParam(rawParams, "accountId");
        const configuredMatch = resolveConfiguredUserMatch(pluginConfig, {
          channelId,
          accountId,
          senderId,
        });
        return jsonResult({
          configuredMatch: configuredMatch
            ? {
                userId: configuredMatch.userId,
                displayName: configuredMatch.user.displayName,
                preferredLanguage: configuredMatch.user.preferredLanguage,
              }
            : null,
          runtime: params.store.explainIdentity({ channelId, accountId, senderId }),
        });
      },
    },
    {
      name: "multi_user_memory_admin_export_user_snippet",
      label: "Multi-User Memory: Export User Snippet",
      description: "Generate a copy-ready config snippet for one provisional user.",
      parameters: EXPORT_PROVISIONAL_SCHEMA,
      async execute(_toolCallId, rawParams) {
        requireAdmin();
        const provisionalUserId = readStringParam(rawParams, "provisionalUserId", {
          required: true,
        });
        const displayName = readStringParam(rawParams, "displayName");
        const snippet = params.store.buildConfigSnippetForProvisional({
          provisionalUserId,
          displayName: displayName ?? undefined,
        });
        return jsonResult({
          provisionalUserId,
          snippet,
        });
      },
    },
    {
      name: "multi_user_memory_admin_list_proposals",
      label: "Multi-User Memory: List Proposals",
      description: "List pending and decided promotion proposals.",
      parameters: LIST_PROPOSALS_SCHEMA,
      async execute() {
        requireAdmin();
        return jsonResult({
          proposals: params.store.listPendingProposals(),
        });
      },
    },
    {
      name: "multi_user_memory_admin_generate_approval_link",
      label: "Multi-User Memory: Generate Approval Link",
      description:
        "Generate a signed approval-center link for one canonical user so they can review all pending sharing approvals.",
      parameters: GENERATE_APPROVAL_LINK_SCHEMA,
      async execute(_toolCallId, rawParams) {
        requireAdmin();
        const userId = readStringParam(rawParams, "userId", { required: true });
        const ttlMinutes = readNumberParam(rawParams, "ttlMinutes", { integer: true });
        if (!pluginConfig.users[userId]) {
          return jsonResult({
            userId,
            approvalCenterUrl: null,
            error: "Unknown canonical user id.",
          });
        }
        const approvalCenter = await resolveApprovalCenterLinkForUser({
          api: params.api,
          pluginConfig,
          userId,
          ttlMinutes: ttlMinutes ?? undefined,
        });
        if (!approvalCenter) {
          return jsonResult({
            userId,
            approvalCenterUrl: null,
            error:
              "Approval center URL is unavailable. Configure plugins.entries.multi-user-memory.config.approvalCenterBaseUrl or enable a reachable gateway URL.",
          });
        }
        const language =
          pluginConfig.users[userId]?.preferredLanguage ??
          principal?.language ??
          pluginConfig.defaultLanguage;
        return jsonResult({
          userId,
          approvalCenterUrl: approvalCenter.url,
          expiresAt: new Date(approvalCenter.expiresAt).toISOString(),
          text: translate(normalizeLanguageId(language), "approvalCenterLink", {
            url: approvalCenter.url,
          }),
        });
      },
    },
    {
      name: "multi_user_memory_admin_store",
      label: "Multi-User Memory: Store Scoped Item",
      description: "Add a manual scoped memory item to global, group, or private storage.",
      parameters: STORE_ITEM_SCHEMA,
      async execute(_toolCallId, rawParams) {
        requireAdmin();
        const scopeType = readStringParam(rawParams, "scopeType", { required: true });
        const scopeId = readStringParam(rawParams, "scopeId");
        const text = readStringParam(rawParams, "text", { required: true });
        const summary = readStringParam(rawParams, "summary");
        const kind = readStringParam(rawParams, "kind");
        if (scopeType !== "global" && !scopeId) {
          throw new Error("scopeId required for non-global items.");
        }
        const item = params.store.createMemoryItem({
          scopeType: scopeType as "global" | "group" | "private",
          scopeId: scopeId ?? "global",
          body: text,
          summary: summary ?? undefined,
          itemKind: kind ?? undefined,
          sourceUserId: principal?.configuredUserId,
        });
        return jsonResult({
          item,
          path:
            item.scopeType === "global"
              ? `global/${item.itemId}.md`
              : `${item.scopeType}/${item.scopeId}/${item.itemId}.md`,
        });
      },
    },
    {
      name: "multi_user_memory_curate",
      label: "Multi-User Memory: Curate Shared Proposals",
      description:
        "Review recent private memory items and propose narrowly-scoped shared facts that materially affect other users.",
      parameters: CURATE_SCHEMA,
      async execute(_toolCallId, rawParams) {
        requireCurator();
        const maxItems = readNumberParam(rawParams, "maxItems", { integer: true }) ?? 20;
        const candidates = params.store.listRecentPrivateItems(maxItems);
        const created: Array<{
          proposalId: string;
          sourceItemId: string;
          targetGroupId: string;
          whyShared: string;
        }> = [];
        for (const item of candidates) {
          if (!item.scopeId || params.store.hasPendingProposalForItem(item.itemId)) {
            continue;
          }
          const sourceUserId = item.scopeId;
          const impact = detectImpactCandidate(pluginConfig, {
            text: item.body,
            sourceUserId,
          });
          if (!impact) {
            continue;
          }
          const targetGroupId = resolveTargetGroup({
            config: pluginConfig,
            sourceUserId,
            affectedUserIds: impact.affectedUserIds,
          });
          if (!targetGroupId) {
            continue;
          }
          const proposal = params.store.createPromotionProposal({
            sourceItemId: item.itemId,
            sourceUserId,
            targetGroupId,
            whyShared: impact.whyShared,
            preview: trimPreview(item.body),
            sensitivity: impact.sensitivity,
            affectedUserIds: impact.affectedUserIds,
          });
          created.push({
            proposalId: proposal.proposalId,
            sourceItemId: proposal.sourceItemId,
            targetGroupId: proposal.targetGroupId,
            whyShared: proposal.whyShared,
          });
        }
        return jsonResult({
          created,
          text: created.map((entry) =>
            translate(normalizeLanguageId(principal?.language), "proposalQueued", {
              proposalId: entry.proposalId,
              groupId: entry.targetGroupId,
              reason: entry.whyShared,
            }),
          ),
        });
      },
    },
  ];
}

function buildApprovalTools(params: {
  api: MaumauPluginApi;
  store: MultiUserMemoryStore;
  toolCtx: MaumauPluginToolContext;
}): AnyAgentTool[] {
  const pluginConfig = resolveCurrentMultiUserMemoryConfig(params.api);
  const principal = resolveToolPrincipal({
    store: params.store,
    pluginConfig,
    toolCtx: params.toolCtx,
  });

  return [
    {
      name: "multi_user_memory_review_proposals",
      label: "Multi-User Memory: Review My Proposals",
      description: "List pending promotion proposals that require the current user's approval.",
      parameters: LIST_PROPOSALS_SCHEMA,
      async execute() {
        if (!principal?.configuredUserId) {
          return jsonResult({
            text: translate(normalizeLanguageId(principal?.language), "proposalListEmpty"),
            proposals: [],
          });
        }
        const proposals = params.store.listPendingProposalsForUser(principal.configuredUserId);
        if (proposals.length === 0) {
          return jsonResult({
            text: translate(normalizeLanguageId(principal.language), "proposalListEmpty"),
            proposals: [],
          });
        }
        const approvalCenter = await resolveApprovalCenterLinkForUser({
          api: params.api,
          pluginConfig,
          userId: principal.configuredUserId,
        });
        return jsonResult({
          text: formatProposalList(
            principal.language,
            proposals,
            principal.displayName,
            approvalCenter?.url,
          ),
          proposals,
          approvalCenterUrl: approvalCenter?.url ?? null,
          approvalCenterExpiresAt: approvalCenter
            ? new Date(approvalCenter.expiresAt).toISOString()
            : null,
        });
      },
    },
    {
      name: "multi_user_memory_approve_proposal",
      label: "Multi-User Memory: Approve Proposal",
      description: "Approve one pending promotion proposal addressed to the current user.",
      parameters: DECIDE_PROPOSAL_SCHEMA,
      async execute(_toolCallId, rawParams) {
        const proposalId = readStringParam(rawParams, "proposalId", { required: true });
        const note = readStringParam(rawParams, "note");
        const proposal = params.store.getProposal(proposalId);
        if (!proposal) {
          return jsonResult({
            text: translate(normalizeLanguageId(principal?.language), "proposalNotFound"),
            proposal: null,
          });
        }
        if (!principal?.configuredUserId || proposal.sourceUserId !== principal.configuredUserId) {
          return jsonResult({
            text: translate(normalizeLanguageId(principal?.language), "proposalApproveDenied"),
            proposal,
          });
        }
        if (proposal.status !== "pending") {
          return jsonResult({
            text: translate(normalizeLanguageId(principal.language), "proposalAlreadyDecided"),
            proposal,
          });
        }
        const decided = params.store.decideProposal({
          proposalId,
          userId: principal.configuredUserId,
          action: "approve",
          note: note ?? undefined,
        });
        return jsonResult({
          text: translate(normalizeLanguageId(principal.language), "proposalApproved", {
            proposalId,
          }),
          proposal: decided?.proposal ?? proposal,
          approvedItem: decided?.approvedItem,
        });
      },
    },
    {
      name: "multi_user_memory_reject_proposal",
      label: "Multi-User Memory: Reject Proposal",
      description: "Reject one pending promotion proposal addressed to the current user.",
      parameters: DECIDE_PROPOSAL_SCHEMA,
      async execute(_toolCallId, rawParams) {
        const proposalId = readStringParam(rawParams, "proposalId", { required: true });
        const note = readStringParam(rawParams, "note");
        const proposal = params.store.getProposal(proposalId);
        if (!proposal) {
          return jsonResult({
            text: translate(normalizeLanguageId(principal?.language), "proposalNotFound"),
            proposal: null,
          });
        }
        if (!principal?.configuredUserId || proposal.sourceUserId !== principal.configuredUserId) {
          return jsonResult({
            text: translate(normalizeLanguageId(principal?.language), "proposalApproveDenied"),
            proposal,
          });
        }
        if (proposal.status !== "pending") {
          return jsonResult({
            text: translate(normalizeLanguageId(principal.language), "proposalAlreadyDecided"),
            proposal,
          });
        }
        const decided = params.store.decideProposal({
          proposalId,
          userId: principal.configuredUserId,
          action: "reject",
          note: note ?? undefined,
        });
        return jsonResult({
          text: translate(normalizeLanguageId(principal.language), "proposalRejected", {
            proposalId,
          }),
          proposal: decided?.proposal ?? proposal,
        });
      },
    },
  ];
}

function buildPromptSection(params: {
  availableTools: Set<string>;
  citationsMode?: "auto" | "on" | "off";
}): string[] {
  const hasSearch = params.availableTools.has("memory_search");
  const hasGet = params.availableTools.has("memory_get");
  if (!hasSearch && !hasGet) {
    return [];
  }
  const lines = [
    "## Multi-User Memory",
    hasSearch && hasGet
      ? "Before answering about people, shared plans, preferences, or prior family context: run memory_search first, then memory_get only for the exact scoped items you need."
      : hasSearch
        ? "Before answering about people, shared plans, preferences, or prior family context: run memory_search and answer only from the scoped results you can justify."
        : "Use memory_get only when the user already points to a specific scoped memory path.",
    "The active memory plugin already filters private, group, and global scopes for the current sender. Never assume you can see another user's private memory.",
  ];
  if (params.citationsMode !== "off") {
    lines.push("When helpful, include the synthetic Source path for retrieved memory items.");
  }
  lines.push("");
  return lines;
}

export default definePluginEntry({
  id: "multi-user-memory",
  name: "Multi-User Memory",
  description: "Scoped multi-user memory with private, shared-group, and approval-aware recall.",
  kind: "memory",
  register(api) {
    const store = resolveScopedStore(api);
    api.logger.info(`multi-user-memory: plugin registered (db: ${store.dbPath})`);

    api.registerMemoryPromptSection(buildPromptSection);
    api.registerHttpRoute({
      path: APPROVAL_CENTER_PATH,
      auth: "plugin",
      match: "exact",
      handler: createApprovalCenterHttpHandler({ api, store }),
    });
    api.registerHttpRoute({
      path: ADMIN_API_PATH,
      auth: "gateway",
      match: "exact",
      handler: createAdminApiHttpHandler({ api, store }),
    });

    api.on("before_prompt_build", async (event, ctx) => {
      const principal = await handlePrincipalTurn({
        api,
        store,
        event,
        ctx,
      }).catch((err: unknown) => {
        api.logger.warn?.(`multi-user-memory: failed resolving principal context: ${String(err)}`);
        return null;
      });
      if (!principal) {
        return undefined;
      }
      let pendingApprovalPrompt: string | undefined;
      if (principal.configuredUserId) {
        const proposals = store.listPendingProposalsForUser(principal.configuredUserId);
        if (proposals.length > 0) {
          const approvalCenter = await resolveApprovalCenterLinkForUser({
            api,
            pluginConfig: resolveCurrentMultiUserMemoryConfig(api),
            userId: principal.configuredUserId,
          }).catch(() => null);
          pendingApprovalPrompt = translate(
            normalizeLanguageId(principal.language),
            approvalCenter?.url ? "principalPendingApprovalsWithLink" : "principalPendingApprovals",
            {
              count: proposals.length,
              url: approvalCenter?.url ?? "",
            },
          );
        }
      }
      return {
        prependSystemContext: buildPrincipalPrompt(principal, pendingApprovalPrompt),
      };
    });

    api.registerTool((toolCtx) => buildMemorySearchTool({ api, store, toolCtx }), {
      names: ["memory_search"],
    });

    api.registerTool((toolCtx) => buildMemoryGetTool({ api, store, toolCtx }), {
      names: ["memory_get"],
    });

    api.registerTool((toolCtx) => buildAdminTools({ api, store, toolCtx }));
    api.registerTool((toolCtx) => buildApprovalTools({ api, store, toolCtx }));
  },
});
