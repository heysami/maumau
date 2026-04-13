import Foundation

extension ChannelsSettings {
    struct ChannelGuidanceLink {
        let title: String
        let url: String
    }

    struct ChannelGuidanceCopy {
        let identity: String
        let requirements: [String]
        let setupSteps: [String]
        let artifacts: [String]
        let usage: String
        let quickLinks: [ChannelGuidanceLink]
    }

    func channelGuidanceCopy(channelId: String) -> ChannelGuidanceCopy {
        if let shared = UserChannelQuickSetupRegistry.entry(for: channelId, language: self.language) {
            return self.localizedGuidanceCopy(
                ChannelGuidanceCopy(
                    identity: shared.guidance.identity,
                    requirements: shared.guidance.requirements,
                    setupSteps: shared.guidance.setupSteps,
                    artifacts: shared.guidance.artifacts,
                    usage: shared.guidance.usage ?? "People talk to that connected identity in the service itself, and the agent replies there.",
                    quickLinks: (shared.guidance.quickLinks ?? []).map {
                        ChannelGuidanceLink(title: $0.title, url: $0.url)
                    }))
        }
        let copy: ChannelGuidanceCopy
        switch channelId {
        case "googlechat":
            copy = ChannelGuidanceCopy(
                identity: "A Google Chat app or webhook integration becomes the agent identity.",
                requirements: [
                    "The Google Chat app or webhook credentials that belong to the space or app you want Maumau to use.",
                ],
                setupSteps: [
                    "Create or open the Google Chat app or webhook configuration outside Maumau.",
                    "Copy the service account or webhook details for that app.",
                    "Paste those credentials into Maumau to connect the chat app.",
                ],
                artifacts: [
                    "What you paste here: the Google Chat app credentials or webhook details for that integration.",
                ],
                usage: "People talk to the Google Chat app in DMs or spaces, and the agent replies there.",
                quickLinks: [])
        case "signal":
            copy = ChannelGuidanceCopy(
                identity: "A Signal number or linked device becomes the agent identity.",
                requirements: [
                    "A Signal account the agent will use.",
                    "For a separate identity, set up a dedicated number or dedicated linked device first.",
                ],
                setupSteps: [
                    "Set up the Signal account outside Maumau first.",
                    "Register or link that account through signal-cli so Maumau can use it.",
                ],
                artifacts: [
                    "What gets linked here: the Signal account or device the agent will use.",
                ],
                usage: "People message that Signal account from normal Signal clients, and the agent replies there.",
                quickLinks: [])
        default:
            copy = ChannelGuidanceCopy(
                identity: "A connected bot, app, account, or device becomes the agent identity in that service.",
                requirements: [
                    "The outside account, app, token, or device that Maumau should use in that service.",
                ],
                setupSteps: [
                    "Create or prepare the service-specific account, bot, app, or device outside Maumau first.",
                    "Copy the credentials or link information that service gives you.",
                    "Paste or link that identity in Maumau.",
                ],
                artifacts: [
                    "What you paste or link here depends on the service: a token, webhook secret, account, or device.",
                ],
                usage: "People talk to that connected identity in the service itself, and the agent replies there.",
                quickLinks: [])
        }
        return self.localizedGuidanceCopy(copy)
    }

    private func localizedGuidanceCopy(_ copy: ChannelGuidanceCopy) -> ChannelGuidanceCopy {
        guard self.language == .id else { return copy }
        return ChannelGuidanceCopy(
            identity: self.loc(copy.identity),
            requirements: copy.requirements.map(self.loc),
            setupSteps: copy.setupSteps.map(self.loc),
            artifacts: copy.artifacts.map(self.loc),
            usage: self.loc(copy.usage),
            quickLinks: copy.quickLinks.map { link in
                ChannelGuidanceLink(title: self.loc(link.title), url: link.url)
            })
    }

    func channelRequirements(channelId: String) -> [String] {
        self.channelGuidanceCopy(channelId: channelId).requirements
    }

    func channelSetupSteps(channelId: String) -> [String] {
        self.channelGuidanceCopy(channelId: channelId).setupSteps
    }

    func channelArtifacts(channelId: String) -> [String] {
        self.channelGuidanceCopy(channelId: channelId).artifacts
    }

    func channelQuickLinks(channelId: String) -> [ChannelGuidanceLink] {
        self.channelGuidanceCopy(channelId: channelId).quickLinks
    }

    func channelPreparationExplanation(channelId: String) -> String {
        self.channelRequirements(channelId: channelId).joined(separator: " ")
    }

    func channelSetupExplanation(channelId: String) -> String {
        self.channelSetupSteps(channelId: channelId).joined(separator: " ")
    }

    func channelUsageExplanation(channelId: String) -> String {
        self.channelGuidanceCopy(channelId: channelId).usage
    }

    func channelIdentityExplanation(channelId: String) -> String {
        self.channelGuidanceCopy(channelId: channelId).identity
    }

    func channelCombinedExplanation(channelId: String) -> String {
        let copy = self.channelGuidanceCopy(channelId: channelId)
        return [
            copy.identity,
            copy.requirements.joined(separator: " "),
            copy.setupSteps.joined(separator: " "),
            copy.artifacts.joined(separator: " "),
            copy.usage,
        ].joined(separator: " ")
    }

    func channelIdentityExplanation(_ channel: ChannelItem) -> String {
        self.channelCombinedExplanation(channelId: channel.id)
    }
}
