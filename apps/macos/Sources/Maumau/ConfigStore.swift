import Foundation
import MaumauKit
import MaumauProtocol

enum ConfigStore {
    struct Overrides {
        var isRemoteMode: (@Sendable () async -> Bool)?
        var loadLocal: (@MainActor @Sendable () -> [String: Any])?
        var saveLocal: (@MainActor @Sendable ([String: Any]) -> Void)?
        var loadRemote: (@MainActor @Sendable () async -> [String: Any])?
        var saveRemote: (@MainActor @Sendable ([String: Any]) async throws -> Void)?
        var loadGateway: (@MainActor @Sendable () async -> [String: Any]?)?
        var saveGateway: (@MainActor @Sendable ([String: Any]) async throws -> GatewaySaveResult)?
        var waitForLocalGatewayRestart: (@MainActor @Sendable (GatewaySaveReload) async throws -> Void)?
        var loadConfigFile: (@MainActor @Sendable () -> [String: Any])?
        var saveConfigFile: (@MainActor @Sendable ([String: Any]) -> Void)?
    }

    struct GatewaySaveReload: Sendable, Equatable {
        let restartExpected: Bool
        let debounceMs: Int
        let deferralTimeoutMs: Int

        var shutdownTimeoutMs: Int {
            max(1_000, self.debounceMs + self.deferralTimeoutMs + 1_000)
        }
    }

    struct GatewaySaveResult: Sendable, Equatable {
        var hash: String?
        var reload: GatewaySaveReload?
    }

    private struct GatewayConfigSetReloadResponse: Decodable {
        let restartExpected: Bool?
        let debounceMs: Int?
        let deferralTimeoutMs: Int?
    }

    private struct GatewayConfigSetResponse: Decodable {
        let hash: String?
        let reload: GatewayConfigSetReloadResponse?
    }

    private actor OverrideStore {
        var overrides = Overrides()

        func setOverride(_ overrides: Overrides) {
            self.overrides = overrides
        }
    }

    #if DEBUG
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

    private static let overrideStore = OverrideStore()
    #if DEBUG
    private static let testOverrideLeaseCoordinator = TestOverrideLeaseCoordinator()
    #endif
    @MainActor private static var lastHash: String?
    private static let redactedSentinel = "__MAUMAU_REDACTED__"

    private static func isRemoteMode() async -> Bool {
        let overrides = await self.overrideStore.overrides
        if let override = overrides.isRemoteMode {
            return await override()
        }
        return await MainActor.run { AppStateStore.shared.connectionMode == .remote }
    }

    @MainActor
    static func load() async -> [String: Any] {
        let overrides = await self.overrideStore.overrides
        if await self.isRemoteMode() {
            if let override = overrides.loadRemote {
                return await override()
            }
            return await self.loadFromGateway() ?? [:]
        }
        if let override = overrides.loadLocal {
            return override()
        }
        if let gateway = await self.loadFromGateway() {
            return gateway
        }
        return MaumauConfigFile.loadDict()
    }

    @MainActor
    static func save(_ root: sending [String: Any]) async throws {
        let overrides = await self.overrideStore.overrides
        if await self.isRemoteMode() {
            if let override = overrides.saveRemote {
                try await override(root)
            } else {
                let result = try await self.saveToGateway(root)
                if let hash = result.hash {
                    self.lastHash = hash
                }
            }
        } else {
            if let override = overrides.saveLocal {
                override(root)
            } else {
                let initialListenerPid = await self.currentLocalGatewayListenerPid()
                let restartPushes = await GatewayConnection.shared.subscribe(bufferingNewest: 32)
                do {
                    let result = try await self.saveToGateway(root)
                    if let hash = result.hash {
                        self.lastHash = hash
                    }
                    try await self.waitForLocalGatewayRestartIfNeeded(
                        result.reload,
                        pushes: restartPushes,
                        initialListenerPid: initialListenerPid,
                        override: overrides.waitForLocalGatewayRestart)
                } catch {
                    if self.shouldRetryGatewaySave(error) {
                        _ = await self.loadFromGateway()
                        let retryInitialListenerPid = await self.currentLocalGatewayListenerPid()
                        let retryPushes = await GatewayConnection.shared.subscribe(bufferingNewest: 32)
                        let result = try await self.saveToGateway(root)
                        if let hash = result.hash {
                            self.lastHash = hash
                        }
                        try await self.waitForLocalGatewayRestartIfNeeded(
                            result.reload,
                            pushes: retryPushes,
                            initialListenerPid: retryInitialListenerPid,
                            override: overrides.waitForLocalGatewayRestart)
                        return
                    }
                    guard self.shouldFallbackToLocalSave(error) else {
                        throw error
                    }
                    let existingRoot = overrides.loadConfigFile?() ?? MaumauConfigFile.loadDict()
                    let restoredRoot = self.restoreRedactedValuesForLocalFallback(
                        root,
                        existingRoot: existingRoot)
                    if let saveConfigFile = overrides.saveConfigFile {
                        saveConfigFile(restoredRoot)
                    } else {
                        MaumauConfigFile.saveDict(restoredRoot)
                    }
                }
            }
        }
    }

