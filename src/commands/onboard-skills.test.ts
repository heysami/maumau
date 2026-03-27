import { describe, expect, it, vi } from "vitest";
import type { MaumauConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";

// Module under test imports these at module scope.
vi.mock("../agents/skills-status.js", () => ({
  buildWorkspaceSkillStatus: vi.fn(),
}));
vi.mock("../agents/skills-install.js", () => ({
  installSkill: vi.fn(),
}));
vi.mock("./onboard-helpers.js", () => ({
  detectBinary: vi.fn(),
  resolveNodeManagerOptions: vi.fn(() => [
    { value: "npm", label: "npm" },
    { value: "pnpm", label: "pnpm" },
    { value: "bun", label: "bun" },
  ]),
}));

import { installSkill } from "../agents/skills-install.js";
import { buildWorkspaceSkillStatus } from "../agents/skills-status.js";
import { detectBinary } from "./onboard-helpers.js";
import { setupSkills } from "./onboard-skills.js";

function createBundledSkill(params: {
  name: string;
  description: string;
  bins: string[];
  env?: string[];
  primaryEnv?: string;
  os?: string[];
  installLabel: string;
}): {
  name: string;
  description: string;
  source: string;
  bundled: boolean;
  filePath: string;
  baseDir: string;
  skillKey: string;
  primaryEnv?: string;
  always: boolean;
  disabled: boolean;
  blockedByAllowlist: boolean;
  eligible: boolean;
  requirements: {
    bins: string[];
    anyBins: string[];
    env: string[];
    config: string[];
    os: string[];
  };
  missing: { bins: string[]; anyBins: string[]; env: string[]; config: string[]; os: string[] };
  configChecks: [];
  install: Array<{ id: string; kind: string; label: string; bins: string[] }>;
} {
  return {
    name: params.name,
    description: params.description,
    source: "maumau-bundled",
    bundled: true,
    filePath: `/tmp/skills/${params.name}`,
    baseDir: `/tmp/skills/${params.name}`,
    skillKey: params.name,
    always: false,
    disabled: false,
    blockedByAllowlist: false,
    eligible: false,
    primaryEnv: params.primaryEnv,
    requirements: {
      bins: params.bins,
      anyBins: [],
      env: params.env ?? [],
      config: [],
      os: params.os ?? [],
    },
    missing: {
      bins: params.bins,
      anyBins: [],
      env: params.env ?? [],
      config: [],
      os: params.os ?? [],
    },
    configChecks: [],
    install: [{ id: "brew", kind: "brew", label: params.installLabel, bins: params.bins }],
  };
}

function mockMissingBrewStatus(skills: Array<ReturnType<typeof createBundledSkill>>): void {
  vi.mocked(detectBinary).mockResolvedValue(false);
  vi.mocked(installSkill).mockResolvedValue({
    ok: true,
    message: "Installed",
    stdout: "",
    stderr: "",
    code: 0,
  });
  vi.mocked(buildWorkspaceSkillStatus).mockReturnValue({
    workspaceDir: "/tmp/ws",
    managedSkillsDir: "/tmp/managed",
    skills,
  } as never);
}

function createPrompter(params: {
  configure?: boolean;
  showBrewInstall?: boolean;
  multiselect?: string[];
}): { prompter: WizardPrompter; notes: Array<{ title?: string; message: string }> } {
  const notes: Array<{ title?: string; message: string }> = [];

  const confirmAnswers: boolean[] = [];
  confirmAnswers.push(params.configure ?? true);

  const prompter: WizardPrompter = {
    intro: vi.fn(async () => {}),
    outro: vi.fn(async () => {}),
    note: vi.fn(async (message: string, title?: string) => {
      notes.push({ title, message });
    }),
    select: vi.fn(async () => "npm") as unknown as WizardPrompter["select"],
    multiselect: vi.fn(
      async () => params.multiselect ?? ["__skip__"],
    ) as unknown as WizardPrompter["multiselect"],
    text: vi.fn(async () => ""),
    confirm: vi.fn(async ({ message }) => {
      if (message === "Show Homebrew install command?") {
        return params.showBrewInstall ?? false;
      }
      return confirmAnswers.shift() ?? false;
    }),
    progress: vi.fn(() => ({ update: vi.fn(), stop: vi.fn() })),
  };

  return { prompter, notes };
}

const runtime: RuntimeEnv = {
  log: vi.fn(),
  error: vi.fn(),
  exit: ((code: number) => {
    throw new Error(`unexpected exit ${code}`);
  }) as RuntimeEnv["exit"],
};

describe("setupSkills", () => {
  it("preselects the supported default first-run skill installs", async () => {
    mockMissingBrewStatus([
      createBundledSkill({
        name: "summarize",
        description: "Summary CLI",
        bins: ["summarize"],
        installLabel: "Install summarize (brew)",
      }),
      createBundledSkill({
        name: "openai-whisper",
        description: "Whisper CLI",
        bins: ["whisper"],
        installLabel: "Install whisper (brew)",
      }),
      createBundledSkill({
        name: "nano-pdf",
        description: "PDF editor",
        bins: ["nano-pdf"],
        installLabel: "Install nano-pdf (uv)",
      }),
      createBundledSkill({
        name: "another-skill",
        description: "Not default",
        bins: ["another-skill"],
        installLabel: "Install another-skill (brew)",
      }),
    ]);

    const { prompter } = createPrompter({ multiselect: ["__skip__"] });
    await setupSkills({} as MaumauConfig, "/tmp/ws", runtime, prompter);

    const multiSelectCall = vi.mocked(prompter.multiselect).mock.calls[0]?.[0];
    expect(multiSelectCall?.initialValues).toEqual(["nano-pdf", "openai-whisper", "summarize"]);
  });

  it("does not recommend Homebrew when user skips installing brew-backed deps", async () => {
    if (process.platform === "win32") {
      return;
    }

    mockMissingBrewStatus([
      createBundledSkill({
        name: "apple-reminders",
        description: "macOS-only",
        bins: ["remindctl"],
        os: ["darwin"],
        installLabel: "Install remindctl (brew)",
      }),
      createBundledSkill({
        name: "video-frames",
        description: "ffmpeg",
        bins: ["ffmpeg"],
        installLabel: "Install ffmpeg (brew)",
      }),
    ]);

    const { prompter, notes } = createPrompter({ multiselect: ["__skip__"] });
    await setupSkills({} as MaumauConfig, "/tmp/ws", runtime, prompter);

    // OS-mismatched skill should be counted as unsupported, not installable/missing.
    const status = notes.find((n) => n.title === "Skills status")?.message ?? "";
    expect(status).toContain("Unsupported on this OS: 1");

    const brewNote = notes.find((n) => n.title === "Homebrew recommended");
    expect(brewNote).toBeUndefined();
  });

  it("recommends Homebrew when user selects a brew-backed install and brew is missing", async () => {
    if (process.platform === "win32") {
      return;
    }

    mockMissingBrewStatus([
      createBundledSkill({
        name: "video-frames",
        description: "ffmpeg",
        bins: ["ffmpeg"],
        installLabel: "Install ffmpeg (brew)",
      }),
    ]);

    const { prompter, notes } = createPrompter({ multiselect: ["video-frames"] });
    await setupSkills({} as MaumauConfig, "/tmp/ws", runtime, prompter);

    const brewNote = notes.find((n) => n.title === "Homebrew recommended");
    expect(brewNote).toBeDefined();
  });

  it("explains what optional skill API keys are for", async () => {
    mockMissingBrewStatus([
      createBundledSkill({
        name: "goplaces",
        description: "Query Google Places API for place search and details.",
        bins: [],
        env: ["GOOGLE_PLACES_API_KEY"],
        primaryEnv: "GOOGLE_PLACES_API_KEY",
        installLabel: "Install goplaces (brew)",
      }),
    ]);

    const { prompter } = createPrompter({ multiselect: ["__skip__"] });
    await setupSkills({} as MaumauConfig, "/tmp/ws", runtime, prompter);

    const notes = vi.mocked(prompter.note).mock.calls.map(([message]) => String(message));
    expect(
      notes.some((message) =>
        message.includes(
          "Optional skills are extra tools and integrations. Maumau works without them.",
        ),
      ),
    ).toBe(true);

    const confirmCalls = vi.mocked(prompter.confirm).mock.calls;
    expect(
      confirmCalls.some(
        ([params]) =>
          String(params.message).includes('optional skill "goplaces" now?') &&
          String(params.message).includes(
            "Query Google Places API for place search and details.",
          ) &&
          String(params.message).includes("not required") &&
          String(params.message).includes("GOOGLE_PLACES_API_KEY"),
      ),
    ).toBe(true);
  });
});
