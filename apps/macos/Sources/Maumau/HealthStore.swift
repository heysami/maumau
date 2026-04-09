import Foundation
import Network
import Observation
import SwiftUI

struct HealthSnapshot: Codable {
    struct ChannelSummary: Codable {
        struct Probe: Codable {
            struct Bot: Codable {
                let username: String?
            }

            struct Webhook: Codable {
                let url: String?
            }

            let ok: Bool?
            let status: Int?
            let error: String?
            let elapsedMs: Double?
            let bot: Bot?
            let webhook: Webhook?
        }

        let configured: Bool?
        let linked: Bool?
        let authAgeMs: Double?
        let probe: Probe?
        let lastProbeAt: Double?
    }

    struct SessionInfo: Codable {
        let key: String
        let updatedAt: Double?
        let age: Double?
    }

    struct Sessions: Codable {
        let path: String
        let count: Int
        let recent: [SessionInfo]
    }

    let ok: Bool?
    let ts: Double
    let durationMs: Double
    let channels: [String: ChannelSummary]
    let channelOrder: [String]?
    let channelLabels: [String: String]?
    let heartbeatSeconds: Int?
    let sessions: Sessions
}

enum HealthState: Equatable {
    case unknown
    case ok
    case linkingNeeded
    case degraded(String)

    var tint: Color {
        switch self {
        case .ok: .green
        case .linkingNeeded: .red
        case .degraded: .orange
        case .unknown: .secondary
        }
    }
}

@MainActor
@Observable
final class HealthStore {
    static let shared = HealthStore()

    private static let logger = Logger(subsystem: "ai.maumau", category: "health")

    #if DEBUG
    struct RefreshOverrides {
        var loadHealth: (@MainActor @Sendable (Bool) async throws -> Data)?
    }

    private actor OverrideStore {
        var overrides = RefreshOverrides()

        func setOverrides(_ overrides: RefreshOverrides) {
            self.overrides = overrides
        }
    }

    private actor TestOverrideLeaseCoordinator {
        private var held = false
        private var waiters: [CheckedContinuation<Void, Never>] = []

        func acquire() async {
            if !self.held {
                self.held = true
                return
            }
            await withCheckedContinuation { continuation in
                self.waiters.append(continuation)
            }
        }

        func release() {
            guard !self.waiters.isEmpty else {
                self.held = false
                return
            }
            let continuation = self.waiters.removeFirst()
            continuation.resume()
        }
    }
    #endif

    private(set) var snapshot: HealthSnapshot?
    private(set) var lastSuccess: Date?
    private(set) var lastError: String?
    private(set) var isRefreshing = false

    private var loopTask: Task<Void, Never>?
    private var activeRefreshTask: Task<Void, Never>?
    private var activeRefreshProbesGateway = false
    private let refreshInterval: TimeInterval = 60
    #if DEBUG
    private static let overrideStore = OverrideStore()
    private static let testOverrideLeaseCoordinator = TestOverrideLeaseCoordinator()
    #endif

    private init() {
        // Avoid background health polling in SwiftUI previews and tests.
        if !ProcessInfo.processInfo.isPreview, !ProcessInfo.processInfo.isRunningTests {
            self.start()
        }
    }

    /// Test-only escape hatch: the HealthStore is a process-wide singleton but
    /// state derivation is pure from `snapshot` + `lastError`.
    func __setSnapshotForTest(_ snapshot: HealthSnapshot?, lastError: String? = nil) {
        self.snapshot = snapshot
        self.lastError = lastError
    }

