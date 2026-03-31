import { describe, expect, it } from "vitest";
import { generateTeamOpenProsePreview } from "./openprose.js";
import { createStarterTeamAgents, createStarterTeamConfig } from "./presets.js";

describe("generateTeamOpenProsePreview", () => {
  it("generates deterministic specialist bindings for colliding role names", () => {
    const preview = generateTeamOpenProsePreview({
      config: {
        agents: {
          list: [
            { id: "manager", name: "Manager" },
            { id: "designer-a", name: "Designer A" },
            { id: "designer-b", name: "Designer B" },
          ],
        },
      },
      team: {
        id: "design",
        managerAgentId: "manager",
        members: [
          { agentId: "designer-a", role: "UI/UX" },
          { agentId: "designer-b", role: "UI UX" },
        ],
      },
    });

    expect(preview).toContain("agent ui_ux:");
    expect(preview).toContain("agent ui_ux_2:");
    expect(preview).toContain("context: { task, plan, ui_ux, ui_ux_2 }");
  });

  it("includes cross-team metadata and manager-led workflow steps", () => {
    const preview = generateTeamOpenProsePreview({
      config: {
        agents: {
          list: [{ id: "manager" }, { id: "coder" }],
        },
      },
      team: {
        id: "vibe-coder",
        managerAgentId: "manager",
        members: [{ agentId: "coder", role: "coder" }],
        crossTeamLinks: [{ type: "team", targetId: "qa" }],
        workflows: [
          {
            id: "default",
            default: true,
            managerPrompt: "Delegate deliberately.",
            synthesisPrompt: "Return one answer.",
          },
        ],
      },
    });

    expect(preview).toContain("# cross-team-links: team:qa");
    expect(preview).toContain("# workflow-id: default");
    expect(preview).toContain("# Step 1: the manager plans the work");
    expect(preview).toContain("# Step 2: specialists work in parallel");
    expect(preview).toContain("# Step 3: the manager synthesizes the team result");
    expect(preview).toContain('prompt: "Return one answer."');
  });

  it("renders the selected workflow when multiple workflows exist", () => {
    const preview = generateTeamOpenProsePreview({
      config: {
        agents: {
          list: [{ id: "manager" }, { id: "coder" }],
        },
      },
      team: {
        id: "vibe-coder",
        managerAgentId: "manager",
        members: [{ agentId: "coder", role: "coder" }],
        workflows: [
          {
            id: "default",
            name: "Default Workflow",
            default: true,
            managerPrompt: "Handle general work.",
          },
          {
            id: "feature-build",
            name: "Feature Build",
            description: "Ship a new feature with implementation detail.",
            synthesisPrompt: "Return a build-ready plan.",
          },
        ],
      },
      workflowId: "feature-build",
    });

    expect(preview).toContain("# workflow-id: feature-build");
    expect(preview).toContain("# workflow-name: Feature Build");
    expect(preview).toContain("Workflow objective: Ship a new feature with implementation detail.");
    expect(preview).toContain('prompt: "Return a build-ready plan."');
  });

  it("encodes the staged vibe-coder starter workflow handoff", () => {
    const starterTeam = createStarterTeamConfig();
    const preview = generateTeamOpenProsePreview({
      config: {
        agents: {
          list: createStarterTeamAgents(),
        },
      },
      team: starterTeam,
    });

    expect(preview).toContain("# Step 2: the system architect owns the architecture stage");
    expect(preview).toContain(
      "loop until **the architecture is approved for execution** (max: 3):",
    );
    expect(preview).toContain(
      "# Step 3: implementation and design execute only after architecture approval",
    );
    expect(preview).toContain(
      "# Step 4: QA verifies completed work and sends failures back for rework",
    );
    expect(preview).toContain(
      "loop until **technical QA and visual UX QA both approve the completed work** (max: 3):",
    );
    expect(preview).toContain(
      "if **either QA review has blocking issues or requests changes before the task can close**:",
    );
    expect(preview).toContain("let architecture = session: system_architect");
    expect(preview).toContain("developer = session: developer");
    expect(preview).toContain("ui_ux_designer = session: ui_ux_designer");
    expect(preview).toContain("content_visual_designer = session: content_visual_designer");
    expect(preview).toContain("technical_review = session: technical_qa");
    expect(preview).toContain("experience_review = session: visual_ux_qa");
    expect(preview).toContain("developer = resume: developer");
    expect(preview).toContain("let final_signoff = resume: manager");
    expect(preview).toContain(
      "context: { task, plan, architecture, execution_stage, developer, ui_ux_designer, content_visual_designer }",
    );
  });
});
