import type { runSetupWizard as runSetupWizardType } from "./setup.js";

type RunSetupWizard = typeof import("./setup.js").runSetupWizard;

export async function runSetupWizard(
  ...args: Parameters<typeof runSetupWizardType>
): ReturnType<RunSetupWizard> {
  const runtime = await import("./setup.js");
  return runtime.runSetupWizard(...args);
}
