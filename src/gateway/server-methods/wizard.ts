import { randomUUID } from "node:crypto";
import { defaultRuntime } from "../../runtime.js";
import { WizardSession } from "../../wizard/session.js";
import {
  ErrorCodes,
  errorShape,
  validateWizardCancelParams,
  validateWizardNextParams,
  validateWizardStartParams,
  validateWizardStatusParams,
} from "../protocol/index.js";
import { formatForLog } from "../ws-log.js";
import type { GatewayRequestContext, GatewayRequestHandlers, RespondFn } from "./types.js";
import { assertValidParams } from "./validation.js";

const EMBEDDED_WIZARD_START_STEP_TIMEOUT_MS = 750;

function readWizardStatus(session: WizardSession) {
  return {
    status: session.getStatus(),
    error: session.getError(),
  };
}

function buildWizardWarmupStep() {
  return {
    done: false,
    status: "running" as const,
    step: {
      id: `wizard-start-warmup:${randomUUID()}`,
      type: "progress" as const,
      title: "Preparing setup",
      message: "Maumau is getting the first setup step ready…",
      executor: "client" as const,
    },
  };
}

function isModelsAuthEntrypoint(entrypoint: unknown): boolean {
  return typeof entrypoint === "string" && entrypoint.trim().toLowerCase() === "models-auth";
}

async function readWizardStartResult(params: {
  session: WizardSession;
  preferWarmupStep: boolean;
}) {
  if (!params.preferWarmupStep) {
    return await params.session.next();
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      params.session.next(),
      new Promise<ReturnType<typeof buildWizardWarmupStep>>((resolve) => {
        timeoutHandle = setTimeout(
          () => resolve(buildWizardWarmupStep()),
          EMBEDDED_WIZARD_START_STEP_TIMEOUT_MS,
        );
      }),
    ]);
    return result;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function findWizardSessionOrRespond(params: {
  context: GatewayRequestContext;
  respond: RespondFn;
  sessionId: string;
}): WizardSession | null {
  const session = params.context.wizardSessions.get(params.sessionId);
  if (!session) {
    params.respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "wizard not found"));
    return null;
  }
  return session;
}

export const wizardHandlers: GatewayRequestHandlers = {
  "wizard.start": async ({ params, respond, context }) => {
    if (!assertValidParams(params, validateWizardStartParams, "wizard.start", respond)) {
      return;
    }
    const running = context.findRunningWizard();
    if (running) {
      if (params.fresh === true) {
        running.session.cancel();
        context.purgeWizardSession(running.id);
      } else {
        // Reattach callers to the existing wizard so clients can recover after
        // losing local session state without forcing the operator to restart setup.
        const result = await readWizardStartResult({
          session: running.session,
          preferWarmupStep: params.embedded === true,
        });
        if (result.done) {
          context.purgeWizardSession(running.id);
        }
        respond(true, { sessionId: running.id, ...result }, undefined);
        return;
      }
    }
    const sessionId = randomUUID();
    const session = new WizardSession((prompter) => {
      if (isModelsAuthEntrypoint(params.entrypoint)) {
        return context.modelAuthWizardRunner(
          {
            authChoice: typeof params.authChoice === "string" ? params.authChoice : undefined,
          },
          defaultRuntime,
          prompter,
        );
      }

      const opts = {
        mode: params.mode,
        flow: params.flow,
        preset: params.preset,
        workspace: typeof params.workspace === "string" ? params.workspace : undefined,
        acceptRisk: params.acceptRisk === true,
        skipChannels: params.skipChannels === true,
        skipSkills: params.skipSkills === true,
        skipSearch: params.skipSearch === true,
        skipUi: params.skipUi === true,
        embedded: params.embedded === true,
      };
      return context.wizardRunner(opts, defaultRuntime, prompter);
    });
    context.wizardSessions.set(sessionId, session);
    const result = await readWizardStartResult({
      session,
      preferWarmupStep: params.embedded === true,
    });
    if (result.done) {
      context.purgeWizardSession(sessionId);
    }
    respond(true, { sessionId, ...result }, undefined);
  },
  "wizard.next": async ({ params, respond, context }) => {
    if (!assertValidParams(params, validateWizardNextParams, "wizard.next", respond)) {
      return;
    }
    const sessionId = params.sessionId;
    const session = findWizardSessionOrRespond({ context, respond, sessionId });
    if (!session) {
      return;
    }
    const answer = params.answer as { stepId?: string; value?: unknown } | undefined;
    if (answer) {
      if (session.getStatus() !== "running") {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "wizard not running"));
        return;
      }
      try {
        await session.answer(String(answer.stepId ?? ""), answer.value);
      } catch (err) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, formatForLog(err)));
        return;
      }
    }
    const result = await session.next();
    if (result.done) {
      context.purgeWizardSession(sessionId);
    }
    respond(true, result, undefined);
  },
  "wizard.cancel": ({ params, respond, context }) => {
    if (!assertValidParams(params, validateWizardCancelParams, "wizard.cancel", respond)) {
      return;
    }
    const sessionId = params.sessionId;
    const session = findWizardSessionOrRespond({ context, respond, sessionId });
    if (!session) {
      return;
    }
    session.cancel();
    const status = readWizardStatus(session);
    context.wizardSessions.delete(sessionId);
    respond(true, status, undefined);
  },
  "wizard.status": ({ params, respond, context }) => {
    if (!assertValidParams(params, validateWizardStatusParams, "wizard.status", respond)) {
      return;
    }
    const sessionId = params.sessionId;
    const session = findWizardSessionOrRespond({ context, respond, sessionId });
    if (!session) {
      return;
    }
    const status = readWizardStatus(session);
    if (status.status !== "running") {
      context.wizardSessions.delete(sessionId);
    }
    respond(true, status, undefined);
  },
};
