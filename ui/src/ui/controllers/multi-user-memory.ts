import {
  DEFAULT_LANGUAGE_ID,
  LANGUAGE_CATALOG,
  normalizeLanguageId,
  type LanguageId,
} from "../../../../src/i18n/languages.ts";
import { buildGatewayHttpHeaders } from "../app-channels.ts";
import { normalizeBasePath } from "../navigation.ts";
import type { UiSettings } from "../storage.ts";
import { cloneConfigObject, serializeConfigForm } from "./config/form-utils.ts";

export const MULTI_USER_MEMORY_ADMIN_API_PATH = "/api/plugins/multi-user-memory/admin";

export type MultiUserMemoryIdentity = {
  label?: string;
  channelId: string;
  accountId?: string;
  senderId: string;
  senderName?: string;
  senderUsername?: string;
};

export type MultiUserMemoryUser = {
  id: string;
  displayName?: string;
  preferredLanguage: LanguageId;
  identities: MultiUserMemoryIdentity[];
  active: boolean;
  notes?: string;
};

export type MultiUserMemoryGroup = {
  id: string;
  label?: string;
  parentGroupIds: string[];
  memberUserIds: string[];
  active: boolean;
  description?: string;
};

export type MultiUserMemoryConfigState = {
  slotSelected: boolean;
  entryConfigured: boolean;
  enabled: boolean;
  autoDiscover: boolean;
  defaultLanguage: LanguageId;
  approvalCenterBaseUrl?: string;
  approvalDelivery: {
    mode: "same_session" | "same_channel" | "disabled";
    channelId?: string;
    accountId?: string;
    to?: string;
  };
  curatorAgentId?: string;
  adminUserIds: string[];
  users: MultiUserMemoryUser[];
  groups: MultiUserMemoryGroup[];
};

export type MultiUserMemoryAdminSnapshot = {
  plugin: {
    slotSelected: boolean;
    entryConfigured: boolean;
    enabled: boolean;
    autoDiscover: boolean;
    defaultLanguage: LanguageId;
  };
  provisionalUsers: Array<{
    provisionalUserId: string;
    channelId: string;
    accountId?: string;
    senderId: string;
    senderName?: string;
    senderUsername?: string;
    firstSeenAt: number;
    lastSeenAt: number;
    messageCount: number;
  }>;
  proposals: Array<{
    proposalId: string;
    sourceItemId: string;
    sourceUserId: string;
    targetGroupId: string;
    whyShared: string;
    preview: string;
    sensitivity?: string;
    affectedUserIds: string[];
    status: "pending" | "approved" | "rejected";
    createdAt: number;
    decidedAt?: number;
    decidedByUserId?: string;
    approvedItemId?: string;
  }>;
};

type ConfigHost = {
  basePath: string;
  connected: boolean;
  configForm: Record<string, unknown> | null;
  configSnapshot: { config?: unknown } | null;
  configFormMode: "form" | "raw";
  configRaw: string;
  configFormDirty: boolean;
  settings: Pick<UiSettings, "token">;
  password: string;
  hello: { auth?: { deviceToken?: string } } | null;
  multiUserMemoryLoading: boolean;
  multiUserMemoryError: string | null;
  multiUserMemoryAdmin: MultiUserMemoryAdminSnapshot | null;
  multiUserMemoryNewUserId: string;
  multiUserMemoryNewUserDisplayName: string;
  multiUserMemoryNewUserLanguage: LanguageId;
  multiUserMemoryNewUserIdentities: MultiUserMemoryIdentity[];
  multiUserMemoryNewGroupId: string;
  multiUserMemoryNewGroupLabel: string;
};

type MultiUserMemoryCreateUserInput = {
  userId: string;
  displayName?: string;
  preferredLanguage?: string;
  identities?: MultiUserMemoryIdentity[];
};

type MultiUserMemoryCreateGroupInput = {
  groupId: string;
  label?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeOptionalString(value: unknown): string | undefined {
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
    const normalized = normalizeOptionalString(entry);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    items.push(normalized);
  }
  return items;
}

