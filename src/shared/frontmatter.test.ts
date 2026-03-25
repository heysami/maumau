import { describe, expect, it, test } from "vitest";
import {
  applyMaumauManifestInstallCommonFields,
  getFrontmatterString,
  normalizeStringList,
  parseFrontmatterBool,
  parseMaumauManifestInstallBase,
  resolveMaumauManifestBlock,
  resolveMaumauManifestInstall,
  resolveMaumauManifestOs,
  resolveMaumauManifestRequires,
} from "./frontmatter.js";

describe("shared/frontmatter", () => {
  test("normalizeStringList handles strings, arrays, and non-list values", () => {
    expect(normalizeStringList("a, b,,c")).toEqual(["a", "b", "c"]);
    expect(normalizeStringList([" a ", "", "b", 42])).toEqual(["a", "b", "42"]);
    expect(normalizeStringList(null)).toEqual([]);
  });

  test("getFrontmatterString extracts strings only", () => {
    expect(getFrontmatterString({ a: "b" }, "a")).toBe("b");
    expect(getFrontmatterString({ a: 1 }, "a")).toBeUndefined();
  });

  test("parseFrontmatterBool respects explicit values and fallback", () => {
    expect(parseFrontmatterBool("true", false)).toBe(true);
    expect(parseFrontmatterBool("false", true)).toBe(false);
    expect(parseFrontmatterBool(undefined, true)).toBe(true);
    expect(parseFrontmatterBool("maybe", false)).toBe(false);
  });

  test("resolveMaumauManifestBlock reads current manifest keys and custom metadata fields", () => {
    expect(
      resolveMaumauManifestBlock({
        frontmatter: {
          metadata: "{ maumau: { foo: 1, bar: 'baz' } }",
        },
      }),
    ).toEqual({ foo: 1, bar: "baz" });

    expect(
      resolveMaumauManifestBlock({
        frontmatter: {
          pluginMeta: "{ maumau: { foo: 2 } }",
        },
        key: "pluginMeta",
      }),
    ).toEqual({ foo: 2 });
  });

  test("resolveMaumauManifestBlock returns undefined for invalid input", () => {
    expect(resolveMaumauManifestBlock({ frontmatter: {} })).toBeUndefined();
    expect(resolveMaumauManifestBlock({ frontmatter: { metadata: "not-json5" } })).toBeUndefined();
    expect(resolveMaumauManifestBlock({ frontmatter: { metadata: "123" } })).toBeUndefined();
    expect(resolveMaumauManifestBlock({ frontmatter: { metadata: "[]" } })).toBeUndefined();
    expect(
      resolveMaumauManifestBlock({ frontmatter: { metadata: "{ nope: { a: 1 } }" } }),
    ).toBeUndefined();
  });

  it("normalizes manifest requirement and os lists", () => {
    expect(
      resolveMaumauManifestRequires({
        requires: {
          bins: "bun, node",
          anyBins: [" ffmpeg ", ""],
          env: ["MAUMAU_TOKEN", " MAUMAU_URL "],
          config: null,
        },
      }),
    ).toEqual({
      bins: ["bun", "node"],
      anyBins: ["ffmpeg"],
      env: ["MAUMAU_TOKEN", "MAUMAU_URL"],
      config: [],
    });
    expect(resolveMaumauManifestRequires({})).toBeUndefined();
    expect(resolveMaumauManifestOs({ os: [" darwin ", "linux", ""] })).toEqual(["darwin", "linux"]);
  });

  it("parses and applies install common fields", () => {
    const parsed = parseMaumauManifestInstallBase(
      {
        type: " Brew ",
        id: "brew.git",
        label: "Git",
        bins: [" git ", "git"],
      },
      ["brew", "npm"],
    );

    expect(parsed).toEqual({
      raw: {
        type: " Brew ",
        id: "brew.git",
        label: "Git",
        bins: [" git ", "git"],
      },
      kind: "brew",
      id: "brew.git",
      label: "Git",
      bins: ["git", "git"],
    });
    expect(parseMaumauManifestInstallBase({ kind: "bad" }, ["brew"])).toBeUndefined();
    expect(
      applyMaumauManifestInstallCommonFields<{
        extra: boolean;
        id?: string;
        label?: string;
        bins?: string[];
      }>({ extra: true }, parsed!),
    ).toEqual({
      extra: true,
      id: "brew.git",
      label: "Git",
      bins: ["git", "git"],
    });
  });

  it("prefers explicit kind, ignores invalid common fields, and leaves missing ones untouched", () => {
    const parsed = parseMaumauManifestInstallBase(
      {
        kind: " npm ",
        type: "brew",
        id: 42,
        label: null,
        bins: [" ", ""],
      },
      ["brew", "npm"],
    );

    expect(parsed).toEqual({
      raw: {
        kind: " npm ",
        type: "brew",
        id: 42,
        label: null,
        bins: [" ", ""],
      },
      kind: "npm",
    });
    expect(
      applyMaumauManifestInstallCommonFields({ id: "keep", label: "Keep", bins: ["bun"] }, parsed!),
    ).toEqual({
      id: "keep",
      label: "Keep",
      bins: ["bun"],
    });
  });

  it("maps install entries through the parser and filters rejected specs", () => {
    expect(
      resolveMaumauManifestInstall(
        {
          install: [{ id: "keep" }, { id: "drop" }, "bad"],
        },
        (entry) => {
          if (
            typeof entry === "object" &&
            entry !== null &&
            (entry as { id?: string }).id === "keep"
          ) {
            return { id: "keep" };
          }
          return undefined;
        },
      ),
    ).toEqual([{ id: "keep" }]);
  });
});
