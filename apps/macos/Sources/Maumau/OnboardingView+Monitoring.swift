import Foundation
import MaumauIPC

extension OnboardingView {
    @MainActor
    func refreshPerms() async {
        await self.permissionMonitor.refreshNow()
    }

    @MainActor
    func request(_ cap: Capability) async {
        guard !self.isRequesting else { return }
        self.isRequesting = true
        defer { isRequesting = false }
        _ = await PermissionManager.ensure([cap], interactive: true)
        await self.refreshPerms()
    }

    func updatePermissionMonitoring(for pageIndex: Int) {
        PermissionMonitoringSupport.setMonitoring(
            pageIndex == self.permissionsPageIndex,
            monitoring: &self.monitoringPermissions)
    }

    func updateDiscoveryMonitoring(for pageIndex: Int) {
        let isConnectionPage = pageIndex == self.connectionPageIndex
        let shouldMonitor = isConnectionPage
        if shouldMonitor, !self.monitoringDiscovery {
            self.monitoringDiscovery = true
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 150_000_000)
                guard self.monitoringDiscovery else { return }
                self.gatewayDiscovery.start()
                await self.refreshLocalGatewayRuntimeAvailability()
                await self.refreshLocalGatewayProbe()
            }
        } else if !shouldMonitor, self.monitoringDiscovery {
            self.monitoringDiscovery = false
            self.gatewayDiscovery.stop()
        }
    }

    func updateMonitoring(for pageIndex: Int) {
        self.updatePermissionMonitoring(for: pageIndex)
        self.updateDiscoveryMonitoring(for: pageIndex)
        self.maybeAutoInstallCLI(for: pageIndex)
        self.maybeKickoffOnboardingChat(for: pageIndex)
    }

    func stopPermissionMonitoring() {
        PermissionMonitoringSupport.stopMonitoring(&self.monitoringPermissions)
    }

    func stopDiscovery() {
        guard self.monitoringDiscovery else { return }
        self.monitoringDiscovery = false
        self.gatewayDiscovery.stop()
    }

    func installCLI() async {
        guard !self.installingCLI else { return }
        self.installingCLI = true
        defer { installingCLI = false }
        await CLIInstaller.install { message in
            self.cliStatus = message
        }
        self.refreshCLIStatus()
    }

    func refreshCLIStatus() {
        let installLocation = CLIInstaller.installedLocation()
        self.cliInstallLocation = installLocation
        self.cliInstalled = installLocation != nil
        if self.cliInstalled {
            self.localRuntimeAvailable = true
        }
    }

    @MainActor
    func refreshLocalGatewayRuntimeAvailability() async {
        if self.cliInstalled {
            self.localRuntimeAvailable = true
            return
        }

        let projectRoot = CommandResolver.projectRoot()
        guard CommandResolver.gatewayEntrypoint(in: projectRoot) != nil else {
            self.localRuntimeAvailable = false
            return
        }

        self.localRuntimeAvailable = nil
        let searchPaths = CommandResolver.preferredPaths()
        let runtimeAvailable = await Task.detached(priority: .utility) {
            if case .success = CommandResolver.runtimeResolution(searchPaths: searchPaths) {
                return true
            }
            return false
        }.value

        self.localRuntimeAvailable = self.cliInstalled ? true : runtimeAvailable
    }

    func resetCLIAutoInstallIfNeeded(for mode: AppState.ConnectionMode) {
        if mode != .local || self.cliInstalled {
            self.didAutoInstallCLI = false
        }
    }

    func maybeAutoInstallCLI(for pageIndex: Int) {
        guard Self.shouldAutoInstallCLI(
            mode: self.state.connectionMode,
            activePageIndex: pageIndex,
            connectionPageIndex: self.connectionPageIndex,
            wizardPageIndex: self.wizardPageIndex,
            cliInstalled: self.cliInstalled,
            installingCLI: self.installingCLI,
            didAutoInstallCLI: self.didAutoInstallCLI)
        else {
            return
        }

        self.didAutoInstallCLI = true
        Task { await self.installCLI() }
    }

    func refreshLocalGatewayProbe() async {
        let port = GatewayEnvironment.gatewayPort()
        let desc = await PortGuardian.shared.describe(port: port)
        await MainActor.run {
            guard let desc else {
                self.localGatewayProbe = nil
                return
            }
            let command = desc.command.trimmingCharacters(in: .whitespacesAndNewlines)
            let expectedTokens = ["node", "maumau", "tsx", "pnpm", "bun"]
            let lower = command.lowercased()
            let expected = expectedTokens.contains { lower.contains($0) }
            self.localGatewayProbe = LocalGatewayProbe(
                port: port,
                pid: desc.pid,
                command: command,
                expected: expected)
        }
    }
}