function normalizeLanguageInput(
  value: unknown,
  fallback: LanguageId = DEFAULT_LANGUAGE_ID,
): LanguageId {
  return normalizeLanguageId(normalizeOptionalString(value)) ?? fallback;
}

function normalizeApiErrorMessage(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const nestedMessage = normalizeOptionalString(record.message);
    if (nestedMessage) {
      return nestedMessage;
    }
    const nestedType = normalizeOptionalString(record.type);
    if (nestedType) {
      return nestedType;
    }
  }
  return fallback;
}

function normalizeIdentities(value: unknown): MultiUserMemoryIdentity[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const identities: MultiUserMemoryIdentity[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) {
      continue;
    }
    identities.push({
      label: normalizeOptionalString(record?.label),
      channelId: normalizeOptionalString(record?.channelId) ?? "",
      accountId: normalizeOptionalString(record?.accountId),
      senderId: normalizeOptionalString(record?.senderId) ?? "",
      senderName: normalizeOptionalString(record?.senderName),
      senderUsername: normalizeOptionalString(record?.senderUsername),
    });
  }
  return identities;
}

function normalizeUsers(value: unknown): MultiUserMemoryUser[] {
  const record = asRecord(value);
  if (!record) {
    return [];
  }
  const users: MultiUserMemoryUser[] = [];
  for (const [id, raw] of Object.entries(record)) {
    const user = asRecord(raw);
    if (!id.trim() || !user) {
      continue;
    }
    users.push({
      id,
      displayName: normalizeOptionalString(user.displayName),
      preferredLanguage: normalizeLanguageInput(user.preferredLanguage),
      identities: normalizeIdentities(user.identities),
      active: user.active !== false,
      notes: normalizeOptionalString(user.notes),
    });
  }
  return users.toSorted((left, right) =>
    (left.displayName ?? left.id).localeCompare(right.displayName ?? right.id, undefined, {
      sensitivity: "base",
    }),
  );
}

function normalizeGroups(value: unknown): MultiUserMemoryGroup[] {
  const record = asRecord(value);
  if (!record) {
    return [];
  }
  const groups: MultiUserMemoryGroup[] = [];
  for (const [id, raw] of Object.entries(record)) {
    const group = asRecord(raw);
    if (!id.trim() || !group) {
      continue;
    }
    groups.push({
      id,
      label: normalizeOptionalString(group.label),
      parentGroupIds: normalizeStringArray(group.parentGroupIds),
      memberUserIds: normalizeStringArray(group.memberUserIds),
      active: group.active !== false,
      description: normalizeOptionalString(group.description),
    });
  }
  return groups.toSorted((left, right) =>
    (left.label ?? left.id).localeCompare(right.label ?? right.id, undefined, {
      sensitivity: "base",
    }),
  );
}

function resolveConfigRoot(
  host: Pick<ConfigHost, "configForm" | "configSnapshot">,
): Record<string, unknown> {
  const source = host.configForm ?? asRecord(host.configSnapshot?.config) ?? {};
  return cloneConfigObject(source);
}

function hasLoadedConfigRoot(host: Pick<ConfigHost, "configForm" | "configSnapshot">): boolean {
  return Boolean(host.configForm) || Boolean(asRecord(host.configSnapshot?.config));
}

function commitConfigRoot(
  host: Pick<ConfigHost, "configForm" | "configFormMode" | "configRaw" | "configFormDirty">,
  nextConfig: Record<string, unknown>,
): void {
  host.configForm = nextConfig;
  host.configFormDirty = true;
  if (host.configFormMode === "form") {
    host.configRaw = serializeConfigForm(nextConfig);
  }
}

function ensureNestedRecord(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const existing = asRecord(parent[key]);
  if (existing) {
    return existing;
  }
  const created: Record<string, unknown> = {};
  parent[key] = created;
  return created;
}

