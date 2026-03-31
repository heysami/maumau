import type { MaumauConfig } from "../config/config.js";
import type { TeamMemberConfig } from "../config/types.teams.js";
import type { TeamConfig, TeamWorkflowConfig } from "../config/types.teams.js";
import { findTeamWorkflow, listTeamMembers, resolveAgentDisplayName } from "./model.js";

function proseMultiline(value: string[]): string[] {
  return ['  prompt: """', ...value.map((line) => `  ${line}`), '  """'];
}

function indent(lines: string[], prefix = "  "): string[] {
  return lines.map((line) => `${prefix}${line}`);
}

function sanitizePromptLine(value: string): string {
  return value.replace(/\r/g, "").trim();
}

function normalizeRoleKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toIdentifier(value: string, fallbackIndex: number, used: Set<string>): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const base =
    normalized && !/^\d/.test(normalized) ? normalized : `specialist_${fallbackIndex + 1}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function buildManagerPrompt(team: TeamConfig, workflow: TeamWorkflowConfig): string[] {
  const lines = [
    `You are the team manager for "${team.name?.trim() || team.id}".`,
    `Use the Maumau manager agent id \`${team.managerAgentId}\`.`,
    "Keep execution manager-led. Delegate specialist work deliberately and synthesize one final answer.",
  ];
  const workflowName = sanitizePromptLine(workflow.name ?? "");
  if (workflowName) {
    lines.push(`Current workflow: ${workflowName}.`);
  }
  const workflowDescription = sanitizePromptLine(workflow.description ?? "");
  if (workflowDescription) {
    lines.push(`Workflow objective: ${workflowDescription}`);
  }
  const managerPrompt = sanitizePromptLine(workflow.managerPrompt ?? "");
  if (managerPrompt) {
    lines.push(`Manager guidance: ${managerPrompt}`);
  }
  return lines;
}

function buildSpecialistPrompt(params: {
  config: MaumauConfig;
  team: TeamConfig;
  agentId: string;
  role: string;
  description?: string;
}): string[] {
  const agentName = resolveAgentDisplayName(params.config, params.agentId);
  const lines = [
    `You are the ${params.role} specialist for team "${params.team.name?.trim() || params.team.id}".`,
    `Use the Maumau agent id \`${params.agentId}\` (${agentName}).`,
    "Work on the portion of the task that matches your role and return clear artifacts for the manager.",
  ];
  const description = sanitizePromptLine(params.description ?? "");
  if (description) {
    lines.push(`Role guidance: ${description}`);
  }
  return lines;
}

type SpecialistBinding = {
  member: TeamMemberConfig;
  binding: string;
};

function findSpecialistBindingByRole(
  specialistBindings: SpecialistBinding[],
  role: string,
): SpecialistBinding | undefined {
  const targetRole = normalizeRoleKey(role);
  return specialistBindings.find((entry) => normalizeRoleKey(entry.member.role) === targetRole);
}

function buildAgentRunLines(params: {
  binding: string;
  prompt: string;
  context: string[];
  variableName?: string;
  declaration?: "let" | "const";
  mode?: "session" | "resume";
}): string[] {
  const variableName = params.variableName ?? params.binding;
  const mode = params.mode ?? "session";
  const declaration = params.declaration ? `${params.declaration} ` : "";
  return [
    `${declaration}${variableName} = ${mode}: ${params.binding}`,
    `  prompt: "${params.prompt.replace(/"/g, '\\"')}"`,
    `  context: { ${params.context.join(", ")} }`,
  ];
}

