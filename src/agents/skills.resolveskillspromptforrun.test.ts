import { describe, expect, it } from "vitest";
import { resolveSkillsPromptForRun } from "./skills.js";
import type { SkillEntry } from "./skills/types.js";

const demoEntry: SkillEntry = {
  skill: {
    name: "demo-skill",
    description: "Demo",
    filePath: "/app/skills/demo-skill/SKILL.md",
    baseDir: "/app/skills/demo-skill",
    source: "maumau-bundled",
    disableModelInvocation: false,
  },
  frontmatter: {},
};

describe("resolveSkillsPromptForRun", () => {
  it("prefers snapshot prompt when available", () => {
    const prompt = resolveSkillsPromptForRun({
      skillsSnapshot: { prompt: "SNAPSHOT", skills: [] },
      workspaceDir: "/tmp/maumau",
    });
    expect(prompt).toBe("SNAPSHOT");
  });
  it("builds prompt from entries when snapshot is missing", () => {
    const prompt = resolveSkillsPromptForRun({
      entries: [demoEntry],
      workspaceDir: "/tmp/maumau",
    });
    expect(prompt).toContain("<available_skills>");
    expect(prompt).toContain("/app/skills/demo-skill/SKILL.md");
  });

  it("prefers runtime-filtered entries over a stale snapshot prompt", () => {
    const prompt = resolveSkillsPromptForRun({
      skillsSnapshot: { prompt: "SNAPSHOT", skills: [{ name: "coding-agent" }] },
      entries: [demoEntry],
      workspaceDir: "/tmp/maumau",
    });

    expect(prompt).toContain("demo-skill");
    expect(prompt).not.toContain("SNAPSHOT");
  });

  it("rebuilds the prompt from resolved snapshot skills when available", () => {
    const prompt = resolveSkillsPromptForRun({
      skillsSnapshot: {
        prompt: "SNAPSHOT",
        skills: [{ name: "coding-agent" }],
        resolvedSkills: [demoEntry.skill],
      },
      workspaceDir: "/tmp/maumau",
    });

    expect(prompt).toContain("demo-skill");
    expect(prompt).not.toContain("SNAPSHOT");
  });
});
