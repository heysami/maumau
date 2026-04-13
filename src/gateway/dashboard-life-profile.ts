import fs from "node:fs/promises";
import path from "node:path";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import {
  DEFAULT_BOOTSTRAP_FILENAME,
  DEFAULT_USER_FILENAME,
  isWorkspaceSetupCompleted,
} from "../agents/workspace.js";
import type { MaumauConfig } from "../config/types.maumau.js";
import {
  LIFE_IMPROVEMENT_DOMAIN_GROUPS,
  LIFE_IMPROVEMENT_ROLE_SPECS,
  LIFE_IMPROVEMENT_TEAM_ID,
  type LifeImprovementRoleSpec,
} from "../teams/life-improvement-preset.js";
import type {
  DashboardLifeProfileAgent,
  DashboardLifeProfileField,
  DashboardLifeProfileNeed,
  DashboardLifeProfileResult,
  DashboardLifeProfileStage,
  DashboardLifeProfileStatus,
} from "./dashboard-types.js";

type LifeProfileFieldSpec = {
  key: string;
  label: string;
  description: string;
  stage: DashboardLifeProfileStage;
  why: string;
};

const LIFE_PROFILE_FIELD_SPECS = [
  {
    key: "name",
    label: "Name",
    description: "The person's actual name.",
    stage: "foundational",
    why: "so notes, commitments, and history stay attached to the right person.",
  },
  {
    key: "preferred_name",
    label: "What to call them",
    description: "How they want to be addressed in conversation.",
    stage: "foundational",
    why: "so the role speaks to the user naturally and respectfully.",
  },
  {
    key: "pronouns",
    label: "Pronouns",
    description: "How to refer to them respectfully.",
    stage: "later",
    why: "so references to the user stay respectful and accurate.",
  },
  {
    key: "timezone",
    label: "Timezone",
    description: "Their local time zone for scheduling and check-ins.",
    stage: "foundational",
    why: "so routines, nudges, and reminders land at the right local time.",
  },
  {
    key: "notes",
    label: "Notes",
    description: "Sensitive preferences or context that do not fit elsewhere.",
    stage: "later",
    why: "so the role can honor known preferences, sensitivities, and edge cases.",
  },
  {
    key: "daily_weekly_rhythm",
    label: "Daily / weekly rhythm",
    description: "What a normal day and week actually look like.",
    stage: "foundational",
    why: "so recommendations fit the person's real rhythm instead of an idealized plan.",
  },
  {
    key: "current_priorities",
    label: "Current priorities",
    description: "What matters most right now.",
    stage: "foundational",
    why: "so the role pushes on the outcomes that matter most now.",
  },
  {
    key: "support_needs",
    label: "What they want more help with",
    description: "Where they actively want support or relief.",
    stage: "foundational",
    why: "so the role focuses on the help the user actually wants.",
  },
  {
    key: "energy_health_sleep",
    label: "Energy / health / sleep",
    description: "Current energy, health constraints, and sleep realities.",
    stage: "growth",
    why: "so the role can see strain, recovery needs, and physical limits.",
  },
  {
    key: "mood_stress",
    label: "Mood / stress",
    description: "How they are feeling emotionally and what is weighing on them.",
    stage: "growth",
    why: "so the role can adjust tone, intensity, and expectations.",
  },
  {
    key: "relationships_social",
    label: "Relationships / partner / social life",
    description: "Important relationship and social context around the user.",
    stage: "growth",
    why: "so advice reflects the people and social dynamics around the user.",
  },
  {
    key: "family_context",
    label: "Family / siblings / parents",
    description: "Family structure, obligations, and relevant dynamics.",
    stage: "later",
    why: "so family obligations and dynamics are not treated as invisible.",
  },
  {
    key: "work_purpose",
    label: "Work / school / purpose",
    description: "The shape of work, study, and motivating purpose.",
    stage: "foundational",
    why: "so the role can fit guidance around current demands and identity.",
  },
  {
    key: "home_routines",
    label: "Home / routines / organization",
    description: "How home life, routines, and organization currently work.",
    stage: "foundational",
    why: "so the role understands the environment where habits must actually happen.",
  },
  {
    key: "money_pressure",
    label: "Money / spending / pressure",
    description: "Financial pressure, constraints, and spending realities.",
    stage: "later",
    why: "so recommendations stay realistic about cost and pressure.",
  },
  {
    key: "creative_meaning",
    label: "Creative / spiritual / meaning",
    description: "Sources of creativity, meaning, faith, or inner fuel.",
    stage: "later",
    why: "so support can connect to meaning, expression, and deeper motivation.",
  },
  {
    key: "hobbies_interests",
    label: "Hobbies / interests",
    description: "What they enjoy, follow, or return to for energy.",
    stage: "growth",
    why: "so the role can build around interests that genuinely energize the user.",
  },
  {
    key: "exercise_movement",
    label: "Exercise / movement",
    description: "Current movement habits, exercise, and physical baseline.",
    stage: "growth",
    why: "so the role understands movement habits and current physical capacity.",
  },
] as const satisfies readonly LifeProfileFieldSpec[];

