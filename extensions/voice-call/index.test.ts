import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestPluginApi } from "../../test/helpers/extensions/plugin-api.js";
import type { MaumauPluginApi, MaumauPluginServiceDefinition } from "./api.js";

const createVoiceCallBackendMock = vi.hoisted(() => vi.fn());

vi.mock("./src/backend.js", () => ({
  createVoiceCallBackend: createVoiceCallBackendMock,
}));

const { default: voiceCallPlugin } = await import("./index.js");

const SHARED_VOICE_CALL_RUNTIME_STATE = Symbol.for("maumau.voiceCall.sharedRuntimeState");

type RegisteredPlugin = {
  service: MaumauPluginServiceDefinition;
  tool: Parameters<MaumauPluginApi["registerTool"]>[0];
};

function registerVoiceCallPlugin(): RegisteredPlugin {
  let service: MaumauPluginServiceDefinition | undefined;
  let tool: Parameters<MaumauPluginApi["registerTool"]>[0] | undefined;

  voiceCallPlugin.register(
    createTestPluginApi({
      id: "voice-call",
      name: "voice-call",
      source: "test",
      config: {},
      pluginConfig: {
        enabled: true,
        provider: "mock",
        fromNumber: "+15550001234",
      },
      runtime: {} as MaumauPluginApi["runtime"],
      registerService(nextService) {
        service = nextService;
      },
      registerTool(nextTool) {
        tool = nextTool;
      },
    }) as MaumauPluginApi,
  );

  if (!service || !tool) {
    throw new Error("voice-call plugin did not register service and tool");
  }

  return { service, tool };
}

describe("voice-call shared runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createVoiceCallBackendMock.mockResolvedValue({
      kind: "self-hosted",
      config: {},
      actions: {
        initiateCall: vi.fn(),
        continueCall: vi.fn(),
        speak: vi.fn(),
        endCall: vi.fn(),
        getCall: vi.fn(async () => null),
        getCallByProviderCallId: vi.fn(async () => null),
      },
      httpHandlers: [],
      stop: vi.fn(async () => {}),
    });
    delete (globalThis as Record<PropertyKey, unknown>)[SHARED_VOICE_CALL_RUNTIME_STATE];
  });

  afterEach(() => {
    delete (globalThis as Record<PropertyKey, unknown>)[SHARED_VOICE_CALL_RUNTIME_STATE];
  });

  it("reuses the same runtime across duplicate plugin registrations", async () => {
    const first = registerVoiceCallPlugin();
    const second = registerVoiceCallPlugin();

    await first.service.start({
      config: {},
      workspaceDir: "/tmp",
      stateDir: "/tmp/.maumau",
      logger: { info() {}, warn() {}, error() {}, debug() {} },
    });

    const result = await second.tool.execute("tc_1", {
      action: "get_status",
      callId: "call-1",
    });

    expect(createVoiceCallBackendMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      details: {
        found: false,
      },
    });
  });
});
