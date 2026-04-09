import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearRuntimeConfigSnapshot,
  setRuntimeConfigSnapshot,
  type MaumauConfig,
} from "../../config/config.js";
import * as skillsModule from "../skills.js";
import type { SkillSnapshot } from "../skills.js";

const { resolveEmbeddedRunSkillEntries } = await import("./skills-runtime.js");

describe("resolveEmbeddedRunSkillEntries", () => {
  const loadWorkspaceSkillEntriesSpy = vi.spyOn(skillsModule, "loadWorkspaceSkillEntries");

  beforeEach(() => {
    clearRuntimeConfigSnapshot();
    loadWorkspaceSkillEntriesSpy.mockReset();
    loadWorkspaceSkillEntriesSpy.mockReturnValue([]);
  });

  it("loads skill entries with config when no resolved snapshot skills exist", () => {
    const config: MaumauConfig = {
      plugins: {
        entries: {
          diffs: { enabled: true },
        },
      },
    };

    const result = resolveEmbeddedRunSkillEntries({
      workspaceDir: "/tmp/workspace",
      config,
      skillsSnapshot: {
        prompt: "skills prompt",
        skills: [],
      },
    });

    expect(result.shouldLoadSkillEntries).toBe(true);
    expect(loadWorkspaceSkillEntriesSpy).toHaveBeenCalledTimes(1);
    expect(loadWorkspaceSkillEntriesSpy).toHaveBeenCalledWith("/tmp/workspace", { config });
  });

  it("prefers the active runtime snapshot when caller config still contains SecretRefs", () => {
    const sourceConfig: MaumauConfig = {
      skills: {
        entries: {
          diffs: {
            apiKey: {
              source: "file",
              provider: "default",
              id: "/skills/entries/diffs/apiKey",
            },
          },
        },
      },
    };
    const runtimeConfig: MaumauConfig = {
      skills: {
        entries: {
          diffs: {
            apiKey: "resolved-key",
          },
        },
      },
    };
    setRuntimeConfigSnapshot(runtimeConfig, sourceConfig);

    resolveEmbeddedRunSkillEntries({
      workspaceDir: "/tmp/workspace",
      config: sourceConfig,
      skillsSnapshot: {
        prompt: "skills prompt",
        skills: [],
      },
    });

    expect(loadWorkspaceSkillEntriesSpy).toHaveBeenCalledWith("/tmp/workspace", {
      config: runtimeConfig,
    });
  });

  it("skips skill entry loading when resolved snapshot skills are present", () => {
    const snapshot: SkillSnapshot = {
      prompt: "skills prompt",
      skills: [{ name: "diffs" }],
      resolvedSkills: [],
    };

    const result = resolveEmbeddedRunSkillEntries({
      workspaceDir: "/tmp/workspace",
      config: {},
      skillsSnapshot: snapshot,
    });

    expect(result).toEqual({
      shouldLoadSkillEntries: false,
      skillEntries: [],
    });
    expect(loadWorkspaceSkillEntriesSpy).not.toHaveBeenCalled();
  });

  it("filters resolved snapshot skills for subagent sessions", () => {
    const snapshot: SkillSnapshot = {
      prompt: "skills prompt",
      skills: [{ name: "coding-agent" }, { name: "diffs" }],
      resolvedSkills: [{ name: "coding-agent" }, { name: "diffs" }] as never[],
    };

    const result = resolveEmbeddedRunSkillEntries({
      workspaceDir: "/tmp/workspace",
      config: {
        agents: {
          list: [{ id: "vibe-coder-manager" }],
        },
      },
      agentId: "vibe-coder-manager",
      sessionKey: "agent:vibe-coder-manager:subagent:child",
      skillsSnapshot: snapshot,
    });

    expect(result).toMatchObject({
      shouldLoadSkillEntries: false,
    });
    expect(result.skillEntries.map((entry) => entry.skill.name)).toEqual(["diffs"]);
    expect(loadWorkspaceSkillEntriesSpy).not.toHaveBeenCalled();
  });

  it("omits the coding-agent skill for orchestrator sessions", () => {
    loadWorkspaceSkillEntriesSpy.mockReturnValue([
      { skill: { name: "coding-agent" } },
      { skill: { name: "diffs" } },
    ] as never[]);

    const result = resolveEmbeddedRunSkillEntries({
      workspaceDir: "/tmp/workspace",
      config: {
        agents: {
          list: [{ id: "main", executionStyle: "orchestrator" }],
        },
      },
      agentId: "main",
      skillsSnapshot: {
        prompt: "skills prompt",
        skills: [],
      },
    });

    expect(result.skillEntries.map((entry) => entry.skill.name)).toEqual(["diffs"]);
  });

  it("omits the coding-agent skill for execution workers and subagent sessions", () => {
    loadWorkspaceSkillEntriesSpy.mockReturnValue([
      { skill: { name: "coding-agent" } },
      { skill: { name: "diffs" } },
    ] as never[]);

    const result = resolveEmbeddedRunSkillEntries({
      workspaceDir: "/tmp/workspace",
      config: {
        agents: {
          defaults: {
            executionWorkerAgentId: "main-worker",
          },
          list: [{ id: "main-worker" }],
        },
      },
      agentId: "main-worker",
      sessionKey: "agent:main-worker:subagent:child",
      skillsSnapshot: {
        prompt: "skills prompt",
        skills: [],
      },
    });

    expect(result.skillEntries.map((entry) => entry.skill.name)).toEqual(["diffs"]);
  });

  it("keeps the coding-agent skill for ordinary top-level coding agents", () => {
    loadWorkspaceSkillEntriesSpy.mockReturnValue([
      { skill: { name: "coding-agent" } },
      { skill: { name: "diffs" } },
    ] as never[]);

    const result = resolveEmbeddedRunSkillEntries({
      workspaceDir: "/tmp/workspace",
      config: {
        agents: {
          list: [{ id: "helper" }],
        },
      },
      agentId: "helper",
      sessionKey: "agent:helper:main",
      skillsSnapshot: {
        prompt: "skills prompt",
        skills: [],
      },
    });

    expect(result.skillEntries.map((entry) => entry.skill.name)).toEqual(["coding-agent", "diffs"]);
  });
});
