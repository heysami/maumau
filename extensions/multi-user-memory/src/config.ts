import type { MaumauConfig } from "../api.js";
import { DEFAULT_LANGUAGE_ID, normalizeLanguageId, type SupportedLanguageId } from "./language.js";

export type MultiUserIdentityConfig = {
  label?: string;
  channelId: string;
  accountId?: string;
  senderId: string;
  senderName?: string;
  senderUsername?: string;
};

export type MultiUserConfigUser = {
  displayName?: string;
  preferredLanguage?: SupportedLanguageId;
  identities: MultiUserIdentityConfig[];
  active: boolean;
  notes?: string;
};

export type MultiUserConfigGroup = {
  label?: string;
  parentGroupIds: string[];
  memberUserIds: string[];
  active: boolean;
  description?: string;
};

export type MultiUserApprovalDelivery = {
  mode: "same_session" | "same_channel" | "disabled";
  channelId?: string;
  accountId?: string;
  to?: string;
};

export type MultiUserMemoryConfig = {
  enabled: boolean;
  autoDiscover: boolean;
  defaultLanguage: SupportedLanguageId;
  approvalCenterBaseUrl?: string;
  approvalDelivery: MultiUserApprovalDelivery;
  curatorAgentId?: string;
  adminUserIds: string[];
  users: Record<string, MultiUserConfigUser>;
  groups: Record<string, MultiUserConfigGroup>;
};

export type IdentityMatchParams = {
  channelId?: string;
  accountId?: string;
  senderId?: string;
  senderName?: string;
  senderUsername?: string;
};

export type ResolvedIdentityMatch = {
  userId: string;
  user: MultiUserConfigUser;
  identity: MultiUserIdentityConfig;
};

function normalizeTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const items: string[] = [];
  for (const entry of value) {
    const normalized = normalizeTrimmedString(entry);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    items.push(normalized);
  }
  return items;
}

function normalizeIdentities(value: unknown): MultiUserIdentityConfig[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const identities: MultiUserIdentityConfig[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const channelId = normalizeTrimmedString((entry as Record<string, unknown>).channelId);
    const senderId = normalizeTrimmedString((entry as Record<string, unknown>).senderId);
    if (!channelId || !senderId) {
      continue;
    }
    identities.push({
      label: normalizeTrimmedString((entry as Record<string, unknown>).label),
      channelId,
      accountId: normalizeTrimmedString((entry as Record<string, unknown>).accountId),
      senderId,
      senderName: normalizeTrimmedString((entry as Record<string, unknown>).senderName),
      senderUsername: normalizeTrimmedString((entry as Record<string, unknown>).senderUsername),
    });
  }
  return identities;
}

function normalizeUsers(value: unknown): Record<string, MultiUserConfigUser> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const users: Record<string, MultiUserConfigUser> = {};
  for (const [userIdRaw, userValue] of Object.entries(value)) {
    const userId = userIdRaw.trim();
    if (!userId || !userValue || typeof userValue !== "object" || Array.isArray(userValue)) {
      continue;
    }
    const record = userValue as Record<string, unknown>;
    users[userId] = {
      displayName: normalizeTrimmedString(record.displayName),
      preferredLanguage: normalizeLanguageId(normalizeTrimmedString(record.preferredLanguage)),
      identities: normalizeIdentities(record.identities),
      active: record.active !== false,
      notes: normalizeTrimmedString(record.notes),
    };
  }
  return users;
}

function normalizeGroups(value: unknown): Record<string, MultiUserConfigGroup> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const groups: Record<string, MultiUserConfigGroup> = {};
  for (const [groupIdRaw, groupValue] of Object.entries(value)) {
    const groupId = groupIdRaw.trim();
    if (!groupId || !groupValue || typeof groupValue !== "object" || Array.isArray(groupValue)) {
      continue;
    }
    const record = groupValue as Record<string, unknown>;
    groups[groupId] = {
      label: normalizeTrimmedString(record.label),
      parentGroupIds: normalizeStringArray(record.parentGroupIds),
      memberUserIds: normalizeStringArray(record.memberUserIds),
      active: record.active !== false,
      description: normalizeTrimmedString(record.description),
    };
  }
  return groups;
}

