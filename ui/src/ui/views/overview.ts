import { html, nothing } from "lit";
import {
  CONVERSATION_AUTOMATION_TELEPHONY_PROVIDER_PLIVO,
  CONVERSATION_AUTOMATION_TELEPHONY_PROVIDER_TELNYX,
  CONVERSATION_AUTOMATION_TELEPHONY_PROVIDER_TWILIO,
  CONVERSATION_AUTOMATION_STT_PROVIDER_DEEPGRAM,
  CONVERSATION_AUTOMATION_STT_PROVIDER_OPENAI,
  normalizeConversationAutomationAllowFrom,
} from "../../../../src/commands/conversation-automation-preset.js";
import type { ConversationAutomationPresetState } from "../../../../src/commands/conversation-automation-preset.js";
import {
  getLanguageEnglishName,
  LANGUAGE_CATALOG,
  type LanguageId,
} from "../../../../src/i18n/languages.js";
import { t, i18n, SUPPORTED_LOCALES, type Locale, isSupportedLocale } from "../../i18n/index.ts";
import type { EventLogEntry } from "../app-events.ts";
import { buildExternalLinkRel, EXTERNAL_LINK_TARGET } from "../external-link.ts";
import { formatRelativeTimestamp, formatDurationHuman } from "../format.ts";
import type { GatewayHelloOk } from "../gateway.ts";
import { icons } from "../icons.ts";
import type { UiSettings } from "../storage.ts";
import type {
  AttentionItem,
  CronJob,
  CronStatus,
  SessionsListResult,
  SessionsUsageResult,
  SkillStatusReport,
} from "../types.ts";
import { renderOverviewAttention } from "./overview-attention.ts";
import { renderOverviewCards } from "./overview-cards.ts";
import { renderOverviewEventLog } from "./overview-event-log.ts";
import {
  resolveAuthHintKind,
  shouldShowInsecureContextHint,
  shouldShowPairingHint,
} from "./overview-hints.ts";
import { renderOverviewLogTail } from "./overview-log-tail.ts";

export type OverviewProps = {
  connected: boolean;
  hello: GatewayHelloOk | null;
  settings: UiSettings;
  password: string;
  lastError: string | null;
  lastErrorCode: string | null;
  presenceCount: number;
  sessionsCount: number | null;
  cronEnabled: boolean | null;
  cronNext: number | null;
  lastChannelsRefresh: number | null;
  // New dashboard data
  usageResult: SessionsUsageResult | null;
  sessionsResult: SessionsListResult | null;
  skillsReport: SkillStatusReport | null;
  cronJobs: CronJob[];
  cronStatus: CronStatus | null;
  attentionItems: AttentionItem[];
  eventLog: EventLogEntry[];
  overviewLogLines: string[];
  showGatewayToken: boolean;
  showGatewayPassword: boolean;
  conversationAutomationPreset: {
    ready: boolean;
    state: ConversationAutomationPresetState;
    dirty: boolean;
    saving: boolean;
    applying: boolean;
    onStateChange: (next: ConversationAutomationPresetState) => void;
    onSave: () => void;
    onApply: () => void;
    onReload: () => void;
  };
  onSettingsChange: (next: UiSettings) => void;
  onPasswordChange: (next: string) => void;
  onSessionKeyChange: (next: string) => void;
  onToggleGatewayTokenVisibility: () => void;
  onToggleGatewayPasswordVisibility: () => void;
  onConnect: () => void;
  onRefresh: () => void;
  onNavigate: (tab: string) => void;
  onRefreshLogs: () => void;
};

function formatConversationAutomationAccessMode(state: ConversationAutomationPresetState): string {
  if (!state.enabled) {
    return t("common.disabled");
  }
  if (state.accessMode === "allowlist") {
    return t("overview.preset.allowlistMode", {
      count: String(state.allowFrom.length),
    });
  }
  return t("overview.preset.ownerOnly");
}

