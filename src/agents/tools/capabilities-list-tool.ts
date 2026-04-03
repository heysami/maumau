import { Type } from "@sinclair/typebox";
import { loadConfig, type MaumauConfig } from "../../config/config.js";
import { listSessionCapabilities } from "../capabilities.js";
import type { GatewayMessageChannel } from "../../utils/message-channel.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult } from "./common.js";

const CapabilitiesListToolSchema = Type.Object({});

export function createCapabilitiesListTool(opts?: {
  config?: MaumauConfig;
  agentSessionKey?: string;
  agentChannel?: GatewayMessageChannel;
  senderIsOwner?: boolean;
  senderName?: string | null;
  senderUsername?: string | null;
  requesterTailscaleLogin?: string | null;
  agentGroupId?: string | null;
  agentGroupChannel?: string | null;
  agentGroupSpace?: string | null;
}): AnyAgentTool {
  return {
    label: "Capabilities",
    name: "capabilities_list",
    description: "List truthful readiness for tools, teams, browser lanes, desktop fallback, and preview delivery.",
    parameters: CapabilitiesListToolSchema,
    execute: async () => {
      const cfg = opts?.config ?? loadConfig();
      const capabilities = await listSessionCapabilities({
        config: cfg,
        agentSessionKey: opts?.agentSessionKey,
        senderIsOwner: opts?.senderIsOwner,
        senderName: opts?.senderName,
        senderUsername: opts?.senderUsername,
        requesterTailscaleLogin: opts?.requesterTailscaleLogin,
        messageChannel: opts?.agentChannel,
        groupId: opts?.agentGroupId,
        groupChannel: opts?.agentGroupChannel,
        groupSpace: opts?.agentGroupSpace,
      });
      return jsonResult({ capabilities });
    },
  };
}