function withPluginConfig(
  host: Pick<
    ConfigHost,
    "configForm" | "configSnapshot" | "configFormMode" | "configRaw" | "configFormDirty"
  >,
  updater: (pluginConfig: Record<string, unknown>, root: Record<string, unknown>) => void,
): void {
  const root = resolveConfigRoot(host);
  const plugins = ensureNestedRecord(root, "plugins");
  const entries = ensureNestedRecord(plugins, "entries");
  const entry = ensureNestedRecord(entries, "multi-user-memory");
  const pluginConfig = ensureNestedRecord(entry, "config");
  updater(pluginConfig, root);
  commitConfigRoot(host, root);
}

export function resolveMultiUserMemoryConfigState(
  configRoot: Record<string, unknown> | null,
): MultiUserMemoryConfigState {
  const root = configRoot ?? {};
  const plugins = asRecord(root.plugins);
  const entry = asRecord(asRecord(plugins?.entries)?.["multi-user-memory"]);
  const record = asRecord(entry?.config) ?? {};
  const delivery = asRecord(record.approvalDelivery) ?? {};
  const mode = normalizeOptionalString(delivery.mode);
  return {
    slotSelected: asRecord(plugins?.slots)?.memory === "multi-user-memory",
    entryConfigured: Boolean(entry),
    enabled: record.enabled !== false,
    autoDiscover: record.autoDiscover !== false,
    defaultLanguage: normalizeLanguageInput(record.defaultLanguage),
    approvalCenterBaseUrl: normalizeOptionalString(record.approvalCenterBaseUrl),
    approvalDelivery: {
      mode: mode === "same_channel" || mode === "disabled" ? mode : "same_session",
      channelId: normalizeOptionalString(delivery.channelId),
      accountId: normalizeOptionalString(delivery.accountId),
      to: normalizeOptionalString(delivery.to),
    },
    curatorAgentId: normalizeOptionalString(record.curatorAgentId),
    adminUserIds: normalizeStringArray(record.adminUserIds),
    users: normalizeUsers(record.users),
    groups: normalizeGroups(record.groups),
  };
}

export async function loadMultiUserMemoryAdmin(host: ConfigHost) {
  if (!host.connected) {
    return;
  }
  host.multiUserMemoryLoading = true;
  host.multiUserMemoryError = null;
  try {
    const basePath = normalizeBasePath(host.basePath ?? "");
    const url = basePath
      ? `${basePath}${MULTI_USER_MEMORY_ADMIN_API_PATH}`
      : MULTI_USER_MEMORY_ADMIN_API_PATH;
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...buildGatewayHttpHeaders(host),
      },
      credentials: "same-origin",
    });
    if (response.status === 404) {
      host.multiUserMemoryAdmin = null;
      host.multiUserMemoryError = null;
      return;
    }
    const payload = (await response.json().catch(() => null)) as
      | ({ ok?: boolean; error?: string } & Partial<MultiUserMemoryAdminSnapshot>)
      | null;
    if (!response.ok || payload?.ok === false || !payload) {
      host.multiUserMemoryError = normalizeApiErrorMessage(
        payload?.error,
        `Multi-user memory admin request failed (${response.status})`,
      );
      host.multiUserMemoryAdmin = null;
      return;
    }
    host.multiUserMemoryAdmin = {
      plugin: {
        slotSelected: payload.plugin?.slotSelected === true,
        entryConfigured: payload.plugin?.entryConfigured === true,
        enabled: payload.plugin?.enabled !== false,
        autoDiscover: payload.plugin?.autoDiscover !== false,
        defaultLanguage: normalizeLanguageInput(payload.plugin?.defaultLanguage),
      },
      provisionalUsers: Array.isArray(payload.provisionalUsers) ? payload.provisionalUsers : [],
      proposals: Array.isArray(payload.proposals) ? payload.proposals : [],
    };
    if (!hasLoadedConfigRoot(host)) {
      return;
    }
    const currentConfig = resolveMultiUserMemoryConfigState(resolveConfigRoot(host));
    if (
      currentConfig.users.length === 0 &&
      host.multiUserMemoryAdmin.provisionalUsers.length === 1
    ) {
      bootstrapMultiUserMemoryFirstUserFromProvisional(
        host,
        host.multiUserMemoryAdmin.provisionalUsers[0],
        currentConfig,
      );
    }
  } catch (err) {
    host.multiUserMemoryError = String(err);
    host.multiUserMemoryAdmin = null;
  } finally {
    host.multiUserMemoryLoading = false;
  }
}

