import { Type } from "@sinclair/typebox";
import type { MaumauConfig } from "../../config/config.js";
import { stringEnum } from "../schema/typebox.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readNumberParam, readStringParam } from "./common.js";
import { callGatewayTool, readGatewayCallOptions } from "./gateway.js";

const BUSINESS_PROJECT_ACTIONS = ["apply_blueprint"] as const;

const BusinessProjectsToolSchema = Type.Object({
  action: stringEnum(BUSINESS_PROJECT_ACTIONS),
  businessId: Type.Optional(Type.String()),
  projectId: Type.Optional(Type.String()),
  expectedVersion: Type.Optional(Type.Number()),
  gatewayUrl: Type.Optional(Type.String()),
  gatewayToken: Type.Optional(Type.String()),
  timeoutMs: Type.Optional(Type.Number()),
});

export function createBusinessProjectsTool(opts?: {
  agentSessionKey?: string;
  config?: MaumauConfig;
}): AnyAgentTool {
  void opts;
  return {
    label: "Business Projects",
    name: "business_projects",
    description:
      "Materialize an explicitly approved business project blueprint into a project team, project workspace, project binding, and optional AGENT_APPS entry.",
    parameters: BusinessProjectsToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });
      const gatewayOpts = readGatewayCallOptions(params);
      if (action !== "apply_blueprint") {
        throw new Error(`Unsupported action: ${action}`);
      }
      const businessId = readStringParam(params, "businessId", { required: true });
      const projectId = readStringParam(params, "projectId", { required: true });
      const expectedVersion = readNumberParam(params, "expectedVersion", {
        required: true,
        integer: true,
      });
      const result = await callGatewayTool("dashboard.projects.applyBlueprint", gatewayOpts, {
        businessId,
        projectId,
        expectedVersion,
      });
      return jsonResult({
        ok: true,
        result,
      });
    },
  };
}
