import { html, nothing, type TemplateResult } from "lit";
import {
  getLocalizedUserChannelQuickSetupEntry,
  getLocalizedUserChannelQuickSetupSettingsNote,
  isUserChannelInlineQuickSetupId,
} from "../../../../src/shared/user-channel-quick-setup.ts";
import { i18n, t } from "../../i18n/index.ts";
import type {
  DashboardUserChannel,
  DashboardUserChannelAccount,
  DashboardUserChannelConnectSpec,
  DashboardUserChannelsResult,
  DashboardUserChannelEditableList,
} from "../types.ts";

const CONNECT_PICKER_DIALOG_ID = "dashboard-user-channels-connect-picker";

type DashboardUserChannelsPageProps = {
  result: DashboardUserChannelsResult | null;
  selectedChannelId: string | null;
  selectedAccountId: string | null;
  onSelectChannel: (channelId: string) => void;
  onSelectAccount: (channelId: string, accountId: string) => void;
  onOpenUsersPage: () => void;
  onConnectChannel: (params: {
    channelId: string;
    fields: Record<string, string>;
  }) => void;
  onSaveAllowlist: (params: {
    channelId: string;
    accountId: string;
    scope: "dm" | "group";
    entries: string;
  }) => void;
  onSaveChats: (params: {
    channelId: string;
    accountId: string;
    policy: "allowlist" | "open" | "disabled";
    entries: string;
  }) => void;
  whatsappMessage: string | null;
  whatsappQrDataUrl: string | null;
  whatsappBusy: boolean;
  onStartWhatsApp: (force: boolean) => void;
};

function dt(key: string): string {
  return t(`dashboard.userChannels.${key}`);
}

function localizedQuickSetupEntry(channelId: string) {
  if (!isUserChannelInlineQuickSetupId(channelId)) {
    return null;
  }
  return getLocalizedUserChannelQuickSetupEntry(channelId, i18n.getLocale());
}

function localizeConnectSpec(
  channel: DashboardUserChannelConnectSpec,
): DashboardUserChannelConnectSpec {
  const shared = localizedQuickSetupEntry(channel.channelId);
  if (!shared) {
    return channel;
  }
  const localizedFields = new Map(shared.fields.map((field) => [field.key, field]));
  return {
    ...channel,
    guidance: shared.guidance,
    quickSetup: {
      kind: shared.quickSetup.kind,
      sectionTitle: shared.quickSetup.sectionTitle,
      title: shared.quickSetup.title,
      headline: shared.quickSetup.emptyHeadline,
      message: shared.quickSetup.emptyMessage,
      badge: shared.quickSetup.emptyBadge,
      buttonTitle: shared.quickSetup.buttonTitle,
      existingCredentialNote: shared.quickSetup.existingCredentialNote,
      setupNote: shared.quickSetup.setupNote,
    },
    fields: channel.fields.map((field) => {
      const localized = localizedFields.get(field.key);
      return {
        ...field,
        label: localized?.label ?? field.label,
        placeholder: localized?.placeholder ?? field.placeholder,
        helpLines: localized?.helpLines ?? field.helpLines,
      };
    }),
  };
}

function localizedAvailableChannels(props: DashboardUserChannelsPageProps) {
  return (props.result?.availableChannels ?? []).map(localizeConnectSpec);
}

function policyLabel(policy: string | undefined): string | null {
  if (policy === "open" || policy === "disabled" || policy === "allowlist") {
    return dt(`policy.${policy}`);
  }
  return null;
}

function sanitizeDomId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "item";
}

function openDialogById(dialogId: string) {
  const dialog = document.getElementById(dialogId);
  if (dialog instanceof HTMLDialogElement && !dialog.open) {
    dialog.showModal();
  }
}

function closeDialogById(dialogId: string) {
  const dialog = document.getElementById(dialogId);
  if (dialog instanceof HTMLDialogElement && dialog.open) {
    dialog.close();
  }
}

