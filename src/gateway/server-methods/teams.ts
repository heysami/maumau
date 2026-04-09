import type { AssistantMessage } from "@mariozechner/pi-ai";
import { resolveDefaultAgentId } from "../../agents/agent-scope.js";
import {
  completeWithPreparedSimpleCompletionModel,
  prepareSimpleCompletionModelForAgent,
} from "../../agents/simple-completion-runtime.js";
import { listAgentEntries } from "../../commands/agents.config.js";
import { parseConfigJson5, type MaumauConfig } from "../../config/config.js";
import {
  findTeamConfig,
  findTeamWorkflow,
  listConfiguredTeams,
  listTeamMembers,
} from "../../teams/model.js";
import { generateTeamOpenProsePreview } from "../../teams/openprose.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateTeamPromptEditParams,
  validateTeamPromptEditResult,
  type TeamPromptEditResult,
} from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";
import { assertValidParams } from "./validation.js";

const TEAM_PROMPT_EDIT_TIMEOUT_MS = 15_000;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    }),
  ]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

function extractAssistantText(message: AssistantMessage): string {
  return message.content
    .map((entry) => (entry.type === "text" ? entry.text : ""))
    .filter((entry): entry is string => Boolean(entry))
    .join("\n")
    .trim();
}

function extractJsonCandidate(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

function normalizePromptEditResult(raw: unknown): unknown {
  if (!isObject(raw)) {
    return raw;
  }
  const warnings = Array.isArray(raw.warnings)
    ? raw.warnings
        .map((entry) => normalizeText(entry))
        .filter((entry): entry is string => Boolean(entry))
    : [];
  const agentPatches = Array.isArray(raw.agentPatches)
    ? raw.agentPatches.filter((entry) => isObject(entry))
    : [];
  const normalized: Record<string, unknown> = {
    ok: true,
    noop:
      raw.noop === true ||
      (!("teamPatch" in raw) &&
        !("workflowPatch" in raw) &&
        (!Array.isArray(raw.agentPatches) || raw.agentPatches.length === 0)),
    warnings,
    agentPatches,
  };
  const summary = normalizeText(raw.summary);
  if (summary) {
    normalized.summary = summary;
  }
  if ("teamPatch" in raw) {
    normalized.teamPatch = raw.teamPatch;
  }
  if ("workflowPatch" in raw) {
    normalized.workflowPatch = raw.workflowPatch;
  }
  return normalized;
}

function parseDraftConfigOrThrow(rawConfig: string): MaumauConfig {
  const parsed = parseConfigJson5(rawConfig);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  if (!isObject(parsed.parsed)) {
    throw new Error("draft config must be an object");
  }
  return parsed.parsed as MaumauConfig;
}

function buildPromptContext(params: { cfg: MaumauConfig; teamId: string; workflowId?: string }) {
  const team = findTeamConfig(params.cfg, params.teamId);
  if (!team) {
    throw new Error(`team "${params.teamId}" not found in the current draft config`);
  }
  const workflow = findTeamWorkflow(team, params.workflowId);
  const involvedAgentIds = new Set<string>([
    team.managerAgentId,
    ...listTeamMembers(team).map((member) => member.agentId),
  ]);
  const involvedAgents = listAgentEntries(params.cfg)
    .filter((entry) => involvedAgentIds.has(entry.id))
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      identity: entry.identity,
    }));
  const otherTeams = listConfiguredTeams(params.cfg)
    .filter((entry) => entry.id !== team.id)
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      description: entry.description,
    }));
  const openProsePreview = generateTeamOpenProsePreview({
    config: params.cfg,
    team,
    workflowId: workflow.id,
  });
  return { team, workflow, involvedAgents, otherTeams, openProsePreview };
}

async function preparePromptEditModel(cfg: MaumauConfig, managerAgentId: string) {
  const agentCandidates = Array.from(new Set([managerAgentId, resolveDefaultAgentId(cfg)]));
  let lastError = "No model configured.";
  for (const agentId of agentCandidates) {
    const prepared = await prepareSimpleCompletionModelForAgent({
      cfg,
      agentId,
    });
    if (!("error" in prepared)) {
      return prepared;
    }
    lastError = prepared.error;
  }
  throw new Error(lastError);
}

function buildSystemPrompt(): string {
  return [
    "You update Maumau team configuration from a natural-language request.",
    "Return JSON only. Do not wrap it in markdown.",
    "You are producing a targeted patch, not a full rewrite.",
    "Only include teamPatch fields when the request explicitly changes team structure or metadata.",
    "Only include workflowPatch fields when the request explicitly changes workflow behavior, lifecycle, manager prompt, synthesis prompt, or generated OpenProse behavior.",
    "Only include agentPatches when the request explicitly changes agent names or identity metadata.",
    "Never output raw OpenProse. OpenProse is generated from structured fields.",
    "Do not change team ids, workflow ids, or invent new agent ids or team ids.",
    "When clearing a string field, use null.",
    "If the request is ambiguous or does not require a config change, set noop=true and explain why in warnings.",
  ].join(" ");
}

