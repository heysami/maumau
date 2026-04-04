import Foundation
import Testing
@testable import Maumau

@Suite(.serialized)
@MainActor
struct ChannelsStoreConfigTests {
    @Test func `deferred onboarding quick setup stages config without persisting`() async {
        let store = ChannelsStore(deferConfigSaves: true)
        store.replaceConfigDraft([:], dirty: false)

        let saved = await store.saveQuickSetupUpdates(
            channelId: "telegram",
            [
                (path: [.key("channels"), .key("telegram"), .key("enabled")], value: true),
                (path: [.key("channels"), .key("telegram"), .key("botToken")], value: "secret-token"),
            ],
            successMessage: "Telegram bot saved.")

        #expect(saved)
        #expect(store.configDirty)
        #expect(store.configValue(at: [.key("channels"), .key("telegram"), .key("enabled")]) as? Bool == true)
        #expect(store.configValue(at: [.key("channels"), .key("telegram"), .key("botToken")]) as? String == "secret-token")
        #expect(store.configStatus?.contains("Telegram bot saved.") == true)
        #expect(store.configStatus?.contains("Changes apply when you finish setup.") == true)
    }

    @Test func `apply deferred onboarding config persists staged config once`() async throws {
        var savedRoot: [String: Any]?
        await ConfigStore._testSetOverrides(.init(
            isRemoteMode: { false },
            saveLocal: { savedRoot = $0 }))

        let store = ChannelsStore(deferConfigSaves: true)
        store.replaceConfigDraft([
            "channels": [
                "telegram": [
                    "enabled": true,
                    "botToken": "secret-token",
                ],
            ],
        ], dirty: true)

        let saved = await store.applyDeferredConfigChanges()

        #expect(saved)
        let channels = try #require(savedRoot?["channels"] as? [String: Any])
        let telegram = try #require(channels["telegram"] as? [String: Any])
        #expect(telegram["enabled"] as? Bool == true)
        #expect(telegram["botToken"] as? String == "secret-token")
        #expect(store.configDirty == false)

        await ConfigStore._testClearOverrides()
    }
}
