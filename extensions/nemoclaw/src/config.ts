import type { MaumauPluginConfigSchema } from "maumau/plugin-sdk/plugin-entry";

export type NemoClawPluginConfig = {
  baseUrl?: string;
  timeoutMs?: number;
  failClosed?: boolean;
  promptGuards?: boolean;
  toolGuards?: boolean;
  outputGuards?: boolean;
  authToken?: string;
  promptPath?: string;
  toolPath?: string;
  outputPath?: string;
};

export type ResolvedNemoClawPluginConfig = {
  baseUrl: string;
  timeoutMs: number;
  failClosed: boolean;
  promptGuards: boolean;
  toolGuards: boolean;
  outputGuards: boolean;
  authToken?: string;
  promptPath: string;
  toolPath: string;
  outputPath: string;
};

type ParseIssue = {
  path: Array<string | number>;
  message: string;
};

type ParseSuccess = {
  success: true;
  data: NemoClawPluginConfig;
};

type ParseFailure = {
  success: false;
  error: {
    issues: ParseIssue[];
  };
};

const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_BASE_URL = "http://127.0.0.1:8000";
const DEFAULT_PROMPT_PATH = "/v1/guardrails/prompt";
const DEFAULT_TOOL_PATH = "/v1/guardrails/tool";
const DEFAULT_OUTPUT_PATH = "/v1/guardrails/output";
const GUARDRAIL_ENV_VARS = [
  "NEMOCLAW_BASE_URL",
  "NEMO_GUARDRAILS_BASE_URL",
  "NEMO_GUARDRAILS_URL",
] as const;

function failure(path: ParseIssue["path"], message: string): ParseFailure {
  return {
    success: false,
    error: {
      issues: [{ path, message }],
    },
  };
}

function parseOptionalString(
  value: unknown,
  path: ParseIssue["path"],
): string | undefined | ParseFailure {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    return failure(path, "expected string");
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function parseOptionalBoolean(
  value: unknown,
  path: ParseIssue["path"],
): boolean | undefined | ParseFailure {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    return failure(path, "expected boolean");
  }
  return value;
}

function parseOptionalPositiveInt(
  value: unknown,
  path: ParseIssue["path"],
): number | undefined | ParseFailure {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return failure(path, "expected positive integer");
  }
  return value;
}

