import { resolveChannelDefaultAccountId } from "../channels/plugins/helpers.js";
import { getChannelPlugin, listChannelPlugins, type ChannelId } from "../channels/plugins/index.js";
import { bundledChannelPlugins, bundledChannelSetupPlugins } from "../channels/plugins/bundled.js";
import type { ChannelAccessPolicy } from "../channels/plugins/setup-group-access.js";
import { listChannelSetupPlugins } from "../channels/plugins/setup-registry.js";
import {
  mergeAllowFromEntries,
  splitSetupEntries,
} from "../channels/plugins/setup-wizard-helpers.js";
import type { ChannelSetupWizard } from "../channels/plugins/setup-wizard.js";
import { buildChannelAccountSnapshot } from "../channels/plugins/status.js";
import type { ChannelAccountSnapshot } from "../channels/plugins/types.core.js";
import type { ChannelPlugin } from "../channels/plugins/types.js";
import { loadConfig, readConfigFileSnapshotForWrite, writeConfigFile } from "../config/config.js";
import { getConfigValueAtPath, setConfigValueAtPath } from "../config/config-paths.js";
import type { DmPolicy, MaumauConfig } from "../config/types.js";
import { DEFAULT_ACCOUNT_ID } from "../routing/session-key.js";
import {
  getUserChannelQuickSetupEntry,
  getUserChannelQuickSetupGuidance,
  isUserChannelInlineQuickSetupId,
  USER_CHANNEL_INLINE_QUICK_SETUP_IDS,
} from "../shared/user-channel-quick-setup.js";
import type {
  DashboardUserChannel,
  DashboardUserChannelAccessPolicy,
  DashboardUserChannelAccount,
  DashboardUserChannelConnectField,
  DashboardUserChannelConnectSpec,
  DashboardUserChannelEditableList,
  DashboardUserChannelOverride,
  DashboardUserChannelUserRow,
  DashboardUserChannelsResult,
} from "./dashboard-types.js";
import type { ChannelRuntimeSnapshot } from "./server-channels.js";

type MultiUserIdentity = {
  channelId: string;
  accountId?: string;
  senderId: string;
  senderName?: string;
  senderUsername?: string;
};

type MultiUserUser = {
  id: string;
  displayName?: string;
  active: boolean;
  identities: MultiUserIdentity[];
};

type MultiUserGroup = {
  id: string;
  label?: string;
  active: boolean;
  parentGroupIds: string[];
  memberUserIds: string[];
};

type MultiUserConfig = {
  users: MultiUserUser[];
  groups: MultiUserGroup[];
};

type SilentPrompterNotes = {
  title: string;
  message: string;
};

type QuickSetupUpdate = {
  path: string[];
  value: unknown;
};

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const items: string[] = [];
  for (const entry of value) {
    const normalized = normalizeText(entry);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    items.push(normalized);
  }
  return items;
}

function normalizeMultiUserIdentities(value: unknown): MultiUserIdentity[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const identities: MultiUserIdentity[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }
    const channelId = normalizeText(entry.channelId);
    const senderId = normalizeText(entry.senderId);
    if (!channelId || !senderId) {
      continue;
    }
    identities.push({
      channelId,
      accountId: normalizeText(entry.accountId) || undefined,
      senderId,
      senderName: normalizeText(entry.senderName) || undefined,
      senderUsername: normalizeText(entry.senderUsername) || undefined,
    });
  }
  return identities;
}

function resolveMultiUserConfig(cfg: MaumauConfig): MultiUserConfig {
  const raw = cfg.plugins?.entries?.["multi-user-memory"]?.config;
  const record = isRecord(raw) ? raw : {};
  const usersRecord = isRecord(record.users) ? record.users : {};
  const groupsRecord = isRecord(record.groups) ? record.groups : {};
  const users: MultiUserUser[] = [];
  for (const [userId, value] of Object.entries(usersRecord)) {
    if (!userId.trim() || !isRecord(value)) {
      continue;
    }
    users.push({
      id: userId,
      displayName: normalizeText(value.displayName) || undefined,
      active: value.active !== false,
      identities: normalizeMultiUserIdentities(value.identities),
    });
  }
  const groups: MultiUserGroup[] = [];
  for (const [groupId, value] of Object.entries(groupsRecord)) {
    if (!groupId.trim() || !isRecord(value)) {
      continue;
    }
    groups.push({
      id: groupId,
      label: normalizeText(value.label) || undefined,
      active: value.active !== false,
      parentGroupIds: normalizeStringArray(value.parentGroupIds),
      memberUserIds: normalizeStringArray(value.memberUserIds),
    });
  }
  return {
    users: users.toSorted((left, right) =>
      (left.displayName ?? left.id).localeCompare(right.displayName ?? right.id, undefined, {
        sensitivity: "base",
      }),
    ),
    groups,
  };
}

