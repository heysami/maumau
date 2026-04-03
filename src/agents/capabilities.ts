import { spawnSync } from "node:child_process";
import os from "node:os";
import { browserStatus } from "../browser/client.js";
import { ensureChromeMcpAvailable, listChromeMcpTabs } from "../browser/chrome-mcp.js";
import { resolveBrowserConfig, resolveProfile } from "../browser/config.js";
import { findClawdCursorBinaryOnHost } from "../commands/onboard-bundled-tools.js";
import type { MaumauConfig } from "../config/config.js";
import { readTailscaleStatusJson } from "../infra/tailscale.js";
import {
  resolvePrivatePreviewAccess,
  resolvePublicShareAccess,
} from "../gateway/previews.js";
import { isRequesterTrustedForPrivatePreview } from "../utils/private-preview-route.js";
import { isOwnerOnlyToolName, mergeAlsoAllowPolicy, resolveToolProfilePolicy } from "./tool-policy.js";
import { isToolAllowedByPolicies } from "./tool-policy-match.js";
import { listCoreToolSections } from "./tool-catalog.js";
import { resolveEffectiveToolPolicy } from "./pi-tools.policy.js";
import { resolveSessionAgentId } from "./agent-scope.js";
import { evaluateTeamWorkflowContractReadiness } from "../teams/contracts.js";
import {
  findTeamWorkflow,
  listAccessibleTeams,
  listConfiguredTeams,
  resolveDefaultTeamWorkflowId,
} from "../teams/model.js";

export type CapabilityBlockedReason =
  | "not_in_profile"
  | "not_installed"
  | "not_configured"
  | "route_blocked"
  | "approval_required"
  | "host_missing"
  | "depth_limited"
  | "policy_denied"
  | "user_not_on_tailscale"
  | "share_consent_required"
  | "service_not_running"
  | "doctor_failed"
  | "desktop_permission_missing"
  | "provider_unavailable";

export type CapabilityRow = {
  id: string;
  kind: "tool" | "team" | "browser" | "desktop" | "preview";
  declared: boolean;
  exposedToSession: boolean;
  installed: boolean;
  ready: boolean;
  blockedReason?: CapabilityBlockedReason;
  suggestedFix?: string;
  driver?: string;
  running?: boolean;
  doctorPassed?: boolean;
  permissionGranted?: boolean;
  providerConfigured?: boolean;
  routeAllowed?: boolean;
  ownerDmOnly?: boolean;
  userOnTailscale?: boolean;
  privateReady?: boolean;
  publicShareReady?: boolean;
};

export type SessionCapabilityOptions = {
  config?: MaumauConfig;
  agentSessionKey?: string;
  senderIsOwner?: boolean;
  senderName?: string | null;
  senderUsername?: string | null;
  requesterTailscaleLogin?: string | null;
  messageChannel?: string;
  groupId?: string | null;
  groupChannel?: string | null;
  groupSpace?: string | null;
};

function isDirectRoute(opts: SessionCapabilityOptions): boolean {
  return !opts.groupId && !opts.groupChannel && !opts.groupSpace;
}

function isOwnerDmRoute(opts: SessionCapabilityOptions): boolean {
  return opts.senderIsOwner === true && isDirectRoute(opts);
}

function isToolExposedToSession(opts: SessionCapabilityOptions, toolName: string): boolean {
  const cfg = opts.config ?? {};
  const {
    globalPolicy,
    globalProviderPolicy,
    agentPolicy,
    agentProviderPolicy,
    profile,
    providerProfile,
    profileAlsoAllow,
    providerProfileAlsoAllow,
  } = resolveEffectiveToolPolicy({
    config: cfg,
    sessionKey: opts.agentSessionKey,
    agentId: resolveSessionAgentId({
      config: cfg,
      sessionKey: opts.agentSessionKey,
    }),
  });
  const profilePolicy = mergeAlsoAllowPolicy(resolveToolProfilePolicy(profile), profileAlsoAllow);
  const providerProfilePolicy = mergeAlsoAllowPolicy(
    resolveToolProfilePolicy(providerProfile),
    providerProfileAlsoAllow,
  );
  const allowed = isToolAllowedByPolicies(toolName, [
    profilePolicy,
    providerProfilePolicy,
    globalPolicy,
    globalProviderPolicy,
    agentPolicy,
    agentProviderPolicy,
  ]);
  if (!allowed) {
    return false;
  }
  if (opts.senderIsOwner !== true && isOwnerOnlyToolName(toolName)) {
    return false;
  }
  return true;
}

