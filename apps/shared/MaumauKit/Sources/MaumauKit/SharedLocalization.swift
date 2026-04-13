import Foundation

private struct MaumauSharedLocalizationCatalogFile: Decodable, Sendable {
    struct Language: Decodable, Sendable {
        let id: String
    }

    let fallbackLanguageId: String
    let languages: [Language]
}

private enum MaumauSharedLocalizationValue: Codable, Sendable {
    case string(String)
    case object([String: MaumauSharedLocalizationValue])
    case array([MaumauSharedLocalizationValue])
    case number(Double)
    case bool(Bool)
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let string = try? container.decode(String.self) {
            self = .string(string)
        } else if let bool = try? container.decode(Bool.self) {
            self = .bool(bool)
        } else if let number = try? container.decode(Double.self) {
            self = .number(number)
        } else if let object = try? container.decode([String: MaumauSharedLocalizationValue].self) {
            self = .object(object)
        } else if let array = try? container.decode([MaumauSharedLocalizationValue].self) {
            self = .array(array)
        } else {
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Unsupported shared localization value")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let string):
            try container.encode(string)
        case .object(let object):
            try container.encode(object)
        case .array(let array):
            try container.encode(array)
        case .number(let number):
            try container.encode(number)
        case .bool(let bool):
            try container.encode(bool)
        case .null:
            try container.encodeNil()
        }
    }

    var stringValue: String? {
        guard case .string(let string) = self else { return nil }
        return string
    }

    var objectValue: [String: MaumauSharedLocalizationValue]? {
        guard case .object(let object) = self else { return nil }
        return object
    }
}

public enum MaumauSharedLocalization {
    private static let catalog: MaumauSharedLocalizationCatalogFile = loadCatalog()
    private static let locales: [String: MaumauSharedLocalizationValue] = loadLocales()

    public static var fallbackLanguageID: String {
        self.catalog.fallbackLanguageId
    }

    public static func normalizeLanguageID(_ value: String?) -> String {
        let normalized = normalizeLanguageToken(value ?? "")
        guard !normalized.isEmpty else { return self.fallbackLanguageID }

        if normalized == "en" || normalized.hasPrefix("en-") {
            return "en"
        }
        if normalized == "id" || normalized == "in" || normalized.hasPrefix("id-") || normalized.hasPrefix("in-") {
            return "id"
        }
        if normalized == "ms" || normalized.hasPrefix("ms-") {
            return "ms"
        }
        if normalized == "th" || normalized.hasPrefix("th-") {
            return "th"
        }
        if normalized == "vi" || normalized.hasPrefix("vi-") {
            return "vi"
        }
        if normalized == "fil" || normalized == "tl" || normalized.hasPrefix("fil-") || normalized.hasPrefix("tl-") {
            return "fil"
        }
        if normalized == "my" || normalized == "bur" || normalized.hasPrefix("my-") {
            return "my"
        }
        if normalized == "jv" || normalized == "jw" || normalized.hasPrefix("jv-") || normalized.hasPrefix("jw-") {
            return "jv"
        }
        if normalized == "su" || normalized.hasPrefix("su-") {
            return "su"
        }
        if normalized == "btk" || normalized == "bbc" || normalized == "bts" || normalized == "btx" ||
            normalized.hasPrefix("btk-") || normalized.hasPrefix("bbc-") ||
            normalized.hasPrefix("bts-") || normalized.hasPrefix("btx-")
        {
            return "btk"
        }
        if normalized == "min" || normalized.hasPrefix("min-") {
            return "min"
        }
        if normalized == "ban" || normalized.hasPrefix("ban-") {
            return "ban"
        }
        if normalized == "bug" || normalized.hasPrefix("bug-") {
            return "bug"
        }
        if normalized == "mak" || normalized.hasPrefix("mak-") {
            return "mak"
        }
        if normalized == "minahasa" || normalized.hasPrefix("minahasa-") {
            return "minahasa"
        }
        if normalized == "mad" || normalized.hasPrefix("mad-") {
            return "mad"
        }
        if normalized == "zh-tw" || normalized == "zh-hk" || normalized == "zh-mo" || normalized == "zh-hant" ||
            normalized.hasPrefix("zh-tw-") || normalized.hasPrefix("zh-hk-") ||
            normalized.hasPrefix("zh-mo-") || normalized.hasPrefix("zh-hant-")
        {
            return "zh-TW"
        }
        if normalized == "zh-cn" || normalized == "zh-sg" || normalized == "zh-hans" ||
            normalized.hasPrefix("zh-cn-") || normalized.hasPrefix("zh-sg-") || normalized.hasPrefix("zh-hans-")
        {
            return "zh-CN"
        }
        if normalized == "pt-br" || normalized == "pt" || normalized.hasPrefix("pt-") {
            return "pt-BR"
        }
        if normalized == "de" || normalized.hasPrefix("de-") {
            return "de"
        }
        if normalized == "es" || normalized.hasPrefix("es-") {
            return "es"
        }

        if self.locales[normalized] != nil {
            return normalized
        }

        return self.fallbackLanguageID
    }

