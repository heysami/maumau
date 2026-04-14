import Foundation
import MaumauKit

struct SharedLanguageCatalogEntry: Decodable, Sendable {
    let id: String
    let englishName: String
    let nativeName: String
    let uiLabelKey: String
    let rolloutOrder: Int
    let dashboardEnabled: Bool
    let dashboardVisible: Bool
    let macEnabled: Bool
    let macVisible: Bool
    let replyEnabled: Bool
}

private struct SharedLocalizationCatalogFile: Decodable, Sendable {
    let defaultLanguageId: String
    let fallbackLanguageId: String
    let languages: [SharedLanguageCatalogEntry]
}

enum SharedLocalizationCatalog {
    private static let loaded: SharedLocalizationCatalogFile = loadCatalog()

    static var defaultLanguageID: String {
        self.loaded.defaultLanguageId
    }

    static var fallbackLanguageID: String {
        self.loaded.fallbackLanguageId
    }

    static var visibleMacLanguageIDs: [String] {
        self.loaded.languages
            .filter(\.macVisible)
            .sorted { lhs, rhs in lhs.rolloutOrder == rhs.rolloutOrder ? lhs.id < rhs.id : lhs.rolloutOrder < rhs.rolloutOrder }
            .map(\.id)
    }

    static var languageIDs: [String] {
        self.loaded.languages.map(\.id)
    }

    static func metadata(for id: String) -> SharedLanguageCatalogEntry? {
        self.loaded.languages.first(where: { $0.id == id })
    }

    private static func loadCatalog() -> SharedLocalizationCatalogFile {
        guard let url = MaumauKitResources.bundle.url(
            forResource: "localization-catalog",
            withExtension: "json")
        else {
            return SharedLocalizationCatalogFile(
                defaultLanguageId: "en",
                fallbackLanguageId: "en",
                languages: [])
        }

        do {
            let data = try Data(contentsOf: url)
            return try JSONDecoder().decode(SharedLocalizationCatalogFile.self, from: data)
        } catch {
            return SharedLocalizationCatalogFile(
                defaultLanguageId: "en",
                fallbackLanguageId: "en",
                languages: [])
        }
    }
}
