import type { MaumauConfig } from "../config/config.js";
import { normalizeStringEntries } from "../shared/string-normalization.js";
import { getChannelPlugin, normalizeChannelId } from "./plugins/index.js";

function hasConfiguredOwnerAllowFrom(cfg: MaumauConfig): boolean {
  return Boolean(
    cfg.commands?.ownerAllowFrom?.some((entry) => String(entry ?? "").trim().length > 0),
  );
}

function resolveChannelPrefix(channelId: string): string {
  return normalizeChannelId(channelId)?.trim() || channelId.trim().toLowerCase();
}

function resolveFormattedAllowFrom(params: {
  cfg: MaumauConfig;
  channelId: string;
  accountId?: string;
  allowFrom: Array<string | number>;
}): string[] {
  const normalizedChannelId = normalizeChannelId(params.channelId);
  let plugin;
  try {
    plugin = normalizedChannelId ? getChannelPlugin(normalizedChannelId) : undefined;
  } catch {
    plugin = undefined;
  }
  if (plugin?.config?.formatAllowFrom) {
    return plugin.config.formatAllowFrom({
      cfg: params.cfg,
      accountId: params.accountId,
      allowFrom: params.allowFrom,
    });
  }
  return normalizeStringEntries(params.allowFrom);
}

export function bootstrapOwnerAllowFromIfUnset(params: {
  cfg: MaumauConfig;
  channelId: string;
  accountId?: string;
  allowFrom: Array<string | number>;
}): { cfg: MaumauConfig; bootstrapped: boolean; ownerAllowFrom: string[] } {
  if (hasConfiguredOwnerAllowFrom(params.cfg)) {
    return {
      cfg: params.cfg,
      bootstrapped: false,
      ownerAllowFrom: params.cfg.commands?.ownerAllowFrom?.map((entry) => String(entry)) ?? [],
    };
  }

  const channelPrefix = resolveChannelPrefix(params.channelId);
  const formatted = resolveFormattedAllowFrom(params).filter(
    (entry) => entry.trim().length > 0 && entry.trim() !== "*",
  );
  const ownerAllowFrom = Array.from(
    new Set(formatted.map((entry) => `${channelPrefix}:${entry.trim()}`)),
  );
  if (ownerAllowFrom.length === 0) {
    return {
      cfg: params.cfg,
      bootstrapped: false,
      ownerAllowFrom: [],
    };
  }

  return {
    cfg: {
      ...params.cfg,
      commands: {
        ...params.cfg.commands,
        ownerAllowFrom,
      },
    },
    bootstrapped: true,
    ownerAllowFrom,
  };
}
