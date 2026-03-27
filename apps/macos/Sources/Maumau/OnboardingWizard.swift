import Foundation
import Observation
import MaumauKit
import MaumauProtocol
import OSLog
import SwiftUI

private let onboardingWizardLogger = Logger(subsystem: "ai.maumau", category: "onboarding.wizard")

// MARK: - Swift 6 AnyCodable Bridging Helpers

// Bridge between MaumauProtocol.AnyCodable and the local module to avoid
// Swift 6 strict concurrency type conflicts.

private typealias ProtocolAnyCodable = MaumauProtocol.AnyCodable

private func bridgeToLocal(_ value: ProtocolAnyCodable) -> AnyCodable {
    if let data = try? JSONEncoder().encode(value),
       let decoded = try? JSONDecoder().decode(AnyCodable.self, from: data)
    {
        return decoded
    }
    return AnyCodable(value.value)
}

private func bridgeToLocal(_ value: ProtocolAnyCodable?) -> AnyCodable? {
    value.map(bridgeToLocal)
}

@MainActor
@Observable
final class OnboardingWizardModel {
    private struct CompletedStep {
        let value: AnyCodable?
    }

    typealias WizardStartParams = [String: AnyCodable]
    private static let maxAutomaticStepFetches = 8
    private static let progressPollingIntervalNanoseconds: UInt64 = 500_000_000

    private(set) var sessionId: String?
    private(set) var currentStep: WizardStep?
    private(set) var status: String?
    private(set) var errorMessage: String?
    private(set) var stepErrorMessage: String?
    var textDraft = ""
    var confirmDraft = false
    var selectedIndexDraft = 0
    var selectedIndicesDraft: Set<Int> = []
    var isStarting = false
    var isSubmitting = false
    var isRewinding = false
    private var lastStartMode: AppState.ConnectionMode?
    private var lastStartWorkspace: String?
    private var restartAttempts = 0
    private let maxRestartAttempts = 1
    private var completedSteps: [CompletedStep] = []
    private var usingLegacyGatewayCompatibility = false
    private var autoAdvancedCompatibilityStepIDs: Set<String> = []
    private var progressPollingTask: Task<Void, Never>?
    private var progressPollingSessionId: String?

    var isComplete: Bool {
        self.status == "done"
    }

    var isBlocking: Bool {
        if self.isComplete { return false }
        if self.status == "cancelled" || self.status == "error" { return false }
        return true
    }

    var isRunning: Bool {
        self.status == "running"
    }

    var canGoBack: Bool {
        !self.completedSteps.isEmpty && self.currentStep != nil && !self.isStarting && !self.isSubmitting &&
            !self.isRewinding && !self.isShowingProgressStep
    }

    var primaryActionTitle: String? {
        if self.errorMessage != nil { return "Retry" }
        guard let step = self.currentStep else { return nil }
        if Self.isProgressStep(step) { return nil }
        return wizardStepType(step) == "action" ? "Run" : "Continue"
    }

    var isPrimaryActionDisabled: Bool {
        if self.isStarting || self.isSubmitting || self.isRewinding {
            return true
        }
        if self.errorMessage != nil {
            return false
        }
        guard let step = self.currentStep else { return true }
        if Self.isProgressStep(step) { return true }
        return self.isBlocked(step: step)
    }

    var isShowingProgressStep: Bool {
        Self.isProgressStep(self.currentStep)
    }

    func reset() {
        self.cancelProgressPolling()
        self.sessionId = nil
        self.currentStep = nil
        self.status = nil
        self.errorMessage = nil
        self.stepErrorMessage = nil
        self.textDraft = ""
        self.confirmDraft = false
        self.selectedIndexDraft = 0
        self.selectedIndicesDraft = []
        self.isStarting = false
        self.isSubmitting = false
        self.isRewinding = false
        self.restartAttempts = 0
        self.lastStartMode = nil
        self.lastStartWorkspace = nil
        self.completedSteps = []
        self.usingLegacyGatewayCompatibility = false
        self.autoAdvancedCompatibilityStepIDs = []
    }

