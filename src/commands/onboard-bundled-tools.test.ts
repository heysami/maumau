import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensureFreshInstallBundledTools,
  findClawdCursorBinaryOnHost,
  resolveClawdCursorManagedConfigPath,
} from "./onboard-bundled-tools.js";

async function makeTempHome() {
  return await fs.mkdtemp(path.join(os.tmpdir(), "maumau-bundled-tools-"));
}

describe("ensureFreshInstallBundledTools", () => {
  const tempDirs = new Set<string>();

  afterEach(async () => {
    await Promise.all(
      Array.from(tempDirs).map(async (dir) => {
        tempDirs.delete(dir);
        await fs.rm(dir, { recursive: true, force: true });
      }),
    );
  });

  it("skips provisioning when the install is not fresh", async () => {
    const runtime = { log: vi.fn() };

    const result = await ensureFreshInstallBundledTools({
      freshInstall: false,
      runtime,
    });

    expect(result).toEqual({
      attempted: false,
      ok: true,
      fullyReady: true,
      results: [],
    });
    expect(runtime.log).not.toHaveBeenCalled();
  });

  it("installs Chrome and Clawd Cursor during a fresh macOS install", async () => {
    const homeDir = await makeTempHome();
    tempDirs.add(homeDir);
    const stateDir = path.join(homeDir, ".maumau");
    await fs.mkdir(stateDir, { recursive: true });

    const downloadToFile = vi.fn(async (_url: string, dest: string) => {
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, "artifact");
    });
    const runCommand = vi.fn(async (argv: string[]) => {
      if (argv[0] === "sh" && argv[2]?.includes("command -v")) {
        return { code: 1, stdout: "", stderr: "" };
      }
      if (argv[0] === "hdiutil" && argv[1] === "attach") {
        const mountDir = argv[argv.indexOf("-mountpoint") + 1] ?? "";
        await fs.mkdir(path.join(mountDir, "Google Chrome.app"), { recursive: true });
        return { code: 0, stdout: "", stderr: "" };
      }
      if (argv[0] === "ditto") {
        const destination = argv[2] ?? "";
        await fs.mkdir(destination, { recursive: true });
        return { code: 0, stdout: "", stderr: "" };
      }
      if (argv[0] === "hdiutil" && argv[1] === "detach") {
        return { code: 0, stdout: "", stderr: "" };
      }
      if (argv[0] === "bash") {
        const binaryPath = path.join(homeDir, "clawdcursor", "node_modules", ".bin", "clawdcursor");
        await fs.mkdir(path.dirname(binaryPath), { recursive: true });
        await fs.writeFile(binaryPath, "#!/bin/sh\n");
        await fs.chmod(binaryPath, 0o755);
        return { code: 0, stdout: "", stderr: "" };
      }
      if (argv[0] === "npm" && argv[1] === "prefix" && argv[2] === "-g") {
        return { code: 0, stdout: path.join(homeDir, ".npm-global"), stderr: "" };
      }
      if (argv[0].includes("clawdcursor") && argv[1] === "consent" && argv[2] === "--accept") {
        const consentDir = path.join(homeDir, ".clawdcursor");
        await fs.mkdir(consentDir, { recursive: true });
        await fs.writeFile(
          path.join(consentDir, "consent"),
          JSON.stringify({ accepted: true }, null, 2),
          "utf8",
        );
        return { code: 0, stdout: "accepted", stderr: "" };
      }
      throw new Error(`Unexpected command: ${argv.join(" ")}`);
    });

    const result = await ensureFreshInstallBundledTools({
      freshInstall: true,
      config: {
        agents: {
          defaults: {
            model: { primary: "ollama/llama3.2:latest" },
          },
        },
      },
      runtime: { log: vi.fn() },
      platform: "darwin",
      homeDir,
      stateDir,
      env: {},
      runCommand: runCommand as never,
      resolveChromeExecutable: () => null,
      downloadToFile,
      fetchOllamaModels: vi.fn(async () => ({
        reachable: true,
        models: [{ name: "llama3.2:latest" }],
      })) as never,
      probeOllamaTextModel: vi.fn(async () => true),
    });

    expect(result.ok).toBe(true);
    expect(result.fullyReady).toBe(true);
    expect(result.results).toEqual([
      expect.objectContaining({ id: "chrome", status: "installed" }),
      expect.objectContaining({ id: "clawd-cursor", status: "configured" }),
    ]);
    await expect(
      fs.readFile(resolveClawdCursorManagedConfigPath({ homeDir, stateDir }), "utf8"),
    ).resolves.toContain('"provider": "ollama"');
    expect(downloadToFile).toHaveBeenCalledTimes(2);
    expect(runCommand).toHaveBeenCalledWith(
      expect.arrayContaining(["hdiutil", "attach"]),
      expect.any(Object),
    );
    expect(runCommand).toHaveBeenCalledWith(expect.arrayContaining(["bash"]), expect.any(Object));
  });

  it("recognizes already-installed Chrome and Clawd Cursor", async () => {
    const homeDir = await makeTempHome();
    tempDirs.add(homeDir);
    const stateDir = path.join(homeDir, ".maumau");
    await fs.mkdir(stateDir, { recursive: true });
    const binaryPath = path.join(homeDir, "clawdcursor", "node_modules", ".bin", "clawdcursor");
    await fs.mkdir(path.dirname(binaryPath), { recursive: true });
    await fs.writeFile(binaryPath, "#!/bin/sh\n");
    await fs.chmod(binaryPath, 0o755);

    const runCommand = vi.fn(async (argv: string[]) => {
      if (argv[0] === "sh" && argv[2]?.includes("command -v")) {
        return { code: 1, stdout: "", stderr: "" };
      }
      if (argv[0].includes("clawdcursor") && argv[1] === "consent" && argv[2] === "--accept") {
        const consentDir = path.join(homeDir, ".clawdcursor");
        await fs.mkdir(consentDir, { recursive: true });
        await fs.writeFile(
          path.join(consentDir, "consent"),
          JSON.stringify({ accepted: true }, null, 2),
          "utf8",
        );
        return { code: 0, stdout: "accepted", stderr: "" };
      }
      throw new Error(`Unexpected command: ${argv.join(" ")}`);
    });

    const result = await ensureFreshInstallBundledTools({
      freshInstall: true,
      config: {
        agents: {
          defaults: {
            model: { primary: "ollama/llama3.2:latest" },
          },
        },
      },
      runtime: { log: vi.fn() },
      platform: "darwin",
      homeDir,
      stateDir,
      runCommand: runCommand as never,
      resolveChromeExecutable: () => ({
        kind: "chrome",
        path: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      }),
      fetchOllamaModels: vi.fn(async () => ({
        reachable: true,
        models: [{ name: "llama3.2:latest" }],
      })) as never,
      probeOllamaTextModel: vi.fn(async () => true),
    });

    expect(result).toEqual({
      attempted: true,
      ok: true,
      fullyReady: true,
      results: [
        expect.objectContaining({ id: "chrome", status: "already-installed" }),
        expect.objectContaining({ id: "clawd-cursor", status: "configured" }),
      ],
    });
  });
});

describe("findClawdCursorBinaryOnHost", () => {
  it("finds the Maumau-managed local Clawd Cursor binary when PATH is missing it", async () => {
    const homeDir = await makeTempHome();
    const binaryPath = path.join(homeDir, "clawdcursor", "node_modules", ".bin", "clawdcursor");
    try {
      await fs.mkdir(path.dirname(binaryPath), { recursive: true });
      await fs.writeFile(binaryPath, "#!/bin/sh\n");
      await fs.chmod(binaryPath, 0o755);

      const runCommand = vi.fn(async () => ({ code: 1, stdout: "", stderr: "" }));
      await expect(
        findClawdCursorBinaryOnHost({
          platform: "darwin",
          homeDir,
          runCommand: runCommand as never,
        }),
      ).resolves.toBe(binaryPath);
    } finally {
      await fs.rm(homeDir, { recursive: true, force: true });
    }
  });
});
