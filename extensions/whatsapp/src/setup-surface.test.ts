import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ACCOUNT_ID } from "../../../src/routing/session-key.js";
import type { RuntimeEnv } from "../../../src/runtime.js";
import {
  createPluginSetupWizardConfigure,
  createQueuedWizardPrompter,
  runSetupWizardConfigure,
} from "../../../test/helpers/extensions/setup-wizard.js";

const loginWebMock = vi.hoisted(() => vi.fn(async () => {}));
const pathExistsMock = vi.hoisted(() => vi.fn(async () => false));
const listWhatsAppAccountIdsMock = vi.hoisted(() => vi.fn(() => [] as string[]));
const resolveDefaultWhatsAppAccountIdMock = vi.hoisted(() => vi.fn(() => DEFAULT_ACCOUNT_ID));
const resolveWhatsAppAuthDirMock = vi.hoisted(() =>
  vi.fn(() => ({
    authDir: "/tmp/maumau-whatsapp-test",
  })),
);

vi.mock("./login.js", () => ({
  loginWeb: loginWebMock,
}));

vi.mock("maumau/plugin-sdk/setup", async () => {
  const actual =
    await vi.importActual<typeof import("maumau/plugin-sdk/setup")>("maumau/plugin-sdk/setup");
  return {
    ...actual,
    pathExists: pathExistsMock,
  };
});

vi.mock("./accounts.js", async () => {
  const actual = await vi.importActual<typeof import("./accounts.js")>("./accounts.js");
  return {
    ...actual,
    listWhatsAppAccountIds: listWhatsAppAccountIdsMock,
    resolveDefaultWhatsAppAccountId: resolveDefaultWhatsAppAccountIdMock,
    resolveWhatsAppAuthDir: resolveWhatsAppAuthDirMock,
  };
});

function createRuntime(): RuntimeEnv {
  return {
    error: vi.fn(),
  } as unknown as RuntimeEnv;
}

let whatsappConfigure: ReturnType<typeof createPluginSetupWizardConfigure>;

async function runConfigureWithHarness(params: {
  harness: ReturnType<typeof createQueuedWizardPrompter>;
  cfg?: Parameters<typeof whatsappConfigure>[0]["cfg"];
  runtime?: RuntimeEnv;
  options?: Parameters<typeof whatsappConfigure>[0]["options"];
  accountOverrides?: Parameters<typeof whatsappConfigure>[0]["accountOverrides"];
  shouldPromptAccountIds?: boolean;
  forceAllowFrom?: boolean;
}) {
  return await runSetupWizardConfigure({
    configure: whatsappConfigure,
    cfg: params.cfg ?? {},
    runtime: params.runtime ?? createRuntime(),
    prompter: params.harness.prompter,
    options: params.options ?? {},
    accountOverrides: params.accountOverrides ?? {},
    shouldPromptAccountIds: params.shouldPromptAccountIds ?? false,
    forceAllowFrom: params.forceAllowFrom ?? false,
  });
}

function createWhatsAppSetupHarness(params: { selectValues: string[]; textValues?: string[] }) {
  return createQueuedWizardPrompter({
    confirmValues: [false],
    selectValues: params.selectValues,
    textValues: params.textValues,
  });
}

async function runSetupFlow(params: { selectValues: string[]; textValues?: string[] }) {
  pathExistsMock.mockResolvedValue(true);
  const harness = createWhatsAppSetupHarness({
    selectValues: params.selectValues,
    textValues: params.textValues,
  });
  const result = await runConfigureWithHarness({
    harness,
  });
  return { harness, result };
}

