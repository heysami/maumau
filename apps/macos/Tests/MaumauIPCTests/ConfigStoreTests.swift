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
        await ConfigStore._withTestOverrides(.init(
            isRemoteMode: { true },
            loadLocal: { localHit = true; return ["local": true] },
            loadRemote: { remoteHit = true; return ["remote": true] }))
        {
            let result = await ConfigStore.load()

            #expect(remoteHit)
            #expect(!localHit)
            #expect(result["remote"] as? Bool == true)
        }
    }

    @Test func `load uses local in local mode`() async {
        var localHit = false
        var remoteHit = false
        await ConfigStore._withTestOverrides(.init(
            isRemoteMode: { false },
            loadLocal: { localHit = true; return ["local": true] },
            loadRemote: { remoteHit = true; return ["remote": true] }))
        {
            let result = await ConfigStore.load()

            #expect(localHit)
            #expect(!remoteHit)
            #expect(result["local"] as? Bool == true)
        }
    }

    @Test func `save routes to remote in remote mode`() async throws {
        var localHit = false
        var remoteHit = false
        try await ConfigStore._withTestOverrides(.init(
            isRemoteMode: { true },
            saveLocal: { _ in localHit = true },
            saveRemote: { _ in remoteHit = true }))
        {
            try await ConfigStore.save(["remote": true])

            #expect(remoteHit)
            #expect(!localHit)
        }
    }

    @Test func `save routes to local in local mode`() async throws {
        var localHit = false
        var remoteHit = false
        try await ConfigStore._withTestOverrides(.init(
            isRemoteMode: { false },
            saveLocal: { _ in localHit = true },
            saveRemote: { _ in remoteHit = true }))
        {
            try await ConfigStore.save(["local": true])

            #expect(localHit)
            #expect(!remoteHit)
        }
    }

    @Test func `save retries after config changed since last load`() async throws {
        var gatewayLoadCount = 0
        var gatewaySaveCount = 0
        var localSaveCount = 0

        try await ConfigStore._withTestOverrides(.init(
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
                return ConfigStore.GatewaySaveResult(hash: "next-hash", reload: nil)
            },
            saveConfigFile: { _ in localSaveCount += 1 }))
        {
            try await ConfigStore.save(["channels": ["telegram": ["enabled": true]]])

            #expect(gatewaySaveCount == 2)
            #expect((1...2).contains(gatewayLoadCount))
            #expect(localSaveCount == 0)
        }
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

        try await ConfigStore._withTestOverrides(.init(
            isRemoteMode: { false },
            saveGateway: { _ in throw URLError(.cannotConnectToHost) },
            loadConfigFile: { existingRoot },
            saveConfigFile: { savedRoot = $0 }))
        {
            try await ConfigStore.save(draft)

            let savedGateway = try #require(savedRoot?["gateway"] as? [String: Any])
            let savedAuth = try #require(savedGateway["auth"] as? [String: Any])
            #expect(savedAuth["token"] as? String == "real-gateway-token")
            let savedChannels = try #require(savedRoot?["channels"] as? [String: Any])
            let savedTelegram = try #require(savedChannels["telegram"] as? [String: Any])
            #expect(savedTelegram["botToken"] as? String == "real-telegram-token")
            #expect(savedTelegram["enabled"] as? Bool == true)
        }
    }

    @Test func `gateway response errors do not trigger local fallback`() async {
        var localSaveCount = 0
        await ConfigStore._withTestOverrides(.init(
            isRemoteMode: { false },
            saveGateway: { _ in
                throw GatewayResponseError(
                    method: "config.set",
                    code: "INVALID_REQUEST",
                    message: "invalid config",
                    details: nil)
            },
            saveConfigFile: { _ in localSaveCount += 1 }))
        {
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
        }
    }

    @Test func `local save waits for restart completion when gateway reports restart expected`() async throws {
        var waitedForReload: ConfigStore.GatewaySaveReload?
        try await ConfigStore._withTestOverrides(.init(
            isRemoteMode: { false },
            saveGateway: { _ in
                ConfigStore.GatewaySaveResult(
                    hash: "post-save-hash",
                    reload: .init(restartExpected: true, debounceMs: 25, deferralTimeoutMs: 250))
            },
            waitForLocalGatewayRestart: { reload in
                waitedForReload = reload
            }))
        {
            try await ConfigStore.save(["gateway": ["bind": "loopback"]])

            #expect(waitedForReload == .init(restartExpected: true, debounceMs: 25, deferralTimeoutMs: 250))
        }
    }

    @Test func `restart detection treats listener pid change as restart start`() async {
        let pushes = AsyncStream<GatewayPush> { continuation in
            continuation.finish()
        }
        let observed = await ConfigStore._testAwaitGatewayRestartBegan(
            pushes: pushes,
            timeoutMs: 100,
            initialListenerPid: 111,
            currentListenerPid: { 222 },
            probeGatewayHealth: { true })

        #expect(observed)
    }

    @Test func `restart detection treats health probe failure as restart start when pid is unavailable`() async {
        let pushes = AsyncStream<GatewayPush> { continuation in
            continuation.finish()
        }
        let observed = await ConfigStore._testAwaitGatewayRestartBegan(
            pushes: pushes,
            timeoutMs: 100,
            initialListenerPid: nil,
            currentListenerPid: { nil },
            probeGatewayHealth: { false })

        #expect(observed)
    }
}
