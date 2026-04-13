import Foundation
import Testing
@testable import MaumauKit

struct SharedLocalizationTests {
    @Test func normalizesKnownLanguageAliases() {
        #expect(MaumauSharedLocalization.normalizeLanguageID(nil) == "en")
        #expect(MaumauSharedLocalization.normalizeLanguageID("th-TH") == "th")
        #expect(MaumauSharedLocalization.normalizeLanguageID("tl-PH") == "fil")
        #expect(MaumauSharedLocalization.normalizeLanguageID("zh-HK") == "zh-TW")
        #expect(MaumauSharedLocalization.normalizeLanguageID("zh-SG") == "zh-CN")
        #expect(MaumauSharedLocalization.normalizeLanguageID("pt-PT") == "pt-BR")
        #expect(MaumauSharedLocalization.normalizeLanguageID("bbc-ID") == "btk")
        #expect(MaumauSharedLocalization.normalizeLanguageID("unknown-locale") == "en")
    }

    @Test func returnsLocalizedSharedStrings() {
        #expect(
            MaumauSharedLocalization.fallbackString(
                path: ["shared", "chat", "titleMac"],
                localeID: "th-TH",
                fallback: "Web Chat") == "แชทบนเว็บ")
        #expect(
            MaumauSharedLocalization.fallbackString(
                path: ["shared", "chat", "composerPlaceholder"],
                localeID: "zh-CN",
                fallback: "Message Maumau…") == "给 Maumau 发消息…")
        #expect(
            MaumauSharedLocalization.fallbackString(
                path: ["shared", "canvasHome", "offlineTitle"],
                localeID: "th",
                fallback: "Your phone stays quiet until it is needed") == "โทรศัพท์ของคุณจะเงียบจนกว่าจะจำเป็นต้องใช้")
        #expect(
            MaumauSharedLocalization.fallbackString(
                path: ["shared", "canvasHome", "connectedEyebrow"],
                localeID: "ms",
                fallback: "Connected to {gatewayLabel}",
                parameters: ["gatewayLabel": "Gateway Demo"]) == "Disambungkan ke Gateway Demo")
    }

    @Test func fallsBackToEnglishForUnknownSharedStringLocale() {
        #expect(
            MaumauSharedLocalization.fallbackString(
                path: ["shared", "chat", "windowTitle"],
                localeID: "xx-YY",
                fallback: "Fallback") == "Maumau Chat")
    }
}
