import {
  MAU_OFFICE_BUBBLE_FRAME_ASSETS,
  MAU_OFFICE_BUBBLE_TAIL_ASSET,
  MAU_OFFICE_LAYOUT,
  MAU_OFFICE_PATH_DOT_ASSETS,
  MAU_OFFICE_PATH_TARGET_ASSETS,
  MAU_OFFICE_PATH_TURN_ASSETS,
  MAU_OFFICE_WORKER_RIGS,
} from "./mau-office-contract.ts";
import { MAU_OFFICE_CATALOG } from "./mau-office-scene.ts";

export type MauOfficePixellabAssetFamily = "board" | "floor" | "prop" | "shell" | "ui" | "worker";

export type MauOfficePixellabProvenance = {
  asset: string;
  family: MauOfficePixellabAssetFamily;
  tool:
    | "animate_character"
    | "create_character"
    | "create_map_object"
    | "create_tiles_pro"
    | "create_topdown_tileset"
    | "existing_pack"
    | "local_placeholder_derive"
    | "uploaded_sheet_slice";
  jobId: string;
  selectedOutput: string;
  prompt: string;
  postprocess: string[];
  beautyStatus: "accepted" | "retry";
  beautyCritique: string;
};

export function collectMauOfficeReferencedAssetPaths(): string[] {
  const assets = new Set<string>();
  for (const item of Object.values(MAU_OFFICE_CATALOG)) {
    if (item.asset) {
      assets.add(item.asset);
    }
    if (item.sliceAssets) {
      for (const asset of Object.values(item.sliceAssets)) {
        assets.add(asset);
      }
    }
    if (item.loops) {
      for (const loop of item.loops.values) {
        for (const asset of loop.frames) {
          assets.add(asset);
        }
      }
    }
  }
  for (const tile of MAU_OFFICE_LAYOUT.map.floorTiles) {
    assets.add(tile.asset);
  }
  for (const sprite of [
    ...MAU_OFFICE_LAYOUT.map.wallSprites,
    ...MAU_OFFICE_LAYOUT.map.propSprites,
  ]) {
    assets.add(sprite.asset);
  }
  for (const label of MAU_OFFICE_LAYOUT.map.labels) {
    assets.add(label.asset);
  }
  for (const asset of Object.values(MAU_OFFICE_PATH_TARGET_ASSETS)) {
    assets.add(asset);
  }
  for (const asset of Object.values(MAU_OFFICE_PATH_DOT_ASSETS)) {
    assets.add(asset);
  }
  for (const asset of Object.values(MAU_OFFICE_PATH_TURN_ASSETS)) {
    assets.add(asset);
  }
  for (const asset of Object.values(MAU_OFFICE_BUBBLE_FRAME_ASSETS)) {
    assets.add(asset);
  }
  assets.add(MAU_OFFICE_BUBBLE_TAIL_ASSET);
  for (const rig of Object.values(MAU_OFFICE_WORKER_RIGS)) {
    for (const animation of Object.values(rig.stand)) {
      for (const asset of animation.frames) {
        assets.add(asset);
      }
    }
    for (const animation of Object.values(rig.sit)) {
      for (const asset of animation.frames) {
        assets.add(asset);
      }
    }
    for (const animation of Object.values(rig.walk)) {
      for (const asset of animation.frames) {
        assets.add(asset);
      }
    }
    for (const animation of Object.values(rig.reach)) {
      for (const asset of animation.frames) {
        assets.add(asset);
      }
    }
    for (const animation of Object.values(rig.dance)) {
      for (const asset of animation.frames) {
        assets.add(asset);
      }
    }
    for (const animation of Object.values(rig.jump)) {
      for (const asset of animation.frames) {
        assets.add(asset);
      }
    }
    for (const animation of Object.values(rig.chase)) {
      for (const asset of animation.frames) {
        assets.add(asset);
      }
    }
    for (const animation of Object.values(rig.chat)) {
      for (const asset of animation.frames) {
        assets.add(asset);
      }
    }
    for (const asset of rig.sleepFloor.frames) {
      assets.add(asset);
    }
  }
  return Array.from(assets).sort();
}

function entry(params: {
  asset: string;
  family: MauOfficePixellabAssetFamily;
  tool: MauOfficePixellabProvenance["tool"];
  jobId: string;
  selectedOutput: string;
  prompt: string;
  postprocess: string[];
  beautyCritique: string;
}): MauOfficePixellabProvenance {
  return {
    ...params,
    beautyStatus: "accepted",
  };
}

function uploaded(
  asset: string,
  family: MauOfficePixellabAssetFamily,
  sourceSheet: string,
  sourceName: string,
  beautyCritique: string,
): MauOfficePixellabProvenance {
  return entry({
    asset,
    family,
    tool: "uploaded_sheet_slice",
    jobId: `upload:${sourceSheet}:${sourceName}`,
    selectedOutput: sourceName,
    prompt: `Imported from ${sourceSheet} and normalized into the landscape MauOffice transparent asset pack.`,
    postprocess: ["trim uploaded sprite bounds", "normalize onto the shared 64px MauOffice grid"],
    beautyCritique,
  });
}

