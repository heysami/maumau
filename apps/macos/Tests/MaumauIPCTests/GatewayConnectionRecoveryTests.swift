import Foundation
import MaumauKit
import os
import Testing
@testable import Maumau

@Suite(.serialized)
@MainActor
struct GatewayConnectionRecoveryTests {
    private func makeRecoverableSession(readyAt: Date) -> GatewayTestWebSocketSession {
        GatewayTestWebSocketSession(
            taskFactory: {
                GatewayTestWebSocketTask(
                    sendHook: { task, message, sendIndex in
                        guard sendIndex > 0 else { return }
                        guard let id = GatewayWebSocketTestSupport.requestID(from: message) else { return }
                        task.emitReceiveSuccess(.data(GatewayWebSocketTestSupport.okResponseData(id: id)))
                    },
                    receiveHook: { task, receiveIndex in
                        if Date() < readyAt {
                            throw URLError(.cannotConnectToHost)
                        }
                        if receiveIndex == 0 {
                            return .data(GatewayWebSocketTestSupport.connectChallengeData())
                        }
                        let id = task.snapshotConnectRequestID() ?? "connect"
                        return .data(GatewayWebSocketTestSupport.connectOkData(id: id))
                    })
            })
    }

    private final class RecoveryFlag: @unchecked Sendable {
        private let lock = OSAllocatedUnfairLock<Bool>(initialState: false)

        func markRecovered() {
            self.lock.withLock { $0 = true }
        }

        func value() -> Bool {
            self.lock.withLock { $0 }
        }
    }

    private final class ConnectAttemptCounter: @unchecked Sendable {
        private let lock = OSAllocatedUnfairLock<Int>(initialState: 0)

        func nextAttempt() -> Int {
            self.lock.withLock { value in
                let current = value
                value += 1
                return current
            }
        }
    }

    @Test func `local request waits through gateway restart window`() async throws {
        let readyAt = Date().addingTimeInterval(2.2)
        let url = try #require(URL(string: "ws://example.invalid"))
        let connection = GatewayConnection(
            configProvider: { (url: url, token: nil, password: nil) },
            sessionBox: WebSocketSessionBox(session: self.makeRecoverableSession(readyAt: readyAt)))
        let readinessConnection = GatewayConnection(
            configProvider: { (url: url, token: nil, password: nil) },
            sessionBox: WebSocketSessionBox(session: self.makeRecoverableSession(readyAt: readyAt)))

        let manager = GatewayProcessManager.shared
        let previousMode = AppStateStore.shared.connectionMode
        let launchAgentWasDisabled = GatewayLaunchAgentManager.isLaunchAgentWriteDisabled()
        if !launchAgentWasDisabled {
            #expect(GatewayLaunchAgentManager.setLaunchAgentWriteDisabled(true) == nil)
        }
        AppStateStore.shared.connectionMode = .local
        manager.setTestingConnection(readinessConnection)
        defer {
            manager.setTestingConnection(nil)
            manager.setTestingDesiredActive(false)
            AppStateStore.shared.connectionMode = previousMode
            if !launchAgentWasDisabled {
                _ = GatewayLaunchAgentManager.setLaunchAgentWriteDisabled(false)
            }
        }

        let data = try await connection.request(method: "status", params: nil)
        #expect(String(data: data, encoding: .utf8)?.contains("\"ok\":true") == true)
    }

    @Test func `local request repairs managed auth drift before retrying`() async throws {
        let recoveryFlag = RecoveryFlag()
        let connectAttempt = ConnectAttemptCounter()
        let authFailingSession = GatewayTestWebSocketSession(
            taskFactory: {
                let attempt = connectAttempt.nextAttempt()
                return GatewayTestWebSocketTask(
                    sendHook: { task, message, sendIndex in
                        guard sendIndex > 0 else { return }
                        guard let id = GatewayWebSocketTestSupport.requestID(from: message) else { return }
                        task.emitReceiveSuccess(.data(GatewayWebSocketTestSupport.okResponseData(id: id)))
                    },
                    receiveHook: { task, receiveIndex in
                        if receiveIndex == 0 {
                            return .data(GatewayWebSocketTestSupport.connectChallengeData())
                        }
                        let id = task.snapshotConnectRequestID() ?? "connect"
                        if attempt == 0 {
                            return .data(GatewayWebSocketTestSupport.connectAuthFailureData(
                                id: id,
                                detailCode: GatewayConnectAuthDetailCode.authTokenMismatch.rawValue,
                                canRetryWithDeviceToken: false,
                                recommendedNextStep: GatewayConnectRecoveryNextStep.updateAuthConfiguration.rawValue))
                        }
                        return .data(GatewayWebSocketTestSupport.connectOkData(id: id))
                    })
            })
        let readyAt = Date()
        let url = try #require(URL(string: "ws://example.invalid"))
        let connection = GatewayConnection(
            configProvider: { (url: url, token: "config-token", password: nil) },
            sessionBox: WebSocketSessionBox(session: authFailingSession))
        let readinessConnection = GatewayConnection(
            configProvider: { (url: url, token: "config-token", password: nil) },
            sessionBox: WebSocketSessionBox(session: self.makeRecoverableSession(readyAt: readyAt)))

        let manager = GatewayProcessManager.shared
        let previousMode = AppStateStore.shared.connectionMode
        AppStateStore.shared.connectionMode = .local
        manager.setTestingConnection(readinessConnection)
        manager.setTestingDesiredActive(true)
        manager.setTestingManagedAuthRecoveryHandler { _ in
            recoveryFlag.markRecovered()
            return true
        }
        defer {
            manager.setTestingConnection(nil)
            manager.setTestingDesiredActive(false)
            manager.setTestingManagedAuthRecoveryHandler(nil)
            AppStateStore.shared.connectionMode = previousMode
        }

        let data = try await connection.request(method: "status", params: nil)
        #expect(String(data: data, encoding: .utf8)?.contains("\"ok\":true") == true)
        #expect(recoveryFlag.value())
        #expect(authFailingSession.snapshotMakeCount() == 2)
    }
}
