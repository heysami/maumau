import MaumauProtocol
import SwiftUI
import Testing
@testable import Maumau

private typealias SnapshotAnyCodable = Maumau.AnyCodable

private let channelOrder = ["whatsapp", "telegram", "signal", "imessage"]
private let channelLabels = [
    "whatsapp": "WhatsApp",
    "telegram": "Telegram",
    "signal": "Signal",
    "imessage": "iMessage",
]
private let channelDefaultAccountId = [
    "whatsapp": "default",
    "telegram": "default",
    "signal": "default",
    "imessage": "default",
]

@MainActor
private func makeChannelsStore(
    channels: [String: SnapshotAnyCodable],
    ts: Double = 1_700_000_000_000) -> ChannelsStore
{
    let store = ChannelsStore(isPreview: true)
    store.snapshot = ChannelsStatusSnapshot(
        ts: ts,
        channelOrder: channelOrder,
        channelLabels: channelLabels,
        channelDetailLabels: nil,
        channelSystemImages: nil,
        channelMeta: nil,
        channels: channels,
        channelAccounts: [:],
        channelDefaultAccountId: channelDefaultAccountId)
    return store
}

@Suite(.serialized)
@MainActor
struct ChannelsSettingsSmokeTests {
    @Test func `channels settings falls back when channel order is empty`() {
        let store = ChannelsStore(isPreview: true)
        store.snapshot = ChannelsStatusSnapshot(
            ts: 1_700_000_000_000,
            channelOrder: [],
            channelLabels: [:],
            channelDetailLabels: nil,
            channelSystemImages: nil,
            channelMeta: nil,
            channels: [:],
            channelAccounts: [:],
            channelDefaultAccountId: [:])

        let view = ChannelsSettings(store: store)

        #expect(view.orderedChannels.isEmpty == false)
        #expect(view.orderedChannels.map(\.id).prefix(6) == ["whatsapp", "telegram", "discord", "imessage", "slack", "line"])
    }

