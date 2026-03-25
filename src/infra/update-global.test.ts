import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BUNDLED_RUNTIME_SIDECAR_PATHS } from "../extensions/public-artifacts.js";
import { captureEnv } from "../test-utils/env.js";
import {
  canResolveRegistryVersionForPackageTarget,
  collectInstalledGlobalPackageErrors,
  cleanupGlobalRenameDirs,
  detectGlobalInstallManagerByPresence,
  detectGlobalInstallManagerForRoot,
  globalInstallArgs,
  globalInstallFallbackArgs,
  isExplicitPackageInstallSpec,
  isMainPackageTarget,
  MAUMAU_MAIN_PACKAGE_SPEC,
  resolveGlobalPackageRoot,
  resolveGlobalInstallSpec,
  resolveGlobalRoot,
  type CommandRunner,
} from "./update-global.js";

describe("update global helpers", () => {
  let envSnapshot: ReturnType<typeof captureEnv> | undefined;

  afterEach(() => {
    envSnapshot?.restore();
    envSnapshot = undefined;
  });

  it("prefers explicit package spec overrides", () => {
    envSnapshot = captureEnv(["MAUMAU_UPDATE_PACKAGE_SPEC"]);
    process.env.MAUMAU_UPDATE_PACKAGE_SPEC = "file:/tmp/maumau.tgz";

    expect(resolveGlobalInstallSpec({ packageName: "maumau", tag: "latest" })).toBe(
      "file:/tmp/maumau.tgz",
    );
    expect(
      resolveGlobalInstallSpec({
        packageName: "maumau",
        tag: "beta",
        env: { MAUMAU_UPDATE_PACKAGE_SPEC: "maumau@next" },
      }),
    ).toBe("maumau@next");
  });

  it("resolves global roots and package roots from runner output", async () => {
    const runCommand: CommandRunner = async (argv) => {
      if (argv[0] === "npm") {
        return { stdout: "/tmp/npm-root\n", stderr: "", code: 0 };
      }
      if (argv[0] === "pnpm") {
        return { stdout: "", stderr: "", code: 1 };
      }
      throw new Error(`unexpected command: ${argv.join(" ")}`);
    };

    await expect(resolveGlobalRoot("npm", runCommand, 1000)).resolves.toBe("/tmp/npm-root");
    await expect(resolveGlobalRoot("pnpm", runCommand, 1000)).resolves.toBeNull();
    await expect(resolveGlobalRoot("bun", runCommand, 1000)).resolves.toContain(
      path.join(".bun", "install", "global", "node_modules"),
    );
    await expect(resolveGlobalPackageRoot("npm", runCommand, 1000)).resolves.toBe(
      path.join("/tmp/npm-root", "maumau"),
    );
  });

  it("maps main and explicit install specs for global installs", () => {
    expect(resolveGlobalInstallSpec({ packageName: "maumau", tag: "main" })).toBe(
      MAUMAU_MAIN_PACKAGE_SPEC,
    );
    expect(
      resolveGlobalInstallSpec({
        packageName: "maumau",
        tag: "github:maumau/maumau#feature/my-branch",
      }),
    ).toBe("github:maumau/maumau#feature/my-branch");
    expect(
      resolveGlobalInstallSpec({
        packageName: "maumau",
        tag: "https://example.com/maumau-main.tgz",
      }),
    ).toBe("https://example.com/maumau-main.tgz");
  });

  it("classifies main and raw install specs separately from registry selectors", () => {
    expect(isMainPackageTarget("main")).toBe(true);
    expect(isMainPackageTarget(" MAIN ")).toBe(true);
    expect(isMainPackageTarget("beta")).toBe(false);

    expect(isExplicitPackageInstallSpec("github:maumau/maumau#main")).toBe(true);
    expect(isExplicitPackageInstallSpec("https://example.com/maumau-main.tgz")).toBe(true);
    expect(isExplicitPackageInstallSpec("file:/tmp/maumau-main.tgz")).toBe(true);
    expect(isExplicitPackageInstallSpec("beta")).toBe(false);

    expect(canResolveRegistryVersionForPackageTarget("latest")).toBe(true);
    expect(canResolveRegistryVersionForPackageTarget("2026.3.22")).toBe(true);
    expect(canResolveRegistryVersionForPackageTarget("main")).toBe(false);
    expect(canResolveRegistryVersionForPackageTarget("github:maumau/maumau#main")).toBe(false);
  });

  it("detects install managers from resolved roots and on-disk presence", async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-update-global-"));
    const npmRoot = path.join(base, "npm-root");
    const pnpmRoot = path.join(base, "pnpm-root");
    const bunRoot = path.join(base, ".bun", "install", "global", "node_modules");
    const pkgRoot = path.join(pnpmRoot, "maumau");
    await fs.mkdir(pkgRoot, { recursive: true });
    await fs.mkdir(path.join(npmRoot, "maumau"), { recursive: true });
    await fs.mkdir(path.join(bunRoot, "maumau"), { recursive: true });

    envSnapshot = captureEnv(["BUN_INSTALL"]);
    process.env.BUN_INSTALL = path.join(base, ".bun");

    const runCommand: CommandRunner = async (argv) => {
      if (argv[0] === "npm") {
        return { stdout: `${npmRoot}\n`, stderr: "", code: 0 };
      }
      if (argv[0] === "pnpm") {
        return { stdout: `${pnpmRoot}\n`, stderr: "", code: 0 };
      }
      throw new Error(`unexpected command: ${argv.join(" ")}`);
    };

    await expect(detectGlobalInstallManagerForRoot(runCommand, pkgRoot, 1000)).resolves.toBe(
      "pnpm",
    );
    await expect(detectGlobalInstallManagerByPresence(runCommand, 1000)).resolves.toBe("npm");

    await fs.rm(path.join(npmRoot, "maumau"), { recursive: true, force: true });
    await fs.rm(path.join(pnpmRoot, "maumau"), { recursive: true, force: true });
    await expect(detectGlobalInstallManagerByPresence(runCommand, 1000)).resolves.toBe("bun");
  });

  it("builds install argv and npm fallback argv", () => {
    expect(globalInstallArgs("npm", "maumau@latest")).toEqual([
      "npm",
      "i",
      "-g",
      "maumau@latest",
      "--no-fund",
      "--no-audit",
      "--loglevel=error",
    ]);
    expect(globalInstallArgs("pnpm", "maumau@latest")).toEqual([
      "pnpm",
      "add",
      "-g",
      "maumau@latest",
    ]);
    expect(globalInstallArgs("bun", "maumau@latest")).toEqual([
      "bun",
      "add",
      "-g",
      "maumau@latest",
    ]);

    expect(globalInstallFallbackArgs("npm", "maumau@latest")).toEqual([
      "npm",
      "i",
      "-g",
      "maumau@latest",
      "--omit=optional",
      "--no-fund",
      "--no-audit",
      "--loglevel=error",
    ]);
    expect(globalInstallFallbackArgs("pnpm", "maumau@latest")).toBeNull();
  });

  it("cleans only renamed package directories", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-update-cleanup-"));
    await fs.mkdir(path.join(root, ".maumau-123"), { recursive: true });
    await fs.mkdir(path.join(root, ".maumau-456"), { recursive: true });
    await fs.writeFile(path.join(root, ".maumau-file"), "nope", "utf8");
    await fs.mkdir(path.join(root, "maumau"), { recursive: true });

    await expect(
      cleanupGlobalRenameDirs({
        globalRoot: root,
        packageName: "maumau",
      }),
    ).resolves.toEqual({
      removed: [".maumau-123", ".maumau-456"],
    });
    await expect(fs.stat(path.join(root, "maumau"))).resolves.toBeDefined();
    await expect(fs.stat(path.join(root, ".maumau-file"))).resolves.toBeDefined();
  });

  it("checks bundled runtime sidecars, including Matrix helper-api", async () => {
    const packageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-update-global-pkg-"));
    await fs.writeFile(
      path.join(packageRoot, "package.json"),
      JSON.stringify({ name: "maumau", version: "1.0.0" }),
      "utf-8",
    );
    for (const relativePath of BUNDLED_RUNTIME_SIDECAR_PATHS) {
      const absolutePath = path.join(packageRoot, relativePath);
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, "export {};\n", "utf-8");
    }

    await expect(collectInstalledGlobalPackageErrors({ packageRoot })).resolves.toEqual([]);

    await fs.rm(path.join(packageRoot, "dist/extensions/matrix/helper-api.js"));
    await expect(collectInstalledGlobalPackageErrors({ packageRoot })).resolves.toContain(
      "missing bundled runtime sidecar dist/extensions/matrix/helper-api.js",
    );
  });
});
