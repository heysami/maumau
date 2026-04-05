import { afterEach, describe, expect, it } from "vitest";
import { i18n } from "../i18n/index.ts";
import { de } from "../i18n/locales/de.ts";
import { es } from "../i18n/locales/es.ts";
import { id } from "../i18n/locales/id.ts";
import { pt_BR } from "../i18n/locales/pt-BR.ts";
import { zh_CN } from "../i18n/locales/zh-CN.ts";
import { zh_TW } from "../i18n/locales/zh-TW.ts";
import {
  TAB_GROUPS,
  dashboardPageForTab,
  iconForTab,
  inferBasePathFromPathname,
  isDashboardTab,
  normalizeBasePath,
  normalizePath,
  pathForTab,
  subtitleForTab,
  tabForDashboardPage,
  tabFromPath,
  titleForTab,
  type Tab,
} from "./navigation.ts";

/** All valid tab identifiers derived from TAB_GROUPS */
const ALL_TABS: Tab[] = TAB_GROUPS.flatMap((group) => group.tabs) as Tab[];

afterEach(async () => {
  await i18n.setLocale("en");
});

describe("iconForTab", () => {
  it("returns a non-empty string for every tab", () => {
    for (const tab of ALL_TABS) {
      const icon = iconForTab(tab);
      expect(icon).toBeTruthy();
      expect(typeof icon).toBe("string");
      expect(icon.length).toBeGreaterThan(0);
    }
  });

  it("returns stable icons for known tabs", () => {
    expect(iconForTab("chat")).toBe("messageSquare");
    expect(iconForTab("overview")).toBe("barChart");
    expect(iconForTab("channels")).toBe("link");
    expect(iconForTab("instances")).toBe("radio");
    expect(iconForTab("teams")).toBe("folder");
    expect(iconForTab("sessions")).toBe("fileText");
    expect(iconForTab("dashboardToday")).toBe("sun");
    expect(iconForTab("dashboardMauOffice")).toBe("briefcase");
    expect(iconForTab("dashboardTasks")).toBe("checkSquare");
    expect(iconForTab("dashboardCalendar")).toBe("calendarDays");
    expect(iconForTab("dashboardRoutines")).toBe("repeat2");
    expect(iconForTab("dashboardTeams")).toBe("users");
    expect(iconForTab("dashboardMemories")).toBe("brain");
    expect(iconForTab("cron")).toBe("loader");
    expect(iconForTab("skills")).toBe("zap");
    expect(iconForTab("nodes")).toBe("monitor");
    expect(iconForTab("config")).toBe("settings");
    expect(iconForTab("debug")).toBe("bug");
    expect(iconForTab("logs")).toBe("scrollText");
  });

  it("returns a fallback icon for unknown tab", () => {
    // TypeScript won't allow this normally, but runtime could receive unexpected values
    const unknownTab = "unknown" as Tab;
    expect(iconForTab(unknownTab)).toBe("folder");
  });
});

describe("titleForTab", () => {
  it("returns a non-empty string for every tab", () => {
    for (const tab of ALL_TABS) {
      const title = titleForTab(tab);
      expect(title).toBeTruthy();
      expect(typeof title).toBe("string");
    }
  });

  it("returns expected titles", () => {
    expect(titleForTab("chat")).toBe("Chat");
    expect(titleForTab("overview")).toBe("Overview");
    expect(titleForTab("teams")).toBe("Teams");
    expect(titleForTab("dashboardToday")).toBe("Today");
    expect(titleForTab("dashboardMauOffice")).toBe("MauOffice");
    expect(titleForTab("cron")).toBe("Cron Jobs");
  });

  it("localizes standalone dashboard titles with the selected locale", async () => {
    await i18n.setLocale("id");
    expect(titleForTab("dashboardToday")).toBe("Hari Ini");
    expect(titleForTab("dashboardTasks")).toBe("Tugas");
    expect(titleForTab("dashboardCalendar")).toBe("Kalender");
  });
});

describe("subtitleForTab", () => {
  it("returns a string for every tab", () => {
    for (const tab of ALL_TABS) {
      const subtitle = subtitleForTab(tab);
      expect(typeof subtitle).toBe("string");
    }
  });

  it("returns descriptive subtitles", () => {
    expect(subtitleForTab("chat")).toContain("quick interventions");
    expect(subtitleForTab("config")).toContain("maumau.json");
    expect(subtitleForTab("teams")).toContain("generated workflows");
    expect(subtitleForTab("dashboardMauOffice")).toContain("pixel office");
    expect(subtitleForTab("dashboardToday")).toContain("scheduled");
  });

  it("localizes standalone dashboard subtitles with the selected locale", async () => {
    await i18n.setLocale("id");
    expect(subtitleForTab("dashboardToday").toLowerCase()).toContain("terjadwal");
    expect(subtitleForTab("dashboardTeams").toLowerCase()).toContain("bagan organisasi");
  });
});

describe("dashboard locale inventory", () => {
  it("ships dashboard labels for supported lazy locales", () => {
    const locales = [id, de, es, pt_BR, zh_CN, zh_TW];
    for (const locale of locales) {
      expect((locale.tabs as { dashboardToday?: string }).dashboardToday).toBeTruthy();
      expect((locale.subtitles as { dashboardToday?: string }).dashboardToday).toBeTruthy();
      expect((((locale.dashboard as { shell?: { eyebrow?: string } }).shell) ?? {}).eyebrow).toBeTruthy();
      expect((((locale.dashboard as { mauOffice?: { subtitle?: string } }).mauOffice) ?? {}).subtitle)
        .toBeTruthy();
    }
  });
});

