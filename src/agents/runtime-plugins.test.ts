import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  loadMaumauPlugins: vi.fn(),
  getActivePluginRegistryKey: vi.fn<() => string | null>(),
}));

vi.mock("../plugins/loader.js", () => ({
  loadMaumauPlugins: hoisted.loadMaumauPlugins,
}));

vi.mock("../plugins/runtime.js", () => ({
  getActivePluginRegistryKey: hoisted.getActivePluginRegistryKey,
}));

describe("ensureRuntimePluginsLoaded", () => {
  beforeEach(() => {
    hoisted.loadMaumauPlugins.mockReset();
    hoisted.getActivePluginRegistryKey.mockReset();
    hoisted.getActivePluginRegistryKey.mockReturnValue(null);
    vi.resetModules();
  });

  it("does not reactivate plugins when a process already has an active registry", async () => {
    const { ensureRuntimePluginsLoaded } = await import("./runtime-plugins.js");
    hoisted.getActivePluginRegistryKey.mockReturnValue("gateway-registry");

    ensureRuntimePluginsLoaded({
      config: {} as never,
      workspaceDir: "/tmp/workspace",
      allowGatewaySubagentBinding: true,
    });

    expect(hoisted.loadMaumauPlugins).not.toHaveBeenCalled();
  });

  it("loads runtime plugins when no active registry exists", async () => {
    const { ensureRuntimePluginsLoaded } = await import("./runtime-plugins.js");

    ensureRuntimePluginsLoaded({
      config: {} as never,
      workspaceDir: "/tmp/workspace",
      allowGatewaySubagentBinding: true,
    });

    expect(hoisted.loadMaumauPlugins).toHaveBeenCalledWith({
      config: {} as never,
      workspaceDir: "/tmp/workspace",
      runtimeOptions: {
        allowGatewaySubagentBinding: true,
      },
    });
  });
});
