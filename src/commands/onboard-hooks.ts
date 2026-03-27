import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import { formatCliCommand } from "../cli/command-format.js";
import type { MaumauConfig } from "../config/config.js";
import { buildWorkspaceHookStatus } from "../hooks/hooks-status.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";

type HookOnboardingCopy = {
  title: string;
  hint: string;
  advanced?: boolean;
};

const HOOK_ONBOARDING_COPY: Record<string, HookOnboardingCopy> = {
  "session-memory": {
    title: "Save chat context for later",
    hint: "When you start fresh with /new or /reset, save the recent session so your agent can remember it later.",
  },
  "command-logger": {
    title: "Keep a local activity log",
    hint: "Save command activity to a local log file for debugging and audits.",
  },
  "boot-md": {
    title: "Run BOOT.md at startup",
    hint: "Advanced: automatically run BOOT.md whenever the gateway starts.",
    advanced: true,
  },
  "bootstrap-extra-files": {
    title: "Inject extra bootstrap files",
    hint: "Advanced: add extra files during workspace bootstrap using custom path patterns.",
    advanced: true,
  },
};

function onboardingCopyForHook(hook: { name: string; description: string }): HookOnboardingCopy {
  return (
    HOOK_ONBOARDING_COPY[hook.name] ?? {
      title: hook.name,
      hint: hook.description,
      advanced: true,
    }
  );
}

export async function setupInternalHooks(
  cfg: MaumauConfig,
  runtime: RuntimeEnv,
  prompter: WizardPrompter,
): Promise<MaumauConfig> {
  await prompter.note(
    [
      "These are optional automations.",
      "Maumau works without them.",
      "For most people, the useful one is saving chat context for later.",
      "",
      "Advanced automation options can be enabled later.",
      "Learn more: https://docs.maumau.ai/automation/hooks",
    ].join("\n"),
    "Optional automations",
  );

  // Discover available hooks using the hook discovery system
  const workspaceDir = resolveAgentWorkspaceDir(cfg, resolveDefaultAgentId(cfg));
  const report = buildWorkspaceHookStatus(workspaceDir, { config: cfg });

  // Keep first-run onboarding beginner-friendly by hiding advanced hooks here.
  const eligibleHooks = report.hooks.filter((h) => h.loadable);
  const onboardingHooks = eligibleHooks.filter((hook) => !onboardingCopyForHook(hook).advanced);

  if (onboardingHooks.length === 0) {
    await prompter.note(
      "No beginner-friendly automations are available right now. You can enable advanced ones later.",
      "No Optional Automations",
    );
    return cfg;
  }

  const toEnable = await prompter.multiselect({
    message: "Choose optional automations",
    options: [
      { value: "__skip__", label: "Skip for now" },
      ...onboardingHooks.map((hook) => {
        const copy = onboardingCopyForHook(hook);
        return {
          value: hook.name,
          label: `${hook.emoji ?? "🔗"} ${copy.title}`,
          hint: copy.hint,
        };
      }),
    ],
  });

  const selected = toEnable.filter((name) => name !== "__skip__");
  if (selected.length === 0) {
    return cfg;
  }

  // Enable selected hooks using the new entries config format
  const entries = { ...cfg.hooks?.internal?.entries };
  for (const name of selected) {
    entries[name] = { enabled: true };
  }

  const next: MaumauConfig = {
    ...cfg,
    hooks: {
      ...cfg.hooks,
      internal: {
        enabled: true,
        entries,
      },
    },
  };

  await prompter.note(
    [
      `Enabled ${selected.length} automation${selected.length > 1 ? "s" : ""}: ${selected
        .map((name) => onboardingCopyForHook({ name, description: name }).title)
        .join(", ")}`,
      "",
      "You can change these later with:",
      `  ${formatCliCommand("maumau hooks list")}`,
      `  ${formatCliCommand("maumau hooks enable <name>")}`,
      `  ${formatCliCommand("maumau hooks disable <name>")}`,
    ].join("\n"),
    "Automations enabled",
  );

  return next;
}