export function enableMultiUserMemoryPlugin(host: ConfigHost): void {
  withPluginConfig(host, (_pluginConfig, root) => {
    const plugins = ensureNestedRecord(root, "plugins");
    const slots = ensureNestedRecord(plugins, "slots");
    slots.memory = "multi-user-memory";
  });
}

export function updateMultiUserMemoryTopLevel(
  host: ConfigHost,
  patch: Partial<{
    enabled: boolean;
    autoDiscover: boolean;
    defaultLanguage: string;
    approvalCenterBaseUrl: string;
    curatorAgentId: string;
  }>,
): void {
  withPluginConfig(host, (pluginConfig) => {
    if (typeof patch.enabled === "boolean") {
      pluginConfig.enabled = patch.enabled;
    }
    if (typeof patch.autoDiscover === "boolean") {
      pluginConfig.autoDiscover = patch.autoDiscover;
    }
    if (patch.defaultLanguage !== undefined) {
      pluginConfig.defaultLanguage = normalizeLanguageInput(patch.defaultLanguage);
    }
    if (patch.approvalCenterBaseUrl !== undefined) {
      const value = normalizeOptionalString(patch.approvalCenterBaseUrl);
      if (value) {
        pluginConfig.approvalCenterBaseUrl = value;
      } else {
        delete pluginConfig.approvalCenterBaseUrl;
      }
    }
    if (patch.curatorAgentId !== undefined) {
      const value = normalizeOptionalString(patch.curatorAgentId);
      if (value) {
        pluginConfig.curatorAgentId = value;
      } else {
        delete pluginConfig.curatorAgentId;
      }
    }
  });
}

export function updateMultiUserMemoryApprovalDelivery(
  host: ConfigHost,
  patch: Partial<{
    mode: "same_session" | "same_channel" | "disabled";
    channelId: string;
    accountId: string;
    to: string;
  }>,
): void {
  withPluginConfig(host, (pluginConfig) => {
    const delivery = ensureNestedRecord(pluginConfig, "approvalDelivery");
    if (patch.mode) {
      delivery.mode = patch.mode;
    }
    for (const key of ["channelId", "accountId", "to"] as const) {
      const incoming = patch[key];
      if (incoming === undefined) {
        continue;
      }
      const value = normalizeOptionalString(incoming);
      if (value) {
        delivery[key] = value;
      } else {
        delete delivery[key];
      }
    }
  });
}

export function toggleMultiUserMemoryAdminUser(
  host: ConfigHost,
  userId: string,
  enabled: boolean,
): void {
  withPluginConfig(host, (pluginConfig) => {
    const adminUserIds = new Set(normalizeStringArray(pluginConfig.adminUserIds));
    if (enabled) {
      adminUserIds.add(userId);
    } else {
      adminUserIds.delete(userId);
    }
    pluginConfig.adminUserIds = [...adminUserIds];
  });
}

export function addMultiUserMemoryUser(
  host: ConfigHost,
  input: MultiUserMemoryCreateUserInput,
): void {
  const userId = normalizeOptionalString(input.userId);
  if (!userId) {
    return;
  }
  withPluginConfig(host, (pluginConfig) => {
    const users = ensureNestedRecord(pluginConfig, "users");
    const isFirstUser = Object.keys(users).length === 0;
    users[userId] = {
      displayName: normalizeOptionalString(input.displayName),
      preferredLanguage: normalizeLanguageInput(input.preferredLanguage),
      identities: input.identities ?? [],
      active: true,
    };
    if (isFirstUser) {
      pluginConfig.adminUserIds = [userId];
    }
  });
}

