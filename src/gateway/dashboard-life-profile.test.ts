import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { MaumauConfig } from "../config/types.maumau.js";
import { LIFE_IMPROVEMENT_TEAM_ID, ensureBundledTeamPresetConfig } from "../teams/presets.js";
import { collectDashboardLifeProfile } from "./dashboard-life-profile.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(async (dir) => {
      await fs.rm(dir, { recursive: true, force: true });
    }),
  );
});

describe("collectDashboardLifeProfile", () => {
  it("does not treat empty snapshot bullets or template placeholders as recorded values", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-life-profile-"));
    tempDirs.push(tempRoot);
    const workspaceDir = path.join(tempRoot, "workspace-main");
    await fs.mkdir(workspaceDir, { recursive: true });
    await fs.writeFile(
      path.join(workspaceDir, "USER.md"),
      `# USER.md - About Your Human

- **Name:** Taylor Example
- **What to call them:** Taylor
- **Pronouns:** _(optional)_
- **Timezone:** Asia/Singapore

## Life Snapshot

- **Daily / weekly rhythm:** Usually wakes around 7. Works roughly 9-6 on weekdays. Weekends are for chilling.
- **Relationships / partner / social life:**
- **Family / siblings / parents:**
- **Work / school / purpose:** Standard weekday work rhythm, roughly 9-6.
- **Money / spending / pressure:**
- **Creative / spiritual / meaning:**
- **Hobbies / interests:**
- **Exercise / movement:**

---

The more you know, the better you can help. But remember — you're learning about a person, not building a dossier. Respect the difference.
`,
      "utf8",
    );

    const cfg = ensureBundledTeamPresetConfig(
      {
        agents: {
          defaults: {
            workspace: workspaceDir,
          },
        },
      } satisfies MaumauConfig,
      LIFE_IMPROVEMENT_TEAM_ID,
    );

    const profile = await collectDashboardLifeProfile({
      cfg,
      nowMs: Date.UTC(2026, 3, 13, 0, 0, 0),
    });

    expect(profile.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "pronouns",
          status: "future",
          value: undefined,
        }),
        expect.objectContaining({
          key: "relationships_social",
          status: "future",
          value: undefined,
        }),
        expect.objectContaining({
          key: "family_context",
          status: "future",
          value: undefined,
        }),
        expect.objectContaining({
          key: "work_purpose",
          status: "recorded",
          value: "Standard weekday work rhythm, roughly 9-6.",
        }),
        expect.objectContaining({
          key: "money_pressure",
          status: "future",
          value: undefined,
        }),
        expect.objectContaining({
          key: "creative_meaning",
          status: "future",
          value: undefined,
        }),
        expect.objectContaining({
          key: "hobbies_interests",
          status: "future",
          value: undefined,
        }),
        expect.objectContaining({
          key: "exercise_movement",
          status: "future",
          value: undefined,
        }),
      ]),
    );
  });
});
