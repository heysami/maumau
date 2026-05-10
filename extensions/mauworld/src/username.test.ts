import { describe, expect, it } from "vitest";
import { generateInstallUsername } from "./username.js";

describe("generateInstallUsername", () => {
  it("is deterministic for the same deviceId", () => {
    const a = generateInstallUsername("device-abc-123");
    const b = generateInstallUsername("device-abc-123");
    expect(a).toBe(b);
  });

  it("differs for different deviceIds", () => {
    const a = generateInstallUsername("device-aaaaaa");
    const b = generateInstallUsername("device-bbbbbb");
    expect(a).not.toBe(b);
  });

  it("returns three lowercase hyphenated word segments", () => {
    const handle = generateInstallUsername("device-xyz");
    expect(handle).toMatch(/^[a-z]+-[a-z]+-[a-z]+$/);
  });

  it("contains no digits", () => {
    const handle = generateInstallUsername("device-12345-67890");
    expect(handle).not.toMatch(/\d/);
  });

  it("trims whitespace from deviceId before hashing", () => {
    const a = generateInstallUsername("device-cba");
    const b = generateInstallUsername("  device-cba  ");
    expect(a).toBe(b);
  });

  it("throws on empty deviceId", () => {
    expect(() => generateInstallUsername("")).toThrow();
    expect(() => generateInstallUsername("   ")).toThrow();
  });
});
