/* @vitest-environment jsdom */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { render } from "lit";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import {
  MAU_OFFICE_ASSET_PIXELS_PER_TILE,
  MAU_OFFICE_FOOT_OFFSET_Y,
  MAU_OFFICE_LAYOUT,
  MAU_OFFICE_SCENE_HEIGHT,
  MAU_OFFICE_SCENE_TILES_H,
  MAU_OFFICE_SCENE_TILES_W,
  MAU_OFFICE_SCENE_WIDTH,
  MAU_OFFICE_TILE_SIZE,
  MAU_OFFICE_WORKER_RIGS,
} from "../mau-office-contract.ts";
import {
  MAU_OFFICE_PIXELLAB_PROVENANCE,
  collectMauOfficeReferencedAssetPaths,
} from "../mau-office-pixellab-manifest.ts";
import {
  MAU_OFFICE_ASSET_SCALE_SPECS,
  MAU_OFFICE_SLEEP_FLOOR_FRAME_SPEC,
  MAU_OFFICE_WORKER_FRAME_SPEC,
  MAU_OFFICE_WORKER_RENDER_METRICS,
  resolveMauOfficeAssetScaleSpec,
  sourcePxToLogicalPx,
  type MauOfficeAssetScaleSpec,
  type MauOfficePxRange,
} from "../mau-office-scale-spec.ts";
import { renderMauOffice } from "../views/mau-office.ts";
import {
  advanceMauOfficeState,
  applyMauOfficeAgentEvent,
  applyMauOfficeSessionMessageEvent,
  applyMauOfficeSessionToolEvent,
  createEmptyMauOfficeState,
  createMauOfficeSessionTarget,
  loadMauOffice,
  setMauOfficeRoomFocus,
  type MauOfficeState,
  type OfficeActor,
  type OfficeActivity,
  type OfficeBubbleEntry,
  type OfficePath,
} from "./mau-office.ts";

function installMatchMediaStub(matches = false) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function installViewportWidthStub(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  Object.defineProperty(document.documentElement, "clientWidth", {
    configurable: true,
    value: width,
  });
}

function makeActivity(
  id: string,
  kind: OfficeActivity["kind"],
  roomId: OfficeActivity["roomId"],
  anchorId: string,
  label: string,
): OfficeActivity {
  return {
    id,
    kind,
    label,
    priority: 50,
    roomId,
    anchorId,
    source: "snapshot",
  };
}

function makeBubble(text: string): OfficeBubbleEntry {
  return {
    id: `bubble:${text}`,
    text,
    atMs: 0,
    kind: "desk_work",
  };
}

function makeActor(
  overrides: Partial<OfficeActor> & Pick<OfficeActor, "id" | "anchorId" | "nodeId">,
): OfficeActor {
  const anchor = MAU_OFFICE_LAYOUT.anchors[overrides.anchorId];
  return {
    id: overrides.id,
    kind: "worker",
    label: "Mau Worker",
    shortLabel: "MW",
    agentId: "agent-1",
    sessionKey: "agent:main:test",
    roleHint: "desk",
    homeAnchorId: overrides.anchorId,
    currentRoomId: anchor.roomId === "outside" ? "outside" : anchor.roomId,
    anchorId: overrides.anchorId,
    nodeId: overrides.nodeId,
    x: anchor.x,
    y: anchor.y,
    facing: "south",
    rigId: "cat",
    currentActivity: makeActivity("desk", "desk_work", "desk", overrides.anchorId, "Working"),
    snapshotActivity: null,
    queuedActivity: null,
    pendingActivity: null,
    path: null,
    idleAssignment: null,
    bubbles: [],
    latestSupportDialogue: null,
    lastSeenAtMs: 0,
    ...overrides,
  };
}

