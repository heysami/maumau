import {
  DASHBOARD_LOCALE_IDS,
  DEFAULT_LANGUAGE_ID,
  VISIBLE_DASHBOARD_LOCALE_IDS,
  isDashboardLocaleId,
  resolveNavigatorLanguage,
} from "../../../../src/i18n/languages.ts";
import type { Locale, TranslationMap } from "./types.ts";

type LazyLocale = Exclude<Locale, "en">;
type LocaleModule = Record<string, TranslationMap>;

type LazyLocaleRegistration = {
  exportName: string;
  loader: () => Promise<LocaleModule>;
};

export const DEFAULT_LOCALE: Locale = "en";

const LAZY_LOCALES = DASHBOARD_LOCALE_IDS.filter((locale): locale is LazyLocale => locale !== "en");

const LAZY_LOCALE_REGISTRY: Record<LazyLocale, LazyLocaleRegistration> = {
  id: {
    exportName: "id",
    loader: () => import("../locales/id.ts"),
  },
  "zh-CN": {
    exportName: "zh_CN",
    loader: () => import("../locales/zh-CN.ts"),
  },
  "zh-TW": {
    exportName: "zh_TW",
    loader: () => import("../locales/zh-TW.ts"),
  },
  "pt-BR": {
    exportName: "pt_BR",
    loader: () => import("../locales/pt-BR.ts"),
  },
  de: {
    exportName: "de",
    loader: () => import("../locales/de.ts"),
  },
  es: {
    exportName: "es",
    loader: () => import("../locales/es.ts"),
  },
  ms: {
    exportName: "ms",
    loader: () => import("../locales/ms.ts"),
  },
  th: {
    exportName: "th",
    loader: () => import("../locales/th.ts"),
  },
  vi: {
    exportName: "vi",
    loader: () => import("../locales/vi.ts"),
  },
  fil: {
    exportName: "fil",
    loader: () => import("../locales/fil.ts"),
  },
  my: {
    exportName: "my",
    loader: () => import("../locales/my.ts"),
  },
  jv: {
    exportName: "jv",
    loader: () => import("../locales/jv.ts"),
  },
  su: {
    exportName: "su",
    loader: () => import("../locales/su.ts"),
  },
  btk: {
    exportName: "btk",
    loader: () => import("../locales/btk.ts"),
  },
  min: {
    exportName: "min",
    loader: () => import("../locales/min.ts"),
  },
  ban: {
    exportName: "ban",
    loader: () => import("../locales/ban.ts"),
  },
  bug: {
    exportName: "bug",
    loader: () => import("../locales/bug.ts"),
  },
  mak: {
    exportName: "mak",
    loader: () => import("../locales/mak.ts"),
  },
  minahasa: {
    exportName: "minahasa",
    loader: () => import("../locales/minahasa.ts"),
  },
  mad: {
    exportName: "mad",
    loader: () => import("../locales/mad.ts"),
  },
};

export const SUPPORTED_LOCALES: ReadonlyArray<Locale> = VISIBLE_DASHBOARD_LOCALE_IDS;

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  return isDashboardLocaleId(value) && SUPPORTED_LOCALES.includes(value);
}

function isLazyLocale(locale: Locale): locale is LazyLocale {
  return LAZY_LOCALES.includes(locale as LazyLocale);
}

export function resolveNavigatorLocale(navLang: string): Locale {
  const resolved = resolveNavigatorLanguage(navLang);
  if (isSupportedLocale(resolved)) {
    return resolved;
  }
  return DEFAULT_LANGUAGE_ID as Locale;
}

export async function loadLazyLocaleTranslation(locale: Locale): Promise<TranslationMap | null> {
  if (!isLazyLocale(locale)) {
    return null;
  }
  const registration = LAZY_LOCALE_REGISTRY[locale];
  const module = await registration.loader();
  return module[registration.exportName] ?? null;
}
