import type { MaumauConfig } from "../config/config.js";
import {
  DEFAULT_SECRET_PROVIDER_ALIAS,
  type SecretInput,
  type SecretRef,
  hasConfiguredSecretInput,
  normalizeSecretInputString,
} from "../config/types.secrets.js";
import {
  listBundledWebSearchProviders,
  resolveBundledWebSearchPluginId,
} from "../plugins/bundled-web-search.js";
import { enablePluginInConfig } from "../plugins/enable.js";
import type { PluginWebSearchProviderEntry } from "../plugins/types.js";
import { resolvePluginWebSearchProviders } from "../plugins/web-search-providers.runtime.js";
import { sortWebSearchProviders } from "../plugins/web-search-providers.shared.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import type { SecretInputMode } from "./onboard-types.js";
import {
  buildEmbeddedSearchProviderNote,
  resolveEmbeddedSearchProviderHint,
  sortEmbeddedSearchProviders,
} from "./onboarding-choice-guides.js";

export type SearchProvider = NonNullable<
  NonNullable<NonNullable<NonNullable<MaumauConfig["tools"]>["web"]>["search"]>["provider"]
>;
type SearchConfig = NonNullable<NonNullable<NonNullable<MaumauConfig["tools"]>["web"]>["search"]>;
type MutableSearchConfig = SearchConfig & Record<string, unknown>;

function resolveSearchProviderCredentialLabel(
  entry: Pick<PluginWebSearchProviderEntry, "label" | "credentialLabel" | "requiresCredential">,
): string {
  if (entry.requiresCredential === false) {
    return `${entry.label} setup`;
  }
  return entry.credentialLabel?.trim() || `${entry.label} API key`;
}

export const SEARCH_PROVIDER_OPTIONS: readonly PluginWebSearchProviderEntry[] =
  resolvePluginWebSearchProviders({
    bundledAllowlistCompat: true,
  });

function canRepairBundledProviderSelection(
  config: MaumauConfig,
  provider: Pick<PluginWebSearchProviderEntry, "id" | "pluginId">,
): boolean {
  const pluginId = provider.pluginId ?? resolveBundledWebSearchPluginId(provider.id);
  if (!pluginId) {
    return false;
  }
  if (config.plugins?.enabled === false) {
    return false;
  }
  return !config.plugins?.deny?.includes(pluginId);
}

export function resolveSearchProviderOptions(
  config?: MaumauConfig,
): readonly PluginWebSearchProviderEntry[] {
  if (!config) {
    return SEARCH_PROVIDER_OPTIONS;
  }

  const merged = new Map<string, PluginWebSearchProviderEntry>(
    resolvePluginWebSearchProviders({
      config,
      bundledAllowlistCompat: true,
      env: process.env,
    }).map((entry) => [entry.id, entry]),
  );

  for (const entry of listBundledWebSearchProviders()) {
    if (merged.has(entry.id) || !canRepairBundledProviderSelection(config, entry)) {
      continue;
    }
    merged.set(entry.id, entry);
  }

  return sortWebSearchProviders([...merged.values()]);
}

function resolveSearchProviderEntry(
  config: MaumauConfig,
  provider: SearchProvider,
): PluginWebSearchProviderEntry | undefined {
  return resolveSearchProviderOptions(config).find((entry) => entry.id === provider);
}

export function hasKeyInEnv(entry: Pick<PluginWebSearchProviderEntry, "envVars">): boolean {
  return entry.envVars.some((k) => Boolean(process.env[k]?.trim()));
}

function providerNeedsCredential(
  entry: Pick<PluginWebSearchProviderEntry, "requiresCredential">,
): boolean {
  return entry.requiresCredential !== false;
}

function providerIsReady(
  config: MaumauConfig,
  entry: Pick<PluginWebSearchProviderEntry, "id" | "envVars" | "requiresCredential">,
): boolean {
  if (!providerNeedsCredential(entry)) {
    return true;
  }
  return hasExistingKey(config, entry.id) || hasKeyInEnv(entry);
}

function rawKeyValue(config: MaumauConfig, provider: SearchProvider): unknown {
  const search = config.tools?.web?.search;
  const entry = resolveSearchProviderEntry(config, provider);
  return (
    entry?.getConfiguredCredentialValue?.(config) ??
    entry?.getCredentialValue(search as Record<string, unknown> | undefined)
  );
}

/** Returns the plaintext key string, or undefined for SecretRefs/missing. */
export function resolveExistingKey(
  config: MaumauConfig,
  provider: SearchProvider,
): string | undefined {
  return normalizeSecretInputString(rawKeyValue(config, provider));
}

/** Returns true if a key is configured (plaintext string or SecretRef). */
export function hasExistingKey(config: MaumauConfig, provider: SearchProvider): boolean {
  return hasConfiguredSecretInput(rawKeyValue(config, provider));
}

