import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import {
  isDangerousHostEnvOverrideVarName,
  isDangerousHostEnvVarName,
  normalizeEnvVarKey,
} from "../infra/host-env-security.js";
import { collectConfigServiceEnvVars } from "./config-env-vars.js";
import { resolveStateDir } from "./paths.js";
import type { MaumauConfig } from "./types.js";

const DOTENV_ASSIGNMENT_RE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;

function isBlockedServiceEnvVar(key: string): boolean {
  return isDangerousHostEnvVarName(key) || isDangerousHostEnvOverrideVarName(key);
}

function serializeDotEnvValue(value: string): string {
  if (/^[A-Za-z0-9_./:@%+-]+$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

export function resolveStateDirDotEnvPath(env: Record<string, string | undefined>): string {
  return path.join(resolveStateDir(env as NodeJS.ProcessEnv), ".env");
}

/**
 * Read and parse `~/.maumau/.env` (or `$MAUMAU_STATE_DIR/.env`), returning
 * a filtered record of key-value pairs suitable for embedding in a service
 * environment (LaunchAgent plist, systemd unit, Scheduled Task).
 */
export function readStateDirDotEnvVars(
  env: Record<string, string | undefined>,
): Record<string, string> {
  const dotEnvPath = resolveStateDirDotEnvPath(env);

  let content: string;
  try {
    content = fs.readFileSync(dotEnvPath, "utf8");
  } catch {
    return {};
  }

  const parsed = dotenv.parse(content);
  const entries: Record<string, string> = {};
  for (const [rawKey, value] of Object.entries(parsed)) {
    if (!value?.trim()) {
      continue;
    }
    const key = normalizeEnvVarKey(rawKey, { portable: true });
    if (!key) {
      continue;
    }
    if (isBlockedServiceEnvVar(key)) {
      continue;
    }
    entries[key] = value;
  }
  return entries;
}

/**
 * Update a single key inside the state-dir `.env` while preserving unrelated
 * lines/comments. The normalized value is also applied to the provided env map
 * so the current process can immediately use it.
 */
export function upsertStateDirDotEnvVarSync(params: {
  key: string;
  value: string;
  env?: Record<string, string | undefined>;
}): { dotEnvPath: string; wrote: boolean; key: string; value: string } {
  const env = params.env ?? process.env;
  const key = normalizeEnvVarKey(params.key, { portable: true });
  const value = params.value;
  if (!key) {
    throw new Error(`Invalid env var name: ${params.key}`);
  }
  const dotEnvPath = resolveStateDirDotEnvPath(env);

  let existing = "";
  try {
    existing = fs.readFileSync(dotEnvPath, "utf8");
  } catch {
    existing = "";
  }

  const lines = existing.length > 0 ? existing.split(/\r?\n/) : [];
  const nextLines = lines.filter((line) => {
    const match = DOTENV_ASSIGNMENT_RE.exec(line);
    return !match || match[1] !== key;
  });
  nextLines.push(`${key}=${serializeDotEnvValue(value)}`);
  const nextContent = `${nextLines.filter((line, index, all) => !(index === all.length - 1 && line === "")).join("\n")}\n`;

  const wrote = existing !== nextContent;
  if (wrote) {
    fs.mkdirSync(path.dirname(dotEnvPath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(dotEnvPath, nextContent, { encoding: "utf8", mode: 0o600 });
    fs.chmodSync(dotEnvPath, 0o600);
  }

  env[key] = value;
  return { dotEnvPath, wrote, key, value };
}

/**
 * Durable service env sources survive beyond the invoking shell and are safe to
 * persist into gateway install metadata.
 *
 * Precedence:
 * 1. state-dir `.env` file vars
 * 2. config service env vars
 */
export function collectDurableServiceEnvVars(params: {
  env: Record<string, string | undefined>;
  config?: MaumauConfig;
}): Record<string, string> {
  return {
    ...readStateDirDotEnvVars(params.env),
    ...collectConfigServiceEnvVars(params.config),
  };
}
