import Foundation
import MaumauKit
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
}
