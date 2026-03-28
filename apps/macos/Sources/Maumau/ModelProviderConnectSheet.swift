import Observation
import MaumauProtocol
import SwiftUI

struct ModelAuthChoiceOption: Decodable, Equatable, Identifiable {
    let id: String
    let label: String
    let hint: String?
    let providerId: String?

    enum CodingKeys: String, CodingKey {
        case id = "value"
        case label
        case hint
        case providerId
    }
}

struct ModelAuthChoiceGroup: Decodable, Equatable, Identifiable {
    let id: String
    let label: String
    let hint: String?
    let options: [ModelAuthChoiceOption]

    enum CodingKeys: String, CodingKey {
        case id = "value"
        case label
        case hint
        case options
    }
}

struct ModelAuthChoicesResponse: Decodable {
    let groups: [ModelAuthChoiceGroup]
}

struct ModelAuthSelection: Equatable {
    let groupId: String
    let choiceId: String
}

func resolveModelAuthSelection(
    groups: [ModelAuthChoiceGroup],
    preferredGroupId: String?,
    preferredChoiceId: String?) -> ModelAuthSelection?
{
    guard !groups.isEmpty else { return nil }

    let group = groups.first(where: { $0.id == preferredGroupId }) ?? groups.first
    guard let group else { return nil }

    let choice =
        group.options.first(where: { $0.id == preferredChoiceId })
        ?? group.options.first
    guard let choice else { return nil }

    return ModelAuthSelection(groupId: group.id, choiceId: choice.id)
}

struct ModelProviderConnectSheet: View {
    @Bindable var wizard: OnboardingWizardModel
    let language: OnboardingLanguage
    let groups: [ModelAuthChoiceGroup]
    let connectedProviderIds: Set<String>
    let isLoadingChoices: Bool
    let choicesError: String?
    @Binding var selectedGroupId: String
    @Binding var selectedChoiceId: String
    let retryChoices: () -> Void
    let startSelectedChoice: () -> Void
    let cancel: () -> Void

    private enum WizardCardState {
        case error(String)
        case starting
        case step(WizardStep)
        case complete
        case waiting
    }

    private var selectedGroup: ModelAuthChoiceGroup? {
        self.groups.first(where: { $0.id == self.selectedGroupId })
    }

    private var selectedChoice: ModelAuthChoiceOption? {
        self.selectedGroup?.options.first(where: { $0.id == self.selectedChoiceId })
    }

    private var showsWizard: Bool {
        self.wizard.isStarting || self.wizard.currentStep != nil || self.wizard.errorMessage != nil
            || self.wizard.isComplete || self.wizard.isRunning
    }

