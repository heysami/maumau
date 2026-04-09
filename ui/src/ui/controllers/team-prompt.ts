import type { AgentConfig } from "../../../../src/config/types.agents.js";
import type { MaumauConfig } from "../../../../src/config/types.maumau.js";
import type { TeamConfig, TeamWorkflowConfig } from "../../../../src/config/types.teams.js";
import { listTeamWorkflows, resolveDefaultTeamWorkflowId } from "../../../../src/teams/model.js";
import type { GatewayBrowserClient } from "../gateway.ts";
import type { DashboardTeamSnapshotsResult } from "../types.ts";
import type { TeamPromptEditResult } from "../types.ts";
import type { ConfigState } from "./config.ts";
import { replaceConfigFormRoot } from "./config.ts";
import { cloneConfigObject, serializeConfigForm } from "./config/form-utils.ts";
import { loadDashboardTeamSnapshots } from "./dashboard.ts";

type TeamPromptHost = Pick<
  ConfigState,
  "configForm" | "configSnapshot" | "configFormMode" | "configRaw" | "configFormDirty" | "lastError"
> & {
  client: GatewayBrowserClient | null;
  connected: boolean;
  teamPromptDialogOpen: boolean;
  teamPromptTeamId: string | null;
  teamPromptTeamLabel: string;
  teamPromptWorkflowId: string | null;
  teamPromptWorkflowLabel: string;
  teamPromptDraft: string;
  teamPromptBusy: boolean;
  teamPromptError: string | null;
  teamPromptSummary: string | null;
  teamPromptWarnings: string[];
  dashboardTeamsLoading?: boolean;
  dashboardTeamsError?: string | null;
  dashboardTeamSnapshots?: DashboardTeamSnapshotsResult | null;
};

type TeamPromptTarget = {
  teamId: string;
  teamLabel: string;
  workflowId: string;
  workflowLabel: string;
};

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function currentConfigRoot(host: TeamPromptHost): Record<string, unknown> | null {
  return host.configForm ?? (host.configSnapshot?.config as Record<string, unknown> | null);
}

function currentConfigOrThrow(host: TeamPromptHost): Record<string, unknown> {
  const config = currentConfigRoot(host);
  if (!config) {
    throw new Error("Config is not loaded yet. Refresh and try again.");
  }
  return config;
}

function findTeamIndex(config: Record<string, unknown>, teamId: string): number {
  const list = (config as { teams?: { list?: TeamConfig[] } }).teams?.list;
  return Array.isArray(list) ? list.findIndex((entry) => entry?.id === teamId) : -1;
}

function applyNullableStringPatch(
  target: Record<string, unknown>,
  patch: Record<string, unknown>,
  key: string,
) {
  if (!hasOwn(patch, key)) {
    return;
  }
  const next = patch[key];
  if (typeof next === "string") {
    target[key] = next;
    return;
  }
  if (next === null) {
    delete target[key];
  }
}

function applyBooleanPatch(
  target: Record<string, unknown>,
  patch: Record<string, unknown>,
  key: string,
) {
  if (!hasOwn(patch, key)) {
    return;
  }
  const next = patch[key];
  if (typeof next === "boolean") {
    target[key] = next;
  }
}

function applyTeamPatch(team: TeamConfig, result: TeamPromptEditResult): TeamConfig {
  if (!result.teamPatch) {
    return team;
  }
  const next = cloneConfigObject(team) as Record<string, unknown>;
  const patch = result.teamPatch as Record<string, unknown>;
  applyNullableStringPatch(next, patch, "name");
  applyNullableStringPatch(next, patch, "description");
  if (typeof patch.managerAgentId === "string") {
    next.managerAgentId = patch.managerAgentId;
  }
  applyBooleanPatch(next, patch, "implicitForManagerSessions");
  if (hasOwn(patch, "members") && Array.isArray(result.teamPatch.members)) {
    next.members = cloneConfigObject(result.teamPatch.members);
  }
  if (hasOwn(patch, "crossTeamLinks") && Array.isArray(result.teamPatch.crossTeamLinks)) {
    next.crossTeamLinks = cloneConfigObject(result.teamPatch.crossTeamLinks);
  }
  return next as TeamConfig;
}

