import path from "node:path";
import {
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
  normalizeAllowFromEntries,
  normalizeE164,
  pathExists,
  splitSetupEntries,
  setSetupChannelEnabled,
  type DmPolicy,
  type MaumauConfig,
} from "maumau/plugin-sdk/setup";
import type { ChannelSetupWizard } from "maumau/plugin-sdk/setup";
import { formatCliCommand, formatDocsLink } from "maumau/plugin-sdk/setup-tools";
import { listWhatsAppAccountIds, resolveWhatsAppAuthDir } from "./accounts.js";
import { loginWeb } from "./login.js";
import { whatsappSetupAdapter } from "./setup-core.js";

const channel = "whatsapp" as const;

function mergeWhatsAppConfig(
  cfg: MaumauConfig,
  patch: Partial<NonNullable<NonNullable<MaumauConfig["channels"]>["whatsapp"]>>,
  options?: { unsetOnUndefined?: string[] },
): MaumauConfig {
  const base = { ...(cfg.channels?.whatsapp ?? {}) } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      if (options?.unsetOnUndefined?.includes(key)) {
        delete base[key];
      }
      continue;
    }
    base[key] = value;
  }
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      whatsapp: base,
    },
  };
}

function setWhatsAppDmPolicy(cfg: MaumauConfig, dmPolicy: DmPolicy): MaumauConfig {
  return mergeWhatsAppConfig(cfg, { dmPolicy });
}

function setWhatsAppAllowFrom(cfg: MaumauConfig, allowFrom?: string[]): MaumauConfig {
  return mergeWhatsAppConfig(cfg, { allowFrom }, { unsetOnUndefined: ["allowFrom"] });
}

function setWhatsAppSelfChatMode(cfg: MaumauConfig, selfChatMode: boolean): MaumauConfig {
  return mergeWhatsAppConfig(cfg, { selfChatMode });
}

async function detectWhatsAppLinked(cfg: MaumauConfig, accountId: string): Promise<boolean> {
  const { authDir } = resolveWhatsAppAuthDir({ cfg, accountId });
  const credsPath = path.join(authDir, "creds.json");
  return await pathExists(credsPath);
}

async function promptWhatsAppStarterAllowFrom(params: {
  existingAllowFrom: string[];
  prompter: Parameters<NonNullable<ChannelSetupWizard["finalize"]>>[0]["prompter"];
}): Promise<{ normalized: string; allowFrom: string[] }> {
  const { prompter, existingAllowFrom } = params;
  const initialValue = existingAllowFrom.find((item) => item !== "*");

  await prompter.note(
    "Add the phone number that should be able to message this WhatsApp agent first.",
    "First approved number",
  );
  const entry = await prompter.text({
    message: "Your WhatsApp number (the phone you will message the agent from)",
    placeholder: "+15555550123",
    initialValue,
    validate: (value) => {
      const raw = String(value ?? "").trim();
      if (!raw) {
        return "Required";
      }
      const normalized = normalizeE164(raw);
      if (!normalized) {
        return `Invalid number: ${raw}`;
      }
      return undefined;
    },
  });

  const normalized = normalizeE164(String(entry).trim());
  if (!normalized) {
    throw new Error("Invalid WhatsApp sender number (expected E.164 after validation).");
  }
  const allowFrom = normalizeAllowFromEntries(
    [...existingAllowFrom.filter((item) => item !== "*"), normalized],
    normalizeE164,
  );
  return { normalized, allowFrom };
}

async function applyWhatsAppStarterAllowlist(params: {
  cfg: MaumauConfig;
  existingAllowFrom: string[];
  messageLines: string[];
  prompter: Parameters<NonNullable<ChannelSetupWizard["finalize"]>>[0]["prompter"];
  title: string;
}): Promise<MaumauConfig> {
  const { normalized, allowFrom } = await promptWhatsAppStarterAllowFrom({
    prompter: params.prompter,
    existingAllowFrom: params.existingAllowFrom,
  });
  let next = setWhatsAppSelfChatMode(params.cfg, false);
  next = setWhatsAppDmPolicy(next, "allowlist");
  next = setWhatsAppAllowFrom(next, allowFrom);
  await params.prompter.note(
    [...params.messageLines, `- allowFrom includes ${normalized}`].join("\n"),
    params.title,
  );
  return next;
}