/** Build an env-backed SecretRef for a search provider. */
function buildSearchEnvRef(config: MaumauConfig, provider: SearchProvider): SecretRef {
  const entry =
    resolveSearchProviderEntry(config, provider) ??
    SEARCH_PROVIDER_OPTIONS.find((candidate) => candidate.id === provider) ??
    listBundledWebSearchProviders().find((candidate) => candidate.id === provider);
  const envVar = entry?.envVars.find((k) => Boolean(process.env[k]?.trim())) ?? entry?.envVars[0];
  if (!envVar) {
    throw new Error(
      `No env var mapping for search provider "${provider}" at ${entry?.credentialPath ?? "unknown path"} in secret-input-mode=ref.`,
    );
  }
  return { source: "env", provider: DEFAULT_SECRET_PROVIDER_ALIAS, id: envVar };
}

/** Resolve a plaintext key into the appropriate SecretInput based on mode. */
function resolveSearchSecretInput(
  config: MaumauConfig,
  provider: SearchProvider,
  key: string,
  secretInputMode?: SecretInputMode,
): SecretInput {
  const useSecretRefMode = secretInputMode === "ref"; // pragma: allowlist secret
  if (useSecretRefMode) {
    return buildSearchEnvRef(config, provider);
  }
  return key;
}

export function applySearchKey(
  config: MaumauConfig,
  provider: SearchProvider,
  key: SecretInput,
): MaumauConfig {
  const providerEntry = resolveSearchProviderEntry(config, provider);
  if (!providerEntry) {
    return config;
  }
  const search: MutableSearchConfig = { ...config.tools?.web?.search, provider, enabled: true };
  if (!providerEntry.setConfiguredCredentialValue) {
    providerEntry.setCredentialValue(search, key);
  }
  const nextBase: MaumauConfig = {
    ...config,
    tools: {
      ...config.tools,
      web: { ...config.tools?.web, search },
    },
  };
  const next = applySearchProviderSelectionConfig(nextBase, providerEntry);
  providerEntry.setConfiguredCredentialValue?.(next, key);
  return next;
}

function applySearchProviderSelectionConfig(
  config: MaumauConfig,
  providerEntry: Pick<PluginWebSearchProviderEntry, "pluginId" | "applySelectionConfig">,
): MaumauConfig {
  if (providerEntry.applySelectionConfig) {
    return providerEntry.applySelectionConfig(config);
  }
  if (providerEntry.pluginId) {
    return enablePluginInConfig(config, providerEntry.pluginId).config;
  }
  return config;
}

export function applySearchProviderSelection(
  config: MaumauConfig,
  provider: SearchProvider,
): MaumauConfig {
  const providerEntry = resolveSearchProviderEntry(config, provider);
  if (!providerEntry) {
    return config;
  }
  const search: MutableSearchConfig = {
    ...config.tools?.web?.search,
    provider,
    enabled: true,
  };
  const nextBase: MaumauConfig = {
    ...config,
    tools: {
      ...config.tools,
      web: {
        ...config.tools?.web,
        search,
      },
    },
  };
  return applySearchProviderSelectionConfig(nextBase, providerEntry);
}

function preserveDisabledState(original: MaumauConfig, result: MaumauConfig): MaumauConfig {
  if (original.tools?.web?.search?.enabled !== false) {
    return result;
  }

  const next: MaumauConfig = {
    ...result,
    tools: {
      ...result.tools,
      web: { ...result.tools?.web, search: { ...result.tools?.web?.search, enabled: false } },
    },
  };

  const provider = next.tools?.web?.search?.provider;
  if (typeof provider !== "string") {
    return next;
  }
  const providerEntry = resolveSearchProviderEntry(original, provider);
  if (!providerEntry?.pluginId) {
    return next;
  }

  const pluginId = providerEntry.pluginId;
  const originalPluginEntry = (
    original.plugins?.entries as Record<string, Record<string, unknown>> | undefined
  )?.[pluginId];
  const resultPluginEntry = (
    next.plugins?.entries as Record<string, Record<string, unknown>> | undefined
  )?.[pluginId];

  const nextPlugins = { ...next.plugins } as Record<string, unknown>;

  if (Array.isArray(original.plugins?.allow)) {
    nextPlugins.allow = [...original.plugins.allow];
  } else {
    delete nextPlugins.allow;
  }

  if (resultPluginEntry || originalPluginEntry) {
    const nextEntries = {
      ...(nextPlugins.entries as Record<string, Record<string, unknown>> | undefined),
    };
    const patchedEntry = { ...resultPluginEntry };
    if (typeof originalPluginEntry?.enabled === "boolean") {
      patchedEntry.enabled = originalPluginEntry.enabled;
    } else {
      delete patchedEntry.enabled;
    }
    nextEntries[pluginId] = patchedEntry;
    nextPlugins.entries = nextEntries;
  }

  return {
    ...next,
    plugins: nextPlugins as MaumauConfig["plugins"],
  };
}

export type SetupSearchOptions = {
  quickstartDefaults?: boolean;
  secretInputMode?: SecretInputMode;
  embedded?: boolean;
};