describe("whatsapp setup wizard", () => {
  beforeAll(async () => {
    vi.resetModules();
    const { whatsappPlugin } = await import("./channel.js");
    whatsappConfigure = createPluginSetupWizardConfigure(whatsappPlugin);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    pathExistsMock.mockResolvedValue(false);
    listWhatsAppAccountIdsMock.mockReturnValue([]);
    resolveDefaultWhatsAppAccountIdMock.mockReturnValue(DEFAULT_ACCOUNT_ID);
    resolveWhatsAppAuthDirMock.mockReturnValue({ authDir: "/tmp/maumau-whatsapp-test" });
  });

  it("applies owner allowlist when forceAllowFrom is enabled", async () => {
    const harness = createQueuedWizardPrompter({
      confirmValues: [false],
      textValues: ["+1 (555) 555-0123"],
    });

    const result = await runConfigureWithHarness({
      harness,
      forceAllowFrom: true,
    });

    expect(result.accountId).toBe(DEFAULT_ACCOUNT_ID);
    expect(loginWebMock).not.toHaveBeenCalled();
    expect(result.cfg.channels?.whatsapp?.selfChatMode).toBe(false);
    expect(result.cfg.channels?.whatsapp?.dmPolicy).toBe("allowlist");
    expect(result.cfg.channels?.whatsapp?.allowFrom).toEqual(["+15555550123"]);
    expect(harness.text).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Your WhatsApp number (the phone you will message the agent from)",
      }),
    );
  });

  it("supports disabled DM policy for dedicated-agent setup", async () => {
    const { harness, result } = await runSetupFlow({
      selectValues: ["disabled"],
    });

    expect(result.cfg.channels?.whatsapp?.selfChatMode).toBe(false);
    expect(result.cfg.channels?.whatsapp?.dmPolicy).toBe("disabled");
    expect(result.cfg.channels?.whatsapp?.allowFrom).toBeUndefined();
    expect(harness.text).not.toHaveBeenCalled();
  });

  it("normalizes approved numbers when allowlist mode is selected", async () => {
    const { result } = await runSetupFlow({
      selectValues: ["allowlist"],
      textValues: ["+1 (555) 555-0123, +15555550123"],
    });

    expect(result.cfg.channels?.whatsapp?.selfChatMode).toBe(false);
    expect(result.cfg.channels?.whatsapp?.dmPolicy).toBe("allowlist");
    expect(result.cfg.channels?.whatsapp?.allowFrom).toEqual(["+15555550123"]);
  });

  it("explains WhatsApp as a separate agent identity during setup", async () => {
    pathExistsMock.mockResolvedValue(true);
    const harness = createQueuedWizardPrompter({
      confirmValues: [false],
      selectValues: ["disabled"],
    });

    await runConfigureWithHarness({
      harness,
    });

    expect(harness.note).toHaveBeenCalledWith(
      expect.stringContaining("cannot create a WhatsApp number"),
      "How WhatsApp chat works",
    );
  });

  it("forces wildcard allowFrom for open policy without allowFrom follow-up prompts", async () => {
    pathExistsMock.mockResolvedValue(true);
    const harness = createWhatsAppSetupHarness({
      selectValues: ["open"],
    });

    const result = await runConfigureWithHarness({
      harness,
      cfg: {
        channels: {
          whatsapp: {
            allowFrom: ["+15555550123"],
          },
        },
      },
    });

    expect(result.cfg.channels?.whatsapp?.selfChatMode).toBe(false);
    expect(result.cfg.channels?.whatsapp?.dmPolicy).toBe("open");
    expect(result.cfg.channels?.whatsapp?.allowFrom).toEqual(["*", "+15555550123"]);
    expect(harness.select).toHaveBeenCalledTimes(1);
    expect(harness.text).not.toHaveBeenCalled();
  });

  it("runs WhatsApp login when not linked and user confirms linking", async () => {
    pathExistsMock.mockResolvedValue(false);
    const harness = createQueuedWizardPrompter({
      confirmValues: [true],
      selectValues: ["disabled"],
    });
    const runtime = createRuntime();

    await runConfigureWithHarness({
      harness,
      runtime,
    });

    expect(loginWebMock).toHaveBeenCalledWith(false, undefined, runtime, DEFAULT_ACCOUNT_ID);
  });

  it("skips relink note when already linked and relink is declined", async () => {
    pathExistsMock.mockResolvedValue(true);
    const harness = createWhatsAppSetupHarness({
      selectValues: ["disabled"],
    });

    await runConfigureWithHarness({
      harness,
    });

    expect(loginWebMock).not.toHaveBeenCalled();
    expect(harness.note).not.toHaveBeenCalledWith(
      expect.stringContaining("maumau channels login"),
      "WhatsApp",
    );
  });

  it("shows follow-up login command note when not linked and linking is skipped", async () => {
    pathExistsMock.mockResolvedValue(false);
    const harness = createWhatsAppSetupHarness({
      selectValues: ["disabled"],
    });

    await runConfigureWithHarness({
      harness,
    });

    expect(harness.note).toHaveBeenCalledWith(
      expect.stringContaining("maumau channels login"),
      "WhatsApp",
    );
  });
});