function resolveEffectiveGroupIds(config: MultiUserConfig, userId: string): string[] {
  const groupsById = new Map(config.groups.map((group) => [group.id, group]));
  const direct = new Set<string>();
  for (const group of config.groups) {
    if (!group.active || !group.memberUserIds.includes(userId)) {
      continue;
    }
    direct.add(group.id);
  }
  const effective = new Set<string>(direct);
  const pending = [...direct];
  while (pending.length > 0) {
    const currentId = pending.shift();
    if (!currentId) {
      continue;
    }
    const current = groupsById.get(currentId);
    if (!current?.active) {
      continue;
    }
    for (const parentGroupId of current.parentGroupIds) {
      const parent = groupsById.get(parentGroupId);
      if (!parent?.active || effective.has(parentGroupId)) {
        continue;
      }
      effective.add(parentGroupId);
      pending.push(parentGroupId);
    }
  }
  return [...effective];
}

function listVisibleChannelPlugins(): ChannelPlugin[] {
  const byId = new Map<string, ChannelPlugin>();
  for (const plugin of [
    ...listChannelPlugins(),
    ...listChannelSetupPlugins(),
    ...bundledChannelPlugins,
    ...bundledChannelSetupPlugins,
  ]) {
    const id = normalizeText(plugin.id);
    if (!id || byId.has(id)) {
      continue;
    }
    byId.set(id, plugin);
  }
  return [...byId.values()].toSorted((left, right) =>
    left.meta.label.localeCompare(right.meta.label, undefined, { sensitivity: "base" }),
  );
}

function readSavedString(cfg: MaumauConfig, path: string[]): string | undefined {
  const value = getConfigValueAtPath(cfg as Record<string, unknown>, path);
  const normalized = normalizeText(value);
  return normalized || undefined;
}

function readSavedStringArray(cfg: MaumauConfig, path: string[]): string[] {
  return normalizeStringArray(getConfigValueAtPath(cfg as Record<string, unknown>, path));
}

function mergedQuickSetupUpdates(
  cfg: MaumauConfig,
  channelId: string,
  updates: QuickSetupUpdate[],
): QuickSetupUpdate[] {
  if (!isUserChannelInlineQuickSetupId(channelId)) {
    return updates;
  }
  const dmPolicyPath = ["channels", channelId, "dmPolicy"];
  const allowFromPath = ["channels", channelId, "allowFrom"];
  const updatesDmPolicy = updates.some((entry) => entry.path.join(".") === dmPolicyPath.join("."));
  const updatesAllowFrom = updates.some((entry) => entry.path.join(".") === allowFromPath.join("."));
  const existingDmPolicy = getConfigValueAtPath(cfg as Record<string, unknown>, dmPolicyPath);
  const existingAllowFrom = getConfigValueAtPath(cfg as Record<string, unknown>, allowFromPath);
  if (updatesDmPolicy || updatesAllowFrom || existingDmPolicy != null || existingAllowFrom != null) {
    return updates;
  }
  return updates.concat([
    { path: dmPolicyPath, value: "open" },
    { path: allowFromPath, value: ["*"] },
  ]);
}

