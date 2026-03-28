import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { copyA2uiAssets } from "../../scripts/canvas-a2ui-copy.js";

describe("canvas a2ui copy", () => {
  async function withA2uiFixture(run: (dir: string) => Promise<void>) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-a2ui-"));
    try {
      await run(dir);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }

  it("throws a helpful error when assets are missing", async () => {
    await withA2uiFixture(async (dir) => {
      await expect(copyA2uiAssets({ srcDir: dir, outDir: path.join(dir, "out") })).rejects.toThrow(
        'Run "pnpm canvas:a2ui:bundle"',
      );
    });
  });

  it("skips missing assets when MAUMAU_A2UI_SKIP_MISSING=1", async () => {
    await withA2uiFixture(async (dir) => {
      const previous = process.env.MAUMAU_A2UI_SKIP_MISSING;
      process.env.MAUMAU_A2UI_SKIP_MISSING = "1";
      try {
        await expect(
          copyA2uiAssets({ srcDir: dir, outDir: path.join(dir, "out") }),
        ).resolves.toBeUndefined();
      } finally {
        if (previous === undefined) {
          delete process.env.MAUMAU_A2UI_SKIP_MISSING;
        } else {
          process.env.MAUMAU_A2UI_SKIP_MISSING = previous;
        }
      }
    });
  });

  it("copies bundled assets to dist", async () => {
    await withA2uiFixture(async (dir) => {
      const srcDir = path.join(dir, "src");
      const outDir = path.join(dir, "dist");
      await fs.mkdir(srcDir, { recursive: true });
      await fs.writeFile(path.join(srcDir, "index.html"), "<html></html>", "utf8");
      await fs.writeFile(path.join(srcDir, "a2ui.bundle.js"), "console.log(1);", "utf8");

      await copyA2uiAssets({ srcDir, outDir });

      await expect(fs.stat(path.join(outDir, "index.html"))).resolves.toBeTruthy();
      await expect(fs.stat(path.join(outDir, "a2ui.bundle.js"))).resolves.toBeTruthy();
    });
  });

  it("replaces an existing output directory on repeated copies", async () => {
    await withA2uiFixture(async (dir) => {
      const srcDir = path.join(dir, "src");
      const outDir = path.join(dir, "dist");
      await fs.mkdir(srcDir, { recursive: true });
      await fs.writeFile(path.join(srcDir, "index.html"), "<html>first</html>", "utf8");
      await fs.writeFile(path.join(srcDir, "a2ui.bundle.js"), "console.log('first');", "utf8");

      await copyA2uiAssets({ srcDir, outDir });

      await fs.writeFile(path.join(srcDir, "index.html"), "<html>second</html>", "utf8");
      await fs.writeFile(path.join(srcDir, "a2ui.bundle.js"), "console.log('second');", "utf8");

      await expect(copyA2uiAssets({ srcDir, outDir })).resolves.toBeUndefined();
      await expect(fs.readFile(path.join(outDir, "index.html"), "utf8")).resolves.toBe(
        "<html>second</html>",
      );
      await expect(fs.readFile(path.join(outDir, "a2ui.bundle.js"), "utf8")).resolves.toBe(
        "console.log('second');",
      );
    });
  });
});
