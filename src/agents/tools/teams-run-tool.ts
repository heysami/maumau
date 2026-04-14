import { Type } from "@sinclair/typebox";
import { isSilentReplyText, stripSilentToken } from "../../auto-reply/tokens.js";
import type { MaumauConfig } from "../../config/config.js";
import { loadConfig } from "../../config/config.js";
import { callGateway } from "../../gateway/call.js";
import { loadSessionEntry } from "../../gateway/session-utils.js";
import { parseAgentSessionKey } from "../../routing/session-key.js";
import { resolveTeamWorkflowContract } from "../../teams/contracts.js";
import {
  formatLifecycleProgressLabel,
  resolveTeamWorkflowLifecycleStages,
} from "../../teams/lifecycle.js";
import { canTeamUseTeam } from "../../teams/model.js";
import { DESIGN_STUDIO_TEAM_ID } from "../../teams/presets.js";
import {
  materializeGeneratedTeamProgram,
  resolveSessionTeamContext,
  resolveTeamRunTarget,
} from "../../teams/runtime.js";
import type { GatewayMessageChannel } from "../../utils/message-channel.js";
import { isRequesterRemoteMessagingChannel } from "../../utils/message-channel.js";
import { buildDeliveryRouteContractNotes } from "../role-contract.js";
import type { SpawnedToolContext } from "../spawned-context.js";
import {
  countPendingDescendantRuns,
  getLatestSubagentRunByChildSessionKey,
  handoffSubagentCompletionToRequester,
  listDescendantRunsForRequester,
} from "../subagent-registry.js";
import type { SubagentRunRecord } from "../subagent-registry.js";
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

const QA_APPROVAL_RE = /^QA_APPROVAL:\s*(approved|blocked)\s*$/im;
const TEAM_MANAGER_MAX_SPAWN_DEPTH = 2;
const DESIGN_STUDIO_MANAGER_MAX_SPAWN_DEPTH = 3;

function resolveTeamManagerMaxSpawnDepth(teamId: string): number {
  return teamId.trim().toLowerCase() === DESIGN_STUDIO_TEAM_ID
    ? DESIGN_STUDIO_MANAGER_MAX_SPAWN_DEPTH
    : TEAM_MANAGER_MAX_SPAWN_DEPTH;
}

function shouldDefaultToAsyncTeamRun(params: {
  requesterTeamContext?: ReturnType<typeof resolveSessionTeamContext>;
  messageChannel?: GatewayMessageChannel;
}): boolean {
  return (
    isRequesterRemoteMessagingChannel(params.messageChannel) &&
    params.requesterTeamContext?.teamRole?.trim().toLowerCase() === "manager" &&
    params.requesterTeamContext.team?.implicitForManagerSessions === true
  );
}

