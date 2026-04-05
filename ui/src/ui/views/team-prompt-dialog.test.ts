/* @vitest-environment jsdom */

import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import { renderTeamPromptDialog } from "./team-prompt-dialog.ts";

describe("renderTeamPromptDialog", () => {
  it("renders the inline team prompt editor and closes from its button", async () => {
    const onClose = vi.fn();
    const container = document.createElement("div");
    render(
      renderTeamPromptDialog({
        open: true,
        teamLabel: "Vibe Coder",
        workflowLabel: "Default Workflow",
        prompt: "",
        busy: false,
        error: null,
        summary: null,
        warnings: [],
        onPromptChange: vi.fn(),
        onSubmit: vi.fn(),
        onClose,
      }),
      container,
    );
    await Promise.resolve();

    const editor = container.querySelector(".team-prompt-editor");
    expect(editor).toBeTruthy();
    expect(container.textContent).toContain("Prompt Team Changes");
    const closeButton = Array.from(container.querySelectorAll("button")).find(
      (entry) => entry.textContent?.trim() === "Close",
    );
    closeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