function existing(
  asset: string,
  family: MauOfficePixellabAssetFamily,
  beautyCritique: string,
): MauOfficePixellabProvenance {
  return entry({
    asset,
    family,
    tool: "existing_pack",
    jobId: `existing:${asset.replaceAll("/", ":")}`,
    selectedOutput: asset.split("/").pop() ?? asset,
    prompt:
      "Preserve the existing MauOffice UI or worker sprite while refitting the surrounding scene.",
    postprocess: ["keep original native canvas", "reuse existing accepted pack asset"],
    beautyCritique,
  });
}

const FIXED_UPLOADED_ENTRIES = [
  uploaded(
    "mau-office/tiles/floor-room-a.png",
    "floor",
    "tileset.png",
    "floor-tile.png",
    "Warm cream floor tile keeps the soft office palette and scales cleanly across the larger map.",
  ),
  uploaded(
    "mau-office/tiles/floor-room-b.png",
    "floor",
    "tileset.png",
    "floor-tile.png",
    "Variant B stays within the same pale floor family for subtle room variation.",
  ),
  uploaded(
    "mau-office/tiles/floor-room-c.png",
    "floor",
    "tileset.png",
    "floor-tile.png",
    "Variant C keeps the room interiors from feeling flat while preserving the mockup look.",
  ),
  uploaded(
    "mau-office/tiles/floor-room-d.png",
    "floor",
    "tileset.png",
    "floor-tile.png",
    "Variant D rounds out the room-floor mix without breaking the tile-native style.",
  ),
  uploaded(
    "mau-office/tiles/floor-hall-a.png",
    "floor",
    "tileset.png",
    "floor-tile.png",
    "Hall floor variant A keeps the corridor brighter than the wall band.",
  ),
  uploaded(
    "mau-office/tiles/floor-hall-b.png",
    "floor",
    "tileset.png",
    "floor-tile.png",
    "Hall floor variant B adds a small amount of texture without visual noise.",
  ),
  uploaded(
    "mau-office/tiles/wall-front-left.png",
    "shell",
    "tileset wall tall.png",
    "wall-tall-9slice-top-left.png",
    "The taller top-left wall slice gives boards enough vertical breathing room without breaking the warm shell style.",
  ),
  uploaded(
    "mau-office/tiles/wall-front-mid.png",
    "shell",
    "tileset wall tall.png",
    "wall-tall-9slice-top-center.png",
    "The taller repeating wall band reduces the hall visually and gives the shared wall more usable height.",
  ),
  uploaded(
    "mau-office/tiles/wall-front-right.png",
    "shell",
    "tileset wall tall.png",
    "wall-tall-9slice-top-right.png",
    "The taller right cap mirrors the left and keeps the expanded wall band consistent across the top rooms.",
  ),
  uploaded(
    "mau-office/tiles/wall-side-left.png",
    "shell",
    "tileset.png",
    "wall-9slice-middle-left.png",
    "The thin left side strip matches the uploaded wall slice instead of reading as a full slab.",
  ),
  uploaded(
    "mau-office/tiles/wall-side-right.png",
    "shell",
    "tileset.png",
    "wall-9slice-middle-right.png",
    "The thin right side strip matches the uploaded wall slice and keeps the hallway edges delicate.",
  ),
  uploaded(
    "mau-office/tiles/wall-bottom.png",
    "shell",
    "tileset.png",
    "wall-9slice-bottom-center.png",
    "The bottom wall band closes each room with the same warm wood trim.",
  ),
  uploaded(
    "mau-office/tiles/wall-corner-bl.png",
    "shell",
    "tileset.png",
    "wall-9slice-bottom-left.png",
    "Bottom-left wall corner keeps the room shells feeling authored rather than algorithmic.",
  ),
  uploaded(
    "mau-office/tiles/wall-corner-br.png",
    "shell",
    "tileset.png",
    "wall-9slice-bottom-right.png",
    "Bottom-right wall corner stays consistent with the uploaded shell style.",
  ),
  uploaded(
    "mau-office/tiles/hall-cap-left.png",
    "shell",
    "tileset wall tall.png",
    "wall-tall-9slice-top-right.png",
    "The left hall cap now uses the tall wall's top-right corner so the blocked opening closes with a proper corner instead of a thin side strip.",
  ),
  uploaded(
    "mau-office/tiles/hall-cap-right.png",
    "shell",
    "tileset wall tall.png",
    "wall-tall-9slice-top-left.png",
    "The right hall cap now uses the tall wall's top-left corner so the blocked opening closes cleanly without the broken side-strip seam.",
  ),
  uploaded(
    "mau-office/items/desk-wide-v1.png",
    "prop",
    "objects.png",
    "desk-large.png",
    "The wide work desk anchors the top-left room and matches the reference layout much better than the old 2x2 pod.",
  ),
  uploaded(
    "mau-office/items/monitor-code-v1.png",
    "prop",
    "objects.png",
    "monitor-code.png",
    "Code monitor keeps one workstation distinct without changing the shared style.",
  ),
  uploaded(
    "mau-office/items/monitor-chart-v1.png",
    "prop",
    "objects.png",
    "monitor-chart.png",
    "Chart monitor adds the variation the workroom needed while staying readable at subgrid size.",
  ),
  uploaded(
    "mau-office/items/desktop-monitor-v1.png",
    "prop",
    "objects-2.png",
    "desktop-monitor.png",
    "Generic desktop monitor rounds out the desk set for non-code desks.",
  ),
  uploaded(
    "mau-office/items/monitor-back-v1.png",
    "prop",
    "objects-2.png",
    "monitor-back.png",
    "Monitor-back lets the customer desk read from the visitor side instead of repeating the same front-facing screen.",
  ),
  uploaded(
    "mau-office/items/fax-machine-v1.png",
    "prop",
    "objects-2.png",
    "fax-machine.png",
    "Fax machine gives the telephony counter a dedicated calling prop instead of reusing a generic monitor.",
  ),
  uploaded(
    "mau-office/items/book-open-v1.png",
    "prop",
    "objects.png",
    "book-open.png",
    "Open book gives the work desks a softer lived-in feel at half-tile scale.",
  ),
  uploaded(
    "mau-office/items/book-stack-closed-v1.png",
    "prop",
    "objects.png",
    "book-stack-closed.png",
    "Closed book stack adds desk variety without stealing focus from the workers.",
  ),
  uploaded(
    "mau-office/items/book-stack-mixed-v1.png",
    "prop",
    "objects.png",
    "book-stack-mixed.png",
    "Mixed stack breaks repetition across the six desks and fits the office palette.",
  ),
  uploaded(
    "mau-office/items/paper-stack-v1.png",
    "prop",
    "objects-2.png",
    "paper-stack.png",
    "Paper stack gives both work desks and the support desk lightweight surface detail.",
  ),
  uploaded(
    "mau-office/items/server-rack-v1.png",
    "prop",
    "objects.png",
    "server-rack.png",
    "Server rack works well as an aisle machine between desk banks and keeps the work room technical.",
  ),
  uploaded(
    "mau-office/tiles/kanban-board.png",
    "board",
    "objects.png",
    "kanban-board-wide.png",
    "Wide kanban board gives the top-left wall the same planning-heavy feel as the reference scene.",
  ),
  uploaded(
    "mau-office/tiles/desk-roadmap-board-v1.png",
    "board",
    "objects.png",
    "roadmap-board-wide.png",
    "Wide roadmap board balances the kanban board and makes the desk room read as a team workspace.",
  ),
  uploaded(
    "mau-office/tiles/calendar-wall-v1.png",
    "board",
    "objects.png",
    "calendar-wall.png",
    "Wall calendar is a compact detail that helps fill the long desk-room wall cleanly.",
  ),
  uploaded(
    "mau-office/tiles/wall-clocks.png",
    "board",
    "objects.png",
    "clock-time-left.png",
    "Clock cluster captures the time-zone wall from the reference instead of a single generic clock.",
  ),
  uploaded(
    "mau-office/tiles/security-camera-v1.png",
    "board",
    "objects.png",
    "security-camera.png",
    "Tiny security camera sharpens the top-right of the work room without adding clutter.",
  ),
  uploaded(
    "mau-office/items/round-table-v1.png",
    "prop",
    "objects-2.png",
    "round-table.png",
    "Round table gives the lounge a social center that sits naturally over the rug.",
  ),
  uploaded(
    "mau-office/items/beanbag-blue-v1.png",
    "prop",
    "objects-2.png",
    "beanbag-blue.png",
    "Blue beanbag keeps the lounge playful and soft.",
  ),
  uploaded(
    "mau-office/items/beanbag-green-v1.png",
    "prop",
    "objects-2.png",
    "beanbag-green.png",
    "Green beanbag helps the lounge feel intentionally mixed instead of cloned.",
  ),
  uploaded(
    "mau-office/items/beanbag-pink-v1.png",
    "prop",
    "objects-2.png",
    "beanbag-pink.png",
    "Pink beanbag matches the uploaded sheet and gives the break room a warm accent.",
  ),
  uploaded(
    "mau-office/items/arcade-v2.png",
    "prop",
    "objects-2.png",
    "arcade-cabinet-a.png",
    "Arcade cabinet keeps the break room lively and matches the earlier MauOffice vibe.",
  ),
  uploaded(
    "mau-office/items/snack-shelf-v1.png",
    "prop",
    "objects-2.png",
    "snack-shelf.png",
    "Snack shelf gives the lounge a clear destination instead of empty wall space.",
  ),
  uploaded(
    "mau-office/items/foosball-v1.png",
    "prop",
    "objects-2.png",
    "foosball-table.png",
    "Foosball table turns the lower-left room into a true idle zone, not just decorative furniture.",
  ),
  uploaded(
    "mau-office/items/neon-sign-v1.png",
    "prop",
    "objects-2.png",
    "neon-sign.png",
    "Neon sign adds atmosphere above the lounge without breaking the pixel discipline.",
  ),
  entry({
    asset: "mau-office/items/zone-sign-v1.png",
    family: "board",
    tool: "create_map_object",
    jobId: "00fbc321-61ef-4a08-bc95-5d24e5955d40",
    selectedOutput: "zone-sign-v1.png",
    prompt:
      "front-facing pixel art office wall zone sign plaque spanning nearly the entire canvas width, wide cream enamel sign with warm wood trim and tiny brass corner pins, blank center panel reserved for text, no letters, no symbols, edge-to-edge horizontal plaque, transparent background",
    postprocess: [
      "accept the full-width blank plaque with the cleanest central text area",
      "download the Pixellab export onto the shared 192x64 MauOffice sign canvas",
      "overlay the fixed room-name text in the UI so every zone label stays crisp and editable from the fixed list",
    ],
    beautyCritique:
      "The blank plaque reads as an authored wall prop instead of a placeholder rectangle, and it leaves enough quiet space for the fixed room-name overlay to stay legible.",
  }),
  entry({
    asset: "mau-office/items/zone-sign-glow-v1.png",
    family: "board",
    tool: "create_map_object",
    jobId: "b07abdf0-6584-42dc-a2e6-f182a68298ae",
    selectedOutput: "zone-sign-glow-v1.png",
    prompt:
      "front-facing pixel art office wall zone sign plaque spanning nearly the entire canvas width, wide cream enamel sign with warm wood trim and tiny brass corner pins, blank center panel reserved for text, no letters, no symbols, slightly brighter cream panel with a subtle warm golden glow, edge-to-edge horizontal plaque, transparent background",
    postprocess: [
      "accept the brighter companion plaque that preserves the same silhouette as the base frame",
      "download the Pixellab export onto the shared 192x64 MauOffice sign canvas",
      "pair it with the base plaque as the zone-sign pulse loop while keeping the room-name overlay text identical across both frames",
    ],
    beautyCritique:
      "The lit frame gives the sign a gentle pulse without changing its shape, so the animation reads like a live sign instead of a popping sprite swap.",
  }),
  uploaded(
    "mau-office/items/bench-v1.png",
    "prop",
    "objects-2.png",
    "bench-seat.png",
    "Bench helps the lower rooms feel furnished at the perimeter instead of open and empty.",
  ),
  uploaded(
    "mau-office/items/plant-v1.png",
    "prop",
    "objects-2.png",
    "plant-potted.png",
    "Tall potted plant works in both meeting and support corners while matching the warm office look.",
  ),
  uploaded(
    "mau-office/tiles/meeting-board.png",
    "board",
    "objects-2.png",
    "whiteboard-roadmap.png",
    "Meeting whiteboard preserves the roadmap feel from the reference top-right room.",
  ),
  uploaded(
    "mau-office/items/chair-front-v1.png",
    "prop",
    "objects-2.png",
    "office-chair-front.png",
    "Front-facing chair gives the bottom edge of the meeting table a clean readable seat silhouette.",
  ),
  uploaded(
    "mau-office/items/chair-back-v1.png",
    "prop",
    "objects.png",
    "office-chair-back.png",
    "Back-facing chair keeps the top edge of the meeting table readable from the room camera.",
  ),
  uploaded(
    "mau-office/items/chair-left-v1.png",
    "prop",
    "objects-2.png",
    "office-chair-left.png",
    "Left-facing chair makes the meeting table feel properly wrapped, not front-and-back only.",
  ),
  uploaded(
    "mau-office/items/chair-right-v1.png",
    "prop",
    "objects-2.png",
    "office-chair-right.png",
    "Right-facing chair completes the all-sides meeting arrangement from the mockup.",
  ),
  uploaded(
    "mau-office/items/counter-left-v1.png",
    "prop",
    "tileset 2.png",
    "office-extension-top-left.png",
    "Left counter slice gives the support desk a proper cap instead of a blunt rectangle.",
  ),
  uploaded(
    "mau-office/items/counter-mid-v1.png",
    "prop",
    "tileset 2.png",
    "office-extension-top-center.png",
    "Center counter slice lets the support desk stretch wide across the smaller customer room.",
  ),
  uploaded(
    "mau-office/items/counter-right-v1.png",
    "prop",
    "tileset 2.png",
    "office-extension-top-right.png",
    "Right counter slice balances the customer desk and preserves the uploaded trim.",
  ),
  uploaded(
    "mau-office/tiles/notice-board-v1.png",
    "board",
    "objects-2.png",
    "notice-board.png",
    "Notice board helps the support wall read as staffed and active.",
  ),
].reduce<Record<string, MauOfficePixellabProvenance>>((acc, item) => {
  acc[item.asset] = item;
  return acc;
}, {});

