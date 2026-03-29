import { mkdtempSync, rmSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { createMockServerResponse } from "../../../test/helpers/extensions/mock-http-response.js";
import { createTestPluginApi } from "../../../test/helpers/extensions/plugin-api.js";
import type { MaumauPluginApi } from "../api.js";
import {
  buildApprovalCenterLink,
  createApprovalCenterHttpHandler,
  issueApprovalCenterToken,
  verifyApprovalCenterToken,
} from "./approval-center.js";
import { resolveMultiUserMemoryConfig } from "./config.js";
import { MultiUserMemoryStore } from "./store.js";

function localReq(input: {
  method: string;
  url: string;
  headers?: IncomingMessage["headers"];
  body?: string;
}): IncomingMessage {
  return Object.assign(Readable.from(input.body ? [input.body] : []), {
    method: input.method,
    url: input.url,
    headers: input.headers ?? {},
    socket: { remoteAddress: "127.0.0.1" },
  }) as unknown as IncomingMessage;
}

describe("multi-user-memory approval center", () => {
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
    const stateDir = mkdtempSync(path.join(tmpdir(), "multi-user-memory-approval-"));
    dirs.push(stateDir);
    const store = new MultiUserMemoryStore(path.join(stateDir, "state.sqlite"));
    stores.push(store);
    const api = createTestPluginApi({
      id: "multi-user-memory",
      name: "Multi-User Memory",
      source: "test",
      config: {
        gateway: {
          bind: "loopback",
          port: 18789,
        },
        plugins: {
          entries: {
            "multi-user-memory": {
              config: {
                enabled: true,
                defaultLanguage: "en",
                approvalCenterBaseUrl: "https://family-gateway.tail123.ts.net",
                users: {
                  dad: {
                    displayName: "Ayah",
                    preferredLanguage: "id",
                    identities: [{ channelId: "whatsapp", senderId: "wa-dad" }],
                  },
                },
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
    const pluginConfig = resolveMultiUserMemoryConfig(api.config);
    return { api, pluginConfig, stateDir, store };
  }

  it("builds a signed link and renders pending approvals in the user's language", async () => {
    const { api, pluginConfig, stateDir, store } = createFixture();
    const privateItem = store.createMemoryItem({
      scopeType: "private",
      scopeId: "dad",
      body: "Ayah dan Sam akan menghadiri acara sekolah besok malam.",
      summary: "Acara sekolah",
      itemKind: "event",
      sourceUserId: "dad",
    });
    const proposal = store.createPromotionProposal({
      sourceItemId: privateItem.itemId,
      sourceUserId: "dad",
      targetGroupId: "family",
      whyShared: "shared planning or attendance could be affected",
      preview: "Ayah dan Sam akan menghadiri acara sekolah besok malam.",
      affectedUserIds: ["sam"],
    });

    const approvalCenter = await buildApprovalCenterLink({
      cfg: api.config,
      pluginConfig,
      stateDir,
      userId: "dad",
    });

    expect(approvalCenter?.url).toContain(
      "https://family-gateway.tail123.ts.net/plugins/multi-user-memory/approvals?t=",
    );
    const token = new URL(approvalCenter?.url ?? "https://invalid").searchParams.get("t");
    await expect(verifyApprovalCenterToken({ stateDir, token })).resolves.toMatchObject({
      ok: true,
      payload: { userId: "dad" },
    });

    const handler = createApprovalCenterHttpHandler({ api, store });
    const res = createMockServerResponse();
    const routeUrl = new URL(approvalCenter?.url ?? "https://invalid");
    const handled = await handler(
      localReq({
        method: "GET",
        url: `${routeUrl.pathname}${routeUrl.search}`,
      }),
      res,
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(String(res.body)).toContain("Persetujuan berbagi memori untuk Ayah");
    expect(String(res.body)).toContain("Setujui");
    expect(String(res.body)).toContain(proposal.preview);
  });

  it("approves proposals through the signed page flow", async () => {
    const { api, pluginConfig, stateDir, store } = createFixture();
    const privateItem = store.createMemoryItem({
      scopeType: "private",
      scopeId: "dad",
      body: "Ayah akan datang terlambat untuk jemput sekolah hari Jumat.",
      summary: "Jemput sekolah",
      itemKind: "availability",
      sourceUserId: "dad",
    });
    const proposal = store.createPromotionProposal({
      sourceItemId: privateItem.itemId,
      sourceUserId: "dad",
      targetGroupId: "family",
      whyShared: "household logistics could be affected",
      preview: "Ayah akan datang terlambat untuk jemput sekolah hari Jumat.",
      affectedUserIds: ["sam"],
    });

    const approvalCenter = await buildApprovalCenterLink({
      cfg: api.config,
      pluginConfig,
      stateDir,
      userId: "dad",
    });
    const token = new URL(approvalCenter?.url ?? "https://invalid").searchParams.get("t");
    const handler = createApprovalCenterHttpHandler({ api, store });
    const res = createMockServerResponse();
    const handled = await handler(
      localReq({
        method: "POST",
        url: "/plugins/multi-user-memory/approvals",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          t: token ?? "",
          proposalId: proposal.proposalId,
          action: "approve",
        }).toString(),
      }),
      res,
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(303);
    expect(res.getHeader("location")).toContain("notice=approved");
    expect(store.getProposal(proposal.proposalId)).toMatchObject({
      status: "approved",
      decidedByUserId: "dad",
    });
    expect(store.listPendingProposalsForUser("dad")).toEqual([]);
  });

  it("treats expired tokens as invalid for later access", async () => {
    const { stateDir } = createFixture();
    const issued = await issueApprovalCenterToken({
      stateDir,
      userId: "dad",
      ttlMs: 60_000,
      nowMs: 1_000,
    });

    await expect(
      verifyApprovalCenterToken({
        stateDir,
        token: issued.token,
        nowMs: 62_000,
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "expired",
    });
  });
});
