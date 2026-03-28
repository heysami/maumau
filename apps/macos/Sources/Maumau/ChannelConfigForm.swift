import SwiftUI

private let configSchemaWordOverrides: [String: String] = [
    "acp": "ACP",
    "api": "API",
    "auth": "Auth",
    "cdp": "CDP",
    "cli": "CLI",
    "dir": "Directory",
    "dm": "DM",
    "dms": "DMs",
    "e164": "E.164",
    "http": "HTTP",
    "https": "HTTPS",
    "id": "ID",
    "ids": "IDs",
    "jid": "JID",
    "mb": "MB",
    "ms": "ms",
    "ok": "OK",
    "qr": "QR",
    "ssh": "SSH",
    "tls": "TLS",
    "url": "URL",
    "urls": "URLs",
    "wss": "WSS",
    "ws": "WS",
    "whatsapp": "WhatsApp",
]

func humanizeConfigSchemaKey(_ rawKey: String) -> String {
    let spaced = rawKey
        .replacingOccurrences(
            of: "([A-Z]+)([A-Z][a-z])",
            with: "$1 $2",
            options: .regularExpression)
        .replacingOccurrences(
            of: "([a-z0-9])([A-Z])",
            with: "$1 $2",
            options: .regularExpression)
        .replacingOccurrences(of: "_", with: " ")
        .replacingOccurrences(of: "-", with: " ")

    return spaced
        .split(whereSeparator: \.isWhitespace)
        .map { word in
            let lower = word.lowercased()
            if let override = configSchemaWordOverrides[lower] {
                return override
            }
            return word.prefix(1).uppercased() + word.dropFirst().lowercased()
        }
        .joined(separator: " ")
}

func configSchemaFallbackLabel(for path: ConfigPath) -> String? {
    guard case let .key(rawKey)? = path.reversed().first(where: {
        if case .key = $0 { return true }
        return false
    }) else {
        return nil
    }

    let trimmed = rawKey.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }
    return humanizeConfigSchemaKey(trimmed)
}

private func singularConfigSchemaLabel(_ label: String) -> String {
    if label.hasSuffix("ies") {
        return String(label.dropLast(3)) + "y"
    }
    if label.hasSuffix("s"), !label.hasSuffix("ss") {
        return String(label.dropLast())
    }
    return label
}

func configSchemaDynamicEntriesHeading(
    hasFixedProperties: Bool,
    language: OnboardingLanguage = macCurrentLanguage()) -> String?
{
    hasFixedProperties ? macLocalized("Extra entries", language: language) : nil
}

func configSchemaDynamicEntriesEmptyText(
    parentLabel: String?,
    hasFixedProperties: Bool,
    language: OnboardingLanguage = macCurrentLanguage()) -> String
{
    guard !hasFixedProperties, let parentLabel, !parentLabel.isEmpty else {
        return macLocalized("No extra entries yet.", language: language)
    }
    let translatedLabel = macLocalized(parentLabel, language: language).lowercased()
    if language == .id {
        return "Belum ada \(translatedLabel)."
    }
    return "No \(translatedLabel) yet."
}

func configSchemaDynamicEntriesAddButtonTitle(
    parentLabel: String?,
    hasFixedProperties: Bool,
    language: OnboardingLanguage = macCurrentLanguage()) -> String
{
    guard !hasFixedProperties, let parentLabel, !parentLabel.isEmpty else {
        return macLocalized("Add", language: language)
    }
    let singular = singularConfigSchemaLabel(parentLabel)
    if language == .id {
        return "Tambah \(macLocalized(singular, language: language).lowercased())"
    }
    return "Add \(singular)"
}

struct ConfigSchemaForm: View {
    @Bindable var store: ChannelsStore
    let schema: ConfigSchemaNode
    let path: ConfigPath

    private var language: OnboardingLanguage {
        macCurrentLanguage()
    }

    var body: some View {
        self.renderNode(self.schema, path: self.path)
    }

