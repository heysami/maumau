import { stripEnvelopeFromMessage } from "../../../../src/gateway/chat-sanitize.js";
import {
  buildAgentMainSessionKey,
  isSubagentSessionKey,
  parseAgentSessionKey,
  toAgentStoreSessionKey,
} from "../../../../src/routing/session-key.js";
import type { GatewayBrowserClient } from "../gateway.ts";
import {
  MAU_OFFICE_FOOT_OFFSET_Y,
  MAU_OFFICE_IDLE_PACKAGES,
  MAU_OFFICE_WORKER_RIG_IDS,
  resolveMauOfficeConfig,
  type IdlePackageDefinition,
  type MauOfficeActivityKind,
  type MauOfficeDirection,
  type MauOfficeRoomId,
  type MauOfficeUiConfig,
  type MauOfficeWorkerAnimationId,
  type MauOfficeWorkerRigId,
  type OfficeActorKind,
} from "../mau-office-contract.ts";
import {
  compileMauOfficeScene,
  defaultIdleHomeAnchorIds,
  getActiveMauOfficeScene,
  resolveMauOfficeSceneConfigFromRoot,
  sceneBreakAnchorIds,
  sceneIdlePackageSlotAnchorIds,
  sceneMarkerIdAt,
  sceneMarkerIdsForRole,
  sceneMarkerRoleForId,
  setActiveMauOfficeScene,
  type CompiledMauOfficeScene,
} from "../mau-office-scene.ts";
import type {
  AgentsListResult,
  ConfigSnapshot,
  GatewaySessionRow,
  PresenceEntry,
  SessionsListResult,
  SessionsPreviewEntry,
  SessionsPreviewResult,
  ToolCatalogEntry,
  ToolsCatalogResult,
} from "../types.ts";
import {
  formatMissingOperatorReadScopeMessage,
  isMissingOperatorReadScopeError,
} from "./scope-errors.ts";

const SNAPSHOT_ACTIVE_WINDOW_MS = 5 * 60_000;
const SUPPORT_ACTIVITY_WINDOW_MS = 60_000;
const EVENT_ACTIVITY_WINDOW_MS = 12_000;
const IDLE_ACTIVITY_WINDOW_MS = 18_000;
const PATH_MS_PER_TILE = 320;
const MIN_PATH_SEGMENT_MS = 180;
const LOCAL_ROOM_HOP_MAX_TILES = 8;
const LOCAL_NODE_HOP_MAX_TILES = 8;
const MAX_VISITOR_WORKERS = 4;
const SOLO_IDLE_PACKAGE_IDS = [
  "arcade_corner",
  "foosball_side_1",
  "foosball_side_2",
  "foosball_side_3",
  "foosball_side_4",
  "jukebox_floor",
  "reading_nook",
] as const;
const RANDOM_GROUP_IDLE_PACKAGE_IDS = ["chess_table", "chasing_loop"] as const;
const PASSING_BALL_BEAT_MS = 900;
const CHASING_LOOP_CYCLE_MS = 2_800;

type ActorRoleHint = "desk" | "meeting" | "support";
type ActivitySource = "snapshot" | "event" | "idle" | "system";
type SupportDialogueRole = "user" | "assistant";

export type OfficeBubbleEntry = {
  id: string;
  text: string;
  atMs: number;
  kind: MauOfficeActivityKind;
};

export type OfficeSupportDialogue = {
  role: SupportDialogueRole;
  text: string;
  messageSeq?: number;
  messageId?: string;
  updatedAtMs: number;
};

export type OfficeActivity = {
  id: string;
  kind: MauOfficeActivityKind;
  label: string;
  bubbleText?: string;
  priority: number;
  roomId: MauOfficeRoomId;
  anchorId: string;
  source: ActivitySource;
  expiresAtMs?: number;
};

export type OfficePath = {
  nodeIds: string[];
  waypoints: Array<{
    x: number;
    y: number;
    nodeId: string | null;
  }>;
  segmentIndex: number;
  segmentStartedAtMs: number;
  segmentDurationMs: number;
  targetAnchorId: string;
  mode: "enter" | "move" | "exit";
};

export type IdleAssignment = {
  packageId: string;
  activityId: string;
  participantIds: string[];
  slotAnchorIds: string[];
  startedAtMs: number;
  endsAtMs: number;
};

export type OfficeActor = {
  id: string;
  kind: OfficeActorKind;
  label: string;
  shortLabel: string;
  agentId: string | null;
  sessionKey: string;
  roleHint: ActorRoleHint;
  homeAnchorId: string;
  currentRoomId: MauOfficeRoomId | "outside";
  anchorId: string;
  nodeId: string;
  x: number;
  y: number;
  facing: MauOfficeDirection;
  rigId: MauOfficeWorkerRigId;
  animationId?: MauOfficeWorkerAnimationId | null;
  currentActivity: OfficeActivity;
  snapshotActivity: OfficeActivity | null;
  queuedActivity: OfficeActivity | null;
  pendingActivity: OfficeActivity | null;
  path: OfficePath | null;
  idleAssignment: IdleAssignment | null;
  bubbles: OfficeBubbleEntry[];
  latestSupportDialogue: OfficeSupportDialogue | null;
  lastSeenAtMs: number;
};

export type MauOfficeState = {
  loaded: boolean;
  nowMs: number;
  config: MauOfficeUiConfig;
  scene: CompiledMauOfficeScene;
  presenceEntries: PresenceEntry[];
  toolsCatalogByAgentId: Record<string, ToolsCatalogResult>;
  heartbeatSessionKeys: Record<string, true>;
  activeHeartbeatSessionKeys: Record<string, number>;
  actors: Record<string, OfficeActor>;
  actorOrder: string[];
  visibleAgentIds: string[];
  offsiteWorkerCount: number;
  roomFocus: MauOfficeRoomId | "all";
  idleCooldowns: Record<string, number>;
  version: number;
};

type SnapshotParams = {
  config: MauOfficeUiConfig;
  rawConfig?: Record<string, unknown> | null;
  agents: AgentsListResult;
  sessions: SessionsListResult;
  presenceEntries: PresenceEntry[];
};

type MauOfficeLoadHost = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  configSnapshot: ConfigSnapshot | null;
  mauOfficeLoading: boolean;
  mauOfficeError: string | null;
  mauOfficeState: MauOfficeState;
  mauOfficeReloadTimer: number | null;
};

type SessionToolPayload = {
  sessionKey?: unknown;
  isHeartbeat?: unknown;
  data?: Record<string, unknown>;
};

type SessionMessagePayload = {
  sessionKey?: unknown;
  messageId?: unknown;
  messageSeq?: unknown;
  message?: Record<string, unknown>;
};

type AgentEventPayload = {
  sessionKey?: unknown;
  isHeartbeat?: unknown;
  stream?: unknown;
  data?: Record<string, unknown>;
};

function activeScene(): CompiledMauOfficeScene {
  return getActiveMauOfficeScene();
}

function deskAnchorIds(): string[] {
  return sceneMarkerIdsForRole(activeScene(), "desk.workerSeat");
}

function meetingSeatAnchorIds(): string[] {
  return sceneMarkerIdsForRole(activeScene(), "meeting.seat");
}

function supportStaffAnchorIds(): string[] {
  return sceneMarkerIdsForRole(activeScene(), "support.staff");
}

function supportCustomerAnchorIds(): string[] {
  return sceneMarkerIdsForRole(activeScene(), "support.customer");
}

function breakAnchorIds(): string[] {
  return sceneBreakAnchorIds(activeScene());
}

function fallbackNode() {
  const scene = activeScene();
  return (
    scene.nodes.outside_mauHome ??
    Object.values(scene.nodes)[0] ?? {
      id: "fallback",
      tileX: 0,
      tileY: 0,
      x: 0,
      y: MAU_OFFICE_FOOT_OFFSET_Y,
      roomId: "outside",
      neighbors: [],
    }
  );
}

const DEFAULT_OFFSITE_ACTIVITY: OfficeActivity = {
  id: "offsite",
  kind: "offsite",
  label: "Offsite",
  priority: 0,
  roomId: "support",
  anchorId: "outside_mauHome",
  source: "system",
};

function offsiteActivityForAnchor(anchorId: string): OfficeActivity {
  return {
    ...DEFAULT_OFFSITE_ACTIVITY,
    anchorId,
  };
}

const DEFAULT_IDLE_ACTIVITY: OfficeActivity = {
  id: "idle",
  kind: "idle",
  label: "Taking a breather",
  priority: 10,
  roomId: "break",
  anchorId: "break_arcade",
  source: "idle",
};

export const MAU_OFFICE_SUPPORT_DIALOGUE_WINDOW_MS = SUPPORT_ACTIVITY_WINDOW_MS;
export const MAU_OFFICE_PASSING_BALL_BEAT_MS = PASSING_BALL_BEAT_MS;
export const MAU_OFFICE_CHASING_LOOP_CYCLE_MS = CHASING_LOOP_CYCLE_MS;

function createEmptyActivity(): OfficeActivity {
  return { ...DEFAULT_IDLE_ACTIVITY };
}

function cloneActivity(activity: OfficeActivity): OfficeActivity {
  return { ...activity };
}

function sameActivityPlan(
  left: Pick<OfficeActivity, "kind" | "roomId" | "anchorId"> | null | undefined,
  right: Pick<OfficeActivity, "kind" | "roomId" | "anchorId"> | null | undefined,
): boolean {
  if (!left || !right) {
    return false;
  }
  return (
    left.kind === right.kind && left.roomId === right.roomId && left.anchorId === right.anchorId
  );
}

function snapshotActivityWindowMs(
  row: Pick<GatewaySessionRow, "kind" | "key" | "parentSessionKey" | "spawnedBy">,
): number {
  return isSupportSessionRow(row) ? SUPPORT_ACTIVITY_WINDOW_MS : SNAPSHOT_ACTIVE_WINDOW_MS;
}

function isSnapshotRowActive(
  row:
    | Pick<GatewaySessionRow, "kind" | "key" | "parentSessionKey" | "spawnedBy" | "updatedAt">
    | null
    | undefined,
  nowMs: number,
): boolean {
  if (!row) {
    return false;
  }
  const updatedAtMs = row?.updatedAt ?? 0;
  if (updatedAtMs <= 0) {
    return false;
  }
  return updatedAtMs > nowMs - snapshotActivityWindowMs(row);
}

function isSupportActivityStale(actor: Pick<OfficeActor, "lastSeenAtMs">, nowMs: number): boolean {
  return nowMs - actor.lastSeenAtMs >= SUPPORT_ACTIVITY_WINDOW_MS;
}

function supportDialogueRoleForActor(
  actor: Pick<OfficeActor, "kind" | "sessionKey">,
): SupportDialogueRole | null {
  if (!isUserSessionKey(actor.sessionKey)) {
    return null;
  }
  return actor.kind === "visitor" ? "user" : "assistant";
}

function resolveActiveSupportDialogue(
  actor: Pick<OfficeActor, "kind" | "sessionKey" | "latestSupportDialogue">,
  nowMs: number,
  role?: SupportDialogueRole,
): OfficeSupportDialogue | null {
  const dialogue = actor.latestSupportDialogue;
  if (!dialogue) {
    return null;
  }
  if (dialogue.updatedAtMs < nowMs - SUPPORT_ACTIVITY_WINDOW_MS) {
    return null;
  }
  const expectedRole = supportDialogueRoleForActor(actor);
  if (!expectedRole || dialogue.role !== expectedRole) {
    return null;
  }
  if (role && dialogue.role !== role) {
    return null;
  }
  return dialogue;
}

function isStaleSupportPlan(
  actor: Pick<OfficeActor, "lastSeenAtMs">,
  activity: Pick<OfficeActivity, "kind"> | null | undefined,
  nowMs: number,
): boolean {
  return activity?.kind === "customer_support" && isSupportActivityStale(actor, nowMs);
}

function isActiveEventActivity(
  actor: Pick<OfficeActor, "currentActivity">,
  nowMs: number,
): boolean {
  return (
    actor.currentActivity.source === "event" && (actor.currentActivity.expiresAtMs ?? 0) > nowMs
  );
}

function isActiveIdleAssignment(
  actor: Pick<OfficeActor, "idleAssignment">,
  nowMs: number,
): boolean {
  return Boolean(actor.idleAssignment && actor.idleAssignment.endsAtMs > nowMs);
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function stableShuffleByKey<T>(
  values: readonly T[],
  seed: string,
  keyOf: (value: T) => string,
): T[] {
  return [...values]
    .map((value) => ({
      value,
      rank: hashString(`${seed}:${keyOf(value)}`),
    }))
    .sort((left, right) => left.rank - right.rank)
    .map((entry) => entry.value);
}

function normalizeDirection(
  from: { x: number; y: number },
  to: { x: number; y: number },
): MauOfficeDirection {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx >= 0 ? "east" : "west";
  }
  return dy >= 0 ? "south" : "north";
}

function actorPriority(kind: MauOfficeActivityKind): number {
  switch (kind) {
    case "customer_support":
      return 70;
    case "meeting":
      return 60;
    case "whiteboard_update":
      return 50;
    case "desk_work":
      return 40;
    case "walking":
      return 30;
    case "idle_package":
      return 20;
    case "idle":
      return 10;
    case "offsite":
    default:
      return 0;
  }
}

function deskHomeAnchorForIndex(index: number): string {
  const ids = deskAnchorIds();
  return ids[index % ids.length] ?? "desk_worker_1";
}

function lastDeskAnchor(): string {
  const ids = deskAnchorIds();
  return ids[ids.length - 1] ?? "desk_worker_1";
}

