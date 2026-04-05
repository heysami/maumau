/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONTROL_UI_BOOTSTRAP_CONFIG_PATH } from "../../../../src/gateway/control-ui-contract.js";
import { loadSettings } from "../storage.ts";
import { loadControlUiBootstrapConfig } from "./control-ui-bootstrap.ts";

describe("loadControlUiBootstrapConfig", () => {
  function createStorageMock(): Storage {
    const store = new Map<string, string>();
    return {
      get length() {
        return store.size;
      },
      clear() {
        store.clear();
      },
      getItem(key: string) {
        return store.get(key) ?? null;
      },
      key(index: number) {
        return Array.from(store.keys())[index] ?? null;
      },
      removeItem(key: string) {
        store.delete(key);
      },
      setItem(key: string, value: string) {
        store.set(key, String(value));
      },
    };
  }

  function saveTestSettings(locale?: string) {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const persisted = {
      gatewayUrl: `${proto}://${window.location.host}`,
      sessionKey: "main",
      lastActiveSessionKey: "main",
      theme: "claw",
      themeMode: "system",
      chatFocusMode: false,
      chatShowThinking: true,
      chatShowToolCalls: true,
      splitRatio: 0.6,
      navCollapsed: false,
      navWidth: 220,
      navGroupsCollapsed: {},
      borderRadius: 50,
      ...(locale ? { locale } : {}),
    };
    localStorage.setItem("maumau.control.settings.v1:default", JSON.stringify(persisted));
    localStorage.setItem("maumau.control.settings.v1", JSON.stringify(persisted));
  }

  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorageMock());
  });

  afterEach(() => {
    localStorage.clear();
    window.history.replaceState({}, "", "/");
    vi.unstubAllGlobals();
  });

  it("loads assistant identity from the bootstrap endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        basePath: "/maumau",
        assistantName: "Ops",
        assistantAvatar: "O",
        assistantAgentId: "main",
        serverVersion: "2026.3.7",
        secureDashboardUrl: "https://maumau.tailnet.ts.net/maumau/dashboard/today",
      }),
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const state = {
      basePath: "/maumau",
      assistantName: "Assistant",
      assistantAvatar: null,
      assistantAgentId: null,
      serverVersion: null,
      secureDashboardUrl: null,
    };

    await loadControlUiBootstrapConfig(state);

    expect(fetchMock).toHaveBeenCalledWith(
      `/maumau${CONTROL_UI_BOOTSTRAP_CONFIG_PATH}`,
      expect.objectContaining({ method: "GET" }),
    );
    expect(state.assistantName).toBe("Ops");
    expect(state.assistantAvatar).toBe("O");
    expect(state.assistantAgentId).toBe("main");
    expect(state.serverVersion).toBe("2026.3.7");
    expect(state.secureDashboardUrl).toBe("https://maumau.tailnet.ts.net/maumau/dashboard/today");

    vi.unstubAllGlobals();
  });

  it("ignores failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const state = {
      basePath: "",
      assistantName: "Assistant",
      assistantAvatar: null,
      assistantAgentId: null,
      serverVersion: null,
      secureDashboardUrl: null,
    };

    await loadControlUiBootstrapConfig(state);

    expect(fetchMock).toHaveBeenCalledWith(
      CONTROL_UI_BOOTSTRAP_CONFIG_PATH,
      expect.objectContaining({ method: "GET" }),
    );
    expect(state.assistantName).toBe("Assistant");

    vi.unstubAllGlobals();
  });

  it("normalizes trailing slash basePath for bootstrap fetch path", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const state = {
      basePath: "/maumau/",
      assistantName: "Assistant",
      assistantAvatar: null,
      assistantAgentId: null,
      serverVersion: null,
      secureDashboardUrl: null,
    };

    await loadControlUiBootstrapConfig(state);

    expect(fetchMock).toHaveBeenCalledWith(
      `/maumau${CONTROL_UI_BOOTSTRAP_CONFIG_PATH}`,
      expect.objectContaining({ method: "GET" }),
    );

    vi.unstubAllGlobals();
  });

  it("uses a supported locale from the dashboard URL query when no locale is saved", () => {
    window.history.replaceState({}, "", "/dashboard/today?locale=id");
    saveTestSettings();

    expect(loadSettings().locale).toBe("id");
  });

  it("prefers an explicit dashboard URL locale over older saved settings", () => {
    window.history.replaceState({}, "", "/dashboard/today?locale=en");
    saveTestSettings("id");

    expect(loadSettings().locale).toBe("en");
  });

  it("ignores unsupported locale query overrides", () => {
    window.history.replaceState({}, "", "/dashboard/today?locale=fr");
    expect(loadSettings().locale).toBeUndefined();
  });
});
