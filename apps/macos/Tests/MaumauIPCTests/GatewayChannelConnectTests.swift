import Foundation
import MaumauKit
import Testing
@testable import Maumau

struct GatewayChannelConnectTests {
    private enum FakeResponse {
        case helloOk(delayMs: Int)
        case invalid(delayMs: Int)
        case authFailed(
            delayMs: Int,
            detailCode: String,
            canRetryWithDeviceToken: Bool,
            recommendedNextStep: String?)
    }

    private func makeSession(response: FakeResponse) -> GatewayTestWebSocketSession {
        GatewayTestWebSocketSession(
            taskFactory: {
                GatewayTestWebSocketTask(
                    receiveHook: { task, receiveIndex in
                        if receiveIndex == 0 {
                            return .data(GatewayWebSocketTestSupport.connectChallengeData())
                        }
                        let delayMs: Int
                        let message: URLSessionWebSocketTask.Message
                        switch response {
                        case let .helloOk(ms):
                            delayMs = ms
                            let id = task.snapshotConnectRequestID() ?? "connect"
                            message = .data(GatewayWebSocketTestSupport.connectOkData(id: id))
                        case let .invalid(ms):
                            delayMs = ms
                            message = .string("not json")
                        case let .authFailed(ms, detailCode, canRetryWithDeviceToken, recommendedNextStep):
                            delayMs = ms
                            let id = task.snapshotConnectRequestID() ?? "connect"
                            message = .data(GatewayWebSocketTestSupport.connectAuthFailureData(
                                id: id,
                                detailCode: detailCode,
                                canRetryWithDeviceToken: canRetryWithDeviceToken,
                                recommendedNextStep: recommendedNextStep))
                        }
                        try await Task.sleep(nanoseconds: UInt64(delayMs) * 1_000_000)
                        return message
                    })
            })
    }

    @Test func `concurrent connect is single flight on success`() async throws {
        let session = self.makeSession(response: .helloOk(delayMs: 200))
        let channel = try GatewayChannelActor(
            url: #require(URL(string: "ws://example.invalid")),
            token: nil,
            session: WebSocketSessionBox(session: session))

        let t1 = Task { try await channel.connect() }
        let t2 = Task { try await channel.connect() }

        _ = try await t1.value
        _ = try await t2.value

        #expect(session.snapshotMakeCount() == 1)
    }

    @Test func `concurrent connect shares failure`() async throws {
        let session = self.makeSession(response: .invalid(delayMs: 200))
        let channel = try GatewayChannelActor(
            url: #require(URL(string: "ws://example.invalid")),
            token: nil,
            session: WebSocketSessionBox(session: session))

        let t1 = Task { try await channel.connect() }
        let t2 = Task { try await channel.connect() }

        let r1 = await t1.result
        let r2 = await t2.result

        #expect({
            if case .failure = r1 { true } else { false }
        }())
        #expect({
            if case .failure = r2 { true } else { false }
        }())
        #expect(session.snapshotMakeCount() == 1)
    }

    @Test func `connect surfaces structured auth failure`() async throws {
        let session = self.makeSession(response: .authFailed(
            delayMs: 0,
            detailCode: GatewayConnectAuthDetailCode.authTokenMissing.rawValue,
            canRetryWithDeviceToken: true,
            recommendedNextStep: GatewayConnectRecoveryNextStep.updateAuthConfiguration.rawValue))
        let channel = try GatewayChannelActor(
            url: #require(URL(string: "ws://example.invalid")),
            token: nil,
            session: WebSocketSessionBox(session: session))

        do {
            try await channel.connect()
            Issue.record("expected GatewayConnectAuthError")
        } catch let error as GatewayConnectAuthError {
            #expect(error.detail == .authTokenMissing)
            #expect(error.detailCode == GatewayConnectAuthDetailCode.authTokenMissing.rawValue)
            #expect(error.canRetryWithDeviceToken)
            #expect(error.recommendedNextStep == .updateAuthConfiguration)
            #expect(error.recommendedNextStepCode == GatewayConnectRecoveryNextStep.updateAuthConfiguration.rawValue)
        } catch {
            Issue.record("unexpected error: \(error)")
        }
    }

    @Test func `connect clears stale stored device token after mismatch`() async throws {
        let tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        let previousStateDir = ProcessInfo.processInfo.environment["MAUMAU_STATE_DIR"]
        setenv("MAUMAU_STATE_DIR", tempDir.path, 1)
        defer {
            if let previousStateDir {
                setenv("MAUMAU_STATE_DIR", previousStateDir, 1)
            } else {
                unsetenv("MAUMAU_STATE_DIR")
            }
            try? FileManager.default.removeItem(at: tempDir)
        }

        let namespace = "ui-test"
        let identity = DeviceIdentityStore.loadOrCreate(namespace: namespace)
        _ = DeviceAuthStore.storeToken(
            deviceId: identity.deviceId,
            role: "operator",
            token: "stale-device-token",
            namespace: namespace)

        let session = self.makeSession(response: .authFailed(
            delayMs: 0,
            detailCode: GatewayConnectAuthDetailCode.authTokenMismatch.rawValue,
            canRetryWithDeviceToken: false,
            recommendedNextStep: GatewayConnectRecoveryNextStep.reviewAuthConfiguration.rawValue))
        let channel = try GatewayChannelActor(
            url: #require(URL(string: "ws://example.invalid")),
            token: nil,
            session: WebSocketSessionBox(session: session),
            connectOptions: GatewayConnectOptions(
                role: "operator",
                scopes: ["operator.read"],
                caps: [],
                commands: [],
                permissions: [:],
                clientId: "maumau-macos-test",
                clientMode: "ui",
                clientDisplayName: "Test Mac",
                deviceIdentityNamespace: namespace))

        do {
            try await channel.connect()
            Issue.record("expected GatewayConnectAuthError")
        } catch let error as GatewayConnectAuthError {
            #expect(error.detail == .authTokenMismatch)
        } catch {
            Issue.record("unexpected error: \(error)")
        }

        #expect(DeviceAuthStore.loadToken(
            deviceId: identity.deviceId,
            role: "operator",
            namespace: namespace) == nil)
    }
}