function anchorOrdinal(anchorId: string): number {
  const match = /(\d+)$/.exec(anchorId);
  if (!match) {
    return 0;
  }
  return Number.parseInt(match[1] ?? "0", 10) - 1;
}

function supportAnchorForHome(homeAnchorId: string): string {
  const ids = supportStaffAnchorIds();
  return ids[Math.abs(anchorOrdinal(homeAnchorId)) % ids.length] ?? "support_staff_1";
}

function idleAnchorForHome(homeAnchorId: string): string {
  const ids = defaultIdleHomeAnchorIds(activeScene());
  return ids[Math.abs(anchorOrdinal(homeAnchorId)) % ids.length] ?? "break_arcade";
}

function visitorSupportAnchor(homeAnchorId?: string | null): string {
  const ids = supportCustomerAnchorIds();
  if (!homeAnchorId) {
    return ids[Math.floor(ids.length / 2)] ?? "support_customer_2";
  }
  return ids[Math.abs(anchorOrdinal(homeAnchorId)) % ids.length] ?? "support_customer_2";
}

function primarySupportAnchor(): string {
  return supportStaffAnchorIds()[0] ?? "support_staff_1";
}

function visitorSupportAnchorForAgentId(
  actors: Record<string, OfficeActor>,
  agentId: string | null | undefined,
): string {
  const worker = agentId ? actors[`worker:${agentId}`] : null;
  return visitorSupportAnchor(worker?.homeAnchorId);
}

function visitorMeetingAnchor(): string {
  const ids = meetingSeatAnchorIds();
  return ids[ids.length - 1] ?? "meeting_seat_6";
}

function midMeetingAnchor(): string {
  const ids = meetingSeatAnchorIds();
  return ids[Math.floor(ids.length / 2)] ?? "meeting_seat_4";
}

function meetingAnchorForHome(homeAnchorId: string, preferPresenter = false): string {
  const ids = meetingSeatAnchorIds();
  const index = Math.abs(anchorOrdinal(homeAnchorId));
  if (preferPresenter && index % 4 === 0) {
    return sceneMarkerIdAt(activeScene(), "meeting.presenter") ?? "meeting_presenter";
  }
  return ids[index % ids.length] ?? "meeting_seat_1";
}

function shortLabelForName(label: string, fallback: string): string {
  const trimmed = label.trim();
  if (!trimmed) {
    return fallback;
  }
  const initials = trimmed
    .split(/\s+/u)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
  return initials || trimmed.slice(0, 2).toUpperCase();
}

function labelForAgent(agent: AgentsListResult["agents"][number]): string {
  return agent.identity?.name?.trim() || agent.name?.trim() || agent.id;
}

function isMeetingSessionKey(sessionKey: string): boolean {
  return isSubagentSessionKey(sessionKey);
}

function isUserSessionKey(sessionKey: string): boolean {
  return (
    !isMeetingSessionKey(sessionKey) &&
    (sessionKey.includes(":direct:") || sessionKey.includes(":group:"))
  );
}

function roleHintForSessionKey(sessionKey: string): ActorRoleHint {
  if (isMeetingSessionKey(sessionKey)) {
    return "meeting";
  }
  if (isUserSessionKey(sessionKey)) {
    return "support";
  }
  return "desk";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function resolveHeartbeatSessionRequestKey(value: unknown): string | null {
  const heartbeat = asRecord(asRecord(value)?.heartbeat);
  const session = typeof heartbeat?.session === "string" ? heartbeat.session.trim() : "";
  if (!session) {
    return null;
  }
  const normalized = session.toLowerCase();
  if (normalized === "main" || normalized === "global") {
    return null;
  }
  return session;
}

function resolveHeartbeatSessionKeys(
  rawConfig: Record<string, unknown> | null | undefined,
  agents: AgentsListResult,
): Record<string, true> {
  const next: Record<string, true> = {};
  const agentsConfig = asRecord(rawConfig?.agents);
  const defaultsSessionKey = resolveHeartbeatSessionRequestKey(asRecord(agentsConfig?.defaults));
  const overrides = new Map<string, string | null>();
  const configuredAgents = Array.isArray(agentsConfig?.list) ? agentsConfig.list : [];
  for (const entry of configuredAgents) {
    const record = asRecord(entry);
    const agentId = typeof record?.id === "string" ? record.id.trim() : "";
    if (!agentId) {
      continue;
    }
    overrides.set(agentId, resolveHeartbeatSessionRequestKey(record));
  }
  for (const agent of agents.agents) {
    const requestKey = overrides.has(agent.id) ? overrides.get(agent.id) : defaultsSessionKey;
    if (!requestKey) {
      continue;
    }
    const sessionKey = toAgentStoreSessionKey({
      agentId: agent.id,
      requestKey,
      mainKey: agents.mainKey,
    });
    next[sessionKey] = true;
    next[`${sessionKey}:heartbeat`] = true;
  }
  return next;
}

function isConfiguredHeartbeatSession(
  state: Pick<MauOfficeState, "heartbeatSessionKeys">,
  sessionKey: string,
): boolean {
  return Boolean(state.heartbeatSessionKeys[sessionKey]);
}

function isActiveHeartbeatSession(
  state: Pick<MauOfficeState, "heartbeatSessionKeys" | "activeHeartbeatSessionKeys">,
  sessionKey: string,
  nowMs: number,
): boolean {
  return (
    isConfiguredHeartbeatSession(state, sessionKey) ||
    (state.activeHeartbeatSessionKeys[sessionKey] ?? 0) > nowMs
  );
}

function isActiveHeartbeatEvent(payload: AgentEventPayload | undefined): boolean {
  return payload?.isHeartbeat === true;
}

function retainActiveHeartbeatSessionKeys(
  activeHeartbeatSessionKeys: Record<string, number>,
  nowMs: number,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(activeHeartbeatSessionKeys).filter(([, expiresAtMs]) => expiresAtMs > nowMs),
  );
}

function touchActiveHeartbeatSession(
  activeHeartbeatSessionKeys: Record<string, number>,
  sessionKey: string,
  nowMs: number,
  durationMs = EVENT_ACTIVITY_WINDOW_MS,
) {
  activeHeartbeatSessionKeys[sessionKey] = Math.max(
    activeHeartbeatSessionKeys[sessionKey] ?? 0,
    nowMs + durationMs,
  );
}

function visitorRoleHintForSessionKey(sessionKey: string): ActorRoleHint {
  return roleHintForSessionKey(sessionKey);
}

function isMeetingSessionRow(
  row: Pick<GatewaySessionRow, "key" | "parentSessionKey" | "spawnedBy">,
): boolean {
  return Boolean(row.parentSessionKey || row.spawnedBy || isMeetingSessionKey(row.key));
}

function isSupportSessionRow(
  row: Pick<GatewaySessionRow, "kind" | "key" | "parentSessionKey" | "spawnedBy">,
): boolean {
  return (row.kind === "direct" || row.kind === "group") && !isMeetingSessionRow(row);
}

function normalizeToolEntries(catalog: ToolsCatalogResult | undefined): ToolCatalogEntry[] {
  if (!catalog?.groups) {
    return [];
  }
  return catalog.groups.flatMap((group) => group.tools ?? []);
}

function roleHintFromCatalog(catalog: ToolsCatalogResult | undefined): ActorRoleHint {
  const toolIds = normalizeToolEntries(catalog)
    .map((entry) => entry.id?.trim().toLowerCase())
    .filter((entry): entry is string => Boolean(entry));
  if (toolIds.some((id) => id.includes("message") || id === "sessions_send")) {
    return "support";
  }
  if (toolIds.some((id) => id.includes("subagent") || id === "sessions_spawn" || id === "cron")) {
    return "meeting";
  }
  return "desk";
}

function roomFromAnchor(anchorId: string): MauOfficeRoomId {
  const roomId = activeScene().anchors[anchorId]?.roomId;
  return roomId === "outside" || !roomId ? "support" : (roomId as MauOfficeRoomId);
}

function nodeForAnchor(anchorId: string) {
  const scene = activeScene();
  const anchor = scene.anchors[anchorId];
  if (!anchor) {
    return fallbackNode();
  }
  return scene.nodes[anchor.nodeId] ?? fallbackNode();
}

function resolveActorGraphNodeId(
  actor: Pick<OfficeActor, "nodeId" | "anchorId">,
  preferredNodeId?: string | null,
): string {
  const scene = activeScene();
  if (preferredNodeId && scene.nodes[preferredNodeId]) {
    return preferredNodeId;
  }
  if (scene.nodes[actor.nodeId]) {
    return actor.nodeId;
  }
  const anchorNodeId = scene.anchors[actor.anchorId]?.nodeId;
  if (anchorNodeId && scene.nodes[anchorNodeId]) {
    return anchorNodeId;
  }
  return fallbackNode().id;
}

function resolveActorGraphRoomId(
  actor: Pick<OfficeActor, "anchorId" | "currentRoomId">,
  nodeId: string,
): MauOfficeRoomId | "hall" | "outside" {
  return (
    activeScene().nodes[nodeId]?.roomId ??
    activeScene().anchors[actor.anchorId]?.roomId ??
    actor.currentRoomId
  );
}

function tileKey(tileX: number, tileY: number): string {
  return `${tileX},${tileY}`;
}

function tilePointFromPixelPosition(x: number, y: number): { tileX: number; tileY: number } {
  const tileSize = activeScene().tileSize;
  return {
    tileX: Math.round((x - tileSize / 2) / tileSize),
    tileY: Math.round((y - MAU_OFFICE_FOOT_OFFSET_Y) / tileSize),
  };
}

function pixelPointForTile(tileX: number, tileY: number): { x: number; y: number } {
  const tileSize = activeScene().tileSize;
  return {
    x: tileX * tileSize + tileSize / 2,
    y: tileY * tileSize + MAU_OFFICE_FOOT_OFFSET_Y,
  };
}

function spriteOccupiedTiles(sprite: {
  tileX: number;
  tileY: number;
  tileWidth: number;
  tileHeight: number;
}) {
  const occupied: string[] = [];
  const startTileX = Math.floor(sprite.tileX);
  const startTileY = Math.floor(sprite.tileY);
  const endTileX = Math.ceil(sprite.tileX + sprite.tileWidth) - 1;
  const endTileY = Math.ceil(sprite.tileY + sprite.tileHeight) - 1;
  for (let tileY = startTileY; tileY <= endTileY; tileY += 1) {
    for (let tileX = startTileX; tileX <= endTileX; tileX += 1) {
      occupied.push(tileKey(tileX, tileY));
    }
  }
  return occupied;
}

function tileDistance(
  left: { tileX: number; tileY: number },
  right: { tileX: number; tileY: number },
): number {
  return Math.abs(left.tileX - right.tileX) + Math.abs(left.tileY - right.tileY);
}

function hasClearNodeEdgePath(fromNodeId: string, toNodeId: string): boolean {
  const scene = activeScene();
  const from = scene.nodes[fromNodeId];
  const to = scene.nodes[toNodeId];
  if (!from || !to || !from.neighbors.includes(toNodeId)) {
    return false;
  }
  if (from.tileX !== to.tileX && from.tileY !== to.tileY) {
    return false;
  }
  const stepX = Math.sign(to.tileX - from.tileX);
  const stepY = Math.sign(to.tileY - from.tileY);
  let tileX = from.tileX;
  let tileY = from.tileY;
  while (tileX !== to.tileX || tileY !== to.tileY) {
    tileX += stepX;
    tileY += stepY;
    const key = tileKey(tileX, tileY);
    if (!scene.walkableTileKeys.has(key) || scene.blockedTileKeys.has(key)) {
      return false;
    }
  }
  return true;
}

function isAbstractPathSegment(
  from: Pick<OfficePath["waypoints"][number], "x" | "y">,
  to: Pick<OfficePath["waypoints"][number], "x" | "y">,
): boolean {
  const fromTile = tilePointFromPixelPosition(from.x, from.y);
  const toTile = tilePointFromPixelPosition(to.x, to.y);
  const dx = toTile.tileX - fromTile.tileX;
  const dy = toTile.tileY - fromTile.tileY;
  if (dx === 0 && dy === 0) {
    return false;
  }
  if (dx !== 0 && dy !== 0) {
    return true;
  }
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  let tileX = fromTile.tileX;
  let tileY = fromTile.tileY;
  while (tileX !== toTile.tileX || tileY !== toTile.tileY) {
    tileX += stepX;
    tileY += stepY;
    if (tileX === toTile.tileX && tileY === toTile.tileY) {
      break;
    }
    if (activeScene().blockedTileKeys.has(tileKey(tileX, tileY))) {
      return true;
    }
  }
  return false;
}

function candidateAnchorIds(anchorId: string): string[] {
  const scene = activeScene();
  const anchor = scene.anchors[anchorId];
  if (!anchor) {
    return [anchorId];
  }
  const sortByDistance = (ids: readonly string[]) =>
    [...ids].sort(
      (leftId, rightId) =>
        tileDistance(scene.anchors[leftId]!, anchor) -
        tileDistance(scene.anchors[rightId]!, anchor),
    );
  const role = sceneMarkerRoleForId(scene, anchorId);
  if (role === "desk.workerSeat") {
    return sortByDistance(deskAnchorIds());
  }
  if (role === "meeting.seat") {
    return sortByDistance(meetingSeatAnchorIds());
  }
  if (role === "support.staff") {
    return sortByDistance(supportStaffAnchorIds());
  }
  if (role === "support.customer") {
    return sortByDistance(supportCustomerAnchorIds());
  }
  if (role?.startsWith("break.")) {
    return sortByDistance(breakAnchorIds());
  }
  return [anchorId];
}

