import type { MaumauConfig } from "../../config/config.js";
import {
  isSubagentSessionKey,
  normalizeAgentId,
  resolveAgentIdFromSessionKey,
} from "../../routing/session-key.js";
import { shouldOmitCodingAgentSkillForRun } from "../execution-routing.js";
import { loadWorkspaceSkillEntries, type SkillEntry, type SkillSnapshot } from "../skills.js";
import { resolveSkillRuntimeConfig } from "../skills/runtime-config.js";

function createSkillEntriesFromSnapshot(skills?: SkillSnapshot["resolvedSkills"]): SkillEntry[] {
  return (skills ?? []).map((skill) => ({
    skill,
    frontmatter: {},
    invocation: {
      userInvocable: true,
      disableModelInvocation: skill.disableModelInvocation,
    },
  }));
}

function filterExecutionRoleSkillEntries(params: {
  entries: SkillEntry[];
  config?: MaumauConfig;
  agentId?: string;
  sessionKey?: string;
}): SkillEntry[] {
  const resolvedAgentId =
    params.agentId ??
    (params.sessionKey ? resolveAgentIdFromSessionKey(params.sessionKey) : undefined);
  const normalizedAgentId = resolvedAgentId ? normalizeAgentId(resolvedAgentId) : undefined;
  const sessionIsSubagent = isSubagentSessionKey(params.sessionKey);
  return params.entries.filter((entry) => {
    if (entry.skill.name.trim().toLowerCase() !== "coding-agent") {
      return true;
    }
    return !shouldOmitCodingAgentSkillForRun({
      config: params.config,
      agentId: normalizedAgentId,
      sessionIsSubagent,
    });
  });
}

export function resolveEmbeddedRunSkillEntries(params: {
  workspaceDir: string;
  config?: MaumauConfig;
  skillsSnapshot?: SkillSnapshot;
  agentId?: string;
  sessionKey?: string;
}): {
  shouldLoadSkillEntries: boolean;
  skillEntries: SkillEntry[];
} {
  const shouldLoadSkillEntries = !params.skillsSnapshot || !params.skillsSnapshot.resolvedSkills;
  const config = resolveSkillRuntimeConfig(params.config);
  const snapshotSkillEntries = createSkillEntriesFromSnapshot(
    params.skillsSnapshot?.resolvedSkills,
  );
  const loadedSkillEntries = shouldLoadSkillEntries
    ? loadWorkspaceSkillEntries(params.workspaceDir, { config })
    : snapshotSkillEntries;
  return {
    shouldLoadSkillEntries,
    skillEntries: filterExecutionRoleSkillEntries({
      entries: loadedSkillEntries,
      config,
      agentId: params.agentId,
      sessionKey: params.sessionKey,
    }),
  };
}
