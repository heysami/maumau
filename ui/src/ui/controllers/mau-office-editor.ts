import {
  MAU_OFFICE_CATALOG,
  MAU_OFFICE_SCENE_MAX_TILES_H,
  MAU_OFFICE_SCENE_MAX_TILES_W,
  MAU_OFFICE_SCENE_MIN_TILES_H,
  MAU_OFFICE_SCENE_MIN_TILES_W,
  cloneMauOfficeSceneConfig,
  markerRoleNeedsOutsideTile,
  type MauOfficeMarkerRole,
  type MauOfficeSceneAutotilePlacement,
  type MauOfficeSceneConfig,
  type MauOfficeSceneMarker,
  type MauOfficeScenePropPlacement,
  type MauOfficeZoneId,
} from "../mau-office-scene.ts";

export type MauOfficeEditorTool = "select" | "zone" | "wall" | "prop" | "autotile" | "marker";
export type MauOfficeEditorBrushMode = "paint" | "erase";
export type MauOfficeEditorSelection =
  | { kind: "prop"; id: string }
  | { kind: "autotile"; id: string }
  | { kind: "marker"; id: string }
  | null;

export const MAU_OFFICE_EDITOR_HISTORY_LIMIT = 100;

const SINGLETON_MARKER_ROLES = new Set<MauOfficeMarkerRole>([
  "spawn.office",
  "spawn.support",
  "desk.board",
  "meeting.presenter",
  "break.arcade",
  "break.snack",
  "break.jukebox",
  "break.reading",
]);

function clampTile(value: number, maxExclusive: number): number {
  return Math.max(0, Math.min(maxExclusive - 1, Math.round(value)));
}

function clampPlacementTile(value: number, span: number, maxExclusive: number): number {
  const rounded = Math.round(value);
  const boundedSpan = Math.max(1, Math.ceil(span));
  const maxStart = Math.max(0, maxExclusive - boundedSpan);
  return Math.max(0, Math.min(maxStart, rounded));
}

function clampPlacementPosition(value: number, span: number, maxExclusive: number): number {
  const boundedSpan = Math.max(1, Math.ceil(span));
  const maxStart = Math.max(0, maxExclusive - boundedSpan);
  return Math.max(0, Math.min(maxStart, value));
}