function occupiedTargetAnchorIds(
  actors: Record<string, OfficeActor>,
  excludedActorId: string,
): Set<string> {
  const occupied = new Set<string>();
  for (const [actorId, actor] of Object.entries(actors)) {
    if (!actor || actorId === excludedActorId) {
      continue;
    }
    occupied.add(actor.path?.targetAnchorId ?? actor.anchorId);
    if (actor.queuedActivity) {
      occupied.add(actor.queuedActivity.anchorId);
    }
  }
  return occupied;
}

function resolveAvailableAnchorId(
  actors: Record<string, OfficeActor>,
  actorId: string,
  anchorId: string,
): string {
  const candidates = candidateAnchorIds(anchorId);
  if (candidates.length === 1) {
    return anchorId;
  }
  const occupied = occupiedTargetAnchorIds(actors, actorId);
  return candidates.find((candidate) => !occupied.has(candidate)) ?? anchorId;
}

function resolveNearestWalkableTile(
  tileX: number,
  tileY: number,
): { tileX: number; tileY: number; wasAdjusted: boolean } {
  const scene = activeScene();
  const desiredKey = tileKey(tileX, tileY);
  if (scene.walkableTileKeys.has(desiredKey) && !scene.blockedTileKeys.has(desiredKey)) {
    return { tileX, tileY, wasAdjusted: false };
  }
  const queue: Array<{ tileX: number; tileY: number }> = [{ tileX, tileY }];
  const seen = new Set<string>([desiredKey]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ] as const) {
      const nextTileX = current.tileX + dx;
      const nextTileY = current.tileY + dy;
      const nextKey = tileKey(nextTileX, nextTileY);
      if (seen.has(nextKey) || !scene.walkableTileKeys.has(nextKey)) {
        continue;
      }
      seen.add(nextKey);
      if (!scene.blockedTileKeys.has(nextKey)) {
        return { tileX: nextTileX, tileY: nextTileY, wasAdjusted: true };
      }
      queue.push({ tileX: nextTileX, tileY: nextTileY });
    }
  }

  return { tileX, tileY, wasAdjusted: true };
}

function resolveReachableTargetTile(desiredAnchorId: string): {
  tileX: number;
  tileY: number;
  requiresAnchorSnap: boolean;
} {
  const desiredAnchor = activeScene().anchors[desiredAnchorId];
  if (!desiredAnchor) {
    return {
      ...tilePointFromPixelPosition(
        nodeForAnchor(desiredAnchorId).x,
        nodeForAnchor(desiredAnchorId).y,
      ),
      requiresAnchorSnap: false,
    };
  }
  const reachableTile = resolveNearestWalkableTile(desiredAnchor.tileX, desiredAnchor.tileY);
  return {
    tileX: reachableTile.tileX,
    tileY: reachableTile.tileY,
    requiresAnchorSnap: reachableTile.wasAdjusted,
  };
}

function tilePathBetween(
  start: { tileX: number; tileY: number },
  goal: { tileX: number; tileY: number },
): Array<{ tileX: number; tileY: number }> | null {
  const scene = activeScene();
  const startKey = tileKey(start.tileX, start.tileY);
  const goalKey = tileKey(goal.tileX, goal.tileY);
  const queue: Array<{ tileX: number; tileY: number }> = [start];
  const cameFrom = new Map<string, string | null>([[startKey, null]]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentKey = tileKey(current.tileX, current.tileY);
    if (currentKey === goalKey) {
      break;
    }
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ] as const) {
      const nextTileX = current.tileX + dx;
      const nextTileY = current.tileY + dy;
      const nextKey = tileKey(nextTileX, nextTileY);
      if (cameFrom.has(nextKey)) {
        continue;
      }
      if (!scene.walkableTileKeys.has(nextKey)) {
        continue;
      }
      if (scene.blockedTileKeys.has(nextKey) && nextKey !== goalKey) {
        continue;
      }
      cameFrom.set(nextKey, currentKey);
      queue.push({ tileX: nextTileX, tileY: nextTileY });
    }
  }
  if (!cameFrom.has(goalKey)) {
    return null;
  }
  const path: Array<{ tileX: number; tileY: number }> = [];
  let currentKey: string | null = goalKey;
  while (currentKey) {
    const [tileX, tileY] = currentKey.split(",").map((value) => Number.parseInt(value, 10));
    path.push({ tileX, tileY });
    currentKey = cameFrom.get(currentKey) ?? null;
  }
  return path.reverse();
}

function syncActorToAnchor(actor: OfficeActor, anchorId: string) {
  const anchor = activeScene().anchors[anchorId];
  if (!anchor) {
    const node = nodeForAnchor(anchorId);
    actor.nodeId = node.id;
    actor.x = node.x;
    actor.y = node.y;
    return;
  }
  actor.nodeId = anchor.nodeId;
  const reachableTile = resolveNearestWalkableTile(
    Math.round(anchor.tileX),
    Math.round(anchor.tileY),
  );
  if (reachableTile.wasAdjusted) {
    const reachablePoint = pixelPointForTile(reachableTile.tileX, reachableTile.tileY);
    actor.x = reachablePoint.x;
    actor.y = reachablePoint.y;
  } else {
    actor.x = anchor.x;
    actor.y = anchor.y;
  }
  if (anchor.facingOverride) {
    actor.facing = anchor.facingOverride;
  }
}

function pickSnapshotRowForAgent(
  agentId: string,
  mainKey: string,
  rows: GatewaySessionRow[],
  nowMs: number,
): GatewaySessionRow | null {
  const mainSessionKey = buildAgentMainSessionKey({ agentId, mainKey });
  const recentRows = rows
    .filter((row) => isSnapshotRowActive(row, nowMs))
    .toSorted((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0));
  return (
    recentRows.find((row) => row.key !== mainSessionKey) ??
    recentRows.find((row) => row.key === mainSessionKey) ??
    null
  );
}

function isVisitorSession(
  row: GatewaySessionRow,
  mainKey: string,
  nowMs: number,
  heartbeatSessionKeys: Record<string, true>,
): boolean {
  if (!isSnapshotRowActive(row, nowMs)) {
    return false;
  }
  if (heartbeatSessionKeys[row.key]) {
    return false;
  }
  if (row.parentSessionKey || row.spawnedBy || row.key.includes(":subagent:")) {
    return true;
  }
  const parsed = parseAgentSessionKey(row.key);
  if (!parsed) {
    return false;
  }
  return row.key !== buildAgentMainSessionKey({ agentId: parsed.agentId, mainKey });
}

function bubbleTextForTool(toolId: string): {
  label: string;
  kind: MauOfficeActivityKind;
  roomId: MauOfficeRoomId;
  anchorId: string;
} {
  const normalized = toolId.trim().toLowerCase();
  if (
    normalized.includes("message") ||
    normalized === "sessions_send" ||
    normalized.includes("slack") ||
    normalized.includes("discord")
  ) {
    return {
      label: "Helping a customer",
      kind: "customer_support",
      roomId: "support",
      anchorId: primarySupportAnchor(),
    };
  }
  if (
    normalized === "sessions_spawn" ||
    normalized.includes("subagent") ||
    normalized.includes("yield")
  ) {
    return {
      label: "Coordinating with helpers",
      kind: "meeting",
      roomId: "meeting",
      anchorId: "meeting_presenter",
    };
  }
  if (
    normalized.includes("browser") ||
    normalized.includes("playwright") ||
    normalized.includes("cursor") ||
    normalized.includes("clawd")
  ) {
    return {
      label: "Working in the browser room",
      kind: "desk_work",
      roomId: "browser",
      anchorId: "browser_worker_1",
    };
  }
  if (
    normalized.includes("telephony") ||
    normalized.includes("voice-call") ||
    normalized.includes("phone") ||
    normalized.includes("twilio") ||
    normalized.includes("telnyx") ||
    normalized.includes("plivo") ||
    normalized.includes("vapi")
  ) {
    return {
      label: "Taking an outside call",
      kind: "customer_support",
      roomId: "telephony",
      anchorId: "telephony_staff_1",
    };
  }
  if (normalized.includes("canvas")) {
    return {
      label: "Updating the whiteboard",
      kind: "whiteboard_update",
      roomId: "desk",
      anchorId: "desk_board",
    };
  }
  return {
    label: "Working at a desk",
    kind: "desk_work",
    roomId: "desk",
    anchorId: deskHomeAnchorForIndex(0),
  };
}

function activityLifetimeMs(kind: MauOfficeActivityKind): number {
  return kind === "customer_support" ? SUPPORT_ACTIVITY_WINDOW_MS : EVENT_ACTIVITY_WINDOW_MS;
}

const DISPLAY_REPLY_TAG_RE =
  /\[\[\s*(?:reply_to_current|reply_to\s*:\s*[^\]\n]+)\s*\]\]|\[\s*reply[-_ ]to[-_ ]current(?:\s*:\s*[^\]\n]+)?\s*\]/giu;

function normalizePreviewText(text: string | undefined): string | undefined {
  const normalized = text?.replace(DISPLAY_REPLY_TAG_RE, " ").replace(/\s+/gu, " ").trim();
  return normalized ? normalized : undefined;
}

function extractMessageLabel(value: unknown, depth = 0): string | undefined {
  if (depth > 3 || value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return normalizePreviewText(value);
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const label = extractMessageLabel(entry, depth + 1);
      if (label) {
        return label;
      }
    }
    return undefined;
  }
  if (typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const key of [
    "displayName",
    "name",
    "senderName",
    "username",
    "author",
    "sender",
    "contact",
  ]) {
    const label = extractMessageLabel(record[key], depth + 1);
    if (label) {
      return label;
    }
  }
  return undefined;
}

function extractPreviewText(value: unknown, depth = 0): string | undefined {
  if (depth > 3 || value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return normalizePreviewText(value);
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const preview = extractPreviewText(entry, depth + 1);
      if (preview) {
        return preview;
      }
    }
    return undefined;
  }
  if (typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const key of [
    "text",
    "content",
    "message",
    "prompt",
    "query",
    "input",
    "summary",
    "title",
    "args",
    "arguments",
  ]) {
    const preview = extractPreviewText(record[key], depth + 1);
    if (preview) {
      return preview;
    }
  }
  return undefined;
}

function extractAgentEventPreviewText(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return normalizePreviewText(value);
  }
  if (typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  return (
    normalizePreviewText(typeof record.delta === "string" ? record.delta : undefined) ??
    normalizePreviewText(typeof record.text === "string" ? record.text : undefined) ??
    extractPreviewText(record.content)
  );
}

function extractVisitorPreviewText(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const sanitized =
    typeof value === "object"
      ? stripEnvelopeFromMessage(value)
      : stripEnvelopeFromMessage({ role: "user", text: String(value) });
  if (typeof sanitized === "string") {
    return normalizePreviewText(sanitized);
  }
  if (!sanitized || typeof sanitized !== "object") {
    return undefined;
  }
  const record = sanitized as Record<string, unknown>;
  for (const key of [
    "text",
    "content",
    "message",
    "prompt",
    "query",
    "input",
    "summary",
    "title",
  ]) {
    const preview = extractPreviewText(record[key]);
    if (preview) {
      return preview;
    }
  }
  return undefined;
}

function updateSupportDialogue(
  actor: OfficeActor,
  role: SupportDialogueRole,
  text: string | undefined,
  nowMs: number,
  options?: {
    messageSeq?: number;
    messageId?: string;
  },
) {
  const normalized = normalizePreviewText(text);
  if (!normalized) {
    return;
  }
  const expectedRole = supportDialogueRoleForActor(actor);
  if (expectedRole !== role) {
    return;
  }
  const current = actor.latestSupportDialogue;
  const nextSeq = options?.messageSeq;
  if (current?.role === role) {
    if (
      typeof current.messageSeq === "number" &&
      typeof nextSeq === "number" &&
      nextSeq < current.messageSeq
    ) {
      return;
    }
    if (
      typeof current.messageSeq === "number" &&
      typeof nextSeq === "number" &&
      nextSeq === current.messageSeq &&
      current.updatedAtMs >= nowMs &&
      current.text === normalized
    ) {
      return;
    }
    if (typeof nextSeq !== "number" && current.updatedAtMs > nowMs) {
      return;
    }
  }
  actor.latestSupportDialogue = {
    role,
    text: normalized,
    messageSeq: nextSeq,
    messageId: options?.messageId,
    updatedAtMs: nowMs,
  };
}

function preserveActiveSupportDialogue(
  actor: Pick<OfficeActor, "kind" | "sessionKey" | "latestSupportDialogue"> | undefined,
  activity: OfficeActivity | null,
  nowMs: number,
): OfficeActivity | null {
  if (!actor || !activity || activity.kind !== "customer_support") {
    return activity;
  }
  const dialogue = resolveActiveSupportDialogue(actor, nowMs);
  if (!dialogue || activity.bubbleText === dialogue.text) {
    return activity;
  }
  return { ...activity, bubbleText: dialogue.text };
}

function clearSupportPresentationState(
  actor: Pick<OfficeActor, "bubbles" | "latestSupportDialogue">,
) {
  actor.latestSupportDialogue = null;
  actor.bubbles = actor.bubbles.filter((bubble) => bubble.kind !== "customer_support");
}

function clearSupportPresentationStateIfLeavingSupport(
  actor: Pick<OfficeActor, "bubbles" | "latestSupportDialogue">,
  activity: Pick<OfficeActivity, "kind"> | null | undefined,
) {
  if (activity?.kind === "customer_support") {
    return;
  }
  if (
    !actor.latestSupportDialogue &&
    !actor.bubbles.some((bubble) => bubble.kind === "customer_support")
  ) {
    return;
  }
  clearSupportPresentationState(actor);
}

