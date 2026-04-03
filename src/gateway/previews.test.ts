import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  AUTH_TOKEN,
  createRequest,
  createResponse,
  createTestGatewayServer,
  dispatchRequest,
} from "./server-http.test-harness.js";
import { withTempConfig } from "./test-temp-config.js";
const { deriveRecipientHint, publishPreviewArtifact, resolvePrivatePreviewAccess } =
  await import("./previews.js");

async function withFakeTailscaleBinary(
  outputs: {
    statusJson?: string;
    serveStatus?: string;
    funnelStatusJson?: string;
  },
  run: () => Promise<void>,
) {
  const binDir = await mkdtemp(path.join(os.tmpdir(), "maumau-preview-tailscale-bin-"));
  const binPath = path.join(binDir, "tailscale");
  const script = `#!/bin/sh
set -eu
if [ "$#" -ge 2 ] && [ "$1" = "status" ] && [ "$2" = "--json" ]; then
  cat <<'EOF'
${outputs.statusJson ?? '{"Self":{"DNSName":"preview.tailnet.ts.net."}}'}
EOF
  exit 0
fi
if [ "$#" -ge 2 ] && [ "$1" = "serve" ] && [ "$2" = "status" ]; then
  cat <<'EOF'
${outputs.serveStatus ?? 'https://preview.tailnet.ts.net (tailnet only)'}
EOF
  exit 0
fi
if [ "$#" -ge 3 ] && [ "$1" = "funnel" ] && [ "$2" = "status" ] && [ "$3" = "--json" ]; then
  cat <<'EOF'
${outputs.funnelStatusJson ?? '{"12345":{"HTTPS":true}}'}
EOF
  exit 0
fi
echo "unexpected tailscale args: $*" >&2
exit 1
`;
  await writeFile(binPath, script, "utf8");
  await chmod(binPath, 0o755);
  const prev = process.env.MAUMAU_TEST_TAILSCALE_BINARY;
  process.env.MAUMAU_TEST_TAILSCALE_BINARY = binPath;
  try {
    await run();
  } finally {
    if (prev === undefined) {
      delete process.env.MAUMAU_TEST_TAILSCALE_BINARY;
    } else {
      process.env.MAUMAU_TEST_TAILSCALE_BINARY = prev;
    }
    await rm(binDir, { recursive: true, force: true });
  }
}

async function withTempPreviewEnv(
  cfg: Record<string, unknown>,
  run: (params: { stateDir: string; workspaceDir: string }) => Promise<void>,
) {
  await withTempConfig({
    cfg,
    prefix: "maumau-preview-config-",
    run: async () => {
      const stateDir = await mkdtemp(path.join(os.tmpdir(), "maumau-preview-state-"));
      const workspaceDir = await mkdtemp(path.join(os.tmpdir(), "maumau-preview-workspace-"));
      const prevStateDir = process.env.MAUMAU_STATE_DIR;
      process.env.MAUMAU_STATE_DIR = stateDir;
      try {
        await run({ stateDir, workspaceDir });
      } finally {
        if (prevStateDir === undefined) {
          delete process.env.MAUMAU_STATE_DIR;
        } else {
          process.env.MAUMAU_STATE_DIR = prevStateDir;
        }
        await rm(stateDir, { recursive: true, force: true });
        await rm(workspaceDir, { recursive: true, force: true });
      }
    },
  });
}

