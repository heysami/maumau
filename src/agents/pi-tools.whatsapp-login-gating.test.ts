import { describe, expect, it, vi } from "vitest";
import "./test-helpers/fast-coding-tools.js";
import { createMaumauCodingTools } from "./pi-tools.js";

vi.mock("./channel-tools.js", () => {
  const stubTool = (name: string) => ({
    name,
    description: `${name} stub`,
    parameters: { type: "object", properties: {} },
    execute: vi.fn(),
  });
  return {
    listChannelAgentTools: () => [stubTool("whatsapp_login")],
  };
});

describe("owner-only tool gating", () => {
  it("removes owner-only tools for unauthorized senders", () => {
    const tools = createMaumauCodingTools({ senderIsOwner: false });
    const toolNames = tools.map((tool) => tool.name);
    expect(toolNames).not.toContain("browser");
    expect(toolNames).not.toContain("whatsapp_login");
    expect(toolNames).not.toContain("cron");
    expect(toolNames).not.toContain("gateway");
    expect(toolNames).not.toContain("nodes");
    expect(toolNames).not.toContain("preview_publish");
  });

  it("keeps owner-only tools for authorized senders", () => {
    const tools = createMaumauCodingTools({ senderIsOwner: true });
    const toolNames = tools.map((tool) => tool.name);
    expect(toolNames).toContain("browser");
    expect(toolNames).toContain("cron");
    expect(toolNames).toContain("gateway");
    expect(toolNames).toContain("nodes");
    expect(toolNames).toContain("preview_publish");
  });

  it("keeps canvas available to unauthorized senders by current trust model", () => {
    const tools = createMaumauCodingTools({ senderIsOwner: false });
    const toolNames = tools.map((tool) => tool.name);
    expect(toolNames).toContain("canvas");
  });

  it("defaults to removing owner-only tools when owner status is unknown", () => {
    const tools = createMaumauCodingTools();
    const toolNames = tools.map((tool) => tool.name);
    expect(toolNames).not.toContain("browser");
    expect(toolNames).not.toContain("whatsapp_login");
    expect(toolNames).not.toContain("cron");
    expect(toolNames).not.toContain("gateway");
    expect(toolNames).not.toContain("nodes");
    expect(toolNames).not.toContain("preview_publish");
    expect(toolNames).toContain("canvas");
  });

  it("filters direct execution tools for orchestrator-style main agents", () => {
    const tools = createMaumauCodingTools({
      agentId: "main",
      senderIsOwner: true,
      config: {
        agents: {
          defaults: {
            executionStyle: "orchestrator",
            executionWorkerAgentId: "main-worker",
          },
          list: [{ id: "main", tools: { profile: "coding" } }],
        },
      },
    });
    const toolNames = tools.map((tool) => tool.name);
    expect(toolNames).not.toContain("apply_patch");
    expect(toolNames).not.toContain("browser");
    expect(toolNames).not.toContain("edit");
    expect(toolNames).not.toContain("exec");
    expect(toolNames).not.toContain("gateway");
    expect(toolNames).not.toContain("image_generate");
    expect(toolNames).not.toContain("nodes");
    expect(toolNames).not.toContain("process");
    expect(toolNames).not.toContain("write");
    expect(toolNames).toContain("teams_run");
  });

  it("keeps direct execution tools for main-worker subagent sessions", () => {
    const tools = createMaumauCodingTools({
      senderIsOwner: true,
      sessionKey: "agent:main-worker:subagent:child",
      workspaceDir: "/tmp/main-worker-subagent",
      agentDir: "/tmp/main-worker-agent",
      config: {
        agents: {
          defaults: {
            executionStyle: "orchestrator",
            executionWorkerAgentId: "main-worker",
          },
          list: [
            {
              id: "main",
              executionStyle: "orchestrator",
              executionWorkerAgentId: "main-worker",
            },
            {
              id: "main-worker",
              tools: {
                profile: "coding",
              },
            },
          ],
        },
      },
    });
    const toolNames = tools.map((tool) => tool.name);
    expect(toolNames).toContain("read");
    expect(toolNames).toContain("write");
    expect(toolNames).toContain("edit");
    expect(toolNames).toContain("exec");
    expect(toolNames).toContain("process");
  });
});