function createActivity(params: {
  id: string;
  kind: MauOfficeActivityKind;
  label: string;
  roomId: MauOfficeRoomId;
  anchorId: string;
  source: ActivitySource;
  bubbleText?: string;
  expiresAtMs?: number;
}): OfficeActivity {
  return {
    id: params.id,
    kind: params.kind,
    label: params.label,
    bubbleText: params.bubbleText,
    priority: actorPriority(params.kind),
    roomId: params.roomId,
    anchorId: params.anchorId,
    source: params.source,
    expiresAtMs: params.expiresAtMs,
  };
}

function createHeartbeatMeetingActivity(
  actor: Pick<OfficeActor, "kind" | "homeAnchorId" | "roleHint">,
  params: {
    id: string;
    label: string;
    source: ActivitySource;
    bubbleText?: string;
    expiresAtMs?: number;
  },
): OfficeActivity {
  return createActivity({
    id: params.id,
    kind: "meeting",
    label: params.label,
    bubbleText: params.bubbleText,
    roomId: "meeting",
    anchorId:
      actor.kind === "visitor"
        ? visitorMeetingAnchor()
        : meetingAnchorForHome(actor.homeAnchorId, actor.roleHint === "meeting"),
    source: params.source,
    expiresAtMs: params.expiresAtMs,
  });
}

function createMeetingActivityForActor(
  actor: Pick<OfficeActor, "kind" | "homeAnchorId" | "roleHint">,
  params: {
    id: string;
    label: string;
    source: ActivitySource;
    bubbleText?: string;
    expiresAtMs?: number;
  },
): OfficeActivity {
  return createActivity({
    id: params.id,
    kind: "meeting",
    label: params.label,
    bubbleText: params.bubbleText,
    roomId: "meeting",
    anchorId:
      actor.kind === "visitor"
        ? visitorMeetingAnchor()
        : meetingAnchorForHome(actor.homeAnchorId, actor.roleHint === "meeting"),
    source: params.source,
    expiresAtMs: params.expiresAtMs,
  });
}

function createPostMeetingActivityForActor(
  actor: Pick<OfficeActor, "kind" | "homeAnchorId">,
  params: {
    id: string;
    source: ActivitySource;
  },
): OfficeActivity {
  if (actor.kind === "visitor") {
    const outsideAnchorId = actor.homeAnchorId.startsWith("outside_")
      ? actor.homeAnchorId
      : "outside_mauHome";
    return {
      ...offsiteActivityForAnchor(outsideAnchorId),
      id: params.id,
      source: params.source,
    };
  }
  return createActivity({
    id: params.id,
    kind: "desk_work",
    label: "Working through a task",
    roomId: roomFromAnchor(actor.homeAnchorId),
    anchorId: actor.homeAnchorId,
    source: params.source,
  });
}

function snapshotActivityForRow(
  actor: Pick<OfficeActor, "kind" | "roleHint" | "homeAnchorId">,
  row: GatewaySessionRow | null,
  nowMs: number,
  isHeartbeatSession = false,
): OfficeActivity | null {
  if (!row || !isSnapshotRowActive(row, nowMs)) {
    return null;
  }
  if (isHeartbeatSession) {
    if (row.status !== "running") {
      return null;
    }
    return createActivity({
      id: "snapshot-heartbeat",
      kind: "meeting",
      label: "Heartbeat sync",
      roomId: "meeting",
      anchorId: meetingAnchorForHome(actor.homeAnchorId, actor.roleHint === "meeting"),
      source: "snapshot",
    });
  }
  if (isMeetingSessionRow(row)) {
    if (normalizePreviewText(row.lastMessagePreview)) {
      return createPostMeetingActivityForActor(actor, {
        id: "snapshot-meeting-followup",
        source: "snapshot",
      });
    }
    return createActivity({
      id: "snapshot-meeting",
      kind: "meeting",
      label: "Collaborating in a meeting",
      roomId: "meeting",
      anchorId: meetingAnchorForHome(actor.homeAnchorId, actor.roleHint === "meeting"),
      source: "snapshot",
    });
  }
  if (isSupportSessionRow(row)) {
    const isSupportVisitor = actor.homeAnchorId === "outside_support";
    return createActivity({
      id: "snapshot-support",
      kind: "customer_support",
      label: "Handling support",
      bubbleText: isSupportVisitor
        ? extractVisitorPreviewText(row.lastUserMessagePreview ?? row.lastMessagePreview)
        : extractPreviewText(row.lastAssistantMessagePreview),
      roomId: "support",
      anchorId: isSupportVisitor
        ? visitorSupportAnchor()
        : supportAnchorForHome(actor.homeAnchorId),
      source: "snapshot",
    });
  }
  return null;
}

function isInterAgentCoordinationTool(toolId: string): boolean {
  const normalized = toolId.trim().toLowerCase();
  return (
    normalized === "sessions_send" ||
    normalized === "sessions_spawn" ||
    normalized.includes("subagent") ||
    normalized.includes("yield")
  );
}

function pathBetween(startNodeId: string, targetNodeId: string): string[] {
  const scene = activeScene();
  if (startNodeId === targetNodeId) {
    return [startNodeId];
  }
  const queue = [[startNodeId]];
  const seen = new Set<string>([startNodeId]);
  while (queue.length > 0) {
    const path = queue.shift();
    const currentId = path?.[path.length - 1];
    if (!path || !currentId) {
      continue;
    }
    const node = scene.nodes[currentId];
    for (const nextId of node?.neighbors ?? []) {
      if (seen.has(nextId)) {
        continue;
      }
      const nextPath = [...path, nextId];
      if (nextId === targetNodeId) {
        return nextPath;
      }
      seen.add(nextId);
      queue.push(nextPath);
    }
  }
  return [startNodeId, targetNodeId];
}

function samePoint(
  left: Pick<OfficeActor, "x" | "y"> | { x: number; y: number },
  right: { x: number; y: number },
): boolean {
  return left.x === right.x && left.y === right.y;
}

function pushPathWaypoint(
  waypoints: OfficePath["waypoints"],
  point: { x: number; y: number; nodeId: string | null },
) {
  const last = waypoints[waypoints.length - 1];
  if (last && samePoint(last, point)) {
    if (!last.nodeId && point.nodeId) {
      last.nodeId = point.nodeId;
    }
    return;
  }
  waypoints.push(point);
}

function buildPathWaypoints(
  actor: Pick<OfficeActor, "x" | "y" | "nodeId" | "anchorId" | "currentRoomId">,
  nodeIds: string[],
  targetAnchorId: string,
  targetTile: { tileX: number; tileY: number; requiresAnchorSnap: boolean },
): OfficePath["waypoints"] | null {
  const targetAnchor = activeScene().anchors[targetAnchorId];
  const startNodeId = resolveActorGraphNodeId(actor);
  const buildWaypointsForStops = (
    routeStops: Array<{
      tileX: number;
      tileY: number;
      waypointNodeId: string | null;
      graphNodeId: string | null;
      roomId: MauOfficeRoomId | "hall" | "outside";
    }>,
  ): OfficePath["waypoints"] | null => {
    const waypoints: OfficePath["waypoints"] = [
      {
        x: actor.x,
        y: actor.y,
        nodeId: activeScene().nodes[actor.nodeId] ? actor.nodeId : null,
      },
    ];
    let currentTile = tilePointFromPixelPosition(actor.x, actor.y);
    let currentRoomId = resolveActorGraphRoomId(actor, startNodeId);
    let currentNodeId: string | null = startNodeId;
    for (const stop of routeStops) {
      const segment = tilePathBetween(currentTile, stop);
      if (!segment) {
        if (currentTile.tileX === stop.tileX && currentTile.tileY === stop.tileY) {
          currentRoomId = stop.roomId;
          currentNodeId = stop.graphNodeId ?? currentNodeId;
          continue;
        }
        const isInteriorShortHop =
          currentRoomId === stop.roomId &&
          stop.roomId !== "hall" &&
          stop.roomId !== "outside" &&
          tileDistance(currentTile, stop) <= LOCAL_ROOM_HOP_MAX_TILES;
        const isNeighborNodeHop =
          Boolean(currentNodeId && stop.graphNodeId) &&
          activeScene().nodes[currentNodeId!]?.neighbors.includes(stop.graphNodeId!);
        const isShortNeighborNodeHop =
          isNeighborNodeHop && tileDistance(currentTile, stop) <= LOCAL_NODE_HOP_MAX_TILES;
        const isClearNeighborCorridor =
          isNeighborNodeHop && hasClearNodeEdgePath(currentNodeId!, stop.graphNodeId!);
        if (!isInteriorShortHop && !isShortNeighborNodeHop && !isClearNeighborCorridor) {
          return null;
        }
        const pixelPoint = pixelPointForTile(stop.tileX, stop.tileY);
        pushPathWaypoint(waypoints, {
          x: pixelPoint.x,
          y: pixelPoint.y,
          nodeId: stop.waypointNodeId,
        });
      } else {
        for (let index = 1; index < segment.length; index += 1) {
          const tile = segment[index]!;
          const pixelPoint = pixelPointForTile(tile.tileX, tile.tileY);
          pushPathWaypoint(waypoints, {
            x: pixelPoint.x,
            y: pixelPoint.y,
            nodeId:
              routeStops.find(
                (candidate) =>
                  candidate.waypointNodeId &&
                  candidate.tileX === tile.tileX &&
                  candidate.tileY === tile.tileY,
              )?.waypointNodeId ?? null,
          });
        }
      }
      currentTile = { tileX: stop.tileX, tileY: stop.tileY };
      currentRoomId = stop.roomId;
      currentNodeId = stop.graphNodeId ?? currentNodeId;
    }

    if (targetAnchor && !targetTile.requiresAnchorSnap) {
      const targetPoint = pixelPointForTile(targetTile.tileX, targetTile.tileY);
      pushPathWaypoint(waypoints, {
        x: targetPoint.x,
        y: targetPoint.y,
        nodeId:
          targetAnchor.tileX === targetTile.tileX && targetAnchor.tileY === targetTile.tileY
            ? targetAnchor.nodeId
            : null,
      });
    }
    return waypoints;
  };

  const preferredRouteStops = [
    ...nodeIds.flatMap((nodeId) => {
      const node = activeScene().nodes[nodeId];
      if (!node) {
        return [];
      }
      const reachableTile = resolveNearestWalkableTile(node.tileX, node.tileY);
      return [
        {
          tileX: reachableTile.tileX,
          tileY: reachableTile.tileY,
          waypointNodeId: reachableTile.wasAdjusted ? null : nodeId,
          graphNodeId: nodeId,
          roomId: node.roomId,
        },
      ];
    }),
    {
      tileX: targetTile.tileX,
      tileY: targetTile.tileY,
      waypointNodeId: null,
      graphNodeId: targetAnchor?.nodeId ?? null,
      roomId: targetAnchor?.roomId ?? "hall",
    },
  ];

  return (
    buildWaypointsForStops(preferredRouteStops) ??
    buildWaypointsForStops([
      {
        tileX: targetTile.tileX,
        tileY: targetTile.tileY,
        waypointNodeId: null,
        graphNodeId: targetAnchor?.nodeId ?? null,
        roomId: targetAnchor?.roomId ?? "hall",
      },
    ])
  );
}

function preferRecentBubbleText(
  actor: OfficeActor | undefined,
  activity: OfficeActivity | null,
  updatedAtMs: number | undefined,
): OfficeActivity | null {
  if (!actor || !activity) {
    return activity;
  }
  const lastBubble = actor.bubbles[0];
  if (!lastBubble || lastBubble.kind !== activity.kind) {
    return activity;
  }
  if ((updatedAtMs ?? 0) >= lastBubble.atMs && activity.bubbleText?.trim()) {
    return activity;
  }
  if (activity.bubbleText === lastBubble.text) {
    return activity;
  }
  return { ...activity, bubbleText: lastBubble.text };
}

function preserveLatestEventBubbleOnDeferredActivity(
  actor: OfficeActor,
  activity: OfficeActivity,
  nowMs: number,
): OfficeActivity {
  const preservedSupportDialogue = preserveActiveSupportDialogue(actor, activity, nowMs);
  if (preservedSupportDialogue !== activity) {
    return preservedSupportDialogue!;
  }
  const lastBubble = actor.bubbles[0];
  if (!lastBubble?.text) {
    return activity;
  }
  if (actor.currentActivity.source !== "event" || actor.currentActivity.kind !== lastBubble.kind) {
    return activity;
  }
  if (lastBubble.kind !== activity.kind) {
    return activity;
  }
  if (lastBubble.atMs < nowMs - SUPPORT_ACTIVITY_WINDOW_MS) {
    return activity;
  }
  if (activity.bubbleText === lastBubble.text) {
    return activity;
  }
  return { ...activity, bubbleText: lastBubble.text };
}

function resolvePathSegmentDuration(
  from: { x: number; y: number },
  to: { x: number; y: number },
): number {
  if (isAbstractPathSegment(from, to)) {
    return 1;
  }
  const tiles = Math.hypot(to.x - from.x, to.y - from.y) / activeScene().tileSize;
  return Math.max(MIN_PATH_SEGMENT_MS, Math.round(tiles * PATH_MS_PER_TILE));
}

function resolvePathDurationForIndex(
  path: Pick<OfficePath, "waypoints">,
  segmentIndex: number,
): number {
  const from = path.waypoints[segmentIndex];
  const to = path.waypoints[segmentIndex + 1];
  if (!from || !to) {
    return MIN_PATH_SEGMENT_MS;
  }
  return resolvePathSegmentDuration(from, to);
}