async function readPngSize(assetPath: string): Promise<{ width: number; height: number }> {
  const buffer = await readFile(path.resolve(process.cwd(), "ui/public", assetPath));
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

async function readPngOpaqueBounds(assetPath: string): Promise<{
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}> {
  const { data, info } = await sharp(path.resolve(process.cwd(), "ui/public", assetPath))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + 3];
      if (alpha <= 8) {
        continue;
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return {
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    offsetX: minX,
    offsetY: minY,
  };
}

async function readAssetHash(assetPath: string): Promise<string> {
  const buffer = await readFile(path.resolve(process.cwd(), "ui/public", assetPath));
  return createHash("sha256").update(buffer).digest("hex");
}

function collectWorkerFrameAssets() {
  return Object.values(MAU_OFFICE_WORKER_RIGS).flatMap((rig) => [
    ...Object.values(rig.stand).flatMap((animation) => animation.frames),
    ...Object.values(rig.sit).flatMap((animation) => animation.frames),
    ...Object.values(rig.walk).flatMap((animation) => animation.frames),
    ...Object.values(rig.reach).flatMap((animation) => animation.frames),
    ...Object.values(rig.dance).flatMap((animation) => animation.frames),
    ...Object.values(rig.jump).flatMap((animation) => animation.frames),
    ...Object.values(rig.chase).flatMap((animation) => animation.frames),
    ...Object.values(rig.chat).flatMap((animation) => animation.frames),
    ...rig.sleepFloor.frames,
  ]);
}

function expectWithinRange(value: number, range: MauOfficePxRange, label: string) {
  expect(
    value,
    `${label} expected ${range.min}-${range.max}, received ${value}`,
  ).toBeGreaterThanOrEqual(range.min);
  expect(
    value,
    `${label} expected ${range.min}-${range.max}, received ${value}`,
  ).toBeLessThanOrEqual(range.max);
}

function normalizeStyle(style: string | null): string {
  return (style ?? "").replace(/\s+/g, "");
}

function parseStyleNumber(style: string, key: string): number {
  const match = new RegExp(`${key}:([\\-\\d.]+)(?:px)?`).exec(normalizeStyle(style));
  return Number(match?.[1]);
}

describe("createEmptyMauOfficeState", () => {
  it("resolves config defaults and overrides", () => {
    const state = createEmptyMauOfficeState({
      ui: {
        mauOffice: {
          enabled: false,
          maxVisibleWorkers: 4,
          idlePackages: {
            enabled: ["snack_table"],
          },
        },
      },
    });

    expect(state.config.enabled).toBe(false);
    expect(state.config.maxVisibleWorkers).toBe(4);
    expect(state.config.idlePackages.enabled).toEqual(["snack_table"]);
  });
});

describe("loadMauOffice", () => {
  it("stages free workers into volleyball, chat, and chase groups in the idle room", async () => {
    const nowMs = 1_800_000;
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(nowMs);
    const host = {
      client: {
        request: vi.fn(async (method: string) => {
          if (method === "agents.list") {
            return {
              defaultId: "main",
              mainKey: "main",
              scope: "operator",
              agents: Array.from({ length: 9 }, (_, index) => ({
                id: `agent-${index + 1}`,
                name: `Agent ${index + 1}`,
              })),
            };
          }
          if (method === "sessions.list") {
            return {
              ts: nowMs,
              path: "/tmp/sessions.json",
              count: 0,
              defaults: {
                modelProvider: null,
                model: null,
                contextTokens: null,
              },
              sessions: [],
            };
          }
          if (method === "system-presence") {
            return [];
          }
          if (method === "tools.catalog") {
            return { groups: [] };
          }
          throw new Error(`Unexpected method ${method}`);
        }),
      },
      connected: true,
      configSnapshot: {
        config: {
          ui: {
            mauOffice: {
              maxVisibleWorkers: 9,
            },
          },
        },
      },
      mauOfficeLoading: false,
      mauOfficeError: null,
      mauOfficeState: createEmptyMauOfficeState(),
      mauOfficeReloadTimer: null,
    };

    try {
      await loadMauOffice(host as never);
    } finally {
      dateNowSpy.mockRestore();
    }

    const settled = advanceMauOfficeState(host.mauOfficeState, nowMs + 12_000);
    const workers = settled.actorOrder
      .map((actorId) => settled.actors[actorId])
      .filter((actor): actor is OfficeActor => Boolean(actor) && actor.kind === "worker");
    const packageCounts = workers.reduce<Record<string, number>>((acc, actor) => {
      const packageId = actor.idleAssignment?.packageId;
      if (packageId) {
        acc[packageId] = (acc[packageId] ?? 0) + 1;
      }
      return acc;
    }, {});

    expect(packageCounts.passing_ball_court).toBe(4);
    expect(packageCounts.chess_table).toBe(2);
    expect(packageCounts.chasing_loop).toBe(3);
  });

  it("keeps support visitor snapshot previews as the visitor's actual latest message", async () => {
    const host = {
      client: {
        request: vi.fn(async (method: string) => {
          if (method === "agents.list") {
            return {
              defaultId: "main",
              mainKey: "main",
              scope: "operator",
              agents: [],
            };
          }
          if (method === "sessions.list") {
            return {
              ts: 0,
              path: "/tmp/sessions.json",
              count: 1,
              defaults: {
                modelProvider: null,
                model: null,
                contextTokens: null,
              },
              sessions: [
                {
                  key: "agent:main:direct:customer-42",
                  kind: "direct",
                  displayName: "Samiadji",
                  lastMessagePreview: "Assistant reply that should not land on the visitor.",
                  updatedAt: Date.now(),
                },
              ],
            };
          }
          if (method === "sessions.preview") {
            return {
              ts: 0,
              previews: [
                {
                  key: "agent:main:direct:customer-42",
                  status: "ok",
                  items: [
                    {
                      role: "user",
                      text: `Conversation info (untrusted metadata):
\`\`\`json
{"message_id":"abc123","sender_id":"customer-42"}
\`\`\`

Need help recovering the shared workspace password.`,
                    },
                    {
                      role: "assistant",
                      text: "Assistant reply that should not land on the visitor.",
                    },
                  ],
                },
              ],
            };
          }
          if (method === "system-presence") {
            return [];
          }
          if (method === "tools.catalog") {
            return { groups: [] };
          }
          throw new Error(`unexpected method ${method}`);
        }),
      },
      connected: true,
      configSnapshot: null,
      mauOfficeLoading: false,
      mauOfficeError: null,
      mauOfficeState: createEmptyMauOfficeState(),
      mauOfficeReloadTimer: null,
    };

    await loadMauOffice(host as never);
    const advanced = advanceMauOfficeState(host.mauOfficeState, Date.now() + 8_000);
    const actorId = advanced.actorOrder[0];
    expect(actorId).toBe("visitor:agent:main:direct:customer-42");
    expect(advanced.actors[actorId!]?.anchorId).toBe("support_customer_2");
    expect(advanced.actors[actorId!]?.currentActivity.bubbleText).toBe(
      "Need help recovering the shared workspace password.",
    );
    expect(advanced.actors[actorId!]?.bubbles[0]?.text).toBe(
      "Need help recovering the shared workspace password.",
    );
  });

  it("keeps support worker snapshot previews on the assistant side instead of copying the visitor text", async () => {
    const host = {
      client: {
        request: vi.fn(async (method: string) => {
          if (method === "agents.list") {
            return {
              defaultId: "main",
              mainKey: "main",
              scope: "operator",
              agents: [{ id: "main", name: "Main" }],
            };
          }
          if (method === "sessions.list") {
            return {
              ts: 0,
              path: "/tmp/sessions.json",
              count: 1,
              defaults: {
                modelProvider: null,
                model: null,
                contextTokens: null,
              },
              sessions: [
                {
                  key: "agent:main:direct:customer-42",
                  kind: "direct",
                  displayName: "Samiadji",
                  lastMessagePreview: "Need help recovering the shared workspace password.",
                  updatedAt: Date.now(),
                },
              ],
            };
          }
          if (method === "sessions.preview") {
            return {
              ts: 0,
              previews: [
                {
                  key: "agent:main:direct:customer-42",
                  status: "ok",
                  items: [
                    {
                      role: "user",
                      text: "Need help recovering the shared workspace password.",
                    },
                    {
                      role: "assistant",
                      text: "I can help with that. Let me check your access.",
                    },
                  ],
                },
              ],
            };
          }
          if (method === "system-presence") {
            return [];
          }
          if (method === "tools.catalog") {
            return {
              groups: [{ label: "Support", tools: [{ id: "sessions_send", label: "Reply" }] }],
            };
          }
          throw new Error(`unexpected method ${method}`);
        }),
      },
      connected: true,
      configSnapshot: null,
      mauOfficeLoading: false,
      mauOfficeError: null,
      mauOfficeState: createEmptyMauOfficeState(),
      mauOfficeReloadTimer: null,
    };

    await loadMauOffice(host as never);

    expect(host.mauOfficeState.actors["worker:main"]?.snapshotActivity?.bubbleText).toBe(
      "I can help with that. Let me check your access.",
    );
    expect(
      host.mauOfficeState.actors["visitor:agent:main:direct:customer-42"]?.snapshotActivity
        ?.bubbleText,
    ).toBe("Need help recovering the shared workspace password.");
  });

  it("hydrates delegated subagent sessions as meeting-room work instead of support", async () => {
    const nowMs = Date.now();
    const host = {
      client: {
        request: vi.fn(async (method: string) => {
          if (method === "agents.list") {
            return {
              defaultId: "ops",
              mainKey: "main",
              scope: "operator",
              agents: [{ id: "ops", name: "Ops" }],
            };
          }
          if (method === "sessions.list") {
            return {
              ts: nowMs,
              path: "/tmp/sessions.json",
              count: 1,
              defaults: {
                modelProvider: null,
                model: null,
                contextTokens: null,
              },
              sessions: [
                {
                  key: "agent:ops:subagent:delegate-review",
                  kind: "direct",
                  displayName: "Delegate Review",
                  updatedAt: nowMs,
                },
              ],
            };
          }
          if (method === "sessions.preview") {
            return { ts: nowMs, previews: [] };
          }
          if (method === "system-presence") {
            return [];
          }
          if (method === "tools.catalog") {
            return {
              groups: [
                { label: "Coordination", tools: [{ id: "sessions_spawn", label: "Delegate" }] },
              ],
            };
          }
          throw new Error(`unexpected method ${method}`);
        }),
      },
      connected: true,
      configSnapshot: null,
      mauOfficeLoading: false,
      mauOfficeError: null,
      mauOfficeState: createEmptyMauOfficeState(),
      mauOfficeReloadTimer: null,
    };

    await loadMauOffice(host as never);

    expect(host.mauOfficeState.actors["worker:ops"]?.snapshotActivity?.kind).toBe("meeting");
    expect(host.mauOfficeState.actors["worker:ops"]?.snapshotActivity?.roomId).toBe("meeting");
    expect(
      host.mauOfficeState.actors["visitor:agent:ops:subagent:delegate-review"]?.snapshotActivity
        ?.kind,
    ).toBe("meeting");
  });

  it("does not roll a support worker back to an older preview when a fresher assistant bubble already exists", async () => {
    const nowMs = Date.now();
    const supportAnchor = MAU_OFFICE_LAYOUT.anchors.support_staff_1;
    const host = {
      client: {
        request: vi.fn(async (method: string) => {
          if (method === "agents.list") {
            return {
              defaultId: "main",
              mainKey: "main",
              scope: "operator",
              agents: [{ id: "main", name: "Main" }],
            };
          }
          if (method === "sessions.list") {
            return {
              ts: 0,
              path: "/tmp/sessions.json",
              count: 1,
              defaults: {
                modelProvider: null,
                model: null,
                contextTokens: null,
              },
              sessions: [
                {
                  key: "agent:main:direct:customer-42",
                  kind: "direct",
                  displayName: "Samiadji",
                  lastMessagePreview: "Older assistant reply that should not win.",
                  updatedAt: nowMs - 10_000,
                },
              ],
            };
          }
          if (method === "sessions.preview") {
            return {
              ts: 0,
              previews: [
                {
                  key: "agent:main:direct:customer-42",
                  status: "ok",
                  items: [
                    {
                      role: "user",
                      text: "Can you help with my access?",
                    },
                    {
                      role: "assistant",
                      text: "Older assistant reply that should not win.",
                    },
                  ],
                },
              ],
            };
          }
          if (method === "system-presence") {
            return [];
          }
          if (method === "tools.catalog") {
            return { groups: [] };
          }
          throw new Error(`unexpected method ${method}`);
        }),
      },
      connected: true,
      configSnapshot: null,
      mauOfficeLoading: false,
      mauOfficeError: null,
      mauOfficeState: {
        ...createEmptyMauOfficeState(),
        loaded: true,
        actorOrder: ["worker:main"],
        actors: {
          "worker:main": makeActor({
            id: "worker:main",
            agentId: "main",
            sessionKey: "agent:main:direct:customer-42",
            anchorId: "support_staff_1",
            nodeId: "support_center",
            roleHint: "support",
            homeAnchorId: "desk_worker_1",
            currentRoomId: "support",
            x: supportAnchor.x,
            y: supportAnchor.y,
            currentActivity: {
              id: "event-message:assistant",
              kind: "customer_support",
              label: "Handling support",
              bubbleText: "Latest assistant reply should stay visible.",
              priority: 70,
              roomId: "support",
              anchorId: "support_staff_1",
              source: "event",
              expiresAtMs: nowMs + 10_000,
            },
            bubbles: [
              {
                id: "worker:latest",
                text: "Latest assistant reply should stay visible.",
                atMs: nowMs,
                kind: "customer_support",
              },
            ],
          }),
        },
      },
      mauOfficeReloadTimer: null,
    };

    await loadMauOffice(host as never);

    expect(host.mauOfficeState.actors["worker:main"]?.snapshotActivity?.bubbleText).toBe(
      "Latest assistant reply should stay visible.",
    );
  });

  it("keeps the newest assistant reply after lifecycle end and an immediate support snapshot reload", async () => {
    const nowMs = Date.now();
    const supportAnchor = MAU_OFFICE_LAYOUT.anchors.support_staff_1;
    const liveState = applyMauOfficeAgentEvent(
      applyMauOfficeSessionMessageEvent(
        {
          ...createEmptyMauOfficeState(),
          loaded: true,
          actorOrder: ["worker:main"],
          actors: {
            "worker:main": makeActor({
              id: "worker:main",
              agentId: "main",
              sessionKey: "agent:main:direct:customer-42",
              anchorId: "support_staff_1",
              nodeId: "support_center",
              roleHint: "support",
              homeAnchorId: "desk_worker_1",
              currentRoomId: "support",
              x: supportAnchor.x,
              y: supportAnchor.y,
              currentActivity: {
                id: "event-message:assistant",
                kind: "customer_support",
                label: "Handling support",
                bubbleText: "Previous assistant reply that should not win.",
                priority: 70,
                roomId: "support",
                anchorId: "support_staff_1",
                source: "event",
                expiresAtMs: nowMs + 10_000,
              },
              snapshotActivity: {
                id: "snapshot-support",
                kind: "customer_support",
                label: "Handling support",
                bubbleText: "Previous assistant reply that should not win.",
                priority: 70,
                roomId: "support",
                anchorId: "support_staff_1",
                source: "snapshot",
              },
              bubbles: [
                {
                  id: "worker:old",
                  text: "Previous assistant reply that should not win.",
                  atMs: nowMs - 1_000,
                  kind: "customer_support",
                },
              ],
            }),
          },
        },
        {
          sessionKey: "agent:main:direct:customer-42",
          messageSeq: 9,
          messageId: "msg-9",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "This is the actual newest assistant reply." }],
          },
        },
        nowMs,
      ),
      {
        sessionKey: "agent:main:direct:customer-42",
        stream: "lifecycle",
        data: { phase: "end" },
      },
      nowMs + 1,
    );

    const host = {
      client: {
        request: vi.fn(async (method: string) => {
          if (method === "agents.list") {
            return {
              defaultId: "main",
              mainKey: "main",
              scope: "operator",
              agents: [{ id: "main", name: "Main" }],
            };
          }
          if (method === "sessions.list") {
            return {
              ts: 0,
              path: "/tmp/sessions.json",
              count: 1,
              defaults: {
                modelProvider: null,
                model: null,
                contextTokens: null,
              },
              sessions: [
                {
                  key: "agent:main:direct:customer-42",
                  kind: "direct",
                  displayName: "Samiadji",
                  lastMessagePreview: "Previous assistant reply that should not win.",
                  updatedAt: nowMs + 2,
                },
              ],
            };
          }
          if (method === "sessions.preview") {
            return {
              ts: 0,
              previews: [
                {
                  key: "agent:main:direct:customer-42",
                  status: "ok",
                  items: [
                    { role: "user", text: "Can you help with my access?" },
                    { role: "assistant", text: "Previous assistant reply that should not win." },
                  ],
                },
              ],
            };
          }
          if (method === "system-presence") {
            return [];
          }
          if (method === "tools.catalog") {
            return { groups: [] };
          }
          throw new Error(`unexpected method ${method}`);
        }),
      },
      connected: true,
      configSnapshot: null,
      mauOfficeLoading: false,
      mauOfficeError: null,
      mauOfficeState: liveState,
      mauOfficeReloadTimer: null,
    };

    await loadMauOffice(host as never);

    const worker = host.mauOfficeState.actors["worker:main"]!;
    expect(worker.snapshotActivity?.bubbleText).toBe("This is the actual newest assistant reply.");
    expect(worker.latestSupportDialogue?.text).toBe("This is the actual newest assistant reply.");
  });

  it("keeps the newest visitor request after an immediate support snapshot reload", async () => {
    const nowMs = Date.now();
    const liveState = applyMauOfficeSessionMessageEvent(
      createEmptyMauOfficeState(),
      {
        sessionKey: "agent:main:direct:customer-42",
        messageSeq: 5,
        messageId: "msg-user-5",
        message: {
          role: "user",
          text: "This is the actual newest customer request.",
        },
      },
      nowMs,
    );

    const host = {
      client: {
        request: vi.fn(async (method: string) => {
          if (method === "agents.list") {
            return {
              defaultId: "main",
              mainKey: "main",
              scope: "operator",
              agents: [],
            };
          }
          if (method === "sessions.list") {
            return {
              ts: 0,
              path: "/tmp/sessions.json",
              count: 1,
              defaults: {
                modelProvider: null,
                model: null,
                contextTokens: null,
              },
              sessions: [
                {
                  key: "agent:main:direct:customer-42",
                  kind: "direct",
                  displayName: "Samiadji",
                  lastMessagePreview: "Older request that should not win.",
                  updatedAt: nowMs + 2,
                },
              ],
            };
          }
          if (method === "sessions.preview") {
            return {
              ts: 0,
              previews: [
                {
                  key: "agent:main:direct:customer-42",
                  status: "ok",
                  items: [
                    { role: "user", text: "Older request that should not win." },
                    { role: "assistant", text: "I can help with that." },
                  ],
                },
              ],
            };
          }
          if (method === "system-presence") {
            return [];
          }
          if (method === "tools.catalog") {
            return { groups: [] };
          }
          throw new Error(`unexpected method ${method}`);
        }),
      },
      connected: true,
      configSnapshot: null,
      mauOfficeLoading: false,
      mauOfficeError: null,
      mauOfficeState: liveState,
      mauOfficeReloadTimer: null,
    };

    await loadMauOffice(host as never);

    const visitor = host.mauOfficeState.actors["visitor:agent:main:direct:customer-42"]!;
    expect(visitor.snapshotActivity?.bubbleText).toBe(
      "This is the actual newest customer request.",
    );
    expect(visitor.latestSupportDialogue?.text).toBe("This is the actual newest customer request.");
  });

  it("queues fresh snapshot work behind an in-flight worker path instead of restarting movement", async () => {
    const startedAt = Date.now();
    const walkingPath: OfficePath = {
      nodeIds: ["desk_center", "desk_door", "west_spine"],
      waypoints: [
        {
          x: MAU_OFFICE_LAYOUT.nodes.desk_center.x,
          y: MAU_OFFICE_LAYOUT.nodes.desk_center.y,
          nodeId: "desk_center",
        },
        {
          x: MAU_OFFICE_LAYOUT.nodes.desk_door.x,
          y: MAU_OFFICE_LAYOUT.nodes.desk_door.y,
          nodeId: "desk_door",
        },
        {
          x: MAU_OFFICE_LAYOUT.nodes.west_spine.x,
          y: MAU_OFFICE_LAYOUT.nodes.west_spine.y,
          nodeId: "west_spine",
        },
      ],
      segmentIndex: 0,
      segmentStartedAtMs: startedAt,
      segmentDurationMs: 900,
      targetAnchorId: "desk_board",
      mode: "move",
    };
    const host = {
      client: {
        request: vi.fn(async (method: string) => {
          if (method === "agents.list") {
            return {
              defaultId: "main",
              mainKey: "main",
              scope: "operator",
              agents: [{ id: "main", name: "Main" }],
            };
          }
          if (method === "sessions.list") {
            return {
              ts: 0,
              path: "/tmp/sessions.json",
              count: 1,
              defaults: {
                modelProvider: null,
                model: null,
                contextTokens: null,
              },
              sessions: [
                {
                  key: "agent:main:direct:customer-42",
                  kind: "direct",
                  displayName: "Samiadji",
                  lastMessagePreview: "Need help with the invoice.",
                  updatedAt: Date.now(),
                },
              ],
            };
          }
          if (method === "sessions.preview") {
            return {
              ts: 0,
              previews: [],
            };
          }
          if (method === "system-presence") {
            return [];
          }
          if (method === "tools.catalog") {
            return { groups: [] };
          }
          throw new Error(`unexpected method ${method}`);
        }),
      },
      connected: true,
      configSnapshot: null,
      mauOfficeLoading: false,
      mauOfficeError: null,
      mauOfficeState: {
        ...createEmptyMauOfficeState(),
        loaded: true,
        actorOrder: ["worker:main"],
        visibleAgentIds: ["main"],
        actors: {
          "worker:main": makeActor({
            id: "worker:main",
            agentId: "main",
            sessionKey: "agent:main:main",
            anchorId: "desk_worker_1",
            nodeId: "desk_center",
            homeAnchorId: "desk_worker_1",
            currentActivity: {
              id: "walking",
              kind: "walking",
              label: "Walking",
              priority: 30,
              roomId: "desk",
              anchorId: "desk_board",
              source: "event",
              expiresAtMs: startedAt + 10_000,
            },
            queuedActivity: {
              id: "event-board",
              kind: "whiteboard_update",
              label: "Updating the whiteboard",
              priority: 50,
              roomId: "desk",
              anchorId: "desk_board",
              source: "event",
              expiresAtMs: startedAt + 10_000,
            },
            path: walkingPath,
            x: MAU_OFFICE_LAYOUT.nodes.desk_center.x,
            y: MAU_OFFICE_LAYOUT.nodes.desk_center.y,
            lastSeenAtMs: startedAt,
          }),
        },
      },
      mauOfficeReloadTimer: null,
    };

    await loadMauOffice(host as never);
    const actor = host.mauOfficeState.actors["worker:main"]!;

    expect(actor.currentActivity.kind).toBe("walking");
    expect(actor.path).toMatchObject(walkingPath);
    expect(actor.queuedActivity?.id).toBe("event-board");
    expect(actor.snapshotActivity?.kind).toBe("customer_support");
    expect(actor.pendingActivity?.kind).toBe("customer_support");
    expect(actor.pendingActivity?.anchorId).toBe("support_staff_1");
  });

  it("walks through same-node desk targets instead of snapping across the room", () => {
    const nowMs = Date.now();
    const currentAnchor = MAU_OFFICE_LAYOUT.anchors.desk_worker_1;
    const nextAnchor = MAU_OFFICE_LAYOUT.anchors.desk_worker_2;
    const advanced = advanceMauOfficeState(
      {
        ...createEmptyMauOfficeState(),
        loaded: true,
        nowMs,
        actorOrder: ["worker:desk"],
        actors: {
          "worker:desk": makeActor({
            id: "worker:desk",
            anchorId: "desk_worker_1",
            nodeId: "desk_center",
            x: currentAnchor.x,
            y: currentAnchor.y,
            currentActivity: {
              id: "event-expired",
              kind: "whiteboard_update",
              label: "Updating the whiteboard",
              priority: 50,
              roomId: "desk",
              anchorId: "desk_board",
              source: "event",
              expiresAtMs: nowMs - 1,
            },
            snapshotActivity: makeActivity(
              "desk-work",
              "desk_work",
              "desk",
              "desk_worker_2",
              "Working at desk",
            ),
            lastSeenAtMs: nowMs,
          }),
        },
      },
      nowMs,
    );
    const actor = advanced.actors["worker:desk"]!;

    expect(actor.currentActivity.kind).toBe("walking");
    expect(actor.path?.targetAnchorId).toBe("desk_worker_2");
    expect(actor.path?.waypoints.length).toBeGreaterThan(1);
    expect(actor.anchorId).toBe("desk_worker_1");
    expect(actor.path?.waypoints[actor.path.waypoints.length - 1]).not.toMatchObject({
      x: currentAnchor.x,
      y: currentAnchor.y,
    });
    const waypointDeskRows = actor.path?.waypoints.map((waypoint) =>
      Math.round((waypoint.y - MAU_OFFICE_FOOT_OFFSET_Y) / MAU_OFFICE_TILE_SIZE),
    );
    expect(waypointDeskRows?.includes(3)).toBe(false);
    expect(waypointDeskRows?.includes(4)).toBe(false);
  });

  it("routes support movement around the counter instead of cutting through its blocked tiles", () => {
    const nowMs = Date.now();
    const customerAnchor = MAU_OFFICE_LAYOUT.anchors.support_customer_2;
    const advanced = advanceMauOfficeState(
      {
        ...createEmptyMauOfficeState(),
        loaded: true,
        nowMs,
        actorOrder: ["worker:support"],
        actors: {
          "worker:support": makeActor({
            id: "worker:support",
            agentId: "main",
            roleHint: "support",
            sessionKey: "agent:main:direct:customer-42",
            anchorId: "support_customer_2",
            nodeId: "support_customer_2",
            homeAnchorId: "desk_worker_1",
            currentRoomId: "support",
            x: customerAnchor.x,
            y: customerAnchor.y,
            currentActivity: {
              id: "event-expired",
              kind: "customer_support",
              label: "Handling support",
              priority: 70,
              roomId: "support",
              anchorId: "support_customer_2",
              source: "event",
              expiresAtMs: nowMs - 1,
            },
            snapshotActivity: makeActivity(
              "support",
              "customer_support",
              "support",
              "support_staff_2",
              "Handling support",
            ),
            lastSeenAtMs: nowMs,
          }),
        },
      },
      nowMs,
    );
    const actor = advanced.actors["worker:support"]!;
    const blockedCounterTiles = new Set<string>();
    for (let tileX = 17; tileX <= 22; tileX += 1) {
      for (let tileY = 14; tileY <= 15; tileY += 1) {
        blockedCounterTiles.add(`${tileX},${tileY}`);
      }
    }

    expect(actor.currentActivity.kind).toBe("walking");
    expect(actor.path?.targetAnchorId).toBe("support_staff_2");
    const waypointTiles = actor.path?.waypoints.map((waypoint) => ({
      tileX: Math.round((waypoint.x - MAU_OFFICE_TILE_SIZE / 2) / MAU_OFFICE_TILE_SIZE),
      tileY: Math.round((waypoint.y - MAU_OFFICE_FOOT_OFFSET_Y) / MAU_OFFICE_TILE_SIZE),
    }));
    expect(
      waypointTiles?.some((tile) => blockedCounterTiles.has(`${tile.tileX},${tile.tileY}`)),
    ).toBe(false);
  });

  it("treats configured heartbeat sessions as meeting-room work instead of support visitors", async () => {
    const host = {
      client: {
        request: vi.fn(async (method: string) => {
          if (method === "agents.list") {
            return {
              defaultId: "main",
              mainKey: "main",
              scope: "operator",
              agents: [{ id: "main", name: "Main" }],
            };
          }
          if (method === "sessions.list") {
            return {
              ts: 0,
              path: "/tmp/sessions.json",
              count: 1,
              defaults: {
                modelProvider: null,
                model: null,
                contextTokens: null,
              },
              sessions: [
                {
                  key: "agent:main:direct:heartbeat-room",
                  kind: "direct",
                  displayName: "Heartbeat room",
                  status: "running",
                  updatedAt: Date.now(),
                },
              ],
            };
          }
          if (method === "sessions.preview") {
            return {
              ts: 0,
              previews: [],
            };
          }
          if (method === "system-presence") {
            return [];
          }
          if (method === "tools.catalog") {
            return { groups: [] };
          }
          throw new Error(`unexpected method ${method}`);
        }),
      },
      connected: true,
      configSnapshot: {
        config: {
          agents: {
            defaults: {
              heartbeat: {
                session: "direct:heartbeat-room",
              },
            },
          },
        },
      },
      mauOfficeLoading: false,
      mauOfficeError: null,
      mauOfficeState: createEmptyMauOfficeState(),
      mauOfficeReloadTimer: null,
    };

    await loadMauOffice(host as never);

    const worker = host.mauOfficeState.actors["worker:main"]!;
    expect(worker.snapshotActivity?.id).toBe("snapshot-heartbeat");
    expect(worker.snapshotActivity?.kind).toBe("meeting");
    expect(host.mauOfficeState.actors["visitor:agent:main:direct:heartbeat-room"]).toBeUndefined();
  });

  it("ignores configured heartbeat sessions once the run has finished", async () => {
    const host = {
      client: {
        request: vi.fn(async (method: string) => {
          if (method === "agents.list") {
            return {
              defaultId: "main",
              mainKey: "main",
              scope: "operator",
              agents: [{ id: "main", name: "Main" }],
            };
          }
          if (method === "sessions.list") {
            return {
              ts: 0,
              path: "/tmp/sessions.json",
              count: 1,
              defaults: {
                modelProvider: null,
                model: null,
                contextTokens: null,
              },
              sessions: [
                {
                  key: "agent:main:direct:heartbeat-room",
                  kind: "direct",
                  displayName: "Heartbeat room",
                  status: "done",
                  updatedAt: Date.now(),
                },
              ],
            };
          }
          if (method === "sessions.preview") {
            return {
              ts: 0,
              previews: [],
            };
          }
          if (method === "system-presence") {
            return [];
          }
          if (method === "tools.catalog") {
            return { groups: [] };
          }
          throw new Error(`unexpected method ${method}`);
        }),
      },
      connected: true,
      configSnapshot: {
        config: {
          agents: {
            defaults: {
              heartbeat: {
                session: "direct:heartbeat-room",
              },
            },
          },
        },
      },
      mauOfficeLoading: false,
      mauOfficeError: null,
      mauOfficeState: createEmptyMauOfficeState(),
      mauOfficeReloadTimer: null,
    };

    await loadMauOffice(host as never);

    const worker = host.mauOfficeState.actors["worker:main"]!;
    expect(worker.snapshotActivity).toBeNull();
    expect(host.mauOfficeState.actors["visitor:agent:main:direct:heartbeat-room"]).toBeUndefined();
  });

  it("keeps an already-idle worker parked in the break room when only the main session refreshes", async () => {
    const breakAnchor = MAU_OFFICE_LAYOUT.anchors.break_arcade;
    const host = {
      client: {
        request: vi.fn(async (method: string) => {
          if (method === "agents.list") {
            return {
              defaultId: "main",
              mainKey: "main",
              scope: "operator",
              agents: [{ id: "main", name: "Main" }],
            };
          }
          if (method === "sessions.list") {
            return {
              ts: 0,
              path: "/tmp/sessions.json",
              count: 1,
              defaults: {
                modelProvider: null,
                model: null,
                contextTokens: null,
              },
              sessions: [
                {
                  key: "agent:main:main",
                  kind: "global",
                  displayName: "Main",
                  lastMessagePreview: "Still thinking about the task.",
                  updatedAt: Date.now(),
                },
              ],
            };
          }
          if (method === "sessions.preview") {
            return {
              ts: 0,
              previews: [],
            };
          }
          if (method === "system-presence") {
            return [];
          }
          if (method === "tools.catalog") {
            return { groups: [] };
          }
          throw new Error(`unexpected method ${method}`);
        }),
      },
      connected: true,
      configSnapshot: null,
      mauOfficeLoading: false,
      mauOfficeError: null,
      mauOfficeState: {
        ...createEmptyMauOfficeState(),
        loaded: true,
        actorOrder: ["worker:main"],
        visibleAgentIds: ["main"],
        actors: {
          "worker:main": makeActor({
            id: "worker:main",
            agentId: "main",
            sessionKey: "agent:main:main",
            anchorId: "break_arcade",
            nodeId: "break_center",
            homeAnchorId: "desk_worker_1",
            currentRoomId: "break",
            x: breakAnchor.x,
            y: breakAnchor.y,
            currentActivity: {
              id: "idle-fallback",
              kind: "idle",
              label: "Taking a breather",
              priority: 10,
              roomId: "break",
              anchorId: "break_arcade",
              source: "idle",
              expiresAtMs: Date.now() + 18_000,
            },
            lastSeenAtMs: Date.now(),
          }),
        },
      },
      mauOfficeReloadTimer: null,
    };

    await loadMauOffice(host as never);
    const actor = host.mauOfficeState.actors["worker:main"]!;

    expect(actor.snapshotActivity).toBeNull();
    expect(actor.anchorId).toBe("break_arcade");
    expect(actor.currentRoomId).toBe("break");
    expect(actor.currentActivity.kind).toBe("idle");
    expect(actor.path).toBeNull();
  });
});

