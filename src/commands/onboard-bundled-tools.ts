import { createWriteStream, constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import { request } from "node:https";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fetchOllamaModels } from "../agents/ollama-models.js";
import { resolveGoogleChromeExecutableForPlatform } from "../browser/chrome.executables.js";
import type { MaumauConfig } from "../config/config.js";
import { resolveAgentModelPrimaryValue } from "../config/model-input.js";
import { resolveStateDir } from "../config/paths.js";
import { runCommandWithTimeout } from "../process/exec.js";
import type { RuntimeEnv } from "../runtime.js";

const GOOGLE_CHROME_MAC_DMG_URL = "https://dl.google.com/chrome/mac/stable/GGRO/googlechrome.dmg";
const GOOGLE_CHROME_LINUX_DEB_URL =
  "https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb";
const CLAWD_CURSOR_INSTALL_SH_URL = "https://clawdcursor.com/install.sh";
const CLAWD_CURSOR_INSTALL_PS1_URL = "https://clawdcursor.com/install.ps1";
const CLAWD_CURSOR_HOME_DIRNAME = "clawdcursor";
const CLAWD_CURSOR_MANAGED_DIRNAME = "clawdcursor";
const CLAWD_CURSOR_MANAGED_CONFIG_FILENAME = ".clawdcursor-config.json";
const CLAWD_CURSOR_DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434/v1";
const DEFAULT_INSTALL_TIMEOUT_MS = 20 * 60_000;

export type BundledFreshInstallToolId = "chrome" | "clawd-cursor";
export type BundledFreshInstallToolStatus =
  | "already-installed"
  | "installed"
  | "configured"
  | "failed"
  | "skipped";

export type BundledFreshInstallToolResult = {
  id: BundledFreshInstallToolId;
  status: BundledFreshInstallToolStatus;
  detail: string;
};

export type FreshInstallBundledToolsResult = {
  attempted: boolean;
  ok: boolean;
  fullyReady: boolean;
  results: BundledFreshInstallToolResult[];
};

type CommandRunner = typeof runCommandWithTimeout;
type ChromeResolver = typeof resolveGoogleChromeExecutableForPlatform;
type Logger = Pick<RuntimeEnv, "log">;

type FreshInstallBundledToolsParams = {
  freshInstall: boolean;
  runtime: Logger;
  config?: MaumauConfig;
  platform?: NodeJS.Platform;
  arch?: string;
  homeDir?: string;
  env?: NodeJS.ProcessEnv;
  stateDir?: string;
  runCommand?: CommandRunner;
  resolveChromeExecutable?: ChromeResolver;
  downloadToFile?: (url: string, dest: string) => Promise<void>;
  fetchOllamaModels?: typeof fetchOllamaModels;
  probeOllamaTextModel?: (baseUrl: string, model: string) => Promise<boolean>;
};

function trimOutput(value: string | undefined, maxChars = 400): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return "";
  }
  return trimmed.length <= maxChars ? trimmed : `${trimmed.slice(0, maxChars)}…`;
}

function formatFailureDetail(
  label: string,
  result: {
    code: number | null;
    stdout: string;
    stderr: string;
  },
): string {
  const stderr = trimOutput(result.stderr);
  const stdout = trimOutput(result.stdout);
  const details = [
    `${label} failed`,
    typeof result.code === "number" ? `(exit ${String(result.code)})` : "",
    stderr ? `stderr: ${stderr}` : "",
    stdout ? `stdout: ${stdout}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return details || `${label} failed.`;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function isExecutable(
  filePath: string,
  platform: NodeJS.Platform = process.platform,
): Promise<boolean> {
  try {
    await fs.access(filePath, platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function downloadToFile(url: string, dest: string, maxRedirects = 5): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = request(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
        const location = res.headers.location;
        if (!location || maxRedirects <= 0) {
          reject(new Error("Redirect loop or missing Location header"));
          return;
        }
        const redirectUrl = new URL(location, url).href;
        resolve(downloadToFile(redirectUrl, dest, maxRedirects - 1));
        return;
      }
      if (!res.statusCode || res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode ?? "?"} downloading file`));
        return;
      }
      const out = createWriteStream(dest);
      pipeline(res, out).then(resolve).catch(reject);
    });
    req.on("error", reject);
    req.end();
  });
}

