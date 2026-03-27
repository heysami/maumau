import type { ChannelPlugin } from "maumau/plugin-sdk/core";
import {
  resolveWhatsAppGroupIntroHint,
  resolveWhatsAppGroupRequireMention,
  resolveWhatsAppGroupToolPolicy,
} from "../api.js";
import { type ResolvedWhatsAppAccount } from "./accounts.js";
import { webAuthExists } from "./auth-store.js";
import { whatsappSetupAdapter } from "./setup-core.js";
import {
  createWhatsAppPluginBase,
  loadWhatsAppChannelRuntime,
  whatsappSetupWizardProxy,
} from "./shared.js";

export const whatsappSetupPlugin: ChannelPlugin<ResolvedWhatsAppAccount> = {
  ...createWhatsAppPluginBase({
    groups: {
      resolveRequireMention: resolveWhatsAppGroupRequireMention,
      resolveToolPolicy: resolveWhatsAppGroupToolPolicy,
      resolveGroupIntroHint: resolveWhatsAppGroupIntroHint,
    },
    setupWizard: whatsappSetupWizardProxy,
    setup: whatsappSetupAdapter,
    isConfigured: async (account) => await webAuthExists(account.authDir),
  }),
  gateway: {
    // Fresh-setup flows use the setup registry before the runtime plugin is loaded.
    loginWithQrStart: async ({ accountId, force, timeoutMs, verbose }) =>
      await (
        await loadWhatsAppChannelRuntime()
      ).startWebLoginWithQr({
        accountId,
        force,
        timeoutMs,
        verbose,
      }),
    loginWithQrWait: async ({ accountId, timeoutMs }) =>
      await (await loadWhatsAppChannelRuntime()).waitForWebLogin({ accountId, timeoutMs }),
  },
};
