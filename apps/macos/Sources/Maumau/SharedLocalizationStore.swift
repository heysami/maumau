import Foundation
import MaumauKit

private enum SharedLocalizationValue: Codable, Sendable {
    case string(String)
    case object([String: SharedLocalizationValue])
    case array([SharedLocalizationValue])
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
        } else if let object = try? container.decode([String: SharedLocalizationValue].self) {
            self = .object(object)
        } else if let array = try? container.decode([SharedLocalizationValue].self) {
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

    var objectValue: [String: SharedLocalizationValue]? {
        guard case .object(let object) = self else { return nil }
        return object
    }
}

enum SharedLocalizationStore {
    private static let fallbackLanguageID = SharedLocalizationCatalog.fallbackLanguageID
    private static let locales: [String: SharedLocalizationValue] = loadLocales()
    private static let macExactKeys: [String: String] = buildMacExactKeys()

    static func interpolate(_ template: String, parameters: [String: String]) -> String {
        parameters.reduce(template) { partialResult, entry in
            partialResult.replacingOccurrences(of: "{\(entry.key)}", with: entry.value)
        }
    }

    static func string(path: [String], languageID: String, parameters: [String: String] = [:]) -> String? {
        guard let template = self.localizedValue(path: path, languageID: languageID)?.stringValue else {
            return nil
        }
        return self.interpolate(template, parameters: parameters)
    }

    static func decode<T: Decodable>(_ type: T.Type, path: [String], languageID: String) -> T? {
        guard let value = self.localizedValue(path: path, languageID: languageID),
              let data = try? JSONEncoder().encode(value)
        else {
            return nil
        }
        return try? JSONDecoder().decode(type, from: data)
    }

    static func macExactString(for english: String, languageID: String) -> String? {
        guard let key = self.macExactKeys[english] else { return nil }
        return self.string(path: ["mac", "exact", key], languageID: languageID)
    }

    private static func localizedValue(path: [String], languageID: String) -> SharedLocalizationValue? {
        if let localized = self.value(path: path, localeID: languageID) {
            return localized
        }
        guard languageID != self.fallbackLanguageID else { return nil }
        return self.value(path: path, localeID: self.fallbackLanguageID)
    }

    private static func value(path: [String], localeID: String) -> SharedLocalizationValue? {
        guard var current = self.locales[localeID] else { return nil }
        for part in path {
            guard let next = current.objectValue?[part] else { return nil }
            current = next
        }
        return current
    }

    private static func loadLocales() -> [String: SharedLocalizationValue] {
        let knownLanguageIDs = Set(SharedLocalizationCatalog.languageIDs)
        let urls = MaumauKitResources.bundle.urls(
            forResourcesWithExtension: "json",
            subdirectory: nil) ?? []
        return urls.reduce(into: [:]) { result, url in
            let languageID = url.deletingPathExtension().lastPathComponent
            guard knownLanguageIDs.contains(languageID),
                  let data = try? Data(contentsOf: url),
                  let value = try? JSONDecoder().decode(SharedLocalizationValue.self, from: data)
            else {
                return
            }
            result[languageID] = value
        }
    }

    private static func buildMacExactKeys() -> [String: String] {
        guard let exactStrings = self.locales[self.fallbackLanguageID]?
            .objectValue?["mac"]?
            .objectValue?["exact"]?
            .objectValue
        else {
            return [:]
        }

        return exactStrings.reduce(into: [:]) { result, entry in
            if let english = entry.value.stringValue {
                result[english] = entry.key
            }
        }
    }
}
