import { ensureAuthProfileStore, listProfilesForProvider } from "../agents/auth-profiles.js";
import { hasUsableCustomProviderApiKey, resolveEnvApiKey } from "../agents/model-auth.js";
import { loadModelCatalog } from "../agents/model-catalog.js";
import type { MaumauConfig } from "../config/config.js";
import { resolveAgentModelPrimaryValue } from "../config/model-input.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "./prompts.js";

function hasProviderAuth(
  provider: string,
  config: MaumauConfig,
  store: ReturnType<typeof ensureAuthProfileStore>,
): boolean {
  if (listProfilesForProvider(store, provider).length > 0) {
    return true;
  }
  if (resolveEnvApiKey(provider)) {
    return true;
  }
  if (hasUsableCustomProviderApiKey(config, provider)) {
    return true;
  }
  return false;
}

export async function ensureSetupDefaultModelSelected(params: {
  config: MaumauConfig;
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
  workspaceDir?: string;
}): Promise<MaumauConfig> {
  if (resolveAgentModelPrimaryValue(params.config.agents?.defaults?.model)) {
    return params.config;
  }

  const catalog = await loadModelCatalog({
    config: params.config,
    useCache: false,
  });
  if (catalog.length === 0) {
    return params.config;
  }

  const authStore = ensureAuthProfileStore(undefined, {
    allowKeychainPrompt: false,
  });
  const authedProviders = Array.from(
    new Set(
      catalog
        .map((entry) => entry.provider)
        .filter((provider) => hasProviderAuth(provider, params.config, authStore)),
    ),
  ).toSorted((a, b) => a.localeCompare(b));

  if (authedProviders.length === 0) {
    return params.config;
  }

  await params.prompter.note(
    authedProviders.length === 1
      ? [
          `Found existing auth for ${authedProviders[0]} but no saved default model.`,
          "Pick a model now so the dashboard uses that provider instead of the hardcoded fallback.",
        ].join("\n")
      : [
          "Found existing auth but no saved default model.",
          "Pick a model now so the dashboard does not fall back to an unconfigured provider.",
        ].join("\n"),
    "Default model",
  );

  const { applyPrimaryModel, promptDefaultModel } = await import("../commands/model-picker.js");
  const selected = await promptDefaultModel({
    config: params.config,
    prompter: params.prompter,
    allowKeep: false,
    ignoreAllowlist: true,
    includeProviderPluginSetups: true,
    preferredProvider: authedProviders.length === 1 ? authedProviders[0] : undefined,
    workspaceDir: params.workspaceDir,
    runtime: params.runtime,
    message: "Choose a default model",
  });

  let nextConfig = selected.config ?? params.config;
  if (selected.model) {
    nextConfig = applyPrimaryModel(nextConfig, selected.model);
  }
  return nextConfig;
}
