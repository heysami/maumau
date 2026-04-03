export type TeamPresetSource = "bundled" | "user";

export type TeamPresetConfig = {
  id: string;
  source?: TeamPresetSource;
  version?: number;
};

export type TeamMemberConfig = {
  agentId: string;
  role: string;
  description?: string;
};

export type TeamCrossTeamLinkConfig = {
  type: "team" | "agent";
  targetId: string;
  description?: string;
};

export type TeamWorkflowBaseConfig = {
  name?: string;
  description?: string;
  managerPrompt?: string;
  synthesisPrompt?: string;
  contract?: {
    requiredRoles?: string[];
    requiredQaRoles?: string[];
    requireDelegation?: boolean;
  };
  default?: boolean;
};

export type TeamWorkflowConfig = TeamWorkflowBaseConfig & {
  id: string;
};

export type TeamConfig = {
  id: string;
  name?: string;
  description?: string;
  managerAgentId: string;
  implicitForManagerSessions?: boolean;
  members?: TeamMemberConfig[];
  crossTeamLinks?: TeamCrossTeamLinkConfig[];
  workflows?: TeamWorkflowConfig[];
  workflow?: TeamWorkflowBaseConfig;
  preset?: TeamPresetConfig;
};

export type TeamsConfig = {
  list?: TeamConfig[];
};
