import { describe, expect, it, vi } from "vitest";
import { VoiceCallConfigSchema } from "./config.js";
import type { CoreAgentDeps, CoreConfig } from "./core-bridge.js";
import { generateVoiceResponse } from "./response-generator.js";

function createAgentRuntime(payloads: Array<Record<string, unknown>>) {
  const runEmbeddedPiAgent = vi.fn(async () => ({
    payloads,
    meta: { durationMs: 12, aborted: false },
  }));

  const runtime = {
    defaults: {
      provider: "together",
      model: "Qwen/Qwen2.5-7B-Instruct-Turbo",
    },
    resolveAgentDir: () => "/tmp/maumau/agents/main",
    resolveAgentWorkspaceDir: () => "/tmp/maumau/workspace/main",
    resolveAgentIdentity: () => ({ name: "tester" }),
    resolveThinkingDefault: () => "off",
    resolveAgentTimeoutMs: () => 30_000,
    ensureAgentWorkspace: async () => {},
    runEmbeddedPiAgent,
    session: {
      resolveStorePath: () => "/tmp/maumau/sessions.json",
      loadSessionStore: () => ({}),
      saveSessionStore: async () => {},
      resolveSessionFilePath: () => "/tmp/maumau/sessions/session.jsonl",
    },
  } as unknown as CoreAgentDeps;

  return { runtime, runEmbeddedPiAgent };
}

function requireEmbeddedAgentArgs(runEmbeddedPiAgent: ReturnType<typeof vi.fn>) {
  const calls = runEmbeddedPiAgent.mock.calls as unknown[][];
  const firstCall = calls[0];
  if (!firstCall) {
    throw new Error("voice response generator did not invoke the embedded agent");
  }
  const args = firstCall[0] as { extraSystemPrompt?: string } | undefined;
  if (!args?.extraSystemPrompt) {
    throw new Error("voice response generator did not pass the spoken-output contract prompt");
  }
  return args;
}

function requireEmbeddedAgentModelArgs(runEmbeddedPiAgent: ReturnType<typeof vi.fn>) {
  const calls = runEmbeddedPiAgent.mock.calls as unknown[][];
  const firstCall = calls[0];
  if (!firstCall) {
    throw new Error("voice response generator did not invoke the embedded agent");
  }
  return firstCall[0] as { provider?: string; model?: string };
}

async function runGenerateVoiceResponse(
  payloads: Array<Record<string, unknown>>,
  overrides?: {
    runtime?: CoreAgentDeps;
    transcript?: Array<{ speaker: "user" | "bot"; text: string }>;
  },
) {
  const voiceConfig = VoiceCallConfigSchema.parse({
    responseTimeoutMs: 5000,
  });
  const coreConfig = {} as CoreConfig;
  const runtime = overrides?.runtime ?? createAgentRuntime(payloads).runtime;

  const result = await generateVoiceResponse({
    voiceConfig,
    coreConfig,
    agentRuntime: runtime,
    callId: "call-123",
    from: "+15550001111",
    transcript: overrides?.transcript ?? [{ speaker: "user", text: "hello there" }],
    userMessage: "hello there",
  });

  return { result };
}

describe("generateVoiceResponse", () => {
  it("suppresses reasoning payloads and reads structured spoken output", async () => {
    const { runtime, runEmbeddedPiAgent } = createAgentRuntime([
      { text: "Reasoning: hidden", isReasoning: true },
      { text: '{"spoken":"Hello from JSON."}' },
    ]);
    const { result } = await runGenerateVoiceResponse([], { runtime });

    expect(result.text).toBe("Hello from JSON.");
    expect(runEmbeddedPiAgent).toHaveBeenCalledTimes(1);
    const args = requireEmbeddedAgentArgs(runEmbeddedPiAgent);
    expect(args.extraSystemPrompt).toContain('{"spoken":"..."}');
    const modelArgs = requireEmbeddedAgentModelArgs(runEmbeddedPiAgent);
    expect(modelArgs.provider).toBe("together");
    expect(modelArgs.model).toBe("Qwen/Qwen2.5-7B-Instruct-Turbo");
  });

  it("maps the legacy voice response default back to the Codex runtime default", async () => {
    const runEmbeddedPiAgent = vi.fn(async () => ({
      payloads: [{ text: '{"spoken":"Halo"}' }],
      meta: { durationMs: 12, aborted: false },
    }));
    const runtime = {
      ...createAgentRuntime([]).runtime,
      defaults: {
        provider: "openai-codex",
        model: "gpt-5.4",
      },
      runEmbeddedPiAgent,
    } as unknown as CoreAgentDeps;
    const voiceConfig = VoiceCallConfigSchema.parse({
      responseModel: "openai/gpt-4o-mini",
      responseTimeoutMs: 5000,
    });

    await generateVoiceResponse({
      voiceConfig,
      coreConfig: {} as CoreConfig,
      agentRuntime: runtime,
      callId: "call-123",
      from: "+15550001111",
      transcript: [{ speaker: "user", text: "halo" }],
      userMessage: "halo",
    });

    const args = requireEmbeddedAgentModelArgs(runEmbeddedPiAgent);
    expect(args.provider).toBe("openai-codex");
    expect(args.model).toBe("gpt-5.4");
  });

  it("prefers the configured Maumau default model over the plugin runtime fallback", async () => {
    const runEmbeddedPiAgent = vi.fn(async () => ({
      payloads: [{ text: '{"spoken":"Halo"}' }],
      meta: { durationMs: 12, aborted: false },
    }));
    const runtime = {
      ...createAgentRuntime([]).runtime,
      defaults: {
        provider: "anthropic",
        model: "claude-opus-4-6",
      },
      runEmbeddedPiAgent,
    } as unknown as CoreAgentDeps;

    await generateVoiceResponse({
      voiceConfig: VoiceCallConfigSchema.parse({
        responseTimeoutMs: 5000,
      }),
      coreConfig: {
        agents: {
          defaults: {
            model: {
              primary: "openai-codex/gpt-5.4",
            },
          },
        },
      } as CoreConfig,
      agentRuntime: runtime,
      callId: "call-123",
      from: "+15550001111",
      transcript: [{ speaker: "user", text: "halo" }],
      userMessage: "halo",
    });

    const args = requireEmbeddedAgentModelArgs(runEmbeddedPiAgent);
    expect(args.provider).toBe("openai-codex");
    expect(args.model).toBe("gpt-5.4");
  });

  it("extracts spoken text from fenced JSON", async () => {
    const { result } = await runGenerateVoiceResponse([
      { text: '```json\n{"spoken":"Fenced JSON works."}\n```' },
    ]);

    expect(result.text).toBe("Fenced JSON works.");
  });

  it("returns silence for an explicit empty spoken contract response", async () => {
    const { result } = await runGenerateVoiceResponse([{ text: '{"spoken":""}' }]);

    expect(result.text).toBeNull();
  });

  it("strips leading planning text when model returns plain text", async () => {
    const { result } = await runGenerateVoiceResponse([
      {
        text:
          "The user responded with short text. I should keep the response concise.\n\n" +
          "Sounds good. I can help with the next step whenever you are ready.",
      },
    ]);

    expect(result.text).toBe("Sounds good. I can help with the next step whenever you are ready.");
  });

  it("keeps plain conversational output when no JSON contract is followed", async () => {
    const { result } = await runGenerateVoiceResponse([
      { text: "Absolutely. Tell me what you want to do next." },
    ]);

    expect(result.text).toBe("Absolutely. Tell me what you want to do next.");
  });
});