    private var wizardState: WizardCardState {
        if let error = self.wizard.errorMessage {
            return .error(error)
        }
        if self.wizard.isStarting {
            return .starting
        }
        if let step = self.wizard.currentStep {
            return .step(step)
        }
        if self.wizard.isComplete {
            return .complete
        }
        return .waiting
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            self.header
            if self.showsWizard {
                self.wizardContent
            } else {
                self.selectionContent
            }
            self.actionRow
        }
        .padding(22)
        .frame(minWidth: 620, minHeight: 480, alignment: .topLeading)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(macLocalized("Connect model provider", language: self.language))
                .font(.title3.weight(.semibold))
            Text(macLocalized(
                "Choose the AI service you want to add here. Maumau will guide you through sign-in or API key setup without sending you to Config.",
                language: self.language))
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder
    private var selectionContent: some View {
        if self.isLoadingChoices && self.groups.isEmpty {
            ProgressView(macLocalized("Loading provider choices…", language: self.language))
                .controlSize(.small)
        } else if let choicesError, self.groups.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text(choicesError)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Button(macLocalized("Retry", language: self.language)) {
                    self.retryChoices()
                }
                .buttonStyle(.bordered)
            }
        } else {
            ScrollView(.vertical) {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(macWizardText("AI service", language: self.language) ?? "AI service")
                            .font(.headline)
                        ForEach(self.groups) { group in
                            self.groupRow(group)
                        }
                    }

                    if let selectedGroup {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(macLocalized("Model/auth choice", language: self.language))
                                .font(.headline)
                            ForEach(selectedGroup.options) { option in
                                self.choiceRow(option)
                            }
                        }
                    }

                    if let choicesError, !choicesError.isEmpty {
                        Text(choicesError)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    @ViewBuilder
    private var wizardContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let selectedChoice {
                Text(macWizardText(selectedChoice.label, language: self.language) ?? selectedChoice.label)
                    .font(.headline)
            }

            switch self.wizardState {
            case let .error(error):
                Text(macLocalized("Connection problem", language: self.language))
                    .font(.headline)
                Text(macWizardText(error, language: self.language) ?? error)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            case .starting:
                HStack(spacing: 8) {
                    ProgressView()
                    Text(macLocalized("Starting connection…", language: self.language))
                        .foregroundStyle(.secondary)
                }
            case let .step(step):
                OnboardingWizardStepView(
                    step: step,
                    wizard: self.wizard,
                    isSubmitting: self.wizard.isSubmitting,
                    language: self.language,
                    showStepExplanation: false)
                    .id(step.id)
                if let stepError = self.wizard.stepErrorMessage, !stepError.isEmpty {
                    Text(macWizardText(stepError, language: self.language) ?? stepError)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .fixedSize(horizontal: false, vertical: true)
                }
            case .complete:
                HStack(spacing: 8) {
                    ProgressView()
                    Text(macLocalized("Saving provider connection…", language: self.language))
                        .foregroundStyle(.secondary)
                }
            case .waiting:
                Text(macLocalized("Waiting for the next setup step…", language: self.language))
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var actionRow: some View {
        HStack(spacing: 10) {
            Button(macLocalized("Cancel", language: self.language)) {
                self.cancel()
            }
            .keyboardShortcut(.cancelAction)

            Spacer()

            if self.showsWizard, self.wizard.canGoBack {
                Button(macLocalized("Back", language: self.language)) {
                    Task { await self.wizard.goBackOneStep() }
                }
                .buttonStyle(.bordered)
            }

            if self.showsWizard {
                if let title = self.wizard.primaryActionTitle(in: self.language) {
                    Button(title) {
                        Task {
                            await self.wizard.triggerModelAuthPrimaryAction(authChoice: self.selectedChoiceId)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(self.wizard.isPrimaryActionDisabled)
                }
            } else {
                Button(macLocalized("Continue", language: self.language)) {
                    self.startSelectedChoice()
                }
                .buttonStyle(.borderedProminent)
                .disabled(self.selectedChoice == nil || self.isLoadingChoices)
            }
        }
    }

    private func groupRow(_ group: ModelAuthChoiceGroup) -> some View {
        let selected = group.id == self.selectedGroupId
        let connected = group.options.contains {
            guard let providerId = $0.providerId else { return false }
            return self.connectedProviderIds.contains(providerId)
        }

        return Button {
            self.selectedGroupId = group.id
            if let choice = resolveModelAuthSelection(
                groups: [group],
                preferredGroupId: group.id,
                preferredChoiceId: nil)
            {
                self.selectedChoiceId = choice.choiceId
            }
        } label: {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 8) {
                        Text(macWizardText(group.label, language: self.language) ?? group.label)
                            .font(.headline)
                            .foregroundStyle(.primary)
                        if connected {
                            Text(macLocalized("Already connected", language: self.language))
                                .font(.caption.weight(.medium))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(Capsule().fill(Color.secondary.opacity(0.12)))
                                .foregroundStyle(.secondary)
                        }
                    }
                    if let hint = group.hint, !hint.isEmpty {
                        Text(macWizardText(hint, language: self.language) ?? hint)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 0)
                SelectionStateIndicator(selected: selected)
            }
            .maumauSelectableRowChrome(selected: selected)
        }
        .buttonStyle(.plain)
    }

    private func choiceRow(_ option: ModelAuthChoiceOption) -> some View {
        let selected = option.id == self.selectedChoiceId

        return Button {
            self.selectedChoiceId = option.id
        } label: {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(macWizardText(option.label, language: self.language) ?? option.label)
                        .font(.headline)
                        .foregroundStyle(.primary)
                    if let hint = option.hint, !hint.isEmpty {
                        Text(macWizardText(hint, language: self.language) ?? hint)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 0)
                SelectionStateIndicator(selected: selected)
            }
            .maumauSelectableRowChrome(selected: selected)
        }
        .buttonStyle(.plain)
    }
}
