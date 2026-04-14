import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Type } from "@sinclair/typebox";
import type { MaumauPluginApi, MaumauPluginToolContext } from "../runtime-api.js";
import { resolveAutomationRunnerConfig, type AutomationRunnerPluginConfig } from "./config.js";

const ACTION_STEP_KINDS = [
  "open",
  "navigate",
  "snapshot",
  "click",
  "type",
  "press",
  "wait",
  "evaluate",
] as const;
const SIDE_EFFECTING_STEP_KINDS = new Set(["click", "type", "press"]);
const LOAD_STATE_VALUES = ["load", "domcontentloaded", "networkidle"] as const;
const DESKTOP_FALLBACK_PROFILES = ["desktop", "desktop-fallback", "clawd-desktop"] as const;
const APPROVAL_TTL_MS = 15 * 60 * 1000;

type AutomationStepKind = (typeof ACTION_STEP_KINDS)[number];
type LoadStateValue = (typeof LOAD_STATE_VALUES)[number];

type AutomationStep = {
  kind: AutomationStepKind;
  url?: string;
  ref?: string;
  text?: string;
  key?: string;
  fn?: string;
  selector?: string;
  textGone?: string;
  urlPattern?: string;
  targetId?: string;
  timeMs?: number;
  loadState?: LoadStateValue;
};

type ApprovalRecord = {
  id: string;
  sessionId: string;
  requesterSenderId: string;
  requestHash: string;
  createdAtMs: number;
};

type AutomationLane = "browser" | "desktop-fallback";

type BrowserExecutionResult = {
  lane: AutomationLane;
  profile: string | null;
  outputs: Array<{ step: AutomationStep; result: unknown }>;
};

function stringEnum<T extends readonly string[]>(values: T, description: string) {
  return Type.Unsafe<T[number]>({
    type: "string",
    enum: [...values],
    description,
  });
}

function optionalStringEnum<T extends readonly string[]>(values: T) {
  return Type.Optional(
    Type.Unsafe<T[number]>({
      type: "string",
      enum: [...values],
    }),
  );
}

function parseJsonSuffix(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    const suffixMatch = trimmed.match(/({[\s\S]*}|\[[\s\S]*])\s*$/);
    if (suffixMatch?.[1]) {
      return JSON.parse(suffixMatch[1]);
    }
    throw new Error(`Command returned non-JSON output: ${trimmed}`);
  }
}

function buildRequestHash(params: { request: string; steps: AutomationStep[] }): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        request: params.request,
        steps: params.steps,
      }),
      "utf8",
    )
    .digest("hex");
}

function validateStep(step: AutomationStep): void {
  if (!ACTION_STEP_KINDS.includes(step.kind)) {
    throw new Error(`Unsupported step kind: ${String(step.kind)}`);
  }
  if ((step.kind === "open" || step.kind === "navigate") && !step.url?.trim()) {
    throw new Error(`${step.kind} step requires url`);
  }
  if ((step.kind === "click" || step.kind === "type") && !step.ref?.trim()) {
    throw new Error(`${step.kind} step requires ref`);
  }
  if (step.kind === "type" && step.text == null) {
    throw new Error("type step requires text");
  }
  if (step.kind === "press" && !step.key?.trim()) {
    throw new Error("press step requires key");
  }
  if (step.kind === "evaluate" && !step.fn?.trim()) {
    throw new Error("evaluate step requires fn");
  }
}

function containsSideEffects(steps: AutomationStep[]): boolean {
  return steps.some((step) => SIDE_EFFECTING_STEP_KINDS.has(step.kind));
}

function resolvePreferredLanguage(config: AutomationRunnerToolState["api"]["config"]): "en" | "id" {
  const raw = config?.messages?.tts?.elevenlabs?.languageCode?.trim().toLowerCase();
  return raw === "id" || raw === "in" ? "id" : "en";
}

function formatApprovalPrompt(params: {
  language: "en" | "id";
  request: string;
  steps: AutomationStep[];
}): string {
  const summary = params.steps
    .slice(0, 4)
    .map((step) => step.kind)
    .join(", ");
  if (params.language === "id") {
    return `Perlu konfirmasi untuk menjalankan aksi: ${params.request}. Langkah: ${summary || "tidak ada"}.`;
  }
  return `Approval required before running: ${params.request}. Steps: ${summary || "none"}.`;
}

