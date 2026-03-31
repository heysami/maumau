import { Type } from "@sinclair/typebox";
import type { MaumauConfig } from "../../config/config.js";
import { loadConfig } from "../../config/config.js";
import { callGateway } from "../../gateway/call.js";
import { canTeamUseTeam, findTeamConfig, findTeamWorkflow } from "../../teams/model.js";
import { materializeGeneratedTeamProgram, resolveSessionTeamContext } from "../../teams/runtime.js";
import type { GatewayMessageChannel } from "../../utils/message-channel.js";
import type { SpawnedToolContext } from "../spawned-context.js";
import { spawnSubagentDirect } from "../subagent-spawn.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam } from "./common.js";
import {
  extractAssistantText,
  resolveSessionToolContext,
  stripToolMessages,
} from "./sessions-helpers.js";

const TeamsRunToolSchema = Type.Object({
  teamId: Type.String(),
  workflowId: Type.Optional(Type.String()),
  task: Type.String(),
  timeoutSeconds: Type.Optional(Type.Number({ minimum: 0 })),
});

function buildTeamRunTask(params: {
  teamId: string;
  teamName: string;
  workflowId: string;
  workflowName?: string;
  programPath: string;
  program: string;
  task: string;
}): string {
  return [
    `[Team Runtime] Team: ${params.teamName} (${params.teamId})`,
    `[Team Runtime] Workflow: ${params.workflowName?.trim() || params.workflowId} (${params.workflowId})`,
    `[Team Runtime] Generated OpenProse file: ${params.programPath}`,
    "[Team Runtime] Execute the generated OpenProse workflow using the existing Maumau delegation primitives in this session.",
    "[Team Runtime] Use sessions_spawn for specialists inside the team. Use teams_run only for explicitly linked teams.",
    "",
    `prose run ${params.programPath}`,
    "",
    "Run input:",
    `task = ${params.task}`,
    "",
    "Generated OpenProse workflow:",
    "```prose",
    params.program,
    "```",
  ].join("\n");
}

type GatewayCaller = typeof callGateway;