const LIFE_PROFILE_BASE_FIELDS = [
  "name",
  "preferred_name",
  "timezone",
  "daily_weekly_rhythm",
  "current_priorities",
  "support_needs",
  "work_purpose",
  "home_routines",
] as const;

const LIFE_PROFILE_FIELDS_BY_DOMAIN: Record<string, readonly string[]> = {
  self_identity: ["mood_stress", "creative_meaning", "hobbies_interests", "notes"],
  physical_health: ["energy_health_sleep", "exercise_movement", "mood_stress"],
  mental_emotional_health: [
    "energy_health_sleep",
    "mood_stress",
    "relationships_social",
    "creative_meaning",
  ],
  image_appearance: ["relationships_social", "hobbies_interests", "notes"],
  personal_branding: ["relationships_social", "work_purpose", "hobbies_interests", "notes"],
  communication_presence: ["relationships_social", "family_context", "notes"],
  relationships_social_life: ["relationships_social", "family_context", "mood_stress"],
  social_standing_influence: ["relationships_social", "work_purpose", "hobbies_interests"],
  personal_finance: ["money_pressure", "home_routines"],
  spiritual_meaning: ["creative_meaning", "mood_stress"],
  home_lifestyle: ["family_context", "money_pressure"],
  creative_life: ["creative_meaning", "hobbies_interests", "notes"],
  cross_domain_support: [
    "pronouns",
    "notes",
    "energy_health_sleep",
    "mood_stress",
    "relationships_social",
    "family_context",
    "money_pressure",
    "creative_meaning",
    "hobbies_interests",
    "exercise_movement",
  ],
};

