import { describe, expect, it } from "vitest";
import {
  getLocalizedUserChannelQuickSetupEntry,
  getLocalizedUserChannelQuickSetupSettingsNote,
  resolveUserChannelQuickSetupLocale,
} from "./user-channel-quick-setup.ts";

describe("user channel quick setup localization", () => {
  it("resolves Indonesian shared quick setup content", () => {
    const entry = getLocalizedUserChannelQuickSetupEntry("telegram", "id");

    expect(entry.quickSetup.title).toBe("Agen Telegram");
    expect(entry.fields[0]?.label).toBe("Token bot Telegram");
    expect(getLocalizedUserChannelQuickSetupSettingsNote("id")).toContain(
      "Channel lain dan pengaturan channel lanjutan",
    );
  });

  it("falls back to English for unknown or default locales", () => {
    const entry = getLocalizedUserChannelQuickSetupEntry("telegram", "en-US");

    expect(resolveUserChannelQuickSetupLocale("en-US")).toBe("en");
    expect(entry.quickSetup.title).toBe("Telegram Agent");
    expect(getLocalizedUserChannelQuickSetupSettingsNote("fr-FR")).toContain(
      "More channels and advanced channel settings",
    );
  });
});
