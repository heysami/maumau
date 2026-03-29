import { html, nothing } from "lit";
import { t } from "../../i18n/index.ts";
import type {
  MultiUserMemoryAdminSnapshot,
  MultiUserMemoryConfigState,
  MultiUserMemoryGroup,
  MultiUserMemoryIdentity,
  MultiUserMemoryUser,
} from "../controllers/multi-user-memory.ts";
import { MULTI_USER_MEMORY_LANGUAGE_OPTIONS } from "../controllers/multi-user-memory.ts";

type UsersViewProps = {
  configLoading: boolean;
  configReady: boolean;
  configSaving: boolean;
  configApplying: boolean;
  configDirty: boolean;
  runtimeLoading: boolean;
  runtimeError: string | null;
  config: MultiUserMemoryConfigState;
  runtime: MultiUserMemoryAdminSnapshot | null;
  newUserDisplayName: string;
  newUserLanguage: string;
  newUserIdentities: MultiUserMemoryIdentity[];
  newGroupLabel: string;
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
        <button class="btn btn--sm danger" @click=${() => props.onDeleteIdentity(userId, index)}>
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
        <button class="btn btn--sm danger" @click=${() => props.onDeleteDraftIdentity(index)}>
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

function renderDetectedSendersSection(props: UsersViewProps) {
  const provisionalUsers = props.runtime?.provisionalUsers ?? [];
  const firstDetectedBootstrap =
    props.config.users.length === 0 && provisionalUsers.length > 0 && !props.runtimeLoading;
  const configMutationDisabled =
    !props.configReady || props.configLoading || props.configSaving || props.configApplying;

  return html`
    <section class="card">
      <div class="card-title">${t("multiUserMemory.runtime.provisionalTitle")}</div>
      <div class="card-sub">${t("multiUserMemory.runtime.provisionalSubtitle")}</div>
      ${
        firstDetectedBootstrap
          ? html`
              <div class="callout info" style="margin-top: 12px;">
                ${t("multiUserMemory.runtime.bootstrapHint")}
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
                                        ?disabled=${configMutationDisabled}
                                        @click=${() => props.onCreateUserFromProvisional(provisional)}
                                      >
                                        ${t("multiUserMemory.actions.createUser")}
                                      </button>
                                      <button class="btn btn--sm" @click=${() => props.onUseProvisionalAsDraft(provisional)}>
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

function renderUserCard(user: MultiUserMemoryUser, props: UsersViewProps) {
  return html`
    <section class="card">
      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;">
        <div>
          <div class="card-title">${user.displayName ?? user.id}</div>
          <div class="card-sub">${t("multiUserMemory.users.userId")}: <code>${user.id}</code></div>
        </div>
        <button class="btn btn--sm danger" @click=${() => props.onDeleteUser(user.id)}>
          ${t("multiUserMemory.actions.deleteUser")}
        </button>
      </div>
      <div class="form-grid" style="display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin-top: 14px;">
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
      </div>
      <label class="field" style="margin-top: 12px;">
        <span>${t("multiUserMemory.users.notes")}</span>
        <textarea
          rows="3"
          .value=${user.notes ?? ""}
          @input=${(event: Event) =>
            props.onUserFieldChange(user.id, "notes", (event.target as HTMLTextAreaElement).value)}
        ></textarea>
      </label>
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 18px;">
        <div>
          <div class="card-title" style="font-size: 16px;">${t("multiUserMemory.users.identities")}</div>
          <div class="card-sub">${t("multiUserMemory.users.identitiesHelp")}</div>
        </div>
        <button class="btn btn--sm" @click=${() => props.onAddIdentity(user.id)}>
          ${t("multiUserMemory.actions.addIdentity")}
        </button>
      </div>
      <div style="display: grid; gap: 12px; margin-top: 12px;">
        ${
          user.identities.length === 0
            ? html`<div class="callout">${t("multiUserMemory.users.identitiesEmpty")}</div>`
            : user.identities.map((identity, index) =>
                renderIdentityEditor(user.id, identity, index, props),
              )
        }
      </div>
    </section>
  `;
}

function renderGroupCard(
  group: MultiUserMemoryGroup,
  users: MultiUserMemoryUser[],
  groups: MultiUserMemoryGroup[],
  props: UsersViewProps,
) {
  return html`
    <section class="card">
      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;">
        <div>
          <div class="card-title">${group.label ?? group.id}</div>
          <div class="card-sub">${t("multiUserMemory.groups.groupId")}: <code>${group.id}</code></div>
        </div>
        <button class="btn btn--sm danger" @click=${() => props.onDeleteGroup(group.id)}>
          ${t("multiUserMemory.actions.deleteGroup")}
        </button>
      </div>
      <div class="form-grid" style="display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin-top: 14px;">
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
      <label class="field" style="margin-top: 12px;">
        <span>${t("multiUserMemory.groups.description")}</span>
        <textarea
          rows="3"
          .value=${group.description ?? ""}
          @input=${(event: Event) =>
            props.onGroupFieldChange(
              group.id,
              "description",
              (event.target as HTMLTextAreaElement).value,
            )}
        ></textarea>
      </label>
      <div style="display: grid; gap: 16px; margin-top: 18px;">
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
              groups.filter((entry) => entry.id !== group.id).length === 0
                ? html`<div class="callout">${t("multiUserMemory.groups.parentsEmpty")}</div>`
                : groups
                    .filter((entry) => entry.id !== group.id)
                    .map(
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
    </section>
  `;
}

export function renderUsers(props: UsersViewProps) {
  const provisionalUsers = props.runtime?.provisionalUsers ?? [];
  const proposals = props.runtime?.proposals ?? [];
  const configMutationDisabled =
    !props.configReady || props.configLoading || props.configSaving || props.configApplying;

  return html`
    <div style="display: grid; gap: 18px;">
      <section class="card">
        <div style="display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
          <div>
            <div class="card-title">${t("multiUserMemory.setup.title")}</div>
            <div class="card-sub">${t("multiUserMemory.setup.subtitle")}</div>
          </div>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <button class="btn btn--sm" ?disabled=${props.configLoading || props.runtimeLoading} @click=${props.onReload}>
              ${t("common.refresh")}
            </button>
            ${
              props.config.slotSelected
                ? nothing
                : html`
                    <button
                      class="btn btn--sm"
                      ?disabled=${!props.configReady || props.configLoading || props.configSaving || props.configApplying}
                      @click=${props.onEnablePlugin}
                    >
                      ${t("multiUserMemory.actions.enable")}
                    </button>
                  `
            }
            <button
              class="btn btn--sm"
              ?disabled=${!props.configReady || props.configLoading || !props.configDirty || props.configSaving}
              @click=${props.onSave}
            >
              ${t("multiUserMemory.actions.save")}
            </button>
            <button
              class="btn btn--sm primary"
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

      <div style="display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
        ${renderStat(t("multiUserMemory.stats.users"), String(props.config.users.length))}
        ${renderStat(t("multiUserMemory.stats.groups"), String(props.config.groups.length))}
        ${renderStat(t("multiUserMemory.stats.provisional"), String(provisionalUsers.length))}
        ${renderStat(t("multiUserMemory.stats.proposals"), String(proposals.length))}
      </div>

      ${renderDetectedSendersSection(props)}

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
                props.onTopLevelBooleanChange(
                  "enabled",
                  (event.target as HTMLInputElement).checked,
                )}
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

      <section class="card">
        <div class="card-title">${t("multiUserMemory.users.createTitle")}</div>
        <div class="card-sub">${t("multiUserMemory.users.createSubtitle")}</div>
        <div class="form-grid" style="display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin-top: 14px;">
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
        <div class="card-sub" style="margin-top: 12px;">
          ${t("multiUserMemory.users.autoIdHint")}
        </div>
        ${
          props.newUserIdentities.length > 0
            ? html`
                <div class="callout info" style="margin-top: 12px;">
                  ${t("multiUserMemory.users.seedIdentity", {
                    channel: props.newUserIdentities[0]?.channelId ?? "",
                    senderId: props.newUserIdentities[0]?.senderId ?? "",
                  })}
                </div>
              `
            : nothing
        }
        <div
          style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 18px;"
        >
          <div>
            <div class="card-title" style="font-size: 16px;">
              ${t("multiUserMemory.users.identities")}
            </div>
            <div class="card-sub">${t("multiUserMemory.users.identitiesHelp")}</div>
          </div>
          <button class="btn btn--sm" @click=${props.onAddDraftIdentity}>
            ${t("multiUserMemory.actions.addIdentity")}
          </button>
        </div>
        <div style="display: grid; gap: 12px; margin-top: 12px;">
          ${
            props.newUserIdentities.length === 0
              ? html`<div class="callout">${t("multiUserMemory.users.identitiesDraftEmpty")}</div>`
              : props.newUserIdentities.map((identity, index) =>
                  renderDraftIdentityEditor(identity, index, props),
                )
          }
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px;">
          <button class="btn btn--sm" @click=${props.onClearUserDraft}>
            ${t("multiUserMemory.actions.clearDraft")}
          </button>
          <button class="btn btn--sm primary" ?disabled=${configMutationDisabled} @click=${props.onCreateUser}>
            ${t("multiUserMemory.actions.createUser")}
          </button>
        </div>
      </section>

      <section class="card">
        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;">
          <div>
            <div class="card-title">${t("multiUserMemory.users.title")}</div>
            <div class="card-sub">${t("multiUserMemory.users.subtitle")}</div>
          </div>
          <div class="muted">${t("multiUserMemory.users.adminHint")}</div>
        </div>
        ${
          props.config.users.length === 0
            ? html`<div class="callout" style="margin-top: 12px;">${t("multiUserMemory.users.empty")}</div>`
            : nothing
        }
        <div style="display: grid; gap: 18px; margin-top: 16px;">
          ${props.config.users.map((user) => renderUserCard(user, props))}
        </div>
        ${
          props.config.users.length > 0
            ? html`
                <div style="margin-top: 18px;">
                  <div class="card-title" style="font-size: 16px;">${t("multiUserMemory.users.adminUsers")}</div>
                  <div class="card-sub">${t("multiUserMemory.users.adminUsersHelp")}</div>
                  <div style="display: grid; gap: 8px; margin-top: 10px;">
                    ${props.config.users.map(
                      (user) => html`
                        <label class="field checkbox">
                          <span>${user.displayName ?? user.id}</span>
                          <input
                            type="checkbox"
                            .checked=${props.config.adminUserIds.includes(user.id)}
                            @change=${(event: Event) =>
                              props.onToggleAdminUser(
                                user.id,
                                (event.target as HTMLInputElement).checked,
                              )}
                          />
                        </label>
                      `,
                    )}
                  </div>
                </div>
              `
            : nothing
        }
      </section>

      <section class="card">
        <div class="card-title">${t("multiUserMemory.groups.createTitle")}</div>
        <div class="card-sub">${t("multiUserMemory.groups.createSubtitle")}</div>
        <div class="form-grid" style="display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin-top: 14px;">
          <label class="field">
            <span>${t("multiUserMemory.groups.label")}</span>
            <input
              .value=${props.newGroupLabel}
              @input=${(event: Event) =>
                props.onNewGroupDraftChange("label", (event.target as HTMLInputElement).value)}
            />
          </label>
        </div>
        <div class="card-sub" style="margin-top: 12px;">
          ${t("multiUserMemory.groups.autoIdHint")}
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px;">
          <button class="btn btn--sm" @click=${props.onClearGroupDraft}>
            ${t("multiUserMemory.actions.clearDraft")}
          </button>
          <button class="btn btn--sm primary" ?disabled=${configMutationDisabled} @click=${props.onCreateGroup}>
            ${t("multiUserMemory.actions.createGroup")}
          </button>
        </div>
      </section>

      <section class="card">
        <div class="card-title">${t("multiUserMemory.groups.title")}</div>
        <div class="card-sub">${t("multiUserMemory.groups.subtitle")}</div>
        ${
          props.config.groups.length === 0
            ? html`<div class="callout" style="margin-top: 12px;">${t("multiUserMemory.groups.empty")}</div>`
            : nothing
        }
        <div style="display: grid; gap: 18px; margin-top: 16px;">
          ${props.config.groups.map((group) =>
            renderGroupCard(group, props.config.users, props.config.groups, props),
          )}
        </div>
      </section>

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
    </div>
  `;
}
