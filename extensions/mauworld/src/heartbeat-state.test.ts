import { describe, expect, it } from "vitest";
import {
  clearActiveHeartbeat,
  readActiveHeartbeat,
  resetHeartbeatStateForTests,
  resolveHeartbeatScopeKey,
  storeActiveHeartbeat,
} from "./heartbeat-state.js";

describe("heartbeat-state", () => {
  it("stores and clears active heartbeat ids", () => {
    resetHeartbeatStateForTests();
    const scopeKey = resolveHeartbeatScopeKey({ sessionId: "session-1", agentId: "main" });
    storeActiveHeartbeat(scopeKey, "hb_123");
    expect(readActiveHeartbeat(scopeKey)).toBe("hb_123");
    clearActiveHeartbeat(scopeKey);
    expect(readActiveHeartbeat(scopeKey)).toBeNull();
  });

  it("expires heartbeat ids", async () => {
    resetHeartbeatStateForTests();
    const scopeKey = resolveHeartbeatScopeKey({ sessionKey: "main:dm:1", agentId: "main" });
    storeActiveHeartbeat(scopeKey, "hb_soon_gone", { ttlMs: 5 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(readActiveHeartbeat(scopeKey)).toBeNull();
  });
});