function closeDialogFromEvent(event: Event) {
  const dialog = (event.currentTarget as HTMLElement).closest("dialog");
  if (dialog instanceof HTMLDialogElement) {
    dialog.close();
  }
}

function handleDialogBackdropClick(event: Event) {
  const dialog = event.currentTarget as HTMLDialogElement;
  if (event.target === dialog) {
    dialog.close();
  }
}

function connectDialogId(channelId: string) {
  return `dashboard-user-channels-connect-${sanitizeDomId(channelId)}`;
}

function listDialogId(channelId: string, accountId: string, scope: "dm" | "group" | "chats") {
  return `dashboard-user-channels-${scope}-${sanitizeDomId(channelId)}-${sanitizeDomId(accountId)}`;
}

function resolveSelectedChannel(
  result: DashboardUserChannelsResult | null,
  selectedChannelId: string | null,
): DashboardUserChannel | null {
  const channels = result?.channels ?? [];
  if (channels.length === 0) {
    return null;
  }
  return channels.find((channel) => channel.channelId === selectedChannelId) ?? channels[0];
}

function resolveSelectedAccount(
  channel: DashboardUserChannel | null,
  selectedAccountId: string | null,
): DashboardUserChannelAccount | null {
  if (!channel || channel.accounts.length === 0) {
    return null;
  }
  return (
    channel.accounts.find((account) => account.accountId === selectedAccountId) ??
    channel.accounts.find((account) => account.defaultAccount) ??
    channel.accounts[0]
  );
}

function renderPillList(values: string[]) {
  if (values.length === 0) {
    return html`
      <span class="muted">—</span>
    `;
  }
  return html`
    <div style="display: flex; flex-wrap: wrap; gap: 6px;">
      ${values.map((value) => html`<span class="pill">${value}</span>`)}
    </div>
  `;
}

function renderDialog(params: {
  id: string;
  title: string;
  subtitle: string;
  body: TemplateResult;
}) {
  return html`
    <dialog class="md-preview-dialog" id=${params.id} @click=${handleDialogBackdropClick}>
      <div class="md-preview-dialog__panel">
        <div class="md-preview-dialog__header">
          <div>
            <div class="md-preview-dialog__title">${params.title}</div>
            <div class="card-sub" style="margin-top: 4px;">${params.subtitle}</div>
          </div>
          <button class="btn btn--sm" type="button" @click=${closeDialogFromEvent}>
            ${t("common.close")}
          </button>
        </div>
        <div class="md-preview-dialog__body" style="display: grid; gap: 16px;">
          ${params.body}
        </div>
      </div>
    </dialog>
  `;
}

function renderConnectPickerDialog(props: DashboardUserChannelsPageProps) {
  const available = localizedAvailableChannels(props);
  return renderDialog({
    id: CONNECT_PICKER_DIALOG_ID,
    title: dt("connectTitle"),
    subtitle: dt("connectSubtitle"),
    body:
      available.length === 0
        ? html`<div class="muted">${dt("connectPickerEmpty")}</div>`
        : html`
            <div style="display: flex; flex-direction: column; gap: 18px;">
              <section style="display: grid; gap: 12px;">
                <div class="card-title">${dt("quickSetupChannels")}</div>
                <div class="card-sub">${dt("quickSetupChannelsSubtitle")}</div>
                <div
                  role="list"
                  aria-label=${dt("connectTabsAriaLabel")}
                  style="display: grid; grid-template-columns: repeat(auto-fit, minmax(148px, 1fr)); gap: 12px;"
                >
                  ${available.map(
                    (channel) => html`
                      <button
                        type="button"
                        class="card"
                        style="text-align: left; padding: 14px 16px; cursor: pointer;"
                        @click=${() => {
                          closeDialogById(CONNECT_PICKER_DIALOG_ID);
                          openDialogById(connectDialogId(channel.channelId));
                        }}
                      >
                        <div style="display: flex; justify-content: space-between; gap: 10px; align-items: flex-start;">
                          <div style="display: grid; gap: 6px;">
                            <div style="font-weight: 600;">${channel.label}</div>
                            <div class="muted" style="font-size: 12px;">
                              ${
                                localizedQuickSetupEntry(channel.channelId)?.quickSetup
                                  .pickerSummary ?? dt("notConfigured")
                              }
                            </div>
                          </div>
                          <span class="pill">${channel.detailLabel}</span>
                        </div>
                      </button>
                    `,
                  )}
                </div>
              </section>

              <div
                class="muted"
                style="padding-top: 12px; border-top: 1px solid var(--border); font-size: 12px;"
              >
                ${getLocalizedUserChannelQuickSetupSettingsNote(i18n.getLocale())}
              </div>
            </div>
          `,
  });
}

