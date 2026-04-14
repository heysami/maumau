import type { MaumauConfig } from "../config/config.js";
import { resolveManifestProviderAuthChoice } from "./provider-auth-choices.js";

const PREFERRED_PROVIDER_BY_AUTH_CHOICE: Partial<Record<string, string>> = {
  chutes: "chutes",
  "litellm-api-key": "litellm",
  "custom-api-key": "custom",
};

function normalizeLegacyAuthChoice(choice: string): string {
  if (choice === "oauth") {
    return "setup-token";
  }
  if (choice === "claude-cli") {
    return "setup-token";
  }
  if (choice === "codex-cli") {
    return "openai-codex";
  }
  return choice;
}

type PreferredAuthChoiceParams = {
  config?: MaumauConfig;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
};

type NormalizedAuthChoice = {
  normalized: string;
  rawChoices: string[];
};

function groupAuthChoicesByNormalizedChoice(choices: string[]): NormalizedAuthChoice[] {
  const rawChoicesByNormalized = new Map<string, string[]>();
  for (const rawChoice of choices) {
    const trimmed = rawChoice.trim();
    if (!trimmed) {
      continue;
    }
    const normalized = normalizeLegacyAuthChoice(trimmed);
    const existing = rawChoicesByNormalized.get(normalized);
    if (existing) {
      if (!existing.includes(trimmed)) {
        existing.push(trimmed);
      }
      continue;
    }
    rawChoicesByNormalized.set(normalized, [trimmed]);
  }
  return Array.from(rawChoicesByNormalized, ([normalized, rawChoices]) => ({
    normalized,
    rawChoices,
  }));
}

function setResolvedProviderId(
  resolvedByRawChoice: Map<string, string>,
  entry: NormalizedAuthChoice,
  providerId: string | undefined,
): void {
  const trimmed = providerId?.trim();
  if (!trimmed) {
    return;
  }
  for (const rawChoice of entry.rawChoices) {
    resolvedByRawChoice.set(rawChoice, trimmed);
  }
}

export async function resolvePreferredProvidersForAuthChoices(
  params: PreferredAuthChoiceParams & { choices: string[] },
): Promise<Map<string, string>> {
  const normalizedChoices = groupAuthChoicesByNormalizedChoice(params.choices);
  if (normalizedChoices.length === 0) {
    return new Map();
  }

  const resolvedByRawChoice = new Map<string, string>();
  const unresolvedChoices: NormalizedAuthChoice[] = [];

  for (const entry of normalizedChoices) {
    const manifestResolved = resolveManifestProviderAuthChoice(entry.normalized, params);
    if (manifestResolved) {
      setResolvedProviderId(resolvedByRawChoice, entry, manifestResolved.providerId);
      continue;
    }
    unresolvedChoices.push(entry);
  }

  if (unresolvedChoices.length === 0) {
    return resolvedByRawChoice;
  }

  const { resolveProviderPluginChoice, resolvePluginProviders } =
    await import("./provider-auth-choice.runtime.js");
  const providers = resolvePluginProviders({
    config: params.config,
    workspaceDir: params.workspaceDir,
    env: params.env,
    bundledProviderAllowlistCompat: true,
    bundledProviderVitestCompat: true,
  });

  for (const entry of unresolvedChoices) {
    const pluginResolved = resolveProviderPluginChoice({
      providers,
      choice: entry.normalized,
    });
    setResolvedProviderId(
      resolvedByRawChoice,
      entry,
      pluginResolved?.provider.id ?? PREFERRED_PROVIDER_BY_AUTH_CHOICE[entry.normalized],
    );
  }

  return resolvedByRawChoice;
}

export async function resolvePreferredProviderForAuthChoice(params: {
  choice: string;
  config?: MaumauConfig;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<string | undefined> {
  const choice = params.choice.trim();
  if (!choice) {
    return undefined;
  }
  return (
    await resolvePreferredProvidersForAuthChoices({
      ...params,
      choices: [choice],
    })
  ).get(choice);
}