export function updateMultiUserMemoryUser(
  host: ConfigHost,
  userId: string,
  patch: Partial<{
    displayName: string;
    preferredLanguage: string;
    active: boolean;
    notes: string;
  }>,
): void {
  withPluginConfig(host, (pluginConfig) => {
    const users = ensureNestedRecord(pluginConfig, "users");
    const user = ensureNestedRecord(users, userId);
    if (patch.displayName !== undefined) {
      const value = normalizeOptionalString(patch.displayName);
      if (value) {
        user.displayName = value;
      } else {
        delete user.displayName;
      }
    }
    if (patch.preferredLanguage !== undefined) {
      user.preferredLanguage = normalizeLanguageInput(patch.preferredLanguage);
    }
    if (typeof patch.active === "boolean") {
      user.active = patch.active;
    }
    if (patch.notes !== undefined) {
      const value = normalizeOptionalString(patch.notes);
      if (value) {
        user.notes = value;
      } else {
        delete user.notes;
      }
    }
  });
}

export function removeMultiUserMemoryUser(host: ConfigHost, userId: string): void {
  withPluginConfig(host, (pluginConfig) => {
    const users = ensureNestedRecord(pluginConfig, "users");
    delete users[userId];
    pluginConfig.adminUserIds = normalizeStringArray(pluginConfig.adminUserIds).filter(
      (entry) => entry !== userId,
    );
    const groups = asRecord(pluginConfig.groups) ?? {};
    for (const rawGroup of Object.values(groups)) {
      const group = asRecord(rawGroup);
      if (!group) {
        continue;
      }
      group.memberUserIds = normalizeStringArray(group.memberUserIds).filter(
        (entry) => entry !== userId,
      );
    }
  });
}

export function addMultiUserMemoryIdentity(
  host: ConfigHost,
  userId: string,
  identity?: Partial<MultiUserMemoryIdentity>,
): void {
  withPluginConfig(host, (pluginConfig) => {
    const users = ensureNestedRecord(pluginConfig, "users");
    const user = ensureNestedRecord(users, userId);
    const current = normalizeIdentities(user.identities);
    current.push({
      label: normalizeOptionalString(identity?.label),
      channelId: normalizeOptionalString(identity?.channelId) ?? "",
      accountId: normalizeOptionalString(identity?.accountId),
      senderId: normalizeOptionalString(identity?.senderId) ?? "",
      senderName: normalizeOptionalString(identity?.senderName),
      senderUsername: normalizeOptionalString(identity?.senderUsername),
    });
    user.identities = current;
  });
}

export function addMultiUserMemoryDraftIdentity(
  host: Pick<ConfigHost, "multiUserMemoryNewUserIdentities">,
  identity?: Partial<MultiUserMemoryIdentity>,
): void {
  host.multiUserMemoryNewUserIdentities = [
    ...host.multiUserMemoryNewUserIdentities,
    {
      label: normalizeOptionalString(identity?.label),
      channelId: normalizeOptionalString(identity?.channelId) ?? "",
      accountId: normalizeOptionalString(identity?.accountId),
      senderId: normalizeOptionalString(identity?.senderId) ?? "",
      senderName: normalizeOptionalString(identity?.senderName),
      senderUsername: normalizeOptionalString(identity?.senderUsername),
    },
  ];
}

export function updateMultiUserMemoryDraftIdentity(
  host: Pick<ConfigHost, "multiUserMemoryNewUserIdentities">,
  index: number,
  patch: Partial<Record<keyof MultiUserMemoryIdentity, string>>,
): void {
  const current = normalizeIdentities(host.multiUserMemoryNewUserIdentities);
  const existing = current[index];
  if (!existing) {
    return;
  }
  const next: MultiUserMemoryIdentity = { ...existing };
  for (const key of [
    "label",
    "channelId",
    "accountId",
    "senderId",
    "senderName",
    "senderUsername",
  ] as const) {
    if (patch[key] === undefined) {
      continue;
    }
    const value = normalizeOptionalString(patch[key]);
    if (key === "channelId" || key === "senderId") {
      next[key] = value ?? "";
    } else if (value) {
      next[key] = value;
    } else {
      delete next[key];
    }
  }
  current[index] = next;
  host.multiUserMemoryNewUserIdentities = current;
}

