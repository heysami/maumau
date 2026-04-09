import USER_CHANNEL_QUICK_SETUP_JSON from "../../apps/shared/MaumauKit/Sources/MaumauKit/Resources/user-channel-quick-setup.json" with { type: "json" };

export type UserChannelInlineQuickSetupId =
  | "whatsapp"
  | "telegram"
  | "discord"
  | "imessage"
  | "slack"
  | "line";

export type UserChannelQuickSetupGuidanceLink = {
  title: string;
  url: string;
};

export type UserChannelQuickSetupGuidance = {
  identity: string;
  requirements: string[];
  setupSteps: string[];
  artifacts: string[];
  usage?: string;
  quickLinks?: UserChannelQuickSetupGuidanceLink[];
};

export type UserChannelQuickSetupFieldSpec = {
  key: string;
  label: string;
  placeholder?: string;
  required: boolean;
  secret?: boolean;
  helpLines?: string[];
};

export type UserChannelQuickSetupCardSpec = {
  kind: "whatsapp" | "single-secret" | "dual-secret" | "single-text";
  sectionTitle: string;
  title: string;
  emptyHeadline: string;
  emptyMessage: string;
  emptyBadge: string;
  buttonTitle?: string;
  existingCredentialNote?: string;
  setupNote: string;
  successMessage?: string;
  waitingBadge?: string;
  waitingMessage?: string;
  linkedBadge?: string;
  qrTitle?: string;
  qrBody?: string;
  pickerSummary?: string;
};

export type UserChannelQuickSetupEntry = {
  guidance: UserChannelQuickSetupGuidance;
  quickSetup: UserChannelQuickSetupCardSpec;
  fields: UserChannelQuickSetupFieldSpec[];
};

type UserChannelQuickSetupConfig = {
  version: number;
  channelOrder: UserChannelInlineQuickSetupId[];
  settingsNote: string;
  channels: Record<UserChannelInlineQuickSetupId, UserChannelQuickSetupEntry>;
};

const USER_CHANNEL_QUICK_SETUP_CONFIG =
  USER_CHANNEL_QUICK_SETUP_JSON as UserChannelQuickSetupConfig;

export const USER_CHANNEL_INLINE_QUICK_SETUP_IDS = Object.freeze(
  [...USER_CHANNEL_QUICK_SETUP_CONFIG.channelOrder],
) as readonly UserChannelInlineQuickSetupId[];

export function isUserChannelInlineQuickSetupId(
  value: string,
): value is UserChannelInlineQuickSetupId {
  return (USER_CHANNEL_INLINE_QUICK_SETUP_IDS as readonly string[]).includes(value);
}

export function getUserChannelQuickSetupGuidance(
  channelId: UserChannelInlineQuickSetupId,
): UserChannelQuickSetupGuidance {
  return USER_CHANNEL_QUICK_SETUP_CONFIG.channels[channelId].guidance;
}

export function getUserChannelQuickSetupEntry(
  channelId: UserChannelInlineQuickSetupId,
): UserChannelQuickSetupEntry {
  return USER_CHANNEL_QUICK_SETUP_CONFIG.channels[channelId];
}

export const USER_CHANNEL_QUICK_SETUP_SETTINGS_NOTE =
  USER_CHANNEL_QUICK_SETUP_CONFIG.settingsNote;