function applyWorkflowPatchToTeam(
  team: TeamConfig,
  workflowId: string,
  result: TeamPromptEditResult,
): TeamConfig {
  if (!result.workflowPatch) {
    return team;
  }
  const workflows = listTeamWorkflows(team).map((workflow) => cloneConfigObject(workflow));
  const targetWorkflowId = workflowId || resolveDefaultTeamWorkflowId(team);
  const workflowIndex = workflows.findIndex((workflow) => workflow.id === targetWorkflowId);
  if (workflowIndex < 0) {
    return team;
  }
  const nextWorkflow = cloneConfigObject(workflows[workflowIndex]) as Record<string, unknown>;
  const patch = result.workflowPatch as Record<string, unknown>;
  applyNullableStringPatch(nextWorkflow, patch, "name");
  applyNullableStringPatch(nextWorkflow, patch, "description");
  applyNullableStringPatch(nextWorkflow, patch, "managerPrompt");
  applyNullableStringPatch(nextWorkflow, patch, "synthesisPrompt");
  if (hasOwn(patch, "lifecycle")) {
    nextWorkflow.lifecycle =
      result.workflowPatch.lifecycle === null
        ? undefined
        : cloneConfigObject(result.workflowPatch.lifecycle);
  }
  if (hasOwn(patch, "contract")) {
    nextWorkflow.contract =
      result.workflowPatch.contract === null
        ? undefined
        : cloneConfigObject(result.workflowPatch.contract);
  }
  workflows[workflowIndex] = nextWorkflow as TeamWorkflowConfig;
  return {
    ...team,
    workflows,
    workflow: undefined,
  };
}

function applyAgentPatches(config: Record<string, unknown>, result: TeamPromptEditResult) {
  if (!Array.isArray(result.agentPatches) || result.agentPatches.length === 0) {
    return;
  }
  const agentsRecord = ((config.agents ?? {}) as { list?: AgentConfig[] }) ?? {};
  const list = Array.isArray(agentsRecord.list) ? cloneConfigObject(agentsRecord.list) : [];
  for (const patch of result.agentPatches) {
    const existingIndex = list.findIndex((entry) => entry.id === patch.agentId);
    const baseEntry =
      existingIndex >= 0 ? cloneConfigObject(list[existingIndex]) : { id: patch.agentId };
    const nextEntry = baseEntry as Record<string, unknown>;
    if ("name" in patch) {
      if (typeof patch.name === "string") {
        nextEntry.name = patch.name;
      } else if (patch.name === null) {
        delete nextEntry.name;
      }
    }
    if ("identity" in patch) {
      if (patch.identity === null) {
        delete nextEntry.identity;
      } else if (patch.identity && typeof patch.identity === "object") {
        const currentIdentity = cloneConfigObject(
          (nextEntry.identity as Record<string, unknown> | undefined) ?? {},
        );
        const identityPatch = patch.identity as Record<string, unknown>;
        applyNullableStringPatch(currentIdentity, identityPatch, "name");
        applyNullableStringPatch(currentIdentity, identityPatch, "theme");
        applyNullableStringPatch(currentIdentity, identityPatch, "emoji");
        applyNullableStringPatch(currentIdentity, identityPatch, "avatar");
        applyNullableStringPatch(currentIdentity, identityPatch, "avatarUrl");
        nextEntry.identity = currentIdentity;
      }
    }
    if (existingIndex >= 0) {
      list[existingIndex] = nextEntry as AgentConfig;
    } else {
      list.push(nextEntry as AgentConfig);
    }
  }
  config.agents = {
    ...((typeof config.agents === "object" && config.agents ? config.agents : {}) as Record<
      string,
      unknown
    >),
    list,
  };
}