function buildTeamRunTask(params: {
  teamId: string;
  teamName: string;
  workflowId: string;
  workflowName?: string;
  rootSessionKey: string;
  requiredRoles: string[];
  requiredQaRoles: string[];
  requireDelegation: boolean;
  programPath: string;
  program: string;
  task: string;
  lifecycleStages: ReturnType<typeof resolveTeamWorkflowLifecycleStages>;
  deliveryRouteNotes?: string[];
}): string {
  const lifecycleSummary =
    params.lifecycleStages.length > 0
      ? params.lifecycleStages
          .map((stage, index) => {
            const progressLabel = formatLifecycleProgressLabel({
              completedStepCount: index,
              totalStepCount: params.lifecycleStages.length,
              currentStageLabel: stage.name ?? stage.id,
            });
            return `${stage.id} (${progressLabel ?? stage.id}, status=${stage.status})`;
          })
          .join(" -> ")
      : "none";
  return [
    `[Team Runtime] Team: ${params.teamName} (${params.teamId})`,
    `[Team Runtime] Workflow: ${params.workflowName?.trim() || params.workflowId} (${params.workflowId})`,
    `[Team Runtime] Root requester session: ${params.rootSessionKey}`,
    "[Team Runtime] Execution runtime: openprose.",
    `[Team Runtime] Generated OpenProse file: ${params.programPath}`,
    "[Team Runtime] Execute the generated OpenProse workflow using the existing Maumau delegation primitives in this session.",
    "[Team Runtime] Treat the generated OpenProse as the execution contract, not as an illustrative example.",
    "[Team Runtime] Use sessions_spawn for specialists inside the team. Use teams_run only for explicitly linked teams.",
    "[Team Runtime] When spawning same-team specialists, target the configured specialist agent instead of the manager. Pass the explicit specialist agentId when possible, or keep the spawn label aligned with the configured role name so runtime can resolve the right specialist.",
    "[Team Runtime] Manager-only work, self-review, or commentary does not satisfy required role participation. Required roles count only when their bound specialist agent runs in a dedicated session, and required QA roles count only when the bound QA specialist returns QA_APPROVAL: approved.",
    `[Team Runtime] Contract requires delegation: ${params.requireDelegation ? "yes" : "no"}.`,
    `[Team Runtime] Required roles: ${params.requiredRoles.join(", ") || "none"}.`,
    `[Team Runtime] Required QA roles: ${params.requiredQaRoles.join(", ") || "none"}.`,
    `[Team Runtime] Lifecycle stages: ${lifecycleSummary}.`,
    "[Team Runtime] Emit lifecycle updates as standalone WORK_ITEM JSON lines at run start, stage enter, stage completion, blocked transitions, and final completion.",
    '[Team Runtime] Lifecycle envelope shape: WORK_ITEM:{"teamRun":{"kind":"team_run","teamId":"<team-id>","workflowId":"<workflow-id>","rootSessionKey":"<root-session-key>","event":"started|stage_enter|stage_complete|blocked|completed","currentStageId":"<stage-id>","currentStageName":"<stage-name>","completedStageIds":["<stage-id>"],"status":"in_progress|review|blocked|done|idle"}}',
    "[Team Runtime] If the task creates or updates a previewable local HTML/static artifact, the final manager result must either return a preview/share URL or include a standalone FILE:<workspace-relative-path> line for the app file or directory.",
    "[Team Runtime] If durable preview publishing is unavailable for this requester or route but the requester still needs a live previewable UI now, proactively arrange a simple host-local server, verify it, and return a requester-openable non-loopback URL instead of only localhost instructions or filesystem paths.",
    ...(params.deliveryRouteNotes?.map((line) => `[Team Runtime] ${line}`) ?? []),
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

function dedupeLatestRunsByChildSession<
  T extends Pick<SubagentRunRecord, "childSessionKey" | "createdAt">,
>(runs: T[]) {
  const latest = new Map<string, T>();
  for (const run of runs) {
    const existing = latest.get(run.childSessionKey);
    if (!existing || run.createdAt > existing.createdAt) {
      latest.set(run.childSessionKey, run);
    }
  }
  return Array.from(latest.values());
}

function parseQaApproval(text?: string): "approved" | "blocked" | undefined {
  if (!text) {
    return undefined;
  }
  const match = QA_APPROVAL_RE.exec(text);
  return match?.[1] === "approved" || match?.[1] === "blocked" ? match[1] : undefined;
}

type GatewayCaller = typeof callGateway;
type TeamManagerWaitSnapshot = {
  currentRunId: string;
  managerRunEnded: boolean;
  managerCleanupCompleted: boolean;
  managerWakePending: boolean;
  pendingDescendantRuns: number;
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractLatestDeliverableAssistantText(messages: unknown[]): string | undefined {
  const filtered = stripToolMessages(messages);
  for (let index = filtered.length - 1; index >= 0; index -= 1) {
    const text = extractAssistantText(filtered[index]);
    if (!text) {
      continue;
    }
    const stripped = stripSilentToken(text).trim();
    if (!stripped || isSilentReplyText(stripped)) {
      continue;
    }
    return stripped;
  }
  return undefined;
}

async function waitForTeamManagerSession(params: {
  gatewayCall: GatewayCaller;
  countPendingDescendantRuns: (rootSessionKey: string) => number;
  getLatestSubagentRunByChildSessionKey: (childSessionKey: string) => {
    runId: string;
    endedAt?: number;
    cleanupCompletedAt?: number;
    wakeOnDescendantSettle?: boolean;
  } | null;
  initialRunId: string;
  managerSessionKey: string;
  timeoutMs: number;
}): Promise<
  | { status: "ok" }
  | { status: "waiting_timed_out" | "error"; error?: string; snapshot: TeamManagerWaitSnapshot }
> {
  const deadline = Date.now() + Math.max(0, params.timeoutMs);
  let currentRunId = params.initialRunId.trim();
  let lastError: string | undefined;
  let lastSnapshot: TeamManagerWaitSnapshot = {
    currentRunId,
    managerRunEnded: false,
    managerCleanupCompleted: false,
    managerWakePending: false,
    pendingDescendantRuns: 0,
  };

  while (Date.now() < deadline) {
    const latestRun = params.getLatestSubagentRunByChildSessionKey(params.managerSessionKey);
    const latestRunId = latestRun?.runId?.trim();
    if (latestRunId) {
      currentRunId = latestRunId;
    }

    const remainingMs = deadline - Date.now();
    const sliceMs = Math.max(1, Math.min(remainingMs, 5_000));
    try {
      const wait = await params.gatewayCall<{ status?: string; error?: string }>({
        method: "agent.wait",
        params: {
          runId: currentRunId,
          timeoutMs: sliceMs,
        },
        timeoutMs: sliceMs + 2_000,
      });
      const waitStatus = typeof wait?.status === "string" ? wait.status : undefined;
      lastError = typeof wait?.error === "string" ? wait.error : lastError;

      const latestAfterWait = params.getLatestSubagentRunByChildSessionKey(
        params.managerSessionKey,
      );
      const latestAfterWaitRunId = latestAfterWait?.runId?.trim();
      if (latestAfterWaitRunId && latestAfterWaitRunId !== currentRunId) {
        currentRunId = latestAfterWaitRunId;
        continue;
      }

      const pendingDescendantRuns = Math.max(
        0,
        params.countPendingDescendantRuns(params.managerSessionKey),
      );
      lastSnapshot = {
        currentRunId,
        managerRunEnded: Boolean(latestAfterWait && typeof latestAfterWait.endedAt === "number"),
        managerCleanupCompleted: Boolean(
          latestAfterWait && typeof latestAfterWait.cleanupCompletedAt === "number",
        ),
        managerWakePending: latestAfterWait?.wakeOnDescendantSettle === true,
        pendingDescendantRuns,
      };
      const managerSettled =
        !!latestAfterWait &&
        typeof latestAfterWait.endedAt === "number" &&
        typeof latestAfterWait.cleanupCompletedAt === "number" &&
        latestAfterWait.wakeOnDescendantSettle !== true &&
        pendingDescendantRuns === 0;
      if (managerSettled) {
        return { status: "ok" };
      }

      if (waitStatus === "error" && pendingDescendantRuns === 0) {
        return {
          status: "error",
          error: lastError ?? "agent error",
          snapshot: lastSnapshot,
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : typeof err === "string" ? err : "error";
      return {
        status: message.includes("gateway timeout") ? "waiting_timed_out" : "error",
        error: message,
        snapshot: lastSnapshot,
      };
    }

    const pauseMs = Math.min(250, Math.max(50, deadline - Date.now()));
    if (pauseMs > 0) {
      await delay(pauseMs);
    }
  }

  return {
    status: "waiting_timed_out",
    error: lastError,
    snapshot: lastSnapshot,
  };
}

export function createTeamsRunTool(
  opts?: {
    agentSessionKey?: string;
    agentChannel?: GatewayMessageChannel;
    agentAccountId?: string;
    agentTo?: string;
    agentThreadId?: string | number;
    senderIsOwner?: boolean;
    requesterTailscaleLogin?: string | null;
    sandboxed?: boolean;
    requesterAgentIdOverride?: string;
    config?: MaumauConfig;
    callGateway?: GatewayCaller;
    subagentRegistry?: {
      countPendingDescendantRuns?: typeof countPendingDescendantRuns;
      getLatestSubagentRunByChildSessionKey?: typeof getLatestSubagentRunByChildSessionKey;
      handoffSubagentCompletionToRequester?: typeof handoffSubagentCompletionToRequester;
      listDescendantRunsForRequester?: typeof listDescendantRunsForRequester;
    };
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
      const subagentRegistry = {
        countPendingDescendantRuns:
          opts?.subagentRegistry?.countPendingDescendantRuns ?? countPendingDescendantRuns,
        getLatestSubagentRunByChildSessionKey:
          opts?.subagentRegistry?.getLatestSubagentRunByChildSessionKey ??
          getLatestSubagentRunByChildSessionKey,
        handoffSubagentCompletionToRequester:
          opts?.subagentRegistry?.handoffSubagentCompletionToRequester ??
          handoffSubagentCompletionToRequester,
        listDescendantRunsForRequester:
          opts?.subagentRegistry?.listDescendantRunsForRequester ?? listDescendantRunsForRequester,
      };
      const cfg = opts?.config ?? loadConfig();
      const teamId = readStringParam(params, "teamId", { required: true });
      const workflowId = readStringParam(params, "workflowId");
      const task = readStringParam(params, "task", { required: true });
      const { effectiveRequesterKey } = resolveSessionToolContext({
        agentSessionKey: opts?.agentSessionKey,
        sandboxed: opts?.sandboxed,
        config: cfg,
      });
      const requesterTeamContext = resolveSessionTeamContext({
        cfg,
        sessionKey: effectiveRequesterKey,
      });
      const timeoutSeconds =
        typeof params.timeoutSeconds === "number" && Number.isFinite(params.timeoutSeconds)
          ? Math.max(0, Math.floor(params.timeoutSeconds))
          : shouldDefaultToAsyncTeamRun({
                requesterTeamContext,
                messageChannel: opts?.agentChannel,
              })
            ? 0
            : 90;
      const timeoutMs = timeoutSeconds * 1000;
      const teamTarget = resolveTeamRunTarget({
        cfg,
        teamId,
        workflowId,
      });
      if (!teamTarget.ok) {
        return jsonResult({
          status: "error",
          error: teamTarget.error,
        });
      }
      const targetTeam = teamTarget.target.team;
      const targetWorkflow = teamTarget.target.workflow;
      if (!teamTarget.target.contractReady) {
        return jsonResult({
          status: "contract_blocked",
          teamId: targetTeam.id,
          workflowId: targetWorkflow.id,
          contractSatisfied: false,
          blockingReasons: teamTarget.target.blockingReasons,
          requiredRoles: teamTarget.target.requiredRoles,
          requiredQaRoles: teamTarget.target.requiredQaRoles,
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
            rootSessionKey: effectiveRequesterKey,
            requiredRoles: teamTarget.target.requiredRoles,
            requiredQaRoles: teamTarget.target.requiredQaRoles,
            requireDelegation: teamTarget.target.requireDelegation,
            programPath: generatedProgram.relativePath,
            program: generatedProgram.program,
            task,
            lifecycleStages: resolveTeamWorkflowLifecycleStages(targetWorkflow),
            deliveryRouteNotes: buildDeliveryRouteContractNotes({
              messageChannel: opts?.agentChannel,
              requesterTailscaleLogin: opts?.requesterTailscaleLogin,
            }),
          }),
          routingTask: task,
          label: `${targetTeam.name?.trim() || targetTeam.id} manager`,
          agentId: targetTeam.managerAgentId,
          intent: "team_manager",
          runTimeoutSeconds: timeoutSeconds === 0 ? undefined : timeoutSeconds,
          mode: "run",
          cleanup: "keep",
          sandbox: "inherit",
          expectsCompletionMessage: true,
          suppressRequesterAnnounce: true,
          skipAllowAgentsCheck: true,
          sessionPatch: {
            teamId: targetTeam.id,
            teamRole: "manager",
            subagentMaxSpawnDepth: resolveTeamManagerMaxSpawnDepth(targetTeam.id),
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
          senderIsOwner: opts?.senderIsOwner,
          requesterTailscaleLogin: opts?.requesterTailscaleLogin,
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
        if (timeoutSeconds === 0 && spawnResult.runId) {
          subagentRegistry.handoffSubagentCompletionToRequester(spawnResult.runId);
        }
        return jsonResult({
          status: "accepted",
          teamId: targetTeam.id,
          workflowId: targetWorkflow.id,
          executionRuntime: teamTarget.target.runtime,
          managerSessionKey: spawnResult.childSessionKey,
          runId: spawnResult.runId,
          note: spawnResult.note,
        });
      }

      const wait = await waitForTeamManagerSession({
        gatewayCall,
        countPendingDescendantRuns: subagentRegistry.countPendingDescendantRuns,
        getLatestSubagentRunByChildSessionKey:
          subagentRegistry.getLatestSubagentRunByChildSessionKey,
        initialRunId: spawnResult.runId,
        managerSessionKey: spawnResult.childSessionKey,
        timeoutMs,
      });
      if (wait.status === "waiting_timed_out") {
        const handoffRunIds = [
          wait.snapshot.currentRunId?.trim(),
          spawnResult.runId?.trim(),
        ].filter(
          (runId, index, arr): runId is string => Boolean(runId) && arr.indexOf(runId) === index,
        );
        const lateCompletionDeliveryEnabled = handoffRunIds.some((runId) =>
          subagentRegistry.handoffSubagentCompletionToRequester(runId),
        );
        return jsonResult({
          status: "waiting_timed_out",
          error: wait.error,
          teamId: targetTeam.id,
          workflowId: targetWorkflow.id,
          executionRuntime: teamTarget.target.runtime,
          managerSessionKey: spawnResult.childSessionKey,
          runId: spawnResult.runId,
          runSettled: false,
          teamRunStatus: "running",
          waitTimedOutAfterSeconds: timeoutSeconds,
          lateCompletionDelivery: lateCompletionDeliveryEnabled ? "enabled" : "unavailable",
          pendingDescendantRuns: wait.snapshot.pendingDescendantRuns,
          managerRunEnded: wait.snapshot.managerRunEnded,
          managerCleanupCompleted: wait.snapshot.managerCleanupCompleted,
          managerWakePending: wait.snapshot.managerWakePending,
          currentRunId: wait.snapshot.currentRunId,
        });
      }
      if (wait.status === "error") {
        return jsonResult({
          status: "error",
          error: wait.error ?? "agent error",
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
      const reply = extractLatestDeliverableAssistantText(
        Array.isArray(history?.messages) ? history.messages : [],
      );
      const participationRuns = dedupeLatestRunsByChildSession(
        subagentRegistry.listDescendantRunsForRequester(spawnResult.childSessionKey),
      );
      const contract = resolveTeamWorkflowContract(targetWorkflow);
      const usedAgentIds = Array.from(
        new Set([
          targetTeam.managerAgentId,
          ...participationRuns
            .map((run) => parseAgentSessionKey(run.childSessionKey)?.agentId)
            .filter((value): value is string => Boolean(value)),
        ]),
      );
      const participatedRoles = new Map<
        string,
        {
          agentId: string;
          approval?: "approved" | "blocked";
        }
      >();
      for (const run of participationRuns) {
        const sessionEntry = loadSessionEntry(run.childSessionKey).entry;
        const teamRole =
          typeof run.teamRole === "string" && run.teamRole.trim()
            ? run.teamRole.trim().toLowerCase()
            : typeof sessionEntry?.teamRole === "string"
              ? sessionEntry.teamRole.trim().toLowerCase()
              : "";
        const agentId = parseAgentSessionKey(run.childSessionKey)?.agentId?.trim();
        if (!teamRole || !agentId) {
          continue;
        }
        let approval: "approved" | "blocked" | undefined;
        if (contract.requiredQaRoles.includes(teamRole)) {
          approval = parseQaApproval(
            run.frozenResultText ?? run.fallbackFrozenResultText ?? undefined,
          );
          if (!approval) {
            const childHistory = await gatewayCall<{ messages: Array<unknown> }>({
              method: "chat.history",
              params: { sessionKey: run.childSessionKey, limit: 50 },
            });
            const childFiltered = stripToolMessages(
              Array.isArray(childHistory?.messages) ? childHistory.messages : [],
            );
            const childLast =
              childFiltered.length > 0 ? childFiltered[childFiltered.length - 1] : undefined;
            approval = parseQaApproval(childLast ? extractAssistantText(childLast) : undefined);
          }
        }
        participatedRoles.set(teamRole, { agentId, approval });
      }
      const qaApprovedBy = contract.requiredQaRoles
        .map((role) =>
          participatedRoles.get(role)?.approval === "approved"
            ? participatedRoles.get(role)?.agentId
            : undefined,
        )
        .filter((value): value is string => Boolean(value));
      const blockingReasons = [
        ...teamTarget.target.blockingReasons,
        ...contract.requiredRoles
          .filter((role) => !participatedRoles.has(role))
          .map((role) => `Required role "${role}" did not participate in the run.`),
        ...contract.requiredQaRoles.flatMap((role) => {
          const participant = participatedRoles.get(role);
          if (!participant) {
            return [`Required QA role "${role}" did not participate in the run.`];
          }
          if (participant.approval !== "approved") {
            return [`Required QA role "${role}" did not return QA_APPROVAL: approved.`];
          }
          return [];
        }),
      ];
      const contractSatisfied = blockingReasons.length === 0;

      return jsonResult({
        status: contractSatisfied ? "ok" : "contract_failed",
        teamId: targetTeam.id,
        workflowId: targetWorkflow.id,
        executionRuntime: teamTarget.target.runtime,
        managerSessionKey: spawnResult.childSessionKey,
        runId: spawnResult.runId,
        reply,
        usedAgentIds,
        qaApprovedBy,
        contractSatisfied,
        blockingReasons,
        requiredRoles: teamTarget.target.requiredRoles,
        requiredQaRoles: teamTarget.target.requiredQaRoles,
      });
    },
  };
}
