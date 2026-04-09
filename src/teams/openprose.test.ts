import { describe, expect, it } from "vitest";
import { generateTeamOpenProsePreview } from "./openprose.js";
import {
  createDesignStudioTeamAgents,
  createDesignStudioTeamConfig,
  createMainOrchestrationTeamConfig,
  createStarterTeamAgents,
  createStarterTeamConfig,
} from "./presets.js";

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
    expect(preview).toContain("Structured lifecycle stages: Working.");
    expect(preview).toContain("Emit lifecycle updates as standalone `WORK_ITEM:` JSON lines");
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
    const starterTeam = createStarterTeamConfig({
      linkedTeamIds: ["vibe-coder", "design-studio"] as const,
    });
    const preview = generateTeamOpenProsePreview({
      config: {
        agents: {
          list: [...createStarterTeamAgents(), ...createDesignStudioTeamAgents()],
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
      "# Step 4: the manager optionally uses linked design-team runs for asset work",
    );
    expect(preview).toContain(
      "Decide whether one or more linked design-team runs are needed from: design-studio",
    );
    expect(preview).toContain("placeholder asset register");
    expect(preview).toContain("exact placement or UI location");
    expect(preview).toContain("what the asset should depict or communicate");
    expect(preview).toContain("asset-only delegation brief");
    expect(preview).toContain(
      "at least one prominent illustration, image, or hero visual, or a clearly intentional icon system used in key places",
    );
    expect(preview).toContain(
      "block approval if the result lacks both a prominent illustration/image/hero visual and meaningful icon use in key places",
    );
    expect(preview).toContain(
      "Do not satisfy illustration, hero visual, or other prominent decorative image requirements with vector art, SVG illustration, CSS-only composition, code-native decorative graphics, emoji, Unicode symbols, or typography tricks.",
    );
    expect(preview).toContain(
      "emoji, Unicode symbols, letters, punctuation, and decorative glyphs are not acceptable icon replacements.",
    );
    expect(preview).toContain(
      "If the final deliverable is a built webpage, app, screen, or other implemented UI/product artifact, vibe-coder remains the implementation owner",
    );
    expect(preview).toContain("implementation stays in vibe-coder");
    expect(preview).toContain("mapped back to those placeholder asset ids");
    expect(preview).toContain("design_team_result = resume: manager");
    expect(preview).toContain(
      "# Step 5: QA verifies completed work and sends failures back for rework",
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
    expect(preview).toContain(
      "Never claim work, approvals, or decisions that did not actually happen in your own role session.",
    );
    expect(preview).toContain(
      "You verify only. Do not implement fixes, redesign the product, or claim manager decisions or other specialists' work.",
    );
    expect(preview).toContain("developer = resume: developer");
    expect(preview).toContain("let final_signoff = resume: manager");
    expect(preview).toContain(
      "context: { task, plan, architecture, execution_stage, design_team_stage }",
    );
    expect(preview).toContain(
      "The generated OpenProse workflow is the execution contract, not an illustrative outline.",
    );
    expect(preview).toContain(
      "Manager-authored reasoning, self-review, or commentary does not satisfy required specialist or QA participation.",
    );
    expect(preview).toContain(
      "When spawning same-team specialist work, target the bound specialist instead of the manager.",
    );
    expect(preview).toContain('`teamRun.kind="team_run"`');
    expect(preview).toContain(
      "prefer a durable preview link over only local paths or LAN URLs whenever capability truth says private preview is ready.",
    );
    expect(preview).toContain("FILE:<workspace-relative-path>");
    expect(preview).toContain("return a requester-openable non-loopback URL");
  });

  it("encodes the design-studio asset loop and image generation contract", () => {
    const designStudio = createDesignStudioTeamConfig();
    const preview = generateTeamOpenProsePreview({
      config: {
        agents: {
          list: createDesignStudioTeamAgents(),
        },
      },
      team: designStudio,
    });

    expect(preview).toContain("# Step 0: the manager confirms this is asset-only design work");
    expect(preview).toContain(
      "This team does not implement webpages, apps, screens, or product code.",
    );
    expect(preview).toContain(
      "# Step 1: the manager defines the asset manifest and the consistency guide",
    );
    expect(preview).toContain("let asset_manifest = resume: manager");
    expect(preview).toContain("let consistency_guide = resume: manager");
    expect(preview).toContain("let approved_assets = resume: manager");
    expect(preview).toContain("If an upstream placeholder asset register exists");
    expect(preview).toContain("Preserve each placeholder asset id or name");
    expect(preview).toContain("exact placement or UI location");
    expect(preview).toContain(
      "loop until **all required assets are approved or the run is blocked** (max: 8):",
    );
    expect(preview).toContain("Create option 1 for the current vector asset.");
    expect(preview).toContain("Create option 1 for the current image asset.");
    expect(preview).toContain(
      "Use image_generate for the actual raster generation or editing work.",
    );
    expect(preview).toContain(
      "Prefer vector directions, specs, SVG-friendly structure, and text/file outputs for icons or simple code-native graphic elements only.",
    );
    expect(preview).toContain(
      "Human characters, portraits, creatures, scenes, figurative illustration, painterly work, photorealistic work, anything explicitly requested as an illustration, and any asset meant to serve as a prominent hero image or decorative page illustration must be assigned to the image lane.",
    );
    expect(preview).toContain(
      "If the deliverable is described as an illustration, it belongs in this image lane rather than the vector lane.",
    );
    expect(preview).toContain(
      "Use this lane only for icons and simple graphic elements that will be rendered or animated directly in code, such as SVG/CSS/canvas motion graphics.",
    );
    expect(preview).toContain(
      "Do not use emoji, Unicode symbols, letters, punctuation, or decorative glyphs as replacements for real icons.",
    );
    expect(preview).toContain(
      "Do not return HTML, CSS, JS, webpage implementation, character art, portraits, creatures, scene illustration, hero illustration, or any other illustration work.",
    );
    expect(preview).toContain(
      "Emoji, Unicode symbols, letters, punctuation, and decorative glyphs are never valid substitutes for icon assets or illustration deliverables.",
    );
    expect(preview).toContain(
      "Do not substitute CSS-only direction, vector specs, SVG illustration, implementation notes, emoji, Unicode symbols, or other stand-ins for an image-lane deliverable.",
    );
    expect(preview).toContain(
      "Reject any option that drifted into webpage/app implementation, figurative illustration, hero illustration, emoji-based iconography, glyph substitution, or any other illustration work.",
    );
    expect(preview).toContain(
      "Block emoji, Unicode symbols, letters, punctuation, decorative glyph stand-ins, and any illustration drift.",
    );
    expect(preview).toContain(
      "including the placeholder asset location, intended purpose, and any slot constraints.",
    );
    expect(preview).toContain("QA_APPROVAL: approved or QA_APPROVAL: blocked.");
    expect(preview).toContain(
      "Verify the selected image candidate against the shared consistency guide",
    );
    expect(preview).toContain("approved_assets");
  });

  it("encodes root orchestration teams as routing flows instead of generic parallel specialists", () => {
    const preview = generateTeamOpenProsePreview({
      config: {
        agents: {
          list: [
            { id: "main", name: "Main" },
            ...createStarterTeamAgents(),
            ...createDesignStudioTeamAgents(),
          ],
        },
      },
      team: createMainOrchestrationTeamConfig(),
    });

    expect(preview).toContain(
      "# Step 1: the manager triages the request and chooses the execution path",
    );
    expect(preview).toContain("execution_worker_result = session: execution_worker");
    expect(preview).toContain(
      "use teams_run with the chosen linked team instead of sessions_spawn.",
    );
    expect(preview).toContain(
      "Choose the initial linked team or linked-team sequence from: vibe-coder (Use for staged UI/product implementation, architecture, development, and ship-readiness QA.), design-studio (Use for asset-only design exploration, vector/raster asset generation, and visual consistency QA. Not for full page/app implementation.).",
    );
    expect(preview).toContain(
      "If the final deliverable is a built webpage, app, screen, or other implemented UI/product artifact, choose the implementation team first as the initial owner.",
    );
    expect(preview).toContain(
      "That stays true even if the request also asks for images, illustrations, placeholder assets, moodboards, SVG/CSS motifs, art direction, visual systems, or design-studio collaboration.",
    );
    expect(preview).toContain(
      "Choose the asset-only design team first only when the requested deliverable is asset-only and does not include page/app implementation.",
    );
    expect(preview).toContain(
      "plan for durable preview delivery instead of only local paths or LAN URLs whenever capability truth says private preview is ready.",
    );
    expect(preview).toContain(
      "If you produced a previewable HTML/static web artifact for a remote/chat requester and capability truth says private preview is ready, return the durable preview link instead of only local paths or LAN URLs.",
    );
    expect(preview).toContain("FILE:<workspace-relative-path>");
    expect(preview).toContain(
      "verified requester-openable non-loopback fallback URL instead of only localhost instructions or filesystem paths",
    );
    expect(preview).toContain("context: { task, triage, linked_team_stage, linked_team_result }");
    expect(preview).not.toContain("# Step 2: specialists work in parallel");
  });
});
