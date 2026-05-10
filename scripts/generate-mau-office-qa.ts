import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { MAU_OFFICE_WORKER_RIGS } from "../ui/src/ui/mau-office-contract.ts";
import {
  MAU_OFFICE_ASSET_SCALE_SPECS,
  MAU_OFFICE_WORKER_FRAME_SPEC,
  resolveMauOfficeAssetScaleSpec,
} from "../ui/src/ui/mau-office-scale-spec.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");
const uiRoot = path.join(repoRoot, "ui");
const publicRoot = path.join(uiRoot, "public");
const tmpRoot = path.join(uiRoot, ".tmp");
const workerAsset = MAU_OFFICE_WORKER_RIGS.cat.stand.south.frames[0];
const doorAsset = "mau-office/tiles/door-top.png";
const wallAsset = "mau-office/tiles/wall-front-mid.png";

type AssetMetrics = {
  asset: string;
  canvas: { width: number; height: number };
  bounds: { width: number; height: number; offsetX: number; offsetY: number };
  spec: ReturnType<typeof resolveMauOfficeAssetScaleSpec>;
};

function assetFile(asset: string): string {
  return path.join(publicRoot, asset);
}

function rgba(hex: string) {
  const normalized = hex.replace("#", "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((part) => part + part)
          .join("")
      : normalized;
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
    alpha: 1,
  };
}

async function opaqueBounds(asset: string) {
  const { data, info } = await sharp(assetFile(asset)).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
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
    width: maxX - minX,
    height: maxY - minY,
    offsetX: minX,
    offsetY: minY,
  };
}

function specText(metrics: AssetMetrics): string[] {
  const visible = metrics.spec?.visibleBounds;
  const semantic = metrics.spec?.semantic;
  const lines = [
    metrics.asset.replace("mau-office/", ""),
    `slot ${metrics.spec?.slotTiles.width ?? "?"}x${metrics.spec?.slotTiles.height ?? "?"}  ${metrics.spec?.anchor ?? "?"}`,
    `canvas ${metrics.canvas.width}x${metrics.canvas.height}`,
    `bounds ${metrics.bounds.width}x${metrics.bounds.height} @ ${metrics.bounds.offsetX},${metrics.bounds.offsetY}`,
  ];
  if (visible) {
    lines.push(
      `target ${visible.width.min}-${visible.width.max}w / ${visible.height.min}-${visible.height.max}h`,
    );
  }
  if (semantic?.workerHeightRatio) {
    lines.push(`worker ratio ${semantic.workerHeightRatio.min}-${semantic.workerHeightRatio.max}`);
  }
  return lines;
}

async function labelSvg(textLines: string[], width: number, height: number) {
  const lines = textLines
    .map(
      (line, index) =>
        `<text x="0" y="${14 + index * 16}" font-family="Menlo, monospace" font-size="14" fill="#553d2d">${line}</text>`,
    )
    .join("");
  return sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <rect x="0" y="0" width="${width}" height="${height}" fill="#fbf4e8"/>
        ${lines}
      </svg>`,
    ),
  )
    .png()
    .toBuffer();
}

async function main() {
  await mkdir(tmpRoot, { recursive: true });

  const metrics: AssetMetrics[] = [];
  for (const spec of MAU_OFFICE_ASSET_SCALE_SPECS) {
    if (spec.family === "floor" || spec.family === "tile") {
      continue;
    }
    metrics.push({
      asset: spec.asset,
      canvas: spec.sourceCanvas,
      bounds: await opaqueBounds(spec.asset),
      spec,
    });
  }

  const referenceBuffers = {
    wall: await sharp(assetFile(wallAsset)).png().toBuffer(),
    door: await sharp(assetFile(doorAsset)).png().toBuffer(),
    worker: await sharp(assetFile(workerAsset)).png().toBuffer(),
  };

  const cellWidth = 700;
  const cellHeight = 260;
  const columns = 2;
  const rows = Math.ceil(metrics.length / columns);
  const sheet = sharp({
    create: {
      width: cellWidth * columns,
      height: cellHeight * rows,
      channels: 4,
      background: rgba("#fbf4e8"),
    },
  });

  const composites: sharp.OverlayOptions[] = [];
  for (const [index, metric] of metrics.entries()) {
    const cellX = (index % columns) * cellWidth;
    const cellY = Math.floor(index / columns) * cellHeight;
    const assetBuffer = await sharp(assetFile(metric.asset)).png().toBuffer();
    const textBuffer = await labelSvg(specText(metric), 260, 110);
    const slotBuffer = await sharp({
      create: {
        width: metric.canvas.width + 2,
        height: metric.canvas.height + 2,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        {
          input: Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="${metric.canvas.width + 2}" height="${metric.canvas.height + 2}">
              <rect x="1" y="1" width="${metric.canvas.width}" height="${metric.canvas.height}" fill="none" stroke="#d9c4a1" stroke-width="2" stroke-dasharray="8 6"/>
            </svg>`,
          ),
        },
      ])
      .png()
      .toBuffer();

    composites.push(
      {
        input: await sharp({
          create: {
            width: cellWidth - 12,
            height: cellHeight - 12,
            channels: 4,
            background: rgba("#f7eddd"),
          },
        })
          .png()
          .toBuffer(),
        left: cellX + 6,
        top: cellY + 6,
      },
      { input: textBuffer, left: cellX + 18, top: cellY + 18 },
      { input: referenceBuffers.wall, left: cellX + 18, top: cellY + 120 },
      { input: referenceBuffers.door, left: cellX + 96, top: cellY + 152 },
      { input: referenceBuffers.worker, left: cellX + 178, top: cellY + 168 },
      { input: slotBuffer, left: cellX + 274, top: cellY + 108 },
      { input: assetBuffer, left: cellX + 275, top: cellY + 109 },
    );
  }

  const sheetPath = path.join(tmpRoot, "mau-office-comparison-sheet.png");
  const metricsPath = path.join(tmpRoot, "mau-office-asset-metrics.json");
  const critiquePath = path.join(tmpRoot, "mau-office-comparison-critique.json");
  await sheet.composite(composites).png().toFile(sheetPath);
  await writeFile(
    metricsPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        workerReference: {
          asset: workerAsset,
          spec: MAU_OFFICE_WORKER_FRAME_SPEC,
          bounds: await opaqueBounds(workerAsset),
        },
        metrics,
      },
      null,
      2,
    ),
  );
  await writeFile(
    critiquePath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sheetPath,
        metricsPath,
        reviewStatus: "pending",
        beautyPass: false,
        requiredQuestions: [
          "Do the native source assets look consistent beside the worker and door references?",
          "Are any props semantically larger than the shell in an absurd way?",
          "Does the asset family already feel warm, polished, and beautiful before render-time composition?",
        ],
        notes: [],
      },
      null,
      2,
    ),
  );

  console.log(sheetPath);
  console.log(metricsPath);
  console.log(critiquePath);
}

await main();
