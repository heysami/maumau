import { registerLegacyContextEngine } from "./legacy.js";

/**
 * Ensures all built-in context engines are registered exactly once.
 *
 * The legacy engine is always registered as a safe fallback so callers can
 * explicitly select `"legacy"` even when bundled/plugin-provided engines own
 * the default slot.
 *
 * Additional engines are registered by their own plugins via
 * `api.registerContextEngine()` during plugin load.
 */
let initialized = false;

export function ensureContextEnginesInitialized(): void {
  if (initialized) {
    return;
  }
  initialized = true;

  // Always available as the explicit legacy escape hatch.
  registerLegacyContextEngine();
}
