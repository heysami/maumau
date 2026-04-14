import { DEFAULT_AGENT_WORKSPACE_ALIAS } from "../agents/workspace-alias.js";
import type { AgentConfig } from "../config/types.agents.js";
import type { TeamConfig } from "../config/types.teams.js";
import { DEFAULT_TEAM_WORKFLOW_ID } from "./model.js";

export const BUSINESS_DEVELOPMENT_TEAM_ID = "business-development";
export const BUSINESS_DEVELOPMENT_TEAM_MANAGER_AGENT_ID = "business-development-manager";
export const BUSINESS_DEVELOPMENT_TEAM_PRESET_VERSION = 1;

const BUSINESS_DEVELOPMENT_MANAGER_TOOL_ALLOW = [
  "apply_patch",
  "business_projects",
  "capabilities_list",
  "edit",
  "memory_get",
  "memory_search",
  "read",
  "sessions_spawn",
  "sessions_yield",
  "teams_list",
  "teams_run",
  "web_fetch",
  "web_search",
  "write",
] as const;

export function createBusinessDevelopmentTeamAgents(): AgentConfig[] {
  return [
    {
      id: BUSINESS_DEVELOPMENT_TEAM_MANAGER_AGENT_ID,
      name: "Business Dev Manager",
      workspace: DEFAULT_AGENT_WORKSPACE_ALIAS,
      tools: {
        allow: [...BUSINESS_DEVELOPMENT_MANAGER_TOOL_ALLOW],
      },
    },
  ];
}

export function createBusinessDevelopmentTeamConfig(): TeamConfig {
  return {
    id: BUSINESS_DEVELOPMENT_TEAM_ID,
    name: "Business Development Team",
    description:
      "A bundled owner-private business strategy team that turns venture ideas into researched projects, proposed team blueprints, and scoped handoffs into implementation teams when approved.",
    managerAgentId: BUSINESS_DEVELOPMENT_TEAM_MANAGER_AGENT_ID,
    members: [],
    crossTeamLinks: [],
    workflows: [
      {
        id: DEFAULT_TEAM_WORKFLOW_ID,
        name: "Default Workflow",
        description:
          "Manager-led business intake, research, proposal, approval, and project-team kickoff for one or more ventures.",
        default: true,
        lifecycle: {
          stages: [
            {
              id: "intake",
              name: "Intake",
              status: "in_progress",
              roles: [],
            },
            {
              id: "research",
              name: "Research",
              status: "in_progress",
              roles: [],
            },
            {
              id: "proposal",
              name: "Proposal",
              status: "review",
              roles: [],
            },
            {
              id: "approval",
              name: "Approval",
              status: "review",
              roles: [],
            },
            {
              id: "kickoff",
              name: "Kickoff",
              status: "review",
              roles: [],
            },
          ],
        },
        managerPrompt:
          "Treat this team as an owner-private business development system that can manage multiple businesses and multiple projects per business. Use the owner workspace business registry as the canonical source of truth: business/<business-id>/BUSINESS.md, business/<business-id>/projects/<project-id>/PROJECT.md, and BLUEPRINT.json. The intake may be slow and conversational or it may be an energetic brainstorm if the user responds well; do not force a rigid questionnaire. Cluster ideas into businesses first, then projects. Research thoroughly with web_search and web_fetch before proposing execution. Keep the business logic in dossier files and blueprint files instead of inventing hidden runtime state. When you think a project is ready, produce or update BLUEPRINT.json with scoped agents, team definition, workflow text inputs, tool or integration requirements, workspace plan, and whether vibe-coder or design-studio are required. Do not materialize a project team silently. Wait for explicit user approval, then use the business_projects tool to apply the approved blueprint version. If the project needs an app, plan the build lane around vibe-coder as the implementation owner and use design-studio only for asset-only work. Reuse USER.md or life-profile context only as supporting context; the business dossier remains the source of truth.",
        synthesisPrompt:
          "Synthesize the business and project dossier state, research findings, proposed plan, approval status, and next step into one concise business-development brief.",
        contract: {
          requiredRoles: [],
          requiredQaRoles: [],
          requireDelegation: false,
        },
      },
    ],
    preset: {
      id: BUSINESS_DEVELOPMENT_TEAM_ID,
      source: "bundled",
      version: BUSINESS_DEVELOPMENT_TEAM_PRESET_VERSION,
    },
  };
}
