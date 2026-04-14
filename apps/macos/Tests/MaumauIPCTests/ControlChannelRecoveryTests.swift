import Testing
@testable import Maumau

@MainActor
struct ControlChannelRecoveryTests {
    @Test func `stale refresh results do not overwrite the latest attempt`() {
        #expect(!ControlChannel.shouldApplyRefreshResult(attempt: 1, latestAttempt: 2))
    }

    @Test func `latest refresh result still applies`() {
        #expect(ControlChannel.shouldApplyRefreshResult(attempt: 2, latestAttempt: 2))
    }

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
