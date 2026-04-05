/* @vitest-environment jsdom */

import { render } from "lit";
import { describe, expect, it } from "vitest";
import { i18n } from "../../i18n/index.ts";
import { renderUsers } from "./users.ts";

function createUsersProps() {
  return {
    configLoading: false,
    configReady: true,
    configSaving: false,
    configApplying: false,
    configDirty: false,
    runtimeLoading: false,
    runtimeError: null,
    config: {
      slotSelected: true,
      entryConfigured: true,
      enabled: true,
      autoDiscover: true,
      defaultLanguage: "en",
      approvalCenterBaseUrl: undefined,
      approvalDelivery: {
        mode: "same_session" as const,
      },
      curatorAgentId: undefined,
      adminUserIds: [],
      users: [
        {
          id: "sam",
          displayName: "Sam",
          preferredLanguage: "en",
          identities: [],
          active: true,
          notes: undefined,
        },
      ],
      groups: [],
    },
    runtime: {
      plugin: {
        slotSelected: true,
        entryConfigured: true,
        enabled: true,
        autoDiscover: true,
        defaultLanguage: "en",
      },
      provisionalUsers: [
        {
          provisionalUserId: "prov-1",
          channelId: "telegram",
          accountId: "default",
          senderId: "123",
          senderName: "Sam",
          senderUsername: "sam",
          firstSeenAt: Date.now(),
          lastSeenAt: Date.now(),
          messageCount: 2,
        },
      ],
      proposals: [],
    },
    secureDashboardUrl: "https://tailnet.example/dashboard/today#token=abc123",
    newUserDisplayName: "",
    newUserLanguage: "en",
    newUserIdentities: [],
    newGroupLabel: "",
    onReload: () => undefined,
    onSave: () => undefined,
    onApply: () => undefined,
    onEnablePlugin: () => undefined,
    onTopLevelBooleanChange: () => undefined,
    onTopLevelStringChange: () => undefined,
    onApprovalDeliveryChange: () => undefined,
    onToggleAdminUser: () => undefined,
    onNewUserDraftChange: () => undefined,
    onAddDraftIdentity: () => undefined,
    onDraftIdentityFieldChange: () => undefined,
    onDeleteDraftIdentity: () => undefined,
    onCreateUser: () => undefined,
    onClearUserDraft: () => undefined,
    onNewGroupDraftChange: () => undefined,
    onCreateGroup: () => undefined,
    onClearGroupDraft: () => undefined,
    onUserFieldChange: () => undefined,
    onUserActiveChange: () => undefined,
    onDeleteUser: () => undefined,
    onAddIdentity: () => undefined,
    onIdentityFieldChange: () => undefined,
    onDeleteIdentity: () => undefined,
    onGroupFieldChange: () => undefined,
    onGroupActiveChange: () => undefined,
    onDeleteGroup: () => undefined,
    onToggleGroupMember: () => undefined,
    onToggleGroupParent: () => undefined,
    onCreateUserFromProvisional: () => undefined,
    onUseProvisionalAsDraft: () => undefined,
  };
}

describe("renderUsers", () => {
  it("shows the secure dashboard phone link whenever detected senders are present", () => {
    i18n.setLocale("en");
    const container = document.createElement("div");
    render(renderUsers(createUsersProps()), container);

    expect(container.textContent).toContain("Detected senders are ready to review here.");
    const link = container.querySelector('a[href="https://tailnet.example/dashboard/today#token=abc123"]');
    expect(link).not.toBeNull();
  });
});
