import {
  MAU_OFFICE_FOOT_OFFSET_Y,
  MAU_OFFICE_LAYOUT as LEGACY_LAYOUT,
  MAU_OFFICE_SCENE_TILES_H,
  MAU_OFFICE_SCENE_TILES_W,
  MAU_OFFICE_TILE_SIZE,
  type MauOfficeAnchor,
  type MauOfficeAnchorPose,
  type MauOfficeAreaId,
  type MauOfficeDirection,
  type MauOfficeFootprintTiles,
  type MauOfficeLabelPlacement,
  type MauOfficeNode,
  type MauOfficeRoom,
  type MauOfficeRoomId,
  type MauOfficeSpriteMount,
  type MauOfficeSpritePlacement,
  type MauOfficeTilePlacement,
} from "./mau-office-contract.ts";

export type MauOfficeZoneId = MauOfficeRoomId | "hall" | "outside";

export type MauOfficeMarkerRole =
  | "spawn.office"
  | "spawn.support"
  | "desk.board"
  | "desk.workerSeat"
  | "meeting.presenter"
  | "meeting.seat"
  | "browser.workerSeat"
  | "support.staff"
  | "support.customer"
  | "telephony.staff"
  | "break.arcade"
  | "break.snack"
  | "break.volley"
  | "break.tableSeat"
  | "break.chase"
  | "break.game"
  | "break.jukebox"
  | "break.reading";

export type MauOfficeCatalogLoop = {
  id: string;
  label: string;
  fps: number;
  frames: string[];
};

export type MauOfficeAutotileMode = "nine-slice" | "three-slice-horizontal";

export type MauOfficeCatalogItem = {
  id: string;
  label: string;
  kind: MauOfficeSpritePlacement["kind"];
  asset?: string;
  mount: MauOfficeSpriteMount;
  tileWidth: number;
  tileHeight: number;
  anchor?: "top-left" | "bottom-center";
  autotileMode?: MauOfficeAutotileMode;
  sliceAssets?:
    | {
        topLeft: string;
        topCenter: string;
        topRight: string;
        middleLeft: string;
        middleCenter: string;
        middleRight: string;
        bottomLeft: string;
        bottomCenter: string;
        bottomRight: string;
      }
    | {
        left: string;
        center: string;
        right: string;
      };
  defaultZOffset?: number;
  blocksWalkway: boolean;
  labelOverlay?: {
    kind: "room-name";
    defaultRoomId: MauOfficeRoomId;
  };
  loops?: {
    defaultLoopId: string;
    values: MauOfficeCatalogLoop[];
  };
};

export type MauOfficeScenePropPlacement = {
  id: string;
  itemId: string;
  tileX: number;
  tileY: number;
  zoneId?: MauOfficeRoomId;
  mirrored?: boolean;
  mountOverride?: MauOfficeSpriteMount;
  zOffsetOverride?: number;
  collisionOverride?: boolean;
  loopId?: string;
};

export type MauOfficeSceneAutotilePlacement = {
  id: string;
  itemId: string;
  cells: Array<{ tileX: number; tileY: number }>;
  mountOverride?: MauOfficeSpriteMount;
  zOffsetOverride?: number;
  collisionOverride?: boolean;
  loopId?: string;
};

export type MauOfficeSceneMarker = {
  id: string;
  role: MauOfficeMarkerRole;
  tileX: number;
  tileY: number;
  pose: MauOfficeAnchorPose;
  layer: number;
  facingOverride?: MauOfficeDirection;
  footprintTiles?: MauOfficeFootprintTiles;
};

export type MauOfficeSceneConfig = {
  version: 1;
  zoneRows: MauOfficeZoneId[][];
  wallRows: boolean[][];
  props: MauOfficeScenePropPlacement[];
  autotiles: MauOfficeSceneAutotilePlacement[];
  markers: MauOfficeSceneMarker[];
};

export type CompiledMauOfficeScene = {
  tileSize: number;
  width: number;
  height: number;
  rooms: Record<MauOfficeRoomId, MauOfficeRoom>;
  nodes: Record<string, MauOfficeNode>;
  anchors: Record<string, MauOfficeAnchor>;
  map: {
    floorTiles: MauOfficeTilePlacement[];
    wallSprites: MauOfficeSpritePlacement[];
    propSprites: MauOfficeSpritePlacement[];
    labels: MauOfficeLabelPlacement[];
  };
  authored: MauOfficeSceneConfig;
  catalog: Record<string, MauOfficeCatalogItem>;
  markerRoleById: Record<string, MauOfficeMarkerRole>;
  markerIdsByRole: Record<MauOfficeMarkerRole, string[]>;
  walkableTileKeys: Set<string>;
  blockedTileKeys: Set<string>;
};

export type MauOfficeSceneValidation = {
  errors: string[];
};

export const MAU_OFFICE_SCENE_MIN_TILES_W = 4;
export const MAU_OFFICE_SCENE_MIN_TILES_H = 4;
export const MAU_OFFICE_SCENE_MAX_TILES_W = 80;
export const MAU_OFFICE_SCENE_MAX_TILES_H = 80;
const MAU_OFFICE_LEGACY_SCENE_TILES_W = 26;
const MAU_OFFICE_RIGHT_WING_MERGE_TILE_X = 21;
const RIGHT_WING_PROP_IDS = new Set([
  "browser-board",
  "browser-book",
  "browser-chair",
  "browser-desk",
  "browser-monitor",
  "browser-plant",
  "telephony-calendar",
  "telephony-fax",
  "telephony-monitor",
  "telephony-paper",
  "telephony-plant",
  "telephony-poster",
]);
const RIGHT_WING_AUTOTILE_IDS = new Set(["telephony-counter"]);
const RIGHT_WING_MARKER_IDS = new Set(["browser_worker_1", "telephony_staff_1"]);

const ROOM_META: Record<
  MauOfficeRoomId,
  Pick<MauOfficeRoom, "label" | "doorLabel" | "signTone"> & { signLabel: string }
> = {
  desk: { label: "MauApps", doorLabel: "Desk", signTone: "blue", signLabel: "Desks" },
  meeting: {
    label: "MauHome",
    doorLabel: "Meeting",
    signTone: "green",
    signLabel: "Meeting",
  },
  browser: {
    label: "MauBrowse",
    doorLabel: "Browser",
    signTone: "blue",
    signLabel: "Browser",
  },
  break: { label: "MauBreak", doorLabel: "Break", signTone: "purple", signLabel: "Break" },
  support: {
    label: "MauWorld",
    doorLabel: "Support",
    signTone: "gold",
    signLabel: "Support",
  },
  telephony: {
    label: "MauCall",
    doorLabel: "Telephony",
    signTone: "gold",
    signLabel: "Telephony",
  },
};

export const MAU_OFFICE_ROOM_META = ROOM_META;

const REQUIRED_MARKER_COUNTS: Array<{
  role: MauOfficeMarkerRole;
  min?: number;
  exact?: number;
}> = [
  { role: "spawn.office", exact: 1 },
  { role: "spawn.support", exact: 1 },
  { role: "desk.board", exact: 1 },
  { role: "meeting.presenter", exact: 1 },
  { role: "browser.workerSeat", exact: 1 },
  { role: "telephony.staff", exact: 1 },
  { role: "break.arcade", exact: 1 },
  { role: "break.snack", exact: 1 },
  { role: "break.jukebox", exact: 1 },
  { role: "break.reading", exact: 1 },
  { role: "desk.workerSeat", min: 1 },
  { role: "meeting.seat", min: 1 },
  { role: "support.staff", min: 1 },
  { role: "support.customer", min: 1 },
  { role: "break.volley", exact: 4 },
  { role: "break.tableSeat", exact: 2 },
  { role: "break.chase", exact: 3 },
  { role: "break.game", exact: 4 },
];

const BREAK_ROOM_FLEX_ROLES: MauOfficeMarkerRole[] = [
  "break.arcade",
  "break.snack",
  "break.volley",
  "break.tableSeat",
  "break.chase",
  "break.game",
  "break.jukebox",
  "break.reading",
];

const BLOCKING_KINDS = new Set<MauOfficeSpritePlacement["kind"]>([
  "arcade",
  "bench",
  "chair",
  "counter",
  "desk",
  "foosball",
  "plant",
  "shelf",
  "table",
  "wall",
]);

function tileToPixel(tile: number): number {
  return tile * MAU_OFFICE_TILE_SIZE;
}

function tileCenterX(tileX: number): number {
  return tileToPixel(tileX) + MAU_OFFICE_TILE_SIZE / 2;
}

function tileFootY(tileY: number): number {
  return tileToPixel(tileY) + MAU_OFFICE_FOOT_OFFSET_Y;
}

function buildRoom(
  id: MauOfficeRoomId,
  tileX: number,
  tileY: number,
  tileWidth: number,
  tileHeight: number,
): MauOfficeRoom {
  return {
    id,
    tileX,
    tileY,
    tileWidth,
    tileHeight,
    x: tileToPixel(tileX),
    y: tileToPixel(tileY),
    width: tileWidth * MAU_OFFICE_TILE_SIZE,
    height: tileHeight * MAU_OFFICE_TILE_SIZE,
    ...ROOM_META[id],
  };
}

function roomIdForRole(role: MauOfficeMarkerRole): MauOfficeRoomId | "outside" {
  if (role === "spawn.office" || role === "spawn.support") {
    return "outside";
  }
  if (role.startsWith("desk.")) {
    return "desk";
  }
  if (role.startsWith("meeting.")) {
    return "meeting";
  }
  if (role.startsWith("browser.")) {
    return "browser";
  }
  if (role.startsWith("support.")) {
    return "support";
  }
  if (role.startsWith("telephony.")) {
    return "telephony";
  }
  return "break";
}

export function markerRoleNeedsOutsideTile(role: MauOfficeMarkerRole): boolean {
  return roomIdForRole(role) === "outside";
}

function tileKey(tileX: number, tileY: number): string {
  return `${tileX},${tileY}`;
}

function resolveNearestMarkerTile(
  rows: MauOfficeZoneId[][],
  wallRows: boolean[][],
  tileX: number,
  tileY: number,
): { tileX: number; tileY: number } {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const startTileX = Math.max(0, Math.min(width - 1, Math.round(tileX)));
  const startTileY = Math.max(0, Math.min(height - 1, Math.round(tileY)));
  const isAllowed = (candidateX: number, candidateY: number) =>
    zoneAt(rows, candidateX, candidateY) !== "outside" && !wallAt(wallRows, candidateX, candidateY);
  if (isAllowed(startTileX, startTileY)) {
    return { tileX: startTileX, tileY: startTileY };
  }
  const queue: Array<{ tileX: number; tileY: number }> = [{ tileX: startTileX, tileY: startTileY }];
  const seen = new Set<string>([tileKey(startTileX, startTileY)]);
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
      if (nextTileX < 0 || nextTileX >= width || nextTileY < 0 || nextTileY >= height) {
        continue;
      }
      const nextKey = tileKey(nextTileX, nextTileY);
      if (seen.has(nextKey)) {
        continue;
      }
      seen.add(nextKey);
      if (isAllowed(nextTileX, nextTileY)) {
        return { tileX: nextTileX, tileY: nextTileY };
      }
      queue.push({ tileX: nextTileX, tileY: nextTileY });
    }
  }
  return { tileX: startTileX, tileY: startTileY };
}

function naturalCompare(left: string, right: string): number {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function cloneZoneRows(rows: MauOfficeZoneId[][]): MauOfficeZoneId[][] {
  return rows.map((row) => [...row]);
}

function cloneWallRows(rows: boolean[][]): boolean[][] {
  return rows.map((row) => [...row]);
}

export function getMauOfficeSceneTileWidth(scene: Pick<MauOfficeSceneConfig, "zoneRows">): number {
  return scene.zoneRows.reduce((max, row) => Math.max(max, row.length), 0);
}

export function getMauOfficeSceneTileHeight(scene: Pick<MauOfficeSceneConfig, "zoneRows">): number {
  return scene.zoneRows.length;
}

export function cloneMauOfficeSceneConfig(scene: MauOfficeSceneConfig): MauOfficeSceneConfig {
  return {
    version: scene.version,
    zoneRows: cloneZoneRows(scene.zoneRows),
    wallRows: cloneWallRows(scene.wallRows),
    props: scene.props.map((entry) => ({ ...entry })),
    autotiles: scene.autotiles.map((entry) => ({
      ...entry,
      cells: entry.cells.map((cell) => ({ ...cell })),
    })),
    markers: scene.markers.map((entry) => ({
      ...entry,
      footprintTiles: entry.footprintTiles ? { ...entry.footprintTiles } : undefined,
    })),
  };
}

function createEmptyWallRows(
  width = MAU_OFFICE_SCENE_TILES_W,
  height = MAU_OFFICE_SCENE_TILES_H,
): boolean[][] {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => false));
}