function enableBundledChannelPluginForQuickSetup(cfg: MaumauConfig, channelId: string): string | null {
  const trimmedChannelId = normalizeText(channelId);
  if (!trimmedChannelId) {
    return "missing channel id";
  }
  if (cfg.plugins?.enabled === false) {
    return "plugins disabled";
  }
  const deniedPluginIds = normalizeStringArray(cfg.plugins?.deny);
  if (deniedPluginIds.includes(trimmedChannelId)) {
    return "blocked by denylist";
  }
  setConfigValueAtPath(cfg as Record<string, unknown>, [
    "plugins",
    "entries",
    trimmedChannelId,
    "enabled",
  ], true);
  const allowed = readSavedStringArray(cfg, ["plugins", "allow"]);
  if (allowed.length > 0 && !allowed.includes(trimmedChannelId)) {
    setConfigValueAtPath(cfg as Record<string, unknown>, ["plugins", "allow"], [
      ...allowed,
      trimmedChannelId,
    ]);
  }
  return null;
}

function buildQuickSetupFields(channelId: string, cfg: MaumauConfig): DashboardUserChannelConnectField[] {
  if (!isUserChannelInlineQuickSetupId(channelId)) {
    return [];
  }
  return getUserChannelQuickSetupEntry(channelId).fields.map((field) => ({
    ...field,
    currentValue:
      field.key === "cliPath"
        ? readSavedString(cfg, ["channels", "imessage", "cliPath"]) ?? field.placeholder ?? "imsg"
        : undefined,
  }));
}

function buildQuickSetupSpec(plugin: ChannelPlugin, cfg: MaumauConfig): DashboardUserChannelConnectSpec | null {
  if (!isUserChannelInlineQuickSetupId(plugin.id)) {
    return null;
  }
  const quickSetupEntry = getUserChannelQuickSetupEntry(plugin.id);
  const guidance = getUserChannelQuickSetupGuidance(plugin.id);
  return {
    channelId: plugin.id,
    label: plugin.meta.label,
    detailLabel: plugin.meta.detailLabel ?? plugin.meta.label,
    systemImage: plugin.meta.systemImage,
    guidance,
    quickSetup: {
      kind: quickSetupEntry.quickSetup.kind,
      sectionTitle: quickSetupEntry.quickSetup.sectionTitle,
      title: quickSetupEntry.quickSetup.title,
      headline: quickSetupEntry.quickSetup.emptyHeadline,
      message: quickSetupEntry.quickSetup.emptyMessage,
      badge: quickSetupEntry.quickSetup.emptyBadge,
      buttonTitle: quickSetupEntry.quickSetup.buttonTitle,
      existingCredentialNote: quickSetupEntry.quickSetup.existingCredentialNote,
      setupNote: quickSetupEntry.quickSetup.setupNote,
    },
    fields: buildQuickSetupFields(plugin.id, cfg),
  };
}

function quickSetupUpdates(channelId: string, fields: Record<string, string>): QuickSetupUpdate[] {
  switch (channelId) {
    case "telegram": {
      const botToken = normalizeText(fields.botToken);
      if (!botToken) {
        throw new Error("Telegram bot token is required");
      }
      return [
        { path: ["channels", "telegram", "enabled"], value: true },
        { path: ["channels", "telegram", "botToken"], value: botToken },
        { path: ["channels", "telegram", "groups", "*", "requireMention"], value: true },
      ];
    }
    case "discord": {
      const token = normalizeText(fields.token);
      if (!token) {
        throw new Error("Discord bot token is required");
      }
      return [
        { path: ["channels", "discord", "enabled"], value: true },
        { path: ["channels", "discord", "token"], value: token },
      ];
    }
    case "slack": {
      const botToken = normalizeText(fields.botToken);
      const appToken = normalizeText(fields.appToken);
      if (!botToken || !appToken) {
        throw new Error("Slack bot token and app token are required");
      }
      return [
        { path: ["channels", "slack", "enabled"], value: true },
        { path: ["channels", "slack", "mode"], value: "socket" },
        { path: ["channels", "slack", "botToken"], value: botToken },
        { path: ["channels", "slack", "appToken"], value: appToken },
      ];
    }
    case "line": {
      const channelAccessToken = normalizeText(fields.channelAccessToken);
      const channelSecret = normalizeText(fields.channelSecret);
      if (!channelAccessToken || !channelSecret) {
        throw new Error("LINE Channel access token and Channel secret are required");
      }
      return [
        { path: ["channels", "line", "enabled"], value: true },
        { path: ["channels", "line", "channelAccessToken"], value: channelAccessToken },
        { path: ["channels", "line", "channelSecret"], value: channelSecret },
      ];
    }
    case "imessage": {
      const cliPath = normalizeText(fields.cliPath);
      if (!cliPath) {
        throw new Error("imsg CLI path is required");
      }
      return [
        { path: ["channels", "imessage", "enabled"], value: true },
        { path: ["channels", "imessage", "cliPath"], value: cliPath },
      ];
    }
    case "whatsapp":
      return [];
    default:
      throw new Error(`channel ${channelId} is not available in onboarding quick setup`);
  }
}

