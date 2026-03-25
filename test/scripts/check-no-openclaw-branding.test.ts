import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  findOpenClawBrandingInFiles,
  findOpenClawBrandingLines,
  listTrackedFiles,
  shouldScanTrackedFile,
} from "../../scripts/check-no-openclaw-branding.mjs";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "maumau-openclaw-branding-"));
  tempDirs.push(dir);
  return dir;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
  }).trim();
}

describe("check-no-openclaw-branding", () => {
  it("finds OpenClaw branding in code and UI strings", () => {
    expect(
      findOpenClawBrandingLines(
        [
          'const pkg = "maumau";',
          'import "openclaw/plugin-sdk";',
          'const title = "Open Claw gateway";',
        ].join("\n"),
      ),
    ).toEqual([2, 3]);
  });

  it("ignores Maumau branding", () => {
    expect(
      findOpenClawBrandingLines(
        ['import "maumau/plugin-sdk";', 'const title = "Maumau gateway";'].join("\n"),
      ),
    ).toEqual([]);
  });

  it("scans live code surfaces and skips the guard files themselves", () => {
    const cwd = "/tmp/workspace";
    expect(shouldScanTrackedFile("/tmp/workspace/extensions/demo/src/index.ts", cwd)).toBe(true);
    expect(shouldScanTrackedFile("/tmp/workspace/ui/src/app.ts", cwd)).toBe(true);
    expect(
      shouldScanTrackedFile("/tmp/workspace/scripts/check-no-openclaw-branding.mjs", cwd),
    ).toBe(false);
    expect(shouldScanTrackedFile("/tmp/workspace/.agents/maintainers.md", cwd)).toBe(false);
  });

  it("scans tracked files and skips binary files", () => {
    const rootDir = makeTempDir();
    git(rootDir, "init", "-q");
    git(rootDir, "config", "user.email", "test@example.com");
    git(rootDir, "config", "user.name", "Test User");

    const textFile = path.join(rootDir, "extensions", "demo", "README.md");
    const binaryFile = path.join(rootDir, "assets", "logo.png");
    fs.mkdirSync(path.dirname(textFile), { recursive: true });
    fs.mkdirSync(path.dirname(binaryFile), { recursive: true });
    fs.writeFileSync(textFile, "Install the OpenClaw plugin here.\n", "utf8");
    fs.writeFileSync(binaryFile, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]));
    git(rootDir, "add", "extensions/demo/README.md", "assets/logo.png");

    const violations = findOpenClawBrandingInFiles(listTrackedFiles(rootDir));

    expect(violations).toEqual([
      {
        filePath: textFile,
        lines: [1],
      },
    ]);
  });
});
