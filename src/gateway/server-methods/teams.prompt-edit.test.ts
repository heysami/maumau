import { beforeEach, describe, expect, it, vi } from "vitest";

const prepareSimpleCompletionModelForAgentMock = vi.fn();
const completeWithPreparedSimpleCompletionModelMock = vi.fn();

vi.mock("../../agents/simple-completion-runtime.js", () => ({
  prepareSimpleCompletionModelForAgent: prepareSimpleCompletionModelForAgentMock,
  completeWithPreparedSimpleCompletionModel: completeWithPreparedSimpleCompletionModelMock,
}));

async function invokePromptEdit(
  params: Record<string, unknown>,
  respond: ((ok: boolean, payload?: unknown, error?: unknown) => void) | undefined = undefined,
) {
  const { teamsHandlers } = await import("./teams.js");
  const onRespond = respond ?? (() => {});
  await teamsHandlers["teams.promptEdit"]({
    params,
    respond: onRespond as never,
    context: {
      logGateway: {
        warn: vi.fn(),
      },
    },
  } as never);
}

describe("teams.promptEdit", () => {
  beforeEach(() => {
    prepareSimpleCompletionModelForAgentMock.mockReset();
    completeWithPreparedSimpleCompletionModelMock.mockReset();
    prepareSimpleCompletionModelForAgentMock.mockResolvedValue({
      model: { provider: "openai", id: "gpt-5.4", api: "openai-responses" },
      auth: { apiKey: "sk-test", mode: "env" },
    });
  });

  it("returns a validated targeted patch for the selected team draft", async () => {
    completeWithPreparedSimpleCompletionModelMock.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            noop: false,
            summary: "Added a planning stage and renamed the architect.",
            warnings: [],
            workflowPatch: {
              lifecycle: {
                stages: [
                  {
                    id: "planning",
                    name: "Planning",
                    status: "in_progress",
                    roles: ["manager"],
                  },
                  {
                    id: "architecture",
                    name: "Architecture",
                    status: "in_progress",
                    roles: ["system architect"],
                  },
                ],
              },
            },
            agentPatches: [
              {
                agentId: "architect",
                name: "System Architect",
              },
            ],
          }),
        },
      ],
    });
    const rawConfig = JSON.stringify(
      {
        agents: {
          list: [
            { id: "main", model: "openai/gpt-5.4" },
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
              workflows: [{ id: "default", name: "Default Workflow" }],
            },
          ],
        },
      },
      null,
      2,
    );

    let payload: unknown;
    let error: unknown;
    await invokePromptEdit(
      {
        rawConfig,
        teamId: "vibe-coder",
        workflowId: "default",
        prompt: "Add a planning stage and rename the architect to System Architect.",
      },
      (ok, response, rpcError) => {
        expect(ok).toBe(true);
        payload = response;
        error = rpcError;
      },
    );

    expect(error).toBeUndefined();
    expect(payload).toMatchObject({
      ok: true,
      noop: false,
      summary: "Added a planning stage and renamed the architect.",
      workflowPatch: {
        lifecycle: {
          stages: [
            { id: "planning", name: "Planning" },
            { id: "architecture", name: "Architecture" },
          ],
        },
      },
      agentPatches: [{ agentId: "architect", name: "System Architect" }],
    });
    expect(completeWithPreparedSimpleCompletionModelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          messages: [
            expect.objectContaining({
              content: [
                expect.objectContaining({
                  text: expect.stringContaining("Add a planning stage"),
                }),
              ],
            }),
          ],
        }),
      }),
    );
  });

  it("returns an error when the model response is not valid JSON", async () => {
    completeWithPreparedSimpleCompletionModelMock.mockResolvedValue({
      content: [{ type: "text", text: "not json" }],
    });
    const rawConfig = JSON.stringify({
      agents: { list: [{ id: "main", model: "openai/gpt-5.4" }] },
      teams: { list: [{ id: "vibe-coder", managerAgentId: "main" }] },
    });

    let payload: unknown;
    let error: { message?: string } | undefined;
    await invokePromptEdit(
      {
        rawConfig,
        teamId: "vibe-coder",
        prompt: "Rename this team.",
      },
      (ok, response, rpcError) => {
        expect(ok).toBe(false);
        payload = response;
        error = rpcError as { message?: string } | undefined;
      },
    );

    expect(payload).toBeUndefined();
    expect(error?.message).toContain("invalid JSON");
  });
});