for (const asset of [
  "mau-office/tiles/rug-r1c1.png",
  "mau-office/tiles/rug-r1c2.png",
  "mau-office/tiles/rug-r1c3.png",
  "mau-office/tiles/rug-r2c1.png",
  "mau-office/tiles/rug-r2c2.png",
  "mau-office/tiles/rug-r2c3.png",
  "mau-office/tiles/rug-r3c1.png",
  "mau-office/tiles/rug-r3c2.png",
  "mau-office/tiles/rug-r3c3.png",
]) {
  FIXED_UPLOADED_ENTRIES[asset] = uploaded(
    asset,
    "prop",
    "tileset.png",
    asset.split("/").pop() ?? asset,
    "Rug tile slices give the lounge its soft central zone without flattening the room into one big sprite.",
  );
}

for (const asset of [
  "mau-office/tiles/meeting-table-r1c1.png",
  "mau-office/tiles/meeting-table-r1c2.png",
  "mau-office/tiles/meeting-table-r1c3.png",
  "mau-office/tiles/meeting-table-r2c1.png",
  "mau-office/tiles/meeting-table-r2c2.png",
  "mau-office/tiles/meeting-table-r2c3.png",
  "mau-office/tiles/meeting-table-r3c1.png",
  "mau-office/tiles/meeting-table-r3c2.png",
  "mau-office/tiles/meeting-table-r3c3.png",
]) {
  FIXED_UPLOADED_ENTRIES[asset] = uploaded(
    asset,
    "prop",
    "tileset.png",
    asset.split("/").pop() ?? asset,
    "Meeting-table slices keep the top-right room modular and true to the uploaded autotile sheet.",
  );
}

