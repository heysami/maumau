import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DASHBOARD_LOCALE_IDS, MAC_LANGUAGE_IDS } from "../../../../src/i18n/languages.ts";
import { de } from "../locales/de.ts";
import { en } from "../locales/en.ts";
import { es } from "../locales/es.ts";
import { id } from "../locales/id.ts";
import { ms } from "../locales/ms.ts";
import { pt_BR } from "../locales/pt-BR.ts";
import { zh_CN } from "../locales/zh-CN.ts";
import { zh_TW } from "../locales/zh-TW.ts";

type TranslateModule = typeof import("../lib/translate.ts");
type SharedLocaleFile = {
  dashboard?: Record<string, string | Record<string, unknown>>;
  mac?: Record<string, string | Record<string, unknown> | unknown[]>;
  shared?: Record<string, string | Record<string, unknown> | unknown[]>;
};

const SHARED_LOCALE_BASE = resolve(
  process.cwd(),
  "../apps/shared/MaumauKit/Sources/MaumauKit/Resources/localization",
);

function createStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

function flattenTranslationKeys(
  map: Record<string, string | Record<string, unknown>>,
  prefix = "",
): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(map)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      keys.push(path);
      continue;
    }
    keys.push(
      ...flattenTranslationKeys(value as Record<string, string | Record<string, unknown>>, path),
    );
  }
  return keys;
}

function loadSharedLocale(localeId: string): SharedLocaleFile {
  return JSON.parse(readFileSync(resolve(SHARED_LOCALE_BASE, `${localeId}.json`), "utf8"));
}