function resolveBrowserRouteAllowed(opts: SessionCapabilityOptions) {
  return isOwnerDmRoute(opts);
}

function resolvePreviewRouteAllowed(opts: SessionCapabilityOptions) {
  return isOwnerDmRoute(opts);
}

function runCommand(
  command: string,
  args: string[],
  opts?: { timeoutMs?: number },
): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: opts?.timeoutMs ?? 1500,
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function findBinaryOnPath(names: string[]): string | undefined {
  if (process.platform === "win32") {
    for (const name of names) {
      const result = runCommand("where", [name], { timeoutMs: 1000 });
      const match = result.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
      if (result.ok && match) {
        return match;
      }
    }
    return undefined;
  }
  for (const name of names) {
    const result = runCommand("sh", ["-lc", `command -v ${name}`], { timeoutMs: 1000 });
    const match = result.stdout.trim();
    if (result.ok && match) {
      return match;
    }
  }
  return undefined;
}

function isClawdProviderConfigured(cfg: MaumauConfig | undefined): boolean {
  const profiles = cfg?.browser?.profiles;
  if (!profiles || typeof profiles !== "object") {
    return false;
  }
  return Object.values(profiles).some((profile) => profile?.driver === "clawd");
}

function probeAccessibilityPermission(): boolean | undefined {
  if (process.platform !== "darwin") {
    return undefined;
  }
  const result = runCommand(
    "osascript",
    ["-e", 'tell application "System Events" to return UI elements enabled'],
    { timeoutMs: 1500 },
  );
  if (!result.ok) {
    return false;
  }
  return result.stdout.trim().toLowerCase() === "true";
}

