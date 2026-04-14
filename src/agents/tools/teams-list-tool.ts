import { Type } from "@sinclair/typebox";
import type { MaumauConfig } from "../../config/config.js";
import { loadConfig } from "../../config/config.js";
import { evaluateTeamWorkflowContractReadiness } from "../../teams/contracts.js";
import {
  listAccessibleTeams,
  listTeamWorkflows,
  listTeamMembers,
  resolveDefaultTeamWorkflowId,
  resolveAgentDisplayName,
} from "../../teams/model.js";
import { resolveSessionTeamContext } from "../../teams/runtime.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult } from "./common.js";
import { resolveSessionToolContext } from "./sessions-helpers.js";

const TeamsListToolSchema = Type.Object({});

export function createTeamsListTool(opts?: {
  agentSessionKey?: string;
  sandboxed?: boolean;
  config?: MaumauConfig;
}): AnyAgentTool {
  return {
    label: "Teams",
    name: "teams_list",
    description: "List configured Maumau teams and whether the current session can run them.",
    parameters: TeamsListToolSchema,
    execute: async () => {
      const cfg = opts?.config ?? loadConfig();
      const { effectiveRequesterKey } = resolveSessionToolContext({
        agentSessionKey: opts?.agentSessionKey,
        sandboxed: opts?.sandboxed,
        config: cfg,
      });
      const currentTeamContext = resolveSessionTeamContext({
        cfg,
        sessionKey: effectiveRequesterKey,
      });
      const teams = listAccessibleTeams(cfg, currentTeamContext?.teamId).map(
        ({ team, runnable }) => {
          const workflows = listTeamWorkflows(team).map((workflow) => {
            const readiness = evaluateTeamWorkflowContractReadiness({
              cfg,
              team,
              workflow,
            });
            return {
              id: workflow.id,
              name: workflow.name,
              description: workflow.description,
              default:
                workflow.default === true || workflow.id === resolveDefaultTeamWorkflowId(team),
              contractReady: readiness.contractReady,
              blockingReasons: readiness.blockingReasons,
              requiredRoles: readiness.requiredRoles,
              requiredQaRoles: readiness.requiredQaRoles,
            };
          });
          const defaultWorkflow = workflows.find((workflow) => workflow.default) ?? workflows[0];
          return {
            id: team.id,
            name: team.name,
            description: team.description,
            managerAgentId: team.managerAgentId,
            managerName: resolveAgentDisplayName(cfg, team.managerAgentId),
            members: listTeamMembers(team).map((member) => ({
              agentId: member.agentId,
              agentName: resolveAgentDisplayName(cfg, member.agentId),
              role: member.role,
              description: member.description,
            })),
            workflows,
            crossTeamLinks: Array.isArray(team.crossTeamLinks) ? team.crossTeamLinks : [],
            preset: team.preset,
            runnable,
            contractReady: defaultWorkflow?.contractReady ?? true,
            blockingReasons: defaultWorkflow?.blockingReasons ?? [],
            requiredRoles: defaultWorkflow?.requiredRoles ?? [],
            requiredQaRoles: defaultWorkflow?.requiredQaRoles ?? [],
          };
        },
      );

      return jsonResult({
        currentTeamId: currentTeamContext?.teamId,
        currentTeamRole: currentTeamContext?.teamRole,
        teams,
      });
    },
  };
}
