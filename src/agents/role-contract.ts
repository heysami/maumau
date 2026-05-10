import type { MaumauConfig } from "../config/config.js";
import { listConfiguredTeams } from "../teams/model.js";
import { resolveSessionTeamContext } from "../teams/runtime.js";
import {
  isRequesterRemoteMessagingChannel,
  normalizeMessageChannel,
} from "../utils/message-channel.js";
import { isTrustedOwnerDirectPreviewRoute } from "../utils/private-preview-route.js";
import { resolveAgentConfig } from "./agent-scope.js";
import { isExecutionWorkerAgentId } from "./execution-routing.js";

function normalizeRole(value?: string): string {
  return (value ?? "").trim().toLowerCase();
}

function isQaRole(role?: string): boolean {
  const normalized = normalizeRole(role);
  return normalized.includes("qa") || normalized.includes("quality assurance");
}

function resolveConfiguredRoleFallback(params: {
  config: MaumauConfig;
  agentId: string;
}): { kind: "manager" } | { kind: "specialist"; role: string } | undefined {
  const normalizedAgentId = normalizeRole(params.agentId);
  const teams = listConfiguredTeams(params.config);
  const managedTeams = teams.filter(
    (team) => normalizeRole(team.managerAgentId) === normalizedAgentId,
  );
  if (managedTeams.length === 1) {
    return { kind: "manager" };
  }
  const matchingRoles = teams.flatMap((team) =>
    (Array.isArray(team.members) ? team.members : [])
      .filter((member) => normalizeRole(member.agentId) === normalizedAgentId)
      .map((member) => member.role),
  );
  const uniqueRoles = Array.from(new Set(matchingRoles.map((role) => role.trim()).filter(Boolean)));
  if (uniqueRoles.length === 1) {
    return { kind: "specialist", role: uniqueRoles[0] };
  }
  return undefined;
}

export function buildDeliveryRouteContractNotes(params: {
  messageChannel?: string | null;
  senderIsOwner?: boolean;
  requesterTailscaleLogin?: string | null;
  groupId?: string | null;
  groupChannel?: string | null;
  groupSpace?: string | null;
}): string[] {
  const notes: string[] = [];
  const messageChannel = normalizeMessageChannel(params.messageChannel);
  if (!isRequesterRemoteMessagingChannel(messageChannel)) {
    return notes;
  }
  notes.push(
    `Delivery route contract: The current delivery surface is ${messageChannel}. Any final preview or app URL must be directly openable from the requester device on this route.`,
  );
  notes.push(
    "Delivery route contract: localhost, 127.0.0.1, [::1], bare filesystem paths, and host-only URLs do not count as delivered previews on external messaging routes.",
  );
  if (params.requesterTailscaleLogin?.trim()) {
    notes.push(
      `Delivery route contract: The requester is verified on Tailscale for this route as ${params.requesterTailscaleLogin.trim()}. If private preview capability is ready, prefer the durable private preview link. If you use a tailnet fallback, return the exact verified URL and label it as tailnet-only.`,
    );
  } else if (
    isTrustedOwnerDirectPreviewRoute({
      senderIsOwner: params.senderIsOwner,
      messageChannel,
      groupId: params.groupId,
      groupChannel: params.groupChannel,
      groupSpace: params.groupSpace,
    })
  ) {
    notes.push(
      "Delivery route contract: This is a trusted owner direct chat. If private preview capability is ready, you may return the durable private preview link even without a route-level Tailscale login. Still label it clearly as tailnet-only and never replace it with localhost, 127.0.0.1, or a bare file path.",
    );
  } else {
    notes.push(
      "Delivery route contract: The requester is not verified on Tailscale for this route. Do not assume host Tailscale or a host-local server makes the result reachable from this messaging surface. If you cannot verify a requester-openable URL, say that plainly instead of returning localhost as if it were usable.",
    );
  }
  notes.push(
    "Delivery route contract: For previewable UI work on this route, do not stop at 'run this locally' or 'open the local server' if execution tools are available. Either return a requester-openable link or clearly state that no requester-openable link could be verified yet.",
  );
  return notes;
}

