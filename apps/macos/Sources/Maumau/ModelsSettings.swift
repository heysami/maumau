import Observation
import SwiftUI
import MaumauProtocol

struct ModelSettingsSelection: Equatable {
    let primaryRef: String
    let fallbackRefs: [String]

    var providerId: String {
        modelSettingsProviderId(for: self.primaryRef)
            ?? self.fallbackRefs.compactMap(modelSettingsProviderId(for:)).first
            ?? ""
    }
}

struct ModelSettingsOption: Identifiable, Hashable {
    let ref: String
    let providerId: String
    let modelId: String
    let displayName: String
    let contextWindow: Int?
    let reasoning: Bool
    let synthetic: Bool

    var id: String {
        self.ref
    }

    var menuLabel: String {
        let modelLabel = self.displayName == self.modelId ? self.displayName : "\(self.displayName) (\(self.modelId))"
        let base = "\(displayProviderName(self.providerId)) · \(modelLabel)"
        if self.synthetic {
            return "\(base) (saved)"
        }
        return base
    }
}

func modelSettingsProviderId(for ref: String?) -> String? {
    let trimmed = ref?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard !trimmed.isEmpty else { return nil }
    guard let slash = trimmed.firstIndex(of: "/") else { return nil }
    let provider = String(trimmed[..<slash]).trimmingCharacters(in: .whitespacesAndNewlines)
    return provider.isEmpty ? nil : provider
}

func modelSettingsModelId(for ref: String?) -> String {
    let trimmed = ref?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard !trimmed.isEmpty else { return "" }
    guard let slash = trimmed.firstIndex(of: "/") else { return trimmed }
    return String(trimmed[trimmed.index(after: slash)...]).trimmingCharacters(in: .whitespacesAndNewlines)
}

func buildModelSettingsRef(providerId: String, modelId: String) -> String {
    let provider = providerId.trimmingCharacters(in: .whitespacesAndNewlines)
    let model = modelId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !provider.isEmpty, !model.isEmpty else { return "" }
    return "\(provider)/\(model)"
}

