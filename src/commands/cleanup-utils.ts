import fs from "node:fs/promises";
import path from "node:path";
import { resolveDefaultAgentWorkspaceDir } from "../agents/workspace.js";
import type { MaumauConfig } from "../config/config.js";
import { runCommandWithTimeout } from "../process/exec.js";
import type { RuntimeEnv } from "../runtime.js";
import { resolveHomeDir, resolveUserPath, shortenHomeInString, sleep } from "../utils.js";

export type RemovalResult = {
  ok: boolean;
  skipped?: boolean;
};

export type CleanupResolvedPaths = {
  stateDir: string;
  configPath: string;
  oauthDir: string;
  configInsideState: boolean;
  oauthInsideState: boolean;
};

export function collectWorkspaceDirs(cfg: MaumauConfig | undefined): string[] {
  const dirs = new Set<string>();
  const defaults = cfg?.agents?.defaults;
  if (typeof defaults?.workspace === "string" && defaults.workspace.trim()) {
    dirs.add(resolveUserPath(defaults.workspace));
  }
  const list = Array.isArray(cfg?.agents?.list) ? cfg?.agents?.list : [];
  for (const agent of list) {
    const workspace = (agent as { workspace?: unknown }).workspace;
    if (typeof workspace === "string" && workspace.trim()) {
      dirs.add(resolveUserPath(workspace));
    }
  }
  if (dirs.size === 0) {
    dirs.add(resolveDefaultAgentWorkspaceDir());
  }
  return [...dirs];
}

export function buildCleanupPlan(params: {
  cfg: MaumauConfig | undefined;
  stateDir: string;
  configPath: string;
  oauthDir: string;
}): {
  configInsideState: boolean;
  oauthInsideState: boolean;
  workspaceDirs: string[];
} {
  return {
    configInsideState: isPathWithin(params.configPath, params.stateDir),
    oauthInsideState: isPathWithin(params.oauthDir, params.stateDir),
    workspaceDirs: collectWorkspaceDirs(params.cfg),
  };
}