function normalizeEditableEntries(entries: Array<string | number> | undefined): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const entry of entries ?? []) {
    const value = String(entry).trim();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    normalized.push(value);
  }
  return normalized;
}

function toAccessPolicy(value: unknown): DashboardUserChannelAccessPolicy | undefined {
  return value === "open" || value === "disabled" || value === "allowlist" ? value : undefined;
}

function resolveRuntimeSnapshot(
  runtime: ChannelRuntimeSnapshot,
  channelId: ChannelId,
  accountId: string,
  defaultAccountId: string,
): ChannelAccountSnapshot | undefined {
  const accounts = runtime.channelAccounts[channelId];
  const defaultRuntime = runtime.channels[channelId];
  return accounts?.[accountId] ?? (accountId === defaultAccountId ? defaultRuntime : undefined);
}

function buildSilentNotePrompter(
  notes: SilentPrompterNotes[],
): Pick<import("../wizard/prompts.js").WizardPrompter, "note"> {
  return {
    note: async (message: string, title?: string) => {
      notes.push({ title: title?.trim() || "Note", message });
    },
  };
}

function buildUserRows(params: {
  config: MultiUserConfig;
  channelId: string;
  accountId: string;
  defaultAccountId: string;
}): DashboardUserChannelUserRow[] {
  return params.config.users
    .flatMap((user) =>
      user.identities
        .filter(
          (identity) =>
            identity.channelId === params.channelId &&
            (identity.accountId || params.defaultAccountId) === params.accountId,
        )
        .map<DashboardUserChannelUserRow>((identity) => ({
          userId: user.id,
          userLabel: user.displayName ?? user.id,
          identityLabel: identity.senderName ?? identity.senderUsername ?? identity.senderId,
          senderId: identity.senderId,
          senderName: identity.senderName,
          senderUsername: identity.senderUsername,
          accountId: identity.accountId,
          groupLabels: resolveEffectiveGroupIds(params.config, user.id).map((groupId) => {
            const group = params.config.groups.find((entry) => entry.id === groupId);
            return group?.label ?? groupId;
          }),
          active: user.active,
        })),
    )
    .toSorted((left, right) =>
      left.userLabel.localeCompare(right.userLabel, undefined, { sensitivity: "base" }),
    );
}

function buildEditableList(params: {
  label: string;
  entries?: Array<string | number>;
  policy?: unknown;
  placeholder?: string;
  helpTitle?: string;
  helpLines?: string[];
}): DashboardUserChannelEditableList | undefined {
  const entries = normalizeEditableEntries(params.entries);
  const policy = toAccessPolicy(params.policy);
  if (entries.length === 0 && !policy && !params.placeholder && !params.helpLines?.length) {
    return undefined;
  }
  return {
    label: params.label,
    entries,
    policy,
    placeholder: params.placeholder,
    helpTitle: params.helpTitle,
    helpLines: params.helpLines,
  };
}

