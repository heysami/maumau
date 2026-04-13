import type {
  MemoryOverlay,
  MemoryOverlayCollection,
  MemoryOverlayPathParams,
  MemoryOverlayPrincipalParams,
  MemoryOverlayPromptParams,
  MemoryOverlayReadResult,
  MemoryOverlayRegistrationResult,
  MemoryOverlayStoreParams,
  MemoryOverlayStoreResult,
} from "../plugins/types.js";
import { resolveGlobalSingleton } from "../shared/global-singleton.js";

type RegisteredMemoryOverlay = {
  owner: string;
  overlay: MemoryOverlay;
};

type RegisterMemoryOverlayForOwnerOptions = {
  allowSameOwnerRefresh?: boolean;
};

type MemoryOverlayRegistryState = {
  overlays: RegisteredMemoryOverlay[];
};

const MEMORY_OVERLAY_REGISTRY_KEY = Symbol.for("maumau.memoryOverlayRegistry");

function getMemoryOverlayRegistryState(): MemoryOverlayRegistryState {
  return resolveGlobalSingleton(MEMORY_OVERLAY_REGISTRY_KEY, () => ({
    overlays: [],
  }));
}

export function registerMemoryOverlayForOwner(
  overlay: MemoryOverlay,
  owner: string,
  opts?: RegisterMemoryOverlayForOwnerOptions,
): MemoryOverlayRegistrationResult {
  const state = getMemoryOverlayRegistryState();
  const existingIndex = state.overlays.findIndex((entry) => entry.overlay.id === overlay.id);
  if (existingIndex >= 0) {
    const existing = state.overlays[existingIndex];
    if (!existing) {
      return { ok: false, existingOwner: owner };
    }
    if (existing.owner !== owner || opts?.allowSameOwnerRefresh !== true) {
      return { ok: false, existingOwner: existing.owner };
    }
    state.overlays[existingIndex] = { owner, overlay };
    return { ok: true };
  }
  state.overlays.push({ owner, overlay });
  return { ok: true };
}

export function listMemoryOverlays(): MemoryOverlay[] {
  return getMemoryOverlayRegistryState().overlays.map((entry) => entry.overlay);
}

export function getMemoryOverlaySnapshot(): RegisteredMemoryOverlay[] {
  return [...getMemoryOverlayRegistryState().overlays];
}

export function restoreMemoryOverlaySnapshot(snapshot: RegisteredMemoryOverlay[]): void {
  const state = getMemoryOverlayRegistryState();
  state.overlays = [...snapshot];
}

export function clearMemoryOverlays(): void {
  getMemoryOverlayRegistryState().overlays = [];
}

export async function resolveMemoryOverlayPrincipal(
  params: MemoryOverlayPrincipalParams,
): Promise<Awaited<ReturnType<NonNullable<MemoryOverlay["resolvePrincipal"]>>> | null> {
  for (const overlay of listMemoryOverlays()) {
    const principal = await overlay.resolvePrincipal?.(params);
    if (principal) {
      return principal;
    }
  }
  return null;
}

export async function buildMemoryOverlayPromptContext(
  params: MemoryOverlayPromptParams,
): Promise<string | undefined> {
  const parts: string[] = [];
  for (const overlay of listMemoryOverlays()) {
    const result = await overlay.buildPromptContext?.(params);
    if (typeof result === "string" && result.trim()) {
      parts.push(result.trim());
    } else if (Array.isArray(result)) {
      const normalized = result.map((entry) => entry.trim()).filter(Boolean);
      if (normalized.length > 0) {
        parts.push(normalized.join("\n"));
      }
    }
  }
  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

export async function readMemoryOverlayPath(
  params: MemoryOverlayPathParams,
): Promise<MemoryOverlayReadResult | null> {
  for (const overlay of listMemoryOverlays()) {
    const result = await overlay.readPath?.(params);
    if (result?.handled) {
      return result;
    }
  }
  return null;
}

export async function listMemoryOverlayCollections(
  params: { context: MemoryOverlayPrincipalParams["context"] },
): Promise<MemoryOverlayCollection[]> {
  const collections: MemoryOverlayCollection[] = [];
  for (const overlay of listMemoryOverlays()) {
    const next = await overlay.listCollections?.(params);
    if (next?.length) {
      collections.push(...next);
    }
  }
  return collections;
}

export async function storeThroughMemoryOverlays(
  params: MemoryOverlayStoreParams,
): Promise<MemoryOverlayStoreResult | null> {
  for (const overlay of listMemoryOverlays()) {
    const result = await overlay.store?.(params);
    if (result?.handled) {
      return result;
    }
  }
  return null;
}