describe("advanceMauOfficeState", () => {
  it("derives idle-room animation ids from the assigned break-room role", () => {
    const nowMs = 7_200;
    const volleyAnchors = [
      MAU_OFFICE_LAYOUT.anchors.break_volley_1,
      MAU_OFFICE_LAYOUT.anchors.break_volley_2,
      MAU_OFFICE_LAYOUT.anchors.break_volley_3,
      MAU_OFFICE_LAYOUT.anchors.break_volley_4,
    ];
    const chaseAnchors = [
      MAU_OFFICE_LAYOUT.anchors.break_chase_1,
      MAU_OFFICE_LAYOUT.anchors.break_chase_2,
      MAU_OFFICE_LAYOUT.anchors.break_chase_3,
    ];
    const state = advanceMauOfficeState(
      {
        ...createEmptyMauOfficeState(),
        loaded: true,
        nowMs: nowMs - 1,
        actorOrder: [
          "worker:ball",
          "worker:ball-2",
          "worker:ball-3",
          "worker:ball-4",
          "worker:chat",
          "worker:chat-2",
          "worker:chase",
          "worker:chase-2",
          "worker:chase-3",
          "worker:dance",
          "worker:sleep",
          "worker:arcade",
        ],
        actors: {
          "worker:ball": makeActor({
            id: "worker:ball",
            anchorId: "break_volley_1",
            nodeId: "break_center",
            x: volleyAnchors[0].x,
            y: volleyAnchors[0].y,
            currentActivity: {
              ...makeActivity(
                "idle-ball",
                "idle_package",
                "break",
                "break_volley_1",
                "Passing the ball",
              ),
              source: "idle",
            },
            idleAssignment: {
              packageId: "passing_ball_court",
              activityId: "break-passing-ball",
              participantIds: ["worker:ball", "worker:ball-2", "worker:ball-3", "worker:ball-4"],
              slotAnchorIds: [
                "break_volley_1",
                "break_volley_2",
                "break_volley_3",
                "break_volley_4",
              ],
              startedAtMs: nowMs - 100,
              endsAtMs: nowMs + 10_000,
            },
          }),
          "worker:ball-2": makeActor({
            id: "worker:ball-2",
            anchorId: "break_volley_2",
            nodeId: "break_center",
            x: volleyAnchors[1].x,
            y: volleyAnchors[1].y,
            currentActivity: {
              ...makeActivity(
                "idle-ball",
                "idle_package",
                "break",
                "break_volley_2",
                "Passing the ball",
              ),
              source: "idle",
            },
            idleAssignment: {
              packageId: "passing_ball_court",
              activityId: "break-passing-ball",
              participantIds: ["worker:ball", "worker:ball-2", "worker:ball-3", "worker:ball-4"],
              slotAnchorIds: [
                "break_volley_1",
                "break_volley_2",
                "break_volley_3",
                "break_volley_4",
              ],
              startedAtMs: nowMs - 100,
              endsAtMs: nowMs + 10_000,
            },
          }),
          "worker:ball-3": makeActor({
            id: "worker:ball-3",
            anchorId: "break_volley_3",
            nodeId: "break_center",
            x: volleyAnchors[2].x,
            y: volleyAnchors[2].y,
            currentActivity: {
              ...makeActivity(
                "idle-ball",
                "idle_package",
                "break",
                "break_volley_3",
                "Passing the ball",
              ),
              source: "idle",
            },
            idleAssignment: {
              packageId: "passing_ball_court",
              activityId: "break-passing-ball",
              participantIds: ["worker:ball", "worker:ball-2", "worker:ball-3", "worker:ball-4"],
              slotAnchorIds: [
                "break_volley_1",
                "break_volley_2",
                "break_volley_3",
                "break_volley_4",
              ],
              startedAtMs: nowMs - 100,
              endsAtMs: nowMs + 10_000,
            },
          }),
          "worker:ball-4": makeActor({
            id: "worker:ball-4",
            anchorId: "break_volley_4",
            nodeId: "break_center",
            x: volleyAnchors[3].x,
            y: volleyAnchors[3].y,
            currentActivity: {
              ...makeActivity(
                "idle-ball",
                "idle_package",
                "break",
                "break_volley_4",
                "Passing the ball",
              ),
              source: "idle",
            },
            idleAssignment: {
              packageId: "passing_ball_court",
              activityId: "break-passing-ball",
              participantIds: ["worker:ball", "worker:ball-2", "worker:ball-3", "worker:ball-4"],
              slotAnchorIds: [
                "break_volley_1",
                "break_volley_2",
                "break_volley_3",
                "break_volley_4",
              ],
              startedAtMs: nowMs - 100,
              endsAtMs: nowMs + 10_000,
            },
          }),
          "worker:chat": makeActor({
            id: "worker:chat",
            anchorId: "break_table_1",
            nodeId: "break_center",
            currentActivity: {
              ...makeActivity("idle-chat", "idle_package", "break", "break_table_1", "Chatting"),
              source: "idle",
            },
            idleAssignment: {
              packageId: "chess_table",
              activityId: "break-chatting-pair",
              participantIds: ["worker:chat", "worker:chat-2"],
              slotAnchorIds: ["break_table_1", "break_table_2"],
              startedAtMs: nowMs - 100,
              endsAtMs: nowMs + 10_000,
            },
          }),
          "worker:chat-2": makeActor({
            id: "worker:chat-2",
            anchorId: "break_table_2",
            nodeId: "break_center",
            currentActivity: {
              ...makeActivity("idle-chat", "idle_package", "break", "break_table_2", "Chatting"),
              source: "idle",
            },
            idleAssignment: {
              packageId: "chess_table",
              activityId: "break-chatting-pair",
              participantIds: ["worker:chat", "worker:chat-2"],
              slotAnchorIds: ["break_table_1", "break_table_2"],
              startedAtMs: nowMs - 100,
              endsAtMs: nowMs + 10_000,
            },
          }),
          "worker:chase": makeActor({
            id: "worker:chase",
            anchorId: "break_chase_1",
            nodeId: "break_center",
            x: chaseAnchors[0].x,
            y: chaseAnchors[0].y,
            currentActivity: {
              ...makeActivity("idle-chase", "idle_package", "break", "break_chase_1", "Chasing"),
              source: "idle",
            },
            idleAssignment: {
              packageId: "chasing_loop",
              activityId: "break-chasing-loop",
              participantIds: ["worker:chase", "worker:chase-2", "worker:chase-3"],
              slotAnchorIds: ["break_chase_1", "break_chase_2", "break_chase_3"],
              startedAtMs: nowMs - 100,
              endsAtMs: nowMs + 10_000,
            },
          }),
          "worker:chase-2": makeActor({
            id: "worker:chase-2",
            anchorId: "break_chase_2",
            nodeId: "break_center",
            x: chaseAnchors[1].x,
            y: chaseAnchors[1].y,
            currentActivity: {
              ...makeActivity("idle-chase", "idle_package", "break", "break_chase_2", "Chasing"),
              source: "idle",
            },
            idleAssignment: {
              packageId: "chasing_loop",
              activityId: "break-chasing-loop",
              participantIds: ["worker:chase", "worker:chase-2", "worker:chase-3"],
              slotAnchorIds: ["break_chase_1", "break_chase_2", "break_chase_3"],
              startedAtMs: nowMs - 100,
              endsAtMs: nowMs + 10_000,
            },
          }),
          "worker:chase-3": makeActor({
            id: "worker:chase-3",
            anchorId: "break_chase_3",
            nodeId: "break_center",
            x: chaseAnchors[2].x,
            y: chaseAnchors[2].y,
            currentActivity: {
              ...makeActivity("idle-chase", "idle_package", "break", "break_chase_3", "Chasing"),
              source: "idle",
            },
            idleAssignment: {
              packageId: "chasing_loop",
              activityId: "break-chasing-loop",
              participantIds: ["worker:chase", "worker:chase-2", "worker:chase-3"],
              slotAnchorIds: ["break_chase_1", "break_chase_2", "break_chase_3"],
              startedAtMs: nowMs - 100,
              endsAtMs: nowMs + 10_000,
            },
          }),
          "worker:dance": makeActor({
            id: "worker:dance",
            anchorId: "break_jukebox",
            nodeId: "break_center",
            currentActivity: {
              ...makeActivity("idle-dance", "idle_package", "break", "break_jukebox", "Dancing"),
              source: "idle",
            },
            idleAssignment: {
              packageId: "jukebox_floor",
              activityId: "break-dance-floor",
              participantIds: ["worker:dance"],
              slotAnchorIds: ["break_jukebox"],
              startedAtMs: nowMs - 100,
              endsAtMs: nowMs + 10_000,
            },
          }),
          "worker:sleep": makeActor({
            id: "worker:sleep",
            anchorId: "break_reading",
            nodeId: "break_center",
            currentActivity: {
              ...makeActivity("idle-sleep", "idle_package", "break", "break_reading", "Sleeping"),
              source: "idle",
            },
            idleAssignment: {
              packageId: "reading_nook",
              activityId: "break-sleep-floor",
              participantIds: ["worker:sleep"],
              slotAnchorIds: ["break_reading"],
              startedAtMs: nowMs - 100,
              endsAtMs: nowMs + 10_000,
            },
          }),
          "worker:arcade": makeActor({
            id: "worker:arcade",
            anchorId: "break_arcade",
            nodeId: "break_center",
            currentActivity: {
              ...makeActivity(
                "idle-arcade",
                "idle_package",
                "break",
                "break_arcade",
                "Playing arcade",
              ),
              source: "idle",
            },
            idleAssignment: {
              packageId: "arcade_corner",
              activityId: "break-arcade-reach",
              participantIds: ["worker:arcade"],
              slotAnchorIds: ["break_arcade"],
              startedAtMs: nowMs - 100,
              endsAtMs: nowMs + 10_000,
            },
          }),
        },
      },
      nowMs,
    );

    expect(state.actors["worker:ball"]?.animationId).toBe("jump");
    expect(state.actors["worker:chat"]?.animationId).toBe("chat");
    expect(state.actors["worker:chase"]?.animationId).toBe("chase");
    expect(state.actors["worker:dance"]?.animationId).toBe("dance");
    expect(state.actors["worker:sleep"]?.animationId).toBe("sleep-floor");
    expect(state.actors["worker:arcade"]?.animationId).toBe("reach");
  });

  it("keeps volleyball active for four idle workers even when the prior cooldown has not expired", () => {
    const nowMs = 5_000;
    const breakAnchor = MAU_OFFICE_LAYOUT.anchors.break_arcade;
    const state = advanceMauOfficeState(
      {
        ...createEmptyMauOfficeState(),
        loaded: true,
        nowMs: nowMs - 1,
        idleCooldowns: {
          passing_ball_court: nowMs + 60_000,
        },
        actorOrder: ["worker:1", "worker:2", "worker:3", "worker:4"],
        actors: {
          "worker:1": makeActor({
            id: "worker:1",
            anchorId: "break_arcade",
            nodeId: "break_center",
            x: breakAnchor.x,
            y: breakAnchor.y,
            currentActivity: makeActivity(
              "idle",
              "idle",
              "break",
              "break_arcade",
              "Taking a breather",
            ),
          }),
          "worker:2": makeActor({
            id: "worker:2",
            anchorId: "break_arcade",
            nodeId: "break_center",
            x: breakAnchor.x,
            y: breakAnchor.y,
            currentActivity: makeActivity(
              "idle",
              "idle",
              "break",
              "break_arcade",
              "Taking a breather",
            ),
          }),
          "worker:3": makeActor({
            id: "worker:3",
            anchorId: "break_arcade",
            nodeId: "break_center",
            x: breakAnchor.x,
            y: breakAnchor.y,
            currentActivity: makeActivity(
              "idle",
              "idle",
              "break",
              "break_arcade",
              "Taking a breather",
            ),
          }),
          "worker:4": makeActor({
            id: "worker:4",
            anchorId: "break_arcade",
            nodeId: "break_center",
            x: breakAnchor.x,
            y: breakAnchor.y,
            currentActivity: makeActivity(
              "idle",
              "idle",
              "break",
              "break_arcade",
              "Taking a breather",
            ),
          }),
        },
      },
      nowMs,
    );

    for (const actorId of state.actorOrder) {
      expect(state.actors[actorId]?.idleAssignment?.packageId).toBe("passing_ball_court");
    }
  });

  it("still assigns break-room idle packages while a separate support interaction is active", () => {
    const nowMs = 5_000;
    const breakAnchor = MAU_OFFICE_LAYOUT.anchors.break_arcade;
    const supportAnchor = MAU_OFFICE_LAYOUT.anchors.support_staff_1;
    const state = advanceMauOfficeState(
      {
        ...createEmptyMauOfficeState(),
        loaded: true,
        nowMs: nowMs - 1,
        actorOrder: ["worker:support", "worker:1", "worker:2", "worker:3", "worker:4"],
        actors: {
          "worker:support": makeActor({
            id: "worker:support",
            anchorId: "support_staff_1",
            nodeId: "support_center",
            x: supportAnchor.x,
            y: supportAnchor.y,
            currentRoomId: "support",
            currentActivity: {
              id: "support-live",
              kind: "customer_support",
              label: "Handling support",
              priority: 70,
              roomId: "support",
              anchorId: "support_staff_1",
              source: "event",
              expiresAtMs: nowMs + 30_000,
            },
          }),
          "worker:1": makeActor({
            id: "worker:1",
            anchorId: "break_arcade",
            nodeId: "break_center",
            x: breakAnchor.x,
            y: breakAnchor.y,
            currentActivity: makeActivity(
              "idle",
              "idle",
              "break",
              "break_arcade",
              "Taking a breather",
            ),
          }),
          "worker:2": makeActor({
            id: "worker:2",
            anchorId: "break_arcade",
            nodeId: "break_center",
            x: breakAnchor.x,
            y: breakAnchor.y,
            currentActivity: makeActivity(
              "idle",
              "idle",
              "break",
              "break_arcade",
              "Taking a breather",
            ),
          }),
          "worker:3": makeActor({
            id: "worker:3",
            anchorId: "break_arcade",
            nodeId: "break_center",
            x: breakAnchor.x,
            y: breakAnchor.y,
            currentActivity: makeActivity(
              "idle",
              "idle",
              "break",
              "break_arcade",
              "Taking a breather",
            ),
          }),
          "worker:4": makeActor({
            id: "worker:4",
            anchorId: "break_arcade",
            nodeId: "break_center",
            x: breakAnchor.x,
            y: breakAnchor.y,
            currentActivity: makeActivity(
              "idle",
              "idle",
              "break",
              "break_arcade",
              "Taking a breather",
            ),
          }),
        },
      },
      nowMs,
    );

    expect(state.actors["worker:support"]?.currentActivity.kind).toBe("customer_support");
    expect(state.actors["worker:1"]?.idleAssignment?.packageId).toBe("passing_ball_court");
    expect(state.actors["worker:2"]?.idleAssignment?.packageId).toBe("passing_ball_court");
    expect(state.actors["worker:3"]?.idleAssignment?.packageId).toBe("passing_ball_court");
    expect(state.actors["worker:4"]?.idleAssignment?.packageId).toBe("passing_ball_court");
  });

  it("clears incomplete group activities so one actor does not keep pretending to chase alone", () => {
    const nowMs = 9_000;
    const chaseAnchor = MAU_OFFICE_LAYOUT.anchors.break_chase_1;
    const state = advanceMauOfficeState(
      {
        ...createEmptyMauOfficeState(),
        loaded: true,
        nowMs: nowMs - 1,
        actorOrder: ["worker:solo"],
        actors: {
          "worker:solo": makeActor({
            id: "worker:solo",
            anchorId: "break_chase_1",
            nodeId: "break_center",
            x: chaseAnchor.x,
            y: chaseAnchor.y,
            currentActivity: {
              ...makeActivity("idle-chase", "idle_package", "break", "break_chase_1", "Chasing"),
              source: "idle",
            },
            idleAssignment: {
              packageId: "chasing_loop",
              activityId: "break-chasing-loop",
              participantIds: ["worker:solo"],
              slotAnchorIds: ["break_chase_1"],
              startedAtMs: nowMs - 100,
              endsAtMs: nowMs + 10_000,
            },
          }),
        },
      },
      nowMs,
    );

    expect(state.actors["worker:solo"]?.idleAssignment).toBeNull();
    expect(state.actors["worker:solo"]?.animationId).not.toBe("chase");
    expect(state.actors["worker:solo"]?.currentActivity.kind).not.toBe("idle_package");
  });

  it("sends a stale support worker back to their stable break-room idle spot after the quiet window", () => {
    const supportAnchor = MAU_OFFICE_LAYOUT.anchors.support_staff_1;
    const state: MauOfficeState = {
      ...createEmptyMauOfficeState(),
      loaded: true,
      actorOrder: ["worker:main"],
      actors: {
        "worker:main": makeActor({
          id: "worker:main",
          agentId: "main",
          roleHint: "support",
          anchorId: "support_staff_1",
          nodeId: "support_center",
          homeAnchorId: "desk_worker_1",
          currentRoomId: "support",
          x: supportAnchor.x,
          y: supportAnchor.y,
          currentActivity: {
            id: "snapshot-support",
            kind: "customer_support",
            label: "Handling support",
            priority: 70,
            roomId: "support",
            anchorId: "support_staff_1",
            source: "snapshot",
          },
          snapshotActivity: {
            id: "snapshot-support",
            kind: "customer_support",
            label: "Handling support",
            priority: 70,
            roomId: "support",
            anchorId: "support_staff_1",
            source: "snapshot",
          },
          latestSupportDialogue: {
            role: "assistant",
            text: "This should disappear once the worker leaves support.",
            updatedAtMs: 1_000,
          },
          bubbles: [
            {
              id: "bubble:support",
              text: "This should disappear once the worker leaves support.",
              atMs: 1_000,
              kind: "customer_support",
            },
          ],
          lastSeenAtMs: 0,
        }),
      },
    };

    const leavingSupport = advanceMauOfficeState(state, 61_000);
    const enRoute = leavingSupport.actors["worker:main"]!;
    expect(enRoute.path?.targetAnchorId).toBe("break_arcade");
    expect(enRoute.latestSupportDialogue).toBeNull();
    expect(enRoute.bubbles.some((bubble) => bubble.kind === "customer_support")).toBe(false);

    const settled = advanceMauOfficeState(leavingSupport, 120_000);
    const worker = settled.actors["worker:main"]!;
    expect(worker.anchorId).toBe("break_arcade");
    expect(worker.currentRoomId).toBe("break");
    expect(worker.currentActivity.kind).toBe("idle");
    expect(worker.latestSupportDialogue).toBeNull();
    expect(worker.bubbles.some((bubble) => bubble.kind === "customer_support")).toBe(false);
  });

  it("lets a stale support visitor leave instead of idling in front of the counter forever", () => {
    const visitorAnchor = MAU_OFFICE_LAYOUT.anchors.support_customer_2;
    const state: MauOfficeState = {
      ...createEmptyMauOfficeState(),
      loaded: true,
      actorOrder: ["visitor:agent:main:direct:customer-42"],
      actors: {
        "visitor:agent:main:direct:customer-42": makeActor({
          id: "visitor:agent:main:direct:customer-42",
          kind: "visitor",
          label: "Samiadji",
          agentId: "main",
          sessionKey: "agent:main:direct:customer-42",
          anchorId: "support_customer_2",
          nodeId: "support_customer_2",
          homeAnchorId: "outside_support",
          currentRoomId: "support",
          x: visitorAnchor.x,
          y: visitorAnchor.y,
          currentActivity: {
            id: "snapshot-support",
            kind: "customer_support",
            label: "Customer message",
            priority: 70,
            roomId: "support",
            anchorId: "support_customer_2",
            source: "snapshot",
          },
          snapshotActivity: {
            id: "snapshot-support",
            kind: "customer_support",
            label: "Customer message",
            priority: 70,
            roomId: "support",
            anchorId: "support_customer_2",
            source: "snapshot",
          },
          lastSeenAtMs: 0,
        }),
      },
    };

    const leaving = advanceMauOfficeState(state, 61_000);
    const visitor = leaving.actors["visitor:agent:main:direct:customer-42"]!;
    expect(visitor.path?.targetAnchorId).toBe("outside_support");

    const settled = advanceMauOfficeState(leaving, 120_000);
    expect(settled.actorOrder).not.toContain("visitor:agent:main:direct:customer-42");
  });

  it("uses a free neighboring support anchor instead of stacking two workers on the same counter slot", () => {
    const supportAnchor = MAU_OFFICE_LAYOUT.anchors.support_staff_1;
    const breakAnchor = MAU_OFFICE_LAYOUT.anchors.break_arcade;
    const nowMs = Date.now();
    const state: MauOfficeState = {
      ...createEmptyMauOfficeState(),
      loaded: true,
      nowMs,
      actorOrder: ["worker:main", "worker:ops"],
      actors: {
        "worker:main": makeActor({
          id: "worker:main",
          agentId: "main",
          roleHint: "support",
          homeAnchorId: "support_staff_1",
          anchorId: "support_staff_1",
          nodeId: "support_center",
          currentRoomId: "support",
          x: supportAnchor.x,
          y: supportAnchor.y,
          currentActivity: makeActivity(
            "support-main",
            "customer_support",
            "support",
            "support_staff_1",
            "Helping a customer",
          ),
          snapshotActivity: makeActivity(
            "support-main",
            "customer_support",
            "support",
            "support_staff_1",
            "Helping a customer",
          ),
          lastSeenAtMs: nowMs,
        }),
        "worker:ops": makeActor({
          id: "worker:ops",
          agentId: "ops",
          roleHint: "support",
          homeAnchorId: "support_staff_2",
          anchorId: "break_arcade",
          nodeId: "break_center",
          currentRoomId: "break",
          x: breakAnchor.x,
          y: breakAnchor.y,
          currentActivity: {
            id: "expired",
            kind: "whiteboard_update",
            label: "Old task",
            priority: 50,
            roomId: "desk",
            anchorId: "desk_board",
            source: "event",
            expiresAtMs: nowMs - 1,
          },
          snapshotActivity: makeActivity(
            "support-ops",
            "customer_support",
            "support",
            "support_staff_1",
            "Helping a customer",
          ),
          lastSeenAtMs: nowMs,
        }),
      },
    };

    const advanced = advanceMauOfficeState(state, nowMs);
    const worker = advanced.actors["worker:ops"]!;

    expect(worker.currentActivity.kind).toBe("walking");
    expect(worker.path?.targetAnchorId).not.toBe("support_staff_1");
    expect(["support_staff_2", "support_staff_3"]).toContain(worker.path?.targetAnchorId);
  });
});

