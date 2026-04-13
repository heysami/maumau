import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReplyPayload } from "../auto-reply/types.js";
import type { CliDeps } from "../cli/deps.js";
import type { MaumauConfig } from "../config/config.js";
import type { SessionEntry } from "../config/sessions.js";
import type {
  PreviewPublishResult,
  publishPreviewArtifact as publishPreviewArtifactFn,
} from "../gateway/previews.js";
import type { deliverOutboundPayloads as deliverOutboundPayloadsFn } from "../infra/outbound/deliver.js";
import type { RuntimeEnv } from "../runtime.js";

const mocks = vi.hoisted(() => ({
  deliverOutboundPayloads: vi.fn<
    (params: Parameters<typeof deliverOutboundPayloadsFn>[0]) => ReturnType<typeof deliverOutboundPayloadsFn>
  >(async () => []),
  getChannelPlugin: vi.fn(() => ({})),
  resolveOutboundTarget: vi.fn(() => ({ ok: true as const, to: "+15551234567" })),
  publishPreviewArtifact: vi.fn<
    (params: Parameters<typeof publishPreviewArtifactFn>[0]) => ReturnType<typeof publishPreviewArtifactFn>
  >(async () => ({
    previewId: "preview-123",
    url: "https://preview.example/preview/for-sam-ji/preview-123/",
    expiresAt: "2026-04-01T12:00:00.000Z",
    sourcePath: "dist/index.html",
    status: "published" as const,
    visibility: "private" as const,
    recipientHint: "sam-ji",
    confirmRequired: false,
  })),
}));

vi.mock("../channels/plugins/index.js", () => ({
  getChannelPlugin: mocks.getChannelPlugin,
  normalizeChannelId: (value: string) => value,
}));

vi.mock("../infra/outbound/deliver.js", () => ({
  deliverOutboundPayloads: mocks.deliverOutboundPayloads,
}));

vi.mock("../gateway/previews.js", () => ({
  publishPreviewArtifact: mocks.publishPreviewArtifact,
}));

vi.mock("../infra/outbound/targets.js", async () => {
  const actual = await vi.importActual<typeof import("../infra/outbound/targets.js")>(
    "../infra/outbound/targets.js",
  );
  return {
    ...actual,
    resolveOutboundTarget: mocks.resolveOutboundTarget,
  };
});

let deliverAgentCommandResult: typeof import("./agent/delivery.js").deliverAgentCommandResult;
const tempDirs = new Set<string>();