export function removeMultiUserMemoryDraftIdentity(
  host: Pick<ConfigHost, "multiUserMemoryNewUserIdentities">,
  index: number,
): void {
  const current = normalizeIdentities(host.multiUserMemoryNewUserIdentities);
  current.splice(index, 1);
  host.multiUserMemoryNewUserIdentities = current;
}

export function updateMultiUserMemoryIdentity(
  host: ConfigHost,
  userId: string,
  index: number,
  patch: Partial<Record<keyof MultiUserMemoryIdentity, string>>,
): void {
  withPluginConfig(host, (pluginConfig) => {
    const users = ensureNestedRecord(pluginConfig, "users");
    const user = ensureNestedRecord(users, userId);
    const current = normalizeIdentities(user.identities);
    const existing = current[index];
    if (!existing) {
      return;
    }
    const next: MultiUserMemoryIdentity = { ...existing };
    for (const key of [
      "label",
      "channelId",
      "accountId",
      "senderId",
      "senderName",
      "senderUsername",
    ] as const) {
      if (patch[key] === undefined) {
        continue;
      }
      const value = normalizeOptionalString(patch[key]);
      if (key === "channelId" || key === "senderId") {
        next[key] = value ?? "";
      } else if (value) {
        next[key] = value;
      } else {
        delete next[key];
      }
    }
    current[index] = next;
    user.identities = current;
  });
}

export function removeMultiUserMemoryIdentity(
  host: ConfigHost,
  userId: string,
  index: number,
): void {
  withPluginConfig(host, (pluginConfig) => {
    const users = ensureNestedRecord(pluginConfig, "users");
    const user = ensureNestedRecord(users, userId);
    const current = normalizeIdentities(user.identities);
    current.splice(index, 1);
    user.identities = current;
  });
}

export function addMultiUserMemoryGroup(
  host: ConfigHost,
  input: MultiUserMemoryCreateGroupInput,
): void {
  const groupId = normalizeOptionalString(input.groupId);
  if (!groupId) {
    return;
  }
  withPluginConfig(host, (pluginConfig) => {
    const groups = ensureNestedRecord(pluginConfig, "groups");
    groups[groupId] = {
      label: normalizeOptionalString(input.label),
      parentGroupIds: [],
      memberUserIds: [],
      active: true,
    };
  });
}

export function updateMultiUserMemoryGroup(
  host: ConfigHost,
  groupId: string,
  patch: Partial<{
    label: string;
    active: boolean;
    description: string;
  }>,
): void {
  withPluginConfig(host, (pluginConfig) => {
    const groups = ensureNestedRecord(pluginConfig, "groups");
    const group = ensureNestedRecord(groups, groupId);
    if (patch.label !== undefined) {
      const value = normalizeOptionalString(patch.label);
      if (value) {
        group.label = value;
      } else {
        delete group.label;
      }
    }
    if (typeof patch.active === "boolean") {
      group.active = patch.active;
    }
    if (patch.description !== undefined) {
      const value = normalizeOptionalString(patch.description);
      if (value) {
        group.description = value;
      } else {
        delete group.description;
      }
    }
  });
}

export function removeMultiUserMemoryGroup(host: ConfigHost, groupId: string): void {
  withPluginConfig(host, (pluginConfig) => {
    const groups = ensureNestedRecord(pluginConfig, "groups");
    delete groups[groupId];
    for (const rawGroup of Object.values(groups)) {
      const group = asRecord(rawGroup);
      if (!group) {
        continue;
      }
      group.parentGroupIds = normalizeStringArray(group.parentGroupIds).filter(
        (entry) => entry !== groupId,
      );
    }
  });
}

