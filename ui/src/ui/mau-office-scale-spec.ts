export const MAU_OFFICE_SOURCE_TILE_PX = 64;
export const MAU_OFFICE_SOURCE_SUBGRID_PX = 32;
export const MAU_OFFICE_LOGICAL_TILE_PX = 64;
export const MAU_OFFICE_SOURCE_TO_LOGICAL_SCALE = 1;

export type MauOfficePxRange = {
  min: number;
  max: number;
};

export type MauOfficeVisibleBoundsSpec = {
  width: MauOfficePxRange;
  height: MauOfficePxRange;
  maxOffsetX?: number;
  maxOffsetY?: number;
};

export type MauOfficeSemanticScaleSpec = {
  workerHeightRatio?: MauOfficePxRange;
  maxDoorHeightRatio?: number;
};

export type MauOfficeAssetScaleSpec = {
  asset: string;
  anchor: "bottom-center" | "top-left";
  family: "board" | "bubble" | "chrome" | "floor" | "path" | "prop" | "sign" | "tile" | "worker";
  slotTiles: {
    width: number;
    height: number;
  };
  logicalFootprintTiles?: {
    width: number;
    height: number;
  };
  sourceCanvas: {
    width: number;
    height: number;
  };
  visibleBounds?: MauOfficeVisibleBoundsSpec;
  semantic?: MauOfficeSemanticScaleSpec;
};

export type MauOfficeWorkerRenderMetrics = {
  logicalWidthPx: number;
  logicalHeightPx: number;
  poseOffsetYPx: {
    sit: number;
    stand: number;
    sleepFloor: number;
  };
  badge: {
    widthPx: number;
    heightPx: number;
    offsetYPx: number;
  };
  bubble: {
    minWidthPx: number;
    maxWidthPx: number;
    minHeightPx: number;
    maxHeightPx: number;
    maxTextChars: number;
    offsetYPx: number;
  };
  history: {
    minWidthPx: number;
    maxWidthPx: number;
    minHeightPx: number;
    maxHeightPx: number;
    maxTextChars: number;
    offsetYPx: number;
  };
};

function px(min: number, max = min): MauOfficePxRange {
  return { min, max };
}

function completeSpec(
  spec: Omit<MauOfficeAssetScaleSpec, "anchor" | "slotTiles"> & {
    anchor?: MauOfficeAssetScaleSpec["anchor"];
  },
): MauOfficeAssetScaleSpec {
  return {
    anchor: spec.anchor ?? "top-left",
    slotTiles: {
      width: spec.sourceCanvas.width / MAU_OFFICE_SOURCE_TILE_PX,
      height: spec.sourceCanvas.height / MAU_OFFICE_SOURCE_TILE_PX,
    },
    ...spec,
  };
}

function fullTile(asset: string): MauOfficeAssetScaleSpec {
  return completeSpec({
    asset,
    family: "floor",
    sourceCanvas: { width: 64, height: 64 },
    visibleBounds: { width: px(64), height: px(64) },
  });
}

function shellTile(
  asset: string,
  canvas: { width: number; height: number },
  bounds: MauOfficeVisibleBoundsSpec,
): MauOfficeAssetScaleSpec {
  return completeSpec({
    asset,
    family: "tile",
    sourceCanvas: canvas,
    visibleBounds: bounds,
  });
}

function pathTile(asset: string, bounds: MauOfficeVisibleBoundsSpec): MauOfficeAssetScaleSpec {
  return completeSpec({
    asset,
    family: "path",
    sourceCanvas: { width: 64, height: 64 },
    visibleBounds: bounds,
  });
}

function propSpec(params: {
  asset: string;
  canvas: { width: number; height: number };
  bounds: MauOfficeVisibleBoundsSpec;
  semantic?: MauOfficeSemanticScaleSpec;
  family?: MauOfficeAssetScaleSpec["family"];
  logicalFootprintTiles?: MauOfficeAssetScaleSpec["logicalFootprintTiles"];
}): MauOfficeAssetScaleSpec {
  return completeSpec({
    asset: params.asset,
    family: params.family ?? "prop",
    logicalFootprintTiles: params.logicalFootprintTiles,
    sourceCanvas: params.canvas,
    visibleBounds: params.bounds,
    semantic: params.semantic,
  });
}

export function sourcePxToLogicalPx(value: number): number {
  return Math.round(value * MAU_OFFICE_SOURCE_TO_LOGICAL_SCALE);
}

