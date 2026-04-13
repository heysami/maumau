import type { MaumauConfig } from "../config/config.js";
import type { TeamMemberConfig } from "../config/types.teams.js";
import type { TeamConfig, TeamWorkflowConfig } from "../config/types.teams.js";
import {
  LIFE_IMPROVEMENT_DOMAIN_GROUPS,
  LIFE_IMPROVEMENT_TEAM_ID,
} from "./life-improvement-preset.js";
import { resolveTeamWorkflowLifecycleStages } from "./lifecycle.js";
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
  const lifecycleStages = resolveTeamWorkflowLifecycleStages(workflow);
  const lines = [
    `You are the team manager for "${team.name?.trim() || team.id}".`,
    `Use the Maumau manager agent id \`${team.managerAgentId}\`.`,
    "Keep execution manager-led. Delegate specialist work deliberately and synthesize one final answer.",
  ];
  if (lifecycleStages.length > 0) {
    lines.push(
      `Structured lifecycle stages: ${lifecycleStages.map((stage) => stage.name ?? stage.id).join(" -> ")}.`,
    );
    lines.push(
      "Emit lifecycle updates as standalone `WORK_ITEM:` JSON lines when the team run starts, when you enter a stage, when you complete a stage, if the run becomes blocked, and when the run is done.",
    );
    lines.push(
      'Each lifecycle `WORK_ITEM:` line should include `teamRun.kind="team_run"`, `teamId`, `workflowId`, the current stage id/name, completed stage ids, and the coarse lifecycle status.',
    );
  }
  if (workflow.contract?.requireDelegation === true) {
    lines.push(
      "Workflow contract: delegation is required. Do not complete the task without specialist participation.",
    );
  }
  const requiredRoles = workflow.contract?.requiredRoles?.filter(Boolean) ?? [];
  if (requiredRoles.length > 0) {
    lines.push(`Required specialist roles: ${requiredRoles.join(", ")}.`);
  }
  const requiredQaRoles = workflow.contract?.requiredQaRoles?.filter(Boolean) ?? [];
  if (requiredQaRoles.length > 0) {
    lines.push(`Required QA approval roles: ${requiredQaRoles.join(", ")}.`);
  }
  lines.push(
    "The generated OpenProse workflow is the execution contract, not an illustrative outline.",
  );
  lines.push(
    "Manager-authored reasoning, self-review, or commentary does not satisfy required specialist or QA participation.",
  );
  lines.push(
    "When spawning same-team specialist work, target the bound specialist instead of the manager. Pass the explicit specialist agentId when possible, or keep the spawn label aligned with the configured role name so runtime can resolve the correct specialist session.",
  );
  if (requiredRoles.length > 0 || requiredQaRoles.length > 0) {
    lines.push(
      "A required role counts only when its bound specialist agent runs in a dedicated session. A required QA role counts only when its bound QA specialist returns `QA_APPROVAL: approved`.",
    );
  }
  lines.push(
    "If the task produces a previewable HTML/static web artifact for a remote/chat requester, prefer a durable preview link over only local paths or LAN URLs whenever capability truth says private preview is ready. If private preview is blocked because the requester is not on Tailscale, do not auto-create a public share; offer it only as an explicit opt-in with TTL disclosure.",
  );
  lines.push(
    "If durable preview publishing is unavailable for this requester or route but the user still needs a live previewable UI now, proactively arrange a simple host-local server, verify it, and return a requester-openable non-loopback URL instead of only localhost instructions or bare file paths.",
  );
  lines.push(
    "If you create or update a local previewable artifact and do not already have a preview/share URL, include a standalone `FILE:<workspace-relative-path>` line for the app file or directory in the final result so delivery can recognize it.",
  );
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
  const normalizedRole = normalizeRoleKey(params.role);
  const lines = [
    `You are the ${params.role} specialist for team "${params.team.name?.trim() || params.team.id}".`,
    `Use the Maumau agent id \`${params.agentId}\` (${agentName}).`,
    "Work on the portion of the task that matches your role and return clear artifacts for the manager.",
    "Never claim work, approvals, or decisions that did not actually happen in your own role session.",
  ];
  if (normalizedRole.includes("qa")) {
    lines.push(
      "You verify only. Do not implement fixes, redesign the product, or claim manager decisions or other specialists' work.",
    );
  } else {
    lines.push(
      "Stay inside your assigned role. Do not claim QA approval, manager signoff, or other specialists' deliverables.",
    );
  }
  if (normalizedRole === "image visual designer") {
    lines.push(
      "For raster image generation or editing, use `image_generate`. Do not present the session model itself as the drawing engine.",
    );
    lines.push(
      "If `image_generate` or an image-generation model/provider is unavailable, return a clear blocked result instead of pretending the image was produced.",
    );
    lines.push(
      "Use this lane for human characters, portraits, creatures, scenes, figurative illustration, painterly work, and other rendered imagery. If the deliverable is described as an illustration, it belongs in this image lane rather than the vector lane.",
    );
    lines.push(
      "If a built UI needs a hero illustration, character art, scene art, or other prominent decorative image, this lane owns it. Do not downgrade that requirement into vector art, SVG illustration, CSS-only composition, code-native decorative graphics, emoji, Unicode symbols, or typographic substitutes.",
    );
  }
  if (normalizedRole === "vector visual designer") {
    lines.push(
      "Prefer vector directions, specs, SVG-friendly structure, and text/file outputs for icons or simple code-native graphic elements only. Do not rely on `image_generate` unless a raster reference is explicitly required.",
    );
    lines.push(
      "Use this lane only for icons and simple graphic elements that will be rendered or animated directly in code, such as SVG/CSS/canvas motion graphics. Do not use it for illustrations of any kind, including human characters, portraits, creatures, scenes, figurative work, or painterly work.",
    );
    lines.push(
      "Do not use emoji, Unicode symbols, letters, punctuation, or decorative glyphs as replacements for real icons. If the product needs icons, specify or produce an actual icon system or code-native icon components.",
    );
  }
  if (normalizedRole === "content visual designer") {
    lines.push(
      "For built webpages, apps, screens, and other user-facing UI deliverables, do not settle for a text-only layout. Ensure the visual plan includes at least one prominent illustration, image, or hero visual, or a clearly intentional icon system used in key places.",
    );
    lines.push(
      "If those visuals are not final yet, define them explicitly in the placeholder asset register with their placement, purpose, and how the surrounding layout should feature them.",
    );
    lines.push(
      "If the page needs an illustration, specify it as an image-lane asset in the placeholder asset register. Do not classify illustration work as vector; vector is only for icons or simple code-native graphics that are rendered or animated in code.",
    );
    lines.push(
      "Do not satisfy illustration, hero visual, or other prominent decorative image requirements with vector art, SVG illustration, CSS-only composition, code-native decorative graphics, emoji, Unicode symbols, or typography tricks. If the plan uses icons, require actual icon assets or code-native icon components rather than emoji or other glyph substitutes.",
    );
  }
  if (normalizedRole === "visual ux qa") {
    lines.push(
      "For built webpages, apps, screens, and other user-facing UI deliverables, block approval if the result lacks both a prominent illustration/image/hero visual and meaningful icon use in key places.",
    );
    lines.push("Do not approve plain text-heavy layouts that omit both of those visual anchors.");
    lines.push(
      "If the deliverable includes or calls for an illustration, block approval when it is treated as a vector stand-in. Illustration work must stay in the image lane; vector is only acceptable for icons or simple code-native motion graphics.",
    );
    lines.push(
      "Block approval if a supposed icon system is implemented with emoji, Unicode symbols, letters, punctuation, or other glyph stand-ins instead of real icons. Also block any hero visual or illustration requirement that is satisfied with vector art, SVG illustration, CSS-only decorative composition, or other non-image stand-ins.",
    );
  }
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

