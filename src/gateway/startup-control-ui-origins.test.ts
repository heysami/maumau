import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTailnetHostname: vi.fn(),
}));

vi.mock("../infra/tailscale.js", async (importActual) => {
  const actual = await importActual<typeof import("../infra/tailscale.js")>();
  return {
    ...actual,
    getTailnetHostname: mocks.getTailnetHostname,
  };
});

import { maybeSeedControlUiAllowedOriginsAtStartup } from "./startup-control-ui-origins.js";

describe("maybeSeedControlUiAllowedOriginsAtStartup", () => {
  beforeEach(() => {
    mocks.getTailnetHostname.mockReset();
    mocks.getTailnetHostname.mockResolvedValue("maumau.tailnet.ts.net");
  });

  it("appends the Tailscale origin for loopback serve configs", async () => {
    const writeConfig = vi.fn(async () => {});
    const log = {
      info: vi.fn(),
      warn: vi.fn(),
    };

    const result = await maybeSeedControlUiAllowedOriginsAtStartup({
      config: {
        gateway: {
          bind: "loopback",
          tailscale: {
            mode: "serve",
          },
        },
      },
      writeConfig,
      log,
    });

    expect(result.gateway?.controlUi?.allowedOrigins).toEqual(["https://maumau.tailnet.ts.net"]);
    expect(writeConfig).toHaveBeenCalledWith(result);
    expect(log.info).toHaveBeenCalledWith(
      expect.stringContaining('["https://maumau.tailnet.ts.net"]'),
    );
  });

  it("does not rewrite config when the Tailscale origin is already present", async () => {
    const writeConfig = vi.fn(async () => {});
    const log = {
      info: vi.fn(),
      warn: vi.fn(),
    };

    const config = {
      gateway: {
        bind: "loopback" as const,
        tailscale: {
          mode: "serve" as const,
        },
        controlUi: {
          allowedOrigins: ["https://maumau.tailnet.ts.net"],
        },
      },
    };

    const result = await maybeSeedControlUiAllowedOriginsAtStartup({
      config,
      writeConfig,
      log,
    });

    expect(result).toBe(config);
    expect(writeConfig).not.toHaveBeenCalled();
    expect(log.info).not.toHaveBeenCalled();
  });
});
