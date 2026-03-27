import { installSkill } from "../agents/skills-install.js";
import { buildWorkspaceSkillStatus } from "../agents/skills-status.js";
import { formatCliCommand } from "../cli/command-format.js";
import type { MaumauConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import { normalizeSecretInput } from "../utils/normalize-secret-input.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { detectBinary, resolveNodeManagerOptions } from "./onboard-helpers.js";

const DEFAULT_FIRST_RUN_SKILLS = new Set([
  "nano-pdf",
  "openai-whisper",
  "skill-creator",
  "summarize",
]);

function summarizeInstallFailure(message: string): string | undefined {
  const cleaned = message.replace(/^Install failed(?:\s*\([^)]*\))?\s*:?\s*/i, "").trim();
  if (!cleaned) {
    return undefined;
  }
  const maxLen = 140;
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 1)}…` : cleaned;
}

function formatSkillHint(skill: {
  description?: string;
  install: Array<{ label: string }>;
}): string {
  const desc = skill.description?.trim();
  const installLabel = skill.install[0]?.label?.trim();
  const combined = desc && installLabel ? `${desc} — ${installLabel}` : desc || installLabel;
  if (!combined) {
    return "install";
  }
  const maxLen = 90;
  return combined.length > maxLen ? `${combined.slice(0, maxLen - 1)}…` : combined;
}

function formatOptionalSkillQuestion(skill: {
  name: string;
  description?: string;
  primaryEnv: string;
}): string {
  const desc = skill.description?.trim();
  if (!desc) {
    return `Set up optional skill "${skill.name}" now? This extra integration is not required. It needs ${skill.primaryEnv}.`;
  }
  return `Set up optional skill "${skill.name}" now? ${desc} This extra integration is not required. It needs ${skill.primaryEnv}.`;
}

function formatOptionalSkillKeyPrompt(skill: {
  name: string;
  description?: string;
  primaryEnv: string;
}): string {
  const desc = skill.description?.trim();
  if (!desc) {
    return `Enter ${skill.primaryEnv} for optional skill "${skill.name}"`;
  }
  return `Enter ${skill.primaryEnv} for optional skill "${skill.name}" (${desc})`;
}

function defaultSkillInstallSelections(skills: Array<{ name: string }>): string[] {
  return skills
    .map((skill) => skill.name)
    .filter((name) => DEFAULT_FIRST_RUN_SKILLS.has(name))
    .toSorted((left, right) => left.localeCompare(right));
}

function upsertSkillEntry(
  cfg: MaumauConfig,
  skillKey: string,
  patch: { apiKey?: string },
): MaumauConfig {
  const entries = { ...cfg.skills?.entries };
  const existing = (entries[skillKey] as { apiKey?: string } | undefined) ?? {};
  entries[skillKey] = { ...existing, ...patch };
  return {
    ...cfg,
    skills: {
      ...cfg.skills,
      entries,
    },
  };
}

export async function setupSkills(
  cfg: MaumauConfig,
  workspaceDir: string,
  runtime: RuntimeEnv,
  prompter: WizardPrompter,
): Promise<MaumauConfig> {
  const report = buildWorkspaceSkillStatus(workspaceDir, { config: cfg });
  const eligible = report.skills.filter((s) => s.eligible);
  const unsupportedOs = report.skills.filter(
    (s) => !s.disabled && !s.blockedByAllowlist && s.missing.os.length > 0,
  );
  const missing = report.skills.filter(
    (s) => !s.eligible && !s.disabled && !s.blockedByAllowlist && s.missing.os.length === 0,
  );
  const blocked = report.skills.filter((s) => s.blockedByAllowlist);

  await prompter.note(
    [
      "Optional skills are extra tools and integrations. Maumau works without them.",
      `Eligible: ${eligible.length}`,
      `Missing requirements: ${missing.length}`,
      `Unsupported on this OS: ${unsupportedOs.length}`,
      `Blocked by allowlist: ${blocked.length}`,
    ].join("\n"),
    "Skills status",
  );

  const shouldConfigure = await prompter.confirm({
    message: "Configure skills now? (recommended)",
    initialValue: true,
  });
  if (!shouldConfigure) {
    return cfg;
  }

  const installable = missing.filter(
    (skill) => skill.install.length > 0 && skill.missing.bins.length > 0,
  );
  let next: MaumauConfig = cfg;
  if (installable.length > 0) {
    const toInstall = await prompter.multiselect({
      message: "Install missing skill dependencies",
      initialValues: defaultSkillInstallSelections(installable),
      options: [
        {
          value: "__skip__",
          label: "Skip for now",
          hint: "Continue without installing dependencies",
        },
        ...installable.map((skill) => ({
          value: skill.name,
          label: `${skill.emoji ?? "🧩"} ${skill.name}`,
          hint: formatSkillHint(skill),
        })),
      ],
    });

    const selected = toInstall.filter((name) => name !== "__skip__");

    const selectedSkills = selected
      .map((name) => installable.find((s) => s.name === name))
      .filter((item): item is (typeof installable)[number] => Boolean(item));

    const needsBrewPrompt =
      process.platform !== "win32" &&
      selectedSkills.some((skill) => skill.install.some((option) => option.kind === "brew")) &&
      !(await detectBinary("brew"));

    if (needsBrewPrompt) {
      await prompter.note(
        [
          "Many skill dependencies are shipped via Homebrew.",
          "Without brew, you'll need to build from source or download releases manually.",
        ].join("\n"),
        "Homebrew recommended",
      );
      const showBrewInstall = await prompter.confirm({
        message: "Show Homebrew install command?",
        initialValue: true,
      });
      if (showBrewInstall) {
        await prompter.note(
          [
            "Run:",
            '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
          ].join("\n"),
          "Homebrew install",
        );
      }
    }

    const needsNodeManagerPrompt = selectedSkills.some((skill) =>
      skill.install.some((option) => option.kind === "node"),
    );
    if (needsNodeManagerPrompt) {
      const nodeManager = (await prompter.select({
        message: "Preferred node manager for skill installs",
        options: resolveNodeManagerOptions(),
      })) as "npm" | "pnpm" | "bun";
      next = {
        ...next,
        skills: {
          ...next.skills,
          install: {
            ...next.skills?.install,
            nodeManager,
          },
        },
      };
    }

    for (const name of selected) {
      const target = installable.find((s) => s.name === name);
      if (!target || target.install.length === 0) {
        continue;
      }
      const installId = target.install[0]?.id;
      if (!installId) {
        continue;
      }
      const spin = prompter.progress(`Installing ${name}…`);
      const result = await installSkill({
        workspaceDir,
        skillName: target.name,
        installId,
        config: next,
      });
      const warnings = result.warnings ?? [];
      if (result.ok) {
        spin.stop(warnings.length > 0 ? `Installed ${name} (with warnings)` : `Installed ${name}`);
        for (const warning of warnings) {
          runtime.log(warning);
        }
        continue;
      }
      const code = result.code == null ? "" : ` (exit ${result.code})`;
      const detail = summarizeInstallFailure(result.message);
      spin.stop(`Install failed: ${name}${code}${detail ? ` — ${detail}` : ""}`);
      for (const warning of warnings) {
        runtime.log(warning);
      }
      if (result.stderr) {
        runtime.log(result.stderr.trim());
      } else if (result.stdout) {
        runtime.log(result.stdout.trim());
      }
      runtime.log(
        `Tip: run \`${formatCliCommand("maumau doctor")}\` to review skills + requirements.`,
      );
      runtime.log("Docs: https://docs.maumau.ai/skills");
    }
  }

  for (const skill of missing) {
    if (!skill.primaryEnv || skill.missing.env.length === 0) {
      continue;
    }
    const wantsKey = await prompter.confirm({
      message: formatOptionalSkillQuestion({
        name: skill.name,
        description: skill.description,
        primaryEnv: skill.primaryEnv,
      }),
      initialValue: false,
    });
    if (!wantsKey) {
      continue;
    }
    const apiKey = String(
      await prompter.text({
        message: formatOptionalSkillKeyPrompt({
          name: skill.name,
          description: skill.description,
          primaryEnv: skill.primaryEnv,
        }),
        validate: (value) => (value?.trim() ? undefined : "Required"),
      }),
    );
    next = upsertSkillEntry(next, skill.skillKey, { apiKey: normalizeSecretInput(apiKey) });
  }

  return next;
}
