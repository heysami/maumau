/* @vitest-environment jsdom */

import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import type { TeamsProps } from "./teams.ts";
import { renderTeams } from "./teams.ts";

function buildConfigValue() {
  return {
    agents: {
      list: [
        { id: "main", name: "Main" },
        { id: "architect", name: "Architect" },
      ],
    },
    teams: {
      list: [
        {
          id: "vibe-coder",
          name: "Vibe Coder",
          managerAgentId: "main",
          members: [{ agentId: "architect", role: "system architect" }],
          workflows: [
            {
              id: "default",
              name: "Default Workflow",
              lifecycle: {
                stages: [
                  { id: "planning", name: "Planning", status: "in_progress", roles: ["manager"] },
                ],
              },
            },
          ],
        },
      ],
    },
  };
}

function buildProps(overrides: Partial<TeamsProps> = {}): TeamsProps {
  return {
    configValue: buildConfigValue(),
    configLoading: false,
    configSaving: false,
    configApplying: false,
    configDirty: false,
    configPath: "/tmp/config.json",
    agentsList: {
      defaultId: "main",
      mainKey: "main",
      scope: "workspace",
      agents: [
        { id: "main", name: "Main" } as never,
        { id: "architect", name: "Architect" } as never,
      ],
    },
    selectedTeamId: "vibe-coder",
    selectedWorkflowId: "default",
    onSelectTeam: vi.fn(),
    onSelectWorkflow: vi.fn(),
    onCreateTeam: vi.fn(),
    onReplaceTeam: vi.fn(),
    onDeleteTeam: vi.fn(),
    promptOpen: false,
    promptTeamId: null,
    promptWorkflowId: null,
    promptDraft: "",
    promptBusy: false,
    promptError: null,
    promptSummary: null,
    promptWarnings: [],
    onOpenPrompt: vi.fn(),
    onPromptChange: vi.fn(),
    onPromptSubmit: vi.fn(),
    onPromptClose: vi.fn(),
    onSave: vi.fn(),
    onApply: vi.fn(),
    onRefresh: vi.fn(),
    ...overrides,
  };
}

describe("renderTeams", () => {
  it("shows the bundled preset actions", async () => {
    const container = document.createElement("div");
    render(renderTeams(buildProps()), container);
    await Promise.resolve();

    expect(container.textContent).toContain("Add Vibe Coder");
    expect(container.textContent).toContain("Add Design Studio");
  });

  it("opens the prompt action for the selected team and workflow", async () => {
    const onOpenPrompt = vi.fn();
    const container = document.createElement("div");
    render(renderTeams(buildProps({ onOpenPrompt })), container);
    await Promise.resolve();

    const button = Array.from(container.querySelectorAll("button")).find(
      (entry) => entry.textContent?.trim() === "Prompt Changes",
    );

    expect(button).toBeTruthy();
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onOpenPrompt).toHaveBeenCalledWith("vibe-coder", "default", {
      teamLabel: "Vibe Coder",
      workflowLabel: "Default Workflow",
    });
  });

  it("renders the inline prompt editor for the selected team workflow when open", async () => {
    const container = document.createElement("div");
    render(
      renderTeams(
        buildProps({
          promptOpen: true,
          promptTeamId: "vibe-coder",
          promptWorkflowId: "default",
          promptDraft: "Add a manager confirmation note.",
        }),
      ),
      container,
    );
    await Promise.resolve();

    expect(container.querySelector(".team-prompt-editor")).not.toBeNull();
    expect(container.textContent).toContain("Prompt Team Changes");
    expect((container.querySelector("textarea") as HTMLTextAreaElement | null)?.value).toBe(
      "Add a manager confirmation note.",
    );
  });
});
