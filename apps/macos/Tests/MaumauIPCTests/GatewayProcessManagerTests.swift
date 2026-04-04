import Foundation
import MaumauKit
import Testing
@testable import Maumau

@Suite(.serialized)
@MainActor
struct GatewayProcessManagerTests {
    @Test func `defers launch agent auto enable while startup is already in progress`() {
        #expect(GatewayProcessManager.shouldDeferLaunchAgentAutoEnable(status: .starting))
        #expect(!GatewayProcessManager.shouldDeferLaunchAgentAutoEnable(status: .stopped))
        #expect(!GatewayProcessManager.shouldDeferLaunchAgentAutoEnable(status: .running(details: nil)))
        #expect(!GatewayProcessManager.shouldDeferLaunchAgentAutoEnable(status: .attachedExisting(details: nil)))
        #expect(!GatewayProcessManager.shouldDeferLaunchAgentAutoEnable(status: .failed("boom")))
    }

    @Test func `refreshes control channel whenever gateway is ready but the channel is not connected`() {
        #expect(!GatewayProcessManager.shouldRefreshControlChannel(state: .connected))
        #expect(GatewayProcessManager.shouldRefreshControlChannel(state: .connecting))
        #expect(GatewayProcessManager.shouldRefreshControlChannel(state: .disconnected))
        #expect(GatewayProcessManager.shouldRefreshControlChannel(state: .degraded("gateway restart")))
    }

    @Test func `treats slow existing listener attach failures as warmup`() {
        let timeout = NSError(
            domain: "Gateway",
            code: 5,
            userInfo: [NSLocalizedDescriptionKey: "gateway request timed out after 2000ms"])
        let protocolMismatch = NSError(
            domain: "Gateway",
            code: 2,
            userInfo: [NSLocalizedDescriptionKey: "protocol mismatch"])

        #expect(GatewayProcessManager.shouldTreatExistingListenerAttachFailureAsWarmup(timeout))
        #expect(!GatewayProcessManager.shouldTreatExistingListenerAttachFailureAsWarmup(protocolMismatch))
    }

