import Foundation
import MaumauProtocol

extension ChannelsStore {
    static let inlineOnboardingChannelIDs = UserChannelQuickSetupRegistry.channelOrder
    static let settingsVisibleChannelIDs = inlineOnboardingChannelIDs + [
        "googlechat",
        "signal",
    ]
    private static var seamlessQuickSetupChannels: Set<String> {
        Set(ChannelsStore.inlineOnboardingChannelIDs)
    }

    func mergedQuickSetupUpdates(
        channelId: String? = nil,
        _ updates: [(path: ConfigPath, value: Any?)]
    ) -> [(path: ConfigPath, value: Any?)] {
        guard let channelId else { return updates }
        guard Self.seamlessQuickSetupChannels.contains(channelId) else { return updates }
        guard !updates.isEmpty || channelId == "whatsapp" else { return updates }

        let dmPolicyPath: ConfigPath = [.key("channels"), .key(channelId), .key("dmPolicy")]
        let allowFromPath: ConfigPath = [.key("channels"), .key(channelId), .key("allowFrom")]
        let updatesDmPolicy = updates.contains(where: { $0.path == dmPolicyPath })
        let updatesAllowFrom = updates.contains(where: { $0.path == allowFromPath })
        let existingDmPolicy = self.configValue(at: dmPolicyPath)
        let existingAllowFrom = self.configValue(at: allowFromPath)

        guard !updatesDmPolicy, !updatesAllowFrom else { return updates }
        guard existingDmPolicy == nil, existingAllowFrom == nil else { return updates }

        return updates + [
            (dmPolicyPath, "open"),
            (allowFromPath, ["*"]),
        ]
    }