function buildVibeCoderStarterFlow(
  specialistBindings: SpecialistBinding[],
  synthesisPrompt: string,
): string[] | null {
  const architect = findSpecialistBindingByRole(specialistBindings, "system architect");
  const developer = findSpecialistBindingByRole(specialistBindings, "developer");
  const uiUxDesigner = findSpecialistBindingByRole(specialistBindings, "ui ux designer");
  const contentVisualDesigner = findSpecialistBindingByRole(
    specialistBindings,
    "content visual designer",
  );
  const technicalQa = findSpecialistBindingByRole(specialistBindings, "technical qa");
  const visualUxQa = findSpecialistBindingByRole(specialistBindings, "visual ux qa");

  if (
    !architect ||
    !developer ||
    !uiUxDesigner ||
    !contentVisualDesigner ||
    !technicalQa ||
    !visualUxQa
  ) {
    return null;
  }

  return [
    "",
    "# Step 1: the manager plans the work and defines the stage gates",
    "let plan = session: manager",
    '  prompt: "Break down the task into architecture, execution, QA verification, and completion stages. Track stage status explicitly and do not let QA begin until execution is complete."',
    "  context: { task }",
    "",
    "# Step 2: the system architect owns the architecture stage",
    ...buildAgentRunLines({
      variableName: "architecture",
      binding: architect.binding,
      declaration: "let",
      prompt:
        "Define the architecture, interfaces, implementation plan, and key technical tradeoffs for the task. Return work that is ready for manager approval.",
      context: ["task", "plan"],
    }),
    "",
    'loop until **the architecture is approved for execution** (max: 3):',
    ...indent(
      buildAgentRunLines({
        variableName: "architecture_review",
        binding: "manager",
        declaration: "let",
        mode: "resume",
        prompt:
          "Review the architecture and decide whether the task can move from architecture review to execution. If blocked, call out the required revisions and the exact stage status.",
        context: ["task", "plan", "architecture"],
      }),
      "  ",
    ),
    '  if **the architecture still needs revision before execution can begin**:',
    ...indent(
      buildAgentRunLines({
        variableName: "architecture",
        binding: architect.binding,
        mode: "resume",
        prompt:
          "Revise the architecture to address the manager review. Resolve every blocking issue before handing it back for approval.",
        context: ["task", "plan", "architecture", "architecture_review"],
      }),
      "    ",
    ),
    "",
    'if **the architecture is still not approved for execution**:',
    "  output result = session: manager",
    '    prompt: "The task is blocked in architecture review. Summarize the current stage status, unresolved blockers, and the next actions required before execution can start."',
    "    context: { task, plan, architecture, architecture_review }",
    "  return",
    "",
    "# Step 3: implementation and design execute only after architecture approval",
    ...buildAgentRunLines({
      variableName: "execution_stage",
      binding: "manager",
      declaration: "let",
      mode: "resume",
      prompt:
        "Move the task into execution. Developer and design specialists should now produce completed work that is ready for QA verification.",
      context: ["task", "plan", "architecture", "architecture_review"],
    }),
    "",
    "parallel:",
    ...indent(
      buildAgentRunLines({
        binding: developer.binding,
        prompt:
          "Implement the solution following the approved architecture. Return completed technical work that is ready for QA verification.",
        context: ["task", "plan", "architecture", "execution_stage"],
      }),
      "  ",
    ),
    ...indent(
      buildAgentRunLines({
        binding: uiUxDesigner.binding,
        prompt:
          "Design the interaction flow, structure, and usability approach that fits the approved architecture. Return completed UX work that is ready for QA verification.",
        context: ["task", "plan", "architecture", "execution_stage"],
      }),
      "  ",
    ),
    ...indent(
      buildAgentRunLines({
        binding: contentVisualDesigner.binding,
        prompt:
          "Create the content direction, copy, and visual presentation guidance that supports the approved architecture. Return completed work that is ready for QA verification.",
        context: ["task", "plan", "architecture", "execution_stage"],
      }),
      "  ",
    ),
    "",
    "# Step 4: QA verifies completed work and sends failures back for rework",
    'loop until **technical QA and visual UX QA both approve the completed work** (max: 3):',
    ...indent(
      buildAgentRunLines({
        variableName: "qa_stage",
        binding: "manager",
        declaration: "let",
        mode: "resume",
        prompt:
          "Move the task into QA verification. QA should review only completed work. If either review blocks the task, send it back to rework instead of closing it.",
        context: [
          "task",
          "plan",
          "architecture",
          "execution_stage",
          developer.binding,
          uiUxDesigner.binding,
          contentVisualDesigner.binding,
        ],
      }),
      "  ",
    ),
    "  parallel:",
    ...indent(
      buildAgentRunLines({
        variableName: "technical_review",
        binding: technicalQa.binding,
        prompt:
          "Review the architecture and implementation for correctness, regressions, edge cases, test gaps, and technical risk. Approve only if the work is ready to ship.",
        context: [
          "task",
          "plan",
          "architecture",
          "execution_stage",
          "qa_stage",
          developer.binding,
          uiUxDesigner.binding,
          contentVisualDesigner.binding,
        ],
      }),
      "    ",
    ),
    ...indent(
      buildAgentRunLines({
        variableName: "experience_review",
        binding: visualUxQa.binding,
        prompt:
          "Review the completed implementation and design outputs for usability, accessibility, visual consistency, copy quality, and overall experience readiness. Approve only if the work is ready for release.",
        context: [
          "task",
          "plan",
          "architecture",
          "execution_stage",
          "qa_stage",
          developer.binding,
          uiUxDesigner.binding,
          contentVisualDesigner.binding,
        ],
      }),
      "    ",
    ),
    '  if **either QA review has blocking issues or requests changes before the task can close**:',
    ...indent(
      buildAgentRunLines({
        variableName: "rework_stage",
        binding: "manager",
        declaration: "let",
        mode: "resume",
        prompt:
          "QA found blocking issues. Move the task back to rework, summarize the blockers, and direct the execution specialists on exactly what to revise before the next QA pass.",
        context: [
          "task",
          "plan",
          "architecture",
          "execution_stage",
          "qa_stage",
          developer.binding,
          uiUxDesigner.binding,
          contentVisualDesigner.binding,
          "technical_review",
          "experience_review",
        ],
      }),
      "    ",
    ),
    "    parallel:",
    ...indent(
      buildAgentRunLines({
        binding: developer.binding,
        mode: "resume",
        prompt:
          "Address the implementation issues raised during review. Return updated work that is ready for another QA pass.",
        context: [
          "task",
          "plan",
          "architecture",
          "execution_stage",
          "rework_stage",
          developer.binding,
          uiUxDesigner.binding,
          contentVisualDesigner.binding,
          "technical_review",
          "experience_review",
        ],
      }),
      "      ",
    ),
    ...indent(
      buildAgentRunLines({
        binding: uiUxDesigner.binding,
        mode: "resume",
        prompt:
          "Address the interaction, usability, and UX issues raised during review. Return updated work that is ready for another QA pass.",
        context: [
          "task",
          "plan",
          "architecture",
          "execution_stage",
          "rework_stage",
          developer.binding,
          uiUxDesigner.binding,
          contentVisualDesigner.binding,
          "technical_review",
          "experience_review",
        ],
      }),
      "      ",
    ),
    ...indent(
      buildAgentRunLines({
        binding: contentVisualDesigner.binding,
        mode: "resume",
        prompt:
          "Address the content, copy, and visual presentation issues raised during review. Return updated work that is ready for another QA pass.",
        context: [
          "task",
          "plan",
          "architecture",
          "execution_stage",
          "rework_stage",
          developer.binding,
          uiUxDesigner.binding,
          contentVisualDesigner.binding,
          "technical_review",
          "experience_review",
        ],
      }),
      "      ",
    ),
    "",
    'if **technical QA or visual UX QA still has blocking issues after the rework loop**:',
    "  output result = session: manager",
    '    prompt: "The task remains blocked in QA. Summarize the current stage status, unresolved blockers, and the work that must happen before the task can be marked done."',
    `    context: { task, plan, architecture, execution_stage, qa_stage, ${[
      developer.binding,
      uiUxDesigner.binding,
      contentVisualDesigner.binding,
      "technical_review",
      "experience_review",
    ].join(", ")} }`,
    "  return",
    "",
    "# Step 5: the manager closes the task after QA approval",
    ...buildAgentRunLines({
      variableName: "final_signoff",
      binding: "manager",
      declaration: "let",
      mode: "resume",
      prompt:
        "QA approved the work. Mark the task as done, summarize the final stage transitions, and note any follow-up items that still need human decisions.",
      context: [
        "task",
        "plan",
        "architecture",
        "execution_stage",
        "qa_stage",
        developer.binding,
        uiUxDesigner.binding,
        contentVisualDesigner.binding,
        "technical_review",
        "experience_review",
      ],
    }),
    "",
    "# Step 6: the manager synthesizes the team result",
    "output result = session: manager",
    `  prompt: "${synthesisPrompt.replace(/"/g, '\\"')}"`,
    `  context: { task, plan, architecture, execution_stage, qa_stage, final_signoff, ${[
      developer.binding,
      uiUxDesigner.binding,
      contentVisualDesigner.binding,
      "technical_review",
      "experience_review",
    ].join(", ")} }`,
  ];
}