export function createTeamsRunTool(
  opts?: {
    agentSessionKey?: string;
    agentChannel?: GatewayMessageChannel;
    agentAccountId?: string;
    agentTo?: string;
    agentThreadId?: string | number;
    sandboxed?: boolean;
    requesterAgentIdOverride?: string;
    config?: MaumauConfig;
    callGateway?: GatewayCaller;
  } & SpawnedToolContext,
): AnyAgentTool {
  return {
    label: "Teams",
    name: "teams_run",
    description:
      "Run a configured Maumau team by spawning its manager agent with the generated OpenProse workflow.",
    parameters: TeamsRunToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const gatewayCall = opts?.callGateway ?? callGateway;
      const cfg = opts?.config ?? loadConfig();
      const teamId = readStringParam(params, "teamId", { required: true });
      const workflowId = readStringParam(params, "workflowId");
      const task = readStringParam(params, "task", { required: true });
      const timeoutSeconds =
        typeof params.timeoutSeconds === "number" && Number.isFinite(params.timeoutSeconds)
          ? Math.max(0, Math.floor(params.timeoutSeconds))
          : 90;
      const timeoutMs = timeoutSeconds * 1000;

      const { effectiveRequesterKey } = resolveSessionToolContext({
        agentSessionKey: opts?.agentSessionKey,
        sandboxed: opts?.sandboxed,
        config: cfg,
      });
      const requesterTeamContext = resolveSessionTeamContext({
        cfg,
        sessionKey: effectiveRequesterKey,
      });
      const targetTeam = findTeamConfig(cfg, teamId);
      if (!targetTeam) {
        return jsonResult({
          status: "error",
          error: `Unknown team: ${teamId}`,
        });
      }
      const targetWorkflow = findTeamWorkflow(targetTeam, workflowId);
      if (
        workflowId &&
        targetWorkflow.id.trim().toLowerCase() !== workflowId.trim().toLowerCase()
      ) {
        return jsonResult({
          status: "error",
          error: `Unknown workflow "${workflowId}" for team "${targetTeam.id}"`,
        });
      }

      if (requesterTeamContext?.teamId) {
        if (!requesterTeamContext.team) {
          return jsonResult({
            status: "forbidden",
            error: `Active team "${requesterTeamContext.teamId}" is no longer configured.`,
          });
        }
        if (
          requesterTeamContext.teamId.trim().toLowerCase() === targetTeam.id.trim().toLowerCase()
        ) {
          return jsonResult({
            status: "forbidden",
            error:
              "teams_run cannot recursively invoke the currently active team. Use sessions_spawn for same-team specialists.",
          });
        }
        if (
          !canTeamUseTeam({
            cfg,
            sourceTeamId: requesterTeamContext.teamId,
            targetTeamId: targetTeam.id,
          })
        ) {
          return jsonResult({
            status: "forbidden",
            error: `Team "${requesterTeamContext.teamId}" cannot run team "${targetTeam.id}" without an explicit cross-team link.`,
          });
        }
      }

      const generatedProgram = await materializeGeneratedTeamProgram({
        cfg,
        teamId: targetTeam.id,
        workflowId: targetWorkflow.id,
      });
      if (!generatedProgram.ok) {
        return jsonResult({
          status: "error",
          error: generatedProgram.error,
        });
      }

      const spawnResult = await spawnSubagentDirect(
        {
          task: buildTeamRunTask({
            teamId: targetTeam.id,
            teamName: targetTeam.name?.trim() || targetTeam.id,
            workflowId: generatedProgram.workflow.id,
            workflowName: generatedProgram.workflow.name,
            programPath: generatedProgram.relativePath,
            program: generatedProgram.program,
            task,
          }),
          label: `${targetTeam.name?.trim() || targetTeam.id} manager`,
          agentId: targetTeam.managerAgentId,
          runTimeoutSeconds: timeoutSeconds === 0 ? undefined : timeoutSeconds,
          mode: "run",
          cleanup: "keep",
          sandbox: "inherit",
          expectsCompletionMessage: true,
          skipAllowAgentsCheck: true,
          sessionPatch: {
            teamId: targetTeam.id,
            teamRole: "manager",
          },
        },
        {
          agentSessionKey: opts?.agentSessionKey,
          agentChannel: opts?.agentChannel,
          agentAccountId: opts?.agentAccountId,
          agentTo: opts?.agentTo,
          agentThreadId: opts?.agentThreadId,
          agentGroupId: opts?.agentGroupId,
          agentGroupChannel: opts?.agentGroupChannel,
          agentGroupSpace: opts?.agentGroupSpace,
          requesterAgentIdOverride: opts?.requesterAgentIdOverride,
          workspaceDir: opts?.workspaceDir,
        },
      );

      if (spawnResult.status !== "accepted" || !spawnResult.childSessionKey) {
        return jsonResult({
          ...spawnResult,
          teamId: targetTeam.id,
          workflowId: targetWorkflow.id,
        });
      }

      if (timeoutSeconds === 0 || !spawnResult.runId) {
        return jsonResult({
          status: "accepted",
          teamId: targetTeam.id,
          workflowId: targetWorkflow.id,
          managerSessionKey: spawnResult.childSessionKey,
          runId: spawnResult.runId,
          note: spawnResult.note,
        });
      }

      let waitStatus: string | undefined;
      let waitError: string | undefined;
      try {
        const wait = await gatewayCall<{ status?: string; error?: string }>({
          method: "agent.wait",
          params: {
            runId: spawnResult.runId,
            timeoutMs,
          },
          timeoutMs: timeoutMs + 2_000,
        });
        waitStatus = typeof wait?.status === "string" ? wait.status : undefined;
        waitError = typeof wait?.error === "string" ? wait.error : undefined;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : typeof err === "string" ? err : "error";
        return jsonResult({
          status: message.includes("gateway timeout") ? "timeout" : "error",
          error: message,
          teamId: targetTeam.id,
          workflowId: targetWorkflow.id,
          managerSessionKey: spawnResult.childSessionKey,
          runId: spawnResult.runId,
        });
      }

      if (waitStatus === "timeout") {
        return jsonResult({
          status: "timeout",
          error: waitError,
          teamId: targetTeam.id,
          workflowId: targetWorkflow.id,
          managerSessionKey: spawnResult.childSessionKey,
          runId: spawnResult.runId,
        });
      }
      if (waitStatus === "error") {
        return jsonResult({
          status: "error",
          error: waitError ?? "agent error",
          teamId: targetTeam.id,
          workflowId: targetWorkflow.id,
          managerSessionKey: spawnResult.childSessionKey,
          runId: spawnResult.runId,
        });
      }

      const history = await gatewayCall<{ messages: Array<unknown> }>({
        method: "chat.history",
        params: { sessionKey: spawnResult.childSessionKey, limit: 50 },
      });
      const filtered = stripToolMessages(Array.isArray(history?.messages) ? history.messages : []);
      const last = filtered.length > 0 ? filtered[filtered.length - 1] : undefined;
      const reply = last ? extractAssistantText(last) : undefined;

      return jsonResult({
        status: "ok",
        teamId: targetTeam.id,
        workflowId: targetWorkflow.id,
        managerSessionKey: spawnResult.childSessionKey,
        runId: spawnResult.runId,
        reply,
      });
    },
  };
}
