import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { MaumauConfig } from "../config/config.js";
import type { PluginWebSearchProviderEntry } from "../plugins/types.js";

const mocks = vi.hoisted(() => ({
  resolvePluginWebSearchProviders: vi.fn<
    (params?: { config?: MaumauConfig }) => PluginWebSearchProviderEntry[]
  >(() => []),
  listBundledWebSearchProviders: vi.fn<() => PluginWebSearchProviderEntry[]>(() => []),
  resolveBundledWebSearchPluginId: vi.fn<(providerId?: string) => string | undefined>(
    () => undefined,
  ),
}));

vi.mock("../plugins/web-search-providers.runtime.js", () => ({
  resolvePluginWebSearchProviders: mocks.resolvePluginWebSearchProviders,
}));

vi.mock("../plugins/bundled-web-search.js", () => ({
  listBundledWebSearchProviders: mocks.listBundledWebSearchProviders,
  resolveBundledWebSearchPluginId: mocks.resolveBundledWebSearchPluginId,
}));

function createCustomProviderEntry(): PluginWebSearchProviderEntry {
  return {
    id: "custom-search" as never,
    pluginId: "custom-plugin",
    label: "Custom Search",
    hint: "Custom provider",
    envVars: ["CUSTOM_SEARCH_API_KEY"],
    placeholder: "custom-...",
    signupUrl: "https://example.com/custom",
    credentialPath: "plugins.entries.custom-plugin.config.webSearch.apiKey",
    getCredentialValue: () => undefined,
    setCredentialValue: () => {},
    getConfiguredCredentialValue: (config) =>
      (
        config?.plugins?.entries?.["custom-plugin"]?.config as
          | { webSearch?: { apiKey?: unknown } }
          | undefined
      )?.webSearch?.apiKey,
    setConfiguredCredentialValue: (configTarget, value) => {
      const entries = ((configTarget.plugins ??= {}).entries ??= {});
      const pluginEntry = (entries["custom-plugin"] ??= {});
      const pluginConfig = ((pluginEntry as Record<string, unknown>).config ??= {}) as Record<
        string,
        unknown
      >;
      const webSearch = (pluginConfig.webSearch ??= {}) as Record<string, unknown>;
      webSearch.apiKey = value;
    },
    createTool: () => null,
  };
}

function createBundledFirecrawlEntry(): PluginWebSearchProviderEntry {
  return {
    id: "firecrawl",
    pluginId: "firecrawl",
    label: "Firecrawl Search",
    hint: "Structured results",
    envVars: ["FIRECRAWL_API_KEY"],
    placeholder: "fc-...",
    signupUrl: "https://example.com/firecrawl",
    credentialPath: "plugins.entries.firecrawl.config.webSearch.apiKey",
    getCredentialValue: () => undefined,
    setCredentialValue: () => {},
    getConfiguredCredentialValue: (config) =>
      (
        config?.plugins?.entries?.firecrawl?.config as
          | { webSearch?: { apiKey?: unknown } }
          | undefined
      )?.webSearch?.apiKey,
    setConfiguredCredentialValue: () => {},
    createTool: () => null,
  };
}

function createBundledDuckDuckGoEntry(): PluginWebSearchProviderEntry {
  return {
    id: "duckduckgo",
    pluginId: "duckduckgo",
    label: "DuckDuckGo Search (experimental)",
    hint: "Free fallback",
    requiresCredential: false,
    envVars: [],
    placeholder: "(no key needed)",
    signupUrl: "https://duckduckgo.com/",
    credentialPath: "",
    getCredentialValue: () => "duckduckgo-no-key-needed",
    setCredentialValue: () => {},
    createTool: () => null,
  };
}

function createSearchEntry(
  id: string,
  label: string,
  hint: string,
  signupUrl: string,
): PluginWebSearchProviderEntry {
  return {
    id: id as never,
    pluginId: id,
    label,
    hint,
    envVars: [`${id.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`],
    placeholder: `${id}-key`,
    signupUrl,
    credentialPath: `plugins.entries.${id}.config.webSearch.apiKey`,
    getCredentialValue: () => undefined,
    setCredentialValue: () => {},
    createTool: () => null,
  };
}

