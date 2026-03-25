export const DEFAULT_PLUGIN_DISCOVERY_CACHE_MS = 1000;
export const DEFAULT_PLUGIN_MANIFEST_CACHE_MS = 1000;

export function shouldUsePluginSnapshotCache(env: NodeJS.ProcessEnv): boolean {
  if (env.MAUMAU_DISABLE_PLUGIN_DISCOVERY_CACHE?.trim()) {
    return false;
  }
  if (env.MAUMAU_DISABLE_PLUGIN_MANIFEST_CACHE?.trim()) {
    return false;
  }
  const discoveryCacheMs = env.MAUMAU_PLUGIN_DISCOVERY_CACHE_MS?.trim();
  if (discoveryCacheMs === "0") {
    return false;
  }
  const manifestCacheMs = env.MAUMAU_PLUGIN_MANIFEST_CACHE_MS?.trim();
  if (manifestCacheMs === "0") {
    return false;
  }
  return true;
}

export function resolvePluginCacheMs(rawValue: string | undefined, defaultMs: number): number {
  const raw = rawValue?.trim();
  if (raw === "" || raw === "0") {
    return 0;
  }
  if (!raw) {
    return defaultMs;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return defaultMs;
  }
  return Math.max(0, parsed);
}

export function resolvePluginSnapshotCacheTtlMs(env: NodeJS.ProcessEnv): number {
  const discoveryCacheMs = resolvePluginCacheMs(
    env.MAUMAU_PLUGIN_DISCOVERY_CACHE_MS,
    DEFAULT_PLUGIN_DISCOVERY_CACHE_MS,
  );
  const manifestCacheMs = resolvePluginCacheMs(
    env.MAUMAU_PLUGIN_MANIFEST_CACHE_MS,
    DEFAULT_PLUGIN_MANIFEST_CACHE_MS,
  );
  return Math.min(discoveryCacheMs, manifestCacheMs);
}

export function buildPluginSnapshotCacheEnvKey(
  env: NodeJS.ProcessEnv,
  options: { includeProcessVitestFallback?: boolean } = {},
) {
  return {
    MAUMAU_BUNDLED_PLUGINS_DIR: env.MAUMAU_BUNDLED_PLUGINS_DIR ?? "",
    MAUMAU_DISABLE_PLUGIN_DISCOVERY_CACHE: env.MAUMAU_DISABLE_PLUGIN_DISCOVERY_CACHE ?? "",
    MAUMAU_DISABLE_PLUGIN_MANIFEST_CACHE: env.MAUMAU_DISABLE_PLUGIN_MANIFEST_CACHE ?? "",
    MAUMAU_PLUGIN_DISCOVERY_CACHE_MS: env.MAUMAU_PLUGIN_DISCOVERY_CACHE_MS ?? "",
    MAUMAU_PLUGIN_MANIFEST_CACHE_MS: env.MAUMAU_PLUGIN_MANIFEST_CACHE_MS ?? "",
    MAUMAU_HOME: env.MAUMAU_HOME ?? "",
    MAUMAU_STATE_DIR: env.MAUMAU_STATE_DIR ?? "",
    MAUMAU_CONFIG_PATH: env.MAUMAU_CONFIG_PATH ?? "",
    HOME: env.HOME ?? "",
    USERPROFILE: env.USERPROFILE ?? "",
    VITEST: options.includeProcessVitestFallback
      ? (env.VITEST ?? process.env.VITEST ?? "")
      : (env.VITEST ?? ""),
  };
}
