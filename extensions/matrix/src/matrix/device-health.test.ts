import { describe, expect, it } from "vitest";
import { isMaumauManagedMatrixDevice, summarizeMatrixDeviceHealth } from "./device-health.js";

describe("matrix device health", () => {
  it("detects Maumau-managed device names", () => {
    expect(isMaumauManagedMatrixDevice("Maumau Gateway")).toBe(true);
    expect(isMaumauManagedMatrixDevice("Maumau Debug")).toBe(true);
    expect(isMaumauManagedMatrixDevice("Element iPhone")).toBe(false);
    expect(isMaumauManagedMatrixDevice(null)).toBe(false);
  });

  it("summarizes stale Maumau-managed devices separately from the current device", () => {
    const summary = summarizeMatrixDeviceHealth([
      {
        deviceId: "du314Zpw3A",
        displayName: "Maumau Gateway",
        current: true,
      },
      {
        deviceId: "BritdXC6iL",
        displayName: "Maumau Gateway",
        current: false,
      },
      {
        deviceId: "G6NJU9cTgs",
        displayName: "Maumau Debug",
        current: false,
      },
      {
        deviceId: "phone123",
        displayName: "Element iPhone",
        current: false,
      },
    ]);

    expect(summary.currentDeviceId).toBe("du314Zpw3A");
    expect(summary.currentMaumauDevices).toEqual([
      expect.objectContaining({ deviceId: "du314Zpw3A" }),
    ]);
    expect(summary.staleMaumauDevices).toEqual([
      expect.objectContaining({ deviceId: "BritdXC6iL" }),
      expect.objectContaining({ deviceId: "G6NJU9cTgs" }),
    ]);
  });
});
