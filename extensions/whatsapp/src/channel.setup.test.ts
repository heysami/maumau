import { beforeEach, describe, expect, it, vi } from "vitest";

const startWebLoginWithQrMock = vi.hoisted(() =>
  vi.fn(async () => ({
    message: "Scan the QR code in WhatsApp.",
    qrDataUrl: "data:image/png;base64,ZmFrZQ==",
  })),
);
const waitForWebLoginMock = vi.hoisted(() =>
  vi.fn(async () => ({
    connected: true,
    message: "WhatsApp linked.",
  })),
);

vi.mock("./channel.runtime.js", () => ({
  startWebLoginWithQr: startWebLoginWithQrMock,
  waitForWebLogin: waitForWebLoginMock,
}));

describe("whatsapp setup plugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes QR login handlers for fresh setup flows", async () => {
    const { whatsappSetupPlugin } = await import("./channel.setup.js");

    expect(whatsappSetupPlugin.gatewayMethods).toEqual(["web.login.start", "web.login.wait"]);

    const start = await whatsappSetupPlugin.gateway?.loginWithQrStart?.({
      accountId: "default",
      force: true,
      timeoutMs: 5_000,
      verbose: true,
    });
    expect(start).toEqual({
      message: "Scan the QR code in WhatsApp.",
      qrDataUrl: "data:image/png;base64,ZmFrZQ==",
    });
    expect(startWebLoginWithQrMock).toHaveBeenCalledWith({
      accountId: "default",
      force: true,
      timeoutMs: 5_000,
      verbose: true,
    });

    const wait = await whatsappSetupPlugin.gateway?.loginWithQrWait?.({
      accountId: "default",
      timeoutMs: 5_000,
    });
    expect(wait).toEqual({
      connected: true,
      message: "WhatsApp linked.",
    });
    expect(waitForWebLoginMock).toHaveBeenCalledWith({
      accountId: "default",
      timeoutMs: 5_000,
    });
  });
});
