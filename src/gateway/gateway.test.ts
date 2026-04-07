import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearAllBootstrapSnapshots } from "../agents/bootstrap-cache.js";
import { clearConfigCache, clearRuntimeConfigSnapshot } from "../config/config.js";
import { clearSessionStoreCacheForTest } from "../config/sessions/store.js";
import { resetAgentRunContextForTest } from "../infra/agent-events.js";
import { clearGatewaySubagentRuntime } from "../plugins/runtime/index.js";
import { captureEnv } from "../test-utils/env.js";
import { startGatewayServer } from "./server.js";
import {
  connectDeviceAuthReq,
  disconnectGatewayClient,
  connectGatewayClient,
  getFreeGatewayPort,
  startGatewayWithClient,
} from "./test-helpers.e2e.js";
import { installOpenAiResponsesMock } from "./test-helpers.openai-mock.js";
import { buildMockOpenAiResponsesProvider } from "./test-openai-responses-model.js";

let writeConfigFile: typeof import("../config/config.js").writeConfigFile;
let resolveConfigPath: typeof import("../config/config.js").resolveConfigPath;
const GATEWAY_E2E_TIMEOUT_MS = 90_000;
let gatewayTestSeq = 0;

function nextGatewayId(prefix: string): string {
  return `${prefix}-${process.pid}-${process.env.VITEST_POOL_ID ?? "0"}-${gatewayTestSeq++}`;
}