function buildLegacyDefaultZoneRows(): MauOfficeZoneId[][] {
  return [
    [
      "outside",
      "outside",
      "outside",
      "outside",
      "outside",
      "outside",
      "outside",
      "outside",
      "outside",
      "outside",
      "outside",
      "outside",
      "outside",
      "outside",
      "outside",
      "outside",
      "outside",
      "outside",
      "outside",
      "outside",
      "outside",
      "outside",
      "outside",
      "outside",
      "outside",
      "outside",
    ],
    [
      "outside",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "outside",
      "outside",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "outside",
    ],
    [
      "outside",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "outside",
      "outside",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "outside",
    ],
    [
      "outside",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "outside",
      "outside",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "outside",
    ],
    [
      "outside",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "outside",
      "outside",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "outside",
    ],
    [
      "outside",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "outside",
    ],
    [
      "outside",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "hall",
      "hall",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "outside",
    ],
    [
      "outside",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "outside",
    ],
    [
      "outside",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "outside",
    ],
    [
      "outside",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "hall",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "desk",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "meeting",
      "outside",
    ],
    [
      "outside",
      "outside",
      "outside",
      "outside",
      "outside",
      "outside",
      "outside",
      "outside",
      "hall",
      "hall",
      "hall",
      "hall",
      "hall",
      "hall",
      "hall",
      "hall",
      "hall",
      "hall",
      "hall",
      "hall",
      "hall",
      "outside",
      "outside",
      "outside",
      "outside",
      "outside",
    ],
    [
      "outside",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "hall",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "outside",
      "outside",
      "support",
      "support",
      "support",
      "hall",
      "support",
      "support",
      "support",
      "support",
      "outside",
    ],
    [
      "outside",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "outside",
      "outside",
      "support",
      "support",
      "support",
      "support",
      "support",
      "support",
      "support",
      "support",
      "outside",
    ],
    [
      "outside",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "outside",
      "outside",
      "support",
      "support",
      "support",
      "support",
      "support",
      "support",
      "support",
      "support",
      "outside",
    ],
    [
      "outside",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "outside",
      "outside",
      "support",
      "support",
      "support",
      "support",
      "support",
      "support",
      "support",
      "support",
      "outside",
    ],
    [
      "outside",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "outside",
      "outside",
      "support",
      "support",
      "support",
      "support",
      "support",
      "support",
      "support",
      "support",
      "outside",
    ],
    [
      "outside",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "outside",
      "outside",
      "support",
      "support",
      "support",
      "support",
      "support",
      "support",
      "support",
      "support",
      "outside",
    ],
    [
      "outside",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "outside",
      "outside",
      "support",
      "support",
      "support",
      "support",
      "support",
      "support",
      "support",
      "support",
      "outside",
    ],
    [
      "outside",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "outside",
      "outside",
      "support",
      "support",
      "support",
      "support",
      "support",
      "support",
      "support",
      "support",
      "outside",
    ],
    [
      "outside",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "break",
      "outside",
      "outside",
      "support",
      "support",
      "support",
      "support",
      "support",
      "support",
      "support",
      "support",
      "outside",
    ],
  ];
}

function createEmptyZoneRows(
  width = MAU_OFFICE_SCENE_TILES_W,
  height = MAU_OFFICE_SCENE_TILES_H,
): MauOfficeZoneId[][] {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => "outside" satisfies MauOfficeZoneId),
  );
}

function buildDefaultZoneRows(): MauOfficeZoneId[][] {
  const rows = createEmptyZoneRows();
  const legacyRows = buildLegacyDefaultZoneRows();
  for (let tileY = 0; tileY < legacyRows.length; tileY += 1) {
    for (let tileX = 0; tileX < legacyRows[tileY].length; tileX += 1) {
      rows[tileY][tileX] = legacyRows[tileY][tileX]!;
    }
  }
  for (const tile of LEGACY_LAYOUT.map.floorTiles) {
    rows[tile.tileY][tile.tileX] = tile.roomId;
  }
  for (const [tileX, tileY, zoneId] of [
    [15, 1, "outside"],
    [15, 2, "outside"],
    [15, 3, "outside"],
    [15, 4, "outside"],
    [15, 5, "outside"],
    [16, 6, "meeting"],
    [25, 6, "hall"],
    [15, 7, "outside"],
    [15, 8, "outside"],
    [15, 9, "outside"],
    [15, 11, "outside"],
    [15, 12, "outside"],
    [15, 13, "outside"],
    [15, 14, "outside"],
    [15, 15, "outside"],
    [15, 16, "outside"],
    [15, 17, "outside"],
    [15, 18, "outside"],
    [15, 19, "outside"],
  ] as const) {
    rows[tileY][tileX] = zoneId;
  }
  return rows;
}

const CATALOG_ITEMS: MauOfficeCatalogItem[] = [
  {
    id: "kanban-board",
    label: "Kanban Board",
    kind: "board",
    asset: "mau-office/tiles/kanban-board.png",
    mount: "wall",
    tileWidth: 4,
    tileHeight: 2,
    blocksWalkway: false,
  },
  {
    id: "desk-roadmap-board",
    label: "Roadmap Board",
    kind: "board",
    asset: "mau-office/tiles/desk-roadmap-board-v1.png",
    mount: "wall",
    tileWidth: 4,
    tileHeight: 2,
    blocksWalkway: false,
  },
  {
    id: "calendar-wall",
    label: "Wall Calendar",
    kind: "board",
    asset: "mau-office/tiles/calendar-wall-v1.png",
    mount: "wall",
    tileWidth: 1,
    tileHeight: 1,
    blocksWalkway: false,
  },
  {
    id: "wall-clocks",
    label: "Wall Clocks",
    kind: "board",
    asset: "mau-office/tiles/wall-clocks.png",
    mount: "wall",
    tileWidth: 3,
    tileHeight: 2,
    blocksWalkway: false,
  },
  {
    id: "security-camera",
    label: "Security Camera",
    kind: "accessory",
    asset: "mau-office/tiles/security-camera-v1.png",
    mount: "wall",
    tileWidth: 1,
    tileHeight: 1,
    defaultZOffset: 12,
    blocksWalkway: false,
  },
  {
    id: "desk-wide",
    label: "Wide Desk",
    kind: "desk",
    asset: "mau-office/items/desk-wide-v1.png",
    mount: "floor",
    tileWidth: 3,
    tileHeight: 2,
    blocksWalkway: true,
  },
  {
    id: "chair-front",
    label: "Chair Front",
    kind: "chair",
    asset: "mau-office/items/chair-front-v1.png",
    mount: "floor",
    tileWidth: 1,
    tileHeight: 1,
    defaultZOffset: 188,
    blocksWalkway: true,
  },
  {
    id: "chair-back",
    label: "Chair Back",
    kind: "chair",
    asset: "mau-office/items/chair-back-v1.png",
    mount: "floor",
    tileWidth: 1,
    tileHeight: 1,
    defaultZOffset: 188,
    blocksWalkway: true,
  },
  {
    id: "chair-left",
    label: "Chair Left",
    kind: "chair",
    asset: "mau-office/items/chair-left-v1.png",
    mount: "floor",
    tileWidth: 1,
    tileHeight: 1,
    defaultZOffset: 188,
    blocksWalkway: true,
  },
  {
    id: "chair-right",
    label: "Chair Right",
    kind: "chair",
    asset: "mau-office/items/chair-right-v1.png",
    mount: "floor",
    tileWidth: 1,
    tileHeight: 1,
    defaultZOffset: 188,
    blocksWalkway: true,
  },
  {
    id: "monitor-code",
    label: "Code Monitor",
    kind: "accessory",
    asset: "mau-office/items/monitor-code-v1.png",
    mount: "floor",
    tileWidth: 1,
    tileHeight: 1,
    defaultZOffset: 220,
    blocksWalkway: false,
  },
  {
    id: "monitor-chart",
    label: "Chart Monitor",
    kind: "accessory",
    asset: "mau-office/items/monitor-chart-v1.png",
    mount: "floor",
    tileWidth: 1,
    tileHeight: 1,
    defaultZOffset: 220,
    blocksWalkway: false,
  },
  {
    id: "desktop-monitor",
    label: "Desktop Monitor",
    kind: "accessory",
    asset: "mau-office/items/desktop-monitor-v1.png",
    mount: "floor",
    tileWidth: 1,
    tileHeight: 1,
    defaultZOffset: 220,
    blocksWalkway: false,
  },
  {
    id: "monitor-back",
    label: "Monitor Back",
    kind: "accessory",
    asset: "mau-office/items/monitor-back-v1.png",
    mount: "floor",
    tileWidth: 1,
    tileHeight: 1,
    defaultZOffset: 278,
    blocksWalkway: false,
  },
  {
    id: "fax-machine",
    label: "Fax Machine",
    kind: "accessory",
    asset: "mau-office/items/fax-machine-v1.png",
    mount: "floor",
    tileWidth: 1,
    tileHeight: 1,
    defaultZOffset: 278,
    blocksWalkway: false,
  },
  {
    id: "book-open",
    label: "Open Book",
    kind: "accessory",
    asset: "mau-office/items/book-open-v1.png",
    mount: "floor",
    tileWidth: 1,
    tileHeight: 1,
    defaultZOffset: 220,
    blocksWalkway: false,
  },
  {
    id: "book-stack-closed",
    label: "Closed Book Stack",
    kind: "accessory",
    asset: "mau-office/items/book-stack-closed-v1.png",
    mount: "floor",
    tileWidth: 1,
    tileHeight: 1,
    defaultZOffset: 220,
    blocksWalkway: false,
  },
  {
    id: "book-stack-mixed",
    label: "Mixed Book Stack",
    kind: "accessory",
    asset: "mau-office/items/book-stack-mixed-v1.png",
    mount: "floor",
    tileWidth: 1,
    tileHeight: 1,
    defaultZOffset: 220,
    blocksWalkway: false,
  },
  {
    id: "paper-stack",
    label: "Paper Stack",
    kind: "accessory",
    asset: "mau-office/items/paper-stack-v1.png",
    mount: "floor",
    tileWidth: 1,
    tileHeight: 1,
    defaultZOffset: 278,
    blocksWalkway: false,
  },
  {
    id: "server-rack",
    label: "Server Rack",
    kind: "accessory",
    asset: "mau-office/items/server-rack-v1.png",
    mount: "floor",
    tileWidth: 1,
    tileHeight: 2,
    defaultZOffset: 204,
    blocksWalkway: true,
  },
  {
    id: "meeting-board",
    label: "Meeting Board",
    kind: "board",
    asset: "mau-office/tiles/meeting-board.png",
    mount: "wall",
    tileWidth: 4,
    tileHeight: 2,
    blocksWalkway: false,
  },
  {
    id: "zone-sign",
    label: "Zone Sign",
    kind: "board",
    asset: "mau-office/items/zone-sign-v1.png",
    mount: "wall",
    tileWidth: 3,
    tileHeight: 1,
    blocksWalkway: false,
    labelOverlay: {
      kind: "room-name",
      defaultRoomId: "desk",
    },
    loops: {
      defaultLoopId: "off",
      values: [
        {
          id: "pulse",
          label: "Pulse",
          fps: 2,
          frames: ["mau-office/items/zone-sign-v1.png", "mau-office/items/zone-sign-glow-v1.png"],
        },
      ],
    },
  },
  {
    id: "plant",
    label: "Plant",
    kind: "plant",
    asset: "mau-office/items/plant-v1.png",
    mount: "floor",
    tileWidth: 1,
    tileHeight: 1,
    blocksWalkway: true,
  },
  {
    id: "neon-sign",
    label: "Neon Sign",
    kind: "board",
    asset: "mau-office/items/neon-sign-v1.png",
    mount: "wall",
    tileWidth: 2,
    tileHeight: 1,
    blocksWalkway: false,
  },
  {
    id: "snack-shelf",
    label: "Snack Shelf",
    kind: "shelf",
    asset: "mau-office/items/snack-shelf-v1.png",
    mount: "floor",
    tileWidth: 2,
    tileHeight: 2,
    blocksWalkway: true,
  },
  {
    id: "arcade",
    label: "Arcade Cabinet",
    kind: "arcade",
    asset: "mau-office/items/arcade-v2.png",
    mount: "floor",
    tileWidth: 2,
    tileHeight: 2,
    blocksWalkway: true,
  },
  {
    id: "round-table",
    label: "Round Table",
    kind: "table",
    asset: "mau-office/items/round-table-v1.png",
    mount: "floor",
    tileWidth: 2,
    tileHeight: 2,
    defaultZOffset: 180,
    blocksWalkway: true,
  },
  {
    id: "beanbag-blue",
    label: "Blue Beanbag",
    kind: "accessory",
    asset: "mau-office/items/beanbag-blue-v1.png",
    mount: "floor",
    tileWidth: 1,
    tileHeight: 1,
    defaultZOffset: 168,
    blocksWalkway: false,
  },
  {
    id: "beanbag-green",
    label: "Green Beanbag",
    kind: "accessory",
    asset: "mau-office/items/beanbag-green-v1.png",
    mount: "floor",
    tileWidth: 1,
    tileHeight: 1,
    defaultZOffset: 168,
    blocksWalkway: false,
  },
  {
    id: "beanbag-pink",
    label: "Pink Beanbag",
    kind: "accessory",
    asset: "mau-office/items/beanbag-pink-v1.png",
    mount: "floor",
    tileWidth: 1,
    tileHeight: 1,
    defaultZOffset: 168,
    blocksWalkway: false,
  },
  {
    id: "foosball",
    label: "Foosball Table",
    kind: "foosball",
    asset: "mau-office/items/foosball-v1.png",
    mount: "floor",
    tileWidth: 2,
    tileHeight: 2,
    defaultZOffset: 172,
    blocksWalkway: true,
  },
  {
    id: "bench",
    label: "Bench",
    kind: "bench",
    asset: "mau-office/items/bench-v1.png",
    mount: "floor",
    tileWidth: 3,
    tileHeight: 1,
    blocksWalkway: true,
  },
  {
    id: "notice-board",
    label: "Notice Board",
    kind: "board",
    asset: "mau-office/tiles/notice-board-v1.png",
    mount: "wall",
    tileWidth: 2,
    tileHeight: 1,
    blocksWalkway: false,
  },
  {
    id: "meeting-table",
    label: "Meeting Table",
    kind: "table",
    mount: "floor",
    tileWidth: 4,
    tileHeight: 3,
    autotileMode: "nine-slice",
    sliceAssets: {
      topLeft: "mau-office/tiles/meeting-table-r1c1.png",
      topCenter: "mau-office/tiles/meeting-table-r1c2.png",
      topRight: "mau-office/tiles/meeting-table-r1c3.png",
      middleLeft: "mau-office/tiles/meeting-table-r2c1.png",
      middleCenter: "mau-office/tiles/meeting-table-r2c2.png",
      middleRight: "mau-office/tiles/meeting-table-r2c3.png",
      bottomLeft: "mau-office/tiles/meeting-table-r3c1.png",
      bottomCenter: "mau-office/tiles/meeting-table-r3c2.png",
      bottomRight: "mau-office/tiles/meeting-table-r3c3.png",
    },
    defaultZOffset: 180,
    blocksWalkway: true,
  },
  {
    id: "rug",
    label: "Rug",
    kind: "accessory",
    mount: "underlay",
    tileWidth: 4,
    tileHeight: 4,
    autotileMode: "nine-slice",
    sliceAssets: {
      topLeft: "mau-office/tiles/rug-r1c1.png",
      topCenter: "mau-office/tiles/rug-r1c2.png",
      topRight: "mau-office/tiles/rug-r1c3.png",
      middleLeft: "mau-office/tiles/rug-r2c1.png",
      middleCenter: "mau-office/tiles/rug-r2c2.png",
      middleRight: "mau-office/tiles/rug-r2c3.png",
      bottomLeft: "mau-office/tiles/rug-r3c1.png",
      bottomCenter: "mau-office/tiles/rug-r3c2.png",
      bottomRight: "mau-office/tiles/rug-r3c3.png",
    },
    defaultZOffset: -300,
    blocksWalkway: false,
  },
  {
    id: "support-counter",
    label: "Support Counter",
    kind: "counter",
    mount: "floor",
    tileWidth: 6,
    tileHeight: 2,
    autotileMode: "three-slice-horizontal",
    sliceAssets: {
      left: "mau-office/items/counter-left-v1.png",
      center: "mau-office/items/counter-mid-v1.png",
      right: "mau-office/items/counter-right-v1.png",
    },
    defaultZOffset: 80,
    blocksWalkway: true,
  },
];

