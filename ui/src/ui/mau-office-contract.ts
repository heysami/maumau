import {
  MAU_OFFICE_ASSET_SCALE_SPECS,
  MAU_OFFICE_LOGICAL_TILE_PX,
  resolveMauOfficeAssetScaleSpec,
  MAU_OFFICE_SOURCE_SUBGRID_PX,
  MAU_OFFICE_SOURCE_TILE_PX,
  MAU_OFFICE_SOURCE_TO_LOGICAL_SCALE,
  MAU_OFFICE_WORKER_RENDER_METRICS,
  sourcePxToLogicalPx,
} from "./mau-office-scale-spec.ts";

const MAU_OFFICE_ASSET_ROOT = "mau-office";

export {
  MAU_OFFICE_ASSET_SCALE_SPECS,
  MAU_OFFICE_SOURCE_SUBGRID_PX,
  MAU_OFFICE_SOURCE_TO_LOGICAL_SCALE,
  MAU_OFFICE_WORKER_RENDER_METRICS,
  resolveMauOfficeAssetScaleSpec,
  sourcePxToLogicalPx,
};

export const MAU_OFFICE_TILE_SIZE = MAU_OFFICE_LOGICAL_TILE_PX;
export const MAU_OFFICE_ASSET_PIXELS_PER_TILE = MAU_OFFICE_SOURCE_TILE_PX;
export const MAU_OFFICE_SCENE_TILES_W = 40;
export const MAU_OFFICE_SCENE_TILES_H = 20;
export const MAU_OFFICE_SCENE_WIDTH = MAU_OFFICE_SCENE_TILES_W * MAU_OFFICE_TILE_SIZE;
export const MAU_OFFICE_SCENE_HEIGHT = MAU_OFFICE_SCENE_TILES_H * MAU_OFFICE_TILE_SIZE;
export const MAU_OFFICE_FOOT_OFFSET_Y = 56;
export const MAU_OFFICE_FOCUS_PADDING_TILES = 1;

export type MauOfficeRoomId = "desk" | "meeting" | "break" | "support" | "browser" | "telephony";
export type MauOfficeDirection = "north" | "east" | "south" | "west";
export type MauOfficePathTurnKey = "ne" | "nw" | "se" | "sw";
export type OfficeActorKind = "worker" | "visitor";
export type MauOfficeWorkerRigId = "bird" | "cat" | "deer" | "dog" | "human";
export type MauOfficeActivityKind =
  | "customer_support"
  | "desk_work"
  | "idle"
  | "idle_package"
  | "meeting"
  | "offsite"
  | "walking"
  | "whiteboard_update";

export type MauOfficeAnchorPose = "stand" | "sit";
export type MauOfficeAreaId = MauOfficeRoomId | "hall" | "outside";
export type MauOfficeSpriteLayer = "floor" | "wall" | "prop" | "path" | "ui";
export type MauOfficeLabelTone = "blue" | "gold" | "green" | "purple";
export type MauOfficeSpriteMount = "floor" | "wall" | "underlay";

export type MauOfficeFootprintTiles = {
  width: number;
  height: number;
};

export type MauOfficeUiConfig = {
  enabled: boolean;
  maxVisibleWorkers: number;
  idlePackages: {
    enabled: string[];
  };
};

export type IdlePackageActivityDefinition = {
  id: string;
  label: string;
  slotLayout: string[];
  bubbleTemplates: string[];
};

export type IdlePackageDefinition = {
  id: string;
  label: string;
  cooldownMs: number;
  activityDefinitions: IdlePackageActivityDefinition[];
};

export type MauOfficeNode = {
  id: string;
  tileX: number;
  tileY: number;
  x: number;
  y: number;
  roomId: MauOfficeAreaId;
  neighbors: string[];
};

export type MauOfficeAnchor = {
  id: string;
  tileX: number;
  tileY: number;
  x: number;
  y: number;
  roomId: MauOfficeRoomId | "outside";
  nodeId: string;
  pose: MauOfficeAnchorPose;
  layer: number;
  footprintTiles: MauOfficeFootprintTiles;
  facingOverride?: MauOfficeDirection;
};

