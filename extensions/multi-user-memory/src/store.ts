import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { MultiUserConfigUser, MultiUserIdentityConfig } from "./config.js";
import type { SupportedLanguageId } from "./language.js";

type ScopeType = "global" | "group" | "private" | "provisional";
type ProposalStatus = "pending" | "approved" | "rejected";

export type IdentityObservationInput = {
  channelId: string;
  accountId?: string;
  senderId: string;
  senderName?: string;
  senderUsername?: string;
  sessionKey?: string;
  conversationId?: string;
  agentId?: string;
  isGroup?: boolean;
  resolvedUserId?: string;
  effectiveLanguage?: SupportedLanguageId;
  previewText?: string;
  createProvisional?: boolean;
};

export type PrincipalSessionContext = {
  sessionKey: string;
  agentId?: string;
  channelId?: string;
  accountId?: string;
  conversationId?: string;
  requesterSenderId?: string;
  requesterSenderName?: string;
  requesterSenderUsername?: string;
  isGroup: boolean;
  resolvedUserId?: string;
  provisionalUserId?: string;
  effectiveLanguage?: SupportedLanguageId;
  updatedAt: number;
};

export type ScopedMemoryItem = {
  itemId: string;
  scopeType: ScopeType;
  scopeId: string;
  body: string;
  summary?: string;
  itemKind?: string;
  sourceUserId?: string;
  provenance?: string;
  provenanceItemId?: string;
  durability: "daily" | "durable";
  entryDate?: string;
  createdAt: number;
  updatedAt: number;
};

export type ProposalRecord = {
  proposalId: string;
  sourceItemId: string;
  sourceUserId: string;
  targetGroupId: string;
  whyShared: string;
  preview: string;
  sensitivity?: string;
  affectedUserIds: string[];
  status: ProposalStatus;
  createdAt: number;
  decidedAt?: number;
  decidedByUserId?: string;
  approvedItemId?: string;
};

type StoredProposalRow = {
  proposal_id: string;
  source_item_id: string;
  source_user_id: string;
  target_group_id: string;
  why_shared: string;
  preview: string;
  sensitivity: string | null;
  affected_user_ids_json: string;
  status: ProposalStatus;
  created_at: number;
  decided_at: number | null;
  decided_by_user_id: string | null;
  approved_item_id: string | null;
};

type StoredMemoryRow = {
  item_id: string;
  scope_type: ScopeType;
  scope_id: string;
  body: string;
  summary: string | null;
  item_kind: string | null;
  source_user_id: string | null;
  provenance: string | null;
  provenance_item_id: string | null;
  durability: string | null;
  entry_date: string | null;
  created_at: number;
  updated_at: number;
};

function normalizeOptionalString(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function toAccountKey(value?: string | null): string {
  return normalizeOptionalString(value) ?? "";
}

function toScopePath(scopeType: ScopeType, scopeId: string, itemId: string): string {
  if (scopeType === "global") {
    return `global/${itemId}.md`;
  }
  return `${scopeType}/${scopeId}/${itemId}.md`;
}

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function buildSnippet(body: string, tokens: string[]): string {
  const normalized = body.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  if (tokens.length === 0) {
    return normalized.slice(0, 320);
  }
  const lower = normalized.toLowerCase();
  let start = 0;
  for (const token of tokens) {
    const index = lower.indexOf(token);
    if (index >= 0) {
      start = Math.max(0, index - 80);
      break;
    }
  }
  const snippet = normalized.slice(start, start + 360);
  return start > 0 ? `...${snippet}` : snippet;
}

function scoreCandidate(
  body: string,
  summary: string | null,
  query: string,
  updatedAt: number,
): number {
  const haystack = `${summary ?? ""}\n${body}`.toLowerCase();
  const normalizedQuery = query.trim().toLowerCase();
  const tokens = tokenizeQuery(query);
  if (!haystack.trim()) {
    return 0;
  }
  let tokenMatches = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) {
      tokenMatches += 1;
    }
  }
  const exactBonus = normalizedQuery && haystack.includes(normalizedQuery) ? 0.35 : 0;
  const recencyDays = Math.max(0, (Date.now() - updatedAt) / 86_400_000);
  const recencyBonus = Math.max(0, 0.15 - recencyDays * 0.01);
  const tokenScore = tokens.length > 0 ? tokenMatches / tokens.length : 0;
  return Math.min(1, tokenScore + exactBonus + recencyBonus);
}

