import type { AuthProfileStore } from "../agents/auth-profiles.js";
import type { MaumauConfig } from "../config/config.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { buildAuthChoiceGroups } from "./auth-choice-options.js";
import type { AuthChoice } from "./onboard-types.js";
import { buildEmbeddedAuthChoiceNote } from "./onboarding-choice-guides.js";

const BACK_VALUE = "__back";

export async function promptAuthChoiceGrouped(params: {
  prompter: WizardPrompter;
  store: AuthProfileStore;
  includeSkip: boolean;
  config?: MaumauConfig;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
  includeRuntimeFallbackProviders?: boolean;
  embedded?: boolean;
}): Promise<AuthChoice> {
  const resolveCatalog = (
    includeRuntimeFallbackProviders = params.includeRuntimeFallbackProviders,
  ) =>
    buildAuthChoiceGroups({
      ...params,
      includeRuntimeFallbackProviders,
    });

  let { groups, skipOption } = resolveCatalog();
  let availableGroups = groups.filter((group) => group.options.length > 0);

  // Embedded onboarding only needs the manifest-backed provider catalog to render the
  // first step. If that catalog is unexpectedly empty, retry once with the full runtime.
  if (availableGroups.length === 0 && params.includeRuntimeFallbackProviders === false) {
    ({ groups, skipOption } = resolveCatalog(true));
    availableGroups = groups.filter((group) => group.options.length > 0);
  }

  while (true) {
    const providerOptions = [
      ...availableGroups.map((group) => ({
        value: group.value,
        label: group.label,
        hint: group.hint,
      })),
      ...(skipOption ? [skipOption] : []),
    ];

    const providerSelection = (await params.prompter.select({
      message: "AI service",
      options: providerOptions,
    })) as string;

    if (providerSelection === "skip") {
      return "skip";
    }

    const group = availableGroups.find((candidate) => candidate.value === providerSelection);

    if (!group || group.options.length === 0) {
      await params.prompter.note(
        "No auth methods available for that provider.",
        "Model/auth choice",
      );
      continue;
    }

    if (group.options.length === 1) {
      if (params.embedded) {
        const note = buildEmbeddedAuthChoiceNote(group);
        await params.prompter.note(note.message, note.title);
      }
      return group.options[0].value;
    }

    const methodSelection = await params.prompter.select({
      message: `How do you want to connect ${group.label}?`,
      options: [...group.options, { value: BACK_VALUE, label: "Back" }],
    });

    if (methodSelection === BACK_VALUE) {
      continue;
    }

    return methodSelection;
  }
}