async function buildBrowserCapability(params: {
  cfg: MaumauConfig;
  profileName: string;
  id: "browser-existing-session" | "browser-maumau";
  driver: "existing-session" | "maumau";
  opts: SessionCapabilityOptions;
}): Promise<CapabilityRow> {
  const browserCfg = resolveBrowserConfig(params.cfg.browser, params.cfg);
  const profile = resolveProfile(browserCfg, params.profileName);
  const exposedToSession = isToolExposedToSession(params.opts, "browser");
  const routeAllowed = resolveBrowserRouteAllowed(params.opts);
  const declared = browserCfg.enabled && profile?.driver === params.driver;
  const providerConfigured = declared;

  if (!declared) {
    return {
      id: params.id,
      kind: "browser",
      declared,
      exposedToSession,
      installed: false,
      ready: false,
      blockedReason: "not_configured",
      suggestedFix: `Configure a browser profile for driver "${params.driver}".`,
      driver: params.driver,
      providerConfigured,
      routeAllowed,
      ownerDmOnly: true,
    };
  }
  if (!exposedToSession) {
    return {
      id: params.id,
      kind: "browser",
      declared,
      exposedToSession,
      installed: false,
      ready: false,
      blockedReason: "not_in_profile",
      suggestedFix: "Allow the browser tool for this agent session.",
      driver: params.driver,
      providerConfigured,
      routeAllowed,
      ownerDmOnly: true,
    };
  }
  if (!routeAllowed) {
    return {
      id: params.id,
      kind: "browser",
      declared,
      exposedToSession,
      installed: false,
      ready: false,
      blockedReason: "route_blocked",
      suggestedFix: "Use this workflow from an owner direct chat.",
      driver: params.driver,
      providerConfigured,
      routeAllowed,
      ownerDmOnly: true,
    };
  }

  try {
    const status = await browserStatus(undefined, { profile: params.profileName });
    const installed = Boolean(status.chosenBrowser || status.detectedExecutablePath);
    const running = status.running;
    if (!installed) {
      return {
        id: params.id,
        kind: "browser",
        declared,
        exposedToSession,
        installed: false,
        ready: false,
        blockedReason: "not_installed",
        suggestedFix: "Install a supported local Chrome/Chromium browser.",
        driver: params.driver,
        running,
        providerConfigured,
        routeAllowed,
        ownerDmOnly: true,
      };
    }
    if (!running) {
      return {
        id: params.id,
        kind: "browser",
        declared,
        exposedToSession,
        installed,
        ready: false,
        blockedReason: "service_not_running",
        suggestedFix:
          params.driver === "existing-session"
            ? "Start the browser profile or attach the existing-session browser service."
            : "Start the managed browser profile before using it.",
        driver: params.driver,
        running,
        providerConfigured,
        routeAllowed,
        ownerDmOnly: true,
      };
    }

    if (params.driver === "existing-session") {
      const profileUserDataDir = profile?.userDataDir;
      try {
        await ensureChromeMcpAvailable(params.profileName, profileUserDataDir);
        await listChromeMcpTabs(params.profileName, profileUserDataDir);
        return {
          id: params.id,
          kind: "browser",
          declared,
          exposedToSession,
          installed,
          ready: true,
          driver: params.driver,
          running,
          doctorPassed: true,
          providerConfigured,
          routeAllowed,
          ownerDmOnly: true,
        };
      } catch (err) {
        return {
          id: params.id,
          kind: "browser",
          declared,
          exposedToSession,
          installed,
          ready: false,
          blockedReason: "doctor_failed",
          suggestedFix: err instanceof Error ? err.message : "Reconnect Chrome MCP to the signed-in browser session.",
          driver: params.driver,
          running,
          doctorPassed: false,
          providerConfigured,
          routeAllowed,
          ownerDmOnly: true,
        };
      }
    }

    const doctorPassed = status.cdpReady === true && status.cdpHttp === true;
    return {
      id: params.id,
      kind: "browser",
      declared,
      exposedToSession,
      installed,
      ready: doctorPassed,
      blockedReason: doctorPassed ? undefined : "doctor_failed",
      suggestedFix: doctorPassed ? undefined : "Bring the managed browser profile to a CDP-ready state.",
      driver: params.driver,
      running,
      doctorPassed,
      providerConfigured,
      routeAllowed,
      ownerDmOnly: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      id: params.id,
      kind: "browser",
      declared,
      exposedToSession,
      installed: false,
      ready: false,
      blockedReason: message.includes("ECONNREFUSED") ? "service_not_running" : "host_missing",
      suggestedFix:
        params.driver === "existing-session"
          ? "Start the browser control service and reconnect the existing-session profile."
          : "Start the browser control service on this host.",
      driver: params.driver,
      running: false,
      providerConfigured,
      routeAllowed,
      ownerDmOnly: true,
    };
  }
}

