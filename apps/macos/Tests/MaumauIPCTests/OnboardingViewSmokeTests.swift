import Foundation
import MaumauDiscovery
import SwiftUI
import Testing
@testable import Maumau

@Suite(.serialized)
@MainActor
struct OnboardingViewSmokeTests {
    @Test func `onboarding view builds body`() {
        let state = AppState(preview: true)
        let view = OnboardingView(
            state: state,
            permissionMonitor: PermissionMonitor.shared,
            discoveryModel: GatewayDiscoveryModel(localDisplayName: InstanceIdentity.displayName))
        _ = view.body
    }

    @Test func `onboarding controller show and close`() {
        OnboardingController.shared.close()
        OnboardingController.shared.show()
        #expect(OnboardingController.shared.isPresented)
        OnboardingController.shared.close()
        #expect(!OnboardingController.shared.isPresented)
    }

    @Test func `local page order adds private access before permissions and included tools`() {
        let order = OnboardingView.pageOrder(for: .local, showOnboardingChat: false)
        #expect(order == [0, 1, 3, 10, 12, 5, 11, 9])
        let channelsIndex = order.firstIndex(of: 10)
        let privateAccessIndex = order.firstIndex(of: 12)
        let permissionsIndex = order.firstIndex(of: 5)
        let toolsIndex = order.firstIndex(of: 11)
        #expect(privateAccessIndex == channelsIndex.map { $0 + 1 })
        #expect(permissionsIndex == privateAccessIndex.map { $0 + 1 })
        #expect(toolsIndex == permissionsIndex.map { $0 + 1 })
        #expect(!order.contains(6))
        #expect(!order.contains(7))
        #expect(!order.contains(8))
    }

    @Test func `local onboarding step metadata marks required optional and prep elsewhere`() {
        let state = AppState(preview: true)
        state.connectionMode = .local
        let view = OnboardingView(
            state: state,
            permissionMonitor: PermissionMonitor.shared,
            discoveryModel: GatewayDiscoveryModel(localDisplayName: InstanceIdentity.displayName))

        let steps = view.setupStepDefinitions

        #expect(steps.first(where: { $0.pageID == view.connectionPageIndex })?.badges == [.required])
        #expect(steps.first(where: { $0.pageID == view.wizardPageIndex })?.badges == [.required, .needsPrep])
        #expect(steps.first(where: { $0.pageID == view.channelsSetupPageIndex })?.badges == [.optional, .needsPrep])
        #expect(steps.first(where: { $0.pageID == view.privateAccessPageIndex })?.badges == [.optional, .needsPrep])
        #expect(steps.first(where: { $0.pageID == view.permissionsPageIndex })?.badges == [.optional])
        #expect(steps.first(where: { $0.pageID == view.skillsSetupPageIndex })?.badges == [.optional])
    }