const UI_ENTRIES: Record<string, MauOfficePixellabProvenance> = {};

for (const asset of Object.values(MAU_OFFICE_PATH_TARGET_ASSETS)) {
  UI_ENTRIES[asset] = entry({
    asset,
    family: "ui",
    tool: "create_map_object",
    jobId: "e01f1424-4a74-4892-9593-94b252e4e721",
    selectedOutput: asset.split("/").pop() ?? asset,
    prompt:
      "top-down pixel art navigation marker for an office floor, exactly three pale gray chevrons arranged horizontally like >>> across the center-left of the tile, each chevron separate and evenly spaced, no vertical stacking, subtle warm gray outline, flat shading, transparent background",
    postprocess: [
      "download the accepted Pixellab chevron base",
      "normalize it onto the shared 64px MauOffice UI canvas",
      "rotate or mirror the base so each target direction gets its own linked path cap",
    ],
    beautyCritique:
      "Target chevrons now read like a linked floor guide instead of a disjointed repeated arrow stamp.",
  });
}

for (const asset of Object.values(MAU_OFFICE_PATH_DOT_ASSETS)) {
  UI_ENTRIES[asset] = entry({
    asset,
    family: "ui",
    tool: "create_map_object",
    jobId: "6c72cb2a-5cc3-4bf4-ae83-d801681a26c5",
    selectedOutput: asset.split("/").pop() ?? asset,
    prompt:
      "top-down pixel art navigation marker for an office floor, a pale gray dotted line running vertically from the top edge to the bottom edge through the center of the tile, evenly spaced square dots, subtle warm gray outline, flat shading, transparent background",
    postprocess: [
      "download the accepted Pixellab dotted-line base",
      "normalize it onto the shared 64px MauOffice UI canvas",
      "rotate or mirror the base so each straight path direction links edge-to-edge",
    ],
    beautyCritique:
      "Straight runs now visually connect across neighboring tiles instead of breaking into isolated chevrons.",
  });
}

