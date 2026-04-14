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
});