describe("applyMauOfficeSessionToolEvent", () => {
  it("routes delegated subagent tool traffic into the meeting room instead of customer support", () => {
    const startedAt = 1_000;
    const first = applyMauOfficeSessionToolEvent(
      {
        ...createEmptyMauOfficeState(),
        loaded: true,
        actorOrder: ["worker:ops"],
        actors: {
          "worker:ops": makeActor({
            id: "worker:ops",
            agentId: "ops",
            sessionKey: "agent:ops:main",
            roleHint: "meeting",
            anchorId: "break_arcade",
            nodeId: "break_center",
            homeAnchorId: "desk_worker_1",
            currentRoomId: "break",
            currentActivity: makeActivity(
              "idle",
              "idle",
              "break",
              "break_arcade",
              "Taking a breather",
            ),
          }),
        },
      },
      {
        sessionKey: "agent:ops:subagent:support",
        data: {
          toolName: "sessions_send",
          input: {
            text: "Need a fast follow-up on the customer billing question.",
          },
        },
      },
      startedAt,
    );
    const actor = first.actors["worker:ops"]!;

    expect(actor.currentActivity.kind).toBe("walking");
    expect(actor.path?.targetAnchorId).toBe("meeting_presenter");
    expect(actor.queuedActivity?.kind).toBe("meeting");
    expect(actor.queuedActivity?.roomId).toBe("meeting");
    expect(first.actors["visitor:agent:ops:subagent:support"]).toBeUndefined();
  });

  it("routes direct support tool updates to the worker instead of overwriting the visitor bubble", () => {
    const startedAt = 1_000;
    const supportAnchor = MAU_OFFICE_LAYOUT.anchors.support_staff_1;
    const visitorAnchor = MAU_OFFICE_LAYOUT.anchors.support_customer_1;
    const first = applyMauOfficeSessionToolEvent(
      {
        ...createEmptyMauOfficeState(),
        loaded: true,
        actorOrder: ["worker:main", "visitor:agent:main:direct:customer-42"],
        actors: {
          "worker:main": makeActor({
            id: "worker:main",
            anchorId: "support_staff_1",
            nodeId: "support_center",
            agentId: "main",
            roleHint: "support",
            homeAnchorId: "support_staff_1",
            currentRoomId: "support",
            x: supportAnchor.x,
            y: supportAnchor.y,
            currentActivity: makeActivity(
              "support",
              "customer_support",
              "support",
              "support_staff_1",
              "Helping a customer",
            ),
          }),
          "visitor:agent:main:direct:customer-42": makeActor({
            id: "visitor:agent:main:direct:customer-42",
            kind: "visitor",
            label: "Samiadji",
            agentId: "main",
            sessionKey: "agent:main:direct:customer-42",
            anchorId: "support_customer_1",
            nodeId: "support_customer_1",
            homeAnchorId: "outside_support",
            currentRoomId: "support",
            x: visitorAnchor.x,
            y: visitorAnchor.y,
            currentActivity: {
              id: "snapshot-support",
              kind: "customer_support",
              label: "Handling support",
              bubbleText: "Can you reset my workspace access?",
              priority: 70,
              roomId: "support",
              anchorId: "support_customer_1",
              source: "snapshot",
            },
            bubbles: [
              {
                id: "visitor:bubble",
                text: "Can you reset my workspace access?",
                atMs: 0,
                kind: "customer_support",
              },
            ],
          }),
        },
      },
      {
        sessionKey: "agent:main:direct:customer-42",
        data: {
          toolName: "sessions_send",
          input: {
            text: "Octopuses have three hearts, blue blood, and can taste with their arms.",
          },
        },
      },
      startedAt,
    );
    const advanced = advanceMauOfficeState(first, startedAt + 12_000);
    const worker = advanced.actors["worker:main"]!;
    const visitor = advanced.actors["visitor:agent:main:direct:customer-42"]!;

    expect(worker.bubbles[0]?.text).toContain("Octopuses have three hearts");
    expect(visitor.bubbles[0]?.text).toBe("Can you reset my workspace access?");
  });

  it("does not replace the worker's latest reply when a support tool event has no fresh visible text", () => {
    const startedAt = 1_000;
    const supportAnchor = MAU_OFFICE_LAYOUT.anchors.support_staff_1;
    const next = applyMauOfficeSessionToolEvent(
      {
        ...createEmptyMauOfficeState(),
        loaded: true,
        actorOrder: ["worker:main"],
        actors: {
          "worker:main": makeActor({
            id: "worker:main",
            anchorId: "support_staff_1",
            nodeId: "support_center",
            agentId: "main",
            roleHint: "support",
            homeAnchorId: "desk_worker_1",
            sessionKey: "agent:main:direct:customer-42",
            currentRoomId: "support",
            x: supportAnchor.x,
            y: supportAnchor.y,
            currentActivity: {
              id: "event-message:assistant",
              kind: "customer_support",
              label: "Handling support",
              bubbleText: "Latest assistant reply should stay visible.",
              priority: 70,
              roomId: "support",
              anchorId: "support_staff_1",
              source: "event",
              expiresAtMs: startedAt + 10_000,
            },
            latestSupportDialogue: {
              role: "assistant",
              text: "Latest assistant reply should stay visible.",
              messageSeq: 8,
              messageId: "msg-8",
              updatedAtMs: startedAt,
            },
            bubbles: [
              {
                id: "worker:latest",
                text: "Latest assistant reply should stay visible.",
                atMs: startedAt,
                kind: "customer_support",
              },
            ],
          }),
        },
      },
      {
        sessionKey: "agent:main:direct:customer-42",
        data: {
          toolName: "sessions_send",
        },
      },
      startedAt + 1,
    );

    const worker = next.actors["worker:main"]!;
    expect(worker.latestSupportDialogue?.text).toBe("Latest assistant reply should stay visible.");
    expect(worker.bubbles[0]?.text).toBe("Latest assistant reply should stay visible.");
  });
});

describe("applyMauOfficeAgentEvent", () => {
  it("routes direct support agent stream updates to the worker instead of the visitor", () => {
    const startedAt = 1_000;
    const supportAnchor = MAU_OFFICE_LAYOUT.anchors.support_staff_2;
    const visitorAnchor = MAU_OFFICE_LAYOUT.anchors.support_customer_2;
    const first = applyMauOfficeAgentEvent(
      {
        ...createEmptyMauOfficeState(),
        loaded: true,
        actorOrder: ["worker:main", "visitor:agent:main:direct:customer-42"],
        actors: {
          "worker:main": makeActor({
            id: "worker:main",
            anchorId: "support_staff_2",
            nodeId: "support_center",
            agentId: "main",
            roleHint: "support",
            homeAnchorId: "support_staff_2",
            currentRoomId: "support",
            x: supportAnchor.x,
            y: supportAnchor.y,
            currentActivity: makeActivity(
              "support",
              "customer_support",
              "support",
              "support_staff_2",
              "Helping a customer",
            ),
          }),
          "visitor:agent:main:direct:customer-42": makeActor({
            id: "visitor:agent:main:direct:customer-42",
            kind: "visitor",
            label: "Samiadji",
            agentId: "main",
            sessionKey: "agent:main:direct:customer-42",
            anchorId: "support_customer_2",
            nodeId: "support_customer_2",
            homeAnchorId: "outside_support",
            currentRoomId: "support",
            x: visitorAnchor.x,
            y: visitorAnchor.y,
            currentActivity: {
              id: "snapshot-support",
              kind: "customer_support",
              label: "Handling support",
              bubbleText: "Can you reset my workspace access?",
              priority: 70,
              roomId: "support",
              anchorId: "support_customer_2",
              source: "snapshot",
            },
            bubbles: [
              {
                id: "visitor:bubble",
                text: "Can you reset my workspace access?",
                atMs: 0,
                kind: "customer_support",
              },
            ],
          }),
        },
      },
      {
        sessionKey: "agent:main:direct:customer-42",
        data: {
          phase: "delta",
          content: "Octopuses have three hearts, blue blood, and can taste with their arms.",
        },
      },
      startedAt,
    );
    const worker = first.actors["worker:main"]!;
    const visitor = first.actors["visitor:agent:main:direct:customer-42"]!;

    expect(worker.currentActivity.bubbleText).toContain("Octopuses have three hearts");
    expect(visitor.currentActivity.bubbleText).toBe("Can you reset my workspace access?");
  });

  it("routes delegated subagent agent events into the meeting room", () => {
    const startedAt = 1_000;
    const breakAnchor = MAU_OFFICE_LAYOUT.anchors.break_arcade;
    const first = applyMauOfficeAgentEvent(
      {
        ...createEmptyMauOfficeState(),
        loaded: true,
        actorOrder: ["worker:ops"],
        actors: {
          "worker:ops": makeActor({
            id: "worker:ops",
            agentId: "ops",
            sessionKey: "agent:ops:main",
            roleHint: "meeting",
            homeAnchorId: "desk_worker_1",
            anchorId: "break_arcade",
            nodeId: "break_center",
            currentRoomId: "break",
            x: breakAnchor.x,
            y: breakAnchor.y,
            currentActivity: makeActivity(
              "idle",
              "idle",
              "break",
              "break_arcade",
              "Taking a breather",
            ),
          }),
        },
      },
      {
        sessionKey: "agent:ops:subagent:delegate-review",
        data: {
          phase: "delta",
          content: "Need your input on the delegated plan.",
        },
      },
      startedAt,
    );

    const worker = first.actors["worker:ops"]!;
    expect(worker.currentActivity.kind).toBe("walking");
    expect(worker.queuedActivity?.kind).toBe("meeting");
    expect(worker.queuedActivity?.roomId).toBe("meeting");
    expect(first.actors["visitor:agent:ops:subagent:delegate-review"]).toBeUndefined();
  });

  it("does not overwrite the worker with stale nested support text when no fresh assistant delta is present", () => {
    const startedAt = 1_000;
    const supportAnchor = MAU_OFFICE_LAYOUT.anchors.support_staff_2;
    const next = applyMauOfficeAgentEvent(
      {
        ...createEmptyMauOfficeState(),
        loaded: true,
        actorOrder: ["worker:main"],
        actors: {
          "worker:main": makeActor({
            id: "worker:main",
            anchorId: "support_staff_2",
            nodeId: "support_center",
            agentId: "main",
            roleHint: "support",
            homeAnchorId: "desk_worker_2",
            currentRoomId: "support",
            x: supportAnchor.x,
            y: supportAnchor.y,
            sessionKey: "agent:main:direct:customer-42",
            currentActivity: {
              id: "event-message:assistant",
              kind: "customer_support",
              label: "Handling support",
              bubbleText: "Latest assistant reply should stay visible.",
              priority: 70,
              roomId: "support",
              anchorId: "support_staff_2",
              source: "event",
              expiresAtMs: startedAt + 10_000,
            },
            bubbles: [
              {
                id: "worker:latest",
                text: "Latest assistant reply should stay visible.",
                atMs: startedAt - 1,
                kind: "customer_support",
              },
            ],
          }),
        },
      },
      {
        sessionKey: "agent:main:direct:customer-42",
        stream: "lifecycle",
        data: {
          phase: "delta",
          message: {
            role: "user",
            text: "Older customer request that should not replace the reply.",
          },
        },
      },
      startedAt,
    );

    const worker = next.actors["worker:main"]!;
    expect(worker.currentActivity.bubbleText).toBeUndefined();
    expect(worker.bubbles[0]?.text).toBe("Latest assistant reply should stay visible.");
  });

  it("keeps the newest assistant reply when the later lifecycle end event settles back to snapshot support", () => {
    const startedAt = 1_000;
    const supportAnchor = MAU_OFFICE_LAYOUT.anchors.support_staff_2;
    const afterReply = applyMauOfficeSessionMessageEvent(
      {
        ...createEmptyMauOfficeState(),
        loaded: true,
        actorOrder: ["worker:main"],
        actors: {
          "worker:main": makeActor({
            id: "worker:main",
            anchorId: "support_staff_2",
            nodeId: "support_center",
            agentId: "main",
            roleHint: "support",
            homeAnchorId: "desk_worker_2",
            currentRoomId: "support",
            x: supportAnchor.x,
            y: supportAnchor.y,
            sessionKey: "agent:main:direct:customer-42",
            currentActivity: {
              id: "event-message:assistant",
              kind: "customer_support",
              label: "Handling support",
              bubbleText: "Previous assistant reply that should not come back.",
              priority: 70,
              roomId: "support",
              anchorId: "support_staff_2",
              source: "event",
              expiresAtMs: startedAt + 10_000,
            },
            snapshotActivity: {
              id: "snapshot-support",
              kind: "customer_support",
              label: "Handling support",
              bubbleText: "Previous assistant reply that should not come back.",
              priority: 70,
              roomId: "support",
              anchorId: "support_staff_2",
              source: "snapshot",
            },
            bubbles: [
              {
                id: "worker:previous",
                text: "Previous assistant reply that should not come back.",
                atMs: startedAt - 500,
                kind: "customer_support",
              },
            ],
          }),
        },
      },
      {
        sessionKey: "agent:main:direct:customer-42",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "This is the actual latest reply." }],
        },
      },
      startedAt,
    );

    const next = applyMauOfficeAgentEvent(
      afterReply,
      {
        sessionKey: "agent:main:direct:customer-42",
        stream: "lifecycle",
        data: { phase: "end" },
      },
      startedAt + 1,
    );

    const worker = next.actors["worker:main"]!;
    expect(worker.currentActivity.bubbleText).toBe("This is the actual latest reply.");
    expect(worker.bubbles[0]?.text).toBe("This is the actual latest reply.");
  });
});

describe("applyMauOfficeSessionMessageEvent", () => {
  it("shows the message content directly and keeps it normalized", () => {
    const startedAt = 2_000;
    const first = applyMauOfficeSessionMessageEvent(
      createEmptyMauOfficeState(),
      {
        sessionKey: "session:direct:customer-42",
        message: {
          role: "user",
          text: "Need   an invoice update for   this account before Friday.",
        },
      },
      startedAt,
    );
    const advanced = advanceMauOfficeState(first, startedAt + 12_000);
    const actor = advanced.actors[advanced.actorOrder[0]!]!;
    const visitorAnchor = MAU_OFFICE_LAYOUT.anchors.support_customer_2;

    expect(actor.currentActivity.kind).toBe("customer_support");
    expect(actor.anchorId).toBe("support_customer_2");
    expect(actor.x).toBe(visitorAnchor.x);
    expect(actor.y).toBe(visitorAnchor.y);
    expect(actor.facing).toBe("north");
    expect(actor.bubbles[0]?.text).toBe("Need an invoice update for this account before Friday.");
  });

  it("routes delegated subagent messages into the meeting room instead of support", () => {
    const startedAt = 2_000;
    const breakAnchor = MAU_OFFICE_LAYOUT.anchors.break_arcade;
    const first = applyMauOfficeSessionMessageEvent(
      {
        ...createEmptyMauOfficeState(),
        loaded: true,
        actorOrder: ["worker:ops"],
        actors: {
          "worker:ops": makeActor({
            id: "worker:ops",
            agentId: "ops",
            sessionKey: "agent:ops:main",
            roleHint: "meeting",
            homeAnchorId: "desk_worker_1",
            anchorId: "break_arcade",
            nodeId: "break_center",
            currentRoomId: "break",
            x: breakAnchor.x,
            y: breakAnchor.y,
            currentActivity: makeActivity(
              "idle",
              "idle",
              "break",
              "break_arcade",
              "Taking a breather",
            ),
          }),
        },
      },
      {
        sessionKey: "agent:ops:subagent:delegate-review",
        message: {
          role: "assistant",
          text: "Let's talk through the delegated plan together.",
        },
      },
      startedAt,
    );

    const worker = first.actors["worker:ops"]!;
    expect(worker.currentActivity.kind).toBe("walking");
    expect(worker.queuedActivity?.kind).toBe("meeting");
    expect(worker.queuedActivity?.roomId).toBe("meeting");
    expect(first.actors["visitor:agent:ops:subagent:delegate-review"]).toBeUndefined();
  });

  it("strips injected metadata blocks from visitor-facing support messages", () => {
    const startedAt = 2_000;
    const first = applyMauOfficeSessionMessageEvent(
      createEmptyMauOfficeState(),
      {
        sessionKey: "session:direct:customer-42",
        message: {
          role: "user",
          text: `Conversation info (untrusted metadata):
\`\`\`json
{"message_id":"abc123","sender_id":"customer-42"}
\`\`\`

Need an invoice update for this account before Friday.`,
        },
      },
      startedAt,
    );
    const advanced = advanceMauOfficeState(first, startedAt + 12_000);
    const actor = advanced.actors[advanced.actorOrder[0]!]!;

    expect(actor.currentActivity.bubbleText).toBe(
      "Need an invoice update for this account before Friday.",
    );
    expect(actor.bubbles[0]?.text).toBe("Need an invoice update for this account before Friday.");
    expect(actor.bubbles[0]?.text).not.toContain("Conversation info (untrusted metadata)");
  });

  it("hides reply-to-current tags from assistant-facing support bubbles", () => {
    const startedAt = 2_000;
    const first = applyMauOfficeSessionMessageEvent(
      {
        ...createEmptyMauOfficeState(),
        loaded: true,
        actorOrder: ["worker:main"],
        actors: {
          "worker:main": makeActor({
            id: "worker:main",
            anchorId: "support_staff_1",
            nodeId: "support_center",
            agentId: "main",
            roleHint: "support",
            sessionKey: "agent:main:direct:customer-42",
            homeAnchorId: "desk_worker_1",
            currentRoomId: "support",
            currentActivity: makeActivity(
              "support",
              "customer_support",
              "support",
              "support_staff_1",
              "Handling support",
            ),
          }),
        },
      },
      {
        sessionKey: "agent:main:direct:customer-42",
        message: {
          role: "assistant",
          text: "[[REPLY_TO_CURRENT]] [reply-to-current] I can help with that now.",
        },
      },
      startedAt,
    );
    const actor = first.actors["worker:main"]!;

    expect(actor.currentActivity.bubbleText).toBe("I can help with that now.");
    expect(actor.bubbles[0]?.text).toBe("I can help with that now.");
    expect(actor.currentActivity.bubbleText).not.toContain("REPLY_TO_CURRENT");
    expect(actor.currentActivity.bubbleText).not.toContain("reply-to-current");
  });

  it("parks an agent-linked visitor in front of the matching support agent instead of the room center", () => {
    const startedAt = 2_000;
    const supportAnchor = MAU_OFFICE_LAYOUT.anchors.support_staff_1;
    const first = applyMauOfficeSessionMessageEvent(
      {
        ...createEmptyMauOfficeState(),
        loaded: true,
        actorOrder: ["worker:main", "visitor:agent:main:direct:customer-42"],
        actors: {
          "worker:main": makeActor({
            id: "worker:main",
            anchorId: "support_staff_1",
            nodeId: "support_center",
            agentId: "main",
            roleHint: "support",
            homeAnchorId: "desk_worker_1",
            currentRoomId: "support",
            x: supportAnchor.x,
            y: supportAnchor.y,
            currentActivity: makeActivity(
              "support",
              "customer_support",
              "support",
              "support_staff_1",
              "Helping a customer",
            ),
          }),
          "visitor:agent:main:direct:customer-42": makeActor({
            id: "visitor:agent:main:direct:customer-42",
            kind: "visitor",
            label: "Samiadji",
            agentId: "main",
            sessionKey: "agent:main:direct:customer-42",
            anchorId: "outside_support",
            nodeId: "outside_support",
            homeAnchorId: "outside_support",
            currentRoomId: "outside",
            currentActivity: makeActivity(
              "snapshot-support",
              "customer_support",
              "support",
              "support_customer_2",
              "Customer message",
            ),
          }),
        },
      },
      {
        sessionKey: "agent:main:direct:customer-42",
        message: {
          role: "user",
          text: "Can you reset my workspace access?",
        },
      },
      startedAt,
    );
    const advanced = advanceMauOfficeState(first, startedAt + 12_000);
    const actor = advanced.actors["visitor:agent:main:direct:customer-42"]!;
    const visitorAnchor = MAU_OFFICE_LAYOUT.anchors.support_customer_1;

    expect(actor.anchorId).toBe("support_customer_1");
    expect(actor.x).toBe(visitorAnchor.x);
    expect(actor.y).toBe(visitorAnchor.y);
    expect(actor.bubbles[0]?.text).toBe("Can you reset my workspace access?");
  });

  it("creates a traveler bubble for a support user message without copying that text onto the worker", () => {
    const startedAt = 2_000;
    const supportAnchor = MAU_OFFICE_LAYOUT.anchors.support_staff_1;
    const first = applyMauOfficeSessionMessageEvent(
      {
        ...createEmptyMauOfficeState(),
        loaded: true,
        actorOrder: ["worker:main"],
        actors: {
          "worker:main": makeActor({
            id: "worker:main",
            anchorId: "support_staff_1",
            nodeId: "support_center",
            agentId: "main",
            roleHint: "support",
            homeAnchorId: "desk_worker_1",
            currentRoomId: "support",
            x: supportAnchor.x,
            y: supportAnchor.y,
            currentActivity: makeActivity(
              "support",
              "customer_support",
              "support",
              "support_staff_1",
              "Helping a customer",
            ),
            bubbles: [
              {
                id: "worker:bubble",
                text: "Let me check that for you.",
                atMs: 1_000,
                kind: "customer_support",
              },
            ],
          }),
        },
      },
      {
        sessionKey: "agent:main:direct:customer-42",
        message: {
          role: "user",
          text: "Can you reset my workspace access?",
        },
      },
      startedAt,
    );

    const worker = first.actors["worker:main"]!;
    const visitor = first.actors["visitor:agent:main:direct:customer-42"]!;

    expect(visitor.bubbles[0]?.text).toBe("Can you reset my workspace access?");
    expect(worker.currentActivity.bubbleText).not.toBe("Can you reset my workspace access?");
    expect(worker.bubbles[0]?.text).toBe("Let me check that for you.");
    expect(visitor.currentActivity.kind).toBe("walking");
  });

  it("routes configured heartbeat session messages into the meeting room instead of customer support", () => {
    const state: MauOfficeState = {
      ...createEmptyMauOfficeState(),
      loaded: true,
      heartbeatSessionKeys: {
        "agent:main:direct:heartbeat-room": true,
      },
      actorOrder: ["worker:main"],
      actors: {
        "worker:main": makeActor({
          id: "worker:main",
          agentId: "main",
          sessionKey: "agent:main:direct:heartbeat-room",
          roleHint: "desk",
          anchorId: "desk_worker_1",
          nodeId: "desk_center",
          homeAnchorId: "desk_worker_1",
          currentActivity: makeActivity(
            "idle",
            "idle",
            "break",
            "break_arcade",
            "Taking a breather",
          ),
        }),
      },
    };

    const next = applyMauOfficeSessionMessageEvent(
      state,
      {
        sessionKey: "agent:main:direct:heartbeat-room",
        message: {
          role: "assistant",
          text: "Heartbeat spotted a follow-up task.",
        },
      },
      1_000,
    );

    const worker = next.actors["worker:main"]!;
    expect(worker.currentActivity.kind).toBe("walking");
    expect(worker.queuedActivity?.kind).toBe("meeting");
    expect(worker.queuedActivity?.roomId).toBe("meeting");
    expect(next.actors["visitor:agent:main:direct:heartbeat-room"]).toBeUndefined();
  });

  it("keeps main-session heartbeat transcript messages in the meeting room while the heartbeat run is active", () => {
    const state: MauOfficeState = {
      ...createEmptyMauOfficeState(),
      loaded: true,
      activeHeartbeatSessionKeys: {
        "agent:main:main": 5_000,
      },
      actorOrder: ["worker:main"],
      actors: {
        "worker:main": makeActor({
          id: "worker:main",
          agentId: "main",
          sessionKey: "agent:main:main",
          roleHint: "desk",
          anchorId: "desk_worker_1",
          nodeId: "desk_center",
          homeAnchorId: "desk_worker_1",
          currentActivity: makeActivity(
            "idle",
            "idle",
            "break",
            "break_arcade",
            "Taking a breather",
          ),
        }),
      },
    };

    const next = applyMauOfficeSessionMessageEvent(
      state,
      {
        sessionKey: "agent:main:main",
        message: {
          role: "assistant",
          text: "Heartbeat found a follow-up to review.",
        },
      },
      1_000,
    );

    const worker = next.actors["worker:main"]!;
    expect(worker.currentActivity.kind).toBe("walking");
    expect(worker.queuedActivity?.kind).toBe("meeting");
    expect(worker.queuedActivity?.roomId).toBe("meeting");
  });

  it("returns a heartbeat worker to normal activity after the heartbeat ends", () => {
    const meetingAnchor = MAU_OFFICE_LAYOUT.anchors.meeting_seat_1;
    const state: MauOfficeState = {
      ...createEmptyMauOfficeState(),
      loaded: true,
      heartbeatSessionKeys: {
        "agent:main:direct:heartbeat-room": true,
      },
      actorOrder: ["worker:main"],
      actors: {
        "worker:main": makeActor({
          id: "worker:main",
          agentId: "main",
          sessionKey: "agent:main:direct:heartbeat-room",
          roleHint: "desk",
          anchorId: "meeting_seat_1",
          nodeId: "meeting_center",
          homeAnchorId: "desk_worker_1",
          currentRoomId: "meeting",
          x: meetingAnchor.x,
          y: meetingAnchor.y,
          currentActivity: {
            id: "event-heartbeat:start",
            kind: "meeting",
            label: "Heartbeat sync",
            priority: 60,
            roomId: "meeting",
            anchorId: "meeting_seat_1",
            source: "event",
            expiresAtMs: 5_000,
          },
          snapshotActivity: {
            id: "snapshot-heartbeat",
            kind: "meeting",
            label: "Heartbeat sync",
            priority: 40,
            roomId: "meeting",
            anchorId: "meeting_seat_1",
            source: "snapshot",
          },
        }),
      },
    };

    const next = applyMauOfficeAgentEvent(
      state,
      {
        sessionKey: "agent:main:direct:heartbeat-room",
        isHeartbeat: true,
        stream: "lifecycle",
        data: { phase: "end" },
      },
      6_000,
    );

    const worker = next.actors["worker:main"]!;
    expect(worker.snapshotActivity).toBeNull();
    expect(worker.currentActivity.kind).toBe("walking");
    expect(worker.queuedActivity?.kind).toBe("idle");
    expect(worker.queuedActivity?.roomId).toBe("break");
  });

  it("keeps customer visitors on the user-facing side of the support desk", () => {
    const counter = MAU_OFFICE_LAYOUT.map.propSprites.find(
      (sprite) => sprite.id === "support-counter:center",
    );
    expect(MAU_OFFICE_LAYOUT.anchors.outside_support).toMatchObject({
      tileX: 20,
      tileY: 20,
      facingOverride: "north",
    });
    expect(
      [
        MAU_OFFICE_LAYOUT.anchors.support_customer_1,
        MAU_OFFICE_LAYOUT.anchors.support_customer_2,
        MAU_OFFICE_LAYOUT.anchors.support_customer_3,
      ].map((anchor) => `${anchor.tileX},${anchor.tileY}`),
    ).toEqual(["18,16", "20,16", "22,16"]);
    expect(
      [
        MAU_OFFICE_LAYOUT.anchors.support_customer_1,
        MAU_OFFICE_LAYOUT.anchors.support_customer_2,
        MAU_OFFICE_LAYOUT.anchors.support_customer_3,
      ].every((anchor) => anchor.tileY === (counter?.tileY ?? 0) + (counter?.tileHeight ?? 0)),
    ).toBe(true);
    expect(
      MAU_OFFICE_LAYOUT.map.wallSprites.find((sprite) => sprite.id === "support:wall-bottom:20"),
    ).toBeUndefined();
  });

  it("tracks room focus changes", () => {
    const state = setMauOfficeRoomFocus(createEmptyMauOfficeState(), "meeting");
    expect(state.roomFocus).toBe("meeting");
  });
});

