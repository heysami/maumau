import Foundation
import MaumauKit
import Testing
@testable import Maumau

struct GatewayChannelRequestTests {
    private func requestFrameObject(
        from message: URLSessionWebSocketTask.Message) -> [String: Any]?
    {
        let data: Data? = switch message {
        case let .data(payload):
            payload
        case let .string(payload):
            payload.data(using: .utf8)
        @unknown default:
            nil
        }
        guard let data else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    }

    private func makeSession(requestSendDelayMs: Int) -> GatewayTestWebSocketSession {
        GatewayTestWebSocketSession(
            taskFactory: {
                GatewayTestWebSocketTask(
                    sendHook: { _, _, sendIndex in
                        guard sendIndex == 1 else { return }
                        try await Task.sleep(nanoseconds: UInt64(requestSendDelayMs) * 1_000_000)
                        throw URLError(.cannotConnectToHost)
                    })
            })
    }

    @Test func `request timeout then send failure does not double resume`() async throws {
        let session = self.makeSession(requestSendDelayMs: 100)
        let channel = try GatewayChannelActor(
            url: #require(URL(string: "ws://example.invalid")),
            token: nil,
            session: WebSocketSessionBox(session: session))

        do {
            _ = try await channel.request(method: "test", params: nil, timeoutMs: 10)
            Issue.record("Expected request to time out")
        } catch {
            let ns = error as NSError
            #expect(ns.domain == "Gateway")
            #expect(ns.code == 5)
        }

        // Give the delayed send failure task time to run; this used to crash due to a double-resume.
        try? await Task.sleep(nanoseconds: 250 * 1_000_000)
    }

    @Test func `request encodes nil params as empty object`() async throws {
        final class FrameCapture: @unchecked Sendable {
            private let lock = NSLock()
            private var frame: [String: Any]?

            func store(_ frame: [String: Any]?) {
                self.lock.lock()
                self.frame = frame
                self.lock.unlock()
            }

            func snapshot() -> [String: Any]? {
                self.lock.lock()
                defer { self.lock.unlock() }
                return self.frame
            }
        }

        let capture = FrameCapture()
        let session = GatewayTestWebSocketSession(
            taskFactory: {
                GatewayTestWebSocketTask(
                    sendHook: { task, message, sendIndex in
                        guard sendIndex == 1 else { return }
                        capture.store(self.requestFrameObject(from: message))
                        guard let id = GatewayWebSocketTestSupport.requestID(from: message) else {
                            return
                        }
                        task.emitReceiveSuccess(.data(GatewayWebSocketTestSupport.okResponseData(id: id)))
                    })
            })
        let channel = try GatewayChannelActor(
            url: #require(URL(string: "ws://example.invalid")),
            token: nil,
            session: WebSocketSessionBox(session: session))

        _ = try await channel.request(method: "models.list", params: nil, timeoutMs: 50)

        let frame = try #require(capture.snapshot())
        let params = frame["params"] as? [String: Any]
        #expect(params != nil)
        #expect(params?.isEmpty == true)
    }
}