export function toggleMultiUserMemoryGroupMember(
  host: ConfigHost,
  groupId: string,
  userId: string,
  enabled: boolean,
): void {
  withPluginConfig(host, (pluginConfig) => {
    const groups = ensureNestedRecord(pluginConfig, "groups");
    const group = ensureNestedRecord(groups, groupId);
    const members = new Set(normalizeStringArray(group.memberUserIds));
    if (enabled) {
      members.add(userId);
    } else {
      members.delete(userId);
    }
    group.memberUserIds = [...members];
  });
}

export function toggleMultiUserMemoryGroupParent(
  host: ConfigHost,
  groupId: string,
  parentGroupId: string,
  enabled: boolean,
): void {
  if (groupId === parentGroupId) {
    return;
  }
  withPluginConfig(host, (pluginConfig) => {
    const groups = ensureNestedRecord(pluginConfig, "groups");
    const group = ensureNestedRecord(groups, groupId);
    const parents = new Set(normalizeStringArray(group.parentGroupIds));
    if (enabled) {
      parents.add(parentGroupId);
    } else {
      parents.delete(parentGroupId);
    }
    group.parentGroupIds = [...parents];
  });
}

function slugifyIdentifier(
  value: string,
  fallbackPrefix: string,
  existingIds: Set<string>,
): string {
  const base =
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || fallbackPrefix;
  if (!existingIds.has(base)) {
    return base;
  }
  let counter = 2;
  while (existingIds.has(`${base}-${counter}`)) {
    counter += 1;
  }
  return `${base}-${counter}`;
}

function userLabelFromProvisional(
  provisional: MultiUserMemoryAdminSnapshot["provisionalUsers"][number],
): string {
  return (
    provisional.senderName?.trim() ||
    provisional.senderUsername?.trim() ||
    provisional.senderId.trim() ||
    provisional.provisionalUserId
  );
}

function userIdentityFromProvisional(
  provisional: MultiUserMemoryAdminSnapshot["provisionalUsers"][number],
): MultiUserMemoryIdentity {
  return {
    channelId: provisional.channelId,
    accountId: provisional.accountId,
    senderId: provisional.senderId,
    senderName: provisional.senderName,
    senderUsername: provisional.senderUsername,
  };
}

function bootstrapMultiUserMemoryFirstUserFromProvisional(
  host: ConfigHost,
  provisional: MultiUserMemoryAdminSnapshot["provisionalUsers"][number],
  currentConfig: MultiUserMemoryConfigState,
): void {
  if (currentConfig.users.length > 0) {
    return;
  }
  const label = userLabelFromProvisional(provisional);
  const userId = slugifyIdentifier(
    label,
    "user",
    new Set(currentConfig.users.map((entry) => entry.id)),
  );
  addMultiUserMemoryUser(host, {
    userId,
    displayName: label,
    preferredLanguage: currentConfig.defaultLanguage,
    identities: [userIdentityFromProvisional(provisional)],
  });
  clearMultiUserMemoryUserDraft(host);
}

export function prefillMultiUserMemoryUserDraftFromProvisional(
  host: Pick<
    ConfigHost,
    | "multiUserMemoryNewUserId"
    | "multiUserMemoryNewUserDisplayName"
    | "multiUserMemoryNewUserLanguage"
    | "multiUserMemoryNewUserIdentities"
  >,
  provisional: MultiUserMemoryAdminSnapshot["provisionalUsers"][number],
  currentConfig: MultiUserMemoryConfigState,
): void {
  const label = userLabelFromProvisional(provisional);
  host.multiUserMemoryNewUserDisplayName = label;
  host.multiUserMemoryNewUserLanguage = currentConfig.defaultLanguage;
  host.multiUserMemoryNewUserId = slugifyIdentifier(
    label,
    "user",
    new Set(currentConfig.users.map((entry) => entry.id)),
  );
  host.multiUserMemoryNewUserIdentities = [userIdentityFromProvisional(provisional)];
}