function renderConversationAutomationPresetCard(
  preset: OverviewProps["conversationAutomationPreset"],
) {
  const state = preset.state;
  return html`
    <div class="card">
      <div class="card-title">${t("overview.preset.title")}</div>
      <div class="card-sub">${t("overview.preset.subtitle")}</div>
      <div class="ov-access-grid" style="margin-top: 16px;">
        <label class="field ov-access-grid__full">
          <span>${t("overview.preset.enabled")}</span>
          <select
            .value=${state.enabled ? "enabled" : "disabled"}
            ?disabled=${!preset.ready || preset.saving || preset.applying}
            @change=${(event: Event) => {
              const nextEnabled = (event.target as HTMLSelectElement).value === "enabled";
              preset.onStateChange({
                ...state,
                enabled: nextEnabled,
                telephonyEnabled: nextEnabled ? state.telephonyEnabled : false,
                accessMode: nextEnabled
                  ? state.allowFrom.length > 0
                    ? "allowlist"
                    : "owner"
                  : "disabled",
              });
            }}
          >
            <option value="enabled">${t("common.enabled")}</option>
            <option value="disabled">${t("common.disabled")}</option>
          </select>
        </label>
        <label class="field ov-access-grid__full">
          <span>${t("overview.preset.allowFrom")}</span>
          <textarea
            rows="3"
            style="width: 100%; resize: vertical;"
            .value=${state.allowFrom.join(", ")}
            ?disabled=${!preset.ready || preset.saving || preset.applying}
            @input=${(event: Event) => {
              const raw = (event.target as HTMLTextAreaElement).value;
              const allowFrom = normalizeConversationAutomationAllowFrom(raw);
              preset.onStateChange({
                ...state,
                allowFrom,
                accessMode: !state.enabled
                  ? "disabled"
                  : allowFrom.length > 0
                    ? "allowlist"
                    : "owner",
              });
            }}
          ></textarea>
          <div class="muted" style="margin-top: 6px;">
            ${t("overview.preset.allowFromHint")}
          </div>
        </label>
        <label class="field">
          <span>${t("overview.preset.telephony")}</span>
          <select
            .value=${state.telephonyEnabled ? "enabled" : "disabled"}
            ?disabled=${!preset.ready || preset.saving || preset.applying || !state.enabled}
            @change=${(event: Event) => {
              preset.onStateChange({
                ...state,
                telephonyEnabled: (event.target as HTMLSelectElement).value === "enabled",
              });
            }}
          >
            <option value="enabled">${t("common.enabled")}</option>
            <option value="disabled">${t("common.disabled")}</option>
          </select>
        </label>
        <label class="field">
          <span>${t("overview.preset.telephonyProvider")}</span>
          <select
            .value=${state.telephonyProvider}
            ?disabled=${!preset.ready || preset.saving || preset.applying || !state.enabled || !state.telephonyEnabled}
            @change=${(event: Event) => {
              preset.onStateChange({
                ...state,
                telephonyProvider: (event.target as HTMLSelectElement)
                  .value as ConversationAutomationPresetState["telephonyProvider"],
              });
            }}
          >
            <option value=${CONVERSATION_AUTOMATION_TELEPHONY_PROVIDER_TWILIO}>Twilio</option>
            <option value=${CONVERSATION_AUTOMATION_TELEPHONY_PROVIDER_TELNYX}>Telnyx</option>
            <option value=${CONVERSATION_AUTOMATION_TELEPHONY_PROVIDER_PLIVO}>Plivo</option>
          </select>
          <div class="muted" style="margin-top: 6px;">
            ${t("overview.preset.telephonyProviderHint")}
          </div>
        </label>
        <label class="field">
          <span>${t("overview.preset.sttProvider")}</span>
          <select
            .value=${state.sttProvider}
            ?disabled=${!preset.ready || preset.saving || preset.applying || !state.enabled || !state.telephonyEnabled}
            @change=${(event: Event) => {
              preset.onStateChange({
                ...state,
                sttProvider: (event.target as HTMLSelectElement)
                  .value as ConversationAutomationPresetState["sttProvider"],
              });
            }}
          >
            <option value=${CONVERSATION_AUTOMATION_STT_PROVIDER_DEEPGRAM}>
              ${t("overview.preset.sttProviderDeepgram")}
            </option>
            <option value=${CONVERSATION_AUTOMATION_STT_PROVIDER_OPENAI}>
              ${t("overview.preset.sttProviderOpenAI")}
            </option>
          </select>
          <div class="muted" style="margin-top: 6px;">
            ${t("overview.preset.sttProviderHint")}
          </div>
        </label>
        <label class="field">
          <span>${t("overview.preset.language")}</span>
          <select
            .value=${state.languageId}
            ?disabled=${!preset.ready || preset.saving || preset.applying || !state.enabled || !state.telephonyEnabled}
            @change=${(event: Event) => {
              preset.onStateChange({
                ...state,
                languageId: (event.target as HTMLSelectElement).value as LanguageId,
              });
            }}
          >
            ${LANGUAGE_CATALOG.map(
              (language) => html`<option value=${language.id}>
                ${getLanguageEnglishName(language.id)}
              </option>`,
            )}
          </select>
          <div class="muted" style="margin-top: 6px;">
            ${t("overview.preset.languageHint")}
          </div>
        </label>
      </div>
      <div class="callout" style="margin-top: 14px;">
        <div><strong>${t("overview.preset.browserLaneLabel")}</strong> ${t("overview.preset.browserLane")}</div>
        <div style="margin-top: 6px;">
          <strong>${t("overview.preset.desktopFallbackLabel")}</strong>
          ${t("overview.preset.desktopFallback")}
        </div>
        <div style="margin-top: 6px;">
          <strong>${t("overview.preset.approvalLabel")}</strong> ${t("overview.preset.approval")}
        </div>
      </div>
      <div class="row" style="margin-top: 14px;">
        <button
          class="btn"
          ?disabled=${!preset.ready || preset.saving || preset.applying}
          @click=${() => preset.onSave()}
        >
          ${preset.saving ? t("overview.preset.saving") : t("overview.preset.save")}
        </button>
        <button
          class="btn"
          ?disabled=${!preset.ready || preset.saving || preset.applying}
          @click=${() => preset.onApply()}
        >
          ${preset.applying ? t("overview.preset.applying") : t("overview.preset.apply")}
        </button>
        <button class="btn" ?disabled=${preset.saving || preset.applying} @click=${() => preset.onReload()}>
          ${t("overview.preset.reload")}
        </button>
        <span class="muted">
          ${
            !preset.ready
              ? t("overview.preset.unavailable")
              : preset.dirty
                ? t("overview.preset.unsaved")
                : formatConversationAutomationAccessMode(state)
          }
        </span>
      </div>
    </div>
  `;
}

