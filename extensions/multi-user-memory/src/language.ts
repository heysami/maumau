export const SUPPORTED_LANGUAGE_IDS = ["en", "id", "zh-CN", "zh-TW", "pt-BR", "de", "es"] as const;

export type SupportedLanguageId = (typeof SUPPORTED_LANGUAGE_IDS)[number];

export const DEFAULT_LANGUAGE_ID: SupportedLanguageId = "en";

const SUPPORTED_LANGUAGE_SET = new Set<string>(SUPPORTED_LANGUAGE_IDS);

export function normalizeLanguageId(value?: string | null): SupportedLanguageId | undefined {
  const normalized = (value ?? "").trim().replace(/_/g, "-").toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized === "en" || normalized.startsWith("en-")) {
    return "en";
  }
  if (
    normalized === "id" ||
    normalized === "in" ||
    normalized.startsWith("id-") ||
    normalized.startsWith("in-")
  ) {
    return "id";
  }
  if (
    normalized === "zh-tw" ||
    normalized === "zh-hk" ||
    normalized === "zh-mo" ||
    normalized === "zh-hant" ||
    normalized.startsWith("zh-tw-") ||
    normalized.startsWith("zh-hk-") ||
    normalized.startsWith("zh-mo-") ||
    normalized.startsWith("zh-hant-")
  ) {
    return "zh-TW";
  }
  if (
    normalized === "zh" ||
    normalized === "zh-cn" ||
    normalized === "zh-sg" ||
    normalized === "zh-hans" ||
    normalized.startsWith("zh-cn-") ||
    normalized.startsWith("zh-sg-") ||
    normalized.startsWith("zh-hans-")
  ) {
    return "zh-CN";
  }
  if (normalized === "pt" || normalized.startsWith("pt-")) {
    return "pt-BR";
  }
  if (normalized === "de" || normalized.startsWith("de-")) {
    return "de";
  }
  if (normalized === "es" || normalized.startsWith("es-")) {
    return "es";
  }
  return SUPPORTED_LANGUAGE_SET.has(value ?? "") ? (value as SupportedLanguageId) : undefined;
}

type TranslationKey =
  | "principalHeading"
  | "principalBody"
  | "principalPendingApprovals"
  | "principalPendingApprovalsWithLink"
  | "approvalCenterLink"
  | "approvalCenterTitle"
  | "approvalCenterIntro"
  | "approvalCenterNoPending"
  | "approvalCenterApprove"
  | "approvalCenterReject"
  | "approvalCenterTargetGroup"
  | "approvalCenterWhyShared"
  | "approvalCenterPreview"
  | "approvalCenterSensitivity"
  | "approvalCenterInvalid"
  | "approvalCenterExpired"
  | "approvalCenterBannerApproved"
  | "approvalCenterBannerRejected"
  | "approvalCenterBannerAlreadyDecided"
  | "approvalCenterBannerDenied"
  | "approvalCenterBannerNotFound"
  | "approvalCenterBannerInvalid"
  | "proposalApproved"
  | "proposalRejected"
  | "proposalListEmpty"
  | "proposalReviewIntro"
  | "proposalApproveDenied"
  | "proposalNotFound"
  | "proposalAlreadyDecided"
  | "proposalQueued"
  | "provisionalEmpty";

