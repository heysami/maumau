import Foundation
import Testing
@testable import Maumau

struct HealthStoreStateTests {
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
}