function clampCanvasTileCount(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function wallAt(scene: MauOfficeSceneConfig, tileX: number, tileY: number): boolean {
  if (
    tileY < 0 ||
    tileY >= scene.wallRows.length ||
    tileX < 0 ||
    tileX >= (scene.wallRows[tileY]?.length ?? 0)
  ) {
    return false;
  }
  return scene.wallRows[tileY]?.[tileX] === true;
}

function resolveNearestMarkerTile(
  scene: MauOfficeSceneConfig,
  tileX: number,
  tileY: number,
): { tileX: number; tileY: number } {
  const width = scene.zoneRows[0]?.length ?? 0;
  const height = scene.zoneRows.length;
  const startTileX = clampTile(tileX, width);
  const startTileY = clampTile(tileY, height);
  const isAllowed = (candidateX: number, candidateY: number) =>
    (scene.zoneRows[candidateY]?.[candidateX] ?? "outside") !== "outside" &&
    !wallAt(scene, candidateX, candidateY);
  if (isAllowed(startTileX, startTileY)) {
    return { tileX: startTileX, tileY: startTileY };
  }
  const queue: Array<{ tileX: number; tileY: number }> = [{ tileX: startTileX, tileY: startTileY }];
  const seen = new Set<string>([`${startTileX},${startTileY}`]);
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
      if (
        nextTileX < 0 ||
        nextTileX >= width ||
        nextTileY < 0 ||
        nextTileY >= height
      ) {
        continue;
      }
      const nextKey = `${nextTileX},${nextTileY}`;
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

function nextId(existingIds: string[], prefix: string): string {
  let next = existingIds.length + 1;
  const seen = new Set(existingIds);
  while (seen.has(`${prefix}_${next}`)) {
    next += 1;
  }
  return `${prefix}_${next}`;
}

function markerPrefix(role: MauOfficeMarkerRole): string {
  switch (role) {
    case "spawn.office":
      return "outside_mauHome";
    case "spawn.support":
      return "outside_support";
    case "desk.board":
      return "desk_board";
    case "meeting.presenter":
      return "meeting_presenter";
    case "desk.workerSeat":
      return "desk_worker";
    case "meeting.seat":
      return "meeting_seat";
    case "support.staff":
      return "support_staff";
    case "support.customer":
      return "support_customer";
    case "break.arcade":
      return "break_arcade";
    case "break.snack":
      return "break_snack";
    case "break.volley":
      return "break_volley";
    case "break.tableSeat":
      return "break_table";
    case "break.chase":
      return "break_chase";
    case "break.game":
      return "break_game";
    case "break.jukebox":
      return "break_jukebox";
    case "break.reading":
      return "break_reading";
  }
}

function defaultMarkerPose(role: MauOfficeMarkerRole): MauOfficeSceneMarker["pose"] {
  return role === "desk.workerSeat" || role === "meeting.seat" || role === "break.tableSeat"
    ? "sit"
    : "stand";
}

function defaultMarkerFacing(role: MauOfficeMarkerRole): MauOfficeSceneMarker["facingOverride"] {
  switch (role) {
    case "spawn.office":
    case "spawn.support":
      return "north";
    case "meeting.presenter":
      return "south";
    case "support.customer":
      return "north";
    case "break.arcade":
    case "break.reading":
      return "west";
    case "break.tableSeat":
      return "south";
    default:
      return "north";
  }
}

export function paintSceneZone(
  scene: MauOfficeSceneConfig,
  tileX: number,
  tileY: number,
  zone: MauOfficeZoneId,
): MauOfficeSceneConfig {
  const next = cloneMauOfficeSceneConfig(scene);
  const x = clampTile(tileX, next.zoneRows[0]?.length ?? 0);
  const y = clampTile(tileY, next.zoneRows.length);
  if (!next.zoneRows[y] || next.zoneRows[y]![x] === zone) {
    return next;
  }
  next.zoneRows[y]![x] = zone;
  return next;
}

export function paintSceneWall(
  scene: MauOfficeSceneConfig,
  tileX: number,
  tileY: number,
  present: boolean,
): MauOfficeSceneConfig {
  const next = cloneMauOfficeSceneConfig(scene);
  const x = clampTile(tileX, next.wallRows[0]?.length ?? 0);
  const y = clampTile(tileY, next.wallRows.length);
  if (!next.wallRows[y]) {
    return next;
  }
  next.wallRows[y]![x] = present;
  return next;
}

export function placeSceneProp(
  scene: MauOfficeSceneConfig,
  itemId: string,
  tileX: number,
  tileY: number,
): { scene: MauOfficeSceneConfig; id: string | null } {
  const item = MAU_OFFICE_CATALOG[itemId];
  if (!item || item.autotileMode) {
    return { scene, id: null };
  }
  const next = cloneMauOfficeSceneConfig(scene);
  const x = clampTile(tileX, next.zoneRows[0]?.length ?? 0);
  const y = clampTile(tileY, next.zoneRows.length);
  const mountOnWall = wallAt(next, x, y) && item.mount !== "wall";
  const id = nextId(
    next.props.map((entry) => entry.id),
    itemId.replace(/[^a-z0-9]+/giu, "-"),
  );
  next.props.push({
    id,
    itemId,
    tileX: x,
    tileY: y,
    mountOverride: mountOnWall ? "wall" : undefined,
  });
  return { scene: next, id };
}

function cellKey(tileX: number, tileY: number): string {
  return `${Math.round(tileX)},${Math.round(tileY)}`;
}

function normalizeCells(
  cells: MauOfficeSceneAutotilePlacement["cells"],
): MauOfficeSceneAutotilePlacement["cells"] {
  const unique = new Map<string, { tileX: number; tileY: number }>();
  for (const cell of cells) {
    unique.set(cellKey(cell.tileX, cell.tileY), {
      tileX: Math.round(cell.tileX),
      tileY: Math.round(cell.tileY),
    });
  }
  return [...unique.values()].sort(
    (left, right) => left.tileY - right.tileY || left.tileX - right.tileX,
  );
}

export function paintSceneAutotileCell(
  scene: MauOfficeSceneConfig,
  itemId: string,
  tileX: number,
  tileY: number,
  mode: MauOfficeEditorBrushMode,
): { scene: MauOfficeSceneConfig; id: string | null } {
  const item = MAU_OFFICE_CATALOG[itemId];
  if (!item?.autotileMode) {
    return { scene, id: null };
  }
  const next = cloneMauOfficeSceneConfig(scene);
  const roundedTileX = Math.round(tileX);
  const roundedTileY = Math.round(tileY);
  const key = cellKey(roundedTileX, roundedTileY);
  let target = next.autotiles.find((entry) => entry.itemId === itemId) ?? null;
  if (!target && mode === "paint") {
    target = {
      id: nextId(
        next.autotiles.map((entry) => entry.id),
        itemId.replace(/[^a-z0-9]+/giu, "-"),
      ),
      itemId,
      cells: [],
    };
    next.autotiles.push(target);
  }
  if (!target) {
    return { scene: next, id: null };
  }
  const hasCell = target.cells.some((cell) => cellKey(cell.tileX, cell.tileY) === key);
  target.cells =
    mode === "paint"
      ? hasCell
        ? target.cells
        : normalizeCells([...target.cells, { tileX: roundedTileX, tileY: roundedTileY }])
      : normalizeCells(target.cells.filter((cell) => cellKey(cell.tileX, cell.tileY) !== key));
  next.autotiles = next.autotiles.filter((entry) => entry.cells.length > 0);
  return { scene: next, id: target.cells.length > 0 ? target.id : null };
}

export function placeSceneMarker(
  scene: MauOfficeSceneConfig,
  role: MauOfficeMarkerRole,
  tileX: number,
  tileY: number,
): { scene: MauOfficeSceneConfig; id: string } {
  const next = cloneMauOfficeSceneConfig(scene);
  const resolvedTile = markerRoleNeedsOutsideTile(role)
    ? {
        tileX: clampTile(tileX, next.zoneRows[0]?.length ?? 0),
        tileY,
      }
    : resolveNearestMarkerTile(next, tileX, tileY);
  if (SINGLETON_MARKER_ROLES.has(role)) {
    const existing = next.markers.find((entry) => entry.role === role);
    if (existing) {
      existing.tileX = resolvedTile.tileX;
      existing.tileY = resolvedTile.tileY;
      return { scene: next, id: existing.id };
    }
  }
  const prefix = markerPrefix(role);
  const id =
    SINGLETON_MARKER_ROLES.has(role) && !next.markers.some((entry) => entry.id === prefix)
      ? prefix
      : nextId(
          next.markers.map((entry) => entry.id),
          prefix,
        );
  next.markers.push({
    id,
    role,
    tileX: resolvedTile.tileX,
    tileY: resolvedTile.tileY,
    pose: defaultMarkerPose(role),
    layer: role === "spawn.office" || role === "spawn.support" ? 0 : 3,
    facingOverride: defaultMarkerFacing(role),
  });
  return { scene: next, id };
}

export function removeSceneSelection(
  scene: MauOfficeSceneConfig,
  selection: MauOfficeEditorSelection,
): MauOfficeSceneConfig {
  if (!selection) {
    return scene;
  }
  const next = cloneMauOfficeSceneConfig(scene);
  if (selection.kind === "prop") {
    next.props = next.props.filter((entry) => entry.id !== selection.id);
  } else if (selection.kind === "autotile") {
    next.autotiles = next.autotiles.filter((entry) => entry.id !== selection.id);
  } else {
    next.markers = next.markers.filter((entry) => entry.id !== selection.id);
  }
  return next;
}

export function sceneSelectionExists(
  scene: MauOfficeSceneConfig,
  selection: MauOfficeEditorSelection,
): boolean {
  if (!selection) {
    return false;
  }
  if (selection.kind === "prop") {
    return scene.props.some((entry) => entry.id === selection.id);
  }
  if (selection.kind === "autotile") {
    return scene.autotiles.some((entry) => entry.id === selection.id);
  }
  return scene.markers.some((entry) => entry.id === selection.id);
}

export function normalizeSceneSelection(
  scene: MauOfficeSceneConfig,
  selection: MauOfficeEditorSelection,
): MauOfficeEditorSelection {
  return sceneSelectionExists(scene, selection) ? selection : null;
}

function sceneHistoryKey(scene: MauOfficeSceneConfig): string {
  return JSON.stringify(scene);
}

function cloneHistoryStack(stack: MauOfficeSceneConfig[]): MauOfficeSceneConfig[] {
  return stack.map((entry) => cloneMauOfficeSceneConfig(entry));
}

export function scenesMatch(
  left: MauOfficeSceneConfig,
  right: MauOfficeSceneConfig,
): boolean {
  return sceneHistoryKey(left) === sceneHistoryKey(right);
}

export function commitSceneHistory(params: {
  current: MauOfficeSceneConfig;
  next: MauOfficeSceneConfig;
  undo: MauOfficeSceneConfig[];
  redo: MauOfficeSceneConfig[];
}): {
  changed: boolean;
  undo: MauOfficeSceneConfig[];
  redo: MauOfficeSceneConfig[];
} {
  if (scenesMatch(params.current, params.next)) {
    return {
      changed: false,
      undo: cloneHistoryStack(params.undo),
      redo: cloneHistoryStack(params.redo),
    };
  }
  const undo = [
    ...params.undo.map((entry) => cloneMauOfficeSceneConfig(entry)),
    cloneMauOfficeSceneConfig(params.current),
  ].slice(-MAU_OFFICE_EDITOR_HISTORY_LIMIT);
  return {
    changed: true,
    undo,
    redo: [],
  };
}

export function undoSceneHistory(params: {
  draft: MauOfficeSceneConfig;
  undo: MauOfficeSceneConfig[];
  redo: MauOfficeSceneConfig[];
}): {
  draft: MauOfficeSceneConfig;
  undo: MauOfficeSceneConfig[];
  redo: MauOfficeSceneConfig[];
} | null {
  if (params.undo.length === 0) {
    return null;
  }
  const previous = cloneMauOfficeSceneConfig(params.undo[params.undo.length - 1]!);
  return {
    draft: previous,
    undo: params.undo.slice(0, -1).map((entry) => cloneMauOfficeSceneConfig(entry)),
    redo: [
      ...params.redo.map((entry) => cloneMauOfficeSceneConfig(entry)),
      cloneMauOfficeSceneConfig(params.draft),
    ].slice(-MAU_OFFICE_EDITOR_HISTORY_LIMIT),
  };
}

export function redoSceneHistory(params: {
  draft: MauOfficeSceneConfig;
  undo: MauOfficeSceneConfig[];
  redo: MauOfficeSceneConfig[];
}): {
  draft: MauOfficeSceneConfig;
  undo: MauOfficeSceneConfig[];
  redo: MauOfficeSceneConfig[];
} | null {
  if (params.redo.length === 0) {
    return null;
  }
  const next = cloneMauOfficeSceneConfig(params.redo[params.redo.length - 1]!);
  return {
    draft: next,
    undo: [
      ...params.undo.map((entry) => cloneMauOfficeSceneConfig(entry)),
      cloneMauOfficeSceneConfig(params.draft),
    ].slice(-MAU_OFFICE_EDITOR_HISTORY_LIMIT),
    redo: params.redo.slice(0, -1).map((entry) => cloneMauOfficeSceneConfig(entry)),
  };
}

export function updateScenePropPlacement(
  scene: MauOfficeSceneConfig,
  id: string,
  patch: Partial<MauOfficeScenePropPlacement>,
): MauOfficeSceneConfig {
  const next = cloneMauOfficeSceneConfig(scene);
  const target = next.props.find((entry) => entry.id === id);
  if (!target) {
    return next;
  }
  Object.assign(target, patch);
  return next;
}

export function updateSceneAutotilePlacement(
  scene: MauOfficeSceneConfig,
  id: string,
  patch: Partial<Omit<MauOfficeSceneAutotilePlacement, "cells">>,
): MauOfficeSceneConfig {
  const next = cloneMauOfficeSceneConfig(scene);
  const target = next.autotiles.find((entry) => entry.id === id);
  if (!target) {
    return next;
  }
  Object.assign(target, patch);
  return next;
}

export function updateSceneMarker(
  scene: MauOfficeSceneConfig,
  id: string,
  patch: Partial<MauOfficeSceneMarker>,
): MauOfficeSceneConfig {
  const next = cloneMauOfficeSceneConfig(scene);
  const target = next.markers.find((entry) => entry.id === id);
  if (!target) {
    return next;
  }
  Object.assign(target, patch);
  if (markerRoleNeedsOutsideTile(target.role)) {
    target.tileX = clampTile(target.tileX, next.zoneRows[0]?.length ?? 0);
    return next;
  }
  const resolved = resolveNearestMarkerTile(next, target.tileX, target.tileY);
  target.tileX = resolved.tileX;
  target.tileY = resolved.tileY;
  return next;
}

export function moveSceneSelection(
  scene: MauOfficeSceneConfig,
  selection: MauOfficeEditorSelection,
  tileX: number,
  tileY: number,
): MauOfficeSceneConfig {
  if (!selection) {
    return scene;
  }
  const next = cloneMauOfficeSceneConfig(scene);
  const maxTileX = next.zoneRows[0]?.length ?? 0;
  const maxTileY = next.zoneRows.length;
  if (selection.kind === "prop") {
    const target = next.props.find((entry) => entry.id === selection.id);
    const item = target ? MAU_OFFICE_CATALOG[target.itemId] : null;
    if (!target || !item) {
      return next;
    }
    target.tileX = clampPlacementTile(tileX, item.tileWidth, maxTileX);
    target.tileY = clampPlacementTile(tileY, item.tileHeight, maxTileY);
    if (target.mountOverride == null && wallAt(next, target.tileX, target.tileY) && item.mount !== "wall") {
      target.mountOverride = "wall";
    }
    return next;
  }
  if (selection.kind === "autotile") {
    const target = next.autotiles.find((entry) => entry.id === selection.id);
    if (!target || target.cells.length === 0) {
      return next;
    }
    const minTileX = Math.min(...target.cells.map((cell) => Math.round(cell.tileX)));
    const minTileY = Math.min(...target.cells.map((cell) => Math.round(cell.tileY)));
    const maxCellTileX = Math.max(...target.cells.map((cell) => Math.round(cell.tileX)));
    const maxCellTileY = Math.max(...target.cells.map((cell) => Math.round(cell.tileY)));
    const width = maxCellTileX - minTileX + 1;
    const height = maxCellTileY - minTileY + 1;
    const nextMinTileX = clampPlacementTile(tileX, width, maxTileX);
    const nextMinTileY = clampPlacementTile(tileY, height, maxTileY);
    const deltaTileX = nextMinTileX - minTileX;
    const deltaTileY = nextMinTileY - minTileY;
    target.cells = normalizeCells(
      target.cells.map((cell) => ({
        tileX: Math.round(cell.tileX) + deltaTileX,
        tileY: Math.round(cell.tileY) + deltaTileY,
      })),
    );
    return next;
  }
  const target = next.markers.find((entry) => entry.id === selection.id);
  if (!target) {
    return next;
  }
  if (markerRoleNeedsOutsideTile(target.role)) {
    target.tileX = clampTile(tileX, maxTileX);
    target.tileY = tileY;
    return next;
  }
  const resolved = resolveNearestMarkerTile(next, tileX, tileY);
  target.tileX = resolved.tileX;
  target.tileY = resolved.tileY;
  return next;
}

export function resizeSceneCanvas(
  scene: MauOfficeSceneConfig,
  width: number,
  height: number,
): MauOfficeSceneConfig {
  const targetWidth = clampCanvasTileCount(
    width,
    MAU_OFFICE_SCENE_MIN_TILES_W,
    MAU_OFFICE_SCENE_MAX_TILES_W,
  );
  const targetHeight = clampCanvasTileCount(
    height,
    MAU_OFFICE_SCENE_MIN_TILES_H,
    MAU_OFFICE_SCENE_MAX_TILES_H,
  );
  const currentWidth = scene.zoneRows[0]?.length ?? 0;
  const currentHeight = scene.zoneRows.length;
  if (currentWidth === targetWidth && currentHeight === targetHeight) {
    return cloneMauOfficeSceneConfig(scene);
  }
  const next = cloneMauOfficeSceneConfig(scene);
  next.zoneRows = Array.from({ length: targetHeight }, (_, tileY) =>
    Array.from(
      { length: targetWidth },
      (_, tileX) => next.zoneRows[tileY]?.[tileX] ?? "outside",
    ),
  );
  next.wallRows = Array.from({ length: targetHeight }, (_, tileY) =>
    Array.from({ length: targetWidth }, (_, tileX) => next.wallRows[tileY]?.[tileX] === true),
  );
  next.props = next.props.map((entry) => {
    const item = MAU_OFFICE_CATALOG[entry.itemId];
    return {
      ...entry,
      tileX: clampPlacementPosition(entry.tileX, item?.tileWidth ?? 1, targetWidth),
      tileY: clampPlacementPosition(entry.tileY, item?.tileHeight ?? 1, targetHeight),
    };
  });
  next.autotiles = next.autotiles
    .map((entry) => ({
      ...entry,
      cells: normalizeCells(
        entry.cells.filter(
          (cell) =>
            Math.round(cell.tileX) >= 0 &&
            Math.round(cell.tileX) < targetWidth &&
            Math.round(cell.tileY) >= 0 &&
            Math.round(cell.tileY) < targetHeight,
        ),
      ),
    }))
    .filter((entry) => entry.cells.length > 0);
  next.markers = next.markers.map((entry) => {
    if (markerRoleNeedsOutsideTile(entry.role)) {
      return {
        ...entry,
        tileX: clampTile(entry.tileX, targetWidth),
        tileY: targetHeight,
      };
    }
    const resolved = resolveNearestMarkerTile(next, entry.tileX, entry.tileY);
    return {
      ...entry,
      tileX: resolved.tileX,
      tileY: resolved.tileY,
    };
  });
  return next;
}

function propOccupiesTile(
  entry: MauOfficeScenePropPlacement,
  tileX: number,
  tileY: number,
): boolean {
  const item = MAU_OFFICE_CATALOG[entry.itemId];
  if (!item) {
    return false;
  }
  return (
    tileX >= Math.floor(entry.tileX) &&
    tileX < Math.ceil(entry.tileX + item.tileWidth) &&
    tileY >= Math.floor(entry.tileY) &&
    tileY < Math.ceil(entry.tileY + item.tileHeight)
  );
}

export function hitTestSceneSelection(
  scene: MauOfficeSceneConfig,
  tileX: number,
  tileY: number,
): MauOfficeEditorSelection {
  for (let index = scene.markers.length - 1; index >= 0; index -= 1) {
    const marker = scene.markers[index]!;
    if (Math.round(marker.tileX) === tileX && Math.round(marker.tileY) === tileY) {
      return { kind: "marker", id: marker.id };
    }
  }
  for (let index = scene.props.length - 1; index >= 0; index -= 1) {
    const entry = scene.props[index]!;
    if (propOccupiesTile(entry, tileX, tileY)) {
      return { kind: "prop", id: entry.id };
    }
  }
  for (let index = scene.autotiles.length - 1; index >= 0; index -= 1) {
    const entry = scene.autotiles[index]!;
    if (entry.cells.some((cell) => cellKey(cell.tileX, cell.tileY) === cellKey(tileX, tileY))) {
      return { kind: "autotile", id: entry.id };
    }
  }
  return null;
}
