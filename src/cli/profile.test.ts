import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatCliCommand } from "./command-format.js";
import { applyCliProfileEnv, parseCliProfileArgs } from "./profile.js";

describe("parseCliProfileArgs", () => {
  it("leaves gateway --dev for subcommands", () => {
    const res = parseCliProfileArgs(["node", "maumau", "gateway", "--dev", "--allow-unconfigured"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual(["node", "maumau", "gateway", "--dev", "--allow-unconfigured"]);
  });

  it("leaves gateway --dev for subcommands after leading root options", () => {
    const res = parseCliProfileArgs([
      "node",
      "maumau",
      "--no-color",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual([
      "node",
      "maumau",
      "--no-color",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
  });

  it("still accepts global --dev before subcommand", () => {
    const res = parseCliProfileArgs(["node", "maumau", "--dev", "gateway"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("dev");
    expect(res.argv).toEqual(["node", "maumau", "gateway"]);
  });

  it("parses --profile value and strips it", () => {
    const res = parseCliProfileArgs(["node", "maumau", "--profile", "work", "status"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "maumau", "status"]);
  });

  it("parses interleaved --profile after the command token", () => {
    const res = parseCliProfileArgs(["node", "maumau", "status", "--profile", "work", "--deep"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "maumau", "status", "--deep"]);
  });

  it("parses interleaved --dev after the command token", () => {
    const res = parseCliProfileArgs(["node", "maumau", "status", "--dev"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("dev");
    expect(res.argv).toEqual(["node", "maumau", "status"]);
  });

  it("rejects missing profile value", () => {
    const res = parseCliProfileArgs(["node", "maumau", "--profile"]);
    expect(res.ok).toBe(false);
  });

  it.each([
    ["--dev first", ["node", "maumau", "--dev", "--profile", "work", "status"]],
    ["--profile first", ["node", "maumau", "--profile", "work", "--dev", "status"]],
    ["interleaved after command", ["node", "maumau", "status", "--profile", "work", "--dev"]],
  ])("rejects combining --dev with --profile (%s)", (_name, argv) => {
    const res = parseCliProfileArgs(argv);
    expect(res.ok).toBe(false);
  });
});

describe("applyCliProfileEnv", () => {
  it("fills env defaults for dev profile", () => {
    const env: Record<string, string | undefined> = {};
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    const expectedStateDir = path.join(path.resolve("/home/peter"), ".maumau-dev");
    expect(env.MAUMAU_PROFILE).toBe("dev");
    expect(env.MAUMAU_STATE_DIR).toBe(expectedStateDir);
    expect(env.MAUMAU_CONFIG_PATH).toBe(path.join(expectedStateDir, "maumau.json"));
    expect(env.MAUMAU_GATEWAY_PORT).toBe("19001");
  });

  it("does not override explicit env values", () => {
    const env: Record<string, string | undefined> = {
      MAUMAU_STATE_DIR: "/custom",
      MAUMAU_GATEWAY_PORT: "19099",
    };
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    expect(env.MAUMAU_STATE_DIR).toBe("/custom");
    expect(env.MAUMAU_GATEWAY_PORT).toBe("19099");
    expect(env.MAUMAU_CONFIG_PATH).toBe(path.join("/custom", "maumau.json"));
  });

  it("uses MAUMAU_HOME when deriving profile state dir", () => {
    const env: Record<string, string | undefined> = {
      MAUMAU_HOME: "/srv/maumau-home",
      HOME: "/home/other",
    };
    applyCliProfileEnv({
      profile: "work",
      env,
      homedir: () => "/home/fallback",
    });

    const resolvedHome = path.resolve("/srv/maumau-home");
    expect(env.MAUMAU_STATE_DIR).toBe(path.join(resolvedHome, ".maumau-work"));
    expect(env.MAUMAU_CONFIG_PATH).toBe(path.join(resolvedHome, ".maumau-work", "maumau.json"));
  });
});

describe("formatCliCommand", () => {
  it.each([
    {
      name: "no profile is set",
      cmd: "maumau doctor --fix",
      env: {},
      expected: "maumau doctor --fix",
    },
    {
      name: "profile is default",
      cmd: "maumau doctor --fix",
      env: { MAUMAU_PROFILE: "default" },
      expected: "maumau doctor --fix",
    },
    {
      name: "profile is Default (case-insensitive)",
      cmd: "maumau doctor --fix",
      env: { MAUMAU_PROFILE: "Default" },
      expected: "maumau doctor --fix",
    },
    {
      name: "profile is invalid",
      cmd: "maumau doctor --fix",
      env: { MAUMAU_PROFILE: "bad profile" },
      expected: "maumau doctor --fix",
    },
    {
      name: "--profile is already present",
      cmd: "maumau --profile work doctor --fix",
      env: { MAUMAU_PROFILE: "work" },
      expected: "maumau --profile work doctor --fix",
    },
    {
      name: "--dev is already present",
      cmd: "maumau --dev doctor",
      env: { MAUMAU_PROFILE: "dev" },
      expected: "maumau --dev doctor",
    },
  ])("returns command unchanged when $name", ({ cmd, env, expected }) => {
    expect(formatCliCommand(cmd, env)).toBe(expected);
  });

  it("inserts --profile flag when profile is set", () => {
    expect(formatCliCommand("maumau doctor --fix", { MAUMAU_PROFILE: "work" })).toBe(
      "maumau --profile work doctor --fix",
    );
  });

  it("trims whitespace from profile", () => {
    expect(formatCliCommand("maumau doctor --fix", { MAUMAU_PROFILE: "  jbmaumau  " })).toBe(
      "maumau --profile jbmaumau doctor --fix",
    );
  });

  it("handles command with no args after maumau", () => {
    expect(formatCliCommand("maumau", { MAUMAU_PROFILE: "test" })).toBe("maumau --profile test");
  });

  it("handles pnpm wrapper", () => {
    expect(formatCliCommand("pnpm maumau doctor", { MAUMAU_PROFILE: "work" })).toBe(
      "pnpm maumau --profile work doctor",
    );
  });

  it("inserts --container when a container hint is set", () => {
    expect(
      formatCliCommand("maumau gateway status --deep", { MAUMAU_CONTAINER_HINT: "demo" }),
    ).toBe("maumau --container demo gateway status --deep");
  });

  it("preserves both --container and --profile hints", () => {
    expect(
      formatCliCommand("maumau doctor", {
        MAUMAU_CONTAINER_HINT: "demo",
        MAUMAU_PROFILE: "work",
      }),
    ).toBe("maumau --container demo doctor");
  });

  it("does not prepend --container for update commands", () => {
    expect(formatCliCommand("maumau update", { MAUMAU_CONTAINER_HINT: "demo" })).toBe(
      "maumau update",
    );
    expect(
      formatCliCommand("pnpm maumau update --channel beta", { MAUMAU_CONTAINER_HINT: "demo" }),
    ).toBe("pnpm maumau update --channel beta");
  });
});