function parsePath(
  relPath: string,
): { scopeType: ScopeType; scopeId: string; itemId: string } | null {
  const normalized = relPath.trim().replace(/^\/+/, "");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 2 && segments[0] === "global" && segments[1].endsWith(".md")) {
    return {
      scopeType: "global",
      scopeId: "global",
      itemId: segments[1].slice(0, -3),
    };
  }
  if (segments.length === 3 && segments[2].endsWith(".md")) {
    const scopeType = segments[0];
    if (scopeType !== "group" && scopeType !== "private" && scopeType !== "provisional") {
      return null;
    }
    return {
      scopeType,
      scopeId: segments[1],
      itemId: segments[2].slice(0, -3),
    };
  }
  return null;
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function rowToProposal(row: StoredProposalRow): ProposalRecord {
  return {
    proposalId: row.proposal_id,
    sourceItemId: row.source_item_id,
    sourceUserId: row.source_user_id,
    targetGroupId: row.target_group_id,
    whyShared: row.why_shared,
    preview: row.preview,
    sensitivity: row.sensitivity ?? undefined,
    affectedUserIds: parseJsonArray(row.affected_user_ids_json),
    status: row.status,
    createdAt: row.created_at,
    decidedAt: row.decided_at ?? undefined,
    decidedByUserId: row.decided_by_user_id ?? undefined,
    approvedItemId: row.approved_item_id ?? undefined,
  };
}

