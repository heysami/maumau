export type AutomationRunnerAccessMode = "disabled" | "owner" | "allowlist";

export type AutomationRunnerPluginConfig = {
  enabled: boolean;
  accessPolicy: {
    mode: AutomationRunnerAccessMode;
    allowFrom: string[];
  };
  requireApproval: boolean;
};

function uniqueTrimmed(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value) {
      continue;
    }
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }
  return result;
}

export function resolveAutomationRunnerConfig(value: unknown): AutomationRunnerPluginConfig {
  const root =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const accessPolicy =
    root.accessPolicy && typeof root.accessPolicy === "object" && !Array.isArray(root.accessPolicy)
      ? (root.accessPolicy as Record<string, unknown>)
      : {};
  const mode =
    accessPolicy.mode === "disabled" ||
    accessPolicy.mode === "owner" ||
    accessPolicy.mode === "allowlist"
      ? accessPolicy.mode
      : "owner";
  const allowFrom = Array.isArray(accessPolicy.allowFrom)
    ? uniqueTrimmed(
        accessPolicy.allowFrom.filter((entry): entry is string => typeof entry === "string"),
      )
    : [];

  return {
    enabled: root.enabled === true,
    accessPolicy: {
      mode,
      allowFrom,
    },
    requireApproval: root.requireApproval !== false,
  };
}