function buildUserPrompt(params: {
  requestPrompt: string;
  team: ReturnType<typeof buildPromptContext>["team"];
  workflow: ReturnType<typeof buildPromptContext>["workflow"];
  involvedAgents: ReturnType<typeof buildPromptContext>["involvedAgents"];
  otherTeams: ReturnType<typeof buildPromptContext>["otherTeams"];
  openProsePreview: string;
}): string {
  return [
    "User request:",
    params.requestPrompt,
    "",
    "Selected team:",
    JSON.stringify(
      {
        id: params.team.id,
        name: params.team.name,
        description: params.team.description,
        managerAgentId: params.team.managerAgentId,
        implicitForManagerSessions: params.team.implicitForManagerSessions,
        members: params.team.members ?? [],
        crossTeamLinks: params.team.crossTeamLinks ?? [],
      },
      null,
      2,
    ),
    "",
    "Selected workflow:",
    JSON.stringify(params.workflow, null, 2),
    "",
    "Related agents:",
    JSON.stringify(params.involvedAgents, null, 2),
    "",
    "Other configured teams available for linking:",
    JSON.stringify(params.otherTeams, null, 2),
    "",
    "Generated OpenProse preview for this workflow:",
    params.openProsePreview,
    "",
    "Return this JSON shape exactly:",
    JSON.stringify(
      {
        ok: true,
        noop: false,
        summary: "Short summary of what changed",
        warnings: ["Only when needed"],
        teamPatch: {
          name: "optional or null",
          description: "optional or null",
          managerAgentId: "optional or null",
          implicitForManagerSessions: true,
          members: [
            { agentId: "existing-agent-id", role: "role", description: "optional or null" },
          ],
          crossTeamLinks: [
            { type: "team", targetId: "existing-team-id", description: "optional or null" },
          ],
        },
        workflowPatch: {
          name: "optional or null",
          description: "optional or null",
          managerPrompt: "optional or null",
          synthesisPrompt: "optional or null",
          lifecycle: {
            stages: [
              { id: "planning", name: "Planning", status: "in_progress", roles: ["manager"] },
            ],
          },
          contract: {
            requiredRoles: ["developer"],
            requiredQaRoles: ["technical qa"],
            requireDelegation: true,
          },
        },
        agentPatches: [
          {
            agentId: "existing-agent-id",
            name: "optional or null",
            identity: {
              name: "optional or null",
              theme: "optional or null",
              emoji: "optional or null",
              avatar: "optional or null",
              avatarUrl: "optional or null",
            },
          },
        ],
      },
      null,
      2,
    ),
  ].join("\n");
}

async function interpretTeamPrompt(params: {
  cfg: MaumauConfig;
  teamId: string;
  workflowId?: string;
  prompt: string;
}): Promise<TeamPromptEditResult> {
  const context = buildPromptContext(params);
  const prepared = await preparePromptEditModel(params.cfg, context.team.managerAgentId);
  const response = await withTimeout(
    completeWithPreparedSimpleCompletionModel({
      model: prepared.model,
      auth: prepared.auth,
      context: {
        systemPrompt: buildSystemPrompt(),
        messages: [
          {
            role: "user",
            timestamp: Date.now(),
            content: [
              {
                type: "text",
                text: buildUserPrompt({
                  requestPrompt: params.prompt,
                  team: context.team,
                  workflow: context.workflow,
                  involvedAgents: context.involvedAgents,
                  otherTeams: context.otherTeams,
                  openProsePreview: context.openProsePreview,
                }),
              },
            ],
          },
        ],
      },
    }),
    TEAM_PROMPT_EDIT_TIMEOUT_MS,
    "teams.promptEdit",
  );
  const assistantText = extractAssistantText(response);
  const jsonCandidate = extractJsonCandidate(assistantText);
  if (!jsonCandidate) {
    throw new Error("model returned an empty prompt-edit response");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonCandidate);
  } catch (error) {
    throw new Error(
      `model returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const normalized = normalizePromptEditResult(parsed);
  if (!validateTeamPromptEditResult(normalized)) {
    throw new Error(
      `model returned an invalid team patch: ${formatValidationErrors(
        validateTeamPromptEditResult.errors,
      )}`,
    );
  }
  return normalized;
}

export const teamsHandlers: GatewayRequestHandlers = {
  "teams.promptEdit": async ({ params, respond, context }) => {
    if (!assertValidParams(params, validateTeamPromptEditParams, "teams.promptEdit", respond)) {
      return;
    }
    try {
      const request = params as {
        rawConfig: string;
        teamId: string;
        workflowId?: string;
        prompt: string;
      };
      const cfg = parseDraftConfigOrThrow(request.rawConfig);
      const result = await interpretTeamPrompt({
        cfg,
        teamId: request.teamId,
        workflowId: request.workflowId,
        prompt: request.prompt,
      });
      respond(true, result, undefined);
    } catch (error) {
      context.logGateway.warn(`teams.promptEdit failed: ${String(error)}`);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, error instanceof Error ? error.message : String(error)),
      );
    }
  },
};