describe("mau-office contract", () => {
  it("keeps the logical scene on a 16px grid", () => {
    expect(MAU_OFFICE_SCENE_WIDTH).toBe(1664);
    expect(MAU_OFFICE_SCENE_HEIGHT).toBe(1280);
    expect(MAU_OFFICE_LAYOUT.width).toBe(1664);
    expect(MAU_OFFICE_LAYOUT.height).toBe(1280);

    for (const room of Object.values(MAU_OFFICE_LAYOUT.rooms)) {
      expect(room.x % MAU_OFFICE_TILE_SIZE).toBe(0);
      expect(room.y % MAU_OFFICE_TILE_SIZE).toBe(0);
      expect(room.width % MAU_OFFICE_TILE_SIZE).toBe(0);
      expect(room.height % MAU_OFFICE_TILE_SIZE).toBe(0);
    }

    for (const node of Object.values(MAU_OFFICE_LAYOUT.nodes)) {
      expect(node.x).toBe(node.tileX * MAU_OFFICE_TILE_SIZE + MAU_OFFICE_TILE_SIZE / 2);
      expect(node.y).toBe(node.tileY * MAU_OFFICE_TILE_SIZE + MAU_OFFICE_FOOT_OFFSET_Y);
    }

    for (const anchor of Object.values(MAU_OFFICE_LAYOUT.anchors)) {
      expect(anchor.x).toBe(anchor.tileX * MAU_OFFICE_TILE_SIZE + MAU_OFFICE_TILE_SIZE / 2);
      expect(anchor.y).toBe(anchor.tileY * MAU_OFFICE_TILE_SIZE + MAU_OFFICE_FOOT_OFFSET_Y);
      expect(anchor.footprintTiles.width).toBeGreaterThan(0);
      expect(anchor.footprintTiles.height).toBeGreaterThan(0);
    }
  });

  it("keeps tiles, sprites, and labels inside the 26x20 scene", () => {
    for (const tile of MAU_OFFICE_LAYOUT.map.floorTiles) {
      expect(tile.tileX).toBeGreaterThanOrEqual(0);
      expect(tile.tileX).toBeLessThan(MAU_OFFICE_SCENE_TILES_W);
      expect(tile.tileY).toBeGreaterThanOrEqual(0);
      expect(tile.tileY).toBeLessThan(MAU_OFFICE_SCENE_TILES_H);
    }
    expect(
      MAU_OFFICE_LAYOUT.map.floorTiles.some((tile) => tile.tileY === MAU_OFFICE_SCENE_TILES_H - 1),
    ).toBe(true);

    for (const sprite of [
      ...MAU_OFFICE_LAYOUT.map.wallSprites,
      ...MAU_OFFICE_LAYOUT.map.propSprites,
    ]) {
      expect(sprite.tileX).toBeGreaterThanOrEqual(0);
      expect(sprite.tileY).toBeGreaterThanOrEqual(0);
      expect(sprite.tileX + sprite.tileWidth).toBeLessThanOrEqual(MAU_OFFICE_SCENE_TILES_W);
      expect(sprite.tileY + sprite.tileHeight).toBeLessThanOrEqual(MAU_OFFICE_SCENE_TILES_H);
    }

    for (const label of MAU_OFFICE_LAYOUT.map.labels) {
      expect(label.tileX).toBeGreaterThanOrEqual(0);
      expect(label.tileY).toBeGreaterThanOrEqual(0);
      expect(label.tileX + label.tileWidth).toBeLessThanOrEqual(MAU_OFFICE_SCENE_TILES_W);
      expect(label.tileY + label.tileHeight).toBeLessThanOrEqual(MAU_OFFICE_SCENE_TILES_H);
    }
  });

  it("builds a front wall band for wall-mounted props", () => {
    const frontWallSprites = MAU_OFFICE_LAYOUT.map.wallSprites.filter((sprite) =>
      sprite.asset.includes("wall-front-"),
    );
    expect(frontWallSprites.length).toBeGreaterThan(0);
    expect(frontWallSprites.every((sprite) => sprite.tileHeight === 3)).toBe(true);

    const wallMountedProps = MAU_OFFICE_LAYOUT.map.propSprites.filter((sprite) => {
      const wallMounted = sprite.id.includes("board") || sprite.id.includes("clocks");
      return wallMounted && (sprite.roomId === "desk" || sprite.roomId === "meeting");
    });
    expect(wallMountedProps.length).toBeGreaterThan(0);
    expect(
      wallMountedProps.every((sprite) => {
        const room =
          sprite.roomId === "desk" ? MAU_OFFICE_LAYOUT.rooms.desk : MAU_OFFICE_LAYOUT.rooms.meeting;
        return sprite.tileY > room.tileY;
      }),
    ).toBe(true);
    expect(
      wallMountedProps.every((sprite) => {
        const room =
          sprite.roomId === "desk" ? MAU_OFFICE_LAYOUT.rooms.desk : MAU_OFFICE_LAYOUT.rooms.meeting;
        return sprite.tileY + sprite.tileHeight <= room.tileY + 3.5;
      }),
    ).toBe(true);

    const deskWallFixtures = MAU_OFFICE_LAYOUT.map.propSprites.filter((sprite) =>
      ["desk-kanban", "desk-roadmap", "desk-calendar", "desk-clocks", "desk-camera"].includes(
        sprite.id,
      ),
    );
    expect(deskWallFixtures.length).toBe(5);
    expect(Object.fromEntries(deskWallFixtures.map((sprite) => [sprite.id, sprite.tileX]))).toEqual(
      {
        "desk-kanban": 2,
        "desk-roadmap": 6,
        "desk-calendar": 10,
        "desk-clocks": 11,
        "desk-camera": 14,
      },
    );
    for (let index = 0; index < deskWallFixtures.length; index += 1) {
      const current = deskWallFixtures[index]!;
      for (
        let compareIndex = index + 1;
        compareIndex < deskWallFixtures.length;
        compareIndex += 1
      ) {
        const other = deskWallFixtures[compareIndex]!;
        const overlapsX =
          current.tileX < other.tileX + other.tileWidth &&
          other.tileX < current.tileX + current.tileWidth;
        const overlapsY =
          current.tileY < other.tileY + other.tileHeight &&
          other.tileY < current.tileY + current.tileHeight;
        expect(overlapsX && overlapsY).toBe(false);
      }
    }
  });

  it("assembles stretch-slice props into contiguous room fixtures", () => {
    const breakRugSprites = MAU_OFFICE_LAYOUT.map.propSprites.filter((sprite) =>
      sprite.id.startsWith("break-rug:"),
    );
    expect(breakRugSprites.length).toBe(9);
    const breakRugMinY = Math.min(...breakRugSprites.map((sprite) => sprite.tileY));
    const breakRugMinX = Math.min(...breakRugSprites.map((sprite) => sprite.tileX));
    const breakRugMaxY = Math.max(
      ...breakRugSprites.map((sprite) => sprite.tileY + sprite.tileHeight),
    );
    const breakRugMaxX = Math.max(
      ...breakRugSprites.map((sprite) => sprite.tileX + sprite.tileWidth),
    );
    expect(breakRugMinY).toBeGreaterThan(MAU_OFFICE_LAYOUT.rooms.break.tileY + 3);
    expect(breakRugMaxY).toBeLessThanOrEqual(
      MAU_OFFICE_LAYOUT.rooms.break.tileY + MAU_OFFICE_LAYOUT.rooms.break.tileHeight - 1,
    );
    expect(breakRugMinX).toBe(3);
    expect(breakRugMaxX - breakRugMinX).toBe(4);

    const breakArcade = MAU_OFFICE_LAYOUT.map.propSprites.find(
      (sprite) => sprite.id === "break-arcade",
    );
    expect(breakArcade).toMatchObject({ tileX: 1, tileY: 15 });
    const breakTable = MAU_OFFICE_LAYOUT.map.propSprites.find(
      (sprite) => sprite.id === "break-round-table",
    );
    expect(breakTable).toMatchObject({ tileX: 4, tileY: 16 });
    const breakFoosball = MAU_OFFICE_LAYOUT.map.propSprites.find(
      (sprite) => sprite.id === "break-foosball",
    );
    expect(breakFoosball).toMatchObject({ tileX: 10, tileY: 16 });
    expect(MAU_OFFICE_LAYOUT.anchors.break_jukebox.tileY).toBeGreaterThan(
      MAU_OFFICE_LAYOUT.rooms.break.tileY + 2,
    );
    expect(MAU_OFFICE_LAYOUT.anchors.break_snack.tileY).toBeGreaterThan(
      (MAU_OFFICE_LAYOUT.map.propSprites.find((sprite) => sprite.id === "break-shelf")?.tileY ??
        0) + 1,
    );
    expect(
      MAU_OFFICE_LAYOUT.map.propSprites.some(
        (sprite) =>
          sprite.id === "break-stool-a" ||
          sprite.id === "break-stool-b" ||
          sprite.id === "break-plant",
      ),
    ).toBe(false);

    const meetingTableSprites = MAU_OFFICE_LAYOUT.map.propSprites.filter((sprite) =>
      sprite.id.startsWith("meeting-table:"),
    );
    const meetingMinX = Math.min(...meetingTableSprites.map((sprite) => sprite.tileX));
    const meetingMinY = Math.min(...meetingTableSprites.map((sprite) => sprite.tileY));
    const meetingMaxX = Math.max(
      ...meetingTableSprites.map((sprite) => sprite.tileX + sprite.tileWidth),
    );
    const meetingMaxY = Math.max(
      ...meetingTableSprites.map((sprite) => sprite.tileY + sprite.tileHeight),
    );
    expect(meetingMinX).toBe(18.5);
    expect(meetingMinY).toBe(4);
    expect(meetingMaxX - meetingMinX).toBe(4);
    expect(meetingMaxY - meetingMinY).toBe(3);
    expect(meetingMinX + (meetingMaxX - meetingMinX) / 2).toBe(
      MAU_OFFICE_LAYOUT.rooms.meeting.tileX + MAU_OFFICE_LAYOUT.rooms.meeting.tileWidth / 2,
    );

    const supportCounterSprites = MAU_OFFICE_LAYOUT.map.propSprites.filter((sprite) =>
      sprite.id.startsWith("support-counter:"),
    );
    const supportMinX = Math.min(...supportCounterSprites.map((sprite) => sprite.tileX));
    const supportMinY = Math.min(...supportCounterSprites.map((sprite) => sprite.tileY));
    const supportMaxX = Math.max(
      ...supportCounterSprites.map((sprite) => sprite.tileX + sprite.tileWidth),
    );
    const supportMaxY = Math.max(
      ...supportCounterSprites.map((sprite) => sprite.tileY + sprite.tileHeight),
    );
    expect(supportMinX).toBe(17.5);
    expect(supportMinY).toBe(14);
    expect(supportMaxX - supportMinX).toBe(6);
    expect(supportMaxY - supportMinY).toBe(2);
    expect(supportMinX + (supportMaxX - supportMinX) / 2).toBe(
      MAU_OFFICE_LAYOUT.rooms.support.tileX + MAU_OFFICE_LAYOUT.rooms.support.tileWidth / 2,
    );

    const counterCenter = MAU_OFFICE_LAYOUT.map.propSprites.find(
      (sprite) => sprite.id === "support-counter:center",
    );
    expect(counterCenter?.tileWidth).toBe(4);
    expect(counterCenter?.tileHeight).toBe(2);

    const counterCaps = supportCounterSprites.filter(
      (sprite) => sprite.id !== "support-counter:center",
    );
    expect(counterCaps.every((sprite) => sprite.tileWidth === 1 && sprite.tileHeight === 2)).toBe(
      true,
    );

    const meetingBoard = MAU_OFFICE_LAYOUT.map.propSprites.find(
      (sprite) => sprite.id === "meeting-board",
    );
    expect(meetingBoard).toBeDefined();
    expect(meetingBoard!.tileX + meetingBoard!.tileWidth / 2).toBe(
      MAU_OFFICE_LAYOUT.rooms.meeting.tileX + MAU_OFFICE_LAYOUT.rooms.meeting.tileWidth / 2,
    );
  });

  it("keeps desk and counter accessories snapped to the 0.5-tile subgrid", () => {
    const accessories = MAU_OFFICE_LAYOUT.map.propSprites.filter(
      (sprite) =>
        sprite.kind === "accessory" &&
        (sprite.roomId === "desk" ||
          (sprite.roomId === "support" && sprite.id.startsWith("support-"))),
    );

    expect(accessories.length).toBeGreaterThan(0);
    expect(
      accessories.some(
        (sprite) => !Number.isInteger(sprite.tileX) || !Number.isInteger(sprite.tileY),
      ),
    ).toBe(true);
    expect(
      accessories.every(
        (sprite) => Number.isInteger(sprite.tileX * 2) && Number.isInteger(sprite.tileY * 2),
      ),
    ).toBe(true);
  });

  it("keeps tabletop props on the shared 1x1 source grid instead of render-time shrink hacks", () => {
    for (const asset of [
      "mau-office/items/desktop-monitor-v1.png",
      "mau-office/items/monitor-code-v1.png",
      "mau-office/items/monitor-chart-v1.png",
      "mau-office/items/monitor-back-v1.png",
      "mau-office/items/book-open-v1.png",
      "mau-office/items/book-stack-closed-v1.png",
      "mau-office/items/book-stack-mixed-v1.png",
      "mau-office/items/paper-stack-v1.png",
    ]) {
      const spec = resolveMauOfficeAssetScaleSpec(asset);
      expect(spec?.slotTiles.width).toBe(1);
      expect(spec?.slotTiles.height).toBe(1);
      expect(spec?.logicalFootprintTiles).toBeUndefined();
    }
  });

  it("keeps support wall props out of the top-door column", () => {
    const supportDoorColumn = 20;
    const supportWallProps = MAU_OFFICE_LAYOUT.map.propSprites.filter(
      (sprite) => sprite.roomId === "support" && sprite.kind === "board" && sprite.tileY < 13,
    );
    expect(supportWallProps.length).toBeGreaterThan(0);
    expect(
      supportWallProps.every(
        (sprite) =>
          !(
            sprite.tileX <= supportDoorColumn && sprite.tileX + sprite.tileWidth > supportDoorColumn
          ),
      ),
    ).toBe(true);
  });

  it("uses open hall thresholds instead of internal room door sprites", () => {
    const internalDoors = MAU_OFFICE_LAYOUT.map.wallSprites.filter(
      (sprite) => sprite.kind === "door",
    );
    expect(internalDoors).toHaveLength(0);

    const thresholdTiles = [
      [8, 9],
      [8, 11],
      [20, 11],
    ] as const;

    for (const [tileX, tileY] of thresholdTiles) {
      const floorTile = MAU_OFFICE_LAYOUT.map.floorTiles.find(
        (tile) => tile.tileX === tileX && tile.tileY === tileY,
      );
      expect(floorTile?.roomId).toBe("hall");
    }
    expect(
      MAU_OFFICE_LAYOUT.map.floorTiles.find((tile) => tile.tileX === 7 && tile.tileY === 10),
    ).toBeUndefined();
    expect(
      MAU_OFFICE_LAYOUT.map.floorTiles.find((tile) => tile.tileX === 21 && tile.tileY === 10),
    ).toBeUndefined();
    expect(
      MAU_OFFICE_LAYOUT.map.wallSprites.some((sprite) => sprite.id.startsWith("hall-divider:")),
    ).toBe(false);

    const lowerCenterTiles = [
      [15, 11],
      [15, 14],
      [15, 18],
    ] as const;
    for (const [tileX, tileY] of lowerCenterTiles) {
      const floorTile = MAU_OFFICE_LAYOUT.map.floorTiles.find(
        (tile) => tile.tileX === tileX && tile.tileY === tileY,
      );
      expect(floorTile?.roomId).toBe("break");
    }

    const upperCenterTiles = [
      [15, 1],
      [15, 5],
      [15, 9],
    ] as const;
    for (const [tileX, tileY] of upperCenterTiles) {
      const floorTile = MAU_OFFICE_LAYOUT.map.floorTiles.find(
        (tile) => tile.tileX === tileX && tile.tileY === tileY,
      );
      expect(floorTile?.roomId).toBe("desk");
    }

    const topPassageTiles = [
      [15, 6],
      [16, 6],
    ] as const;
    for (const [tileX, tileY] of topPassageTiles) {
      const floorTile = MAU_OFFICE_LAYOUT.map.floorTiles.find(
        (tile) => tile.tileX === tileX && tile.tileY === tileY,
      );
      expect(floorTile?.roomId).toBe("hall");
    }
    expect(
      MAU_OFFICE_LAYOUT.map.wallSprites.find((sprite) => sprite.id === "desk:wall-right:6"),
    ).toBeUndefined();
    expect(
      MAU_OFFICE_LAYOUT.map.wallSprites.find((sprite) => sprite.id === "meeting:wall-left:6"),
    ).toBeUndefined();
    const meetingThresholdFloor = MAU_OFFICE_LAYOUT.map.floorTiles.find(
      (tile) => tile.tileX === 20 && tile.tileY === 9,
    );
    expect(meetingThresholdFloor?.roomId).toBe("meeting");
    expect(
      MAU_OFFICE_LAYOUT.map.wallSprites.find((sprite) => sprite.id === "meeting:wall-bottom:20"),
    ).toBeDefined();

    expect(
      MAU_OFFICE_LAYOUT.map.wallSprites.find((sprite) => sprite.id === "hall-cap-left:10"),
    ).toMatchObject({ tileX: 7, tileY: 10 });
    expect(
      MAU_OFFICE_LAYOUT.map.wallSprites.find((sprite) => sprite.id === "hall-cap-right:10"),
    ).toMatchObject({ tileX: 21, tileY: 10 });
    expect(
      MAU_OFFICE_LAYOUT.map.wallSprites.find((sprite) => sprite.id === "desk:wall-bottom:7"),
    ).toMatchObject({ asset: expect.stringContaining("tiles/wall-corner-br.png") });
    expect(
      MAU_OFFICE_LAYOUT.map.wallSprites.find((sprite) => sprite.id === "desk:wall-bottom:9"),
    ).toMatchObject({ asset: expect.stringContaining("tiles/wall-corner-bl.png") });
    expect(
      MAU_OFFICE_LAYOUT.map.wallSprites.find((sprite) => sprite.id === "meeting:wall-bottom:21"),
    ).toMatchObject({ asset: expect.stringContaining("tiles/wall-corner-bl.png") });
    expect(
      MAU_OFFICE_LAYOUT.map.wallSprites.find((sprite) => sprite.id === "break:wall-front:7"),
    ).toMatchObject({ asset: expect.stringContaining("tiles/wall-front-right.png") });
    expect(
      MAU_OFFICE_LAYOUT.map.wallSprites.find((sprite) => sprite.id === "break:wall-front:9"),
    ).toMatchObject({ asset: expect.stringContaining("tiles/wall-front-left.png") });
    expect(
      MAU_OFFICE_LAYOUT.map.wallSprites.find((sprite) => sprite.id === "break:wall-front:15"),
    ).toMatchObject({ asset: expect.stringContaining("tiles/wall-front-right.png") });
    expect(
      MAU_OFFICE_LAYOUT.map.wallSprites.find((sprite) => sprite.id === "support:wall-front:16"),
    ).toMatchObject({ asset: expect.stringContaining("tiles/wall-front-left.png") });
    expect(
      MAU_OFFICE_LAYOUT.map.wallSprites.find((sprite) => sprite.id === "break:wall-bottom:8"),
    ).toBeUndefined();
  });

  it("uses the break room bottom as the only outside entry", () => {
    expect(MAU_OFFICE_LAYOUT.anchors.outside_mauHome).toMatchObject({
      tileX: 8,
      tileY: 20,
      facingOverride: "north",
    });
    expect(MAU_OFFICE_LAYOUT.nodes.outside_mauHome.neighbors).toEqual(["break_entry"]);
    expect(MAU_OFFICE_LAYOUT.nodes.break_entry.neighbors).toEqual([
      "outside_mauHome",
      "break_center",
    ]);
  });

  it("keeps meeting chairs one tile away from the room walls", () => {
    const room = MAU_OFFICE_LAYOUT.rooms.meeting;
    const chairs = MAU_OFFICE_LAYOUT.map.propSprites.filter(
      (sprite) => sprite.roomId === "meeting" && sprite.kind === "chair",
    );
    expect(chairs.length).toBeGreaterThan(0);
    expect(chairs.every((sprite) => sprite.tileX >= room.tileX + 1)).toBe(true);
    expect(
      chairs.every((sprite) => sprite.tileX + sprite.tileWidth <= room.tileX + room.tileWidth - 1),
    ).toBe(true);
    expect(chairs.every((sprite) => sprite.tileY >= room.tileY + 1)).toBe(true);
    expect(
      chairs.every(
        (sprite) => sprite.tileY + sprite.tileHeight <= room.tileY + room.tileHeight - 1,
      ),
    ).toBe(true);
  });

  it("places one upward-facing chair under each desk worker seat", () => {
    const deskChairs = MAU_OFFICE_LAYOUT.map.propSprites.filter(
      (sprite) => sprite.roomId === "desk" && sprite.id.startsWith("desk-chair-"),
    );
    expect(deskChairs).toHaveLength(6);
    expect(deskChairs.every((sprite) => sprite.asset.includes("chair-front-v1.png"))).toBe(true);
    expect(deskChairs.map((sprite) => `${sprite.tileX},${sprite.tileY}`).toSorted()).toEqual([
      "12,5",
      "12,8",
      "4,5",
      "4,8",
      "8,5",
      "8,8",
    ]);
  });

  it("keeps seated desk workers snapped to the chair row instead of floating above it", () => {
    const deskChairs = new Map(
      MAU_OFFICE_LAYOUT.map.propSprites
        .filter((sprite) => sprite.roomId === "desk" && sprite.id.startsWith("desk-chair-"))
        .map((sprite) => [sprite.id.slice(-1), sprite]),
    );
    const deskSeatPairs = [
      ["a", "desk_worker_1"],
      ["b", "desk_worker_2"],
      ["c", "desk_worker_3"],
      ["d", "desk_worker_4"],
      ["e", "desk_worker_5"],
      ["f", "desk_worker_6"],
    ] as const;

    for (const [index, anchorId] of deskSeatPairs) {
      const anchor = MAU_OFFICE_LAYOUT.anchors[anchorId];
      const chair = deskChairs.get(index);
      expect(anchor, `missing anchor ${anchorId}`).toBeDefined();
      expect(chair, `missing chair for ${anchorId}`).toBeDefined();
      if (!anchor || !chair) {
        continue;
      }
      expect(anchor.tileX).toBe(chair.tileX);
      expect(anchor.tileY).toBe(chair.tileY);
      expect(anchor.y + MAU_OFFICE_WORKER_RENDER_METRICS.poseOffsetYPx.sit).toBe(
        (chair.tileY + 1) * MAU_OFFICE_TILE_SIZE,
      );
    }
  });

  it("centers the 3x2 desk cluster within the desk room", () => {
    const desks = MAU_OFFICE_LAYOUT.map.propSprites.filter(
      (sprite) => sprite.roomId === "desk" && sprite.kind === "desk",
    );
    expect(desks).toHaveLength(6);
    const room = MAU_OFFICE_LAYOUT.rooms.desk;
    const leftEdge = Math.min(...desks.map((sprite) => sprite.tileX));
    const rightEdge = Math.max(...desks.map((sprite) => sprite.tileX + sprite.tileWidth));
    expect(leftEdge - room.tileX).toBe(room.tileX + room.tileWidth - rightEdge);
  });

  it("keeps desk-top props cleanly on the desks without loose floor papers", () => {
    const desks = new Map(
      MAU_OFFICE_LAYOUT.map.propSprites
        .filter((sprite) => sprite.roomId === "desk" && sprite.kind === "desk")
        .map((sprite) => [sprite.id.replace("desk-", ""), sprite]),
    );
    const deskAccessories = MAU_OFFICE_LAYOUT.map.propSprites.filter(
      (sprite) =>
        sprite.roomId === "desk" &&
        sprite.kind === "accessory" &&
        /^desk-[a-f]-(monitor|book)$/.test(sprite.id),
    );

    expect(
      MAU_OFFICE_LAYOUT.map.propSprites.some(
        (sprite) => sprite.roomId === "desk" && /^desk-[a-f]-paper$/.test(sprite.id),
      ),
    ).toBe(false);

    for (const accessory of deskAccessories) {
      const [, deskId] = accessory.id.split("-");
      const desk = desks.get(deskId);
      expect(desk, `missing desk for ${accessory.id}`).toBeDefined();
      if (!desk) {
        continue;
      }
      expect(accessory.tileX).toBeGreaterThanOrEqual(desk.tileX);
      expect(accessory.tileX + accessory.tileWidth).toBeLessThanOrEqual(
        desk.tileX + desk.tileWidth,
      );
      expect(accessory.tileY).toBe(desk.tileY);
    }
  });

  it("keeps desk aisle machines out of the chair columns", () => {
    const chairColumns = new Set(
      MAU_OFFICE_LAYOUT.map.propSprites
        .filter((sprite) => sprite.roomId === "desk" && sprite.id.startsWith("desk-chair-"))
        .map((sprite) => sprite.tileX),
    );
    const machines = MAU_OFFICE_LAYOUT.map.propSprites.filter(
      (sprite) => sprite.roomId === "desk" && /^(desk-rack|desk-fax)-/.test(sprite.id),
    );
    expect(machines.map((sprite) => sprite.id).toSorted()).toEqual([
      "desk-rack-bottom",
      "desk-rack-top",
    ]);
    expect(machines.every((sprite) => !chairColumns.has(sprite.tileX))).toBe(true);
    expect(machines.find((sprite) => sprite.id === "desk-rack-top")?.tileY).toBe(
      MAU_OFFICE_LAYOUT.map.propSprites.find((sprite) => sprite.id === "desk-a")?.tileY,
    );
    expect(machines.find((sprite) => sprite.id === "desk-rack-bottom")?.tileY).toBe(
      MAU_OFFICE_LAYOUT.map.propSprites.find((sprite) => sprite.id === "desk-d")?.tileY,
    );
  });

  it("keeps the support counter accessories sparse and centered on the counter", () => {
    const counter = MAU_OFFICE_LAYOUT.map.propSprites.find(
      (sprite) => sprite.id === "support-counter:center",
    );
    expect(counter).toBeDefined();
    const accessories = MAU_OFFICE_LAYOUT.map.propSprites.filter(
      (sprite) => sprite.roomId === "support" && /^support-(monitor|paper)/.test(sprite.id),
    );
    expect(accessories.map((sprite) => sprite.id).toSorted()).toEqual([
      "support-monitor-back-left",
      "support-monitor-back-right",
      "support-paper-center",
    ]);
    for (const accessory of accessories) {
      expect(accessory.tileY).toBe(counter?.tileY);
      expect(accessory.tileX).toBeGreaterThanOrEqual(counter?.tileX ?? 0);
      expect(accessory.tileX + accessory.tileWidth).toBeLessThanOrEqual(
        (counter?.tileX ?? 0) + (counter?.tileWidth ?? 0),
      );
    }
  });

  it("keeps support staff anchors behind the customer counter", () => {
    const counter = MAU_OFFICE_LAYOUT.map.propSprites.find(
      (sprite) => sprite.id === "support-counter:center",
    );
    expect(counter).toBeDefined();
    const anchors = [
      MAU_OFFICE_LAYOUT.anchors.support_staff_1,
      MAU_OFFICE_LAYOUT.anchors.support_staff_2,
      MAU_OFFICE_LAYOUT.anchors.support_staff_3,
    ];
    expect(anchors.every((anchor) => anchor.tileY === 14)).toBe(true);
    expect(
      anchors.every((anchor) => anchor.tileY < (counter?.tileY ?? 0) + (counter?.tileHeight ?? 0)),
    ).toBe(true);
  });

  it("keeps every referenced asset on the shared 64px source grid with manifest coverage", async () => {
    for (const asset of collectMauOfficeReferencedAssetPaths()) {
      const spec = resolveMauOfficeAssetScaleSpec(asset);
      expect(spec, `missing MauOffice scale spec for ${asset}`).not.toBeNull();
      const size = await readPngSize(asset);
      expect(size).toEqual(spec?.sourceCanvas);
      expect(spec?.slotTiles.width).toBe(
        spec!.sourceCanvas.width / MAU_OFFICE_ASSET_PIXELS_PER_TILE,
      );
      expect(spec?.slotTiles.height).toBe(
        spec!.sourceCanvas.height / MAU_OFFICE_ASSET_PIXELS_PER_TILE,
      );
    }
  });

  it("keeps Pixellab provenance for every committed MauOffice asset", () => {
    const referencedAssets = collectMauOfficeReferencedAssetPaths();
    expect(Object.keys(MAU_OFFICE_PIXELLAB_PROVENANCE).sort()).toEqual(referencedAssets);
    for (const asset of referencedAssets) {
      const entry = MAU_OFFICE_PIXELLAB_PROVENANCE[asset];
      expect(entry?.asset).toBe(asset);
      expect(entry?.jobId?.trim().length).toBeGreaterThan(0);
      expect(entry?.prompt?.trim().length).toBeGreaterThan(0);
      expect(entry?.selectedOutput?.trim().length).toBeGreaterThan(0);
      expect(entry?.beautyStatus).toBe("accepted");
    }
  });

  it("keeps native visible bounds inside manifest-defined acceptance bands", async () => {
    const fixedAssets = new Map(
      MAU_OFFICE_ASSET_SCALE_SPECS.map((spec) => [spec.asset, spec] as const),
    );

    for (const [asset, spec] of fixedAssets.entries()) {
      const bounds = await readPngOpaqueBounds(asset);
      if (spec.visibleBounds) {
        expectWithinRange(bounds.width, spec.visibleBounds.width, `${asset} width`);
        expectWithinRange(bounds.height, spec.visibleBounds.height, `${asset} height`);
        if (spec.visibleBounds.maxOffsetX !== undefined) {
          expect(bounds.offsetX).toBeLessThanOrEqual(spec.visibleBounds.maxOffsetX);
        }
        if (spec.visibleBounds.maxOffsetY !== undefined) {
          expect(bounds.offsetY).toBeLessThanOrEqual(spec.visibleBounds.maxOffsetY);
        }
      }
    }
  });

  it("keeps prop semantics believable relative to the worker and door references", async () => {
    const workerBounds = await readPngOpaqueBounds(
      MAU_OFFICE_WORKER_RIGS.cat.stand.south.frames[0]!,
    );
    const doorBounds = await readPngOpaqueBounds("mau-office/tiles/door-top.png");

    for (const spec of MAU_OFFICE_ASSET_SCALE_SPECS) {
      if (!spec.semantic) {
        continue;
      }
      const bounds = await readPngOpaqueBounds(spec.asset);
      if (spec.semantic.workerHeightRatio) {
        expectWithinRange(
          bounds.height / workerBounds.height,
          spec.semantic.workerHeightRatio,
          `${spec.asset} worker-height ratio`,
        );
      }
      if (spec.semantic.maxDoorHeightRatio !== undefined) {
        expect(bounds.height / doorBounds.height).toBeLessThanOrEqual(
          spec.semantic.maxDoorHeightRatio,
        );
      }
    }
  });

  it("keeps every worker rig pose family on the expected animation frame counts", () => {
    for (const [rigId, rig] of Object.entries(MAU_OFFICE_WORKER_RIGS)) {
      for (const [direction, animation] of Object.entries(rig.stand)) {
        expect(animation.frames, `${rigId} stand ${direction}`).toHaveLength(4);
      }
      for (const [direction, animation] of Object.entries(rig.sit)) {
        expect(animation.frames, `${rigId} sit ${direction}`).toHaveLength(4);
      }
      for (const [direction, animation] of Object.entries(rig.walk)) {
        expect(animation.frames, `${rigId} walk ${direction}`).toHaveLength(6);
      }
      for (const [direction, animation] of Object.entries(rig.reach)) {
        expect(animation.frames, `${rigId} reach ${direction}`).toHaveLength(4);
      }
      for (const [direction, animation] of Object.entries(rig.dance)) {
        expect(animation.frames, `${rigId} dance ${direction}`).toHaveLength(4);
      }
      for (const [direction, animation] of Object.entries(rig.jump)) {
        expect(animation.frames, `${rigId} jump ${direction}`).toHaveLength(4);
      }
      for (const [direction, animation] of Object.entries(rig.chase)) {
        expect(animation.frames, `${rigId} chase ${direction}`).toHaveLength(4);
      }
      for (const [direction, animation] of Object.entries(rig.chat)) {
        expect(animation.frames, `${rigId} chat ${direction}`).toHaveLength(4);
      }
      expect(rig.sleepFloor.frames, `${rigId} sleep-floor`).toHaveLength(4);
    }
  });

  it("keeps upright worker frames within one consistent visual scale band", async () => {
    const workerAssets = collectWorkerFrameAssets();

    for (const asset of workerAssets) {
      if (asset.includes("/sleep-floor/")) {
        continue;
      }
      const bounds = await readPngOpaqueBounds(asset);
      expectWithinRange(
        bounds.width,
        MAU_OFFICE_WORKER_FRAME_SPEC.visibleBounds!.width,
        `${asset} width`,
      );
      expectWithinRange(
        bounds.height,
        MAU_OFFICE_WORKER_FRAME_SPEC.visibleBounds!.height,
        `${asset} height`,
      );
      expect(bounds.offsetX).toBeLessThanOrEqual(
        MAU_OFFICE_WORKER_FRAME_SPEC.visibleBounds!.maxOffsetX ?? 64,
      );
      expect(bounds.offsetY).toBeLessThanOrEqual(
        MAU_OFFICE_WORKER_FRAME_SPEC.visibleBounds!.maxOffsetY ?? 64,
      );
      // Worker rigs can vary slightly in head silhouette, but they should still share one foot row.
      expect(bounds.offsetY + bounds.height, `${asset} bottom`).toBeGreaterThanOrEqual(58);
      expect(bounds.offsetY + bounds.height, `${asset} bottom`).toBeLessThanOrEqual(61);
    }
  });

  it("keeps sleep-floor worker placeholders inside their own horizontal scale band", async () => {
    const sleepFloorAssets = collectWorkerFrameAssets().filter((asset) =>
      asset.includes("/sleep-floor/"),
    );

    for (const asset of sleepFloorAssets) {
      const bounds = await readPngOpaqueBounds(asset);
      expectWithinRange(
        bounds.width,
        MAU_OFFICE_SLEEP_FLOOR_FRAME_SPEC.visibleBounds!.width,
        `${asset} width`,
      );
      expectWithinRange(
        bounds.height,
        MAU_OFFICE_SLEEP_FLOOR_FRAME_SPEC.visibleBounds!.height,
        `${asset} height`,
      );
      expect(bounds.offsetX).toBeLessThanOrEqual(
        MAU_OFFICE_SLEEP_FLOOR_FRAME_SPEC.visibleBounds!.maxOffsetX ?? 64,
      );
      expect(bounds.offsetY).toBeLessThanOrEqual(
        MAU_OFFICE_SLEEP_FLOOR_FRAME_SPEC.visibleBounds!.maxOffsetY ?? 64,
      );
      expect(bounds.offsetY + bounds.height, `${asset} bottom`).toBeGreaterThanOrEqual(59);
      expect(bounds.offsetY + bounds.height, `${asset} bottom`).toBeLessThanOrEqual(62);
    }
  });

  it("keeps the cat standing idle rig as a real four-frame Pixellab animation", async () => {
    for (const direction of ["north", "east", "south", "west"] as const) {
      const hashes = await Promise.all(
        MAU_OFFICE_WORKER_RIGS.cat.stand[direction].frames.map((asset) => readAssetHash(asset)),
      );
      expect(new Set(hashes).size, `cat stand ${direction}`).toBeGreaterThan(1);
    }
  });

  it("keeps the cat seated idle rig as a real four-frame Pixellab animation", async () => {
    for (const direction of ["north", "east", "south", "west"] as const) {
      const hashes = await Promise.all(
        MAU_OFFICE_WORKER_RIGS.cat.sit[direction].frames.map((asset) => readAssetHash(asset)),
      );
      expect(new Set(hashes).size, `cat sit ${direction}`).toBeGreaterThan(1);
    }
  });

  it("keeps the human standing idle rig as a real four-frame Pixellab animation", async () => {
    for (const direction of ["north", "east", "south", "west"] as const) {
      const hashes = await Promise.all(
        MAU_OFFICE_WORKER_RIGS.human.stand[direction].frames.map((asset) => readAssetHash(asset)),
      );
      expect(new Set(hashes).size, `human stand ${direction}`).toBeGreaterThan(1);
    }
  });

  it("keeps the bird standing idle rig as a real four-frame Pixellab animation", async () => {
    for (const direction of ["north", "east", "south", "west"] as const) {
      const hashes = await Promise.all(
        MAU_OFFICE_WORKER_RIGS.bird.stand[direction].frames.map((asset) => readAssetHash(asset)),
      );
      expect(new Set(hashes).size, `bird stand ${direction}`).toBeGreaterThan(1);
    }
  });

  it("keeps the deer standing idle rig as a real four-frame Pixellab animation", async () => {
    for (const direction of ["north", "east", "south", "west"] as const) {
      const hashes = await Promise.all(
        MAU_OFFICE_WORKER_RIGS.deer.stand[direction].frames.map((asset) => readAssetHash(asset)),
      );
      expect(new Set(hashes).size, `deer stand ${direction}`).toBeGreaterThan(1);
    }
  });

  it("keeps the bird walking rig as a real six-frame Pixellab animation", async () => {
    for (const direction of ["north", "east", "south", "west"] as const) {
      const hashes = await Promise.all(
        MAU_OFFICE_WORKER_RIGS.bird.walk[direction].frames.map((asset) => readAssetHash(asset)),
      );
      expect(new Set(hashes).size, `bird walk ${direction}`).toBeGreaterThan(1);
    }
  });

  it("keeps the deer walking rig as a real six-frame Pixellab animation", async () => {
    for (const direction of ["north", "east", "south", "west"] as const) {
      const hashes = await Promise.all(
        MAU_OFFICE_WORKER_RIGS.deer.walk[direction].frames.map((asset) => readAssetHash(asset)),
      );
      expect(new Set(hashes).size, `deer walk ${direction}`).toBeGreaterThan(1);
    }
  });

  it("keeps the dog standing idle rig as a real four-frame Pixellab animation", async () => {
    for (const direction of ["north", "east", "south", "west"] as const) {
      const hashes = await Promise.all(
        MAU_OFFICE_WORKER_RIGS.dog.stand[direction].frames.map((asset) => readAssetHash(asset)),
      );
      expect(new Set(hashes).size, `dog stand ${direction}`).toBeGreaterThan(1);
    }
  });

  it("keeps the dog walking rig as a real six-frame Pixellab animation", async () => {
    for (const direction of ["north", "east", "south", "west"] as const) {
      const hashes = await Promise.all(
        MAU_OFFICE_WORKER_RIGS.dog.walk[direction].frames.map((asset) => readAssetHash(asset)),
      );
      expect(new Set(hashes).size, `dog walk ${direction}`).toBeGreaterThan(1);
    }
  });
});

