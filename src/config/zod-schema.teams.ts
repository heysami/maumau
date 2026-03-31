import { z } from "zod";

export const TeamPresetSchema = z
  .object({
    id: z.string(),
    source: z.union([z.literal("bundled"), z.literal("user")]).optional(),
    version: z.number().int().positive().optional(),
  })
  .strict();

export const TeamMemberSchema = z
  .object({
    agentId: z.string(),
    role: z.string(),
    description: z.string().optional(),
  })
  .strict();

export const TeamCrossTeamLinkSchema = z
  .object({
    type: z.union([z.literal("team"), z.literal("agent")]),
    targetId: z.string(),
    description: z.string().optional(),
  })
  .strict();

export const TeamWorkflowBaseSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    managerPrompt: z.string().optional(),
    synthesisPrompt: z.string().optional(),
    default: z.boolean().optional(),
  })
  .strict();

export const TeamWorkflowSchema = TeamWorkflowBaseSchema.extend({
  id: z.string(),
}).strict();

export const TeamSchema = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    managerAgentId: z.string(),
    members: z.array(TeamMemberSchema).optional(),
    crossTeamLinks: z.array(TeamCrossTeamLinkSchema).optional(),
    workflows: z.array(TeamWorkflowSchema).optional(),
    workflow: TeamWorkflowBaseSchema.optional(),
    preset: TeamPresetSchema.optional(),
  })
  .strict();

export const TeamsSchema = z
  .object({
    list: z.array(TeamSchema).optional(),
  })
  .strict()
  .optional();
