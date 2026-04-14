import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearConfigCache } from "../../config/config.js";

let buildBootstrapSecureDashboardSystemPrompt: typeof import("./bootstrap-secure-dashboard.js").buildBootstrapSecureDashboardSystemPrompt;
let resolveBootstrapSecureDashboardUrl: typeof import("./bootstrap-secure-dashboard.js").resolveBootstrapSecureDashboardUrl;
let injectBootstrapSecureDashboardUrlIntoPayloads: typeof import("./bootstrap-secure-dashboard.js").injectBootstrapSecureDashboardUrlIntoPayloads;
let previousTailnetDns: string | undefined;
let previousHome: string | undefined;

beforeAll(async () => {
  ({
    buildBootstrapSecureDashboardSystemPrompt,
    resolveBootstrapSecureDashboardUrl,
    injectBootstrapSecureDashboardUrlIntoPayloads,
  } = await import("./bootstrap-secure-dashboard.js"));
});

beforeEach(async () => {
  previousHome = process.env.HOME;
  process.env.HOME = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-bootstrap-home-"));
});

async function makeWorkspace(withBootstrap = true) {
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-bootstrap-secure-url-"));
  if (withBootstrap) {
    await fs.writeFile(path.join(workspaceDir, "BOOTSTRAP.md"), "# bootstrap\n");
  }
  return workspaceDir;
}

afterEach(() => {
  vi.clearAllMocks();
  clearConfigCache();
  if (previousTailnetDns === undefined) {
    delete process.env.MAUMAU_TAILNET_DNS;
  } else {
    process.env.MAUMAU_TAILNET_DNS = previousTailnetDns;
  }
  if (previousHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = previousHome;
  }
  previousTailnetDns = undefined;
  previousHome = undefined;
});