function buildLinkedTeamChoicesDescription(team: TeamConfig): string {
  const linkedTeams = (Array.isArray(team.crossTeamLinks) ? team.crossTeamLinks : [])
    .filter((entry) => entry.type === "team")
    .map((entry) => {
      const targetId = sanitizePromptLine(entry.targetId);
      const description = sanitizePromptLine(entry.description ?? "");
      return description ? `${targetId} (${description})` : targetId;
    })
    .filter(Boolean);
  return linkedTeams.length > 0 ? linkedTeams.join(", ") : "a configured linked team";
}

function buildVibeCoderStarterFlow(params: {
  team: TeamConfig;
  specialistBindings: SpecialistBinding[];
  synthesisPrompt: string;
}): string[] | null {
  const { team, specialistBindings, synthesisPrompt } = params;
  const architect = findSpecialistBindingByRole(specialistBindings, "system architect");
  const developer = findSpecialistBindingByRole(specialistBindings, "developer");
  const uiUxDesigner = findSpecialistBindingByRole(specialistBindings, "ui ux designer");
  const contentVisualDesigner = findSpecialistBindingByRole(
    specialistBindings,
    "content visual designer",
  );
  const technicalQa = findSpecialistBindingByRole(specialistBindings, "technical qa");
  const visualUxQa = findSpecialistBindingByRole(specialistBindings, "visual ux qa");
  const linkedTeamChoices = buildLinkedTeamChoicesDescription(team);
  const hasLinkedDesignTeam = linkedTeamChoices !== "a configured linked team";

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
    "loop until **the architecture is approved for execution** (max: 3):",
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
    "  if **the architecture still needs revision before execution can begin**:",
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
    "if **the architecture is still not approved for execution**:",
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
          "Create the content direction, copy, visual presentation guidance, and any asset or visual-system requirements that support the approved architecture. For built webpages, apps, screens, and other user-facing UI deliverables, ensure the visual presentation includes at least one prominent illustration, image, or hero visual, or a clearly intentional icon system used in key places. If the implementation needs generated or externally produced visual assets, include a placeholder asset register that names each asset slot, where it will appear, what it should depict or communicate, and any known size, aspect, composition, or usage constraints. If the required visual anchor is not final yet, encode it explicitly in that placeholder asset register. If any placeholder asset is an illustration, hero visual, character art, scene art, or other prominent decorative image, mark it as image-lane work rather than vector work. Do not satisfy those requirements with vector art, SVG illustration, CSS-only composition, code-native decorative graphics, emoji, Unicode symbols, or typography tricks. Vector is reserved for icons or simple code-native graphics rendered or animated in code. If the plan relies on icons, specify the actual icon assets or code-native icon components required in each location; emoji, Unicode symbols, letters, punctuation, and decorative glyphs are not acceptable icon replacements. Return completed work plus that placeholder asset register as the linked design-team brief before QA verification.",
        context: ["task", "plan", "architecture", "execution_stage"],
      }),
      "  ",
    ),
    "",
    "# Step 4: the manager optionally uses linked design-team runs for asset work",
    ...buildAgentRunLines({
      variableName: "design_team_result",
      binding: "manager",
      declaration: "let",
      mode: "resume",
      prompt:
        "Initialize the linked design-team handoff state as not_required unless the content/visual brief now needs dedicated design exploration, vector/raster asset generation, or consistency-focused QA.",
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
    ...(hasLinkedDesignTeam
      ? [
          "",
          "if **the content or visual brief requires a linked design-team run before QA can begin**:",
          "  let design_team_stage = resume: manager",
          `    prompt: "Decide whether one or more linked design-team runs are needed from: ${linkedTeamChoices}. Be literal about ownership. If the final deliverable is a built webpage, app, screen, or other implemented UI/product artifact, vibe-coder remains the implementation owner even when the request also mentions images, illustration, visual systems, placeholder assets, moodboards, art direction, or design-studio by name. Use the linked design team only for explicit asset subsets that come from the placeholder asset register. Explain why the current execution lane is insufficient for those asset subsets, preserve the content/visual designer's placeholder asset register as the source of truth, and prepare an asset-only delegation brief that lists each placeholder asset id or name, exact placement or UI location, what the asset should depict or communicate, nearby context, and any known size, aspect, composition, or usage constraints. Use teams_run with the chosen linked team instead of sessions_spawn. The linked design team should return approved assets, visual directions, and QA notes mapped back to those placeholder asset ids; page/app implementation stays in vibe-coder."`,
          `    context: { task, plan, architecture, execution_stage, ${[
            developer.binding,
            uiUxDesigner.binding,
            contentVisualDesigner.binding,
          ].join(", ")} }`,
          "  design_team_result = resume: manager",
          '    prompt: "After the linked design team run completes, capture the chosen team id, workflow id, approved assets, QA state, and how each returned asset maps back to the placeholder asset ids that should feed into the vibe-coder QA stage."',
          "    context: { task, plan, architecture, execution_stage, design_team_stage }",
          "",
        ]
      : []),
    "# Step 5: QA verifies completed work and sends failures back for rework",
    "loop until **technical QA and visual UX QA both approve the completed work** (max: 3):",
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
          "design_team_result",
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
          "Review the architecture and implementation for correctness, regressions, edge cases, test gaps, and technical risk. Approve only if the work is ready to ship. End your reply with exactly one line: QA_APPROVAL: approved or QA_APPROVAL: blocked.",
        context: [
          "task",
          "plan",
          "architecture",
          "execution_stage",
          "qa_stage",
          "design_team_result",
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
          "Review the completed implementation and design outputs for usability, accessibility, visual consistency, copy quality, and overall experience readiness. For built webpages, apps, screens, and other user-facing UI deliverables, block approval if the result lacks both a prominent illustration/image/hero visual and meaningful icon use in key places. Do not approve plain text-heavy layouts that omit both of those visual anchors. If the deliverable uses or calls for illustration, hero art, character art, scene art, or another prominent decorative image, block approval if it is treated as vector work instead of image-lane work. Do not accept vector art, SVG illustration, CSS-only composition, code-native decorative graphics, emoji, Unicode symbols, or typography tricks as substitutes for required illustration. Vector is only acceptable here for icons or simple code-native graphics rendered or animated in code. If the UI relies on icons, block approval unless it uses actual icon assets or code-native icon components; emoji, Unicode symbols, letters, punctuation, and decorative glyphs do not count as icons. Approve only if the work is ready for release. End your reply with exactly one line: QA_APPROVAL: approved or QA_APPROVAL: blocked.",
        context: [
          "task",
          "plan",
          "architecture",
          "execution_stage",
          "qa_stage",
          "design_team_result",
          developer.binding,
          uiUxDesigner.binding,
          contentVisualDesigner.binding,
        ],
      }),
      "    ",
    ),
    "  if **either QA review has blocking issues or requests changes before the task can close**:",
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
          "design_team_result",
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
    ...(hasLinkedDesignTeam
      ? [
          ...indent(
            [
              "      if **the QA blockers require additional linked design-team work before the next QA pass**:",
              "        let design_rework_stage = resume: manager",
              `          prompt: "Decide whether one or more linked design-team runs are needed from: ${linkedTeamChoices}. Be literal about ownership: implementation still stays in vibe-coder, and the linked design team should return only updated assets or design guidance for placeholder asset subsets, not page/app implementation. Summarize the QA blockers that require asset-only linked design work, keep the existing placeholder asset register as the source of truth, and call out which placeholder asset ids, placements, or intended depictions need revision. Use teams_run with the chosen linked team instead of sessions_spawn."`,
              `          context: { task, plan, architecture, execution_stage, rework_stage, design_team_result, ${[
                developer.binding,
                uiUxDesigner.binding,
                contentVisualDesigner.binding,
                "technical_review",
                "experience_review",
              ].join(", ")} }`,
              "        design_team_result = resume: manager",
              '          prompt: "After the linked design-team rework completes, capture the updated approved assets, QA state, which placeholder asset ids were revised, and any remaining blockers for the next vibe-coder QA pass."',
              "          context: { task, plan, architecture, execution_stage, design_rework_stage }",
            ],
            "    ",
          ),
        ]
      : []),
    "",
    "if **technical QA or visual UX QA still has blocking issues after the rework loop**:",
    "  output result = session: manager",
    '    prompt: "The task remains blocked in QA. Summarize the current stage status, unresolved blockers, and the work that must happen before the task can be marked done."',
    `    context: { task, plan, architecture, execution_stage, qa_stage, design_team_result, ${[
      developer.binding,
      uiUxDesigner.binding,
      contentVisualDesigner.binding,
      "technical_review",
      "experience_review",
    ].join(", ")} }`,
    "  return",
    "",
    "# Step 6: the manager closes the task after QA approval",
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
        "design_team_result",
        developer.binding,
        uiUxDesigner.binding,
        contentVisualDesigner.binding,
        "technical_review",
        "experience_review",
      ],
    }),
    "",
    "# Step 7: the manager synthesizes the team result",
    "output result = session: manager",
    `  prompt: "${synthesisPrompt.replace(/"/g, '\\"')}"`,
    `  context: { task, plan, architecture, execution_stage, qa_stage, design_team_result, final_signoff, ${[
      developer.binding,
      uiUxDesigner.binding,
      contentVisualDesigner.binding,
      "technical_review",
      "experience_review",
    ].join(", ")} }`,
  ];
}

