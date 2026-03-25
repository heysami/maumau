import { describe, expect, it } from "vitest";
import { shortenText } from "./text-format.js";

describe("shortenText", () => {
  it("returns original text when it fits", () => {
    expect(shortenText("maumau", 16)).toBe("maumau");
  });

  it("truncates and appends ellipsis when over limit", () => {
    expect(shortenText("maumau-status-output", 10)).toBe("maumau-…");
  });

  it("counts multi-byte characters correctly", () => {
    expect(shortenText("hello🙂world", 7)).toBe("hello🙂…");
  });
});