async function buildAccountEntry(params: {
  cfg: MaumauConfig;
  runtimeSnapshot: ChannelRuntimeSnapshot;
  plugin: ChannelPlugin;
  accountId: string;
  defaultAccountId: string;
  multiUserConfig: MultiUserConfig;
}): Promise<DashboardUserChannelAccount> {
  const snapshot = await buildChannelAccountSnapshot({
    plugin: params.plugin,
    cfg: params.cfg,
    accountId: params.accountId,
    runtime: resolveRuntimeSnapshot(
      params.runtimeSnapshot,
      params.plugin.id,
      params.accountId,
      params.defaultAccountId,
    ),
  });
  const allowConfig = await params.plugin.allowlist?.readConfig?.({
    cfg: params.cfg,
    accountId: params.accountId,
  });
  const dmSenders = buildEditableList({
    label: `${params.plugin.meta.label} direct senders`,
    entries:
      allowConfig?.dmAllowFrom ??
      params.plugin.config.resolveAllowFrom?.({
        cfg: params.cfg,
        accountId: params.accountId,
      }),
    policy: allowConfig?.dmPolicy ?? snapshot.dmPolicy,
  });
  const groupSenders = buildEditableList({
    label: `${params.plugin.meta.label} group senders`,
    entries: allowConfig?.groupAllowFrom,
    policy: allowConfig?.groupPolicy,
  });
  const chats = params.plugin.setupWizard?.groupAccess
    ? buildEditableList({
        label: params.plugin.setupWizard.groupAccess.label,
        entries: params.plugin.setupWizard.groupAccess.currentEntries({
          cfg: params.cfg,
          accountId: params.accountId,
        }),
        policy: params.plugin.setupWizard.groupAccess.currentPolicy({
          cfg: params.cfg,
          accountId: params.accountId,
        }),
        placeholder: params.plugin.setupWizard.groupAccess.placeholder,
        helpTitle: params.plugin.setupWizard.groupAccess.helpTitle,
        helpLines: params.plugin.setupWizard.groupAccess.helpLines,
      })
    : undefined;
  const overrides: DashboardUserChannelOverride[] = (allowConfig?.groupOverrides ?? []).map(
    (override) => ({
      label: override.label,
      entries: normalizeEditableEntries(override.entries),
    }),
  );
  return {
    accountId: params.accountId,
    name: snapshot.name,
    defaultAccount: params.accountId === params.defaultAccountId,
    configured: snapshot.configured === true,
    linked: snapshot.linked === true,
    enabled: snapshot.enabled !== false,
    running: snapshot.running === true,
    connected: snapshot.connected === true,
    users: buildUserRows({
      config: params.multiUserConfig,
      channelId: params.plugin.id,
      accountId: params.accountId,
      defaultAccountId: params.defaultAccountId,
    }),
    capabilities: {
      users: true,
      dmSenders: Boolean(dmSenders),
      groupSenders: Boolean(groupSenders),
      chats: Boolean(chats),
      overrides: overrides.length > 0,
    },
    dmSenders,
    groupSenders,
    chats,
    overrides,
  };
}

function accountHasUserChannelData(account: DashboardUserChannelAccount): boolean {
  return Boolean(
    account.configured ||
    account.linked ||
    account.running ||
    account.connected ||
    account.users.length > 0 ||
    account.dmSenders?.entries.length ||
    account.groupSenders?.entries.length ||
    account.chats?.entries.length ||
    account.overrides.length > 0,
  );
}

export async function collectDashboardUserChannels(params: {
  runtimeSnapshot: ChannelRuntimeSnapshot;
}): Promise<DashboardUserChannelsResult> {
  const cfg = loadConfig();
  const multiUserConfig = resolveMultiUserConfig(cfg);
  const channels: DashboardUserChannel[] = [];
  const availableById = new Map<string, DashboardUserChannelConnectSpec>();
  const visiblePlugins = listVisibleChannelPlugins();

  for (const plugin of visiblePlugins) {
    const accountIds = plugin.config.listAccountIds(cfg);
    const defaultAccountId = resolveChannelDefaultAccountId({
      plugin,
      cfg,
      accountIds,
    });
    const visibleAccountIds = [...new Set(accountIds.length > 0 ? accountIds : [defaultAccountId])];
    const accounts = (
      await Promise.all(
        visibleAccountIds.map((accountId) =>
          buildAccountEntry({
            cfg,
            runtimeSnapshot: params.runtimeSnapshot,
            plugin,
            accountId,
            defaultAccountId,
            multiUserConfig,
          }),
        ),
      )
    ).filter(accountHasUserChannelData);

    if (accounts.length > 0) {
      channels.push({
        channelId: plugin.id,
        label: plugin.meta.label,
        detailLabel: plugin.meta.detailLabel ?? plugin.meta.label,
        systemImage: plugin.meta.systemImage,
        accounts,
      });
      continue;
    }
    const connectSpec = buildQuickSetupSpec(plugin, cfg);
    if (connectSpec) {
      availableById.set(plugin.id, connectSpec);
    }
  }

  return {
    generatedAtMs: Date.now(),
    channels: channels.toSorted((left, right) =>
      left.label.localeCompare(right.label, undefined, { sensitivity: "base" }),
    ),
    availableChannels: USER_CHANNEL_INLINE_QUICK_SETUP_IDS.flatMap((channelId) => {
      const spec = availableById.get(channelId);
      return spec ? [spec] : [];
    }),
  };
}

function requirePlainRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`invalid ${label}`);
  }
  return value;
}

function resolveConnectTarget(channelId: string): {
  plugin: ChannelPlugin;
  wizard: ChannelSetupWizard;
} {
  const plugin =
    getChannelPlugin(channelId as ChannelId) ??
    listChannelSetupPlugins().find((entry) => entry.id === channelId);
  if (!plugin?.setupWizard) {
    throw new Error(`channel ${channelId} does not expose a setup wizard`);
  }
  return { plugin, wizard: plugin.setupWizard };
}

function applySetupInput(params: {
  plugin: ChannelPlugin;
  cfg: MaumauConfig;
  accountId: string;
  input: Record<string, unknown>;
}) {
  const setup = params.plugin.setup;
  if (!setup?.applyAccountConfig) {
    throw new Error(`${params.plugin.id} does not support config-driven setup`);
  }
  const resolvedAccountId =
    setup.resolveAccountId?.({
      cfg: params.cfg,
      accountId: params.accountId,
      input: params.input,
    }) ?? params.accountId;
  const validationError = setup.validateInput?.({
    cfg: params.cfg,
    accountId: resolvedAccountId,
    input: params.input,
  });
  if (validationError) {
    throw new Error(validationError);
  }
  return setup.applyAccountConfig({
    cfg: params.cfg,
    accountId: resolvedAccountId,
    input: params.input,
  });
}

async function applyConnectFields(params: {
  plugin: ChannelPlugin;
  wizard: ChannelSetupWizard;
  cfg: MaumauConfig;
  accountId: string;
  fields: Record<string, string>;
}): Promise<{ cfg: MaumauConfig; credentialValues: Record<string, string> }> {
  let next = params.cfg;
  const credentialValues: Record<string, string> = {};
  for (const credential of params.wizard.credentials) {
    const value = normalizeText(params.fields[credential.inputKey]);
    if (!value) {
      continue;
    }
    next = credential.applySet
      ? await credential.applySet({
          cfg: next,
          accountId: params.accountId,
          credentialValues,
          value,
          resolvedValue: value,
        })
      : applySetupInput({
          plugin: params.plugin,
          cfg: next,
          accountId: params.accountId,
          input: {
            [credential.inputKey]: value,
            useEnv: false,
          },
        });
    credentialValues[credential.inputKey] = value;
  }
  for (const input of params.wizard.textInputs ?? []) {
    const raw = params.fields[input.inputKey];
    const trimmed = normalizeText(raw);
    if (!trimmed && !input.applyEmptyValue) {
      continue;
    }
    const normalizedValue =
      input.normalizeValue?.({
        value: trimmed,
        cfg: next,
        accountId: params.accountId,
        credentialValues,
      }) ?? trimmed;
    if (trimmed) {
      const validationError = input.validate?.({
        value: normalizedValue,
        cfg: next,
        accountId: params.accountId,
        credentialValues,
      });
      if (validationError) {
        throw new Error(validationError);
      }
    }
    next = input.applySet
      ? await input.applySet({
          cfg: next,
          accountId: params.accountId,
          value: normalizedValue,
        })
      : applySetupInput({
          plugin: params.plugin,
          cfg: next,
          accountId: params.accountId,
          input: {
            [input.inputKey]: normalizedValue,
          },
        });
    if (normalizedValue) {
      credentialValues[input.inputKey] = normalizedValue;
    }
  }
  return {
    cfg: next,
    credentialValues,
  };
}