function renderConnectField(field: DashboardUserChannelConnectSpec["fields"][number]) {
  return html`
    <label style="display: grid; gap: 6px;">
      <span style="font-weight: 600;">${field.label}</span>
      ${
        field.helpLines?.length
          ? html`<span class="muted" style="font-size: 12px;">
              ${field.helpLines.join(" ")}
            </span>`
          : nothing
      }
      <input
        class="input"
        name=${field.key}
        type=${field.secret ? "password" : "text"}
        .value=${field.currentValue ?? ""}
        placeholder=${field.placeholder ?? ""}
        ?required=${field.required}
      />
    </label>
  `;
}

function renderQuickSetupGuidance(channel: DashboardUserChannelConnectSpec) {
  return html`
    <section style="display: grid; gap: 12px;">
      ${renderGuidanceCard(dt("guidance.agentIdentity"), [channel.guidance.identity])}
      ${renderGuidanceCard(dt("guidance.requirements"), channel.guidance.requirements)}
      ${renderGuidanceCard(dt("guidance.setupSteps"), channel.guidance.setupSteps, true)}
      ${renderGuidanceCard(dt("guidance.artifacts"), channel.guidance.artifacts)}
    </section>
  `;
}

function renderGuidanceCard(title: string, lines: string[], ordered = false) {
  return html`
    <section class="card" style="padding: 14px 16px;">
      <div class="card-title">${title}</div>
      <div style="display: grid; gap: 8px; margin-top: 10px;">
        ${lines.map(
          (line, index) => html`
            <div style="display: flex; gap: 8px; align-items: flex-start;">
              <span class="muted" style="min-width: 18px;">${ordered ? `${index + 1}.` : "•"}</span>
              <span class="muted">${line}</span>
            </div>
          `,
        )}
      </div>
    </section>
  `;
}

function renderQuickSetupIdentityCard(
  channel: DashboardUserChannelConnectSpec,
  overrides?: Partial<{
    headline: string;
    message: string;
    badge: string;
  }>,
) {
  return html`
    <div
      style="display: grid; gap: 10px; padding: 16px; border: 1px solid var(--border); border-radius: 16px; background: color-mix(in srgb, var(--surface-2) 88%, transparent);"
    >
      <div style="display: flex; justify-content: space-between; gap: 12px; align-items: flex-start;">
        <div style="display: grid; gap: 4px;">
          <div style="font-size: 18px; font-weight: 700;">${channel.quickSetup.title}</div>
          <div style="font-weight: 600;">${overrides?.headline ?? channel.quickSetup.headline}</div>
        </div>
        <span class="pill">${overrides?.badge ?? channel.quickSetup.badge}</span>
      </div>
      <div class="muted">${overrides?.message ?? channel.quickSetup.message}</div>
    </div>
  `;
}