    @Test func `included tool highlights keep browser control in onboarding essentials`() {
        let highlights = OnboardingView.includedToolHighlights()
        let titles = highlights.map(\.title)
        #expect(titles == [
            "Files and folders",
            "Apps and screen context",
            "Browser control",
            "Commands",
            "Messages and connected services",
        ])
    }

    @Test func `included helper highlights keep daily-life defaults visible in onboarding`() {
        let highlights = OnboardingView.includedHelperHighlights()
        let titles = highlights.map(\.title)
        #expect(titles == [
            "Clawd Cursor",
            "Maumau Guardrails",
            "Lobster workflows",
            "Structured AI tasks",
        ])
    }

    @Test func `page order omits onboarding chat when identity known`() {
        let order = OnboardingView.pageOrder(for: .local, showOnboardingChat: false)
        #expect(!order.contains(8))
    }

    @Test func `remote page order skips brain setup and keeps onboarding focused on channels`() {
        let order = OnboardingView.pageOrder(for: .remote, showOnboardingChat: false)
        #expect(order == [0, 1, 10, 9])
        #expect(!order.contains(3))
        #expect(!order.contains(12))
        #expect(!order.contains(5))
        #expect(!order.contains(7))
        #expect(!order.contains(8))
        #expect(!order.contains(11))
    }

    @Test func `fresh onboarding defaults to local setup`() {
        #expect(OnboardingView.shouldDefaultToLocalConnectionMode(
            connectionMode: .unconfigured,
            onboardingSeen: false,
            remoteUrl: "",
            hasSelectedOnboardingLanguage: true))
        #expect(OnboardingView.shouldDefaultToLocalConnectionMode(
            connectionMode: .unconfigured,
            onboardingSeen: false,
            remoteUrl: "   ",
            hasSelectedOnboardingLanguage: true))
        #expect(OnboardingView.shouldDefaultToLocalConnectionMode(
            connectionMode: .remote,
            onboardingSeen: false,
            remoteUrl: "wss://gateway.example",
            hasSelectedOnboardingLanguage: true))
        #expect(OnboardingView.shouldDefaultToLocalConnectionMode(
            connectionMode: .local,
            onboardingSeen: false,
            remoteUrl: "",
            hasSelectedOnboardingLanguage: true) == false)
        #expect(OnboardingView.shouldDefaultToLocalConnectionMode(
            connectionMode: .unconfigured,
            onboardingSeen: true,
            remoteUrl: "",
            hasSelectedOnboardingLanguage: true) == false)
        #expect(OnboardingView.shouldDefaultToLocalConnectionMode(
            connectionMode: .unconfigured,
            onboardingSeen: false,
            remoteUrl: "",
            hasSelectedOnboardingLanguage: false) == false)
    }

    @Test func `language selection is the first onboarding cursor until chosen`() {
        #expect(OnboardingView.initialPageCursor(hasSelectedOnboardingLanguage: false, onboardingSeen: false) == 0)
        #expect(OnboardingView.initialPageCursor(hasSelectedOnboardingLanguage: true, onboardingSeen: false) == 0)
        #expect(OnboardingView.initialPageCursor(hasSelectedOnboardingLanguage: true, onboardingSeen: true) == 1)
    }

    @Test func `language catalog defaults to english and supports indonesian`() {
        #expect(OnboardingLanguage.loadSelection(from: nil) == nil)
        #expect(OnboardingLanguage.loadSelection(from: "id") == .id)
        #expect(AppState(preview: true).effectiveOnboardingLanguage == .en)
    }

    @Test func `wizard start waits until the wizard page is active`() {
        #expect(!OnboardingView.shouldStartWizardForActivePage(
            activePageIndex: 1,
            wizardPageIndex: 3,
            shouldWaitForLocalSetup: false))
        #expect(!OnboardingView.shouldStartWizardForActivePage(
            activePageIndex: 3,
            wizardPageIndex: 3,
            shouldWaitForLocalSetup: true))
        #expect(OnboardingView.shouldStartWizardForActivePage(
            activePageIndex: 3,
            wizardPageIndex: 3,
            shouldWaitForLocalSetup: false))
    }

    @Test func `page side effects stay idle for offscreen onboarding pages`() {
        #expect(!OnboardingView.shouldActivateOnboardingPageSideEffects(
            activePageIndex: 3,
            pageIndex: 10))
        #expect(!OnboardingView.shouldActivateOnboardingPageSideEffects(
            activePageIndex: 3,
            pageIndex: 11))
        #expect(OnboardingView.shouldActivateOnboardingPageSideEffects(
            activePageIndex: 10,
            pageIndex: 10))
        #expect(OnboardingView.shouldActivateOnboardingPageSideEffects(
            activePageIndex: 11,
            pageIndex: 11))
    }

    @Test func `fresh launch skips stale unconfigured startup apply`() {
        #expect(AppDelegate.shouldApplyInitialConnectionMode(mode: .unconfigured, onboardingSeen: false) == false)
        #expect(AppDelegate.shouldApplyInitialConnectionMode(mode: .unconfigured, onboardingSeen: true))
        #expect(AppDelegate.shouldApplyInitialConnectionMode(mode: .local, onboardingSeen: false))
        #expect(AppDelegate.shouldApplyInitialConnectionMode(mode: .remote, onboardingSeen: false))
    }

    @Test func `fresh launch keeps retrying onboarding until it is visible or no longer needed`() {
        #expect(AppDelegate.shouldShowInitialOnboarding(seenVersion: 0, onboardingSeen: false))
        #expect(AppDelegate.shouldRetryInitialOnboardingPresentation(
            seenVersion: 0,
            onboardingSeen: false,
            onboardingPresented: false))
        #expect(!AppDelegate.shouldRetryInitialOnboardingPresentation(
            seenVersion: currentOnboardingVersion,
            onboardingSeen: true,
            onboardingPresented: false))
        #expect(!AppDelegate.shouldRetryInitialOnboardingPresentation(
            seenVersion: 0,
            onboardingSeen: false,
            onboardingPresented: true))
    }

    @Test func `local gateway setup requires cli or local project gateway`() throws {
        let tmp = try makeTempDirForTests()
        #expect(OnboardingView.canStartLocalGateway(
            cliInstalled: false,
            projectRoot: tmp,
            runtimeAvailable: true) == false)

        try FileManager.default.createDirectory(
            at: tmp.appendingPathComponent("dist"),
            withIntermediateDirectories: true)
        try "console.log('ok')".write(
            to: tmp.appendingPathComponent("dist/index.js"),
            atomically: true,
            encoding: .utf8)

        #expect(OnboardingView.canStartLocalGateway(
            cliInstalled: false,
            projectRoot: tmp,
            runtimeAvailable: true))
        #expect(OnboardingView.canStartLocalGateway(
            cliInstalled: true,
            projectRoot: tmp,
            runtimeAvailable: false))
    }

    @Test func `local gateway setup stays unavailable until runtime probe finishes`() throws {
        let tmp = try makeTempDirForTests()
        try FileManager.default.createDirectory(
            at: tmp.appendingPathComponent("dist"),
            withIntermediateDirectories: true)
        try "console.log('ok')".write(
            to: tmp.appendingPathComponent("dist/index.js"),
            atomically: true,
            encoding: .utf8)

        #expect(OnboardingView.canStartLocalGateway(
            cliInstalled: false,
            projectRoot: tmp,
            runtimeAvailable: nil) == false)
    }

    @Test func `building connection page does not spawn runtime probes`() throws {
        let tmp = try makeTempDirForTests()
        let previousRoot = CommandResolver.projectRootPath()
        defer { CommandResolver.setProjectRoot(previousRoot) }
        CommandResolver.setProjectRoot(tmp.path)

        try FileManager.default.createDirectory(
            at: tmp.appendingPathComponent("dist"),
            withIntermediateDirectories: true)
        try "console.log('ok')".write(
            to: tmp.appendingPathComponent("dist/index.js"),
            atomically: true,
            encoding: .utf8)

        let sentinel = tmp.appendingPathComponent("runtime-probe.txt")
        let node = tmp.appendingPathComponent("node_modules/.bin/node")
        try FileManager.default.createDirectory(
            at: node.deletingLastPathComponent(),
            withIntermediateDirectories: true)
        try """
        #!/bin/sh
        echo runtime-probe > '\(sentinel.path)'
        echo v22.16.0
        """.write(to: node, atomically: true, encoding: .utf8)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: node.path)

        let state = AppState(preview: true)
        let view = OnboardingView(
            state: state,
            permissionMonitor: PermissionMonitor.shared,
            discoveryModel: GatewayDiscoveryModel(localDisplayName: InstanceIdentity.displayName))

        _ = view.connectionPage()

        #expect(FileManager.default.fileExists(atPath: sentinel.path) == false)
    }

    @Test func `auto install runs once on local setup pages`() {
        #expect(OnboardingView.shouldAutoInstallCLI(
            mode: .local,
            activePageIndex: 1,
            connectionPageIndex: 1,
            wizardPageIndex: 3,
            cliInstalled: false,
            installingCLI: false,
            didAutoInstallCLI: false))
        #expect(OnboardingView.shouldAutoInstallCLI(
            mode: .remote,
            activePageIndex: 1,
            connectionPageIndex: 1,
            wizardPageIndex: 3,
            cliInstalled: false,
            installingCLI: false,
            didAutoInstallCLI: false) == false)
        #expect(OnboardingView.shouldAutoInstallCLI(
            mode: .local,
            activePageIndex: 3,
            connectionPageIndex: 1,
            wizardPageIndex: 3,
            cliInstalled: false,
            installingCLI: false,
            didAutoInstallCLI: false))
        #expect(OnboardingView.shouldAutoInstallCLI(
            mode: .local,
            activePageIndex: 10,
            connectionPageIndex: 1,
            wizardPageIndex: 3,
            cliInstalled: true,
            installingCLI: false,
            didAutoInstallCLI: false) == false)
        #expect(OnboardingView.shouldAutoInstallCLI(
            mode: .local,
            activePageIndex: 1,
            connectionPageIndex: 1,
            wizardPageIndex: 3,
            cliInstalled: false,
            installingCLI: true,
            didAutoInstallCLI: false) == false)
        #expect(OnboardingView.shouldAutoInstallCLI(
            mode: .local,
            activePageIndex: 1,
            connectionPageIndex: 1,
            wizardPageIndex: 3,
            cliInstalled: false,
            installingCLI: false,
            didAutoInstallCLI: true) == false)
    }

    @Test func `default skill installs only auto run on first local onboarding skills page`() {
        #expect(OnboardingView.shouldAutoInstallDefaultSkills(
            mode: .local,
            onboardingSeen: false,
            activePageIndex: 11,
            skillsSetupPageIndex: 11,
            didAutoInstallDefaultSkills: false,
            isLoadingSkills: false,
            hasSkills: true))
        #expect(OnboardingView.shouldAutoInstallDefaultSkills(
            mode: .remote,
            onboardingSeen: false,
            activePageIndex: 11,
            skillsSetupPageIndex: 11,
            didAutoInstallDefaultSkills: false,
            isLoadingSkills: false,
            hasSkills: true) == false)
        #expect(OnboardingView.shouldAutoInstallDefaultSkills(
            mode: .local,
            onboardingSeen: true,
            activePageIndex: 11,
            skillsSetupPageIndex: 11,
            didAutoInstallDefaultSkills: false,
            isLoadingSkills: false,
            hasSkills: true) == false)
        #expect(OnboardingView.shouldAutoInstallDefaultSkills(
            mode: .local,
            onboardingSeen: false,
            activePageIndex: 10,
            skillsSetupPageIndex: 11,
            didAutoInstallDefaultSkills: false,
            isLoadingSkills: false,
            hasSkills: true) == false)
        #expect(OnboardingView.shouldAutoInstallDefaultSkills(
            mode: .local,
            onboardingSeen: false,
            activePageIndex: 11,
            skillsSetupPageIndex: 11,
            didAutoInstallDefaultSkills: true,
            isLoadingSkills: false,
            hasSkills: true) == false)
        #expect(OnboardingView.shouldAutoInstallDefaultSkills(
            mode: .local,
            onboardingSeen: false,
            activePageIndex: 11,
            skillsSetupPageIndex: 11,
            didAutoInstallDefaultSkills: false,
            isLoadingSkills: true,
            hasSkills: true) == false)
        #expect(OnboardingView.shouldAutoInstallDefaultSkills(
            mode: .local,
            onboardingSeen: false,
            activePageIndex: 11,
            skillsSetupPageIndex: 11,
            didAutoInstallDefaultSkills: false,
            isLoadingSkills: false,
            hasSkills: false) == false)
    }

    @Test func `wizard waits for local setup before starting`() {
        #expect(OnboardingView.shouldWaitForLocalSetupBeforeWizard(
            mode: .local,
            installingCLI: true,
            isCheckingLocalGatewaySetup: false,
            localGatewaySetupAvailable: false))
        #expect(OnboardingView.shouldWaitForLocalSetupBeforeWizard(
            mode: .local,
            installingCLI: false,
            isCheckingLocalGatewaySetup: true,
            localGatewaySetupAvailable: false))
        #expect(OnboardingView.shouldWaitForLocalSetupBeforeWizard(
            mode: .local,
            installingCLI: false,
            isCheckingLocalGatewaySetup: false,
            localGatewaySetupAvailable: false))
        #expect(OnboardingView.shouldWaitForLocalSetupBeforeWizard(
            mode: .local,
            installingCLI: false,
            isCheckingLocalGatewaySetup: false,
            localGatewaySetupAvailable: true) == false)
        #expect(OnboardingView.shouldWaitForLocalSetupBeforeWizard(
            mode: .remote,
            installingCLI: false,
            isCheckingLocalGatewaySetup: false,
            localGatewaySetupAvailable: false) == false)
    }

    @Test func `forward navigation dots stay locked while setup is blocked`() {
        #expect(OnboardingView.shouldLockForwardNavigation(
            currentPage: 1,
            targetPage: 2,
            canAdvance: false,
            requiredSetupPageIndex: nil,
            wizardPageOrderIndex: 2,
            wizardComplete: false))
        #expect(OnboardingView.shouldLockForwardNavigation(
            currentPage: 1,
            targetPage: 0,
            canAdvance: false,
            requiredSetupPageIndex: nil,
            wizardPageOrderIndex: 2,
            wizardComplete: false) == false)
        #expect(OnboardingView.shouldLockForwardNavigation(
            currentPage: 2,
            targetPage: 4,
            canAdvance: true,
            requiredSetupPageIndex: nil,
            wizardPageOrderIndex: 2,
            wizardComplete: false))
        #expect(OnboardingView.shouldLockForwardNavigation(
            currentPage: 2,
            targetPage: 4,
            canAdvance: true,
            requiredSetupPageIndex: nil,
            wizardPageOrderIndex: 2,
            wizardComplete: true) == false)
        #expect(OnboardingView.shouldLockForwardNavigation(
            currentPage: 0,
            targetPage: 2,
            canAdvance: true,
            requiredSetupPageIndex: 1,
            wizardPageOrderIndex: 2,
            wizardComplete: false))
        #expect(OnboardingView.shouldLockForwardNavigation(
            currentPage: 0,
            targetPage: 1,
            canAdvance: true,
            requiredSetupPageIndex: 1,
            wizardPageOrderIndex: 2,
            wizardComplete: false) == false)
    }

    @Test func `select remote gateway clears stale ssh target when endpoint unresolved`() async {
        let override = FileManager().temporaryDirectory
            .appendingPathComponent("maumau-config-\(UUID().uuidString)")
            .appendingPathComponent("maumau.json")
            .path

        await TestIsolation.withEnvValues(["MAUMAU_CONFIG_PATH": override]) {
            let state = AppState(preview: true)
            state.remoteTransport = .ssh
            state.remoteTarget = "user@old-host:2222"
            let view = OnboardingView(
                state: state,
                permissionMonitor: PermissionMonitor.shared,
                discoveryModel: GatewayDiscoveryModel(localDisplayName: InstanceIdentity.displayName))
            let gateway = GatewayDiscoveryModel.DiscoveredGateway(
                displayName: "Unresolved",
                serviceHost: nil,
                servicePort: nil,
                lanHost: "txt-host.local",
                tailnetDns: "txt-host.ts.net",
                sshPort: 22,
                gatewayPort: 18789,
                cliPath: "/tmp/maumau",
                stableID: UUID().uuidString,
                debugID: UUID().uuidString,
                isLocal: false)

            view.selectRemoteGateway(gateway)
            #expect(state.remoteTarget.isEmpty)
        }
    }
}
