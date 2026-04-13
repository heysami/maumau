import type { AgentConfig } from "../config/types.agents.js";
import type { MaumauConfig } from "../config/types.maumau.js";
import type {
  TeamConfig,
  TeamCrossTeamLinkConfig,
  TeamWorkflowConfig,
} from "../config/types.teams.js";
import { DEFAULT_AGENT_ID, normalizeAgentId } from "../routing/session-key.js";
import {
  BUSINESS_DEVELOPMENT_TEAM_ID,
  BUSINESS_DEVELOPMENT_TEAM_MANAGER_AGENT_ID,
  BUSINESS_DEVELOPMENT_TEAM_PRESET_VERSION,
  createBusinessDevelopmentTeamAgents,
  createBusinessDevelopmentTeamConfig,
} from "./business-development-preset.js";
import {
  createLifeImprovementTeamAgents,
  createLifeImprovementTeamConfig,
  LIFE_IMPROVEMENT_FINANCIAL_COACH_AGENT_ID,
  LIFE_IMPROVEMENT_TEAM_ID,
  LIFE_IMPROVEMENT_TEAM_MANAGER_AGENT_ID,
  LIFE_IMPROVEMENT_TEAM_PRESET_VERSION,
} from "./life-improvement-preset.js";
import { DEFAULT_TEAM_WORKFLOW_ID, listTeamWorkflows } from "./model.js";

export const STARTER_TEAM_ID = "vibe-coder";
export const DESIGN_STUDIO_TEAM_ID = "design-studio";
export const MAIN_ORCHESTRATION_TEAM_ID = DEFAULT_AGENT_ID;
export const MAIN_WORKER_AGENT_ID = "main-worker";
export const STARTER_TEAM_MANAGER_AGENT_ID = "vibe-coder-manager";
export const STARTER_TEAM_SYSTEM_ARCHITECT_AGENT_ID = "vibe-coder-system-architect";
export const STARTER_TEAM_DEVELOPER_AGENT_ID = "vibe-coder-developer";
export const STARTER_TEAM_UI_UX_DESIGNER_AGENT_ID = "vibe-coder-ui-ux-designer";
export const STARTER_TEAM_CONTENT_VISUAL_DESIGNER_AGENT_ID = "vibe-coder-content-visual-designer";
export const STARTER_TEAM_TECHNICAL_QA_AGENT_ID = "vibe-coder-technical-qa";
export const STARTER_TEAM_VISUAL_UX_QA_AGENT_ID = "vibe-coder-visual-ux-qa";
export const DESIGN_STUDIO_TEAM_MANAGER_AGENT_ID = "design-studio-manager";
export const DESIGN_STUDIO_TEAM_VECTOR_VISUAL_DESIGNER_AGENT_ID =
  "design-studio-vector-visual-designer";
export const DESIGN_STUDIO_TEAM_IMAGE_VISUAL_DESIGNER_AGENT_ID =
  "design-studio-image-visual-designer";
export const DESIGN_STUDIO_TEAM_REQUIREMENTS_QA_AGENT_ID = "design-studio-requirements-qa";
export const DESIGN_STUDIO_TEAM_CONSISTENCY_QA_AGENT_ID = "design-studio-consistency-qa";
export const STARTER_TEAM_PRESET_VERSION = 5;
export const DESIGN_STUDIO_TEAM_PRESET_VERSION = 1;
export const MAIN_ORCHESTRATION_TEAM_PRESET_VERSION = 2;
export {
  BUSINESS_DEVELOPMENT_TEAM_ID,
  BUSINESS_DEVELOPMENT_TEAM_MANAGER_AGENT_ID,
  BUSINESS_DEVELOPMENT_TEAM_PRESET_VERSION,
  createBusinessDevelopmentTeamAgents,
  createBusinessDevelopmentTeamConfig,
} from "./business-development-preset.js";
export {
  createLifeImprovementTeamAgents,
  createLifeImprovementTeamConfig,
  LIFE_IMPROVEMENT_FINANCIAL_COACH_AGENT_ID,
  LIFE_IMPROVEMENT_TEAM_ID,
  LIFE_IMPROVEMENT_TEAM_MANAGER_AGENT_ID,
  LIFE_IMPROVEMENT_TEAM_PRESET_VERSION,
} from "./life-improvement-preset.js";

const STARTER_MAIN_AGENT_ALSO_ALLOW = [
  "agents_list",
  "capabilities_list",
  "preview_publish",
  "read",
  "sessions_spawn",
  "sessions_yield",
  "subagents",
  "teams_list",
  "teams_run",
  "web_fetch",
  "web_search",
] as const;

const DESIGN_STUDIO_MANAGER_TOOL_ALLOW = [
  "capabilities_list",
  "image",
  "read",
  "sessions_spawn",
  "sessions_yield",
] as const;