for (const asset of Object.values(MAU_OFFICE_PATH_TURN_ASSETS)) {
  UI_ENTRIES[asset] = entry({
    asset,
    family: "ui",
    tool: "create_map_object",
    jobId: "18ccaff4-82b5-4ed5-98bb-9a79e61605e1",
    selectedOutput: asset.split("/").pop() ?? asset,
    prompt:
      "top-down pixel art navigation marker for an office floor, a chain of tiny pale gray square dots making a clean 90 degree turn from the left edge to the top edge, each dot separated by transparent gaps, no solid line, no ribbon, no arrow, transparent background",
    postprocess: [
      "download the accepted Pixellab dotted-turn base",
      "normalize it onto the shared 64px MauOffice UI canvas",
      "rotate or mirror the base so each corner direction links cleanly to the straight dotted runs",
    ],
    beautyCritique:
      "Corner tiles carry the same dot rhythm as the straight segments, so the path bends without breaking apart visually.",
  });
}

for (const asset of [
  ...Object.values(MAU_OFFICE_BUBBLE_FRAME_ASSETS),
  MAU_OFFICE_BUBBLE_TAIL_ASSET,
]) {
  UI_ENTRIES[asset] = entry({
    asset,
    family: "ui",
    tool: "create_map_object",
    jobId: "00c6f4df-2283-4715-8a7a-952bdc3f4bd7",
    selectedOutput: asset.split("/").pop() ?? asset,
    prompt:
      "large close-up pixel art speech bubble filling almost the entire canvas, rounded rectangular dialog box covering about 85 percent of the canvas width and 70 percent of the canvas height, short tail centered exactly on the bottom edge and pointing straight downward, cream fill, warm brown outline, subtle pixel shading, transparent background",
    postprocess: [
      "crop the Pixellab export onto the shared MauOffice UI canvas",
      "split the speech bubble into a stretchable 9-slice frame plus a centered tail cap",
      "overlay live bubble text and clamp it to two lines in the UI",
    ],
    beautyCritique:
      "Speech bubble stays responsive without stretching the rounded corners or centered tail out of shape.",
  });
}

