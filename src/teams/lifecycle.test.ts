import { describe, expect, it } from "vitest";
import {
  findLifecycleStageById,
  findLifecycleStageByRole,
  resolveConfiguredTeamWorkflowLifecycleStages,
  resolveTeamWorkflowLifecycleStages,
} from "./lifecycle.js";

describe("team workflow lifecycle helpers", () => {
  it("normalizes configured lifecycle stages", () => {
    const workflow = {
      lifecycle: {
        stages: [
          { id: " Planning ", name: " Planning ", status: "idle", roles: ["Planner"] },
          { id: "", status: "review", roles: ["Developer", "developer"] },
          { id: "planning", status: "blocked" },
        ],
      },
    };

    expect(resolveConfiguredTeamWorkflowLifecycleStages(workflow)).toEqual([
      {
        id: "planning",
        name: "Planning",
        status: "idle",
        roles: ["planner"],
      },
      {
        id: "stage-2",
        name: "Stage 2",
        status: "review",
        roles: ["developer"],
      },
    ]);
  });

  it("falls back to a single working stage for legacy workflows", () => {
    expect(resolveTeamWorkflowLifecycleStages({ id: "default" })).toEqual([
      {
        id: "working",
        name: "Working",
        status: "in_progress",
        roles: [],
      },
    ]);
  });

  it("finds lifecycle stages by id and role", () => {
    const workflow = {
      id: "default",
      lifecycle: {
        stages: [
          { id: "architecture", status: "in_progress", roles: ["system architect"] },
          { id: "qa", status: "review", roles: ["technical qa"] },
        ],
      },
    };

    expect(findLifecycleStageById(workflow, "QA")).toMatchObject({ id: "qa", status: "review" });
    expect(findLifecycleStageByRole(workflow, "system architect")).toMatchObject({
      id: "architecture",
    });
  });
});
