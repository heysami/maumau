import { describe, expect, it } from "vitest";
import {
  ensureMaumauExecMarkerOnProcess,
  markMaumauExecEnv,
  MAUMAU_CLI_ENV_VALUE,
  MAUMAU_CLI_ENV_VAR,
} from "./maumau-exec-env.js";

describe("markMaumauExecEnv", () => {
  it("returns a cloned env object with the exec marker set", () => {
    const env = { PATH: "/usr/bin", MAUMAU_CLI: "0" };
    const marked = markMaumauExecEnv(env);

    expect(marked).toEqual({
      PATH: "/usr/bin",
      MAUMAU_CLI: MAUMAU_CLI_ENV_VALUE,
    });
    expect(marked).not.toBe(env);
    expect(env.MAUMAU_CLI).toBe("0");
  });
});

describe("ensureMaumauExecMarkerOnProcess", () => {
  it("mutates and returns the provided process env", () => {
    const env: NodeJS.ProcessEnv = { PATH: "/usr/bin" };

    expect(ensureMaumauExecMarkerOnProcess(env)).toBe(env);
    expect(env[MAUMAU_CLI_ENV_VAR]).toBe(MAUMAU_CLI_ENV_VALUE);
  });

  it("defaults to mutating process.env when no env object is provided", () => {
    const previous = process.env[MAUMAU_CLI_ENV_VAR];
    delete process.env[MAUMAU_CLI_ENV_VAR];

    try {
      expect(ensureMaumauExecMarkerOnProcess()).toBe(process.env);
      expect(process.env[MAUMAU_CLI_ENV_VAR]).toBe(MAUMAU_CLI_ENV_VALUE);
    } finally {
      if (previous === undefined) {
        delete process.env[MAUMAU_CLI_ENV_VAR];
      } else {
        process.env[MAUMAU_CLI_ENV_VAR] = previous;
      }
    }
  });
});
