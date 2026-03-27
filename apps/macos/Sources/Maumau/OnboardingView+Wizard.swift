import Observation
import MaumauProtocol
import SwiftUI

extension OnboardingView {
    private var shouldWaitForLocalSetupBeforeWizard: Bool {
        Self.shouldWaitForLocalSetupBeforeWizard(
            mode: self.state.connectionMode,
            installingCLI: self.installingCLI,
            isCheckingLocalGatewaySetup: self.isCheckingLocalGatewaySetup,
            localGatewaySetupAvailable: self.localGatewaySetupAvailable)
    }

    private var shouldStartWizardForActivePage: Bool {
        Self.shouldStartWizardForActivePage(
            activePageIndex: self.activePageIndex,
            wizardPageIndex: self.wizardPageIndex,
            shouldWaitForLocalSetup: self.shouldWaitForLocalSetupBeforeWizard)
    }

    private var wizardStartupTaskKey: String {
        [
            String(self.activePageIndex),
            self.state.connectionMode.rawValue,
            self.installingCLI ? "installing" : "idle",
            self.isCheckingLocalGatewaySetup ? "checking" : "steady",
            self.localGatewaySetupAvailable ? "ready" : "blocked",
            self.workspacePath,
        ].joined(separator: "|")
    }

    func wizardPage() -> some View {
        self.onboardingPage(pageID: self.wizardPageIndex) {
            VStack(spacing: 16) {
                Text("Choose the brain")
                    .font(.largeTitle.weight(.semibold))
                Text(
                    "Brain means the AI service Maumau uses for thinking and writing. Choose it once, sign in once, and Maumau will remember your default choice."
                )
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 520)

                self.onboardingCard(spacing: 12, padding: 16) {
                    OnboardingMeaningCard(
                        stage: .brain,
                        title: OnboardingHeaderStage.brain.explainerTitle,
                        bodyText: OnboardingHeaderStage.brain.explainerBody,
                        badges: self.setupStepDefinition(for: self.wizardPageIndex)?.badges ?? [],
                        detailNote: self.setupStepDefinition(for: self.wizardPageIndex)?.preparationNote)
                }

                self.onboardingCard(spacing: 14, padding: 16) {
                    if self.shouldWaitForLocalSetupBeforeWizard {
                        self.localSetupPreparationCard()
                    } else {
                        OnboardingWizardCardContent(
                            wizard: self.onboardingWizard)
                    }
                }
            }
            .task(id: self.wizardStartupTaskKey) {
                guard self.shouldStartWizardForActivePage else { return }
                await self.onboardingWizard.startIfNeeded(
                    mode: self.state.connectionMode,
                    workspace: self.workspacePath.isEmpty ? nil : self.workspacePath)
            }
        }
    }

    @ViewBuilder
    private func localSetupPreparationCard() -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                if self.installingCLI || self.isCheckingLocalGatewaySetup {
                    ProgressView()
                } else {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                }

                Text(
                    self.installingCLI || self.isCheckingLocalGatewaySetup
                        ? "Getting Maumau’s home ready before the brain step starts…"
                        : "This Mac still needs a little setup first"
                )
                .font(.headline)
            }

            Text(self.localSetupPreparationMessage)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            if !self.localGatewaySetupAvailable && !self.installingCLI && !self.isCheckingLocalGatewaySetup {
                Button("Retry local setup") {
                    Task {
                        await self.installCLI()
                        await self.refreshLocalGatewayRuntimeAvailability()
                    }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
            }
        }
    }

    private var localSetupPreparationMessage: String {
        if let cliStatus = self.cliStatus?.trimmingCharacters(in: .whitespacesAndNewlines),
           !cliStatus.isEmpty
        {
            return cliStatus
        }
        if self.installingCLI {
            return "Maumau is installing the helper pieces it needs on this Mac."
        }
        if self.isCheckingLocalGatewaySetup {
            return "Maumau is checking whether this Mac already has what it needs."
        }
        return "Finish getting this Mac ready first. Once that is done, the brain setup continues automatically."
    }

    static func shouldStartWizardForActivePage(
        activePageIndex: Int,
        wizardPageIndex: Int,
        shouldWaitForLocalSetup: Bool) -> Bool
    {
        activePageIndex == wizardPageIndex && !shouldWaitForLocalSetup
    }
}

private struct OnboardingWizardCardContent: View {
    @Bindable var wizard: OnboardingWizardModel

    private enum CardState {
        case error(String)
        case starting
        case step(WizardStep)
        case complete
        case waiting
    }

    private var state: CardState {
        if let error = wizard.errorMessage { return .error(error) }
        if self.wizard.isStarting { return .starting }
        if let step = wizard.currentStep { return .step(step) }
        if self.wizard.isComplete { return .complete }
        return .waiting
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            switch self.state {
            case let .error(error):
                Text("Wizard error")
                    .font(.headline)
                Text(error)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            case .starting:
                HStack(spacing: 8) {
                    ProgressView()
                    Text("Starting wizard…")
                        .foregroundStyle(.secondary)
                }
            case let .step(step):
                OnboardingWizardStepView(
                    step: step,
                    wizard: self.wizard,
                    isSubmitting: self.wizard.isSubmitting)
                .id(step.id)
                if let stepError = self.wizard.stepErrorMessage, !stepError.isEmpty {
                    Text(stepError)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .fixedSize(horizontal: false, vertical: true)
                }
            case .complete:
                Text("Wizard complete. Continue to the next step.")
                    .font(.headline)
            case .waiting:
                Text("Waiting for wizard…")
                    .foregroundStyle(.secondary)
            }
        }
    }
}
