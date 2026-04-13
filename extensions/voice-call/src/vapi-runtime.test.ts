import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createVoiceCallBackend } from "./backend.js";
import type { VapiBridgeMode, VoiceCallConfig } from "./config.js";
import { generateVoiceResponse } from "./response-generator.js";
import { createVoiceCallBaseConfig } from "./test-fixtures.js";
import { VapiCallController } from "./vapi-runtime.js";

vi.mock("./response-generator.js", () => ({
  generateVoiceResponse: vi.fn(),
}));

const startTunnelMock = vi.hoisted(() => vi.fn());

vi.mock("./tunnel.js", async () => {
  const actual = await vi.importActual<typeof import("./tunnel.js")>("./tunnel.js");
  return {
    ...actual,
    startTunnel: startTunnelMock,
  };
});

const originalFetch = globalThis.fetch;

function createVapiConfig(): { config: VoiceCallConfig; tempStorePath: string } {
  const tempStorePath = fs.mkdtempSync(path.join(os.tmpdir(), "voice-call-vapi-test-"));
  return {
    config: {
      ...createVoiceCallBaseConfig(),
      mode: "vapi" as const,
      store: tempStorePath,
      vapi: {
        enabled: true,
        apiKey: "vapi-key",
        assistantId: "assistant-1",
        phoneNumberId: "phone-1",
        telephonyProvider: "twilio" as const,
        preferredLanguage: "id",
        bridgeMode: "manual-public-url" as VapiBridgeMode,
        bridgeUrl: "https://demo.ts.net/plugins/voice-call/vapi",
        bridgePath: "/plugins/voice-call/vapi",
        bridgeAuthToken: "bridge-secret",
        baseUrl: "https://api.vapi.ai",
      },
    },
    tempStorePath,
  };
}

function jsonResponse(payload: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(payload), {
    status: init?.status ?? 200,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

function createMockRequest(params: {
  body?: string;
  headers?: Record<string, string>;
  url?: string;
  method?: string;
}): IncomingMessage {
  const req = new PassThrough() as IncomingMessage & PassThrough;
  req.headers = params.headers ?? {};
  req.url = params.url ?? "/plugins/voice-call/vapi";
  req.method = params.method ?? "POST";
  setImmediate(() => {
    if (params.body) {
      req.write(params.body);
    }
    req.end();
  });
  return req;
}

function createMockResponse(): {
  res: ServerResponse;
  body: () => string;
  headers: Record<string, string>;
} {
  const chunks: Buffer[] = [];
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 200,
    headersSent: false,
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = String(value);
      return this as unknown as ServerResponse;
    },
    end(chunk?: string | Buffer) {
      if (chunk != null) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      this.headersSent = true;
      return this as unknown as ServerResponse;
    },
  } as {
    statusCode: number;
    headersSent: boolean;
    setHeader(name: string, value: string): ServerResponse;
    end(chunk?: string | Buffer): ServerResponse;
  };
  return {
    res: res as ServerResponse,
    body: () => Buffer.concat(chunks).toString("utf8"),
    headers,
  };
}