function buildDesignStudioFlow(
  specialistBindings: SpecialistBinding[],
  synthesisPrompt: string,
): string[] | null {
  const vectorDesigner = findSpecialistBindingByRole(specialistBindings, "vector visual designer");
  const imageDesigner = findSpecialistBindingByRole(specialistBindings, "image visual designer");
  const requirementsQa = findSpecialistBindingByRole(specialistBindings, "requirements qa");
  const consistencyQa = findSpecialistBindingByRole(specialistBindings, "consistency qa");

  if (!vectorDesigner || !imageDesigner || !requirementsQa || !consistencyQa) {
    return null;
  }

  return [
    "",
    "# Step 0: the manager confirms this is asset-only design work",
    "let scope_check = session: manager",
    '  prompt: "Decide whether the task is asset-only design work. This team does not implement webpages, apps, screens, or product code. If the task primarily asks for a built page/app/UI or other implementation deliverable, block clearly and say implementation should stay in vibe-coder while design-studio only returns asset deliverables, approved assets, and design guidance."',
    "  context: { task }",
    "",
    "if **the task primarily requires page, app, screen, or product implementation instead of asset-only design work**:",
    "  output result = session: manager",
    '    prompt: "The request is blocked for this team because it requires implementation instead of asset-only design work. Explain that design-studio only returns assets and design guidance, name the missing implementation lane, and summarize any asset brief that could still be delegated here later."',
    "    context: { task, scope_check }",
    "  return",
    "",
    "# Step 1: the manager defines the asset manifest and the consistency guide",
    "let plan = session: manager",
    '  prompt: "Break down the task into the required visual assets, how success will be evaluated, and when the run should stop as blocked versus done. Keep the plan asset-only: no page/app implementation tasks. If an upstream implementation team already provided a placeholder asset register, treat it as the source of truth for what assets exist, where they will be used, and what each one should depict or communicate."',
    "  context: { task, scope_check }",
    "",
    ...buildAgentRunLines({
      variableName: "asset_manifest",
      binding: "manager",
      declaration: "let",
      mode: "resume",
      prompt:
        "List the required assets as a manifest. Every manifest item must be an asset deliverable, not implementation work. If an upstream placeholder asset register exists, convert it into the manifest instead of inventing a different asset list. Preserve each placeholder asset id or name, exact placement or UI location, intended purpose, what the asset should depict or communicate, and any known slot constraints. Only merge, add, remove, or rename manifest items if you explain why. For each asset, define the user-facing purpose, the lane (vector or image), the required deliverable, the acceptance criteria, and how many exploratory options are needed between 1 and 3. Human characters, portraits, creatures, scenes, figurative illustration, painterly work, photorealistic work, anything explicitly requested as an illustration, and any asset meant to serve as a prominent hero image or decorative page illustration must be assigned to the image lane. The vector lane is only for actual icons and simple code-native graphic elements that will be rendered or animated directly in HTML/CSS/SVG/canvas. Emoji, Unicode symbols, letters, punctuation, and decorative glyphs are never valid substitutes for icon assets or illustration deliverables.",
      context: ["task", "scope_check", "plan"],
    }),
    "",
    ...buildAgentRunLines({
      variableName: "consistency_guide",
      binding: "manager",
      declaration: "let",
      mode: "resume",
      prompt:
        "Define the shared visual system for this run: style, palette, composition rules, consistency guardrails, and any constraints every asset must respect.",
      context: ["task", "plan", "asset_manifest"],
    }),
    "",
    ...buildAgentRunLines({
      variableName: "approved_assets",
      binding: "manager",
      declaration: "let",
      mode: "resume",
      prompt:
        "Initialize the approved asset register as empty. Track each approved asset, the chosen option, the placeholder asset ids or placements it satisfies, and any notes future assets must follow.",
      context: ["task", "asset_manifest", "consistency_guide"],
    }),
    "",
    "# Step 2: the manager loops asset-by-asset until the manifest is complete",
    "loop until **all required assets are approved or the run is blocked** (max: 8):",
    ...indent(
      buildAgentRunLines({
        variableName: "current_asset",
        binding: "manager",
        declaration: "let",
        mode: "resume",
        prompt:
          "Choose the next unapproved asset from asset_manifest. If all assets are approved, say that explicitly. Otherwise return the asset brief with the placeholder asset id or name, exact placement or UI location, intended purpose, what the asset should depict or communicate, the chosen lane, the required option count between 1 and 3, and the approval criteria for this asset. If the asset is human/character/portrait/creature/scene/figurative work, or if it is meant to serve as a hero illustration or other prominent decorative image, the lane must be image. If the asset is an icon request, require a real icon deliverable rather than emoji or glyph substitutions. If the manifest item drifted into page/app implementation, mark it blocked instead of assigning it to a production lane.",
        context: ["task", "asset_manifest", "consistency_guide", "approved_assets"],
      }),
      "  ",
    ),
    "  if **all required assets are already approved**:",
    ...indent(
      buildAgentRunLines({
        variableName: "final_signoff",
        binding: "manager",
        declaration: "let",
        mode: "resume",
        prompt:
          "All assets are approved. Mark the run as done, summarize the completed manifest, and list any follow-up items that still need a human decision.",
        context: ["task", "asset_manifest", "consistency_guide", "approved_assets"],
      }),
      "    ",
    ),
    "    output result = session: manager",
    `      prompt: "${synthesisPrompt.replace(/"/g, '\\"')}"`,
    "      context: { task, plan, asset_manifest, consistency_guide, approved_assets, final_signoff }",
    "    return",
    "",
    "  if **the current asset is blocked before production can start**:",
    "    output result = session: manager",
    '      prompt: "The design run is blocked before production can continue. Summarize the current asset, the unresolved blocker, and the next action required."',
    "      context: { task, asset_manifest, consistency_guide, approved_assets, current_asset }",
    "    return",
    "",
    "  if **the current asset belongs to the vector lane**:",
    "    let vector_option_2 = resume: manager",
    '      prompt: "Initialize the second vector option slot as not_requested unless the current asset brief requires it."',
    "      context: { current_asset }",
    "    let vector_option_3 = resume: manager",
    '      prompt: "Initialize the third vector option slot as not_requested unless the current asset brief requires it."',
    "      context: { current_asset }",
    "    loop until **the current vector asset is approved by requirements QA and consistency QA** (max: 3):",
    "      parallel:",
    ...indent(
      buildAgentRunLines({
        variableName: "vector_option_1",
        binding: vectorDesigner.binding,
        prompt:
          "Create option 1 for the current vector asset. Return vector directions, SVG-friendly structure, or vector-oriented deliverables that satisfy the asset brief and consistency guide. This lane is only for actual icons and simple code-native graphic elements meant to be rendered or animated directly in HTML/CSS/SVG/canvas. Do not use emoji, Unicode symbols, letters, punctuation, or decorative glyphs as icon replacements. Do not return HTML, CSS, JS, webpage implementation, character art, portraits, creatures, scene illustration, hero illustration, or any other illustration work.",
        context: [
          "task",
          "asset_manifest",
          "consistency_guide",
          "approved_assets",
          "current_asset",
        ],
      }),
      "        ",
    ),
    "        if **the current vector asset needs a second exploratory option**:",
    ...indent(
      buildAgentRunLines({
        variableName: "vector_option_2",
        binding: vectorDesigner.binding,
        prompt:
          "Create option 2 for the current vector asset. Make it meaningfully different from option 1 while staying inside the asset brief and consistency guide. Do not turn this lane into webpage/app implementation, figurative illustration, hero illustration, or any other illustration work, and do not use emoji or other glyph stand-ins instead of real icons.",
        context: [
          "task",
          "asset_manifest",
          "consistency_guide",
          "approved_assets",
          "current_asset",
          "vector_option_1",
        ],
      }),
      "          ",
    ),
    "        if **the current vector asset needs a third exploratory option**:",
    ...indent(
      buildAgentRunLines({
        variableName: "vector_option_3",
        binding: vectorDesigner.binding,
        prompt:
          "Create option 3 for the current vector asset. Make it meaningfully different from the earlier options while staying inside the asset brief and consistency guide. Do not turn this lane into webpage/app implementation, figurative illustration, hero illustration, or any other illustration work, and do not use emoji or other glyph stand-ins instead of real icons.",
        context: [
          "task",
          "asset_manifest",
          "consistency_guide",
          "approved_assets",
          "current_asset",
          "vector_option_1",
          "vector_option_2",
        ],
      }),
      "          ",
    ),
    ...indent(
      buildAgentRunLines({
        variableName: "vector_selected_candidate",
        binding: vectorDesigner.binding,
        declaration: "let",
        mode: "resume",
        prompt:
          "Compare the current vector options, choose the best candidate for this asset, and summarize why it best fits the brief and consistency guide. Reject any option that drifted into webpage/app implementation, figurative illustration, hero illustration, emoji-based iconography, glyph substitution, or any other illustration work.",
        context: [
          "task",
          "asset_manifest",
          "consistency_guide",
          "approved_assets",
          "current_asset",
          "vector_option_1",
          "vector_option_2",
          "vector_option_3",
        ],
      }),
      "      ",
    ),
    "      parallel:",
    ...indent(
      buildAgentRunLines({
        variableName: "vector_requirements_review",
        binding: requirementsQa.binding,
        prompt:
          "Verify the selected vector candidate against the current asset brief and requirements, including the placeholder asset location, intended purpose, any slot constraints, and the rule that vector deliverables may only be actual icons or simple code-native graphics. Block emoji, Unicode symbols, letters, punctuation, decorative glyph stand-ins, and any illustration drift. End your reply with exactly one line: QA_APPROVAL: approved or QA_APPROVAL: blocked.",
        context: ["task", "asset_manifest", "current_asset", "vector_selected_candidate"],
      }),
      "        ",
    ),
    ...indent(
      buildAgentRunLines({
        variableName: "vector_consistency_review",
        binding: consistencyQa.binding,
        prompt:
          "Verify the selected vector candidate against the shared consistency guide and approved assets. Block emoji or glyph stand-ins that break the intended icon system, and block any drift toward illustration or page implementation. End your reply with exactly one line: QA_APPROVAL: approved or QA_APPROVAL: blocked.",
        context: [
          "task",
          "consistency_guide",
          "approved_assets",
          "current_asset",
          "vector_selected_candidate",
        ],
      }),
      "        ",
    ),
    "      if **either QA review blocks the current vector asset**:",
    ...indent(
      buildAgentRunLines({
        variableName: "vector_rework",
        binding: "manager",
        declaration: "let",
        mode: "resume",
        prompt:
          "Summarize the blockers for the current vector asset and direct the vector designer on exactly what must change before the next QA pass.",
        context: [
          "task",
          "asset_manifest",
          "consistency_guide",
          "approved_assets",
          "current_asset",
          "vector_selected_candidate",
          "vector_requirements_review",
          "vector_consistency_review",
        ],
      }),
      "        ",
    ),
    ...indent(
      buildAgentRunLines({
        variableName: "vector_selected_candidate",
        binding: vectorDesigner.binding,
        mode: "resume",
        prompt:
          "Revise the selected vector candidate to address the QA blockers. Return work that is ready for another QA pass. Keep the deliverable asset-only and limited to actual icons or simple code-native graphics rendered or animated in code, never emoji or illustration stand-ins.",
        context: [
          "task",
          "asset_manifest",
          "consistency_guide",
          "approved_assets",
          "current_asset",
          "vector_selected_candidate",
          "vector_rework",
          "vector_requirements_review",
          "vector_consistency_review",
        ],
      }),
      "        ",
    ),
    "    if **the current vector asset still has blocking issues after the rework loop**:",
    "      output result = session: manager",
    '        prompt: "The design run remains blocked on a vector asset. Summarize the current asset, the unresolved blockers, and the next work required."',
    "        context: { task, asset_manifest, consistency_guide, approved_assets, current_asset, vector_selected_candidate, vector_requirements_review, vector_consistency_review }",
    "      return",
    ...indent(
      buildAgentRunLines({
        variableName: "approved_assets",
        binding: "manager",
        mode: "resume",
        prompt:
          "Add the approved vector asset and its selected candidate to the approved-assets register, then note what remains in the manifest.",
        context: [
          "task",
          "asset_manifest",
          "consistency_guide",
          "approved_assets",
          "current_asset",
          "vector_selected_candidate",
          "vector_requirements_review",
          "vector_consistency_review",
        ],
      }),
      "    ",
    ),
    "",
    "  if **the current asset belongs to the image lane**:",
    "    let image_option_2 = resume: manager",
    '      prompt: "Initialize the second image option slot as not_requested unless the current asset brief requires it."',
    "      context: { current_asset }",
    "    let image_option_3 = resume: manager",
    '      prompt: "Initialize the third image option slot as not_requested unless the current asset brief requires it."',
    "      context: { current_asset }",
    "    loop until **the current image asset is approved by requirements QA and consistency QA** (max: 3):",
    "      parallel:",
    ...indent(
      buildAgentRunLines({
        variableName: "image_option_1",
        binding: imageDesigner.binding,
        prompt:
          "Create option 1 for the current image asset. Use image_generate for the actual raster generation or editing work. Do not substitute CSS-only direction, vector specs, SVG illustration, implementation notes, emoji, Unicode symbols, or other stand-ins for an image-lane deliverable. If image_generate or an image-generation model/provider is unavailable, return a clear blocked result instead of pretending the image was produced.",
        context: [
          "task",
          "asset_manifest",
          "consistency_guide",
          "approved_assets",
          "current_asset",
        ],
      }),
      "        ",
    ),
    "        if **the current image asset needs a second exploratory option**:",
    ...indent(
      buildAgentRunLines({
        variableName: "image_option_2",
        binding: imageDesigner.binding,
        prompt:
          "Create option 2 for the current image asset. Use image_generate, make it meaningfully different from option 1, and block clearly if image generation is unavailable. Do not replace the asset with CSS-only guidance, vector-only guidance, SVG illustration, emoji, or glyph substitutions.",
        context: [
          "task",
          "asset_manifest",
          "consistency_guide",
          "approved_assets",
          "current_asset",
          "image_option_1",
        ],
      }),
      "          ",
    ),
    "        if **the current image asset needs a third exploratory option**:",
    ...indent(
      buildAgentRunLines({
        variableName: "image_option_3",
        binding: imageDesigner.binding,
        prompt:
          "Create option 3 for the current image asset. Use image_generate, make it meaningfully different from the earlier options, and block clearly if image generation is unavailable. Do not replace the asset with CSS-only guidance, vector-only guidance, SVG illustration, emoji, or glyph substitutions.",
        context: [
          "task",
          "asset_manifest",
          "consistency_guide",
          "approved_assets",
          "current_asset",
          "image_option_1",
          "image_option_2",
        ],
      }),
      "          ",
    ),
    ...indent(
      buildAgentRunLines({
        variableName: "image_selected_candidate",
        binding: imageDesigner.binding,
        declaration: "let",
        mode: "resume",
        prompt:
          "Compare the current image options, choose the best candidate for this asset, and summarize why it best fits the brief and consistency guide. If image generation is unavailable, state that clearly. Reject any attempt to downgrade the asset into vector specs, SVG illustration, emoji/glyph substitution, or page implementation.",
        context: [
          "task",
          "asset_manifest",
          "consistency_guide",
          "approved_assets",
          "current_asset",
          "image_option_1",
          "image_option_2",
          "image_option_3",
        ],
      }),
      "      ",
    ),
    "      parallel:",
    ...indent(
      buildAgentRunLines({
        variableName: "image_requirements_review",
        binding: requirementsQa.binding,
        prompt:
          "Verify the selected image candidate against the current asset brief and requirements, including the placeholder asset location, intended purpose, and any slot constraints. End your reply with exactly one line: QA_APPROVAL: approved or QA_APPROVAL: blocked.",
        context: ["task", "asset_manifest", "current_asset", "image_selected_candidate"],
      }),
      "        ",
    ),
    ...indent(
      buildAgentRunLines({
        variableName: "image_consistency_review",
        binding: consistencyQa.binding,
        prompt:
          "Verify the selected image candidate against the shared consistency guide and approved assets. End your reply with exactly one line: QA_APPROVAL: approved or QA_APPROVAL: blocked.",
        context: [
          "task",
          "consistency_guide",
          "approved_assets",
          "current_asset",
          "image_selected_candidate",
        ],
      }),
      "        ",
    ),
    "      if **either QA review blocks the current image asset**:",
    ...indent(
      buildAgentRunLines({
        variableName: "image_rework",
        binding: "manager",
        declaration: "let",
        mode: "resume",
        prompt:
          "Summarize the blockers for the current image asset and direct the image designer on exactly what must change before the next QA pass.",
        context: [
          "task",
          "asset_manifest",
          "consistency_guide",
          "approved_assets",
          "current_asset",
          "image_selected_candidate",
          "image_requirements_review",
          "image_consistency_review",
        ],
      }),
      "        ",
    ),
    ...indent(
      buildAgentRunLines({
        variableName: "image_selected_candidate",
        binding: imageDesigner.binding,
        mode: "resume",
        prompt:
          "Revise the selected image candidate to address the QA blockers. Use image_generate for raster updates, and return a clearly blocked result if image generation is unavailable. Do not swap the deliverable for CSS-only direction, vector guidance, SVG illustration, emoji, or glyph substitution.",
        context: [
          "task",
          "asset_manifest",
          "consistency_guide",
          "approved_assets",
          "current_asset",
          "image_selected_candidate",
          "image_rework",
          "image_requirements_review",
          "image_consistency_review",
        ],
      }),
      "        ",
    ),
    "    if **the current image asset still has blocking issues after the rework loop**:",
    "      output result = session: manager",
    '        prompt: "The design run remains blocked on an image asset. Summarize the current asset, the unresolved blockers, and the next work required."',
    "        context: { task, asset_manifest, consistency_guide, approved_assets, current_asset, image_selected_candidate, image_requirements_review, image_consistency_review }",
    "      return",
    ...indent(
      buildAgentRunLines({
        variableName: "approved_assets",
        binding: "manager",
        mode: "resume",
        prompt:
          "Add the approved image asset and its selected candidate to the approved-assets register, then note what remains in the manifest.",
        context: [
          "task",
          "asset_manifest",
          "consistency_guide",
          "approved_assets",
          "current_asset",
          "image_selected_candidate",
          "image_requirements_review",
          "image_consistency_review",
        ],
      }),
      "    ",
    ),
    "",
    "# Step 3: if the manager cannot finish the manifest inside the loop, return the blocker",
    "output result = session: manager",
    '  prompt: "The design run ended before every asset could be approved. Summarize the current manifest state, what was approved, and the blocker that stopped completion."',
    "  context: { task, plan, asset_manifest, consistency_guide, approved_assets, current_asset }",
  ];
}