function createActor(params: {
  id: string;
  kind: OfficeActorKind;
  label: string;
  sessionKey: string;
  agentId: string | null;
  roleHint: ActorRoleHint;
  homeAnchorId: string;
  snapshotActivity: OfficeActivity | null;
  nowMs: number;
}): OfficeActor {
  const homeAnchor = activeScene().anchors[params.homeAnchorId];
  const homeNode = nodeForAnchor(params.homeAnchorId);
  const hash = hashString(params.id);
  const rigId =
    params.kind === "visitor" && isUserSessionKey(params.sessionKey)
      ? "human"
      : (MAU_OFFICE_WORKER_RIG_IDS[hash % MAU_OFFICE_WORKER_RIG_IDS.length] ?? "cat");
  return {
    id: params.id,
    kind: params.kind,
    label: params.label,
    shortLabel: shortLabelForName(params.label, params.kind === "visitor" ? "V" : "W"),
    agentId: params.agentId,
    sessionKey: params.sessionKey,
    roleHint: params.roleHint,
    homeAnchorId: params.homeAnchorId,
    currentRoomId: roomFromAnchor(params.homeAnchorId),
    anchorId: params.homeAnchorId,
    nodeId: homeNode.id,
    x: homeAnchor?.x ?? homeNode.x,
    y: homeAnchor?.y ?? homeNode.y,
    facing: homeAnchor?.facingOverride ?? "south",
    rigId,
    currentActivity: params.snapshotActivity ?? createEmptyActivity(),
    snapshotActivity: params.snapshotActivity,
    queuedActivity: null,
    pendingActivity: null,
    path: null,
    idleAssignment: null,
    bubbles: [],
    latestSupportDialogue: null,
    lastSeenAtMs: params.nowMs,
  };
}

function cloneActor(actor: OfficeActor): OfficeActor {
  return {
    ...actor,
    currentActivity: cloneActivity(actor.currentActivity),
    snapshotActivity: actor.snapshotActivity ? cloneActivity(actor.snapshotActivity) : null,
    queuedActivity: actor.queuedActivity ? cloneActivity(actor.queuedActivity) : null,
    pendingActivity: actor.pendingActivity ? cloneActivity(actor.pendingActivity) : null,
    path: actor.path
      ? {
          ...actor.path,
          nodeIds: [...actor.path.nodeIds],
          waypoints: actor.path.waypoints.map((waypoint) => ({ ...waypoint })),
        }
      : null,
    idleAssignment: actor.idleAssignment
      ? {
          ...actor.idleAssignment,
          participantIds: [...actor.idleAssignment.participantIds],
          slotAnchorIds: [...actor.idleAssignment.slotAnchorIds],
        }
      : null,
    bubbles: [...actor.bubbles],
    latestSupportDialogue: actor.latestSupportDialogue ? { ...actor.latestSupportDialogue } : null,
  };
}

function pushBubble(
  actor: OfficeActor,
  text: string | undefined,
  kind: MauOfficeActivityKind,
  nowMs: number,
) {
  const normalized = normalizePreviewText(text);
  if (!normalized) {
    return;
  }
  const last = actor.bubbles[0];
  if (last?.text === normalized && nowMs - last.atMs < 3_000) {
    return;
  }
  actor.bubbles = [
    { id: `${actor.id}:${nowMs}`, text: normalized, atMs: nowMs, kind },
    ...actor.bubbles,
  ].slice(0, 6);
}

function setActorActivity(
  actor: OfficeActor,
  actors: Record<string, OfficeActor>,
  activity: OfficeActivity,
  nowMs: number,
  mode: "enter" | "move" | "exit" = "move",
) {
  actor.idleAssignment = activity.source === "idle" ? actor.idleAssignment : null;
  const resolvedAnchorId = resolveAvailableAnchorId(actors, actor.id, activity.anchorId);
  const resolvedActivity =
    resolvedAnchorId === activity.anchorId ? activity : { ...activity, anchorId: resolvedAnchorId };
  clearSupportPresentationStateIfLeavingSupport(actor, resolvedActivity);
  if (actor.anchorId === resolvedActivity.anchorId) {
    actor.currentActivity = resolvedActivity;
    actor.anchorId = resolvedActivity.anchorId;
    actor.currentRoomId = resolvedActivity.roomId;
    syncActorToAnchor(actor, resolvedActivity.anchorId);
    actor.queuedActivity = null;
    actor.path = null;
    if (resolvedActivity.bubbleText) {
      pushBubble(actor, resolvedActivity.bubbleText, resolvedActivity.kind, nowMs);
    }
    return;
  }
  const startNodeId = actor.path
    ? resolveActorGraphNodeId(
        actor,
        actor.path.waypoints[Math.min(actor.path.segmentIndex + 1, actor.path.waypoints.length - 1)]
          ?.nodeId,
      )
    : resolveActorGraphNodeId(actor);
  const targetNodeId = nodeForAnchor(resolvedActivity.anchorId).id;
  const nodeIds = pathBetween(startNodeId, targetNodeId);
  const targetTile = resolveReachableTargetTile(resolvedActivity.anchorId);
  const waypoints = buildPathWaypoints(actor, nodeIds, resolvedActivity.anchorId, targetTile);
  if (!waypoints || waypoints.length < 2) {
    actor.currentActivity = resolvedActivity;
    actor.queuedActivity = null;
    actor.path = null;
    if (resolvedActivity.bubbleText) {
      pushBubble(actor, resolvedActivity.bubbleText, resolvedActivity.kind, nowMs);
    }
    return;
  }
  actor.path = {
    nodeIds,
    waypoints,
    segmentIndex: 0,
    segmentStartedAtMs: nowMs,
    segmentDurationMs: resolvePathDurationForIndex({ waypoints }, 0),
    targetAnchorId: resolvedActivity.anchorId,
    mode,
  };
  actor.queuedActivity = resolvedActivity;
  if (resolvedActivity.bubbleText) {
    pushBubble(actor, resolvedActivity.bubbleText, resolvedActivity.kind, nowMs);
  }
  actor.currentActivity = createActivity({
    id: "walking",
    kind: "walking",
    label: "Walking",
    roomId: resolvedActivity.roomId,
    anchorId: resolvedActivity.anchorId,
    source: resolvedActivity.source,
  });
  actor.facing = normalizeDirection(waypoints[0]!, waypoints[1]!);
}

function resolveActivityMode(
  actor: Pick<OfficeActor, "currentRoomId" | "anchorId">,
  activity: Pick<OfficeActivity, "anchorId">,
): "enter" | "move" | "exit" {
  const targetRoomId = activeScene().anchors[activity.anchorId]?.roomId;
  if (targetRoomId === "outside") {
    return "exit";
  }
  const currentRoomId = activeScene().anchors[actor.anchorId]?.roomId ?? actor.currentRoomId;
  return currentRoomId === "outside" ? "enter" : "move";
}

function fallbackActivityForActor(actor: OfficeActor, nowMs: number): OfficeActivity {
  if (actor.kind === "visitor") {
    const outsideAnchorId = actor.homeAnchorId.startsWith("outside_")
      ? actor.homeAnchorId
      : isUserSessionKey(actor.sessionKey)
        ? "outside_support"
        : "outside_mauHome";
    return offsiteActivityForAnchor(outsideAnchorId);
  }
  return createActivity({
    id: "idle-fallback",
    kind: "idle",
    label: "Taking a breather",
    roomId: "break",
    anchorId: idleAnchorForHome(actor.homeAnchorId),
    source: "idle",
    expiresAtMs: nowMs + IDLE_ACTIVITY_WINDOW_MS,
  });
}

function activeSnapshotActivity(actor: OfficeActor, nowMs: number): OfficeActivity | null {
  return isStaleSupportPlan(actor, actor.snapshotActivity, nowMs) ? null : actor.snapshotActivity;
}

function activePendingActivity(actor: OfficeActor, nowMs: number): OfficeActivity | null {
  if (isStaleSupportPlan(actor, actor.pendingActivity, nowMs)) {
    actor.pendingActivity = null;
    return null;
  }
  return actor.pendingActivity;
}

function resolveDeferredActivity(actor: OfficeActor, nowMs: number): OfficeActivity {
  return (
    preserveActiveSupportDialogue(
      actor,
      activePendingActivity(actor, nowMs) ??
        activeSnapshotActivity(actor, nowMs) ??
        fallbackActivityForActor(actor, nowMs),
      nowMs,
    ) ?? fallbackActivityForActor(actor, nowMs)
  );
}

function settleActorToPrimaryActivity(
  actor: OfficeActor,
  actors: Record<string, OfficeActor>,
  nowMs: number,
): boolean {
  if (isActiveEventActivity(actor, nowMs)) {
    return false;
  }
  const nextActivity = resolveDeferredActivity(actor, nowMs);
  if (sameActivityPlan(actor.pendingActivity, nextActivity)) {
    actor.pendingActivity = null;
  }
  clearSupportPresentationStateIfLeavingSupport(actor, nextActivity);
  if (
    sameActivityPlan(actor.currentActivity, nextActivity) &&
    actor.anchorId === nextActivity.anchorId
  ) {
    actor.currentActivity = nextActivity;
    actor.currentRoomId =
      activeScene().anchors[nextActivity.anchorId]?.roomId === "outside"
        ? "outside"
        : roomFromAnchor(nextActivity.anchorId);
    syncActorToAnchor(actor, nextActivity.anchorId);
    return false;
  }
  setActorActivity(actor, actors, nextActivity, nowMs, resolveActivityMode(actor, nextActivity));
  return true;
}

function resolveIdlePackages(config: MauOfficeUiConfig): IdlePackageDefinition[] {
  const enabled = new Set(config.idlePackages.enabled);
  return MAU_OFFICE_IDLE_PACKAGES.filter((pkg) => enabled.has(pkg.id));
}

function requiredParticipantsForIdlePackage(packageId: string): number {
  switch (packageId) {
    case "passing_ball_court":
      return 4;
    case "chess_table":
      return 2;
    case "chasing_loop":
      return 3;
    default:
      return 1;
  }
}

function hasCompleteIdleGroup(
  actor: Pick<OfficeActor, "id" | "idleAssignment">,
  actors: Record<string, OfficeActor>,
  nowMs: number,
): boolean {
  const assignment = actor.idleAssignment;
  if (!assignment || assignment.endsAtMs <= nowMs) {
    return false;
  }
  const requiredParticipants = requiredParticipantsForIdlePackage(assignment.packageId);
  if (
    assignment.participantIds.length < requiredParticipants ||
    !assignment.participantIds.includes(actor.id)
  ) {
    return false;
  }
  const matchingParticipants = assignment.participantIds.filter((participantId) => {
    const participant = actors[participantId];
    if (!participant?.idleAssignment || participant.idleAssignment.endsAtMs <= nowMs) {
      return false;
    }
    return (
      participant.idleAssignment.packageId === assignment.packageId &&
      participant.idleAssignment.activityId === assignment.activityId
    );
  });
  return matchingParticipants.length >= requiredParticipants;
}

function resolveIdleAnimationId(
  actor: Pick<OfficeActor, "id" | "idleAssignment" | "currentActivity" | "path">,
  nowMs: number,
): MauOfficeWorkerAnimationId | null {
  if (actor.path || actor.currentActivity.kind !== "idle_package" || !actor.idleAssignment) {
    return null;
  }
  if (
    actor.idleAssignment.participantIds.length <
    requiredParticipantsForIdlePackage(actor.idleAssignment.packageId)
  ) {
    return null;
  }
  switch (actor.idleAssignment.packageId) {
    case "passing_ball_court": {
      const participantIndex = actor.idleAssignment.participantIds.indexOf(actor.id);
      if (participantIndex < 0 || actor.idleAssignment.participantIds.length === 0) {
        return null;
      }
      const beatIndex =
        Math.floor(nowMs / PASSING_BALL_BEAT_MS) % actor.idleAssignment.participantIds.length;
      return participantIndex === beatIndex ? "jump" : "reach";
    }
    case "chess_table":
      return "chat";
    case "chasing_loop":
      return "chase";
    case "arcade_corner":
    case "foosball_side_1":
    case "foosball_side_2":
    case "foosball_side_3":
    case "foosball_side_4":
      return "reach";
    case "jukebox_floor":
      return "dance";
    case "reading_nook":
      return "sleep-floor";
    default:
      return null;
  }
}

function syncDerivedActorAnimations(state: MauOfficeState, nowMs: number) {
  for (const actorId of state.actorOrder) {
    const actor = state.actors[actorId];
    if (!actor) {
      continue;
    }
    actor.animationId = resolveIdleAnimationId(actor, nowMs);
  }
}