const DESIGN_STUDIO_VECTOR_TOOL_ALLOW = [
  "image",
  "read",
  "sessions_spawn",
  "sessions_yield",
] as const;

const DESIGN_STUDIO_IMAGE_TOOL_ALLOW = [
  "capabilities_list",
  "image",
  "image_generate",
  "read",
  "sessions_spawn",
  "sessions_yield",
] as const;

const DESIGN_STUDIO_QA_TOOL_ALLOW = ["image", "read"] as const;

const ROOT_LINKED_TEAM_IDS = [
  STARTER_TEAM_ID,
  DESIGN_STUDIO_TEAM_ID,
  BUSINESS_DEVELOPMENT_TEAM_ID,
] as const;
type BundledSpecialistTeamId =
  | typeof STARTER_TEAM_ID
  | typeof DESIGN_STUDIO_TEAM_ID
  | typeof BUSINESS_DEVELOPMENT_TEAM_ID
  | typeof LIFE_IMPROVEMENT_TEAM_ID;

const ROOT_LINK_DESCRIPTIONS: Record<BundledSpecialistTeamId, string> = {
  [STARTER_TEAM_ID]:
    "Use for staged UI/product implementation, architecture, development, and ship-readiness QA.",
  [DESIGN_STUDIO_TEAM_ID]:
    "Use for asset-only design exploration, vector/raster asset generation, and visual consistency QA. Not for full page/app implementation.",
  [BUSINESS_DEVELOPMENT_TEAM_ID]:
    "Use for business research, project planning, portfolio dossiers, and approved project-team kickoff.",
  [LIFE_IMPROVEMENT_TEAM_ID]:
    "Use for incremental life-improvement planning, personal check-ins, and document-first coordination across health, identity, relationships, lifestyle, and accountability.",
};

const STARTER_LINK_DESCRIPTIONS: Record<typeof DESIGN_STUDIO_TEAM_ID, string> = {
  [DESIGN_STUDIO_TEAM_ID]:
    "Use for asset-only design exploration, required image manifests, vector/raster asset generation, and consistency-focused QA.",
};

const BUSINESS_LINK_DESCRIPTIONS: Record<
  typeof STARTER_TEAM_ID | typeof DESIGN_STUDIO_TEAM_ID,
  string
> = {
  [STARTER_TEAM_ID]:
    "Use for product, app, and implementation work once this project is approved and needs a built deliverable.",
  [DESIGN_STUDIO_TEAM_ID]:
    "Use for asset-only design work, visual exploration, and generated imagery tied to this project.",
};

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function hasAgent(list: AgentConfig[], agentId: string): boolean {
  const normalized = normalizeAgentId(agentId);
  return list.some((entry) => normalizeAgentId(entry.id) === normalized);
}

function hasTeam(config: MaumauConfig, teamId: string): boolean {
  return (
    Array.isArray(config.teams?.list) &&
    config.teams.list.some((entry) => entry && entry.id.trim().toLowerCase() === teamId)
  );
}

function createMainWorkerAgent(): AgentConfig {
  return {
    id: MAIN_WORKER_AGENT_ID,
    name: "Main Worker",
    tools: {
      profile: "coding",
      alsoAllow: ["browser", "gateway", "nodes"],
    },
  };
}

function buildMainCrossTeamLinks(
  teamIds: readonly BundledSpecialistTeamId[] = ROOT_LINKED_TEAM_IDS,
): TeamCrossTeamLinkConfig[] {
  return teamIds.map((teamId) => ({
    type: "team",
    targetId: teamId,
    description: ROOT_LINK_DESCRIPTIONS[teamId],
  }));
}

function buildStarterCrossTeamLinks(
  teamIds: readonly BundledSpecialistTeamId[] = ROOT_LINKED_TEAM_IDS,
): TeamCrossTeamLinkConfig[] {
  return teamIds.includes(DESIGN_STUDIO_TEAM_ID)
    ? [
        {
          type: "team",
          targetId: DESIGN_STUDIO_TEAM_ID,
          description: STARTER_LINK_DESCRIPTIONS[DESIGN_STUDIO_TEAM_ID],
        },
      ]
    : [];
}

function buildBusinessCrossTeamLinks(
  teamIds: readonly BundledSpecialistTeamId[] = ROOT_LINKED_TEAM_IDS,
): TeamCrossTeamLinkConfig[] {
  return teamIds
    .filter(
      (teamId): teamId is typeof STARTER_TEAM_ID | typeof DESIGN_STUDIO_TEAM_ID =>
        teamId === STARTER_TEAM_ID || teamId === DESIGN_STUDIO_TEAM_ID,
    )
    .map((teamId) => ({
      type: "team" as const,
      targetId: teamId,
      description: BUSINESS_LINK_DESCRIPTIONS[teamId],
    }));
}

