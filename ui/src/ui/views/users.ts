import { html, nothing, type TemplateResult } from "lit";
import { t } from "../../i18n/index.ts";
import type {
  MultiUserMemoryAdminSnapshot,
  MultiUserMemoryConfigState,
  MultiUserMemoryGroup,
  MultiUserMemoryIdentity,
  MultiUserMemoryUser,
} from "../controllers/multi-user-memory.ts";
import { MULTI_USER_MEMORY_LANGUAGE_OPTIONS } from "../controllers/multi-user-memory.ts";
import { buildExternalLinkRel, EXTERNAL_LINK_TARGET } from "../external-link.ts";

export type UsersViewTab = "overview" | "users" | "groups" | "settings";

type UsersViewProps = {
  activeTab: UsersViewTab;
  configLoading: boolean;
  configReady: boolean;
  configSaving: boolean;
  configApplying: boolean;
  configDirty: boolean;
  runtimeLoading: boolean;
  runtimeError: string | null;
  config: MultiUserMemoryConfigState;
  runtime: MultiUserMemoryAdminSnapshot | null;
  secureDashboardUrl: string | null;
  newUserDisplayName: string;
  newUserLanguage: string;
  newUserIdentities: MultiUserMemoryIdentity[];
  newGroupLabel: string;
  onTabChange: (tab: UsersViewTab) => void;
  onReload: () => void;
  onSave: () => void;
  onApply: () => void;
  onEnablePlugin: () => void;
  onTopLevelBooleanChange: (field: "enabled" | "autoDiscover", value: boolean) => void;
  onTopLevelStringChange: (
    field: "defaultLanguage" | "approvalCenterBaseUrl" | "curatorAgentId",
    value: string,
  ) => void;
  onApprovalDeliveryChange: (
    field: "mode" | "channelId" | "accountId" | "to",
    value: string,
  ) => void;
  onToggleAdminUser: (userId: string, enabled: boolean) => void;
  onNewUserDraftChange: (field: "displayName" | "language", value: string) => void;
  onAddDraftIdentity: () => void;
  onDraftIdentityFieldChange: (
    index: number,
    field: keyof MultiUserMemoryIdentity,
    value: string,
  ) => void;
  onDeleteDraftIdentity: (index: number) => void;
  onCreateUser: () => void;
  onClearUserDraft: () => void;
  onNewGroupDraftChange: (field: "label", value: string) => void;
  onCreateGroup: () => void;
  onClearGroupDraft: () => void;
  onUserFieldChange: (
    userId: string,
    field: "displayName" | "preferredLanguage" | "notes",
    value: string,
  ) => void;
  onUserActiveChange: (userId: string, value: boolean) => void;
  onDeleteUser: (userId: string) => void;
  onAddIdentity: (userId: string) => void;
  onIdentityFieldChange: (
    userId: string,
    index: number,
    field: keyof MultiUserMemoryIdentity,
    value: string,
  ) => void;
  onDeleteIdentity: (userId: string, index: number) => void;
  onGroupFieldChange: (groupId: string, field: "label" | "description", value: string) => void;
  onGroupActiveChange: (groupId: string, value: boolean) => void;
  onDeleteGroup: (groupId: string) => void;
  onToggleGroupMember: (groupId: string, userId: string, enabled: boolean) => void;
  onToggleGroupParent: (groupId: string, parentGroupId: string, enabled: boolean) => void;
  onCreateUserFromProvisional: (
    provisional: MultiUserMemoryAdminSnapshot["provisionalUsers"][number],
  ) => void;
  onUseProvisionalAsDraft: (
    provisional: MultiUserMemoryAdminSnapshot["provisionalUsers"][number],
  ) => void;
};

const CREATE_USER_DIALOG_ID = "multi-user-memory-create-user-dialog";
const CREATE_GROUP_DIALOG_ID = "multi-user-memory-create-group-dialog";

function renderStat(label: string, value: string) {
  return html`
    <div class="card" style="padding: 14px 16px;">
      <div class="muted" style="font-size: 12px;">${label}</div>
      <div style="font-size: 24px; font-weight: 700; margin-top: 6px;">${value}</div>
    </div>
  `;
}

function formatDateTime(timestamp: number | undefined): string {
  if (!timestamp) {
    return "—";
  }
  return new Date(timestamp).toLocaleString();
}

function sanitizeDomId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "item";
}

function buildUserDialogId(userId: string): string {
  return `multi-user-memory-user-dialog-${sanitizeDomId(userId)}`;
}

