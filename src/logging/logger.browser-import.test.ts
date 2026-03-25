import { afterEach, describe, expect, it, vi } from "vitest";

type LoggerModule = typeof import("./logger.js");

const originalGetBuiltinModule = (
  process as NodeJS.Process & { getBuiltinModule?: (id: string) => unknown }
).getBuiltinModule;

async function importBrowserSafeLogger(params?: {
  resolvePreferredMaumauTmpDir?: ReturnType<typeof vi.fn>;
}): Promise<{
  module: LoggerModule;
  resolvePreferredMaumauTmpDir: ReturnType<typeof vi.fn>;
}> {
  vi.resetModules();
  const resolvePreferredMaumauTmpDir =
    params?.resolvePreferredMaumauTmpDir ??
    vi.fn(() => {
      throw new Error("resolvePreferredMaumauTmpDir should not run during browser-safe import");
    });

  vi.doMock("../infra/tmp-maumau-dir.js", async () => {
    const actual = await vi.importActual<typeof import("../infra/tmp-maumau-dir.js")>(
      "../infra/tmp-maumau-dir.js",
    );
    return {
      ...actual,
      resolvePreferredMaumauTmpDir,
    };
  });

  Object.defineProperty(process, "getBuiltinModule", {
    configurable: true,
    value: undefined,
  });

  const module = await import("./logger.js");
  return { module, resolvePreferredMaumauTmpDir };
}

describe("logging/logger browser-safe import", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../infra/tmp-maumau-dir.js");
    Object.defineProperty(process, "getBuiltinModule", {
      configurable: true,
      value: originalGetBuiltinModule,
    });
  });

  it("does not resolve the preferred temp dir at import time when node fs is unavailable", async () => {
    const { module, resolvePreferredMaumauTmpDir } = await importBrowserSafeLogger();

    expect(resolvePreferredMaumauTmpDir).not.toHaveBeenCalled();
    expect(module.DEFAULT_LOG_DIR).toBe("/tmp/maumau");
    expect(module.DEFAULT_LOG_FILE).toBe("/tmp/maumau/maumau.log");
  });

  it("disables file logging when imported in a browser-like environment", async () => {
    const { module, resolvePreferredMaumauTmpDir } = await importBrowserSafeLogger();

    expect(module.getResolvedLoggerSettings()).toMatchObject({
      level: "silent",
      file: "/tmp/maumau/maumau.log",
    });
    expect(module.isFileLogLevelEnabled("info")).toBe(false);
    expect(() => module.getLogger().info("browser-safe")).not.toThrow();
    expect(resolvePreferredMaumauTmpDir).not.toHaveBeenCalled();
  });
});