    func start() {
        guard self.loopTask == nil else { return }
        self.loopTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                await self.refresh()
                try? await Task.sleep(nanoseconds: UInt64(self.refreshInterval * 1_000_000_000))
            }
        }
    }

    func stop() {
        self.loopTask?.cancel()
        self.loopTask = nil
    }

    func refresh(onDemand: Bool = false) async {
        if let activeRefreshTask {
            let shouldRunFollowUpProbe = onDemand && !self.activeRefreshProbesGateway
            await activeRefreshTask.value
            if shouldRunFollowUpProbe {
                await self.refresh(onDemand: true)
            }
            return
        }

        self.isRefreshing = true
        self.activeRefreshProbesGateway = onDemand
        let refreshTask = Task { @MainActor [weak self] in
            guard let self else { return }
            defer {
                self.isRefreshing = false
                self.activeRefreshTask = nil
                self.activeRefreshProbesGateway = false
            }

            let previousError = self.lastError

            do {
                let data = try await self.loadHealthData(onDemand: onDemand)
                if let decoded = decodeHealthSnapshot(from: data) {
                    self.snapshot = decoded
                    self.lastSuccess = Date()
                    self.lastError = nil
                    if previousError != nil {
                        Self.logger.info("health refresh recovered")
                    }
                } else {
                    self.lastError = "health output not JSON"
                    if onDemand { self.snapshot = nil }
                    if previousError != self.lastError {
                        Self.logger.warning("health refresh failed: output not JSON")
                    }
                }
            } catch {
                let desc = error.localizedDescription
                self.lastError = desc
                if onDemand { self.snapshot = nil }
                if previousError != desc {
                    Self.logger.error("health refresh failed \(desc, privacy: .public)")
                }
            }
        }
        self.activeRefreshTask = refreshTask
        await refreshTask.value
    }

    private func loadHealthData(onDemand: Bool) async throws -> Data {
        #if DEBUG
        let overrides = await Self.overrideStore.overrides
        if let loadHealth = overrides.loadHealth {
            return try await loadHealth(onDemand)
        }
        #endif
        return try await ControlChannel.shared.health(timeout: 15, probe: onDemand)
    }

    private static func isChannelHealthy(_ summary: HealthSnapshot.ChannelSummary) -> Bool {
        guard summary.configured == true else { return false }
        // If probe is missing, treat it as "configured but unknown health" (not a hard fail).
        return summary.probe?.ok ?? true
    }

    private static func describeProbeFailure(_ probe: HealthSnapshot.ChannelSummary.Probe) -> String {
        let elapsed = probe.elapsedMs.map { "\(Int($0))ms" }
        if let error = probe.error, error.lowercased().contains("timeout") || probe.status == nil {
            if let elapsed { return "Health check timed out (\(elapsed))" }
            return "Health check timed out"
        }
        let code = probe.status.map { "status \($0)" } ?? "status unknown"
        let reason = probe.error?.isEmpty == false ? probe.error! : "health probe failed"
        if let elapsed { return "\(reason) (\(code), \(elapsed))" }
        return "\(reason) (\(code))"
    }

    private func resolveLinkChannel(
        _ snap: HealthSnapshot) -> (id: String, summary: HealthSnapshot.ChannelSummary)?
    {
        let order = snap.channelOrder ?? Array(snap.channels.keys)
        for id in order {
            if let summary = snap.channels[id], summary.linked == true {
                return (id: id, summary: summary)
            }
        }
        for id in order {
            if let summary = snap.channels[id], summary.linked != nil {
                return (id: id, summary: summary)
            }
        }
        return nil
    }

    private func resolveFallbackChannel(
        _ snap: HealthSnapshot,
        excluding id: String?) -> (id: String, summary: HealthSnapshot.ChannelSummary)?
    {
        let order = snap.channelOrder ?? Array(snap.channels.keys)
        for channelId in order {
            if channelId == id { continue }
            guard let summary = snap.channels[channelId] else { continue }
            if Self.isChannelHealthy(summary) {
                return (id: channelId, summary: summary)
            }
        }
        return nil
    }

    private func resolveConfiguredChannel(
        _ snap: HealthSnapshot,
        excluding id: String? = nil) -> (id: String, summary: HealthSnapshot.ChannelSummary)?
    {
        let order = snap.channelOrder ?? Array(snap.channels.keys)
        for channelId in order {
            if channelId == id { continue }
            guard let summary = snap.channels[channelId] else { continue }
            if summary.configured == true {
                return (id: channelId, summary: summary)
            }
        }
        return nil
    }

    private func channelLabel(_ channelId: String, in snap: HealthSnapshot) -> String {
        snap.channelLabels?[channelId] ?? channelId.capitalized
    }

    var state: HealthState {
        if let error = self.lastError, !error.isEmpty {
            return .degraded(error)
        }
        guard let snap = self.snapshot else { return .unknown }
        if let link = self.resolveLinkChannel(snap) {
            if link.summary.linked != true {
                // Linking is optional if any other channel is healthy; don't paint the whole app red.
                let fallback = self.resolveFallbackChannel(snap, excluding: link.id)
                return fallback != nil ? .degraded("Not linked") : .linkingNeeded
            }
            // A channel can be "linked" but still unhealthy (failed probe / cannot connect).
            if let probe = link.summary.probe, probe.ok == false {
                return .degraded(Self.describeProbeFailure(probe))
            }
            return .ok
        }

        // Some channels report probe/configured health without a "linked" field.
        guard let configured = self.resolveConfiguredChannel(snap) else { return .unknown }
        if let probe = configured.summary.probe, probe.ok == false {
            return .degraded(Self.describeProbeFailure(probe))
        }
        return .ok
    }

    var summaryLine: String {
        if self.isRefreshing { return "Health check running…" }
        if let error = self.lastError { return "Health check failed: \(error)" }
        guard let snap = self.snapshot else { return "Health check pending" }
        if let link = self.resolveLinkChannel(snap) {
            if link.summary.linked != true {
                if let fallback = self.resolveFallbackChannel(snap, excluding: link.id) {
                    let fallbackLabel = self.channelLabel(fallback.id, in: snap)
                    let fallbackState = (fallback.summary.probe?.ok ?? true) ? "ok" : "degraded"
                    return "\(fallbackLabel) \(fallbackState) · Not linked — run maumau login"
                }
                return "Not linked — run maumau login"
            }
            let auth = link.summary.authAgeMs.map { msToAge($0) } ?? "unknown"
            if let probe = link.summary.probe, probe.ok == false {
                let status = probe.status.map(String.init) ?? "?"
                let suffix = probe.status == nil ? "probe degraded" : "probe degraded · status \(status)"
                return "linked · auth \(auth) · \(suffix)"
            }
            return "linked · auth \(auth)"
        }

        guard let configured = self.resolveConfiguredChannel(snap) else { return "Health check pending" }
        let label = self.channelLabel(configured.id, in: snap)
        if let probe = configured.summary.probe, probe.ok == false {
            let status = probe.status.map(String.init) ?? "?"
            let suffix = probe.status == nil ? "probe degraded" : "probe degraded · status \(status)"
            return "\(label) \(suffix)"
        }
        if configured.summary.probe != nil {
            return "\(label) ok"
        }
        return "\(label) configured"
    }

    /// Short, human-friendly detail for the last failure, used in the UI.
    var detailLine: String? {
        if let error = self.lastError, !error.isEmpty {
            let lower = error.lowercased()
            if lower.contains("connection refused") {
                let port = GatewayEnvironment.gatewayPort()
                let host = GatewayConnectivityCoordinator.shared.localEndpointHostLabel ?? "127.0.0.1:\(port)"
                return "The gateway control port (\(host)) isn’t listening — restart Maumau to bring it back."
            }
            if lower.contains("timeout") {
                return "Timed out waiting for the control server; the gateway may be crashed or still starting."
            }
            return error
        }
        return nil
    }

    func describeFailure(from snap: HealthSnapshot, fallback: String?) -> String {
        if let link = self.resolveLinkChannel(snap), link.summary.linked != true {
            return "Not linked — run maumau login"
        }
        if let link = self.resolveLinkChannel(snap), let probe = link.summary.probe, probe.ok == false {
            return Self.describeProbeFailure(probe)
        }
        if let configured = self.resolveConfiguredChannel(snap),
           let probe = configured.summary.probe,
           probe.ok == false
        {
            return Self.describeProbeFailure(probe)
        }
        if let fallback, !fallback.isEmpty {
            return fallback
        }
        return "health probe failed"
    }

    var degradedSummary: String? {
        guard case let .degraded(reason) = self.state else { return nil }
        if reason == "[object Object]" || reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
           let snap = self.snapshot
        {
            return self.describeFailure(from: snap, fallback: reason)
        }
        return reason
    }

    #if DEBUG
    static func _testSetOverrides(_ overrides: RefreshOverrides) async {
        await self.overrideStore.setOverrides(overrides)
    }

    static func _testClearOverrides() async {
        await self.overrideStore.setOverrides(.init())
    }

    @MainActor
    static func _withTestOverrides<T>(
        _ overrides: RefreshOverrides,
        operation: @MainActor () async throws -> T
    ) async rethrows -> T {
        await self.testOverrideLeaseCoordinator.acquire()
        await self.overrideStore.setOverrides(overrides)
        do {
            let result = try await operation()
            await self.overrideStore.setOverrides(.init())
            await self.testOverrideLeaseCoordinator.release()
            return result
        } catch {
            await self.overrideStore.setOverrides(.init())
            await self.testOverrideLeaseCoordinator.release()
            throw error
        }
    }
    #endif
}

func msToAge(_ ms: Double) -> String {
    let minutes = Int(round(ms / 60000))
    if minutes < 1 { return "just now" }
    if minutes < 60 { return "\(minutes)m" }
    let hours = Int(round(Double(minutes) / 60))
    if hours < 48 { return "\(hours)h" }
    let days = Int(round(Double(hours) / 24))
    return "\(days)d"
}

/// Decode a health snapshot, tolerating stray log lines before/after the JSON blob.
func decodeHealthSnapshot(from data: Data) -> HealthSnapshot? {
    let decoder = JSONDecoder()
    if let snap = try? decoder.decode(HealthSnapshot.self, from: data) {
        return snap
    }
    guard let text = String(data: data, encoding: .utf8) else { return nil }
    guard let firstBrace = text.firstIndex(of: "{"), let lastBrace = text.lastIndex(of: "}") else {
        return nil
    }
    let slice = text[firstBrace...lastBrace]
    let cleaned = Data(slice.utf8)
    return try? decoder.decode(HealthSnapshot.self, from: cleaned)
}