async function commandExists(
  runCommand: CommandRunner,
  command: string,
  platform: NodeJS.Platform,
): Promise<boolean> {
  const result =
    platform === "win32"
      ? await runCommand(["where", command], { timeoutMs: 2_000 })
      : await runCommand(["sh", "-lc", `command -v ${command}`], { timeoutMs: 2_000 });
  return result.code === 0 && Boolean(result.stdout.trim());
}

function prependPath(dirPath: string, env: NodeJS.ProcessEnv): void {
  if (!dirPath) {
    return;
  }
  const delimiter = path.delimiter;
  const current = env.PATH ?? process.env.PATH ?? "";
  const parts = current.split(delimiter).filter(Boolean);
  if (parts.includes(dirPath)) {
    return;
  }
  const next = [dirPath, ...parts].join(delimiter);
  env.PATH = next;
  process.env.PATH = next;
}

async function resolveNpmGlobalBinDir(runCommand: CommandRunner, platform: NodeJS.Platform) {
  const result = await runCommand(["npm", "prefix", "-g"], { timeoutMs: 10_000 });
  if (result.code !== 0) {
    return undefined;
  }
  const prefix = result.stdout.trim();
  if (!prefix) {
    return undefined;
  }
  return platform === "win32" ? prefix : path.join(prefix, "bin");
}

function clawdCursorLocalBinaryCandidates(homeDir: string, platform: NodeJS.Platform): string[] {
  const base = path.join(homeDir, CLAWD_CURSOR_HOME_DIRNAME, "node_modules", ".bin");
  if (platform === "win32") {
    return [
      path.join(base, "clawdcursor.cmd"),
      path.join(base, "clawd-cursor.cmd"),
      path.join(base, "clawdcursor.exe"),
      path.join(base, "clawd-cursor.exe"),
    ];
  }
  return [path.join(base, "clawdcursor"), path.join(base, "clawd-cursor")];
}

async function findBinaryOnHost(params: {
  names: string[];
  platform: NodeJS.Platform;
  homeDir?: string;
  includeClawdLocalBin?: boolean;
  runCommand?: CommandRunner;
}): Promise<string | undefined> {
  const runCommand = params.runCommand ?? runCommandWithTimeout;
  if (params.platform === "win32") {
    for (const name of params.names) {
      const result = await runCommand(["where", name], { timeoutMs: 2_000 });
      const match = result.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
      if (result.code === 0 && match) {
        return match;
      }
    }
  } else {
    for (const name of params.names) {
      const result = await runCommand(["sh", "-lc", `command -v ${name}`], { timeoutMs: 2_000 });
      const match = result.stdout.trim();
      if (result.code === 0 && match) {
        return match;
      }
    }
  }

  if (params.includeClawdLocalBin) {
    const homeDir = params.homeDir ?? os.homedir();
    for (const candidate of clawdCursorLocalBinaryCandidates(homeDir, params.platform)) {
      if (await isExecutable(candidate, params.platform)) {
        return candidate;
      }
    }
  }

  return undefined;
}

export async function findClawdCursorBinaryOnHost(params?: {
  platform?: NodeJS.Platform;
  homeDir?: string;
  runCommand?: CommandRunner;
}): Promise<string | undefined> {
  return await findBinaryOnHost({
    names: ["clawdcursor", "clawd-cursor"],
    platform: params?.platform ?? process.platform,
    homeDir: params?.homeDir,
    includeClawdLocalBin: true,
    runCommand: params?.runCommand,
  });
}

