import AppKit
import Foundation
import MaumauDiscovery
import MaumauIPC
import SwiftUI

extension OnboardingView {
    private func resetWizardAfterNavigation() {
        Task {
            await self.onboardingWizard.cancelIfRunning()
            self.onboardingWizard.reset()
        }
    }

    func selectLocalGateway() {
        self.state.connectionMode = .local
        self.preferredGatewayID = nil
        self.showAdvancedConnection = false
        GatewayDiscoveryPreferences.setPreferredStableID(nil)
    }

    func selectUnconfiguredGateway() {
        Task { await self.onboardingWizard.cancelIfRunning() }
        self.state.connectionMode = .unconfigured
        self.preferredGatewayID = nil
        self.showAdvancedConnection = false
        GatewayDiscoveryPreferences.setPreferredStableID(nil)
    }

    func selectRemoteGateway(_ gateway: GatewayDiscoveryModel.DiscoveredGateway) {
        Task { await self.onboardingWizard.cancelIfRunning() }
        self.preferredGatewayID = gateway.stableID
        GatewayDiscoveryPreferences.setPreferredStableID(gateway.stableID)
        GatewayDiscoverySelectionSupport.applyRemoteSelection(gateway: gateway, state: self.state)

        self.state.connectionMode = .remote
        MacNodeModeCoordinator.shared.setPreferredGatewayStableID(gateway.stableID)
    }

    func openSettings(tab: SettingsTab) {
        SettingsTabRouter.request(tab)
        self.openSettings()
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: .maumauSelectSettingsTab, object: tab)
        }
    }

    func maybeDefaultToLocalConnectionMode() {
        guard Self.shouldDefaultToLocalConnectionMode(
            connectionMode: self.state.connectionMode,
            onboardingSeen: self.state.onboardingSeen,
            remoteUrl: self.state.remoteUrl,
            hasSelectedOnboardingLanguage: self.state.hasSelectedOnboardingLanguage)
        else { return }
        self.selectLocalGateway()
    }

    func handleBack() {
        let leavingWizard = self.activePageIndex == self.wizardPageIndex
        if leavingWizard, !self.onboardingWizard.isComplete {
            self.resetWizardAfterNavigation()
        }
        withAnimation {
            self.currentPage = max(0, self.currentPage - 1)
        }
    }

    func handleNext() {
        if self.isWizardBlocking { return }
        let leavingWizard = self.activePageIndex == self.wizardPageIndex
        if leavingWizard, !self.onboardingWizard.isComplete {
            self.resetWizardAfterNavigation()
        }
        if self.currentPage < self.pageCount - 1 {
            withAnimation { self.currentPage += 1 }
        } else {
            self.finish()
        }
    }

    func finish() {
        AppStateStore.shared.onboardingSeen = true
        UserDefaults.standard.set(true, forKey: "maumau.onboardingSeen")
        UserDefaults.standard.set(currentOnboardingVersion, forKey: onboardingVersionKey)
        OnboardingController.shared.close()
    }

    func copyToPasteboard(_ text: String) {
        let pb = NSPasteboard.general
        pb.clearContents()
        pb.setString(text, forType: .string)
        self.copied = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { self.copied = false }
    }

    func skipWizardForLater() {
        Task { await self.onboardingWizard.skipForNow() }
    }
}
