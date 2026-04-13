const DEFAULT_HEARTBEAT_TTL_MS = 6 * 60 * 60 * 1000;

const heartbeatState = new Map<string, { heartbeatId: string; expiresAtMs: number }>();

export function resolveHeartbeatScopeKey(params: {
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
}): string {
  return (
    params.sessionId?.trim() ||
    params.sessionKey?.trim() ||
    `agent:${params.agentId?.trim() || "main"}`
  );
}

export function storeActiveHeartbeat(
  scopeKey: string,
  heartbeatId: string,
  opts?: { ttlMs?: number },
) {
  const ttlMs = opts?.ttlMs ?? DEFAULT_HEARTBEAT_TTL_MS;
  heartbeatState.set(scopeKey, {
    heartbeatId,
    expiresAtMs: Date.now() + ttlMs,
  });
}

export function readActiveHeartbeat(scopeKey: string): string | null {
  const current = heartbeatState.get(scopeKey);
  if (!current) {
    return null;
  }
  if (current.expiresAtMs <= Date.now()) {
    heartbeatState.delete(scopeKey);
    return null;
  }
  return current.heartbeatId;
}

export function clearActiveHeartbeat(scopeKey: string) {
  heartbeatState.delete(scopeKey);
}

export function resetHeartbeatStateForTests() {
  heartbeatState.clear();
}
