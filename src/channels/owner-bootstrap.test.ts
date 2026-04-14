import { describe, expect, it } from "vitest";
import { installDiscordRegistryHooks } from "../auto-reply/test-helpers/command-auth-registry-fixture.js";
import type { MaumauConfig } from "../config/config.js";
import { bootstrapOwnerAllowFromIfUnset } from "./owner-bootstrap.js";

installDiscordRegistryHooks();

describe("bootstrapOwnerAllowFromIfUnset", () => {
  it("seeds channel-scoped owner allowFrom when none is configured", () => {
    const result = bootstrapOwnerAllowFromIfUnset({
      cfg: {} as MaumauConfig,
      channelId: "telegram",
      allowFrom: ["12345"],
    });

    expect(result.bootstrapped).toBe(true);
    expect(result.cfg.commands?.ownerAllowFrom).toEqual(["telegram:12345"]);
  });

  it("formats channel identities before storing them", () => {
    const result = bootstrapOwnerAllowFromIfUnset({
      cfg: {} as MaumauConfig,
      channelId: "discord",
      allowFrom: ["<@!12345>"],
    });

    expect(result.bootstrapped).toBe(true);
    expect(result.cfg.commands?.ownerAllowFrom).toEqual(["discord:12345"]);
  });

  it("does not override an existing owner allowFrom", () => {
    const cfg = {
      commands: {
        ownerAllowFrom: ["telegram:999"],
      },
    } as MaumauConfig;

    const result = bootstrapOwnerAllowFromIfUnset({
      cfg,
      channelId: "telegram",
      allowFrom: ["12345"],
    });

    expect(result.bootstrapped).toBe(false);
    expect(result.cfg).toBe(cfg);
    expect(result.ownerAllowFrom).toEqual(["telegram:999"]);
  });
});
