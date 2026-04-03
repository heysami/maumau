import Testing
@testable import Maumau

@Suite(.serialized)
@MainActor
struct TailscaleServiceTests {
    @Test func `serve readiness requires install before anything else`() {
        let readiness = TailscaleService.classifyAccessReadiness(
            mode: "serve",
            isInstalled: false,
            isRunning: false,
            exposure: nil,
            requiresPassword: false,
            password: "")
        #expect(readiness.requirements.count == 1)
        #expect(readiness.requirements.first?.kind == .install)
        #expect(readiness.detail == "Install Tailscale on this Mac first.")
    }

    @Test func `serve readiness requires sign in when app is installed but inactive`() {
        let readiness = TailscaleService.classifyAccessReadiness(
            mode: "serve",
            isInstalled: true,
            isRunning: false,
            exposure: nil,
            requiresPassword: false,
            password: "")
        #expect(readiness.requirements.count == 1)
        #expect(readiness.requirements.first?.kind == .signIn)
        #expect(readiness.detail == "Sign in to Tailscale on this Mac first.")
    }

    @Test func `serve readiness reports admin enable requirement`() {
        let readiness = TailscaleService.classifyAccessReadiness(
            mode: "serve",
            isInstalled: true,
            isRunning: true,
            exposure: .init(
                mode: "serve",
                checked: true,
                featureEnabled: false,
                active: false,
                detail: "Tailscale Serve is not enabled on this tailnet yet.",
                enableURL: "https://login.tailscale.com/f/serve?node=abc"),
            requiresPassword: false,
            password: "")
        #expect(readiness.requirements.count == 1)
        #expect(readiness.requirements.first?.kind == .enableFeature)
        #expect(readiness.enableURL == "https://login.tailscale.com/f/serve?node=abc")
    }

    @Test func `funnel readiness reports admin enable requirement`() {
        let readiness = TailscaleService.classifyAccessReadiness(
            mode: "funnel",
            isInstalled: true,
            isRunning: true,
            exposure: .init(
                mode: "funnel",
                checked: true,
                featureEnabled: false,
                active: false,
                detail: "Tailscale Funnel is not enabled on this tailnet yet.",
                enableURL: "https://login.tailscale.com/f/funnel?node=abc"),
            requiresPassword: true,
            password: "secret")
        #expect(readiness.requirements.count == 1)
        #expect(readiness.requirements.first?.kind == .enableFeature)
        #expect(readiness.enableURL == "https://login.tailscale.com/f/funnel?node=abc")
    }

    @Test func `serve readiness can add password requirement without losing exposure state`() {
        let readiness = TailscaleService.classifyAccessReadiness(
            mode: "serve",
            isInstalled: true,
            isRunning: true,
            exposure: .init(
                mode: "serve",
                checked: true,
                featureEnabled: true,
                active: false,
                detail: "Tailscale Serve is selected, but it is not active on this Mac yet.",
                enableURL: nil),
            requiresPassword: true,
            password: "   ")
        #expect(readiness.requirements.count == 1)
        #expect(readiness.requirements.first?.kind == .password)
        #expect(readiness.detail == "Password required for this mode.")
        #expect(readiness.isActive == false)
    }

    @Test func `readiness reports active when exposure is already live`() {
        let readiness = TailscaleService.classifyAccessReadiness(
            mode: "serve",
            isInstalled: true,
            isRunning: true,
            exposure: .init(
                mode: "serve",
                checked: true,
                featureEnabled: true,
                active: true,
                detail: nil,
                enableURL: nil),
            requiresPassword: false,
            password: "")
        #expect(readiness.isReady)
        #expect(readiness.isActive)
        #expect(readiness.detail == nil)
    }

    @Test func `funnel parser extracts enable url from disabled output`() {
        let status = TailscaleService.parseExposureStatus(
            mode: "funnel",
            stdout: "",
            stderr: "Funnel is not enabled. Enable in admin console.\nhttps://login.tailscale.com/f/funnel?node=abc",
            success: false,
            errorMessage: "exit 1")
        #expect(status.featureEnabled == false)
        #expect(status.enableURL == "https://login.tailscale.com/f/funnel?node=abc")
    }
}
