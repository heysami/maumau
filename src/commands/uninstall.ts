import path from "node:path";
import { cancel, confirm, isCancel, multiselect } from "@clack/prompts";
import { formatCliCommand } from "../cli/command-format.js";
import type { RuntimeEnv } from "../runtime.js";
import { stylePromptHint, stylePromptMessage, stylePromptTitle } from "../terminal/prompt-style.js";
import { resolveHomeDir } from "../utils.js";
import { resolveCleanupPlanFromDisk } from "./cleanup-plan.js";
import {
  removeMacAppStateArtifacts,
  removePath,
  removeStateAndLinkedPaths,
  removeWorkspaceDirs,
  stopRunningMacAppIfPresent,
} from "./cleanup-utils.js";
import { uninstallGatewayServiceIfPresent } from "./gateway-service-cleanup.js";

type UninstallScope = "service" | "state" | "workspace" | "app";

export type UninstallOptions = {
  service?: boolean;
  state?: boolean;
  workspace?: boolean;
  app?: boolean;
  all?: boolean;
  yes?: boolean;
  nonInteractive?: boolean;
  dryRun?: boolean;
};

const multiselectStyled = <T>(params: Parameters<typeof multiselect<T>>[0]) =>
  multiselect({
    ...params,
    message: stylePromptMessage(params.message),
    options: params.options.map((opt) =>
      opt.hint === undefined ? opt : { ...opt, hint: stylePromptHint(opt.hint) },
    ),
  });

function buildScopeSelection(opts: UninstallOptions): {
  scopes: Set<UninstallScope>;
  hadExplicit: boolean;
} {
  const hadExplicit = Boolean(opts.all || opts.service || opts.state || opts.workspace || opts.app);
  const scopes = new Set<UninstallScope>();
  if (opts.all || opts.service) {
    scopes.add("service");
  }
  if (opts.all || opts.state) {
    scopes.add("state");
  }
  if (opts.all || opts.workspace) {
    scopes.add("workspace");
  }
  if (opts.all || opts.app) {
    scopes.add("app");
  }
  return { scopes, hadExplicit };
}

async function removeMacApp(runtime: RuntimeEnv, dryRun?: boolean) {
  if (process.platform !== "darwin") {
    return;
  }
  await removePath("/Applications/Maumau.app", runtime, {
    dryRun,
    label: "/Applications/Maumau.app",
  });
}

function logBackupRecommendation(runtime: RuntimeEnv) {
  runtime.log(`Recommended first: ${formatCliCommand("maumau backup create")}`);
}

export async function uninstallCommand(runtime: RuntimeEnv, opts: UninstallOptions) {
  const { scopes, hadExplicit } = buildScopeSelection(opts);
  const interactive = !opts.nonInteractive;
  if (!interactive && !opts.yes) {
    runtime.error("Non-interactive mode requires --yes.");
    runtime.exit(1);
    return;
  }

  if (!hadExplicit) {
    if (!interactive) {
      runtime.error("Non-interactive mode requires explicit scopes (use --all).");
      runtime.exit(1);
      return;
    }
    const selection = await multiselectStyled<UninstallScope>({
      message: "Uninstall which components?",
      options: [
        {
          value: "service",
          label: "Gateway service",
          hint: "launchd / systemd / schtasks",
        },
        { value: "state", label: "State + config", hint: "~/.maumau" },
        { value: "workspace", label: "Workspace", hint: "agent files" },
        {
          value: "app",
          label: "macOS app",
          hint: "/Applications/Maumau.app",
        },
      ],
      initialValues: ["service", "state", "workspace"],
    });
    if (isCancel(selection)) {
      cancel(stylePromptTitle("Uninstall cancelled.") ?? "Uninstall cancelled.");
      runtime.exit(0);
      return;
    }
    for (const value of selection) {
      scopes.add(value);
    }
  }

  if (scopes.size === 0) {
    runtime.log("Nothing selected.");
    return;
  }

  if (interactive && !opts.yes) {
    const ok = await confirm({
      message: stylePromptMessage("Proceed with uninstall?"),
    });
    if (isCancel(ok) || !ok) {
      cancel(stylePromptTitle("Uninstall cancelled.") ?? "Uninstall cancelled.");
      runtime.exit(0);
      return;
    }
  }

  const dryRun = Boolean(opts.dryRun);
  const { stateDir, configPath, oauthDir, configInsideState, oauthInsideState, workspaceDirs } =
    resolveCleanupPlanFromDisk();

  if (scopes.has("state") || scopes.has("workspace")) {
    logBackupRecommendation(runtime);
  }

  if (scopes.has("service")) {
    await uninstallGatewayServiceIfPresent(runtime, { dryRun });
  }

  if (scopes.has("state")) {
    await stopRunningMacAppIfPresent(runtime, { dryRun });
    await removeStateAndLinkedPaths(
      { stateDir, configPath, oauthDir, configInsideState, oauthInsideState },
      runtime,
      { dryRun },
    );
    await removeMacAppStateArtifacts(runtime, { dryRun });
  }

  if (scopes.has("workspace")) {
    await removeWorkspaceDirs(workspaceDirs, runtime, { dryRun });
  }

  if (scopes.has("app")) {
    await stopRunningMacAppIfPresent(runtime, { dryRun });
    await removeMacApp(runtime, dryRun);
  }

  if (scopes.has("state")) {
    runtime.log("Removing local state also removes any app-managed CLI under ~/.maumau/bin.");
  }
  runtime.log("If you installed Maumau globally via npm/pnpm, that CLI may still remain.");

  if (scopes.has("state") && !scopes.has("workspace")) {
    const home = resolveHomeDir();
    if (home && workspaceDirs.some((dir) => dir.startsWith(path.resolve(home)))) {
      runtime.log("Tip: workspaces were preserved. Re-run with --workspace to remove them.");
    }
  }
}