const FIXED_ASSET_SPECS: MauOfficeAssetScaleSpec[] = [
  fullTile("mau-office/tiles/floor-room-a.png"),
  fullTile("mau-office/tiles/floor-room-b.png"),
  fullTile("mau-office/tiles/floor-room-c.png"),
  fullTile("mau-office/tiles/floor-room-d.png"),
  fullTile("mau-office/tiles/floor-hall-a.png"),
  fullTile("mau-office/tiles/floor-hall-b.png"),
  shellTile(
    "mau-office/tiles/wall-front-left.png",
    { width: 64, height: 192 },
    {
      width: px(64),
      height: px(192),
    },
  ),
  shellTile(
    "mau-office/tiles/wall-front-mid.png",
    { width: 64, height: 192 },
    {
      width: px(64),
      height: px(192),
    },
  ),
  shellTile(
    "mau-office/tiles/wall-front-right.png",
    { width: 64, height: 192 },
    {
      width: px(64),
      height: px(192),
    },
  ),
  shellTile(
    "mau-office/tiles/wall-side-left.png",
    { width: 64, height: 64 },
    {
      width: px(8, 14),
      height: px(64),
    },
  ),
  shellTile(
    "mau-office/tiles/wall-side-right.png",
    { width: 64, height: 64 },
    {
      width: px(8, 14),
      height: px(64),
    },
  ),
  shellTile(
    "mau-office/tiles/wall-bottom.png",
    { width: 64, height: 64 },
    {
      width: px(64),
      height: px(64),
    },
  ),
  shellTile(
    "mau-office/tiles/wall-corner-bl.png",
    { width: 64, height: 64 },
    {
      width: px(64),
      height: px(64),
    },
  ),
  shellTile(
    "mau-office/tiles/wall-corner-br.png",
    { width: 64, height: 64 },
    {
      width: px(64),
      height: px(64),
    },
  ),
  shellTile(
    "mau-office/tiles/door-top.png",
    { width: 64, height: 64 },
    {
      width: px(64),
      height: px(64),
    },
  ),
  shellTile(
    "mau-office/tiles/door-bottom.png",
    { width: 64, height: 64 },
    {
      width: px(64),
      height: px(64),
    },
  ),
  shellTile(
    "mau-office/tiles/hall-cap-left.png",
    { width: 64, height: 64 },
    {
      width: px(64),
      height: px(64),
    },
  ),
  shellTile(
    "mau-office/tiles/hall-cap-right.png",
    { width: 64, height: 64 },
    {
      width: px(64),
      height: px(64),
    },
  ),
  propSpec({
    asset: "mau-office/items/desk-wide-v1.png",
    canvas: { width: 192, height: 128 },
    bounds: { width: px(172, 176), height: px(88, 92), maxOffsetY: 40 },
    semantic: {
      workerHeightRatio: px(1.9, 2.4),
      maxDoorHeightRatio: 1.5,
    },
  }),
  propSpec({
    asset: "mau-office/items/monitor-code-v1.png",
    canvas: { width: 64, height: 64 },
    bounds: { width: px(36, 40), height: px(31, 35), maxOffsetY: 32 },
  }),
  propSpec({
    asset: "mau-office/items/monitor-chart-v1.png",
    canvas: { width: 64, height: 64 },
    bounds: { width: px(36, 40), height: px(31, 35), maxOffsetY: 32 },
  }),
  propSpec({
    asset: "mau-office/items/desktop-monitor-v1.png",
    canvas: { width: 64, height: 64 },
    bounds: { width: px(31, 35), height: px(38, 42), maxOffsetY: 26 },
  }),
  propSpec({
    asset: "mau-office/items/monitor-back-v1.png",
    canvas: { width: 64, height: 64 },
    bounds: { width: px(33, 37), height: px(29, 33), maxOffsetY: 35 },
  }),
  propSpec({
    asset: "mau-office/items/book-open-v1.png",
    canvas: { width: 64, height: 64 },
    bounds: { width: px(29, 33), height: px(20, 24), maxOffsetY: 44 },
  }),
  propSpec({
    asset: "mau-office/items/book-stack-closed-v1.png",
    canvas: { width: 64, height: 64 },
    bounds: { width: px(21, 25), height: px(31, 35), maxOffsetY: 33 },
  }),
  propSpec({
    asset: "mau-office/items/book-stack-mixed-v1.png",
    canvas: { width: 64, height: 64 },
    bounds: { width: px(24, 28), height: px(31, 35), maxOffsetY: 33 },
  }),
  propSpec({
    asset: "mau-office/items/paper-stack-v1.png",
    canvas: { width: 64, height: 64 },
    bounds: { width: px(24, 28), height: px(24, 28), maxOffsetY: 40 },
  }),
  propSpec({
    asset: "mau-office/items/server-rack-v1.png",
    canvas: { width: 64, height: 128 },
    bounds: { width: px(32, 36), height: px(52, 60), maxOffsetY: 76 },
    semantic: {
      workerHeightRatio: px(1.2, 1.6),
      maxDoorHeightRatio: 1.0,
    },
  }),
  propSpec({
    asset: "mau-office/items/fax-machine-v1.png",
    canvas: { width: 64, height: 64 },
    bounds: { width: px(34, 38), height: px(34, 38), maxOffsetY: 30 },
  }),
  propSpec({
    asset: "mau-office/items/arcade-v2.png",
    canvas: { width: 128, height: 128 },
    bounds: { width: px(64, 70), height: px(106, 112), maxOffsetY: 20 },
    semantic: {
      workerHeightRatio: px(2.4, 2.9),
      maxDoorHeightRatio: 1.8,
    },
  }),
  propSpec({
    asset: "mau-office/items/snack-shelf-v1.png",
    canvas: { width: 128, height: 128 },
    bounds: { width: px(84, 92), height: px(96, 104), maxOffsetY: 30 },
    semantic: {
      workerHeightRatio: px(2.2, 2.7),
      maxDoorHeightRatio: 1.7,
    },
  }),
  propSpec({
    asset: "mau-office/items/foosball-v1.png",
    canvas: { width: 128, height: 128 },
    bounds: { width: px(84, 92), height: px(66, 74), maxOffsetY: 60 },
    semantic: {
      workerHeightRatio: px(1.5, 1.9),
      maxDoorHeightRatio: 1.2,
    },
  }),
  propSpec({
    asset: "mau-office/items/round-table-v1.png",
    canvas: { width: 128, height: 128 },
    bounds: { width: px(62, 68), height: px(64, 70), maxOffsetY: 62 },
    semantic: {
      workerHeightRatio: px(1.4, 1.9),
      maxDoorHeightRatio: 1.1,
    },
  }),
  propSpec({
    asset: "mau-office/items/beanbag-blue-v1.png",
    canvas: { width: 64, height: 64 },
    bounds: { width: px(47, 51), height: px(44, 48), maxOffsetY: 20 },
  }),
  propSpec({
    asset: "mau-office/items/beanbag-green-v1.png",
    canvas: { width: 64, height: 64 },
    bounds: { width: px(47, 51), height: px(44, 48), maxOffsetY: 20 },
  }),
  propSpec({
    asset: "mau-office/items/beanbag-pink-v1.png",
    canvas: { width: 64, height: 64 },
    bounds: { width: px(47, 51), height: px(44, 48), maxOffsetY: 20 },
  }),
  propSpec({
    asset: "mau-office/items/neon-sign-v1.png",
    canvas: { width: 128, height: 64 },
    bounds: { width: px(40, 48), height: px(32, 36), maxOffsetY: 0 },
  }),
  propSpec({
    asset: "mau-office/items/bench-v1.png",
    canvas: { width: 192, height: 64 },
    bounds: { width: px(94, 102), height: px(40, 44), maxOffsetY: 24 },
    semantic: {
      workerHeightRatio: px(0.9, 1.2),
      maxDoorHeightRatio: 0.8,
    },
  }),
  propSpec({
    asset: "mau-office/items/stool-a-v1.png",
    canvas: { width: 64, height: 64 },
    bounds: { width: px(18, 22), height: px(28, 32), maxOffsetY: 36 },
  }),
  propSpec({
    asset: "mau-office/items/stool-b-v1.png",
    canvas: { width: 64, height: 64 },
    bounds: { width: px(18, 22), height: px(26, 30), maxOffsetY: 38 },
  }),
  propSpec({
    asset: "mau-office/items/plant-v1.png",
    canvas: { width: 64, height: 64 },
    bounds: { width: px(24, 28), height: px(38, 42), maxOffsetY: 26 },
    semantic: {
      workerHeightRatio: px(0.85, 1.1),
      maxDoorHeightRatio: 0.7,
    },
  }),
  propSpec({
    asset: "mau-office/items/chair-front-v1.png",
    canvas: { width: 64, height: 64 },
    bounds: { width: px(28, 32), height: px(40, 44), maxOffsetY: 24 },
  }),
  propSpec({
    asset: "mau-office/items/chair-back-v1.png",
    canvas: { width: 64, height: 64 },
    bounds: { width: px(26, 30), height: px(40, 44), maxOffsetY: 24 },
  }),
  propSpec({
    asset: "mau-office/items/chair-left-v1.png",
    canvas: { width: 64, height: 64 },
    bounds: { width: px(26, 30), height: px(40, 44), maxOffsetY: 24 },
  }),
  propSpec({
    asset: "mau-office/items/chair-right-v1.png",
    canvas: { width: 64, height: 64 },
    bounds: { width: px(26, 30), height: px(40, 44), maxOffsetY: 24 },
  }),
  propSpec({
    asset: "mau-office/items/counter-left-v1.png",
    canvas: { width: 64, height: 128 },
    bounds: { width: px(48), height: px(96), maxOffsetX: 16, maxOffsetY: 32 },
  }),
  propSpec({
    asset: "mau-office/items/counter-mid-v1.png",
    canvas: { width: 64, height: 128 },
    bounds: { width: px(64), height: px(76), maxOffsetY: 52 },
  }),
  propSpec({
    asset: "mau-office/items/counter-right-v1.png",
    canvas: { width: 64, height: 128 },
    bounds: { width: px(48), height: px(96), maxOffsetY: 32 },
  }),
  propSpec({
    asset: "mau-office/tiles/queue-rail.png",
    canvas: { width: 256, height: 64 },
    bounds: { width: px(224), height: px(64), maxOffsetX: 16, maxOffsetY: 0 },
  }),
  propSpec({
    asset: "mau-office/tiles/kanban-board.png",
    canvas: { width: 256, height: 128 },
    bounds: { width: px(220, 228), height: px(72, 80), maxOffsetY: 0 },
    family: "board",
  }),
  propSpec({
    asset: "mau-office/tiles/desk-roadmap-board-v1.png",
    canvas: { width: 256, height: 128 },
    bounds: { width: px(184, 192), height: px(80, 86), maxOffsetY: 0 },
    family: "board",
  }),
  propSpec({
    asset: "mau-office/tiles/meeting-board.png",
    canvas: { width: 256, height: 128 },
    bounds: { width: px(152, 160), height: px(80, 84), maxOffsetY: 0 },
    family: "board",
  }),
  propSpec({
    asset: "mau-office/tiles/notice-board-v1.png",
    canvas: { width: 128, height: 64 },
    bounds: { width: px(64, 70), height: px(44, 48), maxOffsetY: 0 },
    family: "board",
  }),
  propSpec({
    asset: "mau-office/tiles/calendar-wall-v1.png",
    canvas: { width: 64, height: 64 },
    bounds: { width: px(38, 42), height: px(42, 46), maxOffsetY: 0 },
    family: "board",
  }),
  propSpec({
    asset: "mau-office/tiles/wall-clocks.png",
    canvas: { width: 192, height: 128 },
    bounds: { width: px(170, 178), height: px(120, 124), maxOffsetY: 2 },
    family: "board",
  }),
  propSpec({
    asset: "mau-office/tiles/security-camera-v1.png",
    canvas: { width: 64, height: 64 },
    bounds: { width: px(28, 32), height: px(24, 28), maxOffsetY: 0 },
    family: "board",
  }),
  ...[
    "mau-office/tiles/rug-r1c1.png",
    "mau-office/tiles/rug-r1c2.png",
    "mau-office/tiles/rug-r1c3.png",
    "mau-office/tiles/rug-r2c1.png",
    "mau-office/tiles/rug-r2c2.png",
    "mau-office/tiles/rug-r2c3.png",
    "mau-office/tiles/rug-r3c1.png",
    "mau-office/tiles/rug-r3c2.png",
    "mau-office/tiles/rug-r3c3.png",
  ].map((asset) =>
    propSpec({
      asset,
      canvas: { width: 64, height: 64 },
      bounds: { width: px(64), height: px(64), maxOffsetY: 0 },
      family: "tile",
    }),
  ),
  propSpec({
    asset: "mau-office/tiles/meeting-table-r1c1.png",
    canvas: { width: 64, height: 64 },
    bounds: { width: px(48), height: px(32), maxOffsetX: 16, maxOffsetY: 32 },
    family: "tile",
  }),
  propSpec({
    asset: "mau-office/tiles/meeting-table-r1c2.png",
    canvas: { width: 128, height: 64 },
    bounds: { width: px(128), height: px(32), maxOffsetY: 32 },
    family: "tile",
  }),
  propSpec({
    asset: "mau-office/tiles/meeting-table-r1c3.png",
    canvas: { width: 64, height: 64 },
    bounds: { width: px(48), height: px(32), maxOffsetY: 32 },
    family: "tile",
  }),
  propSpec({
    asset: "mau-office/tiles/meeting-table-r2c1.png",
    canvas: { width: 64, height: 64 },
    bounds: { width: px(48), height: px(64), maxOffsetX: 16, maxOffsetY: 0 },
    family: "tile",
  }),
  propSpec({
    asset: "mau-office/tiles/meeting-table-r2c2.png",
    canvas: { width: 128, height: 64 },
    bounds: { width: px(128), height: px(64), maxOffsetY: 0 },
    family: "tile",
  }),
  propSpec({
    asset: "mau-office/tiles/meeting-table-r2c3.png",
    canvas: { width: 64, height: 64 },
    bounds: { width: px(48), height: px(64), maxOffsetY: 0 },
    family: "tile",
  }),
  propSpec({
    asset: "mau-office/tiles/meeting-table-r3c1.png",
    canvas: { width: 64, height: 64 },
    bounds: { width: px(48), height: px(64), maxOffsetX: 16, maxOffsetY: 0 },
    family: "tile",
  }),
  propSpec({
    asset: "mau-office/tiles/meeting-table-r3c2.png",
    canvas: { width: 128, height: 64 },
    bounds: { width: px(128), height: px(64), maxOffsetY: 0 },
    family: "tile",
  }),
  propSpec({
    asset: "mau-office/tiles/meeting-table-r3c3.png",
    canvas: { width: 64, height: 64 },
    bounds: { width: px(48), height: px(64), maxOffsetY: 0 },
    family: "tile",
  }),
  completeSpec({
    asset: "mau-office/ui/room-sign.png",
    family: "sign",
    sourceCanvas: { width: 192, height: 64 },
    visibleBounds: { width: px(160, 168), height: px(44, 48), maxOffsetY: 8 },
  }),
  completeSpec({
    asset: "mau-office/ui/speech-bubble-r1c1.png",
    family: "bubble",
    sourceCanvas: { width: 32, height: 24 },
  }),
  completeSpec({
    asset: "mau-office/ui/speech-bubble-r1c2.png",
    family: "bubble",
    sourceCanvas: { width: 64, height: 24 },
  }),
  completeSpec({
    asset: "mau-office/ui/speech-bubble-r1c3.png",
    family: "bubble",
    sourceCanvas: { width: 32, height: 24 },
  }),
  completeSpec({
    asset: "mau-office/ui/speech-bubble-r2c1.png",
    family: "bubble",
    sourceCanvas: { width: 32, height: 28 },
  }),
  completeSpec({
    asset: "mau-office/ui/speech-bubble-r2c2.png",
    family: "bubble",
    sourceCanvas: { width: 64, height: 28 },
  }),
  completeSpec({
    asset: "mau-office/ui/speech-bubble-r2c3.png",
    family: "bubble",
    sourceCanvas: { width: 32, height: 28 },
  }),
  completeSpec({
    asset: "mau-office/ui/speech-bubble-r3c1.png",
    family: "bubble",
    sourceCanvas: { width: 32, height: 23 },
  }),
  completeSpec({
    asset: "mau-office/ui/speech-bubble-r3c2.png",
    family: "bubble",
    sourceCanvas: { width: 64, height: 23 },
  }),
  completeSpec({
    asset: "mau-office/ui/speech-bubble-r3c3.png",
    family: "bubble",
    sourceCanvas: { width: 32, height: 23 },
  }),
  completeSpec({
    asset: "mau-office/ui/speech-bubble-tail.png",
    family: "bubble",
    sourceCanvas: { width: 64, height: 26 },
  }),
  pathTile("mau-office/ui/path-target-east.png", {
    width: px(52, 60),
    height: px(6, 10),
    maxOffsetX: 8,
    maxOffsetY: 30,
  }),
  pathTile("mau-office/ui/path-target-west.png", {
    width: px(52, 60),
    height: px(6, 10),
    maxOffsetX: 8,
    maxOffsetY: 30,
  }),
  pathTile("mau-office/ui/path-target-north.png", {
    width: px(6, 10),
    height: px(52, 60),
    maxOffsetX: 30,
    maxOffsetY: 8,
  }),
  pathTile("mau-office/ui/path-target-south.png", {
    width: px(6, 10),
    height: px(52, 60),
    maxOffsetX: 30,
    maxOffsetY: 8,
  }),
  pathTile("mau-office/ui/path-dots-east.png", {
    width: px(60, 64),
    height: px(1, 4),
    maxOffsetY: 32,
  }),
  pathTile("mau-office/ui/path-dots-west.png", {
    width: px(60, 64),
    height: px(1, 4),
    maxOffsetY: 32,
  }),
  pathTile("mau-office/ui/path-dots-north.png", {
    width: px(1, 4),
    height: px(60, 64),
    maxOffsetX: 32,
  }),
  pathTile("mau-office/ui/path-dots-south.png", {
    width: px(1, 4),
    height: px(60, 64),
    maxOffsetX: 32,
  }),
  pathTile("mau-office/ui/path-turn-ne.png", {
    width: px(42, 48),
    height: px(42, 48),
    maxOffsetX: 12,
    maxOffsetY: 12,
  }),
  pathTile("mau-office/ui/path-turn-nw.png", {
    width: px(42, 48),
    height: px(42, 48),
    maxOffsetX: 12,
    maxOffsetY: 12,
  }),
  pathTile("mau-office/ui/path-turn-se.png", {
    width: px(42, 48),
    height: px(42, 48),
    maxOffsetX: 12,
    maxOffsetY: 12,
  }),
  pathTile("mau-office/ui/path-turn-sw.png", {
    width: px(42, 48),
    height: px(42, 48),
    maxOffsetX: 12,
    maxOffsetY: 12,
  }),
];

