import Testing
@testable import Maumau

@MainActor
struct ControlChannelRecoveryTests {
    @Test func `continues recovering while disconnected in configured modes`() {
        #expect(ControlChannel.shouldKeepRecovering(state: .disconnected, mode: .local))
        #expect(ControlChannel.shouldKeepRecovering(state: .degraded("gateway down"), mode: .remote))
        #expect(!ControlChannel.shouldKeepRecovering(state: .connected, mode: .local))
        #expect(!ControlChannel.shouldKeepRecovering(state: .degraded("gateway down"), mode: .unconfigured))
    }

    @Test func `recovery retry backoff stays immediate first and capped later`() {
        #expect(ControlChannel.recoveryDelayBeforeAttemptMs(0) == 0)
        #expect(ControlChannel.recoveryDelayBeforeAttemptMs(1) == 1_000)
        #expect(ControlChannel.recoveryDelayBeforeAttemptMs(2) == 2_000)
        #expect(ControlChannel.recoveryDelayBeforeAttemptMs(3) == 5_000)
        #expect(ControlChannel.recoveryDelayBeforeAttemptMs(20) == 10_000)
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

    @Test func `marks the control channel connected when the shared gateway socket recovers`() {
        ControlChannel.shared.noteSharedConnectionConnected(authSource: .sharedToken)

        #expect(ControlChannel.shared.state == .connected)
        #expect(ControlChannel.shared.authSourceLabel == "Auth: shared token (gateway.auth.token)")
    }
}
