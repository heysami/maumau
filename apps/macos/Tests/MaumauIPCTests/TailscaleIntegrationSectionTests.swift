import SwiftUI
import Testing
@testable import Maumau

@Suite(.serialized)
@MainActor
struct TailscaleIntegrationSectionTests {
    @Test func `tailscale section defaults missing config to off`() {
        let mode = TailscaleIntegrationSection.resolveConfiguredTailscaleModeRaw(gateway: [:])
        #expect(mode == "off")
    }

    @Test func `tailscale section reads configured serve mode`() {
        let mode = TailscaleIntegrationSection.resolveConfiguredTailscaleModeRaw(gateway: [
            "tailscale": [
                "mode": "serve",
            ],
        ])
        #expect(mode == "serve")
    }

    @Test func `tailscale serve auth resolver honors explicit allow tailscale`() {
        let requireCredentials = TailscaleIntegrationSection.resolveRequireCredentialsForServe(auth: [
            "mode": "password",
            "password": "secret",
            "allowTailscale": true,
        ])
        #expect(requireCredentials == false)
    }

    @Test func `tailscale config build preserves local token when enabling serve`() {
        let root = TailscaleIntegrationSection._testBuildTailscaleConfigRoot(
            existingRoot: [
                "gateway": [
                    "auth": [
                        "mode": "token",
                        "token": "shared-token",
                    ],
                    "tailscale": [
                        "mode": "off",
                    ],
                ],
            ],
            mode: "serve",
            requireCredentialsForServe: false)
        let gateway = root["gateway"] as? [String: Any] ?? [:]
        let auth = gateway["auth"] as? [String: Any] ?? [:]
        let tailscale = gateway["tailscale"] as? [String: Any] ?? [:]
        #expect(auth["token"] as? String == "shared-token")
        #expect(auth["allowTailscale"] as? Bool == true)
        #expect(auth["mode"] as? String == "token")
        #expect(tailscale["mode"] as? String == "serve")
    }

    @Test func `tailscale config build disables tailscale auth without deleting token`() {
        let root = TailscaleIntegrationSection._testBuildTailscaleConfigRoot(
            existingRoot: [
                "gateway": [
                    "auth": [
                        "mode": "token",
                        "token": "shared-token",
                        "allowTailscale": true,
                    ],
                    "tailscale": [
                        "mode": "serve",
                    ],
                ],
            ],
            mode: "off",
            requireCredentialsForServe: false)
        let gateway = root["gateway"] as? [String: Any] ?? [:]
        let auth = gateway["auth"] as? [String: Any] ?? [:]
        let tailscale = gateway["tailscale"] as? [String: Any] ?? [:]
        #expect(auth["token"] as? String == "shared-token")
        #expect(auth["allowTailscale"] as? Bool == false)
        #expect(tailscale["mode"] as? String == "off")
    }

    @Test func `tailscale serve parser marks no serve config as inactive but available`() {
        let status = TailscaleService.parseExposureStatus(
            mode: "serve",
            stdout: "No serve config",
            stderr: "",
            success: true,
            errorMessage: nil)
        #expect(status.checked == true)
        #expect(status.featureEnabled == true)
        #expect(status.active == false)
    }

    @Test func `tailscale serve parser marks disabled tailnet as unavailable`() {
        let status = TailscaleService.parseExposureStatus(
            mode: "serve",
            stdout: "",
            stderr: "Serve is not enabled on your tailnet.\nhttps://login.tailscale.com/f/serve?node=abc",
            success: false,
            errorMessage: "exit 1")
        #expect(status.checked == true)
        #expect(status.featureEnabled == false)
        #expect(status.active == false)
        #expect(status.enableURL == "https://login.tailscale.com/f/serve?node=abc")
    }

    @Test func `tailscale section hides private link when serve is not active`() {
        let host = TailscaleIntegrationSection.resolveVerifiedAccessHost(
            host: "maumau.tailnet.ts.net",
            exposure: .init(
                mode: "serve",
                checked: true,
                featureEnabled: true,
                active: false,
                detail: "No serve config",
                enableURL: nil))
        #expect(host == nil)
    }

    @Test func `tailscale section keeps requested blocked selection in memory`() {
        let preserve = TailscaleIntegrationSection.shouldPreserveRequestedSelection(
            accessFlow: .init(
                appliedMode: "off",
                requestedMode: "serve",
                phase: .blocked,
                requirements: [],
                detail: "Install Tailscale on this Mac first.",
                exposure: nil))
        #expect(preserve)
    }

    @Test func `tailscale section clears pending selection after active flow`() {
        let preserve = TailscaleIntegrationSection.shouldPreserveRequestedSelection(
            accessFlow: .init(
                appliedMode: "serve",
                requestedMode: "serve",
                phase: .active,
                requirements: [],
                detail: nil,
                exposure: .init(
                    mode: "serve",
                    checked: true,
                    featureEnabled: true,
                    active: true,
                    detail: nil,
                    enableURL: nil)))
        #expect(preserve == false)
    }

    @Test func `tailscale section builds body when not installed`() {
        let service = TailscaleService(isInstalled: false, isRunning: false, statusError: "not installed")
        var view = TailscaleIntegrationSection(connectionMode: .local, isPaused: false, service: service)
        view.setTestingState(mode: "off", requireCredentials: false, statusMessage: "Idle")
        _ = view.body
    }

    @Test func `tailscale section builds body for serve mode`() {
        let service = TailscaleService(
            isInstalled: true,
            isRunning: true,
            tailscaleHostname: "maumau.tailnet.ts.net",
            tailscaleIP: "100.64.0.1")
        var view = TailscaleIntegrationSection(connectionMode: .local, isPaused: false, service: service)
        view.setTestingState(
            mode: "serve",
            requireCredentials: true,
            password: "secret",
            statusMessage: "Running")
        _ = view.body
    }

    @Test func `tailscale section builds body for funnel mode`() {
        let service = TailscaleService(
            isInstalled: true,
            isRunning: false,
            tailscaleHostname: nil,
            tailscaleIP: nil,
            statusError: "not running")
        var view = TailscaleIntegrationSection(connectionMode: .remote, isPaused: false, service: service)
        view.setTestingState(
            mode: "funnel",
            requireCredentials: false,
            statusMessage: "Needs start",
            validationMessage: "Invalid token")
        _ = view.body
    }

    @Test func `tailscale onboarding section builds body`() {
        let service = TailscaleService(isInstalled: true, isRunning: false, statusError: "not signed in")
        var view = TailscaleIntegrationSection(
            connectionMode: .local,
            isPaused: false,
            presentation: .onboarding,
            service: service)
        view.setTestingState(mode: "off", requireCredentials: false, statusMessage: "Waiting")
        _ = view.body
    }
}