function buildRootOrchestrationFlow(params: {
  team: TeamConfig;
  specialistBindings: SpecialistBinding[];
  synthesisPrompt: string;
}): string[] | null {
  if (params.team.implicitForManagerSessions !== true) {
    return null;
  }

  const executionWorker = findSpecialistBindingByRole(
    params.specialistBindings,
    "execution worker",
  );
  if (!executionWorker) {
    return null;
  }

  const linkedTeamsDescription = buildLinkedTeamChoicesDescription(params.team);

  return [
    "",
    "# Step 1: the manager triages the request and chooses the execution path",
    "let triage = session: manager",
    `  prompt: "Classify the task as one of: direct reply, execution worker, or linked team. Use direct reply only for casual chat, explanation, or lightweight read-only help. Use the execution worker for bounded execution, implementation, research, browser work, troubleshooting, or direct completion that does not need staged specialist collaboration. Use one or more linked teams when the task needs staged specialist handoffs. Be literal about team ownership. If the final deliverable is a built webpage, app, screen, or other implemented UI/product artifact, choose the implementation team first as the initial owner. That stays true even if the request also asks for images, illustrations, placeholder assets, moodboards, SVG/CSS motifs, art direction, visual systems, or design-studio collaboration. Choose the asset-only design team first only when the requested deliverable is asset-only and does not include page/app implementation: icons, logos, illustrations, image sets, moodboards, style guides, vector/raster option exploration, or consistency review. If a task spans both implementation and asset-design work, start with the implementation team and let that manager call the asset-only design team for the parts it owns. If the task will produce a previewable HTML/static web artifact for a remote/chat requester, plan for durable preview delivery instead of only local paths or LAN URLs whenever capability truth says private preview is ready. If durable preview publishing is unavailable for this requester or route, plan for a verified requester-openable non-loopback fallback URL instead of only filesystem paths. If you choose linked-team work, name the exact linked team id or sequence from: ${linkedTeamsDescription}."`,
    "  context: { task }",
    "",
    "if **the task can be completed as a direct manager reply without delegation**:",
    "  output result = session: manager",
    '    prompt: "Respond directly without delegation. Do not claim worker, team, QA, or preview activity that did not actually happen."',
    "    context: { task, triage }",
    "  return",
    "",
    "# Step 2: bounded execution runs through the execution worker",
    "if **the task fits bounded execution and does not require linked-team staging**:",
    ...indent(
      buildAgentRunLines({
        variableName: "execution_stage",
        binding: "manager",
        declaration: "let",
        mode: "resume",
        prompt:
          "Prepare a concise execution brief for the execution worker. Name the expected artifact, required capability path, and any preview, receipt, or QA follow-up the worker should return to the manager. If the task is producing an interactive or previewable web UI for a remote/chat requester, require durable preview delivery when capability truth says private preview is ready. If durable preview publishing is unavailable for this requester or route but the user still needs a live UI now, require a verified requester-openable non-loopback fallback URL instead of only localhost instructions or filesystem paths. If no preview/share URL is available yet, require a standalone FILE:<workspace-relative-path> line for the artifact.",
        context: ["task", "triage"],
      }),
      "  ",
    ),
    ...indent(
      buildAgentRunLines({
        variableName: "execution_worker_result",
        binding: executionWorker.binding,
        declaration: "let",
        prompt:
          "Complete the bounded execution task. Do not re-delegate. Return the completed result plus the capability path used, preview/share state, and any QA follow-up the manager should mention. If you produced a previewable HTML/static web artifact for a remote/chat requester and capability truth says private preview is ready, return the durable preview link instead of only local paths or LAN URLs. If durable preview publishing is unavailable for this requester or route but the user still needs a live UI now, proactively arrange a simple host-local server, verify it, and return a requester-openable non-loopback URL instead of only localhost instructions or filesystem paths. If no preview/share URL is available yet, include a standalone FILE:<workspace-relative-path> line for the artifact.",
        context: ["task", "triage", "execution_stage"],
      }),
      "  ",
    ),
    "  output result = session: manager",
    `    prompt: "${params.synthesisPrompt.replace(/"/g, '\\"')}"`,
    "    context: { task, triage, execution_stage, execution_worker_result }",
    "  return",
    "",
    "# Step 3: linked specialist teams own staged implementation or asset-design work",
    "if **the task requires staged specialist collaboration beyond the execution worker**:",
    "  let linked_team_stage = resume: manager",
    `    prompt: "Choose the initial linked team or linked-team sequence from: ${linkedTeamsDescription}. Explain why the execution worker lane is insufficient, prepare the delegation brief, and use teams_run with the chosen linked team instead of sessions_spawn. Be literal about ownership. If the final deliverable is a built webpage, app, screen, or other implemented UI/product artifact, choose the implementation team first even when the prompt also asks for images, illustration, placeholder assets, moodboards, visual systems, or design collaboration. Then let that manager involve the asset-only design team only for the asset subsets it owns. Choose the asset-only design team first only when the requested deliverable is asset-only and does not include page/app implementation. Require the asset-only design team to return assets or design guidance rather than page/app implementation. If the deliverable is a previewable UI artifact for a remote/chat requester, require the linked team to return preview/share state and the correct link when capability truth says private preview is ready. If durable preview publishing is unavailable for this requester or route but the user still needs a live UI now, require a verified requester-openable non-loopback fallback URL instead of only localhost instructions or filesystem paths. If no preview/share URL is available yet, require a standalone FILE:<workspace-relative-path> line for the artifact."`,
    "    context: { task, triage }",
    "  let linked_team_result = resume: manager",
    '    prompt: "After the linked team run completes, capture the chosen team id, workflow id, used specialists, QA state, preview/share state, and the deliverables that should flow into the final answer."',
    "    context: { task, triage, linked_team_stage }",
    "  output result = session: manager",
    `    prompt: "${params.synthesisPrompt.replace(/"/g, '\\"')}"`,
    "    context: { task, triage, linked_team_stage, linked_team_result }",
    "  return",
    "",
    "# Step 4: if routing stayed unresolved, the manager returns the blocker clearly",
    "output result = session: manager",
    '  prompt: "The task could not be routed cleanly. Summarize the blocker, the missing capability or decision, and the next step required before execution can begin."',
    "  context: { task, triage }",
  ];
}