const HUMAN_VISITOR_CHARACTER_ID = "41d723fb-9c46-4cf7-91c5-ed860e9a4354";
const HUMAN_VISITOR_WALK_JOB_ID = "animate:41d723fb-9c46-4cf7-91c5-ed860e9a4354:walking-6-frames";
const HUMAN_VISITOR_STAND_JOB_ID = "animate:41d723fb-9c46-4cf7-91c5-ed860e9a4354:breathing-idle";
const BIRD_WORKER_CHARACTER_ID = "5b6c4fa4-6a04-4e86-ac4b-41248d688f13";
const BIRD_WORKER_STAND_JOB_ID = "animate:5b6c4fa4-6a04-4e86-ac4b-41248d688f13:breathing-idle";
const BIRD_WORKER_WALK_JOB_ID = "animate:5b6c4fa4-6a04-4e86-ac4b-41248d688f13:walking-6-frames";
const DEER_WORKER_CHARACTER_ID = "fc376e2e-3ea8-46dd-a056-adcf5c6dfec6";
const DEER_WORKER_STAND_JOB_ID = "animate:fc376e2e-3ea8-46dd-a056-adcf5c6dfec6:breathing-idle";
const DEER_WORKER_WALK_JOB_ID = "animate:fc376e2e-3ea8-46dd-a056-adcf5c6dfec6:walking-6-frames";
const DOG_WORKER_CHARACTER_ID = "228ee863-2488-44dd-8b2e-dfcfb8b89566";
const DOG_WORKER_STAND_JOB_ID = "animate:228ee863-2488-44dd-8b2e-dfcfb8b89566:breathing-idle";
const DOG_WORKER_WALK_JOB_ID = "animate:228ee863-2488-44dd-8b2e-dfcfb8b89566:walking-6-frames";
const CAT_WORKER_CHARACTER_ID = "46c7ec8a-66d7-4034-bcbb-e70aac9271a0";
const CAT_WORKER_STAND_JOB_ID = "animate:46c7ec8a-66d7-4034-bcbb-e70aac9271a0:breathing-idle";
const CAT_WORKER_SIT_CHARACTER_ID = "854058e3-5e18-43ac-8d1e-2fc77f1ce540";
const CAT_WORKER_SIT_JOB_ID = "animate:854058e3-5e18-43ac-8d1e-2fc77f1ce540:breathing-idle";
const PLACEHOLDER_WORKER_POSE_NOTES = {
  reach:
    "Placeholder forward-reach loop derived locally from the standing idle frames until dedicated Pixellab acting poses land.",
  dance:
    "Placeholder dance loop remixed locally from the walking cadence so the renderer can address a playful in-place animation family now.",
  jump: "Placeholder jump-ready loop derived from the standing idle frames until a real overhead passing pose is generated.",
  chase:
    "Placeholder chase loop remixed locally from the walking cadence until a forward-lean sprint/point pose is generated.",
  chat: "Placeholder chatting loop derived from the standing idle frames until a dedicated conversational gesture set is generated.",
  "sleep-floor":
    "Placeholder floor-sleep loop derived locally by rotating the seated side pose onto the floor plane until a dedicated sleep pose is generated.",
} as const;

