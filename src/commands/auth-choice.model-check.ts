import { ensureAuthProfileStore, listProfilesForProvider } from "../agents/auth-profiles.js";
import { hasUsableCustomProviderApiKey, resolveEnvApiKey } from "../agents/model-auth.js";
import { loadModelCatalog } from "../agents/model-catalog.js";
import { resolveDefaultModelForAgent } from "../agents/model-selection.js";
import { normalizeProviderIdForAuth } from "../agents/provider-id.js";
import type { MaumauConfig } from "../config/config.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { buildProviderAuthRecoveryHint } from "./provider-auth-guidance.js";

function hasConfiguredAuthProfile(config: MaumauConfig, provider: string): boolean {
  const normalizedProvider = normalizeProviderIdForAuth(provider);
  return Object.values(config.auth?.profiles ?? {}).some(
    (profile) => normalizeProviderIdForAuth(profile.provider) === normalizedProvider,
  );
}

export async function warnIfModelConfigLooksOff(
  config: MaumauConfig,
  prompter: WizardPrompter,
  options?: { agentId?: string; agentDir?: string },
) {
  const ref = resolveDefaultModelForAgent({
    cfg: config,
    agentId: options?.agentId,
  });
  const warnings: string[] = [];
  const catalog = await loadModelCatalog({
    config,
    useCache: false,
  });
  if (catalog.length > 0) {
    const known = catalog.some(
      (entry) => entry.provider === ref.provider && entry.id === ref.model,
    );
    if (!known) {
      warnings.push(
        `Model not found: ${ref.provider}/${ref.model}. Update agents.defaults.model or run /models list.`,
      );
    }
  }

  const store = ensureAuthProfileStore(options?.agentDir);
  const hasProfile =
    listProfilesForProvider(store, ref.provider).length > 0 ||
    hasConfiguredAuthProfile(config, ref.provider);
  const envKey = resolveEnvApiKey(ref.provider);
  const hasCustomKey = hasUsableCustomProviderApiKey(config, ref.provider);
  if (!hasProfile && !envKey && !hasCustomKey) {
    warnings.push(
      `No auth configured for provider "${ref.provider}". The agent may fail until credentials are added. ${buildProviderAuthRecoveryHint(
        {
          provider: ref.provider,
          config,
          includeEnvVar: true,
        },
      )}`,
    );
  }

  if (warnings.length > 0) {
    await prompter.note(warnings.join("\n"), "Model check");
  }
}
