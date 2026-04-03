import { isToolAllowedByPolicies } from "../agents/tool-policy-match.js";
import { resolveEffectiveToolPolicy } from "../agents/pi-tools.policy.js";
import { resolveToolProfilePolicy } from "../agents/tool-policy-shared.js";
import { mergeAlsoAllowPolicy } from "../agents/tool-policy.js";
import type { MaumauConfig } from "../config/config.js";
import type { TeamConfig, TeamWorkflowConfig } from "../config/types.teams.js";
import { findTeamMember, listConfiguredAgentIds, listTeamMembers } from "./model.js";

function normalizeRole(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function uniqueRoles(list?: string[]): string[] {
  const roles: string[] = [];
  const seen = new Set<string>();
  for (const entry of list ?? []) {
    const normalized = normalizeRole(entry);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    roles.push(normalized);
  }
  return roles;
}

export type TeamWorkflowContractSummary = {
  requiredRoles: string[];
  requiredQaRoles: string[];
  requireDelegation: boolean;
};

export type TeamWorkflowContractReadiness = TeamWorkflowContractSummary & {
  contractReady: boolean;
  blockingReasons: string[];
};

export function resolveTeamWorkflowContract(
  workflow: TeamWorkflowConfig,
): TeamWorkflowContractSummary {
  return {
    requiredRoles: uniqueRoles(workflow.contract?.requiredRoles),
    requiredQaRoles: uniqueRoles(workflow.contract?.requiredQaRoles),
    requireDelegation: workflow.contract?.requireDelegation === true,
  };
}

function canAgentUseTool(params: {
  cfg: MaumauConfig;
  agentId: string;
  toolName: string;
}): boolean {
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
    config: params.cfg,
    agentId: params.agentId,
  });
  const profilePolicy = mergeAlsoAllowPolicy(resolveToolProfilePolicy(profile), profileAlsoAllow);
  const providerProfilePolicy = mergeAlsoAllowPolicy(
    resolveToolProfilePolicy(providerProfile),
    providerProfileAlsoAllow,
  );
  return isToolAllowedByPolicies(params.toolName, [
    profilePolicy,
    providerProfilePolicy,
    globalPolicy,
    globalProviderPolicy,
    agentPolicy,
    agentProviderPolicy,
  ]);
}

export function evaluateTeamWorkflowContractReadiness(params: {
  cfg: MaumauConfig;
  team: TeamConfig;
  workflow: TeamWorkflowConfig;
}): TeamWorkflowContractReadiness {
  const contract = resolveTeamWorkflowContract(params.workflow);
  const blockingReasons: string[] = [];
  const configuredAgentIds = new Set(listConfiguredAgentIds(params.cfg));
  const managerAgentId = params.team.managerAgentId.trim();

  if (!configuredAgentIds.has(managerAgentId.toLowerCase())) {
    blockingReasons.push(`Manager agent "${managerAgentId}" is not configured.`);
  }

  if (contract.requireDelegation) {
    if (listTeamMembers(params.team).length === 0) {
      blockingReasons.push("Workflow requires delegation, but the team has no specialist members.");
    }
    if (
      configuredAgentIds.has(managerAgentId.toLowerCase()) &&
      !canAgentUseTool({
        cfg: params.cfg,
        agentId: managerAgentId,
        toolName: "sessions_spawn",
      })
    ) {
      blockingReasons.push(
        `Manager agent "${managerAgentId}" cannot use sessions_spawn, so the workflow cannot satisfy delegation requirements.`,
      );
    }
  }

  for (const role of contract.requiredRoles) {
    const member = listTeamMembers(params.team).find((entry) => normalizeRole(entry.role) === role);
    if (!member) {
      blockingReasons.push(`Required role "${role}" is not assigned to any team member.`);
      continue;
    }
    if (!findTeamMember(params.team, member.agentId)) {
      blockingReasons.push(`Required role "${role}" is not bound to a team member agent.`);
      continue;
    }
    if (!configuredAgentIds.has(member.agentId.trim().toLowerCase())) {
      blockingReasons.push(
        `Required role "${role}" points to agent "${member.agentId}", but that agent is not configured.`,
      );
    }
  }

  for (const role of contract.requiredQaRoles) {
    if (!contract.requiredRoles.includes(role)) {
      blockingReasons.push(
        `Required QA role "${role}" must also be listed in contract.requiredRoles.`,
      );
    }
  }

  return {
    ...contract,
    contractReady: blockingReasons.length === 0,
    blockingReasons,
  };
}