export function resolveMultiUserMemoryConfig(cfg: MaumauConfig): MultiUserMemoryConfig {
  const raw = cfg.plugins?.entries?.["multi-user-memory"]?.config;
  const record =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const deliveryRecord =
    record.approvalDelivery &&
    typeof record.approvalDelivery === "object" &&
    !Array.isArray(record.approvalDelivery)
      ? (record.approvalDelivery as Record<string, unknown>)
      : {};
  const modeRaw = normalizeTrimmedString(deliveryRecord.mode);
  return {
    enabled: record.enabled !== false,
    autoDiscover: record.autoDiscover !== false,
    defaultLanguage:
      normalizeLanguageId(normalizeTrimmedString(record.defaultLanguage)) ?? DEFAULT_LANGUAGE_ID,
    approvalCenterBaseUrl: normalizeTrimmedString(record.approvalCenterBaseUrl),
    approvalDelivery: {
      mode: modeRaw === "same_channel" || modeRaw === "disabled" ? modeRaw : "same_session",
      channelId: normalizeTrimmedString(deliveryRecord.channelId),
      accountId: normalizeTrimmedString(deliveryRecord.accountId),
      to: normalizeTrimmedString(deliveryRecord.to),
    },
    curatorAgentId: normalizeTrimmedString(record.curatorAgentId),
    adminUserIds: normalizeStringArray(record.adminUserIds),
    users: normalizeUsers(record.users),
    groups: normalizeGroups(record.groups),
  };
}

export function resolveConfiguredUserMatch(
  config: MultiUserMemoryConfig,
  params: IdentityMatchParams,
): ResolvedIdentityMatch | null {
  const channelId = normalizeTrimmedString(params.channelId)?.toLowerCase();
  const senderId = normalizeTrimmedString(params.senderId);
  if (!channelId || !senderId) {
    return null;
  }
  const accountId = normalizeTrimmedString(params.accountId);
  for (const [userId, user] of Object.entries(config.users)) {
    if (!user.active) {
      continue;
    }
    for (const identity of user.identities) {
      if (identity.channelId.toLowerCase() !== channelId) {
        continue;
      }
      if (identity.senderId !== senderId) {
        continue;
      }
      if ((identity.accountId ?? undefined) !== (accountId ?? undefined)) {
        continue;
      }
      return { userId, user, identity };
    }
  }
  return null;
}

export function resolveEffectiveGroupIds(config: MultiUserMemoryConfig, userId: string): string[] {
  const direct = new Set<string>();
  for (const [groupId, group] of Object.entries(config.groups)) {
    if (!group.active) {
      continue;
    }
    if (group.memberUserIds.includes(userId)) {
      direct.add(groupId);
    }
  }
  const effective = new Set<string>(direct);
  const pending = [...direct];
  while (pending.length > 0) {
    const current = pending.shift();
    if (!current) {
      continue;
    }
    const group = config.groups[current];
    if (!group?.active) {
      continue;
    }
    for (const parentGroupId of group.parentGroupIds) {
      const parent = config.groups[parentGroupId];
      if (!parent?.active || effective.has(parentGroupId)) {
        continue;
      }
      effective.add(parentGroupId);
      pending.push(parentGroupId);
    }
  }
  return [...effective];
}

export function resolveGroupsContainingUsers(
  config: MultiUserMemoryConfig,
  userIds: string[],
): string[] {
  if (userIds.length === 0) {
    return [];
  }
  const groupSets = userIds.map((userId) => new Set(resolveEffectiveGroupIds(config, userId)));
  const [head, ...rest] = groupSets;
  return [...head].filter((groupId) => rest.every((set) => set.has(groupId)));
}

export function pickNarrowestGroup(
  config: MultiUserMemoryConfig,
  groupIds: readonly string[],
): string | undefined {
  let best: { id: string; size: number } | null = null;
  for (const groupId of groupIds) {
    const group = config.groups[groupId];
    if (!group?.active) {
      continue;
    }
    const size = Math.max(1, group.memberUserIds.length);
    if (!best || size < best.size || (size === best.size && groupId < best.id)) {
      best = { id: groupId, size };
    }
  }
  return best?.id;
}

export function buildVisibleScopeKeys(params: {
  config: MultiUserMemoryConfig;
  userId?: string;
  provisionalIds?: string[];
}): string[] {
  const scopes = new Set<string>(["global"]);
  if (params.userId) {
    scopes.add(`private:${params.userId}`);
    for (const groupId of resolveEffectiveGroupIds(params.config, params.userId)) {
      scopes.add(`group:${groupId}`);
    }
  }
  for (const provisionalId of params.provisionalIds ?? []) {
    scopes.add(`provisional:${provisionalId}`);
  }
  return [...scopes];
}
