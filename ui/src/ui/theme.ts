export type ThemeName = "claw" | "knot" | "dash";
export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme =
  | "dark"
  | "light"
  | "openknot"
  | "openknot-light"
  | "dash"
  | "dash-light";

export const VALID_THEME_NAMES = new Set<ThemeName>(["claw", "knot", "dash"]);
export const VALID_THEME_MODES = new Set<ThemeMode>(["system", "light", "dark"]);
export const THEME_PREFERENCE_VERSION = 2;

type ThemeSelection = { theme: ThemeName; mode: ThemeMode };

const LEGACY_MAP: Record<string, ThemeSelection> = {
  defaultTheme: { theme: "claw", mode: "dark" },
  docsTheme: { theme: "claw", mode: "light" },
  lightTheme: { theme: "knot", mode: "dark" },
  landingTheme: { theme: "knot", mode: "dark" },
  newTheme: { theme: "knot", mode: "dark" },
  dark: { theme: "claw", mode: "dark" },
  light: { theme: "claw", mode: "light" },
  openknot: { theme: "knot", mode: "dark" },
  fieldmanual: { theme: "dash", mode: "dark" },
  clawdash: { theme: "dash", mode: "light" },
  system: { theme: "claw", mode: "system" },
};

export function prefersLightScheme(): boolean {
  if (typeof globalThis.matchMedia !== "function") {
    return false;
  }
  return globalThis.matchMedia("(prefers-color-scheme: light)").matches;
}

export function resolveSystemTheme(): ResolvedTheme {
  return prefersLightScheme() ? "light" : "dark";
}

export function parseThemeSelection(
  themeRaw: unknown,
  modeRaw: unknown,
): { theme: ThemeName; mode: ThemeMode } {
  const theme = typeof themeRaw === "string" ? themeRaw : "";
  const mode = typeof modeRaw === "string" ? modeRaw : "";

  const normalizedTheme = VALID_THEME_NAMES.has(theme as ThemeName)
    ? (theme as ThemeName)
    : (LEGACY_MAP[theme]?.theme ?? "dash");
  const normalizedMode = VALID_THEME_MODES.has(mode as ThemeMode)
    ? (mode as ThemeMode)
    : (LEGACY_MAP[theme]?.mode ?? "light");

  return { theme: normalizedTheme, mode: normalizedMode };
}

export function normalizeStoredThemeSelection(
  themeRaw: unknown,
  modeRaw: unknown,
  versionRaw: unknown,
): { theme: ThemeName; mode: ThemeMode; migrated: boolean } {
  const parsed = parseThemeSelection(themeRaw, modeRaw);
  const version = typeof versionRaw === "number" ? versionRaw : 0;

  if (version < THEME_PREFERENCE_VERSION && parsed.theme === "claw" && parsed.mode === "system") {
    return { theme: "dash", mode: "light", migrated: true };
  }

  return { ...parsed, migrated: false };
}

function resolveMode(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    return prefersLightScheme() ? "light" : "dark";
  }
  return mode;
}

export function resolveTheme(theme: ThemeName, mode: ThemeMode): ResolvedTheme {
  const resolvedMode = resolveMode(mode);
  if (theme === "claw") {
    return resolvedMode === "light" ? "light" : "dark";
  }
  if (theme === "knot") {
    return resolvedMode === "light" ? "openknot-light" : "openknot";
  }
  return resolvedMode === "light" ? "dash-light" : "dash";
}
