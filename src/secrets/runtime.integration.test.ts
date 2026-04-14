import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureAuthProfileStore, type AuthProfileStore } from "../agents/auth-profiles.js";
import { upsertAuthProfile } from "../agents/auth-profiles.js";
import {
  clearConfigCache,
  loadConfig,
  type MaumauConfig,
  writeConfigFile,
} from "../config/config.js";
import { withTempHome } from "../config/home-env.test-harness.js";
import { buildApiKeyCredential } from "../plugins/provider-auth-helpers.js";
import { captureEnv, withEnvAsync } from "../test-utils/env.js";
import {
  activateSecretsRuntimeSnapshot,
  clearSecretsRuntimeSnapshot,
  getActiveRuntimeWebToolsMetadata,
  getActiveSecretsRuntimeSnapshot,
  prepareSecretsRuntimeSnapshot,
} from "./runtime.js";

vi.unmock("../version.js");

const OPENAI_ENV_KEY_REF = { source: "env", provider: "default", id: "OPENAI_API_KEY" } as const;
const allowInsecureTempSecretFile = process.platform === "win32";

function asConfig(value: unknown): MaumauConfig {
  return value as MaumauConfig;
}

function loadAuthStoreWithProfiles(profiles: AuthProfileStore["profiles"]): AuthProfileStore {
  return {
    version: 1,
    profiles,
  };
}

