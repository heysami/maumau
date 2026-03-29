export const DEFAULT_LANGUAGE_ID = "en";

export const LANGUAGE_CATALOG = [
  {
    id: "en",
    englishName: "English",
    uiLabelKey: "en",
  },
  {
    id: "id",
    englishName: "Bahasa Indonesia",
    uiLabelKey: "id",
  },
  {
    id: "zh-CN",
    englishName: "Simplified Chinese",
    uiLabelKey: "zhCN",
  },
  {
    id: "zh-TW",
    englishName: "Traditional Chinese",
    uiLabelKey: "zhTW",
  },
  {
    id: "pt-BR",
    englishName: "Brazilian Portuguese",
    uiLabelKey: "ptBR",
  },
  {
    id: "de",
    englishName: "German",
    uiLabelKey: "de",
  },
  {
    id: "es",
    englishName: "Spanish",
    uiLabelKey: "es",
  },
] as const;

export type LanguageId = (typeof LANGUAGE_CATALOG)[number]["id"];

export type LanguageMetadata = (typeof LANGUAGE_CATALOG)[number];

export const SUPPORTED_LANGUAGE_IDS = LANGUAGE_CATALOG.map(
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

export function getLanguageMetadata(languageId: LanguageId): LanguageMetadata {
  return LANGUAGE_METADATA_BY_ID[languageId];
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

export function getLanguageEnglishName(languageId: LanguageId): string {
  return getLanguageMetadata(languageId).englishName;
}