function formatApprovalInstruction(params: { language: "en" | "id"; token: string }): string {
  if (params.language === "id") {
    return `Ulangi panggilan ini dengan approvalToken="${params.token}" setelah operator menyetujui aksi yang sama.`;
  }
  return `Repeat this call with approvalToken="${params.token}" after the operator approves the same action.`;
}

type AutomationRunnerToolState = {
  api: MaumauPluginApi;
  config: AutomationRunnerPluginConfig;
};

function isAuthorized(params: {
  config: AutomationRunnerPluginConfig;
  context: MaumauPluginToolContext;
}): { ok: true } | { ok: false; reason: string } {
  if (!params.config.enabled || params.config.accessPolicy.mode === "disabled") {
    return { ok: false, reason: "automation runner is disabled" };
  }
  if (params.context.senderIsOwner) {
    return { ok: true };
  }
  if (params.config.accessPolicy.mode === "owner") {
    return { ok: false, reason: "automation_task is owner-only for this setup" };
  }
  const senderId = params.context.requesterSenderId?.trim();
  if (!senderId) {
    return { ok: false, reason: "trusted sender id required for automation_task" };
  }
  const allowed = params.config.accessPolicy.allowFrom.some(
    (candidate) => candidate.toLowerCase() === senderId.toLowerCase(),
  );
  if (!allowed) {
    return { ok: false, reason: "sender is not on the automation allowlist" };
  }
  return { ok: true };
}

