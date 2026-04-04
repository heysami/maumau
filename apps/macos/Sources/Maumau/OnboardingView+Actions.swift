import AppKit
import Foundation
import MaumauDiscovery
import MaumauIPC
import MaumauKit
import SwiftUI

extension OnboardingView {
    static func managedBrowserStartParams(profile: String = "maumau") -> [String: AnyCodable] {
        ManagedBrowserSignInLauncher.startParams(profile: profile)
    }

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
        guard !self.onboardingFinishing else { return }
        let leavingWizard = self.activePageIndex == self.wizardPageIndex
        if leavingWizard, !self.onboardingWizard.isSatisfiedForOnboarding {
            self.resetWizardAfterNavigation()
        }
        withAnimation {
            self.currentPage = max(0, self.currentPage - 1)
        }
    }

    func handleNext() {
        if self.isWizardBlocking || self.onboardingFinishing { return }
        let leavingWizard = self.activePageIndex == self.wizardPageIndex
        if leavingWizard, !self.onboardingWizard.isSatisfiedForOnboarding {
            self.resetWizardAfterNavigation()
        }
        if self.currentPage < self.pageCount - 1 {
            withAnimation { self.currentPage += 1 }
        } else {
            self.finish()
        }
    }

    func finish() {
        guard !self.onboardingFinishing else { return }
        self.onboardingFinishing = true
        self.onboardingFinishStatus = macLocalized(
            "Applying setup changes...",
            language: self.state.effectiveOnboardingLanguage)
        self.onboardingFinishStatusIsError = false

        Task { @MainActor in
            let applied = await self.onboardingChannelsStore.applyDeferredConfigChanges()
            guard applied else {
                self.onboardingFinishing = false
                self.onboardingFinishStatus =
                    self.onboardingChannelsStore.configStatus
                    ?? macLocalized(
                        "Could not finish setup. Review the saved settings and try again.",
                        language: self.state.effectiveOnboardingLanguage)
                self.onboardingFinishStatusIsError = true
                return
            }

            AppStateStore.shared.onboardingSeen = true
            UserDefaults.standard.set(true, forKey: "maumau.onboardingSeen")
            UserDefaults.standard.set(currentOnboardingVersion, forKey: onboardingVersionKey)
            self.onboardingFinishStatus = nil
            self.onboardingFinishStatusIsError = false
            OnboardingController.shared.close()
        }
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

    @discardableResult
    func openManagedBrowserForSignIn(profile: String = "maumau") async -> Bool {
        guard !self.managedBrowserSignInLaunching else { return false }
        self.managedBrowserSignInLaunching = true
        defer { self.managedBrowserSignInLaunching = false }

        do {
            try await ManagedBrowserSignInLauncher.start(profile: profile)
            self.managedBrowserSignInStatus = self.strings.managedBrowserSignInOpenedStatus
            return true
        } catch {
            self.managedBrowserSignInStatus =
                "\(self.strings.managedBrowserSignInFailedStatusPrefix) \(error.localizedDescription)"
            return false
        }
    }
}