describe("resolveBootstrapSecureDashboardUrl", () => {
  it("returns a clean serve URL for owner bootstrap chats when tailscale auth is enough", async () => {
    const workspaceDir = await makeWorkspace();
    previousTailnetDns = process.env.MAUMAU_TAILNET_DNS;
    process.env.MAUMAU_TAILNET_DNS = "maumau.tailnet.ts.net";

    await expect(
      resolveBootstrapSecureDashboardUrl({
        cfg: {
          gateway: {
            auth: {
              mode: "token",
              token: "gateway-token",
              allowTailscale: true,
            },
            tailscale: {
              mode: "serve",
            },
            controlUi: {
              basePath: "/control",
            },
          },
        },
        workspaceDir,
        isFirstTurnInSession: true,
        originatingChannel: "telegram",
        chatType: "direct",
        senderIsOwner: true,
      }),
    ).resolves.toBe("https://maumau.tailnet.ts.net/control/dashboard/today");
  });

  it("returns a tokenized URL when explicit gateway token auth is still required", async () => {
    const workspaceDir = await makeWorkspace();
    previousTailnetDns = process.env.MAUMAU_TAILNET_DNS;
    process.env.MAUMAU_TAILNET_DNS = "maumau.tailnet.ts.net";

    await expect(
      resolveBootstrapSecureDashboardUrl({
        cfg: {
          gateway: {
            auth: {
              mode: "token",
              token: "gateway-token",
              allowTailscale: false,
            },
            tailscale: {
              mode: "serve",
            },
          },
        },
        workspaceDir,
        isFirstTurnInSession: true,
        originatingChannel: "telegram",
        chatType: "direct",
        senderIsOwner: true,
      }),
    ).resolves.toBe("https://maumau.tailnet.ts.net/dashboard/today#token=gateway-token");
  });

  it("works for non-telegram external channels too", async () => {
    const workspaceDir = await makeWorkspace();
    previousTailnetDns = process.env.MAUMAU_TAILNET_DNS;
    process.env.MAUMAU_TAILNET_DNS = "maumau.tailnet.ts.net";

    await expect(
      resolveBootstrapSecureDashboardUrl({
        cfg: {
          gateway: {
            auth: {
              mode: "token",
              token: "gateway-token",
              allowTailscale: true,
            },
            tailscale: {
              mode: "serve",
            },
          },
        },
        workspaceDir,
        isFirstTurnInSession: true,
        originatingChannel: "whatsapp",
        chatType: "direct",
        senderIsOwner: true,
      }),
    ).resolves.toBe("https://maumau.tailnet.ts.net/dashboard/today");
  });

  it("bootstraps first-turn owner access from the inbound sender when ownerAllowFrom is still unset", async () => {
    const workspaceDir = await makeWorkspace();
    previousTailnetDns = process.env.MAUMAU_TAILNET_DNS;
    process.env.MAUMAU_TAILNET_DNS = "maumau.tailnet.ts.net";

    await expect(
      resolveBootstrapSecureDashboardUrl({
        cfg: {
          gateway: {
            auth: {
              mode: "token",
              token: "gateway-token",
              allowTailscale: true,
            },
            tailscale: {
              mode: "serve",
            },
          },
        },
        workspaceDir,
        isFirstTurnInSession: true,
        originatingChannel: "telegram",
        chatType: "direct",
        senderIsOwner: false,
        requesterSenderIsOwner: false,
        commandAuthorized: false,
        ctx: {
          Provider: "telegram",
          Surface: "telegram",
          ChatType: "direct",
          SenderId: "12345",
          From: "telegram:12345",
          To: "telegram:12345",
        },
      }),
    ).resolves.toBe("https://maumau.tailnet.ts.net/dashboard/today");
  });

  it("re-checks owner access from the freshly written config even when turn auth is stale", async () => {
    const workspaceDir = await makeWorkspace();
    previousTailnetDns = process.env.MAUMAU_TAILNET_DNS;
    process.env.MAUMAU_TAILNET_DNS = "maumau.tailnet.ts.net";
    const homeDir = process.env.HOME!;
    await fs.mkdir(path.join(homeDir, ".maumau"), { recursive: true });
    await fs.writeFile(
      path.join(homeDir, ".maumau", "maumau.json"),
      JSON.stringify({
        gateway: {
          auth: {
            mode: "token",
            token: "fresh-gateway-token",
            allowTailscale: true,
          },
          tailscale: {
            mode: "serve",
          },
          controlUi: {
            basePath: "/control",
          },
        },
        commands: {
          ownerAllowFrom: ["telegram:12345"],
        },
      }),
    );

    await expect(
      resolveBootstrapSecureDashboardUrl({
        cfg: {},
        workspaceDir,
        isFirstTurnInSession: true,
        originatingChannel: "telegram",
        chatType: "direct",
        senderIsOwner: false,
        requesterSenderIsOwner: false,
        commandAuthorized: false,
        ctx: {
          Provider: "telegram",
          Surface: "telegram",
          ChatType: "direct",
          SenderId: "12345",
          From: "12345",
          To: "telegram:default:chat",
        },
      }),
    ).resolves.toBe("https://maumau.tailnet.ts.net/control/dashboard/today");
  });

  it("trusts persisted session owner state when the live run owner flag is stale", async () => {
    const workspaceDir = await makeWorkspace();
    previousTailnetDns = process.env.MAUMAU_TAILNET_DNS;
    process.env.MAUMAU_TAILNET_DNS = "maumau.tailnet.ts.net";

    await expect(
      resolveBootstrapSecureDashboardUrl({
        cfg: {
          gateway: {
            auth: {
              mode: "token",
              token: "gateway-token",
              allowTailscale: true,
            },
            tailscale: {
              mode: "serve",
            },
          },
        },
        workspaceDir,
        isFirstTurnInSession: true,
        originatingChannel: "telegram",
        chatType: "direct",
        senderIsOwner: false,
        requesterSenderIsOwner: true,
      }),
    ).resolves.toBe("https://maumau.tailnet.ts.net/dashboard/today");
  });

  it("skips non-owner chats, groups, webchat, and non-bootstrap workspaces", async () => {
    const noBootstrapWorkspace = await makeWorkspace(false);
    previousTailnetDns = process.env.MAUMAU_TAILNET_DNS;
    process.env.MAUMAU_TAILNET_DNS = "maumau.tailnet.ts.net";
    const cfg = {
      gateway: {
        auth: {
          mode: "token",
          token: "gateway-token",
          allowTailscale: true,
        },
        tailscale: {
          mode: "serve",
        },
      },
    } as const;

    await expect(
      resolveBootstrapSecureDashboardUrl({
        cfg,
        workspaceDir: noBootstrapWorkspace,
        isFirstTurnInSession: true,
        originatingChannel: "telegram",
        chatType: "direct",
        senderIsOwner: true,
      }),
    ).resolves.toBeUndefined();

    await expect(
      resolveBootstrapSecureDashboardUrl({
        cfg,
        workspaceDir: await makeWorkspace(),
        isFirstTurnInSession: true,
        originatingChannel: "telegram",
        chatType: "group",
        senderIsOwner: true,
      }),
    ).resolves.toBeUndefined();

    await expect(
      resolveBootstrapSecureDashboardUrl({
        cfg,
        workspaceDir: await makeWorkspace(),
        isFirstTurnInSession: true,
        originatingChannel: "webchat",
        chatType: "direct",
        senderIsOwner: true,
      }),
    ).resolves.toBeUndefined();

    await expect(
      resolveBootstrapSecureDashboardUrl({
        cfg,
        workspaceDir: await makeWorkspace(),
        isFirstTurnInSession: true,
        originatingChannel: "telegram",
        chatType: "direct",
        senderIsOwner: false,
        commandAuthorized: true,
      }),
    ).resolves.toBeUndefined();
  });
});