function parseWhatsAppAllowFromEntries(
  raw: string,
  options?: { allowWildcard?: boolean },
): { entries: string[]; invalidEntry?: string } {
  const parts = splitSetupEntries(raw);
  if (parts.length === 0) {
    return { entries: [] };
  }
  const entries: string[] = [];
  for (const part of parts) {
    if (part === "*") {
      if (!options?.allowWildcard) {
        return { entries: [], invalidEntry: part };
      }
      entries.push("*");
      continue;
    }
    const normalized = normalizeE164(part);
    if (!normalized) {
      return { entries: [], invalidEntry: part };
    }
    entries.push(normalized);
  }
  return { entries: normalizeAllowFromEntries(entries, normalizeE164) };
}

async function promptWhatsAppApprovedNumbers(params: {
  cfg: MaumauConfig;
  existingAllowFrom: string[];
  message: string;
  prompter: Parameters<NonNullable<ChannelSetupWizard["finalize"]>>[0]["prompter"];
}): Promise<MaumauConfig> {
  const allowRaw = await params.prompter.text({
    message: params.message,
    placeholder: "+15555550123, +447700900123",
    initialValue: params.existingAllowFrom.filter((entry) => entry !== "*").join(", "),
    validate: (value) => {
      const raw = String(value ?? "").trim();
      if (!raw) {
        return "Required";
      }
      const parsed = parseWhatsAppAllowFromEntries(raw);
      if (parsed.entries.length === 0 && !parsed.invalidEntry) {
        return "Required";
      }
      if (parsed.invalidEntry === "*") {
        return 'Choose "Anyone who knows the number" instead of entering "*".';
      }
      if (parsed.invalidEntry) {
        return `Invalid number: ${parsed.invalidEntry}`;
      }
      return undefined;
    },
  });

  const parsed = parseWhatsAppAllowFromEntries(String(allowRaw));
  return setWhatsAppAllowFrom(params.cfg, parsed.entries);
}

async function promptWhatsAppDmAccess(params: {
  cfg: MaumauConfig;
  forceAllowFrom: boolean;
  prompter: Parameters<NonNullable<ChannelSetupWizard["finalize"]>>[0]["prompter"];
}): Promise<MaumauConfig> {
  const existingPolicy = params.cfg.channels?.whatsapp?.dmPolicy ?? "pairing";
  const existingAllowFrom = params.cfg.channels?.whatsapp?.allowFrom ?? [];
  const existingLabel = existingAllowFrom.length > 0 ? existingAllowFrom.join(", ") : "unset";

  if (params.forceAllowFrom) {
    return await applyWhatsAppStarterAllowlist({
      cfg: params.cfg,
      prompter: params.prompter,
      existingAllowFrom,
      title: "Who can message this agent first?",
      messageLines: [
        "Direct chats are limited to the number you entered until you change these settings.",
      ],
    });
  }

  await params.prompter.note(
    [
      "This WhatsApp connection becomes a separate Maumau identity in WhatsApp.",
      "Maumau cannot create a WhatsApp number or bot account for you.",
      "You link an existing WhatsApp number or linked device, and that linked account becomes the agent identity.",
      "People message that WhatsApp account from their own phones, and the agent replies there.",
      "Recommended: use a dedicated number or linked device for the agent instead of self-chat on your personal account.",
      "",
      `Current access: ${existingPolicy}; approved numbers: ${existingLabel}`,
      `Docs: ${formatDocsLink("/whatsapp", "whatsapp")}`,
    ].join("\n"),
    "How WhatsApp chat works",
  );

  const policy = (await params.prompter.select({
    message: "Who should be able to start a direct chat with this WhatsApp agent?",
    options: [
      { value: "pairing", label: "People I approve one time (recommended)" },
      { value: "allowlist", label: "Only phone numbers I list" },
      { value: "open", label: "Anyone who knows the number" },
      { value: "disabled", label: "Nobody for now" },
    ],
  })) as DmPolicy;

  let next = setWhatsAppSelfChatMode(params.cfg, false);
  next = setWhatsAppDmPolicy(next, policy);
  if (policy === "open") {
    const allowFrom = normalizeAllowFromEntries(["*", ...existingAllowFrom], normalizeE164);
    next = setWhatsAppAllowFrom(next, allowFrom.length > 0 ? allowFrom : ["*"]);
    return next;
  }
  if (policy === "disabled") {
    return next;
  }

  if (policy === "allowlist" && existingAllowFrom.length === 0) {
    return await promptWhatsAppApprovedNumbers({
      cfg: next,
      existingAllowFrom,
      message: "Phone numbers allowed to message this agent (comma-separated, E.164)",
      prompter: params.prompter,
    });
  }

  const allowOptions =
    policy === "allowlist"
      ? existingAllowFrom.length > 0
        ? ([
            { value: "keep", label: "Keep the current approved numbers" },
            { value: "list", label: "Replace the approved numbers" },
          ] as const)
        : ([{ value: "list", label: "Add approved phone numbers" }] as const)
      : existingAllowFrom.length > 0
        ? ([
            { value: "keep", label: "Keep the current pre-approved numbers" },
            {
              value: "unset",
              label: "Start with approval requests only",
            },
            { value: "list", label: "Pre-approve specific phone numbers" },
          ] as const)
        : ([
            { value: "unset", label: "Start with approval requests only" },
            { value: "list", label: "Pre-approve specific phone numbers" },
          ] as const);

  const mode = await params.prompter.select({
    message:
      policy === "allowlist"
        ? "How should Maumau handle the approved phone numbers?"
        : "Do you want to pre-approve any phone numbers now?",
    options: allowOptions.map((opt) => ({
      value: opt.value,
      label: opt.label,
    })),
  });

  if (mode === "keep") {
    return next;
  }
  if (mode === "unset") {
    return setWhatsAppAllowFrom(next, undefined);
  }
  return await promptWhatsAppApprovedNumbers({
    cfg: next,
    existingAllowFrom,
    message: "Phone numbers allowed to message this agent (comma-separated, E.164)",
    prompter: params.prompter,
  });
}

