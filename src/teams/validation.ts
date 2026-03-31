import type { MaumauConfig, ConfigValidationIssue } from "../config/types.js";
import { normalizeAgentId } from "../routing/session-key.js";
import {
  DEFAULT_TEAM_WORKFLOW_ID,
  findTeamConfig,
  listConfiguredAgentIds,
  listConfiguredTeamWorkflows,
  listConfiguredTeams,
  listLinkedAgentIds,
  listLinkedTeamIds,
  listTeamMembers,
  normalizeTeamWorkflowId,
  normalizeTeamId,
} from "./model.js";

function issue(path: string, message: string): ConfigValidationIssue {
  return { path, message };
}

export function validateTeamsConfig(config: MaumauConfig): ConfigValidationIssue[] {
  const teams = listConfiguredTeams(config);
  if (teams.length === 0) {
    return [];
  }

  const configuredAgentIds = new Set(listConfiguredAgentIds(config));
  const seenTeamIds = new Set<string>();
  const issues: ConfigValidationIssue[] = [];

  for (const [teamIndex, team] of teams.entries()) {
    const normalizedTeamId = normalizeTeamId(team.id);
    if (seenTeamIds.has(normalizedTeamId)) {
      issues.push(issue(`teams.list.${teamIndex}.id`, `duplicate team id: ${normalizedTeamId}`));
    } else {
      seenTeamIds.add(normalizedTeamId);
    }

    const normalizedManagerAgentId = normalizeAgentId(team.managerAgentId);
    if (!configuredAgentIds.has(normalizedManagerAgentId)) {
      issues.push(
        issue(
          `teams.list.${teamIndex}.managerAgentId`,
          `unknown manager agent id: ${team.managerAgentId}`,
        ),
      );
    }

    const seenMemberAgentIds = new Set<string>();
    for (const [memberIndex, member] of listTeamMembers(team).entries()) {
      const normalizedMemberAgentId = normalizeAgentId(member.agentId);
      if (!configuredAgentIds.has(normalizedMemberAgentId)) {
        issues.push(
          issue(
            `teams.list.${teamIndex}.members.${memberIndex}.agentId`,
            `unknown team member agent id: ${member.agentId}`,
          ),
        );
      }
      if (normalizedMemberAgentId === normalizedManagerAgentId) {
        issues.push(
          issue(
            `teams.list.${teamIndex}.members.${memberIndex}.agentId`,
            "managerAgentId must not also appear in members; keep manager separate from specialists.",
          ),
        );
      }
      if (seenMemberAgentIds.has(normalizedMemberAgentId)) {
        issues.push(
          issue(
            `teams.list.${teamIndex}.members.${memberIndex}.agentId`,
            `duplicate team member agent id: ${member.agentId}`,
          ),
        );
      } else {
        seenMemberAgentIds.add(normalizedMemberAgentId);
      }
    }

    const workflows = listConfiguredTeamWorkflows(team);
    const seenWorkflowIds = new Set<string>();
    let defaultWorkflowCount = 0;
    for (const [workflowIndex, workflow] of workflows.entries()) {
      const normalizedWorkflowId = normalizeTeamWorkflowId(workflow.id);
      if (seenWorkflowIds.has(normalizedWorkflowId)) {
        issues.push(
          issue(
            `teams.list.${teamIndex}.workflows.${workflowIndex}.id`,
            `duplicate workflow id: ${normalizedWorkflowId}`,
          ),
        );
      } else {
        seenWorkflowIds.add(normalizedWorkflowId);
      }
      if (workflow.default === true) {
        defaultWorkflowCount += 1;
      }
    }
    if (defaultWorkflowCount > 1) {
      issues.push(
        issue(
          `teams.list.${teamIndex}.workflows`,
          "only one workflow may set default=true within the same team.",
        ),
      );
    }
    if (team.workflow && workflows.length > 0) {
      issues.push(
        issue(
          `teams.list.${teamIndex}.workflow`,
          "deprecated workflow field cannot be used together with workflows; migrate to workflows only.",
        ),
      );
    }
    if (workflows.length === 1) {
      const onlyWorkflow = workflows[0];
      if (
        normalizeTeamWorkflowId(onlyWorkflow.id) === DEFAULT_TEAM_WORKFLOW_ID &&
        onlyWorkflow.default === false
      ) {
        issues.push(
          issue(
            `teams.list.${teamIndex}.workflows.0.default`,
            "a lone workflow should either omit default or set default=true.",
          ),
        );
      }
    }

    const linkedAgentIds = listLinkedAgentIds(team);
    for (const [linkIndex, targetAgentId] of linkedAgentIds.entries()) {
      if (!configuredAgentIds.has(targetAgentId)) {
        issues.push(
          issue(
            `teams.list.${teamIndex}.crossTeamLinks.${linkIndex}.targetId`,
            `unknown linked agent id: ${targetAgentId}`,
          ),
        );
      }
    }

    const linkedTeamIds = listLinkedTeamIds(team);
    for (const [linkIndex, targetTeamId] of linkedTeamIds.entries()) {
      if (targetTeamId === normalizedTeamId) {
        issues.push(
          issue(
            `teams.list.${teamIndex}.crossTeamLinks.${linkIndex}.targetId`,
            "team links must target another team, not the current team.",
          ),
        );
        continue;
      }
      if (!findTeamConfig(config, targetTeamId)) {
        issues.push(
          issue(
            `teams.list.${teamIndex}.crossTeamLinks.${linkIndex}.targetId`,
            `unknown linked team id: ${targetTeamId}`,
          ),
        );
      }
    }
  }

  return issues;
}