const WORKER_ENTRIES = Object.values(MAU_OFFICE_WORKER_RIGS)
  .flatMap((rig) => [
    ...Object.values(rig.stand).flatMap((animation) => animation.frames),
    ...Object.values(rig.sit).flatMap((animation) => animation.frames),
    ...Object.values(rig.walk).flatMap((animation) => animation.frames),
    ...Object.values(rig.reach).flatMap((animation) => animation.frames),
    ...Object.values(rig.dance).flatMap((animation) => animation.frames),
    ...Object.values(rig.jump).flatMap((animation) => animation.frames),
    ...Object.values(rig.chase).flatMap((animation) => animation.frames),
    ...Object.values(rig.chat).flatMap((animation) => animation.frames),
    ...rig.sleepFloor.frames,
  ])
  .reduce<Record<string, MauOfficePixellabProvenance>>((acc, asset) => {
    const placeholderPose = Object.keys(PLACEHOLDER_WORKER_POSE_NOTES).find(
      (pose) => asset.includes(`/${pose}-`) || asset.includes(`/${pose}/`),
    ) as keyof typeof PLACEHOLDER_WORKER_POSE_NOTES | undefined;
    if (placeholderPose) {
      const rigId = asset.split("/")[2] ?? "worker";
      acc[asset] = entry({
        asset,
        family: "worker",
        tool: "local_placeholder_derive",
        jobId: `placeholder:${asset.replaceAll("/", ":")}`,
        selectedOutput: asset.split("/").slice(-3).join("/"),
        prompt: PLACEHOLDER_WORKER_POSE_NOTES[placeholderPose],
        postprocess:
          placeholderPose === "sleep-floor"
            ? [
                "take the rig's side-facing seated placeholder frames as the source art",
                "rotate them onto a horizontal floor pose with nearest-neighbor transforms",
                "center the rotated sleeper on the shared 64px MauOffice worker slot",
                "bottom-align it to the floor plane without directional variants",
                "keep a simple four-frame placeholder loop until a dedicated sleep pose exists",
              ]
            : [
                "reuse the existing rig's accepted stand or walk frames as source art",
                "derive a named placeholder animation family with local nearest-neighbor edits only",
                "keep the placeholder loop on the shared 64px MauOffice worker slot until dedicated Pixellab acting poses replace it",
              ],
        beautyCritique: `${rigId} ${placeholderPose} is currently a wired placeholder so MauOffice can reference the animation family without missing assets.`,
      });
      return acc;
    }
    if (asset.startsWith("mau-office/workers/cat/stand-")) {
      acc[asset] = entry({
        asset,
        family: "worker",
        tool: "animate_character",
        jobId: CAT_WORKER_STAND_JOB_ID,
        selectedOutput: asset.split("/").slice(-3).join("/"),
        prompt:
          "cute chibi anthropomorphic tuxedo cat office worker with oversized head, short body, expressive face, clear eyes, tiny paws, warm business outfit, polished pixel art, readable from all directions, subtle breathing idle loop",
        postprocess: [
          "download the Pixellab breathing-idle output",
          "crop each frame to the opaque worker bounds",
          "resize the cropped sprite to a 43px visible height with nearest-neighbor scaling",
          "center it on the shared 64px MauOffice worker slot",
          "bottom-align the feet to the shared MauOffice worker foot row",
          "keep the four-frame idle cadence for north, east, south, and west",
        ],
        beautyCritique:
          "The cat now has a subtle breathing idle loop that keeps the office lively without breaking the chunky MauOffice cast proportions.",
      });
      return acc;
    }
    if (asset.startsWith("mau-office/workers/cat/sit-")) {
      acc[asset] = entry({
        asset,
        family: "worker",
        tool: "animate_character",
        jobId: CAT_WORKER_SIT_JOB_ID,
        selectedOutput: asset.split("/").slice(-3).join("/"),
        prompt:
          "cute chibi anthropomorphic tuxedo cat office worker in a seated posture as if sitting on an unseen office chair, oversized head, short body, expressive face, tiny paws, warm business outfit, polished pixel art, readable from all four directions, subtle breathing idle loop",
        postprocess: [
          "create a seated-base cat worker character with the same chunky MauOffice cast style",
          "download the Pixellab breathing-idle output from that seated base",
          "crop the full direction sequence to one shared bounding box per direction",
          "scale the sequence into the existing cat seated worker scale band without removing the subtle bob motion",
          "center it on the shared 64px MauOffice worker slot",
          "bottom-align the seated pose to the existing chair/desk row expectations",
          "keep the four-frame sit-idle cadence for north, east, south, and west",
        ],
        beautyCritique:
          "The cat finally has a believable seated idle loop instead of pretending the standing rig is a chair pose.",
      });
      return acc;
    }
    if (asset.startsWith("mau-office/workers/bird/stand-")) {
      acc[asset] = entry({
        asset,
        family: "worker",
        tool: "animate_character",
        jobId: BIRD_WORKER_STAND_JOB_ID,
        selectedOutput: asset.split("/").slice(-3).join("/"),
        prompt:
          "cute chibi anthropomorphic cardinal bird office worker with red feathers, tiny yellow beak, dark business jacket and green tie, same chunky MauOffice cast proportions, subtle breathing idle loop",
        postprocess: [
          "download the Pixellab breathing-idle output",
          "crop the full direction sequence to one shared bounding box per direction",
          "scale the sequence into the existing bird worker scale band without removing the subtle bob motion",
          "center it on the shared 64px MauOffice worker slot",
          "bottom-align the feet to the shared MauOffice worker foot row",
          "keep the four-frame idle cadence for north, east, south, and west",
        ],
        beautyCritique:
          "The bird now breathes with the same subtle office-idle energy as the cat and human rigs while keeping its sharper cardinal silhouette.",
      });
      return acc;
    }
    if (asset.startsWith("mau-office/workers/deer/stand-")) {
      acc[asset] = entry({
        asset,
        family: "worker",
        tool: "animate_character",
        jobId: DEER_WORKER_STAND_JOB_ID,
        selectedOutput: asset.split("/").slice(-3).join("/"),
        prompt:
          "cute chibi anthropomorphic deer office worker with small antlers, warm tan fur, brown business jacket and green tie, same chunky MauOffice cast proportions, subtle breathing idle loop",
        postprocess: [
          "download the Pixellab breathing-idle output",
          "crop the full direction sequence to one shared bounding box per direction",
          "scale the sequence into the existing deer worker scale band without removing the subtle bob motion",
          "center it on the shared 64px MauOffice worker slot",
          "bottom-align the feet to the shared MauOffice worker foot row",
          "keep the four-frame idle cadence for north, east, south, and west",
        ],
        beautyCritique:
          "The deer idle loop keeps the gentle antlered silhouette alive without making the office feel jittery or noisy.",
      });
      return acc;
    }
    if (asset.startsWith("mau-office/workers/bird/walk-")) {
      acc[asset] = entry({
        asset,
        family: "worker",
        tool: "animate_character",
        jobId: BIRD_WORKER_WALK_JOB_ID,
        selectedOutput: asset.split("/").slice(-3).join("/"),
        prompt:
          "cute chibi anthropomorphic cardinal bird office worker with red feathers, tiny yellow beak, dark business jacket and green tie, same chunky MauOffice cast proportions, readable walking cycle from all four directions",
        postprocess: [
          "download the Pixellab walking-6-frames output",
          "crop the full direction sequence to one shared bounding box per direction",
          "scale the sequence into the existing bird worker scale band without flattening the stride motion",
          "center it on the shared 64px MauOffice worker slot",
          "bottom-align the feet to the shared MauOffice worker foot row",
          "preserve the six-frame walk cadence for north, east, south, and west",
        ],
        beautyCritique:
          "The bird finally walks with a real stride instead of sliding as a cardboard cutout through the office.",
      });
      return acc;
    }
    if (asset.startsWith("mau-office/workers/deer/walk-")) {
      acc[asset] = entry({
        asset,
        family: "worker",
        tool: "animate_character",
        jobId: DEER_WORKER_WALK_JOB_ID,
        selectedOutput: asset.split("/").slice(-3).join("/"),
        prompt:
          "cute chibi anthropomorphic deer office worker with small antlers, warm tan fur, brown business jacket and green tie, same chunky MauOffice cast proportions, readable walking cycle from all four directions",
        postprocess: [
          "download the Pixellab walking-6-frames output",
          "crop the full direction sequence to one shared bounding box per direction",
          "scale the sequence into the existing deer worker scale band without flattening the stride motion",
          "center it on the shared 64px MauOffice worker slot",
          "bottom-align the feet to the shared MauOffice worker foot row",
          "preserve the six-frame walk cadence for north, east, south, and west",
        ],
        beautyCritique:
          "The deer finally moves like a real office worker instead of hovering through the room as a repeated still.",
      });
      return acc;
    }
    if (asset.startsWith("mau-office/workers/dog/stand-")) {
      acc[asset] = entry({
        asset,
        family: "worker",
        tool: "animate_character",
        jobId: DOG_WORKER_STAND_JOB_ID,
        selectedOutput: asset.split("/").slice(-3).join("/"),
        prompt:
          "cute chibi anthropomorphic dog office worker with floppy brown ears, warm tan muzzle, brown business jacket and red tie, same chunky MauOffice cast proportions, subtle breathing idle loop",
        postprocess: [
          "download the Pixellab breathing-idle output",
          "crop the full direction sequence to one shared bounding box per direction",
          "scale the sequence into the existing dog worker scale band without removing the subtle bob motion",
          "center it on the shared 64px MauOffice worker slot",
          "bottom-align the feet to the shared MauOffice worker foot row",
          "keep the four-frame idle cadence for north, east, south, and west",
        ],
        beautyCritique:
          "The dog now idles with the same subtle office-life rhythm as the rest of the cast instead of freezing between moves.",
      });
      return acc;
    }
    if (asset.startsWith("mau-office/workers/dog/walk-")) {
      acc[asset] = entry({
        asset,
        family: "worker",
        tool: "animate_character",
        jobId: DOG_WORKER_WALK_JOB_ID,
        selectedOutput: asset.split("/").slice(-3).join("/"),
        prompt:
          "cute chibi anthropomorphic dog office worker with floppy brown ears, warm tan muzzle, brown business jacket and red tie, same chunky MauOffice cast proportions, readable walking cycle from all four directions",
        postprocess: [
          "download the Pixellab walking-6-frames output",
          "crop the full direction sequence to one shared bounding box per direction",
          "scale the sequence into the existing dog worker scale band without flattening the stride motion",
          "center it on the shared 64px MauOffice worker slot",
          "bottom-align the feet to the shared MauOffice worker foot row",
          "preserve the six-frame walk cadence for north, east, south, and west",
        ],
        beautyCritique:
          "The dog finally walks with a real step cycle instead of sliding across the office as a static cutout.",
      });
      return acc;
    }
    if (asset.startsWith("mau-office/workers/human/")) {
      const sitPose = asset.includes("/sit-");
      const standPose = asset.includes("/stand-");
      const walkPose = asset.includes("/walk-");
      acc[asset] = entry({
        asset,
        family: "worker",
        tool: walkPose || standPose ? "animate_character" : "create_character",
        jobId: walkPose
          ? HUMAN_VISITOR_WALK_JOB_ID
          : standPose
            ? HUMAN_VISITOR_STAND_JOB_ID
            : HUMAN_VISITOR_CHARACTER_ID,
        selectedOutput: asset.split("/").slice(-2).join("/"),
        prompt:
          "chibi human office visitor with a simple round human face and the same chunky MauOffice worker style, business casual white shirt and dark pants, short dark hair, low top-down pixel art, transparent background",
        postprocess: sitPose
          ? [
              "download the Pixellab rotation output",
              "resize the 92px character canvas into the shared 64px MauOffice worker slot",
              "bottom-align the feet to the shared MauOffice worker foot row",
              "widen the silhouette slightly to match the office cast proportions",
              "duplicate the standing frame into the unused sit pose for contract completeness",
            ]
          : standPose
            ? [
                "download the Pixellab breathing-idle output",
                "crop each frame to the opaque worker bounds",
                "resize each frame into the existing human worker scale band",
                "place the resized sprite onto the shared 64px MauOffice worker slot",
                "keep the same bottom-aligned foot row and side-view width as the current human rig",
                "preserve the four-frame idle cadence for north, east, south, and west",
              ]
            : walkPose
              ? [
                  "download the Pixellab walking-6-frames output",
                  "resize each 92px animation frame into the shared 64px MauOffice worker slot",
                  "bottom-align the feet to the shared MauOffice worker foot row",
                  "widen the silhouette slightly to match the office cast proportions",
                  "preserve the four direction folders and six-frame cadence",
                ]
              : [
                  "download the Pixellab rotation output",
                  "resize the 92px character canvas into the shared 64px MauOffice worker slot",
                  "bottom-align the feet to the shared MauOffice worker foot row",
                  "widen the silhouette slightly to match the office cast proportions",
                  "keep the human visitor proportions inside the existing worker scale band",
                ],
        beautyCritique:
          "The human visitor rig reads like the same MauOffice cast as the animal agents, with matching chunky proportions and pixel treatment but a human face instead of an anthropomorphic head.",
      });
      return acc;
    }
    acc[asset] = existing(
      asset,
      "worker",
      "The existing worker rig already matches MauOffice scale and animation timing, so the landscape refit preserves it unchanged.",
    );
    return acc;
  }, {});

export const MAU_OFFICE_PIXELLAB_PROVENANCE: Record<string, MauOfficePixellabProvenance> = {
  ...FIXED_UPLOADED_ENTRIES,
  ...UI_ENTRIES,
  ...WORKER_ENTRIES,
};