function buildLifeImprovementFlow(params: {
  team: TeamConfig;
  specialistBindings: SpecialistBinding[];
  synthesisPrompt: string;
}): string[] | null {
  const normalizedTeamId = params.team.id.trim().toLowerCase();
  const presetId = params.team.preset?.id?.trim().toLowerCase();
  if (normalizedTeamId !== LIFE_IMPROVEMENT_TEAM_ID && presetId !== LIFE_IMPROVEMENT_TEAM_ID) {
    return null;
  }

  const knowledgeManager = findSpecialistBindingByRole(
    params.specialistBindings,
    "personal knowledge manager",
  );
  const analyst = findSpecialistBindingByRole(
    params.specialistBindings,
    "insight & pattern analyst",
  );
  const accountabilityPartner = findSpecialistBindingByRole(
    params.specialistBindings,
    "accountability partner",
  );
  const researchAssistant = findSpecialistBindingByRole(
    params.specialistBindings,
    "research assistant",
  );
  const lifeCoach = findSpecialistBindingByRole(params.specialistBindings, "life & mindset coach");

  if (!knowledgeManager || !analyst || !accountabilityPartner || !researchAssistant || !lifeCoach) {
    return null;
  }

  const domainGroups = LIFE_IMPROVEMENT_DOMAIN_GROUPS.map((group) => ({
    ...group,
    bindings: group.roles
      .map((role) => findSpecialistBindingByRole(params.specialistBindings, role))
      .filter((entry): entry is SpecialistBinding => Boolean(entry)),
  })).filter((group) => group.bindings.length > 0);

  const lines: string[] = [
    "",
    "# Step 0: the manager defines the primary user, scope, and available context",
    "let intake = session: manager",
    '  prompt: "Identify the primary user for this run, the working life-improvement goal, the available user or group structure, the related people who materially matter, and the most important missing context. Use other people only as supporting context for the primary user instead of replacing the subject of the plan. Treat the profile as incremental work instead of a giant all-domains intake, and when follow-up is needed, plan a slow getting-to-know-you arc that starts with day-to-day life before later hobbies, work shape, or family context."',
    "  context: { task }",
    "",
    "# Step 1: the core support roles build the dossier, context map, and activation plan",
    ...buildAgentRunLines({
      variableName: "subject_dossier",
      binding: knowledgeManager.binding,
      declaration: "let",
      prompt:
        "Create the canonical subject dossier and initial file map for this run. Center the dossier on the primary user, carry forward any user ids, group ids, relationship labels, and related-people context that matter, and propose note-file slots for the subject dossier, active domain notes, and cross-role dependency notes. Treat missing fields as future checkpoints instead of blockers unless they are required for the current recommendation.",
      context: ["task", "intake"],
    }),
    "",
    ...buildAgentRunLines({
      variableName: "context_research",
      binding: researchAssistant.binding,
      declaration: "let",
      prompt:
        "Summarize the most relevant background context for this run: related people, groups, routines, deadlines, cultural or social context, recent events, and any context gaps that the rest of the team should keep in view.",
      context: ["task", "intake", "subject_dossier"],
    }),
    "",
    ...buildAgentRunLines({
      variableName: "pattern_map",
      binding: analyst.binding,
      declaration: "let",
      prompt:
        "Connect the dots across the dossier and context. Identify the highest-leverage patterns, likely cause-and-effect chains, and which life domains seem active enough to deserve specialist work.",
      context: ["task", "intake", "subject_dossier", "context_research"],
    }),
    "",
    ...buildAgentRunLines({
      variableName: "guiding_principles",
      binding: lifeCoach.binding,
      declaration: "let",
      prompt:
        "Distill the user's purpose, values, direction, identity pressures, and motivating goals so the rest of the team can make aligned recommendations instead of piling up disconnected advice.",
      context: ["task", "intake", "subject_dossier", "context_research", "pattern_map"],
    }),
    "",
    ...buildAgentRunLines({
      variableName: "activation_plan",
      binding: "manager",
      declaration: "let",
      mode: "resume",
      prompt:
        "Choose the active domains and the smallest useful set of specialists for this run. Do not wake the whole roster by default. Explain which domains need direct work now, which can stay parked, what each active domain is trying to improve for the primary user, and which missing details can wait for later heartbeat check-ins or later getting-to-know-you turns instead of becoming a giant intake now.",
      context: [
        "task",
        "intake",
        "subject_dossier",
        "context_research",
        "pattern_map",
        "guiding_principles",
      ],
    }),
  ];

  for (const group of domainGroups) {
    const groupVar = `${group.id}_domain`;
    const specialistVars = group.bindings.map((entry) => `${group.id}_${entry.binding}`);
    lines.push(
      "",
      `# ${group.label} only activates when the manager says this domain matters now`,
      ...buildAgentRunLines({
        variableName: groupVar,
        binding: "manager",
        declaration: "let",
        mode: "resume",
        prompt: `Initialize the ${group.label.toLowerCase()} domain note as not_requested unless the activation plan says this domain needs specialist work now.`,
        context: [
          "task",
          "subject_dossier",
          "context_research",
          "pattern_map",
          "guiding_principles",
          "activation_plan",
        ],
      }),
      "",
      `if **the ${group.label.toLowerCase()} domain is active in the current plan**:`,
      "  parallel:",
    );

    for (const [index, entry] of group.bindings.entries()) {
      lines.push(
        ...indent(
          buildAgentRunLines({
            variableName: specialistVars[index],
            binding: entry.binding,
            mode: entry.binding === researchAssistant.binding ? "resume" : "session",
            prompt: `Handle the ${entry.member.role} portion of the ${group.label.toLowerCase()} domain for the primary user. Work from the dossier, related-people context, pattern map, and current domain brief. Return concrete recommendations, open questions, risks, and any dependency note another role should read.`,
            context: [
              "task",
              "subject_dossier",
              "context_research",
              "pattern_map",
              "guiding_principles",
              "activation_plan",
            ],
          }),
          "    ",
        ),
      );
    }

    lines.push(
      ...indent(
        buildAgentRunLines({
          variableName: groupVar,
          binding: "manager",
          mode: "resume",
          prompt: `Synthesize the ${group.label.toLowerCase()} specialists into one domain note. Capture the recommendations, the risks, the related-people context that matters, and the cross-role dependencies that should become dedicated dependency notes.`,
          context: [
            "task",
            "subject_dossier",
            "context_research",
            "pattern_map",
            "guiding_principles",
            "activation_plan",
            ...specialistVars,
          ],
        }),
        "  ",
      ),
    );
  }

  const domainVars = domainGroups.map((group) => `${group.id}_domain`);
  lines.push(
    "",
    "# Step 2: the analyst and knowledge manager turn domain work into explicit dependency files",
    ...buildAgentRunLines({
      variableName: "dependency_map",
      binding: analyst.binding,
      declaration: "let",
      mode: "resume",
      prompt:
        "Review the active domain notes and identify the cross-role dependencies that should become dedicated dependency notes. Name the source role, the target role, why the dependency matters, the specific recommendation or tension being handed off, and any related-people context that must travel with it.",
      context: [
        "task",
        "subject_dossier",
        "context_research",
        "pattern_map",
        "guiding_principles",
        "activation_plan",
        ...domainVars,
      ],
    }),
    "",
    ...buildAgentRunLines({
      variableName: "working_files",
      binding: knowledgeManager.binding,
      declaration: "let",
      mode: "resume",
      prompt:
        "Update the working file map for this run. Keep one canonical subject dossier file, one note file for each active domain, and one dependency note file for every material handoff named in dependency_map. Each dependency note should capture the source role, target role, recommendation, rationale, related-people context if any, and the open follow-up.",
      context: [
        "task",
        "subject_dossier",
        "context_research",
        "pattern_map",
        "guiding_principles",
        "activation_plan",
        ...domainVars,
        "dependency_map",
      ],
    }),
    "",
    "# Step 3: priorities and accountability turn the work into a real plan",
    ...buildAgentRunLines({
      variableName: "priority_plan",
      binding: lifeCoach.binding,
      declaration: "let",
      mode: "resume",
      prompt:
        "Turn the dossier, domain notes, and dependency map into a coherent priority stack. Name the highest-leverage changes, what should happen first, and how the plan stays aligned with the user's identity and values.",
      context: [
        "task",
        "subject_dossier",
        "context_research",
        "pattern_map",
        "guiding_principles",
        "activation_plan",
        ...domainVars,
        "dependency_map",
      ],
    }),
    "",
    ...buildAgentRunLines({
      variableName: "commitment_plan",
      binding: accountabilityPartner.binding,
      declaration: "let",
      prompt:
        "Turn the approved priorities into follow-through. Define the next commitments, check-in cadence, measurable progress signals, likely avoidance patterns, and what the user should revisit if the plan stalls.",
      context: [
        "task",
        "subject_dossier",
        "guiding_principles",
        "activation_plan",
        ...domainVars,
        "dependency_map",
        "priority_plan",
      ],
    }),
    "",
    "# Step 4: the manager closes with one synthesized life-improvement brief",
    "output result = session: manager",
    `  prompt: "${params.synthesisPrompt.replace(/"/g, '\\"')}"`,
    `  context: { task, intake, subject_dossier, context_research, pattern_map, guiding_principles, activation_plan, ${[
      ...domainVars,
      "dependency_map",
      "working_files",
      "priority_plan",
      "commitment_plan",
    ].join(", ")} }`,
  );

  return lines;
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
  const stagedStarterFlow = buildVibeCoderStarterFlow({
    team,
    specialistBindings,
    synthesisPrompt,
  });
  const designStudioFlow = buildDesignStudioFlow(specialistBindings, synthesisPrompt);
  const rootOrchestrationFlow = buildRootOrchestrationFlow({
    team,
    specialistBindings,
    synthesisPrompt,
  });
  const lifeImprovementFlow = buildLifeImprovementFlow({
    team,
    specialistBindings,
    synthesisPrompt,
  });

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

  if (designStudioFlow) {
    lines.push(...designStudioFlow);
  } else if (stagedStarterFlow) {
    lines.push(...stagedStarterFlow);
  } else if (rootOrchestrationFlow) {
    lines.push(...rootOrchestrationFlow);
  } else if (lifeImprovementFlow) {
    lines.push(...lifeImprovementFlow);
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
