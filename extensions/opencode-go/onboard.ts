import { OPENCODE_GO_DEFAULT_MODEL_REF } from "maumau/plugin-sdk/provider-models";
import {
  applyAgentDefaultModelPrimary,
  withAgentModelAliases,
  type MaumauConfig,
} from "maumau/plugin-sdk/provider-onboard";

export { OPENCODE_GO_DEFAULT_MODEL_REF };

const OPENCODE_GO_ALIAS_DEFAULTS: Record<string, string> = {
  "opencode-go/kimi-k2.5": "Kimi",
  "opencode-go/glm-5": "GLM",
  "opencode-go/minimax-m2.5": "MiniMax",
};

export function applyOpencodeGoProviderConfig(cfg: MaumauConfig): MaumauConfig {
  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        models: withAgentModelAliases(
          cfg.agents?.defaults?.models,
          Object.entries(OPENCODE_GO_ALIAS_DEFAULTS).map(([modelRef, alias]) => ({
            modelRef,
            alias,
          })),
        ),
      },
    },
  };
}

export function applyOpencodeGoConfig(cfg: MaumauConfig): MaumauConfig {
  return applyAgentDefaultModelPrimary(
    applyOpencodeGoProviderConfig(cfg),
    OPENCODE_GO_DEFAULT_MODEL_REF,
  );
}