    @Test func `channels settings appends built in channels when snapshot order is partial`() {
        let store = ChannelsStore(isPreview: true)
        store.snapshot = ChannelsStatusSnapshot(
            ts: 1_700_000_000_000,
            channelOrder: ["telegram"],
            channelLabels: ["telegram": "Telegram"],
            channelDetailLabels: nil,
            channelSystemImages: nil,
            channelMeta: nil,
            channels: [
                "telegram": SnapshotAnyCodable([
                    "configured": true,
                    "running": true,
                ]),
            ],
            channelAccounts: [:],
            channelDefaultAccountId: [:])

        let view = ChannelsSettings(store: store)

        #expect(view.enabledChannels.map(\.id) == ["telegram"])
        #expect(view.availableChannels.map(\.id).prefix(7) == [
            "whatsapp",
            "discord",
            "imessage",
            "slack",
            "line",
            "googlechat",
            "signal",
        ])
    }

    @Test func `channels settings builds body with snapshot`() {
        let store = makeChannelsStore(
            channels: [
                "whatsapp": SnapshotAnyCodable([
                    "configured": true,
                    "linked": true,
                    "authAgeMs": 86_400_000,
                    "self": ["e164": "+15551234567"],
                    "running": true,
                    "connected": false,
                    "lastConnectedAt": 1_700_000_000_000,
                    "lastDisconnect": [
                        "at": 1_700_000_050_000,
                        "status": 401,
                        "error": "logged out",
                        "loggedOut": true,
                    ],
                    "reconnectAttempts": 2,
                    "lastMessageAt": 1_700_000_060_000,
                    "lastEventAt": 1_700_000_060_000,
                    "lastError": "needs login",
                ]),
                "telegram": SnapshotAnyCodable([
                    "configured": true,
                    "tokenSource": "env",
                    "running": true,
                    "mode": "polling",
                    "lastStartAt": 1_700_000_000_000,
                    "probe": [
                        "ok": true,
                        "status": 200,
                        "elapsedMs": 120,
                        "bot": ["id": 123, "username": "maumaubot"],
                        "webhook": ["url": "https://example.com/hook", "hasCustomCert": false],
                    ],
                    "lastProbeAt": 1_700_000_050_000,
                ]),
                "signal": SnapshotAnyCodable([
                    "configured": true,
                    "baseUrl": "http://127.0.0.1:8080",
                    "running": true,
                    "lastStartAt": 1_700_000_000_000,
                    "probe": [
                        "ok": true,
                        "status": 200,
                        "elapsedMs": 140,
                        "version": "0.12.4",
                    ],
                    "lastProbeAt": 1_700_000_050_000,
                ]),
                "imessage": SnapshotAnyCodable([
                    "configured": false,
                    "running": false,
                    "lastError": "not configured",
                    "probe": ["ok": false, "error": "imsg not found (imsg)"],
                    "lastProbeAt": 1_700_000_050_000,
                ]),
            ])

        store.whatsappLoginMessage = "Scan QR"
        store.whatsappLoginQrDataUrl =
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/ay7pS8AAAAASUVORK5CYII="

        let view = ChannelsSettings(store: store)
        _ = view.body
    }

    @Test func `channels settings builds body without snapshot`() {
        let store = makeChannelsStore(
            channels: [
                "whatsapp": SnapshotAnyCodable([
                    "configured": false,
                    "linked": false,
                    "running": false,
                    "connected": false,
                    "reconnectAttempts": 0,
                ]),
                "telegram": SnapshotAnyCodable([
                    "configured": false,
                    "running": false,
                    "lastError": "bot missing",
                    "probe": [
                        "ok": false,
                        "status": 403,
                        "error": "unauthorized",
                        "elapsedMs": 120,
                    ],
                    "lastProbeAt": 1_700_000_100_000,
                ]),
                "signal": SnapshotAnyCodable([
                    "configured": false,
                    "baseUrl": "http://127.0.0.1:8080",
                    "running": false,
                    "lastError": "not configured",
                    "probe": [
                        "ok": false,
                        "status": 404,
                        "error": "unreachable",
                        "elapsedMs": 200,
                    ],
                    "lastProbeAt": 1_700_000_200_000,
                ]),
                "imessage": SnapshotAnyCodable([
                    "configured": false,
                    "running": false,
                    "lastError": "not configured",
                    "cliPath": "imsg",
                    "probe": ["ok": false, "error": "imsg not found (imsg)"],
                    "lastProbeAt": 1_700_000_200_000,
                ]),
            ])

        let view = ChannelsSettings(store: store)
        _ = view.body
    }

    @Test func `channels onboarding setup sections build without full config editor`() {
        let store = makeChannelsStore(
            channels: [
                "whatsapp": SnapshotAnyCodable([
                    "configured": false,
                    "linked": false,
                    "running": false,
                    "connected": false,
                ]),
                "telegram": SnapshotAnyCodable([
                    "configured": false,
                    "running": false,
                ]),
                "discord": SnapshotAnyCodable([
                    "configured": false,
                    "running": false,
                ]),
                "slack": SnapshotAnyCodable([
                    "configured": false,
                    "running": false,
                ]),
                "line": SnapshotAnyCodable([
                    "configured": false,
                    "running": false,
                ]),
                "imessage": SnapshotAnyCodable([
                    "configured": false,
                    "running": false,
                ]),
            ])
        store.whatsappLoginMessage = "Scan QR"

        let view = ChannelsSettings(store: store)
        let whatsapp = view.orderedChannels.first { $0.id == "whatsapp" }
        let telegram = view.orderedChannels.first { $0.id == "telegram" }
        let discord = view.onboardingOrderedChannels.first { $0.id == "discord" }
        let slack = view.onboardingOrderedChannels.first { $0.id == "slack" }
        let line = view.onboardingOrderedChannels.first { $0.id == "line" }
        let imessage = view.onboardingOrderedChannels.first { $0.id == "imessage" }

        #expect(whatsapp != nil)
        #expect(telegram != nil)
        #expect(discord != nil)
        #expect(slack != nil)
        #expect(line != nil)
        #expect(imessage != nil)

        if let whatsapp {
            _ = view.onboardingChannelSetupSection(whatsapp)
        }
        if let telegram {
            _ = view.onboardingChannelSetupSection(telegram)
        }
        if let discord {
            _ = view.onboardingChannelSetupSection(discord)
        }
        if let slack {
            _ = view.onboardingChannelSetupSection(slack)
        }
        if let line {
            _ = view.onboardingChannelSetupSection(line)
        }
        if let imessage {
            _ = view.onboardingChannelSetupSection(imessage)
        }
    }

    @Test func `onboarding channels use the setup focused first run list`() {
        let store = makeChannelsStore(
            channels: [
                "whatsapp": SnapshotAnyCodable([
                    "configured": false,
                    "linked": false,
                    "running": false,
                    "connected": false,
                ]),
                "telegram": SnapshotAnyCodable([
                    "configured": false,
                    "running": false,
                ]),
                "signal": SnapshotAnyCodable([
                    "configured": false,
                    "running": false,
                ]),
            ])

        let view = ChannelsSettings(store: store)
        let ids = view.onboardingOrderedChannels.map(\.id)

        #expect(ids == ["whatsapp", "telegram", "discord", "imessage", "slack", "line"])
        #expect(ids.contains("googlechat") == false)
        #expect(ids.contains("signal") == false)
        #expect(ids.contains("irc") == false)
    }

    @Test func `whatsapp guidance explains dedicated identity setup clearly`() {
        let store = makeChannelsStore(
            channels: [
                "whatsapp": SnapshotAnyCodable([
                    "configured": true,
                    "linked": true,
                    "self": ["e164": "+15551234567"],
                    "running": true,
                    "connected": true,
                    "reconnectAttempts": 0,
                ]),
            ])

        let view = ChannelsSettings(store: store)
        let identity = view.channelIdentityExplanation(channelId: "whatsapp")
        let requirements = view.channelRequirements(channelId: "whatsapp")
        let steps = view.channelSetupSteps(channelId: "whatsapp")
        let artifacts = view.channelArtifacts(channelId: "whatsapp")
        let links = view.channelQuickLinks(channelId: "whatsapp")

        #expect(identity.contains("agent identity"))
        #expect(requirements.contains(where: { $0.contains("WhatsApp Business") }))
        #expect(requirements.contains(where: { $0.contains("cannot create or buy the number") }))
        #expect(steps.contains(where: { $0.contains("Settings > Linked Devices > Link a device") }))
        #expect(artifacts.contains(where: { $0.contains("+1 555 123 4567") }))
        #expect(links.contains(where: { $0.url.contains("faq.whatsapp.com") }))
    }

    @Test func `telegram guidance explains botfather token and bot usage`() {
        let store = makeChannelsStore(
            channels: [
                "telegram": SnapshotAnyCodable([
                    "configured": true,
                    "running": true,
                ]),
            ])

        let view = ChannelsSettings(store: store)
        let identity = view.channelIdentityExplanation(channelId: "telegram")
        let requirements = view.channelRequirements(channelId: "telegram")
        let steps = view.channelSetupSteps(channelId: "telegram")
        let artifacts = view.channelArtifacts(channelId: "telegram")

        #expect(identity.contains("Telegram bot"))
        #expect(requirements.contains(where: { $0.contains("@BotFather") }))
        #expect(steps.contains(where: { $0.contains("/newbot") }))
        #expect(artifacts.contains(where: { $0.contains("1234567890:AAExampleTelegramBotToken") }))
    }

    @Test func `inline onboarding channel list stays aligned with seamless quick setup defaults`() {
        let store = makeChannelsStore(channels: [:])
        let view = ChannelsSettings(store: store)

        #expect(ChannelsStore.inlineOnboardingChannelIDs == [
            "whatsapp",
            "telegram",
            "discord",
            "imessage",
            "slack",
            "line",
        ])
        #expect(view.onboardingOrderedChannels.map(\.id) == ChannelsStore.inlineOnboardingChannelIDs)

        for channelId in ChannelsStore.inlineOnboardingChannelIDs {
            #expect(view.supportsInlineOnboardingSetup(channelId))
        }
        #expect(view.supportsInlineOnboardingSetup("signal") == false)
    }

    @Test func `quick setup opens dm access for seamless onboarding channels when policy is unset`() {
        let cases: [(channelId: String, updates: [(path: ConfigPath, value: Any?)])] = [
            (
                channelId: "telegram",
                updates: [
                    (
                        path: [.key("channels"), .key("telegram"), .key("botToken")],
                        value: "1234567890:AAExampleTelegramBotToken",
                    ),
                ]
            ),
            (
                channelId: "discord",
                updates: [
                    (
                        path: [.key("channels"), .key("discord"), .key("token")],
                        value: "discord-token",
                    ),
                ]
            ),
            (
                channelId: "slack",
                updates: [
                    (
                        path: [.key("channels"), .key("slack"), .key("botToken")],
                        value: "xoxb-example",
                    ),
                ]
            ),
            (
                channelId: "line",
                updates: [
                    (
                        path: [.key("channels"), .key("line"), .key("channelAccessToken")],
                        value: "line-access-token",
                    ),
                ]
            ),
            (
                channelId: "imessage",
                updates: [
                    (
                        path: [.key("channels"), .key("imessage"), .key("cliPath")],
                        value: "imsg",
                    ),
                ]
            ),
            (
                channelId: "whatsapp",
                updates: []
            ),
        ]

        for testCase in cases {
            let store = makeChannelsStore(channels: [:])
            store.configDraft = [:]
            store.configLoaded = true

            let dmPolicyPath: ConfigPath = [.key("channels"), .key(testCase.channelId), .key("dmPolicy")]
            let allowFromPath: ConfigPath = [.key("channels"), .key(testCase.channelId), .key("allowFrom")]
            let merged = store.mergedQuickSetupUpdates(
                channelId: testCase.channelId,
                testCase.updates)

            for expected in testCase.updates {
                #expect(merged.contains(where: { $0.path == expected.path }))
            }
            #expect(merged.contains(where: { $0.path == dmPolicyPath && ($0.value as? String) == "open" }))
            #expect(merged.contains(where: {
                $0.path == allowFromPath &&
                (($0.value as? [String]) ?? []).contains("*")
            }))
        }
    }

    @Test func `quick setup preserves explicit dm access config`() {
        let store = makeChannelsStore(channels: [:])
        store.configDraft = [
            "channels": [
                "telegram": [
                    "dmPolicy": "pairing",
                ],
            ],
        ]
        store.configLoaded = true

        let botTokenPath: ConfigPath = [.key("channels"), .key("telegram"), .key("botToken")]
        let dmPolicyPath: ConfigPath = [.key("channels"), .key("telegram"), .key("dmPolicy")]
        let allowFromPath: ConfigPath = [.key("channels"), .key("telegram"), .key("allowFrom")]
        let updates = store.mergedQuickSetupUpdates(
            channelId: "telegram",
            [(path: botTokenPath, value: "1234567890:AAExampleTelegramBotToken")])

        #expect(updates.count == 1)
        #expect(!updates.contains(where: { $0.path == dmPolicyPath }))
        #expect(!updates.contains(where: { $0.path == allowFromPath }))
    }

    @Test func `imessage guidance explains separate identity expectations`() {
        let store = makeChannelsStore(
            channels: [
                "imessage": SnapshotAnyCodable([
                    "configured": false,
                    "running": false,
                ]),
            ])

        let view = ChannelsSettings(store: store)
        let identity = view.channelIdentityExplanation(channelId: "imessage")
        let requirements = view.channelRequirements(channelId: "imessage")
        let steps = view.channelSetupSteps(channelId: "imessage")
        let artifacts = view.channelArtifacts(channelId: "imessage")

        #expect(identity.contains("Messages account signed into this Mac"))
        #expect(requirements.contains(where: { $0.contains("dedicated Apple Account") }))
        #expect(steps.contains(where: { $0.contains("Messages > Settings > iMessage") }))
        #expect(artifacts.contains(where: { $0.contains("agent@example.com") }))
    }

    @Test func `slack guidance explains both tokens and socket mode`() {
        let store = makeChannelsStore(channels: [:])
        let view = ChannelsSettings(store: store)
        let requirements = view.channelRequirements(channelId: "slack")
        let steps = view.channelSetupSteps(channelId: "slack")
        let artifacts = view.channelArtifacts(channelId: "slack")

        #expect(requirements.contains(where: { $0.contains("api.slack.com/apps") }))
        #expect(steps.contains(where: { $0.contains("Socket Mode") }))
        #expect(artifacts.contains(where: { $0.contains("xoxb-") }))
        #expect(artifacts.contains(where: { $0.contains("xapp-") }))
    }

    @Test func `line guidance explains official account console and webhook`() {
        let store = makeChannelsStore(channels: [:])
        let view = ChannelsSettings(store: store)
        let requirements = view.channelRequirements(channelId: "line")
        let steps = view.channelSetupSteps(channelId: "line")
        let artifacts = view.channelArtifacts(channelId: "line")

        #expect(requirements.contains(where: { $0.contains("LINE Official Account") }))
        #expect(steps.contains(where: { $0.contains("developers.line.biz/console") }))
        #expect(steps.contains(where: { $0.contains("webhook") }))
        #expect(artifacts.contains(where: { $0.contains("Channel access token") }))
    }

    @Test func `whatsapp identity helpers describe empty qr and linked states`() {
        #expect(ChannelsSettings.whatsAppIdentityBadgeText(linkedIdentity: nil, qrVisible: false) == "Not linked")
        #expect(ChannelsSettings.whatsAppIdentityBadgeText(linkedIdentity: nil, qrVisible: true) == "Waiting for scan")
        #expect(
            ChannelsSettings.whatsAppIdentityHeadline(linkedIdentity: "+15551234567") == "+15551234567")
        #expect(
            ChannelsSettings.whatsAppIdentityBodyText(linkedIdentity: nil, qrVisible: true)
                .contains("Scan the QR"))
        #expect(
            ChannelsSettings.whatsAppIdentityBodyText(linkedIdentity: "+15551234567", qrVisible: false)
                .contains("bot identity"))
    }
}
