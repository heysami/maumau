import type { MaumauConfig } from "maumau/plugin-sdk/config-runtime";
import type { RuntimeEnv } from "maumau/plugin-sdk/runtime-env";
import { describe, expect, it } from "vitest";
import { monitorLineProvider } from "./monitor.js";

describe("monitorLineProvider fail-closed webhook auth", () => {
  it("rejects startup when channel secret is missing", async () => {
    await expect(
      monitorLineProvider({
        channelAccessToken: "token",
        channelSecret: "   ",
        config: {} as MaumauConfig,
        runtime: {} as RuntimeEnv,
      }),
    ).rejects.toThrow("LINE webhook mode requires a non-empty channel secret.");
  });

  it("rejects startup when channel access token is missing", async () => {
    await expect(
      monitorLineProvider({
        channelAccessToken: "   ",
        channelSecret: "secret",
        config: {} as MaumauConfig,
        runtime: {} as RuntimeEnv,
      }),
    ).rejects.toThrow("LINE webhook mode requires a non-empty channel access token.");
  });
});
