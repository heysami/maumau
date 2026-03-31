import { describe, expect, it } from "vitest";
import {
  canTeamUseAgent,
  canTeamUseTeam,
  findTeamWorkflow,
  listAccessibleTeams,
  listTeamWorkflows,
  resolveDefaultTeamWorkflowId,
} from "./model.js";

const TEST_CONFIG = {
  teams: {
    list: [
      {
        id: "alpha",
        managerAgentId: "alpha-manager",
        members: [{ agentId: "alpha-coder", role: "coder" }],
        crossTeamLinks: [
          { type: "team", targetId: "beta" },
          { type: "agent", targetId: "shared-reviewer" },
        ],
      },
      {
        id: "beta",
        managerAgentId: "beta-manager",
        members: [],
      },
      {
        id: "gamma",
        managerAgentId: "gamma-manager",
        members: [],
      },
    ],
  },
};

describe("team model access rules", () => {
  it("allows intra-team agents and explicit linked agents only", () => {
    expect(
      canTeamUseAgent({
        cfg: TEST_CONFIG,
        sourceTeamId: "alpha",
        targetAgentId: "alpha-coder",
      }),
    ).toBe(true);
    expect(
      canTeamUseAgent({
        cfg: TEST_CONFIG,
        sourceTeamId: "alpha",
        targetAgentId: "shared-reviewer",
      }),
    ).toBe(true);
    expect(
      canTeamUseAgent({
        cfg: TEST_CONFIG,
        sourceTeamId: "alpha",
        targetAgentId: "gamma-manager",
      }),
    ).toBe(false);
  });

  it("allows same-team runs plus explicit cross-team links only", () => {
    expect(
      canTeamUseTeam({
        cfg: TEST_CONFIG,
        sourceTeamId: "alpha",
        targetTeamId: "alpha",
      }),
    ).toBe(true);
    expect(
      canTeamUseTeam({
        cfg: TEST_CONFIG,
        sourceTeamId: "alpha",
        targetTeamId: "beta",
      }),
    ).toBe(true);
    expect(
      canTeamUseTeam({
        cfg: TEST_CONFIG,
        sourceTeamId: "alpha",
        targetTeamId: "gamma",
      }),
    ).toBe(false);
  });

  it("marks runnable teams from the current team's explicit link graph", () => {
    expect(listAccessibleTeams(TEST_CONFIG, "alpha")).toEqual([
      expect.objectContaining({ team: expect.objectContaining({ id: "alpha" }), runnable: true }),
      expect.objectContaining({ team: expect.objectContaining({ id: "beta" }), runnable: true }),
      expect.objectContaining({ team: expect.objectContaining({ id: "gamma" }), runnable: false }),
    ]);
  });

  it("supports multiple workflows per team and resolves default selection", () => {
    const team = {
      id: "alpha",
      managerAgentId: "alpha-manager",
      members: [],
      workflows: [
        { id: "default", name: "Default Workflow", default: true },
        { id: "design-review", name: "Design Review" },
      ],
    };

    expect(listTeamWorkflows(team)).toHaveLength(2);
    expect(resolveDefaultTeamWorkflowId(team)).toBe("default");
    expect(findTeamWorkflow(team, "design-review")).toMatchObject({
      id: "design-review",
      name: "Design Review",
    });
  });
});