export function clearMultiUserMemoryUserDraft(
  host: Pick<
    ConfigHost,
    | "multiUserMemoryNewUserId"
    | "multiUserMemoryNewUserDisplayName"
    | "multiUserMemoryNewUserLanguage"
    | "multiUserMemoryNewUserIdentities"
  >,
): void {
  host.multiUserMemoryNewUserId = "";
  host.multiUserMemoryNewUserDisplayName = "";
  host.multiUserMemoryNewUserLanguage = DEFAULT_LANGUAGE_ID;
  host.multiUserMemoryNewUserIdentities = [];
}

export function clearMultiUserMemoryGroupDraft(
  host: Pick<ConfigHost, "multiUserMemoryNewGroupId" | "multiUserMemoryNewGroupLabel">,
): void {
  host.multiUserMemoryNewGroupId = "";
  host.multiUserMemoryNewGroupLabel = "";
}

export function createMultiUserMemoryUserFromDraft(
  host: ConfigHost,
  currentConfig: MultiUserMemoryConfigState,
): void {
  const label = normalizeOptionalString(host.multiUserMemoryNewUserDisplayName);
  const firstIdentity = host.multiUserMemoryNewUserIdentities[0];
  const fallbackLabel =
    firstIdentity?.senderName?.trim() ||
    firstIdentity?.senderUsername?.trim() ||
    firstIdentity?.senderId?.trim() ||
    undefined;
  const userId =
    normalizeOptionalString(host.multiUserMemoryNewUserId) ??
    slugifyIdentifier(
      label ?? fallbackLabel ?? "user",
      "user",
      new Set(currentConfig.users.map((entry) => entry.id)),
    );
  addMultiUserMemoryUser(host, {
    userId,
    displayName: label,
    preferredLanguage: host.multiUserMemoryNewUserLanguage,
    identities: normalizeIdentities(host.multiUserMemoryNewUserIdentities),
  });
  clearMultiUserMemoryUserDraft(host);
}

export function createMultiUserMemoryGroupFromDraft(
  host: ConfigHost,
  currentConfig: MultiUserMemoryConfigState,
): void {
  const label = normalizeOptionalString(host.multiUserMemoryNewGroupLabel);
  const groupId =
    normalizeOptionalString(host.multiUserMemoryNewGroupId) ??
    slugifyIdentifier(
      label ?? "group",
      "group",
      new Set(currentConfig.groups.map((entry) => entry.id)),
    );
  addMultiUserMemoryGroup(host, {
    groupId,
    label,
  });
  clearMultiUserMemoryGroupDraft(host);
}

export function createConfiguredUserFromProvisional(
  host: ConfigHost,
  currentConfig: MultiUserMemoryConfigState,
  provisional: MultiUserMemoryAdminSnapshot["provisionalUsers"][number],
): void {
  const label =
    host.multiUserMemoryNewUserDisplayName.trim() ||
    provisional.senderName?.trim() ||
    provisional.senderUsername?.trim() ||
    provisional.senderId.trim() ||
    provisional.provisionalUserId;
  const userId =
    normalizeOptionalString(host.multiUserMemoryNewUserId) ??
    slugifyIdentifier(label, "user", new Set(currentConfig.users.map((entry) => entry.id)));
  addMultiUserMemoryUser(host, {
    userId,
    displayName: label,
    preferredLanguage: host.multiUserMemoryNewUserLanguage,
    identities: [
      {
        channelId: provisional.channelId,
        accountId: provisional.accountId,
        senderId: provisional.senderId,
        senderName: provisional.senderName,
        senderUsername: provisional.senderUsername,
      },
    ],
  });
  clearMultiUserMemoryUserDraft(host);
}

export const MULTI_USER_MEMORY_LANGUAGE_OPTIONS = LANGUAGE_CATALOG.map((entry) => ({
  id: entry.id,
  label: entry.englishName,
}));
