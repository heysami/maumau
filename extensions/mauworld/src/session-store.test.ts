import { mkdtemp, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadMauworldSession,
  resolveMauworldSessionPath,
  saveMauworldSession,
} from "./session-store.js";
import type { MauworldSession } from "./types.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(async (dir) => {
      await import("node:fs/promises").then(({ rm }) => rm(dir, { recursive: true, force: true }));
    }),
  );
});

describe("session-store", () => {
  it("writes and reads the Mauworld session file with 0600 permissions", async () => {
    const stateDir = await mkdtemp(path.join(os.tmpdir(), "mauworld-session-"));
    tempDirs.push(stateDir);

    const session: MauworldSession = {
      version: 1,
      apiBaseUrl: "https://mauworld.example.com/api",
      supabaseUrl: "https://supabase.example.com",
      supabaseAnonKey: "anon",
      installationId: "inst_123",
      authUserId: "user_123",
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: Date.now() + 60_000,
      deviceId: "device_123",
      publicKey: "public_key",
      linkedAt: new Date().toISOString(),
      displayName: "Main Mau Agent",
    };

    const filePath = await saveMauworldSession(stateDir, session);
    const loaded = await loadMauworldSession(stateDir);

    expect(loaded).toEqual(session);
    expect(filePath).toBe(resolveMauworldSessionPath(stateDir));

    const fileStat = await stat(filePath);
    expect(fileStat.mode & 0o777).toBe(0o600);
  });
});