function renderQuickSetupForm(
  channel: DashboardUserChannelConnectSpec,
  dialogId: string,
  props: DashboardUserChannelsPageProps,
) {
  return html`
    <form
      style="display: grid; gap: 14px;"
      @submit=${(event: Event) => {
        event.preventDefault();
        const form = event.currentTarget as HTMLFormElement;
        if (!form.reportValidity()) {
          return;
        }
        const data = new FormData(form);
        const fields = Object.fromEntries(
          channel.fields.map((field) => [field.key, String(data.get(field.key) ?? "")]),
        );
        props.onConnectChannel({
          channelId: channel.channelId,
          fields,
        });
        closeDialogById(dialogId);
      }}
    >
      <section class="card">
        <div class="card-title">${channel.quickSetup.sectionTitle}</div>
        <div style="display: grid; gap: 12px; margin-top: 12px;">
          ${renderQuickSetupIdentityCard(channel)}
          ${
            channel.quickSetup.existingCredentialNote
              ? html`<div class="muted">${channel.quickSetup.existingCredentialNote}</div>`
              : nothing
          }
          ${channel.fields.map((field) => renderConnectField(field))}
        </div>
      </section>
      ${renderSetupOnlyNote(channel.quickSetup.setupNote)}
      <div style="display: flex; justify-content: flex-end; gap: 10px;">
        <button class="btn btn--sm" type="button" @click=${closeDialogFromEvent}>
          ${t("common.close")}
        </button>
        <button class="btn btn--sm primary" type="submit">
          ${channel.quickSetup.buttonTitle ?? dt("connectButton")}
        </button>
      </div>
    </form>
  `;
}

function renderSetupOnlyNote(message: string) {
  return html`
    <section class="card" style="padding: 14px 16px;">
      <div class="card-title">${dt("setupForNow")}</div>
      <div class="muted" style="margin-top: 10px;">${message}</div>
    </section>
  `;
}

function renderWhatsAppQuickSetup(
  channel: DashboardUserChannelConnectSpec,
  props: DashboardUserChannelsPageProps,
) {
  const shared = localizedQuickSetupEntry("whatsapp")?.quickSetup;
  const primaryTitle = props.whatsappQrDataUrl ? dt("whatsapp.refreshQr") : dt("whatsapp.link");
  const waitingForScan = Boolean(props.whatsappQrDataUrl);
  return html`
    <section class="card">
      <div class="card-title">${channel.quickSetup.sectionTitle}</div>
      <div style="display: grid; gap: 12px; margin-top: 12px;">
        ${renderQuickSetupIdentityCard(channel, {
          badge: waitingForScan ? shared?.waitingBadge ?? channel.quickSetup.badge : channel.quickSetup.badge,
          headline: channel.quickSetup.headline,
          message: waitingForScan
            ? shared?.waitingMessage ?? channel.quickSetup.message
            : channel.quickSetup.message,
        })}
        ${
          props.whatsappMessage
            ? html`<div class="callout">${props.whatsappMessage}</div>`
            : nothing
        }
        ${
          props.whatsappQrDataUrl
            ? html`
                <div style="display: grid; gap: 10px;">
                  <div style="font-weight: 600;">${shared?.qrTitle ?? dt("whatsapp.qrTitle")}</div>
                  <div class="muted">
                    ${shared?.qrBody ?? dt("whatsapp.qrBody")}
                  </div>
                  <div style="display: flex; justify-content: center;">
                    <img
                      src=${props.whatsappQrDataUrl}
                      alt=${dt("whatsapp.qrAlt")}
                      style="width: 220px; height: 220px; image-rendering: pixelated; border-radius: 12px;"
                    />
                  </div>
                </div>
              `
            : nothing
        }
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <button
            class="btn btn--sm primary"
            type="button"
            ?disabled=${props.whatsappBusy}
            @click=${() => props.onStartWhatsApp(false)}
          >
            ${props.whatsappBusy ? dt("whatsapp.working") : primaryTitle}
          </button>
          <button
            class="btn btn--sm"
            type="button"
            ?disabled=${props.whatsappBusy}
            @click=${() => props.onStartWhatsApp(true)}
          >
            ${dt("whatsapp.relink")}
          </button>
        </div>
      </div>
    </section>
  `;
}