    func startIfNeeded(mode: AppState.ConnectionMode, workspace: String? = nil) async {
        guard self.sessionId == nil, !self.isStarting, self.status == nil else { return }
        guard mode == .local || mode == .remote else { return }
        if self.shouldSkipWizard(for: mode) {
            self.markCompleteFromPersistedSetup()
            return
        }
        self.isStarting = true
        self.errorMessage = nil
        self.stepErrorMessage = nil
        self.lastStartMode = mode
        self.lastStartWorkspace = workspace
        defer { self.isStarting = false }

        do {
            if mode == .local {
                try await self.ensureLocalGatewayReady()
            }
            self.autoAdvancedCompatibilityStepIDs = []
            let res: WizardStartResult
            do {
                self.usingLegacyGatewayCompatibility = false
                res = try await self.resolveStartResult(
                    try await GatewayConnection.shared.requestDecoded(
                        method: .wizardStart,
                        params: Self.startParams(
                            mode: mode,
                            workspace: workspace,
                            useEmbeddedProtocol: true)))
            } catch {
                guard Self.shouldRetryLegacyStart(for: error) else {
                    throw error
                }
                onboardingWizardLogger.notice("wizard.start retrying with legacy params")
                self.usingLegacyGatewayCompatibility = true
                res = try await self.resolveStartResult(
                    try await GatewayConnection.shared.requestDecoded(
                        method: .wizardStart,
                        params: Self.startParams(
                            mode: mode,
                            workspace: workspace,
                            useEmbeddedProtocol: false)))
            }
            self.applyStartResult(res)
        } catch {
            self.status = "error"
            self.errorMessage = error.localizedDescription
            onboardingWizardLogger.error("start failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func ensureLocalGatewayReady() async throws {
        GatewayProcessManager.shared.clearLastFailure()
        GatewayProcessManager.shared.setActive(true)
        if await GatewayProcessManager.shared.waitForGatewayReady(
            timeout: GatewayProcessManager.localGatewayStartupTimeout)
        {
            return
        }

        let fallback = "Gateway did not become ready. Check that it is running."
        let reason = GatewayProcessManager.shared.lastFailureReason?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        throw NSError(
            domain: "Gateway",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: reason?.isEmpty == false ? reason! : fallback])
    }

    private func resolveStartResult(_ result: WizardStartResult) async throws -> WizardStartResult {
        var resolved = result
        var fetchCount = 0
        while Self.shouldAutoFetchNextStep(done: resolved.done, status: resolved.status, rawStep: resolved.step) {
            fetchCount += 1
            if fetchCount > Self.maxAutomaticStepFetches {
                throw NSError(
                    domain: "Gateway",
                    code: 2,
                    userInfo: [
                        NSLocalizedDescriptionKey: "Wizard did not advance to the next step. Please retry setup."
                    ])
            }
            onboardingWizardLogger.notice("wizard.start awaiting next step from gateway")
            let next: WizardNextResult = try await GatewayConnection.shared.requestDecoded(
                method: .wizardNext,
                params: ["sessionId": AnyCodable(resolved.sessionid)])
            resolved = WizardStartResult(
                sessionid: resolved.sessionid,
                done: next.done,
                step: next.step,
                status: next.status,
                error: next.error)
        }
        return resolved
    }

    private func resolveNextResult(
        sessionId: String,
        result: WizardNextResult) async throws -> WizardNextResult
    {
        var resolved = result
        var fetchCount = 0
        while Self.shouldAutoFetchNextStep(done: resolved.done, status: resolved.status, rawStep: resolved.step) {
            fetchCount += 1
            if fetchCount > Self.maxAutomaticStepFetches {
                throw NSError(
                    domain: "Gateway",
                    code: 2,
                    userInfo: [
                        NSLocalizedDescriptionKey: "Wizard did not advance to the next step. Please retry setup."
                    ])
            }
            onboardingWizardLogger.notice("wizard.next awaiting next step from gateway")
            resolved = try await GatewayConnection.shared.requestDecoded(
                method: .wizardNext,
                params: ["sessionId": AnyCodable(sessionId)])
        }
        return resolved
    }

    static func shouldAutoFetchNextStep(
        done: Bool,
        status: AnyCodable?,
        rawStep: [String: AnyCodable]?) -> Bool
    {
        guard rawStep == nil else { return false }
        guard !done else { return false }
        let normalizedStatus = wizardStatusString(status) ?? "running"
        return normalizedStatus == "running"
    }

    func submit(step: WizardStep, value: AnyCodable?) async {
        await self.submitInternal(step: step, value: value, rememberStep: true)
    }

    private func submitInternal(
        step: WizardStep,
        value: AnyCodable?,
        rememberStep: Bool) async
    {
        guard let sessionId, !self.isSubmitting else { return }
        self.isSubmitting = true
        self.errorMessage = nil
        self.stepErrorMessage = nil
        defer { self.isSubmitting = false }

        do {
            var params: [String: AnyCodable] = ["sessionId": AnyCodable(sessionId)]
            var answer: [String: AnyCodable] = ["stepId": AnyCodable(step.id)]
            if let value {
                answer["value"] = value
            }
            params["answer"] = AnyCodable(answer)
            let res: WizardNextResult = try await self.resolveNextResult(
                sessionId: sessionId,
                result: try await GatewayConnection.shared.requestDecoded(
                    method: .wizardNext,
                    params: params))
            if rememberStep {
                self.completedSteps.append(CompletedStep(value: value))
            }
            self.applyNextResult(res)
        } catch {
            if self.restartIfSessionLost(error: error) {
                return
            }
            if self.handleStepValidationError(error: error) {
                return
            }
            self.status = "error"
            self.errorMessage = error.localizedDescription
            onboardingWizardLogger.error("submit failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func goBackOneStep() async {
        guard self.canGoBack else { return }
        guard let mode = self.lastStartMode else { return }
        let workspace = self.lastStartWorkspace
        let replaySteps = Array(self.completedSteps.dropLast())
        self.isRewinding = true
        defer { self.isRewinding = false }

        await self.cancelIfRunning()
        self.reset()
        await self.startIfNeeded(mode: mode, workspace: workspace)
        guard self.errorMessage == nil else { return }

        for replay in replaySteps {
            guard let step = self.currentStep else { break }
            await self.submitInternal(step: step, value: replay.value, rememberStep: true)
            if self.errorMessage != nil || self.status == "error" {
                return
            }
        }
    }

    func cancelIfRunning() async {
        guard let sessionId else { return }
        do {
            let res: WizardStatusResult = try await GatewayConnection.shared.requestDecoded(
                method: .wizardCancel,
                params: ["sessionId": AnyCodable(sessionId)])
            self.applyStatusResult(res)
        } catch {
            if let gatewayError = error as? GatewayResponseError,
               gatewayError.code == ErrorCode.invalidRequest.rawValue,
               gatewayError.message.lowercased().contains("wizard not found")
            {
                self.sessionId = nil
                self.currentStep = nil
                self.status = "cancelled"
                self.errorMessage = nil
                self.stepErrorMessage = nil
                return
            }
            self.status = "error"
            self.errorMessage = error.localizedDescription
            onboardingWizardLogger.error("cancel failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func retry(mode: AppState.ConnectionMode, workspace: String? = nil) async {
        await self.cancelIfRunning()
        self.reset()
        await self.startIfNeeded(mode: mode, workspace: workspace)
    }

    func skipForNow() async {
        self.cancelProgressPolling()
        await self.cancelIfRunning()
        self.sessionId = nil
        self.currentStep = nil
        self.status = "cancelled"
        self.errorMessage = nil
        self.stepErrorMessage = nil
        self.textDraft = ""
        self.confirmDraft = false
        self.selectedIndexDraft = 0
        self.selectedIndicesDraft = []
        self.isStarting = false
        self.isSubmitting = false
        self.restartAttempts = 0
        self.usingLegacyGatewayCompatibility = false
        self.autoAdvancedCompatibilityStepIDs = []
    }

    func triggerPrimaryAction(mode: AppState.ConnectionMode, workspace: String? = nil) async {
        if self.errorMessage != nil {
            await self.retry(mode: mode, workspace: workspace)
            return
        }
        guard let step = self.currentStep else { return }
        await self.submit(step: step, value: self.draftValue(for: step))
    }

    private func applyStartResult(_ res: WizardStartResult) {
        self.sessionId = res.sessionid
        self.status = wizardStatusString(res.status) ?? (res.done ? "done" : "running")
        self.errorMessage = res.error
        self.stepErrorMessage = nil
        if let rawStep = res.step {
            guard let decoded = decodeWizardStep(rawStep) else {
                self.currentStep = nil
                self.status = "error"
                self.errorMessage = "Wizard returned a step the app could not read. Retry setup."
                onboardingWizardLogger.error("wizard.start step decode failed")
                return
            }
            self.currentStep = decoded
        } else {
            self.currentStep = nil
        }
        if res.done { self.currentStep = nil }
        self.syncDraftWithCurrentStep()
        self.restartAttempts = 0
        self.maybeAutoAdvanceCompatibilityStep()
        self.updateProgressPollingState()
    }

    private func applyNextResult(_ res: WizardNextResult) {
        let status = wizardStatusString(res.status)
        self.status = status ?? self.status
        self.errorMessage = res.error
        self.stepErrorMessage = nil
        if let rawStep = res.step {
            guard let decoded = decodeWizardStep(rawStep) else {
                self.currentStep = nil
                self.status = "error"
                self.errorMessage = "Wizard returned a step the app could not read. Retry setup."
                onboardingWizardLogger.error("wizard.next step decode failed")
                return
            }
            self.currentStep = decoded
        } else {
            self.currentStep = nil
        }
        if res.done { self.currentStep = nil }
        self.syncDraftWithCurrentStep()
        if res.done || status == "done" || status == "cancelled" || status == "error" {
            self.sessionId = nil
        }
        self.maybeAutoAdvanceCompatibilityStep()
        self.updateProgressPollingState()
    }

    private func applyStatusResult(_ res: WizardStatusResult) {
        self.status = wizardStatusString(res.status) ?? "unknown"
        self.errorMessage = res.error
        self.stepErrorMessage = nil
        self.currentStep = nil
        self.sessionId = nil
        self.cancelProgressPolling()
        self.syncDraftWithCurrentStep()
    }

    private func maybeAutoAdvanceCompatibilityStep() {
        guard self.usingLegacyGatewayCompatibility,
              let step = self.currentStep,
              !self.isSubmitting,
              !self.isRewinding,
              !self.autoAdvancedCompatibilityStepIDs.contains(step.id),
              Self.shouldAutoAdvanceLegacyCompatibilityStep(step)
        else {
            return
        }

        self.autoAdvancedCompatibilityStepIDs.insert(step.id)
        let value = Self.autoAdvanceValueForLegacyCompatibilityStep(step)
        Task { await self.submit(step: step, value: value) }
    }

    private func restartIfSessionLost(error: Error) -> Bool {
        guard let gatewayError = error as? GatewayResponseError else { return false }
        guard gatewayError.code == ErrorCode.invalidRequest.rawValue else { return false }
        let message = gatewayError.message.lowercased()
        guard message.contains("wizard not found") || message.contains("wizard not running") else { return false }
        guard let mode = self.lastStartMode else {
            return false
        }
        if self.shouldSkipWizard(for: mode) {
            onboardingWizardLogger.notice("wizard session lost after persisted setup; marking complete")
            self.markCompleteFromPersistedSetup()
            return true
        }
        guard self.restartAttempts < self.maxRestartAttempts else {
            return false
        }
        self.restartAttempts += 1
        self.cancelProgressPolling()
        self.sessionId = nil
        self.currentStep = nil
        self.status = nil
        self.errorMessage = "Wizard session lost. Restarting…"
        Task { await self.startIfNeeded(mode: mode, workspace: self.lastStartWorkspace) }
        return true
    }

    private func markCompleteFromPersistedSetup() {
        self.cancelProgressPolling()
        self.sessionId = nil
        self.currentStep = nil
        self.status = "done"
        self.errorMessage = nil
        self.stepErrorMessage = nil
        self.restartAttempts = 0
        self.syncDraftWithCurrentStep()
    }

    private func shouldSkipWizard(for mode: AppState.ConnectionMode) -> Bool {
        guard mode == .local else { return false }
        return Self.shouldTreatPersistedSetupAsComplete(MaumauConfigFile.loadDict())
    }

    static func shouldTreatPersistedSetupAsComplete(_ root: [String: Any]) -> Bool {
        guard let wizard = root["wizard"] as? [String: Any],
              let lastRunAt = wizard["lastRunAt"] as? String,
              !lastRunAt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let lastRunCommand = wizard["lastRunCommand"] as? String,
              lastRunCommand.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "onboard",
              let lastRunMode = wizard["lastRunMode"] as? String,
              lastRunMode.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "local"
        else {
            return false
        }
        return true
    }

    private func handleStepValidationError(error: Error) -> Bool {
        guard let gatewayError = error as? GatewayResponseError else { return false }
        guard gatewayError.code == ErrorCode.invalidRequest.rawValue else { return false }
        let message = gatewayError.message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !message.lowercased().contains("wizard") else { return false }
        self.stepErrorMessage = Self.cleanWizardErrorMessage(message)
        return true
    }

    private static func cleanWizardErrorMessage(_ message: String) -> String {
        let prefixes = ["Error: ", "error: "]
        for prefix in prefixes where message.hasPrefix(prefix) {
            return String(message.dropFirst(prefix.count))
        }
        return message
    }

    static func startParams(
        mode: AppState.ConnectionMode,
        workspace: String?,
        useEmbeddedProtocol: Bool) -> WizardStartParams
    {
        var params: WizardStartParams = ["mode": AnyCodable(mode.rawValue)]
        if useEmbeddedProtocol {
            params["flow"] = AnyCodable(mode == .local ? "quickstart" : "advanced")
            params["acceptRisk"] = AnyCodable(true)
            params["skipUi"] = AnyCodable(true)
            params["embedded"] = AnyCodable(true)
            params["fresh"] = AnyCodable(true)
        }
        if let workspace, !workspace.isEmpty {
            params["workspace"] = AnyCodable(workspace)
        }
        params["skipChannels"] = AnyCodable(true)
        params["skipSkills"] = AnyCodable(true)
        params["skipSearch"] = AnyCodable(true)
        return params
    }

    static func shouldRetryLegacyStart(for error: Error) -> Bool {
        guard let gatewayError = error as? GatewayResponseError,
              gatewayError.method == GatewayConnection.Method.wizardStart.rawValue,
              gatewayError.code == ErrorCode.invalidRequest.rawValue
        else {
            return false
        }

        let message = gatewayError.message.lowercased()
        guard message.contains("unexpected property") else { return false }
        return ["embedded", "flow", "acceptrisk", "skipui", "fresh"].contains { message.contains($0) }
    }

    static func isProgressStep(_ step: WizardStep?) -> Bool {
        guard let step else { return false }
        return wizardStepType(step) == "progress"
    }

    static func shouldAutoAdvanceLegacyCompatibilityStep(_ step: WizardStep) -> Bool {
        let type = wizardStepType(step)
        let title = step.title?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        let message = step.message?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""

        switch type {
        case "note":
            if title == "maumau setup" || title == "quickstart" || title == "token" ||
                title == "optional apps" || title == "workspace backup" || title == "done" ||
                title == "optional automations" || title == "no optional automations" ||
                title == "automations enabled"
            {
                return true
            }
            if title == "existing config" && message.contains("keeping your saved setup") {
                return true
            }
            if title == "search" && message.contains("skipping search setup") {
                return true
            }
            if title == "security" &&
                (message.contains("security warning") || message.contains("running agents on your computer is risky"))
            {
                return true
            }
            if title == "control ui" {
                return true
            }
            return false
        case "confirm":
            return message.contains("i understand this is personal-by-default")
        case "select":
            if message == "setup mode" {
                return Self.optionValue(
                    in: step,
                    preferredValue: "quickstart",
                    preferredLabel: "QuickStart") != nil
            }
            if message == "how do you want to hatch your bot?" {
                return Self.optionValue(
                    in: step,
                    preferredValue: "later",
                    preferredLabel: "Do this later") != nil
            }
            return false
        case "multiselect":
            if message == "choose optional automations" {
                return Self.optionValue(
                    in: step,
                    preferredValue: "__skip__",
                    preferredLabel: "Skip for now") != nil
            }
            return false
        default:
            return false
        }
    }

    static func autoAdvanceValueForLegacyCompatibilityStep(_ step: WizardStep) -> AnyCodable? {
        let type = wizardStepType(step)
        let message = step.message?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""

        switch type {
        case "confirm":
            if message.contains("i understand this is personal-by-default") {
                return AnyCodable(true)
            }
        case "select":
            if message == "setup mode" {
                return Self.optionValue(
                    in: step,
                    preferredValue: "quickstart",
                    preferredLabel: "QuickStart")
            }
            if message == "how do you want to hatch your bot?" {
                return Self.optionValue(
                    in: step,
                    preferredValue: "later",
                    preferredLabel: "Do this later")
            }
        case "multiselect":
            if message == "choose optional automations",
               let skipValue = Self.optionValue(
                   in: step,
                   preferredValue: "__skip__",
                   preferredLabel: "Skip for now")
            {
                return AnyCodable([skipValue])
            }
        default:
            break
        }
        return nil
    }

    private static func optionValue(
        in step: WizardStep,
        preferredValue: String,
        preferredLabel: String) -> AnyCodable?
    {
        let options = step.options ?? []
        if let exactValue = options.first(where: {
            (($0["value"]?.value as? String) ?? "").lowercased() == preferredValue.lowercased()
        })?["value"] {
            return AnyCodable(exactValue.value)
        }
        if let exactLabel = options.first(where: {
            (($0["label"]?.value as? String) ?? "").lowercased() == preferredLabel.lowercased()
        })?["value"] {
            return AnyCodable(exactLabel.value)
        }
        return nil
    }

    private func syncDraftWithCurrentStep() {
        guard let step = self.currentStep else {
            self.textDraft = ""
            self.confirmDraft = false
            self.selectedIndexDraft = 0
            self.selectedIndicesDraft = []
            return
        }

        let options = parseWizardOptions(step.options)
        self.textDraft = anyCodableString(step.initialvalue)
        self.confirmDraft = anyCodableBool(step.initialvalue)
        self.selectedIndexDraft = options.firstIndex(where: {
            anyCodableEqual($0.value, step.initialvalue)
        }) ?? 0
        self.selectedIndicesDraft = Set(
            options.enumerated().compactMap { index, option in
                anyCodableArray(step.initialvalue).contains { anyCodableEqual($0, option.value) } ? index : nil
            })
    }

    private func isBlocked(step: WizardStep) -> Bool {
        let options = parseWizardOptions(step.options)
        switch wizardStepType(step) {
        case "select", "multiselect":
            return options.isEmpty
        default:
            return false
        }
    }

    private func updateProgressPollingState() {
        guard let sessionId, self.status == "running", Self.isProgressStep(self.currentStep) else {
            self.cancelProgressPolling()
            return
        }
        if self.progressPollingSessionId == sessionId && self.progressPollingTask != nil {
            return
        }
        self.cancelProgressPolling()
        self.progressPollingSessionId = sessionId
        self.progressPollingTask = Task { [weak self] in
            await self?.pollProgressLoop(sessionId: sessionId)
        }
    }

    private func cancelProgressPolling() {
        self.progressPollingTask?.cancel()
        self.progressPollingTask = nil
        self.progressPollingSessionId = nil
    }

    private func shouldContinueProgressPolling(sessionId: String) -> Bool {
        guard self.progressPollingSessionId == sessionId else { return false }
        guard self.sessionId == sessionId else { return false }
        guard self.status == "running" else { return false }
        return Self.isProgressStep(self.currentStep)
    }

    private func pollProgressLoop(sessionId: String) async {
        while !Task.isCancelled {
            do {
                try await Task.sleep(nanoseconds: Self.progressPollingIntervalNanoseconds)
            } catch {
                break
            }
            guard self.shouldContinueProgressPolling(sessionId: sessionId) else { break }
            do {
                let result: WizardNextResult = try await self.resolveNextResult(
                    sessionId: sessionId,
                    result: try await GatewayConnection.shared.requestDecoded(
                        method: .wizardNext,
                        params: ["sessionId": AnyCodable(sessionId)]))
                guard !Task.isCancelled else { break }
                guard self.progressPollingSessionId == sessionId else { break }
                self.applyNextResult(result)
            } catch {
                guard !Task.isCancelled else { break }
                if self.restartIfSessionLost(error: error) {
                    break
                }
                self.status = "error"
                self.errorMessage = error.localizedDescription
                onboardingWizardLogger.error(
                    "progress poll failed: \(error.localizedDescription, privacy: .public)")
                break
            }
        }
        if self.progressPollingSessionId == sessionId {
            self.progressPollingTask = nil
            self.progressPollingSessionId = nil
        }
    }

    private func draftValue(for step: WizardStep) -> AnyCodable? {
        let options = parseWizardOptions(step.options)
        switch wizardStepType(step) {
        case "note", "progress":
            return nil
        case "text":
            return AnyCodable(self.textDraft)
        case "confirm":
            return AnyCodable(self.confirmDraft)
        case "select":
            guard options.indices.contains(self.selectedIndexDraft) else { return nil }
            let option = options[self.selectedIndexDraft]
            return bridgeToLocal(option.value) ?? AnyCodable(option.label)
        case "multiselect":
            let values = options.enumerated()
                .filter { self.selectedIndicesDraft.contains($0.offset) }
                .map { bridgeToLocal($0.element.value) ?? AnyCodable($0.element.label) }
            return AnyCodable(values)
        case "action":
            return AnyCodable(true)
        default:
            return nil
        }
    }

}

struct OnboardingWizardStepView: View {
    struct StepExplanation {
        let stage: OnboardingHeaderStage
        let title: String
        let bodyText: String
    }

    let step: WizardStep
    let isSubmitting: Bool
    @Bindable var wizard: OnboardingWizardModel

    private let optionItems: [WizardOptionItem]

    init(step: WizardStep, wizard: OnboardingWizardModel, isSubmitting: Bool) {
        self.step = step
        self.wizard = wizard
        self.isSubmitting = isSubmitting
        let options = parseWizardOptions(step.options).enumerated().map { index, option in
            WizardOptionItem(index: index, option: option)
        }
        self.optionItems = options
    }

    private var stepExplanation: StepExplanation? {
        Self.resolveStepExplanation(for: self.step)
    }

    private var showsStepExplanation: Bool {
        Self.shouldShowStepExplanation(for: self.step)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            let hasTitle = !(step.title?.isEmpty ?? true)
            if let title = step.title, !title.isEmpty {
                Text(title)
                    .font(.title2.weight(.semibold))
            }
            if let message = step.message, !message.isEmpty {
                Text(message)
                    .font(hasTitle ? .body : .headline)
                    .foregroundStyle(hasTitle ? .secondary : .primary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if self.showsStepExplanation, let explanation = self.stepExplanation {
                OnboardingMeaningCard(
                    stage: explanation.stage,
                    title: explanation.title,
                    bodyText: explanation.bodyText)
            }

            switch wizardStepType(self.step) {
            case "note":
                EmptyView()
            case "text":
                self.textField
            case "confirm":
                Toggle("", isOn: self.$wizard.confirmDraft)
                    .toggleStyle(.switch)
            case "select":
                self.selectOptions
            case "multiselect":
                self.multiselectOptions
            case "progress":
                ProgressView()
                    .controlSize(.small)
            case "action":
                EmptyView()
            default:
                Text("Unsupported step type")
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var textField: some View {
        let isSensitive = self.step.sensitive == true
        if isSensitive {
            SecureField(self.step.placeholder ?? "", text: self.$wizard.textDraft)
                .textFieldStyle(.roundedBorder)
                .frame(maxWidth: 360)
        } else {
            TextField(self.step.placeholder ?? "", text: self.$wizard.textDraft)
                .textFieldStyle(.roundedBorder)
                .frame(maxWidth: 360)
        }
    }

    private var selectOptions: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(self.optionItems, id: \.index) { item in
                self.selectOptionRow(item)
            }
        }
    }

    private var multiselectOptions: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(self.optionItems, id: \.index) { item in
                self.multiselectOptionRow(item)
            }
        }
    }

    private func selectOptionRow(_ item: WizardOptionItem) -> some View {
        Button {
            self.wizard.selectedIndexDraft = item.index
        } label: {
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: self.wizard.selectedIndexDraft == item.index ? "largecircle.fill.circle" : "circle")
                    .foregroundStyle(Color.accentColor)
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.option.label)
                        .foregroundStyle(.primary)
                    if let hint = item.option.hint, !hint.isEmpty {
                        Text(hint)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .buttonStyle(.plain)
    }

    private func multiselectOptionRow(_ item: WizardOptionItem) -> some View {
        Toggle(isOn: self.bindingForOption(item)) {
            VStack(alignment: .leading, spacing: 2) {
                Text(item.option.label)
                if let hint = item.option.hint, !hint.isEmpty {
                    Text(hint)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private func bindingForOption(_ item: WizardOptionItem) -> Binding<Bool> {
        Binding(get: {
            self.wizard.selectedIndicesDraft.contains(item.index)
        }, set: { newValue in
            if newValue {
                self.wizard.selectedIndicesDraft.insert(item.index)
            } else {
                self.wizard.selectedIndicesDraft.remove(item.index)
            }
        })
    }

    static func resolveStepExplanation(for step: WizardStep) -> StepExplanation? {
        let title = step.title?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        let message = step.message?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        let combined = "\(title)\n\(message)"

        if combined.contains("setup mode") {
            return StepExplanation(
                stage: .home,
                title: "Simple or custom",
                bodyText: "This is Maumau asking how much of the setup work you want it to handle for you.")
        }

        if combined.contains("existing setup") || combined.contains("existing config") {
            return StepExplanation(
                stage: .home,
                title: "Keep or reset",
                bodyText: "Maumau found an older home setup and wants to know whether to reuse it or start fresh.")
        }

        if combined.contains("default model") || combined.contains("choose a default model") ||
            combined.contains("ai service")
        {
            return StepExplanation(
                stage: .brain,
                title: "Pick the brain",
                bodyText: "You are choosing which AI service or model does the thinking for Maumau.")
        }

        if combined.contains("api key") || combined.contains("oauth") || combined.contains("sign in") ||
            combined.contains("signed in") || combined.contains("auth")
        {
            return StepExplanation(
                stage: .brain,
                title: "Connect the brain",
                bodyText: "This is the sign-in step so Maumau can actually talk to the AI service you picked.")
        }

        if combined.contains("workspace") {
            return StepExplanation(
                stage: .home,
                title: "Pick Maumau’s room",
                bodyText: "This is the folder where Maumau keeps notes, reads instructions, and makes files.")
        }

        if combined.contains("preparing setup") || combined.contains("starting wizard") {
            return StepExplanation(
                stage: .brain,
                title: "A quick setup moment",
                bodyText: "Maumau is just getting the next brain setup step ready for you.")
        }

        return nil
    }

    static func shouldShowStepExplanation(for step: WizardStep) -> Bool {
        switch wizardStepType(step) {
        case "text", "confirm", "select", "multiselect":
            return true
        default:
            return false
        }
    }
}

private struct WizardOptionItem: Identifiable {
    let index: Int
    let option: WizardOption

    var id: Int {
        self.index
    }
}