describe("gateway previews", () => {
  afterEach(() => {
    delete process.env.MAUMAU_TEST_TAILSCALE_BINARY;
  });

  it("derives recipient hints in channel-first order with masked slugs", () => {
    expect(
      deriveRecipientHint({
        senderUsername: "Samiaji",
        senderName: "Sami Aji",
        requesterTailscaleLogin: "samiaji@example.com",
      }),
    ).toEqual(
      expect.objectContaining({
        source: "sender_username",
        normalizedSlug: "samiaji",
        maskedSlug: "sam-ji",
        displayLabel: "@Samiaji",
        verified: true,
      }),
    );
  });

  it("blocks private preview publication when the requester is not verified on Tailscale", async () => {
    await withFakeTailscaleBinary({ serveStatus: "https://preview.tailnet.ts.net (tailnet only)" }, async () => {
      await withTempPreviewEnv(
        {
          gateway: {
            tailscale: { mode: "serve" },
          },
        },
        async ({ workspaceDir }) => {
          await writeFile(path.join(workspaceDir, "index.html"), "<html>preview</html>\n", "utf8");
          const result = await publishPreviewArtifact({
            cfg: {
              gateway: {
                tailscale: { mode: "serve" },
              },
            },
            workspaceDir,
            sourcePath: "index.html",
            senderUsername: "samiaji",
          });
          expect(result.status).toBe("share_consent_required");
          expect(result.visibility).toBe("public-share");
          expect(result.confirmRequired).toBe(true);
          expect(result.recipientHint).toBe("sam-ji");
          expect(result.url).toBeUndefined();
        },
      );
    });
  });

  it("publishes private previews for trusted owner direct chats even without a route-level tailscale login", async () => {
    await withFakeTailscaleBinary({ serveStatus: "https://preview.tailnet.ts.net (tailnet only)" }, async () => {
      await withTempPreviewEnv(
        {
          gateway: {
            tailscale: { mode: "serve" },
          },
        },
        async ({ workspaceDir }) => {
          await writeFile(path.join(workspaceDir, "index.html"), "<html>preview</html>\n", "utf8");
          const result = await publishPreviewArtifact({
            cfg: {
              gateway: {
                tailscale: { mode: "serve" },
              },
            },
            workspaceDir,
            sourcePath: "index.html",
            senderIsOwner: true,
            senderUsername: "samiaji",
            messageChannel: "telegram",
          });
          expect(result.status).toBe("published");
          expect(result.visibility).toBe("private");
          expect(result.url).toContain("/preview/for-sam-ji/");
        },
      );
    });
  });

  it("reports private preview as not running when serve ingress is absent", async () => {
    await withFakeTailscaleBinary({ serveStatus: "No serve config" }, async () => {
      await expect(
        resolvePrivatePreviewAccess({
          cfg: {
            gateway: {
              tailscale: { mode: "serve" },
            },
          },
          senderIsOwner: true,
          requesterTailscaleLogin: "samiaji@example.com",
        }),
      ).resolves.toEqual(
        expect.objectContaining({
          ready: false,
          blockedReason: "service_not_running",
        }),
      );
    });
  });

  it("publishes confirmed public shares with masked recipient cues in the URL", async () => {
    await withFakeTailscaleBinary({ funnelStatusJson: '{"12345":{"HTTPS":true}}' }, async () => {
      await withTempPreviewEnv(
        {
          gateway: {
            tailscale: { mode: "funnel" },
          },
        },
        async ({ workspaceDir }) => {
          await writeFile(path.join(workspaceDir, "index.html"), "<html>shared</html>\n", "utf8");
          const result = await publishPreviewArtifact({
            cfg: {
              gateway: {
                tailscale: { mode: "funnel" },
              },
            },
            workspaceDir,
            sourcePath: "index.html",
            visibility: "public-share",
            confirmPublicShare: true,
            senderUsername: "samiaji",
          });
          expect(result.status).toBe("published");
          expect(result.visibility).toBe("public-share");
          expect(result.confirmRequired).toBe(false);
          expect(result.url).toContain("/share/for-sam-ji/");
          expect(result.shareId).toBeTruthy();
        },
      );
    });
  });

  it("serves private previews through the gateway and rejects masked-slug mismatches", async () => {
    await withFakeTailscaleBinary({ serveStatus: "https://preview.tailnet.ts.net (tailnet only)" }, async () => {
      await withTempPreviewEnv(
        {
          gateway: {
            tailscale: { mode: "serve" },
            trustedProxies: [],
          },
        },
        async ({ workspaceDir }) => {
          await writeFile(path.join(workspaceDir, "index.html"), "<html><body>hello preview</body></html>\n", "utf8");
          const result = await publishPreviewArtifact({
            cfg: {
              gateway: {
                tailscale: { mode: "serve" },
              },
            },
            workspaceDir,
            sourcePath: "index.html",
            senderUsername: "samiaji",
            requesterTailscaleLogin: "samiaji@example.com",
          });
          expect(result.status).toBe("published");
          const requestPath = new URL(result.url ?? "https://preview.invalid/").pathname;
          const server = createTestGatewayServer({ resolvedAuth: AUTH_TOKEN });

          const authorized = createResponse();
          await dispatchRequest(
            server,
            createRequest({
              path: requestPath,
              authorization: "Bearer test-token",
            }),
            authorized.res,
          );
          await new Promise((resolve) => setTimeout(resolve, 25));
          expect(authorized.res.statusCode).toBe(200);
          expect(authorized.getBody()).toContain("Created for @samiaji");
          expect(authorized.getBody()).toContain("hello preview");

          const wrongSlugPath = requestPath.replace(/\/for-[^/]+\//, "/for-other/");
          const wrongSlug = createResponse();
          await dispatchRequest(
            server,
            createRequest({
              path: wrongSlugPath,
              authorization: "Bearer test-token",
            }),
            wrongSlug.res,
          );
          await new Promise((resolve) => setTimeout(resolve, 25));
          expect(wrongSlug.res.statusCode).toBe(404);
          expect(wrongSlug.getBody()).toContain("invalid or expired");
        },
      );
    });
  });
});
