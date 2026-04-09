import type { VoiceCallConfig } from "./config.js";
import type { CoreConfig } from "./core-bridge.js";
import { startTunnel, type TunnelResult } from "./tunnel.js";

type Logger = {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
  debug?: (message: string) => void;
};

const DEFAULT_GATEWAY_PORT = 18789;
export const VAPI_AUTO_BRIDGE_HTTPS_PORT = 8443;

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function buildVapiAutoBridgeUrl(params: { hostname: string; bridgePath: string }): string {
  const hostname = params.hostname.trim().replace(/\.$/, "");
  const bridgePath = params.bridgePath.startsWith("/") ? params.bridgePath : `/${params.bridgePath}`;
  return `https://${hostname}:${VAPI_AUTO_BRIDGE_HTTPS_PORT}${bridgePath}`;
}

function resolveGatewayPort(coreConfig: CoreConfig): number {
  const gateway = asObject(coreConfig["gateway"]);
  const port = gateway?.port;
  if (typeof port === "number" && Number.isFinite(port) && port > 0) {
    return Math.floor(port);
  }
  return DEFAULT_GATEWAY_PORT;
}

export class VapiBridgeManager {
  private config: VoiceCallConfig;
  private coreConfig: CoreConfig;
  private logger?: Logger;
  private tunnelResult: TunnelResult | null = null;
  private tunnelStartPromise: Promise<string> | null = null;

  constructor(params: { config: VoiceCallConfig; coreConfig: CoreConfig; logger?: Logger }) {
    this.config = params.config;
    this.coreConfig = params.coreConfig;
    this.logger = params.logger;
  }

  private manualBridgeUrl(): string | undefined {
    if (this.config.vapi.bridgeMode !== "manual-public-url") {
      return undefined;
    }
    const trimmed = this.config.vapi.bridgeUrl?.trim();
    return trimmed ? trimmed : undefined;
  }

  async resolveBridgeUrl(): Promise<string> {
    const manualBridgeUrl = this.manualBridgeUrl();
    if (manualBridgeUrl) {
      return manualBridgeUrl;
    }
    if (this.tunnelResult?.publicUrl) {
      return this.tunnelResult.publicUrl;
    }
    if (this.tunnelStartPromise) {
      return await this.tunnelStartPromise;
    }

    this.tunnelStartPromise = this.startAutoBridge();
    try {
      return await this.tunnelStartPromise;
    } catch (error) {
      this.tunnelStartPromise = null;
      throw error;
    }
  }

  private async startAutoBridge(): Promise<string> {
    const gatewayPort = resolveGatewayPort(this.coreConfig);
    let tunnelResult: TunnelResult | null = null;
    try {
      tunnelResult = await startTunnel({
        provider: "tailscale-funnel",
        port: gatewayPort,
        path: this.config.vapi.bridgePath,
        httpsPort: VAPI_AUTO_BRIDGE_HTTPS_PORT,
      });
    } catch (error) {
      throw new Error(
        `Could not start the Vapi auto bridge: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    if (!tunnelResult?.publicUrl) {
      throw new Error("Could not start the Vapi auto bridge.");
    }
    this.tunnelResult = tunnelResult;
    this.logger?.info?.(`[voice-call] Vapi auto bridge active: ${tunnelResult.publicUrl}`);
    return tunnelResult.publicUrl;
  }

  async stop(): Promise<void> {
    if (this.tunnelResult) {
      await this.tunnelResult.stop().catch((error) => {
        this.logger?.warn?.(`[voice-call] Failed to stop the Vapi auto bridge: ${String(error)}`);
      });
      this.tunnelResult = null;
    }
    this.tunnelStartPromise = null;
  }
}
