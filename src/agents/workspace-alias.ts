export const DEFAULT_AGENT_WORKSPACE_ALIAS = "@default-workspace";

export function isDefaultAgentWorkspaceAlias(value: string | null | undefined): boolean {
  return value?.trim().toLowerCase() === DEFAULT_AGENT_WORKSPACE_ALIAS;
}