describe("onboard-search provider resolution", () => {
  let mod: typeof import("./onboard-search.js");

  beforeAll(async () => {
    vi.resetModules();
    mod = await import("./onboard-search.js");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses config-aware non-bundled provider hooks when resolving existing keys", async () => {
    const customEntry = createCustomProviderEntry();
    mocks.resolvePluginWebSearchProviders.mockImplementation((params) =>
      params?.config ? [customEntry] : [],
    );

    const cfg: MaumauConfig = {
      tools: {
        web: {
          search: {
            provider: "custom-search" as never,
          },
        },
      },
      plugins: {
        entries: {
          "custom-plugin": {
            config: {
              webSearch: {
                apiKey: "custom-key",
              },
            },
          },
        },
      },
    };

    expect(mod.hasExistingKey(cfg, "custom-search" as never)).toBe(true);
    expect(mod.resolveExistingKey(cfg, "custom-search" as never)).toBe("custom-key");

    const updated = mod.applySearchKey(cfg, "custom-search" as never, "next-key");
    expect(
      (
        updated.plugins?.entries?.["custom-plugin"]?.config as
          | { webSearch?: { apiKey?: unknown } }
          | undefined
      )?.webSearch?.apiKey,
    ).toBe("next-key");
  });

  it("uses config-aware non-bundled providers when building secret refs", async () => {
    const customEntry = createCustomProviderEntry();
    mocks.resolvePluginWebSearchProviders.mockImplementation((params) =>
      params?.config ? [customEntry] : [],
    );

    const cfg: MaumauConfig = {
      plugins: {
        installs: {
          "custom-plugin": {
            installPath: "/tmp/custom-plugin",
            source: "path",
          },
        },
      },
    };
    const notes: Array<{ title?: string; message: string }> = [];
    const prompter = {
      intro: vi.fn(async () => {}),
      outro: vi.fn(async () => {}),
      note: vi.fn(async (message: string, title?: string) => {
        notes.push({ title, message });
      }),
      select: vi.fn(async () => "custom-search"),
      multiselect: vi.fn(async () => []),
      text: vi.fn(async () => ""),
      confirm: vi.fn(async () => true),
      progress: vi.fn(() => ({ update: vi.fn(), stop: vi.fn() })),
    };

    const result = await mod.setupSearch(cfg, {} as never, prompter as never, {
      secretInputMode: "ref",
    });

    expect(result.tools?.web?.search?.provider).toBe("custom-search");
    expect(result.tools?.web?.search?.enabled).toBe(true);
    expect(
      (
        result.plugins?.entries?.["custom-plugin"]?.config as
          | { webSearch?: { apiKey?: unknown } }
          | undefined
      )?.webSearch?.apiKey,
    ).toEqual({
      source: "env",
      provider: "default",
      id: "CUSTOM_SEARCH_API_KEY",
    });
    expect(notes.some((note) => note.message.includes("CUSTOM_SEARCH_API_KEY"))).toBe(true);
  });

  it("does not treat hard-disabled bundled providers as selectable credentials", async () => {
    const firecrawlEntry = createBundledFirecrawlEntry();
    mocks.resolvePluginWebSearchProviders.mockReturnValue([]);
    mocks.listBundledWebSearchProviders.mockReturnValue([firecrawlEntry]);
    mocks.resolveBundledWebSearchPluginId.mockReturnValue("firecrawl");

    const cfg: MaumauConfig = {
      tools: {
        web: {
          search: {
            provider: "firecrawl",
          },
        },
      },
      plugins: {
        enabled: false,
        entries: {
          firecrawl: {
            config: {
              webSearch: {
                apiKey: "fc-disabled-key",
              },
            },
          },
        },
      },
    };

    expect(mod.hasExistingKey(cfg, "firecrawl")).toBe(false);
    expect(mod.resolveExistingKey(cfg, "firecrawl")).toBeUndefined();
    expect(mod.applySearchProviderSelection(cfg, "firecrawl")).toBe(cfg);
  });

  it("defaults to a keyless provider when no search credentials exist", async () => {
    const duckduckgoEntry = createBundledDuckDuckGoEntry();
    mocks.resolvePluginWebSearchProviders.mockImplementation((params) =>
      params?.config ? [duckduckgoEntry] : [duckduckgoEntry],
    );

    const notes: string[] = [];
    const prompter = {
      intro: vi.fn(async () => {}),
      outro: vi.fn(async () => {}),
      note: vi.fn(async (message: string) => {
        notes.push(message);
      }),
      select: vi.fn(async () => "duckduckgo"),
      multiselect: vi.fn(async () => []),
      text: vi.fn(async () => {
        throw new Error("text prompt should not run for keyless providers");
      }),
      confirm: vi.fn(async () => true),
      progress: vi.fn(() => ({ update: vi.fn(), stop: vi.fn() })),
    };

    const result = await mod.setupSearch({} as MaumauConfig, {} as never, prompter as never);

    expect(result.tools?.web?.search?.provider).toBe("duckduckgo");
    expect(result.plugins?.entries?.duckduckgo?.enabled).toBe(true);
    expect(notes.some((message) => message.includes("works without an API key"))).toBe(true);
  });

  it("orders embedded search providers by the curated onboarding ranking", async () => {
    const providers = [
      createSearchEntry("tavily", "Tavily", "LLM search", "https://tavily.com/"),
      createBundledDuckDuckGoEntry(),
      createSearchEntry("brave", "Brave Search", "Search API", "https://brave.com/search/api/"),
      createSearchEntry("moonshot", "Moonshot Search", "Kimi web search", "https://platform.moonshot.cn/"),
      createSearchEntry("exa", "Exa", "Semantic search", "https://exa.ai/"),
    ];
    mocks.resolvePluginWebSearchProviders.mockImplementation((params) =>
      params?.config ? providers : providers,
    );
    mocks.listBundledWebSearchProviders.mockReturnValue([]);

    const selectCalls: Array<Array<{ value: string; label: string; hint?: string }>> = [];
    const notes: string[] = [];
    const prompter = {
      intro: vi.fn(async () => {}),
      outro: vi.fn(async () => {}),
      note: vi.fn(async (message: string) => {
        notes.push(message);
      }),
      select: vi.fn(async ({ options }) => {
        selectCalls.push(options);
        return "__skip__";
      }),
      multiselect: vi.fn(async () => []),
      text: vi.fn(async () => ""),
      confirm: vi.fn(async () => true),
      progress: vi.fn(() => ({ update: vi.fn(), stop: vi.fn() })),
    };

    await mod.setupSearch({} as MaumauConfig, {} as never, prompter as never, {
      embedded: true,
    });

    expect(selectCalls[0]?.slice(0, 5).map((option) => option.value)).toEqual([
      "brave",
      "duckduckgo",
      "exa",
      "tavily",
      "moonshot",
    ]);
    expect(selectCalls[0]?.find((option) => option.value === "duckduckgo")?.hint).toBe(
      "No signup, no key, experimental",
    );
    expect(notes[0]).toContain("Choose a provider");
  });

  it("shows the embedded search guidance note before continuing", async () => {
    const duckduckgoEntry = createBundledDuckDuckGoEntry();
    mocks.resolvePluginWebSearchProviders.mockImplementation((params) =>
      params?.config ? [duckduckgoEntry] : [duckduckgoEntry],
    );

    const notes: Array<{ title?: string; message: string }> = [];
    const prompter = {
      intro: vi.fn(async () => {}),
      outro: vi.fn(async () => {}),
      note: vi.fn(async (message: string, title?: string) => {
        notes.push({ title, message });
      }),
      select: vi.fn(async () => "duckduckgo"),
      multiselect: vi.fn(async () => []),
      text: vi.fn(async () => {
        throw new Error("text prompt should not run for keyless providers");
      }),
      confirm: vi.fn(async () => true),
      progress: vi.fn(() => ({ update: vi.fn(), stop: vi.fn() })),
    };

    await mod.setupSearch({} as MaumauConfig, {} as never, prompter as never, {
      embedded: true,
    });

    expect(notes.some((note) => note.title === "Before you choose DuckDuckGo Search (experimental)")).toBe(true);
    expect(notes.some((note) => note.message.includes("What you need: Nothing extra. No signup, no key."))).toBe(true);
    expect(notes.some((note) => note.message.includes("Quality / caveat: Experimental key-free fallback."))).toBe(true);
  });
});
