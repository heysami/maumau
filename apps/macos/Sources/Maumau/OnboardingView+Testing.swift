import MaumauDiscovery
import SwiftUI

#if DEBUG
@MainActor
extension OnboardingView {
    static func exerciseForTesting() {
        let state = AppState(preview: true)
        state.onboardingLanguage = .en
        let discovery = GatewayDiscoveryModel(localDisplayName: InstanceIdentity.displayName)
        discovery.statusText = "Searching..."
        let gateway = GatewayDiscoveryModel.DiscoveredGateway(
            displayName: "Test Gateway",
            lanHost: "gateway.local",
            tailnetDns: "gateway.ts.net",
            sshPort: 2222,
            gatewayPort: 18789,
            cliPath: "/usr/local/bin/maumau",
            stableID: "gateway-1",
            debugID: "gateway-1",
            isLocal: false)
        discovery.gateways = [gateway]

        let view = OnboardingView(
            state: state,
            permissionMonitor: PermissionMonitor.shared,
            discoveryModel: discovery)
        view.needsBootstrap = true
        view.localGatewayProbe = LocalGatewayProbe(
            port: GatewayEnvironment.gatewayPort(),
            pid: 123,
            command: "maumau-gateway",
            expected: true)
        view.showAdvancedConnection = true
        view.preferredGatewayID = gateway.stableID
        view.cliInstalled = true
        view.cliInstallLocation = "/usr/local/bin/maumau"
        view.cliStatus = "Installed"
        view.workspacePath = "/tmp/maumau"
        view.workspaceStatus = "Saved workspace"
        view.state.connectionMode = .local
        _ = view.languagePage()
        _ = view.welcomePage()
        _ = view.connectionPage()
        _ = view.wizardPage()
        _ = view.channelsSetupPage()
        _ = view.privateAccessPage()
        _ = view.permissionsPage()
        _ = view.cliPage()
        _ = view.workspacePage()
        _ = view.skillsSetupPage()
        _ = view.onboardingChatPage()
        _ = view.readyPage()

        view.selectLocalGateway()
        view.selectRemoteGateway(gateway)
        view.selectUnconfiguredGateway()

        view.state.connectionMode = .remote
        _ = view.connectionPage()
        _ = view.workspacePage()

        view.state.connectionMode = .unconfigured
        _ = view.connectionPage()

        view.currentPage = OnboardingView.initialPageCursor(
            hasSelectedOnboardingLanguage: true,
            onboardingSeen: true)
        view.handleNext()
        view.handleBack()

        _ = view.onboardingPage(pageID: 0) { Text("Test") }
        _ = view.onboardingCard { Text("Card") }
        _ = view.featureRow(title: "Feature", subtitle: "Subtitle", systemImage: "sparkles")
        _ = view.featureActionRow(
            title: "Action",
            subtitle: "Action subtitle",
            systemImage: "gearshape",
            buttonTitle: "Action",
            action: {})
        _ = view.gatewaySubtitle(for: gateway)
        _ = view.isSelectedGateway(gateway)
    }
}
#endif