function applyPromptEditResult(
  host: TeamPromptHost,
  target: TeamPromptTarget,
  result: TeamPromptEditResult,
) {
  const hasPatchChange =
    Boolean(result.teamPatch) ||
    Boolean(result.workflowPatch) ||
    (Array.isArray(result.agentPatches) && result.agentPatches.length > 0);
  if (!hasPatchChange) {
    return;
  }
  const currentRoot = currentConfigOrThrow(host);
  const nextRoot = cloneConfigObject(currentRoot);
  const teamIndex = findTeamIndex(nextRoot, target.teamId);
  if (teamIndex < 0) {
    throw new Error(`Team "${target.teamId}" no longer exists in the current draft.`);
  }
  const teamsList = cloneConfigObject(
    (((nextRoot.teams ?? {}) as { list?: TeamConfig[] }).list ?? []) as TeamConfig[],
  );
  let nextTeam = cloneConfigObject(teamsList[teamIndex]);
  nextTeam = applyTeamPatch(nextTeam, result);
  nextTeam = applyWorkflowPatchToTeam(nextTeam, target.workflowId, result);
  teamsList[teamIndex] = nextTeam;
  nextRoot.teams = {
    ...((typeof nextRoot.teams === "object" && nextRoot.teams ? nextRoot.teams : {}) as Record<
      string,
      unknown
    >),
    list: teamsList,
  };
  applyAgentPatches(nextRoot, result);
  replaceConfigFormRoot(host as ConfigState, nextRoot);
}

export function openTeamPromptDialog(host: TeamPromptHost, target: TeamPromptTarget) {
  const targetChanged =
    host.teamPromptTeamId !== target.teamId || host.teamPromptWorkflowId !== target.workflowId;
  host.teamPromptDialogOpen = true;
  host.teamPromptTeamId = target.teamId;
  host.teamPromptTeamLabel = target.teamLabel;
  host.teamPromptWorkflowId = target.workflowId;
  host.teamPromptWorkflowLabel = target.workflowLabel;
  if (targetChanged) {
    host.teamPromptDraft = "";
  }
  host.teamPromptBusy = false;
  host.teamPromptError = null;
  host.teamPromptSummary = null;
  host.teamPromptWarnings = [];
}

export function closeTeamPromptDialog(host: TeamPromptHost) {
  host.teamPromptDialogOpen = false;
  host.teamPromptBusy = false;
  host.teamPromptError = null;
  host.teamPromptSummary = null;
  host.teamPromptWarnings = [];
}

export async function submitTeamPromptDialog(host: TeamPromptHost) {
  if (!host.client || !host.connected) {
    host.teamPromptError = "Connect to the gateway before prompting team changes.";
    return;
  }
  if (!host.teamPromptTeamId || !host.teamPromptWorkflowId) {
    host.teamPromptError = "Select a team and workflow before prompting changes.";
    return;
  }
  const prompt = host.teamPromptDraft.trim();
  if (!prompt) {
    host.teamPromptError = "Describe the team change you want first.";
    return;
  }
  host.teamPromptBusy = true;
  host.teamPromptError = null;
  host.teamPromptSummary = null;
  host.teamPromptWarnings = [];
  try {
    const rawConfig = serializeConfigForm(currentConfigOrThrow(host));
    const result = await host.client.request<TeamPromptEditResult>("teams.promptEdit", {
      rawConfig,
      teamId: host.teamPromptTeamId,
      workflowId: host.teamPromptWorkflowId,
      prompt,
    });
    applyPromptEditResult(
      host,
      {
        teamId: host.teamPromptTeamId,
        teamLabel: host.teamPromptTeamLabel,
        workflowId: host.teamPromptWorkflowId,
        workflowLabel: host.teamPromptWorkflowLabel,
      },
      result,
    );
    await loadDashboardTeamSnapshots(host, { quiet: true });
    host.teamPromptSummary =
      result.summary ?? (result.noop ? "No draft changes were applied." : "Draft updated.");
    host.teamPromptWarnings = result.warnings ?? [];
  } catch (error) {
    host.teamPromptError = String(error);
  } finally {
    host.teamPromptBusy = false;
  }
}
