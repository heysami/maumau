import { describe, expect, it } from "vitest";
import type { MaumauConfig } from "../runtime-api.js";
import { mattermostSetupWizard } from "./setup-surface.js";

describe("mattermost setup status", () => {
  it("treats SecretRef botToken as configured when baseUrl is present", async () => {
    const configured = await mattermostSetupWizard.status.resolveConfigured({
      cfg: {
        channels: {
          mattermost: {
            baseUrl: "https://chat.example.test",
            botToken: {
              source: "env",
              provider: "default",
              id: "MATTERMOST_BOT_TOKEN",
            },
          },
        },
      } as MaumauConfig,
    });

    expect(configured).toBe(true);
  });
});
