import LOCALIZATION_CATALOG_JSON from "../../apps/shared/MaumauKit/Sources/MaumauKit/Resources/localization-catalog.json" with { type: "json" };

export type LanguageId =
  | "en"
  | "id"
  | "zh-CN"
  | "zh-TW"
  | "pt-BR"
  | "de"
  | "es"
  | "ms"
  | "th"
  | "vi"
  | "fil"
  | "my"
  | "jv"
  | "su"
  | "btk"
  | "min"
  | "ban"
  | "bug"
  | "mak"
  | "minahasa"
  | "mad";

export type DashboardLocaleId =
  | "en"
  | "id"
  | "zh-CN"
  | "zh-TW"
  | "pt-BR"
  | "de"
  | "es"
  | "ms"
  | "th"
  | "vi"
  | "fil"
  | "my"
  | "jv"
  | "su"
  | "btk"
  | "min"
  | "ban"
  | "bug"
  | "mak"
  | "minahasa"
  | "mad";

export interface LanguageMetadata {
  id: LanguageId;
  englishName: string;
  nativeName: string;
  uiLabelKey: string;
  rolloutOrder: number;
  dashboardEnabled: boolean;
  dashboardVisible: boolean;
  macEnabled: boolean;
  macVisible: boolean;
  replyEnabled: boolean;
}

type RawLanguageMetadata = {
  id: LanguageId;
  englishName: string;
  nativeName: string;
  uiLabelKey: string;
  rolloutOrder: number;
  dashboardEnabled: boolean;
  dashboardVisible: boolean;
  macEnabled: boolean;
  macVisible: boolean;
  replyEnabled: boolean;
};

const RAW_LANGUAGE_CATALOG = (LOCALIZATION_CATALOG_JSON.languages ?? []) as RawLanguageMetadata[];

export const DEFAULT_LANGUAGE_ID = LOCALIZATION_CATALOG_JSON.defaultLanguageId as LanguageId;
export const FALLBACK_LANGUAGE_ID = LOCALIZATION_CATALOG_JSON.fallbackLanguageId as LanguageId;

export const LANGUAGE_CATALOG = RAW_LANGUAGE_CATALOG.map((entry) => ({
  id: entry.id,
  englishName: entry.englishName,
  nativeName: entry.nativeName,
  uiLabelKey: entry.uiLabelKey,
  rolloutOrder: entry.rolloutOrder,
  dashboardEnabled: entry.dashboardEnabled,
  dashboardVisible: entry.dashboardVisible,
  macEnabled: entry.macEnabled,
  macVisible: entry.macVisible,
  replyEnabled: entry.replyEnabled,
})) as readonly LanguageMetadata[];

export const SUPPORTED_LANGUAGE_IDS = LANGUAGE_CATALOG.map(
  (entry) => entry.id,
) as readonly LanguageId[];

export const DASHBOARD_LOCALE_IDS = LANGUAGE_CATALOG.filter(
  (entry): entry is LanguageMetadata & { id: DashboardLocaleId } => entry.dashboardEnabled,
).map((entry) => entry.id) as readonly DashboardLocaleId[];

export const VISIBLE_DASHBOARD_LOCALE_IDS = LANGUAGE_CATALOG.filter(
  (entry): entry is LanguageMetadata & { id: DashboardLocaleId } =>
    entry.dashboardEnabled && entry.dashboardVisible,
).map((entry) => entry.id) as readonly DashboardLocaleId[];

export const MAC_LANGUAGE_IDS = LANGUAGE_CATALOG.filter((entry) => entry.macEnabled).map(
  (entry) => entry.id,
) as readonly LanguageId[];

export const VISIBLE_MAC_LANGUAGE_IDS = LANGUAGE_CATALOG.filter((entry) => entry.macVisible).map(
  (entry) => entry.id,
) as readonly LanguageId[];

const LANGUAGE_METADATA_BY_ID: Record<LanguageId, LanguageMetadata> = Object.fromEntries(
  LANGUAGE_CATALOG.map((entry) => [entry.id, entry]),
) as Record<LanguageId, LanguageMetadata>;

export function isSupportedLanguageId(value: string | null | undefined): value is LanguageId {
  return (
    value !== null && value !== undefined && SUPPORTED_LANGUAGE_IDS.includes(value as LanguageId)
  );
}

