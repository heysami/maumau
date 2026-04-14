import Foundation
import MaumauKit
import os
import Testing
@testable import Maumau

struct GatewayChannelRequestTests {
    private final class Signal: @unchecked Sendable {
        private let lock = OSAllocatedUnfairLock<Bool>(initialState: false)

        func mark() {
            self.lock.withLock { $0 = true }
        }

        func value() -> Bool {
            self.lock.withLock { $0 }
        }
    }

    private final class Gate: @unchecked Sendable {
        private let continuation = OSAllocatedUnfairLock<CheckedContinuation<Void, Never>?>(initialState: nil)

        func wait() async {
            await withCheckedContinuation { continuation in
                self.continuation.withLock { current in
                    current = continuation
                }
            }
        }

        func open() {
            let continuation = self.continuation.withLock { current -> CheckedContinuation<Void, Never>? in
                defer { current = nil }
                return current
            }
            continuation?.resume()
        }
    }

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

    @Test func `receive failure fails pending request before disconnect recovery finishes`() async throws {
        let requestSent = Signal()
        let requestFinished = Signal()
        let disconnectGate = Gate()
        let session = GatewayTestWebSocketSession(
            taskFactory: {
                GatewayTestWebSocketTask(
                    sendHook: { _, _, sendIndex in
                        if sendIndex == 1 {
                            requestSent.mark()
                        }
                    })
            })
        let channel = try GatewayChannelActor(
            url: #require(URL(string: "ws://example.invalid")),
            token: nil,
            session: WebSocketSessionBox(session: session),
            disconnectHandler: { _ in
                await disconnectGate.wait()
            })

        try await channel.connect()

        let requestTask = Task { () -> Result<Data, Error> in
            do {
                return .success(try await channel.request(method: "wizard.next", params: nil, timeoutMs: 2000))
            } catch {
                return .failure(error)
            }
        }
        let finishTask = Task {
            _ = await requestTask.value
            requestFinished.mark()
        }
        defer {
            finishTask.cancel()
        }

        for _ in 0..<30 {
            if requestSent.value() {
                break
            }
            try? await Task.sleep(nanoseconds: 10_000_000)
        }
        #expect(requestSent.value())

        session.latestTask()?.emitReceiveFailure()

        for _ in 0..<30 {
            if requestFinished.value() {
                break
            }
            try? await Task.sleep(nanoseconds: 10_000_000)
        }
        #expect(requestFinished.value())

        disconnectGate.open()
        let result = await requestTask.value
        switch result {
        case .success:
            Issue.record("expected pending request to fail after receive failure")
        case .failure:
            break
        }
    }
}