describe("gateway e2e", () => {
  beforeEach(() => {
    clearRuntimeConfigSnapshot();
    clearConfigCache();
    clearSessionStoreCacheForTest();
    resetAgentRunContextForTest();
    clearAllBootstrapSnapshots();
    clearGatewaySubagentRuntime();
  });

  afterEach(() => {
    clearRuntimeConfigSnapshot();
    clearConfigCache();
    clearSessionStoreCacheForTest();
    resetAgentRunContextForTest();
    clearAllBootstrapSnapshots();
    clearGatewaySubagentRuntime();
  });

  beforeAll(async () => {
    ({ writeConfigFile, resolveConfigPath } = await import("../config/config.js"));
  });

  it(
    "accepts a gateway agent request over ws and returns a run id",
    { timeout: GATEWAY_E2E_TIMEOUT_MS },
    async () => {
      const envSnapshot = captureEnv([
        "HOME",
        "MAUMAU_STATE_DIR",
        "MAUMAU_CONFIG_PATH",
        "MAUMAU_GATEWAY_TOKEN",
        "MAUMAU_SKIP_CHANNELS",
        "MAUMAU_SKIP_GMAIL_WATCHER",
        "MAUMAU_SKIP_CRON",
        "MAUMAU_SKIP_CANVAS_HOST",
        "MAUMAU_SKIP_BROWSER_CONTROL_SERVER",
      ]);

      const { baseUrl: openaiBaseUrl, restore } = installOpenAiResponsesMock();

      const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-gw-mock-home-"));
      process.env.HOME = tempHome;
      process.env.MAUMAU_STATE_DIR = path.join(tempHome, ".maumau");
      delete process.env.MAUMAU_CONFIG_PATH;
      process.env.MAUMAU_SKIP_CHANNELS = "1";
      process.env.MAUMAU_SKIP_GMAIL_WATCHER = "1";
      process.env.MAUMAU_SKIP_CRON = "1";
      process.env.MAUMAU_SKIP_CANVAS_HOST = "1";
      process.env.MAUMAU_SKIP_BROWSER_CONTROL_SERVER = "1";

      const token = nextGatewayId("test-token");
      process.env.MAUMAU_GATEWAY_TOKEN = token;

      const workspaceDir = path.join(tempHome, "maumau");
      await fs.mkdir(workspaceDir, { recursive: true });

      const configDir = path.join(tempHome, ".maumau");
      await fs.mkdir(configDir, { recursive: true });
      const configPath = path.join(configDir, "maumau.json");
      const mockProvider = buildMockOpenAiResponsesProvider(openaiBaseUrl);

      const cfg = {
        agents: {
          defaults: {
            workspace: workspaceDir,
            model: { primary: mockProvider.modelRef },
            models: {
              [mockProvider.modelRef]: {
                params: {
                  transport: "sse",
                  openaiWsWarmup: false,
                },
              },
            },
          },
        },
        models: {
          mode: "replace",
          providers: {
            [mockProvider.providerId]: mockProvider.config,
          },
        },
        gateway: { auth: { token } },
      };

      const { server, client } = await startGatewayWithClient({
        cfg,
        configPath,
        token,
        clientDisplayName: "vitest-mock-openai",
      });

      try {
        const sessionKey = "agent:dev:mock-openai";

        const runId = nextGatewayId("run");
        const payload = await client.request<{
          status?: unknown;
          runId?: unknown;
        }>(
          "agent",
          {
            sessionKey,
            idempotencyKey: `idem-${runId}`,
            message: "Reply with ok.",
            deliver: false,
          },
          { expectFinal: false },
        );

        expect(payload?.status).toBe("accepted");
        expect(typeof payload?.runId).toBe("string");
      } finally {
        await disconnectGatewayClient(client);
        await server.close({ reason: "mock openai test complete" });
        await fs.rm(tempHome, { recursive: true, force: true });
        restore();
        envSnapshot.restore();
      }
    },
  );

  it(
    "runs wizard over ws and writes auth token config",
    { timeout: GATEWAY_E2E_TIMEOUT_MS },
    async () => {
      const envSnapshot = captureEnv([
        "HOME",
        "MAUMAU_STATE_DIR",
        "MAUMAU_CONFIG_PATH",
        "MAUMAU_GATEWAY_TOKEN",
        "MAUMAU_SKIP_CHANNELS",
        "MAUMAU_SKIP_GMAIL_WATCHER",
        "MAUMAU_SKIP_CRON",
        "MAUMAU_SKIP_CANVAS_HOST",
        "MAUMAU_SKIP_BROWSER_CONTROL_SERVER",
      ]);

      process.env.MAUMAU_SKIP_CHANNELS = "1";
      process.env.MAUMAU_SKIP_GMAIL_WATCHER = "1";
      process.env.MAUMAU_SKIP_CRON = "1";
      process.env.MAUMAU_SKIP_CANVAS_HOST = "1";
      process.env.MAUMAU_SKIP_BROWSER_CONTROL_SERVER = "1";
      delete process.env.MAUMAU_GATEWAY_TOKEN;

      const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-wizard-home-"));
      process.env.HOME = tempHome;
      delete process.env.MAUMAU_STATE_DIR;
      delete process.env.MAUMAU_CONFIG_PATH;

      const wizardToken = nextGatewayId("wiz-token");
      const port = await getFreeGatewayPort();
      let receivedWizardOpts:
        | {
            mode?: string;
            flow?: string;
            acceptRisk?: boolean;
            skipChannels?: boolean;
            skipSkills?: boolean;
            skipSearch?: boolean;
            skipUi?: boolean;
            embedded?: boolean;
          }
        | undefined;
      const server = await startGatewayServer(port, {
        bind: "loopback",
        auth: { mode: "token", token: wizardToken },
        controlUiEnabled: false,
        wizardRunner: async (opts, _runtime, prompter) => {
          receivedWizardOpts = {
            mode: opts.mode,
            flow: opts.flow,
            acceptRisk: opts.acceptRisk,
            skipChannels: opts.skipChannels,
            skipSkills: opts.skipSkills,
            skipSearch: opts.skipSearch,
            skipUi: opts.skipUi,
            embedded: opts.embedded,
          };
          await prompter.intro("Wizard E2E");
          await prompter.note("write token");
          const token = await prompter.text({ message: "token" });
          await writeConfigFile({
            gateway: { auth: { mode: "token", token: String(token) } },
          });
          await prompter.outro("ok");
        },
      });

      const client = await connectGatewayClient({
        url: `ws://127.0.0.1:${port}`,
        token: wizardToken,
        clientDisplayName: "vitest-wizard",
      });

      try {
        const start = await client.request<{
          sessionId?: string;
          done: boolean;
          status: "running" | "done" | "cancelled" | "error";
          step?: {
            id: string;
            type: "note" | "select" | "text" | "confirm" | "multiselect" | "progress";
          };
          error?: string;
        }>("wizard.start", {
          mode: "local",
          flow: "quickstart",
          acceptRisk: true,
          skipChannels: true,
          skipSkills: true,
          skipSearch: true,
          skipUi: true,
          embedded: true,
          fresh: true,
        });
        const sessionId = start.sessionId;
        expect(typeof sessionId).toBe("string");
        const restarted = await client.request<{
          sessionId?: string;
          done: boolean;
          status: "running" | "done" | "cancelled" | "error";
          step?: {
            id: string;
            type: "note" | "select" | "text" | "confirm" | "multiselect" | "progress";
          };
          error?: string;
        }>("wizard.start", {
          mode: "local",
          flow: "quickstart",
          acceptRisk: true,
          skipChannels: true,
          skipSkills: true,
          skipSearch: true,
          skipUi: true,
          embedded: true,
          fresh: true,
        });
        expect(restarted.sessionId).not.toBe(sessionId);
        expect(typeof restarted.sessionId).toBe("string");
        expect(restarted.step?.id).toBeDefined();

        const resumed = await client.request<{
          sessionId?: string;
          done: boolean;
          status: "running" | "done" | "cancelled" | "error";
          step?: {
            id: string;
            type: "note" | "select" | "text" | "confirm" | "multiselect" | "progress";
          };
          error?: string;
        }>("wizard.start", {
          mode: "local",
          flow: "quickstart",
          acceptRisk: true,
          skipChannels: true,
          skipSkills: true,
          skipSearch: true,
          skipUi: true,
          embedded: true,
        });
        expect(resumed.sessionId).toBe(restarted.sessionId);
        expect(resumed.step?.id).toBe(restarted.step?.id);

        const activeSessionId = restarted.sessionId;
        let next = resumed;
        let didSendToken = false;
        while (!next.done) {
          const step = next.step;
          if (!step) {
            throw new Error("wizard missing step");
          }
          const value = step.type === "text" ? wizardToken : null;
          if (step.type === "text") {
            didSendToken = true;
          }
          next = await client.request("wizard.next", {
            sessionId: activeSessionId,
            answer: { stepId: step.id, value },
          });
        }

        expect(didSendToken).toBe(true);
        expect(next.status).toBe("done");
        expect(receivedWizardOpts).toEqual({
          mode: "local",
          flow: "quickstart",
          acceptRisk: true,
          skipChannels: true,
          skipSkills: true,
          skipSearch: true,
          skipUi: true,
          embedded: true,
        });

        const parsed = JSON.parse(await fs.readFile(resolveConfigPath(), "utf8"));
        const token = (parsed as Record<string, unknown>)?.gateway as
          | Record<string, unknown>
          | undefined;
        expect((token?.auth as { token?: string } | undefined)?.token).toBe(wizardToken);
      } finally {
        await disconnectGatewayClient(client);
        await server.close({ reason: "wizard e2e complete" });
      }

      const port2 = await getFreeGatewayPort();
      const server2 = await startGatewayServer(port2, {
        bind: "loopback",
        controlUiEnabled: false,
      });
      try {
        const resNoToken = await connectDeviceAuthReq({
          url: `ws://127.0.0.1:${port2}`,
        });
        expect(resNoToken.ok).toBe(false);
        expect(resNoToken.error?.message ?? "").toContain("unauthorized");

        const resToken = await connectDeviceAuthReq({
          url: `ws://127.0.0.1:${port2}`,
          token: wizardToken,
        });
        expect(resToken.ok).toBe(true);
      } finally {
        await server2.close({ reason: "wizard auth verify" });
        await fs.rm(tempHome, { recursive: true, force: true });
        envSnapshot.restore();
      }
    },
  );

  it(
    "returns a warmup progress step while embedded wizard startup is still preparing the first prompt",
    { timeout: GATEWAY_E2E_TIMEOUT_MS },
    async () => {
      const envSnapshot = captureEnv([
        "HOME",
        "MAUMAU_STATE_DIR",
        "MAUMAU_CONFIG_PATH",
        "MAUMAU_GATEWAY_TOKEN",
        "MAUMAU_SKIP_CHANNELS",
        "MAUMAU_SKIP_GMAIL_WATCHER",
        "MAUMAU_SKIP_CRON",
        "MAUMAU_SKIP_CANVAS_HOST",
        "MAUMAU_SKIP_BROWSER_CONTROL_SERVER",
      ]);

      process.env.MAUMAU_SKIP_CHANNELS = "1";
      process.env.MAUMAU_SKIP_GMAIL_WATCHER = "1";
      process.env.MAUMAU_SKIP_CRON = "1";
      process.env.MAUMAU_SKIP_CANVAS_HOST = "1";
      process.env.MAUMAU_SKIP_BROWSER_CONTROL_SERVER = "1";
      delete process.env.MAUMAU_GATEWAY_TOKEN;

      const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-wizard-warmup-home-"));
      process.env.HOME = tempHome;
      delete process.env.MAUMAU_STATE_DIR;
      delete process.env.MAUMAU_CONFIG_PATH;

      const wizardToken = nextGatewayId("wiz-warmup-token");
      const port = await getFreeGatewayPort();
      const server = await startGatewayServer(port, {
        bind: "loopback",
        auth: { mode: "token", token: wizardToken },
        controlUiEnabled: false,
        wizardRunner: async (_opts, _runtime, prompter) => {
          await new Promise((resolve) => setTimeout(resolve, 1_500));
          await prompter.note("Ready");
        },
      });

      const client = await connectGatewayClient({
        url: `ws://127.0.0.1:${port}`,
        token: wizardToken,
        clientDisplayName: "vitest-wizard-warmup",
      });

      try {
        const startedAt = Date.now();
        const start = await client.request<{
          sessionId?: string;
          done: boolean;
          status: "running" | "done" | "cancelled" | "error";
          step?: {
            id: string;
            type: "note" | "select" | "text" | "confirm" | "multiselect" | "progress";
            title?: string;
            message?: string;
          };
          error?: string;
        }>("wizard.start", {
          mode: "local",
          flow: "quickstart",
          acceptRisk: true,
          skipChannels: true,
          skipSkills: true,
          skipSearch: true,
          skipUi: true,
          embedded: true,
          fresh: true,
        });
        const elapsedMs = Date.now() - startedAt;
        const sessionId = start.sessionId;

        expect(typeof sessionId).toBe("string");
        expect(elapsedMs).toBeLessThan(1_400);
        expect(start.done).toBe(false);
        expect(start.status).toBe("running");
        expect(start.step?.type).toBe("progress");
        expect(start.step?.title).toBe("Preparing setup");

        const resumedAt = Date.now();
        const resumed = await client.request<{
          sessionId?: string;
          done: boolean;
          status: "running" | "done" | "cancelled" | "error";
          step?: {
            id: string;
            type: "note" | "select" | "text" | "confirm" | "multiselect" | "progress";
            title?: string;
            message?: string;
          };
          error?: string;
        }>("wizard.start", {
          mode: "local",
          flow: "quickstart",
          acceptRisk: true,
          skipChannels: true,
          skipSkills: true,
          skipSearch: true,
          skipUi: true,
          embedded: true,
        });
        const resumedElapsedMs = Date.now() - resumedAt;

        expect(resumed.sessionId).toBe(sessionId);
        expect(resumedElapsedMs).toBeLessThan(1_400);
        expect(["note", "progress"]).toContain(resumed.step?.type);

        const next = await client.request<{
          done: boolean;
          status: "running" | "done" | "cancelled" | "error";
          step?: {
            id: string;
            type: "note" | "select" | "text" | "confirm" | "multiselect" | "progress";
            message?: string;
          };
          error?: string;
        }>("wizard.next", {
          sessionId,
        });

        expect(next.done).toBe(false);
        expect(next.step?.type).toBe("note");
        expect(next.step?.message).toBe("Ready");

        if (!next.step) {
          throw new Error("wizard missing ready step");
        }

        const done = await client.request<{
          done: boolean;
          status: "running" | "done" | "cancelled" | "error";
          error?: string;
        }>("wizard.next", {
          sessionId,
          answer: { stepId: next.step.id, value: null },
        });

        expect(done.done).toBe(true);
        expect(done.status).toBe("done");
      } finally {
        await disconnectGatewayClient(client);
        await server.close({ reason: "wizard warmup e2e complete" });
        await fs.rm(tempHome, { recursive: true, force: true });
        envSnapshot.restore();
      }
    },
  );

  it(
    "returns the embedded warmup step immediately even when startup blocks the event loop after yielding",
    { timeout: GATEWAY_E2E_TIMEOUT_MS },
    async () => {
      const envSnapshot = captureEnv([
        "HOME",
        "MAUMAU_STATE_DIR",
        "MAUMAU_CONFIG_PATH",
        "MAUMAU_GATEWAY_TOKEN",
        "MAUMAU_SKIP_CHANNELS",
        "MAUMAU_SKIP_GMAIL_WATCHER",
        "MAUMAU_SKIP_CRON",
        "MAUMAU_SKIP_CANVAS_HOST",
        "MAUMAU_SKIP_BROWSER_CONTROL_SERVER",
      ]);

      process.env.MAUMAU_SKIP_CHANNELS = "1";
      process.env.MAUMAU_SKIP_GMAIL_WATCHER = "1";
      process.env.MAUMAU_SKIP_CRON = "1";
      process.env.MAUMAU_SKIP_CANVAS_HOST = "1";
      process.env.MAUMAU_SKIP_BROWSER_CONTROL_SERVER = "1";
      delete process.env.MAUMAU_GATEWAY_TOKEN;

      const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-wizard-warmup-blocked-home-"));
      process.env.HOME = tempHome;
      delete process.env.MAUMAU_STATE_DIR;
      delete process.env.MAUMAU_CONFIG_PATH;

      const wizardToken = nextGatewayId("wiz-warmup-blocked-token");
      const port = await getFreeGatewayPort();
      const server = await startGatewayServer(port, {
        bind: "loopback",
        auth: { mode: "token", token: wizardToken },
        controlUiEnabled: false,
        wizardRunner: async (_opts, _runtime, prompter) => {
          await Promise.resolve();
          const blockedUntil = Date.now() + 1_500;
          while (Date.now() < blockedUntil) {
            // Busy-wait to simulate cold-start work that starves the timer queue.
          }
          await prompter.note("Ready");
        },
      });

      const client = await connectGatewayClient({
        url: `ws://127.0.0.1:${port}`,
        token: wizardToken,
        clientDisplayName: "vitest-wizard-warmup-blocked",
      });

      try {
        const startedAt = Date.now();
        const start = await client.request<{
          sessionId?: string;
          done: boolean;
          status: "running" | "done" | "cancelled" | "error";
          step?: {
            id: string;
            type: "note" | "select" | "text" | "confirm" | "multiselect" | "progress";
            title?: string;
            message?: string;
          };
          error?: string;
        }>("wizard.start", {
          mode: "local",
          flow: "quickstart",
          acceptRisk: true,
          skipChannels: true,
          skipSkills: true,
          skipSearch: true,
          skipUi: true,
          embedded: true,
          fresh: true,
        });
        const elapsedMs = Date.now() - startedAt;

        expect(elapsedMs).toBeLessThan(750);
        expect(start.done).toBe(false);
        expect(start.status).toBe("running");
        expect(start.step?.type).toBe("progress");
        expect(start.step?.title).toBe("Preparing setup");
      } finally {
        await client.close();
        await server.close({ reason: "wizard warmup blocked" });
        await fs.rm(tempHome, { recursive: true, force: true });
        envSnapshot.restore();
      }
    },
  );

  it(
    "starts the focused models-auth wizard with the selected auth choice",
    { timeout: GATEWAY_E2E_TIMEOUT_MS },
    async () => {
      const envSnapshot = captureEnv([
        "HOME",
        "MAUMAU_STATE_DIR",
        "MAUMAU_CONFIG_PATH",
        "MAUMAU_GATEWAY_TOKEN",
        "MAUMAU_SKIP_CHANNELS",
        "MAUMAU_SKIP_GMAIL_WATCHER",
        "MAUMAU_SKIP_CRON",
        "MAUMAU_SKIP_CANVAS_HOST",
        "MAUMAU_SKIP_BROWSER_CONTROL_SERVER",
      ]);

      process.env.MAUMAU_SKIP_CHANNELS = "1";
      process.env.MAUMAU_SKIP_GMAIL_WATCHER = "1";
      process.env.MAUMAU_SKIP_CRON = "1";
      process.env.MAUMAU_SKIP_CANVAS_HOST = "1";
      process.env.MAUMAU_SKIP_BROWSER_CONTROL_SERVER = "1";
      delete process.env.MAUMAU_GATEWAY_TOKEN;

      const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-model-auth-home-"));
      process.env.HOME = tempHome;
      delete process.env.MAUMAU_STATE_DIR;
      delete process.env.MAUMAU_CONFIG_PATH;

      const wizardToken = nextGatewayId("wiz-model-auth-token");
      const port = await getFreeGatewayPort();
      let receivedAuthChoice: string | undefined;
      let receivedSetDefaultModel: boolean | undefined;
      const server = await startGatewayServer(port, {
        bind: "loopback",
        auth: { mode: "token", token: wizardToken },
        controlUiEnabled: false,
        modelAuthWizardRunner: async (opts, _runtime, prompter) => {
          receivedAuthChoice = opts.authChoice;
          receivedSetDefaultModel = opts.setDefaultModel;
          await prompter.note("Connect provider");
        },
      });

      const client = await connectGatewayClient({
        url: `ws://127.0.0.1:${port}`,
        token: wizardToken,
        clientDisplayName: "vitest-model-auth-wizard",
      });

      try {
        const start = await client.request<{
          sessionId?: string;
          done: boolean;
          status: "running" | "done" | "cancelled" | "error";
          step?: {
            id: string;
            type: "note" | "select" | "text" | "confirm" | "multiselect" | "progress";
            message?: string;
          };
          error?: string;
        }>("wizard.start", {
          entrypoint: "models-auth",
          authChoice: "openai-api-key",
          setDefaultModel: false,
          embedded: true,
          fresh: true,
        });

        expect(start.done).toBe(false);
        expect(start.status).toBe("running");
        expect(start.step?.type).toBe("note");
        expect(start.step?.message).toBe("Connect provider");
        expect(receivedAuthChoice).toBe("openai-api-key");
        expect(receivedSetDefaultModel).toBe(false);

        if (!start.sessionId || !start.step) {
          throw new Error("models-auth wizard did not return a session and step");
        }

        const done = await client.request<{
          done: boolean;
          status: "running" | "done" | "cancelled" | "error";
        }>("wizard.next", {
          sessionId: start.sessionId,
          answer: { stepId: start.step.id, value: null },
        });

        expect(done.done).toBe(true);
        expect(done.status).toBe("done");
      } finally {
        await disconnectGatewayClient(client);
        await server.close({ reason: "model auth wizard e2e complete" });
        await fs.rm(tempHome, { recursive: true, force: true });
        envSnapshot.restore();
      }
    },
  );
});
