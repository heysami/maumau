import { describe, expect, it } from "vitest";
import {
  buildVisibleScopeKeys,
  pickNarrowestGroup,
  resolveConfiguredUserMatch,
  resolveEffectiveGroupIds,
  resolveGroupsContainingUsers,
  resolveMultiUserMemoryConfig,
} from "./config.js";

describe("multi-user-memory config", () => {
  it("normalizes users, groups, and language defaults from plugin config", () => {
    const config = resolveMultiUserMemoryConfig({
      plugins: {
        entries: {
          "multi-user-memory": {
            config: {
              enabled: true,
              autoDiscover: true,
              defaultLanguage: "id",
              approvalCenterBaseUrl: " https://family-gateway.tail123.ts.net ",
              adminUserIds: [" me ", "dad", "dad"],
              users: {
                me: {
                  displayName: "Sam",
                  preferredLanguage: "en",
                  identities: [
                    { channelId: "whatsapp", senderId: "wa-me" },
                    { channelId: "", senderId: "ignored" },
                  ],
                },
                dad: {
                  displayName: "Ayah",
                  preferredLanguage: "id",
                  identities: [{ channelId: "telegram", accountId: "acct-1", senderId: "tg-dad" }],
                },
              },
              groups: {
                family: {
                  label: "Family",
                  memberUserIds: ["me", "dad"],
                },
                parents: {
                  label: "Parents",
                  parentGroupIds: ["family"],
                  memberUserIds: ["dad"],
                  active: false,
                },
              },
            },
          },
        },
      },
    } as never);

    expect(config.defaultLanguage).toBe("id");
    expect(config.approvalCenterBaseUrl).toBe("https://family-gateway.tail123.ts.net");
    expect(config.adminUserIds).toEqual(["me", "dad"]);
    expect(config.users.me.identities).toEqual([{ channelId: "whatsapp", senderId: "wa-me" }]);
    expect(config.groups.family.parentGroupIds).toEqual([]);
    expect(config.groups.parents.active).toBe(false);
  });

  it("resolves configured identities and nested/intersecting group scopes", () => {
    const config = resolveMultiUserMemoryConfig({
      plugins: {
        entries: {
          "multi-user-memory": {
            config: {
              users: {
                me: {
                  displayName: "Sam",
                  preferredLanguage: "en",
                  identities: [{ channelId: "whatsapp", senderId: "wa-me" }],
                },
                dad: {
                  displayName: "Ayah",
                  preferredLanguage: "id",
                  identities: [{ channelId: "telegram", accountId: "acct-1", senderId: "tg-dad" }],
                },
                mom: {
                  displayName: "Ibu",
                  preferredLanguage: "id",
                  identities: [{ channelId: "signal", senderId: "sg-mom" }],
                },
              },
              groups: {
                household: {
                  label: "Household",
                  memberUserIds: ["me", "dad", "mom"],
                },
                parents: {
                  label: "Parents",
                  parentGroupIds: ["household"],
                  memberUserIds: ["dad", "mom"],
                },
                planning: {
                  label: "Planning",
                  parentGroupIds: ["household"],
                  memberUserIds: ["me", "dad"],
                },
              },
            },
          },
        },
      },
    } as never);

    expect(
      resolveConfiguredUserMatch(config, {
        channelId: "telegram",
        accountId: "acct-1",
        senderId: "tg-dad",
      }),
    ).toMatchObject({
      userId: "dad",
      user: { displayName: "Ayah", preferredLanguage: "id" },
    });
    expect(resolveEffectiveGroupIds(config, "dad").sort()).toEqual([
      "household",
      "parents",
      "planning",
    ]);
    expect(resolveGroupsContainingUsers(config, ["dad", "mom"]).sort()).toEqual([
      "household",
      "parents",
    ]);
    expect(pickNarrowestGroup(config, ["household", "parents"])).toBe("parents");
    expect(
      buildVisibleScopeKeys({ config, userId: "dad", provisionalIds: ["prov-1"] }).sort(),
    ).toEqual([
      "global",
      "group:household",
      "group:parents",
      "group:planning",
      "private:dad",
      "provisional:prov-1",
    ]);
  });
});