export const MAU_OFFICE_CATALOG = Object.fromEntries(
  CATALOG_ITEMS.map((entry) => [entry.id, entry] as const),
) satisfies Record<string, MauOfficeCatalogItem>;

function zoneAt(rows: MauOfficeZoneId[][], tileX: number, tileY: number): MauOfficeZoneId {
  if (tileY < 0 || tileY >= rows.length || tileX < 0 || tileX >= (rows[tileY]?.length ?? 0)) {
    return "outside";
  }
  return rows[tileY]?.[tileX] ?? "outside";
}

function classifyFloorAsset(tileX: number, tileY: number, zone: MauOfficeZoneId): string {
  if (zone === "hall") {
    return (tileX + tileY) % 2 === 0
      ? "mau-office/tiles/floor-hall-a.png"
      : "mau-office/tiles/floor-hall-b.png";
  }
  const roomVariants = [
    "mau-office/tiles/floor-room-a.png",
    "mau-office/tiles/floor-room-b.png",
    "mau-office/tiles/floor-room-c.png",
    "mau-office/tiles/floor-room-d.png",
  ] as const;
  return roomVariants[(tileX * 3 + tileY) % roomVariants.length];
}

function sortMarkerIds(ids: string[]): string[] {
  return [...ids].toSorted(naturalCompare);
}

function buildMarkerMaps(markers: MauOfficeSceneMarker[]) {
  const markerRoleById: Record<string, MauOfficeMarkerRole> = {};
  const markerIdsByRole = Object.fromEntries(
    REQUIRED_MARKER_COUNTS.map(({ role }) => [role, [] as string[]]),
  ) as Record<MauOfficeMarkerRole, string[]>;
  for (const marker of markers) {
    markerRoleById[marker.id] = marker.role;
    (markerIdsByRole[marker.role] ??= []).push(marker.id);
  }
  for (const role of Object.keys(markerIdsByRole) as MauOfficeMarkerRole[]) {
    markerIdsByRole[role] = sortMarkerIds(markerIdsByRole[role]);
  }
  return { markerRoleById, markerIdsByRole };
}

function roomBoundsForZone(rows: MauOfficeZoneId[][], roomId: MauOfficeRoomId): MauOfficeRoom {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let tileY = 0; tileY < rows.length; tileY += 1) {
    for (let tileX = 0; tileX < rows[tileY].length; tileX += 1) {
      if (rows[tileY][tileX] !== roomId) {
        continue;
      }
      minX = Math.min(minX, tileX);
      minY = Math.min(minY, tileY);
      maxX = Math.max(maxX, tileX);
      maxY = Math.max(maxY, tileY);
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    const legacy = LEGACY_LAYOUT.rooms[roomId];
    return buildRoom(roomId, legacy.tileX, legacy.tileY, legacy.tileWidth, legacy.tileHeight);
  }
  return buildRoom(roomId, minX, minY, maxX - minX + 1, maxY - minY + 1);
}

function resolveAnchorRoomId(marker: MauOfficeSceneMarker, rows: MauOfficeZoneId[][]) {
  const roleRoomId = roomIdForRole(marker.role);
  if (roleRoomId === "outside") {
    return "outside";
  }
  const zone = zoneAt(rows, Math.round(marker.tileX), Math.round(marker.tileY));
  if (zone === "outside" || zone === "hall") {
    return roleRoomId;
  }
  return zone;
}

function compileAnchors(
  markers: MauOfficeSceneMarker[],
  rows: MauOfficeZoneId[][],
): Record<string, MauOfficeAnchor> {
  return Object.fromEntries(
    markers.map((marker) => {
      const legacyAnchor = Object.prototype.hasOwnProperty.call(LEGACY_LAYOUT.anchors, marker.id)
        ? LEGACY_LAYOUT.anchors[marker.id as keyof typeof LEGACY_LAYOUT.anchors]
        : undefined;
      return [
        marker.id,
        {
          id: marker.id,
          tileX: marker.tileX,
          tileY: marker.tileY,
          x: tileCenterX(marker.tileX),
          y: tileFootY(marker.tileY),
          roomId: resolveAnchorRoomId(marker, rows),
          nodeId: legacyAnchor?.nodeId ?? marker.id,
          pose: marker.pose,
          layer: marker.layer,
          footprintTiles: marker.footprintTiles ?? { width: 1, height: 1 },
          facingOverride: marker.facingOverride,
        } satisfies MauOfficeAnchor,
      ];
    }),
  );
}

function compileNodes(anchors: Record<string, MauOfficeAnchor>): Record<string, MauOfficeNode> {
  const nodes = new Map<string, MauOfficeNode>(
    Object.entries(LEGACY_LAYOUT.nodes).map(([nodeId, node]) => [
      nodeId,
      {
        ...node,
        neighbors: [...node.neighbors],
      } satisfies MauOfficeNode,
    ]),
  );
  const anchorsByNodeId = new Map<string, MauOfficeAnchor[]>();
  for (const anchor of Object.values(anchors)) {
    const siblings = anchorsByNodeId.get(anchor.nodeId);
    if (siblings) {
      siblings.push(anchor);
    } else {
      anchorsByNodeId.set(anchor.nodeId, [anchor]);
    }
  }
  for (const [nodeId, nodeAnchors] of anchorsByNodeId) {
    const explicitAnchor = anchors[nodeId];
    const legacyNode = nodes.get(nodeId);
    if (legacyNode && !explicitAnchor) {
      continue;
    }
    const sourceAnchor = explicitAnchor ?? nodeAnchors[0];
    if (!sourceAnchor) {
      continue;
    }
    const tileX = Math.round(sourceAnchor.tileX);
    const tileY = Math.round(sourceAnchor.tileY);
    nodes.set(nodeId, {
      id: nodeId,
      tileX,
      tileY,
      x: tileCenterX(tileX),
      y: tileFootY(tileY),
      roomId: sourceAnchor.roomId,
      neighbors: legacyNode ? [...legacyNode.neighbors] : [],
    });
  }
  return Object.fromEntries(nodes);
}

function compileFloorTiles(rows: MauOfficeZoneId[][]): MauOfficeTilePlacement[] {
  const tiles: MauOfficeTilePlacement[] = [];
  for (let tileY = 0; tileY < rows.length; tileY += 1) {
    for (let tileX = 0; tileX < rows[tileY].length; tileX += 1) {
      const zone = rows[tileY][tileX];
      if (zone === "outside") {
        continue;
      }
      tiles.push({
        id: `tile:${tileX}:${tileY}`,
        asset: classifyFloorAsset(tileX, tileY, zone),
        tileX,
        tileY,
        layer: "floor",
        roomId: zone,
      });
    }
  }
  return tiles;
}

function hasSpawnOpening(markers: MauOfficeSceneMarker[], tileX: number, tileY: number): boolean {
  return markers.some(
    (marker) =>
      marker.role.startsWith("spawn.") &&
      Math.round(marker.tileX) === tileX &&
      Math.round(marker.tileY) === tileY,
  );
}

function compileLegacyRoomShellWalls(
  room: MauOfficeRoom,
  rows: MauOfficeZoneId[][],
  markers: MauOfficeSceneMarker[],
): MauOfficeSpritePlacement[] {
  const sprites: MauOfficeSpritePlacement[] = [];
  const topY = room.tileY;
  const bottomY = room.tileY + room.tileHeight - 1;
  const leftX = room.tileX;
  const rightX = room.tileX + room.tileWidth - 1;

  const topOpeningAt = (tileX: number) =>
    zoneAt(rows, tileX, topY - 1) === "hall" || hasSpawnOpening(markers, tileX, topY - 1);
  const bottomOpeningAt = (tileX: number) =>
    zoneAt(rows, tileX, bottomY + 1) === "hall" || hasSpawnOpening(markers, tileX, bottomY + 1);
  const leftOpeningAt = (tileY: number) =>
    zoneAt(rows, leftX - 1, tileY) === "hall" || hasSpawnOpening(markers, leftX - 1, tileY);
  const rightOpeningAt = (tileY: number) =>
    zoneAt(rows, rightX + 1, tileY) === "hall" || hasSpawnOpening(markers, rightX + 1, tileY);

  for (let tileX = leftX; tileX <= rightX; tileX += 1) {
    if (!topOpeningAt(tileX)) {
      const openingOnLeft = topOpeningAt(tileX - 1);
      const openingOnRight = topOpeningAt(tileX + 1);
      const variant =
        tileX === leftX
          ? "left"
          : tileX === rightX
            ? "right"
            : openingOnLeft
              ? "left"
              : openingOnRight
                ? "right"
                : "mid";
      sprites.push({
        id: `${room.id}:wall-front:${tileX}`,
        asset: `mau-office/tiles/wall-front-${variant}.png`,
        tileX,
        tileY: topY,
        tileWidth: 1,
        tileHeight: 3,
        layer: "wall",
        roomId: room.id,
        kind: "wall",
        mount: "wall",
        blocksWalkway: true,
      });
    }
    if (!bottomOpeningAt(tileX)) {
      const bottomOpeningOnLeft = bottomOpeningAt(tileX - 1);
      const bottomOpeningOnRight = bottomOpeningAt(tileX + 1);
      sprites.push({
        id: `${room.id}:wall-bottom:${tileX}`,
        asset: bottomOpeningOnLeft
          ? "mau-office/tiles/wall-corner-bl.png"
          : bottomOpeningOnRight
            ? "mau-office/tiles/wall-corner-br.png"
            : "mau-office/tiles/wall-bottom.png",
        tileX,
        tileY: bottomY,
        tileWidth: 1,
        tileHeight: 1,
        layer: "wall",
        roomId: room.id,
        kind: "wall",
        mount: "wall",
        blocksWalkway: true,
      });
    }
  }

  for (let tileY = topY + 3; tileY < bottomY; tileY += 1) {
    if (!leftOpeningAt(tileY)) {
      sprites.push({
        id: `${room.id}:wall-left:${tileY}`,
        asset: "mau-office/tiles/wall-side-left.png",
        tileX: leftX,
        tileY,
        tileWidth: 1,
        tileHeight: 1,
        layer: "wall",
        roomId: room.id,
        kind: "wall",
        mount: "wall",
        blocksWalkway: true,
      });
    }
    if (!rightOpeningAt(tileY)) {
      sprites.push({
        id: `${room.id}:wall-right:${tileY}`,
        asset: "mau-office/tiles/wall-side-right.png",
        tileX: rightX,
        tileY,
        tileWidth: 1,
        tileHeight: 1,
        layer: "wall",
        roomId: room.id,
        kind: "wall",
        mount: "wall",
        blocksWalkway: true,
      });
    }
  }

  return sprites;
}