export type MauOfficeRoom = {
  id: MauOfficeRoomId;
  label: string;
  doorLabel: string;
  signTone: MauOfficeLabelTone;
  tileX: number;
  tileY: number;
  tileWidth: number;
  tileHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MauOfficeTilePlacement = {
  id: string;
  asset: string;
  tileX: number;
  tileY: number;
  layer: MauOfficeSpriteLayer;
  roomId: MauOfficeAreaId;
};

export type MauOfficeSpritePlacement = {
  id: string;
  asset: string;
  tileX: number;
  tileY: number;
  tileWidth: number;
  tileHeight: number;
  layer: MauOfficeSpriteLayer;
  roomId: MauOfficeAreaId;
  anchor?: "top-left" | "bottom-center";
  mirrored?: boolean;
  zOffset?: number;
  mount?: MauOfficeSpriteMount;
  blocksWalkway?: boolean;
  collisionFootprintTiles?: MauOfficeFootprintTiles;
  sourceId?: string;
  animation?: {
    loopId: string;
    fps: number;
    frames: string[];
  };
  overlayLabel?: {
    text: string;
    tone: MauOfficeLabelTone;
  };
  kind:
    | "accessory"
    | "arcade"
    | "bench"
    | "board"
    | "chair"
    | "counter"
    | "desk"
    | "door"
    | "foosball"
    | "plant"
    | "rail"
    | "shelf"
    | "table"
    | "wall";
};

export type MauOfficeLabelPlacement = {
  id: string;
  kind: "door" | "room";
  roomId: MauOfficeRoomId;
  label: string;
  tone: MauOfficeLabelTone;
  tileX: number;
  tileY: number;
  tileWidth: number;
  tileHeight: number;
  asset: string;
};

export type WorkerRigAnimation = {
  fps: number;
  frames: string[];
};

export const MAU_OFFICE_DIRECTIONAL_WORKER_ANIMATION_IDS = [
  "stand",
  "sit",
  "walk",
  "reach",
  "dance",
  "jump",
  "chase",
  "chat",
] as const;

export const MAU_OFFICE_WORKER_ANIMATION_IDS = [
  ...MAU_OFFICE_DIRECTIONAL_WORKER_ANIMATION_IDS,
  "sleep-floor",
] as const;

export type MauOfficeDirectionalWorkerAnimationId =
  (typeof MAU_OFFICE_DIRECTIONAL_WORKER_ANIMATION_IDS)[number];
export type MauOfficeWorkerAnimationId = (typeof MAU_OFFICE_WORKER_ANIMATION_IDS)[number];

export type WorkerRigDefinition = {
  stand: Record<MauOfficeDirection, WorkerRigAnimation>;
  sit: Record<MauOfficeDirection, WorkerRigAnimation>;
  walk: Record<MauOfficeDirection, WorkerRigAnimation>;
  reach: Record<MauOfficeDirection, WorkerRigAnimation>;
  dance: Record<MauOfficeDirection, WorkerRigAnimation>;
  jump: Record<MauOfficeDirection, WorkerRigAnimation>;
  chase: Record<MauOfficeDirection, WorkerRigAnimation>;
  chat: Record<MauOfficeDirection, WorkerRigAnimation>;
  sleepFloor: WorkerRigAnimation;
};

export type WorkerRigRegistry = Record<MauOfficeWorkerRigId, WorkerRigDefinition>;

const MAU_OFFICE_HALL_VERTICAL_TILE_X = 15;
const MAU_OFFICE_HALL_VERTICAL_WIDTH_TILES = 1;
const MAU_OFFICE_HALL_HORIZONTAL_TILE_Y = 10;
const MAU_OFFICE_HALL_HORIZONTAL_HEIGHT_TILES = 1;
const MAU_OFFICE_LEFT_ROOM_JUNCTION_TILE_X = 8;
const MAU_OFFICE_RIGHT_ROOM_JUNCTION_TILE_X = 20;
const MAU_OFFICE_EXTENSION_ROOM_JUNCTION_TILE_X = 31;
const MAU_OFFICE_RIGHT_ROOM_TILE_X =
  MAU_OFFICE_HALL_VERTICAL_TILE_X + MAU_OFFICE_HALL_VERTICAL_WIDTH_TILES;
const MAU_OFFICE_EXTENSION_ROOM_TILE_X = 26;
const MAU_OFFICE_TOP_PASSAGE_LEFT_TILE_X = MAU_OFFICE_RIGHT_ROOM_TILE_X - 1;
const MAU_OFFICE_TOP_PASSAGE_RIGHT_TILE_X = MAU_OFFICE_RIGHT_ROOM_TILE_X;
const MAU_OFFICE_TOP_PASSAGE_TILE_Y = 6;
const MAU_OFFICE_TOP_ROOM_HEIGHT_TILES = 9;
const MAU_OFFICE_BOTTOM_ROOM_TILE_Y =
  MAU_OFFICE_HALL_HORIZONTAL_TILE_Y + MAU_OFFICE_HALL_HORIZONTAL_HEIGHT_TILES;
const MAU_OFFICE_BOTTOM_ROOM_HEIGHT_TILES = 9;
const MAU_OFFICE_BOTTOM_LEFT_ROOM_WIDTH_TILES = 15;
const MAU_OFFICE_RIGHT_ROOM_WIDTH_TILES = 9;
const MAU_OFFICE_EXTENSION_ROOM_WIDTH_TILES = 11;
const MAU_OFFICE_FRONT_WALL_HEIGHT_TILES = 3;

function tileToPixel(tile: number): number {
  return tile * MAU_OFFICE_TILE_SIZE;
}

function tileCenterX(tileX: number): number {
  return tileToPixel(tileX) + MAU_OFFICE_TILE_SIZE / 2;
}

function tileFootY(tileY: number): number {
  return tileToPixel(tileY) + MAU_OFFICE_FOOT_OFFSET_Y;
}

function makeRoom(params: {
  id: MauOfficeRoomId;
  label: string;
  doorLabel: string;
  signTone: MauOfficeLabelTone;
  tileX: number;
  tileY: number;
  tileWidth: number;
  tileHeight: number;
}): MauOfficeRoom {
  return {
    ...params,
    x: tileToPixel(params.tileX),
    y: tileToPixel(params.tileY),
    width: params.tileWidth * MAU_OFFICE_TILE_SIZE,
    height: params.tileHeight * MAU_OFFICE_TILE_SIZE,
  };
}

function makeNode(
  id: string,
  tileX: number,
  tileY: number,
  roomId: MauOfficeAreaId,
  neighbors: string[],
): MauOfficeNode {
  return {
    id,
    tileX,
    tileY,
    x: tileCenterX(tileX),
    y: tileFootY(tileY),
    roomId,
    neighbors,
  };
}

function makeAnchor(params: {
  id: string;
  tileX: number;
  tileY: number;
  roomId: MauOfficeRoomId | "outside";
  nodeId: string;
  pose: MauOfficeAnchorPose;
  layer: number;
  footprintTiles?: MauOfficeFootprintTiles;
  facingOverride?: MauOfficeDirection;
}): MauOfficeAnchor {
  return {
    ...params,
    x: tileCenterX(params.tileX),
    y: tileFootY(params.tileY),
    footprintTiles: params.footprintTiles ?? { width: 1, height: 1 },
  };
}

function joinAsset(path: string): string {
  return `${MAU_OFFICE_ASSET_ROOT}/${path}`;
}

const ROOM_FLOOR_VARIANTS = [
  joinAsset("tiles/floor-room-a.png"),
  joinAsset("tiles/floor-room-b.png"),
  joinAsset("tiles/floor-room-c.png"),
  joinAsset("tiles/floor-room-d.png"),
];

const HALL_FLOOR_VARIANTS = [
  joinAsset("tiles/floor-hall-a.png"),
  joinAsset("tiles/floor-hall-b.png"),
];

export const MAU_OFFICE_ROOMS = {
  desk: makeRoom({
    id: "desk",
    label: "MauApps",
    doorLabel: "Desk",
    signTone: "blue",
    tileX: 1,
    tileY: 1,
    tileWidth: MAU_OFFICE_BOTTOM_LEFT_ROOM_WIDTH_TILES,
    tileHeight: MAU_OFFICE_TOP_ROOM_HEIGHT_TILES,
  }),
  meeting: makeRoom({
    id: "meeting",
    label: "MauHome",
    doorLabel: "Meeting",
    signTone: "green",
    tileX: MAU_OFFICE_RIGHT_ROOM_TILE_X,
    tileY: 1,
    tileWidth: MAU_OFFICE_RIGHT_ROOM_WIDTH_TILES,
    tileHeight: MAU_OFFICE_TOP_ROOM_HEIGHT_TILES,
  }),
  break: makeRoom({
    id: "break",
    label: "MauBreak",
    doorLabel: "Break",
    signTone: "purple",
    tileX: 1,
    tileY: MAU_OFFICE_BOTTOM_ROOM_TILE_Y,
    tileWidth: MAU_OFFICE_BOTTOM_LEFT_ROOM_WIDTH_TILES,
    tileHeight: MAU_OFFICE_BOTTOM_ROOM_HEIGHT_TILES,
  }),
  support: makeRoom({
    id: "support",
    label: "MauWorld",
    doorLabel: "Support",
    signTone: "gold",
    tileX: MAU_OFFICE_RIGHT_ROOM_TILE_X,
    tileY: MAU_OFFICE_BOTTOM_ROOM_TILE_Y,
    tileWidth: MAU_OFFICE_RIGHT_ROOM_WIDTH_TILES,
    tileHeight: MAU_OFFICE_BOTTOM_ROOM_HEIGHT_TILES,
  }),
  browser: makeRoom({
    id: "browser",
    label: "MauBrowse",
    doorLabel: "Browser",
    signTone: "blue",
    tileX: MAU_OFFICE_EXTENSION_ROOM_TILE_X,
    tileY: 1,
    tileWidth: MAU_OFFICE_EXTENSION_ROOM_WIDTH_TILES,
    tileHeight: MAU_OFFICE_TOP_ROOM_HEIGHT_TILES,
  }),
  telephony: makeRoom({
    id: "telephony",
    label: "MauCall",
    doorLabel: "Telephony",
    signTone: "gold",
    tileX: MAU_OFFICE_EXTENSION_ROOM_TILE_X,
    tileY: MAU_OFFICE_BOTTOM_ROOM_TILE_Y,
    tileWidth: MAU_OFFICE_EXTENSION_ROOM_WIDTH_TILES,
    tileHeight: MAU_OFFICE_BOTTOM_ROOM_HEIGHT_TILES,
  }),
} satisfies Record<MauOfficeRoomId, MauOfficeRoom>;

function roomContains(room: MauOfficeRoom, tileX: number, tileY: number): boolean {
  return (
    tileX >= room.tileX &&
    tileX < room.tileX + room.tileWidth &&
    tileY >= room.tileY &&
    tileY < room.tileY + room.tileHeight
  );
}

function isRoomThresholdTile(tileX: number, tileY: number): boolean {
  return (
    (tileX === MAU_OFFICE_LEFT_ROOM_JUNCTION_TILE_X &&
      tileY === MAU_OFFICE_ROOMS.desk.tileY + MAU_OFFICE_ROOMS.desk.tileHeight - 1) ||
    (tileX === MAU_OFFICE_LEFT_ROOM_JUNCTION_TILE_X && tileY === MAU_OFFICE_ROOMS.break.tileY) ||
    (tileX === MAU_OFFICE_RIGHT_ROOM_JUNCTION_TILE_X && tileY === MAU_OFFICE_ROOMS.support.tileY) ||
    (tileX === MAU_OFFICE_EXTENSION_ROOM_JUNCTION_TILE_X &&
      tileY === MAU_OFFICE_ROOMS.browser.tileY + MAU_OFFICE_ROOMS.browser.tileHeight - 1) ||
    (tileX === MAU_OFFICE_EXTENSION_ROOM_JUNCTION_TILE_X &&
      tileY === MAU_OFFICE_ROOMS.telephony.tileY)
  );
}

function isTopRoomPassageTile(tileX: number, tileY: number): boolean {
  return (
    tileY === MAU_OFFICE_TOP_PASSAGE_TILE_Y &&
    (tileX === MAU_OFFICE_TOP_PASSAGE_LEFT_TILE_X || tileX === MAU_OFFICE_TOP_PASSAGE_RIGHT_TILE_X)
  );
}

function isHallTile(tileX: number, tileY: number): boolean {
  const inHorizontalSpine =
    tileY >= MAU_OFFICE_HALL_HORIZONTAL_TILE_Y &&
    tileY < MAU_OFFICE_HALL_HORIZONTAL_TILE_Y + MAU_OFFICE_HALL_HORIZONTAL_HEIGHT_TILES &&
    tileX >= MAU_OFFICE_LEFT_ROOM_JUNCTION_TILE_X &&
    tileX <= MAU_OFFICE_EXTENSION_ROOM_JUNCTION_TILE_X;
  return (
    inHorizontalSpine || isRoomThresholdTile(tileX, tileY) || isTopRoomPassageTile(tileX, tileY)
  );
}

function classifyFloorTile(tileX: number, tileY: number): MauOfficeAreaId {
  if (isHallTile(tileX, tileY)) {
    return "hall";
  }
  for (const room of Object.values(MAU_OFFICE_ROOMS)) {
    if (roomContains(room, tileX, tileY)) {
      return room.id;
    }
  }
  return "outside";
}

function makeFloorTiles(): MauOfficeTilePlacement[] {
  const tiles: MauOfficeTilePlacement[] = [];
  for (let tileY = 1; tileY <= MAU_OFFICE_SCENE_TILES_H - 1; tileY += 1) {
    for (let tileX = 1; tileX <= MAU_OFFICE_SCENE_TILES_W - 2; tileX += 1) {
      const roomId = classifyFloorTile(tileX, tileY);
      if (roomId === "outside") {
        continue;
      }
      tiles.push({
        id: `tile:${tileX}:${tileY}`,
        asset:
          roomId === "hall"
            ? HALL_FLOOR_VARIANTS[(tileX + tileY) % HALL_FLOOR_VARIANTS.length]!
            : ROOM_FLOOR_VARIANTS[(tileX * 3 + tileY) % ROOM_FLOOR_VARIANTS.length]!,
        tileX,
        tileY,
        layer: "floor",
        roomId,
      });
    }
  }
  return tiles;
}

const MAU_OFFICE_SEATED_OCCLUDER_Z_OFFSET = 180;
const MAU_OFFICE_ACCESSORY_Z_OFFSET = 220;
const MAU_OFFICE_COUNTER_OCCLUDER_Z_OFFSET = 260;

type MauOfficeNineSliceAssets = {
  topLeft: string;
  topCenter: string;
  topRight: string;
  middleLeft: string;
  middleCenter: string;
  middleRight: string;
  bottomLeft: string;
  bottomCenter: string;
  bottomRight: string;
};

type MauOfficeHorizontalThreeSliceAssets = {
  left: string;
  center: string;
  right: string;
};

type MauOfficeSurfaceAccessoryPlacement = {
  id: string;
  asset: string;
  centerTileX: number;
  centerTileY: number;
  roomId: MauOfficeAreaId;
  zOffset?: number;
};

function addNineSlice(
  add: (sprite: MauOfficeSpritePlacement) => void,
  params: {
    idPrefix: string;
    roomId: MauOfficeAreaId;
    kind: MauOfficeSpritePlacement["kind"];
    layer: MauOfficeSpriteLayer;
    tileX: number;
    tileY: number;
    tileWidth: number;
    tileHeight: number;
    assets: MauOfficeNineSliceAssets;
    zOffset?: number;
  },
) {
  const centerWidth = Math.max(0, params.tileWidth - 2);
  const centerHeight = Math.max(0, params.tileHeight - 2);
  const addPart = (
    suffix: string,
    asset: string,
    tileX: number,
    tileY: number,
    tileWidth: number,
    tileHeight: number,
  ) => {
    if (tileWidth <= 0 || tileHeight <= 0) {
      return;
    }
    add({
      id: `${params.idPrefix}:${suffix}`,
      asset,
      tileX,
      tileY,
      tileWidth,
      tileHeight,
      layer: params.layer,
      roomId: params.roomId,
      kind: params.kind,
      zOffset: params.zOffset,
    });
  };

  addPart("top-left", params.assets.topLeft, params.tileX, params.tileY, 1, 1);
  addPart("top-center", params.assets.topCenter, params.tileX + 1, params.tileY, centerWidth, 1);
  addPart(
    "top-right",
    params.assets.topRight,
    params.tileX + params.tileWidth - 1,
    params.tileY,
    1,
    1,
  );
  addPart("middle-left", params.assets.middleLeft, params.tileX, params.tileY + 1, 1, centerHeight);
  addPart(
    "middle-center",
    params.assets.middleCenter,
    params.tileX + 1,
    params.tileY + 1,
    centerWidth,
    centerHeight,
  );
  addPart(
    "middle-right",
    params.assets.middleRight,
    params.tileX + params.tileWidth - 1,
    params.tileY + 1,
    1,
    centerHeight,
  );
  addPart(
    "bottom-left",
    params.assets.bottomLeft,
    params.tileX,
    params.tileY + params.tileHeight - 1,
    1,
    1,
  );
  addPart(
    "bottom-center",
    params.assets.bottomCenter,
    params.tileX + 1,
    params.tileY + params.tileHeight - 1,
    centerWidth,
    1,
  );
  addPart(
    "bottom-right",
    params.assets.bottomRight,
    params.tileX + params.tileWidth - 1,
    params.tileY + params.tileHeight - 1,
    1,
    1,
  );
}

function addCounterWithCaps(
  add: (sprite: MauOfficeSpritePlacement) => void,
  params: {
    idPrefix: string;
    roomId: MauOfficeAreaId;
    kind: MauOfficeSpritePlacement["kind"];
    layer: MauOfficeSpriteLayer;
    tileX: number;
    tileY: number;
    tileWidth: number;
    tileHeight: number;
    capTileWidth: number;
    assets: MauOfficeHorizontalThreeSliceAssets;
    zOffset?: number;
  },
) {
  const centerWidth = Math.max(0, params.tileWidth - params.capTileWidth * 2);
  add({
    id: `${params.idPrefix}:left-cap`,
    asset: params.assets.left,
    tileX: params.tileX,
    tileY: params.tileY,
    tileWidth: params.capTileWidth,
    tileHeight: params.tileHeight,
    layer: params.layer,
    roomId: params.roomId,
    kind: params.kind,
    zOffset: params.zOffset,
  });
  if (centerWidth > 0) {
    add({
      id: `${params.idPrefix}:center`,
      asset: params.assets.center,
      tileX: params.tileX + params.capTileWidth,
      tileY: params.tileY,
      tileWidth: centerWidth,
      tileHeight: params.tileHeight,
      layer: params.layer,
      roomId: params.roomId,
      kind: params.kind,
      zOffset: params.zOffset,
    });
  }
  add({
    id: `${params.idPrefix}:right-cap`,
    asset: params.assets.right,
    tileX: params.tileX + params.tileWidth - params.capTileWidth,
    tileY: params.tileY,
    tileWidth: params.capTileWidth,
    tileHeight: params.tileHeight,
    layer: params.layer,
    roomId: params.roomId,
    kind: params.kind,
    zOffset: params.zOffset,
  });
}

const TOP_WALL_DOOR_TILE_X: Partial<Record<MauOfficeRoomId, number>> = {
  break: 8,
  support: 20,
  telephony: 31,
};

function resolveTopWallPropTileX(
  roomId: MauOfficeRoomId,
  preferredTileX: number,
  tileWidth: number,
): number {
  const doorTileX = TOP_WALL_DOOR_TILE_X[roomId];
  if (doorTileX === undefined) {
    return preferredTileX;
  }
  const overlapsDoorColumn = preferredTileX <= doorTileX && preferredTileX + tileWidth > doorTileX;
  if (!overlapsDoorColumn) {
    return preferredTileX;
  }
  const room = MAU_OFFICE_ROOMS[roomId];
  return Math.min(doorTileX + 2, room.tileX + room.tileWidth - tileWidth);
}

function resolveTopWallPropTileY(roomId: MauOfficeRoomId, tileHeight: number): number {
  const room = MAU_OFFICE_ROOMS[roomId];
  return room.tileY + Math.max(0, (MAU_OFFICE_FRONT_WALL_HEIGHT_TILES - tileHeight) / 2);
}

function resolveCenteredTileX(roomId: MauOfficeRoomId, tileWidth: number): number {
  const room = MAU_OFFICE_ROOMS[roomId];
  return room.tileX + (room.tileWidth - tileWidth) / 2;
}

const MAU_OFFICE_DESK_CLUSTER_WIDTH_TILES = 11;

function resolveDeskClusterTileX(): number {
  return resolveCenteredTileX("desk", MAU_OFFICE_DESK_CLUSTER_WIDTH_TILES);
}

function makeWallSprites(): MauOfficeSpritePlacement[] {
  const sprites: MauOfficeSpritePlacement[] = [];
  const addRoomShell = (room: MauOfficeRoom, doorTileX: number, doorOnTop: boolean) => {
    const frontWallHeightTiles = MAU_OFFICE_FRONT_WALL_HEIGHT_TILES;
    const topOpenings = new Set<number>(doorOnTop ? [doorTileX] : []);
    const bottomOpenings = new Set<number>();
    if (!doorOnTop && room.id !== "meeting") {
      bottomOpenings.add(doorTileX);
    }
    if (room.id === "break") {
      // The break room is the single office entrance, so it stays open to the hall above
      // and to the outside below.
      topOpenings.add(MAU_OFFICE_LEFT_ROOM_JUNCTION_TILE_X);
      bottomOpenings.add(MAU_OFFICE_LEFT_ROOM_JUNCTION_TILE_X);
    }
    if (room.id === "support") {
      bottomOpenings.add(MAU_OFFICE_RIGHT_ROOM_JUNCTION_TILE_X);
    }
    for (let tileX = room.tileX; tileX < room.tileX + room.tileWidth; tileX += 1) {
      if (topOpenings.has(tileX)) {
        continue;
      }
      const openingOnLeft = topOpenings.has(tileX - 1);
      const openingOnRight = topOpenings.has(tileX + 1);
      const variant =
        tileX === room.tileX
          ? "left"
          : tileX === room.tileX + room.tileWidth - 1
            ? "right"
            : openingOnLeft
              ? "left"
              : openingOnRight
                ? "right"
                : "mid";
      sprites.push({
        id: `${room.id}:wall-front:${tileX}`,
        asset: joinAsset(`tiles/wall-front-${variant}.png`),
        tileX,
        tileY: room.tileY,
        tileWidth: 1,
        tileHeight: frontWallHeightTiles,
        layer: "wall",
        roomId: room.id,
        kind: "wall",
      });
      if (!bottomOpenings.has(tileX)) {
        const bottomOpeningOnLeft = bottomOpenings.has(tileX - 1);
        const bottomOpeningOnRight = bottomOpenings.has(tileX + 1);
        const blockedHallCapOnLeft =
          room.id === "meeting" && tileX === MAU_OFFICE_RIGHT_ROOM_JUNCTION_TILE_X + 1;
        const bottomAsset = bottomOpeningOnLeft
          ? "tiles/wall-corner-bl.png"
          : bottomOpeningOnRight
            ? "tiles/wall-corner-br.png"
            : blockedHallCapOnLeft
              ? "tiles/wall-corner-bl.png"
              : "tiles/wall-bottom.png";
        sprites.push({
          id: `${room.id}:wall-bottom:${tileX}`,
          asset: joinAsset(bottomAsset),
          tileX,
          tileY: room.tileY + room.tileHeight - 1,
          tileWidth: 1,
          tileHeight: 1,
          layer: "wall",
          roomId: room.id,
          kind: "wall",
        });
      }
    }

    sprites.push(
      {
        id: `${room.id}:corner:bl`,
        asset: joinAsset("tiles/wall-corner-bl.png"),
        tileX: room.tileX,
        tileY: room.tileY + room.tileHeight - 1,
        tileWidth: 1,
        tileHeight: 1,
        layer: "wall",
        roomId: room.id,
        kind: "wall",
      },
      {
        id: `${room.id}:corner:br`,
        asset: joinAsset("tiles/wall-corner-br.png"),
        tileX: room.tileX + room.tileWidth - 1,
        tileY: room.tileY + room.tileHeight - 1,
        tileWidth: 1,
        tileHeight: 1,
        layer: "wall",
        roomId: room.id,
        kind: "wall",
      },
    );

    for (
      let tileY = room.tileY + frontWallHeightTiles;
      tileY < room.tileY + room.tileHeight - 1;
      tileY += 1
    ) {
      const meetingSidePassage = room.id === "meeting" && tileY === MAU_OFFICE_TOP_PASSAGE_TILE_Y;
      const deskSidePassage = room.id === "desk" && tileY === MAU_OFFICE_TOP_PASSAGE_TILE_Y;
      if (!meetingSidePassage) {
        sprites.push({
          id: `${room.id}:wall-left:${tileY}`,
          asset: joinAsset("tiles/wall-side-left.png"),
          tileX: room.tileX,
          tileY,
          tileWidth: 1,
          tileHeight: 1,
          layer: "wall",
          roomId: room.id,
          kind: "wall",
        });
      }
      if (!deskSidePassage) {
        sprites.push({
          id: `${room.id}:wall-right:${tileY}`,
          asset: joinAsset("tiles/wall-side-right.png"),
          tileX: room.tileX + room.tileWidth - 1,
          tileY,
          tileWidth: 1,
          tileHeight: 1,
          layer: "wall",
          roomId: room.id,
          kind: "wall",
        });
      }
    }
  };

  addRoomShell(MAU_OFFICE_ROOMS.desk, 8, false);
  addRoomShell(MAU_OFFICE_ROOMS.meeting, 20, false);
  addRoomShell(MAU_OFFICE_ROOMS.browser, 31, false);
  addRoomShell(MAU_OFFICE_ROOMS.break, 8, true);
  addRoomShell(MAU_OFFICE_ROOMS.support, 20, true);
  addRoomShell(MAU_OFFICE_ROOMS.telephony, 31, true);

  sprites.push({
    id: `hall-cap-left:${MAU_OFFICE_HALL_HORIZONTAL_TILE_Y}`,
    asset: joinAsset("tiles/hall-cap-left.png"),
    tileX: MAU_OFFICE_LEFT_ROOM_JUNCTION_TILE_X - 1,
    tileY: MAU_OFFICE_HALL_HORIZONTAL_TILE_Y,
    tileWidth: 1,
    tileHeight: 1,
    layer: "wall",
    roomId: "hall",
    kind: "wall",
  });

  sprites.push({
    id: `hall-cap-right:${MAU_OFFICE_HALL_HORIZONTAL_TILE_Y}`,
    asset: joinAsset("tiles/hall-cap-right.png"),
    tileX: MAU_OFFICE_EXTENSION_ROOM_JUNCTION_TILE_X + 1,
    tileY: MAU_OFFICE_HALL_HORIZONTAL_TILE_Y,
    tileWidth: 1,
    tileHeight: 1,
    layer: "wall",
    roomId: "hall",
    kind: "wall",
  });

  return sprites;
}

function makePropSprites(): MauOfficeSpritePlacement[] {
  const sprites: MauOfficeSpritePlacement[] = [];
  const add = (sprite: MauOfficeSpritePlacement) => sprites.push(sprite);
  const addSurfaceAccessory = ({
    id,
    asset,
    centerTileX,
    centerTileY,
    roomId,
    zOffset = MAU_OFFICE_ACCESSORY_Z_OFFSET,
  }: MauOfficeSurfaceAccessoryPlacement) => {
    add({
      id,
      asset: joinAsset(asset),
      tileX: centerTileX - 0.5,
      tileY: centerTileY - 0.5,
      tileWidth: 1,
      tileHeight: 1,
      layer: "prop",
      roomId,
      kind: "accessory",
      zOffset,
    });
  };

  add({
    id: "desk-kanban",
    asset: joinAsset("tiles/kanban-board.png"),
    tileX: 2,
    tileY: resolveTopWallPropTileY("desk", 2),
    tileWidth: 4,
    tileHeight: 2,
    layer: "prop",
    roomId: "desk",
    kind: "board",
  });
  add({
    id: "desk-roadmap",
    asset: joinAsset("tiles/desk-roadmap-board-v1.png"),
    tileX: 6,
    tileY: resolveTopWallPropTileY("desk", 2),
    tileWidth: 4,
    tileHeight: 2,
    layer: "prop",
    roomId: "desk",
    kind: "board",
  });
  add({
    id: "desk-calendar",
    asset: joinAsset("tiles/calendar-wall-v1.png"),
    tileX: 10,
    tileY: resolveTopWallPropTileY("desk", 1),
    tileWidth: 1,
    tileHeight: 1,
    layer: "prop",
    roomId: "desk",
    kind: "board",
  });
  add({
    id: "desk-clocks",
    asset: joinAsset("tiles/wall-clocks.png"),
    tileX: 11,
    tileY: resolveTopWallPropTileY("desk", 2),
    tileWidth: 3,
    tileHeight: 2,
    layer: "prop",
    roomId: "desk",
    kind: "board",
  });
  add({
    id: "desk-camera",
    asset: joinAsset("tiles/security-camera-v1.png"),
    tileX: 14,
    tileY: resolveTopWallPropTileY("desk", 1),
    tileWidth: 1,
    tileHeight: 1,
    layer: "prop",
    roomId: "desk",
    kind: "accessory",
    zOffset: 12,
  });

  const deskClusterTileX = resolveDeskClusterTileX();
  const deskOrigins = [
    { id: "a", tileX: deskClusterTileX, tileY: 3 },
    { id: "b", tileX: deskClusterTileX + 4, tileY: 3 },
    { id: "c", tileX: deskClusterTileX + 8, tileY: 3 },
    { id: "d", tileX: deskClusterTileX, tileY: 6 },
    { id: "e", tileX: deskClusterTileX + 4, tileY: 6 },
    { id: "f", tileX: deskClusterTileX + 8, tileY: 6 },
  ] as const;

  for (const desk of deskOrigins) {
    add({
      id: `desk-${desk.id}`,
      asset: joinAsset("items/desk-wide-v1.png"),
      tileX: desk.tileX,
      tileY: desk.tileY,
      tileWidth: 3,
      tileHeight: 2,
      layer: "prop",
      roomId: "desk",
      kind: "desk",
    });
  }

  for (const chair of [
    ["desk-chair-a", deskClusterTileX + 1, 5],
    ["desk-chair-b", deskClusterTileX + 5, 5],
    ["desk-chair-c", deskClusterTileX + 9, 5],
    ["desk-chair-d", deskClusterTileX + 1, 8],
    ["desk-chair-e", deskClusterTileX + 5, 8],
    ["desk-chair-f", deskClusterTileX + 9, 8],
  ] as const) {
    add({
      id: chair[0],
      asset: joinAsset("items/chair-front-v1.png"),
      tileX: chair[1],
      tileY: chair[2],
      tileWidth: 1,
      tileHeight: 1,
      layer: "prop",
      roomId: "desk",
      kind: "chair",
      zOffset: MAU_OFFICE_SEATED_OCCLUDER_Z_OFFSET + 8,
    });
  }

  const deskAccessories = [
    ["desk-a-monitor", "items/monitor-chart-v1.png", deskClusterTileX + 1.0, 3.5],
    ["desk-a-book", "items/book-open-v1.png", deskClusterTileX + 2.0, 3.5],
    ["desk-b-monitor", "items/desktop-monitor-v1.png", deskClusterTileX + 5.0, 3.5],
    ["desk-b-book", "items/book-stack-closed-v1.png", deskClusterTileX + 6.0, 3.5],
    ["desk-c-monitor", "items/monitor-code-v1.png", deskClusterTileX + 9.0, 3.5],
    ["desk-c-book", "items/book-stack-mixed-v1.png", deskClusterTileX + 10.0, 3.5],
    ["desk-d-monitor", "items/monitor-code-v1.png", deskClusterTileX + 1.0, 6.5],
    ["desk-d-book", "items/book-stack-mixed-v1.png", deskClusterTileX + 2.0, 6.5],
    ["desk-e-monitor", "items/monitor-chart-v1.png", deskClusterTileX + 5.0, 6.5],
    ["desk-e-book", "items/book-open-v1.png", deskClusterTileX + 6.0, 6.5],
    ["desk-f-monitor", "items/desktop-monitor-v1.png", deskClusterTileX + 9.0, 6.5],
    ["desk-f-book", "items/book-stack-closed-v1.png", deskClusterTileX + 10.0, 6.5],
  ] as const;

  for (const [id, asset, centerTileX, centerTileY] of deskAccessories) {
    addSurfaceAccessory({
      id,
      asset,
      centerTileX,
      centerTileY,
      roomId: "desk",
    });
  }

  for (const machine of [
    ["desk-rack-top", "items/server-rack-v1.png", deskClusterTileX + 3, 3, 1, 2],
    ["desk-rack-bottom", "items/server-rack-v1.png", deskClusterTileX + 3, 6, 1, 2],
  ] as const) {
    add({
      id: machine[0],
      asset: joinAsset(machine[1]),
      tileX: machine[2],
      tileY: machine[3],
      tileWidth: machine[4],
      tileHeight: machine[5],
      layer: "prop",
      roomId: "desk",
      kind: "accessory",
      zOffset: MAU_OFFICE_ACCESSORY_Z_OFFSET - 16,
    });
  }

  add({
    id: "meeting-board",
    asset: joinAsset("tiles/meeting-board.png"),
    tileX: resolveCenteredTileX("meeting", 4),
    tileY: resolveTopWallPropTileY("meeting", 2),
    tileWidth: 4,
    tileHeight: 2,
    layer: "prop",
    roomId: "meeting",
    kind: "board",
  });
  add({
    id: "meeting-plant",
    asset: joinAsset("items/plant-v1.png"),
    tileX: 18,
    tileY: 3,
    tileWidth: 1,
    tileHeight: 1,
    layer: "prop",
    roomId: "meeting",
    kind: "plant",
  });

  addNineSlice(add, {
    idPrefix: "meeting-table",
    roomId: "meeting",
    kind: "table",
    layer: "prop",
    tileX: resolveCenteredTileX("meeting", 4),
    tileY: 4,
    tileWidth: 4,
    tileHeight: 3,
    zOffset: MAU_OFFICE_SEATED_OCCLUDER_Z_OFFSET,
    assets: {
      topLeft: joinAsset("tiles/meeting-table-r1c1.png"),
      topCenter: joinAsset("tiles/meeting-table-r1c2.png"),
      topRight: joinAsset("tiles/meeting-table-r1c3.png"),
      middleLeft: joinAsset("tiles/meeting-table-r2c1.png"),
      middleCenter: joinAsset("tiles/meeting-table-r2c2.png"),
      middleRight: joinAsset("tiles/meeting-table-r2c3.png"),
      bottomLeft: joinAsset("tiles/meeting-table-r3c1.png"),
      bottomCenter: joinAsset("tiles/meeting-table-r3c2.png"),
      bottomRight: joinAsset("tiles/meeting-table-r3c3.png"),
    },
  });

  for (const chair of [
    ["meeting-chair-top-left", "items/chair-back-v1.png", 19, 3.5],
    ["meeting-chair-top-mid", "items/chair-back-v1.png", 20, 3.5],
    ["meeting-chair-top-right", "items/chair-back-v1.png", 21, 3.5],
    ["meeting-chair-left", "items/chair-left-v1.png", 17.5, 5],
    ["meeting-chair-right", "items/chair-right-v1.png", 22.5, 5],
    ["meeting-chair-bottom-left", "items/chair-front-v1.png", 19, 7],
    ["meeting-chair-bottom-mid", "items/chair-front-v1.png", 20, 7],
    ["meeting-chair-bottom-right", "items/chair-front-v1.png", 21, 7],
  ] as const) {
    add({
      id: chair[0],
      asset: joinAsset(chair[1]),
      tileX: chair[2],
      tileY: chair[3],
      tileWidth: 1,
      tileHeight: 1,
      layer: "prop",
      roomId: "meeting",
      kind: "chair",
      zOffset: MAU_OFFICE_SEATED_OCCLUDER_Z_OFFSET + 8,
    });
  }

  add({
    id: "browser-board",
    asset: joinAsset("tiles/desk-roadmap-board-v1.png"),
    tileX: 27,
    tileY: resolveTopWallPropTileY("browser", 2),
    tileWidth: 4,
    tileHeight: 2,
    layer: "prop",
    roomId: "browser",
    kind: "board",
  });
  add({
    id: "browser-desk",
    asset: joinAsset("items/desk-wide-v1.png"),
    tileX: 30,
    tileY: 4,
    tileWidth: 3,
    tileHeight: 2,
    layer: "prop",
    roomId: "browser",
    kind: "desk",
  });
  add({
    id: "browser-chair",
    asset: joinAsset("items/chair-front-v1.png"),
    tileX: 31,
    tileY: 6,
    tileWidth: 1,
    tileHeight: 1,
    layer: "prop",
    roomId: "browser",
    kind: "chair",
    zOffset: MAU_OFFICE_SEATED_OCCLUDER_Z_OFFSET + 8,
  });
  addSurfaceAccessory({
    id: "browser-monitor",
    asset: "items/monitor-code-v1.png",
    centerTileX: 31,
    centerTileY: 4.5,
    roomId: "browser",
  });
  addSurfaceAccessory({
    id: "browser-book",
    asset: "items/book-open-v1.png",
    centerTileX: 32,
    centerTileY: 4.5,
    roomId: "browser",
  });
  add({
    id: "browser-plant",
    asset: joinAsset("items/plant-v1.png"),
    tileX: 35,
    tileY: 3,
    tileWidth: 1,
    tileHeight: 1,
    layer: "prop",
    roomId: "browser",
    kind: "plant",
  });

  add({
    id: "break-neon",
    asset: joinAsset("items/neon-sign-v1.png"),
    tileX: 4,
    tileY: 11,
    tileWidth: 2,
    tileHeight: 1,
    layer: "prop",
    roomId: "break",
    kind: "board",
  });
  add({
    id: "break-shelf",
    asset: joinAsset("items/snack-shelf-v1.png"),
    tileX: 11,
    tileY: 12,
    tileWidth: 2,
    tileHeight: 2,
    layer: "prop",
    roomId: "break",
    kind: "shelf",
  });
  add({
    id: "break-arcade",
    asset: joinAsset("items/arcade-v2.png"),
    tileX: 1,
    tileY: 15,
    tileWidth: 2,
    tileHeight: 2,
    layer: "prop",
    roomId: "break",
    kind: "arcade",
  });
  addNineSlice(add, {
    idPrefix: "break-rug",
    roomId: "break",
    kind: "accessory",
    layer: "prop",
    tileX: 3,
    tileY: 15,
    tileWidth: 4,
    tileHeight: 4,
    zOffset: -300,
    assets: {
      topLeft: joinAsset("tiles/rug-r1c1.png"),
      topCenter: joinAsset("tiles/rug-r1c2.png"),
      topRight: joinAsset("tiles/rug-r1c3.png"),
      middleLeft: joinAsset("tiles/rug-r2c1.png"),
      middleCenter: joinAsset("tiles/rug-r2c2.png"),
      middleRight: joinAsset("tiles/rug-r2c3.png"),
      bottomLeft: joinAsset("tiles/rug-r3c1.png"),
      bottomCenter: joinAsset("tiles/rug-r3c2.png"),
      bottomRight: joinAsset("tiles/rug-r3c3.png"),
    },
  });
  add({
    id: "break-round-table",
    asset: joinAsset("items/round-table-v1.png"),
    tileX: 4,
    tileY: 16,
    tileWidth: 2,
    tileHeight: 2,
    layer: "prop",
    roomId: "break",
    kind: "table",
    zOffset: MAU_OFFICE_SEATED_OCCLUDER_Z_OFFSET,
  });
  for (const beanbag of [
    ["break-beanbag-blue", "items/beanbag-blue-v1.png", 2.5, 17.0, true],
    ["break-beanbag-pink", "items/beanbag-pink-v1.png", 4.0, 15.0, false],
    ["break-beanbag-green", "items/beanbag-green-v1.png", 6.5, 16.0, false],
  ] as const) {
    add({
      id: beanbag[0],
      asset: joinAsset(beanbag[1]),
      tileX: beanbag[2],
      tileY: beanbag[3],
      tileWidth: 1,
      tileHeight: 1,
      layer: "prop",
      roomId: "break",
      kind: "accessory",
      mirrored: beanbag[4],
      zOffset: MAU_OFFICE_SEATED_OCCLUDER_Z_OFFSET - 12,
    });
  }
  add({
    id: "break-foosball",
    asset: joinAsset("items/foosball-v1.png"),
    tileX: 10,
    tileY: 16,
    tileWidth: 2,
    tileHeight: 2,
    layer: "prop",
    roomId: "break",
    kind: "foosball",
    zOffset: MAU_OFFICE_SEATED_OCCLUDER_Z_OFFSET - 8,
  });
  add({
    id: "break-bench",
    asset: joinAsset("items/bench-v1.png"),
    tileX: 11,
    tileY: 17,
    tileWidth: 3,
    tileHeight: 1,
    layer: "prop",
    roomId: "break",
    kind: "bench",
  });
  add({
    id: "support-poster",
    asset: joinAsset("tiles/notice-board-v1.png"),
    tileX: 18,
    tileY: resolveTopWallPropTileY("support", 1),
    tileWidth: 2,
    tileHeight: 1,
    layer: "prop",
    roomId: "support",
    kind: "board",
  });
  add({
    id: "support-calendar",
    asset: joinAsset("tiles/calendar-wall-v1.png"),
    tileX: resolveTopWallPropTileX("support", 20, 1),
    tileY: resolveTopWallPropTileY("support", 1),
    tileWidth: 1,
    tileHeight: 1,
    layer: "prop",
    roomId: "support",
    kind: "board",
  });
  addCounterWithCaps(add, {
    idPrefix: "support-counter",
    roomId: "support",
    kind: "counter",
    layer: "prop",
    tileX: resolveCenteredTileX("support", 6),
    tileY: 14,
    tileWidth: 6,
    tileHeight: 2,
    capTileWidth: 1,
    assets: {
      left: joinAsset("items/counter-left-v1.png"),
      center: joinAsset("items/counter-mid-v1.png"),
      right: joinAsset("items/counter-right-v1.png"),
    },
  });
  for (const accessory of [
    ["support-monitor-back-left", "items/monitor-back-v1.png", 19.0, 14.5],
    ["support-paper-center", "items/paper-stack-v1.png", 20.5, 14.5],
    ["support-monitor-back-right", "items/monitor-back-v1.png", 22.0, 14.5],
  ] as const) {
    addSurfaceAccessory({
      id: accessory[0],
      asset: accessory[1],
      centerTileX: accessory[2],
      centerTileY: accessory[3],
      roomId: "support",
      zOffset: MAU_OFFICE_COUNTER_OCCLUDER_Z_OFFSET + 18,
    });
  }
  add({
    id: "support-bench",
    asset: joinAsset("items/bench-v1.png"),
    tileX: 22,
    tileY: 17,
    tileWidth: 3,
    tileHeight: 1,
    layer: "prop",
    roomId: "support",
    kind: "bench",
  });
  add({
    id: "support-plant",
    asset: joinAsset("items/plant-v1.png"),
    tileX: 17,
    tileY: 17,
    tileWidth: 1,
    tileHeight: 1,
    layer: "prop",
    roomId: "support",
    kind: "plant",
  });
  add({
    id: "telephony-poster",
    asset: joinAsset("tiles/notice-board-v1.png"),
    tileX: 27,
    tileY: resolveTopWallPropTileY("telephony", 1),
    tileWidth: 2,
    tileHeight: 1,
    layer: "prop",
    roomId: "telephony",
    kind: "board",
  });
  add({
    id: "telephony-calendar",
    asset: joinAsset("tiles/calendar-wall-v1.png"),
    tileX: resolveTopWallPropTileX("telephony", 34, 1),
    tileY: resolveTopWallPropTileY("telephony", 1),
    tileWidth: 1,
    tileHeight: 1,
    layer: "prop",
    roomId: "telephony",
    kind: "board",
  });
  addCounterWithCaps(add, {
    idPrefix: "telephony-counter",
    roomId: "telephony",
    kind: "counter",
    layer: "prop",
    tileX: resolveCenteredTileX("telephony", 5),
    tileY: 14,
    tileWidth: 5,
    tileHeight: 2,
    capTileWidth: 1,
    assets: {
      left: joinAsset("items/counter-left-v1.png"),
      center: joinAsset("items/counter-mid-v1.png"),
      right: joinAsset("items/counter-right-v1.png"),
    },
  });
  addSurfaceAccessory({
    id: "telephony-monitor",
    asset: "items/monitor-back-v1.png",
    centerTileX: 30,
    centerTileY: 14.5,
    roomId: "telephony",
    zOffset: MAU_OFFICE_COUNTER_OCCLUDER_Z_OFFSET + 18,
  });
  addSurfaceAccessory({
    id: "telephony-fax",
    asset: "items/fax-machine-v1.png",
    centerTileX: 31,
    centerTileY: 14.5,
    roomId: "telephony",
    zOffset: MAU_OFFICE_COUNTER_OCCLUDER_Z_OFFSET + 18,
  });
  addSurfaceAccessory({
    id: "telephony-paper",
    asset: "items/paper-stack-v1.png",
    centerTileX: 32,
    centerTileY: 14.5,
    roomId: "telephony",
    zOffset: MAU_OFFICE_COUNTER_OCCLUDER_Z_OFFSET + 18,
  });
  add({
    id: "telephony-plant",
    asset: joinAsset("items/plant-v1.png"),
    tileX: 35,
    tileY: 17,
    tileWidth: 1,
    tileHeight: 1,
    layer: "prop",
    roomId: "telephony",
    kind: "plant",
  });

  return sprites;
}

function makeLabels(): MauOfficeLabelPlacement[] {
  return [];
}

export const MAU_OFFICE_ROOM_IDS: MauOfficeRoomId[] = [
  "desk",
  "break",
  "meeting",
  "support",
  "browser",
  "telephony",
];

const MAU_OFFICE_NODES = {
  outside_mauHome: makeNode(
    "outside_mauHome",
    MAU_OFFICE_LEFT_ROOM_JUNCTION_TILE_X,
    20,
    "outside",
    ["break_entry"],
  ),
  west_spine: makeNode("west_spine", MAU_OFFICE_LEFT_ROOM_JUNCTION_TILE_X, 10, "hall", [
    "east_spine",
    "desk_door",
    "break_door",
  ]),
  east_spine: makeNode("east_spine", MAU_OFFICE_RIGHT_ROOM_JUNCTION_TILE_X, 10, "hall", [
    "west_spine",
    "support_door",
    "far_spine",
  ]),
  far_spine: makeNode("far_spine", MAU_OFFICE_EXTENSION_ROOM_JUNCTION_TILE_X, 10, "hall", [
    "east_spine",
    "browser_door",
    "telephony_door",
  ]),
  desk_door: makeNode("desk_door", MAU_OFFICE_LEFT_ROOM_JUNCTION_TILE_X, 9, "desk", [
    "west_spine",
    "desk_center",
  ]),
  break_door: makeNode("break_door", MAU_OFFICE_LEFT_ROOM_JUNCTION_TILE_X, 11, "break", [
    "west_spine",
    "break_center",
  ]),
  support_door: makeNode("support_door", MAU_OFFICE_RIGHT_ROOM_JUNCTION_TILE_X, 11, "support", [
    "east_spine",
    "support_center",
  ]),
  browser_door: makeNode("browser_door", MAU_OFFICE_EXTENSION_ROOM_JUNCTION_TILE_X, 9, "browser", [
    "far_spine",
    "browser_center",
  ]),
  telephony_door: makeNode(
    "telephony_door",
    MAU_OFFICE_EXTENSION_ROOM_JUNCTION_TILE_X,
    11,
    "telephony",
    ["far_spine", "telephony_center"],
  ),
  break_entry: makeNode("break_entry", MAU_OFFICE_LEFT_ROOM_JUNCTION_TILE_X, 19, "break", [
    "outside_mauHome",
    "break_center",
  ]),
  top_passage_left: makeNode("top_passage_left", 15, MAU_OFFICE_TOP_PASSAGE_TILE_Y, "hall", [
    "desk_center",
    "top_passage_right",
  ]),
  top_passage_right: makeNode("top_passage_right", 16, MAU_OFFICE_TOP_PASSAGE_TILE_Y, "hall", [
    "top_passage_left",
    "meeting_center",
  ]),
  desk_center: makeNode("desk_center", 8, 6, "desk", [
    "desk_door",
    "desk_board",
    "top_passage_left",
  ]),
  meeting_center: makeNode("meeting_center", 20, 6, "meeting", [
    "meeting_presenter",
    "top_passage_right",
  ]),
  break_center: makeNode("break_center", 8, 15, "break", ["break_door", "break_entry"]),
  support_center: makeNode("support_center", 20, 14, "support", ["support_door"]),
  browser_center: makeNode("browser_center", 31, 6, "browser", ["browser_door"]),
  telephony_center: makeNode("telephony_center", 31, 14, "telephony", ["telephony_door"]),
  support_customer_1: makeNode("support_customer_1", 18, 16, "support", ["support_entry"]),
  support_customer_2: makeNode("support_customer_2", 20, 16, "support", ["support_entry"]),
  support_customer_3: makeNode("support_customer_3", 22, 16, "support", ["support_entry"]),
  support_entry: makeNode("support_entry", 20, 19, "support", [
    "outside_support",
    "support_customer_1",
    "support_customer_2",
    "support_customer_3",
  ]),
  desk_board: makeNode("desk_board", 8, 4, "desk", ["desk_center"]),
  meeting_presenter: makeNode("meeting_presenter", 20, 4, "meeting", ["meeting_center"]),
  outside_support: makeNode("outside_support", 20, 20, "outside", ["support_entry"]),
} satisfies Record<string, MauOfficeNode>;

type DeskAnchorMap = {
  desk_worker_1: MauOfficeAnchor;
  desk_worker_2: MauOfficeAnchor;
  desk_worker_3: MauOfficeAnchor;
  desk_worker_4: MauOfficeAnchor;
  desk_worker_5: MauOfficeAnchor;
  desk_worker_6: MauOfficeAnchor;
};

function makeDeskAnchors(): DeskAnchorMap {
  const deskClusterTileX = resolveDeskClusterTileX();
  return {
    desk_worker_1: makeAnchor({
      id: "desk_worker_1",
      tileX: deskClusterTileX + 1,
      tileY: 5,
      roomId: "desk",
      nodeId: "desk_center",
      pose: "sit",
      layer: 3,
      facingOverride: "north",
    }),
    desk_worker_2: makeAnchor({
      id: "desk_worker_2",
      tileX: deskClusterTileX + 5,
      tileY: 5,
      roomId: "desk",
      nodeId: "desk_center",
      pose: "sit",
      layer: 3,
      facingOverride: "north",
    }),
    desk_worker_3: makeAnchor({
      id: "desk_worker_3",
      tileX: deskClusterTileX + 9,
      tileY: 5,
      roomId: "desk",
      nodeId: "desk_center",
      pose: "sit",
      layer: 3,
      facingOverride: "north",
    }),
    desk_worker_4: makeAnchor({
      id: "desk_worker_4",
      tileX: deskClusterTileX + 1,
      tileY: 8,
      roomId: "desk",
      nodeId: "desk_center",
      pose: "sit",
      layer: 3,
      facingOverride: "north",
    }),
    desk_worker_5: makeAnchor({
      id: "desk_worker_5",
      tileX: deskClusterTileX + 5,
      tileY: 8,
      roomId: "desk",
      nodeId: "desk_center",
      pose: "sit",
      layer: 3,
      facingOverride: "north",
    }),
    desk_worker_6: makeAnchor({
      id: "desk_worker_6",
      tileX: deskClusterTileX + 9,
      tileY: 8,
      roomId: "desk",
      nodeId: "desk_center",
      pose: "sit",
      layer: 3,
      facingOverride: "north",
    }),
  };
}

export const MAU_OFFICE_LAYOUT = {
  tileSize: MAU_OFFICE_TILE_SIZE,
  width: MAU_OFFICE_SCENE_WIDTH,
  height: MAU_OFFICE_SCENE_HEIGHT,
  rooms: MAU_OFFICE_ROOMS,
  nodes: {
    ...MAU_OFFICE_NODES,
  },
  anchors: {
    outside_mauHome: makeAnchor({
      id: "outside_mauHome",
      tileX: MAU_OFFICE_LEFT_ROOM_JUNCTION_TILE_X,
      tileY: 20,
      roomId: "outside",
      nodeId: "outside_mauHome",
      pose: "stand",
      layer: 0,
      facingOverride: "north",
    }),
    outside_support: makeAnchor({
      id: "outside_support",
      tileX: 20,
      tileY: 20,
      roomId: "outside",
      nodeId: "outside_support",
      pose: "stand",
      layer: 0,
      facingOverride: "north",
    }),
    ...makeDeskAnchors(),
    desk_board: makeAnchor({
      id: "desk_board",
      tileX: 8,
      tileY: 4,
      roomId: "desk",
      nodeId: "desk_board",
      pose: "stand",
      layer: 4,
      facingOverride: "north",
    }),
    meeting_presenter: makeAnchor({
      id: "meeting_presenter",
      tileX: 20,
      tileY: 4,
      roomId: "meeting",
      nodeId: "meeting_presenter",
      pose: "stand",
      layer: 4,
      facingOverride: "south",
    }),
    meeting_seat_1: makeAnchor({
      id: "meeting_seat_1",
      tileX: 19,
      tileY: 4,
      roomId: "meeting",
      nodeId: "meeting_center",
      pose: "sit",
      layer: 3,
      facingOverride: "south",
    }),
    meeting_seat_2: makeAnchor({
      id: "meeting_seat_2",
      tileX: 20,
      tileY: 4,
      roomId: "meeting",
      nodeId: "meeting_center",
      pose: "sit",
      layer: 3,
      facingOverride: "south",
    }),
    meeting_seat_3: makeAnchor({
      id: "meeting_seat_3",
      tileX: 21,
      tileY: 4,
      roomId: "meeting",
      nodeId: "meeting_center",
      pose: "sit",
      layer: 3,
      facingOverride: "south",
    }),
    meeting_seat_4: makeAnchor({
      id: "meeting_seat_4",
      tileX: 19,
      tileY: 7,
      roomId: "meeting",
      nodeId: "meeting_center",
      pose: "sit",
      layer: 3,
      facingOverride: "north",
    }),
    meeting_seat_5: makeAnchor({
      id: "meeting_seat_5",
      tileX: 20,
      tileY: 7,
      roomId: "meeting",
      nodeId: "meeting_center",
      pose: "sit",
      layer: 3,
      facingOverride: "north",
    }),
    meeting_seat_6: makeAnchor({
      id: "meeting_seat_6",
      tileX: 21,
      tileY: 7,
      roomId: "meeting",
      nodeId: "meeting_center",
      pose: "sit",
      layer: 3,
      facingOverride: "north",
    }),
    browser_worker_1: makeAnchor({
      id: "browser_worker_1",
      tileX: 31,
      tileY: 6,
      roomId: "browser",
      nodeId: "browser_center",
      pose: "sit",
      layer: 3,
      facingOverride: "north",
    }),
    support_staff_1: makeAnchor({
      id: "support_staff_1",
      tileX: 18,
      tileY: 14,
      roomId: "support",
      nodeId: "support_center",
      pose: "stand",
      layer: 4,
      facingOverride: "south",
    }),
    support_staff_2: makeAnchor({
      id: "support_staff_2",
      tileX: 20,
      tileY: 14,
      roomId: "support",
      nodeId: "support_center",
      pose: "stand",
      layer: 4,
      facingOverride: "south",
    }),
    support_staff_3: makeAnchor({
      id: "support_staff_3",
      tileX: 22,
      tileY: 14,
      roomId: "support",
      nodeId: "support_center",
      pose: "stand",
      layer: 4,
      facingOverride: "south",
    }),
    support_customer_1: makeAnchor({
      id: "support_customer_1",
      tileX: 18,
      tileY: 16,
      roomId: "support",
      nodeId: "support_customer_1",
      pose: "stand",
      layer: 4,
      facingOverride: "north",
    }),
    support_customer_2: makeAnchor({
      id: "support_customer_2",
      tileX: 20,
      tileY: 16,
      roomId: "support",
      nodeId: "support_customer_2",
      pose: "stand",
      layer: 4,
      facingOverride: "north",
    }),
    support_customer_3: makeAnchor({
      id: "support_customer_3",
      tileX: 22,
      tileY: 16,
      roomId: "support",
      nodeId: "support_customer_3",
      pose: "stand",
      layer: 4,
      facingOverride: "north",
    }),
    telephony_staff_1: makeAnchor({
      id: "telephony_staff_1",
      tileX: 31,
      tileY: 14,
      roomId: "telephony",
      nodeId: "telephony_center",
      pose: "stand",
      layer: 4,
      facingOverride: "south",
    }),
    break_arcade: makeAnchor({
      id: "break_arcade",
      tileX: 2,
      tileY: 16,
      roomId: "break",
      nodeId: "break_center",
      pose: "stand",
      layer: 3,
      facingOverride: "west",
    }),
    break_snack: makeAnchor({
      id: "break_snack",
      tileX: 11,
      tileY: 14,
      roomId: "break",
      nodeId: "break_center",
      pose: "stand",
      layer: 3,
      facingOverride: "north",
    }),
    break_volley_1: makeAnchor({
      id: "break_volley_1",
      tileX: 3.25,
      tileY: 15.75,
      roomId: "break",
      nodeId: "break_center",
      pose: "stand",
      layer: 3,
      facingOverride: "east",
    }),
    break_volley_2: makeAnchor({
      id: "break_volley_2",
      tileX: 6.25,
      tileY: 15.75,
      roomId: "break",
      nodeId: "break_center",
      pose: "stand",
      layer: 3,
      facingOverride: "west",
    }),
    break_table_1: makeAnchor({
      id: "break_table_1",
      tileX: 4,
      tileY: 16,
      roomId: "break",
      nodeId: "break_center",
      pose: "sit",
      layer: 3,
      facingOverride: "south",
    }),
    break_table_2: makeAnchor({
      id: "break_table_2",
      tileX: 5,
      tileY: 16,
      roomId: "break",
      nodeId: "break_center",
      pose: "sit",
      layer: 3,
      facingOverride: "south",
    }),
    break_volley_3: makeAnchor({
      id: "break_volley_3",
      tileX: 3.5,
      tileY: 18,
      roomId: "break",
      nodeId: "break_center",
      pose: "stand",
      layer: 3,
      facingOverride: "east",
    }),
    break_volley_4: makeAnchor({
      id: "break_volley_4",
      tileX: 6,
      tileY: 18,
      roomId: "break",
      nodeId: "break_center",
      pose: "stand",
      layer: 3,
      facingOverride: "west",
    }),
    break_chase_1: makeAnchor({
      id: "break_chase_1",
      tileX: 9.5,
      tileY: 15.5,
      roomId: "break",
      nodeId: "break_center",
      pose: "stand",
      layer: 3,
      facingOverride: "east",
    }),
    break_chase_2: makeAnchor({
      id: "break_chase_2",
      tileX: 12.25,
      tileY: 16,
      roomId: "break",
      nodeId: "break_center",
      pose: "stand",
      layer: 3,
      facingOverride: "west",
    }),
    break_chase_3: makeAnchor({
      id: "break_chase_3",
      tileX: 10.75,
      tileY: 18,
      roomId: "break",
      nodeId: "break_center",
      pose: "stand",
      layer: 3,
      facingOverride: "north",
    }),
    break_game_1: makeAnchor({
      id: "break_game_1",
      tileX: 10,
      tileY: 16,
      roomId: "break",
      nodeId: "break_center",
      pose: "stand",
      layer: 3,
      facingOverride: "east",
    }),
    break_game_2: makeAnchor({
      id: "break_game_2",
      tileX: 11,
      tileY: 16,
      roomId: "break",
      nodeId: "break_center",
      pose: "stand",
      layer: 3,
      facingOverride: "west",
    }),
    break_game_3: makeAnchor({
      id: "break_game_3",
      tileX: 10,
      tileY: 17,
      roomId: "break",
      nodeId: "break_center",
      pose: "stand",
      layer: 3,
      facingOverride: "east",
    }),
    break_game_4: makeAnchor({
      id: "break_game_4",
      tileX: 11,
      tileY: 17,
      roomId: "break",
      nodeId: "break_center",
      pose: "stand",
      layer: 3,
      facingOverride: "west",
    }),
    break_jukebox: makeAnchor({
      id: "break_jukebox",
      tileX: 5,
      tileY: 14,
      roomId: "break",
      nodeId: "break_center",
      pose: "stand",
      layer: 3,
      facingOverride: "north",
    }),
    break_reading: makeAnchor({
      id: "break_reading",
      tileX: 12,
      tileY: 17,
      roomId: "break",
      nodeId: "break_center",
      pose: "stand",
      layer: 3,
      facingOverride: "west",
    }),
  } satisfies Record<string, MauOfficeAnchor>,
  map: {
    floorTiles: makeFloorTiles(),
    wallSprites: makeWallSprites(),
    propSprites: makePropSprites(),
    labels: makeLabels(),
  },
} as const;

export const MAU_OFFICE_DESK_ANCHOR_IDS = [
  "desk_worker_1",
  "desk_worker_2",
  "desk_worker_3",
  "desk_worker_4",
  "desk_worker_5",
  "desk_worker_6",
] as const;

export const MAU_OFFICE_MEETING_SEAT_ANCHOR_IDS = [
  "meeting_seat_1",
  "meeting_seat_2",
  "meeting_seat_3",
  "meeting_seat_4",
  "meeting_seat_5",
  "meeting_seat_6",
] as const;

export const MAU_OFFICE_SUPPORT_STAFF_ANCHOR_IDS = [
  "support_staff_1",
  "support_staff_2",
  "support_staff_3",
] as const;

export const MAU_OFFICE_SUPPORT_CUSTOMER_ANCHOR_IDS = [
  "support_customer_1",
  "support_customer_2",
  "support_customer_3",
] as const;

export const MAU_OFFICE_IDLE_PACKAGES: IdlePackageDefinition[] = [
  {
    id: "passing_ball_court",
    label: "Passing ball rally",
    cooldownMs: 60_000,
    activityDefinitions: [
      {
        id: "break-passing-ball",
        label: "Passing the ball",
        slotLayout: ["break_volley_1", "break_volley_2", "break_volley_3", "break_volley_4"],
        bubbleTemplates: ["heads up", "nice pass", "got it", "mine"],
      },
    ],
  },
  {
    id: "chess_table",
    label: "Chatting pair",
    cooldownMs: 48_000,
    activityDefinitions: [
      {
        id: "break-chatting-pair",
        label: "Chatting by the lounge table",
        slotLayout: ["break_table_1", "break_table_2"],
        bubbleTemplates: ["one sec", "wait, really?"],
      },
    ],
  },
  {
    id: "chasing_loop",
    label: "Chasing loop",
    cooldownMs: 48_000,
    activityDefinitions: [
      {
        id: "break-chasing-loop",
        label: "Chasing each other",
        slotLayout: ["break_chase_1", "break_chase_2", "break_chase_3"],
        bubbleTemplates: ["catch me", "almost had you", "not today"],
      },
    ],
  },
  {
    id: "arcade_corner",
    label: "Arcade corner",
    cooldownMs: 42_000,
    activityDefinitions: [
      {
        id: "break-arcade-reach",
        label: "Playing arcade",
        slotLayout: ["break_arcade"],
        bubbleTemplates: ["high score run"],
      },
    ],
  },
  {
    id: "foosball_side_1",
    label: "Foosball side",
    cooldownMs: 42_000,
    activityDefinitions: [
      {
        id: "break-foosball-side-1",
        label: "Playing foosball",
        slotLayout: ["break_game_1"],
        bubbleTemplates: ["nice shot"],
      },
    ],
  },
  {
    id: "foosball_side_2",
    label: "Foosball side",
    cooldownMs: 42_000,
    activityDefinitions: [
      {
        id: "break-foosball-side-2",
        label: "Playing foosball",
        slotLayout: ["break_game_2"],
        bubbleTemplates: ["close one"],
      },
    ],
  },
  {
    id: "foosball_side_3",
    label: "Foosball side",
    cooldownMs: 42_000,
    activityDefinitions: [
      {
        id: "break-foosball-side-3",
        label: "Playing foosball",
        slotLayout: ["break_game_3"],
        bubbleTemplates: ["rematch?"],
      },
    ],
  },
  {
    id: "foosball_side_4",
    label: "Foosball side",
    cooldownMs: 42_000,
    activityDefinitions: [
      {
        id: "break-foosball-side-4",
        label: "Playing foosball",
        slotLayout: ["break_game_4"],
        bubbleTemplates: ["bank shot"],
      },
    ],
  },
  {
    id: "jukebox_floor",
    label: "Dance floor",
    cooldownMs: 42_000,
    activityDefinitions: [
      {
        id: "break-dance-floor",
        label: "Dancing in place",
        slotLayout: ["break_jukebox"],
        bubbleTemplates: ["tiny dance break"],
      },
    ],
  },
  {
    id: "reading_nook",
    label: "Sleeping floor spot",
    cooldownMs: 42_000,
    activityDefinitions: [
      {
        id: "break-sleep-floor",
        label: "Sleeping on the floor",
        slotLayout: ["break_reading"],
        bubbleTemplates: ["zzz"],
      },
    ],
  },
];

export const MAU_OFFICE_PATH_TARGET_ASSETS: Record<MauOfficeDirection, string> = {
  north: joinAsset("ui/path-target-north.png"),
  east: joinAsset("ui/path-target-east.png"),
  south: joinAsset("ui/path-target-south.png"),
  west: joinAsset("ui/path-target-west.png"),
};
export const MAU_OFFICE_PATH_DOT_ASSETS: Record<MauOfficeDirection, string> = {
  north: joinAsset("ui/path-dots-north.png"),
  east: joinAsset("ui/path-dots-east.png"),
  south: joinAsset("ui/path-dots-south.png"),
  west: joinAsset("ui/path-dots-west.png"),
};
export const MAU_OFFICE_PATH_TURN_ASSETS: Record<MauOfficePathTurnKey, string> = {
  ne: joinAsset("ui/path-turn-ne.png"),
  nw: joinAsset("ui/path-turn-nw.png"),
  se: joinAsset("ui/path-turn-se.png"),
  sw: joinAsset("ui/path-turn-sw.png"),
};
export const MAU_OFFICE_BUBBLE_FRAME_ASSETS = {
  r1c1: joinAsset("ui/speech-bubble-r1c1.png"),
  r1c2: joinAsset("ui/speech-bubble-r1c2.png"),
  r1c3: joinAsset("ui/speech-bubble-r1c3.png"),
  r2c1: joinAsset("ui/speech-bubble-r2c1.png"),
  r2c2: joinAsset("ui/speech-bubble-r2c2.png"),
  r2c3: joinAsset("ui/speech-bubble-r2c3.png"),
  r3c1: joinAsset("ui/speech-bubble-r3c1.png"),
  r3c2: joinAsset("ui/speech-bubble-r3c2.png"),
  r3c3: joinAsset("ui/speech-bubble-r3c3.png"),
} as const;
export const MAU_OFFICE_BUBBLE_TAIL_ASSET = joinAsset("ui/speech-bubble-tail.png");
export const MAU_OFFICE_ROOM_SIGN_ASSET = joinAsset("ui/room-sign.png");

function workerAnimationFrames(
  rigId: MauOfficeWorkerRigId,
  pose: MauOfficeDirectionalWorkerAnimationId,
  direction: MauOfficeDirection,
  frameCount: number,
): string[] {
  return Array.from({ length: frameCount }, (_, index) =>
    joinAsset(`workers/${rigId}/${pose}-${direction}/frame_${String(index).padStart(3, "0")}.png`),
  );
}

function poseAnimation(
  rigId: MauOfficeWorkerRigId,
  pose: MauOfficeDirectionalWorkerAnimationId,
  direction: MauOfficeDirection,
  frameCount: number,
  fps: number,
): WorkerRigAnimation {
  return {
    fps,
    frames: workerAnimationFrames(rigId, pose, direction, frameCount),
  };
}

function sleepFloorAnimation(
  rigId: MauOfficeWorkerRigId,
  frameCount: number,
  fps: number,
): WorkerRigAnimation {
  return {
    fps,
    frames: Array.from({ length: frameCount }, (_, index) =>
      joinAsset(`workers/${rigId}/sleep-floor/frame_${String(index).padStart(3, "0")}.png`),
    ),
  };
}

export const MAU_OFFICE_WORKER_RIG_IDS: Exclude<MauOfficeWorkerRigId, "human">[] = [
  "bird",
  "cat",
  "deer",
  "dog",
];

function buildWorkerRig(rigId: MauOfficeWorkerRigId): WorkerRigDefinition {
  return {
    stand: {
      north: poseAnimation(rigId, "stand", "north", 4, 3),
      east: poseAnimation(rigId, "stand", "east", 4, 3),
      south: poseAnimation(rigId, "stand", "south", 4, 3),
      west: poseAnimation(rigId, "stand", "west", 4, 3),
    },
    sit: {
      north: poseAnimation(rigId, "sit", "north", 4, 3),
      east: poseAnimation(rigId, "sit", "east", 4, 3),
      south: poseAnimation(rigId, "sit", "south", 4, 3),
      west: poseAnimation(rigId, "sit", "west", 4, 3),
    },
    walk: {
      north: poseAnimation(rigId, "walk", "north", 6, 6),
      east: poseAnimation(rigId, "walk", "east", 6, 6),
      south: poseAnimation(rigId, "walk", "south", 6, 6),
      west: poseAnimation(rigId, "walk", "west", 6, 6),
    },
    reach: {
      north: poseAnimation(rigId, "reach", "north", 4, 3),
      east: poseAnimation(rigId, "reach", "east", 4, 3),
      south: poseAnimation(rigId, "reach", "south", 4, 3),
      west: poseAnimation(rigId, "reach", "west", 4, 3),
    },
    dance: {
      north: poseAnimation(rigId, "dance", "north", 4, 5),
      east: poseAnimation(rigId, "dance", "east", 4, 5),
      south: poseAnimation(rigId, "dance", "south", 4, 5),
      west: poseAnimation(rigId, "dance", "west", 4, 5),
    },
    jump: {
      north: poseAnimation(rigId, "jump", "north", 4, 5),
      east: poseAnimation(rigId, "jump", "east", 4, 5),
      south: poseAnimation(rigId, "jump", "south", 4, 5),
      west: poseAnimation(rigId, "jump", "west", 4, 5),
    },
    chase: {
      north: poseAnimation(rigId, "chase", "north", 4, 6),
      east: poseAnimation(rigId, "chase", "east", 4, 6),
      south: poseAnimation(rigId, "chase", "south", 4, 6),
      west: poseAnimation(rigId, "chase", "west", 4, 6),
    },
    chat: {
      north: poseAnimation(rigId, "chat", "north", 4, 3),
      east: poseAnimation(rigId, "chat", "east", 4, 3),
      south: poseAnimation(rigId, "chat", "south", 4, 3),
      west: poseAnimation(rigId, "chat", "west", 4, 3),
    },
    sleepFloor: sleepFloorAnimation(rigId, 4, 2),
  };
}

export const MAU_OFFICE_WORKER_RIGS: WorkerRigRegistry = {
  bird: buildWorkerRig("bird"),
  cat: buildWorkerRig("cat"),
  deer: buildWorkerRig("deer"),
  dog: buildWorkerRig("dog"),
  human: buildWorkerRig("human"),
};

export function resolveMauOfficeWorkerRig(rigId: MauOfficeWorkerRigId): WorkerRigDefinition {
  return MAU_OFFICE_WORKER_RIGS[rigId] ?? MAU_OFFICE_WORKER_RIGS.cat;
}

export function resolveMauOfficeWorkerAnimation(
  rigId: MauOfficeWorkerRigId,
  animationId: MauOfficeWorkerAnimationId,
  direction: MauOfficeDirection,
): WorkerRigAnimation {
  const rig = resolveMauOfficeWorkerRig(rigId);
  if (animationId === "sleep-floor") {
    return rig.sleepFloor;
  }
  return rig[animationId][direction] ?? rig[animationId].south;
}

const DEFAULT_IDLE_PACKAGE_IDS = MAU_OFFICE_IDLE_PACKAGES.map((pkg) => pkg.id);
const MAU_OFFICE_ASSET_VERSION = "20260331-worker-animation-v10";

export function resolveMauOfficeAssetUrl(basePath: string, assetPath: string): string {
  const normalizedBase = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  const normalizedAsset = assetPath.startsWith("/") ? assetPath.slice(1) : assetPath;
  const assetUrl = normalizedBase ? `${normalizedBase}/${normalizedAsset}` : `/${normalizedAsset}`;
  const separator = assetUrl.includes("?") ? "&" : "?";
  return `${assetUrl}${separator}v=${MAU_OFFICE_ASSET_VERSION}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function resolveMauOfficeConfig(source?: unknown): MauOfficeUiConfig {
  const root = asRecord(source);
  const ui = asRecord(root?.ui);
  const maybeMauOffice = asRecord(ui?.mauOffice ?? root?.mauOffice);
  const idlePackages = asRecord(maybeMauOffice?.idlePackages);
  const enabled = typeof maybeMauOffice?.enabled === "boolean" ? maybeMauOffice.enabled : true;
  const maxVisibleWorkersRaw = maybeMauOffice?.maxVisibleWorkers;
  const maxVisibleWorkers =
    typeof maxVisibleWorkersRaw === "number" && Number.isFinite(maxVisibleWorkersRaw)
      ? Math.max(1, Math.min(12, Math.trunc(maxVisibleWorkersRaw)))
      : 8;
  const enabledIdlePackages = Array.isArray(idlePackages?.enabled)
    ? idlePackages.enabled.filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      )
    : DEFAULT_IDLE_PACKAGE_IDS;

  return {
    enabled,
    maxVisibleWorkers,
    idlePackages: {
      enabled: enabledIdlePackages,
    },
  };
}
