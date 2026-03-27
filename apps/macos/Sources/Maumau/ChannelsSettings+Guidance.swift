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
        switch channelId {
        case "whatsapp":
            return ChannelGuidanceCopy(
                identity: "A WhatsApp number or linked device becomes the agent identity.",
                requirements: [
                    "A phone number or WhatsApp account that will belong to the agent.",
                    "WhatsApp or WhatsApp Business installed and fully signed in on that phone.",
                    "For a separate agent identity, use a dedicated number or dedicated linked device. Maumau cannot create or buy the number for you.",
                ],
                setupSteps: [
                    "On the phone the agent will use, finish WhatsApp setup first and wait until it can send and receive messages normally.",
                    "Open WhatsApp on that phone and go to Settings > Linked Devices > Link a device.",
                    "Back in Maumau, press Link WhatsApp to show the QR code, then scan it with that phone.",
                    "Wait for the link to finish. The number shown in Maumau becomes the number people message to reach the agent.",
                ],
                artifacts: [
                    "What gets linked here: the agent's WhatsApp number, for example +1 555 123 4567.",
                    "You do not paste a token for WhatsApp. You link the real WhatsApp account by scanning the QR.",
                ],
                usage: "People message that WhatsApp number from their normal WhatsApp accounts, and the agent replies in the same chat.",
                quickLinks: [
                    ChannelGuidanceLink(
                        title: "Download WhatsApp",
                        url: "https://www.whatsapp.com/download/"),
                    ChannelGuidanceLink(
                        title: "WhatsApp linked devices help",
                        url: "https://faq.whatsapp.com/1317564962315842/"),
                ])
        case "telegram":
            return ChannelGuidanceCopy(
                identity: "A Telegram bot becomes the agent identity.",
                requirements: [
                    "A normal Telegram account on the Telegram app, desktop app, or web app.",
                    "Access to @BotFather, which is Telegram's official bot for creating and managing bots.",
                ],
                setupSteps: [
                    "Open Telegram, search for @BotFather, and press Start.",
                    "Send /newbot, then follow BotFather's prompts for the bot name and the username.",
                    "Choose a username that ends in bot, then wait for BotFather to send back the bot token.",
                    "Copy the token from the BotFather chat and paste it into Maumau.",
                ],
                artifacts: [
                    "What you paste here: the Telegram bot token, for example 1234567890:AAExampleTelegramBotToken.",
                    "What people will message later: the bot handle, for example @youragentbot.",
                ],
                usage: "People message the bot handle or add it to Telegram chats, and replies come back from that bot.",
                quickLinks: [
                    ChannelGuidanceLink(title: "Telegram apps", url: "https://telegram.org/apps"),
                    ChannelGuidanceLink(title: "Open BotFather", url: "https://t.me/BotFather"),
                    ChannelGuidanceLink(
                        title: "Telegram bot docs",
                        url: "https://core.telegram.org/bots#how-do-i-create-a-bot"),
                ])
        case "discord":
            return ChannelGuidanceCopy(
                identity: "A Discord bot application becomes the agent identity.",
                requirements: [
                    "A Discord account.",
                    "Access to the Discord Developer Portal and to the server where you want to install the bot.",
                ],
                setupSteps: [
                    "Go to discord.com/developers/applications and click New Application.",
                    "Open the Bot tab in the left sidebar, click Add Bot, and copy the bot token from that page.",
                    "Open the Installation page, keep the bot install enabled, then use the install link to add the bot to your server or user account.",
                    "Once the bot appears in Discord, paste the bot token into Maumau.",
                ],
                artifacts: [
                    "What you paste here: the Discord bot token copied from the Bot page in Developer Portal.",
                    "What people will see later: the bot's application name and bot username inside Discord.",
                ],
                usage: "People DM the bot or talk to it in allowed Discord servers and channels, and the agent replies there.",
                quickLinks: [
                    ChannelGuidanceLink(
                        title: "Discord Developer Portal",
                        url: "https://discord.com/developers/applications"),
                    ChannelGuidanceLink(
                        title: "Discord getting started",
                        url: "https://docs.discord.com/developers/docs/getting-started"),
                ])
        case "googlechat":
            return ChannelGuidanceCopy(
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
        case "slack":
            return ChannelGuidanceCopy(
                identity: "A Slack app inside a workspace becomes the agent identity.",
                requirements: [
                    "A Slack workspace where you can create and install apps.",
                    "Access to api.slack.com/apps so you can create the app and generate both tokens Maumau needs.",
                ],
                setupSteps: [
                    "Go to api.slack.com/apps and click Create New App, then choose the workspace for the agent.",
                    "In the app settings, open Socket Mode, turn it on, and generate an app-level token.",
                    "Under OAuth & Permissions, install the app to the workspace and copy the Bot User OAuth Token.",
                    "If you want direct messages and mentions to work cleanly, also enable the Messages tab in App Home and the events Maumau needs in Event Subscriptions.",
                    "Paste both the bot token and the app token into Maumau.",
                ],
                artifacts: [
                    "What you paste here: the bot token xoxb-... and the app token xapp-....",
                    "What people will message later: the Slack app in DMs or mentions inside the workspace.",
                ],
                usage: "People DM the Slack app or mention it in channels where it is installed, and the agent replies in Slack.",
                quickLinks: [
                    ChannelGuidanceLink(title: "Create Slack app", url: "https://api.slack.com/apps"),
                    ChannelGuidanceLink(
                        title: "Slack Socket Mode guide",
                        url: "https://docs.slack.dev/apis/events-api/using-socket-mode/"),
                    ChannelGuidanceLink(
                        title: "Slack token types",
                        url: "https://docs.slack.dev/authentication/tokens/"),
                ])
        case "signal":
            return ChannelGuidanceCopy(
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
        case "imessage":
            return ChannelGuidanceCopy(
                identity: "The Messages account signed into this Mac becomes the agent identity.",
                requirements: [
                    "A Mac where Messages works normally.",
                    "The Apple Account, email address, or phone number that should become the agent identity.",
                    "For a separate identity, use a dedicated Apple Account or a separate macOS user signed into Messages.",
                ],
                setupSteps: [
                    "If you need a separate identity, create it first at account.apple.com.",
                    "On the Mac the agent will use, open Messages and sign in with that Apple Account.",
                    "In Messages > Settings > iMessage, choose the email address or phone number people should see for new conversations and wait for activation to complete.",
                    "Back in Maumau, point the channel at imsg on this Mac and grant any requested macOS permissions.",
                ],
                artifacts: [
                    "What gets linked here: the Messages identity on this Mac, for example agent@example.com or +1 555 123 4567.",
                    "There is no bot token for iMessage. Maumau uses the Messages account already signed into the Mac.",
                ],
                usage: "People message that Messages account as usual, and the agent replies inside those iMessage conversations.",
                quickLinks: [
                    ChannelGuidanceLink(title: "Create Apple Account", url: "https://account.apple.com/"),
                    ChannelGuidanceLink(
                        title: "Set up Messages on Mac",
                        url: "https://support.apple.com/guide/messages/set-up-messages-on-mac-ichte16154fb/mac"),
                ])
        case "line":
            return ChannelGuidanceCopy(
                identity: "A LINE Messaging API bot becomes the agent identity.",
                requirements: [
                    "A LINE Official Account and a Messaging API channel.",
                    "Access to the LINE Official Account Manager and the LINE Developers Console.",
                ],
                setupSteps: [
                    "Create the LINE Official Account first. If you do not have one yet, start from account.line.biz and finish the Business ID and entry form steps.",
                    "In LINE Official Account Manager, enable the Messaging API for that account.",
                    "Open developers.line.biz/console, select the provider, and open the new Messaging API channel.",
                    "Copy the Channel secret, then issue or copy the Channel access token.",
                    "Set the webhook URL for the channel to your Maumau gateway and use the Verify button in the LINE Developers Console to test it.",
                    "Paste the Channel access token and Channel secret into Maumau.",
                ],
                artifacts: [
                    "What you paste here: the LINE Channel access token and Channel secret from the Messaging API channel.",
                    "What people will message later: the LINE Official Account that owns that Messaging API channel.",
                ],
                usage: "People message that LINE bot, and the agent replies there.",
                quickLinks: [
                    ChannelGuidanceLink(
                        title: "LINE Messaging API getting started",
                        url: "https://developers.line.biz/en/docs/messaging-api/getting-started/"),
                    ChannelGuidanceLink(
                        title: "LINE Developers Console",
                        url: "https://developers.line.biz/console/"),
                    ChannelGuidanceLink(
                        title: "LINE webhook verification",
                        url: "https://developers.line.biz/en/docs/messaging-api/verify-webhook-url/"),
                ])
        default:
            return ChannelGuidanceCopy(
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