function compileLegacyHallCaps(rows: MauOfficeZoneId[][]): MauOfficeSpritePlacement[] {
  const sprites: MauOfficeSpritePlacement[] = [];
  for (let tileY = 0; tileY < rows.length; tileY += 1) {
    for (let tileX = 0; tileX < rows[tileY].length; tileX += 1) {
      if (rows[tileY][tileX] !== "hall") {
        continue;
      }
      const hasHorizontalNeighbor =
        zoneAt(rows, tileX - 1, tileY) === "hall" || zoneAt(rows, tileX + 1, tileY) === "hall";
      if (!hasHorizontalNeighbor) {
        continue;
      }
      if (zoneAt(rows, tileX - 1, tileY) !== "hall") {
        sprites.push({
          id: `hall-cap-left:${tileX}:${tileY}`,
          asset: "mau-office/tiles/hall-cap-left.png",
          tileX: tileX - 1,
          tileY,
          tileWidth: 1,
          tileHeight: 1,
          layer: "wall",
          roomId: "hall",
          kind: "wall",
          mount: "wall",
          blocksWalkway: true,
        });
      }
      if (zoneAt(rows, tileX + 1, tileY) !== "hall") {
        sprites.push({
          id: `hall-cap-right:${tileX}:${tileY}`,
          asset: "mau-office/tiles/hall-cap-right.png",
          tileX: tileX + 1,
          tileY,
          tileWidth: 1,
          tileHeight: 1,
          layer: "wall",
          roomId: "hall",
          kind: "wall",
          mount: "wall",
          blocksWalkway: true,
        });
      }
    }
  }
  return sprites;
}

function compileLegacyWallSprites(
  rows: MauOfficeZoneId[][],
  rooms: Record<MauOfficeRoomId, MauOfficeRoom>,
  markers: MauOfficeSceneMarker[],
): MauOfficeSpritePlacement[] {
  return [
    ...Object.values(rooms).flatMap((room) => compileLegacyRoomShellWalls(room, rows, markers)),
    ...compileLegacyHallCaps(rows),
  ];
}

function setWallCell(rows: boolean[][], tileX: number, tileY: number) {
  if (tileY < 0 || tileY >= rows.length || tileX < 0 || tileX >= (rows[tileY]?.length ?? 0)) {
    return;
  }
  rows[tileY][tileX] = true;
}

function deriveLegacyWallRows(
  rows: MauOfficeZoneId[][],
  markers: MauOfficeSceneMarker[],
): boolean[][] {
  const rooms = {
    desk: roomBoundsForZone(rows, "desk"),
    meeting: roomBoundsForZone(rows, "meeting"),
    browser: roomBoundsForZone(rows, "browser"),
    break: roomBoundsForZone(rows, "break"),
    support: roomBoundsForZone(rows, "support"),
    telephony: roomBoundsForZone(rows, "telephony"),
  } satisfies Record<MauOfficeRoomId, MauOfficeRoom>;
  const wallRows = createEmptyWallRows(
    rows.reduce((max, row) => Math.max(max, row.length), 0),
    rows.length,
  );
  for (const sprite of compileLegacyWallSprites(rows, rooms, markers)) {
    setWallCell(wallRows, Math.round(sprite.tileX), Math.round(sprite.tileY));
  }
  return wallRows;
}

function wallAt(rows: boolean[][], tileX: number, tileY: number): boolean {
  if (tileY < 0 || tileY >= rows.length || tileX < 0 || tileX >= (rows[tileY]?.length ?? 0)) {
    return false;
  }
  return rows[tileY]?.[tileX];
}

function isWalkableZone(zone: MauOfficeZoneId): boolean {
  return zone !== "outside";
}

function isWallFrontCell(
  rows: MauOfficeZoneId[][],
  wallRows: boolean[][],
  tileX: number,
  tileY: number,
) {
  const zone = zoneAt(rows, tileX, tileY);
  return (
    wallAt(wallRows, tileX, tileY) &&
    isWalkableZone(zone) &&
    (zoneAt(rows, tileX, tileY - 1) === "outside" || zoneAt(rows, tileX, tileY - 1) === "hall")
  );
}

function isWallBottomCell(
  rows: MauOfficeZoneId[][],
  wallRows: boolean[][],
  tileX: number,
  tileY: number,
) {
  const zone = zoneAt(rows, tileX, tileY);
  return (
    wallAt(wallRows, tileX, tileY) &&
    isWalkableZone(zone) &&
    (zoneAt(rows, tileX, tileY + 1) === "outside" || zoneAt(rows, tileX, tileY + 1) === "hall")
  );
}

function isWallLeftCell(
  rows: MauOfficeZoneId[][],
  wallRows: boolean[][],
  tileX: number,
  tileY: number,
) {
  const zone = zoneAt(rows, tileX, tileY);
  return (
    wallAt(wallRows, tileX, tileY) &&
    isWalkableZone(zone) &&
    (zoneAt(rows, tileX - 1, tileY) === "outside" || zoneAt(rows, tileX - 1, tileY) === "hall")
  );
}

function isWallRightCell(
  rows: MauOfficeZoneId[][],
  wallRows: boolean[][],
  tileX: number,
  tileY: number,
) {
  const zone = zoneAt(rows, tileX, tileY);
  return (
    wallAt(wallRows, tileX, tileY) &&
    isWalkableZone(zone) &&
    (zoneAt(rows, tileX + 1, tileY) === "outside" || zoneAt(rows, tileX + 1, tileY) === "hall")
  );
}

function isHallCapLeftCell(
  rows: MauOfficeZoneId[][],
  wallRows: boolean[][],
  tileX: number,
  tileY: number,
) {
  return (
    wallAt(wallRows, tileX, tileY) &&
    zoneAt(rows, tileX, tileY) === "outside" &&
    zoneAt(rows, tileX + 1, tileY) === "hall"
  );
}

function isHallCapRightCell(
  rows: MauOfficeZoneId[][],
  wallRows: boolean[][],
  tileX: number,
  tileY: number,
) {
  return (
    wallAt(wallRows, tileX, tileY) &&
    zoneAt(rows, tileX, tileY) === "outside" &&
    zoneAt(rows, tileX - 1, tileY) === "hall"
  );
}

function roomIdForWallCell(
  rows: MauOfficeZoneId[][],
  tileX: number,
  tileY: number,
): MauOfficeAreaId {
  const zone = zoneAt(rows, tileX, tileY);
  if (zone !== "outside") {
    return zone;
  }
  const adjacent = [
    zoneAt(rows, tileX, tileY - 1),
    zoneAt(rows, tileX + 1, tileY),
    zoneAt(rows, tileX, tileY + 1),
    zoneAt(rows, tileX - 1, tileY),
  ].find((entry) => entry !== "outside");
  return adjacent ?? "outside";
}

function createWallSprite(params: {
  id: string;
  asset: string;
  tileX: number;
  tileY: number;
  roomId: MauOfficeAreaId;
  tileHeight?: number;
  collisionFootprintTiles?: MauOfficeFootprintTiles;
}): MauOfficeSpritePlacement {
  return {
    id: params.id,
    asset: params.asset,
    tileX: params.tileX,
    tileY: params.tileY,
    tileWidth: 1,
    tileHeight: params.tileHeight ?? 1,
    layer: "wall",
    roomId: params.roomId,
    kind: "wall",
    mount: "wall",
    blocksWalkway: true,
    collisionFootprintTiles: params.collisionFootprintTiles,
  };
}

function compileGenericWallSprite(
  rows: MauOfficeZoneId[][],
  wallRows: boolean[][],
  tileX: number,
  tileY: number,
): MauOfficeSpritePlacement | null {
  if (!wallAt(wallRows, tileX, tileY)) {
    return null;
  }
  const roomId = roomIdForWallCell(rows, tileX, tileY);
  const north = wallAt(wallRows, tileX, tileY - 1);
  const east = wallAt(wallRows, tileX + 1, tileY);
  const south = wallAt(wallRows, tileX, tileY + 1);
  const west = wallAt(wallRows, tileX - 1, tileY);
  if (!north) {
    const variant = !west && east ? "left" : west && !east ? "right" : "mid";
    return createWallSprite({
      id: `wall-generic-front:${tileX}:${tileY}`,
      asset: `mau-office/tiles/wall-front-${variant}.png`,
      tileX,
      tileY,
      tileHeight: 3,
      collisionFootprintTiles: { width: 1, height: 1 },
      roomId,
    });
  }
  if (!south) {
    return createWallSprite({
      id: `wall-generic-bottom:${tileX}:${tileY}`,
      asset:
        !west && east
          ? "mau-office/tiles/wall-corner-bl.png"
          : west && !east
            ? "mau-office/tiles/wall-corner-br.png"
            : "mau-office/tiles/wall-bottom.png",
      tileX,
      tileY,
      collisionFootprintTiles: { width: 1, height: 1 },
      roomId,
    });
  }
  if (!west && east) {
    return createWallSprite({
      id: `wall-generic-left:${tileX}:${tileY}`,
      asset: "mau-office/tiles/wall-side-left.png",
      tileX,
      tileY,
      collisionFootprintTiles: { width: 1, height: 1 },
      roomId,
    });
  }
  if (!east && west) {
    return createWallSprite({
      id: `wall-generic-right:${tileX}:${tileY}`,
      asset: "mau-office/tiles/wall-side-right.png",
      tileX,
      tileY,
      collisionFootprintTiles: { width: 1, height: 1 },
      roomId,
    });
  }
  return createWallSprite({
    id: `wall-generic-fill:${tileX}:${tileY}`,
    asset: "mau-office/tiles/wall-bottom.png",
    tileX,
    tileY,
    collisionFootprintTiles: { width: 1, height: 1 },
    roomId,
  });
}

function compileWallSpriteAt(
  rows: MauOfficeZoneId[][],
  wallRows: boolean[][],
  tileX: number,
  tileY: number,
): MauOfficeSpritePlacement | null {
  const roomId = roomIdForWallCell(rows, tileX, tileY);
  if (isHallCapLeftCell(rows, wallRows, tileX, tileY)) {
    return createWallSprite({
      id: `hall-cap-left:${tileX}:${tileY}`,
      asset: "mau-office/tiles/hall-cap-left.png",
      tileX,
      tileY,
      roomId,
    });
  }
  if (isHallCapRightCell(rows, wallRows, tileX, tileY)) {
    return createWallSprite({
      id: `hall-cap-right:${tileX}:${tileY}`,
      asset: "mau-office/tiles/hall-cap-right.png",
      tileX,
      tileY,
      roomId,
    });
  }
  if (isWallFrontCell(rows, wallRows, tileX, tileY)) {
    const leftNeighbor = isWallFrontCell(rows, wallRows, tileX - 1, tileY);
    const rightNeighbor = isWallFrontCell(rows, wallRows, tileX + 1, tileY);
    const variant =
      !leftNeighbor && rightNeighbor ? "left" : leftNeighbor && !rightNeighbor ? "right" : "mid";
    return createWallSprite({
      id: `wall-front:${tileX}:${tileY}`,
      asset: `mau-office/tiles/wall-front-${variant}.png`,
      tileX,
      tileY,
      tileHeight: 3,
      roomId,
    });
  }
  if (isWallBottomCell(rows, wallRows, tileX, tileY)) {
    const leftNeighbor = isWallBottomCell(rows, wallRows, tileX - 1, tileY);
    const rightNeighbor = isWallBottomCell(rows, wallRows, tileX + 1, tileY);
    return createWallSprite({
      id: `wall-bottom:${tileX}:${tileY}`,
      asset:
        !leftNeighbor && rightNeighbor
          ? "mau-office/tiles/wall-corner-bl.png"
          : leftNeighbor && !rightNeighbor
            ? "mau-office/tiles/wall-corner-br.png"
            : "mau-office/tiles/wall-bottom.png",
      tileX,
      tileY,
      roomId,
    });
  }
  if (isWallLeftCell(rows, wallRows, tileX, tileY)) {
    return createWallSprite({
      id: `wall-left:${tileX}:${tileY}`,
      asset: "mau-office/tiles/wall-side-left.png",
      tileX,
      tileY,
      roomId,
    });
  }
  if (isWallRightCell(rows, wallRows, tileX, tileY)) {
    return createWallSprite({
      id: `wall-right:${tileX}:${tileY}`,
      asset: "mau-office/tiles/wall-side-right.png",
      tileX,
      tileY,
      roomId,
    });
  }
  return compileGenericWallSprite(rows, wallRows, tileX, tileY);
}

