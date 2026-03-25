import { describe, expect, it } from "vitest";
import {
  buildParseArgv,
  getFlagValue,
  getCommandPath,
  getCommandPositionalsWithRootOptions,
  getCommandPathWithRootOptions,
  getPrimaryCommand,
  getPositiveIntFlagValue,
  getVerboseFlag,
  hasHelpOrVersion,
  hasFlag,
  isRootHelpInvocation,
  isRootVersionInvocation,
  shouldMigrateState,
  shouldMigrateStateFromPath,
} from "./argv.js";

describe("argv helpers", () => {
  it.each([
    {
      name: "help flag",
      argv: ["node", "maumau", "--help"],
      expected: true,
    },
    {
      name: "version flag",
      argv: ["node", "maumau", "-V"],
      expected: true,
    },
    {
      name: "normal command",
      argv: ["node", "maumau", "status"],
      expected: false,
    },
    {
      name: "root -v alias",
      argv: ["node", "maumau", "-v"],
      expected: true,
    },
    {
      name: "root -v alias with profile",
      argv: ["node", "maumau", "--profile", "work", "-v"],
      expected: true,
    },
    {
      name: "root -v alias with log-level",
      argv: ["node", "maumau", "--log-level", "debug", "-v"],
      expected: true,
    },
    {
      name: "subcommand -v should not be treated as version",
      argv: ["node", "maumau", "acp", "-v"],
      expected: false,
    },
    {
      name: "root -v alias with equals profile",
      argv: ["node", "maumau", "--profile=work", "-v"],
      expected: true,
    },
    {
      name: "subcommand path after global root flags should not be treated as version",
      argv: ["node", "maumau", "--dev", "skills", "list", "-v"],
      expected: false,
    },
  ])("detects help/version flags: $name", ({ argv, expected }) => {
    expect(hasHelpOrVersion(argv)).toBe(expected);
  });

  it.each([
    {
      name: "root --version",
      argv: ["node", "maumau", "--version"],
      expected: true,
    },
    {
      name: "root -V",
      argv: ["node", "maumau", "-V"],
      expected: true,
    },
    {
      name: "root -v alias with profile",
      argv: ["node", "maumau", "--profile", "work", "-v"],
      expected: true,
    },
    {
      name: "subcommand version flag",
      argv: ["node", "maumau", "status", "--version"],
      expected: false,
    },
    {
      name: "unknown root flag with version",
      argv: ["node", "maumau", "--unknown", "--version"],
      expected: false,
    },
  ])("detects root-only version invocations: $name", ({ argv, expected }) => {
    expect(isRootVersionInvocation(argv)).toBe(expected);
  });

  it.each([
    {
      name: "root --help",
      argv: ["node", "maumau", "--help"],
      expected: true,
    },
    {
      name: "root -h",
      argv: ["node", "maumau", "-h"],
      expected: true,
    },
    {
      name: "root --help with profile",
      argv: ["node", "maumau", "--profile", "work", "--help"],
      expected: true,
    },
    {
      name: "subcommand --help",
      argv: ["node", "maumau", "status", "--help"],
      expected: false,
    },
    {
      name: "help before subcommand token",
      argv: ["node", "maumau", "--help", "status"],
      expected: false,
    },
    {
      name: "help after -- terminator",
      argv: ["node", "maumau", "nodes", "run", "--", "git", "--help"],
      expected: false,
    },
    {
      name: "unknown root flag before help",
      argv: ["node", "maumau", "--unknown", "--help"],
      expected: false,
    },
    {
      name: "unknown root flag after help",
      argv: ["node", "maumau", "--help", "--unknown"],
      expected: false,
    },
  ])("detects root-only help invocations: $name", ({ argv, expected }) => {
    expect(isRootHelpInvocation(argv)).toBe(expected);
  });

  it.each([
    {
      name: "single command with trailing flag",
      argv: ["node", "maumau", "status", "--json"],
      expected: ["status"],
    },
    {
      name: "two-part command",
      argv: ["node", "maumau", "agents", "list"],
      expected: ["agents", "list"],
    },
    {
      name: "terminator cuts parsing",
      argv: ["node", "maumau", "status", "--", "ignored"],
      expected: ["status"],
    },
  ])("extracts command path: $name", ({ argv, expected }) => {
    expect(getCommandPath(argv, 2)).toEqual(expected);
  });

  it("extracts command path while skipping known root option values", () => {
    expect(
      getCommandPathWithRootOptions(
        [
          "node",
          "maumau",
          "--profile",
          "work",
          "--container",
          "demo",
          "--no-color",
          "config",
          "validate",
        ],
        2,
      ),
    ).toEqual(["config", "validate"]);
  });

  it("extracts routed config get positionals with interleaved root options", () => {
    expect(
      getCommandPositionalsWithRootOptions(
        ["node", "maumau", "config", "get", "--log-level", "debug", "update.channel", "--json"],
        {
          commandPath: ["config", "get"],
          booleanFlags: ["--json"],
        },
      ),
    ).toEqual(["update.channel"]);
  });

  it("extracts routed config unset positionals with interleaved root options", () => {
    expect(
      getCommandPositionalsWithRootOptions(
        ["node", "maumau", "config", "unset", "--profile", "work", "update.channel"],
        {
          commandPath: ["config", "unset"],
        },
      ),
    ).toEqual(["update.channel"]);
  });

  it("returns null when routed command sees unknown options", () => {
    expect(
      getCommandPositionalsWithRootOptions(
        ["node", "maumau", "config", "get", "--mystery", "value", "update.channel"],
        {
          commandPath: ["config", "get"],
          booleanFlags: ["--json"],
        },
      ),
    ).toBeNull();
  });

  it.each([
    {
      name: "returns first command token",
      argv: ["node", "maumau", "agents", "list"],
      expected: "agents",
    },
    {
      name: "returns null when no command exists",
      argv: ["node", "maumau"],
      expected: null,
    },
    {
      name: "skips known root option values",
      argv: ["node", "maumau", "--log-level", "debug", "status"],
      expected: "status",
    },
  ])("returns primary command: $name", ({ argv, expected }) => {
    expect(getPrimaryCommand(argv)).toBe(expected);
  });

  it.each([
    {
      name: "detects flag before terminator",
      argv: ["node", "maumau", "status", "--json"],
      flag: "--json",
      expected: true,
    },
    {
      name: "ignores flag after terminator",
      argv: ["node", "maumau", "--", "--json"],
      flag: "--json",
      expected: false,
    },
  ])("parses boolean flags: $name", ({ argv, flag, expected }) => {
    expect(hasFlag(argv, flag)).toBe(expected);
  });

  it.each([
    {
      name: "value in next token",
      argv: ["node", "maumau", "status", "--timeout", "5000"],
      expected: "5000",
    },
    {
      name: "value in equals form",
      argv: ["node", "maumau", "status", "--timeout=2500"],
      expected: "2500",
    },
    {
      name: "missing value",
      argv: ["node", "maumau", "status", "--timeout"],
      expected: null,
    },
    {
      name: "next token is another flag",
      argv: ["node", "maumau", "status", "--timeout", "--json"],
      expected: null,
    },
    {
      name: "flag appears after terminator",
      argv: ["node", "maumau", "--", "--timeout=99"],
      expected: undefined,
    },
  ])("extracts flag values: $name", ({ argv, expected }) => {
    expect(getFlagValue(argv, "--timeout")).toBe(expected);
  });

  it("parses verbose flags", () => {
    expect(getVerboseFlag(["node", "maumau", "status", "--verbose"])).toBe(true);
    expect(getVerboseFlag(["node", "maumau", "status", "--debug"])).toBe(false);
    expect(getVerboseFlag(["node", "maumau", "status", "--debug"], { includeDebug: true })).toBe(
      true,
    );
  });

  it.each([
    {
      name: "missing flag",
      argv: ["node", "maumau", "status"],
      expected: undefined,
    },
    {
      name: "missing value",
      argv: ["node", "maumau", "status", "--timeout"],
      expected: null,
    },
    {
      name: "valid positive integer",
      argv: ["node", "maumau", "status", "--timeout", "5000"],
      expected: 5000,
    },
    {
      name: "invalid integer",
      argv: ["node", "maumau", "status", "--timeout", "nope"],
      expected: undefined,
    },
  ])("parses positive integer flag values: $name", ({ argv, expected }) => {
    expect(getPositiveIntFlagValue(argv, "--timeout")).toBe(expected);
  });

  it("builds parse argv from raw args", () => {
    const cases = [
      {
        rawArgs: ["node", "maumau", "status"],
        expected: ["node", "maumau", "status"],
      },
      {
        rawArgs: ["node-22", "maumau", "status"],
        expected: ["node-22", "maumau", "status"],
      },
      {
        rawArgs: ["node-22.2.0.exe", "maumau", "status"],
        expected: ["node-22.2.0.exe", "maumau", "status"],
      },
      {
        rawArgs: ["node-22.2", "maumau", "status"],
        expected: ["node-22.2", "maumau", "status"],
      },
      {
        rawArgs: ["node-22.2.exe", "maumau", "status"],
        expected: ["node-22.2.exe", "maumau", "status"],
      },
      {
        rawArgs: ["/usr/bin/node-22.2.0", "maumau", "status"],
        expected: ["/usr/bin/node-22.2.0", "maumau", "status"],
      },
      {
        rawArgs: ["node24", "maumau", "status"],
        expected: ["node24", "maumau", "status"],
      },
      {
        rawArgs: ["/usr/bin/node24", "maumau", "status"],
        expected: ["/usr/bin/node24", "maumau", "status"],
      },
      {
        rawArgs: ["node24.exe", "maumau", "status"],
        expected: ["node24.exe", "maumau", "status"],
      },
      {
        rawArgs: ["nodejs", "maumau", "status"],
        expected: ["nodejs", "maumau", "status"],
      },
      {
        rawArgs: ["node-dev", "maumau", "status"],
        expected: ["node", "maumau", "node-dev", "maumau", "status"],
      },
      {
        rawArgs: ["maumau", "status"],
        expected: ["node", "maumau", "status"],
      },
      {
        rawArgs: ["bun", "src/entry.ts", "status"],
        expected: ["bun", "src/entry.ts", "status"],
      },
    ] as const;

    for (const testCase of cases) {
      const parsed = buildParseArgv({
        programName: "maumau",
        rawArgs: [...testCase.rawArgs],
      });
      expect(parsed).toEqual([...testCase.expected]);
    }
  });

  it("builds parse argv from fallback args", () => {
    const fallbackArgv = buildParseArgv({
      programName: "maumau",
      fallbackArgv: ["status"],
    });
    expect(fallbackArgv).toEqual(["node", "maumau", "status"]);
  });

  it("decides when to migrate state", () => {
    const nonMutatingArgv = [
      ["node", "maumau", "status"],
      ["node", "maumau", "health"],
      ["node", "maumau", "sessions"],
      ["node", "maumau", "config", "get", "update"],
      ["node", "maumau", "config", "unset", "update"],
      ["node", "maumau", "models", "list"],
      ["node", "maumau", "models", "status"],
      ["node", "maumau", "memory", "status"],
      ["node", "maumau", "update", "status", "--json"],
      ["node", "maumau", "agent", "--message", "hi"],
    ] as const;
    const mutatingArgv = [
      ["node", "maumau", "agents", "list"],
      ["node", "maumau", "message", "send"],
    ] as const;

    for (const argv of nonMutatingArgv) {
      expect(shouldMigrateState([...argv])).toBe(false);
    }
    for (const argv of mutatingArgv) {
      expect(shouldMigrateState([...argv])).toBe(true);
    }
  });

  it.each([
    { path: ["status"], expected: false },
    { path: ["update", "status"], expected: false },
    { path: ["config", "get"], expected: false },
    { path: ["models", "status"], expected: false },
    { path: ["agents", "list"], expected: true },
  ])("reuses command path for migrate state decisions: $path", ({ path, expected }) => {
    expect(shouldMigrateStateFromPath(path)).toBe(expected);
  });
});
