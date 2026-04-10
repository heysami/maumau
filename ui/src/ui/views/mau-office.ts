import { html, nothing } from "lit";
import { guard } from "lit/directives/guard.js";
import { ref } from "lit/directives/ref.js";
import { repeat } from "lit/directives/repeat.js";
import { styleMap } from "lit/directives/style-map.js";
import { t } from "../../i18n/index.ts";
import { extractText } from "../chat/message-extract.ts";
import { normalizeMessage, normalizeRoleForGrouping } from "../chat/message-normalizer.ts";
import {
  moveSceneSelection,
  paintSceneAutotileCell,
  paintSceneWall,
  placeSceneProp,
  type MauOfficeEditorBrushMode,
  type MauOfficeEditorSelection,
  type MauOfficeEditorTool,
} from "../controllers/mau-office-editor.ts";
import {
  MAU_OFFICE_CHASING_LOOP_CYCLE_MS,
  MAU_OFFICE_PASSING_BALL_BEAT_MS,
  MAU_OFFICE_SUPPORT_DIALOGUE_WINDOW_MS,
} from "../controllers/mau-office.ts";
import type { MauOfficeState, OfficeActor, OfficeBubbleEntry } from "../controllers/mau-office.ts";
import { icons } from "../icons.ts";
import {
  MAU_OFFICE_BUBBLE_FRAME_ASSETS,
  MAU_OFFICE_BUBBLE_TAIL_ASSET,
  MAU_OFFICE_WORKER_RENDER_METRICS,
  MAU_OFFICE_FOCUS_PADDING_TILES,
  MAU_OFFICE_ROOM_IDS,
  resolveMauOfficeWorkerAnimation,
  resolveMauOfficeAssetUrl,
  type MauOfficeAnchor,
  type MauOfficeWorkerAnimationId,
  type MauOfficeDirection,
  type MauOfficeRoomId,
  type MauOfficeSpritePlacement,
  type MauOfficeTilePlacement,
} from "../mau-office-contract.ts";
import {
  MAU_OFFICE_CATALOG,
  MAU_OFFICE_SCENE_MAX_TILES_H,
  MAU_OFFICE_SCENE_MAX_TILES_W,
  MAU_OFFICE_SCENE_MIN_TILES_H,
  MAU_OFFICE_SCENE_MIN_TILES_W,
  compileMauOfficeScene,
  getMauOfficeSceneTileHeight,
  getMauOfficeSceneTileWidth,
  type CompiledMauOfficeScene,
  type MauOfficeMarkerRole,
  type MauOfficeSceneConfig,
  type MauOfficeZoneId,
} from "../mau-office-scene.ts";

const ROOM_ORDER: Array<MauOfficeRoomId | "all"> = ["all", ...MAU_OFFICE_ROOM_IDS];
const RECENT_BUBBLE_WINDOW_MS = 9_000;
const MAU_OFFICE_CARD_PADDING_PX = 36;
const MAU_OFFICE_VIEWPORT_GUTTER_PX = 96;
const MAU_OFFICE_EDITOR_RAIL_GUTTER_PX = 84;
const MAU_OFFICE_EDITOR_TOOL_PANEL_GUTTER_PX = 352;
const MAU_OFFICE_EDITOR_SELECTION_PANEL_GUTTER_PX = 276;
const MAU_OFFICE_EDITOR_PANEL_MARGIN_PX = 12;
const MAU_OFFICE_MAX_FULL_SCENE_SCALE = 1;
const MAU_OFFICE_MAX_ROOM_SCALE = 1.25;
const MAU_OFFICE_MIN_CAMERA_SCALE = 0.25;
const MAU_OFFICE_CAMERA_SCALE_STEP = 0.25;
const MAU_OFFICE_WORKER_BUBBLE_CLEARANCE_PX = 5;
const MAU_OFFICE_WORKER_HISTORY_CLEARANCE_PX = 20;
const PIXEL_TEXT_GLYPH_WIDTH_RATIO = 0.78;
const BUBBLE_SIZE_STEP_PX = 8;
const BUBBLE_TEXT_SIDE_PADDING_PX = 20;
const BUBBLE_TEXT_TOP_PADDING_PX = 16;
const BUBBLE_TEXT_BOTTOM_PADDING_PX = 16;
const BUBBLE_TEXT_FONT_PX = 8;
const BUBBLE_TEXT_LINE_HEIGHT = 1.15;
const HISTORY_TEXT_SIDE_PADDING_PX = 24;
const HISTORY_TEXT_TOP_PADDING_PX = 20;
const HISTORY_TEXT_BOTTOM_PADDING_PX = 24;
const HISTORY_TEXT_GAP_PX = 4;
const HISTORY_LABEL_FONT_PX = 10;
const HISTORY_LABEL_LINE_HEIGHT = 1.1;
const HISTORY_BODY_FONT_PX = 9;
const HISTORY_BODY_LINE_HEIGHT = 1.15;
const BUBBLE_FRAME_ORDER = [
  ["r1c1", "top-left"],
  ["r1c2", "top"],
  ["r1c3", "top-right"],
  ["r2c1", "left"],
  ["r2c2", "center"],
  ["r2c3", "right"],
  ["r3c1", "bottom-left"],
  ["r3c2", "bottom"],
  ["r3c3", "bottom-right"],
] as const;

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ResponsiveTextBox = {
  text: string;
  widthPx: number;
  heightPx: number;
  lineClamp: number;
};

type WorkerRenderPlacement = {
  x: number;
  y: number;
  facing: MauOfficeDirection;
  anchor?: MauOfficeAnchor;
};

const ZONE_OPTIONS: MauOfficeZoneId[] = ["desk", "meeting", "break", "support", "hall", "outside"];

const MARKER_ROLE_OPTIONS: MauOfficeMarkerRole[] = [
  "spawn.office",
  "spawn.support",
  "desk.board",
  "desk.workerSeat",
  "meeting.presenter",
  "meeting.seat",
  "support.staff",
  "support.customer",
  "break.arcade",
  "break.snack",
  "break.volley",
  "break.tableSeat",
  "break.chase",
  "break.game",
  "break.jukebox",
  "break.reading",
];

const FLOOR_PROP_ITEMS = Object.values(MAU_OFFICE_CATALOG).filter((item) => !item.autotileMode);
const AUTOTILE_ITEMS = Object.values(MAU_OFFICE_CATALOG).filter((item) =>
  Boolean(item.autotileMode),
);
const EDITOR_TOOL_ORDER: MauOfficeEditorTool[] = [
  "select",
  "zone",
  "wall",
  "autotile",
  "prop",
  "marker",
];

const EDITOR_TOOL_LABELS: Record<MauOfficeEditorTool, string> = {
  select: "Select",
  zone: "Floors",
  wall: "Walls",
  autotile: "Brushes",
  prop: "Items",
  marker: "Markers",
};

const EDITOR_TOOL_ICONS: Record<MauOfficeEditorTool, keyof typeof icons> = {
  select: "cursor",
  zone: "layoutGrid",
  wall: "bricks",
  autotile: "penLine",
  prop: "image",
  marker: "pin",
};

const EDITOR_BRUSH_MODE_ICONS: Record<MauOfficeEditorBrushMode, keyof typeof icons> = {
  paint: "plus",
  erase: "trash",
};

export type MauOfficeProps = {
  loading: boolean;
  error: string | null;
  state: MauOfficeState;
  basePath: string;
  editor?: {
    open: boolean;
    draft: MauOfficeSceneConfig;
    compiled: CompiledMauOfficeScene;
    tool: MauOfficeEditorTool;
    toolPanelOpen?: boolean;
    brushMode: MauOfficeEditorBrushMode;
    zoneBrush: MauOfficeZoneId;
    propItemId: string;
    autotileItemId: string;
    markerRole: MauOfficeMarkerRole;
    selection: MauOfficeEditorSelection;
    dragSelection?: MauOfficeEditorSelection;
    hoverTileX?: number | null;
    hoverTileY?: number | null;
    validationErrors: string[];
    saveError?: string | null;
    saving?: boolean;
    canUndo?: boolean;
    canRedo?: boolean;
    undoShortcutLabel?: string;
    redoShortcutLabel?: string;
    onToggle: () => void;
    onCancel: () => void;
    onApply: () => void;
    onSave: () => void;
    onToolChange: (tool: MauOfficeEditorTool) => void;
    onBrushModeChange: (mode: MauOfficeEditorBrushMode) => void;
    onZoneBrushChange: (zone: MauOfficeZoneId) => void;
    onPropItemChange: (itemId: string) => void;
    onAutotileItemChange: (itemId: string) => void;
    onMarkerRoleChange: (role: MauOfficeMarkerRole) => void;
    onCellInteract: (
      tileX: number,
      tileY: number,
      kind: "down" | "enter" | "click",
      buttons: number,
    ) => void;
    onHoverTileChange?: (tileX: number | null, tileY: number | null) => void;
    onSelectionChange: (selection: MauOfficeEditorSelection) => void;
    onSelectionDragStart?: (selection: MauOfficeEditorSelection) => void;
    onSelectionDragEnd?: (tileX: number | null, tileY: number | null) => void;
    onCanvasResize?: (width: number, height: number) => void;
    onClearSelection?: () => void;
    onSelectionPatch: (patch: Record<string, unknown>) => void;
    onUndo: () => void;
    onRedo: () => void;
    onDeleteSelection: () => void;
  };
  chatWindow?: MauOfficeChatWindowState | null;
  onRefresh: () => void;
  onRoomFocus: (roomId: MauOfficeRoomId | "all") => void;
  onActorOpen: (actorId: string) => void;
  onChatClose?: () => void;
  onChatToggleMinimized?: () => void;
  onChatDraftChange?: (next: string) => void;
  onChatSend?: () => void;
  onChatAbort?: () => void;
  onChatPositionChange?: (position: { x: number; y: number }) => void;
};

export type MauOfficeChatWindowState = {
  open: boolean;
  minimized: boolean;
  actorId: string | null;
  actorLabel: string;
  sessionKey: string;
  loading: boolean;
  sending: boolean;
  draft: string;
  messages: unknown[];
  stream: string | null;
  streamStartedAt: number | null;
  error: string | null;
  position: { x: number | null; y: number | null };
};

function isNarrowViewport(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 900px)").matches
  );
}

