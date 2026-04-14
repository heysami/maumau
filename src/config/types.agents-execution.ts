export const AGENT_EXECUTION_STYLES = ["direct", "hybrid", "orchestrator"] as const;

export type AgentExecutionStyle = (typeof AGENT_EXECUTION_STYLES)[number];