    @Test func `replaces managed local listener after auth failure`() {
        let authFailure = URLError(.dataNotAllowed)
        let managedListener = PortGuardian.Descriptor(
            pid: 42,
            command: "node",
            fullCommand: "maumau-gateway",
            executablePath: "/usr/local/bin/node")

        #expect(GatewayProcessManager.shouldReplaceExistingManagedGatewayAfterAuthFailure(
            authFailure,
            instance: managedListener))
    }

    @Test func `does not replace unrelated listener after auth failure`() {
        let authFailure = URLError(.dataNotAllowed)
        let unrelatedListener = PortGuardian.Descriptor(
            pid: 99,
            command: "python",
            fullCommand: "python -m http.server 18789",
            executablePath: "/usr/bin/python3")

        #expect(!GatewayProcessManager.shouldReplaceExistingManagedGatewayAfterAuthFailure(
            authFailure,
            instance: unrelatedListener))
    }

    @Test func `does not replace managed listener when auth probe times out`() {
        let timeout = NSError(
            domain: "Gateway",
            code: 5,
            userInfo: [NSLocalizedDescriptionKey: "gateway auth probe timed out"])
        let managedListener = PortGuardian.Descriptor(
            pid: 42,
            command: "node",
            fullCommand: "maumau-gateway",
            executablePath: "/usr/local/bin/node")

        #expect(!GatewayProcessManager.shouldReplaceExistingManagedGatewayAfterAuthFailure(
            timeout,
            instance: managedListener))
    }

    @Test func `clears last failure when health succeeds`() async throws {
        let session = GatewayTestWebSocketSession(
            taskFactory: {
                GatewayTestWebSocketTask(
                    sendHook: { task, message, sendIndex in
                        guard sendIndex > 0 else { return }
                        guard let id = GatewayWebSocketTestSupport.requestID(from: message) else { return }
                        task.emitReceiveSuccess(.data(GatewayWebSocketTestSupport.okResponseData(id: id)))
                    })
            })
        let url = try #require(URL(string: "ws://example.invalid"))
        let connection = GatewayConnection(
            configProvider: { (url: url, token: nil, password: nil) },
            sessionBox: WebSocketSessionBox(session: session))

        let manager = GatewayProcessManager.shared
        manager.setTestingConnection(connection)
        manager.setTestingDesiredActive(true)
        manager.setTestingStatus(.starting)
        manager.setTestingLastFailureReason("health failed")
        defer {
            manager.setTestingConnection(nil)
            manager.setTestingStatus(.stopped)
            manager.setTestingDesiredActive(false)
            manager.setTestingLastFailureReason(nil)
        }

        let ready = await manager.waitForGatewayReady(timeout: 0.5)
        #expect(ready)
        #expect(manager.lastFailureReason == nil)
        if case .running = manager.status {
            #expect(Bool(true))
        } else {
            Issue.record("expected gateway manager to transition to running after readiness succeeds")
        }
    }

    @Test func `readiness wait does not recurse through auto recovery`() async throws {
        let session = GatewayTestWebSocketSession(
            taskFactory: {
                GatewayTestWebSocketTask(
                    receiveHook: { _, _ in
                        throw URLError(.cannotConnectToHost)
                    })
            })
        let url = try #require(URL(string: "ws://example.invalid"))
        let connection = GatewayConnection(
            configProvider: { (url: url, token: nil, password: nil) },
            sessionBox: WebSocketSessionBox(session: session))

        let manager = GatewayProcessManager.shared
        let previousMode = AppStateStore.shared.connectionMode
        manager.setTestingConnection(connection)
        manager.setTestingDesiredActive(true)
        manager.setTestingStatus(.starting)
        AppStateStore.shared.connectionMode = .local
        defer {
            AppStateStore.shared.connectionMode = previousMode
            manager.setTestingConnection(nil)
            manager.setTestingStatus(.stopped)
            manager.setTestingDesiredActive(false)
        }

        let startedAt = Date()
        let ready = await manager.waitForGatewayReady(timeout: 0.65)
        let elapsed = Date().timeIntervalSince(startedAt)

        #expect(!ready)
        #expect(elapsed < 2.0)
        #expect(session.snapshotMakeCount() <= 3)
    }

    @Test func `readiness wait tolerates a slow first health response`() async throws {
        let session = GatewayTestWebSocketSession(
            taskFactory: {
                GatewayTestWebSocketTask(
                    sendHook: { task, message, sendIndex in
                        guard sendIndex > 0 else { return }
                        guard let id = GatewayWebSocketTestSupport.requestID(from: message) else { return }
                        Task.detached {
                            try? await Task.sleep(nanoseconds: 2_200_000_000)
                            task.emitReceiveSuccess(.data(GatewayWebSocketTestSupport.okResponseData(id: id)))
                        }
                    })
            })
        let url = try #require(URL(string: "ws://example.invalid"))
        let connection = GatewayConnection(
            configProvider: { (url: url, token: nil, password: nil) },
            sessionBox: WebSocketSessionBox(session: session))

        let manager = GatewayProcessManager.shared
        manager.setTestingConnection(connection)
        manager.setTestingDesiredActive(true)
        manager.setTestingStatus(.starting)
        defer {
            manager.setTestingConnection(nil)
            manager.setTestingStatus(.stopped)
            manager.setTestingDesiredActive(false)
        }

        let ready = await manager.waitForGatewayReady(timeout: 3.5)
        #expect(ready)
        if case .running = manager.status {
            #expect(Bool(true))
        } else {
            Issue.record("expected gateway manager to stay in startup long enough for a slow health probe")
        }
    }

    @Test func `concurrent readiness waits share one polling task`() async throws {
        let readyAt = Date().addingTimeInterval(0.55)
        let session = GatewayTestWebSocketSession(
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
        let url = try #require(URL(string: "ws://example.invalid"))
        let connection = GatewayConnection(
            configProvider: { (url: url, token: nil, password: nil) },
            sessionBox: WebSocketSessionBox(session: session))

        let manager = GatewayProcessManager.shared
        let previousMode = AppStateStore.shared.connectionMode
        manager.setTestingConnection(connection)
        manager.setTestingDesiredActive(true)
        manager.setTestingStatus(.starting)
        AppStateStore.shared.connectionMode = .local
        defer {
            AppStateStore.shared.connectionMode = previousMode
            manager.setTestingConnection(nil)
            manager.setTestingStatus(.stopped)
            manager.setTestingDesiredActive(false)
        }

        async let firstReady: Bool = manager.waitForGatewayReady(timeout: 1.2)
        async let secondReady: Bool = manager.waitForGatewayReady(timeout: 1.2)
        let (first, second) = await (firstReady, secondReady)

        #expect(first)
        #expect(second)
        #expect(session.snapshotMakeCount() <= 3)
    }
}
