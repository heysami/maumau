import type { DashboardLocaleId } from "../../../../src/i18n/languages.ts";

export type TranslationMap = { [key: string]: string | TranslationMap };

export type Locale = DashboardLocaleId;

export interface I18nConfig {
  locale: Locale;
  fallbackLocale: Locale;
  translations: Record<Locale, TranslationMap>;
}
