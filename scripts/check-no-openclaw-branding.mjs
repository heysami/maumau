#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OPENCLAW_BRANDING_PATTERN = /\bopenclaw\b|\bopen\s+claw\b/iu;
const INCLUDED_TOP_LEVEL_DIRS = new Set(["apps", "extensions", "scripts", "src", "test", "ui"]);
const EXCLUDED_RELATIVE_PATHS = new Set([
  "scripts/check-no-openclaw-branding.mjs",
  "test/scripts/check-no-openclaw-branding.test.ts",
]);

function isBinaryBuffer(buffer) {
  return buffer.includes(0);
}

export function findOpenClawBrandingLines(content) {
  const lines = content.split(/\r?\n/u);
  const matches = [];
  for (const [index, line] of lines.entries()) {
    if (OPENCLAW_BRANDING_PATTERN.test(line)) {
      matches.push(index + 1);
    }
  }
  return matches;
}

export function listTrackedFiles(cwd = process.cwd()) {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd,
    encoding: "utf8",
  });
  return output
    .split("\0")
    .filter(Boolean)
    .map((relativePath) => path.join(cwd, relativePath));
}

export function shouldScanTrackedFile(filePath, cwd = process.cwd()) {
  const relativePath = path.relative(cwd, filePath).split(path.sep).join("/");
  if (EXCLUDED_RELATIVE_PATHS.has(relativePath)) {
    return false;
  }
  const [topLevelDir] = relativePath.split("/");
  return INCLUDED_TOP_LEVEL_DIRS.has(topLevelDir);
}

export function findOpenClawBrandingInFiles(filePaths, readFile = fs.readFileSync) {
  const violations = [];
  for (const filePath of filePaths) {
    let content;
    try {
      content = readFile(filePath);
    } catch {
      continue;
    }
    if (!Buffer.isBuffer(content)) {
      content = Buffer.from(String(content));
    }
    if (isBinaryBuffer(content)) {
      continue;
    }
    const lines = findOpenClawBrandingLines(content.toString("utf8"));
    if (lines.length > 0) {
      violations.push({
        filePath,
        lines,
      });
    }
  }
  return violations;
}

export async function main() {
  const cwd = process.cwd();
  const violations = findOpenClawBrandingInFiles(
    listTrackedFiles(cwd).filter((filePath) => shouldScanTrackedFile(filePath, cwd)),
  );
  if (violations.length === 0) {
    return;
  }

  console.error(
    "Found forbidden OpenClaw branding. Imported plugins, extensions, channels, and UI copy must be rebranded to Maumau before landing:",
  );
  for (const violation of violations) {
    const relativePath = path.relative(cwd, violation.filePath) || violation.filePath;
    console.error(`- ${relativePath}:${violation.lines.join(",")}`);
  }
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
