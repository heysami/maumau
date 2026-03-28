import type { runModelAuthWizard as runModelAuthWizardType } from "./model-auth.js";

type RunModelAuthWizard = typeof import("./model-auth.js").runModelAuthWizard;

export async function runModelAuthWizard(
  ...args: Parameters<typeof runModelAuthWizardType>
): ReturnType<RunModelAuthWizard> {
  const runtime = await import("./model-auth.js");
  return runtime.runModelAuthWizard(...args);
}