    private func enableBundledChannelPluginForQuickSetup(_ channelId: String) -> String? {
        let trimmedChannelID = channelId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedChannelID.isEmpty else { return nil }

        let pluginsEnabledPath: ConfigPath = [.key("plugins"), .key("enabled")]
        if let pluginsEnabled = self.configValue(at: pluginsEnabledPath) as? Bool, !pluginsEnabled {
            return "plugins disabled"
        }

        let denyPath: ConfigPath = [.key("plugins"), .key("deny")]
        let deniedPluginIDs = (self.configValue(at: denyPath) as? [Any])?
            .compactMap { ($0 as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty } ?? []
        if deniedPluginIDs.contains(trimmedChannelID) {
            return "blocked by denylist"
        }

        self.updateConfigValue(
            path: [.key("plugins"), .key("entries"), .key(trimmedChannelID), .key("enabled")],
            value: true)

        let allowPath: ConfigPath = [.key("plugins"), .key("allow")]
        if let allowValues = self.configValue(at: allowPath) as? [Any] {
            var allowlist = allowValues.compactMap {
                ($0 as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
            }.filter { !$0.isEmpty }
            if !allowlist.contains(trimmedChannelID) {
                allowlist.append(trimmedChannelID)
                self.updateConfigValue(path: allowPath, value: allowlist)
            }
        }

        return nil
    }

    func loadConfigSchema() async {
        guard !self.configSchemaLoading else { return }
        self.configSchemaLoading = true
        defer { self.configSchemaLoading = false }

        do {
            let res: ConfigSchemaResponse = try await GatewayConnection.shared.requestDecoded(
                method: .configSchema,
                params: nil,
                timeoutMs: 8000)
            let schemaValue = res.schema.foundationValue
            self.configSchema = ConfigSchemaNode(raw: schemaValue)
            let hintValues = res.uihints.mapValues { $0.foundationValue }
            self.configUiHints = decodeUiHints(hintValues)
        } catch {
            self.configStatus = error.localizedDescription
        }
    }

    func loadConfig() async {
        do {
            let snap: ConfigSnapshot = try await GatewayConnection.shared.requestDecoded(
                method: .configGet,
                params: nil,
                timeoutMs: 10000)
            self.configStatus = snap.valid == false
                ? "Config invalid; fix it in ~/.maumau/maumau.json."
                : nil
            self.configRoot = snap.config?.mapValues { $0.foundationValue } ?? [:]
            if !(self.defersConfigSaves && self.configDirty) {
                self.configDraft = cloneConfigValue(self.configRoot) as? [String: Any] ?? self.configRoot
                self.configDirty = false
            }
            self.configLoaded = true

            self.applyUIConfig(snap)
        } catch {
            self.configStatus = error.localizedDescription
        }
    }

    func editableConfigRoot(fallback fallbackRoot: [String: Any]? = nil) -> [String: Any] {
        if self.configLoaded || self.configDirty {
            return self.configDraft
        }
        let root = fallbackRoot ?? self.configRoot
        self.replaceConfigDraft(root, dirty: false)
        return self.configDraft
    }

    func replaceConfigDraft(_ root: [String: Any], dirty: Bool) {
        self.configRoot = root
        self.configDraft = cloneConfigValue(root) as? [String: Any] ?? root
        self.configDirty = dirty
        self.configLoaded = true
    }

    private func applyUIConfig(_ snap: ConfigSnapshot) {
        let ui = snap.config?["ui"]?.dictionaryValue
        let rawSeam = ui?["seamColor"]?.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        AppStateStore.shared.seamColorHex = rawSeam.isEmpty ? nil : rawSeam
    }

    func channelConfigSchema(for channelId: String) -> ConfigSchemaNode? {
        guard let root = self.configSchema else { return nil }
        return root.node(at: [.key("channels"), .key(channelId)])
    }

    func configValue(at path: ConfigPath) -> Any? {
        if let value = valueAtPath(self.configDraft, path: path) {
            return value
        }
        guard path.count >= 2 else { return nil }
        if case .key("channels") = path[0], case .key = path[1] {
            let fallbackPath = Array(path.dropFirst())
            return valueAtPath(self.configDraft, path: fallbackPath)
        }
        return nil
    }

    func updateConfigValue(path: ConfigPath, value: Any?) {
        var root: Any = self.configDraft
        setValue(&root, path: path, value: value)
        self.configDraft = root as? [String: Any] ?? self.configDraft
        self.configDirty = true
    }

    @discardableResult
    func saveConfigDraft(forcePersist: Bool = false, reloadAfterSave: Bool = true) async -> Bool {
        guard !self.isSavingConfig else { return false }
        self.isSavingConfig = true
        defer { self.isSavingConfig = false }

        if self.defersConfigSaves && !forcePersist {
            return true
        }

        let savedRoot = cloneConfigValue(self.configDraft) as? [String: Any] ?? self.configDraft
        do {
            try await ConfigStore.save(self.configDraft)
            self.configStatus = nil
            self.replaceConfigDraft(savedRoot, dirty: false)
            if reloadAfterSave {
                await self.loadConfig()
                await self.refresh(probe: true)
            }
            return true
        } catch {
            self.configStatus = error.localizedDescription
            return false
        }
    }

    @discardableResult
    func applyDeferredConfigChanges() async -> Bool {
        guard self.defersConfigSaves, self.configDirty else { return true }
        return await self.saveConfigDraft(forcePersist: true, reloadAfterSave: false)
    }

    func reloadConfigDraft() async {
        await self.loadConfig()
    }

    @discardableResult
    func saveQuickSetupUpdates(
        channelId: String? = nil,
        _ updates: [(path: ConfigPath, value: Any?)],
        successMessage: String) async -> Bool
    {
        if !self.configLoaded {
            await self.loadConfig()
        }

        if let channelId,
           let enableFailure = self.enableBundledChannelPluginForQuickSetup(channelId)
        {
            self.configStatus = "Cannot enable \(channelId): \(enableFailure)."
            return false
        }

        for update in self.mergedQuickSetupUpdates(channelId: channelId, updates) {
            self.updateConfigValue(path: update.path, value: update.value)
        }

        if self.defersConfigSaves {
            self.configStatus = "\(successMessage) \(self.deferredOnboardingSaveNotice())"
            return true
        }

        let saved = await self.saveConfigDraft()
        if saved {
            self.configStatus = successMessage
            return true
        }

        return false
    }

    private func deferredOnboardingSaveNotice() -> String {
        macLocalized(
            "Changes apply when you finish setup.",
            language: AppStateStore.shared.effectiveOnboardingLanguage)
    }
}

private func valueAtPath(_ root: Any, path: ConfigPath) -> Any? {
    var current: Any? = root
    for segment in path {
        switch segment {
        case let .key(key):
            guard let dict = current as? [String: Any] else { return nil }
            current = dict[key]
        case let .index(index):
            guard let array = current as? [Any], array.indices.contains(index) else { return nil }
            current = array[index]
        }
    }
    return current
}

private func setValue(_ root: inout Any, path: ConfigPath, value: Any?) {
    guard let segment = path.first else { return }
    switch segment {
    case let .key(key):
        var dict = root as? [String: Any] ?? [:]
        if path.count == 1 {
            if let value {
                dict[key] = value
            } else {
                dict.removeValue(forKey: key)
            }
            root = dict
            return
        }
        var child = dict[key] ?? [:]
        setValue(&child, path: Array(path.dropFirst()), value: value)
        dict[key] = child
        root = dict
    case let .index(index):
        var array = root as? [Any] ?? []
        if index >= array.count {
            array.append(contentsOf: repeatElement(NSNull() as Any, count: index - array.count + 1))
        }
        if path.count == 1 {
            if let value {
                array[index] = value
            } else if array.indices.contains(index) {
                array.remove(at: index)
            }
            root = array
            return
        }
        var child = array[index]
        setValue(&child, path: Array(path.dropFirst()), value: value)
        array[index] = child
        root = array
    }
}

private func cloneConfigValue(_ value: Any) -> Any {
    guard JSONSerialization.isValidJSONObject(value) else { return value }
    do {
        let data = try JSONSerialization.data(withJSONObject: value, options: [])
        return try JSONSerialization.jsonObject(with: data, options: [])
    } catch {
        return value
    }
}