describe("deliverAgentCommandResult", () => {
  beforeAll(async () => {
    vi.resetModules();
    ({ deliverAgentCommandResult } = await import("./agent/delivery.js"));
  });

  function createRuntime(): RuntimeEnv {
    return {
      log: vi.fn(),
      error: vi.fn(),
    } as unknown as RuntimeEnv;
  }

  function createResult(text = "hi") {
    return {
      payloads: [{ text }],
      meta: { durationMs: 1 },
    };
  }

  async function runDelivery(params: {
    opts: Record<string, unknown>;
    outboundSession?: { key?: string; agentId?: string };
    sessionEntry?: SessionEntry;
    runtime?: RuntimeEnv;
    resultText?: string;
    payloads?: ReplyPayload[];
  }) {
    const cfg = {} as MaumauConfig;
    const deps = {} as CliDeps;
    const runtime = params.runtime ?? createRuntime();
    const result = params.payloads
      ? {
          payloads: params.payloads,
          meta: { durationMs: 1 },
        }
      : createResult(params.resultText);

    await deliverAgentCommandResult({
      cfg,
      deps,
      runtime,
      opts: params.opts as never,
      outboundSession: params.outboundSession,
      sessionEntry: params.sessionEntry,
      result,
      payloads: result.payloads,
    });

    return { runtime };
  }

  beforeEach(() => {
    mocks.deliverOutboundPayloads.mockClear();
    mocks.resolveOutboundTarget.mockClear();
    mocks.publishPreviewArtifact.mockClear();
  });

  afterEach(async () => {
    await Promise.all(
      Array.from(tempDirs).map(async (dir) => {
        tempDirs.delete(dir);
        await fs.rm(dir, { recursive: true, force: true });
      }),
    );
  });

  async function createPreviewableArtifact(fileName = "index.html") {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-delivery-preview-"));
    tempDirs.add(dir);
    const filePath = path.join(dir, fileName);
    await fs.writeFile(filePath, "<!doctype html><title>Preview</title>");
    return { dir, filePath };
  }

  it("prefers explicit accountId for outbound delivery", async () => {
    await runDelivery({
      opts: {
        message: "hello",
        deliver: true,
        channel: "whatsapp",
        accountId: "kev",
        to: "+15551234567",
      },
      sessionEntry: {
        lastAccountId: "default",
      } as SessionEntry,
    });

    expect(mocks.deliverOutboundPayloads).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "kev" }),
    );
  });

  it("falls back to session accountId for implicit delivery", async () => {
    await runDelivery({
      opts: {
        message: "hello",
        deliver: true,
        channel: "whatsapp",
      },
      sessionEntry: {
        lastAccountId: "legacy",
        lastChannel: "whatsapp",
      } as SessionEntry,
    });

    expect(mocks.deliverOutboundPayloads).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "legacy" }),
    );
  });

  it("does not infer accountId for explicit delivery targets", async () => {
    await runDelivery({
      opts: {
        message: "hello",
        deliver: true,
        channel: "whatsapp",
        to: "+15551234567",
        deliveryTargetMode: "explicit",
      },
      sessionEntry: {
        lastAccountId: "legacy",
      } as SessionEntry,
    });

    expect(mocks.resolveOutboundTarget).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: undefined, mode: "explicit" }),
    );
    expect(mocks.deliverOutboundPayloads).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: undefined }),
    );
  });

  it("skips session accountId when channel differs", async () => {
    await runDelivery({
      opts: {
        message: "hello",
        deliver: true,
        channel: "whatsapp",
      },
      sessionEntry: {
        lastAccountId: "legacy",
        lastChannel: "telegram",
      } as SessionEntry,
    });

    expect(mocks.resolveOutboundTarget).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: undefined, channel: "whatsapp" }),
    );
  });

  it("uses session last channel when none is provided", async () => {
    await runDelivery({
      opts: {
        message: "hello",
        deliver: true,
      },
      sessionEntry: {
        lastChannel: "telegram",
        lastTo: "123",
      } as SessionEntry,
    });

    expect(mocks.resolveOutboundTarget).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "telegram", to: "123" }),
    );
  });

  it("uses reply overrides for delivery routing", async () => {
    await runDelivery({
      opts: {
        message: "hello",
        deliver: true,
        to: "+15551234567",
        replyTo: "#reports",
        replyChannel: "slack",
        replyAccountId: "ops",
      },
      sessionEntry: {
        lastChannel: "telegram",
        lastTo: "123",
        lastAccountId: "legacy",
      } as SessionEntry,
    });

    expect(mocks.resolveOutboundTarget).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "slack", to: "#reports", accountId: "ops" }),
    );
  });

  it("uses runContext turn source over stale session last route", async () => {
    await runDelivery({
      opts: {
        message: "hello",
        deliver: true,
        runContext: {
          messageChannel: "whatsapp",
          currentChannelId: "+15559876543",
          accountId: "work",
        },
      },
      sessionEntry: {
        lastChannel: "slack",
        lastTo: "U_WRONG",
        lastAccountId: "wrong",
      } as SessionEntry,
    });

    expect(mocks.resolveOutboundTarget).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "whatsapp", to: "+15559876543", accountId: "work" }),
    );
  });

  it("does not reuse session lastTo when runContext source omits currentChannelId", async () => {
    await runDelivery({
      opts: {
        message: "hello",
        deliver: true,
        runContext: {
          messageChannel: "whatsapp",
        },
      },
      sessionEntry: {
        lastChannel: "slack",
        lastTo: "U_WRONG",
      } as SessionEntry,
    });

    expect(mocks.resolveOutboundTarget).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "whatsapp", to: undefined }),
    );
  });

  it("uses caller-provided outbound session context when opts.sessionKey is absent", async () => {
    await runDelivery({
      opts: {
        message: "hello",
        deliver: true,
        channel: "whatsapp",
        to: "+15551234567",
      },
      outboundSession: {
        key: "agent:exec:hook:gmail:thread-1",
        agentId: "exec",
      },
    });

    expect(mocks.deliverOutboundPayloads).toHaveBeenCalledWith(
      expect.objectContaining({
        session: expect.objectContaining({
          key: "agent:exec:hook:gmail:thread-1",
          agentId: "exec",
        }),
      }),
    );
  });

  it("prefixes nested agent outputs with context", async () => {
    const runtime = createRuntime();
    await runDelivery({
      runtime,
      resultText: "ANNOUNCE_SKIP",
      opts: {
        message: "hello",
        deliver: false,
        lane: "nested",
        sessionKey: "agent:main:main",
        runId: "run-announce",
        messageChannel: "webchat",
      },
      sessionEntry: undefined,
    });

    expect(runtime.log).toHaveBeenCalledTimes(1);
    const line = String((runtime.log as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]);
    expect(line).toContain("[agent:nested]");
    expect(line).toContain("session=agent:main:main");
    expect(line).toContain("run=run-announce");
    expect(line).toContain("channel=webchat");
    expect(line).toContain("ANNOUNCE_SKIP");
  });

  it("preserves audioAsVoice in JSON output envelopes", async () => {
    const runtime = createRuntime();
    await runDelivery({
      runtime,
      payloads: [{ text: "voice caption", mediaUrl: "file:///tmp/clip.mp3", audioAsVoice: true }],
      opts: {
        message: "hello",
        deliver: false,
        json: true,
      },
    });

    expect(runtime.log).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(String((runtime.log as ReturnType<typeof vi.fn>).mock.calls[0]?.[0])),
    ).toEqual({
      payloads: [
        {
          text: "voice caption",
          mediaUrl: "file:///tmp/clip.mp3",
          mediaUrls: ["file:///tmp/clip.mp3"],
          audioAsVoice: true,
        },
      ],
      meta: { durationMs: 1 },
    });
  });

  it("appends a private preview receipt for previewable html artifacts", async () => {
    const { dir, filePath } = await createPreviewableArtifact();

    await runDelivery({
      opts: {
        message: "hello",
        deliver: true,
        channel: "telegram",
        to: "12345",
        senderIsOwner: true,
        senderUsername: "samiaji",
        requesterTailscaleLogin: "sam@tailnet",
        workspaceDir: dir,
      },
      payloads: [{ text: `FILE:${filePath}` }],
    });

    expect(mocks.publishPreviewArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcePath: filePath,
        workspaceDir: dir,
        visibility: "private",
        senderIsOwner: true,
        senderUsername: "samiaji",
        messageChannel: "telegram",
        requesterTailscaleLogin: "sam@tailnet",
      }),
    );
    expect(mocks.deliverOutboundPayloads).toHaveBeenCalledWith(
      expect.objectContaining({
        payloads: expect.arrayContaining([
          expect.objectContaining({ text: `FILE:${filePath}` }),
          expect.objectContaining({
            text: "Private preview for sam-ji: https://preview.example/preview/for-sam-ji/preview-123/",
          }),
        ]),
      }),
    );
  });

  it("offers explicit public-share opt-in instead of sending a url when requester is not on tailscale", async () => {
    const { dir, filePath } = await createPreviewableArtifact();
    mocks.publishPreviewArtifact.mockResolvedValueOnce({
      sourcePath: filePath,
      status: "share_consent_required",
      visibility: "public-share",
      recipientHint: "sam-ji",
      confirmRequired: true,
      blockedReason: "user_not_on_tailscale",
      suggestedFix:
        "The requester is not verified on Tailscale for this session. Offer a temporary public share instead.",
    });

    await runDelivery({
      opts: {
        message: "hello",
        deliver: true,
        channel: "whatsapp",
        to: "+15551234567",
        senderIsOwner: true,
        senderUsername: "samiaji",
        workspaceDir: dir,
      },
      payloads: [{ text: `FILE:${filePath}` }],
    });

    expect(mocks.deliverOutboundPayloads).toHaveBeenCalledWith(
      expect.objectContaining({
        payloads: expect.arrayContaining([
          expect.objectContaining({
            text: expect.stringContaining(
              "Private preview for sam-ji was not auto-sent because this requester is not verified on Tailscale for the current session.",
            ),
          }),
        ]),
      }),
    );
    const deliveredPayloads = mocks.deliverOutboundPayloads.mock.calls.at(-1)?.[0]?.payloads as
      | Array<{ text?: string }>
      | undefined;
    const receiptText = deliveredPayloads?.find((payload) =>
      payload.text?.includes("Temporary public share"),
    )?.text;
    expect(receiptText).toContain("Temporary public share is available on request for 1 hour.");
    expect(receiptText).not.toContain("https://");
  });
});