function compileWallSprites(
  rows: MauOfficeZoneId[][],
  wallRows: boolean[][],
): MauOfficeSpritePlacement[] {
  const sprites: MauOfficeSpritePlacement[] = [];
  for (let tileY = 0; tileY < wallRows.length; tileY += 1) {
    for (let tileX = 0; tileX < (wallRows[tileY]?.length ?? 0); tileX += 1) {
      const sprite = compileWallSpriteAt(rows, wallRows, tileX, tileY);
      if (sprite) {
        sprites.push(sprite);
      }
    }
  }
  return sprites;
}

function zoneForPlacement(
  rows: MauOfficeZoneId[][],
  tileX: number,
  tileY: number,
): MauOfficeAreaId {
  const zone = zoneAt(rows, Math.round(tileX), Math.round(tileY));
  return zone === "outside" ? "outside" : zone;
}

function isRoomId(value: unknown): value is MauOfficeRoomId {
  return (
    value === "desk" ||
    value === "meeting" ||
    value === "browser" ||
    value === "break" ||
    value === "support" ||
    value === "telephony"
  );
}

function roomIdAt(rows: MauOfficeZoneId[][], tileX: number, tileY: number): MauOfficeRoomId | null {
  const zone = zoneAt(rows, Math.round(tileX), Math.round(tileY));
  return isRoomId(zone) ? zone : null;
}

function resolveLoop(
  item: MauOfficeCatalogItem,
  loopId: string | undefined,
): MauOfficeSpritePlacement["animation"] | undefined {
  if (!item.loops) {
    return undefined;
  }
  if (loopId === "off") {
    return undefined;
  }
  const resolvedId = loopId ?? item.loops.defaultLoopId;
  const loop = item.loops.values.find((entry) => entry.id === resolvedId);
  if (!loop) {
    return undefined;
  }
  return {
    loopId: loop.id,
    fps: loop.fps,
    frames: loop.frames,
  };
}

function compilePropPlacement(
  placement: MauOfficeScenePropPlacement,
  rows: MauOfficeZoneId[][],
): MauOfficeSpritePlacement | null {
  const item = MAU_OFFICE_CATALOG[placement.itemId];
  if (!item || !item.asset) {
    return null;
  }
  const mount = placement.mountOverride ?? item.mount;
  const blocksWalkway =
    placement.collisionOverride ?? (mount === "wall" ? false : item.blocksWalkway);
  const labelRoomId =
    item.labelOverlay?.kind === "room-name"
      ? (placement.zoneId ??
        roomIdAt(rows, placement.tileX, placement.tileY) ??
        item.labelOverlay.defaultRoomId)
      : null;
  return {
    id: placement.id,
    sourceId: placement.id,
    asset: item.asset,
    tileX: placement.tileX,
    tileY: placement.tileY,
    tileWidth: item.tileWidth,
    tileHeight: item.tileHeight,
    layer: mount === "wall" ? "wall" : "prop",
    roomId: zoneForPlacement(rows, placement.tileX, placement.tileY),
    anchor: item.anchor ?? "top-left",
    mirrored: placement.mirrored,
    zOffset: placement.zOffsetOverride ?? item.defaultZOffset,
    mount,
    blocksWalkway,
    kind: item.kind,
    animation: resolveLoop(item, placement.loopId),
    overlayLabel:
      labelRoomId != null
        ? {
            text: ROOM_META[labelRoomId].signLabel,
            tone: ROOM_META[labelRoomId].signTone,
          }
        : undefined,
  };
}

function hasCell(cells: Set<string>, tileX: number, tileY: number): boolean {
  return cells.has(tileKey(tileX, tileY));
}

function compileAutotilePlacement(
  placement: MauOfficeSceneAutotilePlacement,
  rows: MauOfficeZoneId[][],
): MauOfficeSpritePlacement[] {
  const item = MAU_OFFICE_CATALOG[placement.itemId];
  if (!item?.autotileMode || !item.sliceAssets) {
    return [];
  }
  const mount = placement.mountOverride ?? item.mount;
  const blocksWalkway =
    placement.collisionOverride ?? (mount === "wall" ? false : item.blocksWalkway);
  const cells = new Set(
    placement.cells.map((cell) => tileKey(Math.round(cell.tileX), Math.round(cell.tileY))),
  );
  const sprites: MauOfficeSpritePlacement[] = [];
  for (const cell of placement.cells) {
    const tileX = Math.round(cell.tileX);
    const tileY = Math.round(cell.tileY);
    const north = hasCell(cells, tileX, tileY - 1);
    const east = hasCell(cells, tileX + 1, tileY);
    const south = hasCell(cells, tileX, tileY + 1);
    const west = hasCell(cells, tileX - 1, tileY);
    let asset = "";
    if (item.autotileMode === "nine-slice") {
      const slices = item.sliceAssets;
      asset =
        !north && !west
          ? (slices as Record<string, string>).topLeft
          : !north && !east
            ? (slices as Record<string, string>).topRight
            : !south && !west
              ? (slices as Record<string, string>).bottomLeft
              : !south && !east
                ? (slices as Record<string, string>).bottomRight
                : !north
                  ? (slices as Record<string, string>).topCenter
                  : !south
                    ? (slices as Record<string, string>).bottomCenter
                    : !west
                      ? (slices as Record<string, string>).middleLeft
                      : !east
                        ? (slices as Record<string, string>).middleRight
                        : (slices as Record<string, string>).middleCenter;
    } else {
      const slices = item.sliceAssets as Record<string, string>;
      asset = !west ? slices.left : !east ? slices.right : slices.center;
    }
    sprites.push({
      id: `${placement.id}:${tileX}:${tileY}`,
      sourceId: placement.id,
      asset,
      tileX,
      tileY,
      tileWidth: 1,
      tileHeight: 1,
      layer: mount === "wall" ? "wall" : "prop",
      roomId: zoneForPlacement(rows, tileX, tileY),
      zOffset: placement.zOffsetOverride ?? item.defaultZOffset,
      mount,
      blocksWalkway,
      kind: item.kind,
      animation: resolveLoop(item, placement.loopId),
    });
  }
  return sprites;
}

function compilePropSprites(scene: MauOfficeSceneConfig): MauOfficeSpritePlacement[] {
  return [
    ...scene.props
      .map((placement) => compilePropPlacement(placement, scene.zoneRows))
      .filter((entry): entry is MauOfficeSpritePlacement => Boolean(entry)),
    ...scene.autotiles.flatMap((placement) => compileAutotilePlacement(placement, scene.zoneRows)),
  ];
}

function spriteOccupiedTiles(
  sprite: Pick<
    MauOfficeSpritePlacement,
    "tileX" | "tileY" | "tileWidth" | "tileHeight" | "collisionFootprintTiles"
  >,
) {
  const occupied: string[] = [];
  const footprintWidth = sprite.collisionFootprintTiles?.width ?? sprite.tileWidth;
  const footprintHeight = sprite.collisionFootprintTiles?.height ?? sprite.tileHeight;
  const startTileX = Math.floor(sprite.tileX);
  const startTileY = Math.floor(sprite.tileY);
  const endTileX = Math.ceil(sprite.tileX + footprintWidth) - 1;
  const endTileY = Math.ceil(sprite.tileY + footprintHeight) - 1;
  for (let tileY = startTileY; tileY <= endTileY; tileY += 1) {
    for (let tileX = startTileX; tileX <= endTileX; tileX += 1) {
      occupied.push(tileKey(tileX, tileY));
    }
  }
  return occupied;
}

function buildWalkableTileKeys(
  floorTiles: MauOfficeTilePlacement[],
  anchors: Record<string, MauOfficeAnchor>,
  nodes: Record<string, MauOfficeNode>,
): Set<string> {
  const keys = new Set<string>(floorTiles.map((tile) => tileKey(tile.tileX, tile.tileY)));
  for (const anchor of Object.values(anchors)) {
    keys.add(tileKey(Math.round(anchor.tileX), Math.round(anchor.tileY)));
  }
  for (const node of Object.values(nodes)) {
    keys.add(tileKey(Math.round(node.tileX), Math.round(node.tileY)));
  }
  return keys;
}

function buildBlockedTileKeys(sprites: MauOfficeSpritePlacement[]): Set<string> {
  return new Set(
    sprites
      .filter((sprite) => sprite.blocksWalkway ?? BLOCKING_KINDS.has(sprite.kind))
      .flatMap((sprite) => spriteOccupiedTiles(sprite)),
  );
}

export function compileMauOfficeScene(scene: MauOfficeSceneConfig): CompiledMauOfficeScene {
  const authored = cloneMauOfficeSceneConfig(scene);
  const tileWidth = getMauOfficeSceneTileWidth(authored);
  const tileHeight = getMauOfficeSceneTileHeight(authored);
  const markerMaps = buildMarkerMaps(authored.markers);
  const rooms = {
    desk: roomBoundsForZone(authored.zoneRows, "desk"),
    meeting: roomBoundsForZone(authored.zoneRows, "meeting"),
    browser: roomBoundsForZone(authored.zoneRows, "browser"),
    break: roomBoundsForZone(authored.zoneRows, "break"),
    support: roomBoundsForZone(authored.zoneRows, "support"),
    telephony: roomBoundsForZone(authored.zoneRows, "telephony"),
  } satisfies Record<MauOfficeRoomId, MauOfficeRoom>;
  const anchors = compileAnchors(authored.markers, authored.zoneRows);
  const nodes = compileNodes(anchors);
  const floorTiles = compileFloorTiles(authored.zoneRows);
  const wallSprites = compileWallSprites(authored.zoneRows, authored.wallRows);
  const propSprites = compilePropSprites(authored);
  const walkableTileKeys = buildWalkableTileKeys(floorTiles, anchors, nodes);
  const blockedTileKeys = buildBlockedTileKeys([...wallSprites, ...propSprites]);
  return {
    tileSize: MAU_OFFICE_TILE_SIZE,
    width: tileWidth * MAU_OFFICE_TILE_SIZE,
    height: tileHeight * MAU_OFFICE_TILE_SIZE,
    rooms,
    anchors,
    nodes,
    map: {
      floorTiles,
      wallSprites,
      propSprites,
      labels: [],
    },
    authored,
    catalog: MAU_OFFICE_CATALOG,
    markerRoleById: markerMaps.markerRoleById,
    markerIdsByRole: markerMaps.markerIdsByRole,
    walkableTileKeys,
    blockedTileKeys,
  };
}

export function validateMauOfficeScene(scene: MauOfficeSceneConfig): MauOfficeSceneValidation {
  const errors: string[] = [];
  const zoneWidth = getMauOfficeSceneTileWidth(scene);
  const zoneHeight = getMauOfficeSceneTileHeight(scene);
  if (zoneHeight < MAU_OFFICE_SCENE_MIN_TILES_H || zoneHeight > MAU_OFFICE_SCENE_MAX_TILES_H) {
    errors.push(
      `Canvas height must stay between ${MAU_OFFICE_SCENE_MIN_TILES_H} and ${MAU_OFFICE_SCENE_MAX_TILES_H} tiles.`,
    );
  }
  for (const row of scene.zoneRows) {
    if (row.length !== zoneWidth) {
      errors.push("Each zone row must contain the same number of tiles.");
      break;
    }
  }
  if (zoneWidth < MAU_OFFICE_SCENE_MIN_TILES_W || zoneWidth > MAU_OFFICE_SCENE_MAX_TILES_W) {
    errors.push(
      `Canvas width must stay between ${MAU_OFFICE_SCENE_MIN_TILES_W} and ${MAU_OFFICE_SCENE_MAX_TILES_W} tiles.`,
    );
  }
  if (scene.wallRows.length !== zoneHeight) {
    errors.push("Wall rows must match the zone row count.");
  }
  for (const row of scene.wallRows) {
    if (row.length !== zoneWidth) {
      errors.push("Each wall row must match the zone row width.");
      break;
    }
  }
  const markerMaps = buildMarkerMaps(scene.markers);
  for (const requirement of REQUIRED_MARKER_COUNTS) {
    const count = markerMaps.markerIdsByRole[requirement.role]?.length ?? 0;
    if (typeof requirement.exact === "number" && count !== requirement.exact) {
      errors.push(`${requirement.role} requires exactly ${requirement.exact} marker(s).`);
    }
    if (typeof requirement.min === "number" && count < requirement.min) {
      errors.push(`${requirement.role} requires at least ${requirement.min} marker(s).`);
    }
  }
  for (const roomId of [
    "desk",
    "meeting",
    "browser",
    "break",
    "support",
    "telephony",
    "hall",
  ] as const) {
    const hasTile = scene.zoneRows.some((row) => row.some((value) => value === roomId));
    if (!hasTile) {
      errors.push(`${roomId} must contain at least one tile.`);
    }
  }
  for (const prop of scene.props) {
    if (!MAU_OFFICE_CATALOG[prop.itemId]) {
      errors.push(`Unknown prop item "${prop.itemId}".`);
    }
  }
  for (const autotile of scene.autotiles) {
    const item = MAU_OFFICE_CATALOG[autotile.itemId];
    if (!item?.autotileMode) {
      errors.push(`Unknown autotile brush "${autotile.itemId}".`);
    }
  }
  for (const marker of scene.markers) {
    const roleRoomId = roomIdForRole(marker.role);
    const tileX = Math.round(marker.tileX);
    const tileY = Math.round(marker.tileY);
    if (tileY >= 0 && tileY < scene.wallRows.length && wallAt(scene.wallRows, tileX, tileY)) {
      errors.push(`${marker.id} should not be placed on a wall tile.`);
    }
    const zone = zoneAt(scene.zoneRows, Math.round(marker.tileX), Math.round(marker.tileY));
    if (roleRoomId === "outside") {
      if (zone !== "outside") {
        errors.push(`${marker.id} should be placed on an outside tile.`);
      }
      continue;
    }
    if (zone === "outside") {
      errors.push(`${marker.id} should not be placed on an outside tile.`);
    }
  }
  return { errors };
}

