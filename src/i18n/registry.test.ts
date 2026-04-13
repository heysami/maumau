import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  loadLazyLocaleTranslation,
  resolveNavigatorLocale,
} from "../../ui/src/i18n/lib/registry.ts";
import type { TranslationMap } from "../../ui/src/i18n/lib/types.ts";

function getNestedTranslation(map: TranslationMap | null, ...path: string[]): string | undefined {
  let value: string | TranslationMap | undefined = map ?? undefined;
  for (const key of path) {
    if (value === undefined || typeof value === "string") {
      return undefined;
    }
    value = value[key];
  }
  return typeof value === "string" ? value : undefined;
}

describe("ui i18n locale registry", () => {
  it("lists supported locales", () => {
    expect(SUPPORTED_LOCALES).toEqual([
      "en",
      "id",
      "zh-CN",
      "zh-TW",
      "pt-BR",
      "de",
      "es",
      "ms",
      "th",
      "vi",
      "fil",
      "my",
      "jv",
      "su",
      "btk",
      "min",
      "ban",
      "mak",
      "mad",
    ]);
    expect(DEFAULT_LOCALE).toBe("en");
  });

  it("resolves browser locale fallbacks", () => {
    expect(resolveNavigatorLocale("de-DE")).toBe("de");
    expect(resolveNavigatorLocale("es-ES")).toBe("es");
    expect(resolveNavigatorLocale("es-MX")).toBe("es");
    expect(resolveNavigatorLocale("ms-MY")).toBe("ms");
    expect(resolveNavigatorLocale("th-TH")).toBe("th");
    expect(resolveNavigatorLocale("tl-PH")).toBe("fil");
    expect(resolveNavigatorLocale("jw-ID")).toBe("jv");
    expect(resolveNavigatorLocale("bbc-ID")).toBe("btk");
    expect(resolveNavigatorLocale("pt-PT")).toBe("pt-BR");
    expect(resolveNavigatorLocale("zh-HK")).toBe("zh-TW");
    expect(resolveNavigatorLocale("en-US")).toBe("en");
  });

  it("loads lazy locale translations from the registry", async () => {
    const id = await loadLazyLocaleTranslation("id");
    const de = await loadLazyLocaleTranslation("de");
    const es = await loadLazyLocaleTranslation("es");
    const ms = await loadLazyLocaleTranslation("ms");
    const ptBR = await loadLazyLocaleTranslation("pt-BR");
    const th = await loadLazyLocaleTranslation("th");
    const bug = await loadLazyLocaleTranslation("bug");
    const zhCN = await loadLazyLocaleTranslation("zh-CN");

    expect(getNestedTranslation(id, "common", "health")).toBe("Kesehatan");
    expect(getNestedTranslation(de, "common", "health")).toBe("Status");
    expect(getNestedTranslation(es, "common", "health")).toBe("Estado");
    expect(getNestedTranslation(ms, "common", "refresh")).toBe("Muat semula");
    expect(getNestedTranslation(th, "dashboard", "shell", "eyebrow")).toBeTruthy();
    expect(getNestedTranslation(bug, "common", "health")).toBeTruthy();
    expect(getNestedTranslation(es, "languages", "de")).toBe("Deutsch (Alemán)");
    expect(getNestedTranslation(ptBR, "languages", "es")).toBe("Español (Espanhol)");
    expect(getNestedTranslation(zhCN, "common", "health")).toBe("\u5065\u5eb7\u72b6\u51b5");
    expect(await loadLazyLocaleTranslation("en")).toBeNull();
  });
});
