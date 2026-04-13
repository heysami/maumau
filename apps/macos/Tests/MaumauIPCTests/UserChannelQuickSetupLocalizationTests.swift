import Testing
@testable import Maumau

@Suite(.serialized)
@MainActor
struct UserChannelQuickSetupLocalizationTests {
    @Test func `loads Indonesian quick setup resources for onboarding and settings`() throws {
        let entry = try #require(
            UserChannelQuickSetupRegistry.entry(for: "telegram", language: .id))

        #expect(entry.quickSetup.title == "Agen Telegram")
        #expect(entry.fields.first?.label == "Token bot Telegram")
        #expect(UserChannelQuickSetupRegistry.settingsNote(language: .id).contains("Channel lain"))
    }

    @Test func `keeps English quick setup as the fallback locale`() throws {
        let entry = try #require(
            UserChannelQuickSetupRegistry.entry(for: "telegram", language: .en))

        #expect(entry.quickSetup.title == "Telegram Agent")
        #expect(UserChannelQuickSetupRegistry.settingsNote.contains("More channels"))
    }
}