async function buildClawdCursorCapability(
  cfg: MaumauConfig,
  opts: SessionCapabilityOptions,
): Promise<CapabilityRow> {
  const exposedToSession = isToolExposedToSession(opts, "browser");
  const routeAllowed = resolveBrowserRouteAllowed(opts);
  const binaryPath = await findClawdCursorBinaryOnHost();
  const providerConfigured = isClawdProviderConfigured(cfg);
  const permissionGranted = probeAccessibilityPermission();
  const running =
    Boolean(findBinaryOnPath(["pgrep"])) &&
    runCommand("sh", ["-lc", "pgrep -f 'clawdcursor|clawd-cursor'"], { timeoutMs: 1000 }).ok;

  if (!exposedToSession) {
    return {
      id: "clawd-cursor",
      kind: "desktop",
      declared: true,
      exposedToSession,
      installed: Boolean(binaryPath),
      ready: false,
      blockedReason: "not_in_profile",
      suggestedFix: "Allow the browser/desktop automation lane for this session.",
      routeAllowed,
      ownerDmOnly: true,
      providerConfigured,
      permissionGranted,
      running,
    };
  }
  if (!routeAllowed) {
    return {
      id: "clawd-cursor",
      kind: "desktop",
      declared: true,
      exposedToSession,
      installed: Boolean(binaryPath),
      ready: false,
      blockedReason: "route_blocked",
      suggestedFix: "Use Clawd Cursor only from an owner direct chat.",
      routeAllowed,
      ownerDmOnly: true,
      providerConfigured,
      permissionGranted,
      running,
    };
  }
  if (!binaryPath) {
    return {
      id: "clawd-cursor",
      kind: "desktop",
      declared: true,
      exposedToSession,
      installed: false,
      ready: false,
      blockedReason: "not_installed",
      suggestedFix: "Install the clawd-cursor desktop helper binary.",
      routeAllowed,
      ownerDmOnly: true,
      providerConfigured,
      permissionGranted,
      running: false,
    };
  }
  if (!providerConfigured) {
    return {
      id: "clawd-cursor",
      kind: "desktop",
      declared: true,
      exposedToSession,
      installed: true,
      ready: false,
      blockedReason: "not_configured",
      suggestedFix: 'Configure a browser profile with driver "clawd" for this fallback lane.',
      routeAllowed,
      ownerDmOnly: true,
      providerConfigured,
      permissionGranted,
      running,
    };
  }
  if (permissionGranted === false) {
    return {
      id: "clawd-cursor",
      kind: "desktop",
      declared: true,
      exposedToSession,
      installed: true,
      ready: false,
      blockedReason: "desktop_permission_missing",
      suggestedFix: "Grant macOS Accessibility permission to the desktop automation helper.",
      routeAllowed,
      ownerDmOnly: true,
      providerConfigured,
      permissionGranted,
      running,
    };
  }
  const doctor = runCommand(binaryPath, ["doctor"], { timeoutMs: 2500 });
  if (!doctor.ok) {
    return {
      id: "clawd-cursor",
      kind: "desktop",
      declared: true,
      exposedToSession,
      installed: true,
      ready: false,
      blockedReason: "doctor_failed",
      suggestedFix: doctor.stderr.trim() || doctor.stdout.trim() || "Run clawdcursor doctor and fix the reported issue.",
      routeAllowed,
      ownerDmOnly: true,
      providerConfigured,
      permissionGranted,
      doctorPassed: false,
      running,
    };
  }
  if (!running) {
    return {
      id: "clawd-cursor",
      kind: "desktop",
      declared: true,
      exposedToSession,
      installed: true,
      ready: false,
      blockedReason: "service_not_running",
      suggestedFix: "Start the Clawd Cursor desktop service before retrying.",
      routeAllowed,
      ownerDmOnly: true,
      providerConfigured,
      permissionGranted,
      doctorPassed: true,
      running,
    };
  }
  return {
    id: "clawd-cursor",
    kind: "desktop",
    declared: true,
    exposedToSession,
    installed: true,
    ready: true,
    routeAllowed,
    ownerDmOnly: true,
    providerConfigured,
    permissionGranted,
    doctorPassed: true,
    running,
  };
}