function assignIdleActivities(state: MauOfficeState, nowMs: number) {
  const idleActors = state.actorOrder
    .map((id) => state.actors[id])
    .filter(
      (actor): actor is OfficeActor =>
        Boolean(actor) &&
        actor.kind === "worker" &&
        !actor.path &&
        !actor.idleAssignment &&
        (!actor.snapshotActivity || actor.snapshotActivity.kind === "idle") &&
        actor.currentActivity.source !== "event" &&
        actor.currentActivity.kind !== "customer_support" &&
        actor.currentActivity.kind !== "idle_package" &&
        actor.currentActivity.kind !== "meeting" &&
        actor.currentActivity.kind !== "desk_work" &&
        actor.currentActivity.kind !== "whiteboard_update",
    );
  if (idleActors.length === 0) {
    return;
  }
  const packages = resolveIdlePackages(state.config);
  const packageById = new Map(packages.map((pkg) => [pkg.id, pkg] as const));
  const availablePackage = (id: string) =>
    packageById.has(id) && (id === "passing_ball_court" || (state.idleCooldowns[id] ?? 0) <= nowMs);
  const idleSeed = `idle:${Math.floor(nowMs / IDLE_ACTIVITY_WINDOW_MS)}`;
  const remaining = stableShuffleByKey(idleActors, idleSeed, (actor) => actor.id);
  const reservedAnchors = new Set<string>();

  const assignPackageById = (packageId: string, count: number): boolean => {
    const pkg = packageById.get(packageId);
    const activityDef = pkg?.activityDefinitions[0];
    if (!pkg || !activityDef || !availablePackage(packageId) || remaining.length < count) {
      return false;
    }
    const slotAnchorIds = activityDef.slotLayout.slice(0, count);
    if (
      slotAnchorIds.length < count ||
      slotAnchorIds.some((anchorId) => reservedAnchors.has(anchorId))
    ) {
      return false;
    }
    const participants = remaining.splice(0, count);
    if (participants.length !== count) {
      remaining.unshift(...participants);
      return false;
    }
    state.idleCooldowns[pkg.id] = nowMs + pkg.cooldownMs;
    participants.forEach((actor, index) => {
      const slotAnchorId = slotAnchorIds[index]!;
      reservedAnchors.add(slotAnchorId);
      actor.idleAssignment = {
        packageId: pkg.id,
        activityId: activityDef.id,
        participantIds: participants.map((entry) => entry.id),
        slotAnchorIds,
        startedAtMs: nowMs,
        endsAtMs: nowMs + IDLE_ACTIVITY_WINDOW_MS,
      };
      setActorActivity(
        actor,
        state.actors,
        createActivity({
          id: activityDef.id,
          kind: "idle_package",
          label: activityDef.label,
          roomId: "break",
          anchorId: slotAnchorId,
          source: "idle",
          expiresAtMs: nowMs + IDLE_ACTIVITY_WINDOW_MS,
        }),
        nowMs,
      );
    });
    return true;
  };

  if (remaining.length >= 4) {
    assignPackageById("passing_ball_court", 4);
  }

  const randomizedGroupIds = stableShuffleByKey(
    RANDOM_GROUP_IDLE_PACKAGE_IDS,
    `${idleSeed}:groups`,
    (value) => value,
  );
  for (const packageId of randomizedGroupIds) {
    const requiredCount =
      packageById.get(packageId)?.activityDefinitions[0]?.slotLayout.length ?? 0;
    if (requiredCount > 0 && remaining.length >= requiredCount) {
      assignPackageById(packageId, requiredCount);
    }
  }

  const randomizedSoloIds = stableShuffleByKey(
    SOLO_IDLE_PACKAGE_IDS,
    `${idleSeed}:solo`,
    (value) => value,
  );
  for (const actor of remaining.splice(0)) {
    const packageId = randomizedSoloIds.find((id) => {
      const slotAnchorId = packageById.get(id)?.activityDefinitions[0]?.slotLayout[0];
      return (
        typeof slotAnchorId === "string" &&
        availablePackage(id) &&
        !reservedAnchors.has(slotAnchorId)
      );
    });
    if (packageId && assignPackageById(packageId, 1)) {
      continue;
    }
    setActorActivity(
      actor,
      state.actors,
      createActivity({
        id: "idle-fallback",
        kind: "idle",
        label: "Taking a breather",
        roomId: "break",
        anchorId: idleAnchorForHome(actor.homeAnchorId),
        source: "idle",
        expiresAtMs: nowMs + IDLE_ACTIVITY_WINDOW_MS,
      }),
      nowMs,
    );
  }
}

function pruneInvalidIdleAssignments(state: MauOfficeState, nowMs: number) {
  for (const actorId of state.actorOrder) {
    const actor = state.actors[actorId];
    if (!actor?.idleAssignment) {
      continue;
    }
    if (hasCompleteIdleGroup(actor, state.actors, nowMs)) {
      continue;
    }
    actor.idleAssignment = null;
    if (actor.currentActivity.kind === "idle_package") {
      actor.currentActivity = fallbackActivityForActor(actor, nowMs);
      actor.currentRoomId =
        activeScene().anchors[actor.currentActivity.anchorId]?.roomId === "outside"
          ? "outside"
          : roomFromAnchor(actor.currentActivity.anchorId);
      syncActorToAnchor(actor, actor.currentActivity.anchorId);
    }
  }
}

function resolvePrimaryActivity(actor: OfficeActor, nowMs: number): OfficeActivity {
  if (isActiveEventActivity(actor, nowMs)) {
    return actor.currentActivity;
  }
  const pendingActivity = activePendingActivity(actor, nowMs);
  if (pendingActivity) {
    return pendingActivity;
  }
  const snapshotActivity = activeSnapshotActivity(actor, nowMs);
  if (snapshotActivity) {
    return snapshotActivity;
  }
  return fallbackActivityForActor(actor, nowMs);
}

function advanceActor(
  actor: OfficeActor,
  actors: Record<string, OfficeActor>,
  nowMs: number,
): boolean {
  if (isStaleSupportPlan(actor, actor.queuedActivity, nowMs)) {
    actor.queuedActivity = null;
  }
  if (!actor.path) {
    if (isActiveEventActivity(actor, nowMs)) {
      return false;
    }
    if (
      actor.currentActivity.source === "event" &&
      (actor.currentActivity.expiresAtMs ?? 0) <= nowMs
    ) {
      return settleActorToPrimaryActivity(actor, actors, nowMs) || true;
    }
    if (actor.idleAssignment && actor.idleAssignment.endsAtMs <= nowMs) {
      actor.idleAssignment = null;
      return settleActorToPrimaryActivity(actor, actors, nowMs) || true;
    }
    if (actor.currentActivity.kind === "customer_support" && isSupportActivityStale(actor, nowMs)) {
      return settleActorToPrimaryActivity(actor, actors, nowMs) || true;
    }
    return false;
  }
  let changed = false;
  while (
    actor.path &&
    actor.path.segmentIndex < actor.path.waypoints.length - 1 &&
    nowMs - actor.path.segmentStartedAtMs >= actor.path.segmentDurationMs
  ) {
    actor.path.segmentStartedAtMs += actor.path.segmentDurationMs;
    actor.path.segmentIndex += 1;
    const currentWaypoint = actor.path.waypoints[actor.path.segmentIndex]!;
    if (currentWaypoint.nodeId) {
      actor.nodeId = currentWaypoint.nodeId;
    }
    actor.x = currentWaypoint.x;
    actor.y = currentWaypoint.y;
    if (actor.path.segmentIndex < actor.path.waypoints.length - 1) {
      actor.path.segmentDurationMs = resolvePathDurationForIndex(
        actor.path,
        actor.path.segmentIndex,
      );
    }
    changed = true;
  }
  if (actor.path && actor.path.segmentIndex < actor.path.waypoints.length - 1) {
    const currentWaypoint = actor.path.waypoints[actor.path.segmentIndex]!;
    const nextWaypoint = actor.path.waypoints[actor.path.segmentIndex + 1]!;
    const progress = Math.max(
      0,
      Math.min(1, (nowMs - actor.path.segmentStartedAtMs) / actor.path.segmentDurationMs),
    );
    actor.x = Math.round(currentWaypoint.x + (nextWaypoint.x - currentWaypoint.x) * progress);
    actor.y = Math.round(currentWaypoint.y + (nextWaypoint.y - currentWaypoint.y) * progress);
    actor.facing = normalizeDirection(currentWaypoint, nextWaypoint);
    return true;
  }
  if (actor.path) {
    actor.anchorId = actor.path.targetAnchorId;
    syncActorToAnchor(actor, actor.anchorId);
    actor.currentRoomId =
      activeScene().anchors[actor.anchorId]?.roomId === "outside"
        ? "outside"
        : (activeScene().anchors[actor.anchorId]?.roomId as MauOfficeRoomId);
    actor.currentActivity = actor.queuedActivity ?? resolvePrimaryActivity(actor, nowMs);
    if (
      actor.currentActivity.bubbleText &&
      actor.bubbles[0]?.text !== actor.currentActivity.bubbleText
    ) {
      pushBubble(actor, actor.currentActivity.bubbleText, actor.currentActivity.kind, nowMs);
    }
    actor.queuedActivity = null;
    actor.path = null;
    changed = true;
    changed = settleActorToPrimaryActivity(actor, actors, nowMs) || changed;
  }
  return changed;
}