function parseDmPolicy(value: unknown): DmPolicy | undefined {
  return value === "pairing" || value === "allowlist" || value === "open" || value === "disabled"
    ? value
    : undefined;
}

function parseChannelAccessPolicy(value: unknown): ChannelAccessPolicy | undefined {
  return value === "allowlist" || value === "open" || value === "disabled" ? value : undefined;
}

async function applyDashboardQuickSetupChannel(params: {
  channelId: string;
  fields: Record<string, string>;
}): Promise<void> {
  const { snapshot, writeOptions } = await readConfigFileSnapshotForWrite();
  const next = structuredClone(snapshot.config as MaumauConfig);
  const enableFailure = enableBundledChannelPluginForQuickSetup(next, params.channelId);
  if (enableFailure) {
    throw new Error(`Cannot enable ${params.channelId}: ${enableFailure}.`);
  }
  const updates = mergedQuickSetupUpdates(
    next,
    params.channelId,
    quickSetupUpdates(params.channelId, params.fields),
  );
  for (const update of updates) {
    setConfigValueAtPath(next as Record<string, unknown>, update.path, update.value);
  }
  await writeConfigFile(next, writeOptions);
}

export async function connectDashboardUserChannel(params: {
  channelId: string;
  fields?: Record<string, string>;
  dmPolicy?: string;
  allowFrom?: string;
  chatPolicy?: string;
  chatEntries?: string;
}): Promise<void> {
  const channelId = normalizeText(params.channelId);
  if (!channelId) {
    throw new Error("channelId is required");
  }
  if (isUserChannelInlineQuickSetupId(channelId)) {
    await applyDashboardQuickSetupChannel({
      channelId,
      fields: Object.fromEntries(
        Object.entries(requirePlainRecord(params.fields ?? {}, "dashboard.userChannels.connect fields")).map(
          ([key, value]) => [key, String(value ?? "")],
        ),
      ),
    });
    return;
  }
  const { plugin, wizard } = resolveConnectTarget(channelId);
  const { snapshot, writeOptions } = await readConfigFileSnapshotForWrite();
  const baseConfig = structuredClone(snapshot.config as MaumauConfig);
  const accountIds = plugin.config.listAccountIds(baseConfig);
  const accountId = resolveChannelDefaultAccountId({ plugin, cfg: baseConfig, accountIds });
  const fields = requirePlainRecord(params.fields ?? {}, "dashboard.userChannels.connect fields");
  const configured = await applyConnectFields({
    plugin,
    wizard,
    cfg: baseConfig,
    accountId,
    fields: Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, String(value ?? "")]),
    ),
  });
  let next = configured.cfg;

  const dmPolicy = parseDmPolicy(params.dmPolicy);
  if (dmPolicy && wizard.dmPolicy) {
    next = wizard.dmPolicy.setPolicy(next, dmPolicy, accountId);
  }

  if (typeof params.allowFrom === "string" && wizard.allowFrom) {
    const parsedEntries = (wizard.allowFrom.parseInputs ?? splitSetupEntries)(params.allowFrom);
    const resolved = await wizard.allowFrom.resolveEntries({
      cfg: next,
      accountId,
      credentialValues: configured.credentialValues,
      entries: parsedEntries,
    });
    const ids = resolved.map((entry) => (entry.id ? String(entry.id).trim() : "")).filter(Boolean);
    next = await wizard.allowFrom.apply({
      cfg: next,
      accountId,
      allowFrom: mergeAllowFromEntries(undefined, ids),
    });
  }

  const chatPolicy = parseChannelAccessPolicy(params.chatPolicy);
  if (wizard.groupAccess && chatPolicy) {
    next = wizard.groupAccess.setPolicy({
      cfg: next,
      accountId,
      policy: chatPolicy,
    });
    if (chatPolicy === "allowlist" && typeof params.chatEntries === "string") {
      const entries = splitSetupEntries(params.chatEntries);
      if (
        wizard.groupAccess.skipAllowlistEntries ||
        !wizard.groupAccess.resolveAllowlist ||
        !wizard.groupAccess.applyAllowlist
      ) {
        next = wizard.groupAccess.setPolicy({
          cfg: next,
          accountId,
          policy: "allowlist",
        });
      } else {
        const resolved = await wizard.groupAccess.resolveAllowlist({
          cfg: next,
          accountId,
          credentialValues: configured.credentialValues,
          entries,
          prompter: buildSilentNotePrompter([]),
        });
        next = wizard.groupAccess.applyAllowlist({
          cfg: next,
          accountId,
          resolved,
        });
      }
    }
  }

  await writeConfigFile(next, writeOptions);
}

