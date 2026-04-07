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

    private final class RequestAttemptCounter: @unchecked Sendable {
        private let lock = OSAllocatedUnfairLock<Int>(initialState: 0)

        func recordAttempt() {
            self.lock.withLock { $0 += 1 }
        }

        func value() -> Int {
            self.lock.withLock { $0 }
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

    @Test func `local recovery stops retrying once recovered request gets a gateway response error`() async {
        let readyAt = Date().addingTimeInterval(0.8)
        let requestAttempts = RequestAttemptCounter()
        let responseErrorSession = GatewayTestWebSocketSession(
            taskFactory: {
                GatewayTestWebSocketTask(
                    sendHook: { task, message, sendIndex in
                        guard sendIndex > 0 else { return }
                        guard let id = GatewayWebSocketTestSupport.requestID(from: message) else { return }
                        requestAttempts.recordAttempt()
                        let json = """
                        {
                          "type": "res",
                          "id": "\(id)",
                          "ok": false,
                          "error": {
                            "code": "INVALID_REQUEST",
                            "message": "wizard not found"
                          }
                        }
                        """
                        task.emitReceiveSuccess(.data(Data(json.utf8)))
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
        let url = URL(string: "ws://example.invalid")!
        let connection = GatewayConnection(
            configProvider: { (url: url, token: nil, password: nil) },
            sessionBox: WebSocketSessionBox(session: responseErrorSession))
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

        do {
            _ = try await connection.request(
                method: GatewayConnection.Method.wizardNext.rawValue,
                params: ["sessionId": AnyCodable("stale-session")])
            Issue.record("expected GatewayResponseError")
        } catch let error as GatewayResponseError {
            #expect(error.code == "INVALID_REQUEST")
            #expect(error.message == "wizard not found")
        } catch {
            Issue.record("unexpected error: \(error)")
        }

        #expect(requestAttempts.value() == 1)
    }
}
