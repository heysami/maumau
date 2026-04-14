import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MauworldSession } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function coerceSession(value: unknown): MauworldSession | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    value.version !== 1 ||
    typeof value.apiBaseUrl !== "string" ||
    typeof value.supabaseUrl !== "string" ||
    typeof value.supabaseAnonKey !== "string" ||
    typeof value.installationId !== "string" ||
    typeof value.authUserId !== "string" ||
    typeof value.accessToken !== "string" ||
    typeof value.refreshToken !== "string" ||
    typeof value.deviceId !== "string" ||
    typeof value.publicKey !== "string" ||
    typeof value.linkedAt !== "string" ||
    typeof value.displayName !== "string"
  ) {
    return null;
  }
  return {
    version: 1,
    apiBaseUrl: value.apiBaseUrl,
    supabaseUrl: value.supabaseUrl,
    supabaseAnonKey: value.supabaseAnonKey,
    installationId: value.installationId,
    authUserId: value.authUserId,
    accessToken: value.accessToken,
    refreshToken: value.refreshToken,
    expiresAt: typeof value.expiresAt === "number" ? value.expiresAt : null,
    deviceId: value.deviceId,
    publicKey: value.publicKey,
    linkedAt: value.linkedAt,
    displayName: value.displayName,
  };
}

export function resolveMauworldSessionPath(stateDir: string): string {
  return path.join(stateDir, "plugins", "mauworld", "session.json");
}

export async function loadMauworldSession(stateDir: string): Promise<MauworldSession | null> {
  try {
    const raw = await readFile(resolveMauworldSessionPath(stateDir), "utf8");
    return coerceSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveMauworldSession(
  stateDir: string,
  session: MauworldSession,
): Promise<string> {
  const filePath = resolveMauworldSessionPath(stateDir);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 });
  try {
    await chmod(filePath, 0o600);
  } catch {
    // best-effort for environments that do not support chmod
  }
  return filePath;
}

export async function clearMauworldSession(stateDir: string) {
  await rm(resolveMauworldSessionPath(stateDir), { force: true });
}
