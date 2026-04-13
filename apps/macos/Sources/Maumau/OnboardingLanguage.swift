import Foundation

enum OnboardingLanguage: String, CaseIterable, Codable, Sendable {
    case en
    case id
    case zhCN = "zh-CN"
    case ms
    case th
    case vi
    case fil
    case my
    case jv
    case su
    case btk
    case min
    case ban
    case bug
    case mak
    case minahasa
    case mad

    static let fallback: Self = Self(rawValue: SharedLocalizationCatalog.fallbackLanguageID) ?? .en

    static var allCases: [Self] {
        let configured = SharedLocalizationCatalog.visibleMacLanguageIDs.compactMap(Self.init(rawValue:))
        return configured.isEmpty ? [.en, .id] : configured
    }

    static func loadSelection(from rawValue: String?) -> Self? {
        guard let rawValue else { return nil }
        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        if let exact = Self(rawValue: trimmed) {
            return exact
        }
        return Self.allCases.first(where: { $0.rawValue.caseInsensitiveCompare(trimmed) == .orderedSame })
    }

    var displayName: String {
        SharedLocalizationCatalog.metadata(for: self.rawValue)?.englishName ?? self.nativeName
    }

    var nativeName: String {
        SharedLocalizationCatalog.metadata(for: self.rawValue)?.nativeName ?? self.rawValue
    }

    var replyLanguageID: String {
        SharedLocalizationCatalog.metadata(for: self.rawValue)?.id ?? self.rawValue
    }

    var controlUILocaleID: String {
        self.replyLanguageID
    }
}