describe("VapiCallController", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
    startTunnelMock.mockReset();
  });

  it("creates outbound calls with a transient assistant overlay and Bahasa Indonesia defaults", async () => {
    const { config, tempStorePath } = createVapiConfig();
    globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://api.vapi.ai/assistant/assistant-1") {
        return jsonResponse({
          id: "assistant-1",
          orgId: "org-1",
          createdAt: "2026-04-10T00:00:00.000Z",
          updatedAt: "2026-04-10T00:00:00.000Z",
          isServerUrlSecretSet: true,
          firstMessage: "Hi",
          model: {
            tools: [{ type: "function", function: { name: "existing_tool" } }],
          },
          transcriber: {
            provider: "deepgram",
          },
        });
      }
      if (url === "https://api.vapi.ai/call") {
        return jsonResponse({
          id: "call-1",
          status: "queued",
          phoneCallProviderId: "provider-call-1",
          phoneNumberId: "phone-1",
          customer: { number: "+628123456789" },
          monitor: { controlUrl: "https://control.example/call-1" },
        });
      }
      throw new Error(`Unexpected fetch: ${url} ${init?.method ?? "GET"}`);
    }) as unknown as typeof fetch;

    const controller = new VapiCallController({
      config,
      coreConfig: {},
      agentRuntime: {} as never,
    });

    const result = await controller.initiateCall("+628123456789", "session-1", {
      message: "Halo dari Maumau",
      mode: "conversation",
    });

    expect(result).toEqual({ callId: "call-1", success: true });

    const createCallRequest = vi.mocked(globalThis.fetch).mock.calls[1];
    expect(createCallRequest?.[0]).toBe("https://api.vapi.ai/call");
    const body = JSON.parse(String(createCallRequest?.[1]?.body)) as Record<string, unknown>;
    expect(body.phoneNumberId).toBe("phone-1");
    expect(body.customer).toEqual({ number: "+628123456789" });
    const assistant = body.assistant as Record<string, unknown>;
    expect(assistant.firstMessage).toBe("Halo dari Maumau");
    expect(assistant.id).toBeUndefined();
    expect(assistant.orgId).toBeUndefined();
    expect(assistant.createdAt).toBeUndefined();
    expect(assistant.updatedAt).toBeUndefined();
    expect(assistant.isServerUrlSecretSet).toBeUndefined();
    expect((assistant.transcriber as Record<string, unknown>).language).toBe("id");
    const model = assistant.model as Record<string, unknown>;
    expect(Array.isArray(model.messages)).toBe(true);
    expect(JSON.stringify(model.messages)).toContain("Bahasa Indonesia");
    expect(JSON.stringify(model.messages)).toContain("maumau_turn");
    expect(JSON.stringify(model.tools)).toContain("existing_tool");
    expect(JSON.stringify(model.tools)).toContain("bridge-secret");
    expect(JSON.stringify(model.tools)).toContain("https://demo.ts.net/plugins/voice-call/vapi");

    fs.rmSync(tempStorePath, { recursive: true, force: true });
  });

  it("maps remote Vapi call status and ends calls through the control URL", async () => {
    const { config, tempStorePath } = createVapiConfig();
    globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://api.vapi.ai/assistant/assistant-1") {
        return jsonResponse({ id: "assistant-1" });
      }
      if (url === "https://api.vapi.ai/call") {
        return jsonResponse({
          id: "call-1",
          status: "queued",
          phoneCallProviderId: "provider-call-1",
          customer: { number: "+628123456789" },
          monitor: { controlUrl: "https://control.example/call-1" },
        });
      }
      if (url === "https://api.vapi.ai/call/call-1") {
        return jsonResponse({
          id: "call-1",
          status: "ended",
          endedReason: "busy",
          phoneCallProviderId: "provider-call-1",
          customer: { number: "+628123456789" },
          monitor: { controlUrl: "https://control.example/call-1" },
        });
      }
      if (url === "https://control.example/call-1") {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ type: "end-call" });
        return new Response("", { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url} ${init?.method ?? "GET"}`);
    }) as unknown as typeof fetch;

    const controller = new VapiCallController({
      config,
      coreConfig: {},
      agentRuntime: {} as never,
    });

    await controller.initiateCall("+628123456789");
    const current = await controller.getCall("call-1");
    expect(current?.state).toBe("busy");

    const ended = await controller.endCall("call-1");
    expect(ended).toEqual({ success: true });

    fs.rmSync(tempStorePath, { recursive: true, force: true });
  });

  it("starts the auto bridge on a separate public Tailscale funnel port when needed", async () => {
    const { config, tempStorePath } = createVapiConfig();
    config.vapi.bridgeMode = "auto";
    delete config.vapi.bridgeUrl;
    const stopTunnel = vi.fn(async () => {});
    startTunnelMock.mockResolvedValue({
      publicUrl: "https://demo.ts.net:8443/plugins/voice-call/vapi",
      provider: "tailscale-funnel",
      stop: stopTunnel,
    });

    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === "https://api.vapi.ai/assistant/assistant-1") {
        return jsonResponse({ id: "assistant-1" });
      }
      if (url === "https://api.vapi.ai/call") {
        return jsonResponse({
          id: "call-1",
          status: "queued",
          phoneCallProviderId: "provider-call-1",
          customer: { number: "+628123456789" },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    const controller = new VapiCallController({
      config,
      coreConfig: {},
      agentRuntime: {} as never,
    });

    await controller.initiateCall("+628123456789");

    expect(startTunnelMock).toHaveBeenCalledWith({
      provider: "tailscale-funnel",
      port: 18789,
      path: "/plugins/voice-call/vapi",
      httpsPort: 8443,
    });
    const createCallRequest = vi.mocked(globalThis.fetch).mock.calls[1];
    const body = JSON.parse(String(createCallRequest?.[1]?.body)) as Record<string, unknown>;
    expect(JSON.stringify(body)).toContain("https://demo.ts.net:8443/plugins/voice-call/vapi");

    await controller.stop();
    expect(stopTunnel).toHaveBeenCalledTimes(1);

    fs.rmSync(tempStorePath, { recursive: true, force: true });
  });

  it("returns unsupported continue and speak actions in vapi mode", async () => {
    const { config, tempStorePath } = createVapiConfig();
    const backend = await createVoiceCallBackend({
      config,
      coreConfig: {},
      agentRuntime: {} as never,
    });

    expect(await backend.actions.continueCall("call-1", "hi")).toEqual({
      success: false,
      error:
        '"continue" is only available in Advanced self-hosted mode. Switch voice-call mode back to self-hosted to use it.',
    });
    expect(await backend.actions.speak("call-1", "hi")).toEqual({
      success: false,
      error:
        '"speak" is only available in Advanced self-hosted mode. Switch voice-call mode back to self-hosted to use it.',
    });

    fs.rmSync(tempStorePath, { recursive: true, force: true });
  });

  it("enforces bridge auth and returns only the spoken tool result", async () => {
    const { config, tempStorePath } = createVapiConfig();
    vi.mocked(generateVoiceResponse).mockResolvedValue({
      text: "Halo kembali",
    });
    const controller = new VapiCallController({
      config,
      coreConfig: {},
      agentRuntime: {} as never,
    });
    const handler = controller.createBridgeHandler();

    const unauthorized = createMockResponse();
    await handler({
      req: createMockRequest({
        body: JSON.stringify({ message: { type: "tool-calls" } }),
      }),
      res: unauthorized.res,
    });
    expect(unauthorized.res.statusCode).toBe(401);

    const authorized = createMockResponse();
    await handler({
      req: createMockRequest({
        headers: { "x-vapi-secret": "bridge-secret" },
        body: JSON.stringify({
          message: {
            type: "tool-calls",
            call: {
              id: "call-1",
              customer: { number: "+628123456789" },
            },
            artifact: {
              messages: [{ role: "user", message: "Siapa kamu?" }],
            },
            toolCallList: [
              {
                id: "tool-1",
                name: "maumau_turn",
                parameters: {
                  userMessage: "Siapa kamu?",
                },
              },
            ],
          },
        }),
      }),
      res: authorized.res,
    });

    expect(authorized.res.statusCode).toBe(200);
    const payload = JSON.parse(authorized.body()) as {
      results: Array<{ toolCallId: string; result: string }>;
    };
    expect(payload.results).toHaveLength(1);
    expect(payload.results[0]?.toolCallId).toBe("tool-1");
    expect(JSON.parse(payload.results[0]?.result ?? "{}")).toEqual({
      spoken: "Halo kembali",
    });
    expect(vi.mocked(generateVoiceResponse)).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: "Siapa kamu?",
        from: "+628123456789",
        voiceConfig: expect.objectContaining({
          responseSystemPrompt: expect.stringContaining("Bahasa Indonesia"),
        }),
      }),
    );

    fs.rmSync(tempStorePath, { recursive: true, force: true });
  });

  it("returns a retryable 503 when the gateway is draining for restart", async () => {
    const { config, tempStorePath } = createVapiConfig();
    vi.mocked(generateVoiceResponse).mockResolvedValue({
      text: null,
      error: "GatewayDrainingError: Gateway is draining for restart; new tasks are not accepted",
    });
    const controller = new VapiCallController({
      config,
      coreConfig: {},
      agentRuntime: {} as never,
    });
    const handler = controller.createBridgeHandler();
    const response = createMockResponse();

    await handler({
      req: createMockRequest({
        headers: { "x-vapi-secret": "bridge-secret" },
        body: JSON.stringify({
          message: {
            type: "tool-calls",
            call: {
              id: "call-1",
              customer: { number: "+628123456789" },
            },
            artifact: {
              messages: [{ role: "user", message: "Halo?" }],
            },
            toolCallList: [
              {
                id: "tool-1",
                name: "maumau_turn",
                parameters: {
                  userMessage: "Halo?",
                },
              },
            ],
          },
        }),
      }),
      res: response.res,
    });

    expect(response.res.statusCode).toBe(503);
    expect(response.headers["retry-after"]).toBe("2");
    expect(response.body()).toContain("Gateway restarting");

    fs.rmSync(tempStorePath, { recursive: true, force: true });
  });
});
