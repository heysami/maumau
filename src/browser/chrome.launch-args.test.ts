import { describe, expect, it } from "vitest";
import { buildMaumauChromeLaunchArgs } from "./chrome.js";

describe("browser chrome launch args", () => {
  it("does not force an about:blank tab at startup", () => {
    const args = buildMaumauChromeLaunchArgs({
      resolved: {
        enabled: true,
        controlPort: 18791,
        cdpProtocol: "http",
        cdpHost: "127.0.0.1",
        cdpIsLoopback: true,
        cdpPortRangeStart: 18800,
        cdpPortRangeEnd: 18810,
        evaluateEnabled: false,
        remoteCdpTimeoutMs: 1500,
        remoteCdpHandshakeTimeoutMs: 3000,
        extraArgs: [],
        color: "#FF4500",
        headless: false,
        noSandbox: false,
        attachOnly: false,
        ssrfPolicy: { allowPrivateNetwork: true },
        defaultProfile: "maumau",
        profiles: {
          maumau: { cdpPort: 18800, color: "#FF4500" },
        },
      },
      profile: {
        name: "maumau",
        cdpUrl: "http://127.0.0.1:18800",
        cdpPort: 18800,
        cdpHost: "127.0.0.1",
        cdpIsLoopback: true,
        color: "#FF4500",
        driver: "maumau",
        attachOnly: false,
      },
      userDataDir: "/tmp/maumau-test-user-data",
    });

    expect(args).not.toContain("about:blank");
    expect(args).toContain("--remote-debugging-port=18800");
    expect(args).toContain("--user-data-dir=/tmp/maumau-test-user-data");
  });

  it("can force a hidden bootstrap launch before the visible headed run", () => {
    const args = buildMaumauChromeLaunchArgs({
      resolved: {
        enabled: true,
        controlPort: 18791,
        cdpProtocol: "http",
        cdpHost: "127.0.0.1",
        cdpIsLoopback: true,
        cdpPortRangeStart: 18800,
        cdpPortRangeEnd: 18810,
        evaluateEnabled: false,
        remoteCdpTimeoutMs: 1500,
        remoteCdpHandshakeTimeoutMs: 3000,
        extraArgs: [],
        color: "#FF4500",
        headless: false,
        noSandbox: false,
        attachOnly: false,
        ssrfPolicy: { allowPrivateNetwork: true },
        defaultProfile: "maumau",
        profiles: {
          maumau: { cdpPort: 18800, color: "#FF4500" },
        },
      },
      profile: {
        name: "maumau",
        cdpUrl: "http://127.0.0.1:18800",
        cdpPort: 18800,
        cdpHost: "127.0.0.1",
        cdpIsLoopback: true,
        color: "#FF4500",
        driver: "maumau",
        attachOnly: false,
      },
      userDataDir: "/tmp/maumau-test-user-data",
      headlessOverride: true,
    });

    expect(args).toContain("--headless=new");
    expect(args).toContain("--disable-gpu");
  });
});
