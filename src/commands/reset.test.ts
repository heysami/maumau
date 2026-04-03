import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNonExitingRuntime } from "../runtime.js";

const resolveCleanupPlanFromDisk = vi.fn();
const removePath = vi.fn();
const listAgentSessionDirs = vi.fn();
const removeMacAppStateArtifacts = vi.fn();
const removeStateAndLinkedPaths = vi.fn();
const removeWorkspaceDirs = vi.fn();
const stopRunningMacAppIfPresent = vi.fn();
const uninstallGatewayServiceIfPresent = vi.fn();

vi.mock("../config/config.js", () => ({
  isNixMode: false,
}));

vi.mock("./cleanup-plan.js", () => ({
  resolveCleanupPlanFromDisk,
}));

vi.mock("./cleanup-utils.js", () => ({
  removePath,
  listAgentSessionDirs,
  removeMacAppStateArtifacts,
  removeStateAndLinkedPaths,
  removeWorkspaceDirs,
  stopRunningMacAppIfPresent,
}));

vi.mock("./gateway-service-cleanup.js", () => ({
  uninstallGatewayServiceIfPresent,
}));

const { resetCommand } = await import("./reset.js");

describe("resetCommand", () => {
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
    listAgentSessionDirs.mockResolvedValue(["/tmp/.maumau/agents/main/sessions"]);
    removeMacAppStateArtifacts.mockResolvedValue(undefined);
    removeStateAndLinkedPaths.mockResolvedValue(undefined);
    removeWorkspaceDirs.mockResolvedValue(undefined);
    stopRunningMacAppIfPresent.mockResolvedValue(undefined);
    uninstallGatewayServiceIfPresent.mockResolvedValue(true);
    vi.spyOn(runtime, "log").mockImplementation(() => {});
    vi.spyOn(runtime, "error").mockImplementation(() => {});
  });

  it("recommends creating a backup before state-destructive reset scopes", async () => {
    await resetCommand(runtime, {
      scope: "config+creds+sessions",
      yes: true,
      nonInteractive: true,
      dryRun: true,
    });

    expect(runtime.log).toHaveBeenCalledWith(expect.stringContaining("maumau backup create"));
  });

  it("does not recommend backup for config-only reset", async () => {
    await resetCommand(runtime, {
      scope: "config",
      yes: true,
      nonInteractive: true,
      dryRun: true,
    });

    expect(runtime.log).not.toHaveBeenCalledWith(expect.stringContaining("maumau backup create"));
  });

  it("clean reset removes the gateway service before wiping local state", async () => {
    await resetCommand(runtime, {
      scope: "clean",
      yes: true,
      nonInteractive: true,
      dryRun: true,
    });

    expect(uninstallGatewayServiceIfPresent).toHaveBeenCalledWith(runtime, { dryRun: true });
    expect(stopRunningMacAppIfPresent).toHaveBeenCalledWith(runtime, { dryRun: true });
    expect(removeStateAndLinkedPaths).toHaveBeenCalledWith(
      expect.objectContaining({ stateDir: "/tmp/.maumau" }),
      runtime,
      { dryRun: true },
    );
    expect(removeWorkspaceDirs).toHaveBeenCalledWith(["/tmp/.maumau/workspace"], runtime, {
      dryRun: true,
    });
    expect(removeMacAppStateArtifacts).toHaveBeenCalledWith(runtime, { dryRun: true });
  });

  it("config-only reset keeps mac app state untouched", async () => {
    await resetCommand(runtime, {
      scope: "config",
      yes: true,
      nonInteractive: true,
      dryRun: true,
    });

    expect(removeMacAppStateArtifacts).not.toHaveBeenCalled();
    expect(stopRunningMacAppIfPresent).not.toHaveBeenCalled();
  });
});