async function resolveApprovalDir(state: AutomationRunnerToolState): Promise<string> {
  const stateDir = state.api.runtime.state.resolveStateDir();
  const dir = path.join(stateDir, "plugins", "automation-runner", "approvals");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function writeApprovalRecord(params: {
  state: AutomationRunnerToolState;
  context: MaumauPluginToolContext;
  requestHash: string;
}): Promise<string> {
  const sessionId = params.context.sessionId?.trim();
  const requesterSenderId = params.context.requesterSenderId?.trim();
  if (!sessionId || !requesterSenderId) {
    throw new Error("approval flow requires sessionId and requesterSenderId");
  }
  const id = randomUUID();
  const filePath = path.join(await resolveApprovalDir(params.state), `${id}.json`);
  const record: ApprovalRecord = {
    id,
    sessionId,
    requesterSenderId,
    requestHash: params.requestHash,
    createdAtMs: Date.now(),
  };
  await fs.writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return id;
}

async function consumeApprovalRecord(params: {
  state: AutomationRunnerToolState;
  context: MaumauPluginToolContext;
  token: string;
  requestHash: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const filePath = path.join(await resolveApprovalDir(params.state), `${params.token}.json`);
  let record: ApprovalRecord;
  try {
    record = JSON.parse(await fs.readFile(filePath, "utf8")) as ApprovalRecord;
  } catch {
    return { ok: false, reason: "approval token not found or already used" };
  }

  const sessionId = params.context.sessionId?.trim() ?? "";
  const requesterSenderId = params.context.requesterSenderId?.trim() ?? "";
  if (!sessionId || !requesterSenderId) {
    return { ok: false, reason: "approval replay requires sessionId and requesterSenderId" };
  }
  if (record.sessionId !== sessionId) {
    return { ok: false, reason: "approval token belongs to a different session" };
  }
  if (record.requesterSenderId !== requesterSenderId) {
    return { ok: false, reason: "approval token belongs to a different sender" };
  }
  if (record.requestHash !== params.requestHash) {
    return { ok: false, reason: "approval token does not match this action request" };
  }
  if (Date.now() - record.createdAtMs > APPROVAL_TTL_MS) {
    return { ok: false, reason: "approval token expired" };
  }
  try {
    await fs.rm(filePath, { force: true });
  } catch {
    // Best effort. The caller still treats the token as consumed after validation.
  }
  return { ok: true };
}

function resolveCliCandidates(subArgs: string[]): string[][] {
  const candidates: string[][] = [];
  const argv1 = process.argv[1]?.trim();
  if (argv1) {
    candidates.push([process.execPath, argv1, ...subArgs]);
  }
  candidates.push(["maumau", ...subArgs]);
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = candidate.join("\u0000");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function runMaumauJsonCommand(
  state: AutomationRunnerToolState,
  argv: string[],
): Promise<unknown> {
  let lastError: Error | null = null;
  for (const candidate of resolveCliCandidates(argv)) {
    try {
      const result = await state.api.runtime.system.runCommandWithTimeout(candidate, {
        timeoutMs: 30_000,
        cwd: state.api.config?.agents?.defaults?.workspace ?? process.cwd(),
      });
      if (result.code !== 0) {
        lastError = new Error(result.stderr.trim() || result.stdout.trim() || "command failed");
        continue;
      }
      return parseJsonSuffix(result.stdout);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw lastError ?? new Error(`Failed to run command: ${argv.join(" ")}`);
}

async function ensureBrowserLane(
  state: AutomationRunnerToolState,
  profile: string | null,
): Promise<boolean> {
  const args = ["browser", "start", "--json"];
  if (profile) {
    args.unshift("--browser-profile", profile);
  }
  try {
    await runMaumauJsonCommand(state, args);
    return true;
  } catch {
    return false;
  }
}

async function resolveLane(
  state: AutomationRunnerToolState,
  context: MaumauPluginToolContext,
): Promise<{ lane: AutomationLane; profile: string | null }> {
  if (await ensureBrowserLane(state, null)) {
    return { lane: "browser", profile: null };
  }
  if (!context.senderIsOwner) {
    throw new Error("Browser automation is unavailable and desktop fallback is owner-only");
  }
  for (const profile of DESKTOP_FALLBACK_PROFILES) {
    if (await ensureBrowserLane(state, profile)) {
      return { lane: "desktop-fallback", profile };
    }
  }
  throw new Error(
    "No automation lane is ready: browser failed and desktop fallback is unavailable",
  );
}

function buildBrowserArgs(profile: string | null, commandArgs: string[]): string[] {
  if (profile) {
    return ["--browser-profile", profile, "browser", ...commandArgs, "--json"];
  }
  return ["browser", ...commandArgs, "--json"];
}

async function runBrowserCommand(
  state: AutomationRunnerToolState,
  profile: string | null,
  commandArgs: string[],
): Promise<unknown> {
  return await runMaumauJsonCommand(state, buildBrowserArgs(profile, commandArgs));
}

async function executeBrowserSteps(
  state: AutomationRunnerToolState,
  lane: { lane: AutomationLane; profile: string | null },
  steps: AutomationStep[],
): Promise<BrowserExecutionResult> {
  const outputs: BrowserExecutionResult["outputs"] = [];
  for (const step of steps) {
    validateStep(step);
    let result: unknown;
    switch (step.kind) {
      case "open":
        result = await runBrowserCommand(state, lane.profile, ["open", step.url!.trim()]);
        break;
      case "navigate": {
        const args = ["navigate", step.url!.trim()];
        if (step.targetId?.trim()) {
          args.push("--target-id", step.targetId.trim());
        }
        result = await runBrowserCommand(state, lane.profile, args);
        break;
      }
      case "snapshot": {
        const args = ["snapshot"];
        if (step.targetId?.trim()) {
          args.push("--target-id", step.targetId.trim());
        }
        result = await runBrowserCommand(state, lane.profile, args);
        break;
      }
      case "click": {
        const args = ["click", step.ref!.trim()];
        if (step.targetId?.trim()) {
          args.push("--target-id", step.targetId.trim());
        }
        result = await runBrowserCommand(state, lane.profile, args);
        break;
      }
      case "type": {
        const args = ["type", step.ref!.trim(), step.text ?? ""];
        if (step.targetId?.trim()) {
          args.push("--target-id", step.targetId.trim());
        }
        result = await runBrowserCommand(state, lane.profile, args);
        break;
      }
      case "press": {
        const args = ["press", step.key!.trim()];
        if (step.targetId?.trim()) {
          args.push("--target-id", step.targetId.trim());
        }
        result = await runBrowserCommand(state, lane.profile, args);
        break;
      }
      case "wait": {
        const args = ["wait"];
        if (step.selector?.trim()) {
          args.push(step.selector.trim());
        }
        if (typeof step.timeMs === "number" && Number.isFinite(step.timeMs)) {
          args.push("--time", String(Math.max(0, Math.trunc(step.timeMs))));
        }
        if (step.text?.trim()) {
          args.push("--text", step.text.trim());
        }
        if (step.textGone?.trim()) {
          args.push("--text-gone", step.textGone.trim());
        }
        if (step.urlPattern?.trim()) {
          args.push("--url", step.urlPattern.trim());
        }
        if (step.loadState) {
          args.push("--load", step.loadState);
        }
        if (step.fn?.trim()) {
          args.push("--fn", step.fn.trim());
        }
        if (step.targetId?.trim()) {
          args.push("--target-id", step.targetId.trim());
        }
        result = await runBrowserCommand(state, lane.profile, args);
        break;
      }
      case "evaluate": {
        const args = ["evaluate", "--fn", step.fn!.trim()];
        if (step.ref?.trim()) {
          args.push("--ref", step.ref.trim());
        }
        if (step.targetId?.trim()) {
          args.push("--target-id", step.targetId.trim());
        }
        result = await runBrowserCommand(state, lane.profile, args);
        break;
      }
    }
    outputs.push({ step, result });
  }

  return {
    lane: lane.lane,
    profile: lane.profile,
    outputs,
  };
}

export function createAutomationTaskTool(
  api: MaumauPluginApi,
  toolContext: MaumauPluginToolContext,
) {
  const state: AutomationRunnerToolState = {
    api,
    config: resolveAutomationRunnerConfig(api.pluginConfig),
  };

  return {
    name: "automation_task",
    label: "Automation Task",
    description:
      "Run bounded browser-first automation steps with owner/allowlist access control and approval-gated side effects.",
    parameters: Type.Object(
      {
        request: Type.String({
          description: "Short operator-visible summary of the automation goal.",
        }),
        steps: Type.Array(
          Type.Object(
            {
              kind: stringEnum(ACTION_STEP_KINDS, "Automation step kind."),
              url: Type.Optional(Type.String()),
              ref: Type.Optional(Type.String()),
              text: Type.Optional(Type.String()),
              key: Type.Optional(Type.String()),
              fn: Type.Optional(Type.String()),
              selector: Type.Optional(Type.String()),
              textGone: Type.Optional(Type.String()),
              urlPattern: Type.Optional(Type.String()),
              targetId: Type.Optional(Type.String()),
              timeMs: Type.Optional(Type.Number()),
              loadState: optionalStringEnum(LOAD_STATE_VALUES),
            },
            { additionalProperties: false },
          ),
          { minItems: 1 },
        ),
        approvalToken: Type.Optional(
          Type.String({
            description:
              "Resume token returned by a previous approval-gated call for the exact same action.",
          }),
        ),
      },
      { additionalProperties: false },
    ),
    async execute(_id: string, params: Record<string, unknown>) {
      const auth = isAuthorized({
        config: state.config,
        context: toolContext,
      });
      if (!auth.ok) {
        throw new Error(auth.reason);
      }

      const request = typeof params.request === "string" ? params.request.trim() : "";
      if (!request) {
        throw new Error("request required");
      }

      const steps = Array.isArray(params.steps) ? (params.steps as AutomationStep[]) : [];
      if (steps.length === 0) {
        throw new Error("steps required");
      }
      for (const step of steps) {
        validateStep(step);
      }

      const requestHash = buildRequestHash({ request, steps });
      const hasSideEffects = containsSideEffects(steps);
      if (hasSideEffects && state.config.requireApproval) {
        const approvalToken =
          typeof params.approvalToken === "string" ? params.approvalToken.trim() : "";
        if (!approvalToken) {
          const token = await writeApprovalRecord({
            state,
            context: toolContext,
            requestHash,
          });
          const language = resolvePreferredLanguage(api.config);
          const prompt = formatApprovalPrompt({ language, request, steps });
          const instruction = formatApprovalInstruction({ language, token });
          return {
            content: [{ type: "text", text: `${prompt}\n${instruction}` }],
            details: {
              ok: true,
              status: "needs_approval",
              requiresApproval: {
                prompt,
                resumeToken: token,
              },
              lane: null,
              profile: null,
            },
          };
        }
        const approval = await consumeApprovalRecord({
          state,
          context: toolContext,
          token: approvalToken,
          requestHash,
        });
        if (!approval.ok) {
          throw new Error(approval.reason);
        }
      }

      const lane = await resolveLane(state, toolContext);
      const result = await executeBrowserSteps(state, lane, steps);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ok: true,
                status: "ok",
                lane: result.lane,
                profile: result.profile,
                steps: result.outputs.length,
              },
              null,
              2,
            ),
          },
        ],
        details: {
          ok: true,
          status: "ok",
          lane: result.lane,
          profile: result.profile,
          outputs: result.outputs,
        },
      };
    },
  };
}
