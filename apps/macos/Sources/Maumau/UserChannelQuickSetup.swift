import Foundation
import MaumauKit

struct UserChannelQuickSetupLink: Decodable {
    let title: String
    let url: String
}

struct UserChannelQuickSetupGuidance: Decodable {
    let identity: String
    let requirements: [String]
    let setupSteps: [String]
    let artifacts: [String]
    let usage: String?
    let quickLinks: [UserChannelQuickSetupLink]?
}

struct UserChannelQuickSetupField: Decodable {
    let key: String
    let label: String
    let placeholder: String?
    let required: Bool
    let secret: Bool?
    let helpLines: [String]?
}

struct UserChannelQuickSetupCard: Decodable {
    let kind: String
    let sectionTitle: String
    let title: String
    let emptyHeadline: String
    let emptyMessage: String
    let emptyBadge: String
    let buttonTitle: String?
    let existingCredentialNote: String?
    let setupNote: String
    let successMessage: String?
    let waitingBadge: String?
    let waitingMessage: String?
    let linkedBadge: String?
    let qrTitle: String?
    let qrBody: String?
    let pickerSummary: String?
}

struct UserChannelQuickSetupEntry: Decodable {
    let guidance: UserChannelQuickSetupGuidance
    let quickSetup: UserChannelQuickSetupCard
    let fields: [UserChannelQuickSetupField]
}

private struct UserChannelQuickSetupConfig: Decodable {
    let version: Int
    let channelOrder: [String]
    let settingsNote: String
    let channels: [String: UserChannelQuickSetupEntry]
}

enum UserChannelQuickSetupRegistry {
    private static let defaultConfig = Self.loadConfig(resourceName: "user-channel-quick-setup")
    private static let indonesianConfig = Self.loadConfig(resourceName: "user-channel-quick-setup.id")
    private static let fallbackChannelOrder = [
        "whatsapp",
        "telegram",
        "discord",
        "imessage",
        "slack",
        "line",
    ]

    static var channelOrder: [String] {
        let ids = self.defaultConfig?.channelOrder ?? []
        return ids.isEmpty ? self.fallbackChannelOrder : ids
    }

    static var settingsNote: String {
        self.settingsNote(language: .fallback)
    }

    static func settingsNote(language: OnboardingLanguage = .fallback) -> String {
        self.config(for: language)?.settingsNote
            ?? self.defaultConfig?.settingsNote
            ?? "More channels and advanced channel settings live in Settings → Channels."
    }

    static func entry(
        for channelId: String,
        language: OnboardingLanguage = .fallback
    ) -> UserChannelQuickSetupEntry? {
        self.config(for: language)?.channels[channelId]
            ?? self.defaultConfig?.channels[channelId]
    }

    private static func config(for language: OnboardingLanguage) -> UserChannelQuickSetupConfig? {
        switch language {
        case .id:
            self.indonesianConfig ?? self.defaultConfig
        default:
            self.defaultConfig
        }
    }

    private static func loadConfig(resourceName: String) -> UserChannelQuickSetupConfig? {
        guard let url = MaumauKitResources.bundle.url(
            forResource: resourceName,
            withExtension: "json")
        else {
            return nil
        }
        do {
            let data = try Data(contentsOf: url)
            return try JSONDecoder().decode(UserChannelQuickSetupConfig.self, from: data)
        } catch {
            return nil
        }
    }
}