export const nemoclawPluginConfigSchema: MaumauPluginConfigSchema = {
  safeParse(value: unknown): ParseSuccess | ParseFailure {
    if (value === undefined) {
      return { success: true, data: {} };
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return failure([], "expected config object");
    }

    const input = value as Record<string, unknown>;
    const baseUrl = parseOptionalString(input.baseUrl, ["baseUrl"]);
    if (typeof baseUrl === "object" && "success" in baseUrl) {
      return baseUrl;
    }
    const authToken = parseOptionalString(input.authToken, ["authToken"]);
    if (typeof authToken === "object" && "success" in authToken) {
      return authToken;
    }
    const promptPath = parseOptionalString(input.promptPath, ["promptPath"]);
    if (typeof promptPath === "object" && "success" in promptPath) {
      return promptPath;
    }
    const toolPath = parseOptionalString(input.toolPath, ["toolPath"]);
    if (typeof toolPath === "object" && "success" in toolPath) {
      return toolPath;
    }
    const outputPath = parseOptionalString(input.outputPath, ["outputPath"]);
    if (typeof outputPath === "object" && "success" in outputPath) {
      return outputPath;
    }
    const timeoutMs = parseOptionalPositiveInt(input.timeoutMs, ["timeoutMs"]);
    if (typeof timeoutMs === "object" && "success" in timeoutMs) {
      return timeoutMs;
    }
    const failClosed = parseOptionalBoolean(input.failClosed, ["failClosed"]);
    if (typeof failClosed === "object" && "success" in failClosed) {
      return failClosed;
    }
    const promptGuards = parseOptionalBoolean(input.promptGuards, ["promptGuards"]);
    if (typeof promptGuards === "object" && "success" in promptGuards) {
      return promptGuards;
    }
    const toolGuards = parseOptionalBoolean(input.toolGuards, ["toolGuards"]);
    if (typeof toolGuards === "object" && "success" in toolGuards) {
      return toolGuards;
    }
    const outputGuards = parseOptionalBoolean(input.outputGuards, ["outputGuards"]);
    if (typeof outputGuards === "object" && "success" in outputGuards) {
      return outputGuards;
    }

    return {
      success: true,
      data: {
        ...(baseUrl ? { baseUrl } : {}),
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
        ...(failClosed !== undefined ? { failClosed } : {}),
        ...(promptGuards !== undefined ? { promptGuards } : {}),
        ...(toolGuards !== undefined ? { toolGuards } : {}),
        ...(outputGuards !== undefined ? { outputGuards } : {}),
        ...(authToken ? { authToken } : {}),
        ...(promptPath ? { promptPath } : {}),
        ...(toolPath ? { toolPath } : {}),
        ...(outputPath ? { outputPath } : {}),
      },
    };
  },
  uiHints: {
    baseUrl: {
      label: "Guardrails URL",
      help: "Base URL for the local Maumau guardrails or NeMo Guardrails sidecar.",
      placeholder: "http://127.0.0.1:8000",
    },
    authToken: {
      label: "Auth Token",
      help: "Optional bearer token sent to the guardrails sidecar.",
      sensitive: true,
      advanced: true,
    },
    failClosed: {
      label: "Fail Closed",
      help: "Block sends and tool calls when the sidecar is unavailable.",
      advanced: true,
    },
    promptGuards: {
      label: "Prompt Guards",
      help: "Run prompt policy checks before the model prompt is finalized.",
    },
    toolGuards: {
      label: "Tool Guards",
      help: "Run policy checks before tool execution.",
    },
    outputGuards: {
      label: "Output Guards",
      help: "Run policy checks before outbound messages are sent.",
    },
  },
  jsonSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      baseUrl: { type: "string" },
      timeoutMs: { type: "integer", minimum: 1 },
      failClosed: { type: "boolean" },
      promptGuards: { type: "boolean" },
      toolGuards: { type: "boolean" },
      outputGuards: { type: "boolean" },
      authToken: { type: "string" },
      promptPath: { type: "string" },
      toolPath: { type: "string" },
      outputPath: { type: "string" },
    },
  },
};

function normalizePath(value: string | undefined, fallback: string): string {
  const normalized = (value ?? fallback).trim() || fallback;
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function resolveConfiguredBaseUrl(config: NemoClawPluginConfig): string | undefined {
  if (config.baseUrl?.trim()) {
    return config.baseUrl.trim();
  }
  for (const envVar of GUARDRAIL_ENV_VARS) {
    const candidate = process.env[envVar]?.trim();
    if (candidate) {
      return candidate;
    }
  }
  return undefined;
}

export function resolveNemoClawPluginConfig(raw: unknown): ResolvedNemoClawPluginConfig {
  const parsed = nemoclawPluginConfigSchema.safeParse?.(raw);
  const config =
    parsed && parsed.success && parsed.data && typeof parsed.data === "object"
      ? (parsed.data as NemoClawPluginConfig)
      : {};
  const configuredBaseUrl = resolveConfiguredBaseUrl(config);
  const baseUrl = (configuredBaseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  // Keep the plugin dormant by default so default enablement does not require
  // a running guardrails sidecar on every fresh install.
  const guardsEnabledByDefault = Boolean(configuredBaseUrl);

  return {
    baseUrl,
    timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    failClosed: config.failClosed ?? false,
    promptGuards: config.promptGuards ?? guardsEnabledByDefault,
    toolGuards: config.toolGuards ?? guardsEnabledByDefault,
    outputGuards: config.outputGuards ?? guardsEnabledByDefault,
    ...(config.authToken ? { authToken: config.authToken } : {}),
    promptPath: normalizePath(config.promptPath, DEFAULT_PROMPT_PATH),
    toolPath: normalizePath(config.toolPath, DEFAULT_TOOL_PATH),
    outputPath: normalizePath(config.outputPath, DEFAULT_OUTPUT_PATH),
  };
}
