import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNonExitingRuntime } from "../runtime.js";

const resolveCleanupPlanFromDisk = vi.fn();
const removePath = vi.fn();
const removeMacAppStateArtifacts = vi.fn();
const removeStateAndLinkedPaths = vi.fn();
const removeWorkspaceDirs = vi.fn();
const uninstallGatewayServiceIfPresent = vi.fn();

vi.mock("../config/config.js", () => ({
  isNixMode: false,
}));

vi.mock("./cleanup-plan.js", () => ({
  resolveCleanupPlanFromDisk,
}));

vi.mock("./cleanup-utils.js", () => ({
  removePath,
  removeMacAppStateArtifacts,
  removeStateAndLinkedPaths,
  removeWorkspaceDirs,
}));

vi.mock("./gateway-service-cleanup.js", () => ({
  uninstallGatewayServiceIfPresent,
}));

const { uninstallCommand } = await import("./uninstall.js");

describe("uninstallCommand", () => {
  const runtime = createNonExitingRuntime();

  beforeEach(() => {
    vi.clearAllMocks();
    resolveCleanupPlanFromDisk.mockReturnValue({
      stateDir: "/tmp/.maumau",
      configPath: "/tmp/.maumau/maumau.json",
      oauthDir: "/tmp/.maumau/credentials",
      configInsideState: true,
      oauthInsideState: true,
      workspaceDirs: ["/tmp/.maumau/workspace"],
    });
    removePath.mockResolvedValue({ ok: true });
    removeMacAppStateArtifacts.mockResolvedValue(undefined);
    removeStateAndLinkedPaths.mockResolvedValue(undefined);
    removeWorkspaceDirs.mockResolvedValue(undefined);
    uninstallGatewayServiceIfPresent.mockResolvedValue(true);
    vi.spyOn(runtime, "log").mockImplementation(() => {});
    vi.spyOn(runtime, "error").mockImplementation(() => {});
  });

  it("recommends creating a backup before removing state or workspaces", async () => {
    await uninstallCommand(runtime, {
      state: true,
      yes: true,
      nonInteractive: true,
      dryRun: true,
    });

    expect(runtime.log).toHaveBeenCalledWith(expect.stringContaining("maumau backup create"));
  });

  it("does not recommend backup for service-only uninstall", async () => {
    await uninstallCommand(runtime, {
      service: true,
      yes: true,
      nonInteractive: true,
      dryRun: true,
    });

    expect(runtime.log).not.toHaveBeenCalledWith(expect.stringContaining("maumau backup create"));
  });

  it("uses shared gateway service cleanup when uninstalling the service", async () => {
    await uninstallCommand(runtime, {
      service: true,
      yes: true,
      nonInteractive: true,
      dryRun: true,
    });

    expect(uninstallGatewayServiceIfPresent).toHaveBeenCalledWith(runtime, { dryRun: true });
  });

  it("removes mac app state when uninstalling Maumau state", async () => {
    await uninstallCommand(runtime, {
      state: true,
      yes: true,
      nonInteractive: true,
      dryRun: true,
    });

    expect(removeMacAppStateArtifacts).toHaveBeenCalledWith(runtime, { dryRun: true });
  });
});