type ManagedClawdCursorConfig = {
  provider: "ollama";
  maumauManaged: true;
  pipeline: {
    layer2: {
      enabled: true;
      model: string;
      baseUrl: string;
      provider: "ollama";
    };
    layer3: {
      enabled: false;
      model: string;
      baseUrl: string;
      computerUse: false;
      provider: "ollama";
    };
  };
  diagnosedAt: string;
};

function resolveClawdCursorManagedDir(params?: {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  stateDir?: string;
}) {
  const env = params?.env ?? process.env;
  const stateDir = params?.stateDir ?? resolveStateDir(env, () => params?.homeDir ?? os.homedir());
  return path.join(stateDir, CLAWD_CURSOR_MANAGED_DIRNAME);
}

export function resolveClawdCursorManagedConfigPath(params?: {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  stateDir?: string;
}) {
  return path.join(resolveClawdCursorManagedDir(params), CLAWD_CURSOR_MANAGED_CONFIG_FILENAME);
}

export async function hasClawdCursorManagedConfig(params?: {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  stateDir?: string;
}): Promise<boolean> {
  return await pathExists(resolveClawdCursorManagedConfigPath(params));
}

export async function readClawdCursorConsentAccepted(params?: {
  homeDir?: string;
}): Promise<boolean> {
  const consentPath = path.join(params?.homeDir ?? os.homedir(), ".clawdcursor", "consent");
  try {
    const raw = JSON.parse(await fs.readFile(consentPath, "utf8")) as { accepted?: unknown };
    return raw.accepted === true;
  } catch {
    return false;
  }
}

function resolveOllamaOpenAiBase(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  return trimmed.toLowerCase().endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function isLikelyVisionOnlyOllamaModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return lower.startsWith("llava") || lower.startsWith("bakllava") || lower.startsWith("moondream");
}

function collectPreferredOllamaModels(config: MaumauConfig | undefined): string[] {
  const preferred = new Set<string>();
  const primaryModel = resolveAgentModelPrimaryValue(config?.agents?.defaults?.model);
  if (primaryModel?.startsWith("ollama/")) {
    preferred.add(primaryModel.slice("ollama/".length).trim());
  }
  for (const model of config?.models?.providers?.ollama?.models ?? []) {
    if (typeof model?.id === "string" && model.id.trim()) {
      preferred.add(model.id.trim());
    }
  }
  return Array.from(preferred);
}

function rankOllamaTextModelCandidates(
  availableModels: string[],
  preferredModels: string[],
): string[] {
  const ordered: string[] = [];
  const add = (modelId: string | undefined) => {
    const trimmed = modelId?.trim();
    if (!trimmed || ordered.includes(trimmed) || !availableModels.includes(trimmed)) {
      return;
    }
    if (isLikelyVisionOnlyOllamaModel(trimmed)) {
      return;
    }
    ordered.push(trimmed);
  };

  for (const preferred of preferredModels) {
    add(preferred);
  }

  const patterns = [/^qwen2\.5/i, /^qwen3/i, /^llama3\.2/i, /^llama/i, /^deepseek/i];
  for (const pattern of patterns) {
    add(availableModels.find((modelId) => pattern.test(modelId)));
  }

  for (const modelId of availableModels) {
    add(modelId);
  }

  return ordered;
}