function isMobileOfficeChatViewport(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 900px)").matches
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatChatTimestamp(value: number | null | undefined): string {
  if (typeof value !== "number") {
    return "";
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function resolveOfficeChatDock(
  position: { x: number | null; y: number | null } | undefined,
): "left" | "right" {
  const width = typeof window !== "undefined" ? window.innerWidth : 1280;
  const x = position?.x ?? width;
  return x > width / 2 ? "right" : "left";
}

function resolveOfficeChatWindowStyle(
  chatWindow: MauOfficeChatWindowState,
): Record<string, string> {
  if (isMobileOfficeChatViewport()) {
    return {};
  }
  const margin = 20;
  const width = chatWindow.minimized ? 300 : 420;
  const height = chatWindow.minimized ? 64 : 620;
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1440;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 900;
  const maxX = Math.max(margin, viewportWidth - width - margin);
  const maxY = Math.max(margin, viewportHeight - height - margin);
  const defaultX = maxX;
  const defaultY = Math.max(margin, viewportHeight - height - 28);
  const x = clamp(chatWindow.position.x ?? defaultX, margin, maxX);
  const y = clamp(chatWindow.position.y ?? defaultY, margin, maxY);
  if (chatWindow.minimized) {
    const dock = resolveOfficeChatDock(chatWindow.position);
    return dock === "left"
      ? { left: `${margin}px`, bottom: `${margin}px` }
      : { right: `${margin}px`, bottom: `${margin}px` };
  }
  return {
    left: `${x}px`,
    top: `${y}px`,
  };
}

function startOfficeChatDrag(
  event: PointerEvent,
  chatWindow: MauOfficeChatWindowState,
  onPositionChange?: (position: { x: number; y: number }) => void,
) {
  if (!onPositionChange || isMobileOfficeChatViewport() || chatWindow.minimized) {
    return;
  }
  const handle = event.currentTarget as HTMLElement | null;
  const panel = handle?.closest<HTMLElement>(".mau-office-chat");
  if (!handle || !panel) {
    return;
  }
  const margin = 20;
  const snapThreshold = 28;
  const panelWidth = panel.offsetWidth || 420;
  const panelHeight = panel.offsetHeight || 620;
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1440;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 900;
  const maxX = Math.max(margin, viewportWidth - panelWidth - margin);
  const maxY = Math.max(margin, viewportHeight - panelHeight - margin);
  const startX = event.clientX;
  const startY = event.clientY;
  const currentStyle = resolveOfficeChatWindowStyle(chatWindow);
  const initialLeft = Number.parseFloat(currentStyle.left ?? String(maxX));
  const initialTop = Number.parseFloat(currentStyle.top ?? String(maxY));
  document.body.style.userSelect = "none";
  const cleanup = () => {
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", handleMove);
    window.removeEventListener("pointerup", handleUp);
  };
  const handleMove = (moveEvent: PointerEvent) => {
    const rawX = initialLeft + (moveEvent.clientX - startX);
    const rawY = initialTop + (moveEvent.clientY - startY);
    let nextX = clamp(rawX, margin, maxX);
    if (nextX - margin <= snapThreshold) {
      nextX = margin;
    } else if (maxX - nextX <= snapThreshold) {
      nextX = maxX;
    }
    const nextY = clamp(rawY, margin, maxY);
    onPositionChange({ x: nextX, y: nextY });
  };
  const handleUp = () => cleanup();
  window.addEventListener("pointermove", handleMove);
  window.addEventListener("pointerup", handleUp);
}

function resolveOfficeChatMessageText(message: unknown): string {
  const text = extractText(message)?.trim();
  if (text) {
    return text;
  }
  const normalized = normalizeMessage(message);
  if (normalized.content.some((item) => item.type === "image")) {
    return t("dashboard.mauOffice.chat.image");
  }
  const role = normalizeRoleForGrouping(normalized.role);
  if (role === "tool") {
    return t("dashboard.mauOffice.chat.toolOutput");
  }
  return t("dashboard.mauOffice.chat.message");
}

function renderOfficeChatWindow(props: MauOfficeProps, actor: OfficeActor | null) {
  const chatWindow = props.chatWindow;
  if (!chatWindow?.open) {
    return nothing;
  }
  const mobile = isMobileOfficeChatViewport();
  const minimized = !mobile && chatWindow.minimized;
  const title =
    (actor?.label ?? chatWindow.actorLabel) || t("dashboard.mauOffice.chat.sessionTitle");
  const subtitle = actor
    ? `${actor.currentActivity.label} · ${chatWindow.sessionKey}`
    : chatWindow.sessionKey;
  const canSend = Boolean(chatWindow.draft.trim()) && !chatWindow.sending && !chatWindow.stream;
  const threadItems = chatWindow.messages.slice(-80);
  return html`
    <section
      class="mau-office-chat ${minimized ? "mau-office-chat--minimized" : ""} ${mobile ? "mau-office-chat--mobile" : ""}"
      style=${styleMap(resolveOfficeChatWindowStyle(chatWindow))}
      aria-label=${t("dashboard.mauOffice.chat.ariaLabel")}
    >
      <header class="mau-office-chat__header">
        <button
          class="mau-office-chat__drag"
          type="button"
          @pointerdown=${(event: PointerEvent) =>
            startOfficeChatDrag(event, chatWindow, props.onChatPositionChange)}
        >
          <span class="mau-office-chat__title">${title}</span>
          <span class="mau-office-chat__subtitle">${subtitle}</span>
        </button>
        <div class="mau-office-chat__actions">
          ${
            mobile
              ? nothing
              : html`
                <button
                  class="btn btn--ghost btn--icon"
                  type="button"
                  aria-label=${
                    minimized
                      ? t("dashboard.mauOffice.chat.expand")
                      : t("dashboard.mauOffice.chat.minimize")
                  }
                  @click=${() => props.onChatToggleMinimized?.()}
                >
                  ${minimized ? icons.maximize : icons.minimize}
                </button>
              `
          }
          <button
            class="btn btn--ghost btn--icon"
            type="button"
            aria-label=${t("dashboard.mauOffice.chat.close")}
            @click=${() => props.onChatClose?.()}
          >
            ${icons.x}
          </button>
        </div>
      </header>

      ${
        minimized
          ? nothing
          : html`
            ${
              chatWindow.error
                ? html`<div class="callout danger mau-office-chat__error">${chatWindow.error}</div>`
                : nothing
            }
            <div
              class="mau-office-chat__thread"
              ${ref((element) => {
                if (!(element instanceof HTMLElement)) {
                  return;
                }
                requestAnimationFrame(() => {
                  element.scrollTop = element.scrollHeight;
                });
              })}
            >
              ${
                chatWindow.loading
                  ? html`<div class="mau-office-chat__empty">${t("dashboard.mauOffice.chat.loading")}</div>`
                  : threadItems.length === 0 && !chatWindow.stream
                    ? html`<div class="mau-office-chat__empty">${t("dashboard.mauOffice.chat.empty")}</div>`
                    : nothing
              }
              ${repeat(
                threadItems,
                (_message, index) => `${chatWindow.sessionKey}:${index}`,
                (message) => {
                  const normalized = normalizeMessage(message);
                  const role = normalizeRoleForGrouping(normalized.role);
                  const roleClass =
                    role === "assistant"
                      ? "assistant"
                      : role === "user" || role === "User"
                        ? "user"
                        : role === "tool"
                          ? "tool"
                          : "system";
                  return html`
                    <article class="mau-office-chat__message mau-office-chat__message--${roleClass}">
                      <div class="mau-office-chat__message-role">${t(`dashboard.mauOffice.chat.role.${roleClass}`)}</div>
                      <div class="mau-office-chat__message-body">
                        ${resolveOfficeChatMessageText(message)}
                      </div>
                      <div class="mau-office-chat__message-time">
                        ${formatChatTimestamp(normalized.timestamp)}
                      </div>
                    </article>
                  `;
                },
              )}
              ${
                chatWindow.stream
                  ? html`
                    <article class="mau-office-chat__message mau-office-chat__message--assistant">
                      <div class="mau-office-chat__message-role">${t("dashboard.mauOffice.chat.role.assistant")}</div>
                      <div class="mau-office-chat__message-body">${chatWindow.stream}</div>
                      <div class="mau-office-chat__message-time">
                        ${formatChatTimestamp(chatWindow.streamStartedAt ?? Date.now())}
                      </div>
                    </article>
                  `
                  : nothing
              }
            </div>
            <div class="mau-office-chat__composer">
              <textarea
                class="mau-office-chat__input"
                .value=${chatWindow.draft}
                rows="2"
                placeholder=${t("dashboard.mauOffice.chat.placeholder")}
                ?disabled=${chatWindow.sending}
                @input=${(event: Event) =>
                  props.onChatDraftChange?.((event.target as HTMLTextAreaElement).value)}
                @keydown=${(event: KeyboardEvent) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (chatWindow.stream) {
                      props.onChatAbort?.();
                      return;
                    }
                    if (canSend) {
                      props.onChatSend?.();
                    }
                  }
                }}
              ></textarea>
              <div class="mau-office-chat__composer-actions">
                <button
                  class="btn btn--ghost"
                  type="button"
                  ?disabled=${!chatWindow.stream}
                  @click=${() => props.onChatAbort?.()}
                >
                  ${t("dashboard.mauOffice.chat.stop")}
                </button>
                <button
                  class="btn"
                  type="button"
                  ?disabled=${!canSend}
                  @click=${() => props.onChatSend?.()}
                >
                  ${t("dashboard.mauOffice.chat.send")}
                </button>
              </div>
            </div>
          `
      }
    </section>
  `;
}

function resolveViewportAvailableWidth(): number {
  if (typeof document !== "undefined") {
    const card = document.querySelector(".mau-office");
    if (card instanceof HTMLElement && card.clientWidth > MAU_OFFICE_CARD_PADDING_PX) {
      return card.clientWidth - MAU_OFFICE_CARD_PADDING_PX;
    }

    const documentWidth = document.documentElement?.clientWidth ?? 0;
    if (documentWidth > MAU_OFFICE_VIEWPORT_GUTTER_PX) {
      return documentWidth - MAU_OFFICE_VIEWPORT_GUTTER_PX;
    }
  }

  if (typeof window !== "undefined" && window.innerWidth > MAU_OFFICE_VIEWPORT_GUTTER_PX) {
    return window.innerWidth - MAU_OFFICE_VIEWPORT_GUTTER_PX;
  }

  return 800;
}

function labelForRoom(scene: CompiledMauOfficeScene, roomId: MauOfficeRoomId | "all"): string {
  return roomId === "all" ? t("dashboard.mauOffice.allRooms") : scene.rooms[roomId].label;
}

function resolveEffectiveRoomFocus(state: MauOfficeState): MauOfficeRoomId | "all" {
  if (!isNarrowViewport()) {
    return state.roomFocus;
  }
  return state.roomFocus === "all" ? "desk" : state.roomFocus;
}

function cropForFocus(scene: CompiledMauOfficeScene, roomFocus: MauOfficeRoomId | "all"): Rect {
  if (roomFocus === "all") {
    return { x: 0, y: 0, width: scene.width, height: scene.height };
  }
  const room = scene.rooms[roomFocus];
  const padding = MAU_OFFICE_FOCUS_PADDING_TILES * scene.tileSize;
  const x = clamp(room.x - padding, 0, scene.width);
  const y = clamp(room.y - padding, 0, scene.height);
  return {
    x,
    y,
    width: Math.min(room.width + padding * 2, scene.width - x),
    height: Math.min(room.height + padding * 2, scene.height - y),
  };
}

function isActorVisibleInFocus(
  scene: CompiledMauOfficeScene,
  actor: OfficeActor,
  roomFocus: MauOfficeRoomId | "all",
): boolean {
  if (roomFocus === "all") {
    return true;
  }
  if (actor.currentRoomId === roomFocus || actor.queuedActivity?.roomId === roomFocus) {
    return true;
  }
  if (actor.path?.nodeIds.some((nodeId) => scene.nodes[nodeId]?.roomId === roomFocus)) {
    return true;
  }
  return scene.anchors[actor.anchorId]?.roomId === roomFocus;
}

function hasActiveSupportPresentation(actor: OfficeActor): boolean {
  return (
    actor.currentActivity.kind === "customer_support" ||
    actor.queuedActivity?.kind === "customer_support" ||
    actor.pendingActivity?.kind === "customer_support"
  );
}

function resolveLatestBubble(actor: OfficeActor, nowMs: number): OfficeBubbleEntry | null {
  const bubble =
    actor.bubbles.find(
      (entry) =>
        nowMs - entry.atMs <= RECENT_BUBBLE_WINDOW_MS &&
        (entry.kind !== "customer_support" || hasActiveSupportPresentation(actor)),
    ) ?? null;
  const supportDialogue = resolveLatestSupportDialogueBubble(actor, nowMs);
  if (supportDialogue) {
    return supportDialogue;
  }
  if (!bubble) {
    return null;
  }
  return nowMs - bubble.atMs <= RECENT_BUBBLE_WINDOW_MS ? bubble : null;
}

function resolveMostRecentBubble(actor: OfficeActor): OfficeBubbleEntry | null {
  return (
    actor.bubbles.find(
      (entry) => entry.kind !== "customer_support" || hasActiveSupportPresentation(actor),
    ) ?? null
  );
}

function resolveSupportDialogueText(actor: OfficeActor, nowMs: number): string | null {
  if (!hasActiveSupportPresentation(actor)) {
    return null;
  }
  const dialogue = actor.latestSupportDialogue;
  if (!dialogue) {
    return null;
  }
  if (dialogue.updatedAtMs < nowMs - MAU_OFFICE_SUPPORT_DIALOGUE_WINDOW_MS) {
    return null;
  }
  if (actor.kind === "visitor" && dialogue.role !== "user") {
    return null;
  }
  if (actor.kind !== "visitor" && dialogue.role !== "assistant") {
    return null;
  }
  return dialogue.text;
}

function resolveLatestSupportDialogueBubble(
  actor: OfficeActor,
  nowMs: number,
): OfficeBubbleEntry | null {
  const text = resolveSupportDialogueText(actor, nowMs);
  const dialogue = actor.latestSupportDialogue;
  if (!text || !dialogue || dialogue.updatedAtMs < nowMs - RECENT_BUBBLE_WINDOW_MS) {
    return null;
  }
  return {
    id: `support-dialogue:${actor.id}:${dialogue.updatedAtMs}`,
    text,
    atMs: dialogue.updatedAtMs,
    kind: "customer_support",
  };
}

function resolveStaticFacing(
  actor: OfficeActor,
  anchor: MauOfficeAnchor | undefined,
): MauOfficeDirection {
  return anchor?.facingOverride ?? actor.facing;
}

