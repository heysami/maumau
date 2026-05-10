import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MultiUserMemoryStore } from "./store.js";

describe("MultiUserMemoryStore", () => {
  const stores: MultiUserMemoryStore[] = [];
  const dirs: string[] = [];

  afterEach(() => {
    for (const store of stores.splice(0)) {
      store.close();
    }
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function createStore(): MultiUserMemoryStore {
    const dir = mkdtempSync(path.join(tmpdir(), "multi-user-memory-"));
    dirs.push(dir);
    const store = new MultiUserMemoryStore(path.join(dir, "state.sqlite"));
    stores.push(store);
    return store;
  }

  it("creates provisional users, records session context, and keeps scoped search isolated", () => {
    const store = createStore();

    const discovered = store.observeIdentity({
      channelId: "whatsapp",
      senderId: "wa-dad",
      senderName: "Ayah",
      previewText: "Saya datang besok malam",
      createProvisional: true,
    });
    const observed = store.observeIdentity({
      channelId: "whatsapp",
      senderId: "wa-dad",
      senderName: "Ayah",
      sessionKey: "session:house:dad",
      conversationId: "chat:dad",
      agentId: "house",
      resolvedUserId: "dad",
      effectiveLanguage: "id",
      previewText: "Saya datang besok malam",
      createProvisional: true,
    });

    expect(discovered.provisionalUserId).toBeDefined();
    expect(observed.provisionalUserId).toBe(discovered.provisionalUserId);
    expect(store.getSessionContext("session:house:dad")).toMatchObject({
      agentId: "house",
      conversationId: "chat:dad",
      requesterSenderId: "wa-dad",
      resolvedUserId: "dad",
      effectiveLanguage: "id",
    });

    const globalItem = store.createMemoryItem({
      scopeType: "global",
      scopeId: "global",
      body: "Emergency numbers stay in the kitchen drawer.",
      summary: "Shared emergency instructions",
    });
    const dadPrivate = store.createMemoryItem({
      scopeType: "private",
      scopeId: "dad",
      body: "Dad prefers Bahasa Indonesia for direct replies.",
      summary: "Dad language preference",
      sourceUserId: "dad",
    });
    const familyShared = store.createMemoryItem({
      scopeType: "group",
      scopeId: "family",
      body: "Dad and Sam will attend the school event on Saturday.",
      summary: "Shared family event",
      sourceUserId: "dad",
    });
    store.createMemoryItem({
      scopeType: "private",
      scopeId: "mom",
      body: "Mom has a separate private note.",
      summary: "Should stay hidden",
      sourceUserId: "mom",
    });

    expect(
      store.search({
        query: "dad bahasa event",
        scopeKeys: ["global", "private:dad", "group:family"],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: `private/dad/${dadPrivate.itemId}.md` }),
        expect.objectContaining({ path: `group/family/${familyShared.itemId}.md` }),
        expect.objectContaining({ path: `global/${globalItem.itemId}.md` }),
      ]),
    );
    expect(
      store.search({
        query: "mom private",
        scopeKeys: ["global", "private:dad", "group:family"],
        minScore: 0.2,
      }),
    ).toEqual([]);

    expect(
      store.readScopedPath({
        relPath: `private/dad/${dadPrivate.itemId}.md`,
        scopeKeys: ["global", "private:dad"],
      }),
    ).toEqual({
      path: `private/dad/${dadPrivate.itemId}.md`,
      text: "Dad prefers Bahasa Indonesia for direct replies.",
    });
    expect(
      store.readScopedPath({
        relPath: `private/mom/${dadPrivate.itemId}.md`,
        scopeKeys: ["global", "private:dad"],
      }),
    ).toMatchObject({
      disabled: true,
      error: "Path is outside the active user's visible scopes.",
    });
  });

  it("promotes approved proposals into shared group memory while keeping the source private", () => {
    const store = createStore();

    const privateItem = store.createMemoryItem({
      scopeType: "private",
      scopeId: "dad",
      body: "Dad and Sam will attend the school event tomorrow evening.",
      summary: "Shared event attendance",
      itemKind: "event",
      sourceUserId: "dad",
    });

    const proposal = store.createPromotionProposal({
      sourceItemId: privateItem.itemId,
      sourceUserId: "dad",
      targetGroupId: "family",
      whyShared: "shared planning or attendance could be affected",
      preview: "Dad and Sam will attend the school event tomorrow evening.",
      affectedUserIds: ["sam"],
    });

    expect(store.listPendingProposalsForUser("dad")).toEqual([
      expect.objectContaining({ proposalId: proposal.proposalId, status: "pending" }),
    ]);

    const approved = store.decideProposal({
      proposalId: proposal.proposalId,
      userId: "dad",
      action: "approve",
      note: "This affects family planning.",
    });

    expect(approved?.proposal).toMatchObject({
      proposalId: proposal.proposalId,
      status: "approved",
      decidedByUserId: "dad",
    });
    expect(approved?.approvedItem).toMatchObject({
      scopeType: "group",
      scopeId: "family",
      provenanceItemId: privateItem.itemId,
      sourceUserId: "dad",
    });
    expect(store.getMemoryItemById(privateItem.itemId)).toMatchObject({
      scopeType: "private",
      scopeId: "dad",
    });
    expect(
      store.search({
        query: "school event",
        scopeKeys: ["group:family"],
      }),
    ).toEqual([
      expect.objectContaining({
        path: `group/family/${approved?.approvedItem?.itemId}.md`,
      }),
    ]);
  });

  it("forgets a memory item, hiding it from search and listings", () => {
    const store = createStore();

    const privateItem = store.createMemoryItem({
      scopeType: "private",
      scopeId: "dad",
      body: "Dad prefers Bahasa Indonesia for direct replies.",
      summary: "Dad language preference",
      sourceUserId: "dad",
    });
    const otherItem = store.createMemoryItem({
      scopeType: "private",
      scopeId: "dad",
      body: "Dad's coffee is two sugars.",
      sourceUserId: "dad",
    });

    expect(
      store
        .search({ query: "bahasa", scopeKeys: ["private:dad"], minScore: 0.2 })
        .map((entry) => entry.path),
    ).toContain(`private/dad/${privateItem.itemId}.md`);

    const result = store.forgetMemoryItem({
      itemId: privateItem.itemId,
      reason: "user-request",
    });
    expect(result?.wasActive).toBe(true);
    expect(result?.item.status).toBe("forgotten");
    expect(result?.item.forgetReason).toBe("user-request");

    expect(
      store
        .search({ query: "bahasa", scopeKeys: ["private:dad"], minScore: 0.2 })
        .map((entry) => entry.path),
    ).not.toContain(`private/dad/${privateItem.itemId}.md`);
    expect(
      store.readScopedPath({
        relPath: `private/dad/${privateItem.itemId}.md`,
        scopeKeys: ["private:dad"],
      }),
    ).toMatchObject({ disabled: true });

    const stillActive = store.listActiveMemoryItems();
    expect(stillActive.map((item) => item.itemId)).toEqual([otherItem.itemId]);

    const second = store.forgetMemoryItem({
      itemId: privateItem.itemId,
      reason: "user-request",
    });
    expect(second?.wasActive).toBe(false);
  });

  it("returns null when forgetting an unknown item", () => {
    const store = createStore();
    expect(store.forgetMemoryItem({ itemId: "missing-id", reason: "user-request" })).toBeNull();
  });

  it("prunes daily items past the retention window and leaves recent ones alone", () => {
    const store = createStore();
    const dayMs = 86_400_000;

    const dailyItem = store.createMemoryItem({
      scopeType: "private",
      scopeId: "dad",
      body: "Daily note",
      durability: "daily",
    });
    const durableItem = store.createMemoryItem({
      scopeType: "global",
      scopeId: "global",
      body: "Durable note",
      durability: "durable",
    });

    const created = dailyItem.createdAt;

    // Five days after creation: nothing should expire under a 30-day daily TTL.
    const earlyResult = store.pruneExpiredItems({
      policy: { dailyTtlMs: 30 * dayMs, durableTtlMs: 0 },
      now: created + 5 * dayMs,
    });
    expect(earlyResult.expired).toBe(0);
    expect(store.getMemoryItemById(dailyItem.itemId)?.status).toBe("active");

    // 60 days after creation: the daily item is past TTL and gets expired.
    const lateResult = store.pruneExpiredItems({
      policy: { dailyTtlMs: 30 * dayMs, durableTtlMs: 0 },
      now: created + 60 * dayMs,
    });
    expect(lateResult.expired).toBe(1);
    expect(lateResult.sample[0]?.itemId).toBe(dailyItem.itemId);

    const expired = store.getMemoryItemById(dailyItem.itemId);
    expect(expired?.status).toBe("expired");
    expect(expired?.forgetReason).toBe("ttl");
    expect(typeof expired?.forgottenAt).toBe("number");

    // Durable item must still be active because durableTtlMs is 0 (disabled).
    expect(store.getMemoryItemById(durableItem.itemId)?.status).toBe("active");
    expect(store.listActiveMemoryItems().map((item) => item.itemId)).toEqual([durableItem.itemId]);
  });

  it("expires durable items only when durableTtlMs > 0", () => {
    const store = createStore();
    const dayMs = 86_400_000;

    const durable = store.createMemoryItem({
      scopeType: "private",
      scopeId: "dad",
      body: "Long-lived durable note",
      durability: "durable",
    });

    const noDurableTtl = store.pruneExpiredItems({
      policy: { dailyTtlMs: 30 * dayMs, durableTtlMs: 0 },
      now: durable.createdAt + 365 * dayMs,
    });
    expect(noDurableTtl.expired).toBe(0);

    const withDurableTtl = store.pruneExpiredItems({
      policy: { dailyTtlMs: 30 * dayMs, durableTtlMs: 90 * dayMs },
      now: durable.createdAt + 365 * dayMs,
    });
    expect(withDurableTtl.expired).toBe(1);
  });

  it("tracks last-prune timestamps via retention_state", () => {
    const store = createStore();
    expect(store.getRetentionState("last_prune_at")).toBeNull();

    store.setRetentionState("last_prune_at", 12345);
    expect(store.getRetentionState("last_prune_at")).toBe(12345);

    store.setRetentionState("last_prune_at", 67890);
    expect(store.getRetentionState("last_prune_at")).toBe(67890);
  });
});