function mergeRequiredCrossTeamLinks(
  existing: TeamCrossTeamLinkConfig[] | undefined,
  required: TeamCrossTeamLinkConfig[],
): TeamCrossTeamLinkConfig[] {
  const merged = Array.isArray(existing) ? [...existing] : [];
  for (const link of required) {
    const targetId = link.targetId.trim().toLowerCase();
    const hasMatch = merged.some(
      (entry) => entry.type === link.type && entry.targetId.trim().toLowerCase() === targetId,
    );
    if (!hasMatch) {
      merged.push(link);
    }
  }
  return merged;
}

function syncBundledCrossTeamLinks(teams: TeamConfig[]): TeamConfig[] {
  const availableTeamIds: BundledSpecialistTeamId[] = [];
  if (teams.some((team) => team.id.trim().toLowerCase() === STARTER_TEAM_ID)) {
    availableTeamIds.push(STARTER_TEAM_ID);
  }
  if (teams.some((team) => team.id.trim().toLowerCase() === DESIGN_STUDIO_TEAM_ID)) {
    availableTeamIds.push(DESIGN_STUDIO_TEAM_ID);
  }
  if (teams.some((team) => team.id.trim().toLowerCase() === BUSINESS_DEVELOPMENT_TEAM_ID)) {
    availableTeamIds.push(BUSINESS_DEVELOPMENT_TEAM_ID);
  }
  if (teams.some((team) => team.id.trim().toLowerCase() === LIFE_IMPROVEMENT_TEAM_ID)) {
    availableTeamIds.push(LIFE_IMPROVEMENT_TEAM_ID);
  }

  return teams.map((team) => {
    const normalizedId = team.id.trim().toLowerCase();
    if (normalizedId === MAIN_ORCHESTRATION_TEAM_ID) {
      return {
        ...team,
        crossTeamLinks: mergeRequiredCrossTeamLinks(
          team.crossTeamLinks,
          buildMainCrossTeamLinks(availableTeamIds),
        ),
      };
    }
    if (normalizedId === STARTER_TEAM_ID) {
      return {
        ...team,
        crossTeamLinks: mergeRequiredCrossTeamLinks(
          team.crossTeamLinks,
          buildStarterCrossTeamLinks(availableTeamIds),
        ),
      };
    }
    if (normalizedId === BUSINESS_DEVELOPMENT_TEAM_ID) {
      return {
        ...team,
        crossTeamLinks: mergeRequiredCrossTeamLinks(
          team.crossTeamLinks,
          buildBusinessCrossTeamLinks(availableTeamIds),
        ),
      };
    }
    return team;
  });
}

function createStarterMainAgent(params?: { hasExplicitDefault?: boolean }): AgentConfig {
  return {
    id: DEFAULT_AGENT_ID,
    default: params?.hasExplicitDefault ? undefined : true,
    executionStyle: "orchestrator",
    executionWorkerAgentId: MAIN_WORKER_AGENT_ID,
    subagents: {
      allowAgents: [MAIN_WORKER_AGENT_ID],
    },
    tools: {
      profile: "messaging",
      alsoAllow: [...STARTER_MAIN_AGENT_ALSO_ALLOW],
    },
  };
}

function mergeStarterMainAgent(
  existing: AgentConfig | undefined,
  params?: { hasExplicitDefault?: boolean },
): AgentConfig {
  const starter = createStarterMainAgent(params);
  const existingTools = existing?.tools;
  const hasExplicitAllow = Array.isArray(existingTools?.allow) && existingTools.allow.length > 0;
  const mergedAlsoAllow = hasExplicitAllow
    ? existingTools?.alsoAllow
    : Array.from(new Set([...(existingTools?.alsoAllow ?? []), ...starter.tools!.alsoAllow!]));

  return {
    ...starter,
    ...existing,
    id: DEFAULT_AGENT_ID,
    default: existing?.default ?? starter.default,
    executionStyle: existing?.executionStyle ?? starter.executionStyle,
    executionWorkerAgentId:
      normalizeOptionalText(existing?.executionWorkerAgentId) ?? starter.executionWorkerAgentId,
    subagents: {
      ...starter.subagents,
      ...existing?.subagents,
      allowAgents: Array.from(
        new Set([
          ...(existing?.subagents?.allowAgents ?? []),
          ...(starter.subagents?.allowAgents ?? []),
        ]),
      ),
    },
    tools: {
      ...starter.tools,
      ...existingTools,
      profile: existingTools?.profile ?? starter.tools?.profile,
      ...(hasExplicitAllow ? {} : { alsoAllow: mergedAlsoAllow }),
    },
  };
}

