import { parseConfigJson5, type MaumauConfig } from "../../config/config.js";
import {
  collectDashboardCalendar,
  collectDashboardMemories,
  collectDashboardRoutines,
  collectDashboardSnapshot,
  collectDashboardTasks,
  collectDashboardTeamSnapshots,
  collectDashboardTeamRuns,
  collectDashboardToday,
  collectDashboardWorkshop,
  ensureStoredDashboardTeamSnapshots,
} from "../dashboard.js";
import type { DashboardCalendarView } from "../dashboard-types.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import { validateDashboardTeamsSnapshotParams } from "../protocol/index.js";
import { validateConfigGetParams } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";
import { assertValidParams } from "./validation.js";

function parseCalendarView(value: unknown): DashboardCalendarView {
  return value === "day" || value === "week" ? value : "month";
}

function parseAnchorAtMs(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDraftConfigOrThrow(rawConfig: string): MaumauConfig {
  const parsed = parseConfigJson5(rawConfig);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  if (!isPlainRecord(parsed.parsed)) {
    throw new Error("draft config must be an object");
  }
  return parsed.parsed as MaumauConfig;
}

export const dashboardHandlers: GatewayRequestHandlers = {
  "dashboard.snapshot": async ({ params, respond, context }) => {
    if (!assertValidParams(params, validateConfigGetParams, "dashboard.snapshot", respond)) {
      return;
    }
    const snapshot = await collectDashboardSnapshot({
      cron: context.cron,
      cronStorePath: context.cronStorePath,
      execApprovals: context.execApprovalManager?.listPending() ?? [],
    });
    respond(true, snapshot, undefined);
  },
  "dashboard.today": async ({ params, respond, context }) => {
    if (!assertValidParams(params, validateConfigGetParams, "dashboard.today", respond)) {
      return;
    }
    const today = await collectDashboardToday({
      cron: context.cron,
      cronStorePath: context.cronStorePath,
      execApprovals: context.execApprovalManager?.listPending() ?? [],
    });
    respond(true, today, undefined);
  },
  "dashboard.tasks": async ({ params, respond, context }) => {
    if (!assertValidParams(params, validateConfigGetParams, "dashboard.tasks", respond)) {
      return;
    }
    const result = await collectDashboardTasks({
      cron: context.cron,
      cronStorePath: context.cronStorePath,
      execApprovals: context.execApprovalManager?.listPending() ?? [],
    });
    respond(true, result, undefined);
  },
  "dashboard.workshop": async ({ params, respond, context }) => {
    if (!assertValidParams(params, validateConfigGetParams, "dashboard.workshop", respond)) {
      return;
    }
    const result = await collectDashboardWorkshop({
      cron: context.cron,
      cronStorePath: context.cronStorePath,
      execApprovals: context.execApprovalManager?.listPending() ?? [],
    });
    respond(true, result, undefined);
  },
  "dashboard.calendar": async ({ params, respond, context }) => {
    if (!isPlainRecord(params)) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "invalid dashboard.calendar params"));
      return;
    }
    const result = await collectDashboardCalendar({
      cron: context.cron,
      cronStorePath: context.cronStorePath,
      execApprovals: context.execApprovalManager?.listPending() ?? [],
      view: parseCalendarView((params as { view?: unknown }).view),
      anchorAtMs: parseAnchorAtMs((params as { anchorAtMs?: unknown }).anchorAtMs),
    });
    respond(true, result, undefined);
  },
  "dashboard.routines": async ({ params, respond, context }) => {
    if (!assertValidParams(params, validateConfigGetParams, "dashboard.routines", respond)) {
      return;
    }
    const result = await collectDashboardRoutines({
      cron: context.cron,
      cronStorePath: context.cronStorePath,
      execApprovals: context.execApprovalManager?.listPending() ?? [],
    });
    respond(true, result, undefined);
  },
  "dashboard.memories": async ({ params, respond, context }) => {
    if (!assertValidParams(params, validateConfigGetParams, "dashboard.memories", respond)) {
      return;
    }
    const result = await collectDashboardMemories({
      cron: context.cron,
      cronStorePath: context.cronStorePath,
      execApprovals: context.execApprovalManager?.listPending() ?? [],
    });
    respond(true, result, undefined);
  },
  "dashboard.teams.snapshot": async ({ params, respond, context }) => {
    if (
      !assertValidParams(
        params,
        validateDashboardTeamsSnapshotParams,
        "dashboard.teams.snapshot",
        respond,
      )
    ) {
      return;
    }
    try {
      const rawConfig = isPlainRecord(params) && typeof params.rawConfig === "string"
        ? params.rawConfig
        : undefined;
      if (rawConfig) {
        const snapshots = await collectDashboardTeamSnapshots({
          cfg: parseDraftConfigOrThrow(rawConfig),
          logger: context.logGateway,
        });
        respond(true, snapshots, undefined);
        return;
      }
      const snapshots = await ensureStoredDashboardTeamSnapshots({
        logger: context.logGateway,
      });
      respond(true, snapshots, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, String(error)),
      );
    }
  },
  "dashboard.teams.runs": async ({ params, respond, context }) => {
    if (
      !assertValidParams(
        params,
        validateConfigGetParams,
        "dashboard.teams.runs",
        respond,
      )
    ) {
      return;
    }
    const result = await collectDashboardTeamRuns({
      cron: context.cron,
      cronStorePath: context.cronStorePath,
      execApprovals: context.execApprovalManager?.listPending() ?? [],
    });
    respond(true, result, undefined);
  },
};