function buildSnapshotState(
  previous: MauOfficeState,
  params: SnapshotParams,
  nowMs: number,
): MauOfficeState {
  const scene = compileMauOfficeScene(resolveMauOfficeSceneConfigFromRoot(params.rawConfig));
  setActiveMauOfficeScene(scene);
  const heartbeatSessionKeys = resolveHeartbeatSessionKeys(params.rawConfig, params.agents);
  const nextActors: Record<string, OfficeActor> = {};
  const actorOrder: string[] = [];
  const rowsByAgentId = new Map<string, GatewaySessionRow[]>();
  const visitorRows: GatewaySessionRow[] = [];

  for (const row of params.sessions.sessions) {
    const parsed = parseAgentSessionKey(row.key);
    if (parsed) {
      const list = rowsByAgentId.get(parsed.agentId) ?? [];
      list.push(row);
      rowsByAgentId.set(parsed.agentId, list);
    }
    if (isVisitorSession(row, params.agents.mainKey, nowMs, heartbeatSessionKeys)) {
      visitorRows.push(row);
    }
  }

  const visibleAgents = params.agents.agents.slice(0, params.config.maxVisibleWorkers);
  visibleAgents.forEach((agent, index) => {
    const actorId = `worker:${agent.id}`;
    const prev = previous.actors[actorId];
    const roleHint = roleHintFromCatalog(previous.toolsCatalogByAgentId[agent.id]);
    const homeAnchorId = prev?.homeAnchorId ?? deskHomeAnchorForIndex(index);
    const snapshotRow = pickSnapshotRowForAgent(
      agent.id,
      params.agents.mainKey,
      rowsByAgentId.get(agent.id) ?? [],
      nowMs,
    );
    const isHeartbeatSnapshot = snapshotRow
      ? Boolean(heartbeatSessionKeys[snapshotRow.key])
      : false;
    const snapshotActivity = preserveActiveSupportDialogue(
      prev,
      preferRecentBubbleText(
        prev,
        snapshotActivityForRow(
          { kind: "worker", roleHint, homeAnchorId },
          snapshotRow,
          nowMs,
          isHeartbeatSnapshot,
        ),
        snapshotRow?.updatedAt ?? undefined,
      ),
      nowMs,
    );
    const actor = prev
      ? cloneActor(prev)
      : createActor({
          id: actorId,
          kind: "worker",
          label: labelForAgent(agent),
          agentId: agent.id,
          sessionKey:
            snapshotRow?.key ??
            buildAgentMainSessionKey({ agentId: agent.id, mainKey: params.agents.mainKey }),
          roleHint,
          homeAnchorId,
          snapshotActivity,
          nowMs,
        });
    actor.roleHint = roleHint;
    actor.homeAnchorId = homeAnchorId;
    actor.snapshotActivity = snapshotActivity;
    actor.sessionKey = snapshotRow?.key ?? actor.sessionKey;
    actor.lastSeenAtMs = Math.max(
      prev?.lastSeenAtMs ?? 0,
      snapshotRow?.updatedAt ?? 0,
      !prev && !snapshotRow ? nowMs : 0,
    );
    nextActors[actorId] = actor;
    actorOrder.push(actorId);
  });

  visitorRows
    .toSorted((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
    .slice(0, MAX_VISITOR_WORKERS)
    .forEach((row) => {
      const actorId = `visitor:${row.key}`;
      const prev = previous.actors[actorId];
      const parsed = parseAgentSessionKey(row.key);
      const roleHint: ActorRoleHint = isMeetingSessionRow(row)
        ? "meeting"
        : isSupportSessionRow(row)
          ? "support"
          : "desk";
      const label =
        row.displayName?.trim() || row.derivedTitle?.trim() || parsed?.agentId || "Visitor";
      const homeAnchorId = isSupportSessionRow(row)
        ? "outside_support"
        : (prev?.homeAnchorId ?? "outside_mauHome");
      const supportVisitorAnchorId = visitorSupportAnchorForAgentId(
        nextActors,
        parsed?.agentId ?? null,
      );
      const snapshotActivity =
        preserveActiveSupportDialogue(
          prev,
          preferRecentBubbleText(
            prev,
            snapshotActivityForRow(
              { kind: "visitor", roleHint, homeAnchorId },
              row,
              nowMs,
              Boolean(heartbeatSessionKeys[row.key]),
            ),
            row.updatedAt ?? undefined,
          ),
          nowMs,
        ) ??
        createActivity({
          id: "visitor-desk",
          kind: roleHint === "support" ? "customer_support" : "desk_work",
          label: roleHint === "support" ? "Customer message" : "Short-lived task",
          roomId: roleHint === "meeting" ? "meeting" : roleHint === "support" ? "support" : "desk",
          anchorId:
            roleHint === "meeting"
              ? visitorMeetingAnchor()
              : roleHint === "support"
                ? supportVisitorAnchorId
                : lastDeskAnchor(),
          source: "snapshot",
        });
      const resolvedSnapshotActivity =
        roleHint === "support"
          ? { ...snapshotActivity, anchorId: supportVisitorAnchorId }
          : snapshotActivity;
      const actor = prev
        ? cloneActor(prev)
        : createActor({
            id: actorId,
            kind: "visitor",
            label,
            agentId: parsed?.agentId ?? null,
            sessionKey: row.key,
            roleHint,
            homeAnchorId,
            snapshotActivity: resolvedSnapshotActivity,
            nowMs,
          });
      actor.snapshotActivity = resolvedSnapshotActivity;
      actor.sessionKey = row.key;
      actor.label = label;
      actor.shortLabel = shortLabelForName(label, "V");
      actor.roleHint = roleHint;
      actor.homeAnchorId = homeAnchorId;
      actor.rigId = isUserSessionKey(row.key) ? "human" : actor.rigId;
      actor.lastSeenAtMs = Math.max(prev?.lastSeenAtMs ?? 0, row.updatedAt ?? nowMs);
      nextActors[actorId] = actor;
      actorOrder.push(actorId);
      if (!prev) {
        setActorActivity(actor, nextActors, snapshotActivity, nowMs, "enter");
      }
    });

  for (const actorId of Object.keys(previous.actors)) {
    const actor = previous.actors[actorId];
    if (actor.kind !== "visitor" || nextActors[actorId]) {
      continue;
    }
    const exiting = cloneActor(actor);
    const offsiteActivity = offsiteActivityForAnchor(
      isUserSessionKey(actor.sessionKey) ? "outside_support" : "outside_mauHome",
    );
    exiting.snapshotActivity = cloneActivity(offsiteActivity);
    setActorActivity(exiting, nextActors, cloneActivity(offsiteActivity), nowMs, "exit");
    nextActors[actorId] = exiting;
    actorOrder.push(actorId);
  }

  const next: MauOfficeState = {
    ...previous,
    loaded: true,
    nowMs,
    config: params.config,
    scene,
    heartbeatSessionKeys,
    activeHeartbeatSessionKeys: retainActiveHeartbeatSessionKeys(
      previous.activeHeartbeatSessionKeys,
      nowMs,
    ),
    presenceEntries: params.presenceEntries,
    actors: nextActors,
    actorOrder,
    visibleAgentIds: visibleAgents.map((agent) => agent.id),
    offsiteWorkerCount: Math.max(0, params.agents.agents.length - visibleAgents.length),
    version: previous.version + 1,
  };

  for (const actorId of actorOrder) {
    const actor = next.actors[actorId];
    const busy =
      actor.path || isActiveEventActivity(actor, nowMs) || isActiveIdleAssignment(actor, nowMs);
    if (busy) {
      const activity = resolveDeferredActivity(actor, nowMs);
      const plannedActivity =
        actor.pendingActivity ?? actor.queuedActivity ?? actor.currentActivity;
      if (!sameActivityPlan(plannedActivity, activity)) {
        actor.pendingActivity = cloneActivity(activity);
      }
      continue;
    }
    settleActorToPrimaryActivity(actor, next.actors, nowMs);
  }
  assignIdleActivities(next, nowMs);
  return advanceMauOfficeState(next, nowMs);
}

export function createEmptyMauOfficeState(source?: unknown): MauOfficeState {
  const scene = compileMauOfficeScene(resolveMauOfficeSceneConfigFromRoot(source));
  setActiveMauOfficeScene(scene);
  return {
    loaded: false,
    nowMs: Date.now(),
    config: resolveMauOfficeConfig(source),
    scene,
    presenceEntries: [],
    toolsCatalogByAgentId: {},
    heartbeatSessionKeys: {},
    activeHeartbeatSessionKeys: {},
    actors: {},
    actorOrder: [],
    visibleAgentIds: [],
    offsiteWorkerCount: 0,
    roomFocus: "all",
    idleCooldowns: {},
    version: 0,
  };
}

export function advanceMauOfficeState(state: MauOfficeState, nowMs: number): MauOfficeState {
  setActiveMauOfficeScene(state.scene);
  const next: MauOfficeState = {
    ...state,
    nowMs,
    activeHeartbeatSessionKeys: retainActiveHeartbeatSessionKeys(
      state.activeHeartbeatSessionKeys,
      nowMs,
    ),
    actors: Object.fromEntries(
      Object.entries(state.actors).map(([id, actor]) => [id, cloneActor(actor)]),
    ),
    version: state.version + 1,
  };
  const nextOrder: string[] = [];
  for (const actorId of state.actorOrder) {
    const actor = next.actors[actorId];
    if (!actor) {
      continue;
    }
    advanceActor(actor, next.actors, nowMs);
    if (actor.kind === "visitor" && actor.currentRoomId === "outside" && !actor.path) {
      continue;
    }
    nextOrder.push(actorId);
  }
  next.actorOrder = nextOrder;
  pruneInvalidIdleAssignments(next, nowMs);
  assignIdleActivities(next, nowMs);
  syncDerivedActorAnimations(next, nowMs);
  return next;
}

function resolveActorForSessionKey(state: MauOfficeState, sessionKey: string): OfficeActor | null {
  for (const actorId of state.actorOrder) {
    const actor = state.actors[actorId];
    if (actor?.sessionKey === sessionKey) {
      return actor;
    }
  }
  const parsed = parseAgentSessionKey(sessionKey);
  if (!parsed) {
    return null;
  }
  return state.actors[`worker:${parsed.agentId}`] ?? null;
}

function resolveWorkerActorForSessionKey(
  state: MauOfficeState,
  sessionKey: string,
): OfficeActor | null {
  const parsed = parseAgentSessionKey(sessionKey);
  if (!parsed) {
    return null;
  }
  return state.actors[`worker:${parsed.agentId}`] ?? null;
}

function resolveLastUserPreview(entry: SessionsPreviewEntry | undefined): string | undefined {
  if (!entry || entry.status !== "ok") {
    return undefined;
  }
  for (let index = entry.items.length - 1; index >= 0; index -= 1) {
    const item = entry.items[index];
    if (item?.role !== "user") {
      continue;
    }
    const text = extractVisitorPreviewText({ role: "user", text: item.text });
    if (text) {
      return text;
    }
  }
  return undefined;
}

function resolveLastAssistantPreview(entry: SessionsPreviewEntry | undefined): string | undefined {
  if (!entry || entry.status !== "ok") {
    return undefined;
  }
  for (let index = entry.items.length - 1; index >= 0; index -= 1) {
    const item = entry.items[index];
    if (item?.role !== "assistant") {
      continue;
    }
    const text = extractPreviewText(item.text);
    if (text) {
      return text;
    }
  }
  return undefined;
}

function ensureVisitorActor(state: MauOfficeState, sessionKey: string, nowMs: number): OfficeActor {
  const actorId = `visitor:${sessionKey}`;
  const existing = state.actors[actorId];
  if (existing) {
    return existing;
  }
  const parsed = parseAgentSessionKey(sessionKey);
  const actor = createActor({
    id: actorId,
    kind: "visitor",
    label: parsed?.agentId ?? "Visitor",
    agentId: parsed?.agentId ?? null,
    sessionKey,
    roleHint: visitorRoleHintForSessionKey(sessionKey),
    homeAnchorId: isUserSessionKey(sessionKey) ? "outside_support" : "outside_mauHome",
    snapshotActivity: null,
    nowMs,
  });
  state.actors[actorId] = actor;
  state.actorOrder = [...state.actorOrder, actorId];
  return actor;
}

function touchSupportVisitorForSession(state: MauOfficeState, sessionKey: string, nowMs: number) {
  const visitor = state.actors[`visitor:${sessionKey}`];
  if (!visitor) {
    return;
  }
  visitor.lastSeenAtMs = nowMs;
}

function applyEventToActor(
  actor: OfficeActor,
  actors: Record<string, OfficeActor>,
  activity: OfficeActivity,
  nowMs: number,
) {
  actor.lastSeenAtMs = nowMs;
  if (actor.path) {
    if (sameActivityPlan(actor.queuedActivity, activity)) {
      actor.queuedActivity = cloneActivity(activity);
      if (activity.bubbleText) {
        pushBubble(actor, activity.bubbleText, activity.kind, nowMs);
      }
      return;
    }
    setActorActivity(actor, actors, activity, nowMs, resolveActivityMode(actor, activity));
    return;
  }
  if (isActiveEventActivity(actor, nowMs) || isActiveIdleAssignment(actor, nowMs)) {
    if (sameActivityPlan(actor.currentActivity, activity)) {
      actor.currentActivity = cloneActivity(activity);
      if (activity.bubbleText) {
        pushBubble(actor, activity.bubbleText, activity.kind, nowMs);
      }
      return;
    }
  }
  setActorActivity(actor, actors, activity, nowMs, resolveActivityMode(actor, activity));
}

export function setMauOfficeRoomFocus(
  state: MauOfficeState,
  roomFocus: MauOfficeRoomId | "all",
): MauOfficeState {
  setActiveMauOfficeScene(state.scene);
  return {
    ...state,
    roomFocus,
    version: state.version + 1,
  };
}

export function setMauOfficeCompiledScene(
  state: MauOfficeState,
  scene: CompiledMauOfficeScene,
): MauOfficeState {
  setActiveMauOfficeScene(scene);
  return {
    ...state,
    scene,
    version: state.version + 1,
  };
}

export function applyMauOfficePresence(
  state: MauOfficeState,
  presenceEntries: PresenceEntry[],
  nowMs: number,
): MauOfficeState {
  setActiveMauOfficeScene(state.scene);
  return {
    ...state,
    nowMs,
    presenceEntries,
    version: state.version + 1,
  };
}

export function applyMauOfficeToolsCatalog(
  state: MauOfficeState,
  agentId: string,
  catalog: ToolsCatalogResult,
  nowMs: number,
): MauOfficeState {
  setActiveMauOfficeScene(state.scene);
  const next = {
    ...state,
    nowMs,
    toolsCatalogByAgentId: {
      ...state.toolsCatalogByAgentId,
      [agentId]: catalog,
    },
    actors: Object.fromEntries(
      Object.entries(state.actors).map(([id, actor]) => [id, cloneActor(actor)]),
    ),
    version: state.version + 1,
  };
  const actor = next.actors[`worker:${agentId}`];
  if (actor) {
    actor.roleHint = roleHintFromCatalog(catalog);
    actor.homeAnchorId = actor.homeAnchorId || deskHomeAnchorForIndex(0);
  }
  return next;
}

export function applyMauOfficeAgentEvent(
  state: MauOfficeState,
  payload: AgentEventPayload | undefined,
  nowMs: number,
): MauOfficeState {
  setActiveMauOfficeScene(state.scene);
  const sessionKey = typeof payload?.sessionKey === "string" ? payload.sessionKey.trim() : "";
  if (!sessionKey) {
    return state;
  }
  const sessionRoleHint = roleHintForSessionKey(sessionKey);
  const next = {
    ...state,
    nowMs,
    activeHeartbeatSessionKeys: retainActiveHeartbeatSessionKeys(
      state.activeHeartbeatSessionKeys,
      nowMs,
    ),
    actors: Object.fromEntries(
      Object.entries(state.actors).map(([id, actor]) => [id, cloneActor(actor)]),
    ),
    version: state.version + 1,
  };
  const isHeartbeatSession =
    isActiveHeartbeatSession(next, sessionKey, nowMs) || isActiveHeartbeatEvent(payload);
  if (isHeartbeatSession) {
    touchActiveHeartbeatSession(next.activeHeartbeatSessionKeys, sessionKey, nowMs);
  }
  const actor =
    sessionRoleHint === "support" || isHeartbeatSession
      ? resolveWorkerActorForSessionKey(next, sessionKey)
      : (resolveActorForSessionKey(next, sessionKey) ??
        ensureVisitorActor(next, sessionKey, nowMs));
  if (!actor) {
    return next;
  }
  const phase =
    typeof payload?.data?.phase === "string"
      ? payload.data.phase.trim().toLowerCase()
      : typeof payload?.stream === "string"
        ? payload.stream.trim().toLowerCase()
        : "";
  if (
    isHeartbeatSession &&
    (phase === "end" || phase === "error") &&
    actor.snapshotActivity?.id === "snapshot-heartbeat"
  ) {
    actor.snapshotActivity = null;
  }
  const activity =
    phase === "end" || phase === "error"
      ? preserveLatestEventBubbleOnDeferredActivity(
          actor,
          resolveDeferredActivity(actor, nowMs),
          nowMs,
        )
      : isHeartbeatSession
        ? createHeartbeatMeetingActivity(actor, {
            id: `event-heartbeat:${phase || "work"}`,
            label: "Heartbeat sync",
            bubbleText: extractAgentEventPreviewText(payload?.data),
            source: "event",
            expiresAtMs: nowMs + EVENT_ACTIVITY_WINDOW_MS,
          })
        : sessionRoleHint === "meeting"
          ? createMeetingActivityForActor(actor, {
              id: `event-agent:${phase || "work"}`,
              label: "Collaborating in a meeting",
              bubbleText: extractAgentEventPreviewText(payload?.data),
              source: "event",
              expiresAtMs: nowMs + EVENT_ACTIVITY_WINDOW_MS,
            })
          : createActivity({
              id: `event-agent:${phase || "work"}`,
              kind: sessionRoleHint === "support" ? "customer_support" : "desk_work",
              label: sessionRoleHint === "support" ? "Handling support" : "Working through a task",
              bubbleText: extractAgentEventPreviewText(payload?.data),
              roomId:
                sessionRoleHint === "support" ? "support" : roomFromAnchor(actor.homeAnchorId),
              anchorId:
                sessionRoleHint === "support"
                  ? supportAnchorForHome(actor.homeAnchorId)
                  : actor.homeAnchorId,
              source: "event",
              expiresAtMs:
                nowMs +
                activityLifetimeMs(
                  sessionRoleHint === "support" ? "customer_support" : "desk_work",
                ),
            });
  applyEventToActor(actor, next.actors, activity, nowMs);
  if (sessionRoleHint === "support" && !isHeartbeatSession) {
    touchSupportVisitorForSession(next, sessionKey, nowMs);
  }
  return next;
}

export function applyMauOfficeSessionToolEvent(
  state: MauOfficeState,
  payload: SessionToolPayload | undefined,
  nowMs: number,
): MauOfficeState {
  setActiveMauOfficeScene(state.scene);
  const sessionKey = typeof payload?.sessionKey === "string" ? payload.sessionKey.trim() : "";
  if (!sessionKey) {
    return state;
  }
  const toolId =
    typeof payload?.data?.name === "string"
      ? payload.data.name
      : typeof payload?.data?.toolName === "string"
        ? payload.data.toolName
        : typeof payload?.data?.toolId === "string"
          ? payload.data.toolId
          : "tool";
  const sessionRoleHint = roleHintForSessionKey(sessionKey);
  const baseMapped = bubbleTextForTool(toolId);
  const mapped =
    sessionRoleHint === "meeting" && isInterAgentCoordinationTool(toolId)
      ? {
          label: "Coordinating with helpers",
          kind: "meeting" as const,
          roomId: "meeting" as const,
          anchorId: "meeting_presenter",
        }
      : baseMapped;
  const bubbleText =
    extractPreviewText(payload?.data?.args) ??
    extractPreviewText(payload?.data?.arguments) ??
    extractPreviewText(payload?.data?.input) ??
    extractPreviewText(payload?.data?.query) ??
    extractPreviewText(payload?.data?.text) ??
    extractPreviewText(payload?.data?.message);
  const next = {
    ...state,
    nowMs,
    activeHeartbeatSessionKeys: retainActiveHeartbeatSessionKeys(
      state.activeHeartbeatSessionKeys,
      nowMs,
    ),
    actors: Object.fromEntries(
      Object.entries(state.actors).map(([id, actor]) => [id, cloneActor(actor)]),
    ),
    version: state.version + 1,
  };
  const isHeartbeatSession =
    isActiveHeartbeatSession(next, sessionKey, nowMs) || payload?.isHeartbeat === true;
  if (isHeartbeatSession) {
    touchActiveHeartbeatSession(next.activeHeartbeatSessionKeys, sessionKey, nowMs);
  }
  const actor =
    sessionRoleHint === "support" && !isHeartbeatSession
      ? (resolveWorkerActorForSessionKey(next, sessionKey) ??
        resolveActorForSessionKey(next, sessionKey) ??
        ensureVisitorActor(next, sessionKey, nowMs))
      : isHeartbeatSession
        ? (resolveWorkerActorForSessionKey(next, sessionKey) ??
          resolveActorForSessionKey(next, sessionKey))
        : (resolveActorForSessionKey(next, sessionKey) ??
          ensureVisitorActor(next, sessionKey, nowMs));
  if (!actor) {
    return next;
  }
  const messageLabel = extractMessageLabel(payload?.data?.message);
  if (messageLabel) {
    actor.label = messageLabel;
    actor.shortLabel = shortLabelForName(messageLabel, "V");
  }
  applyEventToActor(
    actor,
    next.actors,
    isHeartbeatSession
      ? createHeartbeatMeetingActivity(actor, {
          id: `event-tool:${toolId}`,
          label: mapped.kind === "meeting" ? mapped.label : "Heartbeat follow-up",
          bubbleText,
          source: "event",
          expiresAtMs: nowMs + EVENT_ACTIVITY_WINDOW_MS,
        })
      : createActivity({
          id: `event-tool:${toolId}`,
          kind: mapped.kind,
          label: mapped.label,
          bubbleText,
          roomId: mapped.roomId,
          anchorId:
            mapped.kind === "customer_support"
              ? mapped.roomId === "telephony"
                ? mapped.anchorId
                : actor.kind === "visitor" && isUserSessionKey(actor.sessionKey)
                  ? visitorSupportAnchorForAgentId(next.actors, actor.agentId)
                  : supportAnchorForHome(actor.homeAnchorId)
              : mapped.kind === "meeting"
                ? actor.kind === "visitor"
                  ? visitorMeetingAnchor()
                  : meetingAnchorForHome(actor.homeAnchorId, actor.roleHint === "meeting")
                : mapped.anchorId,
          source: "event",
          expiresAtMs: nowMs + activityLifetimeMs(mapped.kind),
        }),
    nowMs,
  );
  if (mapped.kind === "customer_support" && mapped.roomId === "support" && !isHeartbeatSession) {
    touchSupportVisitorForSession(next, sessionKey, nowMs);
  }
  return next;
}

export function applyMauOfficeSessionMessageEvent(
  state: MauOfficeState,
  payload: SessionMessagePayload | undefined,
  nowMs: number,
): MauOfficeState {
  setActiveMauOfficeScene(state.scene);
  const sessionKey = typeof payload?.sessionKey === "string" ? payload.sessionKey.trim() : "";
  if (!sessionKey) {
    return state;
  }
  const role =
    typeof payload?.message?.role === "string"
      ? payload.message.role.trim().toLowerCase()
      : "assistant";
  const messageSeq =
    typeof payload?.messageSeq === "number" && Number.isFinite(payload.messageSeq)
      ? payload.messageSeq
      : undefined;
  const messageId =
    typeof payload?.messageId === "string" && payload.messageId.trim()
      ? payload.messageId.trim()
      : undefined;
  const sessionRoleHint = roleHintForSessionKey(sessionKey);
  const isSupport = sessionRoleHint === "support";
  const bubbleText =
    isSupport && role === "user"
      ? extractVisitorPreviewText(payload?.message)
      : (extractPreviewText(payload?.message?.content) ??
        extractPreviewText(payload?.message?.text) ??
        extractPreviewText(payload?.message));
  const next = {
    ...state,
    nowMs,
    activeHeartbeatSessionKeys: retainActiveHeartbeatSessionKeys(
      state.activeHeartbeatSessionKeys,
      nowMs,
    ),
    actors: Object.fromEntries(
      Object.entries(state.actors).map(([id, actor]) => [id, cloneActor(actor)]),
    ),
    version: state.version + 1,
  };
  const isHeartbeatSession = isActiveHeartbeatSession(next, sessionKey, nowMs);
  if (isHeartbeatSession) {
    touchActiveHeartbeatSession(next.activeHeartbeatSessionKeys, sessionKey, nowMs);
  }
  const actor = isHeartbeatSession
    ? (resolveWorkerActorForSessionKey(next, sessionKey) ??
      resolveActorForSessionKey(next, sessionKey))
    : isSupport && role === "user"
      ? ensureVisitorActor(next, sessionKey, nowMs)
      : isSupport && role !== "user"
        ? resolveWorkerActorForSessionKey(next, sessionKey)
        : (resolveActorForSessionKey(next, sessionKey) ??
          ensureVisitorActor(next, sessionKey, nowMs));
  if (!actor) {
    return next;
  }
  if (isSupport && !isHeartbeatSession) {
    if (role === "user") {
      updateSupportDialogue(actor, "user", bubbleText, nowMs, { messageSeq, messageId });
    } else if (role === "assistant") {
      updateSupportDialogue(actor, "assistant", bubbleText, nowMs, { messageSeq, messageId });
    }
  }
  applyEventToActor(
    actor,
    next.actors,
    isHeartbeatSession
      ? createHeartbeatMeetingActivity(actor, {
          id: `event-message:${role}`,
          label: role === "user" ? "Heartbeat note" : "Heartbeat update",
          bubbleText,
          source: "event",
          expiresAtMs: nowMs + EVENT_ACTIVITY_WINDOW_MS,
        })
      : sessionRoleHint === "meeting"
        ? createMeetingActivityForActor(actor, {
            id: `event-message:${role}`,
            label: role === "user" ? "Discussing a plan" : "Collaborating in a meeting",
            bubbleText,
            source: "event",
            expiresAtMs: nowMs + EVENT_ACTIVITY_WINDOW_MS,
          })
        : createActivity({
            id: `event-message:${role}`,
            kind: isSupport ? "customer_support" : "desk_work",
            label:
              isSupport && role === "user"
                ? "Customer message"
                : isSupport
                  ? "Handling support"
                  : "Reviewing the latest update",
            bubbleText,
            roomId: isSupport ? "support" : roomFromAnchor(actor.homeAnchorId),
            anchorId:
              isSupport && actor.kind === "visitor"
                ? visitorSupportAnchorForAgentId(next.actors, actor.agentId)
                : isSupport
                  ? supportAnchorForHome(actor.homeAnchorId)
                  : actor.homeAnchorId,
            source: "event",
            expiresAtMs: nowMs + activityLifetimeMs(isSupport ? "customer_support" : "desk_work"),
          }),
    nowMs,
  );
  if (!isHeartbeatSession && sessionRoleHint === "meeting") {
    actor.snapshotActivity = createPostMeetingActivityForActor(actor, {
      id: "snapshot-meeting-followup",
      source: "snapshot",
    });
  }
  if (isSupport && !isHeartbeatSession) {
    touchSupportVisitorForSession(next, sessionKey, nowMs);
    if (role === "user") {
      const worker = resolveWorkerActorForSessionKey(next, sessionKey);
      if (worker) {
        worker.lastSeenAtMs = nowMs;
        applyEventToActor(
          worker,
          next.actors,
          createActivity({
            id: "event-support:listen",
            kind: "customer_support",
            label: "Handling support",
            roomId: "support",
            anchorId: supportAnchorForHome(worker.homeAnchorId),
            source: "event",
            expiresAtMs: nowMs + SUPPORT_ACTIVITY_WINDOW_MS,
          }),
          nowMs,
        );
      }
    }
  }
  return next;
}

export function createMauOfficeSessionTarget(
  state: MauOfficeState,
  actorId: string,
  defaults?: { defaultAgentId?: string; mainKey?: string },
): string | null {
  const actor = state.actors[actorId];
  if (!actor) {
    return null;
  }
  if (actor.sessionKey?.trim()) {
    return actor.sessionKey;
  }
  if (actor.agentId) {
    return buildAgentMainSessionKey({
      agentId: actor.agentId,
      mainKey: defaults?.mainKey,
    });
  }
  if (defaults?.defaultAgentId) {
    return buildAgentMainSessionKey({
      agentId: defaults.defaultAgentId,
      mainKey: defaults?.mainKey,
    });
  }
  return null;
}

async function loadVisibleAgentCatalogs(host: MauOfficeLoadHost) {
  const pendingAgentIds = host.mauOfficeState.visibleAgentIds.filter(
    (agentId) => !host.mauOfficeState.toolsCatalogByAgentId[agentId],
  );
  if (pendingAgentIds.length === 0) {
    return;
  }
  await Promise.allSettled(
    pendingAgentIds.map(async (agentId) => {
      const result = await host.client?.request<ToolsCatalogResult>("tools.catalog", {
        agentId,
        includePlugins: true,
      });
      if (result) {
        host.mauOfficeState = applyMauOfficeToolsCatalog(
          host.mauOfficeState,
          agentId,
          result,
          Date.now(),
        );
      }
    }),
  );
}

export async function loadMauOffice(host: MauOfficeLoadHost) {
  if (!host.client || !host.connected || host.mauOfficeLoading) {
    return;
  }
  host.mauOfficeLoading = true;
  host.mauOfficeError = null;
  try {
    const config = resolveMauOfficeConfig(host.configSnapshot?.config);
    const [agents, sessions, presence] = await Promise.all([
      host.client.request<AgentsListResult>("agents.list", {}),
      host.client.request<SessionsListResult>("sessions.list", {
        includeGlobal: true,
        includeUnknown: false,
        includeDerivedTitles: true,
        includeLastMessage: true,
        limit: 160,
      }),
      host.client.request<PresenceEntry[]>("system-presence", {}),
    ]);
    let sessionsWithVisitorPreview = sessions;
    const supportKeys = sessions.sessions.filter(isSupportSessionRow).map((row) => row.key);
    if (supportKeys.length > 0) {
      try {
        const previews = await host.client.request<SessionsPreviewResult>("sessions.preview", {
          keys: supportKeys,
          limit: 8,
          maxChars: 200,
        });
        const previewByKey = new Map(
          previews.previews.map(
            (entry) =>
              [
                entry.key,
                {
                  userPreview: resolveLastUserPreview(entry),
                  assistantPreview: resolveLastAssistantPreview(entry),
                },
              ] as const,
          ),
        );
        sessionsWithVisitorPreview = {
          ...sessions,
          sessions: sessions.sessions.map((row) => {
            const preview = previewByKey.get(row.key);
            return preview
              ? {
                  ...row,
                  lastUserMessagePreview: preview.userPreview,
                  lastAssistantMessagePreview: preview.assistantPreview,
                }
              : row;
          }),
        };
      } catch {
        sessionsWithVisitorPreview = sessions;
      }
    }
    host.mauOfficeState = buildSnapshotState(
      host.mauOfficeState,
      {
        config,
        rawConfig: host.configSnapshot?.config,
        agents,
        sessions: sessionsWithVisitorPreview,
        presenceEntries: Array.isArray(presence) ? presence : [],
      },
      Date.now(),
    );
    await loadVisibleAgentCatalogs(host);
  } catch (error) {
    host.mauOfficeError = isMissingOperatorReadScopeError(error)
      ? formatMissingOperatorReadScopeMessage("MauOffice")
      : String(error);
  } finally {
    host.mauOfficeLoading = false;
  }
}

export function scheduleMauOfficeReload(host: MauOfficeLoadHost, delayMs = 0) {
  if (host.mauOfficeReloadTimer != null) {
    clearTimeout(host.mauOfficeReloadTimer);
  }
  if (delayMs <= 0) {
    host.mauOfficeReloadTimer = null;
    void loadMauOffice(host);
    return;
  }
  host.mauOfficeReloadTimer = globalThis.setTimeout(() => {
    host.mauOfficeReloadTimer = null;
    void loadMauOffice(host);
  }, delayMs) as unknown as number;
}
