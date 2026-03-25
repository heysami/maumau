import { listSkillCommandsForAgents as listSkillCommandsForAgentsImpl } from "maumau/plugin-sdk/command-auth";

type ListSkillCommandsForAgents =
  typeof import("maumau/plugin-sdk/command-auth").listSkillCommandsForAgents;

export function listSkillCommandsForAgents(
  ...args: Parameters<ListSkillCommandsForAgents>
): ReturnType<ListSkillCommandsForAgents> {
  return listSkillCommandsForAgentsImpl(...args);
}
