import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addMultiUserMemoryDraftIdentity,
  addMultiUserMemoryGroup,
  addMultiUserMemoryIdentity,
  addMultiUserMemoryUser,
  createMultiUserMemoryGroupFromDraft,
  createMultiUserMemoryUserFromDraft,
  loadMultiUserMemoryAdmin,
  removeMultiUserMemoryGroup,
  removeMultiUserMemoryUser,
  resolveMultiUserMemoryConfigState,
  toggleMultiUserMemoryAdminUser,
  toggleMultiUserMemoryGroupMember,
  toggleMultiUserMemoryGroupParent,
  updateMultiUserMemoryDraftIdentity,
  updateMultiUserMemoryIdentity,
  updateMultiUserMemoryTopLevel,
  updateMultiUserMemoryUser,
} from "./multi-user-memory.ts";

function createHost(): Parameters<typeof loadMultiUserMemoryAdmin>[0] {
  return {
    basePath: "",
    connected: true,
    configForm: {
      plugins: {
        entries: {
          "multi-user-memory": {
            config: {},
          },
        },
      },
    } as Record<string, unknown>,
    configSnapshot: { config: {} },
    configFormMode: "form" as const,
    configRaw: "{}\n",
    configFormDirty: false,
    settings: { token: "" },
    password: "",
    hello: null,
    multiUserMemoryLoading: false,
    multiUserMemoryError: null,
    multiUserMemoryAdmin: null,
    multiUserMemoryNewUserId: "",
    multiUserMemoryNewUserDisplayName: "",
    multiUserMemoryNewUserLanguage: "en" as const,
    multiUserMemoryNewUserIdentities: [],
    multiUserMemoryNewGroupId: "",
    multiUserMemoryNewGroupLabel: "",
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("multi-user-memory controller helpers", () => {
  it("normalizes config state for the dedicated users page", () => {
    const config = resolveMultiUserMemoryConfigState({
      plugins: {
        slots: { memory: "multi-user-memory" },
        entries: {
          "multi-user-memory": {
            config: {
              enabled: true,
              defaultLanguage: "id",
              users: {
                dad: {
                  displayName: "Dad",
                  preferredLanguage: "id",
                  identities: [{ channelId: "whatsapp", senderId: "dad-wa" }],
                },
              },
              groups: {
                family: {
                  label: "Family",
                  memberUserIds: ["dad"],
                },
              },
            },
          },
        },
      },
    });

    expect(config.slotSelected).toBe(true);
    expect(config.users).toEqual([
      expect.objectContaining({
        id: "dad",
        preferredLanguage: "id",
      }),
    ]);
    expect(config.groups).toEqual([
      expect.objectContaining({
        id: "family",
        memberUserIds: ["dad"],
      }),
    ]);
  });

  it("keeps group memberships and admin ids in sync when users are removed", () => {
    const host = createHost();
    addMultiUserMemoryUser(host, {
      userId: "sam",
      displayName: "Sam",
      preferredLanguage: "en",
    });
    addMultiUserMemoryGroup(host, { groupId: "family", label: "Family" });
    toggleMultiUserMemoryAdminUser(host, "sam", true);
    toggleMultiUserMemoryGroupMember(host, "family", "sam", true);

    removeMultiUserMemoryUser(host, "sam");
    const config = resolveMultiUserMemoryConfigState(host.configForm);

    expect(config.users).toEqual([]);
    expect(config.adminUserIds).toEqual([]);
    expect(config.groups[0]?.memberUserIds).toEqual([]);
  });

  it("updates identity rows and parent groups through the dedicated editor helpers", () => {
    const host = createHost();
    addMultiUserMemoryUser(host, {
      userId: "dad",
      displayName: "Dad",
      preferredLanguage: "id",
    });
    addMultiUserMemoryIdentity(host, "dad");
    updateMultiUserMemoryIdentity(host, "dad", 0, {
      channelId: "telegram",
      senderId: "dad-tg",
      senderUsername: "ayah",
    });
    addMultiUserMemoryGroup(host, { groupId: "family", label: "Family" });
    addMultiUserMemoryGroup(host, { groupId: "parents", label: "Parents" });
    toggleMultiUserMemoryGroupParent(host, "parents", "family", true);
    updateMultiUserMemoryUser(host, "dad", { notes: "Prefers Indonesian." });
    updateMultiUserMemoryTopLevel(host, { defaultLanguage: "id" });
    removeMultiUserMemoryGroup(host, "family");

    const config = resolveMultiUserMemoryConfigState(host.configForm);
    expect(config.defaultLanguage).toBe("id");
    expect(config.users[0]).toMatchObject({
      id: "dad",
      notes: "Prefers Indonesian.",
      identities: [
        {
          channelId: "telegram",
          senderId: "dad-tg",
          senderUsername: "ayah",
        },
      ],
    });
    expect(config.groups).toEqual([
      expect.objectContaining({
        id: "parents",
        parentGroupIds: [],
      }),
    ]);
  });

  it("creates users and groups from drafts with generated ids and manual identities", () => {
    const host = createHost();
    const initialConfig = resolveMultiUserMemoryConfigState(host.configForm);

    host.multiUserMemoryNewUserDisplayName = "Dad";
    host.multiUserMemoryNewUserLanguage = "id";
    addMultiUserMemoryDraftIdentity(host, {
      channelId: "telegram",
      senderId: "dad-tg",
    });
    updateMultiUserMemoryDraftIdentity(host, 0, {
      senderUsername: "ayah",
    });
    createMultiUserMemoryUserFromDraft(host, initialConfig);

    host.multiUserMemoryNewGroupLabel = "Family";
    const configWithUser = resolveMultiUserMemoryConfigState(host.configForm);
    createMultiUserMemoryGroupFromDraft(host, configWithUser);

    const config = resolveMultiUserMemoryConfigState(host.configForm);
    expect(config.users).toEqual([
      expect.objectContaining({
        id: "dad",
        displayName: "Dad",
        preferredLanguage: "id",
        identities: [
          {
            channelId: "telegram",
            senderId: "dad-tg",
            senderUsername: "ayah",
          },
        ],
      }),
    ]);
    expect(config.adminUserIds).toEqual(["dad"]);
    expect(config.groups).toEqual([
      expect.objectContaining({
        id: "family",
        label: "Family",
      }),
    ]);
  });

  it("bootstraps the first user from a single detected sender", async () => {
    const host = createHost();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        plugin: {
          slotSelected: true,
          entryConfigured: true,
          enabled: true,
          autoDiscover: true,
          defaultLanguage: "en",
        },
        provisionalUsers: [
          {
            provisionalUserId: "telegram|default|dad-tg",
            channelId: "telegram",
            senderId: "dad-tg",
            senderName: "Dad",
            senderUsername: "ayah",
            firstSeenAt: 1,
            lastSeenAt: 2,
            messageCount: 1,
          },
        ],
        proposals: [],
      }),
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await loadMultiUserMemoryAdmin(host);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/plugins/multi-user-memory/admin",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      }),
    );

    const config = resolveMultiUserMemoryConfigState(host.configForm);
    expect(config.users).toEqual([
      expect.objectContaining({
        id: "dad",
        displayName: "Dad",
        identities: [
          expect.objectContaining({
            channelId: "telegram",
            senderId: "dad-tg",
            senderName: "Dad",
            senderUsername: "ayah",
          }),
        ],
      }),
    ]);
    expect(config.adminUserIds).toEqual(["dad"]);
    expect(host.multiUserMemoryNewUserDisplayName).toBe("");
    expect(host.multiUserMemoryNewUserIdentities).toEqual([]);
  });

  it("waits for the config snapshot before auto-bootstrapping the first user", async () => {
    const host = createHost();
    host.configForm = null;
    host.configSnapshot = null;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        plugin: {
          slotSelected: true,
          entryConfigured: true,
          enabled: true,
          autoDiscover: true,
          defaultLanguage: "en",
        },
        provisionalUsers: [
          {
            provisionalUserId: "telegram|default|dad-tg",
            channelId: "telegram",
            senderId: "dad-tg",
            senderName: "Dad",
            senderUsername: "ayah",
            firstSeenAt: 1,
            lastSeenAt: 2,
            messageCount: 1,
          },
        ],
        proposals: [],
      }),
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await loadMultiUserMemoryAdmin(host);

    expect(host.multiUserMemoryAdmin?.provisionalUsers).toHaveLength(1);
    expect(host.configForm).toBeNull();
  });

  it("renders object-shaped api errors as readable messages", async () => {
    const host = createHost();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        ok: false,
        error: {
          message: "Unauthorized",
          type: "unauthorized",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await loadMultiUserMemoryAdmin(host);

    expect(host.multiUserMemoryAdmin).toBeNull();
    expect(host.multiUserMemoryError).toBe("Unauthorized");
  });
});
