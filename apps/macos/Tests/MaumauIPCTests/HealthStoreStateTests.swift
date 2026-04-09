import Foundation
import Testing
@testable import Maumau

struct HealthStoreStateTests {
    private actor RefreshScenario {
        private var calls: [Bool] = []
        private var firstCallStarted: CheckedContinuation<Void, Never>?
        private var releaseFirstCall: CheckedContinuation<Void, Never>?

        func beginCall(probe: Bool) async -> Int {
            self.calls.append(probe)
            let index = self.calls.count
            if index == 1 {
                self.firstCallStarted?.resume()
                self.firstCallStarted = nil
                await withCheckedContinuation { continuation in
                    self.releaseFirstCall = continuation
                }
            }
            return index
        }

        func waitForFirstCall() async {
            guard self.calls.isEmpty else { return }
            await withCheckedContinuation { continuation in
                self.firstCallStarted = continuation
            }
        }

        func releaseFirst() {
            self.releaseFirstCall?.resume()
            self.releaseFirstCall = nil
        }

        func recordedCalls() -> [Bool] {
            self.calls
        }
    }

    @Test @MainActor func `linked channel probe failure degrades state`() {
        let snap = HealthSnapshot(
            ok: true,
            ts: 0,
            durationMs: 1,
            channels: [
                "whatsapp": .init(
                    configured: true,
                    linked: true,
                    authAgeMs: 1,
                    probe: .init(
                        ok: false,
                        status: 503,
                        error: "gateway connect failed",
                        elapsedMs: 12,
                        bot: nil,
                        webhook: nil),
                    lastProbeAt: 0),
            ],
            channelOrder: ["whatsapp"],
            channelLabels: ["whatsapp": "WhatsApp"],
            heartbeatSeconds: 60,
            sessions: .init(path: "/tmp/sessions.json", count: 0, recent: []))

        let store = HealthStore.shared
        store.__setSnapshotForTest(snap, lastError: nil)

        switch store.state {
        case let .degraded(message):
            #expect(!message.isEmpty)
        default:
            Issue.record("Expected degraded state when probe fails for linked channel")
        }

        #expect(store.summaryLine.contains("probe degraded"))
    }

    @Test @MainActor func `configured channel without linked field still reports ok`() {
        let snap = HealthSnapshot(
            ok: true,
            ts: 0,
            durationMs: 1,
            channels: [
                "telegram": .init(
                    configured: true,
                    linked: nil,
                    authAgeMs: nil,
                    probe: .init(
                        ok: true,
                        status: nil,
                        error: nil,
                        elapsedMs: 12,
                        bot: .init(username: "sfrbutlerbot"),
                        webhook: .init(url: "")),
                    lastProbeAt: 0),
            ],
            channelOrder: ["telegram"],
            channelLabels: ["telegram": "Telegram"],
            heartbeatSeconds: 60,
            sessions: .init(path: "/tmp/sessions.json", count: 0, recent: []))

        let store = HealthStore.shared
        store.__setSnapshotForTest(snap, lastError: nil)

        switch store.state {
        case .ok:
            #expect(Bool(true))
        default:
            Issue.record("Expected ok state when configured channel probe succeeds without linked metadata")
        }

        #expect(store.summaryLine == "Telegram ok")
    }

    @Test @MainActor func `configured channel without linked field still surfaces probe failure`() {
        let snap = HealthSnapshot(
            ok: true,
            ts: 0,
            durationMs: 1,
            channels: [
                "telegram": .init(
                    configured: true,
                    linked: nil,
                    authAgeMs: nil,
                    probe: .init(
                        ok: false,
                        status: 503,
                        error: "gateway connect failed",
                        elapsedMs: 18,
                        bot: .init(username: "sfrbutlerbot"),
                        webhook: .init(url: "")),
                    lastProbeAt: 0),
            ],
            channelOrder: ["telegram"],
            channelLabels: ["telegram": "Telegram"],
            heartbeatSeconds: 60,
            sessions: .init(path: "/tmp/sessions.json", count: 0, recent: []))

        let store = HealthStore.shared
        store.__setSnapshotForTest(snap, lastError: nil)

        switch store.state {
        case let .degraded(message):
            #expect(!message.isEmpty)
        default:
            Issue.record("Expected degraded state when configured channel probe fails without linked metadata")
        }

        #expect(store.summaryLine.contains("Telegram probe degraded"))
    }

    @Test @MainActor func `on demand refresh waits for in flight refresh before probing again`() async {
        let store = HealthStore.shared
        store.stop()
        store.__setSnapshotForTest(nil, lastError: "stale health error")

        let scenario = RefreshScenario()
        let firstSnapshot = HealthSnapshot(
            ok: true,
            ts: 1,
            durationMs: 1,
            channels: [
                "telegram": .init(
                    configured: true,
                    linked: true,
                    authAgeMs: 1,
                    probe: .init(
                        ok: true,
                        status: 200,
                        error: nil,
                        elapsedMs: 12,
                        bot: .init(username: "sfrbutlerbot"),
                        webhook: .init(url: "")),
                    lastProbeAt: 1),
            ],
            channelOrder: ["telegram"],
            channelLabels: ["telegram": "Telegram"],
            heartbeatSeconds: 60,
            sessions: .init(path: "/tmp/sessions.json", count: 0, recent: []))
        let secondSnapshot = HealthSnapshot(
            ok: true,
            ts: 2,
            durationMs: 1,
            channels: [
                "telegram": .init(
                    configured: true,
                    linked: true,
                    authAgeMs: 1,
                    probe: .init(
                        ok: true,
                        status: 200,
                        error: nil,
                        elapsedMs: 8,
                        bot: .init(username: "sfrbutlerbot"),
                        webhook: .init(url: "")),
                    lastProbeAt: 2),
            ],
            channelOrder: ["telegram"],
            channelLabels: ["telegram": "Telegram"],
            heartbeatSeconds: 60,
            sessions: .init(path: "/tmp/sessions.json", count: 0, recent: []))

        await HealthStore._withTestOverrides(.init(
            loadHealth: { probe in
                let callIndex = await scenario.beginCall(probe: probe)
                let snapshot = callIndex == 1 ? firstSnapshot : secondSnapshot
                return try JSONEncoder().encode(snapshot)
            }))
        {
            let backgroundTask = Task { @MainActor in
                await store.refresh()
            }

            await scenario.waitForFirstCall()

            let onDemandTask = Task { @MainActor in
                await store.refresh(onDemand: true)
            }

            try? await Task.sleep(nanoseconds: 50_000_000)
            #expect(await scenario.recordedCalls() == [false])

            await scenario.releaseFirst()
            await backgroundTask.value
            await onDemandTask.value

            #expect(await scenario.recordedCalls() == [false, true])
            #expect(store.lastError == nil)
            #expect(store.snapshot?.ts == 2)
        }
    }
}