export function isPathWithin(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isUnsafeRemovalTarget(target: string): boolean {
  if (!target.trim()) {
    return true;
  }
  const resolved = path.resolve(target);
  const root = path.parse(resolved).root;
  if (resolved === root) {
    return true;
  }
  const home = resolveHomeDir();
  if (home && resolved === path.resolve(home)) {
    return true;
  }
  return false;
}

export async function removePath(
  target: string,
  runtime: RuntimeEnv,
  opts?: { dryRun?: boolean; label?: string },
): Promise<RemovalResult> {
  if (!target?.trim()) {
    return { ok: false, skipped: true };
  }
  const resolved = path.resolve(target);
  const label = opts?.label ?? resolved;
  const displayLabel = shortenHomeInString(label);
  if (isUnsafeRemovalTarget(resolved)) {
    runtime.error(`Refusing to remove unsafe path: ${displayLabel}`);
    return { ok: false };
  }
  if (opts?.dryRun) {
    runtime.log(`[dry-run] remove ${displayLabel}`);
    return { ok: true, skipped: true };
  }
  try {
    await fs.rm(resolved, { recursive: true, force: true });
    runtime.log(`Removed ${displayLabel}`);
    return { ok: true };
  } catch (err) {
    runtime.error(`Failed to remove ${displayLabel}: ${String(err)}`);
    return { ok: false };
  }
}

export async function removeStateAndLinkedPaths(
  cleanup: CleanupResolvedPaths,
  runtime: RuntimeEnv,
  opts?: { dryRun?: boolean },
): Promise<void> {
  await removePath(cleanup.stateDir, runtime, {
    dryRun: opts?.dryRun,
    label: cleanup.stateDir,
  });
  if (!cleanup.configInsideState) {
    await removePath(cleanup.configPath, runtime, {
      dryRun: opts?.dryRun,
      label: cleanup.configPath,
    });
  }
  if (!cleanup.oauthInsideState) {
    await removePath(cleanup.oauthDir, runtime, {
      dryRun: opts?.dryRun,
      label: cleanup.oauthDir,
    });
  }
}

export async function removeWorkspaceDirs(
  workspaceDirs: readonly string[],
  runtime: RuntimeEnv,
  opts?: { dryRun?: boolean },
): Promise<void> {
  for (const workspace of workspaceDirs) {
    await removePath(workspace, runtime, {
      dryRun: opts?.dryRun,
      label: workspace,
    });
  }
}

export function resolveMacAppStateArtifactPaths(
  home: string | undefined = resolveHomeDir(),
): string[] {
  if (!home) {
    return [];
  }

  return [
    path.join(home, "Library", "Preferences", "ai.maumau.mac.plist"),
    path.join(home, "Library", "Preferences", "ai.maumau.mac.debug.plist"),
    path.join(home, "Library", "Preferences", "ai.maumau.shared.plist"),
    path.join(home, "Library", "Group Containers", "group.ai.maumau.shared"),
    path.join(home, "Library", "Application Support", "Maumau"),
    path.join(home, "Library", "WebKit", "ai.maumau.mac"),
    path.join(home, "Library", "WebKit", "ai.maumau.mac.debug"),
    path.join(home, "Library", "HTTPStorages", "ai.maumau.mac"),
    path.join(home, "Library", "HTTPStorages", "ai.maumau.mac.debug"),
    path.join(home, "Library", "Caches", "ai.maumau.mac"),
    path.join(home, "Library", "Caches", "ai.maumau.mac.debug"),
    path.join(home, "Library", "Saved Application State", "ai.maumau.mac.savedState"),
    path.join(home, "Library", "Saved Application State", "ai.maumau.mac.debug.savedState"),
  ];
}

export async function removeMacAppStateArtifacts(
  runtime: RuntimeEnv,
  opts?: { dryRun?: boolean },
): Promise<void> {
  if (process.platform !== "darwin") {
    return;
  }

  for (const target of resolveMacAppStateArtifactPaths()) {
    await removePath(target, runtime, {
      dryRun: opts?.dryRun,
      label: target,
    });
  }
}

async function runMacProcessCommand(argv: string[]): Promise<number | null> {
  try {
    const result = await runCommandWithTimeout(argv, { timeoutMs: 2_000 });
    return result.code;
  } catch {
    return null;
  }
}

async function hasRunningMacAppProcess(): Promise<boolean> {
  const code = await runMacProcessCommand(["pgrep", "-f", "Maumau.app/Contents/MacOS/Maumau"]);
  if (code === 0) {
    return true;
  }
  return (await runMacProcessCommand(["pgrep", "-x", "Maumau"])) === 0;
}

export async function stopRunningMacAppIfPresent(
  runtime: RuntimeEnv,
  opts?: { dryRun?: boolean },
): Promise<void> {
  if (process.platform !== "darwin") {
    return;
  }
  if (opts?.dryRun) {
    runtime.log("[dry-run] stop running Maumau app");
    return;
  }

  await runMacProcessCommand(["osascript", "-e", 'tell application "Maumau" to quit']);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    await runMacProcessCommand(["pkill", "-f", "Maumau.app/Contents/MacOS/Maumau"]);
    await runMacProcessCommand(["pkill", "-x", "Maumau"]);
    if (!(await hasRunningMacAppProcess())) {
      runtime.log("Stopped running Maumau app.");
      return;
    }
    await sleep(200);
  }

  runtime.error(
    "Maumau app is still running after reset cleanup attempted to stop it; local app state may be recreated until it fully exits.",
  );
}

export async function clearMacLaunchctlGatewayEnvOverrides(
  runtime: RuntimeEnv,
  opts?: { dryRun?: boolean },
): Promise<void> {
  if (process.platform !== "darwin") {
    return;
  }

  for (const key of ["MAUMAU_GATEWAY_TOKEN", "MAUMAU_GATEWAY_PASSWORD"]) {
    if (opts?.dryRun) {
      runtime.log(`[dry-run] launchctl unsetenv ${key}`);
      continue;
    }

    const code = await runMacProcessCommand(["launchctl", "unsetenv", key]);
    if (code === 0) {
      runtime.log(`Cleared launchctl ${key} override if present.`);
    }
  }
}

export async function listAgentSessionDirs(stateDir: string): Promise<string[]> {
  const root = path.join(stateDir, "agents");
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(root, entry.name, "sessions"));
  } catch {
    return [];
  }
}
