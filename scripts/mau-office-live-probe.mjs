import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const tmpRoot = path.join(repoRoot, "ui", ".tmp");

function resolveDashboardUrl(input) {
  const hashIndex = input.indexOf("#");
  const base = hashIndex === -1 ? input : input.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : input.slice(hashIndex);
  const url = new URL(base);
  url.pathname = "/mau-office";
  url.search = "";
  return `${url.toString()}${hash}`;
}

async function main() {
  const dashboardUrl =
    process.argv[2] || process.env.MAU_OFFICE_DASHBOARD_URL || process.env.DASHBOARD_URL;
  if (!dashboardUrl) {
    throw new Error("Provide a tokenized dashboard URL as argv[2] or MAU_OFFICE_DASHBOARD_URL.");
  }

  await mkdir(tmpRoot, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1300 } });
  const sceneUrl = resolveDashboardUrl(dashboardUrl);
  await page.goto(sceneUrl, { waitUntil: "networkidle" });
  await page.waitForSelector(".mau-office__stage", { timeout: 30_000 });
  await page.waitForTimeout(750);

  const metrics = await page.evaluate(() => {
    function collect(selector) {
      return Array.from(document.querySelectorAll(selector)).map((node) => {
        const element = /** @type {HTMLElement} */ (node);
        const rect = element.getBoundingClientRect();
        const computed = window.getComputedStyle(element);
        return {
          selector,
          classes: element.className,
          style: element.getAttribute("style"),
          text: element.textContent?.trim() ?? "",
          src:
            element instanceof HTMLImageElement
              ? element.currentSrc || element.getAttribute("src")
              : null,
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          zIndex: computed.zIndex,
        };
      });
    }

    const viewport = document.querySelector(".mau-office__viewport");
    const stage = document.querySelector(".mau-office__stage");

    return {
      location: window.location.href,
      viewport: {
        style: viewport?.getAttribute("style") ?? null,
        width: viewport?.clientWidth ?? 0,
        height: viewport?.clientHeight ?? 0,
      },
      stage: {
        width: stage?.clientWidth ?? 0,
        height: stage?.clientHeight ?? 0,
      },
      workers: collect(".mau-office__worker"),
      deskSprites: collect(".mau-office__sprite--desk"),
      wallSprites: collect(".mau-office__sprite--wall"),
      counterSprites: collect(".mau-office__sprite--counter"),
      tableSprites: collect(".mau-office__sprite--table"),
      bubbles: collect(".mau-office__bubble"),
      badges: collect(".mau-office__worker-badge"),
      histories: collect(".mau-office__history"),
    };
  });

  const screenshotPath = path.join(tmpRoot, "mau-office-live.png");
  const metricsPath = path.join(tmpRoot, "mau-office-live-metrics.json");
  const critiquePath = path.join(tmpRoot, "mau-office-live-critique.json");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await writeFile(metricsPath, JSON.stringify(metrics, null, 2));
  await writeFile(
    critiquePath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        screenshotPath,
        metricsPath,
        sceneUrl,
        reviewStatus: "pending",
        beautyPass: false,
        requiredQuestions: [
          "Is this as beautiful as the MauOffice reference bar, or better?",
          "Does the room feel warm, cozy, polished, and intentional?",
          "Do the workers feel cute, expressive, and high-quality?",
          "Does the whole scene read as one art set instead of mixed assets?",
          "Would a human looking at this screenshot say this is lovely, not just passable?",
        ],
        notes: [],
      },
      null,
      2,
    ),
  );

  await browser.close();
  console.log(sceneUrl);
  console.log(screenshotPath);
  console.log(metricsPath);
  console.log(critiquePath);
}

await main();