function renderConnectDialogs(props: DashboardUserChannelsPageProps) {
  const available = localizedAvailableChannels(props);
  return available.map((channel) => {
    const dialogId = connectDialogId(channel.channelId);
    return renderDialog({
      id: dialogId,
      title: channel.label,
      subtitle: channel.detailLabel,
      body: html`
        ${renderQuickSetupGuidance(channel)}
        ${
          channel.quickSetup.kind === "whatsapp"
            ? html`
                ${renderWhatsAppQuickSetup(channel, props)}
                ${renderSetupOnlyNote(channel.quickSetup.setupNote)}
              `
            : renderQuickSetupForm(channel, dialogId, props)
        }
      `,
    });
  });
}

function renderListEditorFields(name: string, list: DashboardUserChannelEditableList) {
  return html`
    <label style="display: grid; gap: 6px;">
      <span style="font-weight: 600;">${list.label}</span>
      ${
        list.helpLines?.length
          ? html`<span class="muted" style="font-size: 12px;">${list.helpLines.join(" ")}</span>`
          : nothing
      }
      <textarea
        class="dashboard-memory__textarea"
        name=${name}
        rows="4"
        placeholder=${list.placeholder ?? ""}
      >${list.entries.join("\n")}</textarea>
      <span class="muted" style="font-size: 12px;">${dt("listDialogHint")}</span>
    </label>
  `;
}

function renderListEditorDialog(params: {
  id: string;
  title: string;
  subtitle: string;
  list: DashboardUserChannelEditableList;
  extraFields?: TemplateResult;
  onSubmit: (form: HTMLFormElement) => void;
}) {
  return renderDialog({
    id: params.id,
    title: params.title,
    subtitle: params.subtitle,
    body: html`
      <form
        style="display: grid; gap: 14px;"
        @submit=${(event: Event) => {
          event.preventDefault();
          const form = event.currentTarget as HTMLFormElement;
          params.onSubmit(form);
          closeDialogById(params.id);
        }}
      >
        ${params.extraFields ?? nothing}
        ${renderListEditorFields("entries", params.list)}
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button class="btn btn--sm" type="button" @click=${closeDialogFromEvent}>
            ${t("common.close")}
          </button>
          <button class="btn btn--sm primary" type="submit">${dt("saveList")}</button>
        </div>
      </form>
    `,
  });
}

