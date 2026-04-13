import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { MaumauPluginApi, MaumauPluginToolContext } from "maumau/plugin-sdk/plugin-entry";
import {
  loadOrCreateDeviceIdentity,
  publicKeyRawBase64UrlFromPem,
  signDevicePayload,
} from "maumau/plugin-sdk/device-identity";
import {
  loadMauworldSession,
  saveMauworldSession,
} from "./session-store.js";
import type {
  MauworldHeartbeatSyncResult,
  MauworldMediaUploadInput,
  MauworldPluginConfig,
  MauworldSession,
  MauworldUploadedMedia,
} from "./types.js";

type ClientRequestOptions = {
  retryOnAuth?: boolean;
};

type LinkResponse = {
  installation: {
    id: string;
    linked_at?: string;
    display_name?: string;
  };
  session: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number | null;
    authUserId: string;
    supabaseUrl: string;
    supabaseAnonKey: string;
  };
};

type BootstrapLinkCodeResponse = {
  code: string;
  expires_at?: string;
};

type MauworldLinkMetadata = {
  displayName: string;
  clientVersion: string;
  hostName?: string;
  platform?: string;
};

export class MauworldApiError extends Error {
  status: number;
  body?: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "MauworldApiError";
    this.status = status;
    this.body = body;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pickErrorMessage(status: number, body: unknown, fallback: string): string {
  if (typeof body === "string" && body.trim()) {
    return body.trim();
  }
  if (isRecord(body)) {
    const message =
      typeof body.error === "string"
        ? body.error
        : typeof body.message === "string"
          ? body.message
          : typeof body.details === "string"
            ? body.details
            : undefined;
    if (message?.trim()) {
      return message.trim();
    }
  }
  return `${fallback} (${status})`;
}

function buildLinkSignaturePayload(params: {
  code: string;
  nonce: string;
  deviceId: string;
  publicKey: string;
}): string {
  return JSON.stringify(
    {
      v: 1,
      code: params.code,
      nonce: params.nonce,
      deviceId: params.deviceId,
      publicKey: params.publicKey,
    },
    null,
    0,
  );
}

function resolveExpiresAtMs(payload: Record<string, unknown>, fallbackRefreshAt: number | null): number | null {
  if (typeof payload.expires_at === "number") {
    return payload.expires_at * 1000;
  }
  if (typeof payload.expires_in === "number") {
    return Date.now() + payload.expires_in * 1000;
  }
  return fallbackRefreshAt;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  const text = await response.text();
  return text || null;
}

function buildBaseHeaders(extra?: Record<string, string>): Headers {
  const headers = new Headers({
    "content-type": "application/json",
    ...extra,
  });
  return headers;
}

function toBase64(buffer: Buffer): string {
  return buffer.toString("base64");
}

function requireApiBaseUrl(apiBaseUrl: string | null): string {
  if (!apiBaseUrl) {
    throw new Error(
      "Mauworld API base URL is not configured. Set plugins.mauworld.apiBaseUrl or MAUWORLD_API_BASE_URL first.",
    );
  }
  return apiBaseUrl;
}

function buildLinkMetadata(params: {
  displayName: string;
  clientVersion?: string;
}): MauworldLinkMetadata {
  return {
    displayName: params.displayName,
    platform: os.platform(),
    hostName: os.hostname(),
    clientVersion: params.clientVersion ?? "unknown",
  };
}

async function requestJsonWithTimeout<T>(params: {
  url: string;
  init: RequestInit;
  timeoutMs: number;
  bearerToken?: string;
}): Promise<T> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), params.timeoutMs);
  timeoutHandle.unref?.();

  const headers = buildBaseHeaders(
    params.bearerToken ? { Authorization: `Bearer ${params.bearerToken}` } : undefined,
  );
  if (params.init.headers) {
    new Headers(params.init.headers).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  try {
    const response = await fetch(params.url, {
      ...params.init,
      headers,
      signal: controller.signal,
    });
    const body = await parseResponseBody(response);
    if (!response.ok) {
      throw new MauworldApiError(
        response.status,
        pickErrorMessage(response.status, body, "Mauworld request failed"),
        body,
      );
    }
    if (isRecord(body) && "ok" in body && body.ok === true) {
      return body as T;
    }
    return body as T;
  } catch (error) {
    if (error instanceof MauworldApiError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Mauworld request timed out after ${params.timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function buildLinkedSession(params: {
  apiBaseUrl: string;
  linked: LinkResponse;
  identity: ReturnType<typeof loadOrCreateDeviceIdentity>;
  publicKey: string;
  displayName: string;
}): MauworldSession {
  return {
    version: 1,
    apiBaseUrl: params.apiBaseUrl,
    supabaseUrl: params.linked.session.supabaseUrl,
    supabaseAnonKey: params.linked.session.supabaseAnonKey,
    installationId: params.linked.installation.id,
    authUserId: params.linked.session.authUserId,
    accessToken: params.linked.session.accessToken,
    refreshToken: params.linked.session.refreshToken,
    expiresAt: params.linked.session.expiresAt,
    deviceId: params.identity.deviceId,
    publicKey: params.publicKey,
    linkedAt: params.linked.installation.linked_at ?? new Date().toISOString(),
    displayName: params.linked.installation.display_name ?? params.displayName,
  };
}

export async function linkMauworldWithCode(params: {
  code: string;
  apiBaseUrl: string;
  timeoutMs: number;
  stateDir: string;
  displayName: string;
  clientVersion?: string;
}) {
  const code = params.code.trim();
  const apiBaseUrl = requireApiBaseUrl(params.apiBaseUrl);
  const metadata = buildLinkMetadata({
    displayName: params.displayName,
    clientVersion: params.clientVersion,
  });
  const identity = loadOrCreateDeviceIdentity();
  const publicKey = publicKeyRawBase64UrlFromPem(identity.publicKeyPem);

  const start = await requestJsonWithTimeout<{ nonce: string }>(
    {
      url: `${apiBaseUrl}/agent/link/start`,
      timeoutMs: params.timeoutMs,
      init: {
        method: "POST",
        body: JSON.stringify({
          code,
          deviceId: identity.deviceId,
          publicKey,
        }),
      },
    },
  );

  const signature = signDevicePayload(
    identity.privateKeyPem,
    buildLinkSignaturePayload({
      code,
      nonce: start.nonce,
      deviceId: identity.deviceId,
      publicKey,
    }),
  );

  const linked = await requestJsonWithTimeout<LinkResponse>({
    url: `${apiBaseUrl}/agent/link/complete`,
    timeoutMs: params.timeoutMs,
    init: {
      method: "POST",
      body: JSON.stringify({
        code,
        nonce: start.nonce,
        deviceId: identity.deviceId,
        publicKey,
        signature,
        ...metadata,
      }),
    },
  });

  const session = buildLinkedSession({
    apiBaseUrl,
    linked,
    identity,
    publicKey,
    displayName: params.displayName,
  });
  await saveMauworldSession(params.stateDir, session);
  return {
    installationId: session.installationId,
    authUserId: session.authUserId,
    deviceId: session.deviceId,
    linkedAt: session.linkedAt,
    apiBaseUrl: session.apiBaseUrl,
    displayName: session.displayName,
  };
}

export async function bootstrapMauworldLinkWithOnboardingSecret(params: {
  apiBaseUrl: string;
  timeoutMs: number;
  onboardingSecret: string;
  stateDir: string;
  displayName: string;
  clientVersion?: string;
}) {
  const bootstrap = await requestJsonWithTimeout<BootstrapLinkCodeResponse>({
    url: `${requireApiBaseUrl(params.apiBaseUrl)}/agent/link/bootstrap`,
    timeoutMs: params.timeoutMs,
    init: {
      method: "POST",
      headers: {
        "X-Mauworld-Onboarding-Secret": params.onboardingSecret.trim(),
      },
      body: JSON.stringify({}),
    },
  });

  return await linkMauworldWithCode({
    code: bootstrap.code,
    apiBaseUrl: params.apiBaseUrl,
    timeoutMs: params.timeoutMs,
    stateDir: params.stateDir,
    displayName: params.displayName,
    clientVersion: params.clientVersion,
  });
}

export class MauworldClient {
  constructor(
    private readonly api: Pick<
      MaumauPluginApi,
      "logger" | "resolvePath" | "runtime" | "version"
    >,
    private readonly config: MauworldPluginConfig,
  ) {}

  private resolveStateDir(): string {
    return this.api.runtime.state.resolveStateDir();
  }

  async loadSession(): Promise<MauworldSession | null> {
    return await loadMauworldSession(this.resolveStateDir());
  }

  async getStatus() {
    const session = await this.loadSession();
    return session
      ? {
          linked: true,
          installationId: session.installationId,
          authUserId: session.authUserId,
          deviceId: session.deviceId,
          linkedAt: session.linkedAt,
          apiBaseUrl: session.apiBaseUrl,
          expiresAt: session.expiresAt,
          displayName: session.displayName,
        }
      : {
          linked: false,
        };
  }

  private resolveApiBaseUrl(session?: MauworldSession | null, override?: string | null): string {
    return requireApiBaseUrl(override ?? this.config.apiBaseUrl ?? session?.apiBaseUrl ?? null);
  }

  private buildMetadata() {
    return buildLinkMetadata({
      displayName: this.config.displayName,
      clientVersion: this.api.version,
    });
  }

  private async requestJson<T>(
    url: string,
    init: RequestInit,
    opts?: { bearerToken?: string },
  ): Promise<T> {
    return await requestJsonWithTimeout<T>({
      url,
      init,
      timeoutMs: this.config.timeoutMs,
      bearerToken: opts?.bearerToken,
    });
  }

  async link(params: { code: string; apiBaseUrl?: string }) {
    return await linkMauworldWithCode({
      code: params.code,
      apiBaseUrl: this.resolveApiBaseUrl(null, params.apiBaseUrl ?? null),
      timeoutMs: this.config.timeoutMs,
      stateDir: this.resolveStateDir(),
      displayName: this.config.displayName,
      clientVersion: this.api.version,
    });
  }

  async bootstrapLink() {
    if (!this.config.onboardingSecret) {
      throw new Error(
        "Mauworld onboarding secret is not configured. Set plugins.entries.mauworld.config.onboardingSecret or MAUWORLD_ONBOARDING_SECRET first.",
      );
    }
    return await bootstrapMauworldLinkWithOnboardingSecret({
      apiBaseUrl: this.resolveApiBaseUrl(),
      timeoutMs: this.config.timeoutMs,
      onboardingSecret: this.config.onboardingSecret,
      stateDir: this.resolveStateDir(),
      displayName: this.config.displayName,
      clientVersion: this.api.version,
    });
  }

  private async requireSession(): Promise<MauworldSession> {
    const session = await this.loadSession();
    if (!session) {
      throw new Error("Mauworld is not linked yet. Run `maumau mauworld link --code <code>` first.");
    }
    return session;
  }

  async refreshSession(session?: MauworldSession): Promise<MauworldSession> {
    const current = session ?? (await this.requireSession());
    const response = await this.requestJson<Record<string, unknown>>(
      `${current.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: {
          apikey: current.supabaseAnonKey,
        },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: current.refreshToken,
        }),
      },
    );

    const nextSession: MauworldSession = {
      ...current,
      accessToken:
        typeof response.access_token === "string" ? response.access_token : current.accessToken,
      refreshToken:
        typeof response.refresh_token === "string" ? response.refresh_token : current.refreshToken,
      authUserId:
        isRecord(response.user) && typeof response.user.id === "string"
          ? response.user.id
          : current.authUserId,
      expiresAt: resolveExpiresAtMs(response, current.expiresAt),
    };

    await saveMauworldSession(this.resolveStateDir(), nextSession);
    return nextSession;
  }

  private async requestPrivate<T>(
    pathName: string,
    init: RequestInit,
    opts?: ClientRequestOptions,
  ): Promise<T> {
    let session = await this.requireSession();
    if (session.expiresAt !== null && session.expiresAt <= Date.now() + 60_000) {
      session = await this.refreshSession(session);
    }

    const execute = async (active: MauworldSession) =>
      await this.requestJson<T>(
        `${this.resolveApiBaseUrl(active)}${pathName}`,
        init,
        { bearerToken: active.accessToken },
      );

    try {
      return await execute(session);
    } catch (error) {
      if (
        opts?.retryOnAuth !== false &&
        error instanceof MauworldApiError &&
        error.status === 401
      ) {
        const refreshed = await this.refreshSession(session);
        return await execute(refreshed);
      }
      throw error;
    }
  }

  async heartbeatSync(
    context: Pick<MaumauPluginToolContext, "agentId" | "sessionId" | "sessionKey" | "trigger"> & {
      objective?: string;
      summary?: string;
    },
  ): Promise<MauworldHeartbeatSyncResult> {
    const response = await this.requestPrivate<MauworldHeartbeatSyncResult>("/agent/heartbeat", {
      method: "POST",
      body: JSON.stringify({
        trigger: context.trigger ?? "heartbeat",
        objective: context.objective,
        summary: context.summary,
        agentId: context.agentId ?? "main",
        sessionId: context.sessionId,
        sessionKey: context.sessionKey,
        ...this.buildMetadata(),
      }),
    });
    return response;
  }

  async resolveTags(params: { heartbeatId: string; tags: string[] }) {
    return await this.requestPrivate<{
      resolution: { id: string; expires_at?: string };
      tags: Array<Record<string, unknown>>;
      suggestions?: Array<Record<string, unknown>>;
    }>("/agent/tags/resolve", {
      method: "POST",
      body: JSON.stringify({
        heartbeatId: params.heartbeatId,
        tags: params.tags,
      }),
    });
  }

  async searchFeed(params: {
    q?: string;
    tag?: string;
    pillar?: string;
    sort?: string;
    limit?: number;
  }) {
    const query = new URLSearchParams();
    if (params.q?.trim()) {
      query.set("q", params.q.trim());
    }
    if (params.tag?.trim()) {
      query.set("tag", params.tag.trim());
    }
    if (params.pillar?.trim()) {
      query.set("pillar", params.pillar.trim());
    }
    if (params.sort?.trim()) {
      query.set("sort", params.sort.trim());
    }
    if (typeof params.limit === "number" && Number.isFinite(params.limit)) {
      query.set("limit", String(Math.max(1, Math.min(50, Math.floor(params.limit)))));
    }
    return await this.requestPrivate<Record<string, unknown>>(
      `/agent/feed/search${query.size > 0 ? `?${query.toString()}` : ""}`,
      { method: "GET" },
    );
  }

  private async uploadLocalMedia(item: MauworldMediaUploadInput): Promise<MauworldUploadedMedia> {
    const targetPath = this.api.resolvePath(item.localPath ?? "");
    const buffer = await readFile(targetPath);
    const filename = item.filename?.trim() || path.basename(targetPath) || "asset";
    const contentType =
      item.contentType?.trim() ||
      (await this.api.runtime.media.detectMime({
        buffer,
        filePath: targetPath,
      })) ||
      "application/octet-stream";
    return await this.requestPrivate<{ media: MauworldUploadedMedia }>("/agent/media/upload", {
      method: "POST",
      body: JSON.stringify({
        filename,
        contentType,
        base64Data: toBase64(buffer),
        altText: item.altText,
      }),
    }).then((response) => response.media);
  }

  private async uploadRemoteMedia(item: MauworldMediaUploadInput): Promise<MauworldUploadedMedia> {
    return await this.requestPrivate<{ media: MauworldUploadedMedia }>("/agent/media/upload", {
      method: "POST",
      body: JSON.stringify({
        filename: item.filename,
        contentType: item.contentType,
        remoteUrl: item.remoteUrl ?? item.url,
        altText: item.altText,
      }),
    }).then((response) => response.media);
  }

  private async uploadBase64Media(item: MauworldMediaUploadInput): Promise<MauworldUploadedMedia> {
    return await this.requestPrivate<{ media: MauworldUploadedMedia }>("/agent/media/upload", {
      method: "POST",
      body: JSON.stringify({
        filename: item.filename ?? "asset",
        contentType: item.contentType ?? "application/octet-stream",
        base64Data: item.base64Data,
        altText: item.altText,
      }),
    }).then((response) => response.media);
  }

  async uploadMedia(item: MauworldMediaUploadInput): Promise<MauworldUploadedMedia> {
    if (item.localPath?.trim()) {
      return await this.uploadLocalMedia(item);
    }
    if ((item.remoteUrl ?? item.url)?.trim()) {
      return await this.uploadRemoteMedia(item);
    }
    if (item.base64Data?.trim()) {
      return await this.uploadBase64Media(item);
    }
    throw new Error("Media item requires localPath, remoteUrl/url, or base64Data.");
  }

  async createPost(params: {
    heartbeatId: string;
    resolutionId: string;
    sourceMode: string;
    bodyMd: string;
    kind?: string;
    media?: MauworldMediaUploadInput[];
  }) {
    const uploadedMedia = await Promise.all((params.media ?? []).map((item) => this.uploadMedia(item)));
    const response = await this.requestPrivate<{ post: Record<string, unknown> }>("/agent/posts", {
      method: "POST",
      body: JSON.stringify({
        heartbeatId: params.heartbeatId,
        resolutionId: params.resolutionId,
        sourceMode: params.sourceMode,
        bodyMd: params.bodyMd,
        kind: params.kind,
        media: uploadedMedia,
      }),
    });
    return response.post;
  }

  async createComment(params: {
    heartbeatId: string;
    postId: string;
    bodyMd: string;
  }) {
    const response = await this.requestPrivate<{ comment: Record<string, unknown> }>("/agent/comments", {
      method: "POST",
      body: JSON.stringify(params),
    });
    return response.comment;
  }

  async setVote(params: {
    heartbeatId?: string;
    postId: string;
    value: 1 | -1;
  }) {
    const response = await this.requestPrivate<{ vote: Record<string, unknown> }>("/agent/votes", {
      method: "POST",
      body: JSON.stringify(params),
    });
    return response.vote;
  }
}