const TRANSLATIONS: Record<TranslationKey, Partial<Record<SupportedLanguageId, string>>> = {
  principalHeading: {
    en: "## Multi-User Memory Scope",
    id: "## Cakupan Memori Multi-Pengguna",
  },
  principalBody: {
    en: "Active user: {user}. Reply in {language}. Visible scopes: {scopes}. Do not reveal private memory from scopes the user cannot access.",
    id: "Pengguna aktif: {user}. Balas dalam {language}. Cakupan yang terlihat: {scopes}. Jangan ungkapkan memori pribadi dari cakupan yang tidak boleh diakses pengguna.",
  },
  principalPendingApprovals: {
    en: "The active user has {count} pending memory sharing approvals. Before your normal reply, briefly mention that they have approvals waiting for review.",
    id: "Pengguna aktif memiliki {count} persetujuan berbagi memori yang tertunda. Sebelum balasan normal Anda, sebutkan secara singkat bahwa ada persetujuan yang menunggu ditinjau.",
  },
  principalPendingApprovalsWithLink: {
    en: "The active user has {count} pending memory sharing approvals. Before your normal reply, briefly mention that they have approvals waiting for review and include this approval center link: {url}",
    id: "Pengguna aktif memiliki {count} persetujuan berbagi memori yang tertunda. Sebelum balasan normal Anda, sebutkan secara singkat bahwa ada persetujuan yang menunggu ditinjau dan sertakan tautan pusat persetujuan ini: {url}",
  },
  approvalCenterLink: {
    en: "Open the approval center: {url}",
    id: "Buka pusat persetujuan: {url}",
  },
  approvalCenterTitle: {
    en: "Memory sharing approvals for {user}",
    id: "Persetujuan berbagi memori untuk {user}",
  },
  approvalCenterIntro: {
    en: "Review the pending proposals below and choose what can be shared.",
    id: "Tinjau usulan tertunda di bawah ini dan pilih apa yang boleh dibagikan.",
  },
  approvalCenterNoPending: {
    en: "No pending memory sharing approvals.",
    id: "Tidak ada persetujuan berbagi memori yang tertunda.",
  },
  approvalCenterApprove: {
    en: "Approve",
    id: "Setujui",
  },
  approvalCenterReject: {
    en: "Reject",
    id: "Tolak",
  },
  approvalCenterTargetGroup: {
    en: "Shared group",
    id: "Grup bersama",
  },
  approvalCenterWhyShared: {
    en: "Why this may be shared",
    id: "Mengapa ini boleh dibagikan",
  },
  approvalCenterPreview: {
    en: "Source preview",
    id: "Pratinjau sumber",
  },
  approvalCenterSensitivity: {
    en: "Sensitivity",
    id: "Sensitivitas",
  },
  approvalCenterInvalid: {
    en: "This approval link is invalid.",
    id: "Tautan persetujuan ini tidak valid.",
  },
  approvalCenterExpired: {
    en: "This approval link has expired. Ask Maumau for a new one.",
    id: "Tautan persetujuan ini sudah kedaluwarsa. Minta tautan baru ke Maumau.",
  },
  approvalCenterBannerApproved: {
    en: "The proposal was approved and promoted to shared memory.",
    id: "Usulan disetujui dan dipromosikan ke memori bersama.",
  },
  approvalCenterBannerRejected: {
    en: "The proposal was rejected and kept private.",
    id: "Usulan ditolak dan tetap pribadi.",
  },
  approvalCenterBannerAlreadyDecided: {
    en: "This proposal is no longer pending.",
    id: "Usulan ini tidak lagi tertunda.",
  },
  approvalCenterBannerDenied: {
    en: "You are not allowed to decide this proposal.",
    id: "Anda tidak diizinkan memutuskan usulan ini.",
  },
  approvalCenterBannerNotFound: {
    en: "Proposal not found.",
    id: "Usulan tidak ditemukan.",
  },
  approvalCenterBannerInvalid: {
    en: "The approval request could not be processed.",
    id: "Permintaan persetujuan tidak dapat diproses.",
  },
  proposalApproved: {
    en: "Proposal {proposalId} was approved and promoted to shared memory.",
    id: "Usulan {proposalId} disetujui dan dipromosikan ke memori bersama.",
  },
  proposalRejected: {
    en: "Proposal {proposalId} was rejected and kept private.",
    id: "Usulan {proposalId} ditolak dan tetap pribadi.",
  },
  proposalListEmpty: {
    en: "No proposals are waiting for review.",
    id: "Tidak ada usulan yang menunggu peninjauan.",
  },
  proposalReviewIntro: {
    en: "Pending proposals for {user}:",
    id: "Usulan tertunda untuk {user}:",
  },
  proposalApproveDenied: {
    en: "Only the affected source user can approve or reject this proposal.",
    id: "Hanya pengguna sumber yang terdampak yang dapat menyetujui atau menolak usulan ini.",
  },
  proposalNotFound: {
    en: "Proposal not found.",
    id: "Usulan tidak ditemukan.",
  },
  proposalAlreadyDecided: {
    en: "This proposal is no longer pending.",
    id: "Usulan ini tidak lagi tertunda.",
  },
  proposalQueued: {
    en: "Queued proposal {proposalId} for group {groupId}: {reason}",
    id: "Usulan {proposalId} dimasukkan untuk grup {groupId}: {reason}",
  },
  provisionalEmpty: {
    en: "No provisional users are currently tracked.",
    id: "Belum ada pengguna provisional yang dilacak.",
  },
};

export function translate(
  language: SupportedLanguageId | undefined,
  key: TranslationKey,
  vars?: Record<string, string | number | undefined>,
): string {
  const template =
    TRANSLATIONS[key][language ?? DEFAULT_LANGUAGE_ID] ?? TRANSLATIONS[key].en ?? key;
  if (!vars) {
    return template;
  }
  return template.replace(/\{([^}]+)\}/g, (_match, token) => String(vars[token] ?? ""));
}
