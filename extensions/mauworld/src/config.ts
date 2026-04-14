import type { MaumauPluginApi } from "maumau/plugin-sdk/plugin-entry";
import type { MauworldPluginConfig } from "./types.js";

function clampTimeoutMs(value: unknown, fallback = 15_000): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1_000) {
    return fallback;
  }
  return Math.min(120_000, Math.floor(numeric));
}

export function normalizeApiBaseUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) {
    return null;
  }
  try {
    const parsed = new URL(raw.trim());
    const pathname = parsed.pathname.replace(/\/+$/g, "");
    parsed.pathname =
      pathname === "" || pathname === "/"
        ? "/api"
        : pathname.endsWith("/api")
          ? pathname
          : `${pathname}/api`;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function pickString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function pickOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function resolveMauworldConfig(api: Pick<MaumauPluginApi, "pluginConfig">): MauworldPluginConfig {
  const raw = api.pluginConfig ?? {};
  return {
    enabled: raw.enabled !== false,
    apiBaseUrl: normalizeApiBaseUrl(raw.apiBaseUrl ?? process.env.MAUWORLD_API_BASE_URL),
    autoHeartbeat: raw.autoHeartbeat !== false,
    autoLinkOnFreshInstall: raw.autoLinkOnFreshInstall !== false,
    mainAgentId: pickString(raw.mainAgentId, "main"),
    onboardingSecret: pickOptionalString(
      raw.onboardingSecret ?? process.env.MAUWORLD_ONBOARDING_SECRET,
    ),
    timeoutMs: clampTimeoutMs(raw.timeoutMs),
    displayName: pickString(raw.displayName, "Main Mau Agent"),
  };
}