function resolveAllowlistTarget(channelId: string): ChannelPlugin {
  const plugin = getChannelPlugin(channelId as ChannelId);
  if (!plugin?.allowlist?.readConfig || !plugin.allowlist.applyConfigEdit) {
    throw new Error(`channel ${channelId} does not expose editable allowlists`);
  }
  return plugin;
}

export async function setDashboardUserChannelAllowlist(params: {
  channelId: string;
  accountId: string;
  scope: "dm" | "group";
  entries: string;
}): Promise<void> {
  const channelId = normalizeText(params.channelId);
  const accountId = normalizeText(params.accountId) || DEFAULT_ACCOUNT_ID;
  if (!channelId) {
    throw new Error("channelId is required");
  }
  const plugin = resolveAllowlistTarget(channelId);
  const { snapshot, writeOptions } = await readConfigFileSnapshotForWrite();
  const cfg = snapshot.config as MaumauConfig;
  const readConfig = await plugin.allowlist!.readConfig!({
    cfg,
    accountId,
  });
  const currentEntries =
    params.scope === "group"
      ? normalizeEditableEntries(readConfig?.groupAllowFrom)
      : normalizeEditableEntries(readConfig?.dmAllowFrom);
  const desiredEntries = splitSetupEntries(params.entries);
  const parsedConfig = structuredClone(snapshot.config as Record<string, unknown>);
  for (const entry of currentEntries) {
    if (desiredEntries.includes(entry)) {
      continue;
    }
    plugin.allowlist!.applyConfigEdit?.({
      cfg,
      parsedConfig,
      accountId,
      scope: params.scope,
      action: "remove",
      entry,
    });
  }
  for (const entry of desiredEntries) {
    if (currentEntries.includes(entry)) {
      continue;
    }
    plugin.allowlist!.applyConfigEdit?.({
      cfg,
      parsedConfig,
      accountId,
      scope: params.scope,
      action: "add",
      entry,
    });
  }
  await writeConfigFile(parsedConfig as MaumauConfig, writeOptions);
}

export async function setDashboardUserChannelChats(params: {
  channelId: string;
  accountId: string;
  policy: ChannelAccessPolicy;
  entries: string;
}): Promise<void> {
  const channelId = normalizeText(params.channelId);
  const accountId = normalizeText(params.accountId) || DEFAULT_ACCOUNT_ID;
  if (!channelId) {
    throw new Error("channelId is required");
  }
  const plugin = getChannelPlugin(channelId as ChannelId);
  const wizard = plugin?.setupWizard;
  if (!plugin || !wizard?.groupAccess) {
    throw new Error(`channel ${channelId} does not expose editable chat access`);
  }
  const { snapshot, writeOptions } = await readConfigFileSnapshotForWrite();
  let next = structuredClone(snapshot.config as MaumauConfig);
  next = wizard.groupAccess.setPolicy({
    cfg: next,
    accountId,
    policy: params.policy,
  });
  if (
    params.policy === "allowlist" &&
    !wizard.groupAccess.skipAllowlistEntries &&
    wizard.groupAccess.resolveAllowlist &&
    wizard.groupAccess.applyAllowlist
  ) {
    const resolved = await wizard.groupAccess.resolveAllowlist({
      cfg: next,
      accountId,
      credentialValues: {},
      entries: splitSetupEntries(params.entries),
      prompter: buildSilentNotePrompter([]),
    });
    next = wizard.groupAccess.applyAllowlist({
      cfg: next,
      accountId,
      resolved,
    });
  }
  await writeConfigFile(next, writeOptions);
}
