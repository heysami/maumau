import { mkdtempSync, rmSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { createMockServerResponse } from "../../../test/helpers/extensions/mock-http-response.js";
import { createTestPluginApi } from "../../../test/helpers/extensions/plugin-api.js";
import type { MaumauPluginApi } from "../api.js";
import { createAdminApiHttpHandler } from "./admin-api.js";
import { MultiUserMemoryStore } from "./store.js";

function localReq(input: { method: string; url: string }): IncomingMessage {
  return Object.assign(Readable.from([]), {
    method: input.method,
    url: input.url,
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
  }) as unknown as IncomingMessage;
}

describe("multi-user-memory admin api", () => {
  const dirs: string[] = [];
  const stores: MultiUserMemoryStore[] = [];

  afterEach(() => {
    for (const store of stores.splice(0)) {
      store.close();
    }
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function createFixture() {
    const stateDir = mkdtempSync(path.join(tmpdir(), "multi-user-memory-admin-"));
    dirs.push(stateDir);
    const store = new MultiUserMemoryStore(path.join(stateDir, "state.sqlite"));
    stores.push(store);
    const api = createTestPluginApi({
      id: "multi-user-memory",
      name: "Multi-User Memory",
      source: "test",
      config: {
        plugins: {
          slots: {
            memory: "multi-user-memory",
          },
          entries: {
            "multi-user-memory": {
              config: {
                enabled: true,
                autoDiscover: true,
                defaultLanguage: "en",
              },
            },
          },
        },
      },
      runtime: {
        state: {
          resolveStateDir() {
            return stateDir;
          },
        },
      } as MaumauPluginApi["runtime"],
    });
    return { api, store };
  }

  it("returns runtime provisional users and proposals for the admin page", async () => {
    const { api, store } = createFixture();
    store.observeIdentity({
      channelId: "whatsapp",
      senderId: "dad-wa",
      senderName: "Dad",
      createProvisional: true,
    });
    const privateItem = store.createMemoryItem({
      scopeType: "private",
      scopeId: "dad",
      body: "Dad will be late for school pickup on Friday.",
      summary: "School pickup",
      itemKind: "availability",
      sourceUserId: "dad",
    });
    store.createPromotionProposal({
      sourceItemId: privateItem.itemId,
      sourceUserId: "dad",
      targetGroupId: "family",
      whyShared: "household logistics could be affected",
      preview: "Dad will be late for school pickup on Friday.",
      affectedUserIds: ["sam"],
    });

    const handler = createAdminApiHttpHandler({ api, store });
    const res = createMockServerResponse();
    const handled = await handler(
      localReq({ method: "GET", url: "/api/plugins/multi-user-memory/admin" }),
      res,
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(res.getHeader("cache-control")).toBe("no-store");
    expect(JSON.parse(String(res.body))).toMatchObject({
      ok: true,
      plugin: {
        slotSelected: true,
        entryConfigured: true,
        enabled: true,
        autoDiscover: true,
        defaultLanguage: "en",
      },
      provisionalUsers: [
        expect.objectContaining({
          channelId: "whatsapp",
          senderId: "dad-wa",
        }),
      ],
      proposals: [
        expect.objectContaining({
          sourceUserId: "dad",
          targetGroupId: "family",
          status: "pending",
        }),
      ],
    });
  });

  it("filters already-curated provisional identities out of the review list", async () => {
    const { api, store } = createFixture();
    store.observeIdentity({
      channelId: "telegram",
      senderId: "6925625562",
      senderName: "Samiadji",
      createProvisional: true,
    });
    const curatedApi = createTestPluginApi({
      ...api,
      config: {
        plugins: {
          slots: {
            memory: "multi-user-memory",
          },
          entries: {
            "multi-user-memory": {
              config: {
                enabled: true,
                autoDiscover: true,
                defaultLanguage: "en",
                adminUserIds: ["samiadji"],
                users: {
                  samiadji: {
                    displayName: "Samiadji",
                    preferredLanguage: "en",
                    identities: [
                      {
                        channelId: "telegram",
                        senderId: "6925625562",
                      },
                    ],
                    active: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const handler = createAdminApiHttpHandler({ api: curatedApi, store });
    const res = createMockServerResponse();
    await handler(localReq({ method: "GET", url: "/api/plugins/multi-user-memory/admin" }), res);

    expect(JSON.parse(String(res.body))).toMatchObject({
      provisionalUsers: [],
    });
  });

  it("rejects unsupported methods", async () => {
    const { api, store } = createFixture();
    const handler = createAdminApiHttpHandler({ api, store });
    const res = createMockServerResponse();
    const handled = await handler(
      localReq({ method: "POST", url: "/api/plugins/multi-user-memory/admin" }),
      res,
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(405);
    expect(res.getHeader("allow")).toBe("GET, HEAD");
  });
});
