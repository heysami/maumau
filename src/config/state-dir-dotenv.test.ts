import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readStateDirDotEnvVars, upsertStateDirDotEnvVarSync } from "./state-dir-dotenv.js";
import { withTempHome, writeStateDirDotEnv } from "./test-helpers.js";

describe("upsertStateDirDotEnvVarSync", () => {
  it("replaces a single key while preserving unrelated lines", async () => {
    await withTempHome(async (home) => {
      const stateDir = path.join(home, ".maumau");
      await writeStateDirDotEnv("# keep\nOTHER_KEY=1\nOPENAI_API_KEY=old\n", { stateDir });
      const env = { MAUMAU_STATE_DIR: stateDir } as NodeJS.ProcessEnv;

      const result = upsertStateDirDotEnvVarSync({
        key: "OPENAI_API_KEY",
        value: "sk-new=value",
        env,
      });

      expect(result.key).toBe("OPENAI_API_KEY");
      expect(result.wrote).toBe(true);
      expect(env.OPENAI_API_KEY).toBe("sk-new=value");

      const raw = await fs.readFile(path.join(stateDir, ".env"), "utf8");
      expect(raw).toContain("# keep");
      expect(raw).toContain("OTHER_KEY=1");
      expect(raw).toContain('OPENAI_API_KEY="sk-new=value"');
      expect(raw).not.toContain("OPENAI_API_KEY=old");

      expect(readStateDirDotEnvVars(env).OPENAI_API_KEY).toBe("sk-new=value");
    });
  });
});