function defaultSceneProps(): MauOfficeScenePropPlacement[] {
  return [
    { id: "desk-kanban", itemId: "kanban-board", tileX: 2, tileY: 1.5 },
    { id: "desk-roadmap", itemId: "desk-roadmap-board", tileX: 6, tileY: 1.5 },
    { id: "desk-calendar", itemId: "calendar-wall", tileX: 10, tileY: 2 },
    { id: "desk-clocks", itemId: "wall-clocks", tileX: 11, tileY: 1.5 },
    { id: "desk-camera", itemId: "security-camera", tileX: 14, tileY: 2 },
    { id: "desk-a", itemId: "desk-wide", tileX: 3, tileY: 3 },
    { id: "desk-b", itemId: "desk-wide", tileX: 7, tileY: 3 },
    { id: "desk-c", itemId: "desk-wide", tileX: 11, tileY: 3 },
    { id: "desk-d", itemId: "desk-wide", tileX: 3, tileY: 6 },
    { id: "desk-e", itemId: "desk-wide", tileX: 7, tileY: 6 },
    { id: "desk-f", itemId: "desk-wide", tileX: 11, tileY: 6 },
    { id: "desk-chair-a", itemId: "chair-front", tileX: 4, tileY: 5 },
    { id: "desk-chair-b", itemId: "chair-front", tileX: 8, tileY: 5 },
    { id: "desk-chair-c", itemId: "chair-front", tileX: 12, tileY: 5 },
    { id: "desk-chair-d", itemId: "chair-front", tileX: 4, tileY: 8 },
    { id: "desk-chair-e", itemId: "chair-front", tileX: 8, tileY: 8 },
    { id: "desk-chair-f", itemId: "chair-front", tileX: 12, tileY: 8 },
    { id: "desk-a-monitor", itemId: "monitor-chart", tileX: 4, tileY: 3.5 },
    { id: "desk-a-book", itemId: "book-open", tileX: 5, tileY: 3.5 },
    { id: "desk-b-monitor", itemId: "desktop-monitor", tileX: 8, tileY: 3.5 },
    { id: "desk-b-book", itemId: "book-stack-closed", tileX: 9, tileY: 3.5 },
    { id: "desk-c-monitor", itemId: "monitor-code", tileX: 12, tileY: 3.5 },
    { id: "desk-c-book", itemId: "book-stack-mixed", tileX: 13, tileY: 3.5 },
    { id: "desk-d-monitor", itemId: "monitor-code", tileX: 4, tileY: 6.5 },
    { id: "desk-d-book", itemId: "book-stack-mixed", tileX: 5, tileY: 6.5 },
    { id: "desk-e-monitor", itemId: "monitor-chart", tileX: 8, tileY: 6.5 },
    { id: "desk-e-book", itemId: "book-open", tileX: 9, tileY: 6.5 },
    { id: "desk-f-monitor", itemId: "desktop-monitor", tileX: 12, tileY: 6.5 },
    { id: "desk-f-book", itemId: "book-stack-closed", tileX: 13, tileY: 6.5 },
    { id: "desk-rack-top", itemId: "server-rack", tileX: 6, tileY: 3 },
    { id: "desk-rack-bottom", itemId: "server-rack", tileX: 6, tileY: 6 },
    { id: "meeting-board", itemId: "meeting-board", tileX: 18.5, tileY: 1.5 },
    { id: "meeting-plant", itemId: "plant", tileX: 18, tileY: 3 },
    { id: "meeting-chair-top-left", itemId: "chair-back", tileX: 19, tileY: 3.5 },
    { id: "meeting-chair-top-mid", itemId: "chair-back", tileX: 20, tileY: 3.5 },
    { id: "meeting-chair-top-right", itemId: "chair-back", tileX: 21, tileY: 3.5 },
    { id: "meeting-chair-left", itemId: "chair-left", tileX: 17.5, tileY: 5 },
    { id: "meeting-chair-right", itemId: "chair-right", tileX: 22.5, tileY: 5 },
    { id: "meeting-chair-bottom-left", itemId: "chair-front", tileX: 19, tileY: 7 },
    { id: "meeting-chair-bottom-mid", itemId: "chair-front", tileX: 20, tileY: 7 },
    { id: "meeting-chair-bottom-right", itemId: "chair-front", tileX: 21, tileY: 7 },
    { id: "browser-board", itemId: "desk-roadmap-board", tileX: 27, tileY: 1.5 },
    { id: "browser-desk", itemId: "desk-wide", tileX: 30, tileY: 4 },
    { id: "browser-chair", itemId: "chair-front", tileX: 31, tileY: 6 },
    { id: "browser-monitor", itemId: "monitor-code", tileX: 31, tileY: 4.5 },
    { id: "browser-book", itemId: "book-open", tileX: 32, tileY: 4.5 },
    { id: "browser-plant", itemId: "plant", tileX: 35, tileY: 3 },
    { id: "break-neon", itemId: "neon-sign", tileX: 4, tileY: 11 },
    { id: "break-zone-sign", itemId: "zone-sign", tileX: 1, tileY: 11, zoneId: "break" },
    { id: "break-shelf", itemId: "snack-shelf", tileX: 11, tileY: 12 },
    { id: "break-arcade", itemId: "arcade", tileX: 1, tileY: 13 },
    { id: "break-round-table", itemId: "round-table", tileX: 4, tileY: 13 },
    { id: "break-beanbag-blue", itemId: "beanbag-blue", tileX: 6, tileY: 14, mirrored: true },
    { id: "break-beanbag-pink", itemId: "beanbag-pink", tileX: 3, tileY: 14 },
    { id: "break-foosball", itemId: "foosball", tileX: 11, tileY: 16 },
    { id: "break-bench", itemId: "bench", tileX: 12, tileY: 14 },
    { id: "support-poster", itemId: "notice-board", tileX: 18, tileY: 12 },
    { id: "support-zone-sign", itemId: "zone-sign", tileX: 16, tileY: 11, zoneId: "support" },
    { id: "support-calendar", itemId: "calendar-wall", tileX: 22, tileY: 12 },
    { id: "support-monitor-back-left", itemId: "monitor-back", tileX: 19, tileY: 14.5 },
    { id: "support-paper-center", itemId: "paper-stack", tileX: 20.5, tileY: 14.5 },
    { id: "support-monitor-back-right", itemId: "monitor-back", tileX: 22, tileY: 14.5 },
    { id: "support-bench", itemId: "bench", tileX: 22, tileY: 17 },
    { id: "support-plant", itemId: "plant", tileX: 17, tileY: 17 },
    { id: "telephony-poster", itemId: "notice-board", tileX: 27, tileY: 12 },
    {
      id: "telephony-zone-sign",
      itemId: "zone-sign",
      tileX: 32,
      tileY: 11,
      zoneId: "telephony",
    },
    { id: "telephony-calendar", itemId: "calendar-wall", tileX: 34, tileY: 12 },
    { id: "telephony-monitor", itemId: "monitor-back", tileX: 30, tileY: 14.5 },
    { id: "telephony-fax", itemId: "fax-machine", tileX: 31, tileY: 14.5 },
    { id: "telephony-paper", itemId: "paper-stack", tileX: 32, tileY: 14.5 },
    { id: "telephony-plant", itemId: "plant", tileX: 35, tileY: 17 },
    { id: "desk-zone-sign", itemId: "zone-sign", tileX: 1, tileY: 9, zoneId: "desk" },
    { id: "meeting-zone-sign", itemId: "zone-sign", tileX: 16, tileY: 9, zoneId: "meeting" },
    { id: "browser-zone-sign", itemId: "zone-sign", tileX: 32, tileY: 9, zoneId: "browser" },
  ];
}

function defaultSceneAutotiles(): MauOfficeSceneAutotilePlacement[] {
  return [
    {
      id: "meeting-table",
      itemId: "meeting-table",
      cells: [
        { tileX: 18, tileY: 4 },
        { tileX: 19, tileY: 4 },
        { tileX: 20, tileY: 4 },
        { tileX: 21, tileY: 4 },
        { tileX: 22, tileY: 4 },
        { tileX: 18, tileY: 5 },
        { tileX: 19, tileY: 5 },
        { tileX: 20, tileY: 5 },
        { tileX: 21, tileY: 5 },
        { tileX: 22, tileY: 5 },
        { tileX: 18, tileY: 6 },
        { tileX: 19, tileY: 6 },
        { tileX: 20, tileY: 6 },
        { tileX: 21, tileY: 6 },
        { tileX: 22, tileY: 6 },
      ],
    },
    {
      id: "break-rug",
      itemId: "rug",
      cells: [
        { tileX: 10, tileY: 16 },
        { tileX: 11, tileY: 16 },
        { tileX: 12, tileY: 16 },
        { tileX: 13, tileY: 16 },
        { tileX: 10, tileY: 17 },
        { tileX: 11, tileY: 17 },
        { tileX: 12, tileY: 17 },
        { tileX: 13, tileY: 17 },
        { tileX: 10, tileY: 18 },
        { tileX: 11, tileY: 18 },
        { tileX: 12, tileY: 18 },
        { tileX: 13, tileY: 18 },
      ],
    },
    {
      id: "support-counter",
      itemId: "support-counter",
      cells: [
        { tileX: 18, tileY: 15 },
        { tileX: 19, tileY: 15 },
        { tileX: 20, tileY: 15 },
        { tileX: 21, tileY: 15 },
        { tileX: 22, tileY: 15 },
      ],
    },
    {
      id: "telephony-counter",
      itemId: "support-counter",
      cells: [
        { tileX: 29, tileY: 15 },
        { tileX: 30, tileY: 15 },
        { tileX: 31, tileY: 15 },
        { tileX: 32, tileY: 15 },
        { tileX: 33, tileY: 15 },
      ],
    },
  ];
}

