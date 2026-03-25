import { describe, expect, it } from "vitest";
import { buildPlatformRuntimeLogHints, buildPlatformServiceStartHints } from "./runtime-hints.js";

describe("buildPlatformRuntimeLogHints", () => {
  it("renders launchd log hints on darwin", () => {
    expect(
      buildPlatformRuntimeLogHints({
        platform: "darwin",
        env: {
          MAUMAU_STATE_DIR: "/tmp/maumau-state",
          MAUMAU_LOG_PREFIX: "gateway",
        },
        systemdServiceName: "maumau-gateway",
        windowsTaskName: "Maumau Gateway",
      }),
    ).toEqual([
      "Launchd stdout (if installed): /tmp/maumau-state/logs/gateway.log",
      "Launchd stderr (if installed): /tmp/maumau-state/logs/gateway.err.log",
    ]);
  });

  it("renders systemd and windows hints by platform", () => {
    expect(
      buildPlatformRuntimeLogHints({
        platform: "linux",
        systemdServiceName: "maumau-gateway",
        windowsTaskName: "Maumau Gateway",
      }),
    ).toEqual(["Logs: journalctl --user -u maumau-gateway.service -n 200 --no-pager"]);
    expect(
      buildPlatformRuntimeLogHints({
        platform: "win32",
        systemdServiceName: "maumau-gateway",
        windowsTaskName: "Maumau Gateway",
      }),
    ).toEqual(['Logs: schtasks /Query /TN "Maumau Gateway" /V /FO LIST']);
  });
});

describe("buildPlatformServiceStartHints", () => {
  it("builds platform-specific service start hints", () => {
    expect(
      buildPlatformServiceStartHints({
        platform: "darwin",
        installCommand: "maumau gateway install",
        startCommand: "maumau gateway",
        launchAgentPlistPath: "~/Library/LaunchAgents/com.maumau.gateway.plist",
        systemdServiceName: "maumau-gateway",
        windowsTaskName: "Maumau Gateway",
      }),
    ).toEqual([
      "maumau gateway install",
      "maumau gateway",
      "launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.maumau.gateway.plist",
    ]);
    expect(
      buildPlatformServiceStartHints({
        platform: "linux",
        installCommand: "maumau gateway install",
        startCommand: "maumau gateway",
        launchAgentPlistPath: "~/Library/LaunchAgents/com.maumau.gateway.plist",
        systemdServiceName: "maumau-gateway",
        windowsTaskName: "Maumau Gateway",
      }),
    ).toEqual([
      "maumau gateway install",
      "maumau gateway",
      "systemctl --user start maumau-gateway.service",
    ]);
  });
});