export const whatsappSetupWizard: ChannelSetupWizard = {
  channel,
  status: {
    configuredLabel: "linked",
    unconfiguredLabel: "not linked",
    configuredHint: "linked",
    unconfiguredHint: "not linked",
    configuredScore: 5,
    unconfiguredScore: 4,
    resolveConfigured: async ({ cfg }) => {
      for (const accountId of listWhatsAppAccountIds(cfg)) {
        if (await detectWhatsAppLinked(cfg, accountId)) {
          return true;
        }
      }
      return false;
    },
    resolveStatusLines: async ({ cfg, configured }) => {
      const linkedAccountId = (
        await Promise.all(
          listWhatsAppAccountIds(cfg).map(async (accountId) => ({
            accountId,
            linked: await detectWhatsAppLinked(cfg, accountId),
          })),
        )
      ).find((entry) => entry.linked)?.accountId;
      const label = linkedAccountId
        ? `WhatsApp (${linkedAccountId === DEFAULT_ACCOUNT_ID ? "default" : linkedAccountId})`
        : "WhatsApp";
      return [`${label}: ${configured ? "linked" : "not linked"}`];
    },
  },
  resolveShouldPromptAccountIds: ({ options, shouldPromptAccountIds }) =>
    Boolean(shouldPromptAccountIds || options?.promptWhatsAppAccountId),
  credentials: [],
  finalize: async ({ cfg, accountId, forceAllowFrom, prompter, runtime }) => {
    let next =
      accountId === DEFAULT_ACCOUNT_ID
        ? cfg
        : whatsappSetupAdapter.applyAccountConfig({
            cfg,
            accountId,
            input: {},
          });

    const linked = await detectWhatsAppLinked(next, accountId);
    const { authDir } = resolveWhatsAppAuthDir({
      cfg: next,
      accountId,
    });

    if (!linked) {
      await prompter.note(
        [
          "Scan the QR with WhatsApp on your phone.",
          `Credentials are stored under ${authDir}/ for future runs.`,
          `Docs: ${formatDocsLink("/whatsapp", "whatsapp")}`,
        ].join("\n"),
        "WhatsApp linking",
      );
    }

    const wantsLink = await prompter.confirm({
      message: linked ? "WhatsApp already linked. Re-link now?" : "Link WhatsApp now (QR)?",
      initialValue: !linked,
    });
    if (wantsLink) {
      try {
        await loginWeb(false, undefined, runtime, accountId);
      } catch (error) {
        runtime.error(`WhatsApp login failed: ${String(error)}`);
        await prompter.note(`Docs: ${formatDocsLink("/whatsapp", "whatsapp")}`, "WhatsApp help");
      }
    } else if (!linked) {
      await prompter.note(
        `Run \`${formatCliCommand("maumau channels login")}\` later to link WhatsApp.`,
        "WhatsApp",
      );
    }

    next = await promptWhatsAppDmAccess({
      cfg: next,
      forceAllowFrom,
      prompter,
    });
    return { cfg: next };
  },
  disable: (cfg) => setSetupChannelEnabled(cfg, channel, false),
  onAccountRecorded: (accountId, options) => {
    options?.onWhatsAppAccountId?.(accountId);
  },
};
