import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  resolveBusinessFilePath,
  resolveBlueprintFilePath,
  writeBlueprint,
  writeProjectMarkdown,
} from "../business/registry.js";
import { formatBusinessMarkdown } from "../business/registry.js";
import type { BusinessProjectBlueprint } from "../business/types.js";
import type { MaumauConfig } from "../config/types.maumau.js";
import { collectDashboardBusiness, collectDashboardProjects } from "./dashboard-business.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(async (dir) => {
      await fs.rm(dir, { recursive: true, force: true });
    }),
  );
});

function buildConfig(workspaceDir: string): MaumauConfig {
  return {
    agents: {
      defaults: {
        workspace: workspaceDir,
      },
    },
  };
}

function buildBlueprint(
  overrides: Partial<BusinessProjectBlueprint> = {},
): BusinessProjectBlueprint {
  return {
    version: 2,
    businessId: "focus-lab",
    businessName: "Focus Lab",
    projectId: "founder-os",
    projectName: "Founder OS",
    projectStatus: "proposed",
    projectTag: "founder-os",
    goal: "Ship the first founder workflow product.",
    scope: "Dashboard, intake, and roadmap views.",
    proposalSummary: "Bundle the MVP into a scoped team handoff.",
    nextStep: "Approve the blueprint.",
    appNeeded: true,
    requiresVibeCoder: true,
    requiresDesignStudio: false,
    team: {
      id: "founder-os-team",
      name: "Founder OS Team",
      managerAgentId: "founder-os-manager",
      members: [],
      workflows: [
        {
          id: "default",
          default: true,
        },
      ],
    },
    agents: [
      {
        id: "founder-os-manager",
        name: "Founder OS Manager",
      },
    ],
    approval: {
      status: "approved",
      approvedAt: "2026-04-13T00:00:00.000Z",
    },
    ...overrides,
  };
}