async function probeOllamaTextModel(baseUrl: string, model: string): Promise<boolean> {
  try {
    const response = await fetch(`${resolveOllamaOpenAiBase(baseUrl)}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 5,
        temperature: 0,
        messages: [{ role: "user", content: 'Reply with just the word "ok"' }],
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      return false;
    }
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim().toLowerCase() ?? "";
    return content === "ok";
  } catch {
    return false;
  }
}

function buildManagedClawdCursorConfig(params: {
  baseUrl: string;
  model: string;
}): ManagedClawdCursorConfig {
  return {
    provider: "ollama",
    maumauManaged: true,
    pipeline: {
      layer2: {
        enabled: true,
        model: params.model,
        baseUrl: resolveOllamaOpenAiBase(params.baseUrl),
        provider: "ollama",
      },
      layer3: {
        enabled: false,
        model: params.model,
        baseUrl: resolveOllamaOpenAiBase(params.baseUrl),
        computerUse: false,
        provider: "ollama",
      },
    },
    diagnosedAt: new Date().toISOString(),
  };
}

async function ensureClawdCursorManagedBootstrap(params: {
  binaryPath: string;
  config?: MaumauConfig;
  homeDir: string;
  env: NodeJS.ProcessEnv;
  stateDir?: string;
  runCommand: CommandRunner;
  fetchOllamaModelsImpl: typeof fetchOllamaModels;
  probeOllamaTextModelImpl: (baseUrl: string, model: string) => Promise<boolean>;
}): Promise<{ configured: boolean; detail: string }> {
  const managedConfigPath = resolveClawdCursorManagedConfigPath({
    env: params.env,
    homeDir: params.homeDir,
    stateDir: params.stateDir,
  });
  const managedDir = path.dirname(managedConfigPath);

  if (!(await readClawdCursorConsentAccepted({ homeDir: params.homeDir }))) {
    const consent = await params.runCommand([params.binaryPath, "consent", "--accept"], {
      timeoutMs: 15_000,
      env: params.env,
    });
    if (consent.code !== 0) {
      return {
        configured: false,
        detail: formatFailureDetail("Clawd Cursor consent", consent),
      };
    }
  }

  if (await pathExists(managedConfigPath)) {
    return {
      configured: true,
      detail: `Clawd Cursor is pre-consented and staged at ${managedConfigPath}.`,
    };
  }

  const configuredOllamaBaseUrl = params.config?.models?.providers?.ollama?.baseUrl;
  const baseUrl =
    typeof configuredOllamaBaseUrl === "string" && configuredOllamaBaseUrl.trim()
      ? configuredOllamaBaseUrl.trim()
      : CLAWD_CURSOR_DEFAULT_OLLAMA_BASE_URL;
  const ollama = await params.fetchOllamaModelsImpl(baseUrl);
  if (!ollama.reachable) {
    return {
      configured: false,
      detail:
        "Clawd Cursor was pre-consented, but Ollama was not reachable, so Maumau could not stage a no-intervention local model for desktop control.",
    };
  }
  if (ollama.models.length === 0) {
    return {
      configured: false,
      detail:
        "Clawd Cursor was pre-consented, but Ollama has no local models yet, so desktop control still needs a model download before it can run unattended.",
    };
  }

  const availableModels = ollama.models
    .map((model) => model.name?.trim() ?? "")
    .filter((model): model is string => model.length > 0);
  const candidates = rankOllamaTextModelCandidates(
    availableModels,
    collectPreferredOllamaModels(params.config),
  );

  for (const candidate of candidates) {
    const usable = await params.probeOllamaTextModelImpl(baseUrl, candidate);
    if (!usable) {
      continue;
    }
    await fs.mkdir(managedDir, { recursive: true });
    await fs.writeFile(
      managedConfigPath,
      `${JSON.stringify(buildManagedClawdCursorConfig({ baseUrl, model: candidate }), null, 2)}\n`,
      "utf8",
    );
    return {
      configured: true,
      detail: `Clawd Cursor is pre-consented and staged with Ollama model ${candidate} at ${managedConfigPath}.`,
    };
  }

  return {
    configured: false,
    detail:
      "Clawd Cursor was pre-consented, but none of the local Ollama models passed Maumau's unattended desktop-control probe yet.",
  };
}

async function installChromeOnMac(params: {
  homeDir: string;
  downloadToFile: (url: string, dest: string) => Promise<void>;
  runCommand: CommandRunner;
}): Promise<BundledFreshInstallToolResult> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-chrome-"));
  const dmgPath = path.join(tmpDir, "googlechrome.dmg");
  const mountDir = path.join(tmpDir, "mnt");
  const destinationDir = path.join(params.homeDir, "Applications");
  const destinationApp = path.join(destinationDir, "Google Chrome.app");
  let attached = false;

  try {
    await params.downloadToFile(GOOGLE_CHROME_MAC_DMG_URL, dmgPath);
    await fs.mkdir(mountDir, { recursive: true });
    await fs.mkdir(destinationDir, { recursive: true });

    const attach = await params.runCommand(
      ["hdiutil", "attach", dmgPath, "-nobrowse", "-readonly", "-mountpoint", mountDir],
      { timeoutMs: DEFAULT_INSTALL_TIMEOUT_MS },
    );
    if (attach.code !== 0) {
      return {
        id: "chrome",
        status: "failed",
        detail: formatFailureDetail("hdiutil attach", attach),
      };
    }
    attached = true;

    const mountedApp = path.join(mountDir, "Google Chrome.app");
    if (!(await pathExists(mountedApp))) {
      return {
        id: "chrome",
        status: "failed",
        detail: "Mounted Google Chrome image did not contain Google Chrome.app.",
      };
    }

    await fs.rm(destinationApp, { recursive: true, force: true });
    const copy = await params.runCommand(["ditto", mountedApp, destinationApp], {
      timeoutMs: DEFAULT_INSTALL_TIMEOUT_MS,
    });
    if (copy.code !== 0) {
      return {
        id: "chrome",
        status: "failed",
        detail: formatFailureDetail("ditto", copy),
      };
    }

    return {
      id: "chrome",
      status: "installed",
      detail: `Installed Google Chrome to ${destinationApp}.`,
    };
  } catch (err) {
    return {
      id: "chrome",
      status: "failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (attached) {
      await params
        .runCommand(["hdiutil", "detach", mountDir], {
          timeoutMs: 60_000,
        })
        .catch(() => undefined);
    }
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function installChromeOnLinux(params: {
  arch: string;
  downloadToFile: (url: string, dest: string) => Promise<void>;
  runCommand: CommandRunner;
}): Promise<BundledFreshInstallToolResult> {
  if (params.arch !== "x64") {
    return {
      id: "chrome",
      status: "skipped",
      detail: `Automatic Chrome install currently supports Linux x64 only (found ${params.arch}).`,
    };
  }
  const hasAptGet = await commandExists(params.runCommand, "apt-get", "linux");
  if (!hasAptGet) {
    return {
      id: "chrome",
      status: "skipped",
      detail:
        "Automatic Chrome install requires apt-get on Linux. Install Google Chrome manually on this host.",
    };
  }

  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  let installPrefix: string[] | null = isRoot ? ["apt-get"] : null;
  if (!installPrefix) {
    const hasSudo = await commandExists(params.runCommand, "sudo", "linux");
    if (!hasSudo) {
      return {
        id: "chrome",
        status: "skipped",
        detail:
          "Automatic Chrome install requires sudo access on Linux. Install Google Chrome manually or re-run with sudo available.",
      };
    }
    const sudoCheck = await params.runCommand(["sudo", "-n", "true"], { timeoutMs: 5_000 });
    if (sudoCheck.code !== 0) {
      return {
        id: "chrome",
        status: "skipped",
        detail:
          "Automatic Chrome install requires passwordless sudo during onboarding. Install Google Chrome manually or re-run from a sudo-capable session.",
      };
    }
    installPrefix = ["sudo", "-n", "apt-get"];
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-chrome-"));
  const debPath = path.join(tmpDir, "google-chrome.deb");
  try {
    await params.downloadToFile(GOOGLE_CHROME_LINUX_DEB_URL, debPath);
    const install = await params.runCommand([...installPrefix, "install", "-y", debPath], {
      timeoutMs: DEFAULT_INSTALL_TIMEOUT_MS,
    });
    if (install.code !== 0) {
      return {
        id: "chrome",
        status: "failed",
        detail: formatFailureDetail("apt-get install", install),
      };
    }
    return {
      id: "chrome",
      status: "installed",
      detail: "Installed Google Chrome with apt-get.",
    };
  } catch (err) {
    return {
      id: "chrome",
      status: "failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function installChromeOnWindows(params: {
  runCommand: CommandRunner;
}): Promise<BundledFreshInstallToolResult> {
  const hasWinget = await commandExists(params.runCommand, "winget", "win32");
  if (!hasWinget) {
    return {
      id: "chrome",
      status: "skipped",
      detail:
        "Automatic Chrome install requires winget on Windows. Install Google Chrome manually on this host.",
    };
  }
  const install = await params.runCommand(
    [
      "winget",
      "install",
      "--id",
      "Google.Chrome",
      "--exact",
      "--silent",
      "--accept-package-agreements",
      "--accept-source-agreements",
    ],
    { timeoutMs: DEFAULT_INSTALL_TIMEOUT_MS },
  );
  if (install.code !== 0) {
    return {
      id: "chrome",
      status: "failed",
      detail: formatFailureDetail("winget install", install),
    };
  }
  return {
    id: "chrome",
    status: "installed",
    detail: "Installed Google Chrome with winget.",
  };
}

async function installChrome(params: {
  platform: NodeJS.Platform;
  arch: string;
  homeDir: string;
  downloadToFile: (url: string, dest: string) => Promise<void>;
  runCommand: CommandRunner;
}): Promise<BundledFreshInstallToolResult> {
  if (params.platform === "darwin") {
    return await installChromeOnMac(params);
  }
  if (params.platform === "linux") {
    return await installChromeOnLinux(params);
  }
  if (params.platform === "win32") {
    return await installChromeOnWindows(params);
  }
  return {
    id: "chrome",
    status: "skipped",
    detail: `Automatic Chrome install is not supported on ${params.platform}.`,
  };
}

async function installClawdCursor(params: {
  platform: NodeJS.Platform;
  homeDir: string;
  env: NodeJS.ProcessEnv;
  runCommand: CommandRunner;
  downloadToFile: (url: string, dest: string) => Promise<void>;
}): Promise<BundledFreshInstallToolResult> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-clawd-cursor-"));
  try {
    if (params.platform === "win32") {
      const scriptPath = path.join(tmpDir, "install.ps1");
      await params.downloadToFile(CLAWD_CURSOR_INSTALL_PS1_URL, scriptPath);
      const install = await params.runCommand(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
        { timeoutMs: DEFAULT_INSTALL_TIMEOUT_MS, env: params.env },
      );
      if (install.code !== 0) {
        return {
          id: "clawd-cursor",
          status: "failed",
          detail: formatFailureDetail("Clawd Cursor install", install),
        };
      }
    } else {
      const scriptPath = path.join(tmpDir, "install.sh");
      await params.downloadToFile(CLAWD_CURSOR_INSTALL_SH_URL, scriptPath);
      const install = await params.runCommand(["bash", scriptPath], {
        timeoutMs: DEFAULT_INSTALL_TIMEOUT_MS,
        env: params.env,
      });
      if (install.code !== 0) {
        return {
          id: "clawd-cursor",
          status: "failed",
          detail: formatFailureDetail("Clawd Cursor install", install),
        };
      }
    }

    const npmGlobalBin = await resolveNpmGlobalBinDir(params.runCommand, params.platform);
    if (npmGlobalBin) {
      prependPath(npmGlobalBin, params.env);
    }
    prependPath(
      path.join(params.homeDir, CLAWD_CURSOR_HOME_DIRNAME, "node_modules", ".bin"),
      params.env,
    );

    const binaryPath = await findClawdCursorBinaryOnHost({
      platform: params.platform,
      homeDir: params.homeDir,
      runCommand: params.runCommand,
    });
    if (!binaryPath) {
      return {
        id: "clawd-cursor",
        status: "failed",
        detail:
          "Clawd Cursor install finished, but the clawdcursor binary was still not discoverable. Reopen the terminal or add the npm global bin directory to PATH.",
      };
    }

    return {
      id: "clawd-cursor",
      status: "installed",
      detail: `Installed Clawd Cursor (${binaryPath}).`,
    };
  } catch (err) {
    return {
      id: "clawd-cursor",
      status: "failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function ensureFreshInstallBundledTools(
  params: FreshInstallBundledToolsParams,
): Promise<FreshInstallBundledToolsResult> {
  if (!params.freshInstall) {
    return {
      attempted: false,
      ok: true,
      fullyReady: true,
      results: [],
    };
  }

  const platform = params.platform ?? process.platform;
  const arch = params.arch ?? process.arch;
  const homeDir = params.homeDir ?? os.homedir();
  const env = params.env ?? process.env;
  const stateDir = params.stateDir;
  const runCommand = params.runCommand ?? runCommandWithTimeout;
  const resolveChromeExecutable =
    params.resolveChromeExecutable ?? resolveGoogleChromeExecutableForPlatform;
  const download = params.downloadToFile ?? downloadToFile;
  const fetchOllamaModelsImpl = params.fetchOllamaModels ?? fetchOllamaModels;
  const probeOllamaTextModelImpl = params.probeOllamaTextModel ?? probeOllamaTextModel;
  const results: BundledFreshInstallToolResult[] = [];

  const chrome = resolveChromeExecutable(platform);
  if (chrome) {
    results.push({
      id: "chrome",
      status: "already-installed",
      detail: `Google Chrome already present at ${chrome.path}.`,
    });
  } else {
    params.runtime.log("Fresh install: provisioning Google Chrome for browser existing-session.");
    results.push(
      await installChrome({
        platform,
        arch,
        homeDir,
        downloadToFile: download,
        runCommand,
      }),
    );
  }

  let clawdBinary = await findClawdCursorBinaryOnHost({
    platform,
    homeDir,
    runCommand,
  });
  let clawdInstallStatus: BundledFreshInstallToolStatus = "already-installed";
  let clawdInstallDetail = clawdBinary ? `Clawd Cursor already present at ${clawdBinary}.` : "";

  if (!clawdBinary) {
    params.runtime.log("Fresh install: provisioning Clawd Cursor for desktop fallback.");
    const installResult = await installClawdCursor({
      platform,
      homeDir,
      env,
      runCommand,
      downloadToFile: download,
    });
    if (installResult.status === "failed") {
      results.push(installResult);
      return {
        attempted: true,
        ok: false,
        fullyReady: false,
        results,
      };
    }
    clawdInstallStatus = installResult.status;
    clawdInstallDetail = installResult.detail;
    clawdBinary = await findClawdCursorBinaryOnHost({
      platform,
      homeDir,
      runCommand,
    });
  }

  if (clawdBinary) {
    params.runtime.log(
      "Fresh install: pre-consenting and staging Clawd Cursor for unattended use.",
    );
    const bootstrap = await ensureClawdCursorManagedBootstrap({
      binaryPath: clawdBinary,
      config: params.config,
      homeDir,
      env,
      stateDir,
      runCommand,
      fetchOllamaModelsImpl,
      probeOllamaTextModelImpl,
    });
    results.push({
      id: "clawd-cursor",
      status: bootstrap.configured ? "configured" : clawdInstallStatus,
      detail: bootstrap.configured
        ? bootstrap.detail
        : `${clawdInstallDetail} ${bootstrap.detail}`.trim(),
    });
  } else {
    results.push({
      id: "clawd-cursor",
      status: "failed",
      detail:
        "Clawd Cursor install finished, but the binary still was not discoverable for managed setup.",
    });
  }

  return {
    attempted: true,
    ok: results.every((result) => result.status !== "failed"),
    fullyReady: results.every((result) =>
      result.id === "clawd-cursor" ? result.status === "configured" : result.status !== "failed",
    ),
    results,
  };
}