export function renderOverview(props: OverviewProps) {
  const snapshot = props.hello?.snapshot as
    | {
        uptimeMs?: number;
        authMode?: "none" | "token" | "password" | "trusted-proxy";
      }
    | undefined;
  const uptime = snapshot?.uptimeMs ? formatDurationHuman(snapshot.uptimeMs) : t("common.na");
  const tickIntervalMs = props.hello?.policy?.tickIntervalMs;
  const tick = tickIntervalMs
    ? `${(tickIntervalMs / 1000).toFixed(tickIntervalMs % 1000 === 0 ? 0 : 1)}s`
    : t("common.na");
  const authMode = snapshot?.authMode;
  const isTrustedProxy = authMode === "trusted-proxy";

  const pairingHint = (() => {
    if (!shouldShowPairingHint(props.connected, props.lastError, props.lastErrorCode)) {
      return null;
    }
    return html`
      <div class="muted" style="margin-top: 8px">
        ${t("overview.pairing.hint")}
        <div style="margin-top: 6px">
          <span class="mono">maumau devices list</span><br />
          <span class="mono">maumau devices approve &lt;requestId&gt;</span>
        </div>
        <div style="margin-top: 6px; font-size: 12px;">
          ${t("overview.pairing.mobileHint")}
        </div>
        <div style="margin-top: 6px">
          <a
            class="session-link"
            href="https://docs.maumau.ai/web/control-ui#device-pairing-first-connection"
            target=${EXTERNAL_LINK_TARGET}
            rel=${buildExternalLinkRel()}
            title="Device pairing docs (opens in new tab)"
            >Docs: Device pairing</a
          >
        </div>
      </div>
    `;
  })();

  const authHint = (() => {
    const authHintKind = resolveAuthHintKind({
      connected: props.connected,
      lastError: props.lastError,
      lastErrorCode: props.lastErrorCode,
      hasToken: Boolean(props.settings.token.trim()),
      hasPassword: Boolean(props.password.trim()),
    });
    if (authHintKind == null) {
      return null;
    }
    if (authHintKind === "required") {
      return html`
        <div class="muted" style="margin-top: 8px">
          ${t("overview.auth.required")}
          <div style="margin-top: 6px">
            <span class="mono">maumau dashboard --no-open</span> → tokenized URL<br />
            <span class="mono">maumau doctor --generate-gateway-token</span> → set token
          </div>
          <div style="margin-top: 6px">
            <a
              class="session-link"
              href="https://docs.maumau.ai/web/dashboard"
              target=${EXTERNAL_LINK_TARGET}
              rel=${buildExternalLinkRel()}
              title="Control UI auth docs (opens in new tab)"
              >Docs: Control UI auth</a
            >
          </div>
        </div>
      `;
    }
    return html`
      <div class="muted" style="margin-top: 8px">
        ${t("overview.auth.failed", { command: "maumau dashboard --no-open" })}
        <div style="margin-top: 6px">
          <a
            class="session-link"
            href="https://docs.maumau.ai/web/dashboard"
            target=${EXTERNAL_LINK_TARGET}
            rel=${buildExternalLinkRel()}
            title="Control UI auth docs (opens in new tab)"
            >Docs: Control UI auth</a
          >
        </div>
      </div>
    `;
  })();

  const insecureContextHint = (() => {
    if (props.connected || !props.lastError) {
      return null;
    }
    const isSecureContext = typeof window !== "undefined" ? window.isSecureContext : true;
    if (isSecureContext) {
      return null;
    }
    if (!shouldShowInsecureContextHint(props.connected, props.lastError, props.lastErrorCode)) {
      return null;
    }
    return html`
      <div class="muted" style="margin-top: 8px">
        ${t("overview.insecure.hint", { url: "http://127.0.0.1:18789" })}
        <div style="margin-top: 6px">
          ${t("overview.insecure.stayHttp", { config: "gateway.controlUi.allowInsecureAuth: true" })}
        </div>
        <div style="margin-top: 6px">
          <a
            class="session-link"
            href="https://docs.maumau.ai/gateway/tailscale"
            target=${EXTERNAL_LINK_TARGET}
            rel=${buildExternalLinkRel()}
            title="Tailscale Serve docs (opens in new tab)"
            >Docs: Tailscale Serve</a
          >
          <span class="muted"> · </span>
          <a
            class="session-link"
            href="https://docs.maumau.ai/web/control-ui#insecure-http"
            target=${EXTERNAL_LINK_TARGET}
            rel=${buildExternalLinkRel()}
            title="Insecure HTTP docs (opens in new tab)"
            >Docs: Insecure HTTP</a
          >
        </div>
      </div>
    `;
  })();

  const currentLocale = isSupportedLocale(props.settings.locale)
    ? props.settings.locale
    : i18n.getLocale();

  return html`
    <section class="grid">
      <div class="card">
        <div class="card-title">${t("overview.access.title")}</div>
        <div class="card-sub">${t("overview.access.subtitle")}</div>
        <div class="ov-access-grid" style="margin-top: 16px;">
          <label class="field ov-access-grid__full">
            <span>${t("overview.access.wsUrl")}</span>
            <input
              .value=${props.settings.gatewayUrl}
              @input=${(e: Event) => {
                const v = (e.target as HTMLInputElement).value;
                props.onSettingsChange({
                  ...props.settings,
                  gatewayUrl: v,
                  token: v.trim() === props.settings.gatewayUrl.trim() ? props.settings.token : "",
                });
              }}
              placeholder="ws://100.x.y.z:18789"
            />
          </label>
          ${
            isTrustedProxy
              ? ""
              : html`
                <label class="field">
                  <span>${t("overview.access.token")}</span>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <input
                      type=${props.showGatewayToken ? "text" : "password"}
                      autocomplete="off"
                      style="flex: 1;"
                      .value=${props.settings.token}
                      @input=${(e: Event) => {
                        const v = (e.target as HTMLInputElement).value;
                        props.onSettingsChange({ ...props.settings, token: v });
                      }}
                      placeholder="MAUMAU_GATEWAY_TOKEN"
                    />
                    <button
                      type="button"
                      class="btn btn--icon ${props.showGatewayToken ? "active" : ""}"
                      style="width: 36px; height: 36px;"
                      title=${props.showGatewayToken ? "Hide token" : "Show token"}
                      aria-label="Toggle token visibility"
                      aria-pressed=${props.showGatewayToken}
                      @click=${props.onToggleGatewayTokenVisibility}
                    >
                      ${props.showGatewayToken ? icons.eye : icons.eyeOff}
                    </button>
                  </div>
                </label>
                <label class="field">
                  <span>${t("overview.access.password")}</span>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <input
                      type=${props.showGatewayPassword ? "text" : "password"}
                      autocomplete="off"
                      style="flex: 1;"
                      .value=${props.password}
                      @input=${(e: Event) => {
                        const v = (e.target as HTMLInputElement).value;
                        props.onPasswordChange(v);
                      }}
                      placeholder="system or shared password"
                    />
                    <button
                      type="button"
                      class="btn btn--icon ${props.showGatewayPassword ? "active" : ""}"
                      style="width: 36px; height: 36px;"
                      title=${props.showGatewayPassword ? "Hide password" : "Show password"}
                      aria-label="Toggle password visibility"
                      aria-pressed=${props.showGatewayPassword}
                      @click=${props.onToggleGatewayPasswordVisibility}
                    >
                      ${props.showGatewayPassword ? icons.eye : icons.eyeOff}
                    </button>
                  </div>
                </label>
              `
          }
          <label class="field">
            <span>${t("overview.access.sessionKey")}</span>
            <input
              .value=${props.settings.sessionKey}
              @input=${(e: Event) => {
                const v = (e.target as HTMLInputElement).value;
                props.onSessionKeyChange(v);
              }}
            />
          </label>
          <label class="field">
            <span>${t("overview.access.language")}</span>
            <select
              .value=${currentLocale}
              @change=${(e: Event) => {
                const v = (e.target as HTMLSelectElement).value as Locale;
                void i18n.setLocale(v);
                props.onSettingsChange({ ...props.settings, locale: v });
              }}
            >
              ${SUPPORTED_LOCALES.map((loc) => {
                const key = loc.replace(/-([a-zA-Z])/g, (_, c) => c.toUpperCase());
                return html`<option value=${loc} ?selected=${currentLocale === loc}>
                  ${t(`languages.${key}`)}
                </option>`;
              })}
            </select>
          </label>
        </div>
        <div class="row" style="margin-top: 14px;">
          <button class="btn" @click=${() => props.onConnect()}>${t("common.connect")}</button>
          <button class="btn" @click=${() => props.onRefresh()}>${t("common.refresh")}</button>
          <span class="muted">${
            isTrustedProxy ? t("overview.access.trustedProxy") : t("overview.access.connectHint")
          }</span>
        </div>
        ${
          !props.connected
            ? html`
                <div class="login-gate__help" style="margin-top: 16px;">
                  <div class="login-gate__help-title">${t("overview.connection.title")}</div>
                  <ol class="login-gate__steps">
                    <li>${t("overview.connection.step1")}<code>maumau gateway run</code></li>
                    <li>${t("overview.connection.step2")}<code>maumau dashboard --no-open</code></li>
                    <li>${t("overview.connection.step3")}</li>
                    <li>${t("overview.connection.step4")}<code>maumau doctor --generate-gateway-token</code></li>
                  </ol>
                  <div class="login-gate__docs">
                    ${t("overview.connection.docsHint")}
                    <a
                      class="session-link"
                      href="https://docs.maumau.ai/web/dashboard"
                      target="_blank"
                      rel="noreferrer"
                    >${t("overview.connection.docsLink")}</a>
                  </div>
                </div>
              `
            : nothing
        }
      </div>

      ${renderConversationAutomationPresetCard(props.conversationAutomationPreset)}

      <div class="card">
        <div class="card-title">${t("overview.snapshot.title")}</div>
        <div class="card-sub">${t("overview.snapshot.subtitle")}</div>
        <div class="stat-grid" style="margin-top: 16px;">
          <div class="stat">
            <div class="stat-label">${t("overview.snapshot.status")}</div>
            <div class="stat-value ${props.connected ? "ok" : "warn"}">
              ${props.connected ? t("common.ok") : t("common.offline")}
            </div>
          </div>
          <div class="stat">
            <div class="stat-label">${t("overview.snapshot.uptime")}</div>
            <div class="stat-value">${uptime}</div>
          </div>
          <div class="stat">
            <div class="stat-label">${t("overview.snapshot.tickInterval")}</div>
            <div class="stat-value">${tick}</div>
          </div>
          <div class="stat">
            <div class="stat-label">${t("overview.snapshot.lastChannelsRefresh")}</div>
            <div class="stat-value">
              ${props.lastChannelsRefresh ? formatRelativeTimestamp(props.lastChannelsRefresh) : t("common.na")}
            </div>
          </div>
        </div>
        ${
          props.lastError
            ? html`<div class="callout danger" style="margin-top: 14px;">
              <div>${props.lastError}</div>
              ${pairingHint ?? ""}
              ${authHint ?? ""}
              ${insecureContextHint ?? ""}
            </div>`
            : html`
                <div class="callout" style="margin-top: 14px">
                  ${t("overview.snapshot.channelsHint")}
                </div>
              `
        }
      </div>
    </section>

    <div class="ov-section-divider"></div>

    ${renderOverviewCards({
      usageResult: props.usageResult,
      sessionsResult: props.sessionsResult,
      skillsReport: props.skillsReport,
      cronJobs: props.cronJobs,
      cronStatus: props.cronStatus,
      presenceCount: props.presenceCount,
      onNavigate: props.onNavigate,
    })}

    ${renderOverviewAttention({ items: props.attentionItems })}

    <div class="ov-section-divider"></div>

    <div class="ov-bottom-grid">
      ${renderOverviewEventLog({
        events: props.eventLog,
      })}

      ${renderOverviewLogTail({
        lines: props.overviewLogLines,
        onRefreshLogs: props.onRefreshLogs,
      })}
    </div>

  `;
}