func resolveModelSettingsSelection(from raw: Any?) -> ModelSettingsSelection {
    if let stringValue = raw as? String {
        let primary = stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        return ModelSettingsSelection(primaryRef: primary, fallbackRefs: [])
    }

    guard let dict = raw as? [String: Any] else {
        return ModelSettingsSelection(primaryRef: "", fallbackRefs: [])
    }

    let primary = (dict["primary"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let fallbacks = ((dict["fallbacks"] as? [Any]) ?? [])
        .compactMap { ($0 as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }

    return ModelSettingsSelection(primaryRef: primary, fallbackRefs: fallbacks)
}

func normalizeModelSettingsSelection(
    providerId: String,
    primaryRef: String,
    fallbackRefs: [String],
    options: [ModelSettingsOption]
) -> ModelSettingsSelection {
    _ = providerId
    _ = options
    let selectedPrimary = primaryRef.trimmingCharacters(in: .whitespacesAndNewlines)
    let normalizedPrimary = selectedPrimary

    var seen = Set<String>()
    var normalizedFallbacks: [String] = []
    for rawRef in fallbackRefs {
        let ref = rawRef.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !ref.isEmpty else { continue }
        guard ref != normalizedPrimary else { continue }
        guard seen.insert(ref).inserted else { continue }
        normalizedFallbacks.append(ref)
    }

    return ModelSettingsSelection(primaryRef: normalizedPrimary, fallbackRefs: normalizedFallbacks)
}

func buildModelSettingsPayload(primaryRef: String, fallbackRefs: [String]) -> [String: Any]? {
    let primary = primaryRef.trimmingCharacters(in: .whitespacesAndNewlines)
    let normalizedFallbacks = fallbackRefs
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty && $0 != primary }

    guard !primary.isEmpty || !normalizedFallbacks.isEmpty else { return nil }

    var payload: [String: Any] = [:]
    if !primary.isEmpty {
        payload["primary"] = primary
    }
    if !normalizedFallbacks.isEmpty {
        payload["fallbacks"] = normalizedFallbacks
    }
    return payload
}

func sortModelSettingsOptions(
    _ options: [ModelSettingsOption],
    connectedProviderIds: Set<String>) -> [ModelSettingsOption]
{
    options.sorted { lhs, rhs in
        let lhsConnected = connectedProviderIds.contains(lhs.providerId)
        let rhsConnected = connectedProviderIds.contains(rhs.providerId)
        if lhsConnected != rhsConnected {
            return lhsConnected && !rhsConnected
        }

        let lhsProvider = displayProviderName(lhs.providerId)
        let rhsProvider = displayProviderName(rhs.providerId)
        let providerOrder = lhsProvider.localizedCaseInsensitiveCompare(rhsProvider)
        if providerOrder != .orderedSame {
            return providerOrder == .orderedAscending
        }

        return lhs.displayName.localizedCaseInsensitiveCompare(rhs.displayName) == .orderedAscending
    }
}

func filterPrimaryModelSettingsOptions(
    selectedProviderId: String,
    currentPrimaryRef: String,
    options: [ModelSettingsOption]) -> [ModelSettingsOption]
{
    guard !selectedProviderId.isEmpty else { return options }

    return options.filter { $0.providerId == selectedProviderId }
}

func primaryModelMatchesSelectedProvider(selectedProviderId: String, primaryRef: String) -> Bool {
    let provider = selectedProviderId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !provider.isEmpty else { return true }
    guard let currentProvider = modelSettingsProviderId(for: primaryRef) else { return true }
    return currentProvider == provider
}

func displayedPrimaryPickerSelection(selectedProviderId: String, primaryRef: String) -> String {
    primaryModelMatchesSelectedProvider(selectedProviderId: selectedProviderId, primaryRef: primaryRef)
        ? primaryRef
        : ""
}

func displayedPrimaryModelIdForEditing(providerId: String?, primaryRef: String) -> String {
    guard let providerId else { return modelSettingsModelId(for: primaryRef) }
    let trimmedProvider = providerId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedProvider.isEmpty else { return modelSettingsModelId(for: primaryRef) }
    return primaryModelMatchesSelectedProvider(selectedProviderId: trimmedProvider, primaryRef: primaryRef)
        ? modelSettingsModelId(for: primaryRef)
        : ""
}

func nextAvailableFallbackRef(
    preferredProviderId: String? = nil,
    primaryRef: String,
    fallbackRefs: [String],
    options: [ModelSettingsOption]) -> String?
{
    let taken = Set(fallbackRefs).union(primaryRef.isEmpty ? [] : [primaryRef])
    let preferredProvider = preferredProviderId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if !preferredProvider.isEmpty,
       let preferred = options.first(where: { option in
           option.providerId == preferredProvider && !taken.contains(option.ref)
       })
    {
        return preferred.ref
    }
    return options.first(where: { !taken.contains($0.ref) })?.ref
}

func resolveProviderConnectCompletionProviderId(
    previousProviderIds: Set<String>,
    currentProviderIds: Set<String>,
    preferredProviderId: String?) -> String?
{
    let preferredProvider = preferredProviderId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if !preferredProvider.isEmpty, currentProviderIds.contains(preferredProvider) {
        return preferredProvider
    }

    let newlyConnected = currentProviderIds.subtracting(previousProviderIds)
    if !newlyConnected.isEmpty {
        return newlyConnected.sorted {
            $0.localizedCaseInsensitiveCompare($1) == .orderedAscending
        }.first
    }

    return nil
}

func buildVisibleModelSettingsOptions(
    catalogOptions: [ModelSettingsOption],
    modelOptions: [ModelSettingsOption],
    savedRefs: [String],
    connectedProviderIds: Set<String>) -> [ModelSettingsOption]
{
    var mergedByRef: [String: ModelSettingsOption] = [:]

    for option in catalogOptions where connectedProviderIds.contains(option.providerId) {
        mergedByRef[option.ref] = option
    }
    for option in modelOptions where connectedProviderIds.contains(option.providerId) {
        mergedByRef[option.ref] = option
    }

    for ref in savedRefs {
        guard modelSettingsProviderId(for: ref) != nil else { continue }
        guard mergedByRef[ref] == nil else { continue }
        if let synthetic = makeModelOption(
            ref: ref,
            displayName: modelSettingsModelId(for: ref),
            contextWindow: nil,
            reasoning: false,
            synthetic: true)
        {
            mergedByRef[ref] = synthetic
        }
    }

    return sortModelSettingsOptions(Array(mergedByRef.values), connectedProviderIds: connectedProviderIds)
}

private func displayProviderName(_ providerId: String) -> String {
    switch providerId.lowercased() {
    case "anthropic":
        "Anthropic"
    case "deepseek":
        "DeepSeek"
    case "google":
        "Google"
    case "openai":
        "OpenAI"
    case "openai-codex":
        "OpenAI Codex"
    case "openrouter":
        "OpenRouter"
    case "xai":
        "xAI"
    default:
        providerId
    }
}

private func orderProviderIds(_ providerIds: Set<String>, preferredProviderId: String) -> [String] {
    let sorted = providerIds.sorted { lhs, rhs in
        lhs.localizedCaseInsensitiveCompare(rhs) == .orderedAscending
    }
    guard !preferredProviderId.isEmpty, let index = sorted.firstIndex(of: preferredProviderId) else {
        return sorted
    }
    var ordered = sorted
    let preferred = ordered.remove(at: index)
    ordered.insert(preferred, at: 0)
    return ordered
}

private func makeModelOption(ref: String, displayName: String, contextWindow: Int?, reasoning: Bool, synthetic: Bool) -> ModelSettingsOption? {
    let trimmedRef = ref.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let providerId = modelSettingsProviderId(for: trimmedRef) else { return nil }
    let modelId = String(trimmedRef.split(separator: "/", maxSplits: 1, omittingEmptySubsequences: false).dropFirst().first ?? "")
        .trimmingCharacters(in: .whitespacesAndNewlines)
    guard !modelId.isEmpty else { return nil }
    return ModelSettingsOption(
        ref: trimmedRef,
        providerId: providerId,
        modelId: modelId,
        displayName: displayName,
        contextWindow: contextWindow,
        reasoning: reasoning,
        synthetic: synthetic)
}

private struct ModelsSettingsStatusState {
    let text: String
    let tint: Color
    let showsProgress: Bool
}

private struct ModelsSettingsStatusBanner: View {
    let state: ModelsSettingsStatusState

    private var iconName: String {
        if self.state.showsProgress {
            return ""
        }
        return self.state.tint == .orange ? "exclamationmark.triangle.fill" : "info.circle.fill"
    }

    var body: some View {
        HStack(spacing: 10) {
            if self.state.showsProgress {
                ProgressView()
                    .controlSize(.small)
            } else {
                Image(systemName: self.iconName)
                    .foregroundStyle(self.state.tint)
            }

            Text(self.state.text)
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(self.state.tint.opacity(0.10)))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(self.state.tint.opacity(0.20), lineWidth: 1))
    }
}

struct ModelsSettings: View {
    private enum ProviderConnectIntent {
        case generic
        case fallback
    }

    @Bindable var store: ChannelsStore
    private let isPreview = ProcessInfo.processInfo.isPreview
    private let isNixMode = ProcessInfo.processInfo.isNixMode
    @State private var hasLoaded = false
    @State private var settingsLoading = false
    @State private var modelsLoading = false
    @State private var modelsError: String?
    @State private var modelOptions: [ModelSettingsOption] = []
    @State private var catalogOptions: [ModelSettingsOption] = []
    @State private var selectedProviderId: String = ""
    @State private var primaryRef: String = ""
    @State private var fallbackRefs: [String] = []
    @State private var customFallbackProviderDrafts: [Int: String] = [:]
    @State private var didHydrateSelection = false
    @State private var prefersCustomPrimaryEntry = false
    @State private var providerConnectSheetPresented = false
    @State private var providerConnectLoading = false
    @State private var providerConnectError: String?
    @State private var providerConnectGroups: [ModelAuthChoiceGroup] = []
    @State private var providerConnectSelectedGroupId: String = ""
    @State private var providerConnectSelectedChoiceId: String = ""
    @State private var providerConnectWizard = OnboardingWizardModel()
    @State private var preservedDraftSelectionBeforeProviderConnect: ModelSettingsSelection?
    @State private var providerConnectIntent: ProviderConnectIntent = .generic
    @State private var providerConnectStartingConnectedProviderIds: Set<String> = []
    @State private var providerConnectRequestedProviderId: String?

    private let modelConfigPath: ConfigPath = [.key("agents"), .key("defaults"), .key("model")]

    init(store: ChannelsStore = .shared) {
        self.store = store
    }

    private var language: OnboardingLanguage {
        AppStateStore.shared.effectiveOnboardingLanguage
    }

    private var draftSelection: ModelSettingsSelection {
        guard self.didHydrateSelection else {
            return resolveModelSettingsSelection(from: self.store.configValue(at: self.modelConfigPath))
        }
        return ModelSettingsSelection(primaryRef: self.primaryRef, fallbackRefs: self.fallbackRefs)
    }

    private var connectedProviderIds: Set<String> {
        var providers = Set<String>()
        if let profiles = self.store.configValue(at: [.key("auth"), .key("profiles")]) as? [String: Any] {
            for value in profiles.values {
                guard let dict = value as? [String: Any] else { continue }
                let provider = (dict["provider"] as? String)?
                    .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                guard !provider.isEmpty else { continue }
                providers.insert(provider)
            }
        }

        let currentSelection = self.draftSelection
        if let provider = modelSettingsProviderId(for: currentSelection.primaryRef) {
            providers.insert(provider)
        }
        for provider in currentSelection.fallbackRefs.compactMap(modelSettingsProviderId(for:)) {
            providers.insert(provider)
        }

        return providers
    }

    private var providerIds: [String] {
        let preferred = !self.selectedProviderId.isEmpty ? self.selectedProviderId : self.draftSelection.providerId
        return orderProviderIds(self.connectedProviderIds, preferredProviderId: preferred)
    }

    private var visibleOptions: [ModelSettingsOption] {
        buildVisibleModelSettingsOptions(
            catalogOptions: self.catalogOptions,
            modelOptions: self.modelOptions,
            savedRefs: [self.primaryRef] + self.fallbackRefs,
            connectedProviderIds: self.connectedProviderIds)
    }

    private var primaryOptions: [ModelSettingsOption] {
        filterPrimaryModelSettingsOptions(
            selectedProviderId: self.selectedProviderId,
            currentPrimaryRef: self.primaryRef,
            options: self.visibleOptions)
    }

    private var orderedConnectedProviderIds: [String] {
        orderProviderIds(self.connectedProviderIds, preferredProviderId: self.selectedProviderId)
    }

    private var isRefreshingSettings: Bool {
        self.settingsLoading || self.modelsLoading
    }

    private var controlsDisabled: Bool {
        self.isNixMode || self.isRefreshingSettings || self.store.isSavingConfig
    }

    private var statusBannerState: ModelsSettingsStatusState? {
        if self.store.isSavingConfig {
            return ModelsSettingsStatusState(
                text: macLocalized("Saving…", language: self.language),
                tint: .accentColor,
                showsProgress: true)
        }
        if self.isRefreshingSettings {
            return ModelsSettingsStatusState(
                text: macLocalized("Loading models…", language: self.language),
                tint: .accentColor,
                showsProgress: true)
        }
        if let modelsError = self.modelsError, !modelsError.isEmpty {
            return ModelsSettingsStatusState(text: modelsError, tint: .orange, showsProgress: false)
        }
        if let status = self.store.configStatus, !status.isEmpty {
            return ModelsSettingsStatusState(
                text: macWizardText(status, language: self.language) ?? status,
                tint: .secondary,
                showsProgress: false)
        }
        return nil
    }

    private var hasRemainingFallbackOptions: Bool {
        nextAvailableFallbackRef(
            primaryRef: self.primaryRef,
            fallbackRefs: self.fallbackRefs,
            options: self.visibleOptions) != nil
    }

    private var usesManualModelEntry: Bool {
        self.prefersCustomPrimaryEntry || self.primaryOptions.isEmpty
    }

    private var manualPrimaryProviderId: String? {
        if !self.selectedProviderId.isEmpty {
            return self.selectedProviderId
        }
        if let current = modelSettingsProviderId(for: self.primaryRef) {
            return current
        }
        return self.providerIds.first
    }

    private var manualPrimaryModelIdBinding: Binding<String> {
        Binding(
            get: {
                displayedPrimaryModelIdForEditing(
                    providerId: self.manualPrimaryProviderId,
                    primaryRef: self.primaryRef)
            },
            set: { newValue in
                guard let providerId = self.manualPrimaryProviderId else {
                    self.primaryRef = ""
                    return
                }
                self.primaryRef = buildModelSettingsRef(providerId: providerId, modelId: newValue)
            })
    }

    private var primaryPickerSelectionBinding: Binding<String> {
        Binding(
            get: {
                displayedPrimaryPickerSelection(
                    selectedProviderId: self.selectedProviderId,
                    primaryRef: self.primaryRef)
            },
            set: { newValue in
                self.primaryRef = newValue
            })
    }

    private var isSelectingReplacementPrimary: Bool {
        !self.primaryRef.isEmpty &&
        !primaryModelMatchesSelectedProvider(
            selectedProviderId: self.selectedProviderId,
            primaryRef: self.primaryRef)
    }

    private var currentPrimarySummary: String {
        guard !self.primaryRef.isEmpty else { return macLocalized("Not set", language: self.language) }
        if let option = self.visibleOptions.first(where: { $0.ref == self.primaryRef }) {
            return option.menuLabel
        }
        return self.primaryRef
    }

    var body: some View {
        ScrollView(.vertical) {
            VStack(alignment: .leading, spacing: 18) {
                self.header
                if let statusBannerState {
                    ModelsSettingsStatusBanner(state: statusBannerState)
                }
                self.actionRow
                self.defaultsSection
                self.fallbackSection
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 24)
            .padding(.vertical, 18)
        }
        .task {
            await self.initialLoadIfNeeded()
        }
        .sheet(isPresented: self.$providerConnectSheetPresented) {
            ModelProviderConnectSheet(
                wizard: self.providerConnectWizard,
                language: self.language,
                groups: self.providerConnectGroups,
                connectedProviderIds: self.connectedProviderIds,
                isLoadingChoices: self.providerConnectLoading,
                choicesError: self.providerConnectError,
                selectedGroupId: self.$providerConnectSelectedGroupId,
                selectedChoiceId: self.$providerConnectSelectedChoiceId,
                retryChoices: {
                    Task { await self.loadProviderConnectChoices() }
                },
                startSelectedChoice: {
                    Task { await self.startProviderConnectWizard() }
                },
                cancel: {
                    Task { await self.dismissProviderConnectSheet() }
                })
        }
        .onChange(of: self.primaryRef) { _, newValue in
            guard self.didHydrateSelection else { return }
            if newValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                self.fallbackRefs = []
            } else {
                self.fallbackRefs = normalizeModelSettingsSelection(
                    providerId: self.selectedProviderId,
                    primaryRef: newValue,
                    fallbackRefs: self.fallbackRefs,
                    options: self.visibleOptions).fallbackRefs
            }
            self.syncSelectedProviderFromPrimary()
            self.syncDraftFromSelection()
        }
        .onChange(of: self.providerConnectWizard.status) { _, newValue in
            guard newValue == "done" else { return }
            Task { await self.finishProviderConnectWizard() }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(macLocalized("Models", language: self.language))
                .font(.title3.weight(.semibold))
            Text(self.isNixMode
                ? macLocalized("This tab is read-only in Nix mode. Edit model defaults via Nix and rebuild.", language: self.language)
                : macLocalized("These defaults start with what you chose during onboarding. Update the primary model and fallback order here.", language: self.language))
                .font(.callout)
                .foregroundStyle(.secondary)
        }
    }

    private var actionRow: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .center, spacing: 12) {
                self.actionButtons
                Spacer(minLength: 12)
                self.actionMetadata
            }

            VStack(alignment: .leading, spacing: 10) {
                self.actionButtons
                self.actionMetadata
            }
        }
    }

    private var actionButtons: some View {
        HStack(spacing: 10) {
            SettingsRefreshButton(isLoading: self.isRefreshingSettings) {
                Task { await self.reloadSettingsState() }
            }

            Button(self.store.isSavingConfig
                ? macLocalized("Saving…", language: self.language)
                : macLocalized("Save", language: self.language))
            {
                Task { await self.saveSettingsState() }
            }
            .disabled(self.controlsDisabled || !self.store.configDirty)
        }
        .buttonStyle(.bordered)
    }

    @ViewBuilder
    private var actionMetadata: some View {
        HStack(spacing: 8) {
            if self.store.configDirty, !self.isNixMode {
                StatusPill(text: macLocalized("Unsaved changes", language: self.language), tint: .orange)
            } else if self.connectedProviderIds.isEmpty {
                StatusPill(text: macLocalized("Not configured", language: self.language), tint: .secondary)
            }
        }
    }

    private var defaultsSection: some View {
        self.sectionCard(
            title: macLocalized("Model Defaults", language: self.language),
            subtitle: macLocalized(
                "Pick the model Maumau should use by default.",
                language: self.language))
        {
            if !self.providerIds.isEmpty {
                self.connectProviderButton(intent: .generic)
            }
        } content: {
            if self.providerIds.isEmpty {
                self.emptyState(
                    message: macLocalized(
                        "Connect a provider before choosing a model.",
                        language: self.language),
                    actionLabel: macLocalized("Connect model provider", language: self.language),
                    intent: .generic)
            } else {
                VStack(alignment: .leading, spacing: 14) {
                    self.configuredProvidersBlock

                    if self.providerIds.count > 1 {
                        self.fieldBlock(macLocalized("Provider", language: self.language)) {
                            Picker("", selection: self.$selectedProviderId) {
                                ForEach(self.providerIds, id: \.self) { providerId in
                                    Text(displayProviderName(providerId)).tag(providerId)
                                }
                            }
                            .labelsHidden()
                            .disabled(self.controlsDisabled)
                        }
                    }

                    if self.isSelectingReplacementPrimary {
                        self.insetSurface {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(macLocalized("Current primary", language: self.language))
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                Text(self.currentPrimarySummary)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                                Text(macLocalized(
                                    "Choosing a model here will replace the current primary.",
                                    language: self.language))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }

                    if self.usesManualModelEntry {
                        if let manualProviderId = self.manualPrimaryProviderId {
                            self.fieldBlock(
                                macLocalized("Primary model", language: self.language),
                                help: macLocalized(
                                    "This only changes the model ID for the selected provider.",
                                    language: self.language))
                            {
                                VStack(alignment: .leading, spacing: 8) {
                                    StatusPill(text: displayProviderName(manualProviderId), tint: .accentColor)

                                    TextField(
                                        macLocalized("Model ID", language: self.language),
                                        text: self.manualPrimaryModelIdBinding,
                                        prompt: Text("gpt-5.4"))
                                        .textFieldStyle(.roundedBorder)
                                        .disabled(self.controlsDisabled)
                                }
                            }

                            if !self.primaryOptions.isEmpty {
                                Button(macLocalized("Choose from catalog", language: self.language)) {
                                    self.switchPrimaryEntryMode(useCustom: false)
                                }
                                .buttonStyle(.bordered)
                                .disabled(self.controlsDisabled)
                            }
                        }
                    } else {
                        self.fieldBlock(macLocalized("Primary model", language: self.language)) {
                            Picker("", selection: self.primaryPickerSelectionBinding) {
                                Text(macLocalized("Not set", language: self.language)).tag("")
                                ForEach(self.primaryOptions) { option in
                                    Text(option.menuLabel).tag(option.ref)
                                }
                            }
                            .labelsHidden()
                            .disabled(self.controlsDisabled)
                        }

                        Button(macLocalized("Use custom model ID", language: self.language)) {
                            self.switchPrimaryEntryMode(useCustom: true)
                        }
                        .buttonStyle(.bordered)
                        .disabled(self.controlsDisabled)
                    }

                    if self.primaryOptions.isEmpty && !self.modelsLoading && !self.providerIds.isEmpty {
                        Text(macLocalized(
                            "No models available for this provider.",
                            language: self.language))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    private var fallbackSection: some View {
        self.sectionCard(
            title: macLocalized("Fallback Order", language: self.language),
            subtitle: macLocalized(
                "If the primary model fails, Maumau tries these next.",
                language: self.language))
        {
            if !self.providerIds.isEmpty {
                self.connectProviderButton(intent: .fallback)
            }
        } content: {
            if self.providerIds.isEmpty {
                self.emptyState(
                    message: macLocalized(
                        "Connect a provider before adding fallbacks.",
                        language: self.language),
                    actionLabel: macLocalized("Connect model provider", language: self.language),
                    intent: .fallback)
            } else {
                VStack(alignment: .leading, spacing: 14) {
                    Text(macLocalized(
                        "Fallbacks use the providers you already connected.",
                        language: self.language))
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    self.fallbackActions

                    if self.fallbackRefs.isEmpty {
                        self.insetSurface {
                            Text(macLocalized("No fallback models yet.", language: self.language))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }

                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(Array(self.fallbackRefs.enumerated()), id: \.offset) { index, _ in
                            self.fallbackRowCard(index: index)
                        }
                    }

                    if !self.hasRemainingFallbackOptions, !self.primaryRef.isEmpty {
                        Text(macLocalized(
                            "Need another model before you can add a fallback. Connect another provider first.",
                            language: self.language))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    private var configuredProvidersBlock: some View {
        self.fieldBlock(macLocalized("Configured", language: self.language)) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(self.orderedConnectedProviderIds, id: \.self) { providerId in
                        StatusPill(
                            text: displayProviderName(providerId),
                            tint: providerId == self.selectedProviderId ? .accentColor : .secondary)
                    }
                }
                .padding(.vertical, 1)
            }
        }
    }

    private var fallbackActions: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 10) {
                self.addFallbackButton
                self.addCustomFallbackButton
            }

            VStack(alignment: .leading, spacing: 8) {
                self.addFallbackButton
                self.addCustomFallbackButton
            }
        }
    }

    private var addFallbackButton: some View {
        Button {
            self.addFallback()
        } label: {
            Label(macLocalized("Add fallback", language: self.language), systemImage: "plus")
        }
        .buttonStyle(.bordered)
        .disabled(self.controlsDisabled || self.primaryRef.isEmpty || !self.hasRemainingFallbackOptions)
    }

    private var addCustomFallbackButton: some View {
        Button {
            self.addCustomFallback()
        } label: {
            Label(macLocalized("Add custom fallback", language: self.language), systemImage: "square.and.pencil")
        }
        .buttonStyle(.bordered)
        .disabled(self.controlsDisabled || self.primaryRef.isEmpty || self.providerIds.isEmpty)
    }

    private func connectProviderButton(intent: ProviderConnectIntent) -> some View {
        Button {
            Task { await self.presentProviderConnectSheet(intent: intent) }
        } label: {
            Label(
                macLocalized("Connect another provider", language: self.language),
                systemImage: "plus.circle")
        }
        .buttonStyle(.bordered)
        .disabled(self.controlsDisabled)
    }

    private func emptyState(
        message: String,
        actionLabel: String,
        intent: ProviderConnectIntent
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(message)
                .font(.caption)
                .foregroundStyle(.secondary)

            Button {
                Task { await self.presentProviderConnectSheet(intent: intent) }
            } label: {
                Label(actionLabel, systemImage: "plus.circle")
            }
            .buttonStyle(.borderedProminent)
            .disabled(self.controlsDisabled)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color(nsColor: .controlBackgroundColor).opacity(0.35)))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.08), lineWidth: 1))
    }

    private func fallbackRowCard(index: Int) -> some View {
        self.insetSurface {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .center, spacing: 10) {
                    Text("\(macLocalized("Fallback model", language: self.language)) \(index + 1)")
                        .font(.callout.weight(.semibold))

                    Spacer(minLength: 0)

                    Button(macLocalized("Remove", language: self.language)) {
                        self.removeFallback(at: index)
                    }
                    .disabled(self.controlsDisabled)
                }

                if self.shouldUseCustomFallbackEntry(at: index) {
                    self.fieldBlock(macLocalized("Provider", language: self.language)) {
                        Picker("", selection: self.customFallbackProviderBinding(for: index)) {
                            ForEach(self.providerIds, id: \.self) { providerId in
                                Text(displayProviderName(providerId)).tag(providerId)
                            }
                        }
                        .labelsHidden()
                        .disabled(self.controlsDisabled)
                    }

                    self.fieldBlock(macLocalized("Model ID", language: self.language)) {
                        TextField(
                            "\(macLocalized("Fallback model", language: self.language)) \(index + 1)",
                            text: self.customFallbackModelIdBinding(for: index),
                            prompt: Text("gpt-5.4-mini"))
                            .textFieldStyle(.roundedBorder)
                            .disabled(self.controlsDisabled)
                    }
                } else {
                    self.fieldBlock("\(macLocalized("Fallback model", language: self.language)) \(index + 1)") {
                        Picker("", selection: self.fallbackBinding(for: index)) {
                            ForEach(self.fallbackOptions(for: index)) { option in
                                Text(option.menuLabel).tag(option.ref)
                            }
                        }
                        .labelsHidden()
                        .disabled(self.controlsDisabled || self.fallbackOptions(for: index).isEmpty)
                    }
                }
            }
        }
    }

    private func sectionCard<Accessory: View, Content: View>(
        title: String,
        subtitle: String,
        @ViewBuilder accessory: () -> Accessory,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(title)
                            .font(.title3.weight(.semibold))
                        Text(subtitle)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    Spacer(minLength: 12)
                    accessory()
                }

                VStack(alignment: .leading, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(title)
                            .font(.title3.weight(.semibold))
                        Text(subtitle)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    accessory()
                }
            }

            content()
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color(nsColor: .controlBackgroundColor).opacity(0.38)))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.08), lineWidth: 1))
    }

    private func fieldBlock<Content: View>(
        _ label: String,
        help: String? = nil,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label)
                .font(.callout.weight(.medium))
            content()
            if let help, !help.isEmpty {
                Text(help)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func insetSurface<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            content()
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color(nsColor: .controlBackgroundColor).opacity(0.30)))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.07), lineWidth: 1))
    }

    private func fallbackBinding(for index: Int) -> Binding<String> {
        Binding(
            get: {
                guard self.fallbackRefs.indices.contains(index) else { return "" }
                return self.fallbackRefs[index]
            },
            set: { newValue in
                guard self.fallbackRefs.indices.contains(index) else { return }
                self.customFallbackProviderDrafts.removeValue(forKey: index)
                self.fallbackRefs[index] = newValue
                self.fallbackRefs = normalizeModelSettingsSelection(
                    providerId: self.selectedProviderId,
                    primaryRef: self.primaryRef,
                    fallbackRefs: self.fallbackRefs,
                    options: self.visibleOptions).fallbackRefs
                self.syncDraftFromSelection()
            })
    }

    private func fallbackOptions(for index: Int) -> [ModelSettingsOption] {
        let currentRef = self.fallbackRefs.indices.contains(index) ? self.fallbackRefs[index] : ""
        let reservedRefs = Set(self.fallbackRefs.enumerated().compactMap { offset, ref in
            offset == index ? nil : ref
        }).union(self.primaryRef.isEmpty ? [] : [self.primaryRef])
        return self.visibleOptions.filter { option in
            option.ref == currentRef || !reservedRefs.contains(option.ref)
        }
    }

    private func shouldUseCustomFallbackEntry(at index: Int) -> Bool {
        guard self.fallbackRefs.indices.contains(index) else { return true }
        let ref = self.fallbackRefs[index].trimmingCharacters(in: .whitespacesAndNewlines)
        guard !ref.isEmpty else { return true }
        return !self.visibleOptions.contains(where: { $0.ref == ref })
    }

    private func customFallbackProviderId(at index: Int) -> String {
        if self.fallbackRefs.indices.contains(index),
           let providerId = modelSettingsProviderId(for: self.fallbackRefs[index])
        {
            return providerId
        }
        if let draft = self.customFallbackProviderDrafts[index], !draft.isEmpty {
            return draft
        }
        if !self.selectedProviderId.isEmpty {
            return self.selectedProviderId
        }
        return self.providerIds.first ?? ""
    }

    private func customFallbackProviderBinding(for index: Int) -> Binding<String> {
        Binding(
            get: {
                self.customFallbackProviderId(at: index)
            },
            set: { newValue in
                guard self.fallbackRefs.indices.contains(index) else { return }
                self.customFallbackProviderDrafts[index] = newValue
                let modelId = modelSettingsModelId(for: self.fallbackRefs[index])
                guard !modelId.isEmpty else { return }
                self.fallbackRefs[index] = buildModelSettingsRef(providerId: newValue, modelId: modelId)
                self.fallbackRefs = normalizeModelSettingsSelection(
                    providerId: self.selectedProviderId,
                    primaryRef: self.primaryRef,
                    fallbackRefs: self.fallbackRefs,
                    options: self.visibleOptions).fallbackRefs
                self.syncDraftFromSelection()
            })
    }

    private func customFallbackModelIdBinding(for index: Int) -> Binding<String> {
        Binding(
            get: {
                guard self.fallbackRefs.indices.contains(index) else { return "" }
                return modelSettingsModelId(for: self.fallbackRefs[index])
            },
            set: { newValue in
                guard self.fallbackRefs.indices.contains(index) else { return }
                let providerId = self.customFallbackProviderId(at: index)
                self.customFallbackProviderDrafts[index] = providerId
                self.fallbackRefs[index] = buildModelSettingsRef(providerId: providerId, modelId: newValue)
                self.fallbackRefs = normalizeModelSettingsSelection(
                    providerId: self.selectedProviderId,
                    primaryRef: self.primaryRef,
                    fallbackRefs: self.fallbackRefs,
                    options: self.visibleOptions).fallbackRefs
                self.syncDraftFromSelection()
            })
    }

    @discardableResult
    private func addFallback(preferredProviderId: String? = nil) -> Bool {
        guard let next = nextAvailableFallbackRef(
            preferredProviderId: preferredProviderId,
            primaryRef: self.primaryRef,
            fallbackRefs: self.fallbackRefs,
            options: self.visibleOptions)
        else {
            return false
        }
        self.fallbackRefs.append(next)
        self.fallbackRefs = normalizeModelSettingsSelection(
            providerId: self.selectedProviderId,
            primaryRef: self.primaryRef,
            fallbackRefs: self.fallbackRefs,
            options: self.visibleOptions).fallbackRefs
        self.syncDraftFromSelection()
        return true
    }

    private func addCustomFallback(preferredProviderId: String? = nil) {
        let index = self.fallbackRefs.count
        self.fallbackRefs.append("")
        let preferredProvider = preferredProviderId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !preferredProvider.isEmpty, self.providerIds.contains(preferredProvider) {
            self.customFallbackProviderDrafts[index] = preferredProvider
        } else {
            self.customFallbackProviderDrafts[index] = self.selectedProviderId.isEmpty
                ? (self.providerIds.first ?? "")
                : self.selectedProviderId
        }
        self.syncDraftFromSelection()
    }

    private func removeFallback(at index: Int) {
        guard self.fallbackRefs.indices.contains(index) else { return }
        self.fallbackRefs.remove(at: index)
        self.customFallbackProviderDrafts = Dictionary(uniqueKeysWithValues: self.customFallbackProviderDrafts.compactMap { key, value in
            if key == index {
                return nil
            }
            return (key > index ? key - 1 : key, value)
        })
        self.syncDraftFromSelection()
    }

    private func switchPrimaryEntryMode(useCustom: Bool) {
        if useCustom {
            self.prefersCustomPrimaryEntry = true
            return
        }

        guard !self.primaryOptions.isEmpty else { return }
        self.prefersCustomPrimaryEntry = false
        if !self.primaryRef.isEmpty && !self.primaryOptions.contains(where: { $0.ref == self.primaryRef }) {
            self.primaryRef = ""
        }
    }

    private func syncDraftFromSelection() {
        guard self.didHydrateSelection else { return }
        let payload = buildModelSettingsPayload(primaryRef: self.primaryRef, fallbackRefs: self.fallbackRefs)
        self.store.updateConfigValue(path: self.modelConfigPath, value: payload)
    }

    private func initialSelection() -> ModelSettingsSelection {
        resolveModelSettingsSelection(from: self.store.configValue(at: self.modelConfigPath))
    }

    private func hydrateSelectionFromConfig() {
        let selection = self.initialSelection()
        let preferredProvider = selection.providerId.isEmpty ? (self.providerIds.first ?? "") : selection.providerId
        let options = buildVisibleModelSettingsOptions(
            catalogOptions: self.catalogOptions,
            modelOptions: self.modelOptions,
            savedRefs: [selection.primaryRef] + selection.fallbackRefs,
            connectedProviderIds: self.connectedProviderIds)
        self.selectedProviderId = preferredProvider
        let normalized = normalizeModelSettingsSelection(
            providerId: preferredProvider,
            primaryRef: selection.primaryRef,
            fallbackRefs: selection.fallbackRefs,
            options: options)
        self.primaryRef = normalized.primaryRef
        self.fallbackRefs = normalized.fallbackRefs
        self.prefersCustomPrimaryEntry =
            !self.primaryRef.isEmpty &&
            !filterPrimaryModelSettingsOptions(
                selectedProviderId: preferredProvider,
                currentPrimaryRef: self.primaryRef,
                options: options).contains(where: { $0.ref == self.primaryRef })
        self.didHydrateSelection = true
    }

    private func syncSelectedProviderFromPrimary() {
        guard let providerId = modelSettingsProviderId(for: self.primaryRef) else { return }
        guard providerId != self.selectedProviderId else { return }
        self.selectedProviderId = providerId
    }

    @MainActor
    private func presentProviderConnectSheet(intent: ProviderConnectIntent = .generic) async {
        self.preservedDraftSelectionBeforeProviderConnect = self.store.configDirty ? self.draftSelection : nil
        self.providerConnectIntent = intent
        self.providerConnectStartingConnectedProviderIds = self.connectedProviderIds
        self.providerConnectRequestedProviderId = nil
        await self.providerConnectWizard.cancelIfRunning()
        self.providerConnectWizard.reset()
        self.providerConnectError = nil
        self.providerConnectGroups = []
        self.providerConnectSelectedGroupId = ""
        self.providerConnectSelectedChoiceId = ""
        self.providerConnectSheetPresented = true
        await self.loadProviderConnectChoices()
    }

    @MainActor
    private func dismissProviderConnectSheet() async {
        await self.providerConnectWizard.cancelIfRunning()
        self.providerConnectWizard.reset()
        self.providerConnectSheetPresented = false
        self.providerConnectLoading = false
        self.providerConnectGroups = []
        self.providerConnectError = nil
        self.providerConnectSelectedGroupId = ""
        self.providerConnectSelectedChoiceId = ""
        self.preservedDraftSelectionBeforeProviderConnect = nil
        self.providerConnectIntent = .generic
        self.providerConnectStartingConnectedProviderIds = []
        self.providerConnectRequestedProviderId = nil
    }

    @MainActor
    private func loadProviderConnectChoices() async {
        self.providerConnectLoading = true
        defer { self.providerConnectLoading = false }

        do {
            let response: ModelAuthChoicesResponse = try await GatewayConnection.shared.requestDecoded(
                method: .modelsAuthChoices,
                params: nil,
                timeoutMs: 10000)
            self.providerConnectGroups = response.groups
            if let selection = resolveModelAuthSelection(
                groups: response.groups,
                preferredGroupId: self.providerConnectSelectedGroupId,
                preferredChoiceId: self.providerConnectSelectedChoiceId)
            {
                self.providerConnectSelectedGroupId = selection.groupId
                self.providerConnectSelectedChoiceId = selection.choiceId
            } else {
                self.providerConnectSelectedGroupId = ""
                self.providerConnectSelectedChoiceId = ""
            }
            self.providerConnectError = response.groups.isEmpty
                ? macLocalized("No provider choices are available right now.", language: self.language)
                : nil
        } catch {
            self.providerConnectError = macLocalized(error.localizedDescription, language: self.language)
        }
    }

    @MainActor
    private func startProviderConnectWizard() async {
        guard let selection = resolveModelAuthSelection(
            groups: self.providerConnectGroups,
            preferredGroupId: self.providerConnectSelectedGroupId,
            preferredChoiceId: self.providerConnectSelectedChoiceId)
        else {
            return
        }
        self.providerConnectSelectedGroupId = selection.groupId
        self.providerConnectSelectedChoiceId = selection.choiceId
        self.providerConnectRequestedProviderId = self.providerConnectGroups
            .first(where: { $0.id == selection.groupId })?
            .options
            .first(where: { $0.id == selection.choiceId })?
            .providerId
        self.providerConnectError = nil
        await self.providerConnectWizard.startModelAuthIfNeeded(authChoice: selection.choiceId)
    }

    @MainActor
    private func finishProviderConnectWizard() async {
        let preservedDraft = self.preservedDraftSelectionBeforeProviderConnect
        let connectIntent = self.providerConnectIntent
        let startingConnectedProviderIds = self.providerConnectStartingConnectedProviderIds
        let requestedProviderId = self.providerConnectRequestedProviderId
        await self.store.loadConfig()
        await self.reloadModelCatalog()
        self.didHydrateSelection = false
        self.hydrateSelectionFromConfig()
        if let preservedDraft {
            self.restoreDraftSelection(preservedDraft)
        }
        if connectIntent == .fallback, !self.primaryRef.isEmpty {
            let connectedProviderId = resolveProviderConnectCompletionProviderId(
                previousProviderIds: startingConnectedProviderIds,
                currentProviderIds: self.connectedProviderIds,
                preferredProviderId: requestedProviderId)
            if !self.addFallback(preferredProviderId: connectedProviderId),
               let connectedProviderId
            {
                self.addCustomFallback(preferredProviderId: connectedProviderId)
            }
        }
        self.store.configStatus = macLocalized(
            "Provider connected. Choose a model below, then save when you're ready.",
            language: self.language)
        self.providerConnectSheetPresented = false
        await self.providerConnectWizard.cancelIfRunning()
        self.providerConnectWizard.reset()
        self.providerConnectLoading = false
        self.providerConnectGroups = []
        self.providerConnectError = nil
        self.providerConnectSelectedGroupId = ""
        self.providerConnectSelectedChoiceId = ""
        self.preservedDraftSelectionBeforeProviderConnect = nil
        self.providerConnectIntent = .generic
        self.providerConnectStartingConnectedProviderIds = []
        self.providerConnectRequestedProviderId = nil
    }

    private func restoreDraftSelection(_ selection: ModelSettingsSelection) {
        let preferredProvider = selection.providerId.isEmpty ? (self.providerIds.first ?? "") : selection.providerId
        let normalized = normalizeModelSettingsSelection(
            providerId: preferredProvider,
            primaryRef: selection.primaryRef,
            fallbackRefs: selection.fallbackRefs,
            options: self.visibleOptions)
        self.selectedProviderId = preferredProvider
        self.primaryRef = normalized.primaryRef
        self.fallbackRefs = normalized.fallbackRefs
        self.prefersCustomPrimaryEntry =
            !self.primaryRef.isEmpty &&
            !filterPrimaryModelSettingsOptions(
                selectedProviderId: preferredProvider,
                currentPrimaryRef: self.primaryRef,
                options: self.visibleOptions).contains(where: { $0.ref == self.primaryRef })
        self.didHydrateSelection = true
        self.syncDraftFromSelection()
    }

    @MainActor
    private func initialLoadIfNeeded() async {
        guard !self.hasLoaded else { return }
        self.hasLoaded = true
        self.settingsLoading = true
        defer { self.settingsLoading = false }

        if !self.store.configLoaded, !self.isPreview {
            await self.store.loadConfig()
        }
        await self.reloadModelCatalog()
        self.hydrateSelectionFromConfig()
    }

    @MainActor
    private func reloadSettingsState() async {
        self.settingsLoading = true
        defer { self.settingsLoading = false }
        await self.store.reloadConfigDraft()
        await self.reloadModelCatalog()
        self.didHydrateSelection = false
        self.hydrateSelectionFromConfig()
    }

    @MainActor
    private func saveSettingsState() async {
        self.syncDraftFromSelection()
        await self.store.saveConfigDraft()
        self.didHydrateSelection = false
        self.hydrateSelectionFromConfig()
    }

    @MainActor
    private func reloadModelCatalog() async {
        self.modelsLoading = true
        self.modelsError = nil
        defer { self.modelsLoading = false }

        var gatewayLoadFailed = false
        do {
            let result: ModelsListResult = try await GatewayConnection.shared.requestDecoded(
                method: .modelsList,
                params: nil,
                timeoutMs: 15000)
            self.modelOptions = result.models.compactMap { model in
                makeModelOption(
                    ref: "\(model.provider)/\(model.id)",
                    displayName: model.name,
                    contextWindow: model.contextwindow,
                    reasoning: model.reasoning ?? false,
                    synthetic: false)
            }
        } catch {
            gatewayLoadFailed = true
            self.modelOptions = []
        }

        do {
            let loaded = try await ModelCatalogLoader.load(from: ModelCatalogLoader.defaultPath)
            self.catalogOptions = loaded.compactMap { model in
                makeModelOption(
                    ref: "\(model.provider)/\(model.id)",
                    displayName: model.name,
                    contextWindow: model.contextWindow,
                    reasoning: false,
                    synthetic: false)
            }
            self.modelsError = nil
        } catch {
            self.catalogOptions = []
            self.modelsError = macLocalized(
                "Could not load models. You can still change them in the Config tab.",
                language: self.language)
        }

        if gatewayLoadFailed && !self.catalogOptions.isEmpty {
            self.modelsError = nil
        }
    }
}