function resolveAnimationFrame(
  seed: string,
  animation: { fps: number; frames: string[] },
  nowMs: number,
): string {
  const frameMs = 1000 / Math.max(1, animation.fps);
  let phaseSeed = 0;
  for (const char of seed) {
    phaseSeed = (phaseSeed * 33 + char.charCodeAt(0)) >>> 0;
  }
  const phaseOffsetMs = Math.floor((phaseSeed % animation.frames.length) * frameMs);
  const frameIndex = Math.floor((nowMs + phaseOffsetMs) / frameMs) % animation.frames.length;
  return animation.frames[frameIndex] ?? animation.frames[0]!;
}

function resolveWorkerSprite(
  scene: CompiledMauOfficeScene,
  actor: OfficeActor,
  basePath: string,
  nowMs: number,
  placement: WorkerRenderPlacement,
): string {
  const anchor = placement.anchor ?? scene.anchors[actor.anchorId];
  const animationId = resolveWorkerAnimationId(actor, anchor);
  const animation = resolveMauOfficeWorkerAnimation(actor.rigId, animationId, placement.facing);
  return resolveMauOfficeAssetUrl(basePath, resolveAnimationFrame(actor.id, animation, nowMs));
}

function resolveWorkerAnimationId(
  actor: OfficeActor,
  anchor: MauOfficeAnchor | undefined,
): MauOfficeWorkerAnimationId {
  if (actor.path) {
    return "walk";
  }
  return actor.animationId ?? (anchor?.pose === "sit" ? "sit" : "stand");
}

function formatWorkerAnimationPlaceholderLabel(animationId: MauOfficeWorkerAnimationId): string {
  return animationId.toUpperCase().replaceAll("-", " ");
}

function resolvePassingBallPhase(
  participantCount: number,
  nowMs: number,
): { beatIndex: number; nextIndex: number; beatProgress: number } {
  const cycleCount = Math.max(1, participantCount);
  const beatProgress = (nowMs % MAU_OFFICE_PASSING_BALL_BEAT_MS) / MAU_OFFICE_PASSING_BALL_BEAT_MS;
  const beatIndex = Math.floor(nowMs / MAU_OFFICE_PASSING_BALL_BEAT_MS) % cycleCount;
  return {
    beatIndex,
    nextIndex: (beatIndex + 1) % cycleCount,
    beatProgress,
  };
}

function resolveIdleSlotAnchor(
  scene: CompiledMauOfficeScene,
  actor: OfficeActor,
  participantIndex: number,
): MauOfficeAnchor | null {
  const slotAnchorId = actor.idleAssignment?.slotAnchorIds[participantIndex];
  if (!slotAnchorId) {
    return null;
  }
  return scene.anchors[slotAnchorId] ?? null;
}

function resolveIdleWorkerPlacement(
  scene: CompiledMauOfficeScene,
  actor: OfficeActor,
  nowMs: number,
): WorkerRenderPlacement | null {
  const anchor = scene.anchors[actor.anchorId];
  if (!anchor || !actor.idleAssignment) {
    return null;
  }
  const participantIndex = actor.idleAssignment.participantIds.indexOf(actor.id);
  if (participantIndex < 0) {
    return null;
  }

  if (
    actor.idleAssignment.packageId === "passing_ball_court" &&
    actor.idleAssignment.participantIds.length >= 4
  ) {
    const slotAnchor = resolveIdleSlotAnchor(scene, actor, participantIndex) ?? anchor;
    if (!slotAnchor) {
      return null;
    }
    const phase = resolvePassingBallPhase(actor.idleAssignment.participantIds.length, nowMs);
    const jumpPx =
      participantIndex === phase.beatIndex
        ? Math.round(Math.sin(phase.beatProgress * Math.PI) * 22)
        : 0;
    return {
      x: slotAnchor.x,
      y: slotAnchor.y - jumpPx,
      facing: resolveStaticFacing(actor, slotAnchor),
      anchor: slotAnchor,
    };
  }

  if (
    actor.idleAssignment.packageId === "chasing_loop" &&
    actor.idleAssignment.participantIds.length >= 3
  ) {
    const slotAnchors = actor.idleAssignment.slotAnchorIds
      .map((anchorId) => scene.anchors[anchorId])
      .filter((entry): entry is MauOfficeAnchor => Boolean(entry));
    if (slotAnchors.length >= 3) {
      const centerX = slotAnchors.reduce((sum, entry) => sum + entry.x, 0) / slotAnchors.length;
      const centerY = slotAnchors.reduce((sum, entry) => sum + entry.y, 0) / slotAnchors.length;
      const radiusX = Math.max(
        36,
        Math.max(...slotAnchors.map((entry) => Math.abs(entry.x - centerX))) + 20,
      );
      const radiusY = Math.max(
        20,
        Math.max(...slotAnchors.map((entry) => Math.abs(entry.y - centerY))) + 12,
      );
      const orbitPhase =
        ((nowMs % MAU_OFFICE_CHASING_LOOP_CYCLE_MS) / MAU_OFFICE_CHASING_LOOP_CYCLE_MS +
          participantIndex / actor.idleAssignment.participantIds.length) %
        1;
      const angle = orbitPhase * Math.PI * 2 - Math.PI / 2;
      const x = Math.round(centerX + Math.cos(angle) * radiusX);
      const y = Math.round(centerY + Math.sin(angle) * radiusY);
      const tangent = {
        x: x + Math.round(-Math.sin(angle) * 16),
        y: y + Math.round(Math.cos(angle) * 10),
      };
      return {
        x,
        y,
        facing: directionBetween({ x, y }, tangent),
        anchor,
      };
    }
  }

  return null;
}

function resolveWorkerPlacement(
  scene: CompiledMauOfficeScene,
  actor: OfficeActor,
  nowMs: number,
): WorkerRenderPlacement {
  const anchor = scene.anchors[actor.anchorId];
  return (
    resolveIdleWorkerPlacement(scene, actor, nowMs) ?? {
      x: actor.x,
      y: actor.y,
      facing: actor.path ? actor.facing : resolveStaticFacing(actor, anchor),
      anchor,
    }
  );
}

function setWorkerSpriteFallback(event: Event, visible: boolean) {
  const target = event.currentTarget;
  if (!(target instanceof HTMLImageElement)) {
    return;
  }
  const worker = target.closest(".mau-office__worker");
  if (!(worker instanceof HTMLElement)) {
    return;
  }
  worker.classList.toggle("mau-office__worker--fallback", visible);
}

