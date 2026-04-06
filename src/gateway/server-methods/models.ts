import { ensureAuthProfileStore, hasUsableProfileForProvider } from "../../agents/auth-profiles.js";
import { DEFAULT_PROVIDER } from "../../agents/defaults.js";
import { resolveEnvApiKey } from "../../agents/model-auth-env.js";
import { buildAllowedModelSet } from "../../agents/model-selection.js";
import { loadConfig } from "../../config/config.js";
import { listImageGenerationProviders } from "../../image-generation/provider-registry.js";
import { resolveModelAuthChoiceGroups } from "../../wizard/model-auth.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateModelsImageGenerationProvidersParams,
  validateModelsListParams,
} from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

function hasNoParams(params: Record<string, unknown>): boolean {
  return Object.keys(params).length === 0;
}

function isImageGenerationProviderConfigured(params: {
  providerId: string;
  profileStore: ReturnType<typeof ensureAuthProfileStore>;
  env: NodeJS.ProcessEnv;
}): boolean {
  if (resolveEnvApiKey(params.providerId, params.env)?.apiKey) {
    return true;
  }
  return hasUsableProfileForProvider(params.profileStore, params.providerId, params.env);
}

function listImageGenerationProviderModels(provider: {
  defaultModel?: string;
  models?: string[];
}): string[] {
  const models: string[] = [];
  const add = (value: string | undefined) => {
    const trimmed = value?.trim();
    if (!trimmed || models.includes(trimmed)) {
      return;
    }
    models.push(trimmed);
  };
  add(provider.defaultModel);
  for (const model of provider.models ?? []) {
    add(model);
  }
  return models;
}

export const modelsHandlers: GatewayRequestHandlers = {
  "models.list": async ({ params, respond, context }) => {
    if (!validateModelsListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid models.list params: ${formatValidationErrors(validateModelsListParams.errors)}`,
        ),
      );
      return;
    }
    try {
      const catalog = await context.loadGatewayModelCatalog();
      const cfg = loadConfig();
      const { allowedCatalog } = buildAllowedModelSet({
        cfg,
        catalog,
        defaultProvider: DEFAULT_PROVIDER,
      });
      const models = allowedCatalog.length > 0 ? allowedCatalog : catalog;
      respond(true, { models }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
  "models.image-generation.providers": async ({ params, respond }) => {
    if (!validateModelsImageGenerationProvidersParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid models.image-generation.providers params: ${formatValidationErrors(validateModelsImageGenerationProvidersParams.errors)}`,
        ),
      );
      return;
    }
    try {
      const cfg = loadConfig();
      const profileStore = ensureAuthProfileStore(undefined, { allowKeychainPrompt: false });
      const providers = listImageGenerationProviders(cfg)
        .map((provider) => ({
          id: provider.id,
          ...(provider.label?.trim() ? { label: provider.label.trim() } : {}),
          ...(provider.defaultModel?.trim() ? { defaultModel: provider.defaultModel.trim() } : {}),
          models: listImageGenerationProviderModels(provider),
          configured: isImageGenerationProviderConfigured({
            providerId: provider.id,
            profileStore,
            env: process.env,
          }),
        }))
        .sort((lhs, rhs) => {
          const lhsLabel = lhs.label ?? lhs.id;
          const rhsLabel = rhs.label ?? rhs.id;
          const labelOrder = lhsLabel.localeCompare(rhsLabel, undefined, {
            sensitivity: "base",
          });
          if (labelOrder !== 0) {
            return labelOrder;
          }
          return lhs.id.localeCompare(rhs.id, undefined, { sensitivity: "base" });
        });
      respond(true, { providers }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
  "models.auth.choices": async ({ params, respond }) => {
    if (!hasNoParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "invalid models.auth.choices params: expected an empty object",
        ),
      );
      return;
    }
    try {
      const cfg = loadConfig();
      const groups = await resolveModelAuthChoiceGroups({
        config: cfg,
        workspaceDir: cfg.agents?.defaults?.workspace?.trim(),
        env: process.env,
      });
      respond(true, { groups }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
