import Testing
@testable import Maumau

@MainActor
struct ControlChannelRecoveryTests {
    @Test func `schedules health refresh when control channel recovers with a stale health error`() {
        #expect(ControlChannel.shouldRefreshHealthAfterRecovery(
            from: .degraded("Cannot reach gateway at localhost:18789; ensure the gateway is running."),
            to: .connected,
            currentHealthError: "Cannot reach gateway at localhost:18789; ensure the gateway is running."))
    }

    @Test func `does not schedule health refresh without a stale health error`() {
        #expect(!ControlChannel.shouldRefreshHealthAfterRecovery(
            from: .degraded("Cannot reach gateway at localhost:18789; ensure the gateway is running."),
            to: .connected,
            currentHealthError: nil))
    }

    @Test func `does not schedule health refresh when state stays connected`() {
        #expect(!ControlChannel.shouldRefreshHealthAfterRecovery(
            from: .connected,
            to: .connected,
            currentHealthError: "stale error"))
    }
}
