import type { IncomingMessage, ServerResponse } from "node:http";
import type { MaumauPluginApi } from "../api.js";
import { resolveConfiguredUserMatch } from "./config.js";
import { loadCurrentMaumauConfig, resolveCurrentMultiUserMemoryConfig } from "./runtime-config.js";
import type { MultiUserMemoryStore } from "./store.js";

export const ADMIN_API_PATH = "/api/plugins/multi-user-memory/admin";

function writeJson(
  req: IncomingMessage,
  res: ServerResponse,
  statusCode: number,
  payload: unknown,
): true {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  res.end(JSON.stringify(payload));
  return true;
}

function readSlotSelected(api: MaumauPluginApi): boolean {
  return loadCurrentMaumauConfig(api).plugins?.slots?.memory === "multi-user-memory";
}

function readEntryConfigured(api: MaumauPluginApi): boolean {
  return Boolean(loadCurrentMaumauConfig(api).plugins?.entries?.["multi-user-memory"]);
}

function filterPendingProvisionalUsers(api: MaumauPluginApi, store: MultiUserMemoryStore) {
  const pluginConfig = resolveCurrentMultiUserMemoryConfig(api);
  return store.listProvisionalUsers().filter(
    (provisional) =>
      !resolveConfiguredUserMatch(pluginConfig, {
        channelId: provisional.channelId,
        accountId: provisional.accountId,
        senderId: provisional.senderId,
      }),
  );
}

export function createAdminApiHttpHandler(params: {
  api: MaumauPluginApi;
  store: MultiUserMemoryStore;
}) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.statusCode = 405;
      res.setHeader("Allow", "GET, HEAD");
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: false, error: "Method Not Allowed" }));
      return true;
    }

    const pluginConfig = resolveCurrentMultiUserMemoryConfig(params.api);
    return writeJson(req, res, 200, {
      ok: true,
      plugin: {
        slotSelected: readSlotSelected(params.api),
        entryConfigured: readEntryConfigured(params.api),
        enabled: pluginConfig.enabled,
        autoDiscover: pluginConfig.autoDiscover,
        defaultLanguage: pluginConfig.defaultLanguage,
      },
      provisionalUsers: filterPendingProvisionalUsers(params.api, params.store),
      proposals: params.store.listPendingProposals(),
    });
  };
}
