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
    private static let config = Self.loadConfig()
    private static let fallbackChannelOrder = [
        "whatsapp",
        "telegram",
        "discord",
        "imessage",
        "slack",
        "line",
    ]

    static var channelOrder: [String] {
        let ids = self.config?.channelOrder ?? []
        return ids.isEmpty ? self.fallbackChannelOrder : ids
    }

    static var settingsNote: String {
        self.config?.settingsNote ?? "More channels and advanced channel settings live in Settings → Channels."
    }

    static func entry(for channelId: String) -> UserChannelQuickSetupEntry? {
        self.config?.channels[channelId]
    }

    private static func loadConfig() -> UserChannelQuickSetupConfig? {
        guard let url = MaumauKitResources.bundle.url(
            forResource: "user-channel-quick-setup",
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
