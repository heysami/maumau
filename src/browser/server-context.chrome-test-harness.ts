import { vi } from "vitest";
import { installChromeUserDataDirHooks } from "./chrome-user-data-dir.test-harness.js";

const chromeUserDataDir = { dir: "/tmp/maumau" };
installChromeUserDataDirHooks(chromeUserDataDir);

vi.mock("./chrome.js", () => ({
  isChromeCdpReady: vi.fn(async () => true),
  isChromeReachable: vi.fn(async () => true),
  launchMaumauChrome: vi.fn(async () => {
    throw new Error("unexpected launch");
  }),
  resolveMaumauUserDataDir: vi.fn(() => chromeUserDataDir.dir),
  stopMaumauChrome: vi.fn(async () => {}),
}));
