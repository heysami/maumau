import { ensureAuthProfileStore } from "../agents/auth-profiles.js";
import { resolveDefaultAgentWorkspaceDir } from "../agents/workspace.js";
import { buildAuthChoiceGroups } from "../commands/auth-choice-options.js";
import { readConfigFileSnapshot, writeConfigFile, type MaumauConfig } from "../config/config.js";
import { resolveAgentModelPrimaryValue } from "../config/model-input.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "./prompts.js";

export type ModelAuthChoiceOption = {
  value: string;
  label: string;
  hint?: string;
  providerId?: string;
};

export type ModelAuthChoiceGroup = {
  value: string;
  label: string;
  hint?: string;
  options: ModelAuthChoiceOption[];
};

async function resolveProviderIdForChoice(params: {
  choice: string;
  config?: MaumauConfig;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<string | undefined> {
  const { resolvePreferredProviderForAuthChoice } = await import("../commands/auth-choice.js");
  const providerId = await resolvePreferredProviderForAuthChoice({
    choice: params.choice,
    config: params.config,
    workspaceDir: params.workspaceDir,
    env: params.env,
  });
  const trimmed = providerId?.trim();
  return trimmed ? trimmed : undefined;
}

export async function resolveModelAuthChoiceGroups(params?: {
  config?: MaumauConfig;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<ModelAuthChoiceGroup[]> {
  const groups = buildAuthChoiceGroups({
    store: ensureAuthProfileStore(undefined, {
      allowKeychainPrompt: false,
    }),
    includeSkip: false,
    embedded: true,
    includeRuntimeFallbackProviders: true,
    config: params?.config,
    workspaceDir: params?.workspaceDir,
    env: params?.env,
  }).groups.filter((group) => group.options.length > 0);

  return await Promise.all(
    groups.map(async (group) => ({
      value: group.value,
      label: group.label,
      ...(group.hint ? { hint: group.hint } : {}),
      options: await Promise.all(
        group.options.map(async (option) => {
          const providerId = await resolveProviderIdForChoice({
            choice: option.value,
            config: params?.config,
            workspaceDir: params?.workspaceDir,
            env: params?.env,
          });
          return {
            value: option.value,
            label: option.label,
            ...(option.hint ? { hint: option.hint } : {}),
            ...(providerId ? { providerId } : {}),
          };
        }),
      ),
    })),
  );
}

async function resolveRequestedModelAuthChoice(params: {
  requestedChoice?: string;
  config: MaumauConfig;
  workspaceDir: string;
  env?: NodeJS.ProcessEnv;
}): Promise<string | undefined> {
  const requestedChoice = params.requestedChoice?.trim();
  if (!requestedChoice) {
    return undefined;
  }
  const groups = await resolveModelAuthChoiceGroups({
    config: params.config,
    workspaceDir: params.workspaceDir,
    env: params.env,
  });
  const exists = groups.some((group) =>
    group.options.some((option) => option.value === requestedChoice),
  );
  return exists ? requestedChoice : undefined;
}

export async function runModelAuthWizard(
  opts: {
    authChoice?: string;
  },
  runtime: RuntimeEnv,
  prompter: WizardPrompter,
): Promise<void> {
  const [
    { applyAuthChoice, resolvePreferredProviderForAuthChoice, warnIfModelConfigLooksOff },
    { applyPrimaryModel, promptDefaultModel },
  ] = await Promise.all([
    import("../commands/auth-choice.js"),
    import("../commands/model-picker.js"),
  ]);
  const snapshot = await readConfigFileSnapshot();
  if (snapshot.exists && !snapshot.valid) {
    throw new Error("Config is invalid. Fix it in Settings -> Config, then try again.");
  }

  let nextConfig: MaumauConfig = snapshot.valid ? snapshot.config : {};
  const workspaceDir =
    nextConfig.agents?.defaults?.workspace?.trim() || resolveDefaultAgentWorkspaceDir();

  const requestedChoice = await resolveRequestedModelAuthChoice({
    requestedChoice: opts.authChoice,
    config: nextConfig,
    workspaceDir,
    env: process.env,
  });
  const authChoice = requestedChoice
    ? requestedChoice
    : await (
        await import("../commands/auth-choice-prompt.js")
      ).promptAuthChoiceGrouped({
        prompter,
        store: ensureAuthProfileStore(undefined, {
          allowKeychainPrompt: false,
        }),
        includeSkip: false,
        embedded: true,
        includeRuntimeFallbackProviders: true,
        config: nextConfig,
        workspaceDir,
      });

  if (authChoice === "custom-api-key") {
    const { promptCustomApiConfig } = await import("../commands/onboard-custom.js");
    const customResult = await promptCustomApiConfig({
      prompter,
      runtime,
      config: nextConfig,
    });
    nextConfig = customResult.config;
  } else {
    const authResult = await applyAuthChoice({
      authChoice,
      config: nextConfig,
      prompter,
      runtime,
      setDefaultModel: true,
    });
    nextConfig = authResult.config;

    if (authResult.agentModelOverride) {
      nextConfig = applyPrimaryModel(nextConfig, authResult.agentModelOverride);
    }
  }

  const hasConfiguredDefaultModel = Boolean(
    resolveAgentModelPrimaryValue(nextConfig.agents?.defaults?.model),
  );
  const shouldPromptModelSelection =
    authChoice === "ollama" || (authChoice !== "custom-api-key" && !hasConfiguredDefaultModel);
  if (shouldPromptModelSelection) {
    const preferredProvider = await resolvePreferredProviderForAuthChoice({
      choice: authChoice,
      config: nextConfig,
      workspaceDir,
      env: process.env,
    });
    const modelSelection = await promptDefaultModel({
      config: nextConfig,
      prompter,
      allowKeep: true,
      ignoreAllowlist: true,
      includeProviderPluginSetups: true,
      preferredProvider,
      workspaceDir,
      runtime,
    });
    if (modelSelection.config) {
      nextConfig = modelSelection.config;
    }
    if (modelSelection.model) {
      nextConfig = applyPrimaryModel(nextConfig, modelSelection.model);
    }
  }

  await warnIfModelConfigLooksOff(nextConfig, prompter);
  await writeConfigFile(nextConfig);
}
