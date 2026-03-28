import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";

export type OAuthPrompt = { message: string; placeholder?: string };
export type OpenAuthUrlWithManualFallbackParams = {
  url: string;
  openUrl: (url: string) => Promise<unknown>;
  note: (message: string, title?: string) => Promise<void>;
  noteTitle?: string;
  noteLines?: string[];
};

const validateRequiredInput = (value: string) => (value.trim().length > 0 ? undefined : "Required");

export async function openAuthUrlWithManualFallback(
  params: OpenAuthUrlWithManualFallbackParams,
): Promise<boolean> {
  let opened = false;
  try {
    opened = (await params.openUrl(params.url)) !== false;
  } catch {
    opened = false;
  }
  if (opened) {
    return true;
  }

  await params.note(
    (
      params.noteLines ?? [
        "Browser did not open automatically.",
        "Open this URL in your browser to continue:",
        params.url,
      ]
    ).join("\n"),
    params.noteTitle ?? "Open browser sign-in",
  );
  return false;
}

export function createVpsAwareOAuthHandlers(params: {
  isRemote: boolean;
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
  spin: ReturnType<WizardPrompter["progress"]>;
  openUrl: (url: string) => Promise<unknown>;
  localBrowserMessage: string;
  manualPromptMessage?: string;
}): {
  onAuth: (event: { url: string }) => Promise<void>;
  onPrompt: (prompt: OAuthPrompt) => Promise<string>;
} {
  const manualPromptMessage = params.manualPromptMessage ?? "Paste the redirect URL";
  let manualCodePromise: Promise<string> | undefined;

  return {
    onAuth: async ({ url }) => {
      if (params.isRemote) {
        params.spin.stop("OAuth URL ready");
        params.runtime.log(`\nOpen this URL in your LOCAL browser:\n\n${url}\n`);
        manualCodePromise = params.prompter
          .text({
            message: manualPromptMessage,
            validate: validateRequiredInput,
          })
          .then((value) => String(value));
        return;
      }

      params.spin.update(params.localBrowserMessage);
      params.runtime.log(`Open: ${url}`);
      await openAuthUrlWithManualFallback({
        url,
        openUrl: params.openUrl,
        note: params.prompter.note,
      });
    },
    onPrompt: async (prompt) => {
      if (manualCodePromise) {
        return manualCodePromise;
      }
      const code = await params.prompter.text({
        message: prompt.message,
        placeholder: prompt.placeholder,
        validate: validateRequiredInput,
      });
      return String(code);
    },
  };
}
