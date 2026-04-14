#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const WORKER_RIG_IDS = ["bird", "cat", "deer", "dog", "human"];
const DIRECTIONS = ["south", "east", "north", "west"];
const STAND_DERIVED_POSES = ["reach", "jump", "chat"];
const DANCE_FRAME_INDICES = [0, 2, 4, 2];
const CHASE_FRAME_INDICES = [1, 2, 3, 4];
const SLEEP_SLOT_SIZE = 64;
const SLEEP_BOTTOM_PADDING_PX = 4;
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

const repoRoot = path.resolve(import.meta.dirname, "..");
const workersRoot = path.join(repoRoot, "ui/public/mau-office/workers");

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function framePath(rigId, poseDir, frameIndex) {
  return path.join(workersRoot, rigId, poseDir, `frame_${String(frameIndex).padStart(3, "0")}.png`);
}

async function copyFrame(sourcePath, targetPath) {
  await ensureDir(path.dirname(targetPath));
  await fs.copyFile(sourcePath, targetPath);
}

async function deriveSleepFloorFrame(sourcePath, targetPath) {
  const trimmed = await sharp(sourcePath).trim().png().toBuffer();
  const rotated = sharp(trimmed).rotate(90, { background: TRANSPARENT }).png();
  const rotatedBuffer = await rotated.toBuffer();
  const metadata = await sharp(rotatedBuffer).metadata();
  const width = metadata.width ?? SLEEP_SLOT_SIZE;
  const height = metadata.height ?? SLEEP_SLOT_SIZE;
  const left = Math.max(0, Math.floor((SLEEP_SLOT_SIZE - width) / 2));
  const top = Math.max(0, SLEEP_SLOT_SIZE - height - SLEEP_BOTTOM_PADDING_PX);
  const canvas = sharp({
    create: {
      width: SLEEP_SLOT_SIZE,
      height: SLEEP_SLOT_SIZE,
      channels: 4,
      background: TRANSPARENT,
    },
  });
  await ensureDir(path.dirname(targetPath));
  await canvas
    .composite([{ input: rotatedBuffer, left, top }])
    .png()
    .toFile(targetPath);
}

for (const rigId of WORKER_RIG_IDS) {
  for (const direction of DIRECTIONS) {
    for (const pose of STAND_DERIVED_POSES) {
      const poseDir = `${pose}-${direction}`;
      for (let frameIndex = 0; frameIndex < 4; frameIndex += 1) {
        await copyFrame(
          framePath(rigId, `stand-${direction}`, frameIndex),
          framePath(rigId, poseDir, frameIndex),
        );
      }
    }

    for (let frameIndex = 0; frameIndex < 4; frameIndex += 1) {
      await copyFrame(
        framePath(rigId, `walk-${direction}`, DANCE_FRAME_INDICES[frameIndex]),
        framePath(rigId, `dance-${direction}`, frameIndex),
      );
      await copyFrame(
        framePath(rigId, `walk-${direction}`, CHASE_FRAME_INDICES[frameIndex]),
        framePath(rigId, `chase-${direction}`, frameIndex),
      );
    }
  }

  for (let frameIndex = 0; frameIndex < 4; frameIndex += 1) {
    await deriveSleepFloorFrame(
      framePath(rigId, "sit-east", frameIndex),
      framePath(rigId, "sleep-floor", frameIndex),
    );
  }
}
