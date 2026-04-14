/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import "../styles.css";
import { mountApp, registerAppMountHooks } from "./test-helpers/app-mount.ts";

registerAppMountHooks();

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

async function settle(app: Awaited<ReturnType<typeof mountApp>>) {
  await app.updateComplete;
  await Promise.resolve();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await app.updateComplete;
}

describe("teams prompt flow", () => {
  it("opens the inline prompt editor from the real Teams page", async () => {
    const app = mountApp("/teams");
    await settle(app);

    const config = buildConfigValue();
    app.configSnapshot = {
      path: "/tmp/config.json",
      hash: "abc123",
      valid: true,
      raw: JSON.stringify(config),
      issues: [],
      config,
    } as never;
    app.configForm = config;
    app.agentsList = {
      defaultId: "main",
      mainKey: "main",
      scope: "workspace",
      agents: [
        { id: "main", name: "Main" },
        { id: "architect", name: "Architect" },
      ],
    } as never;
    app.teamsSelectedId = "vibe-coder";
    app.teamsSelectedWorkflowId = "default";
    app.requestUpdate();
    await settle(app);

    const button = Array.from(app.querySelectorAll("button")).find(
      (entry) => entry.textContent?.trim() === "Prompt Changes",
    );

    expect(button).toBeTruthy();
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle(app);

    expect(app.teamPromptDialogOpen).toBe(true);
    expect(app.querySelector(".team-prompt-editor")).not.toBeNull();
    expect(app.textContent).toContain("Prompt Team Changes");
  });
});