function defaultSceneMarkers(): MauOfficeSceneMarker[] {
  return [
    {
      id: "outside_mauHome",
      role: "spawn.office",
      tileX: 8,
      tileY: 20,
      pose: "stand",
      layer: 0,
      facingOverride: "north",
    },
    {
      id: "outside_support",
      role: "spawn.support",
      tileX: 20,
      tileY: 20,
      pose: "stand",
      layer: 0,
      facingOverride: "north",
    },
    {
      id: "desk_worker_1",
      role: "desk.workerSeat",
      tileX: 4,
      tileY: 5,
      pose: "sit",
      layer: 3,
      facingOverride: "north",
    },
    {
      id: "desk_worker_2",
      role: "desk.workerSeat",
      tileX: 8,
      tileY: 5,
      pose: "sit",
      layer: 3,
      facingOverride: "north",
    },
    {
      id: "desk_worker_3",
      role: "desk.workerSeat",
      tileX: 12,
      tileY: 5,
      pose: "sit",
      layer: 3,
      facingOverride: "north",
    },
    {
      id: "desk_worker_4",
      role: "desk.workerSeat",
      tileX: 4,
      tileY: 8,
      pose: "sit",
      layer: 3,
      facingOverride: "north",
    },
    {
      id: "desk_worker_5",
      role: "desk.workerSeat",
      tileX: 8,
      tileY: 8,
      pose: "sit",
      layer: 3,
      facingOverride: "north",
    },
    {
      id: "desk_worker_6",
      role: "desk.workerSeat",
      tileX: 12,
      tileY: 8,
      pose: "sit",
      layer: 3,
      facingOverride: "north",
    },
    {
      id: "desk_board",
      role: "desk.board",
      tileX: 2,
      tileY: 4,
      pose: "stand",
      layer: 4,
      facingOverride: "north",
    },
    {
      id: "meeting_presenter",
      role: "meeting.presenter",
      tileX: 23,
      tileY: 4,
      pose: "stand",
      layer: 4,
      facingOverride: "south",
    },
    {
      id: "meeting_seat_1",
      role: "meeting.seat",
      tileX: 19,
      tileY: 4,
      pose: "sit",
      layer: 3,
      facingOverride: "south",
    },
    {
      id: "meeting_seat_2",
      role: "meeting.seat",
      tileX: 20,
      tileY: 4,
      pose: "sit",
      layer: 3,
      facingOverride: "south",
    },
    {
      id: "meeting_seat_3",
      role: "meeting.seat",
      tileX: 21,
      tileY: 4,
      pose: "sit",
      layer: 3,
      facingOverride: "south",
    },
    {
      id: "meeting_seat_4",
      role: "meeting.seat",
      tileX: 19,
      tileY: 7,
      pose: "sit",
      layer: 3,
      facingOverride: "north",
    },
    {
      id: "meeting_seat_5",
      role: "meeting.seat",
      tileX: 20,
      tileY: 7,
      pose: "sit",
      layer: 3,
      facingOverride: "north",
    },
    {
      id: "meeting_seat_6",
      role: "meeting.seat",
      tileX: 21,
      tileY: 7,
      pose: "sit",
      layer: 3,
      facingOverride: "north",
    },
    {
      id: "browser_worker_1",
      role: "browser.workerSeat",
      tileX: 31,
      tileY: 6,
      pose: "sit",
      layer: 3,
      facingOverride: "north",
    },
    {
      id: "support_staff_1",
      role: "support.staff",
      tileX: 18,
      tileY: 14,
      pose: "stand",
      layer: 4,
      facingOverride: "south",
    },
    {
      id: "support_staff_2",
      role: "support.staff",
      tileX: 20,
      tileY: 14,
      pose: "stand",
      layer: 4,
      facingOverride: "south",
    },
    {
      id: "support_staff_3",
      role: "support.staff",
      tileX: 22,
      tileY: 14,
      pose: "stand",
      layer: 4,
      facingOverride: "south",
    },
    {
      id: "support_customer_1",
      role: "support.customer",
      tileX: 18,
      tileY: 16,
      pose: "stand",
      layer: 4,
      facingOverride: "north",
    },
    {
      id: "support_customer_2",
      role: "support.customer",
      tileX: 20,
      tileY: 16,
      pose: "stand",
      layer: 4,
      facingOverride: "north",
    },
    {
      id: "support_customer_3",
      role: "support.customer",
      tileX: 22,
      tileY: 16,
      pose: "stand",
      layer: 4,
      facingOverride: "north",
    },
    {
      id: "telephony_staff_1",
      role: "telephony.staff",
      tileX: 31,
      tileY: 14,
      pose: "stand",
      layer: 4,
      facingOverride: "south",
    },
    {
      id: "break_arcade",
      role: "break.arcade",
      tileX: 2,
      tileY: 14,
      pose: "stand",
      layer: 3,
      facingOverride: "west",
    },
    {
      id: "break_snack",
      role: "break.snack",
      tileX: 11,
      tileY: 14,
      pose: "stand",
      layer: 3,
      facingOverride: "north",
    },
    {
      id: "break_volley_1",
      role: "break.volley",
      tileX: 2,
      tileY: 16,
      pose: "stand",
      layer: 3,
      facingOverride: "east",
    },
    {
      id: "break_volley_2",
      role: "break.volley",
      tileX: 4,
      tileY: 16,
      pose: "stand",
      layer: 3,
      facingOverride: "west",
    },
    {
      id: "break_table_1",
      role: "break.tableSeat",
      tileX: 3,
      tileY: 14,
      pose: "sit",
      layer: 3,
      facingOverride: "south",
    },
    {
      id: "break_table_2",
      role: "break.tableSeat",
      tileX: 6,
      tileY: 14,
      pose: "sit",
      layer: 3,
      facingOverride: "south",
    },
    {
      id: "break_volley_3",
      role: "break.volley",
      tileX: 2,
      tileY: 18,
      pose: "stand",
      layer: 3,
      facingOverride: "east",
    },
    {
      id: "break_volley_4",
      role: "break.volley",
      tileX: 4,
      tileY: 18,
      pose: "stand",
      layer: 3,
      facingOverride: "west",
    },
    {
      id: "break_chase_1",
      role: "break.chase",
      tileX: 10,
      tileY: 16,
      pose: "stand",
      layer: 3,
      facingOverride: "east",
    },
    {
      id: "break_chase_2",
      role: "break.chase",
      tileX: 8,
      tileY: 15,
      pose: "stand",
      layer: 3,
      facingOverride: "west",
    },
    {
      id: "break_chase_3",
      role: "break.chase",
      tileX: 7,
      tileY: 17,
      pose: "stand",
      layer: 3,
      facingOverride: "north",
    },
    {
      id: "break_game_1",
      role: "break.game",
      tileX: 10,
      tileY: 16,
      pose: "stand",
      layer: 3,
      facingOverride: "east",
    },
    {
      id: "break_game_2",
      role: "break.game",
      tileX: 13,
      tileY: 16,
      pose: "stand",
      layer: 3,
      facingOverride: "west",
    },
    {
      id: "break_game_3",
      role: "break.game",
      tileX: 10,
      tileY: 17,
      pose: "stand",
      layer: 3,
      facingOverride: "east",
    },
    {
      id: "break_game_4",
      role: "break.game",
      tileX: 13,
      tileY: 17,
      pose: "stand",
      layer: 3,
      facingOverride: "west",
    },
    {
      id: "break_jukebox",
      role: "break.jukebox",
      tileX: 10,
      tileY: 14,
      pose: "stand",
      layer: 3,
      facingOverride: "north",
    },
    {
      id: "break_reading",
      role: "break.reading",
      tileX: 13,
      tileY: 14,
      pose: "stand",
      layer: 3,
      facingOverride: "west",
    },
  ];
}

function buildLegacyDefaultWallRows(): boolean[][] {
  return [
    [
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ],
    [
      false,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      false,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      false,
    ],
    [
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ],
    [
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ],
    [
      false,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      false,
    ],
    [
      false,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      false,
    ],
    [
      false,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      false,
    ],
    [
      false,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      false,
    ],
    [
      false,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      false,
    ],
    [
      false,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      false,
    ],
    [
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
      false,
    ],
    [
      false,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      true,
      true,
      true,
      true,
      false,
    ],
    [
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ],
    [
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ],
    [
      false,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      false,
    ],
    [
      false,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      false,
    ],
    [
      false,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      false,
    ],
    [
      false,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      false,
    ],
    [
      false,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      false,
    ],
    [
      false,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      true,
      true,
      true,
      true,
      false,
    ],
  ];
}

function buildDefaultWallRows(): boolean[][] {
  const rows = createEmptyWallRows();
  const legacyRows = buildLegacyDefaultWallRows();
  for (let tileY = 0; tileY < legacyRows.length; tileY += 1) {
    for (let tileX = 0; tileX < legacyRows[tileY].length; tileX += 1) {
      rows[tileY][tileX] = legacyRows[tileY][tileX]!;
    }
  }
  for (const sprite of LEGACY_LAYOUT.map.wallSprites) {
    const tileX = Math.round(sprite.tileX);
    const tileY = Math.round(sprite.tileY);
    if (tileY >= 0 && tileY < rows.length && tileX >= 0 && tileX < (rows[tileY]?.length ?? 0)) {
      rows[tileY][tileX] = true;
    }
  }
  const eastSpine = LEGACY_LAYOUT.nodes.east_spine;
  const farSpine = LEGACY_LAYOUT.nodes.far_spine;
  if (eastSpine.tileY === farSpine.tileY) {
    const tileY = eastSpine.tileY;
    for (
      let tileX = Math.min(eastSpine.tileX, farSpine.tileX);
      tileX <= Math.max(eastSpine.tileX, farSpine.tileX);
      tileX += 1
    ) {
      rows[tileY][tileX] = false;
    }
  }
  for (const [tileX, tileY, blocked] of [
    [15, 1, false],
    [16, 3, false],
    [25, 3, true],
    [14, 4, true],
    [15, 4, false],
    [14, 5, true],
    [15, 5, false],
    [24, 6, false],
    [26, 6, false],
    [14, 7, true],
    [15, 7, false],
    [14, 8, true],
    [15, 8, false],
    [15, 9, false],
    [7, 10, false],
    [32, 10, false],
    [15, 11, false],
    [15, 12, false],
    [15, 13, false],
    [14, 14, true],
    [15, 14, false],
    [14, 15, true],
    [15, 15, false],
    [14, 16, true],
    [15, 16, false],
    [14, 17, true],
    [15, 17, false],
    [14, 18, true],
    [15, 18, false],
    [15, 19, false],
  ] as const) {
    rows[tileY][tileX] = blocked;
  }
  return rows;
}

export function createDefaultMauOfficeSceneConfig(): MauOfficeSceneConfig {
  return {
    version: 1,
    zoneRows: buildDefaultZoneRows(),
    wallRows: buildDefaultWallRows(),
    props: defaultSceneProps(),
    autotiles: defaultSceneAutotiles(),
    markers: defaultSceneMarkers(),
  };
}

function isZoneId(value: unknown): value is MauOfficeZoneId {
  return (
    value === "desk" ||
    value === "meeting" ||
    value === "browser" ||
    value === "break" ||
    value === "support" ||
    value === "telephony" ||
    value === "hall" ||
    value === "outside"
  );
}