async function buildPreviewCapabilities(
  cfg: MaumauConfig,
  opts: SessionCapabilityOptions,
): Promise<CapabilityRow[]> {
  const exposedToSession = isToolExposedToSession(opts, "preview_publish");
  const routeAllowed = resolvePreviewRouteAllowed(opts);
  let hostTailscaleAvailable = false;
  try {
    await readTailscaleStatusJson();
    hostTailscaleAvailable = true;
  } catch {
    hostTailscaleAvailable = false;
  }
  const privateAccess = await resolvePrivatePreviewAccess({
    cfg,
    senderIsOwner: opts.senderIsOwner,
    requesterTailscaleLogin: opts.requesterTailscaleLogin,
    messageChannel: opts.messageChannel,
    groupId: opts.groupId,
    groupChannel: opts.groupChannel,
    groupSpace: opts.groupSpace,
  });
  const publicShareAccess = await resolvePublicShareAccess({ cfg });
  const userOnTailscale = isRequesterTrustedForPrivatePreview({
    senderIsOwner: opts.senderIsOwner,
    requesterTailscaleLogin: opts.requesterTailscaleLogin,
    messageChannel: opts.messageChannel,
    groupId: opts.groupId,
    groupChannel: opts.groupChannel,
    groupSpace: opts.groupSpace,
  });
  const privateReady = exposedToSession && routeAllowed && privateAccess.ready;
  const publicShareReady = exposedToSession && routeAllowed && publicShareAccess.ready;

  return [
    {
      id: "preview-private",
      kind: "preview",
      declared: true,
      exposedToSession,
      installed: hostTailscaleAvailable,
      ready: privateReady,
      blockedReason: !exposedToSession
        ? "not_in_profile"
        : !routeAllowed
          ? "route_blocked"
          : privateAccess.blockedReason,
      suggestedFix: !routeAllowed
        ? "Use preview publishing from an owner direct chat."
        : privateAccess.suggestedFix,
      routeAllowed,
      ownerDmOnly: true,
      userOnTailscale,
      privateReady,
      publicShareReady,
    },
    {
      id: "preview-public-share",
      kind: "preview",
      declared: true,
      exposedToSession,
      installed: hostTailscaleAvailable,
      ready: publicShareReady,
      blockedReason: !exposedToSession
        ? "not_in_profile"
        : !routeAllowed
          ? "route_blocked"
          : publicShareAccess.blockedReason,
      suggestedFix: !routeAllowed
        ? "Use public-share fallback only from an owner direct chat."
        : publicShareReady
          ? "Public share creation still needs explicit user consent and a TTL."
          : publicShareAccess.suggestedFix,
      routeAllowed,
      ownerDmOnly: true,
      userOnTailscale,
      privateReady,
      publicShareReady,
    },
  ];
}

export async function listSessionCapabilities(
  opts: SessionCapabilityOptions,
): Promise<CapabilityRow[]> {
  const cfg = opts.config ?? {};
  const rows: CapabilityRow[] = [];

  for (const section of listCoreToolSections()) {
    for (const tool of section.tools) {
      const exposedToSession = isToolExposedToSession(opts, tool.id);
      rows.push({
        id: tool.id,
        kind: "tool",
        declared: true,
        exposedToSession,
        installed: true,
        ready: exposedToSession,
        blockedReason: exposedToSession ? undefined : "not_in_profile",
        suggestedFix: exposedToSession ? undefined : `Allow the ${tool.id} tool for this agent session.`,
      });
    }
  }

  const accessibleTeams = listAccessibleTeams(cfg, undefined);
  for (const { team, runnable } of accessibleTeams) {
    const workflow = findTeamWorkflow(team, resolveDefaultTeamWorkflowId(team));
    const readiness = evaluateTeamWorkflowContractReadiness({
      cfg,
      team,
      workflow,
    });
    rows.push({
      id: `team:${team.id}`,
      kind: "team",
      declared: listConfiguredTeams(cfg).some((entry) => entry.id === team.id),
      exposedToSession: isToolExposedToSession(opts, "teams_run"),
      installed: runnable,
      ready: runnable && readiness.contractReady,
      blockedReason: !isToolExposedToSession(opts, "teams_run")
        ? "not_in_profile"
        : !runnable
          ? "policy_denied"
          : readiness.contractReady
            ? undefined
            : "provider_unavailable",
      suggestedFix:
        !runnable
          ? "Use a team that is linked to the current team or run from a non-team session."
          : readiness.contractReady
            ? undefined
            : readiness.blockingReasons[0],
    });
  }

  rows.push(
    await buildBrowserCapability({
      cfg,
      profileName: "user",
      id: "browser-existing-session",
      driver: "existing-session",
      opts,
    }),
  );
  rows.push(
    await buildBrowserCapability({
      cfg,
      profileName: "maumau",
      id: "browser-maumau",
      driver: "maumau",
      opts,
    }),
  );
  rows.push(await buildClawdCursorCapability(cfg, opts));
  rows.push(...(await buildPreviewCapabilities(cfg, opts)));

  return rows;
}