describe("mau-office view", () => {
  it("renders a layered stage with pixel chrome and hides route breadcrumbs", () => {
    installMatchMediaStub(false);
    installViewportWidthStub(1600);
    const container = document.createElement("div");
    const sitAnchor = MAU_OFFICE_LAYOUT.anchors.desk_worker_1;
    const walkingPath: OfficePath = {
      nodeIds: ["support_entry", "support_customer_2", "support_customer_1"],
      waypoints: [
        {
          x: MAU_OFFICE_LAYOUT.nodes.outside_support.x,
          y: MAU_OFFICE_LAYOUT.nodes.outside_support.y,
          nodeId: "outside_support",
        },
        {
          x: MAU_OFFICE_LAYOUT.nodes.support_entry.x,
          y: MAU_OFFICE_LAYOUT.nodes.support_entry.y,
          nodeId: "support_entry",
        },
        {
          x: MAU_OFFICE_LAYOUT.nodes.support_customer_2.x,
          y: MAU_OFFICE_LAYOUT.nodes.support_customer_2.y,
          nodeId: "support_customer_2",
        },
        {
          x: MAU_OFFICE_LAYOUT.nodes.support_customer_1.x,
          y: MAU_OFFICE_LAYOUT.nodes.support_customer_1.y,
          nodeId: "support_customer_1",
        },
      ],
      segmentIndex: 0,
      segmentStartedAtMs: 0,
      segmentDurationMs: 700,
      targetAnchorId: "support_customer_1",
      mode: "move",
    };
    const state: MauOfficeState = {
      ...createEmptyMauOfficeState(),
      loaded: true,
      nowMs: 0,
      actorOrder: ["worker:desk", "worker:walk"],
      actors: {
        "worker:desk": makeActor({
          id: "worker:desk",
          anchorId: "desk_worker_1",
          nodeId: "desk_center",
          x: sitAnchor.x,
          y: sitAnchor.y,
          bubbles: [makeBubble("heads down")],
        }),
        "worker:walk": makeActor({
          id: "worker:walk",
          anchorId: "outside_support",
          nodeId: "outside_support",
          currentRoomId: "outside",
          currentActivity: makeActivity(
            "walk",
            "walking",
            "support",
            "support_customer_1",
            "Walking",
          ),
          path: walkingPath,
          x: MAU_OFFICE_LAYOUT.nodes.outside_support.x,
          y: MAU_OFFICE_LAYOUT.nodes.outside_support.y,
        }),
      },
    };

    render(
      renderMauOffice({
        loading: false,
        error: null,
        state,
        basePath: "",
        onRefresh: () => undefined,
        onRoomFocus: () => undefined,
        onActorOpen: () => undefined,
      }),
      container,
    );

    expect(container.querySelector(".mau-office__scene-backdrop")).toBeNull();
    expect(container.querySelectorAll(".mau-office__tile").length).toBe(
      MAU_OFFICE_LAYOUT.map.floorTiles.length,
    );
    expect(container.querySelector(".mau-office__sign-image")).toBeNull();
    expect(container.querySelectorAll(".mau-office__bubble-slice").length).toBeGreaterThanOrEqual(
      9,
    );
    expect(container.querySelectorAll(".mau-office__bubble-tail").length).toBeGreaterThanOrEqual(1);
    expect(container.querySelectorAll(".mau-office__path-marker").length).toBe(0);
    expect(container.querySelector(".mau-office__bubble-text")?.textContent).toContain(
      "heads down",
    );
    const sitWorker = container.querySelector(".mau-office__worker--sit");
    expect(sitWorker).not.toBeNull();
    expect(sitWorker?.getAttribute("title")).toBeNull();
    const sitWorkerStyle = normalizeStyle(sitWorker?.getAttribute("style"));
    expect(sitWorkerStyle).toContain(`width:${MAU_OFFICE_WORKER_RENDER_METRICS.logicalWidthPx}px`);
    expect(sitWorkerStyle).toContain(
      `height:${MAU_OFFICE_WORKER_RENDER_METRICS.logicalHeightPx}px`,
    );
    expect(sitWorkerStyle).toContain(
      `transform:translate(-50%,calc(-100%+${MAU_OFFICE_WORKER_RENDER_METRICS.poseOffsetYPx.sit}px))`,
    );

    const deskSprite = container.querySelector(".mau-office__sprite--desk");
    expect(deskSprite).not.toBeNull();
    const deskStyle = normalizeStyle(deskSprite?.getAttribute("style"));
    expect(deskStyle).toContain(
      `width:${sourcePxToLogicalPx(MAU_OFFICE_ASSET_PIXELS_PER_TILE * 3)}px`,
    );
    expect(deskStyle).toContain(
      `height:${sourcePxToLogicalPx(MAU_OFFICE_ASSET_PIXELS_PER_TILE * 2)}px`,
    );
    expect(parseStyleNumber(deskStyle, "z-index")).toBeLessThan(
      parseStyleNumber(sitWorkerStyle, "z-index"),
    );
    const chairSprite = container.querySelector(".mau-office__sprite--chair");
    expect(chairSprite).not.toBeNull();
    expect(
      parseStyleNumber(normalizeStyle(chairSprite?.getAttribute("style")), "z-index"),
    ).toBeGreaterThan(parseStyleNumber(sitWorkerStyle, "z-index"));
    const workerOverlay = container.querySelector(".mau-office__worker-overlay");
    expect(workerOverlay).not.toBeNull();
    expect(
      parseStyleNumber(normalizeStyle(workerOverlay?.getAttribute("style")), "z-index"),
    ).toBeGreaterThan(parseStyleNumber(deskStyle, "z-index"));

    const deskMonitor = container.querySelector(
      '.mau-office__sprite[src*="desktop-monitor-v1.png"]',
    );
    expect(deskMonitor).not.toBeNull();
    const deskMonitorStyle = normalizeStyle(deskMonitor?.getAttribute("style"));
    expect(parseStyleNumber(deskMonitorStyle, "width")).toBe(64);
    expect(parseStyleNumber(deskMonitorStyle, "height")).toBe(64);

    const wallSprite = container.querySelector(".mau-office__sprite--wall");
    expect(wallSprite).not.toBeNull();
    expect(
      parseStyleNumber(normalizeStyle(wallSprite?.getAttribute("style")), "height"),
    ).toBeGreaterThan(MAU_OFFICE_WORKER_RENDER_METRICS.logicalHeightPx);

    expect(container.querySelector(".mau-office__worker-badge")).toBeNull();
    expect(container.querySelector(".mau-office__history-copy strong")?.textContent).toBe(
      "Mau Worker",
    );
    expect(container.querySelector(".mau-office__history-copy span")?.textContent).toContain(
      "heads down",
    );

    const bubbleStyle = normalizeStyle(
      container.querySelector(".mau-office__bubble")?.getAttribute("style"),
    );
    expect(bubbleStyle).toContain(`width:${MAU_OFFICE_WORKER_RENDER_METRICS.bubble.minWidthPx}px`);
    expect(bubbleStyle).toContain(
      `height:${MAU_OFFICE_WORKER_RENDER_METRICS.bubble.minHeightPx}px`,
    );
    expect(bubbleStyle).toContain(
      `bottom:${MAU_OFFICE_WORKER_RENDER_METRICS.logicalHeightPx + 5}px`,
    );
    expect(bubbleStyle).toContain(
      `transform:translate(-50%,${MAU_OFFICE_WORKER_RENDER_METRICS.bubble.offsetYPx}px)`,
    );
    expect(bubbleStyle).toContain("--mau-bubble-lines:4");
    const historyStyle = normalizeStyle(
      container.querySelector(".mau-office__history")?.getAttribute("style"),
    );
    expect(historyStyle).toContain(
      `width:${MAU_OFFICE_WORKER_RENDER_METRICS.history.minWidthPx}px`,
    );
    expect(historyStyle).toContain(
      `height:${MAU_OFFICE_WORKER_RENDER_METRICS.history.minHeightPx}px`,
    );
    expect(historyStyle).toContain(
      `bottom:${MAU_OFFICE_WORKER_RENDER_METRICS.logicalHeightPx + 20}px`,
    );
    expect(historyStyle).toContain(
      `transform:translate(-50%,${MAU_OFFICE_WORKER_RENDER_METRICS.history.offsetYPx}px)`,
    );
    expect(historyStyle).toContain("--mau-history-lines:2");

    expect(container.querySelector(".mau-office__viewport")?.getAttribute("style")).toContain(
      "--crop-width-px:1664px",
    );
    expect(container.querySelector(".mau-office__viewport")?.getAttribute("style")).toContain(
      "--mau-camera-scale:0.75",
    );
  });

  it("uses explicit worker animation overrides for placeholder animation families", () => {
    installMatchMediaStub(false);
    installViewportWidthStub(1600);
    const container = document.createElement("div");
    const standAnchor = MAU_OFFICE_LAYOUT.anchors.break_arcade;
    const state: MauOfficeState = {
      ...createEmptyMauOfficeState(),
      loaded: true,
      nowMs: 0,
      actorOrder: ["worker:dance", "worker:sleep"],
      actors: {
        "worker:dance": makeActor({
          id: "worker:dance",
          anchorId: "break_arcade",
          nodeId: "break_arcade",
          x: standAnchor.x,
          y: standAnchor.y,
          facing: "west",
          animationId: "dance",
        }),
        "worker:sleep": makeActor({
          id: "worker:sleep",
          anchorId: "break_arcade",
          nodeId: "break_arcade",
          x: standAnchor.x,
          y: standAnchor.y,
          animationId: "sleep-floor",
        }),
      },
    };

    render(
      renderMauOffice({
        loading: false,
        error: null,
        state,
        basePath: "",
        onRefresh: () => undefined,
        onRoomFocus: () => undefined,
        onActorOpen: () => undefined,
      }),
      container,
    );

    const workerSprites = Array.from(
      container.querySelectorAll<HTMLImageElement>(".mau-office__worker-sprite"),
    ).map((img) => img.getAttribute("src") ?? "");
    expect(workerSprites.some((src) => src.includes("/workers/cat/dance-west/"))).toBe(true);
    expect(workerSprites.some((src) => src.includes("/workers/cat/sleep-floor/"))).toBe(true);
    const sleepWorker = container.querySelector(".mau-office__worker--sleep");
    expect(sleepWorker).not.toBeNull();
    expect(normalizeStyle(sleepWorker?.getAttribute("style"))).toContain(
      `transform:translate(-50%,calc(-100%+${MAU_OFFICE_WORKER_RENDER_METRICS.poseOffsetYPx.sleepFloor}px))`,
    );
  });

  it("keeps the break-room rug behind workers standing on the lounge area", () => {
    installMatchMediaStub(false);
    installViewportWidthStub(1600);
    const container = document.createElement("div");
    const rugAnchor = MAU_OFFICE_LAYOUT.anchors.break_volley_1;

    render(
      renderMauOffice({
        loading: false,
        error: null,
        state: {
          ...createEmptyMauOfficeState(),
          loaded: true,
          nowMs: 0,
          actorOrder: ["worker:rug"],
          actors: {
            "worker:rug": makeActor({
              id: "worker:rug",
              anchorId: "break_volley_1",
              nodeId: "break_center",
              x: rugAnchor.x,
              y: rugAnchor.y,
            }),
          },
        },
        basePath: "",
        onRefresh: () => undefined,
        onRoomFocus: () => undefined,
        onActorOpen: () => undefined,
      }),
      container,
    );

    const workerZ = parseStyleNumber(
      normalizeStyle(container.querySelector(".mau-office__worker")?.getAttribute("style")),
      "z-index",
    );
    const rugZ = parseStyleNumber(
      normalizeStyle(
        container
          .querySelector(
            '[data-id="break-rug:middle-center"], .mau-office__sprite[src*="rug-r2c2.png"]',
          )
          ?.getAttribute("style"),
      ),
      "z-index",
    );

    expect(rugZ).toBeLessThan(workerZ);
  });

  it("keeps the support counter between the staff side and the customer side", () => {
    installMatchMediaStub(false);
    installViewportWidthStub(1600);
    const container = document.createElement("div");
    const staffAnchor = MAU_OFFICE_LAYOUT.anchors.support_staff_1;
    const customerAnchor = MAU_OFFICE_LAYOUT.anchors.support_customer_2;

    render(
      renderMauOffice({
        loading: false,
        error: null,
        state: {
          ...createEmptyMauOfficeState(),
          loaded: true,
          nowMs: 0,
          actorOrder: ["worker:staff", "visitor:customer"],
          actors: {
            "worker:staff": makeActor({
              id: "worker:staff",
              anchorId: "support_staff_1",
              nodeId: "support_center",
              x: staffAnchor.x,
              y: staffAnchor.y,
              currentRoomId: "support",
            }),
            "visitor:customer": makeActor({
              id: "visitor:customer",
              kind: "visitor",
              anchorId: "support_customer_2",
              nodeId: "support_customer_2",
              x: customerAnchor.x,
              y: customerAnchor.y,
              currentRoomId: "support",
            }),
          },
        },
        basePath: "",
        onRefresh: () => undefined,
        onRoomFocus: () => undefined,
        onActorOpen: () => undefined,
      }),
      container,
    );

    const workerElements = Array.from(container.querySelectorAll(".mau-office__worker"));
    const staffZ = parseStyleNumber(
      normalizeStyle(workerElements[0]?.getAttribute("style")),
      "z-index",
    );
    const customerZ = parseStyleNumber(
      normalizeStyle(workerElements[1]?.getAttribute("style")),
      "z-index",
    );
    const counterZ = parseStyleNumber(
      normalizeStyle(
        container
          .querySelector('.mau-office__sprite[src*="counter-mid-v1.png"]')
          ?.getAttribute("style"),
      ),
      "z-index",
    );

    expect(counterZ).toBeGreaterThan(staffZ);
    expect(counterZ).toBeLessThan(customerZ);
  });

  it("renders a visible volleyball that moves along a parabolic arc for the 4-person rally", () => {
    installMatchMediaStub(false);
    installViewportWidthStub(1600);
    const container = document.createElement("div");
    const ballAssignment = {
      packageId: "passing_ball_court" as const,
      activityId: "break-passing-ball",
      participantIds: ["worker:1", "worker:2", "worker:3", "worker:4"],
      slotAnchorIds: ["break_volley_1", "break_volley_2", "break_volley_3", "break_volley_4"],
      startedAtMs: 0,
      endsAtMs: 10_000,
    };
    const actorIds = ballAssignment.participantIds;
    const actors = Object.fromEntries(
      actorIds.map((actorId, index) => {
        const anchorId = ballAssignment.slotAnchorIds[index]!;
        const anchor = MAU_OFFICE_LAYOUT.anchors[anchorId]!;
        return [
          actorId,
          makeActor({
            id: actorId,
            anchorId,
            nodeId: "break_center",
            x: anchor.x,
            y: anchor.y,
            currentActivity: {
              ...makeActivity("idle-ball", "idle_package", "break", anchorId, "Passing the ball"),
              source: "idle",
            },
            idleAssignment: { ...ballAssignment },
          }),
        ];
      }),
    );

    render(
      renderMauOffice({
        loading: false,
        error: null,
        state: {
          ...createEmptyMauOfficeState(),
          loaded: true,
          nowMs: 0,
          actorOrder: actorIds,
          actors,
        },
        basePath: "",
        onRefresh: () => undefined,
        onRoomFocus: () => undefined,
        onActorOpen: () => undefined,
      }),
      container,
    );

    const initialStyle = normalizeStyle(
      container.querySelector(".mau-office__activity-ball")?.getAttribute("style"),
    );
    expect(container.querySelector(".mau-office__activity-ball")).not.toBeNull();

    render(
      renderMauOffice({
        loading: false,
        error: null,
        state: {
          ...createEmptyMauOfficeState(),
          loaded: true,
          nowMs: 450,
          actorOrder: actorIds,
          actors,
        },
        basePath: "",
        onRefresh: () => undefined,
        onRoomFocus: () => undefined,
        onActorOpen: () => undefined,
      }),
      container,
    );

    const midStyle = normalizeStyle(
      container.querySelector(".mau-office__activity-ball")?.getAttribute("style"),
    );
    expect(midStyle).not.toBe(initialStyle);
    expect(parseStyleNumber(midStyle, "top")).toBeLessThan(parseStyleNumber(initialStyle, "top"));
  });

  it("moves chasing workers in a visible loop instead of leaving them static on one anchor", () => {
    installMatchMediaStub(false);
    installViewportWidthStub(1600);
    const container = document.createElement("div");
    const chaseAssignment = {
      packageId: "chasing_loop" as const,
      activityId: "break-chasing-loop",
      participantIds: ["worker:a", "worker:b", "worker:c"],
      slotAnchorIds: ["break_chase_1", "break_chase_2", "break_chase_3"],
      startedAtMs: 0,
      endsAtMs: 10_000,
    };
    const actorIds = chaseAssignment.participantIds;
    const actors = Object.fromEntries(
      actorIds.map((actorId, index) => {
        const anchorId = chaseAssignment.slotAnchorIds[index]!;
        const anchor = MAU_OFFICE_LAYOUT.anchors[anchorId]!;
        return [
          actorId,
          makeActor({
            id: actorId,
            anchorId,
            nodeId: "break_center",
            x: anchor.x,
            y: anchor.y,
            currentActivity: {
              ...makeActivity("idle-chase", "idle_package", "break", anchorId, "Chasing"),
              source: "idle",
            },
            idleAssignment: { ...chaseAssignment },
          }),
        ];
      }),
    );

    render(
      renderMauOffice({
        loading: false,
        error: null,
        state: {
          ...createEmptyMauOfficeState(),
          loaded: true,
          nowMs: 0,
          actorOrder: actorIds,
          actors,
        },
        basePath: "",
        onRefresh: () => undefined,
        onRoomFocus: () => undefined,
        onActorOpen: () => undefined,
      }),
      container,
    );
    const firstStyle = normalizeStyle(
      container.querySelector(".mau-office__worker")?.getAttribute("style"),
    );

    render(
      renderMauOffice({
        loading: false,
        error: null,
        state: {
          ...createEmptyMauOfficeState(),
          loaded: true,
          nowMs: 900,
          actorOrder: actorIds,
          actors,
        },
        basePath: "",
        onRefresh: () => undefined,
        onRoomFocus: () => undefined,
        onActorOpen: () => undefined,
      }),
      container,
    );
    const secondStyle = normalizeStyle(
      container.querySelector(".mau-office__worker")?.getAttribute("style"),
    );

    expect(secondStyle).not.toBe(firstStyle);
  });

  it("shows a gray labeled fallback when a worker animation sprite is missing", () => {
    installMatchMediaStub(false);
    installViewportWidthStub(1600);
    const container = document.createElement("div");
    const standAnchor = MAU_OFFICE_LAYOUT.anchors.break_arcade;
    const danceFrames = MAU_OFFICE_WORKER_RIGS.cat.dance.west.frames;
    const originalFrames = [...danceFrames];

    danceFrames.splice(
      0,
      danceFrames.length,
      "mau-office/workers/cat/dance-west/missing-frame_000.png",
      "mau-office/workers/cat/dance-west/missing-frame_001.png",
      "mau-office/workers/cat/dance-west/missing-frame_002.png",
      "mau-office/workers/cat/dance-west/missing-frame_003.png",
    );

    try {
      const state: MauOfficeState = {
        ...createEmptyMauOfficeState(),
        loaded: true,
        nowMs: 0,
        actorOrder: ["worker:dance"],
        actors: {
          "worker:dance": makeActor({
            id: "worker:dance",
            anchorId: "break_arcade",
            nodeId: "break_arcade",
            x: standAnchor.x,
            y: standAnchor.y,
            facing: "west",
            animationId: "dance",
          }),
        },
      };

      render(
        renderMauOffice({
          loading: false,
          error: null,
          state,
          basePath: "",
          onRefresh: () => undefined,
          onRoomFocus: () => undefined,
          onActorOpen: () => undefined,
        }),
        container,
      );

      const worker = container.querySelector<HTMLElement>(".mau-office__worker");
      const sprite = worker?.querySelector<HTMLImageElement>(".mau-office__worker-sprite");
      sprite?.dispatchEvent(new Event("error"));

      expect(worker?.classList.contains("mau-office__worker--fallback")).toBe(true);
      expect(
        worker?.querySelector(".mau-office__worker-sprite-fallback")?.textContent?.trim(),
      ).toBe("DANCE");
    } finally {
      danceFrames.splice(0, danceFrames.length, ...originalFrames);
    }
  });

  it("advances stationary standing workers through their idle animation frames", () => {
    installMatchMediaStub(false);
    installViewportWidthStub(1600);
    const container = document.createElement("div");
    const standAnchor = MAU_OFFICE_LAYOUT.anchors.break_arcade;
    const baseState: MauOfficeState = {
      ...createEmptyMauOfficeState(),
      loaded: true,
      actorOrder: ["worker:stand"],
      actors: {
        "worker:stand": makeActor({
          id: "worker:stand",
          anchorId: "break_arcade",
          nodeId: "break_arcade",
          x: standAnchor.x,
          y: standAnchor.y,
          currentActivity: makeActivity("idle", "idle", "break", "break_arcade", "Idle"),
        }),
      },
    };

    render(
      renderMauOffice({
        loading: false,
        error: null,
        state: { ...baseState, nowMs: 0 },
        basePath: "",
        onRefresh: () => undefined,
        onRoomFocus: () => undefined,
        onActorOpen: () => undefined,
      }),
      container,
    );
    const firstFrame = container
      .querySelector<HTMLImageElement>(".mau-office__worker-sprite")
      ?.getAttribute("src");

    render(
      renderMauOffice({
        loading: false,
        error: null,
        state: { ...baseState, nowMs: 400 },
        basePath: "",
        onRefresh: () => undefined,
        onRoomFocus: () => undefined,
        onActorOpen: () => undefined,
      }),
      container,
    );
    const secondFrame = container
      .querySelector<HTMLImageElement>(".mau-office__worker-sprite")
      ?.getAttribute("src");

    expect(firstFrame).not.toBeNull();
    expect(secondFrame).not.toBeNull();
    expect(secondFrame).not.toBe(firstFrame);
  });

  it("caps long bubble copy inside a compact 9-slice box and truncates overflow", () => {
    installMatchMediaStub(false);
    installViewportWidthStub(1600);
    const container = document.createElement("div");
    const sitAnchor = MAU_OFFICE_LAYOUT.anchors.desk_worker_1;

    render(
      renderMauOffice({
        loading: false,
        error: null,
        state: {
          ...createEmptyMauOfficeState(),
          loaded: true,
          nowMs: 0,
          actorOrder: ["worker:desk"],
          actors: {
            "worker:desk": makeActor({
              id: "worker:desk",
              anchorId: "desk_worker_1",
              nodeId: "desk_center",
              x: sitAnchor.x,
              y: sitAnchor.y,
              bubbles: [
                makeBubble(
                  "ohhh, got it. yeah, that works weirdly well in chat. you can treat my message like i've started a line and then jump in to finish the bit.",
                ),
              ],
            }),
          },
        },
        basePath: "",
        onRefresh: () => undefined,
        onRoomFocus: () => undefined,
        onActorOpen: () => undefined,
      }),
      container,
    );

    const bubbleStyle = normalizeStyle(
      container.querySelector(".mau-office__bubble")?.getAttribute("style"),
    );
    expect(bubbleStyle).toContain(`width:${MAU_OFFICE_WORKER_RENDER_METRICS.bubble.maxWidthPx}px`);
    expect(bubbleStyle).toContain(
      `height:${MAU_OFFICE_WORKER_RENDER_METRICS.bubble.maxHeightPx}px`,
    );
    expect(bubbleStyle).toContain("--mau-bubble-lines:6");

    const bubbleText = container.querySelector(".mau-office__bubble-text")?.textContent ?? "";
    expect(bubbleText).toContain("ohhh, got it. yeah, that works weirdly well in chat.");
    expect(bubbleText.endsWith("…")).toBe(false);
  });

  it("grows the hover card width before height and caps it at the hover max bounds", () => {
    installMatchMediaStub(false);
    installViewportWidthStub(1600);
    const container = document.createElement("div");
    const visitorAnchor = MAU_OFFICE_LAYOUT.anchors.support_customer_2;

    render(
      renderMauOffice({
        loading: false,
        error: null,
        state: {
          ...createEmptyMauOfficeState(),
          loaded: true,
          nowMs: 20_000,
          actorOrder: ["visitor:support"],
          actors: {
            "visitor:support": makeActor({
              id: "visitor:support",
              kind: "visitor",
              label: "Samiadji",
              anchorId: "support_customer_2",
              nodeId: "support_customer",
              x: visitorAnchor.x,
              y: visitorAnchor.y,
              currentRoomId: "support",
              currentActivity: {
                id: "snapshot-support",
                kind: "customer_support",
                label: "Handling support",
                bubbleText: "Need help recovering the shared workspace password.",
                priority: 70,
                roomId: "support",
                anchorId: "support_customer_2",
                source: "snapshot",
              },
              bubbles: [],
            }),
          },
        },
        basePath: "",
        onRefresh: () => undefined,
        onRoomFocus: () => undefined,
        onActorOpen: () => undefined,
      }),
      container,
    );

    const historyStyle = normalizeStyle(
      container.querySelector(".mau-office__history")?.getAttribute("style"),
    );
    expect(parseStyleNumber(historyStyle, "width")).toBeGreaterThan(
      MAU_OFFICE_WORKER_RENDER_METRICS.history.minWidthPx,
    );
    expect(parseStyleNumber(historyStyle, "height")).toBe(
      MAU_OFFICE_WORKER_RENDER_METRICS.history.minHeightPx,
    );

    render(
      renderMauOffice({
        loading: false,
        error: null,
        state: {
          ...createEmptyMauOfficeState(),
          loaded: true,
          nowMs: 20_000,
          actorOrder: ["visitor:support"],
          actors: {
            "visitor:support": makeActor({
              id: "visitor:support",
              kind: "visitor",
              label: "Samiadji",
              anchorId: "support_customer_2",
              nodeId: "support_customer",
              x: visitorAnchor.x,
              y: visitorAnchor.y,
              currentRoomId: "support",
              currentActivity: {
                id: "snapshot-support",
                kind: "customer_support",
                label: "Handling support",
                bubbleText:
                  "Need help recovering the shared workspace password before the meeting starts, and I also need the project invite re-sent because I still cannot open the room notes from yesterday.",
                priority: 70,
                roomId: "support",
                anchorId: "support_customer_2",
                source: "snapshot",
              },
              bubbles: [],
            }),
          },
        },
        basePath: "",
        onRefresh: () => undefined,
        onRoomFocus: () => undefined,
        onActorOpen: () => undefined,
      }),
      container,
    );

    const maxHistoryStyle = normalizeStyle(
      container.querySelector(".mau-office__history")?.getAttribute("style"),
    );
    expect(maxHistoryStyle).toContain(
      `width:${MAU_OFFICE_WORKER_RENDER_METRICS.history.maxWidthPx}px`,
    );
    expect(parseStyleNumber(maxHistoryStyle, "height")).toBeGreaterThan(
      MAU_OFFICE_WORKER_RENDER_METRICS.history.minHeightPx,
    );
    expect(parseStyleNumber(maxHistoryStyle, "height")).toBeLessThanOrEqual(
      MAU_OFFICE_WORKER_RENDER_METRICS.history.maxHeightPx,
    );
  });

  it("keeps the hover card on the latest real bubble text after the ambient bubble expires", () => {
    installMatchMediaStub(false);
    installViewportWidthStub(1600);
    const container = document.createElement("div");
    const sitAnchor = MAU_OFFICE_LAYOUT.anchors.desk_worker_1;

    render(
      renderMauOffice({
        loading: false,
        error: null,
        state: {
          ...createEmptyMauOfficeState(),
          loaded: true,
          nowMs: 20_000,
          actorOrder: ["worker:desk"],
          actors: {
            "worker:desk": makeActor({
              id: "worker:desk",
              anchorId: "desk_worker_1",
              nodeId: "desk_center",
              x: sitAnchor.x,
              y: sitAnchor.y,
              currentActivity: makeActivity(
                "desk",
                "desk_work",
                "desk",
                "desk_worker_1",
                "Working at desk",
              ),
              bubbles: [
                {
                  id: "bubble:old",
                  text: "Need the actual latest content here, not a vague status.",
                  atMs: 0,
                  kind: "desk_work",
                },
              ],
            }),
          },
        },
        basePath: "",
        onRefresh: () => undefined,
        onRoomFocus: () => undefined,
        onActorOpen: () => undefined,
      }),
      container,
    );

    expect(container.querySelector(".mau-office__bubble")).toBeNull();
    expect(container.querySelector(".mau-office__history-copy span")?.textContent).toContain(
      "Need the actual latest content here",
    );
  });

  it("prefers fresher tracked support dialogue over an older queued bubble for ambient and hover copy", () => {
    installMatchMediaStub(false);
    installViewportWidthStub(1600);
    const container = document.createElement("div");
    const supportAnchor = MAU_OFFICE_LAYOUT.anchors.support_staff_1;

    render(
      renderMauOffice({
        loading: false,
        error: null,
        state: {
          ...createEmptyMauOfficeState(),
          loaded: true,
          nowMs: 6_000,
          actorOrder: ["worker:main"],
          actors: {
            "worker:main": makeActor({
              id: "worker:main",
              agentId: "main",
              sessionKey: "agent:main:direct:customer-42",
              roleHint: "support",
              anchorId: "support_staff_1",
              nodeId: "support_center",
              currentRoomId: "support",
              x: supportAnchor.x,
              y: supportAnchor.y,
              currentActivity: {
                id: "snapshot-support",
                kind: "customer_support",
                label: "Handling support",
                bubbleText: "Older assistant reply that should not win.",
                priority: 70,
                roomId: "support",
                anchorId: "support_staff_1",
                source: "snapshot",
              },
              latestSupportDialogue: {
                role: "assistant",
                text: "This is the actual newest assistant reply.",
                messageSeq: 12,
                messageId: "msg-12",
                updatedAtMs: 5_000,
              },
              bubbles: [
                {
                  id: "bubble:old",
                  text: "Older assistant reply that should not win.",
                  atMs: 1_000,
                  kind: "customer_support",
                },
              ],
            }),
          },
        },
        basePath: "",
        onRefresh: () => undefined,
        onRoomFocus: () => undefined,
        onActorOpen: () => undefined,
      }),
      container,
    );

    expect(container.querySelector(".mau-office__bubble-text")?.textContent).toContain(
      "This is the actual newest assistant reply.",
    );
    expect(container.querySelector(".mau-office__history-copy span")?.textContent).toContain(
      "This is the actual newest assistant reply.",
    );
  });

  it("hides stale support dialogue once a worker has returned to an idle activity", () => {
    installMatchMediaStub(false);
    installViewportWidthStub(1600);
    const container = document.createElement("div");
    const breakAnchor = MAU_OFFICE_LAYOUT.anchors.break_arcade;

    render(
      renderMauOffice({
        loading: false,
        error: null,
        state: {
          ...createEmptyMauOfficeState(),
          loaded: true,
          nowMs: 6_000,
          actorOrder: ["worker:main"],
          actors: {
            "worker:main": makeActor({
              id: "worker:main",
              agentId: "main",
              sessionKey: "agent:main:direct:customer-42",
              roleHint: "support",
              anchorId: "break_arcade",
              nodeId: "break_arcade",
              currentRoomId: "break",
              x: breakAnchor.x,
              y: breakAnchor.y,
              currentActivity: {
                id: "idle-break",
                kind: "idle",
                label: "Taking a breather",
                priority: 10,
                roomId: "break",
                anchorId: "break_arcade",
                source: "idle",
              },
              latestSupportDialogue: {
                role: "assistant",
                text: "Older support reply should not follow the worker into idle.",
                updatedAtMs: 5_000,
              },
              bubbles: [
                {
                  id: "bubble:support",
                  text: "Older support reply should not follow the worker into idle.",
                  atMs: 5_000,
                  kind: "customer_support",
                },
              ],
            }),
          },
        },
        basePath: "",
        onRefresh: () => undefined,
        onRoomFocus: () => undefined,
        onActorOpen: () => undefined,
      }),
      container,
    );

    expect(container.querySelector(".mau-office__bubble")).toBeNull();
    expect(container.querySelector(".mau-office__history-copy span")?.textContent).toContain(
      "Taking a breather",
    );
    expect(container.querySelector(".mau-office__history-copy span")?.textContent).not.toContain(
      "Older support reply should not follow the worker into idle.",
    );
  });

  it("uses the visitor's actual request in the hover card instead of the generic support label", () => {
    installMatchMediaStub(false);
    installViewportWidthStub(1600);
    const container = document.createElement("div");
    const visitorAnchor = MAU_OFFICE_LAYOUT.anchors.support_customer_1;

    render(
      renderMauOffice({
        loading: false,
        error: null,
        state: {
          ...createEmptyMauOfficeState(),
          loaded: true,
          nowMs: 20_000,
          actorOrder: ["visitor:support"],
          actors: {
            "visitor:support": makeActor({
              id: "visitor:support",
              kind: "visitor",
              label: "Samiadji",
              anchorId: "support_customer_1",
              nodeId: "support_customer",
              x: visitorAnchor.x,
              y: visitorAnchor.y,
              currentRoomId: "support",
              currentActivity: {
                id: "snapshot-support",
                kind: "customer_support",
                label: "Handling support",
                bubbleText: "Need help recovering the shared workspace password.",
                priority: 70,
                roomId: "support",
                anchorId: "support_customer_1",
                source: "snapshot",
              },
              bubbles: [],
            }),
          },
        },
        basePath: "",
        onRefresh: () => undefined,
        onRoomFocus: () => undefined,
        onActorOpen: () => undefined,
      }),
      container,
    );

    expect(container.querySelector(".mau-office__history-copy span")?.textContent).toContain(
      "Need help recovering the shared workspace password.",
    );
    expect(container.querySelector(".mau-office__history-copy span")?.textContent).not.toContain(
      "Handling support",
    );
  });

  it("fires room focus callbacks from the chip bar", () => {
    installMatchMediaStub(false);
    installViewportWidthStub(1600);
    const container = document.createElement("div");
    const onRoomFocus = vi.fn();

    render(
      renderMauOffice({
        loading: false,
        error: null,
        state: createEmptyMauOfficeState(),
        basePath: "",
        onRefresh: () => undefined,
        onRoomFocus,
        onActorOpen: () => undefined,
      }),
      container,
    );

    const meetingButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("MauHome"),
    );
    expect(meetingButton).not.toBeUndefined();
    meetingButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onRoomFocus).toHaveBeenCalledWith("meeting");
  });

  it("keeps room signs and worker badges removed in focused-room view too", () => {
    installMatchMediaStub(false);
    installViewportWidthStub(1600);
    const container = document.createElement("div");
    const sitAnchor = MAU_OFFICE_LAYOUT.anchors.break_table_1;
    const state: MauOfficeState = {
      ...createEmptyMauOfficeState(),
      loaded: true,
      roomFocus: "break",
      actorOrder: ["worker:break"],
      actors: {
        "worker:break": makeActor({
          id: "worker:break",
          anchorId: "break_table_1",
          nodeId: "break_center",
          currentRoomId: "break",
          x: sitAnchor.x,
          y: sitAnchor.y,
        }),
      },
    };

    render(
      renderMauOffice({
        loading: false,
        error: null,
        state,
        basePath: "",
        onRefresh: () => undefined,
        onRoomFocus: () => undefined,
        onActorOpen: () => undefined,
      }),
      container,
    );

    expect(container.querySelector(".mau-office__sign")).toBeNull();
    expect(container.querySelector(".mau-office__worker-badge")).toBeNull();
    expect(container.querySelector(".mau-office__history")).not.toBeNull();
  });
});