export function createStarterTeamAgents(): AgentConfig[] {
  return [
    createMainWorkerAgent(),
    {
      id: STARTER_TEAM_MANAGER_AGENT_ID,
      name: "Vibe Coder Manager",
      tools: {
        profile: "coding",
      },
    },
    {
      id: STARTER_TEAM_SYSTEM_ARCHITECT_AGENT_ID,
      name: "System Architect",
      tools: {
        profile: "coding",
      },
    },
    {
      id: STARTER_TEAM_DEVELOPER_AGENT_ID,
      name: "Developer",
      tools: {
        profile: "coding",
      },
    },
    {
      id: STARTER_TEAM_UI_UX_DESIGNER_AGENT_ID,
      name: "UI/UX Designer",
      tools: {
        profile: "coding",
      },
    },
    {
      id: STARTER_TEAM_CONTENT_VISUAL_DESIGNER_AGENT_ID,
      name: "Content/Visual Designer",
      tools: {
        profile: "coding",
      },
    },
    {
      id: STARTER_TEAM_TECHNICAL_QA_AGENT_ID,
      name: "Technical QA",
      tools: {
        profile: "coding",
      },
    },
    {
      id: STARTER_TEAM_VISUAL_UX_QA_AGENT_ID,
      name: "Visual/UX QA",
      tools: {
        profile: "coding",
      },
    },
  ];
}

export function createDesignStudioTeamAgents(): AgentConfig[] {
  return [
    {
      id: DESIGN_STUDIO_TEAM_MANAGER_AGENT_ID,
      name: "Design Studio Manager",
      tools: {
        allow: [...DESIGN_STUDIO_MANAGER_TOOL_ALLOW],
      },
    },
    {
      id: DESIGN_STUDIO_TEAM_VECTOR_VISUAL_DESIGNER_AGENT_ID,
      name: "Vector Visual Designer",
      tools: {
        allow: [...DESIGN_STUDIO_VECTOR_TOOL_ALLOW],
      },
    },
    {
      id: DESIGN_STUDIO_TEAM_IMAGE_VISUAL_DESIGNER_AGENT_ID,
      name: "Image Visual Designer",
      tools: {
        allow: [...DESIGN_STUDIO_IMAGE_TOOL_ALLOW],
      },
    },
    {
      id: DESIGN_STUDIO_TEAM_REQUIREMENTS_QA_AGENT_ID,
      name: "Requirements QA",
      tools: {
        allow: [...DESIGN_STUDIO_QA_TOOL_ALLOW],
      },
    },
    {
      id: DESIGN_STUDIO_TEAM_CONSISTENCY_QA_AGENT_ID,
      name: "Consistency QA",
      tools: {
        allow: [...DESIGN_STUDIO_QA_TOOL_ALLOW],
      },
    },
  ];
}

export function createBundledTeamAgents(): AgentConfig[] {
  return [
    ...createStarterTeamAgents(),
    ...createDesignStudioTeamAgents(),
    ...createBusinessDevelopmentTeamAgents(),
  ];
}