function clampSceneTileDimension(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function sceneHasZoneTile(rows: MauOfficeZoneId[][], zoneId: MauOfficeZoneId): boolean {
  return rows.some((row) => row.some((value) => value === zoneId));
}

function upgradeLegacySceneRightWing(
  scene: MauOfficeSceneConfig,
  fallback: MauOfficeSceneConfig,
): MauOfficeSceneConfig {
  const currentWidth = getMauOfficeSceneTileWidth(scene);
  const currentHeight = getMauOfficeSceneTileHeight(scene);
  const looksLikeLegacyScene =
    currentWidth >= MAU_OFFICE_LEGACY_SCENE_TILES_W && currentHeight >= MAU_OFFICE_SCENE_TILES_H;
  const missingBrowserWing = !sceneHasZoneTile(scene.zoneRows, "browser");
  const missingTelephonyWing = !sceneHasZoneTile(scene.zoneRows, "telephony");
  if (!looksLikeLegacyScene || (!missingBrowserWing && !missingTelephonyWing)) {
    return scene;
  }

  const targetWidth = Math.max(currentWidth, getMauOfficeSceneTileWidth(fallback));
  const targetHeight = Math.max(currentHeight, getMauOfficeSceneTileHeight(fallback));
  const zoneRows = Array.from({ length: targetHeight }, (_, rowIndex) =>
    Array.from({ length: targetWidth }, (_, colIndex) => {
      const current = scene.zoneRows[rowIndex]?.[colIndex];
      const fallbackValue = fallback.zoneRows[rowIndex]?.[colIndex] ?? "outside";
      if (
        (current === undefined || current === "outside") &&
        colIndex >= MAU_OFFICE_RIGHT_WING_MERGE_TILE_X &&
        fallbackValue !== "outside"
      ) {
        return fallbackValue;
      }
      return current ?? fallbackValue;
    }),
  );
  const wallRows = Array.from({ length: targetHeight }, (_, rowIndex) =>
    Array.from({ length: targetWidth }, (_, colIndex) => {
      const current = scene.wallRows[rowIndex]?.[colIndex];
      const fallbackValue = fallback.wallRows[rowIndex]?.[colIndex];
      if (!current && colIndex >= MAU_OFFICE_RIGHT_WING_MERGE_TILE_X && fallbackValue) {
        return true;
      }
      return current;
    }),
  );
  const props = [
    ...scene.props,
    ...fallback.props.filter(
      (entry) =>
        RIGHT_WING_PROP_IDS.has(entry.id) &&
        !scene.props.some((current) => current.id === entry.id),
    ),
  ];
  const autotiles = [
    ...scene.autotiles,
    ...fallback.autotiles.filter(
      (entry) =>
        RIGHT_WING_AUTOTILE_IDS.has(entry.id) &&
        !scene.autotiles.some((current) => current.id === entry.id),
    ),
  ];
  const markers = [
    ...scene.markers,
    ...fallback.markers.filter(
      (entry) =>
        RIGHT_WING_MARKER_IDS.has(entry.id) &&
        !scene.markers.some((current) => current.id === entry.id),
    ),
  ];
  return {
    version: 1,
    zoneRows,
    wallRows,
    props,
    autotiles,
    markers,
  };
}

function inferSanitizedSceneDimensions(
  record: Record<string, unknown>,
  fallback: MauOfficeSceneConfig,
) {
  const zoneRowInputs = Array.isArray(record.zoneRows) ? record.zoneRows : [];
  const wallRowInputs = Array.isArray(record.wallRows) ? record.wallRows : [];
  const hasExplicitRows = zoneRowInputs.length > 0 || wallRowInputs.length > 0;
  const inferredHeight = hasExplicitRows
    ? Math.max(zoneRowInputs.length, wallRowInputs.length)
    : fallback.zoneRows.length;
  const inferredWidth = hasExplicitRows
    ? Math.max(
        ...zoneRowInputs.map((row) => (Array.isArray(row) ? row.length : 0)),
        ...wallRowInputs.map((row) => (Array.isArray(row) ? row.length : 0)),
        0,
      )
    : getMauOfficeSceneTileWidth(fallback);
  return {
    width: clampSceneTileDimension(
      inferredWidth,
      MAU_OFFICE_SCENE_MIN_TILES_W,
      MAU_OFFICE_SCENE_MAX_TILES_W,
    ),
    height: clampSceneTileDimension(
      inferredHeight,
      MAU_OFFICE_SCENE_MIN_TILES_H,
      MAU_OFFICE_SCENE_MAX_TILES_H,
    ),
  };
}

function sanitizeScenePropPlacements(
  props: MauOfficeScenePropPlacement[],
  width: number,
  height: number,
): MauOfficeScenePropPlacement[] {
  return props.map((entry) => {
    const item = MAU_OFFICE_CATALOG[entry.itemId];
    const spanX = Math.max(1, Math.ceil(item?.tileWidth ?? 1));
    const spanY = Math.max(1, Math.ceil(item?.tileHeight ?? 1));
    const maxTileX = Math.max(0, width - spanX);
    const maxTileY = Math.max(0, height - spanY);
    return {
      ...entry,
      tileX: typeof entry.tileX === "number" ? Math.max(0, Math.min(maxTileX, entry.tileX)) : 0,
      tileY: typeof entry.tileY === "number" ? Math.max(0, Math.min(maxTileY, entry.tileY)) : 0,
    };
  });
}

function sanitizeSceneAutotilePlacements(
  autotiles: MauOfficeSceneAutotilePlacement[],
  width: number,
  height: number,
): MauOfficeSceneAutotilePlacement[] {
  return autotiles
    .map((entry) => ({
      ...entry,
      cells: entry.cells
        .map((cell) => ({
          tileX: Math.round(cell.tileX),
          tileY: Math.round(cell.tileY),
        }))
        .filter(
          (cell) => cell.tileX >= 0 && cell.tileX < width && cell.tileY >= 0 && cell.tileY < height,
        ),
    }))
    .filter((entry) => entry.cells.length > 0);
}

function sanitizeSceneMarkers(
  markers: MauOfficeSceneMarker[],
  rows: MauOfficeZoneId[][],
  wallRows: boolean[][],
  width: number,
  height: number,
): MauOfficeSceneMarker[] {
  return markers.map((entry) => {
    const tileX = Math.max(0, Math.min(width - 1, Math.round(entry.tileX)));
    if (markerRoleNeedsOutsideTile(entry.role)) {
      const roundedTileY = Math.round(entry.tileY);
      const isAlreadyOutside =
        roundedTileY < 0 ||
        roundedTileY >= height ||
        zoneAt(rows, tileX, roundedTileY) === "outside";
      return {
        ...entry,
        tileX,
        tileY: isAlreadyOutside ? roundedTileY : height,
      };
    }
    const resolved = resolveNearestMarkerTile(
      rows,
      wallRows,
      tileX,
      Math.max(0, Math.min(height - 1, Math.round(entry.tileY))),
    );
    return {
      ...entry,
      tileX: resolved.tileX,
      tileY: resolved.tileY,
    };
  });
}

export function sanitizeMauOfficeSceneConfig(input: unknown): MauOfficeSceneConfig {
  const fallback = createDefaultMauOfficeSceneConfig();
  if (!input || typeof input !== "object") {
    return fallback;
  }
  const record = input as Record<string, unknown>;
  const dimensions = inferSanitizedSceneDimensions(record, fallback);
  const rows = Array.isArray(record.zoneRows)
    ? record.zoneRows.map((row) =>
        Array.isArray(row)
          ? row.map((value) => (isZoneId(value) ? value : "outside"))
          : Array.from({ length: dimensions.width }, () => "outside" as MauOfficeZoneId),
      )
    : fallback.zoneRows;
  const normalizedRows = Array.from({ length: dimensions.height }, (_, rowIndex) =>
    Array.from(
      { length: dimensions.width },
      (_, colIndex) => rows[rowIndex]?.[colIndex] ?? "outside",
    ),
  );
  const props = Array.isArray(record.props)
    ? record.props
        .map((entry) => entry as Record<string, unknown>)
        .filter((entry) => typeof entry?.id === "string" && typeof entry?.itemId === "string")
        .map((entry) => {
          const id = entry.id as string;
          const itemId = entry.itemId as string;
          return {
            id,
            itemId,
            tileX: typeof entry.tileX === "number" ? entry.tileX : 0,
            tileY: typeof entry.tileY === "number" ? entry.tileY : 0,
            zoneId: isRoomId(entry.zoneId) ? entry.zoneId : undefined,
            mirrored: entry.mirrored === true,
            mountOverride:
              entry.mountOverride === "floor" ||
              entry.mountOverride === "wall" ||
              entry.mountOverride === "underlay"
                ? entry.mountOverride
                : undefined,
            zOffsetOverride:
              typeof entry.zOffsetOverride === "number" ? entry.zOffsetOverride : undefined,
            collisionOverride:
              typeof entry.collisionOverride === "boolean" ? entry.collisionOverride : undefined,
            loopId: typeof entry.loopId === "string" ? entry.loopId : undefined,
          } satisfies MauOfficeScenePropPlacement;
        })
    : fallback.props;
  const autotiles = Array.isArray(record.autotiles)
    ? record.autotiles
        .map((entry) => entry as Record<string, unknown>)
        .filter((entry) => typeof entry?.id === "string" && typeof entry?.itemId === "string")
        .map((entry) => {
          const id = entry.id as string;
          const itemId = entry.itemId as string;
          return {
            id,
            itemId,
            cells: Array.isArray(entry.cells)
              ? entry.cells
                  .map((cell) => cell as Record<string, unknown>)
                  .filter(
                    (cell) => typeof cell.tileX === "number" && typeof cell.tileY === "number",
                  )
                  .map((cell) => ({ tileX: cell.tileX as number, tileY: cell.tileY as number }))
              : [],
            mountOverride:
              entry.mountOverride === "floor" ||
              entry.mountOverride === "wall" ||
              entry.mountOverride === "underlay"
                ? entry.mountOverride
                : undefined,
            zOffsetOverride:
              typeof entry.zOffsetOverride === "number" ? entry.zOffsetOverride : undefined,
            collisionOverride:
              typeof entry.collisionOverride === "boolean" ? entry.collisionOverride : undefined,
            loopId: typeof entry.loopId === "string" ? entry.loopId : undefined,
          } satisfies MauOfficeSceneAutotilePlacement;
        })
    : fallback.autotiles;
  const markers = Array.isArray(record.markers)
    ? record.markers
        .map((entry) => entry as Record<string, unknown>)
        .filter((entry) => typeof entry.id === "string" && typeof entry.role === "string")
        .map((entry) => {
          const id = entry.id as string;
          return {
            id,
            role: entry.role as MauOfficeMarkerRole,
            tileX: typeof entry.tileX === "number" ? entry.tileX : 0,
            tileY: typeof entry.tileY === "number" ? entry.tileY : 0,
            pose: entry.pose === "sit" ? "sit" : "stand",
            layer: typeof entry.layer === "number" ? entry.layer : 0,
            facingOverride:
              entry.facingOverride === "north" ||
              entry.facingOverride === "east" ||
              entry.facingOverride === "south" ||
              entry.facingOverride === "west"
                ? entry.facingOverride
                : undefined,
            footprintTiles:
              entry.footprintTiles &&
              typeof entry.footprintTiles === "object" &&
              typeof (entry.footprintTiles as Record<string, unknown>).width === "number" &&
              typeof (entry.footprintTiles as Record<string, unknown>).height === "number"
                ? {
                    width: (entry.footprintTiles as Record<string, number>).width,
                    height: (entry.footprintTiles as Record<string, number>).height,
                  }
                : undefined,
          } satisfies MauOfficeSceneMarker;
        })
    : fallback.markers;
  const wallRows = Array.isArray(record.wallRows)
    ? record.wallRows.map((row) =>
        Array.isArray(row)
          ? row.map((value) => value === true)
          : Array.from({ length: dimensions.width }, () => false),
      )
    : deriveLegacyWallRows(normalizedRows, markers);
  const normalizedWallRows = Array.from({ length: dimensions.height }, (_, rowIndex) =>
    Array.from({ length: dimensions.width }, (_, colIndex) => wallRows[rowIndex]?.[colIndex]),
  );
  const sanitized = {
    version: 1 as const,
    zoneRows: normalizedRows,
    wallRows: normalizedWallRows,
    props: sanitizeScenePropPlacements(props, dimensions.width, dimensions.height),
    autotiles: sanitizeSceneAutotilePlacements(autotiles, dimensions.width, dimensions.height),
    markers: sanitizeSceneMarkers(
      markers,
      normalizedRows,
      normalizedWallRows,
      dimensions.width,
      dimensions.height,
    ),
  };
  const upgraded = upgradeLegacySceneRightWing(sanitized, fallback);
  if (upgraded === sanitized) {
    return sanitized;
  }
  const upgradedWidth = getMauOfficeSceneTileWidth(upgraded);
  const upgradedHeight = getMauOfficeSceneTileHeight(upgraded);
  return {
    version: 1 as const,
    zoneRows: upgraded.zoneRows,
    wallRows: upgraded.wallRows,
    props: sanitizeScenePropPlacements(upgraded.props, upgradedWidth, upgradedHeight),
    autotiles: sanitizeSceneAutotilePlacements(upgraded.autotiles, upgradedWidth, upgradedHeight),
    markers: sanitizeSceneMarkers(
      upgraded.markers,
      upgraded.zoneRows,
      upgraded.wallRows,
      upgradedWidth,
      upgradedHeight,
    ),
  };
}

export function resolveMauOfficeSceneConfigFromRoot(source: unknown): MauOfficeSceneConfig {
  if (!source || typeof source !== "object") {
    return createDefaultMauOfficeSceneConfig();
  }
  const root = source as Record<string, unknown>;
  const ui = root.ui && typeof root.ui === "object" ? (root.ui as Record<string, unknown>) : null;
  return sanitizeMauOfficeSceneConfig(
    ui?.mauOffice && typeof ui.mauOffice === "object"
      ? (ui.mauOffice as Record<string, unknown>).scene
      : null,
  );
}

export function sceneMarkerIdsForRole(
  scene: CompiledMauOfficeScene,
  role: MauOfficeMarkerRole,
): string[] {
  return scene.markerIdsByRole[role] ?? [];
}

export function sceneMarkerIdAt(
  scene: CompiledMauOfficeScene,
  role: MauOfficeMarkerRole,
  index = 0,
): string | null {
  return sceneMarkerIdsForRole(scene, role)[index] ?? null;
}

export function sceneMarkerRoleForId(
  scene: CompiledMauOfficeScene,
  anchorId: string,
): MauOfficeMarkerRole | null {
  return scene.markerRoleById[anchorId] ?? null;
}

export function sceneBreakAnchorIds(scene: CompiledMauOfficeScene): string[] {
  return BREAK_ROOM_FLEX_ROLES.flatMap((role) => sceneMarkerIdsForRole(scene, role));
}

export function sceneIdlePackageSlotAnchorIds(
  scene: CompiledMauOfficeScene,
  packageId: string,
): string[] {
  switch (packageId) {
    case "passing_ball_court":
      return sceneMarkerIdsForRole(scene, "break.volley");
    case "chess_table":
      return sceneMarkerIdsForRole(scene, "break.tableSeat");
    case "chasing_loop":
      return sceneMarkerIdsForRole(scene, "break.chase");
    case "arcade_corner":
      return sceneMarkerIdsForRole(scene, "break.arcade").slice(0, 1);
    case "foosball_side_1":
      return sceneMarkerIdsForRole(scene, "break.game").slice(0, 1);
    case "foosball_side_2":
      return sceneMarkerIdsForRole(scene, "break.game").slice(1, 2);
    case "foosball_side_3":
      return sceneMarkerIdsForRole(scene, "break.game").slice(2, 3);
    case "foosball_side_4":
      return sceneMarkerIdsForRole(scene, "break.game").slice(3, 4);
    case "jukebox_floor":
      return sceneMarkerIdsForRole(scene, "break.jukebox").slice(0, 1);
    case "reading_nook":
      return sceneMarkerIdsForRole(scene, "break.reading").slice(0, 1);
    default:
      return [];
  }
}

export function defaultIdleHomeAnchorIds(scene: CompiledMauOfficeScene): string[] {
  return [
    ...sceneMarkerIdsForRole(scene, "break.arcade"),
    ...sceneMarkerIdsForRole(scene, "break.tableSeat"),
    ...sceneMarkerIdsForRole(scene, "break.game").slice(0, 2),
    ...sceneMarkerIdsForRole(scene, "break.snack"),
    ...sceneMarkerIdsForRole(scene, "break.jukebox"),
    ...sceneMarkerIdsForRole(scene, "break.reading"),
  ];
}

let activeMauOfficeScene = compileMauOfficeScene(createDefaultMauOfficeSceneConfig());

export function getActiveMauOfficeScene(): CompiledMauOfficeScene {
  return activeMauOfficeScene;
}

export function setActiveMauOfficeScene(scene: CompiledMauOfficeScene) {
  activeMauOfficeScene = scene;
}

export function resetActiveMauOfficeSceneForTests() {
  activeMauOfficeScene = compileMauOfficeScene(createDefaultMauOfficeSceneConfig());
}