function rowToMemoryItem(row: StoredMemoryRow): ScopedMemoryItem {
  return {
    itemId: row.item_id,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    body: row.body,
    summary: row.summary ?? undefined,
    itemKind: row.item_kind ?? undefined,
    sourceUserId: row.source_user_id ?? undefined,
    provenance: row.provenance ?? undefined,
    provenanceItemId: row.provenance_item_id ?? undefined,
    durability: row.durability === "daily" ? "daily" : "durable",
    entryDate: row.entry_date ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class MultiUserMemoryStore {
  readonly dbPath: string;
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.ensureSchema();
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS provisional_users (
        provisional_user_id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        account_id TEXT NOT NULL DEFAULT '',
        sender_id TEXT NOT NULL,
        sender_name TEXT,
        sender_username TEXT,
        preferred_language TEXT,
        first_seen_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        message_count INTEGER NOT NULL DEFAULT 1
      );
      CREATE UNIQUE INDEX IF NOT EXISTS provisional_users_identity_idx
        ON provisional_users(channel_id, account_id, sender_id);

      CREATE TABLE IF NOT EXISTS identity_observations (
        observation_id TEXT PRIMARY KEY,
        observed_at INTEGER NOT NULL,
        channel_id TEXT NOT NULL,
        account_id TEXT NOT NULL DEFAULT '',
        sender_id TEXT NOT NULL,
        sender_name TEXT,
        sender_username TEXT,
        session_key TEXT,
        conversation_id TEXT,
        agent_id TEXT,
        is_group INTEGER NOT NULL DEFAULT 0,
        resolved_user_id TEXT,
        provisional_user_id TEXT,
        message_preview TEXT
      );
      CREATE INDEX IF NOT EXISTS identity_observations_session_idx
        ON identity_observations(session_key, observed_at DESC);

      CREATE TABLE IF NOT EXISTS conversation_state (
        session_key TEXT PRIMARY KEY,
        updated_at INTEGER NOT NULL,
        agent_id TEXT,
        channel_id TEXT,
        account_id TEXT NOT NULL DEFAULT '',
        conversation_id TEXT,
        requester_sender_id TEXT,
        requester_sender_name TEXT,
        requester_sender_username TEXT,
        is_group INTEGER NOT NULL DEFAULT 0,
        resolved_user_id TEXT,
        provisional_user_id TEXT,
        effective_language TEXT
      );

      CREATE TABLE IF NOT EXISTS memory_items (
        item_id TEXT PRIMARY KEY,
        scope_type TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        body TEXT NOT NULL,
        summary TEXT,
        item_kind TEXT,
        source_user_id TEXT,
        provenance TEXT,
        provenance_item_id TEXT,
        durability TEXT NOT NULL DEFAULT 'durable',
        entry_date TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'active'
      );
      CREATE INDEX IF NOT EXISTS memory_items_scope_idx
        ON memory_items(scope_type, scope_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS promotion_proposals (
        proposal_id TEXT PRIMARY KEY,
        source_item_id TEXT NOT NULL,
        source_user_id TEXT NOT NULL,
        target_group_id TEXT NOT NULL,
        why_shared TEXT NOT NULL,
        preview TEXT NOT NULL,
        sensitivity TEXT,
        affected_user_ids_json TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        decided_at INTEGER,
        decided_by_user_id TEXT,
        approved_item_id TEXT
      );
      CREATE INDEX IF NOT EXISTS promotion_proposals_source_idx
        ON promotion_proposals(source_item_id, status);

      CREATE TABLE IF NOT EXISTS approval_events (
        approval_event_id TEXT PRIMARY KEY,
        proposal_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        note TEXT,
        created_at INTEGER NOT NULL
      );
    `);
    this.ensureMemoryItemColumn("provenance", "TEXT");
    this.ensureMemoryItemColumn("durability", "TEXT NOT NULL DEFAULT 'durable'");
    this.ensureMemoryItemColumn("entry_date", "TEXT");
  }

  private ensureMemoryItemColumn(column: string, definition: string): void {
    const rows = this.db
      .prepare("PRAGMA table_info(memory_items)")
      .all() as Array<{ name?: string }>;
    if (rows.some((row) => row.name === column)) {
      return;
    }
    this.db.exec(`ALTER TABLE memory_items ADD COLUMN ${column} ${definition}`);
  }

  close(): void {
    this.db.close();
  }

  findProvisionalUserByIdentity(params: {
    channelId: string;
    accountId?: string;
    senderId: string;
  }): { provisionalUserId: string; preferredLanguage?: SupportedLanguageId } | null {
    const row = this.db
      .prepare(
        `
          SELECT provisional_user_id, preferred_language
          FROM provisional_users
          WHERE channel_id = ? AND account_id = ? AND sender_id = ?
        `,
      )
      .get(params.channelId, toAccountKey(params.accountId), params.senderId) as
      | { provisional_user_id: string; preferred_language: string | null }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      provisionalUserId: row.provisional_user_id,
      preferredLanguage: normalizeOptionalString(row.preferred_language) as
        | SupportedLanguageId
        | undefined,
    };
  }

  findProvisionalIdsForConfiguredUser(user: MultiUserConfigUser): string[] {
    const ids = new Set<string>();
    for (const identity of user.identities) {
      const found = this.findProvisionalUserByIdentity(identity);
      if (found?.provisionalUserId) {
        ids.add(found.provisionalUserId);
      }
    }
    return [...ids];
  }

  observeIdentity(input: IdentityObservationInput): {
    provisionalUserId?: string;
    sessionContext?: PrincipalSessionContext;
  } {
    const now = Date.now();
    const accountId = toAccountKey(input.accountId);
    let provisionalUserId =
      this.findProvisionalUserByIdentity({
        channelId: input.channelId,
        accountId,
        senderId: input.senderId,
      })?.provisionalUserId ?? undefined;

    if (!input.resolvedUserId && input.createProvisional !== false && !provisionalUserId) {
      provisionalUserId = randomUUID();
      this.db
        .prepare(
          `
            INSERT INTO provisional_users (
              provisional_user_id,
              channel_id,
              account_id,
              sender_id,
              sender_name,
              sender_username,
              first_seen_at,
              last_seen_at,
              message_count
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
          `,
        )
        .run(
          provisionalUserId,
          input.channelId,
          accountId,
          input.senderId,
          normalizeOptionalString(input.senderName) ?? null,
          normalizeOptionalString(input.senderUsername) ?? null,
          now,
          now,
        );
    } else if (provisionalUserId) {
      this.db
        .prepare(
          `
            UPDATE provisional_users
            SET sender_name = COALESCE(?, sender_name),
                sender_username = COALESCE(?, sender_username),
                last_seen_at = ?,
                message_count = message_count + 1
            WHERE provisional_user_id = ?
          `,
        )
        .run(
          normalizeOptionalString(input.senderName) ?? null,
          normalizeOptionalString(input.senderUsername) ?? null,
          now,
          provisionalUserId,
        );
    }

    this.db
      .prepare(
        `
          INSERT INTO identity_observations (
            observation_id,
            observed_at,
            channel_id,
            account_id,
            sender_id,
            sender_name,
            sender_username,
            session_key,
            conversation_id,
            agent_id,
            is_group,
            resolved_user_id,
            provisional_user_id,
            message_preview
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        randomUUID(),
        now,
        input.channelId,
        accountId,
        input.senderId,
        normalizeOptionalString(input.senderName) ?? null,
        normalizeOptionalString(input.senderUsername) ?? null,
        normalizeOptionalString(input.sessionKey) ?? null,
        normalizeOptionalString(input.conversationId) ?? null,
        normalizeOptionalString(input.agentId) ?? null,
        input.isGroup ? 1 : 0,
        normalizeOptionalString(input.resolvedUserId) ?? null,
        provisionalUserId ?? null,
        normalizeOptionalString(input.previewText)?.slice(0, 280) ?? null,
      );

    let sessionContext: PrincipalSessionContext | undefined;
    if (input.sessionKey) {
      this.db
        .prepare(
          `
            INSERT INTO conversation_state (
              session_key,
              updated_at,
              agent_id,
              channel_id,
              account_id,
              conversation_id,
              requester_sender_id,
              requester_sender_name,
              requester_sender_username,
              is_group,
              resolved_user_id,
              provisional_user_id,
              effective_language
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_key) DO UPDATE SET
              updated_at = excluded.updated_at,
              agent_id = excluded.agent_id,
              channel_id = excluded.channel_id,
              account_id = excluded.account_id,
              conversation_id = excluded.conversation_id,
              requester_sender_id = excluded.requester_sender_id,
              requester_sender_name = excluded.requester_sender_name,
              requester_sender_username = excluded.requester_sender_username,
              is_group = excluded.is_group,
              resolved_user_id = excluded.resolved_user_id,
              provisional_user_id = excluded.provisional_user_id,
              effective_language = excluded.effective_language
          `,
        )
        .run(
          input.sessionKey,
          now,
          normalizeOptionalString(input.agentId) ?? null,
          normalizeOptionalString(input.channelId) ?? null,
          accountId,
          normalizeOptionalString(input.conversationId) ?? null,
          input.senderId,
          normalizeOptionalString(input.senderName) ?? null,
          normalizeOptionalString(input.senderUsername) ?? null,
          input.isGroup ? 1 : 0,
          normalizeOptionalString(input.resolvedUserId) ?? null,
          provisionalUserId ?? null,
          normalizeOptionalString(input.effectiveLanguage) ?? null,
        );
      sessionContext = this.getSessionContext(input.sessionKey) ?? undefined;
    }

    return { provisionalUserId, sessionContext };
  }

  getSessionContext(sessionKey: string): PrincipalSessionContext | null {
    const row = this.db
      .prepare(
        `
          SELECT
            session_key,
            updated_at,
            agent_id,
            channel_id,
            account_id,
            conversation_id,
            requester_sender_id,
            requester_sender_name,
            requester_sender_username,
            is_group,
            resolved_user_id,
            provisional_user_id,
            effective_language
          FROM conversation_state
          WHERE session_key = ?
        `,
      )
      .get(sessionKey) as
      | {
          session_key: string;
          updated_at: number;
          agent_id: string | null;
          channel_id: string | null;
          account_id: string;
          conversation_id: string | null;
          requester_sender_id: string | null;
          requester_sender_name: string | null;
          requester_sender_username: string | null;
          is_group: number;
          resolved_user_id: string | null;
          provisional_user_id: string | null;
          effective_language: string | null;
        }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      sessionKey: row.session_key,
      updatedAt: row.updated_at,
      agentId: normalizeOptionalString(row.agent_id),
      channelId: normalizeOptionalString(row.channel_id),
      accountId: normalizeOptionalString(row.account_id),
      conversationId: normalizeOptionalString(row.conversation_id),
      requesterSenderId: normalizeOptionalString(row.requester_sender_id),
      requesterSenderName: normalizeOptionalString(row.requester_sender_name),
      requesterSenderUsername: normalizeOptionalString(row.requester_sender_username),
      isGroup: row.is_group === 1,
      resolvedUserId: normalizeOptionalString(row.resolved_user_id),
      provisionalUserId: normalizeOptionalString(row.provisional_user_id),
      effectiveLanguage: normalizeOptionalString(row.effective_language) as
        | SupportedLanguageId
        | undefined,
    };
  }

  createMemoryItem(params: {
    scopeType: ScopeType;
    scopeId: string;
    body: string;
    summary?: string;
    itemKind?: string;
    sourceUserId?: string;
    provenance?: string;
    provenanceItemId?: string;
    durability?: "daily" | "durable";
    entryDate?: string;
  }): ScopedMemoryItem {
    const now = Date.now();
    const itemId = randomUUID();
    this.db
      .prepare(
        `
          INSERT INTO memory_items (
            item_id,
            scope_type,
            scope_id,
            body,
            summary,
            item_kind,
            source_user_id,
            provenance,
            provenance_item_id,
            durability,
            entry_date,
            created_at,
            updated_at,
            status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
        `,
      )
      .run(
        itemId,
        params.scopeType,
        params.scopeId,
        params.body.trim(),
        normalizeOptionalString(params.summary) ?? null,
        normalizeOptionalString(params.itemKind) ?? null,
        normalizeOptionalString(params.sourceUserId) ?? null,
        normalizeOptionalString(params.provenance) ?? null,
        normalizeOptionalString(params.provenanceItemId) ?? null,
        params.durability === "daily" ? "daily" : "durable",
        normalizeOptionalString(params.entryDate) ?? null,
        now,
        now,
      );
    return {
      itemId,
      scopeType: params.scopeType,
      scopeId: params.scopeId,
      body: params.body.trim(),
      summary: normalizeOptionalString(params.summary),
      itemKind: normalizeOptionalString(params.itemKind),
      sourceUserId: normalizeOptionalString(params.sourceUserId),
      provenance: normalizeOptionalString(params.provenance),
      provenanceItemId: normalizeOptionalString(params.provenanceItemId),
      durability: params.durability === "daily" ? "daily" : "durable",
      entryDate: normalizeOptionalString(params.entryDate),
      createdAt: now,
      updatedAt: now,
    };
  }

  hasDuplicateRecentPrivateItem(params: {
    scopeId: string;
    body: string;
    sinceMs: number;
  }): boolean {
    const row = this.db
      .prepare(
        `
          SELECT item_id
          FROM memory_items
          WHERE scope_type = 'private'
            AND scope_id = ?
            AND body = ?
            AND updated_at >= ?
            AND status = 'active'
          LIMIT 1
        `,
      )
      .get(params.scopeId, params.body.trim(), params.sinceMs) as { item_id: string } | undefined;
    return Boolean(row?.item_id);
  }

  listRecentPrivateItems(limit: number): ScopedMemoryItem[] {
    const rows = this.db
      .prepare(
        `
          SELECT
            item_id,
            scope_type,
            scope_id,
            body,
            summary,
            item_kind,
            source_user_id,
            provenance,
            provenance_item_id,
            durability,
            entry_date,
            created_at,
            updated_at
          FROM memory_items
          WHERE scope_type = 'private'
            AND status = 'active'
          ORDER BY updated_at DESC
          LIMIT ?
        `,
      )
      .all(limit) as StoredMemoryRow[];
    return rows.map(rowToMemoryItem);
  }

  hasPendingProposalForItem(sourceItemId: string): boolean {
    const row = this.db
      .prepare(
        `
          SELECT proposal_id
          FROM promotion_proposals
          WHERE source_item_id = ?
            AND status = 'pending'
          LIMIT 1
        `,
      )
      .get(sourceItemId) as { proposal_id: string } | undefined;
    return Boolean(row?.proposal_id);
  }

  createPromotionProposal(params: {
    sourceItemId: string;
    sourceUserId: string;
    targetGroupId: string;
    whyShared: string;
    preview: string;
    sensitivity?: string;
    affectedUserIds: string[];
  }): ProposalRecord {
    const proposalId = randomUUID();
    const createdAt = Date.now();
    this.db
      .prepare(
        `
          INSERT INTO promotion_proposals (
            proposal_id,
            source_item_id,
            source_user_id,
            target_group_id,
            why_shared,
            preview,
            sensitivity,
            affected_user_ids_json,
            status,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
        `,
      )
      .run(
        proposalId,
        params.sourceItemId,
        params.sourceUserId,
        params.targetGroupId,
        params.whyShared,
        params.preview,
        normalizeOptionalString(params.sensitivity) ?? null,
        JSON.stringify(params.affectedUserIds),
        createdAt,
      );
    return {
      proposalId,
      sourceItemId: params.sourceItemId,
      sourceUserId: params.sourceUserId,
      targetGroupId: params.targetGroupId,
      whyShared: params.whyShared,
      preview: params.preview,
      sensitivity: normalizeOptionalString(params.sensitivity),
      affectedUserIds: params.affectedUserIds,
      status: "pending",
      createdAt,
    };
  }

  listPendingProposalsForUser(userId: string): ProposalRecord[] {
    const rows = this.db
      .prepare(
        `
          SELECT
            proposal_id,
            source_item_id,
            source_user_id,
            target_group_id,
            why_shared,
            preview,
            sensitivity,
            affected_user_ids_json,
            status,
            created_at,
            decided_at,
            decided_by_user_id,
            approved_item_id
          FROM promotion_proposals
          WHERE source_user_id = ?
            AND status = 'pending'
          ORDER BY created_at DESC
        `,
      )
      .all(userId) as StoredProposalRow[];
    return rows.map(rowToProposal);
  }

  listPendingProposals(): ProposalRecord[] {
    const rows = this.db
      .prepare(
        `
          SELECT
            proposal_id,
            source_item_id,
            source_user_id,
            target_group_id,
            why_shared,
            preview,
            sensitivity,
            affected_user_ids_json,
            status,
            created_at,
            decided_at,
            decided_by_user_id,
            approved_item_id
          FROM promotion_proposals
          ORDER BY created_at DESC
        `,
      )
      .all() as StoredProposalRow[];
    return rows.map(rowToProposal);
  }

  getProposal(proposalId: string): ProposalRecord | null {
    const row = this.db
      .prepare(
        `
          SELECT
            proposal_id,
            source_item_id,
            source_user_id,
            target_group_id,
            why_shared,
            preview,
            sensitivity,
            affected_user_ids_json,
            status,
            created_at,
            decided_at,
            decided_by_user_id,
            approved_item_id
          FROM promotion_proposals
          WHERE proposal_id = ?
        `,
      )
      .get(proposalId) as StoredProposalRow | undefined;
    return row ? rowToProposal(row) : null;
  }

  getMemoryItemById(itemId: string): ScopedMemoryItem | null {
    const row = this.db
      .prepare(
        `
          SELECT
            item_id,
            scope_type,
            scope_id,
            body,
            summary,
            item_kind,
            source_user_id,
            provenance,
            provenance_item_id,
            durability,
            entry_date,
            created_at,
            updated_at
          FROM memory_items
          WHERE item_id = ?
        `,
      )
      .get(itemId) as StoredMemoryRow | undefined;
    return row ? rowToMemoryItem(row) : null;
  }

  listActiveMemoryItems(): ScopedMemoryItem[] {
    const rows = this.db
      .prepare(
        `
          SELECT
            item_id,
            scope_type,
            scope_id,
            body,
            summary,
            item_kind,
            source_user_id,
            provenance,
            provenance_item_id,
            durability,
            entry_date,
            created_at,
            updated_at
          FROM memory_items
          WHERE status = 'active'
          ORDER BY scope_type, scope_id, created_at ASC
        `,
      )
      .all() as StoredMemoryRow[];
    return rows.map(rowToMemoryItem);
  }

  decideProposal(params: {
    proposalId: string;
    userId: string;
    action: "approve" | "reject";
    note?: string;
  }): { proposal: ProposalRecord; approvedItem?: ScopedMemoryItem } | null {
    const proposal = this.getProposal(params.proposalId);
    if (!proposal) {
      return null;
    }
    if (proposal.status !== "pending") {
      return { proposal };
    }
    const decidedAt = Date.now();
    let approvedItem: ScopedMemoryItem | undefined;
    if (params.action === "approve") {
      const sourceItem = this.getMemoryItemById(proposal.sourceItemId);
      if (sourceItem) {
        approvedItem = this.createMemoryItem({
          scopeType: "group",
          scopeId: proposal.targetGroupId,
          body: sourceItem.body,
          summary: sourceItem.summary,
          itemKind: sourceItem.itemKind ?? "shared",
          sourceUserId: proposal.sourceUserId,
          provenance: `proposal:${proposal.proposalId}`,
          provenanceItemId: sourceItem.itemId,
          durability: "durable",
        });
      }
    }

    this.db
      .prepare(
        `
          UPDATE promotion_proposals
          SET status = ?,
              decided_at = ?,
              decided_by_user_id = ?,
              approved_item_id = ?
          WHERE proposal_id = ?
        `,
      )
      .run(
        params.action === "approve" ? "approved" : "rejected",
        decidedAt,
        params.userId,
        approvedItem?.itemId ?? null,
        params.proposalId,
      );
    this.db
      .prepare(
        `
          INSERT INTO approval_events (
            approval_event_id,
            proposal_id,
            user_id,
            action,
            note,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        randomUUID(),
        params.proposalId,
        params.userId,
        params.action,
        normalizeOptionalString(params.note) ?? null,
        decidedAt,
      );

    return {
      proposal: this.getProposal(params.proposalId)!,
      approvedItem,
    };
  }

  listProvisionalUsers(): Array<{
    provisionalUserId: string;
    channelId: string;
    accountId?: string;
    senderId: string;
    senderName?: string;
    senderUsername?: string;
    firstSeenAt: number;
    lastSeenAt: number;
    messageCount: number;
  }> {
    const rows = this.db
      .prepare(
        `
          SELECT
            provisional_user_id,
            channel_id,
            account_id,
            sender_id,
            sender_name,
            sender_username,
            first_seen_at,
            last_seen_at,
            message_count
          FROM provisional_users
          ORDER BY last_seen_at DESC
        `,
      )
      .all() as Array<{
      provisional_user_id: string;
      channel_id: string;
      account_id: string;
      sender_id: string;
      sender_name: string | null;
      sender_username: string | null;
      first_seen_at: number;
      last_seen_at: number;
      message_count: number;
    }>;
    return rows.map((row) => ({
      provisionalUserId: row.provisional_user_id,
      channelId: row.channel_id,
      accountId: normalizeOptionalString(row.account_id),
      senderId: row.sender_id,
      senderName: normalizeOptionalString(row.sender_name),
      senderUsername: normalizeOptionalString(row.sender_username),
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      messageCount: row.message_count,
    }));
  }

  search(params: {
    query: string;
    scopeKeys: string[];
    maxResults?: number;
    minScore?: number;
  }): Array<{
    path: string;
    startLine: number;
    endLine: number;
    score: number;
    snippet: string;
    source: "memory";
  }> {
    const buckets = {
      private: [] as string[],
      group: [] as string[],
      provisional: [] as string[],
      global: false,
    };
    for (const scopeKey of params.scopeKeys) {
      if (scopeKey === "global") {
        buckets.global = true;
        continue;
      }
      const [scopeType, scopeId] = scopeKey.split(":", 2);
      if (
        (scopeType === "private" || scopeType === "group" || scopeType === "provisional") &&
        scopeId
      ) {
        buckets[scopeType].push(scopeId);
      }
    }
    const clauses: string[] = [];
    const values: string[] = [];
    if (buckets.global) {
      clauses.push(`(scope_type = 'global')`);
    }
    for (const scopeType of ["private", "group", "provisional"] as const) {
      const ids = buckets[scopeType];
      if (ids.length === 0) {
        continue;
      }
      clauses.push(
        `(scope_type = '${scopeType}' AND scope_id IN (${ids.map(() => "?").join(", ")}))`,
      );
      values.push(...ids);
    }
    if (clauses.length === 0) {
      return [];
    }
    const rows = this.db
      .prepare(
        `
          SELECT
            item_id,
            scope_type,
            scope_id,
            body,
            summary,
            updated_at
          FROM memory_items
          WHERE status = 'active'
            AND (${clauses.join(" OR ")})
          ORDER BY updated_at DESC
          LIMIT 500
        `,
      )
      .all(...values) as Array<{
      item_id: string;
      scope_type: ScopeType;
      scope_id: string;
      body: string;
      summary: string | null;
      updated_at: number;
    }>;

    const minScore = params.minScore ?? 0;
    const maxResults = Math.max(1, Math.min(params.maxResults ?? 8, 25));
    const tokens = tokenizeQuery(params.query);
    return rows
      .map((row) => {
        const score = scoreCandidate(row.body, row.summary, params.query, row.updated_at);
        return {
          path: toScopePath(row.scope_type, row.scope_id, row.item_id),
          startLine: 1,
          endLine: Math.max(1, row.body.split(/\r?\n/).length),
          score,
          snippet: buildSnippet(row.summary ? `${row.summary}\n${row.body}` : row.body, tokens),
          source: "memory" as const,
        };
      })
      .filter((row) => row.score >= minScore)
      .sort((left, right) => right.score - left.score)
      .slice(0, maxResults);
  }

  readScopedPath(params: {
    relPath: string;
    scopeKeys: string[];
    from?: number;
    lines?: number;
  }):
    | { path: string; text: string }
    | { path: string; text: string; disabled: true; error: string } {
    const parsed = parsePath(params.relPath);
    if (!parsed) {
      return {
        path: params.relPath,
        text: "",
        disabled: true,
        error: "Invalid multi-user-memory path.",
      };
    }
    const scopeKey =
      parsed.scopeType === "global" ? "global" : `${parsed.scopeType}:${parsed.scopeId}`;
    if (!params.scopeKeys.includes(scopeKey)) {
      return {
        path: params.relPath,
        text: "",
        disabled: true,
        error: "Path is outside the active user's visible scopes.",
      };
    }
    const row = this.db
      .prepare(
        `
          SELECT body
          FROM memory_items
          WHERE item_id = ?
            AND scope_type = ?
            AND scope_id = ?
            AND status = 'active'
        `,
      )
      .get(parsed.itemId, parsed.scopeType, parsed.scopeId) as { body: string } | undefined;
    if (!row) {
      return {
        path: params.relPath,
        text: "",
        disabled: true,
        error: "Memory item not found.",
      };
    }
    const bodyLines = row.body.split(/\r?\n/);
    const startLine = Math.max(1, params.from ?? 1);
    const maxLines = Math.max(1, params.lines ?? bodyLines.length);
    const sliced = bodyLines.slice(startLine - 1, startLine - 1 + maxLines).join("\n");
    return {
      path: params.relPath,
      text: sliced,
    };
  }

  explainIdentity(params: { channelId: string; accountId?: string; senderId: string }): {
    provisionalUserId?: string;
    recentSessions: string[];
  } {
    const provisional = this.findProvisionalUserByIdentity(params);
    const rows = this.db
      .prepare(
        `
          SELECT session_key
          FROM identity_observations
          WHERE channel_id = ?
            AND account_id = ?
            AND sender_id = ?
            AND session_key IS NOT NULL
          ORDER BY observed_at DESC
          LIMIT 5
        `,
      )
      .all(params.channelId, toAccountKey(params.accountId), params.senderId) as Array<{
      session_key: string | null;
    }>;
    return {
      provisionalUserId: provisional?.provisionalUserId,
      recentSessions: rows
        .map((row) => normalizeOptionalString(row.session_key))
        .filter((value): value is string => Boolean(value)),
    };
  }

  buildConfigSnippetForProvisional(params: {
    provisionalUserId: string;
    displayName?: string;
  }): string | null {
    const row = this.db
      .prepare(
        `
          SELECT
            provisional_user_id,
            channel_id,
            account_id,
            sender_id,
            sender_name,
            sender_username,
            preferred_language
          FROM provisional_users
          WHERE provisional_user_id = ?
        `,
      )
      .get(params.provisionalUserId) as
      | {
          provisional_user_id: string;
          channel_id: string;
          account_id: string;
          sender_id: string;
          sender_name: string | null;
          sender_username: string | null;
          preferred_language: string | null;
        }
      | undefined;
    if (!row) {
      return null;
    }
    const key = params.displayName
      ? params.displayName
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
      : `user-${row.provisional_user_id.slice(0, 8)}`;
    const snippet = {
      [key]: {
        displayName: params.displayName ?? normalizeOptionalString(row.sender_name) ?? key,
        preferredLanguage: normalizeOptionalString(row.preferred_language) ?? undefined,
        identities: [
          {
            channelId: row.channel_id,
            ...(normalizeOptionalString(row.account_id)
              ? { accountId: normalizeOptionalString(row.account_id) }
              : {}),
            senderId: row.sender_id,
            ...(normalizeOptionalString(row.sender_name)
              ? { senderName: normalizeOptionalString(row.sender_name) }
              : {}),
            ...(normalizeOptionalString(row.sender_username)
              ? { senderUsername: normalizeOptionalString(row.sender_username) }
              : {}),
          },
        ],
        active: true,
      },
    };
    return JSON.stringify(snippet, null, 2);
  }
}

export function resolveDefaultStorePath(stateDir: string): string {
  return path.join(stateDir, "plugins", "multi-user-memory", "state.sqlite");
}