    public static func string(path: [String], localeID: String?, parameters: [String: String] = [:]) -> String? {
        guard let template = self.localizedValue(path: path, localeID: localeID)?.stringValue else {
            return nil
        }
        return self.interpolate(template, parameters: parameters)
    }

    public static func fallbackString(
        path: [String],
        localeID: String?,
        fallback: String,
        parameters: [String: String] = [:])
        -> String
    {
        self.string(path: path, localeID: localeID, parameters: parameters)
            ?? self.interpolate(fallback, parameters: parameters)
    }

    public static func object(path: [String], localeID: String?) -> [String: String]? {
        guard let value = self.localizedValue(path: path, localeID: localeID)?.objectValue else { return nil }
        return value.reduce(into: [:]) { result, entry in
            if let string = entry.value.stringValue {
                result[entry.key] = string
            }
        }
    }

    public static func interpolate(_ template: String, parameters: [String: String]) -> String {
        parameters.reduce(template) { partialResult, entry in
            partialResult.replacingOccurrences(of: "{\(entry.key)}", with: entry.value)
        }
    }

    private static func localizedValue(path: [String], localeID: String?) -> MaumauSharedLocalizationValue? {
        let resolved = self.normalizeLanguageID(localeID)
        if let localized = self.value(path: path, localeID: resolved) {
            return localized
        }
        guard resolved != self.fallbackLanguageID else { return nil }
        return self.value(path: path, localeID: self.fallbackLanguageID)
    }

    private static func value(path: [String], localeID: String) -> MaumauSharedLocalizationValue? {
        guard var current = self.locales[localeID] else { return nil }
        for part in path {
            guard let next = current.objectValue?[part] else { return nil }
            current = next
        }
        return current
    }

    private static func normalizeLanguageToken(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "_", with: "-")
            .lowercased()
    }

    private static func loadCatalog() -> MaumauSharedLocalizationCatalogFile {
        guard let url = MaumauKitResources.bundle.url(
            forResource: "localization-catalog",
            withExtension: "json"),
            let data = try? Data(contentsOf: url),
            let decoded = try? JSONDecoder().decode(MaumauSharedLocalizationCatalogFile.self, from: data)
        else {
            return MaumauSharedLocalizationCatalogFile(
                fallbackLanguageId: "en",
                languages: [])
        }
        return decoded
    }

    private static func loadLocales() -> [String: MaumauSharedLocalizationValue] {
        let knownLanguageIDs = Set(self.catalog.languages.map(\.id))
        let urls = MaumauKitResources.bundle.urls(
            forResourcesWithExtension: "json",
            subdirectory: nil) ?? []
        return urls.reduce(into: [:]) { result, url in
            let languageID = url.deletingPathExtension().lastPathComponent
            guard knownLanguageIDs.contains(languageID),
                  let data = try? Data(contentsOf: url),
                  let value = try? JSONDecoder().decode(MaumauSharedLocalizationValue.self, from: data)
            else {
                return
            }
            result[languageID] = value
        }
    }
}
