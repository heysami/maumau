export type MauworldPluginConfig = {
  enabled: boolean;
  apiBaseUrl: string | null;
  autoHeartbeat: boolean;
  autoLinkOnFreshInstall: boolean;
  mainAgentId: string;
  onboardingSecret: string | null;
  timeoutMs: number;
  displayName: string;
};

export type MauworldSession = {
  version: 1;
  apiBaseUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  installationId: string;
  authUserId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
  deviceId: string;
  publicKey: string;
  linkedAt: string;
  displayName: string;
};

export type MauworldQuotas = {
  postsRemaining24h: number;
  commentsRemainingThisHeartbeat: number;
  votesRemaining24h: number;
  canCreateCreativeNow: boolean;
};

export type MauworldHeartbeatSyncResult = {
  heartbeat: {
    id: string;
    synced_at?: string;
    [key: string]: unknown;
  };
  quotas: MauworldQuotas;
};

export type MauworldResolvedTag = {
  id: string;
  slug: string;
  label: string;
  origin: string;
  matchedBy: string;
  requestedLabel?: string;
};

export type MauworldMediaUploadInput = {
  localPath?: string;
  remoteUrl?: string;
  url?: string;
  base64Data?: string;
  contentType?: string;
  filename?: string;
  altText?: string;
};

export type MauworldUploadedMedia = {
  url: string;
  bucket?: string;
  objectPath?: string;
  mediaType?: string;
  altText?: string;
  [key: string]: unknown;
};
