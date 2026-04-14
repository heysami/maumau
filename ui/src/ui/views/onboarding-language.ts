import { html } from "lit";
import { getLanguageNativeName } from "../../../../src/i18n/languages.ts";
import { SUPPORTED_LOCALES, t, type Locale } from "../../i18n/index.ts";
import type { AppViewState } from "../app-view-state.ts";
import { normalizeBasePath } from "../navigation.ts";
import { agentLogoUrl } from "./agents-utils.ts";

export function renderOnboardingLanguageGate(params: {
  state: AppViewState;
  onSelect: (locale: Locale) => void;
}) {
  const basePath = normalizeBasePath(params.state.basePath ?? "");
  const logoUrl = agentLogoUrl(basePath);

  return html`
    <div class="login-gate">
      <div class="login-gate__card">
        <div class="login-gate__header">
          <img class="login-gate__logo" src=${logoUrl} alt="Maumau" />
          <div class="login-gate__title">Maumau</div>
          <div class="login-gate__sub">${t("onboarding.language.subtitle")}</div>
        </div>
        <div class="login-gate__help-title" style="margin-bottom: 8px;">
          ${t("onboarding.language.title")}
        </div>
        <div class="muted" style="margin-bottom: 16px;">
          ${t("onboarding.language.description")}
        </div>
        <div style="display: grid; gap: 10px;">
          ${SUPPORTED_LOCALES.map((locale) => {
            return html`
              <button
                type="button"
                class="btn"
                style="justify-content: space-between; width: 100%;"
                @click=${() => params.onSelect(locale)}
              >
                <span>${getLanguageNativeName(locale)}</span>
                <span class="muted"
                  >${
                    locale === "en"
                      ? t("onboarding.language.defaultHint")
                      : t("onboarding.language.selectAction")
                  }</span
                >
              </button>
            `;
          })}
        </div>
      </div>
    </div>
  `;
}
