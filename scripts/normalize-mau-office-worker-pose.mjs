import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const DEFAULT_DIRECTIONS = ["south", "east", "north", "west"];

function parseArgs(argv) {
  const args = new Map();
  for (let index = 2; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(
        "Usage: node scripts/normalize-mau-office-worker-pose.mjs --source-root <dir> --source-pose <pose> --target-rig <rig> --target-pose <pose> [--directions south,east,north,west]",
      );
    }
    args.set(key.slice(2), value);
  }
  return {
    sourceRoot: args.get("source-root"),
    sourcePose: args.get("source-pose"),
    targetRig: args.get("target-rig"),
    targetPose: args.get("target-pose"),
    frameCount: args.get("frame-count") ? Number.parseInt(args.get("frame-count"), 10) : undefined,
    directions: args.get("directions")?.split(",").map((part) => part.trim()).filter(Boolean) ?? DEFAULT_DIRECTIONS,
  };
}

function resolveFrameIndices(sourceFrameCount, targetFrameCount) {
  if (sourceFrameCount < targetFrameCount) {
    throw new Error(
      `Need at least ${targetFrameCount} source frames, but only found ${sourceFrameCount}`,
    );
  }
  if (sourceFrameCount === targetFrameCount) {
    return Array.from({ length: targetFrameCount }, (_, index) => index);
  }
  if (targetFrameCount === 1) {
    return [0];
  }
  return Array.from({ length: targetFrameCount }, (_, index) =>
    Math.round((index * (sourceFrameCount - 1)) / (targetFrameCount - 1)),
  );
}

async function opaqueBounds(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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
      if (x < minX) {
        minX = x;
      }
      if (y < minY) {
        minY = y;
      }
      if (x > maxX) {
        maxX = x;
      }
      if (y > maxY) {
        maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new Error(`No opaque pixels found in ${file}`);
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

async function normalizeDirection({
  repoRoot,
  sourceRoot,
  sourcePose,
  targetRig,
  targetPose,
  direction,
  frameCount,
}) {
  const targetDir = path.join(
    repoRoot,
    "ui/public/mau-office/workers",
    targetRig,
    `${targetPose}-${direction}`,
  );
  const sourceDir = path.join(sourceRoot, sourcePose, direction);
  const reference = path.join(targetDir, "frame_000.png");
  const targetBounds = await opaqueBounds(reference);
  const targetCenterX = targetBounds.minX + targetBounds.width / 2;
  const targetBottomY = targetBounds.minY + targetBounds.height;
  const targetFrameCount = frameCount ?? (targetPose === "walk" ? 6 : 4);
  const sourceFiles = Array.from({ length: 32 }, (_, index) =>
    path.join(sourceDir, `frame_${String(index).padStart(3, "0")}.png`),
  ).filter((file) => existsSync(file));
  const selectedFrameIndices = resolveFrameIndices(sourceFiles.length, targetFrameCount);
  const sourceBounds = [];

  for (const sourceIndex of selectedFrameIndices) {
    const sourceFile = sourceFiles[sourceIndex];
    sourceBounds.push(await opaqueBounds(sourceFile));
  }

  const union = sourceBounds.reduce(
    (acc, bounds) => ({
      minX: Math.min(acc.minX, bounds.minX),
      minY: Math.min(acc.minY, bounds.minY),
      maxX: Math.max(acc.maxX, bounds.maxX),
      maxY: Math.max(acc.maxY, bounds.maxY),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  );
  const unionWidth = union.maxX - union.minX + 1;
  const unionHeight = union.maxY - union.minY + 1;
  const scale = Math.min(targetBounds.width / unionWidth, targetBounds.height / unionHeight);
  const outputWidth = Math.max(1, Math.round(unionWidth * scale));
  const outputHeight = Math.max(1, Math.round(unionHeight * scale));
  const left = Math.round(targetCenterX - outputWidth / 2);
  const top = Math.round(targetBottomY - outputHeight);

  for (const [index, sourceIndex] of selectedFrameIndices.entries()) {
    const sourceFile = sourceFiles[sourceIndex];
    const cropped = sharp(sourceFile).extract({
      left: union.minX,
      top: union.minY,
      width: unionWidth,
      height: unionHeight,
    });
    const normalized = await cropped
      .resize({
        width: outputWidth,
        height: outputHeight,
        kernel: "nearest",
      })
      .png()
      .toBuffer();
    await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: normalized, left, top }])
      .png()
      .toFile(path.join(targetDir, `frame_${String(index).padStart(3, "0")}.png`));
  }
}

async function main() {
  const options = parseArgs(process.argv);
  if (!options.sourceRoot || !options.sourcePose || !options.targetRig || !options.targetPose) {
    throw new Error(
      "Missing required args: --source-root, --source-pose, --target-rig, --target-pose",
    );
  }

  const repoRoot = path.resolve(import.meta.dirname, "..");
  for (const direction of options.directions) {
    await normalizeDirection({ repoRoot, ...options, direction });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
