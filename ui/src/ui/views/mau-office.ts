import { html, nothing } from "lit";
import { guard } from "lit/directives/guard.js";
import { ref } from "lit/directives/ref.js";
import { repeat } from "lit/directives/repeat.js";
import { styleMap } from "lit/directives/style-map.js";
import { t } from "../../i18n/index.ts";
import { extractText } from "../chat/message-extract.ts";
import { normalizeMessage, normalizeRoleForGrouping } from "../chat/message-normalizer.ts";
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
  MAU_OFFICE_LAYOUT,
  MAU_OFFICE_ROOM_IDS,
  MAU_OFFICE_TILE_SIZE,
  resolveMauOfficeWorkerAnimation,
  resolveMauOfficeAssetUrl,
  type MauOfficeAnchor,
  type MauOfficeWorkerAnimationId,
  type MauOfficeDirection,
  type MauOfficeRoomId,
  type MauOfficeSpritePlacement,
  type MauOfficeTilePlacement,
} from "../mau-office-contract.ts";

const ROOM_ORDER: Array<MauOfficeRoomId | "all"> = ["all", ...MAU_OFFICE_ROOM_IDS];
const RECENT_BUBBLE_WINDOW_MS = 9_000;
const MAU_OFFICE_CARD_PADDING_PX = 36;
const MAU_OFFICE_VIEWPORT_GUTTER_PX = 96;
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
};

export type MauOfficeProps = {
  loading: boolean;
  error: string | null;
  state: MauOfficeState;
  basePath: string;
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

  return MAU_OFFICE_LAYOUT.width;
}

function labelForRoom(roomId: MauOfficeRoomId | "all"): string {
  return roomId === "all"
    ? t("dashboard.mauOffice.allRooms")
    : MAU_OFFICE_LAYOUT.rooms[roomId].label;
}

function resolveEffectiveRoomFocus(state: MauOfficeState): MauOfficeRoomId | "all" {
  if (!isNarrowViewport()) {
    return state.roomFocus;
  }
  return state.roomFocus === "all" ? "desk" : state.roomFocus;
}

function cropForFocus(roomFocus: MauOfficeRoomId | "all"): Rect {
  if (roomFocus === "all") {
    return { x: 0, y: 0, width: MAU_OFFICE_LAYOUT.width, height: MAU_OFFICE_LAYOUT.height };
  }
  const room = MAU_OFFICE_LAYOUT.rooms[roomFocus];
  const padding = MAU_OFFICE_FOCUS_PADDING_TILES * MAU_OFFICE_TILE_SIZE;
  const x = clamp(room.x - padding, 0, MAU_OFFICE_LAYOUT.width);
  const y = clamp(room.y - padding, 0, MAU_OFFICE_LAYOUT.height);
  return {
    x,
    y,
    width: Math.min(room.width + padding * 2, MAU_OFFICE_LAYOUT.width - x),
    height: Math.min(room.height + padding * 2, MAU_OFFICE_LAYOUT.height - y),
  };
}

function isActorVisibleInFocus(actor: OfficeActor, roomFocus: MauOfficeRoomId | "all"): boolean {
  if (roomFocus === "all") {
    return true;
  }
  if (actor.currentRoomId === roomFocus || actor.queuedActivity?.roomId === roomFocus) {
    return true;
  }
  if (actor.path?.nodeIds.some((nodeId) => MAU_OFFICE_LAYOUT.nodes[nodeId]?.roomId === roomFocus)) {
    return true;
  }
  return MAU_OFFICE_LAYOUT.anchors[actor.anchorId]?.roomId === roomFocus;
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
  actor: OfficeActor,
  animation: { fps: number; frames: string[] },
  nowMs: number,
): string {
  const frameMs = 1000 / Math.max(1, animation.fps);
  let phaseSeed = 0;
  for (const char of actor.id) {
    phaseSeed = (phaseSeed * 33 + char.charCodeAt(0)) >>> 0;
  }
  const phaseOffsetMs = Math.floor((phaseSeed % animation.frames.length) * frameMs);
  const frameIndex = Math.floor((nowMs + phaseOffsetMs) / frameMs) % animation.frames.length;
  return animation.frames[frameIndex] ?? animation.frames[0]!;
}