const LIFE_PROFILE_DOMAIN_LABELS = new Map<string, string>([
  ["self_identity", "Self & Identity"],
  ...LIFE_IMPROVEMENT_DOMAIN_GROUPS.map((group) => [group.id, group.label] as const),
  ["cross_domain_support", "Cross-Domain Support Roles"],
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripFrontMatter(content: string): string {
  if (!content.startsWith("---")) {
    return content;
  }
  const closing = content.indexOf("\n---", 3);
  if (closing < 0) {
    return content;
  }
  return content.slice(closing + 4).replace(/^\s+/, "");
}

function normalizeMarkdownFieldValue(value: string | undefined): string | undefined {
  const normalized = value
    ?.split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return undefined;
  }
  const comparable = normalized.replace(/[_*`]/g, "").trim().toLowerCase();
  if (comparable === "(optional)" || comparable === "optional") {
    return undefined;
  }
  return normalized;
}

function isMarkdownFieldBoundary(line: string): boolean {
  const trimmed = line.trimStart();
  return /^-\s+\*\*/u.test(trimmed) || /^#{1,6}\s+/u.test(trimmed) || /^---\s*$/u.test(trimmed);
}

function readMarkdownField(content: string, label: string): string | undefined {
  const lines = stripFrontMatter(content).replace(/\r\n/g, "\n").split("\n");
  const pattern = new RegExp(`^-\\s+\\*\\*${escapeRegExp(label)}:\\*\\*(?:\\s*(.*))?$`, "u");
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index]?.match(pattern);
    if (!match) {
      continue;
    }
    const valueLines: string[] = [];
    if (match[1]) {
      valueLines.push(match[1]);
    }
    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const nextLine = lines[nextIndex] ?? "";
      if (isMarkdownFieldBoundary(nextLine)) {
        break;
      }
      valueLines.push(nextLine);
    }
    return normalizeMarkdownFieldValue(valueLines.join("\n"));
  }
  return undefined;
}

function statusForField(
  spec: LifeProfileFieldSpec,
  value: string | undefined,
): DashboardLifeProfileStatus {
  if (value) {
    return "recorded";
  }
  return spec.stage === "foundational" ? "missing" : "future";
}

function countByStatus<T extends { status: DashboardLifeProfileStatus }>(
  items: readonly T[],
  status: DashboardLifeProfileStatus,
): number {
  return items.filter((item) => item.status === status).length;
}

function resolveFieldKeysForRole(spec: LifeImprovementRoleSpec): string[] {
  return Array.from(
    new Set([...LIFE_PROFILE_BASE_FIELDS, ...(LIFE_PROFILE_FIELDS_BY_DOMAIN[spec.domainId] ?? [])]),
  );
}

function buildNeedWhy(spec: LifeImprovementRoleSpec, field: LifeProfileFieldSpec): string {
  const covers = spec.covers.charAt(0).toLowerCase() + spec.covers.slice(1);
  return `${spec.name} needs this ${field.why} It directly shapes ${covers}`;
}

async function readOptionalFile(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function isBootstrapPending(workspaceDir: string): Promise<boolean> {
  try {
    return !(await isWorkspaceSetupCompleted(workspaceDir));
  } catch {
    return (
      (await readOptionalFile(path.join(workspaceDir, DEFAULT_BOOTSTRAP_FILENAME))) !== undefined
    );
  }
}

export async function collectDashboardLifeProfile(params: {
  cfg: MaumauConfig;
  nowMs: number;
}): Promise<DashboardLifeProfileResult> {
  const defaultAgentId = resolveDefaultAgentId(params.cfg);
  const workspaceDir = resolveAgentWorkspaceDir(params.cfg, defaultAgentId);
  const userPath = path.join(workspaceDir, DEFAULT_USER_FILENAME);
  const userContent = await readOptionalFile(userPath);
  const sourceStatus = userContent !== undefined ? "loaded" : "missing";
  const bootstrapPending = await isBootstrapPending(workspaceDir);
  const teamConfigured =
    params.cfg.teams?.list?.some(
      (team) => team?.id?.trim().toLowerCase() === LIFE_IMPROVEMENT_TEAM_ID,
    ) ?? false;

  const fields: DashboardLifeProfileField[] = LIFE_PROFILE_FIELD_SPECS.map((spec) => {
    const value =
      userContent !== undefined ? readMarkdownField(userContent, spec.label) : undefined;
    return {
      key: spec.key,
      label: spec.label,
      description: spec.description,
      stage: spec.stage,
      status: statusForField(spec, value),
      value,
    };
  });
  const fieldByKey = new Map<string, DashboardLifeProfileField>(
    fields.map((field) => [field.key, field]),
  );
  const specByKey = new Map<string, LifeProfileFieldSpec>(
    LIFE_PROFILE_FIELD_SPECS.map((spec) => [spec.key, spec]),
  );

  const agents: DashboardLifeProfileAgent[] = LIFE_IMPROVEMENT_ROLE_SPECS.map((spec) => {
    const needs: DashboardLifeProfileNeed[] = resolveFieldKeysForRole(spec).flatMap((fieldKey) => {
      const field = fieldByKey.get(fieldKey);
      const fieldSpec = specByKey.get(fieldKey);
      if (!field || !fieldSpec) {
        return [];
      }
      return [
        {
          fieldKey: field.key,
          label: field.label,
          description: field.description,
          stage: field.stage,
          status: field.status,
          value: field.value,
          why: buildNeedWhy(spec, fieldSpec),
        } satisfies DashboardLifeProfileNeed,
      ];
    });

    return {
      agentId: spec.agentId,
      name: spec.name,
      role: spec.role,
      domainId: spec.domainId,
      domainLabel: LIFE_PROFILE_DOMAIN_LABELS.get(spec.domainId) ?? spec.domainId,
      covers: spec.covers,
      relatesTo: spec.relatesTo,
      recordedCount: countByStatus(needs, "recorded"),
      missingCount: countByStatus(needs, "missing"),
      futureCount: countByStatus(needs, "future"),
      needs,
    };
  });

  const allNeeds = agents.flatMap((agent) => agent.needs);
  return {
    generatedAtMs: params.nowMs,
    teamConfigured,
    bootstrapPending,
    sourceStatus,
    sourceLabel: `${defaultAgentId}/${DEFAULT_USER_FILENAME}`,
    recordedFieldCount: countByStatus(fields, "recorded"),
    missingFieldCount: countByStatus(fields, "missing"),
    futureFieldCount: countByStatus(fields, "future"),
    recordedNeedCount: countByStatus(allNeeds, "recorded"),
    missingNeedCount: countByStatus(allNeeds, "missing"),
    futureNeedCount: countByStatus(allNeeds, "future"),
    fields,
    agents,
  };
}
