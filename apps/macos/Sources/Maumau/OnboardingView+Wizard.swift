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
                Text(self.strings.wizardTitle)
                    .font(.largeTitle.weight(.semibold))
                Text(self.strings.wizardIntro)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 520)

                self.onboardingCard(spacing: 12, padding: 16) {
                    OnboardingMeaningCard(
                        stage: .brain,
                        title: OnboardingHeaderStage.brain.explainerTitle(in: self.state.effectiveOnboardingLanguage),
                        bodyText: OnboardingHeaderStage.brain.explainerBody(in: self.state.effectiveOnboardingLanguage),
                        badges: self.setupStepDefinition(for: self.wizardPageIndex)?.badges ?? [],
                        detailNote: self.setupStepDefinition(for: self.wizardPageIndex)?.preparationNote,
                        language: self.state.effectiveOnboardingLanguage)
                }

                self.onboardingCard(spacing: 14, padding: 16) {
                    if self.shouldWaitForLocalSetupBeforeWizard {
                        self.localSetupPreparationCard()
                    } else {
                        OnboardingWizardCardContent(
                            wizard: self.onboardingWizard,
                            language: self.state.effectiveOnboardingLanguage)
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

                Text(self.strings.localSetupPreparationTitle(
                    isBusy: self.installingCLI || self.isCheckingLocalGatewaySetup))
                .font(.headline)
            }

            Text(self.localSetupPreparationMessage)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            if !self.localGatewaySetupAvailable && !self.installingCLI && !self.isCheckingLocalGatewaySetup {
                Button(self.strings.retryLocalSetupButtonTitle) {
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
        self.strings.localSetupPreparationMessage(
            cliStatus: self.cliStatus,
            installingCLI: self.installingCLI,
            isCheckingLocalGatewaySetup: self.isCheckingLocalGatewaySetup)
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
    let language: OnboardingLanguage

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
                Text(OnboardingStrings(language: self.language).wizardErrorTitle)
                    .font(.headline)
                Text(macWizardText(error, language: self.language) ?? error)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            case .starting:
                HStack(spacing: 8) {
                    ProgressView()
                    Text(OnboardingStrings(language: self.language).startingWizardTitle)
                        .foregroundStyle(.secondary)
                }
            case let .step(step):
                OnboardingWizardStepView(
                    step: step,
                    wizard: self.wizard,
                    isSubmitting: self.wizard.isSubmitting,
                    language: self.language)
                .id(step.id)
                if let stepError = self.wizard.stepErrorMessage, !stepError.isEmpty {
                    Text(macWizardText(stepError, language: self.language) ?? stepError)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .fixedSize(horizontal: false, vertical: true)
                }
            case .complete:
                Text(OnboardingStrings(language: self.language).wizardCompleteTitle)
                    .font(.headline)
            case .waiting:
                Text(OnboardingStrings(language: self.language).waitingForWizardTitle)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