    private func renderNode(_ schema: ConfigSchemaNode, path: ConfigPath) -> AnyView {
        let storedValue = self.store.configValue(at: path)
        let value = storedValue ?? schema.explicitDefault
        let label = self.displayLabel(for: schema, path: path)
        let help = hintForPath(path, hints: store.configUiHints)?.help ?? schema.description
        let variants = schema.anyOf.isEmpty ? schema.oneOf : schema.anyOf

        if !variants.isEmpty {
            let nonNull = variants.filter { !$0.isNullSchema }
            if nonNull.count == 1, let only = nonNull.first {
                return self.renderNode(only, path: path)
            }
            let literals = nonNull.compactMap(\.literalValue)
            if !literals.isEmpty, literals.count == nonNull.count {
                return AnyView(
                    VStack(alignment: .leading, spacing: 6) {
                        if let label {
                            Text(macLocalized(label, language: self.language)).font(.callout.weight(.semibold))
                        }
                        if let help {
                            Text(macLocalized(help, language: self.language))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Picker(
                            "",
                            selection: self.enumBinding(
                                path,
                                options: literals,
                                defaultValue: schema.explicitDefault))
                        {
                            Text(macLocalized("Select…", language: self.language)).tag(-1)
                            ForEach(literals.indices, id: \ .self) { index in
                                Text(String(describing: literals[index])).tag(index)
                            }
                        }
                        .pickerStyle(.menu)
                    })
            }
        }

        switch schema.schemaType {
        case "object":
            let properties = schema.properties
            let sortedKeys = properties.keys.sorted { lhs, rhs in
                let orderA = hintForPath(path + [.key(lhs)], hints: store.configUiHints)?.order ?? 0
                let orderB = hintForPath(path + [.key(rhs)], hints: store.configUiHints)?.order ?? 0
                if orderA != orderB { return orderA < orderB }
                return lhs < rhs
            }
            let regularKeys = sortedKeys.filter { !self.isAdvancedField(path + [.key($0)]) }
            let advancedKeys = sortedKeys.filter { self.isAdvancedField(path + [.key($0)]) }
            return AnyView(
                VStack(alignment: .leading, spacing: 12) {
                    if let label {
                        Text(macLocalized(label, language: self.language))
                            .font(.callout.weight(.semibold))
                    }
                    if let help {
                        Text(macLocalized(help, language: self.language))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    ForEach(regularKeys, id: \ .self) { key in
                        if let child = properties[key] {
                            self.renderNode(child, path: path + [.key(key)])
                        }
                    }
                    if !advancedKeys.isEmpty {
                        DisclosureGroup(macLocalized("Advanced settings", language: self.language)) {
                            VStack(alignment: .leading, spacing: 12) {
                                ForEach(advancedKeys, id: \ .self) { key in
                                    if let child = properties[key] {
                                        self.renderNode(child, path: path + [.key(key)])
                                    }
                                }
                            }
                            .padding(.top, 8)
                        }
                    }
                    if schema.allowsAdditionalProperties {
                        self.renderAdditionalProperties(schema, path: path, value: value, parentLabel: label)
                    }
                })
        case "array":
            return AnyView(self.renderArray(schema, path: path, value: value, label: label, help: help))
        case "boolean":
            return AnyView(
                Toggle(isOn: self.boolBinding(path, defaultValue: schema.explicitDefault as? Bool)) {
                    if let label {
                        Text(macLocalized(label, language: self.language))
                    } else {
                        Text(macLocalized("Enabled", language: self.language))
                    }
                }
                .help(help.map { macLocalized($0, language: self.language) } ?? ""))
        case "number", "integer":
            return AnyView(self.renderNumberField(schema, path: path, label: label, help: help))
        case "string":
            return AnyView(self.renderStringField(schema, path: path, label: label, help: help))
        default:
            return AnyView(
                VStack(alignment: .leading, spacing: 6) {
                    if let label {
                        Text(macLocalized(label, language: self.language)).font(.callout.weight(.semibold))
                    }
                    Text(macLocalized("Unsupported field type.", language: self.language))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                })
        }
    }

    @ViewBuilder
    private func renderStringField(
        _ schema: ConfigSchemaNode,
        path: ConfigPath,
        label: String?,
        help: String?) -> some View
    {
        let hint = hintForPath(path, hints: store.configUiHints)
        let placeholder = hint?.placeholder ?? ""
        let localizedPlaceholder = macLocalized(placeholder, language: self.language)
        let sensitive = hint?.sensitive ?? isSensitivePath(path)
        let defaultValue = schema.explicitDefault as? String
        VStack(alignment: .leading, spacing: 6) {
            if let label { Text(macLocalized(label, language: self.language)).font(.callout.weight(.semibold)) }
            if let help {
                Text(macLocalized(help, language: self.language))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if let options = schema.enumValues {
                Picker("", selection: self.enumBinding(path, options: options, defaultValue: schema.explicitDefault)) {
                    Text(macLocalized("Select…", language: self.language)).tag(-1)
                    ForEach(options.indices, id: \ .self) { index in
                        Text(String(describing: options[index])).tag(index)
                    }
                }
                .pickerStyle(.menu)
            } else if sensitive {
                SecureField(localizedPlaceholder, text: self.stringBinding(path, defaultValue: defaultValue))
                    .textFieldStyle(.roundedBorder)
            } else {
                TextField(localizedPlaceholder, text: self.stringBinding(path, defaultValue: defaultValue))
                    .textFieldStyle(.roundedBorder)
            }
        }
    }

    @ViewBuilder
    private func renderNumberField(
        _ schema: ConfigSchemaNode,
        path: ConfigPath,
        label: String?,
        help: String?) -> some View
    {
        let defaultValue = (schema.explicitDefault as? Double)
            ?? (schema.explicitDefault as? Int).map(Double.init)
        VStack(alignment: .leading, spacing: 6) {
            if let label { Text(macLocalized(label, language: self.language)).font(.callout.weight(.semibold)) }
            if let help {
                Text(macLocalized(help, language: self.language))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            TextField(
                "",
                text: self.numberBinding(
                    path,
                    isInteger: schema.schemaType == "integer",
                    defaultValue: defaultValue))
                .textFieldStyle(.roundedBorder)
        }
    }

    @ViewBuilder
    private func renderArray(
        _ schema: ConfigSchemaNode,
        path: ConfigPath,
        value: Any?,
        label: String?,
        help: String?) -> some View
    {
        let items = value as? [Any] ?? []
        let itemSchema = schema.items
        VStack(alignment: .leading, spacing: 10) {
            if let label { Text(macLocalized(label, language: self.language)).font(.callout.weight(.semibold)) }
            if let help {
                Text(macLocalized(help, language: self.language))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            ForEach(items.indices, id: \ .self) { index in
                HStack(alignment: .top, spacing: 8) {
                    if let itemSchema {
                        self.renderNode(itemSchema, path: path + [.index(index)])
                    } else {
                        Text(String(describing: items[index]))
                    }
                    Button(macLocalized("Remove", language: self.language)) {
                        var next = items
                        next.remove(at: index)
                        self.store.updateConfigValue(path: path, value: next)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }
            }
            Button(macLocalized("Add", language: self.language)) {
                var next = items
                if let itemSchema {
                    next.append(itemSchema.defaultValue)
                } else {
                    next.append("")
                }
                self.store.updateConfigValue(path: path, value: next)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
    }

    @ViewBuilder
    private func renderAdditionalProperties(
        _ schema: ConfigSchemaNode,
        path: ConfigPath,
        value: Any?,
        parentLabel: String?) -> some View
    {
        if let additionalSchema = schema.additionalProperties {
            let dict = value as? [String: Any] ?? [:]
            let reserved = Set(schema.properties.keys)
            let extras = dict.keys.filter { !reserved.contains($0) }.sorted()
            let hasFixedProperties = !schema.properties.isEmpty
            let heading = configSchemaDynamicEntriesHeading(
                hasFixedProperties: hasFixedProperties,
                language: self.language)
            let emptyText = configSchemaDynamicEntriesEmptyText(
                parentLabel: parentLabel,
                hasFixedProperties: hasFixedProperties,
                language: self.language)
            let addButtonTitle = configSchemaDynamicEntriesAddButtonTitle(
                parentLabel: parentLabel,
                hasFixedProperties: hasFixedProperties,
                language: self.language)

            VStack(alignment: .leading, spacing: 8) {
                if let heading {
                    Text(heading)
                        .font(.callout.weight(.semibold))
                }
                if extras.isEmpty {
                    Text(emptyText)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(extras, id: \ .self) { key in
                        let itemPath: ConfigPath = path + [.key(key)]
                        HStack(alignment: .top, spacing: 8) {
                            TextField(macLocalized("Key", language: self.language), text: self.mapKeyBinding(path: path, key: key))
                                .textFieldStyle(.roundedBorder)
                                .frame(width: 160)
                            self.renderNode(additionalSchema, path: itemPath)
                            Button(macLocalized("Remove", language: self.language)) {
                                var next = dict
                                next.removeValue(forKey: key)
                                self.store.updateConfigValue(path: path, value: next)
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                        }
                    }
                }
                Button(addButtonTitle) {
                    var next = dict
                    var index = 1
                    var key = "new-\(index)"
                    while next[key] != nil {
                        index += 1
                        key = "new-\(index)"
                    }
                    next[key] = additionalSchema.defaultValue
                    self.store.updateConfigValue(path: path, value: next)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
        }
    }

    private func displayLabel(for schema: ConfigSchemaNode, path: ConfigPath) -> String? {
        if let label = hintForPath(path, hints: store.configUiHints)?.label?
            .trimmingCharacters(in: .whitespacesAndNewlines),
            !label.isEmpty
        {
            return label
        }
        if let title = schema.title?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty {
            return title
        }
        guard !path.contains(where: {
            if case .index = $0 { return true }
            return false
        }) else {
            return nil
        }
        return configSchemaFallbackLabel(for: path)
    }

    private func isAdvancedField(_ path: ConfigPath) -> Bool {
        hintForPath(path, hints: store.configUiHints)?.advanced == true
    }

    private func stringBinding(_ path: ConfigPath, defaultValue: String?) -> Binding<String> {
        Binding(
            get: {
                if let value = store.configValue(at: path) as? String { return value }
                return defaultValue ?? ""
            },
            set: { newValue in
                let trimmed = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
                self.store.updateConfigValue(path: path, value: trimmed.isEmpty ? nil : trimmed)
            })
    }

    private func boolBinding(_ path: ConfigPath, defaultValue: Bool?) -> Binding<Bool> {
        Binding(
            get: {
                if let value = store.configValue(at: path) as? Bool { return value }
                return defaultValue ?? false
            },
            set: { newValue in
                self.store.updateConfigValue(path: path, value: newValue)
            })
    }

    private func numberBinding(
        _ path: ConfigPath,
        isInteger: Bool,
        defaultValue: Double?) -> Binding<String>
    {
        Binding(
            get: {
                if let value = store.configValue(at: path) { return String(describing: value) }
                guard let defaultValue else { return "" }
                return isInteger ? String(Int(defaultValue)) : String(defaultValue)
            },
            set: { newValue in
                let trimmed = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
                if trimmed.isEmpty {
                    self.store.updateConfigValue(path: path, value: nil)
                } else if let value = Double(trimmed) {
                    self.store.updateConfigValue(path: path, value: isInteger ? Int(value) : value)
                }
            })
    }

    private func enumBinding(
        _ path: ConfigPath,
        options: [Any],
        defaultValue: Any?) -> Binding<Int>
    {
        Binding(
            get: {
                let value = self.store.configValue(at: path) ?? defaultValue
                guard let value else { return -1 }
                return options.firstIndex { option in
                    String(describing: option) == String(describing: value)
                } ?? -1
            },
            set: { index in
                guard index >= 0, index < options.count else {
                    self.store.updateConfigValue(path: path, value: nil)
                    return
                }
                self.store.updateConfigValue(path: path, value: options[index])
            })
    }

    private func mapKeyBinding(path: ConfigPath, key: String) -> Binding<String> {
        Binding(
            get: { key },
            set: { newValue in
                let trimmed = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else { return }
                guard trimmed != key else { return }
                let current = self.store.configValue(at: path) as? [String: Any] ?? [:]
                guard current[trimmed] == nil else { return }
                var next = current
                next[trimmed] = current[key]
                next.removeValue(forKey: key)
                self.store.updateConfigValue(path: path, value: next)
            })
    }
}

struct ChannelConfigForm: View {
    @Bindable var store: ChannelsStore
    let channelId: String

    var body: some View {
        if self.store.configSchemaLoading {
            ProgressView().controlSize(.small)
        } else if let schema = store.channelConfigSchema(for: channelId) {
            ConfigSchemaForm(store: self.store, schema: schema, path: [.key("channels"), .key(self.channelId)])
        } else {
            Text(macLocalized("Schema unavailable for this channel.", language: macCurrentLanguage()))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}
