import { describe, expect, it, vi } from "vitest";
import {
  maybeRunCliInContainer,
  parseCliContainerArgs,
  resolveCliContainerTarget,
} from "./container-target.js";

describe("parseCliContainerArgs", () => {
  it("extracts a root --container flag before the command", () => {
    expect(
      parseCliContainerArgs(["node", "maumau", "--container", "demo", "status", "--deep"]),
    ).toEqual({
      ok: true,
      container: "demo",
      argv: ["node", "maumau", "status", "--deep"],
    });
  });

  it("accepts the equals form", () => {
    expect(parseCliContainerArgs(["node", "maumau", "--container=demo", "health"])).toEqual({
      ok: true,
      container: "demo",
      argv: ["node", "maumau", "health"],
    });
  });

  it("rejects a missing container value", () => {
    expect(parseCliContainerArgs(["node", "maumau", "--container"])).toEqual({
      ok: false,
      error: "--container requires a value",
    });
  });

  it("does not consume an adjacent flag as the container value", () => {
    expect(
      parseCliContainerArgs(["node", "maumau", "--container", "--no-color", "status"]),
    ).toEqual({
      ok: false,
      error: "--container requires a value",
    });
  });

  it("leaves argv unchanged when the flag is absent", () => {
    expect(parseCliContainerArgs(["node", "maumau", "status"])).toEqual({
      ok: true,
      container: null,
      argv: ["node", "maumau", "status"],
    });
  });

  it("extracts --container after the command like other root options", () => {
    expect(
      parseCliContainerArgs(["node", "maumau", "status", "--container", "demo", "--deep"]),
    ).toEqual({
      ok: true,
      container: "demo",
      argv: ["node", "maumau", "status", "--deep"],
    });
  });

  it("stops parsing --container after the -- terminator", () => {
    expect(
      parseCliContainerArgs([
        "node",
        "maumau",
        "nodes",
        "run",
        "--",
        "docker",
        "run",
        "--container",
        "demo",
        "alpine",
      ]),
    ).toEqual({
      ok: true,
      container: null,
      argv: [
        "node",
        "maumau",
        "nodes",
        "run",
        "--",
        "docker",
        "run",
        "--container",
        "demo",
        "alpine",
      ],
    });
  });
});

describe("resolveCliContainerTarget", () => {
  it("uses argv first and falls back to MAUMAU_CONTAINER", () => {
    expect(resolveCliContainerTarget(["node", "maumau", "--container", "demo", "status"], {})).toBe(
      "demo",
    );
    expect(resolveCliContainerTarget(["node", "maumau", "status"], {})).toBeNull();
    expect(
      resolveCliContainerTarget(["node", "maumau", "status"], {
        MAUMAU_CONTAINER: "demo",
      } as NodeJS.ProcessEnv),
    ).toBe("demo");
  });
});