function resolveWorkerSprite(
  actor: OfficeActor,
  basePath: string,
  nowMs: number,
  placement: WorkerRenderPlacement,
): string {
  const anchor = MAU_OFFICE_LAYOUT.anchors[actor.anchorId];
  const animationId = resolveWorkerAnimationId(actor, anchor);
  const animation = resolveMauOfficeWorkerAnimation(actor.rigId, animationId, placement.facing);
  return resolveMauOfficeAssetUrl(basePath, resolveAnimationFrame(actor, animation, nowMs));
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

function resolveIdleWorkerPlacement(
  actor: OfficeActor,
  nowMs: number,
): WorkerRenderPlacement | null {
  const anchor = MAU_OFFICE_LAYOUT.anchors[actor.anchorId];
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
    const phase = resolvePassingBallPhase(actor.idleAssignment.participantIds.length, nowMs);
    const jumpPx =
      participantIndex === phase.beatIndex
        ? Math.round(Math.sin(phase.beatProgress * Math.PI) * 22)
        : 0;
    return {
      x: actor.x,
      y: actor.y - jumpPx,
      facing: resolveStaticFacing(actor, anchor),
    };
  }

  if (
    actor.idleAssignment.packageId === "chasing_loop" &&
    actor.idleAssignment.participantIds.length >= 3
  ) {
    const slotAnchors = actor.idleAssignment.slotAnchorIds
      .map((anchorId) => MAU_OFFICE_LAYOUT.anchors[anchorId])
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
      };
    }
  }

  return null;
}

