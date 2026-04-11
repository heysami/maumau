import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { MaumauConfig } from "../config/config.js";
import { clearPluginDiscoveryCache } from "../plugins/discovery.js";
import { clearPluginLoaderCache } from "../plugins/loader.js";
import { resetPluginRuntimeStateForTest } from "../plugins/runtime.js";
import { withEnv } from "../test-utils/env.js";
import "./test-helpers/fast-coding-tools.js";
import { createMaumauCodingTools } from "./pi-tools.js";

function makeTempDir(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

afterEach(() => {
  clearPluginLoaderCache();
  clearPluginDiscoveryCache();
  resetPluginRuntimeStateForTest();
});

describe("createMaumauCodingTools multi-user-memory curator", () => {
  it("keeps the curator tool available for the dedicated agent", () => {
    const stateDir = makeTempDir("maumau-mum-state-");
    const workspaceDir = makeTempDir("maumau-mum-workspace-");
    const agentDir = makeTempDir("maumau-mum-agent-");

    const cfg: MaumauConfig = {
      tools: {
        profile: "coding",
      },
      plugins: {
        allow: ["multi-user-memory"],
        load: {
          paths: [path.join(process.cwd(), "extensions", "multi-user-memory")],
        },
        slots: {
          memory: "multi-user-memory",
        },
        entries: {
          "multi-user-memory": {
            enabled: true,
            config: {
              enabled: true,
              autoDiscover: false,
              curatorAgentId: "memory-curator",
              adminUserIds: [],
              users: {},
              groups: {},
            },
          },
        },
      },
      agents: {
        list: [
          {
            id: "memory-curator",
            tools: {
              allow: ["multi_user_memory_curate"],
            },
          },
        ],
      },
    };

    const toolNames = withEnv(
      {
        MAUMAU_STATE_DIR: stateDir,
        MAUMAU_TEST_FAST: "1",
        MAUMAU_BUNDLED_PLUGINS_DIR: "/nonexistent/bundled/plugins",
      },
      () =>
        createMaumauCodingTools({
          config: cfg,
          agentId: "memory-curator",
          sessionKey: "agent:memory-curator:cron:test-job",
          workspaceDir,
          agentDir,
          senderIsOwner: true,
        }).map((tool) => tool.name),
    );

    expect(toolNames).toEqual(["multi_user_memory_curate"]);
  });
});
