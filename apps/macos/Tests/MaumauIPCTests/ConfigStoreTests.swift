import Foundation
import MaumauKit
import Testing
@testable import Maumau

@Suite(.serialized)
@MainActor
struct ConfigStoreTests {
    @Test func `load uses remote in remote mode`() async {
        var localHit = false
        var remoteHit = false
        await ConfigStore._testSetOverrides(.init(
            isRemoteMode: { true },
            loadLocal: { localHit = true; return ["local": true] },
            loadRemote: { remoteHit = true; return ["remote": true] }))

        let result = await ConfigStore.load()

        await ConfigStore._testClearOverrides()
        #expect(remoteHit)
        #expect(!localHit)
        #expect(result["remote"] as? Bool == true)
    }

    @Test func `load uses local in local mode`() async {
        var localHit = false
        var remoteHit = false
        await ConfigStore._testSetOverrides(.init(
            isRemoteMode: { false },
            loadLocal: { localHit = true; return ["local": true] },
            loadRemote: { remoteHit = true; return ["remote": true] }))

        let result = await ConfigStore.load()

        await ConfigStore._testClearOverrides()
        #expect(localHit)
        #expect(!remoteHit)
        #expect(result["local"] as? Bool == true)
    }

    @Test func `save routes to remote in remote mode`() async throws {
        var localHit = false
        var remoteHit = false
        await ConfigStore._testSetOverrides(.init(
            isRemoteMode: { true },
            saveLocal: { _ in localHit = true },
            saveRemote: { _ in remoteHit = true }))

        try await ConfigStore.save(["remote": true])

        await ConfigStore._testClearOverrides()
        #expect(remoteHit)
        #expect(!localHit)
    }

    @Test func `save routes to local in local mode`() async throws {
        var localHit = false
        var remoteHit = false
        await ConfigStore._testSetOverrides(.init(
            isRemoteMode: { false },
            saveLocal: { _ in localHit = true },
            saveRemote: { _ in remoteHit = true }))

        try await ConfigStore.save(["local": true])

        await ConfigStore._testClearOverrides()
        #expect(localHit)
        #expect(!remoteHit)
    }

    @Test func `save retries after config changed since last load`() async throws {
        var gatewayLoadCount = 0
        var gatewaySaveCount = 0
        var localSaveCount = 0

        await ConfigStore._testSetOverrides(.init(
            isRemoteMode: { false },
            loadGateway: {
                gatewayLoadCount += 1
                return ["fresh": true]
            },
            saveGateway: { _ in
                gatewaySaveCount += 1
                if gatewaySaveCount == 1 {
                    throw GatewayResponseError(
                        method: "config.set",
                        code: "INVALID_REQUEST",
                        message: "config changed since last load; re-run config.get and retry",
                        details: nil)
                }
            },
            saveConfigFile: { _ in localSaveCount += 1 }))

        try await ConfigStore.save(["channels": ["telegram": ["enabled": true]]])

        await ConfigStore._testClearOverrides()
        #expect(gatewaySaveCount == 2)
        #expect(gatewayLoadCount == 1)
        #expect(localSaveCount == 0)
    }

    @Test func `local fallback restores redacted values before saving`() async throws {
        var savedRoot: [String: Any]?
        let existingRoot: [String: Any] = [
            "gateway": [
                "auth": [
                    "token": "real-gateway-token",
                ],
            ],
            "channels": [
                "telegram": [
                    "botToken": "real-telegram-token",
                    "enabled": false,
                ],
            ],
        ]
        let draft: [String: Any] = [
            "gateway": [
                "auth": [
                    "token": "__MAUMAU_REDACTED__",
                ],
            ],
            "channels": [
                "telegram": [
                    "botToken": "__MAUMAU_REDACTED__",
                    "enabled": true,
                ],
            ],
        ]

        await ConfigStore._testSetOverrides(.init(
            isRemoteMode: { false },
            saveGateway: { _ in throw URLError(.cannotConnectToHost) },
            loadConfigFile: { existingRoot },
            saveConfigFile: { savedRoot = $0 }))

        try await ConfigStore.save(draft)

        await ConfigStore._testClearOverrides()
        let savedGateway = try #require(savedRoot?["gateway"] as? [String: Any])
        let savedAuth = try #require(savedGateway["auth"] as? [String: Any])
        #expect(savedAuth["token"] as? String == "real-gateway-token")
        let savedChannels = try #require(savedRoot?["channels"] as? [String: Any])
        let savedTelegram = try #require(savedChannels["telegram"] as? [String: Any])
        #expect(savedTelegram["botToken"] as? String == "real-telegram-token")
        #expect(savedTelegram["enabled"] as? Bool == true)
    }

    @Test func `gateway response errors do not trigger local fallback`() async {
        var localSaveCount = 0
        await ConfigStore._testSetOverrides(.init(
            isRemoteMode: { false },
            saveGateway: { _ in
                throw GatewayResponseError(
                    method: "config.set",
                    code: "INVALID_REQUEST",
                    message: "invalid config",
                    details: nil)
            },
            saveConfigFile: { _ in localSaveCount += 1 }))

        do {
            try await ConfigStore.save([
                "gateway": [
                    "auth": [
                        "token": "__MAUMAU_REDACTED__",
                    ],
                ],
            ])
            Issue.record("expected GatewayResponseError")
        } catch is GatewayResponseError {
            #expect(localSaveCount == 0)
        } catch {
            Issue.record("unexpected error: \(error)")
        }

        await ConfigStore._testClearOverrides()
    }
}