function renderUsersTable(
  channel: DashboardUserChannel,
  account: DashboardUserChannelAccount,
  props: DashboardUserChannelsPageProps,
) {
  return html`
    <section class="card">
      <div style="display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; align-items: flex-start;">
        <div>
          <div class="card-title">${dt("usersTitle")}</div>
          <div class="card-sub">${dt("usersSubtitle")}</div>
        </div>
        <button class="btn btn--sm" type="button" @click=${props.onOpenUsersPage}>
          ${dt("openUsersPage")}
        </button>
      </div>
      <div class="data-table-container" style="margin-top: 16px;">
        <table class="data-table">
          <thead>
            <tr>
              <th>${dt("columns.user")}</th>
              <th>${dt("columns.groups")}</th>
              <th>${dt("columns.identity")}</th>
              <th>${dt("columns.actions")}</th>
            </tr>
          </thead>
          <tbody>
            ${
              account.users.length === 0
                ? html`
                    <tr>
                      <td colspan="4" style="text-align: center; padding: 32px 16px; color: var(--muted);">
                        ${dt("usersEmpty")}
                      </td>
                    </tr>
                  `
                : account.users.map(
                    (user) => html`
                      <tr>
                        <td>
                          <div style="display: grid; gap: 6px;">
                            <div style="font-weight: 600;">${user.userLabel}</div>
                            <div class="muted mono" style="font-size: 12px;">${user.userId}</div>
                          </div>
                        </td>
                        <td>${renderPillList(user.groupLabels)}</td>
                        <td>
                          <div style="display: grid; gap: 4px;">
                            <div>${user.identityLabel}</div>
                            <div class="muted mono" style="font-size: 12px;">${user.senderId}</div>
                          </div>
                        </td>
                        <td>
                          <button class="btn btn--sm" type="button" @click=${props.onOpenUsersPage}>
                            ${t("common.edit")}
                          </button>
                        </td>
                      </tr>
                    `,
                  )
            }
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderEditableListCard(params: {
  channel: DashboardUserChannel;
  account: DashboardUserChannelAccount;
  key: "dm" | "group" | "chats";
  title: string;
  subtitle: string;
  list: DashboardUserChannelEditableList;
  onSaveAllowlist?: (entries: string) => void;
  onSaveChats?: (policy: "allowlist" | "open" | "disabled", entries: string) => void;
}) {
  const dialogId = listDialogId(params.channel.channelId, params.account.accountId, params.key);
  const policy = policyLabel(params.list.policy);
  return html`
    <section class="card">
      <div style="display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; align-items: flex-start;">
        <div>
          <div class="card-title">${params.title}</div>
          <div class="card-sub">${params.subtitle}</div>
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
          ${policy ? html`<span class="pill">${policy}</span>` : nothing}
          <button class="btn btn--sm" type="button" @click=${() => openDialogById(dialogId)}>
            ${dt("openEditor")}
          </button>
        </div>
      </div>
      <div style="margin-top: 16px;">${renderPillList(params.list.entries)}</div>
      ${
        params.key === "chats" && params.onSaveChats
          ? renderListEditorDialog({
              id: dialogId,
              title: params.title,
              subtitle: params.subtitle,
              list: params.list,
              extraFields: html`
                <label style="display: grid; gap: 6px;">
                  <span style="font-weight: 600;">${dt("policy.label")}</span>
                  <select class="select" name="policy">
                    ${["allowlist", "open", "disabled"].map(
                      (value) => html`
                        <option value=${value} ?selected=${params.list.policy === value}>
                          ${policyLabel(value)}
                        </option>
                      `,
                    )}
                  </select>
                </label>
              `,
              onSubmit: (form) => {
                params.onSaveChats!(
                  String(new FormData(form).get("policy") ?? "allowlist") as
                    | "allowlist"
                    | "open"
                    | "disabled",
                  String(new FormData(form).get("entries") ?? ""),
                );
              },
            })
          : renderListEditorDialog({
              id: dialogId,
              title: params.title,
              subtitle: params.subtitle,
              list: params.list,
              onSubmit: (form) => {
                params.onSaveAllowlist?.(String(new FormData(form).get("entries") ?? ""));
              },
            })
      }
    </section>
  `;
}

function renderOverrides(account: DashboardUserChannelAccount) {
  if (account.overrides.length === 0) {
    return nothing;
  }
  return html`
    <section class="card">
      <div class="card-title">${dt("overridesTitle")}</div>
      <div class="card-sub">${dt("overridesSubtitle")}</div>
      <div style="display: grid; gap: 14px; margin-top: 16px;">
        ${account.overrides.map(
          (override) => html`
            <div style="display: grid; gap: 8px;">
              <div style="font-weight: 600;">${override.label}</div>
              ${renderPillList(override.entries)}
            </div>
          `,
        )}
      </div>
    </section>
  `;
}

export function renderDashboardUserChannelsPage(props: DashboardUserChannelsPageProps) {
  const selectedChannel = resolveSelectedChannel(props.result, props.selectedChannelId);
  const selectedAccount = resolveSelectedAccount(selectedChannel, props.selectedAccountId);

  return html`
    ${renderConnectPickerDialog(props)}
    ${renderConnectDialogs(props)}

    <section class="card">
      <div style="display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; align-items: flex-start;">
        <div>
          <div class="card-title">${dt("connectedTitle")}</div>
          <div class="card-sub">${dt("connectedSubtitle")}</div>
        </div>
        <button class="btn btn--sm primary" type="button" @click=${() => openDialogById(CONNECT_PICKER_DIALOG_ID)}>
          ${dt("connect")}
        </button>
      </div>

      ${
        !selectedChannel
          ? html`
              <div class="callout info" style="margin-top: 16px;">
                <div style="font-weight: 600;">${dt("emptyTitle")}</div>
                <div>${dt("emptySubtitle")}</div>
              </div>
            `
          : html`
              <div class="agent-tabs" role="tablist" aria-label=${dt("channelTabsAriaLabel")} style="margin-top: 16px;">
                ${props.result?.channels.map(
                  (channel) => html`
                    <button
                      type="button"
                      class="agent-tab ${channel.channelId === selectedChannel.channelId ? "active" : ""}"
                      @click=${() => props.onSelectChannel(channel.channelId)}
                    >
                      ${channel.label}
                    </button>
                  `,
                )}
              </div>
              ${
                selectedChannel.accounts.length > 1
                  ? html`
                      <div class="agent-tabs" role="tablist" aria-label=${dt("accountTabsAriaLabel")} style="margin-top: 14px;">
                        ${selectedChannel.accounts.map(
                          (account) => html`
                            <button
                              type="button"
                              class="agent-tab ${account.accountId === selectedAccount?.accountId ? "active" : ""}"
                              @click=${() =>
                                props.onSelectAccount(selectedChannel.channelId, account.accountId)}
                            >
                              ${account.name ?? account.accountId}
                            </button>
                          `,
                        )}
                      </div>
                    `
                  : nothing
              }
            `
      }
    </section>

    ${
      selectedChannel && selectedAccount
        ? html`
            <section class="card">
              <div style="display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
                <div>
                  <div class="card-title">${selectedChannel.label}</div>
                  <div class="card-sub">${selectedChannel.detailLabel}</div>
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                  ${selectedAccount.defaultAccount ? html`<span class="pill">${dt("defaultAccount")}</span>` : nothing}
                  ${selectedAccount.connected ? html`<span class="pill">${t("common.online")}</span>` : nothing}
                  ${!selectedAccount.enabled ? html`<span class="pill danger">${t("common.disabled")}</span>` : nothing}
                </div>
              </div>
              <div style="display: grid; gap: 8px; margin-top: 14px;">
                <div><span class="muted">${dt("account")}:</span> <span class="mono">${selectedAccount.accountId}</span></div>
                ${
                  selectedAccount.name
                    ? html`<div><span class="muted">${dt("nameLabel")}:</span> ${selectedAccount.name}</div>`
                    : nothing
                }
              </div>
            </section>

            ${renderUsersTable(selectedChannel, selectedAccount, props)}

            ${
              selectedAccount.dmSenders
                ? renderEditableListCard({
                    channel: selectedChannel,
                    account: selectedAccount,
                    key: "dm",
                    title: dt("sendersTitle"),
                    subtitle: dt("sendersSubtitle"),
                    list: selectedAccount.dmSenders,
                    onSaveAllowlist: (entries) =>
                      props.onSaveAllowlist({
                        channelId: selectedChannel.channelId,
                        accountId: selectedAccount.accountId,
                        scope: "dm",
                        entries,
                      }),
                  })
                : nothing
            }

            ${
              selectedAccount.groupSenders
                ? renderEditableListCard({
                    channel: selectedChannel,
                    account: selectedAccount,
                    key: "group",
                    title: dt("groupSendersTitle"),
                    subtitle: dt("groupSendersSubtitle"),
                    list: selectedAccount.groupSenders,
                    onSaveAllowlist: (entries) =>
                      props.onSaveAllowlist({
                        channelId: selectedChannel.channelId,
                        accountId: selectedAccount.accountId,
                        scope: "group",
                        entries,
                      }),
                  })
                : nothing
            }

            ${
              selectedAccount.chats
                ? renderEditableListCard({
                    channel: selectedChannel,
                    account: selectedAccount,
                    key: "chats",
                    title: dt("chatsTitle"),
                    subtitle: dt("chatsSubtitle"),
                    list: selectedAccount.chats,
                    onSaveChats: (policy, entries) =>
                      props.onSaveChats({
                        channelId: selectedChannel.channelId,
                        accountId: selectedAccount.accountId,
                        policy,
                        entries,
                      }),
                  })
                : nothing
            }

            ${renderOverrides(selectedAccount)}
          `
        : nothing
    }
  `;
}
