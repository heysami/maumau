import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { withTempHome } from "../../test/helpers/temp-home.js";
import { setupCommand } from "./setup.js";

describe("setupCommand", () => {
  it("writes gateway.mode=local plus fresh-install plugin defaults on first run", async () => {
    await withTempHome(async (home) => {
      const runtime = {
        log: vi.fn(),
        error: vi.fn(),
        exit: vi.fn(),
      };

      await setupCommand(undefined, runtime);

      const configPath = path.join(home, ".maumau", "maumau.json");
      const raw = JSON.parse(await fs.readFile(configPath, "utf-8")) as {
        agents?: { defaults?: { workspace?: string } };
        gateway?: { mode?: string };
        plugins?: {
          entries?: {
            mauworld?: {
              enabled?: boolean;
              config?: Record<string, unknown>;
            };
          };
        };
      };

      expect(raw.gateway?.mode).toBe("local");
      expect(raw.agents?.defaults?.workspace).toBeTruthy();
      expect(raw.plugins?.entries?.mauworld).toEqual({
        enabled: true,
        config: {
          apiBaseUrl: "https://mauworld-api.onrender.com/api",
          autoHeartbeat: true,
          autoLinkOnFreshInstall: true,
          mainAgentId: "main",
          timeoutMs: 15_000,
          displayName: "Main Mau Agent",
        },
      });
    });
  });

  it("adds gateway.mode=local to an existing config without overwriting workspace", async () => {
    await withTempHome(async (home) => {
      const runtime = {
        log: vi.fn(),
        error: vi.fn(),
        exit: vi.fn(),
      };
      const configDir = path.join(home, ".maumau");
      const configPath = path.join(configDir, "maumau.json");
      const workspace = path.join(home, "custom-workspace");

      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(
        configPath,
        JSON.stringify({
          agents: {
            defaults: {
              workspace,
            },
          },
        }),
      );

      await setupCommand(undefined, runtime);

      const raw = JSON.parse(await fs.readFile(configPath, "utf-8")) as {
        agents?: { defaults?: { workspace?: string } };
        gateway?: { mode?: string };
        plugins?: { entries?: Record<string, unknown> };
      };

      expect(raw.agents?.defaults?.workspace).toBe(workspace);
      expect(raw.gateway?.mode).toBe("local");
      expect(raw.plugins?.entries?.mauworld).toBeUndefined();
    });
  });
});