export function createStarterTeamConfig(params?: {
  linkedTeamIds?: readonly BundledSpecialistTeamId[];
}): TeamConfig {
  return {
    id: STARTER_TEAM_ID,
    name: "Vibe Coder",
    description:
      "A starter staged manager-plus-specialists team for architecture, implementation, design, and QA work.",
    managerAgentId: STARTER_TEAM_MANAGER_AGENT_ID,
    members: [
      {
        agentId: STARTER_TEAM_SYSTEM_ARCHITECT_AGENT_ID,
        role: "system architect",
        description:
          "Owns system design, technical decomposition, interfaces, and implementation planning.",
      },
      {
        agentId: STARTER_TEAM_DEVELOPER_AGENT_ID,
        role: "developer",
        description: "Owns implementation, debugging, refactors, and technical execution.",
      },
      {
        agentId: STARTER_TEAM_UI_UX_DESIGNER_AGENT_ID,
        role: "ui/ux designer",
        description: "Owns interaction design, information hierarchy, flows, and usability.",
      },
      {
        agentId: STARTER_TEAM_CONTENT_VISUAL_DESIGNER_AGENT_ID,
        role: "content/visual designer",
        description:
          "Owns product copy, visual direction, layout polish, illustration planning, and presentation quality. If illustration is needed, brief it as image-lane work rather than vector work, and never rely on emoji as icon replacements.",
      },
      {
        agentId: STARTER_TEAM_TECHNICAL_QA_AGENT_ID,
        role: "technical qa",
        description:
          "Owns technical verification, edge cases, regression checks, and implementation risks.",
      },
      {
        agentId: STARTER_TEAM_VISUAL_UX_QA_AGENT_ID,
        role: "visual/ux qa",
        description:
          "Owns visual consistency, UX polish, accessibility checks, and final experience review, including rejecting vector stand-ins for illustration work and emoji stand-ins for icons.",
      },
    ],
    crossTeamLinks: buildStarterCrossTeamLinks(params?.linkedTeamIds),
    workflows: [
      {
        id: DEFAULT_TEAM_WORKFLOW_ID,
        name: "Default Workflow",
        description:
          "General-purpose stage-gated architecture, execution, and QA collaboration for the vibe-coder team.",
        default: true,
        lifecycle: {
          stages: [
            {
              id: "planning",
              name: "Planning",
              status: "in_progress",
              roles: [],
            },
            {
              id: "architecture",
              name: "Architecture",
              status: "in_progress",
              roles: ["system architect"],
            },
            {
              id: "execution",
              name: "Execution",
              status: "in_progress",
              roles: ["developer", "ui/ux designer", "content/visual designer"],
            },
            {
              id: "qa",
              name: "QA",
              status: "in_progress",
              roles: ["technical qa", "visual/ux qa"],
            },
            {
              id: "manager_confirmation",
              name: "Manager Confirmation",
              status: "review",
              roles: [],
            },
          ],
        },
        managerPrompt:
          "Run the default lifecycle with explicit stage statuses: architecture first, then execution, then QA verification, then done. The system architect goes first. Developer, UI/UX designer, and content/visual designer work only after architecture approval. Vibe-coder is the implementation owner for any final deliverable that is a built webpage, app, screen, or other implemented UI/product artifact. That stays true even if the request also mentions images, illustrations, moodboards, placeholder assets, SVG/CSS motifs, art direction, or design-studio by name. For those user-facing UI deliverables, the visual plan must include at least one prominent illustration, image, or hero visual, or a clearly intentional icon system used in key places. The content/visual designer should capture any asset or visual-system requirements and, when generated or externally produced visuals are needed, prepare a placeholder asset register that says where each asset will appear, what it should depict or communicate, and any known slot constraints. If a placeholder asset is an illustration, hero visual, character art, scene art, or other prominent decorative image, it must be treated as image-lane work rather than vector work. Do not satisfy those illustration requirements with vector art, SVG illustration, CSS-only composition, code-native decorative graphics, emoji, Unicode symbols, or typography tricks. Vector is reserved for actual icons or simple code-native graphics rendered or animated in code. If the UI uses icons, they must be actual icon assets or code-native icon components rather than emoji, Unicode symbols, letters, punctuation, or decorative glyphs. Hand only those asset subsets to the linked design team before QA or during QA rework. The linked design team returns approved assets and guidance mapped back to those placeholders; it does not take ownership of the whole page/app implementation. Visual/UX QA should block built webpages/apps/screens that lack both a prominent visual anchor and meaningful icon use in key places, and should also block vector stand-ins for illustration work or emoji stand-ins for icons. Technical QA and visual/UX QA only verify completed work. If QA blocks, send the task back to rework before another QA pass.",
        synthesisPrompt:
          "Synthesize the specialist outputs into one practical answer, highlight tradeoffs and quality risks, and call out anything that still needs a human decision.",
        contract: {
          requiredRoles: [
            "system architect",
            "developer",
            "ui/ux designer",
            "content/visual designer",
            "technical qa",
            "visual/ux qa",
          ],
          requiredQaRoles: ["technical qa", "visual/ux qa"],
          requireDelegation: true,
        },
      },
    ],
    preset: {
      id: STARTER_TEAM_ID,
      source: "bundled",
      version: STARTER_TEAM_PRESET_VERSION,
    },
  };
}