export async function setupSearch(
  config: MaumauConfig,
  _runtime: RuntimeEnv,
  prompter: WizardPrompter,
  opts?: SetupSearchOptions,
): Promise<MaumauConfig> {
  const providerOptions = opts?.embedded
    ? sortEmbeddedSearchProviders([...resolveSearchProviderOptions(config)])
    : resolveSearchProviderOptions(config);
  if (providerOptions.length === 0) {
    await prompter.note(
      [
        "No web search providers are currently available under this plugin policy.",
        "Enable plugins or remove deny rules, then run setup again.",
        "Docs: https://docs.maumau.ai/tools/web",
      ].join("\n"),
      "Web search",
    );
    return config;
  }

  await prompter.note(
    [
      "Web search lets your agent look things up online.",
      "Choose a provider. Some providers need an API key, and some work key-free.",
      "Docs: https://docs.maumau.ai/tools/web",
    ].join("\n"),
    "Web search",
  );

  const existingProvider = config.tools?.web?.search?.provider;

  const options = providerOptions.map((entry) => {
    const baseHint = opts?.embedded ? resolveEmbeddedSearchProviderHint(entry) : entry.hint;
    const hint =
      entry.requiresCredential === false
        ? baseHint
        : providerIsReady(config, entry)
          ? `${baseHint} · configured`
          : baseHint;
    return { value: entry.id, label: entry.label, hint };
  });

  const defaultProvider: SearchProvider = (() => {
    if (existingProvider && providerOptions.some((entry) => entry.id === existingProvider)) {
      return existingProvider;
    }
    const detected = providerOptions.find((entry) => providerIsReady(config, entry));
    if (detected) {
      return detected.id;
    }
    return providerOptions[0].id;
  })();

  const choice = await prompter.select({
    message: "Search provider",
    options: [
      ...options,
      {
        value: "__skip__" as const,
        label: "Skip for now",
        hint: "Configure later with maumau configure --section web",
      },
    ],
    initialValue: defaultProvider,
  });

  if (choice === "__skip__") {
    return config;
  }

  const entry =
    resolveSearchProviderEntry(config, choice) ?? providerOptions.find((e) => e.id === choice);
  if (!entry) {
    return config;
  }

  if (opts?.embedded) {
    const note = buildEmbeddedSearchProviderNote(entry);
    await prompter.note(note.message, note.title);
  }

  const credentialLabel = resolveSearchProviderCredentialLabel(entry);
  const existingKey = resolveExistingKey(config, choice);
  const keyConfigured = hasExistingKey(config, choice);
  const envAvailable = hasKeyInEnv(entry);
  const needsCredential = providerNeedsCredential(entry);

  if (opts?.quickstartDefaults && (keyConfigured || envAvailable)) {
    const result = existingKey
      ? applySearchKey(config, choice, existingKey)
      : applySearchProviderSelection(config, choice);
    return preserveDisabledState(config, result);
  }

  if (!needsCredential) {
    if (!opts?.embedded) {
      await prompter.note(
        [
          `${entry.label} works without an API key.`,
          "Maumau will enable the plugin and use it as your web_search provider.",
          `Docs: ${entry.docsUrl ?? "https://docs.maumau.ai/tools/web"}`,
        ].join("\n"),
        "Web search",
      );
    }
    return preserveDisabledState(config, applySearchProviderSelection(config, choice));
  }

  const useSecretRefMode = opts?.secretInputMode === "ref"; // pragma: allowlist secret
  if (useSecretRefMode) {
    if (keyConfigured) {
      return preserveDisabledState(config, applySearchProviderSelection(config, choice));
    }
    const ref = buildSearchEnvRef(config, choice);
    await prompter.note(
      [
        "Secret references enabled — Maumau will store a reference instead of the API key.",
        `Env var: ${ref.id}${envAvailable ? " (detected)" : ""}.`,
        ...(envAvailable ? [] : [`Set ${ref.id} in the Gateway environment.`]),
        "Docs: https://docs.maumau.ai/tools/web",
      ].join("\n"),
      "Web search",
    );
    return applySearchKey(config, choice, ref);
  }

  const keyInput = await prompter.text({
    message: keyConfigured
      ? `${credentialLabel} (leave blank to keep current)`
      : envAvailable
        ? `${credentialLabel} (leave blank to use env var)`
        : credentialLabel,
    placeholder: keyConfigured ? "Leave blank to keep current" : entry.placeholder,
  });

  const key = keyInput?.trim() ?? "";
  if (key) {
    const secretInput = resolveSearchSecretInput(config, choice, key, opts?.secretInputMode);
    return applySearchKey(config, choice, secretInput);
  }

  if (existingKey) {
    return preserveDisabledState(config, applySearchKey(config, choice, existingKey));
  }

  if (keyConfigured || envAvailable) {
    return preserveDisabledState(config, applySearchProviderSelection(config, choice));
  }

  await prompter.note(
    [
      `No ${credentialLabel} stored — web_search won't work until a key is available.`,
      `Get your key at: ${entry.signupUrl}`,
      "Docs: https://docs.maumau.ai/tools/web",
    ].join("\n"),
    "Web search",
  );

  const search: SearchConfig = {
    ...config.tools?.web?.search,
    provider: choice,
  };
  return {
    ...config,
    tools: {
      ...config.tools,
      web: {
        ...config.tools?.web,
        search,
      },
    },
  };
}
