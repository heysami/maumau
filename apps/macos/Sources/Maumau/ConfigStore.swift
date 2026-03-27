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
        var saveGateway: (@MainActor @Sendable ([String: Any]) async throws -> Void)?
        var loadConfigFile: (@MainActor @Sendable () -> [String: Any])?
        var saveConfigFile: (@MainActor @Sendable ([String: Any]) -> Void)?
    }

    private actor OverrideStore {
        var overrides = Overrides()

        func setOverride(_ overrides: Overrides) {
            self.overrides = overrides
        }
    }

    private static let overrideStore = OverrideStore()
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
                try await self.saveToGateway(root)
            }
        } else {
            if let override = overrides.saveLocal {
                override(root)
            } else {
                do {
                    try await self.saveToGateway(root)
                } catch {
                    if self.shouldRetryGatewaySave(error) {
                        _ = await self.loadFromGateway()
                        try await self.saveToGateway(root)
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
    private static func saveToGateway(_ root: [String: Any]) async throws {
        let overrides = await self.overrideStore.overrides
        if let saveGateway = overrides.saveGateway {
            try await saveGateway(root)
            return
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
        _ = try await GatewayConnection.shared.requestRaw(
            method: .configSet,
            params: params,
            timeoutMs: 10000)
        _ = await self.loadFromGateway()
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