describe("normalizeBasePath", () => {
  it("returns empty string for falsy input", () => {
    expect(normalizeBasePath("")).toBe("");
  });

  it("adds leading slash if missing", () => {
    expect(normalizeBasePath("ui")).toBe("/ui");
  });

  it("removes trailing slash", () => {
    expect(normalizeBasePath("/ui/")).toBe("/ui");
  });

  it("returns empty string for root path", () => {
    expect(normalizeBasePath("/")).toBe("");
  });

  it("handles nested paths", () => {
    expect(normalizeBasePath("/apps/maumau")).toBe("/apps/maumau");
  });
});

describe("normalizePath", () => {
  it("returns / for falsy input", () => {
    expect(normalizePath("")).toBe("/");
  });

  it("adds leading slash if missing", () => {
    expect(normalizePath("chat")).toBe("/chat");
  });

  it("removes trailing slash except for root", () => {
    expect(normalizePath("/chat/")).toBe("/chat");
    expect(normalizePath("/")).toBe("/");
  });
});

describe("pathForTab", () => {
  it("returns correct path without base", () => {
    expect(pathForTab("chat")).toBe("/chat");
    expect(pathForTab("overview")).toBe("/overview");
    expect(pathForTab("teams")).toBe("/teams");
    expect(pathForTab("dashboardToday")).toBe("/dashboard/today");
    expect(pathForTab("dashboardMauOffice")).toBe("/dashboard/mau-office");
  });

  it("prepends base path", () => {
    expect(pathForTab("chat", "/ui")).toBe("/ui/chat");
    expect(pathForTab("sessions", "/apps/maumau")).toBe("/apps/maumau/sessions");
  });
});

describe("tabFromPath", () => {
  it("returns tab for valid path", () => {
    expect(tabFromPath("/chat")).toBe("chat");
    expect(tabFromPath("/overview")).toBe("overview");
    expect(tabFromPath("/teams")).toBe("teams");
    expect(tabFromPath("/sessions")).toBe("sessions");
    expect(tabFromPath("/dashboard/today")).toBe("dashboardToday");
    expect(tabFromPath("/dashboard/mau-office")).toBe("dashboardMauOffice");
  });

  it("keeps legacy MauOffice routes compatible", () => {
    expect(tabFromPath("/mau-office")).toBe("dashboardMauOffice");
  });

  it("returns chat for root path", () => {
    expect(tabFromPath("/")).toBe("chat");
  });

  it("handles base paths", () => {
    expect(tabFromPath("/ui/chat", "/ui")).toBe("chat");
    expect(tabFromPath("/apps/maumau/sessions", "/apps/maumau")).toBe("sessions");
  });

  it("returns null for unknown path", () => {
    expect(tabFromPath("/unknown")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(tabFromPath("/CHAT")).toBe("chat");
    expect(tabFromPath("/Overview")).toBe("overview");
  });
});

describe("inferBasePathFromPathname", () => {
  it("returns empty string for root", () => {
    expect(inferBasePathFromPathname("/")).toBe("");
  });

  it("returns empty string for direct tab path", () => {
    expect(inferBasePathFromPathname("/chat")).toBe("");
    expect(inferBasePathFromPathname("/overview")).toBe("");
    expect(inferBasePathFromPathname("/teams")).toBe("");
    expect(inferBasePathFromPathname("/dashboard/today")).toBe("");
  });

  it("infers base path from nested paths", () => {
    expect(inferBasePathFromPathname("/ui/chat")).toBe("/ui");
    expect(inferBasePathFromPathname("/apps/maumau/sessions")).toBe("/apps/maumau");
  });

  it("handles index.html suffix", () => {
    expect(inferBasePathFromPathname("/index.html")).toBe("");
    expect(inferBasePathFromPathname("/ui/index.html")).toBe("/ui");
  });
});

describe("dashboard route helpers", () => {
  it("maps dashboard pages to tabs", () => {
    expect(tabForDashboardPage("today")).toBe("dashboardToday");
    expect(tabForDashboardPage("mau-office")).toBe("dashboardMauOffice");
    expect(tabForDashboardPage("memories")).toBe("dashboardMemories");
  });

  it("maps dashboard tabs back to pages", () => {
    expect(dashboardPageForTab("dashboardToday")).toBe("today");
    expect(dashboardPageForTab("dashboardWorkshop")).toBe("workshop");
    expect(dashboardPageForTab("chat")).toBeNull();
  });

  it("identifies dashboard tabs", () => {
    expect(isDashboardTab("dashboardTasks")).toBe(true);
    expect(isDashboardTab("dashboardTeams")).toBe(true);
    expect(isDashboardTab("chat")).toBe(false);
  });
});

describe("TAB_GROUPS", () => {
  it("contains all expected groups", () => {
    const labels = TAB_GROUPS.map((g) => g.label);
    expect(labels).toContain("chat");
    expect(labels).toContain("control");
    expect(labels).toContain("agent");
    expect(labels).toContain("settings");
  });

  it("all tabs are unique", () => {
    const allTabs = TAB_GROUPS.flatMap((g) => g.tabs);
    const uniqueTabs = new Set(allTabs);
    expect(uniqueTabs.size).toBe(allTabs.length);
  });
});
