import type { MaumauConfig, MaumauPluginApi } from "../api.js";
import type { MultiUserConfigUser, MultiUserMemoryConfig } from "./config.js";
import { normalizeLanguageId } from "./language.js";
import { loadCurrentMaumauConfig } from "./runtime-config.js";

const DEFAULT_FIRST_USER_FALLBACK_ID = "owner";
const DEFAULT_CURATOR_AGENT_ID = "memory-curator";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function slugifyIdentifier(value: string, existingIds: Set<string>): string {
  const base =
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || DEFAULT_FIRST_USER_FALLBACK_ID;
  if (!existingIds.has(base)) {
    return base;
  }
  let counter = 2;
  while (existingIds.has(`${base}-${counter}`)) {
    counter += 1;
  }
  return `${base}-${counter}`;
}

function resolveFirstUserLabel(params: {
  senderName?: string;
  senderUsername?: string;
  senderId: string;
}): string {
  return (
    params.senderName?.trim() ||
    params.senderUsername?.trim() ||
    params.senderId.trim() ||
    DEFAULT_FIRST_USER_FALLBACK_ID
  );
}

function shouldBootstrapFirstUser(pluginConfig: MultiUserMemoryConfig): boolean {
  return Object.keys(pluginConfig.users).length === 0 && pluginConfig.adminUserIds.length === 0;
}

function bootstrapOwnerAllowFromIfUnset(params: {
  cfg: MaumauConfig;
  channelId: string;
  senderId: string;
}): MaumauConfig {
  const existingOwnerAllowFrom = params.cfg.commands?.ownerAllowFrom ?? [];
  if (existingOwnerAllowFrom.some((entry) => String(entry ?? "").trim().length > 0)) {
    return params.cfg;
  }
  const channelPrefix = params.channelId.trim().toLowerCase();
  const senderId = params.senderId.trim();
  if (!channelPrefix || !senderId) {
    return params.cfg;
  }
  return {
    ...params.cfg,
    commands: {
      ...params.cfg.commands,
      ownerAllowFrom: [`${channelPrefix}:${senderId}`],
    },
  };
}

export async function maybeBootstrapFirstObservedUser(params: {
  api: MaumauPluginApi;
  pluginConfig: MultiUserMemoryConfig;
  channelId: string;
  accountId?: string;
  senderId: string;
  senderName?: string;
  senderUsername?: string;
}): Promise<{ userId: string; user: MultiUserConfigUser; config: MultiUserMemoryConfig } | null> {
  if (!shouldBootstrapFirstUser(params.pluginConfig)) {
    return null;
  }

  const label = resolveFirstUserLabel({
    senderId: params.senderId,
    senderName: params.senderName,
    senderUsername: params.senderUsername,
  });
  const liveConfig = loadCurrentMaumauConfig(params.api);
  const pluginEntries = asRecord(asRecord(liveConfig.plugins).entries);
  const currentEntry = asRecord(pluginEntries["multi-user-memory"]);
  const currentPluginConfig = asRecord(currentEntry.config);
  const currentUsers = asRecord(currentPluginConfig.users);
  const userId = slugifyIdentifier(label, new Set(Object.keys(currentUsers)));
  const user: MultiUserConfigUser = {
    displayName: label,
    preferredLanguage:
      normalizeLanguageId(params.pluginConfig.defaultLanguage) ??
      params.pluginConfig.defaultLanguage,
    identities: [
      {
        channelId: params.channelId,
        ...(params.accountId?.trim() ? { accountId: params.accountId.trim() } : {}),
        senderId: params.senderId,
        ...(params.senderName?.trim() ? { senderName: params.senderName.trim() } : {}),
        ...(params.senderUsername?.trim() ? { senderUsername: params.senderUsername.trim() } : {}),
      },
    ],
    active: true,
  };

  const nextConfigBase: MaumauConfig = {
    ...liveConfig,
    plugins: {
      ...liveConfig.plugins,
      slots: {
        ...liveConfig.plugins?.slots,
        memory: "multi-user-memory",
      },
      entries: {
        ...liveConfig.plugins?.entries,
        "multi-user-memory": {
          ...liveConfig.plugins?.entries?.["multi-user-memory"],
          config: {
            ...currentPluginConfig,
            enabled: currentPluginConfig.enabled ?? true,
            autoDiscover: currentPluginConfig.autoDiscover ?? true,
            defaultLanguage:
              normalizeLanguageId(
                typeof currentPluginConfig.defaultLanguage === "string"
                  ? currentPluginConfig.defaultLanguage
                  : params.pluginConfig.defaultLanguage,
              ) ?? params.pluginConfig.defaultLanguage,
            curatorAgentId:
              typeof currentPluginConfig.curatorAgentId === "string" &&
              currentPluginConfig.curatorAgentId.trim()
                ? currentPluginConfig.curatorAgentId.trim()
                : DEFAULT_CURATOR_AGENT_ID,
            adminUserIds: [userId],
            users: {
              ...currentUsers,
              [userId]: user,
            },
            groups: asRecord(currentPluginConfig.groups),
            ...(currentPluginConfig.approvalDelivery &&
            typeof currentPluginConfig.approvalDelivery === "object" &&
            !Array.isArray(currentPluginConfig.approvalDelivery)
              ? { approvalDelivery: currentPluginConfig.approvalDelivery }
              : {}),
            ...(typeof currentPluginConfig.approvalCenterBaseUrl === "string" &&
            currentPluginConfig.approvalCenterBaseUrl.trim()
              ? { approvalCenterBaseUrl: currentPluginConfig.approvalCenterBaseUrl.trim() }
              : {}),
          },
        },
      },
    },
  };
  const nextConfig = bootstrapOwnerAllowFromIfUnset({
    cfg: nextConfigBase,
    channelId: params.channelId,
    senderId: params.senderId,
  });

  await params.api.runtime.config.writeConfigFile(nextConfig);
  return {
    userId,
    user,
    config: {
      ...params.pluginConfig,
      adminUserIds: [userId],
      users: {
        ...params.pluginConfig.users,
        [userId]: user,
      },
      curatorAgentId: params.pluginConfig.curatorAgentId ?? DEFAULT_CURATOR_AGENT_ID,
    },
  };
}
