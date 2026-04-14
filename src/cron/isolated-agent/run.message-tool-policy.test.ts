import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearFastTestEnv,
  loadRunCronIsolatedAgentTurn,
  mockRunCronFallbackPassthrough,
  resetRunCronIsolatedAgentTurnHarness,
  resolveCronDeliveryPlanMock,
  resolveDeliveryTargetMock,
  restoreFastTestEnv,
  runEmbeddedPiAgentMock,
} from "./run.test-harness.js";

const runCronIsolatedAgentTurn = await loadRunCronIsolatedAgentTurn();

function makeParams() {
  return {
    cfg: {},
    deps: {} as never,
    job: {
      id: "message-tool-policy",
      name: "Message Tool Policy",
      schedule: { kind: "every", everyMs: 60_000 },
      sessionTarget: "isolated",
      payload: { kind: "agentTurn", message: "send a message" },
      delivery: { mode: "none" },
    } as never,
    message: "send a message",
    sessionKey: "cron:message-tool-policy",
  };
}

describe("runCronIsolatedAgentTurn message tool policy", () => {
  let previousFastTestEnv: string | undefined;

  async function expectMessageToolPolicyForPlan(
    plan: {
      requested: boolean;
      mode: "none" | "announce";
      channel?: string;
      to?: string;
    },
    expected: {
      disableMessageTool: boolean;
      requireExplicitMessageTarget: boolean;
    },
  ) {
    mockRunCronFallbackPassthrough();
    resolveCronDeliveryPlanMock.mockReturnValue(plan);
    await runCronIsolatedAgentTurn(makeParams());
    expect(runEmbeddedPiAgentMock).toHaveBeenCalledTimes(1);
    expect(runEmbeddedPiAgentMock.mock.calls[0]?.[0]?.disableMessageTool).toBe(
      expected.disableMessageTool,
    );
    expect(runEmbeddedPiAgentMock.mock.calls[0]?.[0]?.requireExplicitMessageTarget).toBe(
      expected.requireExplicitMessageTarget,
    );
  }

  async function expectSharedMessageToolPolicyForPlan(
    plan: {
      requested: boolean;
      mode: "none" | "announce";
      channel?: string;
      to?: string;
    },
    expected: {
      disableMessageTool: boolean;
      requireExplicitMessageTarget: boolean;
    },
  ) {
    mockRunCronFallbackPassthrough();
    resolveCronDeliveryPlanMock.mockReturnValue(plan);
    await runCronIsolatedAgentTurn({
      ...makeParams(),
      deliveryContract: "shared",
    });
    expect(runEmbeddedPiAgentMock).toHaveBeenCalledTimes(1);
    expect(runEmbeddedPiAgentMock.mock.calls[0]?.[0]?.disableMessageTool).toBe(
      expected.disableMessageTool,
    );
    expect(runEmbeddedPiAgentMock.mock.calls[0]?.[0]?.requireExplicitMessageTarget).toBe(
      expected.requireExplicitMessageTarget,
    );
  }

  beforeEach(() => {
    previousFastTestEnv = clearFastTestEnv();
    resetRunCronIsolatedAgentTurnHarness();
    resolveDeliveryTargetMock.mockResolvedValue({
      ok: true,
      channel: "telegram",
      to: "123",
      accountId: undefined,
      error: undefined,
    });
  });

  afterEach(() => {
    restoreFastTestEnv(previousFastTestEnv);
  });

  it('keeps the message tool enabled for cron-owned runs when delivery.mode is "none"', async () => {
    await expectMessageToolPolicyForPlan(
      {
        requested: false,
        mode: "none",
      },
      {
        disableMessageTool: false,
        requireExplicitMessageTarget: true,
      },
    );
  });

  it("disables the message tool when cron delivery is active", async () => {
    await expectMessageToolPolicyForPlan(
      {
        requested: true,
        mode: "announce",
        channel: "telegram",
        to: "123",
      },
      {
        disableMessageTool: true,
        requireExplicitMessageTarget: true,
      },
    );
  });

  it("keeps the previous shared-caller behavior when delivery is not requested", async () => {
    await expectSharedMessageToolPolicyForPlan(
      {
        requested: false,
        mode: "none",
      },
      {
        disableMessageTool: false,
        requireExplicitMessageTarget: false,
      },
    );
  });
});
