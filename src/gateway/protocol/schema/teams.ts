import { Type } from "@sinclair/typebox";
import { NonEmptyString } from "./primitives.js";

const NullableNonEmptyString = Type.Union([NonEmptyString, Type.Null()]);

export const TeamPromptEditLifecycleStageSchema = Type.Object(
  {
    id: NonEmptyString,
    name: Type.Optional(NullableNonEmptyString),
    status: Type.Optional(
      Type.Union([
        Type.Literal("blocked"),
        Type.Literal("in_progress"),
        Type.Literal("review"),
        Type.Literal("done"),
        Type.Literal("idle"),
      ]),
    ),
    roles: Type.Optional(Type.Array(NonEmptyString)),
  },
  { additionalProperties: false },
);

export const TeamPromptEditMemberSchema = Type.Object(
  {
    agentId: NonEmptyString,
    role: NonEmptyString,
    description: Type.Optional(NullableNonEmptyString),
  },
  { additionalProperties: false },
);

export const TeamPromptEditCrossTeamLinkSchema = Type.Object(
  {
    type: Type.Union([Type.Literal("team"), Type.Literal("agent")]),
    targetId: NonEmptyString,
    description: Type.Optional(NullableNonEmptyString),
  },
  { additionalProperties: false },
);

export const TeamPromptEditWorkflowContractSchema = Type.Object(
  {
    requiredRoles: Type.Optional(Type.Array(NonEmptyString)),
    requiredQaRoles: Type.Optional(Type.Array(NonEmptyString)),
    requireDelegation: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

export const TeamPromptEditParamsSchema = Type.Object(
  {
    rawConfig: NonEmptyString,
    teamId: NonEmptyString,
    workflowId: Type.Optional(NonEmptyString),
    prompt: NonEmptyString,
  },
  { additionalProperties: false },
);

export const TeamPromptEditTeamPatchSchema = Type.Object(
  {
    name: Type.Optional(NullableNonEmptyString),
    description: Type.Optional(NullableNonEmptyString),
    managerAgentId: Type.Optional(NullableNonEmptyString),
    implicitForManagerSessions: Type.Optional(Type.Boolean()),
    members: Type.Optional(Type.Array(TeamPromptEditMemberSchema)),
    crossTeamLinks: Type.Optional(Type.Array(TeamPromptEditCrossTeamLinkSchema)),
  },
  { additionalProperties: false },
);

export const TeamPromptEditWorkflowPatchSchema = Type.Object(
  {
    name: Type.Optional(NullableNonEmptyString),
    description: Type.Optional(NullableNonEmptyString),
    managerPrompt: Type.Optional(NullableNonEmptyString),
    synthesisPrompt: Type.Optional(NullableNonEmptyString),
    lifecycle: Type.Optional(
      Type.Union([
        Type.Object(
          {
            stages: Type.Optional(Type.Array(TeamPromptEditLifecycleStageSchema)),
          },
          { additionalProperties: false },
        ),
        Type.Null(),
      ]),
    ),
    contract: Type.Optional(
      Type.Union([TeamPromptEditWorkflowContractSchema, Type.Null()]),
    ),
  },
  { additionalProperties: false },
);

export const TeamPromptEditAgentIdentityPatchSchema = Type.Object(
  {
    name: Type.Optional(NullableNonEmptyString),
    theme: Type.Optional(NullableNonEmptyString),
    emoji: Type.Optional(NullableNonEmptyString),
    avatar: Type.Optional(NullableNonEmptyString),
    avatarUrl: Type.Optional(NullableNonEmptyString),
  },
  { additionalProperties: false },
);

export const TeamPromptEditAgentPatchSchema = Type.Object(
  {
    agentId: NonEmptyString,
    name: Type.Optional(NullableNonEmptyString),
    identity: Type.Optional(
      Type.Union([TeamPromptEditAgentIdentityPatchSchema, Type.Null()]),
    ),
  },
  { additionalProperties: false },
);

export const TeamPromptEditResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    noop: Type.Boolean(),
    summary: Type.Optional(NonEmptyString),
    warnings: Type.Array(NonEmptyString),
    teamPatch: Type.Optional(TeamPromptEditTeamPatchSchema),
    workflowPatch: Type.Optional(TeamPromptEditWorkflowPatchSchema),
    agentPatches: Type.Array(TeamPromptEditAgentPatchSchema),
  },
  { additionalProperties: false },
);