describe("maybeRunCliInContainer", () => {
  it("passes through when no container target is provided", () => {
    expect(maybeRunCliInContainer(["node", "maumau", "status"], { env: {} })).toEqual({
      handled: false,
      argv: ["node", "maumau", "status"],
    });
  });

  it("uses MAUMAU_CONTAINER when the flag is absent", () => {
    const spawnSync = vi
      .fn()
      .mockReturnValueOnce({
        status: 0,
        stdout: "true\n",
      })
      .mockReturnValueOnce({
        status: 1,
        stdout: "",
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: "",
      });

    expect(
      maybeRunCliInContainer(["node", "maumau", "status"], {
        env: { MAUMAU_CONTAINER: "demo" } as NodeJS.ProcessEnv,
        spawnSync,
      }),
    ).toEqual({
      handled: true,
      exitCode: 0,
    });

    expect(spawnSync).toHaveBeenNthCalledWith(
      3,
      "podman",
      [
        "exec",
        "-i",
        "--env",
        "MAUMAU_CONTAINER_HINT=demo",
        "--env",
        "MAUMAU_CLI_CONTAINER_BYPASS=1",
        "demo",
        "maumau",
        "status",
      ],
      {
        stdio: "inherit",
        env: {
          MAUMAU_CONTAINER: "",
        },
      },
    );
  });

  it("clears inherited MAUMAU_CONTAINER before execing into the child CLI", () => {
    const spawnSync = vi
      .fn()
      .mockReturnValueOnce({
        status: 0,
        stdout: "true\n",
      })
      .mockReturnValueOnce({
        status: 1,
        stdout: "",
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: "",
      });

    maybeRunCliInContainer(["node", "maumau", "status"], {
      env: {
        MAUMAU_CONTAINER: "demo",
        MAUMAU_GATEWAY_TOKEN: "token",
      } as NodeJS.ProcessEnv,
      spawnSync,
    });

    expect(spawnSync).toHaveBeenNthCalledWith(
      3,
      "podman",
      [
        "exec",
        "-i",
        "--env",
        "MAUMAU_CONTAINER_HINT=demo",
        "--env",
        "MAUMAU_CLI_CONTAINER_BYPASS=1",
        "demo",
        "maumau",
        "status",
      ],
      {
        stdio: "inherit",
        env: {
          MAUMAU_CONTAINER: "",
          MAUMAU_GATEWAY_TOKEN: "token",
        },
      },
    );
  });

  it("executes through podman when the named container is running", () => {
    const spawnSync = vi
      .fn()
      .mockReturnValueOnce({
        status: 0,
        stdout: "true\n",
      })
      .mockReturnValueOnce({
        status: 1,
        stdout: "",
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: "",
      });

    expect(
      maybeRunCliInContainer(["node", "maumau", "--container", "demo", "status"], {
        env: {},
        spawnSync,
      }),
    ).toEqual({
      handled: true,
      exitCode: 0,
    });

    expect(spawnSync).toHaveBeenNthCalledWith(
      1,
      "podman",
      ["inspect", "--format", "{{.State.Running}}", "demo"],
      { encoding: "utf8" },
    );
    expect(spawnSync).toHaveBeenNthCalledWith(
      3,
      "podman",
      [
        "exec",
        "-i",
        "--env",
        "MAUMAU_CONTAINER_HINT=demo",
        "--env",
        "MAUMAU_CLI_CONTAINER_BYPASS=1",
        "demo",
        "maumau",
        "status",
      ],
      {
        stdio: "inherit",
        env: { MAUMAU_CONTAINER: "" },
      },
    );
  });

  it("falls back to docker when podman does not have the container", () => {
    const spawnSync = vi
      .fn()
      .mockReturnValueOnce({
        status: 1,
        stdout: "",
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: "true\n",
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: "",
      });

    expect(
      maybeRunCliInContainer(["node", "maumau", "--container", "demo", "health"], {
        env: { USER: "maumau" } as NodeJS.ProcessEnv,
        spawnSync,
      }),
    ).toEqual({
      handled: true,
      exitCode: 0,
    });

    expect(spawnSync).toHaveBeenNthCalledWith(
      2,
      "docker",
      ["inspect", "--format", "{{.State.Running}}", "demo"],
      { encoding: "utf8" },
    );
    expect(spawnSync).toHaveBeenNthCalledWith(
      3,
      "docker",
      [
        "exec",
        "-i",
        "-e",
        "MAUMAU_CONTAINER_HINT=demo",
        "-e",
        "MAUMAU_CLI_CONTAINER_BYPASS=1",
        "demo",
        "maumau",
        "health",
      ],
      {
        stdio: "inherit",
        env: { USER: "maumau", MAUMAU_CONTAINER: "" },
      },
    );
  });

  it("falls back to sudo -u maumau podman for the documented dedicated-user flow", () => {
    const spawnSync = vi
      .fn()
      .mockReturnValueOnce({
        status: 1,
        stdout: "",
      })
      .mockReturnValueOnce({
        status: 1,
        stdout: "",
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: "true\n",
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: "",
      });

    expect(
      maybeRunCliInContainer(["node", "maumau", "--container", "maumau", "status"], {
        env: { USER: "somalley" } as NodeJS.ProcessEnv,
        spawnSync,
      }),
    ).toEqual({
      handled: true,
      exitCode: 0,
    });

    expect(spawnSync).toHaveBeenNthCalledWith(
      3,
      "sudo",
      ["-u", "maumau", "podman", "inspect", "--format", "{{.State.Running}}", "maumau"],
      { encoding: "utf8", stdio: ["inherit", "pipe", "inherit"] },
    );
    expect(spawnSync).toHaveBeenNthCalledWith(
      4,
      "sudo",
      [
        "-u",
        "maumau",
        "podman",
        "exec",
        "-i",
        "--env",
        "MAUMAU_CONTAINER_HINT=maumau",
        "--env",
        "MAUMAU_CLI_CONTAINER_BYPASS=1",
        "maumau",
        "maumau",
        "status",
      ],
      {
        stdio: "inherit",
        env: { USER: "somalley", MAUMAU_CONTAINER: "" },
      },
    );
  });

  it("checks docker before the dedicated-user podman fallback", () => {
    const spawnSync = vi
      .fn()
      .mockReturnValueOnce({
        status: 1,
        stdout: "",
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: "true\n",
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: "",
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: "",
      });

    expect(
      maybeRunCliInContainer(["node", "maumau", "--container", "demo", "status"], {
        env: { USER: "somalley" } as NodeJS.ProcessEnv,
        spawnSync,
      }),
    ).toEqual({
      handled: true,
      exitCode: 0,
    });

    expect(spawnSync).toHaveBeenNthCalledWith(
      1,
      "podman",
      ["inspect", "--format", "{{.State.Running}}", "demo"],
      { encoding: "utf8" },
    );
    expect(spawnSync).toHaveBeenNthCalledWith(
      2,
      "docker",
      ["inspect", "--format", "{{.State.Running}}", "demo"],
      { encoding: "utf8" },
    );
    expect(spawnSync).toHaveBeenNthCalledWith(
      3,
      "docker",
      [
        "exec",
        "-i",
        "-e",
        "MAUMAU_CONTAINER_HINT=demo",
        "-e",
        "MAUMAU_CLI_CONTAINER_BYPASS=1",
        "demo",
        "maumau",
        "status",
      ],
      {
        stdio: "inherit",
        env: { USER: "somalley", MAUMAU_CONTAINER: "" },
      },
    );
    expect(spawnSync).toHaveBeenCalledTimes(3);
  });

  it("rejects ambiguous matches across runtimes", () => {
    const spawnSync = vi
      .fn()
      .mockReturnValueOnce({
        status: 0,
        stdout: "true\n",
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: "true\n",
      })
      .mockReturnValueOnce({
        status: 1,
        stdout: "",
      });

    expect(() =>
      maybeRunCliInContainer(["node", "maumau", "--container", "demo", "status"], {
        env: { USER: "somalley" } as NodeJS.ProcessEnv,
        spawnSync,
      }),
    ).toThrow(
      'Container "demo" is running under multiple runtimes (podman, docker); use a unique container name.',
    );
  });

  it("allocates a tty for interactive terminal sessions", () => {
    const spawnSync = vi
      .fn()
      .mockReturnValueOnce({
        status: 0,
        stdout: "true\n",
      })
      .mockReturnValueOnce({
        status: 1,
        stdout: "",
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: "",
      });

    maybeRunCliInContainer(["node", "maumau", "--container", "demo", "setup"], {
      env: {},
      spawnSync,
      stdinIsTTY: true,
      stdoutIsTTY: true,
    });

    expect(spawnSync).toHaveBeenNthCalledWith(
      3,
      "podman",
      [
        "exec",
        "-i",
        "-t",
        "--env",
        "MAUMAU_CONTAINER_HINT=demo",
        "--env",
        "MAUMAU_CLI_CONTAINER_BYPASS=1",
        "demo",
        "maumau",
        "setup",
      ],
      {
        stdio: "inherit",
        env: { MAUMAU_CONTAINER: "" },
      },
    );
  });

  it("prefers --container over MAUMAU_CONTAINER", () => {
    const spawnSync = vi
      .fn()
      .mockReturnValueOnce({
        status: 0,
        stdout: "true\n",
      })
      .mockReturnValueOnce({
        status: 1,
        stdout: "",
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: "",
      });

    expect(
      maybeRunCliInContainer(["node", "maumau", "--container", "flag-demo", "health"], {
        env: { MAUMAU_CONTAINER: "env-demo" } as NodeJS.ProcessEnv,
        spawnSync,
      }),
    ).toEqual({
      handled: true,
      exitCode: 0,
    });

    expect(spawnSync).toHaveBeenNthCalledWith(
      1,
      "podman",
      ["inspect", "--format", "{{.State.Running}}", "flag-demo"],
      { encoding: "utf8" },
    );
  });

  it("throws when the named container is not running", () => {
    const spawnSync = vi.fn().mockReturnValue({
      status: 1,
      stdout: "",
    });

    expect(() =>
      maybeRunCliInContainer(["node", "maumau", "--container", "demo", "status"], {
        env: {},
        spawnSync,
      }),
    ).toThrow('No running container matched "demo" under podman or docker.');
  });

  it("skips recursion when the bypass env is set", () => {
    expect(
      maybeRunCliInContainer(["node", "maumau", "--container", "demo", "status"], {
        env: { MAUMAU_CLI_CONTAINER_BYPASS: "1" } as NodeJS.ProcessEnv,
      }),
    ).toEqual({
      handled: false,
      argv: ["node", "maumau", "--container", "demo", "status"],
    });
  });

  it("blocks updater commands from running inside the container", () => {
    const spawnSync = vi.fn().mockReturnValue({
      status: 0,
      stdout: "true\n",
    });

    expect(() =>
      maybeRunCliInContainer(["node", "maumau", "--container", "demo", "update"], {
        env: {},
        spawnSync,
      }),
    ).toThrow(
      "maumau update is not supported with --container; rebuild or restart the container image instead.",
    );
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it("blocks update after interleaved root flags", () => {
    const spawnSync = vi.fn().mockReturnValue({
      status: 0,
      stdout: "true\n",
    });

    expect(() =>
      maybeRunCliInContainer(["node", "maumau", "--container", "demo", "--no-color", "update"], {
        env: {},
        spawnSync,
      }),
    ).toThrow(
      "maumau update is not supported with --container; rebuild or restart the container image instead.",
    );
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it("blocks the --update shorthand from running inside the container", () => {
    const spawnSync = vi.fn().mockReturnValue({
      status: 0,
      stdout: "true\n",
    });

    expect(() =>
      maybeRunCliInContainer(["node", "maumau", "--container", "demo", "--update"], {
        env: {},
        spawnSync,
      }),
    ).toThrow(
      "maumau update is not supported with --container; rebuild or restart the container image instead.",
    );
    expect(spawnSync).not.toHaveBeenCalled();
  });
});