export function createDesignStudioTeamConfig(): TeamConfig {
  return {
    id: DESIGN_STUDIO_TEAM_ID,
    name: "Design Studio",
    description:
      "A bundled asset-design team for design exploration, asset manifests, vector/raster visual generation, and consistency-focused QA. It does not implement webpages, apps, or product code.",
    managerAgentId: DESIGN_STUDIO_TEAM_MANAGER_AGENT_ID,
    members: [
      {
        agentId: DESIGN_STUDIO_TEAM_VECTOR_VISUAL_DESIGNER_AGENT_ID,
        role: "vector visual designer",
        description:
          "Owns actual icons and simple code-native graphic elements that will be rendered or animated directly in HTML/CSS/SVG/canvas. Not for human characters, portraits, creatures, scenes, hero art, or any other illustration work, and never for emoji-as-icon substitutions.",
      },
      {
        agentId: DESIGN_STUDIO_TEAM_IMAGE_VISUAL_DESIGNER_AGENT_ID,
        role: "image visual designer",
        description:
          "Owns raster image exploration and image generation/editing work, especially for characters, portraits, creatures, scenes, figurative illustration, and other rendered imagery. Use image_generate for actual image outputs instead of treating the chat model as the drawing model.",
      },
      {
        agentId: DESIGN_STUDIO_TEAM_REQUIREMENTS_QA_AGENT_ID,
        role: "requirements qa",
        description:
          "Verifies each generated asset matches the manifest, stated requirements, and visual acceptance criteria.",
      },
      {
        agentId: DESIGN_STUDIO_TEAM_CONSISTENCY_QA_AGENT_ID,
        role: "consistency qa",
        description:
          "Verifies each generated asset stays consistent with the shared visual system and previously approved assets.",
      },
    ],
    crossTeamLinks: [],
    workflows: [
      {
        id: DEFAULT_TEAM_WORKFLOW_ID,
        name: "Default Workflow",
        description:
          "Manager-led design exploration for visual asset requirements, option generation, and consistency-focused QA.",
        default: true,
        lifecycle: {
          stages: [
            {
              id: "planning",
              name: "Planning",
              status: "in_progress",
              roles: [],
            },
            {
              id: "asset_manifest",
              name: "Asset Manifest",
              status: "in_progress",
              roles: [],
            },
            {
              id: "production",
              name: "Production",
              status: "in_progress",
              roles: ["vector visual designer", "image visual designer"],
            },
            {
              id: "qa",
              name: "QA",
              status: "in_progress",
              roles: ["requirements qa", "consistency qa"],
            },
            {
              id: "manager_confirmation",
              name: "Manager Confirmation",
              status: "review",
              roles: [],
            },
          ],
        },
        managerPrompt:
          "This team is asset-only: do not implement webpages, apps, screens, or product code. Start by creating an asset manifest and a shared consistency guide. If an upstream team gives you a placeholder asset register, treat it as the source of truth for what assets exist, where they belong, what they should depict or communicate, and any known slot constraints; preserve those placeholders when building the manifest unless you explicitly explain a change. Every manifest item must be an asset deliverable, not an implementation task. Use only the production lane each asset actually needs; do not force both lanes onto every asset. Human characters, portraits, creatures, scenes, figurative illustration, painterly work, photorealistic work, anything explicitly requested as an illustration, and any asset acting as a hero image or prominent decorative visual must go to the image lane and require actual raster output through image_generate. The vector lane is only for actual icons and simple code-native graphic elements that will be rendered or animated directly in HTML/CSS/SVG/canvas. Emoji, Unicode symbols, letters, punctuation, and decorative glyphs are never acceptable substitutes for icons or illustration deliverables. If the request is really a page/app implementation, block clearly and route it back to vibe-coder. Requirements QA verifies the asset against the brief, and Consistency QA verifies it against the shared guide plus already-approved assets.",
        synthesisPrompt:
          "Synthesize the approved asset list, selected options, remaining blockers or follow-ups, and any hard blockers such as missing image-generation support. Do not present page/app implementation as if this team completed it.",
        contract: {
          requiredRoles: [],
          requiredQaRoles: ["requirements qa", "consistency qa"],
          requireDelegation: true,
        },
      },
    ],
    preset: {
      id: DESIGN_STUDIO_TEAM_ID,
      source: "bundled",
      version: DESIGN_STUDIO_TEAM_PRESET_VERSION,
    },
  };
}

export function createMainOrchestrationTeamConfig(params?: {
  linkedTeamIds?: readonly BundledSpecialistTeamId[];
}): TeamConfig {
  return {
    id: MAIN_ORCHESTRATION_TEAM_ID,
    name: "Main Orchestration",
    description:
      "The root manager team for the default chat agent. It routes bounded execution to main-worker and escalates UI or staged product work to linked specialist teams.",
    managerAgentId: DEFAULT_AGENT_ID,
    implicitForManagerSessions: true,
    members: [
      {
        agentId: MAIN_WORKER_AGENT_ID,
        role: "execution worker",
        description:
          "Owns bounded execution, implementation, research, browser work, and direct task completion when a full specialist team is not required.",
      },
    ],
    crossTeamLinks: buildMainCrossTeamLinks(params?.linkedTeamIds),
    workflows: [
      {
        id: DEFAULT_TEAM_WORKFLOW_ID,
        name: "Default Workflow",
        description:
          "Root orchestration workflow for triage, delegation, and execution routing across bundled workers and linked teams.",
        default: true,
        lifecycle: {
          stages: [
            {
              id: "working",
              name: "Working",
              status: "in_progress",
              roles: [],
            },
          ],
        },
        managerPrompt:
          "Treat this team as the root orchestrator for the default chat agent. Keep direct replies to casual or lightweight read-only requests. Delegate bounded execution to the execution worker. If the final deliverable is a built webpage, app, screen, or other implemented UI/product artifact, choose vibe-coder first as the implementation owner. That stays true even if the task also asks for visual design, images, illustrations, placeholder assets, SVG/CSS motifs, art direction, moodboards, or design-studio collaboration. Choose design-studio first only when the requested deliverable is asset-only: for example icons, logos, illustrations, image sets, moodboards, style guides, vector/raster option exploration, or consistency review without page/app implementation. When a built page/app also needs asset work, start with vibe-coder and let that manager call design-studio for only the asset subsets it does not own. Do not use design-studio as the implementation team for webpages, apps, or screens. Always report which execution path was used.",
        synthesisPrompt:
          "Summarize the delegated outcome, name the worker or linked team used, and include a concise execution receipt with QA and preview/share state when relevant.",
      },
    ],
    preset: {
      id: MAIN_ORCHESTRATION_TEAM_ID,
      source: "bundled",
      version: MAIN_ORCHESTRATION_TEAM_PRESET_VERSION,
    },
  };
}

