import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MaumauConfig } from "../config/config.js";

const mocks = vi.hoisted(() => ({
  publishPreviewArtifact: vi.fn(),
}));

vi.mock("./previews.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./previews.js")>();
  return {
    ...actual,
    publishPreviewArtifact: (params: unknown) => mocks.publishPreviewArtifact(params),
  };
});

describe("maybeBuildPreviewReceiptPayloads", () => {
  let maybeBuildPreviewReceiptPayloads: typeof import("./preview-delivery.js").maybeBuildPreviewReceiptPayloads;
  let workspaceDir: string | undefined;

  beforeEach(async () => {
    vi.resetModules();
    ({ maybeBuildPreviewReceiptPayloads } = await import("./preview-delivery.js"));
  });

  afterEach(async () => {
    mocks.publishPreviewArtifact.mockReset();
    if (workspaceDir) {
      await fs.rm(workspaceDir, { recursive: true, force: true });
      workspaceDir = undefined;
    }
  });

  it("publishes a private preview receipt for owner direct chats with FILE artifacts", async () => {
    workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-preview-delivery-"));
    await fs.writeFile(path.join(workspaceDir, "index.html"), "<html>preview</html>", "utf8");
    mocks.publishPreviewArtifact.mockResolvedValue({
      status: "published",
      url: "https://preview.example/lease",
      recipientHint: "owner",
    });

    const payloads = await maybeBuildPreviewReceiptPayloads({
      cfg: {} as MaumauConfig,
      payloads: [{ text: "Built UI.\nFILE:index.html" }],
      workspaceDir,
      messageChannel: "telegram",
      senderIsOwner: true,
    });

    expect(mocks.publishPreviewArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        cfg: {},
        sourcePath: "index.html",
        workspaceDir,
        messageChannel: "telegram",
        senderIsOwner: true,
      }),
    );
    expect(payloads).toEqual([
      {
        text: "Private preview for owner: https://preview.example/lease",
      },
    ]);
  });

  it("skips private preview receipts for untrusted external routes", async () => {
    workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-preview-delivery-"));
    await fs.writeFile(path.join(workspaceDir, "index.html"), "<html>preview</html>", "utf8");

    const payloads = await maybeBuildPreviewReceiptPayloads({
      cfg: {} as MaumauConfig,
      payloads: [{ text: "Built UI.\nFILE:index.html" }],
      workspaceDir,
      messageChannel: "telegram",
      senderIsOwner: false,
    });

    expect(mocks.publishPreviewArtifact).not.toHaveBeenCalled();
    expect(payloads).toEqual([]);
  });

  it("skips the preview receipt when the final payload already contains the published URL", async () => {
    workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-preview-delivery-"));
    await fs.writeFile(path.join(workspaceDir, "index.html"), "<html>preview</html>", "utf8");
    mocks.publishPreviewArtifact.mockResolvedValue({
      status: "published",
      url: "https://preview.example/lease",
      recipientHint: "owner",
    });

    const payloads = await maybeBuildPreviewReceiptPayloads({
      cfg: {} as MaumauConfig,
      payloads: [{ text: "Preview is ready: https://preview.example/lease\nFILE:index.html" }],
      workspaceDir,
      messageChannel: "telegram",
      senderIsOwner: true,
    });

    expect(mocks.publishPreviewArtifact).toHaveBeenCalledTimes(1);
    expect(payloads).toEqual([]);
  });

  it("skips auto-publish when the final payload already contains a managed preview URL", async () => {
    workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-preview-delivery-"));
    await fs.writeFile(path.join(workspaceDir, "index.html"), "<html>preview</html>", "utf8");

    const payloads = await maybeBuildPreviewReceiptPayloads({
      cfg: {} as MaumauConfig,
      payloads: [
        {
          text: [
            "Preview is ready:",
            "https://maumau.tailnet.ts.net/preview/for-req-er/149cf12730dd4c2b8ad81bb77b52be18/",
            "FILE:index.html",
          ].join("\n"),
        },
      ],
      workspaceDir,
      messageChannel: "telegram",
      senderIsOwner: true,
    });

    expect(mocks.publishPreviewArtifact).not.toHaveBeenCalled();
    expect(payloads).toEqual([]);
  });
});