function buildGroupDialogId(groupId: string): string {
  return `multi-user-memory-group-dialog-${sanitizeDomId(groupId)}`;
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
          <div class="muted" style="font-size: 12px;">
            ${t("multiUserMemory.setup.dialogHint")}
          </div>
        </div>
      </div>
    </dialog>
  `;
}

function normalizeList(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    items.push(normalized);
  }
  return items;
}

function languageLabel(languageId: string): string {
  return (
    MULTI_USER_MEMORY_LANGUAGE_OPTIONS.find((language) => language.id === languageId)?.label ??
    languageId
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

function renderStatusPill(enabled: boolean) {
  return html`
    <span class="pill ${enabled ? "" : "danger"}">
      ${enabled ? t("common.enabled") : t("common.disabled")}
    </span>
  `;
}

function renderEmptyTableRow(message: string, colspan: number) {
  return html`
    <tr>
      <td colspan=${String(colspan)} style="text-align: center; padding: 40px 16px; color: var(--muted);">
        ${message}
      </td>
    </tr>
  `;
}

function hasConfiguredIdentity(
  provisional: MultiUserMemoryAdminSnapshot["provisionalUsers"][number],
  users: MultiUserMemoryUser[],
): string | null {
  for (const user of users) {
    for (const identity of user.identities) {
      if (identity.channelId !== provisional.channelId) {
        continue;
      }
      if ((identity.accountId ?? "") !== (provisional.accountId ?? "")) {
        continue;
      }
      if (identity.senderId !== provisional.senderId) {
        continue;
      }
      return user.displayName ?? user.id;
    }
  }
  return null;
}

function userChannels(user: MultiUserMemoryUser): string[] {
  return normalizeList(user.identities.map((identity) => identity.channelId));
}

function userSenderIds(user: MultiUserMemoryUser): string[] {
  return normalizeList(user.identities.map((identity) => identity.senderId));
}

function groupMemberLabels(group: MultiUserMemoryGroup, users: MultiUserMemoryUser[]): string[] {
  const userMap = new Map(users.map((user) => [user.id, user.displayName ?? user.id]));
  return group.memberUserIds.map((userId) => userMap.get(userId) ?? userId);
}

function groupParentLabels(group: MultiUserMemoryGroup, groups: MultiUserMemoryGroup[]): string[] {
  const groupMap = new Map(groups.map((entry) => [entry.id, entry.label ?? entry.id]));
  return group.parentGroupIds.map((groupId) => groupMap.get(groupId) ?? groupId);
}

function renderIdentityEditor(
  userId: string,
  identity: MultiUserMemoryIdentity,
  index: number,
  props: UsersViewProps,
) {
  return html`
    <div
      style="
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 12px;
        display: grid;
        gap: 10px;
      "
    >
      <div
        style="display: flex; align-items: center; justify-content: space-between; gap: 12px;"
      >
        <strong>${t("multiUserMemory.identity.title", { number: String(index + 1) })}</strong>
        <button
          class="btn btn--sm danger"
          type="button"
          @click=${() => props.onDeleteIdentity(userId, index)}
        >
          ${t("multiUserMemory.actions.remove")}
        </button>
      </div>
      <div class="form-grid" style="display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
        <label class="field">
          <span>${t("multiUserMemory.identity.label")}</span>
          <input
            .value=${identity.label ?? ""}
            @input=${(event: Event) =>
              props.onIdentityFieldChange(
                userId,
                index,
                "label",
                (event.target as HTMLInputElement).value,
              )}
          />
        </label>
        <label class="field">
          <span>${t("multiUserMemory.identity.channelId")}</span>
          <input
            .value=${identity.channelId}
            @input=${(event: Event) =>
              props.onIdentityFieldChange(
                userId,
                index,
                "channelId",
                (event.target as HTMLInputElement).value,
              )}
          />
        </label>
        <label class="field">
          <span>${t("multiUserMemory.identity.accountId")}</span>
          <input
            .value=${identity.accountId ?? ""}
            @input=${(event: Event) =>
              props.onIdentityFieldChange(
                userId,
                index,
                "accountId",
                (event.target as HTMLInputElement).value,
              )}
          />
        </label>
        <label class="field">
          <span>${t("multiUserMemory.identity.senderId")}</span>
          <input
            .value=${identity.senderId}
            @input=${(event: Event) =>
              props.onIdentityFieldChange(
                userId,
                index,
                "senderId",
                (event.target as HTMLInputElement).value,
              )}
          />
        </label>
        <label class="field">
          <span>${t("multiUserMemory.identity.senderName")}</span>
          <input
            .value=${identity.senderName ?? ""}
            @input=${(event: Event) =>
              props.onIdentityFieldChange(
                userId,
                index,
                "senderName",
                (event.target as HTMLInputElement).value,
              )}
          />
        </label>
        <label class="field">
          <span>${t("multiUserMemory.identity.senderUsername")}</span>
          <input
            .value=${identity.senderUsername ?? ""}
            @input=${(event: Event) =>
              props.onIdentityFieldChange(
                userId,
                index,
                "senderUsername",
                (event.target as HTMLInputElement).value,
              )}
          />
        </label>
      </div>
    </div>
  `;
}

function renderDraftIdentityEditor(
  identity: MultiUserMemoryIdentity,
  index: number,
  props: UsersViewProps,
) {
  return html`
    <div
      style="
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 12px;
        display: grid;
        gap: 10px;
      "
    >
      <div
        style="display: flex; align-items: center; justify-content: space-between; gap: 12px;"
      >
        <strong>${t("multiUserMemory.identity.title", { number: String(index + 1) })}</strong>
        <button
          class="btn btn--sm danger"
          type="button"
          @click=${() => props.onDeleteDraftIdentity(index)}
        >
          ${t("multiUserMemory.actions.remove")}
        </button>
      </div>
      <div class="form-grid" style="display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
        <label class="field">
          <span>${t("multiUserMemory.identity.label")}</span>
          <input
            .value=${identity.label ?? ""}
            @input=${(event: Event) =>
              props.onDraftIdentityFieldChange(
                index,
                "label",
                (event.target as HTMLInputElement).value,
              )}
          />
        </label>
        <label class="field">
          <span>${t("multiUserMemory.identity.channelId")}</span>
          <input
            .value=${identity.channelId}
            @input=${(event: Event) =>
              props.onDraftIdentityFieldChange(
                index,
                "channelId",
                (event.target as HTMLInputElement).value,
              )}
          />
        </label>
        <label class="field">
          <span>${t("multiUserMemory.identity.accountId")}</span>
          <input
            .value=${identity.accountId ?? ""}
            @input=${(event: Event) =>
              props.onDraftIdentityFieldChange(
                index,
                "accountId",
                (event.target as HTMLInputElement).value,
              )}
          />
        </label>
        <label class="field">
          <span>${t("multiUserMemory.identity.senderId")}</span>
          <input
            .value=${identity.senderId}
            @input=${(event: Event) =>
              props.onDraftIdentityFieldChange(
                index,
                "senderId",
                (event.target as HTMLInputElement).value,
              )}
          />
        </label>
        <label class="field">
          <span>${t("multiUserMemory.identity.senderName")}</span>
          <input
            .value=${identity.senderName ?? ""}
            @input=${(event: Event) =>
              props.onDraftIdentityFieldChange(
                index,
                "senderName",
                (event.target as HTMLInputElement).value,
              )}
          />
        </label>
        <label class="field">
          <span>${t("multiUserMemory.identity.senderUsername")}</span>
          <input
            .value=${identity.senderUsername ?? ""}
            @input=${(event: Event) =>
              props.onDraftIdentityFieldChange(
                index,
                "senderUsername",
                (event.target as HTMLInputElement).value,
              )}
          />
        </label>
      </div>
    </div>
  `;
}

function renderSetupCard(props: UsersViewProps) {
  return html`
    <section class="card">
      <div style="display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
        <div>
          <div class="card-title">${t("multiUserMemory.setup.title")}</div>
          <div class="card-sub">${t("multiUserMemory.setup.subtitle")}</div>
        </div>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <button
            class="btn btn--sm"
            type="button"
            ?disabled=${props.configLoading || props.runtimeLoading}
            @click=${props.onReload}
          >
            ${t("common.refresh")}
          </button>
          ${
            props.config.slotSelected
              ? nothing
              : html`
                  <button
                    class="btn btn--sm"
                    type="button"
                    ?disabled=${!props.configReady || props.configLoading || props.configSaving || props.configApplying}
                    @click=${props.onEnablePlugin}
                  >
                    ${t("multiUserMemory.actions.enable")}
                  </button>
                `
          }
          <button
            class="btn btn--sm"
            type="button"
            ?disabled=${!props.configReady || props.configLoading || !props.configDirty || props.configSaving}
            @click=${props.onSave}
          >
            ${t("multiUserMemory.actions.save")}
          </button>
          <button
            class="btn btn--sm primary"
            type="button"
            ?disabled=${!props.configReady || props.configLoading || !props.configDirty || props.configApplying}
            @click=${props.onApply}
          >
            ${t("multiUserMemory.actions.apply")}
          </button>
        </div>
      </div>
      ${
        props.runtimeError
          ? html`<div class="callout danger" style="margin-top: 12px;">${props.runtimeError}</div>`
          : nothing
      }
      ${
        !props.config.slotSelected
          ? html`<div class="callout warn" style="margin-top: 12px;">${t("multiUserMemory.setup.enableHint")}</div>`
          : nothing
      }
      ${
        props.configDirty
          ? html`<div class="callout info" style="margin-top: 12px;">${t("multiUserMemory.setup.unsaved")}</div>`
          : nothing
      }
    </section>
  `;
}

function renderUsersViewTabs(props: UsersViewProps) {
  const tabs: Array<{ id: UsersViewTab; label: string }> = [
    { id: "overview", label: t("multiUserMemory.tabs.overview") },
    { id: "users", label: t("multiUserMemory.tabs.users") },
    { id: "groups", label: t("multiUserMemory.tabs.groups") },
    { id: "settings", label: t("multiUserMemory.tabs.settings") },
  ];

  return html`
    <div class="agent-tabs" role="tablist" aria-label=${t("multiUserMemory.tabs.ariaLabel")}>
      ${tabs.map(
        (tab) => html`
          <button
            type="button"
            class="agent-tab ${props.activeTab === tab.id ? "active" : ""}"
            role="tab"
            aria-selected=${String(props.activeTab === tab.id)}
            @click=${() => props.onTabChange(tab.id)}
          >
            ${tab.label}
          </button>
        `,
      )}
    </div>
  `;
}

function renderDetectedSendersSection(props: UsersViewProps) {
  const provisionalUsers = props.runtime?.provisionalUsers ?? [];
  const firstDetectedBootstrap =
    props.config.users.length === 0 && provisionalUsers.length > 0 && !props.runtimeLoading;
  const showDetectedSendersCallout = provisionalUsers.length > 0 && !props.runtimeLoading;
  const configMutationDisabled =
    !props.configReady || props.configLoading || props.configSaving || props.configApplying;

  return html`
    <section class="card">
      <div class="card-title">${t("multiUserMemory.runtime.provisionalTitle")}</div>
      <div class="card-sub">${t("multiUserMemory.runtime.provisionalSubtitle")}</div>
      ${
        showDetectedSendersCallout
          ? html`
              <div class="callout info" style="margin-top: 12px;">
                <div>
                  ${
                    firstDetectedBootstrap
                      ? t("multiUserMemory.runtime.bootstrapHint")
                      : "Detected senders are ready to review here."
                  }
                </div>
                ${
                  props.secureDashboardUrl
                    ? html`
                        <div style="margin-top: 8px;">
                          On your phone too? Open the secure dashboard here:
                        </div>
                        <div style="margin-top: 6px;">
                          <a
                            class="session-link"
                            href=${props.secureDashboardUrl}
                            target=${EXTERNAL_LINK_TARGET}
                            rel=${buildExternalLinkRel()}
                          >
                            ${props.secureDashboardUrl}
                          </a>
                        </div>
                      `
                    : nothing
                }
              </div>
            `
          : nothing
      }
      ${
        props.runtimeLoading
          ? html`
              <div class="callout" style="margin-top: 12px;">
                ${t("multiUserMemory.runtime.loading")}
              </div>
            `
          : !props.runtime && !props.runtimeError
            ? html`
                <div class="callout warn" style="margin-top: 12px;">
                  ${t("multiUserMemory.runtime.unavailable")}
                </div>
              `
            : provisionalUsers.length === 0
              ? html`
                  <div class="callout" style="margin-top: 12px;">
                    ${t("multiUserMemory.runtime.provisionalEmpty")}
                  </div>
                `
              : html`
                  <div style="display: grid; gap: 12px; margin-top: 14px;">
                    ${provisionalUsers.map((provisional) => {
                      const matched = hasConfiguredIdentity(provisional, props.config.users);
                      return html`
                        <div
                          style="
                            border: 1px solid var(--border);
                            border-radius: var(--radius);
                            padding: 14px;
                            display: grid;
                            gap: 10px;
                          "
                        >
                          <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;">
                            <div>
                              <strong>${provisional.senderName ?? provisional.senderId}</strong>
                              <div class="muted" style="margin-top: 4px;">
                                ${provisional.channelId}
                                ${provisional.accountId ? ` / ${provisional.accountId}` : ""}
                                / ${provisional.senderId}
                              </div>
                            </div>
                            ${
                              matched
                                ? html`<span class="pill">${t("multiUserMemory.runtime.alreadyLinked", { user: matched })}</span>`
                                : html`
                                    <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end;">
                                      <button
                                        class="btn btn--sm primary"
                                        type="button"
                                        ?disabled=${configMutationDisabled}
                                        @click=${() => props.onCreateUserFromProvisional(provisional)}
                                      >
                                        ${t("multiUserMemory.actions.createUser")}
                                      </button>
                                      <button
                                        class="btn btn--sm"
                                        type="button"
                                        @click=${() => {
                                          props.onUseProvisionalAsDraft(provisional);
                                          openDialogById(CREATE_USER_DIALOG_ID);
                                        }}
                                      >
                                        ${t("multiUserMemory.actions.useAsDraft")}
                                      </button>
                                    </div>
                                  `
                            }
                          </div>
                          <div style="display: flex; gap: 12px; flex-wrap: wrap;" class="muted">
                            <span>${t("multiUserMemory.runtime.firstSeen")}: ${formatDateTime(provisional.firstSeenAt)}</span>
                            <span>${t("multiUserMemory.runtime.lastSeen")}: ${formatDateTime(provisional.lastSeenAt)}</span>
                            <span>${t("multiUserMemory.runtime.messageCount")}: ${provisional.messageCount}</span>
                          </div>
                        </div>
                      `;
                    })}
                  </div>
                `
      }
    </section>
  `;
}

function renderProposalsSection(proposals: MultiUserMemoryAdminSnapshot["proposals"]) {
  return html`
    <section class="card">
      <div class="card-title">${t("multiUserMemory.runtime.proposalsTitle")}</div>
      <div class="card-sub">${t("multiUserMemory.runtime.proposalsSubtitle")}</div>
      ${
        proposals.length === 0
          ? html`<div class="callout" style="margin-top: 12px;">${t("multiUserMemory.runtime.proposalsEmpty")}</div>`
          : html`
              <div style="display: grid; gap: 12px; margin-top: 14px;">
                ${proposals.map(
                  (proposal) => html`
                    <div
                      style="
                        border: 1px solid var(--border);
                        border-radius: var(--radius);
                        padding: 14px;
                        display: grid;
                        gap: 8px;
                      "
                    >
                      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;">
                        <div>
                          <strong>${proposal.targetGroupId}</strong>
                          <div class="muted" style="margin-top: 4px;">
                            ${proposal.sourceUserId} → ${proposal.targetGroupId}
                          </div>
                        </div>
                        <span class="pill">${proposal.status}</span>
                      </div>
                      <div>${proposal.preview}</div>
                      <div class="muted">${proposal.whyShared}</div>
                      <div style="display: flex; gap: 12px; flex-wrap: wrap;" class="muted">
                        <span>${t("multiUserMemory.runtime.createdAt")}: ${formatDateTime(proposal.createdAt)}</span>
                        ${
                          proposal.decidedAt
                            ? html`<span>${t("multiUserMemory.runtime.decidedAt")}: ${formatDateTime(proposal.decidedAt)}</span>`
                            : nothing
                        }
                      </div>
                    </div>
                  `,
                )}
              </div>
            `
      }
    </section>
  `;
}

function renderOverviewSection(props: UsersViewProps) {
  const provisionalUsers = props.runtime?.provisionalUsers ?? [];
  const proposals = props.runtime?.proposals ?? [];

  return html`
    <div style="display: grid; gap: 18px;">
      <div style="display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
        ${renderStat(t("multiUserMemory.stats.users"), String(props.config.users.length))}
        ${renderStat(t("multiUserMemory.stats.groups"), String(props.config.groups.length))}
        ${renderStat(t("multiUserMemory.stats.provisional"), String(provisionalUsers.length))}
        ${renderStat(t("multiUserMemory.stats.proposals"), String(proposals.length))}
      </div>
      ${renderDetectedSendersSection(props)}
      ${renderProposalsSection(proposals)}
    </div>
  `;
}

function renderPluginSettingsSection(props: UsersViewProps) {
  return html`
    <section class="card">
      <div class="card-title">${t("multiUserMemory.settings.title")}</div>
      <div class="card-sub">${t("multiUserMemory.settings.subtitle")}</div>
      <div class="form-grid" style="display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin-top: 14px;">
        <label class="field checkbox">
          <span>${t("multiUserMemory.settings.enabled")}</span>
          <input
            type="checkbox"
            .checked=${props.config.enabled}
            @change=${(event: Event) =>
              props.onTopLevelBooleanChange("enabled", (event.target as HTMLInputElement).checked)}
          />
        </label>
        <label class="field checkbox">
          <span>${t("multiUserMemory.settings.autoDiscover")}</span>
          <input
            type="checkbox"
            .checked=${props.config.autoDiscover}
            @change=${(event: Event) =>
              props.onTopLevelBooleanChange(
                "autoDiscover",
                (event.target as HTMLInputElement).checked,
              )}
          />
        </label>
        <label class="field">
          <span>${t("multiUserMemory.settings.defaultLanguage")}</span>
          <select
            .value=${props.config.defaultLanguage}
            @change=${(event: Event) =>
              props.onTopLevelStringChange(
                "defaultLanguage",
                (event.target as HTMLSelectElement).value,
              )}
          >
            ${MULTI_USER_MEMORY_LANGUAGE_OPTIONS.map(
              (language) => html`<option value=${language.id}>${language.label}</option>`,
            )}
          </select>
        </label>
      </div>
      <details style="margin-top: 16px;">
        <summary style="cursor: pointer; font-weight: 600;">
          ${t("multiUserMemory.settings.advancedTitle")}
        </summary>
        <div class="card-sub" style="margin-top: 8px;">
          ${t("multiUserMemory.settings.advancedSubtitle")}
        </div>
        <div class="form-grid" style="display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin-top: 14px;">
          <label class="field">
            <span>${t("multiUserMemory.settings.curatorAgentId")}</span>
            <input
              .value=${props.config.curatorAgentId ?? ""}
              @input=${(event: Event) =>
                props.onTopLevelStringChange(
                  "curatorAgentId",
                  (event.target as HTMLInputElement).value,
                )}
            />
          </label>
          <label class="field" style="grid-column: 1 / -1;">
            <span>${t("multiUserMemory.settings.approvalCenterBaseUrl")}</span>
            <input
              .value=${props.config.approvalCenterBaseUrl ?? ""}
              @input=${(event: Event) =>
                props.onTopLevelStringChange(
                  "approvalCenterBaseUrl",
                  (event.target as HTMLInputElement).value,
                )}
            />
          </label>
        </div>
        <div class="form-grid" style="display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin-top: 18px;">
          <label class="field">
            <span>${t("multiUserMemory.settings.approvalMode")}</span>
            <select
              .value=${props.config.approvalDelivery.mode}
              @change=${(event: Event) =>
                props.onApprovalDeliveryChange("mode", (event.target as HTMLSelectElement).value)}
            >
              <option value="same_session">same_session</option>
              <option value="same_channel">same_channel</option>
              <option value="disabled">disabled</option>
            </select>
          </label>
          <label class="field">
            <span>${t("multiUserMemory.settings.approvalChannelId")}</span>
            <input
              .value=${props.config.approvalDelivery.channelId ?? ""}
              @input=${(event: Event) =>
                props.onApprovalDeliveryChange(
                  "channelId",
                  (event.target as HTMLInputElement).value,
                )}
            />
          </label>
          <label class="field">
            <span>${t("multiUserMemory.settings.approvalAccountId")}</span>
            <input
              .value=${props.config.approvalDelivery.accountId ?? ""}
              @input=${(event: Event) =>
                props.onApprovalDeliveryChange(
                  "accountId",
                  (event.target as HTMLInputElement).value,
                )}
            />
          </label>
          <label class="field">
            <span>${t("multiUserMemory.settings.approvalTarget")}</span>
            <input
              .value=${props.config.approvalDelivery.to ?? ""}
              @input=${(event: Event) =>
                props.onApprovalDeliveryChange("to", (event.target as HTMLInputElement).value)}
            />
          </label>
        </div>
      </details>
    </section>
  `;
}

function renderCreateUserForm(props: UsersViewProps, configMutationDisabled: boolean) {
  return html`
    <div style="display: grid; gap: 18px;">
      <div class="callout info">${t("multiUserMemory.users.adminHint")}</div>
      <div class="form-grid" style="display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
        <label class="field">
          <span>${t("multiUserMemory.users.displayName")}</span>
          <input
            .value=${props.newUserDisplayName}
            @input=${(event: Event) =>
              props.onNewUserDraftChange("displayName", (event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="field">
          <span>${t("multiUserMemory.users.language")}</span>
          <select
            .value=${props.newUserLanguage}
            @change=${(event: Event) =>
              props.onNewUserDraftChange("language", (event.target as HTMLSelectElement).value)}
          >
            ${MULTI_USER_MEMORY_LANGUAGE_OPTIONS.map(
              (language) => html`<option value=${language.id}>${language.label}</option>`,
            )}
          </select>
        </label>
      </div>
      <div class="card-sub">${t("multiUserMemory.users.autoIdHint")}</div>
      ${
        props.newUserIdentities.length > 0
          ? html`
              <div class="callout info">
                ${t("multiUserMemory.users.seedIdentity", {
                  channel: props.newUserIdentities[0]?.channelId ?? "",
                  senderId: props.newUserIdentities[0]?.senderId ?? "",
                })}
              </div>
            `
          : nothing
      }
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
        <div>
          <div class="card-title" style="font-size: 16px;">
            ${t("multiUserMemory.users.identities")}
          </div>
          <div class="card-sub">${t("multiUserMemory.users.identitiesHelp")}</div>
        </div>
        <button class="btn btn--sm" type="button" @click=${props.onAddDraftIdentity}>
          ${t("multiUserMemory.actions.addIdentity")}
        </button>
      </div>
      <div style="display: grid; gap: 12px;">
        ${
          props.newUserIdentities.length === 0
            ? html`<div class="callout">${t("multiUserMemory.users.identitiesDraftEmpty")}</div>`
            : props.newUserIdentities.map((identity, index) =>
                renderDraftIdentityEditor(identity, index, props),
              )
        }
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap;">
        <button class="btn btn--sm" type="button" @click=${props.onClearUserDraft}>
          ${t("multiUserMemory.actions.clearDraft")}
        </button>
        <button
          class="btn btn--sm primary"
          type="button"
          ?disabled=${configMutationDisabled}
          @click=${() => {
            props.onCreateUser();
            closeDialogById(CREATE_USER_DIALOG_ID);
          }}
        >
          ${t("multiUserMemory.actions.createUser")}
        </button>
      </div>
    </div>
  `;
}

function renderUserEditor(user: MultiUserMemoryUser, props: UsersViewProps, dialogId: string) {
  const adminUser = props.config.adminUserIds.includes(user.id);

  return html`
    <div style="display: grid; gap: 18px;">
      <div class="callout">
        <strong>${user.displayName ?? user.id}</strong>
        <div class="muted" style="margin-top: 4px;">
          ${t("multiUserMemory.users.userId")}: <code>${user.id}</code>
        </div>
      </div>
      <div class="form-grid" style="display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
        <label class="field">
          <span>${t("multiUserMemory.users.displayName")}</span>
          <input
            .value=${user.displayName ?? ""}
            @input=${(event: Event) =>
              props.onUserFieldChange(
                user.id,
                "displayName",
                (event.target as HTMLInputElement).value,
              )}
          />
        </label>
        <label class="field">
          <span>${t("multiUserMemory.users.language")}</span>
          <select
            .value=${user.preferredLanguage}
            @change=${(event: Event) =>
              props.onUserFieldChange(
                user.id,
                "preferredLanguage",
                (event.target as HTMLSelectElement).value,
              )}
          >
            ${MULTI_USER_MEMORY_LANGUAGE_OPTIONS.map(
              (language) => html`<option value=${language.id}>${language.label}</option>`,
            )}
          </select>
        </label>
        <label class="field checkbox">
          <span>${t("multiUserMemory.users.active")}</span>
          <input
            type="checkbox"
            .checked=${user.active}
            @change=${(event: Event) =>
              props.onUserActiveChange(user.id, (event.target as HTMLInputElement).checked)}
          />
        </label>
        <label class="field checkbox">
          <span>${t("multiUserMemory.users.adminAccess")}</span>
          <input
            type="checkbox"
            .checked=${adminUser}
            @change=${(event: Event) =>
              props.onToggleAdminUser(user.id, (event.target as HTMLInputElement).checked)}
          />
        </label>
      </div>
      <label class="field">
        <span>${t("multiUserMemory.users.notes")}</span>
        <textarea
          rows="4"
          .value=${user.notes ?? ""}
          @input=${(event: Event) =>
            props.onUserFieldChange(user.id, "notes", (event.target as HTMLTextAreaElement).value)}
        ></textarea>
      </label>
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
        <div>
          <div class="card-title" style="font-size: 16px;">${t("multiUserMemory.users.identities")}</div>
          <div class="card-sub">${t("multiUserMemory.users.identitiesHelp")}</div>
        </div>
        <button class="btn btn--sm" type="button" @click=${() => props.onAddIdentity(user.id)}>
          ${t("multiUserMemory.actions.addIdentity")}
        </button>
      </div>
      <div style="display: grid; gap: 12px;">
        ${
          user.identities.length === 0
            ? html`<div class="callout">${t("multiUserMemory.users.identitiesEmpty")}</div>`
            : user.identities.map((identity, index) =>
                renderIdentityEditor(user.id, identity, index, props),
              )
        }
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap;">
        <button
          class="btn btn--sm danger"
          type="button"
          @click=${() => {
            closeDialogById(dialogId);
            props.onDeleteUser(user.id);
          }}
        >
          ${t("multiUserMemory.actions.deleteUser")}
        </button>
      </div>
    </div>
  `;
}

function renderCreateGroupForm(props: UsersViewProps, configMutationDisabled: boolean) {
  return html`
    <div style="display: grid; gap: 18px;">
      <label class="field">
        <span>${t("multiUserMemory.groups.label")}</span>
        <input
          .value=${props.newGroupLabel}
          @input=${(event: Event) =>
            props.onNewGroupDraftChange("label", (event.target as HTMLInputElement).value)}
        />
      </label>
      <div class="card-sub">${t("multiUserMemory.groups.autoIdHint")}</div>
      <div style="display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap;">
        <button class="btn btn--sm" type="button" @click=${props.onClearGroupDraft}>
          ${t("multiUserMemory.actions.clearDraft")}
        </button>
        <button
          class="btn btn--sm primary"
          type="button"
          ?disabled=${configMutationDisabled}
          @click=${() => {
            props.onCreateGroup();
            closeDialogById(CREATE_GROUP_DIALOG_ID);
          }}
        >
          ${t("multiUserMemory.actions.createGroup")}
        </button>
      </div>
    </div>
  `;
}

function renderGroupEditor(
  group: MultiUserMemoryGroup,
  users: MultiUserMemoryUser[],
  groups: MultiUserMemoryGroup[],
  props: UsersViewProps,
  dialogId: string,
) {
  const availableParentGroups = groups.filter((entry) => entry.id !== group.id);

  return html`
    <div style="display: grid; gap: 18px;">
      <div class="callout">
        <strong>${group.label ?? group.id}</strong>
        <div class="muted" style="margin-top: 4px;">
          ${t("multiUserMemory.groups.groupId")}: <code>${group.id}</code>
        </div>
      </div>
      <div class="form-grid" style="display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
        <label class="field">
          <span>${t("multiUserMemory.groups.label")}</span>
          <input
            .value=${group.label ?? ""}
            @input=${(event: Event) =>
              props.onGroupFieldChange(group.id, "label", (event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="field checkbox">
          <span>${t("multiUserMemory.groups.active")}</span>
          <input
            type="checkbox"
            .checked=${group.active}
            @change=${(event: Event) =>
              props.onGroupActiveChange(group.id, (event.target as HTMLInputElement).checked)}
          />
        </label>
      </div>
      <label class="field">
        <span>${t("multiUserMemory.groups.description")}</span>
        <textarea
          rows="4"
          .value=${group.description ?? ""}
          @input=${(event: Event) =>
            props.onGroupFieldChange(
              group.id,
              "description",
              (event.target as HTMLTextAreaElement).value,
            )}
        ></textarea>
      </label>
      <div style="display: grid; gap: 16px;">
        <div>
          <div class="card-title" style="font-size: 16px;">${t("multiUserMemory.groups.members")}</div>
          <div class="card-sub">${t("multiUserMemory.groups.membersHelp")}</div>
          <div style="display: grid; gap: 8px; margin-top: 10px;">
            ${
              users.length === 0
                ? html`<div class="callout">${t("multiUserMemory.groups.membersEmpty")}</div>`
                : users.map(
                    (user) => html`
                      <label class="field checkbox">
                        <span>${user.displayName ?? user.id}</span>
                        <input
                          type="checkbox"
                          .checked=${group.memberUserIds.includes(user.id)}
                          @change=${(event: Event) =>
                            props.onToggleGroupMember(
                              group.id,
                              user.id,
                              (event.target as HTMLInputElement).checked,
                            )}
                        />
                      </label>
                    `,
                  )
            }
          </div>
        </div>
        <div>
          <div class="card-title" style="font-size: 16px;">${t("multiUserMemory.groups.parents")}</div>
          <div class="card-sub">${t("multiUserMemory.groups.parentsHelp")}</div>
          <div style="display: grid; gap: 8px; margin-top: 10px;">
            ${
              availableParentGroups.length === 0
                ? html`<div class="callout">${t("multiUserMemory.groups.parentsEmpty")}</div>`
                : availableParentGroups.map(
                    (parentGroup) => html`
                      <label class="field checkbox">
                        <span>${parentGroup.label ?? parentGroup.id}</span>
                        <input
                          type="checkbox"
                          .checked=${group.parentGroupIds.includes(parentGroup.id)}
                          @change=${(event: Event) =>
                            props.onToggleGroupParent(
                              group.id,
                              parentGroup.id,
                              (event.target as HTMLInputElement).checked,
                            )}
                        />
                      </label>
                    `,
                  )
            }
          </div>
        </div>
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap;">
        <button
          class="btn btn--sm danger"
          type="button"
          @click=${() => {
            closeDialogById(dialogId);
            props.onDeleteGroup(group.id);
          }}
        >
          ${t("multiUserMemory.actions.deleteGroup")}
        </button>
      </div>
    </div>
  `;
}

function renderUsersTableSection(props: UsersViewProps) {
  return html`
    <section class="card">
      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
        <div>
          <div class="card-title">${t("multiUserMemory.users.title")}</div>
          <div class="card-sub">${t("multiUserMemory.users.subtitle")}</div>
        </div>
        <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
          <div class="muted">${t("multiUserMemory.users.adminHint")}</div>
          <button
            class="btn btn--sm primary"
            type="button"
            @click=${() => openDialogById(CREATE_USER_DIALOG_ID)}
          >
            ${t("multiUserMemory.actions.addUser")}
          </button>
        </div>
      </div>
      <div class="data-table-container" style="margin-top: 16px;">
        <table class="data-table">
          <thead>
            <tr>
              <th>${t("multiUserMemory.users.columns.user")}</th>
              <th>${t("multiUserMemory.users.columns.channel")}</th>
              <th>${t("multiUserMemory.users.columns.id")}</th>
              <th>${t("multiUserMemory.users.columns.language")}</th>
              <th>${t("multiUserMemory.users.columns.status")}</th>
              <th>${t("multiUserMemory.users.columns.actions")}</th>
            </tr>
          </thead>
          <tbody>
            ${
              props.config.users.length === 0
                ? renderEmptyTableRow(t("multiUserMemory.users.empty"), 6)
                : props.config.users.map((user) => {
                    const dialogId = buildUserDialogId(user.id);
                    const adminUser = props.config.adminUserIds.includes(user.id);
                    return html`
                      <tr>
                        <td>
                          <div style="display: grid; gap: 6px;">
                            <div style="font-weight: 600;">${user.displayName ?? user.id}</div>
                            <div class="muted mono" style="font-size: 12px;">${user.id}</div>
                            ${adminUser ? html`<span class="pill">${t("multiUserMemory.users.adminUsers")}</span>` : nothing}
                          </div>
                        </td>
                        <td>${renderPillList(userChannels(user))}</td>
                        <td>${renderPillList(userSenderIds(user))}</td>
                        <td>${languageLabel(user.preferredLanguage)}</td>
                        <td>${renderStatusPill(user.active)}</td>
                        <td>
                          <button
                            class="btn btn--sm"
                            type="button"
                            @click=${() => openDialogById(dialogId)}
                          >
                            ${t("common.edit")}
                          </button>
                        </td>
                      </tr>
                    `;
                  })
            }
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderGroupsTableSection(props: UsersViewProps) {
  return html`
    <section class="card">
      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
        <div>
          <div class="card-title">${t("multiUserMemory.groups.title")}</div>
          <div class="card-sub">${t("multiUserMemory.groups.subtitle")}</div>
        </div>
        <button
          class="btn btn--sm primary"
          type="button"
          @click=${() => openDialogById(CREATE_GROUP_DIALOG_ID)}
        >
          ${t("multiUserMemory.actions.addGroup")}
        </button>
      </div>
      <div class="data-table-container" style="margin-top: 16px;">
        <table class="data-table">
          <thead>
            <tr>
              <th>${t("multiUserMemory.groups.columns.group")}</th>
              <th>${t("multiUserMemory.groups.columns.users")}</th>
              <th>${t("multiUserMemory.groups.columns.parents")}</th>
              <th>${t("multiUserMemory.groups.columns.status")}</th>
              <th>${t("multiUserMemory.groups.columns.actions")}</th>
            </tr>
          </thead>
          <tbody>
            ${
              props.config.groups.length === 0
                ? renderEmptyTableRow(t("multiUserMemory.groups.empty"), 5)
                : props.config.groups.map((group) => {
                    const dialogId = buildGroupDialogId(group.id);
                    return html`
                      <tr>
                        <td>
                          <div style="display: grid; gap: 6px;">
                            <div style="font-weight: 600;">${group.label ?? group.id}</div>
                            <div class="muted mono" style="font-size: 12px;">${group.id}</div>
                          </div>
                        </td>
                        <td>${renderPillList(groupMemberLabels(group, props.config.users))}</td>
                        <td>${renderPillList(groupParentLabels(group, props.config.groups))}</td>
                        <td>${renderStatusPill(group.active)}</td>
                        <td>
                          <button
                            class="btn btn--sm"
                            type="button"
                            @click=${() => openDialogById(dialogId)}
                          >
                            ${t("common.edit")}
                          </button>
                        </td>
                      </tr>
                    `;
                  })
            }
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderActiveSection(props: UsersViewProps) {
  switch (props.activeTab) {
    case "users":
      return renderUsersTableSection(props);
    case "groups":
      return renderGroupsTableSection(props);
    case "settings":
      return renderPluginSettingsSection(props);
    case "overview":
    default:
      return renderOverviewSection(props);
  }
}

function renderDialogs(props: UsersViewProps, configMutationDisabled: boolean) {
  return html`
    ${renderDialog({
      id: CREATE_USER_DIALOG_ID,
      title: t("multiUserMemory.actions.addUser"),
      subtitle: t("multiUserMemory.users.createSubtitle"),
      body: renderCreateUserForm(props, configMutationDisabled),
    })}
    ${renderDialog({
      id: CREATE_GROUP_DIALOG_ID,
      title: t("multiUserMemory.actions.addGroup"),
      subtitle: t("multiUserMemory.groups.createSubtitle"),
      body: renderCreateGroupForm(props, configMutationDisabled),
    })}
    ${props.config.users.map((user) =>
      renderDialog({
        id: buildUserDialogId(user.id),
        title: t("multiUserMemory.users.editTitle"),
        subtitle: user.displayName ?? user.id,
        body: renderUserEditor(user, props, buildUserDialogId(user.id)),
      }),
    )}
    ${props.config.groups.map((group) =>
      renderDialog({
        id: buildGroupDialogId(group.id),
        title: t("multiUserMemory.groups.editTitle"),
        subtitle: group.label ?? group.id,
        body: renderGroupEditor(
          group,
          props.config.users,
          props.config.groups,
          props,
          buildGroupDialogId(group.id),
        ),
      }),
    )}
  `;
}

export function renderUsers(props: UsersViewProps) {
  const configMutationDisabled =
    !props.configReady || props.configLoading || props.configSaving || props.configApplying;

  return html`
    <div style="display: grid; gap: 18px;">
      ${renderSetupCard(props)}
      ${renderUsersViewTabs(props)}
      ${renderActiveSection(props)}
      ${renderDialogs(props, configMutationDisabled)}
    </div>
  `;
}