    @MainActor
    private static func loadFromGateway() async -> [String: Any]? {
        let overrides = await self.overrideStore.overrides
        if let loadGateway = overrides.loadGateway {
            return await loadGateway()
        }
        do {
            let snap: ConfigSnapshot = try await GatewayConnection.shared.requestDecoded(
                method: .configGet,
                params: nil,
                timeoutMs: 8000)
            self.lastHash = snap.hash
            return snap.config?.mapValues { $0.foundationValue } ?? [:]
        } catch {
            return nil
        }
    }

    @MainActor
    private static func saveToGateway(_ root: [String: Any]) async throws -> GatewaySaveResult {
        let overrides = await self.overrideStore.overrides
        if let saveGateway = overrides.saveGateway {
            return try await saveGateway(root)
        }
        if self.lastHash == nil {
            _ = await self.loadFromGateway()
        }
        let data = try JSONSerialization.data(withJSONObject: root, options: [.prettyPrinted, .sortedKeys])
        guard let raw = String(data: data, encoding: .utf8) else {
            throw NSError(domain: "ConfigStore", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Failed to encode config.",
            ])
        }
        var params: [String: AnyCodable] = ["raw": AnyCodable(raw)]
        if let baseHash = self.lastHash {
            params["baseHash"] = AnyCodable(baseHash)
        }
        let response: GatewayConfigSetResponse = try await GatewayConnection.shared.requestDecoded(
            method: .configSet,
            params: params,
            timeoutMs: 10000)
        let reload = response.reload.map {
            GatewaySaveReload(
                restartExpected: $0.restartExpected ?? false,
                debounceMs: max(0, $0.debounceMs ?? 0),
                deferralTimeoutMs: max(0, $0.deferralTimeoutMs ?? 0))
        }
        return GatewaySaveResult(hash: response.hash, reload: reload)
    }

    private static func shouldRetryGatewaySave(_ error: Error) -> Bool {
        guard let response = error as? GatewayResponseError else { return false }
        guard response.code == "INVALID_REQUEST" else { return false }
        return response.message.localizedCaseInsensitiveContains(
            "config changed since last load")
    }

    private static func shouldFallbackToLocalSave(_ error: Error) -> Bool {
        !(error is GatewayResponseError || error is GatewayDecodingError)
    }

    @MainActor
    private static func waitForLocalGatewayRestartIfNeeded(
        _ reload: GatewaySaveReload?,
        pushes: AsyncStream<GatewayPush>,
        initialListenerPid: Int32?,
        override: (@MainActor @Sendable (GatewaySaveReload) async throws -> Void)?
    ) async throws {
        guard let reload, reload.restartExpected else { return }
        if let override {
            try await override(reload)
            return
        }
        try await self.waitForLocalGatewayRestart(
            reload,
            pushes: pushes,
            initialListenerPid: initialListenerPid)
    }

    @MainActor
    private static func waitForLocalGatewayRestart(
        _ reload: GatewaySaveReload,
        pushes: AsyncStream<GatewayPush>,
        initialListenerPid: Int32?
    ) async throws {
        GatewayProcessManager.shared.setActive(true)

        let observedShutdown = await self.awaitGatewayRestartBegan(
            pushes: pushes,
            timeoutMs: reload.shutdownTimeoutMs,
            initialListenerPid: initialListenerPid)
        guard observedShutdown else {
            throw NSError(domain: "ConfigStore", code: 2, userInfo: [
                NSLocalizedDescriptionKey: "Gateway restart did not begin before timeout.",
            ])
        }

        let ready = await GatewayProcessManager.shared.waitForGatewayReady(
            timeout: GatewayProcessManager.localGatewayStartupTimeout)
        guard ready else {
            throw NSError(domain: "ConfigStore", code: 3, userInfo: [
                NSLocalizedDescriptionKey: "Gateway did not become ready after restart.",
            ])
        }

        await GatewayEndpointStore.shared.refresh()
    }

    private static func currentLocalGatewayListenerPid() async -> Int32? {
        await PortGuardian.shared.describe(port: GatewayEnvironment.gatewayPort())?.pid
    }

    private static func awaitGatewayRestartBegan(
        pushes: AsyncStream<GatewayPush>,
        timeoutMs: Int,
        initialListenerPid: Int32?,
        currentListenerPid: (@Sendable () async -> Int32?)? = nil,
        probeGatewayHealth: (@Sendable () async -> Bool)? = nil
    ) async -> Bool {
        let currentListenerPid = currentListenerPid ?? { await self.currentLocalGatewayListenerPid() }
        let probeGatewayHealth = probeGatewayHealth ?? {
            await PortGuardian.shared.probeGatewayHealth(
                port: GatewayEnvironment.gatewayPort(),
                timeout: 0.5)
        }
        return await withTaskGroup(of: Bool.self) { group in
            group.addTask {
                for await push in pushes {
                    guard case let .event(evt) = push else { continue }
                    if evt.event == "shutdown" {
                        return true
                    }
                }
                while !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 250_000_000)
                }
                return false
            }
            if initialListenerPid != nil {
                group.addTask {
                    let deadline = Date().addingTimeInterval(Double(max(0, timeoutMs)) / 1000)
                    while Date() < deadline {
                        if await currentListenerPid() != initialListenerPid {
                            return true
                        }
                        try? await Task.sleep(nanoseconds: 250_000_000)
                    }
                    return false
                }
            }
            group.addTask {
                let deadline = Date().addingTimeInterval(Double(max(0, timeoutMs)) / 1000)
                while Date() < deadline {
                    // `config.set` just succeeded against a healthy gateway, so the first
                    // subsequent health failure is strong evidence that the planned restart
                    // has actually begun even if the shared socket missed its shutdown push.
                    if !(await probeGatewayHealth()) {
                        return true
                    }
                    try? await Task.sleep(nanoseconds: 250_000_000)
                }
                return false
            }
            group.addTask {
                let delayNs = UInt64(max(0, timeoutMs)) * 1_000_000
                try? await Task.sleep(nanoseconds: delayNs)
                return false
            }
            let result = await group.next() ?? false
            group.cancelAll()
            return result
        }
    }

    #if DEBUG
    static func _testAwaitGatewayRestartBegan(
        pushes: AsyncStream<GatewayPush>,
        timeoutMs: Int,
        initialListenerPid: Int32?,
        currentListenerPid: @escaping @Sendable () async -> Int32?,
        probeGatewayHealth: @escaping @Sendable () async -> Bool
    ) async -> Bool {
        await self.awaitGatewayRestartBegan(
            pushes: pushes,
            timeoutMs: timeoutMs,
            initialListenerPid: initialListenerPid,
            currentListenerPid: currentListenerPid,
            probeGatewayHealth: probeGatewayHealth)
    }
    #endif

    @MainActor
    private static func restoreRedactedValuesForLocalFallback(
        _ root: [String: Any],
        existingRoot: [String: Any]
    ) -> [String: Any] {
        guard self.containsRedactedSentinel(root) else { return root }
        guard !existingRoot.isEmpty else { return root }
        let restored = self.restoreRedactedValue(root, existing: existingRoot)
        return restored as? [String: Any] ?? root
    }

    private static func containsRedactedSentinel(_ value: Any) -> Bool {
        if let string = value as? String {
            return string == self.redactedSentinel
        }
        if let dict = value as? [String: Any] {
            return dict.values.contains { self.containsRedactedSentinel($0) }
        }
        if let array = value as? [Any] {
            return array.contains { self.containsRedactedSentinel($0) }
        }
        return false
    }

    private static func restoreRedactedValue(_ value: Any, existing: Any?) -> Any {
        if let string = value as? String, string == self.redactedSentinel {
            return existing ?? value
        }
        if let dict = value as? [String: Any] {
            let existingDict = existing as? [String: Any]
            return dict.reduce(into: [String: Any]()) { result, pair in
                result[pair.key] = self.restoreRedactedValue(pair.value, existing: existingDict?[pair.key])
            }
        }
        if let array = value as? [Any] {
            let existingArray = existing as? [Any]
            return array.enumerated().map { index, item in
                let existingItem = existingArray?.indices.contains(index) == true
                    ? existingArray?[index]
                    : nil
                return self.restoreRedactedValue(item, existing: existingItem)
            }
        }
        return value
    }

    #if DEBUG
    static func _testSetOverrides(_ overrides: Overrides) async {
        await self.overrideStore.setOverride(overrides)
    }

    static func _testClearOverrides() async {
        await self.overrideStore.setOverride(.init())
    }

    @MainActor
    static func _withTestOverrides<T>(
        _ overrides: Overrides,
        operation: @MainActor () async throws -> T
    ) async rethrows -> T {
        await self.testOverrideLeaseCoordinator.acquire()
        await self.overrideStore.setOverride(overrides)
        do {
            let result = try await operation()
            await self.overrideStore.setOverride(.init())
            await self.testOverrideLeaseCoordinator.release()
            return result
        } catch {
            await self.overrideStore.setOverride(.init())
            await self.testOverrideLeaseCoordinator.release()
            throw error
        }
    }

    @MainActor
    static func _testRestoreRedactedValuesForLocalFallback(
        _ root: [String: Any],
        existing: [String: Any]
    ) -> [String: Any] {
        self.restoreRedactedValuesForLocalFallback(root, existingRoot: existing)
    }

    static func _testShouldRetryGatewaySave(_ error: Error) -> Bool {
        self.shouldRetryGatewaySave(error)
    }

    static func _testShouldFallbackToLocalSave(_ error: Error) -> Bool {
        self.shouldFallbackToLocalSave(error)
    }
    #endif
}