function directionBetween(
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

function positionForTile(scene: CompiledMauOfficeScene, tile: MauOfficeTilePlacement) {
  return styleMap({
    left: `${tile.tileX * scene.tileSize}px`,
    top: `${tile.tileY * scene.tileSize}px`,
    width: `${scene.tileSize}px`,
    height: `${scene.tileSize}px`,
  });
}

function positionForSprite(scene: CompiledMauOfficeScene, sprite: MauOfficeSpritePlacement) {
  const width = sprite.tileWidth * scene.tileSize;
  const height = sprite.tileHeight * scene.tileSize;
  const bottomPx = Math.round((sprite.tileY + sprite.tileHeight) * scene.tileSize);
  const wallPlaneBottomPx =
    sprite.mount === "wall" && sprite.kind !== "wall"
      ? Math.round((Math.floor(sprite.tileY) + 3) * scene.tileSize) + 1
      : bottomPx;
  const renderBottomPx = Math.max(bottomPx, wallPlaneBottomPx);
  const zBase =
    sprite.mount === "underlay" ? 10 : sprite.mount === "wall" || sprite.layer === "wall" ? 60 : 30;
  if (sprite.anchor === "bottom-center") {
    return styleMap({
      left: `${(sprite.tileX + sprite.tileWidth / 2) * scene.tileSize}px`,
      top: `${(sprite.tileY + sprite.tileHeight) * scene.tileSize}px`,
      width: `${width}px`,
      height: `${height}px`,
      transform: `${sprite.mirrored ? "translate(-50%, -100%) scaleX(-1)" : "translate(-50%, -100%)"}`,
      zIndex: String(zBase + renderBottomPx + (sprite.zOffset ?? 0)),
    });
  }
  return styleMap({
    left: `${sprite.tileX * scene.tileSize}px`,
    top: `${sprite.tileY * scene.tileSize}px`,
    width: `${width}px`,
    height: `${height}px`,
    transform: sprite.mirrored ? "scaleX(-1)" : undefined,
    transformOrigin: sprite.mirrored ? "center" : undefined,
    zIndex: String(zBase + renderBottomPx + (sprite.zOffset ?? 0)),
  });
}

function positionForWorker(
  placement: WorkerRenderPlacement,
  anchor: MauOfficeAnchor | undefined,
  animationId: MauOfficeWorkerAnimationId,
) {
  const pose =
    animationId === "sleep-floor" ? "sleepFloor" : animationId === "sit" ? "sit" : "stand";
  const metrics = MAU_OFFICE_WORKER_RENDER_METRICS;
  return styleMap({
    left: `${placement.x}px`,
    top: `${placement.y}px`,
    width: `${metrics.logicalWidthPx}px`,
    height: `${metrics.logicalHeightPx}px`,
    transform: `translate(-50%, calc(-100% + ${metrics.poseOffsetYPx[pose]}px))`,
    zIndex: String(70 + Math.round(placement.y) + (anchor?.layer ?? 0)),
  });
}

function positionForWorkerOverlay(placement: WorkerRenderPlacement) {
  return styleMap({
    left: `${placement.x}px`,
    top: `${placement.y}px`,
    zIndex: String(1400 + Math.round(placement.y)),
  });
}

function resolveVisibleLineClamp(
  heightPx: number,
  topPaddingPx: number,
  bottomPaddingPx: number,
  fontPx: number,
  lineHeight: number,
): number {
  const usableHeightPx = Math.max(0, heightPx - topPaddingPx - bottomPaddingPx);
  const lineHeightPx = fontPx * lineHeight;
  return Math.max(1, Math.floor(usableHeightPx / lineHeightPx));
}

function roundUpToStep(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

function estimateTextWidth(text: string, fontPx: number): number {
  return text.trim().length * fontPx * PIXEL_TEXT_GLYPH_WIDTH_RATIO;
}

function wrapTextLineCount(text: string, charsPerLine: number): number {
  if (charsPerLine <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  const words = text.trim().replace(/\s+/gu, " ").split(" ").filter(Boolean);
  if (words.length === 0) {
    return 1;
  }
  let lines = 1;
  let currentLineLength = 0;
  for (const rawWord of words) {
    let word = rawWord;
    if (currentLineLength > 0 && currentLineLength + 1 + word.length <= charsPerLine) {
      currentLineLength += 1 + word.length;
      continue;
    }
    if (currentLineLength > 0) {
      lines += 1;
      currentLineLength = 0;
    }
    while (word.length > charsPerLine) {
      lines += 1;
      word = word.slice(charsPerLine);
    }
    currentLineLength = Math.max(1, word.length);
  }
  return lines;
}

function resolveResponsiveTextBox(options: {
  text: string;
  minWidthPx: number;
  maxWidthPx: number;
  minHeightPx: number;
  maxHeightPx: number;
  paddingXPx: number;
  paddingTopPx: number;
  paddingBottomPx: number;
  fontPx: number;
  lineHeight: number;
  minTargetWidthPx?: number;
}): ResponsiveTextBox {
  const normalized = options.text.trim();
  const lineHeightPx = options.fontPx * options.lineHeight;
  const charWidthPx = options.fontPx * PIXEL_TEXT_GLYPH_WIDTH_RATIO;
  const minLineClamp = resolveVisibleLineClamp(
    options.minHeightPx,
    options.paddingTopPx,
    options.paddingBottomPx,
    options.fontPx,
    options.lineHeight,
  );
  const startWidthPx = clamp(
    roundUpToStep(Math.max(options.minWidthPx, options.minTargetWidthPx ?? 0), BUBBLE_SIZE_STEP_PX),
    options.minWidthPx,
    options.maxWidthPx,
  );

  for (let widthPx = startWidthPx; widthPx <= options.maxWidthPx; widthPx += BUBBLE_SIZE_STEP_PX) {
    const innerWidthPx = Math.max(1, widthPx - options.paddingXPx * 2);
    const charsPerLine = Math.max(1, Math.floor(innerWidthPx / charWidthPx));
    if (wrapTextLineCount(normalized, charsPerLine) <= minLineClamp) {
      return {
        text: normalized,
        widthPx,
        heightPx: options.minHeightPx,
        lineClamp: minLineClamp,
      };
    }
  }

  const innerWidthPx = Math.max(1, options.maxWidthPx - options.paddingXPx * 2);
  const charsPerLine = Math.max(1, Math.floor(innerWidthPx / charWidthPx));
  const lineCount = wrapTextLineCount(normalized, charsPerLine);
  const heightPx = clamp(
    Math.ceil(options.paddingTopPx + options.paddingBottomPx + lineCount * lineHeightPx),
    options.minHeightPx,
    options.maxHeightPx,
  );
  return {
    text: normalized,
    widthPx: options.maxWidthPx,
    heightPx,
    lineClamp: resolveVisibleLineClamp(
      heightPx,
      options.paddingTopPx,
      options.paddingBottomPx,
      options.fontPx,
      options.lineHeight,
    ),
  };
}

function resolveHistoryBodyLineClamp(heightPx: number): number {
  const labelHeightPx = HISTORY_LABEL_FONT_PX * HISTORY_LABEL_LINE_HEIGHT;
  const usableHeightPx =
    heightPx -
    HISTORY_TEXT_TOP_PADDING_PX -
    HISTORY_TEXT_BOTTOM_PADDING_PX -
    HISTORY_TEXT_GAP_PX -
    labelHeightPx;
  const bodyLineHeightPx = HISTORY_BODY_FONT_PX * HISTORY_BODY_LINE_HEIGHT;
  return Math.max(1, Math.floor(Math.max(0, usableHeightPx) / bodyLineHeightPx));
}

function resolveBubbleBox(text: string): {
  text: string;
  widthPx: number;
  heightPx: number;
  lineClamp: number;
} {
  const bubble = MAU_OFFICE_WORKER_RENDER_METRICS.bubble;
  return resolveResponsiveTextBox({
    text,
    minWidthPx: bubble.minWidthPx,
    maxWidthPx: bubble.maxWidthPx,
    minHeightPx: bubble.minHeightPx,
    maxHeightPx: bubble.maxHeightPx,
    paddingXPx: BUBBLE_TEXT_SIDE_PADDING_PX,
    paddingTopPx: BUBBLE_TEXT_TOP_PADDING_PX,
    paddingBottomPx: BUBBLE_TEXT_BOTTOM_PADDING_PX,
    fontPx: BUBBLE_TEXT_FONT_PX,
    lineHeight: BUBBLE_TEXT_LINE_HEIGHT,
  });
}

function positionForWorkerBubble(box: ReturnType<typeof resolveBubbleBox>) {
  const bubble = MAU_OFFICE_WORKER_RENDER_METRICS.bubble;
  return styleMap({
    left: "50%",
    bottom: `${MAU_OFFICE_WORKER_RENDER_METRICS.logicalHeightPx + MAU_OFFICE_WORKER_BUBBLE_CLEARANCE_PX}px`,
    width: `${box.widthPx}px`,
    height: `${box.heightPx}px`,
    transform: `translate(-50%, ${bubble.offsetYPx}px)`,
    "--mau-bubble-lines": String(box.lineClamp),
  });
}

function resolveHistoryBox(title: string, summary: string): ResponsiveTextBox {
  const history = MAU_OFFICE_WORKER_RENDER_METRICS.history;
  return resolveResponsiveTextBox({
    text: summary,
    minWidthPx: history.minWidthPx,
    maxWidthPx: history.maxWidthPx,
    minHeightPx: history.minHeightPx,
    maxHeightPx: history.maxHeightPx,
    paddingXPx: HISTORY_TEXT_SIDE_PADDING_PX,
    paddingTopPx:
      HISTORY_TEXT_TOP_PADDING_PX +
      HISTORY_TEXT_GAP_PX +
      HISTORY_LABEL_FONT_PX * HISTORY_LABEL_LINE_HEIGHT,
    paddingBottomPx: HISTORY_TEXT_BOTTOM_PADDING_PX,
    fontPx: HISTORY_BODY_FONT_PX,
    lineHeight: HISTORY_BODY_LINE_HEIGHT,
    minTargetWidthPx:
      HISTORY_TEXT_SIDE_PADDING_PX * 2 + estimateTextWidth(title, HISTORY_LABEL_FONT_PX),
  });
}

function positionForWorkerHistory(box: ResponsiveTextBox) {
  const history = MAU_OFFICE_WORKER_RENDER_METRICS.history;
  return styleMap({
    left: "50%",
    bottom: `${MAU_OFFICE_WORKER_RENDER_METRICS.logicalHeightPx + MAU_OFFICE_WORKER_HISTORY_CLEARANCE_PX}px`,
    width: `${box.widthPx}px`,
    height: `${box.heightPx}px`,
    transform: `translate(-50%, ${history.offsetYPx}px)`,
    "--mau-history-lines": String(resolveHistoryBodyLineClamp(box.heightPx)),
  });
}

function viewportStyle(
  scene: CompiledMauOfficeScene,
  crop: Rect,
  chrome: { leftGutterPx: number; rightGutterPx: number } = {
    leftGutterPx: 0,
    rightGutterPx: 0,
  },
) {
  const maxScale =
    crop.width >= scene.width ? MAU_OFFICE_MAX_FULL_SCENE_SCALE : MAU_OFFICE_MAX_ROOM_SCALE;
  const availableSceneWidth = Math.max(
    resolveViewportAvailableWidth() - chrome.leftGutterPx - chrome.rightGutterPx,
    1,
  );
  const widthFitScale = availableSceneWidth / Math.max(crop.width, 1);
  const quantizedScale =
    Math.floor(widthFitScale / MAU_OFFICE_CAMERA_SCALE_STEP) * MAU_OFFICE_CAMERA_SCALE_STEP;
  const scale = clamp(
    Number.isFinite(quantizedScale) && quantizedScale > 0
      ? quantizedScale
      : MAU_OFFICE_MIN_CAMERA_SCALE,
    MAU_OFFICE_MIN_CAMERA_SCALE,
    maxScale,
  );
  return styleMap({
    "--crop-x-px": `${crop.x}px`,
    "--crop-y-px": `${crop.y}px`,
    "--crop-width-px": `${crop.width}px`,
    "--crop-height-px": `${crop.height}px`,
    "--stage-width-px": `${scene.width}px`,
    "--stage-height-px": `${scene.height}px`,
    "--mau-editor-left-gutter-px": `${chrome.leftGutterPx}px`,
    "--mau-editor-right-gutter-px": `${chrome.rightGutterPx}px`,
    "--mau-editor-selection-panel-width-px": `${Math.max(
      MAU_OFFICE_EDITOR_SELECTION_PANEL_GUTTER_PX - MAU_OFFICE_EDITOR_PANEL_MARGIN_PX * 2,
      0,
    )}px`,
    "--mau-camera-scale": String(scale),
    width: `${crop.width * scale + chrome.leftGutterPx + chrome.rightGutterPx}px`,
    height: `${crop.height * scale}px`,
  });
}

function renderTile(scene: CompiledMauOfficeScene, tile: MauOfficeTilePlacement, basePath: string) {
  return html`
    <img
      class="mau-office__tile mau-office__tile--${tile.layer} mau-office__tile--${tile.roomId}"
      style=${positionForTile(scene, tile)}
      src=${resolveMauOfficeAssetUrl(basePath, tile.asset)}
      alt=""
      draggable="false"
    />
  `;
}

function renderProp(
  scene: CompiledMauOfficeScene,
  sprite: MauOfficeSpritePlacement,
  basePath: string,
  nowMs: number,
  extraClass = "",
) {
  const asset =
    sprite.animation && sprite.animation.frames.length > 0
      ? resolveAnimationFrame(sprite.sourceId ?? sprite.id, sprite.animation, nowMs)
      : sprite.asset;
  return html`
    <img
      class="mau-office__sprite mau-office__sprite--${sprite.kind} mau-office__sprite--${sprite.layer} ${extraClass}"
      style=${positionForSprite(scene, sprite)}
      src=${resolveMauOfficeAssetUrl(basePath, asset)}
      alt=""
      draggable="false"
    />
  `;
}

function renderBubble(bubble: OfficeBubbleEntry, basePath: string) {
  const box = resolveBubbleBox(bubble.text);
  return html`
    <span class="mau-office__bubble" style=${positionForWorkerBubble(box)}>
      ${renderBubbleFrame(basePath)}
      <span class="mau-office__bubble-text">${box.text}</span>
    </span>
  `;
}

function renderBubbleFrame(basePath: string) {
  const bubbleTailUrl = resolveMauOfficeAssetUrl(basePath, MAU_OFFICE_BUBBLE_TAIL_ASSET);
  return html`
    <span class="mau-office__bubble-frame" aria-hidden="true">
      ${BUBBLE_FRAME_ORDER.map(
        ([key, className]) => html`
          <img
            class="mau-office__bubble-slice mau-office__bubble-slice--${className}"
            src=${resolveMauOfficeAssetUrl(basePath, MAU_OFFICE_BUBBLE_FRAME_ASSETS[key])}
            alt=""
            draggable="false"
          />
        `,
      )}
      <img
        class="mau-office__bubble-tail"
        src=${bubbleTailUrl}
        alt=""
        draggable="false"
      />
    </span>
  `;
}

function historySummaryForActor(actor: OfficeActor, nowMs: number): string {
  const supportDialogueText = resolveSupportDialogueText(actor, nowMs);
  if (supportDialogueText) {
    return supportDialogueText;
  }
  const bubble = resolveMostRecentBubble(actor) ?? resolveLatestBubble(actor, nowMs);
  return (bubble?.text ?? actor.currentActivity.bubbleText ?? actor.currentActivity.label).trim();
}

function renderHistory(actor: OfficeActor, basePath: string, nowMs: number) {
  const summary = historySummaryForActor(actor, nowMs);
  const box = resolveHistoryBox(actor.label, summary);
  return html`
    <span class="mau-office__history" style=${positionForWorkerHistory(box)}>
      ${renderBubbleFrame(basePath)}
      <span class="mau-office__history-copy">
        <strong>${actor.label}</strong>
        <span>${summary}</span>
      </span>
    </span>
  `;
}

function idleGroupKey(actor: OfficeActor): string | null {
  const assignment = actor.idleAssignment;
  if (!assignment) {
    return null;
  }
  return `${assignment.packageId}:${assignment.activityId}:${assignment.participantIds.join("|")}`;
}

function resolveVolleyballHandPoint(
  scene: CompiledMauOfficeScene,
  assignment: NonNullable<OfficeActor["idleAssignment"]>,
  participantIndex: number,
  nowMs: number,
): { x: number; y: number } | null {
  const anchorId = assignment.slotAnchorIds[participantIndex];
  const anchor = anchorId ? scene.anchors[anchorId] : null;
  if (!anchor) {
    return null;
  }
  const phase = resolvePassingBallPhase(assignment.participantIds.length, nowMs);
  const jumpPx =
    participantIndex === phase.beatIndex
      ? Math.round(Math.sin(phase.beatProgress * Math.PI) * 22)
      : 0;
  return {
    x: anchor.x,
    y: anchor.y - MAU_OFFICE_WORKER_RENDER_METRICS.logicalHeightPx + 18 - jumpPx,
  };
}

function positionForActivityBall(point: { x: number; y: number }) {
  return styleMap({
    left: `${point.x}px`,
    top: `${point.y}px`,
    zIndex: String(900 + Math.round(point.y)),
  });
}

function renderIdleGroupOverlays(
  scene: CompiledMauOfficeScene,
  actors: OfficeActor[],
  nowMs: number,
) {
  const renderedGroups = new Set<string>();
  const overlays = [];
  for (const actor of actors) {
    const assignment = actor.idleAssignment;
    if (
      !assignment ||
      assignment.packageId !== "passing_ball_court" ||
      assignment.participantIds.length < 4
    ) {
      continue;
    }
    const key = idleGroupKey(actor);
    if (!key || renderedGroups.has(key)) {
      continue;
    }
    renderedGroups.add(key);
    const phase = resolvePassingBallPhase(assignment.participantIds.length, nowMs);
    const from = resolveVolleyballHandPoint(scene, assignment, phase.beatIndex, nowMs);
    const to = resolveVolleyballHandPoint(scene, assignment, phase.nextIndex, nowMs);
    if (!from || !to) {
      continue;
    }
    const progress = phase.beatProgress;
    const x = Math.round(from.x + (to.x - from.x) * progress);
    const baseY = from.y + (to.y - from.y) * progress;
    const arcHeight = 44;
    const y = Math.round(baseY - arcHeight * 4 * progress * (1 - progress));
    overlays.push(html`
      <span
        class="mau-office__activity-ball"
        style=${positionForActivityBall({ x, y })}
        aria-hidden="true"
      ></span>
    `);
  }
  return overlays;
}

function renderWorker(
  scene: CompiledMauOfficeScene,
  actor: OfficeActor,
  basePath: string,
  nowMs: number,
  onActorOpen: (actorId: string) => void,
) {
  const bubble = resolveLatestBubble(actor, nowMs);
  const placement = resolveWorkerPlacement(scene, actor, nowMs);
  const anchor = placement.anchor ?? scene.anchors[actor.anchorId];
  const animationId = resolveWorkerAnimationId(actor, anchor);
  const spriteUrl = resolveWorkerSprite(scene, actor, basePath, nowMs, placement);
  const placeholderLabel = formatWorkerAnimationPlaceholderLabel(animationId);
  const workerPoseClass =
    animationId === "sleep-floor"
      ? "mau-office__worker--sleep"
      : animationId === "sit"
        ? "mau-office__worker--sit"
        : "mau-office__worker--stand";
  return html`
    <button
      class="mau-office__worker mau-office__worker--${actor.kind} ${workerPoseClass}"
      style=${positionForWorker(placement, anchor, animationId)}
      @click=${() => onActorOpen(actor.id)}
      aria-label=${`${actor.label}. ${actor.currentActivity.label}.`}
    >
      <img
        class="mau-office__worker-sprite"
        src=${spriteUrl}
        alt=""
        draggable="false"
        @error=${(event: Event) => setWorkerSpriteFallback(event, true)}
        @load=${(event: Event) => setWorkerSpriteFallback(event, false)}
      />
      <span class="mau-office__worker-sprite-fallback" aria-hidden="true">${placeholderLabel}</span>
    </button>
    <span class="mau-office__worker-overlay" style=${positionForWorkerOverlay(placement)}>
      ${bubble ? renderBubble(bubble, basePath) : nothing}
      ${renderHistory(actor, basePath, nowMs)}
    </span>
  `;
}

function isAnimatedSprite(sprite: MauOfficeSpritePlacement): boolean {
  return Boolean(sprite.animation && sprite.animation.frames.length > 0);
}

function renderStaticStage(
  scene: CompiledMauOfficeScene,
  basePath: string,
  options?: { hideWalls?: boolean },
) {
  const staticWallSprites = options?.hideWalls
    ? []
    : scene.map.wallSprites.filter((sprite) => !isAnimatedSprite(sprite));
  const staticPropSprites = scene.map.propSprites.filter((sprite) => !isAnimatedSprite(sprite));
  return html`
    ${scene.map.floorTiles.map((tile) => renderTile(scene, tile, basePath))}
    ${staticWallSprites.map((sprite) => renderProp(scene, sprite, basePath, 0))}
    ${staticPropSprites.map((sprite) => renderProp(scene, sprite, basePath, 0))}
  `;
}

function renderAnimatedStage(
  scene: CompiledMauOfficeScene,
  basePath: string,
  nowMs: number,
  options?: { hideWalls?: boolean },
) {
  const animatedSprites = [
    ...(options?.hideWalls ? [] : scene.map.wallSprites),
    ...scene.map.propSprites,
  ].filter((sprite) => isAnimatedSprite(sprite));
  if (animatedSprites.length === 0) {
    return nothing;
  }
  return animatedSprites.map((sprite) => renderProp(scene, sprite, basePath, nowMs));
}

function resolveEditorHoverTile(
  editor: NonNullable<MauOfficeProps["editor"]>,
): { tileX: number; tileY: number } | null {
  if (editor.hoverTileX == null || editor.hoverTileY == null) {
    return null;
  }
  return {
    tileX: Math.round(editor.hoverTileX),
    tileY: Math.round(editor.hoverTileY),
  };
}

function selectionAlreadyAtHover(
  draft: MauOfficeSceneConfig,
  selection: Exclude<MauOfficeEditorSelection, null>,
  hover: { tileX: number; tileY: number },
): boolean {
  if (selection.kind === "marker") {
    const marker = draft.markers.find((entry) => entry.id === selection.id);
    return Boolean(
      marker &&
        Math.round(marker.tileX) === hover.tileX &&
        Math.round(marker.tileY) === hover.tileY,
    );
  }
  if (selection.kind === "prop") {
    const entry = draft.props.find((candidate) => candidate.id === selection.id);
    return Boolean(
      entry &&
        Math.round(entry.tileX) === hover.tileX &&
        Math.round(entry.tileY) === hover.tileY,
    );
  }
  const entry = draft.autotiles.find((candidate) => candidate.id === selection.id);
  if (!entry || entry.cells.length === 0) {
    return false;
  }
  return (
    Math.min(...entry.cells.map((cell) => Math.round(cell.tileX))) === hover.tileX &&
    Math.min(...entry.cells.map((cell) => Math.round(cell.tileY))) === hover.tileY
  );
}

function resolveEditorTileAtPoint(clientX: number, clientY: number) {
  const candidates =
    typeof document.elementsFromPoint === "function"
      ? document.elementsFromPoint(clientX, clientY)
      : [document.elementFromPoint(clientX, clientY)].filter(Boolean);
  for (const candidate of candidates) {
    const cell =
      candidate instanceof HTMLElement
        ? candidate.closest<HTMLElement>(".mau-office__editor-cell")
        : null;
    const [rawTileX = "", rawTileY = ""] = (cell?.dataset.selectionId ?? "").split(",");
    const tileX = Number.parseInt(rawTileX, 10);
    const tileY = Number.parseInt(rawTileY, 10);
    if (Number.isFinite(tileX) && Number.isFinite(tileY)) {
      return { tileX, tileY };
    }
  }
  return null;
}

function suppressNextPointerClick() {
  const handleClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  };
  window.addEventListener("click", handleClick, { capture: true, once: true });
}

function startEditorSelectionDrag(
  event: PointerEvent,
  editor: NonNullable<MauOfficeProps["editor"]>,
  selection: Exclude<MauOfficeEditorSelection, null>,
) {
  if (
    editor.tool !== "select" ||
    event.button !== 0 ||
    editor.selection?.kind !== selection.kind ||
    editor.selection.id !== selection.id
  ) {
    return;
  }
  event.preventDefault();
  editor.onSelectionDragStart?.(selection);
  document.body.style.userSelect = "none";
  let moved = false;
  const cleanup = () => {
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", handleMove);
    window.removeEventListener("pointerup", handleUp);
    window.removeEventListener("pointercancel", handleCancel);
  };
  const handleMove = (moveEvent: PointerEvent) => {
    const tile = resolveEditorTileAtPoint(moveEvent.clientX, moveEvent.clientY);
    editor.onHoverTileChange?.(tile?.tileX ?? null, tile?.tileY ?? null);
    if (tile && !selectionAlreadyAtHover(editor.draft, selection, tile)) {
      moved = true;
    }
  };
  const handleUp = (upEvent: PointerEvent) => {
    const tile = resolveEditorTileAtPoint(upEvent.clientX, upEvent.clientY);
    if (moved && tile && !selectionAlreadyAtHover(editor.draft, selection, tile)) {
      // A successful drag ends with a synthetic click on release; swallow it so
      // we do not immediately clear or reselect after placing the object.
      suppressNextPointerClick();
      editor.onSelectionDragEnd?.(tile.tileX, tile.tileY);
    } else {
      editor.onSelectionDragEnd?.(null, null);
    }
    cleanup();
  };
  const handleCancel = () => {
    editor.onSelectionDragEnd?.(null, null);
    cleanup();
  };
  window.addEventListener("pointermove", handleMove);
  window.addEventListener("pointerup", handleUp);
  window.addEventListener("pointercancel", handleCancel);
}

function spritePreviewKey(sprite: Pick<MauOfficeSpritePlacement, "id" | "asset" | "tileX" | "tileY">) {
  return `${sprite.id}:${sprite.asset}:${sprite.tileX}:${sprite.tileY}`;
}

function renderEditorHoverCellPreview(
  scene: CompiledMauOfficeScene,
  tileX: number,
  tileY: number,
  zone: MauOfficeZoneId,
) {
  return html`
    <span
      class="mau-office__editor-preview-cell mau-office__editor-preview-cell--${zone}"
      style=${editorCellStyle(scene, tileX, tileY)}
    ></span>
  `;
}

function renderEditorHoverMarkerPreview(
  scene: CompiledMauOfficeScene,
  tileX: number,
  tileY: number,
  role: MauOfficeMarkerRole,
) {
  return html`
    <span
      class="mau-office__editor-marker mau-office__editor-marker--preview"
      style=${styleMap({
        left: `${tileX * scene.tileSize + scene.tileSize / 2}px`,
        top: `${tileY * scene.tileSize + scene.tileSize}px`,
        zIndex: String(1190 + Math.round((tileY + 1) * scene.tileSize)),
      })}
    >
      ${formatEditorLabel(role.split(".").slice(-1)[0] ?? role)}
    </span>
  `;
}

function renderEditorHoverPreview(props: MauOfficeProps, scene: CompiledMauOfficeScene) {
  const editor = props.editor;
  if (!editor?.open) {
    return nothing;
  }
  const hover = resolveEditorHoverTile(editor);
  if (!hover) {
    return nothing;
  }
  if (editor.tool === "select") {
    const activeSelection = editor.dragSelection ?? null;
    if (!activeSelection) {
      return nothing;
    }
    if (selectionAlreadyAtHover(editor.draft, activeSelection, hover)) {
      return nothing;
    }
    const previewScene = compileMauOfficeScene(
      moveSceneSelection(editor.draft, activeSelection, hover.tileX, hover.tileY),
    );
    if (activeSelection.kind === "marker") {
      const marker = previewScene.anchors[activeSelection.id];
      const role = previewScene.markerRoleById[activeSelection.id];
      if (!marker || !role) {
        return nothing;
      }
      return renderEditorHoverMarkerPreview(
        previewScene,
        Math.round(marker.tileX),
        Math.round(marker.tileY),
        role,
      );
    }
    const previewSprites =
      activeSelection.kind === "autotile"
        ? previewScene.map.propSprites.filter((sprite) => sprite.sourceId === activeSelection.id)
        : previewScene.map.propSprites.filter((sprite) => sprite.id === activeSelection.id);
    return previewSprites.map((sprite) =>
      renderProp(previewScene, sprite, props.basePath, 0, "mau-office__sprite--editor-hover-preview"),
    );
  }
  if (editor.brushMode !== "paint") {
    return nothing;
  }
  if (editor.tool === "zone") {
    return renderEditorHoverCellPreview(scene, hover.tileX, hover.tileY, editor.zoneBrush);
  }
  if (editor.tool === "wall") {
    const previewScene = compileMauOfficeScene(
      paintSceneWall(editor.draft, hover.tileX, hover.tileY, true),
    );
    const baseKeys = new Set(scene.map.wallSprites.map((sprite) => spritePreviewKey(sprite)));
    return previewScene.map.wallSprites
      .filter(
        (sprite) =>
          Math.abs(Math.round(sprite.tileX) - hover.tileX) <= 1 &&
          Math.abs(Math.round(sprite.tileY) - hover.tileY) <= 1 &&
          !baseKeys.has(spritePreviewKey(sprite)),
      )
      .map((sprite) =>
        renderProp(
          previewScene,
          sprite,
          props.basePath,
          0,
          "mau-office__sprite--editor-hover-preview",
        ),
      );
  }
  if (editor.tool === "prop") {
    const result = placeSceneProp(editor.draft, editor.propItemId, hover.tileX, hover.tileY);
    if (!result.id) {
      return nothing;
    }
    const previewScene = compileMauOfficeScene(result.scene);
    const sprite = previewScene.map.propSprites.find((entry) => entry.id === result.id);
    return sprite
      ? renderProp(
          previewScene,
          sprite,
          props.basePath,
          0,
          "mau-office__sprite--editor-hover-preview",
        )
      : nothing;
  }
  if (editor.tool === "marker") {
    return renderEditorHoverMarkerPreview(scene, hover.tileX, hover.tileY, editor.markerRole);
  }
  if (editor.tool === "autotile") {
    const result = paintSceneAutotileCell(editor.draft, editor.autotileItemId, hover.tileX, hover.tileY, "paint");
    if (!result.id) {
      return nothing;
    }
    const previewScene = compileMauOfficeScene(result.scene);
    const baseKeys = new Set(
      scene.map.propSprites
        .filter((sprite) => sprite.sourceId === result.id)
        .map((sprite) => spritePreviewKey(sprite)),
    );
    return previewScene.map.propSprites
      .filter(
        (sprite) =>
          sprite.sourceId === result.id &&
          Math.abs(Math.round(sprite.tileX) - hover.tileX) <= 1 &&
          Math.abs(Math.round(sprite.tileY) - hover.tileY) <= 1 &&
          !baseKeys.has(spritePreviewKey(sprite)),
      )
      .map((sprite) =>
        renderProp(
          previewScene,
          sprite,
          props.basePath,
          0,
          "mau-office__sprite--editor-hover-preview",
        ),
      );
  }
  return nothing;
}

function editorSupportsDirectSelection(
  editor: NonNullable<MauOfficeProps["editor"]>,
  kind: MauOfficeEditorSelection extends { kind: infer SelectionKind }
    ? SelectionKind
    : never,
): boolean {
  if (editor.tool === "select") {
    return true;
  }
  if (editor.brushMode !== "erase") {
    return false;
  }
  if (kind === "autotile") {
    return false;
  }
  return editor.tool === kind;
}

function interactWithEditorSelection(
  editor: NonNullable<MauOfficeProps["editor"]>,
  selection: Exclude<MauOfficeEditorSelection, null>,
) {
  if (editor.tool === "select") {
    if (editor.selection?.kind === selection.kind && editor.selection.id === selection.id) {
      editor.onClearSelection?.();
      return;
    }
    editor.onSelectionChange(selection);
    return;
  }
  if (editor.brushMode === "erase" && editor.tool === selection.kind) {
    editor.onSelectionChange(selection);
    editor.onDeleteSelection();
  }
}

function renderEditorWallPreview(scene: CompiledMauOfficeScene, basePath: string) {
  return scene.map.wallSprites.map((sprite) => html`
    <img
      class="mau-office__sprite mau-office__sprite--${sprite.kind} mau-office__sprite--${sprite.layer} mau-office__sprite--editor-wall-preview"
      style=${positionForSprite(scene, sprite)}
      src=${resolveMauOfficeAssetUrl(basePath, sprite.asset)}
      alt=""
      draggable="false"
    />
  `);
}

function renderEditorSelectionTargets(props: MauOfficeProps, scene: CompiledMauOfficeScene) {
  const editor = props.editor;
  if (!editor?.open) {
    return nothing;
  }
  const autotileTargets = editorSupportsDirectSelection(editor, "autotile")
    ? editor.draft.autotiles.flatMap((entry) =>
        entry.cells.map(
          (cell) => html`
      <button
        class="mau-office__editor-hit-target mau-office__editor-hit-target--autotile"
        style=${editorCellStyle(scene, Math.round(cell.tileX), Math.round(cell.tileY))}
        type="button"
        data-selection-kind="autotile"
        data-selection-id=${entry.id}
        @pointerdown=${(event: PointerEvent) =>
          startEditorSelectionDrag(event, editor, { kind: "autotile", id: entry.id })}
        @click=${() => interactWithEditorSelection(editor, { kind: "autotile", id: entry.id })}
      ></button>
    `,
        ),
      )
    : [];
  const propTargets = editorSupportsDirectSelection(editor, "prop")
    ? editor.draft.props.flatMap((entry) => {
        const item = MAU_OFFICE_CATALOG[entry.itemId];
        if (!item) {
          return [];
        }
        return html`
      <button
        class="mau-office__editor-hit-target mau-office__editor-hit-target--prop"
        style=${styleMap({
          left: `${Math.floor(entry.tileX) * scene.tileSize}px`,
          top: `${Math.floor(entry.tileY) * scene.tileSize}px`,
          width: `${item.tileWidth * scene.tileSize}px`,
          height: `${item.tileHeight * scene.tileSize}px`,
        })}
        type="button"
        data-selection-kind="prop"
        data-selection-id=${entry.id}
        @pointerdown=${(event: PointerEvent) =>
          startEditorSelectionDrag(event, editor, { kind: "prop", id: entry.id })}
        @click=${() => interactWithEditorSelection(editor, { kind: "prop", id: entry.id })}
      ></button>
    `;
      })
    : [];
  return [...autotileTargets, ...propTargets];
}

function editorCellStyle(scene: CompiledMauOfficeScene, tileX: number, tileY: number) {
  return styleMap({
    left: `${tileX * scene.tileSize}px`,
    top: `${tileY * scene.tileSize}px`,
    width: `${scene.tileSize}px`,
    height: `${scene.tileSize}px`,
  });
}

function formatEditorLabel(value: string): string {
  return value
    .split(/[._-]/u)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function resolveCatalogPreviewAsset(item: (typeof FLOOR_PROP_ITEMS)[number] | (typeof AUTOTILE_ITEMS)[number]) {
  if (item.asset) {
    return item.asset;
  }
  if (!item.sliceAssets) {
    return null;
  }
  if ("middleCenter" in item.sliceAssets) {
    return item.sliceAssets.middleCenter;
  }
  if ("center" in item.sliceAssets) {
    return item.sliceAssets.center;
  }
  return null;
}

function describeCatalogItem(item: (typeof FLOOR_PROP_ITEMS)[number] | (typeof AUTOTILE_ITEMS)[number]) {
  const parts = [`${item.tileWidth}x${item.tileHeight}`, formatEditorLabel(item.mount)];
  if (item.autotileMode) {
    parts.unshift(formatEditorLabel(item.autotileMode));
  }
  return parts.join(" · ");
}

function markerRoleLabel(role: MauOfficeMarkerRole): string {
  return formatEditorLabel(role.split(".").slice(-1)[0] ?? role);
}

function markerRoleDetail(role: MauOfficeMarkerRole): string {
  const [group = "marker", name = role] = role.split(".");
  return `${formatEditorLabel(group)} · ${formatEditorLabel(name)}`;
}

function renderCatalogPicker(params: {
  label: string;
  selectedId: string;
  items: Array<(typeof FLOOR_PROP_ITEMS)[number] | (typeof AUTOTILE_ITEMS)[number]>;
  basePath: string;
  onSelect: (id: string) => void;
}) {
  const selectedItem = params.items.find((item) => item.id === params.selectedId) ?? params.items[0] ?? null;
  return html`
    <div class="mau-office__editor-picker">
      <div>
        <div class="mau-office__editor-heading">${params.label}</div>
        ${selectedItem
          ? html`<div class="mau-office__editor-meta">${selectedItem.label}</div>`
          : nothing}
      </div>
      <div class="mau-office__editor-picker-list" role="listbox" aria-label=${params.label}>
        ${params.items.map((item) => {
          const previewAsset = resolveCatalogPreviewAsset(item);
          return html`
            <button
              class="mau-office__editor-picker-button ${params.selectedId === item.id ? "active" : ""}"
              type="button"
              data-picker-id=${item.id}
              title=${item.label}
              aria-label=${item.label}
              @click=${() => params.onSelect(item.id)}
            >
              <span class="mau-office__editor-picker-preview">
                ${previewAsset
                  ? html`
                      <img
                        class="mau-office__editor-picker-image"
                        src=${resolveMauOfficeAssetUrl(params.basePath, previewAsset)}
                        alt=""
                        draggable="false"
                      />
                    `
                  : html`<span class="mau-office__editor-picker-empty">No Preview</span>`}
              </span>
              <span class="mau-office__editor-picker-copy">
                <span class="mau-office__editor-picker-label">${item.label}</span>
                <span class="mau-office__editor-picker-detail">${describeCatalogItem(item)}</span>
              </span>
            </button>
          `;
        })}
      </div>
    </div>
  `;
}

function renderZonePicker(editor: NonNullable<MauOfficeProps["editor"]>) {
  return html`
    <div class="mau-office__editor-picker">
      <div>
        <div class="mau-office__editor-heading">Zone Brush</div>
        <div class="mau-office__editor-meta">${formatEditorLabel(editor.zoneBrush)}</div>
      </div>
      <div class="mau-office__editor-picker-list" role="listbox" aria-label="Zone Brush">
        ${ZONE_OPTIONS.map(
          (zone) => html`
            <button
              class="mau-office__editor-picker-button ${editor.zoneBrush === zone ? "active" : ""}"
              type="button"
              data-picker-id=${zone}
              title=${formatEditorLabel(zone)}
              aria-label=${formatEditorLabel(zone)}
              @click=${() => editor.onZoneBrushChange(zone)}
            >
              <span class="mau-office__editor-picker-preview">
                <span class="mau-office__editor-picker-swatch mau-office__editor-picker-swatch--${zone}"></span>
              </span>
              <span class="mau-office__editor-picker-copy">
                <span class="mau-office__editor-picker-label">${formatEditorLabel(zone)}</span>
                <span class="mau-office__editor-picker-detail">
                  ${zone === "outside" ? "Empty space" : zone === "hall" ? "Walkway" : "Room floor"}
                </span>
              </span>
            </button>
          `,
        )}
      </div>
    </div>
  `;
}

function renderMarkerPicker(editor: NonNullable<MauOfficeProps["editor"]>) {
  return html`
    <div class="mau-office__editor-picker">
      <div>
        <div class="mau-office__editor-heading">Marker Role</div>
        <div class="mau-office__editor-meta">${markerRoleDetail(editor.markerRole)}</div>
      </div>
      <div class="mau-office__editor-picker-list" role="listbox" aria-label="Marker Role">
        ${MARKER_ROLE_OPTIONS.map(
          (role) => html`
            <button
              class="mau-office__editor-picker-button ${editor.markerRole === role ? "active" : ""}"
              type="button"
              data-picker-id=${role}
              title=${role}
              aria-label=${role}
              @click=${() => editor.onMarkerRoleChange(role)}
            >
              <span class="mau-office__editor-picker-preview">
                <span class="mau-office__editor-picker-marker-preview">
                  ${icons.pin}
                  <span>${markerRoleLabel(role)}</span>
                </span>
              </span>
              <span class="mau-office__editor-picker-copy">
                <span class="mau-office__editor-picker-label">${markerRoleLabel(role)}</span>
                <span class="mau-office__editor-picker-detail">${markerRoleDetail(role)}</span>
              </span>
            </button>
          `,
        )}
      </div>
    </div>
  `;
}

function renderEditorSelectionOutline(
  scene: CompiledMauOfficeScene,
  draft: MauOfficeSceneConfig,
  selection: MauOfficeEditorSelection,
) {
  if (!selection) {
    return nothing;
  }
  if (selection.kind === "marker") {
    const marker = draft.markers.find((entry) => entry.id === selection.id);
    if (!marker) {
      return nothing;
    }
    return html`
      <span
        class="mau-office__editor-selection"
        style=${editorCellStyle(scene, Math.round(marker.tileX), Math.round(marker.tileY))}
      ></span>
    `;
  }
  if (selection.kind === "autotile") {
    const entry = draft.autotiles.find((candidate) => candidate.id === selection.id);
    if (!entry) {
      return nothing;
    }
    return entry.cells.map(
      (cell) => html`
        <span
          class="mau-office__editor-selection"
          style=${editorCellStyle(scene, Math.round(cell.tileX), Math.round(cell.tileY))}
        ></span>
      `,
    );
  }
  const entry = draft.props.find((candidate) => candidate.id === selection.id);
  const item = entry ? MAU_OFFICE_CATALOG[entry.itemId] : null;
  if (!entry || !item) {
    return nothing;
  }
  return html`
    <span
      class="mau-office__editor-selection mau-office__editor-selection--prop"
      style=${styleMap({
        left: `${Math.floor(entry.tileX) * scene.tileSize}px`,
        top: `${Math.floor(entry.tileY) * scene.tileSize}px`,
        width: `${item.tileWidth * scene.tileSize}px`,
        height: `${item.tileHeight * scene.tileSize}px`,
      })}
    ></span>
  `;
}

function renderEditorMarkers(props: MauOfficeProps, scene: CompiledMauOfficeScene) {
  const editor = props.editor;
  return Object.values(scene.anchors).map((anchor) => {
    const role = scene.markerRoleById[anchor.id];
    const interactive = Boolean(editor && editorSupportsDirectSelection(editor, "marker"));
    return html`
      <button
        class="mau-office__editor-marker ${interactive ? "mau-office__editor-marker--interactive" : ""}"
        style=${styleMap({
          left: `${anchor.x}px`,
          top: `${anchor.y}px`,
          zIndex: String(1200 + Math.round(anchor.y)),
        })}
        type="button"
        data-selection-kind="marker"
        data-selection-id=${anchor.id}
        title=${role}
        @pointerdown=${(event: PointerEvent) => {
          if (!editor) {
            return;
          }
          startEditorSelectionDrag(event, editor, { kind: "marker", id: anchor.id });
        }}
        @click=${() => {
          if (!editor) {
            return;
          }
          interactWithEditorSelection(editor, { kind: "marker", id: anchor.id });
        }}
      >
        ${formatEditorLabel(role.split(".").slice(-1)[0] ?? role)}
      </button>
    `;
  });
}

function renderEditorGrid(props: MauOfficeProps, scene: CompiledMauOfficeScene) {
  if (!props.editor?.open) {
    return nothing;
  }
  const editor = props.editor;
  return Array.from({ length: scene.authored.zoneRows.length }, (_, tileY) =>
    Array.from({ length: scene.authored.zoneRows[tileY]?.length ?? 0 }, (_, tileX) => {
      const zone = scene.authored.zoneRows[tileY]?.[tileX] ?? "outside";
      const hasWall = scene.authored.wallRows[tileY]?.[tileX] === true;
      return html`
        <button
          class="mau-office__editor-cell mau-office__editor-cell--${zone} ${
            hasWall ? "mau-office__editor-cell--has-wall" : ""
          }"
          style=${editorCellStyle(scene, tileX, tileY)}
          type="button"
          data-selection-kind="cell"
          data-selection-id=${`${tileX},${tileY}`}
          aria-label=${`Tile ${tileX},${tileY} ${hasWall ? "with wall" : "without wall"}`}
          @pointerdown=${(event: PointerEvent) => {
            editor.onHoverTileChange?.(tileX, tileY);
            if (editor.tool === "zone" || editor.tool === "wall" || editor.tool === "autotile") {
              event.preventDefault();
              editor.onCellInteract(tileX, tileY, "down", event.buttons || 1);
            }
          }}
          @pointerenter=${(event: PointerEvent) => {
            editor.onHoverTileChange?.(tileX, tileY);
            if (
              (editor.tool === "zone" || editor.tool === "wall" || editor.tool === "autotile") &&
              (event.buttons & 1) === 1
            ) {
              editor.onCellInteract(tileX, tileY, "enter", event.buttons);
            }
          }}
          @click=${() => editor.onCellInteract(tileX, tileY, "click", 0)}
        ></button>
      `;
    }),
  );
}

function currentEditorModeLabel(editor: NonNullable<MauOfficeProps["editor"]>): string {
  if (editor.tool === "select") {
    return "Selecting scene parts";
  }
  return `${editor.brushMode === "paint" ? "Editing" : "Erasing"} ${EDITOR_TOOL_LABELS[editor.tool].toLowerCase()}`;
}

function editorHint(editor: NonNullable<MauOfficeProps["editor"]>): string {
  switch (editor.tool) {
    case "select":
      return editor.selection
        ? "Click to switch selection. Click empty space to clear it. Press and drag the selected prop, brush region, or marker to move it."
        : "Click a placed item, brush region, or marker to inspect and adjust it.";
    case "zone":
      return "Drag to paint floor zones. Floors no longer create walls automatically.";
    case "wall":
      return "Drag to paint wall tiles anywhere on the grid. Edit mode shows the saved wall art as a translucent preview.";
    case "autotile":
      return editor.brushMode === "paint"
        ? "Drag to paint smart brush cells. Neighboring slices update automatically."
        : "Drag to carve cells out of the selected smart brush region.";
    case "prop":
      return editor.brushMode === "paint"
        ? "Click to place the selected catalog item."
        : "Click an item to remove it.";
    case "marker":
      return editor.brushMode === "paint"
        ? "Click to place a semantic marker."
        : "Click a marker to remove it.";
  }
}

function selectedSceneSummary(editor: NonNullable<MauOfficeProps["editor"]>) {
  if (!editor.selection) {
    return null;
  }
  if (editor.selection.kind === "prop") {
    const selectedProp = editor.draft.props.find((entry) => entry.id === editor.selection?.id);
    if (!selectedProp) {
      return null;
    }
    return {
      kind: "prop" as const,
      prop: selectedProp,
      label: MAU_OFFICE_CATALOG[selectedProp.itemId]?.label ?? selectedProp.itemId,
    };
  }
  if (editor.selection.kind === "autotile") {
    const selectedAutotile = editor.draft.autotiles.find((entry) => entry.id === editor.selection?.id);
    if (!selectedAutotile) {
      return null;
    }
    return {
      kind: "autotile" as const,
      autotile: selectedAutotile,
      label: `${MAU_OFFICE_CATALOG[selectedAutotile.itemId]?.label ?? selectedAutotile.itemId} · ${selectedAutotile.cells.length} cell(s)`,
    };
  }
  const selectedMarker = editor.draft.markers.find((entry) => entry.id === editor.selection?.id);
  if (!selectedMarker) {
    return null;
  }
  return {
    kind: "marker" as const,
    marker: selectedMarker,
    label: selectedMarker.id,
  };
}

function renderEditorToolPalette(
  editor: NonNullable<MauOfficeProps["editor"]>,
  basePath: string,
) {
  if (editor.toolPanelOpen === false) {
    return nothing;
  }
  return html`
    <div class="mau-office__editor-panel mau-office__editor-panel--tool">
      <div class="mau-office__editor-panel-header">
        <div>
          <div class="mau-office__editor-heading">${EDITOR_TOOL_LABELS[editor.tool]}</div>
          <div class="mau-office__editor-meta">${currentEditorModeLabel(editor)}</div>
        </div>
      </div>
      <div class="mau-office__editor-meta">${editorHint(editor)}</div>
      ${
        editor.tool !== "select"
          ? html`
              <div class="mau-office__editor-mode-switch" role="toolbar" aria-label="Edit action">
                ${(["paint", "erase"] as const).map(
                  (mode) => html`
                    <button
                      class="mau-office__editor-mode-button ${editor.brushMode === mode ? "active" : ""}"
                      type="button"
                      title=${mode === "paint" ? "Paint" : "Erase"}
                      aria-label=${mode === "paint" ? "Paint" : "Erase"}
                      @click=${() => editor.onBrushModeChange(mode)}
                    >
                      ${icons[EDITOR_BRUSH_MODE_ICONS[mode]]}
                    </button>
                  `,
                )}
              </div>
            `
          : nothing
      }
      ${
        editor.tool === "zone"
          ? renderZonePicker(editor)
          : nothing
      }
      ${
        editor.tool === "prop"
          ? renderCatalogPicker({
              label: "Catalog Item",
              selectedId: editor.propItemId,
              items: FLOOR_PROP_ITEMS,
              basePath,
              onSelect: editor.onPropItemChange,
            })
          : nothing
      }
      ${
        editor.tool === "autotile"
          ? renderCatalogPicker({
              label: "Smart Brush",
              selectedId: editor.autotileItemId,
              items: AUTOTILE_ITEMS,
              basePath,
              onSelect: editor.onAutotileItemChange,
            })
          : nothing
      }
      ${
        editor.tool === "marker"
          ? renderMarkerPicker(editor)
          : nothing
      }
    </div>
  `;
}

function renderEditorSelectionPanel(
  editor: NonNullable<MauOfficeProps["editor"]>,
  options?: { docked?: boolean },
) {
  const selectedSummary = selectedSceneSummary(editor);
  if (!selectedSummary) {
    return nothing;
  }
  const selectedCatalogItem =
    selectedSummary.kind === "marker"
      ? null
      : MAU_OFFICE_CATALOG[
          selectedSummary.kind === "prop"
            ? selectedSummary.prop.itemId
            : selectedSummary.autotile.itemId
        ];
  return html`
    <div
      class="mau-office__editor-panel ${options?.docked
        ? "mau-office__editor-panel--selection-docked"
        : "mau-office__editor-panel--selection"}"
    >
      <div class="mau-office__editor-panel-header">
        <div>
          <div class="mau-office__editor-heading">Selection</div>
          <div class="mau-office__editor-meta">${selectedSummary.label}</div>
        </div>
        <div class="mau-office__editor-panel-actions">
          <button
            class="mau-office__editor-mini-button"
            type="button"
            title="Clear selection"
            aria-label="Clear selection"
            @click=${() => editor.onClearSelection?.()}
          >
            ${icons.x}
          </button>
          <button
            class="mau-office__editor-mini-button"
            type="button"
            title="Delete selection"
            aria-label="Delete selection"
            @click=${editor.onDeleteSelection}
          >
            ${icons.trash}
          </button>
        </div>
      </div>
      ${
        selectedSummary.kind === "prop"
          ? html`
              <label>
                <span>Mount</span>
                <select
                  .value=${selectedSummary.prop.mountOverride ?? "auto"}
                  @change=${(event: Event) =>
                    editor.onSelectionPatch({
                      mountOverride:
                        (event.target as HTMLSelectElement).value === "auto"
                          ? undefined
                          : (event.target as HTMLSelectElement).value,
                    })}
                >
                  <option value="auto">Auto</option>
                  <option value="floor">Floor</option>
                  <option value="wall">Wall</option>
                  <option value="underlay">Underlay</option>
                </select>
              </label>
              <label>
                <span>Z Offset</span>
                <input
                  type="number"
                  .value=${selectedSummary.prop.zOffsetOverride != null
                    ? String(selectedSummary.prop.zOffsetOverride)
                    : ""}
                  @input=${(event: Event) =>
                    editor.onSelectionPatch({
                      zOffsetOverride: (event.target as HTMLInputElement).value
                        ? Number.parseInt((event.target as HTMLInputElement).value, 10)
                        : undefined,
                    })}
                />
              </label>
              <label>
                <span>Collision</span>
                <select
                  .value=${selectedSummary.prop.collisionOverride == null
                    ? "auto"
                    : String(selectedSummary.prop.collisionOverride)}
                  @change=${(event: Event) =>
                    editor.onSelectionPatch({
                      collisionOverride:
                        (event.target as HTMLSelectElement).value === "auto"
                          ? undefined
                          : (event.target as HTMLSelectElement).value === "true",
                    })}
                >
                  <option value="auto">Auto</option>
                  <option value="true">Blocks</option>
                  <option value="false">Walkable</option>
                </select>
              </label>
              ${
                selectedCatalogItem?.loops
                  ? html`
                      <label>
                        <span>Loop</span>
                        <select
                          .value=${selectedSummary.prop.loopId ?? "default"}
                          @change=${(event: Event) =>
                            editor.onSelectionPatch({
                              loopId:
                                (event.target as HTMLSelectElement).value === "default"
                                  ? undefined
                                  : (event.target as HTMLSelectElement).value,
                            })}
                        >
                          <option value="default">Default</option>
                          <option value="off">Off</option>
                          ${selectedCatalogItem.loops.values.map(
                            (loop) => html`<option value=${loop.id}>${loop.label}</option>`,
                          )}
                        </select>
                      </label>
                    `
                  : nothing
              }
            `
          : selectedSummary.kind === "autotile"
            ? html`
                <label>
                  <span>Mount</span>
                  <select
                    .value=${selectedSummary.autotile.mountOverride ?? "auto"}
                    @change=${(event: Event) =>
                      editor.onSelectionPatch({
                        mountOverride:
                          (event.target as HTMLSelectElement).value === "auto"
                            ? undefined
                            : (event.target as HTMLSelectElement).value,
                      })}
                  >
                    <option value="auto">Auto</option>
                    <option value="floor">Floor</option>
                    <option value="wall">Wall</option>
                    <option value="underlay">Underlay</option>
                  </select>
                </label>
                <label>
                  <span>Z Offset</span>
                  <input
                    type="number"
                    .value=${selectedSummary.autotile.zOffsetOverride != null
                      ? String(selectedSummary.autotile.zOffsetOverride)
                      : ""}
                    @input=${(event: Event) =>
                      editor.onSelectionPatch({
                        zOffsetOverride: (event.target as HTMLInputElement).value
                          ? Number.parseInt((event.target as HTMLInputElement).value, 10)
                          : undefined,
                      })}
                  />
                </label>
                <label>
                  <span>Collision</span>
                  <select
                    .value=${selectedSummary.autotile.collisionOverride == null
                      ? "auto"
                      : String(selectedSummary.autotile.collisionOverride)}
                    @change=${(event: Event) =>
                      editor.onSelectionPatch({
                        collisionOverride:
                          (event.target as HTMLSelectElement).value === "auto"
                            ? undefined
                            : (event.target as HTMLSelectElement).value === "true",
                      })}
                  >
                    <option value="auto">Auto</option>
                    <option value="true">Blocks</option>
                    <option value="false">Walkable</option>
                  </select>
                </label>
                ${
                  selectedCatalogItem?.loops
                    ? html`
                        <label>
                          <span>Loop</span>
                          <select
                            .value=${selectedSummary.autotile.loopId ?? "default"}
                            @change=${(event: Event) =>
                              editor.onSelectionPatch({
                                loopId:
                                  (event.target as HTMLSelectElement).value === "default"
                                    ? undefined
                                    : (event.target as HTMLSelectElement).value,
                              })}
                          >
                            <option value="default">Default</option>
                            <option value="off">Off</option>
                            ${selectedCatalogItem.loops.values.map(
                              (loop) => html`<option value=${loop.id}>${loop.label}</option>`,
                            )}
                          </select>
                        </label>
                      `
                    : nothing
                }
              `
            : html`
                <label>
                  <span>Role</span>
                  <select
                    .value=${selectedSummary.marker.role}
                    @change=${(event: Event) =>
                      editor.onSelectionPatch({
                        role: (event.target as HTMLSelectElement).value,
                      })}
                  >
                    ${MARKER_ROLE_OPTIONS.map(
                      (role) => html`<option value=${role}>${role}</option>`,
                    )}
                  </select>
                </label>
                <label>
                  <span>Pose</span>
                  <select
                    .value=${selectedSummary.marker.pose}
                    @change=${(event: Event) =>
                      editor.onSelectionPatch({
                        pose: (event.target as HTMLSelectElement).value,
                      })}
                  >
                    <option value="stand">Stand</option>
                    <option value="sit">Sit</option>
                  </select>
                </label>
                <label>
                  <span>Facing</span>
                  <select
                    .value=${selectedSummary.marker.facingOverride ?? "auto"}
                    @change=${(event: Event) =>
                      editor.onSelectionPatch({
                        facingOverride:
                          (event.target as HTMLSelectElement).value === "auto"
                            ? undefined
                            : (event.target as HTMLSelectElement).value,
                      })}
                  >
                    <option value="auto">Auto</option>
                    <option value="north">North</option>
                    <option value="east">East</option>
                    <option value="south">South</option>
                    <option value="west">West</option>
                  </select>
                </label>
                <label>
                  <span>Layer</span>
                  <input
                    type="number"
                    .value=${String(selectedSummary.marker.layer)}
                    @input=${(event: Event) =>
                      editor.onSelectionPatch({
                        layer:
                          Number.parseInt((event.target as HTMLInputElement).value, 10) || 0,
                      })}
                  />
                </label>
              `
      }
      <div class="mau-office__editor-meta">
        Drag the current selection to reposition it. Click empty space or use the close button to
        clear it.
      </div>
    </div>
  `;
}

function renderEditorControls(props: MauOfficeProps) {
  const editor = props.editor;
  if (!editor?.open) {
    return nothing;
  }
  return html`
    <section class="mau-office__editor" aria-label="MauOffice editor tools">
      <div class="mau-office__editor-rail" role="toolbar" aria-label="MauOffice editor tools">
        ${EDITOR_TOOL_ORDER.map(
          (tool) => {
            const active = editor.tool === tool;
            const label = active
              ? `${editor.toolPanelOpen === false ? "Show" : "Hide"} ${EDITOR_TOOL_LABELS[tool]} options`
              : EDITOR_TOOL_LABELS[tool];
            return html`
              <button
                class="mau-office__editor-tool-button ${active ? "active" : ""}"
                type="button"
                title=${label}
                aria-label=${label}
                @click=${() => editor.onToolChange(tool)}
              >
                ${icons[EDITOR_TOOL_ICONS[tool]]}
              </button>
            `;
          },
        )}
        <span class="mau-office__editor-rail-spacer" aria-hidden="true"></span>
        <button
          class="mau-office__editor-tool-button"
          type="button"
          ?disabled=${!editor.canUndo}
          title=${editor.undoShortcutLabel ? `Undo (${editor.undoShortcutLabel})` : "Undo"}
          aria-label=${editor.undoShortcutLabel ? `Undo (${editor.undoShortcutLabel})` : "Undo"}
          @click=${editor.onUndo}
        >
          ${icons.undo}
        </button>
        <button
          class="mau-office__editor-tool-button"
          type="button"
          ?disabled=${!editor.canRedo}
          title=${editor.redoShortcutLabel ? `Redo (${editor.redoShortcutLabel})` : "Redo"}
          aria-label=${editor.redoShortcutLabel ? `Redo (${editor.redoShortcutLabel})` : "Redo"}
          @click=${editor.onRedo}
        >
          ${icons.redo}
        </button>
      </div>
      ${renderEditorToolPalette(editor, props.basePath)}
    </section>
  `;
}

function renderEditorFooter(
  editor: NonNullable<MauOfficeProps["editor"]>,
  options?: { showDockedSelection?: boolean },
) {
  const canvasWidth = getMauOfficeSceneTileWidth(editor.draft);
  const canvasHeight = getMauOfficeSceneTileHeight(editor.draft);
  return html`
    <div class="mau-office__editor-footer">
      <div class="mau-office__editor-footer-panels">
        <div class="mau-office__editor-dock-status mau-office__editor-dock-status--canvas">
          <div class="mau-office__editor-heading">Canvas</div>
          <div class="mau-office__editor-meta">
            Resize the authored grid. Shrinking clips brush cells and clamps items to fit.
          </div>
          <div class="mau-office__editor-canvas-fields">
            <label>
              <span>Width</span>
              <input
                type="number"
                min=${String(MAU_OFFICE_SCENE_MIN_TILES_W)}
                max=${String(MAU_OFFICE_SCENE_MAX_TILES_W)}
                .value=${String(canvasWidth)}
                @change=${(event: Event) => {
                  const nextWidth = Number.parseInt(
                    (event.target as HTMLInputElement).value,
                    10,
                  );
                  if (Number.isFinite(nextWidth)) {
                    editor.onCanvasResize?.(nextWidth, canvasHeight);
                  }
                }}
              />
            </label>
            <label>
              <span>Height</span>
              <input
                type="number"
                min=${String(MAU_OFFICE_SCENE_MIN_TILES_H)}
                max=${String(MAU_OFFICE_SCENE_MAX_TILES_H)}
                .value=${String(canvasHeight)}
                @change=${(event: Event) => {
                  const nextHeight = Number.parseInt(
                    (event.target as HTMLInputElement).value,
                    10,
                  );
                  if (Number.isFinite(nextHeight)) {
                    editor.onCanvasResize?.(canvasWidth, nextHeight);
                  }
                }}
              />
            </label>
          </div>
        </div>
        <div class="mau-office__editor-dock-status">
          <div class="mau-office__editor-heading">Save</div>
          ${
            editor.validationErrors.length === 0
              ? html`<div class="mau-office__editor-ok">Scene is valid.</div>`
              : html`
                  <div class="mau-office__editor-error">${editor.validationErrors[0]}</div>
                  <div class="mau-office__editor-meta">
                    Fix validation errors above to enable Apply and Save & Close.
                  </div>
                `
          }
          ${editor.saveError ? html`<div class="mau-office__editor-error">${editor.saveError}</div>` : nothing}
          <div class="mau-office__editor-meta">
            Apply updates the live Control UI preview without writing the config file. Save &
            Close writes the layout to config and exits edit mode.
          </div>
        </div>
        ${options?.showDockedSelection ? renderEditorSelectionPanel(editor, { docked: true }) : nothing}
      </div>
      <div class="mau-office__editor-actions">
        <button class="btn btn--ghost" type="button" title="Close the editor." @click=${editor.onCancel}>
          Close
        </button>
        <button
          class="btn btn--ghost"
          type="button"
          ?disabled=${editor.validationErrors.length > 0}
          title=${editor.validationErrors.length > 0
            ? "Fix validation errors above to enable apply."
            : "Update the live Control UI preview without saving the config file."
          }
          @click=${editor.onApply}
        >
          Apply
        </button>
        <button
          class="btn"
          type="button"
          ?disabled=${editor.validationErrors.length > 0 || editor.saving}
          title=${editor.validationErrors.length > 0
            ? "Fix validation errors above to enable save."
            : editor.saving
              ? "Saving..."
              : "Write the layout to config and close the editor."
          }
          @click=${editor.onSave}
        >
          ${editor.saving ? "Saving..." : "Save & Close"}
        </button>
      </div>
    </div>
  `;
}

function resolveEditorViewportChrome(editor: MauOfficeProps["editor"], narrowViewport: boolean) {
  if (!editor?.open || narrowViewport) {
    return {
      leftGutterPx: 0,
      rightGutterPx: 0,
    };
  }
  return {
    leftGutterPx: MAU_OFFICE_EDITOR_RAIL_GUTTER_PX,
    rightGutterPx: 0,
  };
}

export function renderMauOffice(props: MauOfficeProps) {
  const scene = props.editor?.open ? props.editor.compiled : props.state.scene;
  const narrowViewport = isNarrowViewport();
  const effectiveRoomFocus = resolveEffectiveRoomFocus(props.state);
  const crop = cropForFocus(scene, effectiveRoomFocus);
  const editorViewportChrome = resolveEditorViewportChrome(props.editor, narrowViewport);
  const roomOptions = narrowViewport ? ROOM_ORDER.filter((roomId) => roomId !== "all") : ROOM_ORDER;
  const actors = props.state.actorOrder
    .map((actorId) => props.state.actors[actorId])
    .filter((actor): actor is OfficeActor => Boolean(actor))
    .filter((actor) => isActorVisibleInFocus(scene, actor, effectiveRoomFocus));
  const visibleActors = props.editor?.open ? [] : actors;
  const activeChatActor = props.chatWindow?.actorId
    ? (props.state.actors[props.chatWindow.actorId] ?? null)
    : null;

  return html`
    <section class="card mau-office">
      <div class="mau-office__header">
        <div>
          <div class="card-title">${t("tabs.dashboardMauOffice")}</div>
          <div class="card-sub">
            ${t("dashboard.mauOffice.subtitle")}
          </div>
        </div>
        <div class="mau-office__toolbar">
          <span class="chip">${t("dashboard.mauOffice.visibleCount", { count: String(actors.length) })}</span>
          <span class="chip">${t("dashboard.mauOffice.offsiteCount", { count: String(props.state.offsiteWorkerCount) })}</span>
          <span class="chip">${t("dashboard.mauOffice.gridStage")}</span>
          ${
            props.editor
              ? html`
                  <button class="btn btn--ghost" type="button" @click=${props.editor.onToggle}>
                    ${props.editor.open ? "View Mode" : "Edit Layout"}
                  </button>
                `
              : nothing
          }
          <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
            ${props.loading ? t("dashboard.shell.loading") : t("common.refresh")}
          </button>
        </div>
      </div>

      ${props.error ? html`<div class="callout danger mau-office__callout">${props.error}</div>` : nothing}

      <div class="mau-office__chips" role="tablist" aria-label=${t("dashboard.mauOffice.focusRoom")}>
        ${roomOptions.map(
          (roomId) => html`
            <button
              class="btn btn--ghost ${effectiveRoomFocus === roomId ? "active" : ""}"
              @click=${() => props.onRoomFocus(roomId)}
              aria-pressed=${effectiveRoomFocus === roomId}
            >
              ${labelForRoom(scene, roomId)}
            </button>
          `,
        )}
      </div>
      <div
        class="mau-office__viewport"
        style=${viewportStyle(scene, crop, editorViewportChrome)}
      >
        <div class="mau-office__camera">
          <div
            class="mau-office__stage"
            @pointerleave=${() => props.editor?.onHoverTileChange?.(null, null)}
          >
            ${guard([props.basePath, scene, props.editor?.open], () =>
              renderStaticStage(scene, props.basePath, { hideWalls: props.editor?.open }),
            )}
            ${renderAnimatedStage(scene, props.basePath, props.state.nowMs, {
              hideWalls: props.editor?.open,
            })}
            ${props.editor?.open ? renderEditorWallPreview(scene, props.basePath) : nothing}
            ${props.editor?.open ? renderEditorHoverPreview(props, scene) : nothing}
            ${props.editor?.open ? renderEditorGrid(props, scene) : nothing}
            ${props.editor?.open ? renderEditorSelectionTargets(props, scene) : nothing}
            ${props.editor?.open ? renderEditorMarkers(props, scene) : nothing}
            ${
              props.editor?.open
                ? renderEditorSelectionOutline(scene, props.editor.draft, props.editor.selection)
                : nothing
            }
            ${repeat(
              visibleActors,
              (actor) => actor.id,
              (actor) =>
                renderWorker(scene, actor, props.basePath, props.state.nowMs, props.onActorOpen),
            )}
            ${renderIdleGroupOverlays(scene, visibleActors, props.state.nowMs)}
          </div>
        </div>
        ${renderEditorControls(props)}
        ${props.editor?.open && !narrowViewport ? renderEditorSelectionPanel(props.editor) : nothing}
      </div>
      ${props.editor?.open
        ? renderEditorFooter(props.editor, { showDockedSelection: narrowViewport })
        : nothing}

      ${renderOfficeChatWindow(props, activeChatActor)}
    </section>
  `;
}