export function ensureStarterTeamConfig(baseConfig: MaumauConfig): MaumauConfig {
  const currentAgents = Array.isArray(baseConfig.agents?.list) ? [...baseConfig.agents.list] : [];
  const hasExplicitDefault = currentAgents.some((entry) => entry?.default);
  const nextAgents = [...currentAgents];
  const mainIndex = nextAgents.findIndex(
    (entry) => normalizeAgentId(entry.id) === DEFAULT_AGENT_ID,
  );
  if (mainIndex >= 0) {
    nextAgents[mainIndex] = mergeStarterMainAgent(nextAgents[mainIndex], { hasExplicitDefault });
  } else {
    nextAgents.unshift(createStarterMainAgent({ hasExplicitDefault }));
  }

  for (const agent of createBundledTeamAgents()) {
    if (!hasAgent(nextAgents, agent.id)) {
      nextAgents.push(agent);
    }
  }

  const nextTeams = Array.isArray(baseConfig.teams?.list) ? [...baseConfig.teams.list] : [];
  if (!hasTeam(baseConfig, MAIN_ORCHESTRATION_TEAM_ID)) {
    nextTeams.unshift(createMainOrchestrationTeamConfig());
  }
  if (!hasTeam(baseConfig, STARTER_TEAM_ID)) {
    nextTeams.push(createStarterTeamConfig());
  }
  if (!hasTeam(baseConfig, DESIGN_STUDIO_TEAM_ID)) {
    nextTeams.push(createDesignStudioTeamConfig());
  }
  if (!hasTeam(baseConfig, BUSINESS_DEVELOPMENT_TEAM_ID)) {
    nextTeams.push(createBusinessDevelopmentTeamConfig());
  }

  return {
    ...baseConfig,
    agents: {
      ...baseConfig.agents,
      defaults: {
        ...baseConfig.agents?.defaults,
        executionStyle: baseConfig.agents?.defaults?.executionStyle ?? "orchestrator",
        executionWorkerAgentId:
          normalizeOptionalText(baseConfig.agents?.defaults?.executionWorkerAgentId) ??
          MAIN_WORKER_AGENT_ID,
      },
      list: nextAgents,
    },
    teams: {
      ...baseConfig.teams,
      list: syncBundledCrossTeamLinks(nextTeams),
    },
  };
}

export function ensureBundledTeamPresetConfig(
  baseConfig: MaumauConfig,
  presetId:
    | typeof STARTER_TEAM_ID
    | typeof DESIGN_STUDIO_TEAM_ID
    | typeof BUSINESS_DEVELOPMENT_TEAM_ID
    | typeof LIFE_IMPROVEMENT_TEAM_ID,
): MaumauConfig {
  const currentAgents = Array.isArray(baseConfig.agents?.list) ? [...baseConfig.agents.list] : [];
  const hasExplicitDefault = currentAgents.some((entry) => entry?.default);
  const nextAgents = [...currentAgents];
  const mainIndex = nextAgents.findIndex(
    (entry) => normalizeAgentId(entry.id) === DEFAULT_AGENT_ID,
  );
  if (mainIndex >= 0) {
    nextAgents[mainIndex] = mergeStarterMainAgent(nextAgents[mainIndex], { hasExplicitDefault });
  } else {
    nextAgents.unshift(createStarterMainAgent({ hasExplicitDefault }));
  }

  if (!hasAgent(nextAgents, MAIN_WORKER_AGENT_ID)) {
    nextAgents.push(createMainWorkerAgent());
  }

  const presetAgents =
    presetId === STARTER_TEAM_ID
      ? createStarterTeamAgents()
      : presetId === DESIGN_STUDIO_TEAM_ID
        ? createDesignStudioTeamAgents()
        : presetId === BUSINESS_DEVELOPMENT_TEAM_ID
          ? createBusinessDevelopmentTeamAgents()
          : createLifeImprovementTeamAgents();
  for (const agent of presetAgents) {
    if (!hasAgent(nextAgents, agent.id)) {
      nextAgents.push(agent);
    }
  }

  const nextTeams = Array.isArray(baseConfig.teams?.list) ? [...baseConfig.teams.list] : [];
  if (!hasTeam(baseConfig, MAIN_ORCHESTRATION_TEAM_ID)) {
    const linkedTeamIds =
      presetId === STARTER_TEAM_ID
        ? ([STARTER_TEAM_ID] as const)
        : presetId === DESIGN_STUDIO_TEAM_ID
          ? ([DESIGN_STUDIO_TEAM_ID] as const)
          : presetId === BUSINESS_DEVELOPMENT_TEAM_ID
            ? ([BUSINESS_DEVELOPMENT_TEAM_ID] as const)
            : ([] as const);
    nextTeams.unshift(createMainOrchestrationTeamConfig({ linkedTeamIds }));
  }
  if (presetId === STARTER_TEAM_ID && !hasTeam(baseConfig, STARTER_TEAM_ID)) {
    const linkedTeamIds = hasTeam(baseConfig, DESIGN_STUDIO_TEAM_ID)
      ? ROOT_LINKED_TEAM_IDS
      : ([STARTER_TEAM_ID] as const);
    nextTeams.push(createStarterTeamConfig({ linkedTeamIds }));
  }
  if (presetId === DESIGN_STUDIO_TEAM_ID && !hasTeam(baseConfig, DESIGN_STUDIO_TEAM_ID)) {
    nextTeams.push(createDesignStudioTeamConfig());
  }
  if (
    presetId === BUSINESS_DEVELOPMENT_TEAM_ID &&
    !hasTeam(baseConfig, BUSINESS_DEVELOPMENT_TEAM_ID)
  ) {
    nextTeams.push(createBusinessDevelopmentTeamConfig());
  }
  if (presetId === LIFE_IMPROVEMENT_TEAM_ID && !hasTeam(baseConfig, LIFE_IMPROVEMENT_TEAM_ID)) {
    nextTeams.push(createLifeImprovementTeamConfig());
  }

  return {
    ...baseConfig,
    agents: {
      ...baseConfig.agents,
      defaults: {
        ...baseConfig.agents?.defaults,
        executionStyle: baseConfig.agents?.defaults?.executionStyle ?? "orchestrator",
        executionWorkerAgentId:
          normalizeOptionalText(baseConfig.agents?.defaults?.executionWorkerAgentId) ??
          MAIN_WORKER_AGENT_ID,
      },
      list: nextAgents,
    },
    teams: {
      ...baseConfig.teams,
      list: syncBundledCrossTeamLinks(nextTeams),
    },
  };
}

