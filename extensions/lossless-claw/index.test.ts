import type { AgentMessage } from "@mariozechner/pi-agent-core";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ContextEngine } from "./api.js";
import plugin from "./index.js";

function makeMessage(
  role: "user" | "assistant",
  content: string,
  timestamp: number,
): AgentMessage {
  return { role, content, timestamp } as AgentMessage;
}

describe("lossless-claw context engine", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-lossless-claw-"));
  });

  afterEach(async () => {
    if (!tempDir) {
      return;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("persists continuity, hands it to child sessions, and rolls it back on failed spawn", async () => {
    let engineFactory: (() => ContextEngine | Promise<ContextEngine>) | undefined;

    plugin.register({
      runtime: {
        state: {
          resolveStateDir: () => tempDir,
        },
      },
      registerContextEngine(id, factory) {
        expect(id).toBe("lossless-claw");
        engineFactory = factory;
      },
    } as Parameters<typeof plugin.register>[0]);

    const engine = await engineFactory?.();
    expect(engine).toBeDefined();

    await engine?.afterTurn?.({
      sessionId: "parent-session",
      sessionKey: "agent:main:parent",
      sessionFile: "/tmp/parent.jsonl",
      messages: [makeMessage("user", "Remember the project timeline and the user scope.", 1)],
      prePromptMessageCount: 0,
    });

    const parentAssembled = await engine?.assemble({
      sessionId: "parent-session",
      sessionKey: "agent:main:parent",
      messages: [],
    });
    expect(parentAssembled?.systemPromptAddition).toContain("Continuity Recall");
    expect(parentAssembled?.systemPromptAddition).toContain("project timeline");

    const preparation = await engine?.prepareSubagentSpawn?.({
      parentSessionKey: "agent:main:parent",
      childSessionKey: "agent:main:child",
    });
    expect(preparation).toBeDefined();

    const childAssembled = await engine?.assemble({
      sessionId: "child-session",
      sessionKey: "agent:main:child",
      messages: [],
    });
    expect(childAssembled?.systemPromptAddition).toContain("project timeline");

    await preparation?.rollback();

    const rolledBackChild = await engine?.assemble({
      sessionId: "child-session",
      sessionKey: "agent:main:child",
      messages: [],
    });
    expect(rolledBackChild?.systemPromptAddition).toBeUndefined();
  });
});