describe("secrets runtime snapshot integration", () => {
  let envSnapshot: ReturnType<typeof captureEnv>;

  beforeEach(() => {
    envSnapshot = captureEnv([
      "GEMINI_API_KEY",
      "GOOGLE_API_KEY",
      "MAUMAU_BUNDLED_PLUGINS_DIR",
      "MAUMAU_DISABLE_PLUGIN_DISCOVERY_CACHE",
      "MAUMAU_VERSION",
      "WEB_SEARCH_GEMINI_API_KEY",
    ]);
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.MAUMAU_BUNDLED_PLUGINS_DIR;
    process.env.MAUMAU_DISABLE_PLUGIN_DISCOVERY_CACHE = "1";
    delete process.env.MAUMAU_VERSION;
    delete process.env.WEB_SEARCH_GEMINI_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    envSnapshot.restore();
    clearSecretsRuntimeSnapshot();
    clearConfigCache();
  });

  it("activates runtime snapshots for loadConfig and ensureAuthProfileStore", async () => {
    await withEnvAsync(
      {
        MAUMAU_BUNDLED_PLUGINS_DIR: undefined,
        MAUMAU_DISABLE_PLUGIN_DISCOVERY_CACHE: "1",
        MAUMAU_VERSION: undefined,
      },
      async () => {
        const prepared = await prepareSecretsRuntimeSnapshot({
          config: asConfig({
            models: {
              providers: {
                openai: {
                  baseUrl: "https://api.openai.com/v1",
                  apiKey: { source: "env", provider: "default", id: "OPENAI_API_KEY" },
                  models: [],
                },
              },
            },
          }),
          env: { OPENAI_API_KEY: "sk-runtime" },
          agentDirs: ["/tmp/maumau-agent-main"],
          loadAuthStore: () =>
            loadAuthStoreWithProfiles({
              "openai:default": {
                type: "api_key",
                provider: "openai",
                keyRef: OPENAI_ENV_KEY_REF,
              },
            }),
        });

        activateSecretsRuntimeSnapshot(prepared);

        expect(loadConfig().models?.providers?.openai?.apiKey).toBe("sk-runtime");
        expect(
          ensureAuthProfileStore("/tmp/maumau-agent-main").profiles["openai:default"],
        ).toMatchObject({
          type: "api_key",
          key: "sk-runtime",
        });
      },
    );
  });

  it("keeps active secrets runtime snapshots resolved after config writes", async () => {
    if (os.platform() === "win32") {
      return;
    }
    await withTempHome("maumau-secrets-runtime-write-", async (home) => {
      const configDir = path.join(home, ".maumau");
      const secretFile = path.join(configDir, "secrets.json");
      const agentDir = path.join(configDir, "agents", "main", "agent");
      const authStorePath = path.join(agentDir, "auth-profiles.json");
      await fs.mkdir(agentDir, { recursive: true });
      await fs.chmod(configDir, 0o700).catch(() => {});
      await fs.writeFile(
        secretFile,
        `${JSON.stringify({ providers: { openai: { apiKey: "sk-file-runtime" } } }, null, 2)}\n`,
        { encoding: "utf8", mode: 0o600 },
      );
      await fs.writeFile(
        authStorePath,
        `${JSON.stringify(
          {
            version: 1,
            profiles: {
              "openai:default": {
                type: "api_key",
                provider: "openai",
                keyRef: { source: "file", provider: "default", id: "/providers/openai/apiKey" },
              },
            },
          },
          null,
          2,
        )}\n`,
        { encoding: "utf8", mode: 0o600 },
      );

      const prepared = await prepareSecretsRuntimeSnapshot({
        config: asConfig({
          secrets: {
            providers: {
              default: {
                source: "file",
                path: secretFile,
                mode: "json",
                ...(allowInsecureTempSecretFile ? { allowInsecurePath: true } : {}),
              },
            },
          },
          models: {
            providers: {
              openai: {
                baseUrl: "https://api.openai.com/v1",
                apiKey: { source: "file", provider: "default", id: "/providers/openai/apiKey" },
                models: [],
              },
            },
          },
        }),
        agentDirs: [agentDir],
      });

      activateSecretsRuntimeSnapshot(prepared);

      expect(loadConfig().models?.providers?.openai?.apiKey).toBe("sk-file-runtime");
      expect(ensureAuthProfileStore(agentDir).profiles["openai:default"]).toMatchObject({
        type: "api_key",
        key: "sk-file-runtime",
      });

      await writeConfigFile({
        ...loadConfig(),
        gateway: { auth: { mode: "token" } },
      });

      expect(loadConfig().gateway?.auth).toEqual({ mode: "token" });
      expect(loadConfig().models?.providers?.openai?.apiKey).toBe("sk-file-runtime");
      expect(ensureAuthProfileStore(agentDir).profiles["openai:default"]).toMatchObject({
        type: "api_key",
        key: "sk-file-runtime",
      });
    });
  });

  it("refreshes env-backed auth refs from the current process env after provider setup writes", async () => {
    await withTempHome("maumau-secrets-runtime-provider-env-refresh-", async (home) => {
      const agentDir = path.join(home, ".maumau", "agents", "main", "agent");
      await fs.mkdir(agentDir, { recursive: true });

      const prepared = await prepareSecretsRuntimeSnapshot({
        config: asConfig({}),
        env: {},
      });

      activateSecretsRuntimeSnapshot(prepared);
      expect(ensureAuthProfileStore(agentDir).profiles["google:default"]).toBeUndefined();

      upsertAuthProfile({
        profileId: "google:default",
        credential: buildApiKeyCredential("google", "sk-gemini-runtime-refresh"),
        agentDir,
      });

      await writeConfigFile({
        auth: {
          profiles: {
            "google:default": {
              provider: "google",
              mode: "api_key",
            },
          },
        },
      });

      expect(ensureAuthProfileStore(agentDir).profiles["google:default"]).toMatchObject({
        type: "api_key",
        provider: "google",
        key: "sk-gemini-runtime-refresh",
        keyRef: { source: "env", provider: "default", id: "GEMINI_API_KEY" },
      });
      expect(loadConfig().auth?.profiles?.["google:default"]).toEqual({
        provider: "google",
        mode: "api_key",
      });
    });
  });

  it("keeps last-known-good runtime snapshot active when refresh fails after a write", async () => {
    if (os.platform() === "win32") {
      return;
    }
    await withTempHome("maumau-secrets-runtime-refresh-fail-", async (home) => {
      const configDir = path.join(home, ".maumau");
      const secretFile = path.join(configDir, "secrets.json");
      const agentDir = path.join(configDir, "agents", "main", "agent");
      const authStorePath = path.join(agentDir, "auth-profiles.json");
      await fs.mkdir(agentDir, { recursive: true });
      await fs.chmod(configDir, 0o700).catch(() => {});
      await fs.writeFile(
        secretFile,
        `${JSON.stringify({ providers: { openai: { apiKey: "sk-file-runtime" } } }, null, 2)}\n`,
        { encoding: "utf8", mode: 0o600 },
      );
      await fs.writeFile(
        authStorePath,
        `${JSON.stringify(
          {
            version: 1,
            profiles: {
              "openai:default": {
                type: "api_key",
                provider: "openai",
                keyRef: { source: "file", provider: "default", id: "/providers/openai/apiKey" },
              },
            },
          },
          null,
          2,
        )}\n`,
        { encoding: "utf8", mode: 0o600 },
      );

      let loadAuthStoreCalls = 0;
      const loadAuthStore = () => {
        loadAuthStoreCalls += 1;
        if (loadAuthStoreCalls > 1) {
          throw new Error("simulated secrets runtime refresh failure");
        }
        return loadAuthStoreWithProfiles({
          "openai:default": {
            type: "api_key",
            provider: "openai",
            keyRef: { source: "file", provider: "default", id: "/providers/openai/apiKey" },
          },
        });
      };

      const prepared = await prepareSecretsRuntimeSnapshot({
        config: asConfig({
          secrets: {
            providers: {
              default: {
                source: "file",
                path: secretFile,
                mode: "json",
                ...(allowInsecureTempSecretFile ? { allowInsecurePath: true } : {}),
              },
            },
          },
          models: {
            providers: {
              openai: {
                baseUrl: "https://api.openai.com/v1",
                apiKey: { source: "file", provider: "default", id: "/providers/openai/apiKey" },
                models: [],
              },
            },
          },
        }),
        agentDirs: [agentDir],
        loadAuthStore,
      });

      activateSecretsRuntimeSnapshot(prepared);

      await expect(
        writeConfigFile({
          ...loadConfig(),
          gateway: { auth: { mode: "token" } },
        }),
      ).rejects.toThrow(
        /runtime snapshot refresh failed: simulated secrets runtime refresh failure/i,
      );

      const activeAfterFailure = getActiveSecretsRuntimeSnapshot();
      expect(activeAfterFailure).not.toBeNull();
      expect(loadConfig().gateway?.auth).toBeUndefined();
      expect(loadConfig().models?.providers?.openai?.apiKey).toBe("sk-file-runtime");
      expect(activeAfterFailure?.sourceConfig.models?.providers?.openai?.apiKey).toEqual({
        source: "file",
        provider: "default",
        id: "/providers/openai/apiKey",
      });
      expect(ensureAuthProfileStore(agentDir).profiles["openai:default"]).toMatchObject({
        type: "api_key",
        key: "sk-file-runtime",
      });
    });
  });

  it("keeps last-known-good web runtime snapshot when reload introduces unresolved active web refs", async () => {
    await withTempHome("maumau-secrets-runtime-web-reload-lkg-", async (home) => {
      const prepared = await prepareSecretsRuntimeSnapshot({
        config: asConfig({
          tools: {
            web: {
              search: {
                provider: "gemini",
                gemini: {
                  apiKey: { source: "env", provider: "default", id: "WEB_SEARCH_GEMINI_API_KEY" },
                },
              },
            },
          },
        }),
        env: {
          WEB_SEARCH_GEMINI_API_KEY: "web-search-gemini-runtime-key",
        },
        agentDirs: ["/tmp/maumau-agent-main"],
        loadAuthStore: () => ({ version: 1, profiles: {} }),
      });

      activateSecretsRuntimeSnapshot(prepared);

      await expect(
        writeConfigFile({
          ...loadConfig(),
          plugins: {
            entries: {
              google: {
                config: {
                  webSearch: {
                    apiKey: {
                      source: "env",
                      provider: "default",
                      id: "MISSING_WEB_SEARCH_GEMINI_API_KEY",
                    },
                  },
                },
              },
            },
          },
          tools: {
            web: {
              search: {
                provider: "gemini",
                gemini: {
                  apiKey: {
                    source: "env",
                    provider: "default",
                    id: "MISSING_WEB_SEARCH_GEMINI_API_KEY",
                  },
                },
              },
            },
          },
        }),
      ).rejects.toThrow(
        /runtime snapshot refresh failed: .*WEB_SEARCH_KEY_UNRESOLVED_NO_FALLBACK/i,
      );

      const activeAfterFailure = getActiveSecretsRuntimeSnapshot();
      expect(activeAfterFailure).not.toBeNull();
      expect(loadConfig().tools?.web?.search?.gemini?.apiKey).toBe("web-search-gemini-runtime-key");
      expect(activeAfterFailure?.sourceConfig.tools?.web?.search?.gemini?.apiKey).toEqual({
        source: "env",
        provider: "default",
        id: "WEB_SEARCH_GEMINI_API_KEY",
      });
      expect(getActiveRuntimeWebToolsMetadata()?.search.selectedProvider).toBe("gemini");

      const persistedConfig = JSON.parse(
        await fs.readFile(path.join(home, ".maumau", "maumau.json"), "utf8"),
      ) as MaumauConfig;
      const persistedGoogleWebSearchConfig = persistedConfig.plugins?.entries?.google?.config as
        | { webSearch?: { apiKey?: unknown } }
        | undefined;
      expect(persistedGoogleWebSearchConfig?.webSearch?.apiKey).toEqual({
        source: "env",
        provider: "default",
        id: "MISSING_WEB_SEARCH_GEMINI_API_KEY",
      });
    });
  }, 180_000);

  it("recomputes config-derived agent dirs when refreshing active secrets runtime snapshots", async () => {
    await withTempHome("maumau-secrets-runtime-agent-dirs-", async (home) => {
      const mainAgentDir = path.join(home, ".maumau", "agents", "main", "agent");
      const opsAgentDir = path.join(home, ".maumau", "agents", "ops", "agent");
      await fs.mkdir(mainAgentDir, { recursive: true });
      await fs.mkdir(opsAgentDir, { recursive: true });
      await fs.writeFile(
        path.join(mainAgentDir, "auth-profiles.json"),
        `${JSON.stringify(
          {
            version: 1,
            profiles: {
              "openai:default": {
                type: "api_key",
                provider: "openai",
                keyRef: { source: "env", provider: "default", id: "OPENAI_API_KEY" },
              },
            },
          },
          null,
          2,
        )}\n`,
        { encoding: "utf8", mode: 0o600 },
      );
      await fs.writeFile(
        path.join(opsAgentDir, "auth-profiles.json"),
        `${JSON.stringify(
          {
            version: 1,
            profiles: {
              "anthropic:ops": {
                type: "api_key",
                provider: "anthropic",
                keyRef: { source: "env", provider: "default", id: "ANTHROPIC_API_KEY" },
              },
            },
          },
          null,
          2,
        )}\n`,
        { encoding: "utf8", mode: 0o600 },
      );

      const prepared = await prepareSecretsRuntimeSnapshot({
        config: asConfig({}),
        env: {
          OPENAI_API_KEY: "sk-main-runtime",
          ANTHROPIC_API_KEY: "sk-ops-runtime",
        },
      });

      activateSecretsRuntimeSnapshot(prepared);
      expect(ensureAuthProfileStore(opsAgentDir).profiles["anthropic:ops"]).toBeUndefined();

      await writeConfigFile({
        agents: {
          list: [{ id: "ops", agentDir: opsAgentDir }],
        },
      });

      expect(ensureAuthProfileStore(opsAgentDir).profiles["anthropic:ops"]).toMatchObject({
        type: "api_key",
        key: "sk-ops-runtime",
        keyRef: { source: "env", provider: "default", id: "ANTHROPIC_API_KEY" },
      });
    });
  });
});
