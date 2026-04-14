import { describe, expect, it } from "vitest";
import { buildAgentRoleContractNotes } from "./role-contract.js";

describe("buildAgentRoleContractNotes", () => {
  it("adds orchestrator scope guidance for orchestrator agents", () => {
    const notes = buildAgentRoleContractNotes({
      config: {
        agents: {
          list: [{ id: "main", executionStyle: "orchestrator" }],
        },
      },
      sessionKey: "main",
      agentId: "main",
    });

    expect(notes.join("\n")).toContain("You are an orchestrator");
    expect(notes.join("\n")).toContain("Never claim actions");
    expect(notes.join("\n")).toContain("returned accepted for delegated/background work");
    expect(notes.join("\n")).toContain("waiting_timed_out");
    expect(notes.join("\n")).toContain("FILE:<workspace-relative-path>");
    expect(notes.join("\n")).toContain("host-local or tailnet URL");
  });

  it("adds requester-openable delivery guidance for remote messaging routes", () => {
    const notes = buildAgentRoleContractNotes({
      agentId: "main",
      messageChannel: "telegram",
      requesterTailscaleLogin: null,
    });

    expect(notes.join("\n")).toContain("current delivery surface is telegram");
    expect(notes.join("\n")).toContain("localhost, 127.0.0.1, [::1]");
    expect(notes.join("\n")).toContain("not verified on Tailscale");
    expect(notes.join("\n")).toContain("requester-openable link");
  });

  it("treats trusted owner direct chats as eligible for private preview delivery guidance", () => {
    const notes = buildAgentRoleContractNotes({
      agentId: "main",
      messageChannel: "telegram",
      senderIsOwner: true,
      requesterTailscaleLogin: null,
    });

    expect(notes.join("\n")).toContain("trusted owner direct chat");
    expect(notes.join("\n")).toContain("durable private preview link");
    expect(notes.join("\n")).not.toContain("not verified on Tailscale for this route");
  });

  it("adds team manager scope guidance when the session is in manager role", () => {
    const notes = buildAgentRoleContractNotes({
      config: {
        agents: {
          list: [{ id: "vibe-coder-manager" }],
        },
        teams: {
          list: [
            {
              id: "vibe-coder",
              managerAgentId: "vibe-coder-manager",
              members: [],
              workflows: [{ id: "default", default: true }],
            },
          ],
        },
      },
      sessionKey: "agent:vibe-coder-manager:main",
      agentId: "vibe-coder-manager",
    });

    expect(notes.join("\n")).toContain("You are a team manager");
    expect(notes.join("\n")).toContain(
      "do not substitute for architecture, development, design, or QA roles",
    );
  });

  it("adds QA scope guidance for QA specialists", () => {
    const notes = buildAgentRoleContractNotes({
      config: {
        agents: {
          list: [{ id: "qa-agent" }],
        },
        teams: {
          list: [
            {
              id: "team-a",
              managerAgentId: "manager",
              members: [{ agentId: "qa-agent", role: "technical qa" }],
              workflows: [{ id: "default", default: true }],
            },
          ],
        },
      },
      sessionKey: "agent:qa-agent:subagent:123",
      agentId: "qa-agent",
    });

    expect(notes.join("\n")).toContain("You are a QA specialist");
    expect(notes.join("\n")).toContain("do not implement fixes");
  });
});