describe("buildBootstrapSecureDashboardSystemPrompt", () => {
  it("asks the agent to mention the exact URL early", async () => {
    const workspaceDir = await makeWorkspace();
    previousTailnetDns = process.env.MAUMAU_TAILNET_DNS;
    process.env.MAUMAU_TAILNET_DNS = "maumau.tailnet.ts.net";

    const prompt = await buildBootstrapSecureDashboardSystemPrompt({
      cfg: {
        gateway: {
          auth: {
            mode: "token",
            token: "gateway-token",
            allowTailscale: true,
          },
          tailscale: {
            mode: "serve",
          },
        },
      },
      workspaceDir,
      isFirstTurnInSession: true,
      originatingChannel: "telegram",
      chatType: "direct",
      senderIsOwner: true,
    });

    expect(prompt).toContain("Mention this exact URL early");
    expect(prompt).toContain("https://maumau.tailnet.ts.net/dashboard/today");
    expect(prompt).toContain("approve it there before the link will work");
  });
});

describe("injectBootstrapSecureDashboardUrlIntoPayloads", () => {
  it("prepends the dashboard URL to the first non-error text payload", () => {
    expect(
      injectBootstrapSecureDashboardUrlIntoPayloads(
        [{ text: "Hello there." }],
        "https://maumau.tailnet.ts.net/dashboard/today",
      ),
    ).toEqual([
      {
        text: [
          "Phone dashboard: https://maumau.tailnet.ts.net/dashboard/today",
          "If your computer shows a pairing request, approve it there first before this link will work.",
          "Hello there.",
        ].join("\n\n"),
      },
    ]);
  });

  it("does not duplicate the dashboard URL when the reply already contains it", () => {
    expect(
      injectBootstrapSecureDashboardUrlIntoPayloads(
        [{ text: "Open this first: https://maumau.tailnet.ts.net/dashboard/today" }],
        "https://maumau.tailnet.ts.net/dashboard/today",
      ),
    ).toEqual([{ text: "Open this first: https://maumau.tailnet.ts.net/dashboard/today" }]);
  });
});