export async function summarizeCapabilitiesForPrompt(
  opts: SessionCapabilityOptions,
): Promise<string[]> {
  const rows = await listSessionCapabilities(opts);
  const interestingIds = new Set([
    "browser-existing-session",
    "browser-maumau",
    "clawd-cursor",
    "preview-private",
    "preview-public-share",
  ]);
  return rows
    .filter((row) => interestingIds.has(row.id))
    .map((row) => formatCapabilityPromptSummaryLine(row));
}

export function formatCapabilityPromptSummaryLine(row: CapabilityRow): string {
  const status = row.ready ? "ready" : row.blockedReason ?? "blocked";
  const suggestedFix = row.suggestedFix ? ` ${row.suggestedFix}` : "";
  switch (row.id) {
    case "browser-existing-session":
      return row.ready
        ? "Capability browser-existing-session: ready. Use this as the primary browser/account automation lane before managed browser or desktop fallback."
        : `Capability browser-existing-session: ${status}.${suggestedFix}`;
    case "browser-maumau":
      return row.ready
        ? "Capability browser-maumau: ready. Use this managed browser lane when an existing signed-in browser session is unavailable or insufficient."
        : `Capability browser-maumau: ${status}.${suggestedFix}`;
    case "clawd-cursor":
      return row.ready
        ? "Capability clawd-cursor: ready. Use it only as the desktop fallback when browser-only automation or dedicated integrations are insufficient."
        : `Capability clawd-cursor: ${status}.${suggestedFix}`;
    case "preview-private":
      if (row.ready) {
        return "Capability preview-private: ready. If you produce a previewable HTML/static web artifact for a chat or mobile requester, proactively publish a private preview link instead of replying with only local paths or LAN URLs. On external messaging routes, localhost and 127.0.0.1 still do not count as delivered preview links. If you also mention the local artifact, include a standalone FILE:<workspace-relative-path> line so delivery can recognize it.";
      }
      if (row.blockedReason === "user_not_on_tailscale") {
        return row.installed
          ? "Capability preview-private: user_not_on_tailscale. Do not auto-send a gateway private preview URL. If the user still needs a live previewable UI now and you can verify a non-public requester-openable URL, return that clearly as a tailnet-only fallback instead of only local file paths. On external messaging routes, localhost and 127.0.0.1 do not satisfy this fallback. Offer a temporary public share only as an explicit opt-in with TTL and privacy warning, or explain the exact Tailscale gap."
          : "Capability preview-private: user_not_on_tailscale. Do not auto-send a private preview URL. Offer a temporary public share only as an explicit opt-in with TTL and privacy warning, or explain the exact Tailscale gap.";
      }
      if (row.blockedReason === "route_blocked") {
        return "Capability preview-private: route_blocked. preview_publish is unavailable on this route. If the user still needs a live previewable web UI now and you have execution tools, proactively arrange a simple host-local server, verify it, and return a requester-openable non-loopback URL instead of only localhost instructions. On external messaging routes, localhost and 127.0.0.1 do not count as delivered previews.";
      }
      return `Capability preview-private: ${status}.${suggestedFix}`;
    case "preview-public-share":
      return row.ready
        ? "Capability preview-public-share: ready. Public shares are never automatic; create one only after explicit user consent and include the temporary TTL."
        : `Capability preview-public-share: ${status}.${suggestedFix}`;
    default:
      return `Capability ${row.id}: ${status}.${suggestedFix}`;
  }
}
