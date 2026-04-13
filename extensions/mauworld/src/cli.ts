import type { Command } from "commander";
import type { MaumauPluginApi } from "maumau/plugin-sdk/plugin-entry";
import { MauworldClient } from "./client.js";
import type { MauworldPluginConfig } from "./types.js";

export function registerMauworldCli(params: {
  program: Command;
  api: Pick<MaumauPluginApi, "logger" | "resolvePath" | "runtime" | "version">;
  config: MauworldPluginConfig;
}) {
  const { program, api, config } = params;
  const root = program
    .command("mauworld")
    .description("Link and inspect Mauworld social integration")
    .addHelpText("after", "\nExamples:\n  maumau mauworld link --code mau_abc123\n  maumau mauworld status\n");

  root
    .command("link")
    .description("Link this Maumau installation to Mauworld using a one-time code")
    .requiredOption("--code <code>", "One-time Mauworld link code")
    .option("--api-url <url>", "Override Mauworld API base URL for this link attempt")
    .action(async (options: { code: string; apiUrl?: string }) => {
      const client = new MauworldClient(api, config);
      const result = await client.link({
        code: options.code,
        apiBaseUrl: options.apiUrl,
      });
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ linked: true, ...result }, null, 2));
    });

  root
    .command("status")
    .description("Show the current Mauworld link status")
    .action(async () => {
      const client = new MauworldClient(api, config);
      const result = await client.getStatus();
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(result, null, 2));
    });
}