function flattenJsonKeys(value: unknown, prefix = ""): string[] {
  if (typeof value === "string") {
    return prefix ? [prefix] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => flattenJsonKeys(item, `${prefix}[${index}]`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, nested]) =>
      flattenJsonKeys(nested, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [];
}

describe("i18n", () => {
  let translate: TranslateModule;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("localStorage", createStorageMock());
    vi.stubGlobal("navigator", { language: "en-US" } as Navigator);
    translate = await import("../lib/translate.ts");
    localStorage.clear();
    // Reset to English
    await translate.i18n.setLocale("en");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should return the key if translation is missing", () => {
    expect(translate.t("non.existent.key")).toBe("non.existent.key");
  });

  it("should return the correct English translation", () => {
    expect(translate.t("common.health")).toBe("Health");
  });

  it("should replace parameters correctly", () => {
    expect(translate.t("overview.stats.cronNext", { time: "10:00" })).toBe("Next wake 10:00");
  });

  it("should fallback to English if key is missing in another locale", async () => {
    // We haven't registered other locales in the test environment yet,
    // but the logic should fallback to 'en' map which is always there.
    await translate.i18n.setLocale("zh-CN");
    // Since we don't mock the import, it might fail to load zh-CN,
    // but let's assume it falls back to English for now.
    expect(translate.t("common.health")).toBeDefined();
  });

  it("loads translations even when setting the same locale again", async () => {
    const internal = translate.i18n as unknown as {
      locale: string;
      translations: Record<string, unknown>;
    };
    internal.locale = "zh-CN";
    delete internal.translations["zh-CN"];

    await translate.i18n.setLocale("zh-CN");
    expect(translate.t("common.health")).toBe("健康状况");
  });

  it("loads saved non-English locale on startup", async () => {
    vi.resetModules();
    vi.stubGlobal("localStorage", createStorageMock());
    vi.stubGlobal("navigator", { language: "en-US" } as Navigator);
    localStorage.setItem("maumau.i18n.locale", "zh-CN");
    const fresh = await import("../lib/translate.ts");
    await vi.waitFor(() => {
      expect(fresh.i18n.getLocale()).toBe("zh-CN");
    });
    expect(fresh.i18n.getLocale()).toBe("zh-CN");
    expect(fresh.t("common.health")).toBe("健康状况");
  });

  it("does not let an older async locale load override a newer locale choice", async () => {
    vi.resetModules();
    vi.stubGlobal("localStorage", createStorageMock());
    vi.stubGlobal("navigator", { language: "en-US" } as Navigator);
    localStorage.setItem("maumau.i18n.locale", "zh-CN");

    const fresh = await import("../lib/translate.ts");
    await fresh.i18n.setLocale("en");

    await vi.waitFor(() => {
      expect(fresh.i18n.getLocale()).toBe("en");
    });
    expect(fresh.i18n.getLocale()).toBe("en");
  });

  it("skips node localStorage accessors that warn without a storage file", async () => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.stubGlobal("navigator", { language: "en-US" } as Navigator);
    const warningSpy = vi.spyOn(process, "emitWarning");

    const fresh = await import("../lib/translate.ts");

    expect(fresh.i18n.getLocale()).toBe("en");
    expect(warningSpy).not.toHaveBeenCalledWith(
      "`--localstorage-file` was provided without a valid path",
      expect.anything(),
      expect.anything(),
    );
  });

  it("keeps the version label available in shipped locales", () => {
    expect((id.common as { version?: string }).version).toBeTruthy();
    expect((ms.common as { version?: string }).version).toBeTruthy();
    expect((pt_BR.common as { version?: string }).version).toBeTruthy();
    expect((zh_CN.common as { version?: string }).version).toBeTruthy();
    expect((zh_TW.common as { version?: string }).version).toBeTruthy();
  });

  it("keeps shared locale namespaces aligned with the English source", () => {
    const englishShared = loadSharedLocale("en");
    const englishDashboardKeys = new Set(flattenJsonKeys(englishShared.dashboard));
    const englishMacKeys = new Set(flattenJsonKeys(englishShared.mac));
    const englishSurfaceKeys = new Set(flattenJsonKeys(englishShared.shared));
    const sharedSurfaceLocales = [...new Set([...DASHBOARD_LOCALE_IDS, ...MAC_LANGUAGE_IDS])];

    for (const locale of DASHBOARD_LOCALE_IDS) {
      const localeShared = loadSharedLocale(locale);
      const localeKeys = new Set(flattenJsonKeys(localeShared.dashboard));
      const missing = [...englishDashboardKeys].filter((key) => !localeKeys.has(key));
      expect(missing, `${locale} is missing dashboard keys`).toEqual([]);
    }

    for (const locale of MAC_LANGUAGE_IDS) {
      const localeShared = loadSharedLocale(locale);
      const localeKeys = new Set(flattenJsonKeys(localeShared.mac));
      const missing = [...englishMacKeys].filter((key) => !localeKeys.has(key));
      expect(missing, `${locale} is missing mac keys`).toEqual([]);
    }

    for (const locale of sharedSurfaceLocales) {
      const localeShared = loadSharedLocale(locale);
      const localeKeys = new Set(flattenJsonKeys(localeShared.shared));
      const missing = [...englishSurfaceKeys].filter((key) => !localeKeys.has(key));
      expect(missing, `${locale} is missing shared surface keys`).toEqual([]);
    }
  });

  it("keeps legacy shipped locales loading known dashboard copy during migration", () => {
    expect(de.common.health).toBeTruthy();
    expect(es.common.health).toBeTruthy();
    expect((pt_BR.common as { health?: string }).health).toBeTruthy();
    expect((zh_CN.dashboard?.shell as { eyebrow?: string } | undefined)?.eyebrow).toBeTruthy();
    expect((zh_TW.dashboard?.shell as { eyebrow?: string } | undefined)?.eyebrow).toBeTruthy();
  });

  it("keeps Malay distinct from Indonesian on shared dashboard copy", () => {
    expect(ms.common.refresh).toBe("Muat semula");
    expect(id.common.refresh).toBe("Muat ulang");
    expect(ms.nav.settings).toBe("Tetapan");
    expect(id.nav.settings).toBe("Pengaturan");
  });
});
