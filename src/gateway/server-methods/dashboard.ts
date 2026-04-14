import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../../agents/agent-scope.js";
import {
  ensureBusinessRootExists,
  materializeBusinessProjectBlueprint,
} from "../../business/materialize.js";
import { loadConfig, parseConfigJson5, type MaumauConfig } from "../../config/config.js";
import { collectDashboardBusiness, collectDashboardProjects } from "../dashboard-business.js";
import type { DashboardCalendarView } from "../dashboard-types.js";
import {
  collectDashboardUserChannels,
  connectDashboardUserChannel,
  setDashboardUserChannelAllowlist,
  setDashboardUserChannelChats,
} from "../dashboard-user-channels.js";
import { collectDashboardWallet } from "../dashboard-wallet.js";
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
  saveDashboardWorkshop,
} from "../dashboard.js";
import { parseDateRange, resolveDateInterpretation } from "../date-range.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import { validateConfigGetParams } from "../protocol/index.js";
import {
  validateDashboardBusinessParams,
  validateDashboardProjectsApplyBlueprintParams,
  validateDashboardProjectsParams,
} from "../protocol/index.js";
import { validateDashboardTeamsSnapshotParams } from "../protocol/index.js";
import { validateDashboardWalletParams } from "../protocol/index.js";
import { validateDashboardWorkshopSaveParams } from "../protocol/index.js";
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

function stringifyDashboardFieldValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (typeof value === "symbol") {
    return value.description ?? "symbol";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
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
  "dashboard.wallet": async ({ params, respond }) => {
    if (!assertValidParams(params, validateDashboardWalletParams, "dashboard.wallet", respond)) {
      return;
    }
    const range = parseDateRange({
      startDate: params?.startDate,
      endDate: params?.endDate,
      mode: params?.mode,
      utcOffset: params?.utcOffset,
    });
    const result = await collectDashboardWallet({
      ...range,
      interpretation: resolveDateInterpretation({
        mode: params?.mode,
        utcOffset: params?.utcOffset,
      }),
    });
    respond(true, result, undefined);
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
  "dashboard.business": async ({ params, respond }) => {
    if (
      !assertValidParams(params, validateDashboardBusinessParams, "dashboard.business", respond)
    ) {
      return;
    }
    const cfg = loadConfig();
    const result = await collectDashboardBusiness({ cfg });
    respond(true, result, undefined);
  },
  "dashboard.projects": async ({ params, respond, context }) => {
    if (
      !assertValidParams(params, validateDashboardProjectsParams, "dashboard.projects", respond)
    ) {
      return;
    }
    const cfg = loadConfig();
    const tasks = await collectDashboardTasks({
      cron: context.cron,
      cronStorePath: context.cronStorePath,
      execApprovals: context.execApprovalManager?.listPending() ?? [],
      cfg,
    });
    const workshop = await collectDashboardWorkshop({
      cron: context.cron,
      cronStorePath: context.cronStorePath,
      execApprovals: context.execApprovalManager?.listPending() ?? [],
      cfg,
    });
    const result = await collectDashboardProjects({
      cfg,
      tasks: tasks.items,
      workshopItems: workshop.items,
      savedWorkshopItems: workshop.savedItems,
      agentApps: workshop.agentApps,
    });
    respond(true, result, undefined);
  },
  "dashboard.projects.applyBlueprint": async ({ params, respond }) => {
    if (
      !assertValidParams(
        params,
        validateDashboardProjectsApplyBlueprintParams,
        "dashboard.projects.applyBlueprint",
        respond,
      )
    ) {
      return;
    }
    try {
      const cfg = loadConfig();
      const workspaceDir = resolveAgentWorkspaceDir(cfg, resolveDefaultAgentId(cfg));
      await ensureBusinessRootExists(workspaceDir);
      const payload = params as {
        businessId: string;
        projectId: string;
        expectedVersion: number;
      };
      const result = await materializeBusinessProjectBlueprint({
        workspaceDir,
        businessId: payload.businessId,
        projectId: payload.projectId,
        expectedVersion: payload.expectedVersion,
      });
      respond(true, result, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(error)));
    }
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
  "dashboard.workshop.save": async ({ params, respond, context }) => {
    if (
      !assertValidParams(
        params,
        validateDashboardWorkshopSaveParams,
        "dashboard.workshop.save",
        respond,
      )
    ) {
      return;
    }
    try {
      const payload = params as { itemIds: string[]; projectName: string };
      const result = await saveDashboardWorkshop({
        cron: context.cron,
        cronStorePath: context.cronStorePath,
        execApprovals: context.execApprovalManager?.listPending() ?? [],
        itemIds: payload.itemIds,
        projectName: payload.projectName,
      });
      respond(true, result, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(error)));
    }
  },
  "dashboard.calendar": async ({ params, respond, context }) => {
    if (!isPlainRecord(params)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid dashboard.calendar params"),
      );
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
  "dashboard.userChannels": async ({ params, respond, context }) => {
    if (!assertValidParams(params, validateConfigGetParams, "dashboard.userChannels", respond)) {
      return;
    }
    const result = await collectDashboardUserChannels({
      runtimeSnapshot: context.getRuntimeSnapshot(),
    });
    respond(true, result, undefined);
  },
  "dashboard.userChannels.connect": async ({ params, respond }) => {
    if (!isPlainRecord(params)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid dashboard.userChannels.connect params"),
      );
      return;
    }
    try {
      await connectDashboardUserChannel({
        channelId: typeof params.channelId === "string" ? params.channelId : "",
        fields: isPlainRecord(params.fields)
          ? Object.fromEntries(
              Object.entries(params.fields).map(([key, value]) => [
                key,
                stringifyDashboardFieldValue(value),
              ]),
            )
          : undefined,
        dmPolicy: typeof params.dmPolicy === "string" ? params.dmPolicy : undefined,
        allowFrom: typeof params.allowFrom === "string" ? params.allowFrom : undefined,
        chatPolicy: typeof params.chatPolicy === "string" ? params.chatPolicy : undefined,
        chatEntries: typeof params.chatEntries === "string" ? params.chatEntries : undefined,
      });
      respond(true, { ok: true }, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(error)));
    }
  },
  "dashboard.userChannels.allowlist.set": async ({ params, respond }) => {
    if (!isPlainRecord(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "invalid dashboard.userChannels.allowlist.set params",
        ),
      );
      return;
    }
    try {
      const scope = params.scope === "group" ? "group" : "dm";
      await setDashboardUserChannelAllowlist({
        channelId: typeof params.channelId === "string" ? params.channelId : "",
        accountId: typeof params.accountId === "string" ? params.accountId : "",
        scope,
        entries: typeof params.entries === "string" ? params.entries : "",
      });
      respond(true, { ok: true }, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(error)));
    }
  },
  "dashboard.userChannels.chats.set": async ({ params, respond }) => {
    if (!isPlainRecord(params)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid dashboard.userChannels.chats.set params"),
      );
      return;
    }
    try {
      const policy =
        params.policy === "open" || params.policy === "disabled" ? params.policy : "allowlist";
      await setDashboardUserChannelChats({
        channelId: typeof params.channelId === "string" ? params.channelId : "",
        accountId: typeof params.accountId === "string" ? params.accountId : "",
        policy,
        entries: typeof params.entries === "string" ? params.entries : "",
      });
      respond(true, { ok: true }, undefined);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(error)));
    }
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
      const rawConfig =
        isPlainRecord(params) && typeof params.rawConfig === "string"
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
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(error)));
    }
  },
  "dashboard.teams.runs": async ({ params, respond, context }) => {
    if (!assertValidParams(params, validateConfigGetParams, "dashboard.teams.runs", respond)) {
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