function resolveWorkerPlacement(actor: OfficeActor, nowMs: number): WorkerRenderPlacement {
  const anchor = MAU_OFFICE_LAYOUT.anchors[actor.anchorId];
  return (
    resolveIdleWorkerPlacement(actor, nowMs) ?? {
      x: actor.x,
      y: actor.y,
      facing: actor.path ? actor.facing : resolveStaticFacing(actor, anchor),
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

function positionForTile(tile: MauOfficeTilePlacement) {
  return styleMap({
    left: `${tile.tileX * MAU_OFFICE_TILE_SIZE}px`,
    top: `${tile.tileY * MAU_OFFICE_TILE_SIZE}px`,
    width: `${MAU_OFFICE_TILE_SIZE}px`,
    height: `${MAU_OFFICE_TILE_SIZE}px`,
  });
}

function positionForSprite(sprite: MauOfficeSpritePlacement) {
  const width = sprite.tileWidth * MAU_OFFICE_TILE_SIZE;
  const height = sprite.tileHeight * MAU_OFFICE_TILE_SIZE;
  const bottomPx = Math.round((sprite.tileY + sprite.tileHeight) * MAU_OFFICE_TILE_SIZE);
  if (sprite.anchor === "bottom-center") {
    return styleMap({
      left: `${(sprite.tileX + sprite.tileWidth / 2) * MAU_OFFICE_TILE_SIZE}px`,
      top: `${(sprite.tileY + sprite.tileHeight) * MAU_OFFICE_TILE_SIZE}px`,
      width: `${width}px`,
      height: `${height}px`,
      transform: `${sprite.mirrored ? "translate(-50%, -100%) scaleX(-1)" : "translate(-50%, -100%)"}`,
      zIndex: String(40 + bottomPx + (sprite.zOffset ?? 0)),
    });
  }
  return styleMap({
    left: `${sprite.tileX * MAU_OFFICE_TILE_SIZE}px`,
    top: `${sprite.tileY * MAU_OFFICE_TILE_SIZE}px`,
    width: `${width}px`,
    height: `${height}px`,
    transform: sprite.mirrored ? "scaleX(-1)" : undefined,
    transformOrigin: sprite.mirrored ? "center" : undefined,
    zIndex: String(30 + bottomPx + (sprite.zOffset ?? 0)),
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

function viewportStyle(crop: Rect) {
  const maxScale =
    crop.width >= MAU_OFFICE_LAYOUT.width
      ? MAU_OFFICE_MAX_FULL_SCENE_SCALE
      : MAU_OFFICE_MAX_ROOM_SCALE;
  const widthFitScale = resolveViewportAvailableWidth() / Math.max(crop.width, 1);
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
    "--stage-width-px": `${MAU_OFFICE_LAYOUT.width}px`,
    "--stage-height-px": `${MAU_OFFICE_LAYOUT.height}px`,
    "--mau-camera-scale": String(scale),
    width: `${crop.width * scale}px`,
    height: `${crop.height * scale}px`,
  });
}

function renderTile(tile: MauOfficeTilePlacement, basePath: string) {
  return html`
    <img
      class="mau-office__tile mau-office__tile--${tile.layer} mau-office__tile--${tile.roomId}"
      style=${positionForTile(tile)}
      src=${resolveMauOfficeAssetUrl(basePath, tile.asset)}
      alt=""
      draggable="false"
    />
  `;
}

function renderProp(sprite: MauOfficeSpritePlacement, basePath: string) {
  return html`
    <img
      class="mau-office__sprite mau-office__sprite--${sprite.kind} mau-office__sprite--${sprite.layer}"
      style=${positionForSprite(sprite)}
      src=${resolveMauOfficeAssetUrl(basePath, sprite.asset)}
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
  assignment: NonNullable<OfficeActor["idleAssignment"]>,
  participantIndex: number,
  nowMs: number,
): { x: number; y: number } | null {
  const anchorId = assignment.slotAnchorIds[participantIndex];
  const anchor = anchorId ? MAU_OFFICE_LAYOUT.anchors[anchorId] : null;
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

function renderIdleGroupOverlays(actors: OfficeActor[], nowMs: number) {
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
    const from = resolveVolleyballHandPoint(assignment, phase.beatIndex, nowMs);
    const to = resolveVolleyballHandPoint(assignment, phase.nextIndex, nowMs);
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
  actor: OfficeActor,
  basePath: string,
  nowMs: number,
  onActorOpen: (actorId: string) => void,
) {
  const bubble = resolveLatestBubble(actor, nowMs);
  const anchor = MAU_OFFICE_LAYOUT.anchors[actor.anchorId];
  const placement = resolveWorkerPlacement(actor, nowMs);
  const animationId = resolveWorkerAnimationId(actor, anchor);
  const spriteUrl = resolveWorkerSprite(actor, basePath, nowMs, placement);
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

function renderStaticStage(basePath: string) {
  return html`
    ${MAU_OFFICE_LAYOUT.map.floorTiles.map((tile) => renderTile(tile, basePath))}
    ${MAU_OFFICE_LAYOUT.map.wallSprites.map((sprite) => renderProp(sprite, basePath))}
    ${MAU_OFFICE_LAYOUT.map.propSprites.map((sprite) => renderProp(sprite, basePath))}
  `;
}

export function renderMauOffice(props: MauOfficeProps) {
  const narrowViewport = isNarrowViewport();
  const effectiveRoomFocus = resolveEffectiveRoomFocus(props.state);
  const crop = cropForFocus(effectiveRoomFocus);
  const roomOptions = narrowViewport ? ROOM_ORDER.filter((roomId) => roomId !== "all") : ROOM_ORDER;
  const actors = props.state.actorOrder
    .map((actorId) => props.state.actors[actorId])
    .filter((actor): actor is OfficeActor => Boolean(actor))
    .filter((actor) => isActorVisibleInFocus(actor, effectiveRoomFocus));
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
              ${labelForRoom(roomId)}
            </button>
          `,
        )}
      </div>

      <div
        class="mau-office__viewport"
        style=${viewportStyle(crop)}
      >
        <div class="mau-office__camera">
          <div class="mau-office__stage">
            ${guard(props.basePath, () => renderStaticStage(props.basePath))}
            ${repeat(
              actors,
              (actor) => actor.id,
              (actor) => renderWorker(actor, props.basePath, props.state.nowMs, props.onActorOpen),
            )}
            ${renderIdleGroupOverlays(actors, props.state.nowMs)}
          </div>
        </div>
      </div>

      ${renderOfficeChatWindow(props, activeChatActor)}
    </section>
  `;
}