describe("dashboard business collectors", () => {
  it("collects multiple businesses and preserves partial dossier gaps", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-dashboard-business-"));
    tempDirs.push(tempRoot);
    const workspaceDir = path.join(tempRoot, "workspace-main");
    await fs.mkdir(workspaceDir, { recursive: true });

    await fs.mkdir(path.dirname(resolveBusinessFilePath(workspaceDir, "focus-lab")), {
      recursive: true,
    });
    await fs.writeFile(
      resolveBusinessFilePath(workspaceDir, "focus-lab"),
      formatBusinessMarkdown({
        businessName: "Focus Lab",
        status: "active",
        moneyGoal: "Reach the first $5k MRR.",
        targetCustomer: "Solo founders.",
        problem: "Founders stall before the first real build.",
        offer: "MVP planning and execution support.",
        channels: "Twitter and founder communities.",
      }),
      "utf8",
    );
    await fs.mkdir(path.dirname(resolveBusinessFilePath(workspaceDir, "studio-lane")), {
      recursive: true,
    });
    await fs.writeFile(
      resolveBusinessFilePath(workspaceDir, "studio-lane"),
      formatBusinessMarkdown({
        businessName: "Studio Lane",
        status: "exploring",
        openQuestions: "Is this a service, product, or hybrid offer?",
      }),
      "utf8",
    );

    await writeProjectMarkdown({
      workspaceDir,
      businessId: "focus-lab",
      businessName: "Focus Lab",
      projectId: "founder-os",
      projectName: "Founder OS",
      status: "researching",
      goal: "Shape a founder workflow product.",
      scope: "Research and dossier planning.",
      appNeeded: true,
      projectTag: "founder-os",
      nextStep: "Run a research pass.",
    });
    await writeProjectMarkdown({
      workspaceDir,
      businessId: "studio-lane",
      businessName: "Studio Lane",
      projectId: "service-playbook",
      projectName: "Service Playbook",
      status: "brainstorming",
      appNeeded: false,
      projectTag: "service-playbook",
    });

    const result = await collectDashboardBusiness({
      cfg: buildConfig(workspaceDir),
      nowMs: Date.UTC(2026, 3, 13, 0, 0, 0),
    });

    expect(result.items).toHaveLength(2);
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          businessId: "focus-lab",
          businessName: "Focus Lab",
          status: "active",
          projectCount: 1,
          activeProjectCount: 1,
          recordedFieldCount: 5,
          missingFieldCount: 3,
        }),
        expect.objectContaining({
          businessId: "studio-lane",
          businessName: "Studio Lane",
          status: "exploring",
          projectCount: 1,
          activeProjectCount: 1,
          recordedFieldCount: 1,
          missingFieldCount: 7,
        }),
      ]),
    );
  });

  it("joins project artifacts by project tag and surfaces blueprint and workspace metadata", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-dashboard-projects-"));
    tempDirs.push(tempRoot);
    const workspaceDir = path.join(tempRoot, "workspace-main");
    await fs.mkdir(workspaceDir, { recursive: true });

    await fs.mkdir(path.dirname(resolveBusinessFilePath(workspaceDir, "focus-lab")), {
      recursive: true,
    });
    await fs.writeFile(
      resolveBusinessFilePath(workspaceDir, "focus-lab"),
      formatBusinessMarkdown({
        businessName: "Focus Lab",
        status: "active",
      }),
      "utf8",
    );

    const linkedWorkspace = path.join(
      tempRoot,
      "state",
      "business-projects",
      "focus-lab",
      "founder-os",
    );
    await writeProjectMarkdown({
      workspaceDir,
      businessId: "focus-lab",
      businessName: "Focus Lab",
      projectId: "founder-os",
      projectName: "Founder OS",
      status: "approved",
      goal: "Turn the venture into a real build lane.",
      scope: "Project workspace plus implementation handoff.",
      appNeeded: true,
      projectTag: "founder-os",
      linkedWorkspace,
      teamId: "founder-os-team",
      nextStep: "Materialize the approved blueprint.",
      proposalSummary: "Create the project team and workspace.",
    });
    await writeBlueprint({
      workspaceDir,
      businessId: "focus-lab",
      projectId: "founder-os",
      blueprint: buildBlueprint(),
    });

    await writeProjectMarkdown({
      workspaceDir,
      businessId: "focus-lab",
      businessName: "Focus Lab",
      projectId: "service-playbook",
      projectName: "Service Playbook",
      status: "researching",
      goal: "Research the service offer.",
      scope: "Offer and pricing validation.",
      appNeeded: false,
      projectTag: "service-playbook",
    });
    await fs.mkdir(
      path.dirname(resolveBlueprintFilePath(workspaceDir, "focus-lab", "service-playbook")),
      {
        recursive: true,
      },
    );
    await fs.writeFile(
      resolveBlueprintFilePath(workspaceDir, "focus-lab", "service-playbook"),
      "{ not-valid-json\n",
      "utf8",
    );

    const result = await collectDashboardProjects({
      cfg: buildConfig(workspaceDir),
      tasks: [
        {
          id: "task:1",
          sessionKey: "main",
          title: "Founder OS research",
          status: "in_progress",
          source: "runtime_envelope",
          createdAtMs: 1,
          projectKey: "founder-os",
          projectName: "Founder OS",
          sessionLinks: [],
          blockerLinks: [],
          previewLinks: [],
        },
      ],
      workshopItems: [
        {
          id: "workshop:1",
          sessionKey: "main",
          taskId: "task:1",
          title: "Founder OS preview",
          embeddable: false,
          taskStatus: "done",
          projectKey: "founder-os",
          projectName: "Founder OS",
        },
      ],
      savedWorkshopItems: [],
      agentApps: [
        {
          kind: "agent_app",
          id: "agent-app:1",
          title: "Founder OS app",
          status: "building",
          embeddable: false,
          projectKey: "founder-os",
          projectName: "Founder OS",
        },
      ],
      nowMs: Date.UTC(2026, 3, 13, 0, 0, 0),
    });

    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          projectId: "founder-os",
          businessId: "focus-lab",
          projectTag: "founder-os",
          linkedWorkspace,
          linkedWorkspaceLabel: "founder-os",
          teamId: "founder-os-team",
          blueprintStatus: "approved",
          blueprintVersion: 2,
          linkedTaskCount: 1,
          linkedWorkshopCount: 1,
          linkedAgentAppCount: 1,
        }),
        expect.objectContaining({
          projectId: "service-playbook",
          blueprintStatus: "invalid",
          blueprintError: expect.stringContaining("Invalid BLUEPRINT.json"),
        }),
      ]),
    );
  });
});