export function isDashboardLocaleId(value: string | null | undefined): value is DashboardLocaleId {
  return (
    value !== null &&
    value !== undefined &&
    DASHBOARD_LOCALE_IDS.includes(value as DashboardLocaleId)
  );
}

export function getLanguageMetadata(languageId: LanguageId): LanguageMetadata {
  return LANGUAGE_METADATA_BY_ID[languageId];
}

export function getDashboardLocaleMetadata(localeId: DashboardLocaleId): LanguageMetadata {
  return getLanguageMetadata(localeId);
}

export function getLanguageEnglishName(languageId: LanguageId): string {
  return getLanguageMetadata(languageId).englishName;
}

export function getLanguageNativeName(languageId: LanguageId): string {
  return getLanguageMetadata(languageId).nativeName;
}

function normalizeLanguageToken(value: string): string {
  return value.trim().replace(/_/g, "-").toLowerCase();
}

export function normalizeLanguageId(value: string | null | undefined): LanguageId | undefined {
  const normalized = normalizeLanguageToken(value ?? "");
  if (!normalized) {
    return undefined;
  }

  if (normalized === "en" || normalized.startsWith("en-")) {
    return "en";
  }
  if (
    normalized === "id" ||
    normalized === "in" ||
    normalized.startsWith("id-") ||
    normalized.startsWith("in-")
  ) {
    return "id";
  }
  if (normalized === "ms" || normalized.startsWith("ms-")) {
    return "ms";
  }
  if (normalized === "th" || normalized.startsWith("th-")) {
    return "th";
  }
  if (normalized === "vi" || normalized.startsWith("vi-")) {
    return "vi";
  }
  if (
    normalized === "fil" ||
    normalized === "tl" ||
    normalized.startsWith("fil-") ||
    normalized.startsWith("tl-")
  ) {
    return "fil";
  }
  if (normalized === "my" || normalized === "bur" || normalized.startsWith("my-")) {
    return "my";
  }
  if (
    normalized === "jv" ||
    normalized === "jw" ||
    normalized.startsWith("jv-") ||
    normalized.startsWith("jw-")
  ) {
    return "jv";
  }
  if (normalized === "su" || normalized.startsWith("su-")) {
    return "su";
  }
  if (
    normalized === "btk" ||
    normalized === "bbc" ||
    normalized === "bts" ||
    normalized === "btx" ||
    normalized.startsWith("btk-") ||
    normalized.startsWith("bbc-") ||
    normalized.startsWith("bts-") ||
    normalized.startsWith("btx-")
  ) {
    return "btk";
  }
  if (normalized === "min" || normalized.startsWith("min-")) {
    return "min";
  }
  if (normalized === "ban" || normalized.startsWith("ban-")) {
    return "ban";
  }
  if (normalized === "bug" || normalized.startsWith("bug-")) {
    return "bug";
  }
  if (normalized === "mak" || normalized.startsWith("mak-")) {
    return "mak";
  }
  if (normalized === "minahasa" || normalized.startsWith("minahasa-")) {
    return "minahasa";
  }
  if (normalized === "mad" || normalized.startsWith("mad-")) {
    return "mad";
  }
  if (
    normalized === "zh-tw" ||
    normalized === "zh-hk" ||
    normalized === "zh-mo" ||
    normalized === "zh-hant" ||
    normalized.startsWith("zh-tw-") ||
    normalized.startsWith("zh-hk-") ||
    normalized.startsWith("zh-mo-") ||
    normalized.startsWith("zh-hant-")
  ) {
    return "zh-TW";
  }
  if (
    normalized === "zh" ||
    normalized === "zh-cn" ||
    normalized === "zh-sg" ||
    normalized === "zh-hans" ||
    normalized.startsWith("zh-cn-") ||
    normalized.startsWith("zh-sg-") ||
    normalized.startsWith("zh-hans-")
  ) {
    return "zh-CN";
  }
  if (normalized === "pt" || normalized.startsWith("pt-")) {
    return "pt-BR";
  }
  if (normalized === "de" || normalized.startsWith("de-")) {
    return "de";
  }
  if (normalized === "es" || normalized.startsWith("es-")) {
    return "es";
  }

  return undefined;
}

export function resolveNavigatorLanguage(value: string | null | undefined): LanguageId {
  return normalizeLanguageId(value) ?? DEFAULT_LANGUAGE_ID;
}