export function buildAgentRoleContractNotes(params: {
  config?: MaumauConfig;
  sessionKey?: string;
  agentId: string;
  messageChannel?: string | null;
  senderIsOwner?: boolean;
  requesterTailscaleLogin?: string | null;
  groupId?: string | null;
  groupChannel?: string | null;
  groupSpace?: string | null;
}): string[] {
  const notes = [
    "Truth contract: Never claim actions, edits, delegated sessions, specialist participation, approvals, tests, previews, links, or capability paths unless they actually happened in this session.",
    "Truth contract: If something is planned, suggested, inferred, or still blocked, label it that way. If a tool or team returned blocked, forbidden, unavailable, timeout, error, or contract_failed, report that plainly and do not present the task as complete.",
    "Truth contract: If a tool or team returned accepted for delegated/background work, say that the work has started, briefly name what is being worked on, and tell the user a follow-up reply will arrive when it finishes.",
    "Truth contract: If a tool or team returned waiting_timed_out, say that you stopped waiting and that the delegated run is still active. Do not present that state as success or failure.",
    "Artifact delivery contract: If you create or update a local previewable HTML/static artifact and you do not already have a preview/share URL, include a standalone FILE:<workspace-relative-path> line for the app file or directory in your final result so delivery can recognize it.",
    "Artifact delivery contract: If durable preview publishing is unavailable for this requester or route but you can verify a non-public host-local or tailnet URL for a live web UI, return that clear fallback instead of only bare local filesystem paths.",
  ];
  notes.push(
    ...buildDeliveryRouteContractNotes({
      messageChannel: params.messageChannel,
      senderIsOwner: params.senderIsOwner,
      requesterTailscaleLogin: params.requesterTailscaleLogin,
      groupId: params.groupId,
      groupChannel: params.groupChannel,
      groupSpace: params.groupSpace,
    }),
  );
  const cfg = params.config;
  if (!cfg) {
    return notes;
  }

  const teamContext = resolveSessionTeamContext({
    cfg,
    sessionKey: params.sessionKey,
  });
  if (teamContext?.teamRole === "manager") {
    notes.push(
      "Scope contract: You are a team manager. Coordinate specialists and synthesize results, but do not substitute for architecture, development, design, or QA roles, and do not claim a specialist participated unless that specialist ran in a dedicated session.",
    );
    return notes;
  }
  if (teamContext?.teamRole) {
    if (isQaRole(teamContext.teamRole)) {
      notes.push(
        "Scope contract: You are a QA specialist. Verify and report approval or blockers only; do not implement fixes, redesign the product, or claim manager decisions or other specialists' work.",
      );
      return notes;
    }
    notes.push(
      `Scope contract: You are the ${teamContext.teamRole} specialist for this team. Stay inside that role, deliver only that role's work, and do not claim other specialists' deliverables, QA approvals, or manager decisions.`,
    );
    return notes;
  }
  const configuredRoleFallback = resolveConfiguredRoleFallback({
    config: cfg,
    agentId: params.agentId,
  });
  if (configuredRoleFallback?.kind === "manager") {
    notes.push(
      "Scope contract: You are a team manager. Coordinate specialists and synthesize results, but do not substitute for architecture, development, design, or QA roles, and do not claim a specialist participated unless that specialist ran in a dedicated session.",
    );
    return notes;
  }
  if (configuredRoleFallback?.kind === "specialist") {
    if (isQaRole(configuredRoleFallback.role)) {
      notes.push(
        "Scope contract: You are a QA specialist. Verify and report approval or blockers only; do not implement fixes, redesign the product, or claim manager decisions or other specialists' work.",
      );
      return notes;
    }
    notes.push(
      `Scope contract: You are the ${configuredRoleFallback.role} specialist for this team. Stay inside that role, deliver only that role's work, and do not claim other specialists' deliverables, QA approvals, or manager decisions.`,
    );
    return notes;
  }

  if (isExecutionWorkerAgentId(cfg, params.agentId)) {
    notes.push(
      "Scope contract: You are an execution worker. Implement directly, do not re-delegate, and only claim artifacts, edits, commands, previews, or verifications that you actually performed.",
    );
    return notes;
  }

  const agentConfig = resolveAgentConfig(cfg, params.agentId);
  if (agentConfig?.executionStyle === "orchestrator") {
    notes.push(
      "Scope contract: You are an orchestrator. Route, supervise, and synthesize, but do not claim to have personally implemented, tested, reviewed, hosted, published, or QA-approved work that was delegated or is still blocked.",
    );
    return notes;
  }

  notes.push(
    "Scope contract: Stay within the tools and authority available in this session, and do not imply broader access, approvals, or completed work than you actually have.",
  );
  return notes;
}
