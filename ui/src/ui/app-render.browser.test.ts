/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import type { AppViewState } from "./app-view-state.ts";
import { normalizeMauOfficeEditorDraft, renderApp } from "./app-render.ts";
import { MaumauApp } from "./app.ts";
import { createDefaultMauOfficeSceneConfig } from "./mau-office-scene.ts";

describe("renderApp", () => {
  it("renders connected state without throwing when the MauOffice editor draft is unset", () => {
    const app = new MaumauApp();
    app.connected = true;
    app.tab = "overview";
    app.mauOfficeEditorDraft = null;

    expect(() => renderApp(app as unknown as AppViewState)).not.toThrow();
  });

  it("keeps wallRows while stripping unknown MauOffice editor draft keys", () => {
    const draft = createDefaultMauOfficeSceneConfig() as Record<string, unknown>;
    draft.wallRows = Array.from(
      { length: createDefaultMauOfficeSceneConfig().zoneRows.length },
      () => Array.from({ length: 26 }, () => false),
    );
    draft.previewGhost = { tileX: 3, tileY: 4 };

    const normalized = normalizeMauOfficeEditorDraft(draft);

    expect(normalized.wallRows).toHaveLength(createDefaultMauOfficeSceneConfig().zoneRows.length);
    expect("previewGhost" in (normalized as Record<string, unknown>)).toBe(false);
  });
});
