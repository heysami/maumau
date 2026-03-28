import Testing
@testable import Maumau

@Suite(.serialized)
struct ChannelConfigFormTests {
    @Test func `humanize config keys uses readable channel labels`() {
        #expect(humanizeConfigSchemaKey("ackReaction") == "Ack Reaction")
        #expect(humanizeConfigSchemaKey("dmPolicy") == "DM Policy")
        #expect(humanizeConfigSchemaKey("mediaMaxMb") == "Media Max MB")
        #expect(humanizeConfigSchemaKey("showOk") == "Show OK")
        #expect(humanizeConfigSchemaKey("authDir") == "Auth Directory")
    }

    @Test func `dynamic entry copy uses parent label for pure maps`() {
        #expect(configSchemaDynamicEntriesHeading(hasFixedProperties: false) == nil)
        #expect(
            configSchemaDynamicEntriesEmptyText(parentLabel: "Accounts", hasFixedProperties: false) ==
                "No accounts yet.")
        #expect(
            configSchemaDynamicEntriesAddButtonTitle(parentLabel: "Accounts", hasFixedProperties: false) ==
                "Add Account")
    }

    @Test func `dynamic entry copy keeps generic extra entries for mixed objects`() {
        #expect(configSchemaDynamicEntriesHeading(hasFixedProperties: true) == "Extra entries")
        #expect(
            configSchemaDynamicEntriesEmptyText(parentLabel: "WhatsApp", hasFixedProperties: true) ==
                "No extra entries yet.")
        #expect(
            configSchemaDynamicEntriesAddButtonTitle(parentLabel: "WhatsApp", hasFixedProperties: true) ==
                "Add")
    }

    @Test func `dynamic entry copy localizes indonesian strings`() {
        #expect(
            configSchemaDynamicEntriesHeading(hasFixedProperties: true, language: .id) ==
                "Entri tambahan")
        #expect(
            configSchemaDynamicEntriesEmptyText(parentLabel: "Accounts", hasFixedProperties: false, language: .id) ==
                "Belum ada akun.")
        #expect(
            configSchemaDynamicEntriesAddButtonTitle(parentLabel: "Accounts", hasFixedProperties: false, language: .id) ==
                "Tambah akun")
    }
}
