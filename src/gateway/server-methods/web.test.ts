import { beforeEach, describe, expect, it, vi } from "vitest";

const { stopChannelMock, startChannelMock, loginWithQrStartMock, loginWithQrWaitMock } = vi.hoisted(
  () => ({
  stopChannelMock: vi.fn(),
  startChannelMock: vi.fn(),
  loginWithQrStartMock: vi.fn(async () => ({
    message: "Scan the QR code in WhatsApp.",
    qrDataUrl: "data:image/png;base64,ZmFrZQ==",
  })),
  loginWithQrWaitMock: vi.fn(async () => ({
    connected: true,
    message: "WhatsApp linked.",
  })),
}),
);

vi.mock("../../channels/plugins/index.js", () => ({
  listChannelPlugins: () => [],
}));

vi.mock("../../channels/plugins/setup-registry.js", () => ({
  listChannelSetupPlugins: () => [],
}));

vi.mock("../../channels/plugins/bundled.js", () => ({
  bundledChannelPlugins: [],
  bundledChannelSetupPlugins: [
    {
      id: "whatsapp",
      gatewayMethods: ["web.login.start", "web.login.wait"],
      gateway: {
        loginWithQrStart: loginWithQrStartMock,
        loginWithQrWait: loginWithQrWaitMock,
      },
    },
  ],
}));

import { webHandlers } from "./web.js";

describe("webHandlers", () => {
  beforeEach(() => {
    stopChannelMock.mockReset();
    startChannelMock.mockReset();
    loginWithQrStartMock.mockClear();
    loginWithQrWaitMock.mockClear();
  });

  it("uses bundled setup plugins as a fallback for web login start", async () => {
    const respond = vi.fn();

    await webHandlers["web.login.start"]({
      params: { force: true, timeoutMs: 2_000 },
      respond,
      context: {
        stopChannel: stopChannelMock,
        startChannel: startChannelMock,
      } as never,
    });

    expect(stopChannelMock).toHaveBeenCalledWith("whatsapp", undefined);
    expect(loginWithQrStartMock).toHaveBeenCalledWith({
      force: true,
      timeoutMs: 2_000,
      verbose: false,
      accountId: undefined,
    });
    expect(respond).toHaveBeenCalledWith(
      true,
      {
        message: "Scan the QR code in WhatsApp.",
        qrDataUrl: "data:image/png;base64,ZmFrZQ==",
      },
      undefined,
    );
  });

  it("uses bundled setup plugins as a fallback for web login wait", async () => {
    const respond = vi.fn();

    await webHandlers["web.login.wait"]({
      params: { timeoutMs: 2_000 },
      respond,
      context: {
        stopChannel: stopChannelMock,
        startChannel: startChannelMock,
      } as never,
    });

    expect(loginWithQrWaitMock).toHaveBeenCalledWith({
      timeoutMs: 2_000,
      accountId: undefined,
    });
    expect(startChannelMock).toHaveBeenCalledWith("whatsapp", undefined);
    expect(respond).toHaveBeenCalledWith(
      true,
      {
        connected: true,
        message: "WhatsApp linked.",
      },
      undefined,
    );
  });
});
