import Foundation

struct PluginsStatusReport: Codable {
    let workspaceDir: String?
    let plugins: [PluginStatusRecord]
    let diagnostics: [PluginDiagnosticRecord]
}

struct PluginDiagnosticRecord: Codable, Identifiable, Hashable {
    let level: String
    let message: String
    let pluginId: String?
    let source: String?

    var id: String {
        [self.pluginId, self.source, self.level, self.message]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .joined(separator: "|")
    }

    var levelLabel: String {
        self.level.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? macLocalized("Notice")
            : macLocalized(self.level.capitalized)
    }
}

struct PluginStatusRecord: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let version: String?
    let description: String?
    let format: String?
    let bundleFormat: String?
    let bundleCapabilities: [String]?
    let kind: String?
    let source: String
    let origin: String
    let workspaceDir: String?
    let enabled: Bool
    let status: String
    let error: String?
    let toolNames: [String]
    let hookNames: [String]
    let channelIds: [String]
    let providerIds: [String]
    let speechProviderIds: [String]
    let mediaUnderstandingProviderIds: [String]
    let imageGenerationProviderIds: [String]
    let webSearchProviderIds: [String]
    let gatewayMethods: [String]
    let cliCommands: [String]
    let services: [String]
    let commands: [String]
    let httpRoutes: Int
    let hookCount: Int
    let configSchema: Bool

    var displayName: String {
        let trimmed = self.name.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? self.id : trimmed
    }

    var statusLabel: String {
        switch self.status {
        case "loaded":
            macLocalized("Loaded")
        case "disabled":
            macLocalized("Disabled")
        case "error":
            macLocalized("Error")
        default:
            macLocalized(self.status.capitalized)
        }
    }

    var originLabel: String {
        switch self.origin {
        case "bundled":
            macLocalized("Bundled")
        case "global":
            macLocalized("Installed")
        case "workspace":
            macLocalized("Workspace")
        case "config":
            macLocalized("Config")
        default:
            macLocalized(self.origin.capitalized)
        }
    }

    var statusSortRank: Int {
        switch self.status {
        case "loaded":
            0
        case "disabled":
            1
        case "error":
            2
        default:
            3
        }
    }

    var configStateLabel: String {
        self.enabled ? macLocalized("Enabled in config") : macLocalized("Disabled in config")
    }
}