const FIXED_ASSET_SPEC_BY_PATH = new Map(
  FIXED_ASSET_SPECS.map((spec) => [spec.asset, spec] as const),
);

export const MAU_OFFICE_WORKER_FRAME_SPEC: MauOfficeAssetScaleSpec = {
  asset: "mau-office/workers/<rig>/*.png",
  anchor: "bottom-center",
  family: "worker",
  slotTiles: { width: 1, height: 1 },
  sourceCanvas: { width: 64, height: 64 },
  visibleBounds: {
    width: px(15, 30),
    height: px(36, 45),
    maxOffsetX: 26,
    maxOffsetY: 25,
  },
};

export const MAU_OFFICE_SLEEP_FLOOR_FRAME_SPEC: MauOfficeAssetScaleSpec = {
  asset: "mau-office/workers/<rig>/sleep-floor/*.png",
  anchor: "bottom-center",
  family: "worker",
  slotTiles: { width: 1, height: 1 },
  sourceCanvas: { width: 64, height: 64 },
  visibleBounds: {
    width: px(40, 46),
    height: px(20, 30),
    maxOffsetX: 12,
    maxOffsetY: 40,
  },
};

export const MAU_OFFICE_WORKER_RENDER_METRICS: MauOfficeWorkerRenderMetrics = {
  logicalWidthPx: 96,
  logicalHeightPx: 96,
  poseOffsetYPx: {
    // Desk/meeting seats share one standing-style north sprite, so seated anchors
    // need a small downward tuck to visually connect the worker to the chair row.
    sit: 8,
    stand: 0,
    sleepFloor: 0,
  },
  badge: {
    widthPx: 56,
    heightPx: 28,
    offsetYPx: 0,
  },
  bubble: {
    minWidthPx: 112,
    maxWidthPx: 160,
    minHeightPx: 72,
    maxHeightPx: 96,
    maxTextChars: 100,
    offsetYPx: 0,
  },
  history: {
    minWidthPx: 192,
    maxWidthPx: 320,
    minHeightPx: 80,
    maxHeightPx: 128,
    maxTextChars: 120,
    offsetYPx: -8,
  },
};

export const MAU_OFFICE_ASSET_SCALE_SPECS = FIXED_ASSET_SPECS;

export function resolveMauOfficeAssetScaleSpec(assetPath: string): MauOfficeAssetScaleSpec | null {
  if (assetPath.startsWith("mau-office/workers/") && assetPath.includes("/sleep-floor/")) {
    return MAU_OFFICE_SLEEP_FLOOR_FRAME_SPEC;
  }
  if (assetPath.startsWith("mau-office/workers/")) {
    return MAU_OFFICE_WORKER_FRAME_SPEC;
  }
  return FIXED_ASSET_SPEC_BY_PATH.get(assetPath) ?? null;
}