export function applyStarterTeamOnFreshInstall(
  baseConfig: MaumauConfig,
  options?: { freshInstall?: boolean },
): MaumauConfig {
  if (options?.freshInstall !== true) {
    return baseConfig;
  }
  return ensureBundledTeamPresetConfig(
    ensureBundledTeamPresetConfig(ensureStarterTeamConfig(baseConfig), LIFE_IMPROVEMENT_TEAM_ID),
    BUSINESS_DEVELOPMENT_TEAM_ID,
  );
}

export function createBlankTeamConfig(baseConfig: MaumauConfig): TeamConfig {
  const existingTeamIds = new Set(
    (Array.isArray(baseConfig.teams?.list) ? baseConfig.teams.list : []).map((entry) =>
      entry.id.trim().toLowerCase(),
    ),
  );
  let index = 1;
  let teamId = "team-1";
  while (existingTeamIds.has(teamId)) {
    index += 1;
    teamId = `team-${index}`;
  }

  const configuredAgents = Array.isArray(baseConfig.agents?.list) ? baseConfig.agents.list : [];
  const managerAgentId = normalizeOptionalText(configuredAgents[0]?.id) ?? DEFAULT_AGENT_ID;

  return {
    id: teamId,
    name: `Team ${index}`,
    description: "A custom manager-plus-specialists team.",
    managerAgentId,
    members: [],
    crossTeamLinks: [],
    workflows: [createBlankTeamWorkflowConfig({ id: DEFAULT_TEAM_WORKFLOW_ID })],
    preset: {
      id: "custom",
      source: "user",
      version: 1,
    },
  };
}

export function createBlankTeamWorkflowConfig(params?: {
  id?: string;
  name?: string;
  default?: boolean;
}): TeamWorkflowConfig {
  return {
    id: params?.id ?? DEFAULT_TEAM_WORKFLOW_ID,
    name: params?.name ?? "Default Workflow",
    description: "A manager-plus-specialists workflow for this team.",
    default: params?.default ?? true,
  };
}

export function createNextTeamWorkflowConfig(team: TeamConfig): TeamWorkflowConfig {
  const existingIds = new Set(listTeamWorkflows(team).map((workflow) => workflow.id));
  let index = 1;
  let workflowId = DEFAULT_TEAM_WORKFLOW_ID;
  if (existingIds.has(DEFAULT_TEAM_WORKFLOW_ID)) {
    workflowId = `workflow-${index}`;
    while (existingIds.has(workflowId)) {
      index += 1;
      workflowId = `workflow-${index}`;
    }
  }
  return createBlankTeamWorkflowConfig({
    id: workflowId,
    name: workflowId === DEFAULT_TEAM_WORKFLOW_ID ? "Default Workflow" : `Workflow ${index}`,
    default: existingIds.size === 0,
  });
}
