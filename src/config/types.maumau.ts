import type { AcpConfig } from "./types.acp.js";
import type { AgentBinding, AgentsConfig } from "./types.agents.js";
import type { ApprovalsConfig } from "./types.approvals.js";
import type { AuthConfig } from "./types.auth.js";
import type { DiagnosticsConfig, LoggingConfig, SessionConfig, WebConfig } from "./types.base.js";
import type { BrowserConfig } from "./types.browser.js";
import type { ChannelsConfig } from "./types.channels.js";
import type { CliConfig } from "./types.cli.js";
import type { CronConfig } from "./types.cron.js";
import type {
  CanvasHostConfig,
  DiscoveryConfig,
  GatewayConfig,
  TalkConfig,
} from "./types.gateway.js";
import type { HooksConfig } from "./types.hooks.js";
import type { McpConfig } from "./types.mcp.js";
import type { MemoryConfig } from "./types.memory.js";
import type {
  AudioConfig,
  BroadcastConfig,
  CommandsConfig,
  MessagesConfig,
} from "./types.messages.js";
import type { ModelsConfig } from "./types.models.js";
import type { NodeHostConfig } from "./types.node-host.js";
import type { PluginsConfig } from "./types.plugins.js";
import type { SecretsConfig } from "./types.secrets.js";
import type { SkillsConfig } from "./types.skills.js";
import type { TeamsConfig } from "./types.teams.js";
import type { ToolsConfig } from "./types.tools.js";

export type MaumauConfig = {
  meta?: {
    /** Last Maumau version that wrote this config. */
    lastTouchedVersion?: string;
    /** ISO timestamp when this config was last written. */
    lastTouchedAt?: string;
  };
  auth?: AuthConfig;
  acp?: AcpConfig;
  env?: {
    /** Opt-in: import missing secrets from a login shell environment (exec `$SHELL -l -c 'env -0'`). */
    shellEnv?: {
      enabled?: boolean;
      /** Timeout for the login shell exec (ms). Default: 15000. */
      timeoutMs?: number;
    };
    /** Inline env vars to apply when not already present in the process env. */
    vars?: Record<string, string>;
    /** Sugar: allow env vars directly under env (string values only). */
    [key: string]:
      | string
      | Record<string, string>
      | { enabled?: boolean; timeoutMs?: number }
      | undefined;
  };
  wizard?: {
    lastRunAt?: string;
    lastRunVersion?: string;
    lastRunCommit?: string;
    lastRunCommand?: string;
    lastRunMode?: "local" | "remote";
  };
  diagnostics?: DiagnosticsConfig;
  logging?: LoggingConfig;
  cli?: CliConfig;
  update?: {
    /** Update channel for git + npm installs ("stable", "beta", or "dev"). */
    channel?: "stable" | "beta" | "dev";
    /** Check for updates on gateway start (npm installs only). */
    checkOnStart?: boolean;
    /** Core auto-update policy for package installs. */
    auto?: {
      /** Enable background auto-update checks and apply logic. Default: false. */
      enabled?: boolean;
      /** Stable channel minimum delay before auto-apply. Default: 6. */
      stableDelayHours?: number;
      /** Additional stable-channel jitter window. Default: 12. */
      stableJitterHours?: number;
      /** Beta channel check cadence. Default: 1 hour. */
      betaCheckIntervalHours?: number;
    };
  };
  browser?: BrowserConfig;
  ui?: {
    /** Accent color for Maumau UI chrome (hex). */
    seamColor?: string;
    assistant?: {
      /** Assistant display name for UI surfaces. */
      name?: string;
      /** Assistant avatar (emoji, short text, or image URL/data URI). */
      avatar?: string;
    };
    mauOffice?: {
      /** Enable the MauOffice pixel office scene in Control UI. */
      enabled?: boolean;
      /** Maximum number of persistent workers shown before overflow is summarized offsite. */
      maxVisibleWorkers?: number;
      idlePackages?: {
        /** Enabled built-in idle package ids. */
        enabled?: string[];
      };
      scene?: {
        /** Authored MauOffice scene payload stored as zones, props, autotiles, and typed markers. */
        version?: 1;
        zoneRows?: Array<
          Array<
            "desk" | "meeting" | "browser" | "break" | "support" | "telephony" | "hall" | "outside"
          >
        >;
        wallRows?: Array<Array<boolean>>;
        props?: Array<{
          id: string;
          itemId: string;
          tileX: number;
          tileY: number;
          mirrored?: boolean;
          mountOverride?: "floor" | "wall" | "underlay";
          zOffsetOverride?: number;
          collisionOverride?: boolean;
          loopId?: string;
        }>;
        autotiles?: Array<{
          id: string;
          itemId: string;
          cells?: Array<{ tileX: number; tileY: number }>;
          mountOverride?: "floor" | "wall" | "underlay";
          zOffsetOverride?: number;
          collisionOverride?: boolean;
          loopId?: string;
        }>;
        markers?: Array<{
          id: string;
          role:
            | "spawn.office"
            | "spawn.support"
            | "desk.board"
            | "desk.workerSeat"
            | "meeting.presenter"
            | "meeting.seat"
            | "browser.workerSeat"
            | "support.staff"
            | "support.customer"
            | "telephony.staff"
            | "break.arcade"
            | "break.snack"
            | "break.volley"
            | "break.tableSeat"
            | "break.chase"
            | "break.game"
            | "break.jukebox"
            | "break.reading";
          tileX: number;
          tileY: number;
          pose: "stand" | "sit";
          layer: number;
          facingOverride?: "north" | "east" | "south" | "west";
          footprintTiles?: {
            width: number;
            height: number;
          };
        }>;
      };
    };
  };
  secrets?: SecretsConfig;
  skills?: SkillsConfig;
  plugins?: PluginsConfig;
  models?: ModelsConfig;
  nodeHost?: NodeHostConfig;
  agents?: AgentsConfig;
  teams?: TeamsConfig;
  tools?: ToolsConfig;
  bindings?: AgentBinding[];
  broadcast?: BroadcastConfig;
  audio?: AudioConfig;
  media?: {
    /** Preserve original uploaded filenames when storing inbound media. */
    preserveFilenames?: boolean;
    /** Optional retention window for persisted inbound media cleanup. */
    ttlHours?: number;
  };
  messages?: MessagesConfig;
  commands?: CommandsConfig;
  approvals?: ApprovalsConfig;
  session?: SessionConfig;
  web?: WebConfig;
  channels?: ChannelsConfig;
  cron?: CronConfig;
  hooks?: HooksConfig;
  discovery?: DiscoveryConfig;
  canvasHost?: CanvasHostConfig;
  talk?: TalkConfig;
  gateway?: GatewayConfig;
  memory?: MemoryConfig;
  mcp?: McpConfig;
};

export type ConfigValidationIssue = {
  path: string;
  message: string;
  allowedValues?: string[];
  allowedValuesHiddenCount?: number;
};

export type LegacyConfigIssue = {
  path: string;
  message: string;
};

export type ConfigFileSnapshot = {
  path: string;
  exists: boolean;
  raw: string | null;
  parsed: unknown;
  /**
   * Config after $include resolution and ${ENV} substitution, but BEFORE runtime
   * defaults are applied. Use this for config set/unset operations to avoid
   * leaking runtime defaults into the written config file.
   */
  resolved: MaumauConfig;
  valid: boolean;
  config: MaumauConfig;
  hash?: string;
  issues: ConfigValidationIssue[];
  warnings: ConfigValidationIssue[];
  legacyIssues: LegacyConfigIssue[];
};