export function generateTeamOpenProsePreview(params: {
  config: MaumauConfig;
  team: TeamConfig;
  workflowId?: string;
}): string {
  const { config, team } = params;
  const workflow = findTeamWorkflow(team, params.workflowId);
  const teamName = team.name?.trim() || team.id;
  const specialists = listTeamMembers(team);
  const usedIdentifiers = new Set<string>();
  const specialistBindings = specialists.map((member, index) => ({
    member,
    binding: toIdentifier(member.role, index, usedIdentifiers),
  }));
  const managerPrompt = buildManagerPrompt(team, workflow);
  const synthesisPrompt =
    sanitizePromptLine(workflow.synthesisPrompt ?? "") ||
    "Synthesize the specialist outputs into one practical answer for the user.";
  const stagedStarterFlow = buildVibeCoderStarterFlow(specialistBindings, synthesisPrompt);

  const lines: string[] = [
    "# Generated by Maumau Teams. Edit the Team definition instead of this preview.",
    `# team-id: ${team.id}`,
    `# workflow-id: ${workflow.id}`,
    `# manager-agent-id: ${team.managerAgentId}`,
  ];
  if (workflow.name?.trim()) {
    lines.push(`# workflow-name: ${workflow.name.trim()}`);
  }
  if (Array.isArray(team.crossTeamLinks) && team.crossTeamLinks.length > 0) {
    lines.push(
      `# cross-team-links: ${team.crossTeamLinks
        .map((entry) => `${entry.type}:${entry.targetId}`)
        .join(", ")}`,
    );
  }
  lines.push(
    "",
    'input task: "Task forwarded from teams_run"',
    "",
    "agent manager:",
    ...proseMultiline(managerPrompt),
  );

  for (const entry of specialistBindings) {
    lines.push(
      "",
      `agent ${entry.binding}:`,
      ...proseMultiline(
        buildSpecialistPrompt({
          config,
          team,
          agentId: entry.member.agentId,
          role: entry.member.role,
          description: entry.member.description,
        }),
      ),
    );
  }

  if (stagedStarterFlow) {
    lines.push(...stagedStarterFlow);
  } else if (specialists.length > 0) {
    lines.push(
      "",
      "# Step 1: the manager plans the work",
      "let plan = session: manager",
      '  prompt: "Break down the task into specialist workstreams and decide what should run in parallel."',
      "  context: { task }",
    );
    lines.push("", "# Step 2: specialists work in parallel", "parallel:");
    for (const entry of specialistBindings) {
      lines.push(
        ...indent(
          [
            `${entry.binding} = session: ${entry.binding}`,
            `  prompt: "Handle the ${entry.member.role} portion of the task."`,
            "  context: { task, plan }",
          ],
          "  ",
        ),
      );
    }
    lines.push(
      "",
      "# Step 3: the manager synthesizes the team result",
      "output result = session: manager",
      `  prompt: "${synthesisPrompt.replace(/"/g, '\\"')}"`,
      `  context: { task, plan, ${specialistBindings.map((entry) => entry.binding).join(", ")} }`,
    );
  } else {
    lines.push(
      "",
      "# Step 1: the manager plans the work",
      "let plan = session: manager",
      '  prompt: "Break down the task and decide the best approach before responding."',
      "  context: { task }",
      "",
      "",
      "output result = session: manager",
      `  prompt: "${synthesisPrompt.replace(/"/g, '\\"')}"`,
      "  context: { task, plan }",
    );
  }

  lines.push("", `# End of generated team workflow for ${teamName} / ${workflow.id}`);
  return lines.join("\n");
}
