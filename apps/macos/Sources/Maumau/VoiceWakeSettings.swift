import AppKit
import AVFoundation
import Observation
import Speech
import SwabbleKit
import SwiftUI
import UniformTypeIdentifiers

struct VoiceWakeSettings: View {
    @Bindable var state: AppState
    let isActive: Bool
    @State private var testState: VoiceWakeTestState = .idle
    @State private var tester = VoiceWakeTester()
    @State private var isTesting = false
    @State private var testTimeoutTask: Task<Void, Never>?
    @State private var availableMics: [AudioInputDevice] = []
    @State private var loadingMics = false
    @State private var meterLevel: Double = 0
    @State private var meterError: String?
    private let meter = MicLevelMonitor()
    @State private var micObserver = AudioInputDeviceObserver()
    @State private var micRefreshTask: Task<Void, Never>?
    @State private var availableLocales: [Locale] = []
    @State private var triggerEntries: [TriggerEntry] = []
    private let fieldLabelWidth: CGFloat = 140
    private let controlWidth: CGFloat = 240
    private let isPreview = ProcessInfo.processInfo.isPreview

    private var language: OnboardingLanguage {
        self.state.effectiveOnboardingLanguage
    }

    private struct AudioInputDevice: Identifiable, Equatable {
        let uid: String
        let name: String
        var id: String {
            self.uid
        }
    }

    private struct TriggerEntry: Identifiable {
        let id: UUID
        var value: String
    }

    private var voiceWakeBinding: Binding<Bool> {
        MicRefreshSupport.voiceWakeBinding(for: self.state)
    }

    var body: some View {
        let language = self.language
        ScrollView(.vertical) {
            VStack(alignment: .leading, spacing: 14) {
                SettingsToggleRow(
                    title: macLocalized("Enable Voice Wake", language: language),
                    subtitle: macLocalized(
                        "Listen for a wake phrase (e.g. \"Claude\") before running voice commands. Voice recognition runs fully on-device.",
                        language: language),
                    binding: self.voiceWakeBinding)
                    .disabled(!voiceWakeSupported)

                SettingsToggleRow(
                    title: macLocalized("Hold Right Option to talk", language: language),
                    subtitle: macLocalized(
                        "Push-to-talk mode that starts listening while you hold the key and shows the preview overlay.",
                        language: language),
                    binding: self.$state.voicePushToTalkEnabled)
                    .disabled(!voiceWakeSupported)

                if !voiceWakeSupported {
                    Label(
                        macLocalized("Voice Wake requires macOS 26 or newer.", language: language),
                        systemImage: "exclamationmark.triangle.fill")
                        .font(.callout)
                        .foregroundStyle(.yellow)
                        .padding(8)
                        .background(Color.secondary.opacity(0.15))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }

                self.localePicker
                self.micPicker
                self.levelMeter

                VoiceWakeTestCard(
                    testState: self.$testState,
                    isTesting: self.$isTesting,
                    language: language,
                    onToggle: self.toggleTest)

                self.chimeSection

                self.triggerTable

                Spacer(minLength: 8)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
        }
        .task {
            guard !self.isPreview else { return }
            await self.loadMicsIfNeeded()
        }
        .task {
            guard !self.isPreview else { return }
            await self.loadLocalesIfNeeded()
        }
        .task {
            guard !self.isPreview else { return }
            await self.restartMeter()
        }
        .onAppear {
            guard !self.isPreview else { return }
            self.startMicObserver()
            self.loadTriggerEntries()
        }
        .onChange(of: self.state.voiceWakeMicID) { _, _ in
            guard !self.isPreview else { return }
            self.updateSelectedMicName()
            Task { await self.restartMeter() }
        }
        .onChange(of: self.isActive) { _, active in
            guard !self.isPreview else { return }
            if !active {
                self.tester.stop()
                self.isTesting = false
                self.testState = .idle
                self.testTimeoutTask?.cancel()
                self.micRefreshTask?.cancel()
                self.micRefreshTask = nil
                Task { await self.meter.stop() }
                self.micObserver.stop()
                self.syncTriggerEntriesToState()
            } else {
                self.startMicObserver()
                self.loadTriggerEntries()
            }
        }
        .onDisappear {
            guard !self.isPreview else { return }
            self.tester.stop()
            self.isTesting = false
            self.testState = .idle
            self.testTimeoutTask?.cancel()
            self.micRefreshTask?.cancel()
            self.micRefreshTask = nil
            self.micObserver.stop()
            Task { await self.meter.stop() }
            self.syncTriggerEntriesToState()
        }
    }

    private func loadTriggerEntries() {
        self.triggerEntries = self.state.swabbleTriggerWords.map { TriggerEntry(id: UUID(), value: $0) }
    }

    private func syncTriggerEntriesToState() {
        self.state.swabbleTriggerWords = self.triggerEntries.map(\.value)
    }

    private var triggerTable: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(macLocalized("Trigger words", language: self.language))
                    .font(.callout.weight(.semibold))
                Spacer()
                Button {
                    self.addWord()
                } label: {
                    Label(macLocalized("Add word", language: self.language), systemImage: "plus")
                }
                .disabled(self.triggerEntries
                    .contains(where: { $0.value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }))

                Button(macLocalized("Reset defaults", language: self.language)) {
                    self.triggerEntries = defaultVoiceWakeTriggers.map { TriggerEntry(id: UUID(), value: $0) }
                    self.syncTriggerEntriesToState()
                }
            }

            VStack(spacing: 0) {
                ForEach(self.$triggerEntries) { $entry in
                    HStack(spacing: 8) {
                        TextField(macLocalized("Wake word", language: self.language), text: $entry.value)
                            .textFieldStyle(.roundedBorder)
                            .onSubmit {
                                self.syncTriggerEntriesToState()
                            }

                        Button {
                            self.removeWord(id: entry.id)
                        } label: {
                            Image(systemName: "trash")
                        }
                        .buttonStyle(.borderless)
                        .help(macLocalized("Remove trigger word", language: self.language))
                        .frame(width: 24)
                    }
                    .padding(8)

                    if entry.id != self.triggerEntries.last?.id {
                        Divider()
                    }
                }
            }
            .frame(maxWidth: .infinity, minHeight: 180, alignment: .topLeading)
            .background(Color(nsColor: .textBackgroundColor))
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .overlay(
                RoundedRectangle(cornerRadius: 6)
                    .stroke(Color.secondary.opacity(0.25), lineWidth: 1))

            Text(
                macLocalized(
                    "Maumau reacts when any trigger appears in a transcription. Keep them short to avoid false positives.",
                    language: self.language))
                .font(.footnote)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var chimeSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(macLocalized("Sounds", language: self.language))
                    .font(.callout.weight(.semibold))
                Spacer()
            }

            self.chimeRow(
                title: macLocalized("Trigger sound", language: self.language),
                selection: self.$state.voiceWakeTriggerChime)

            self.chimeRow(
                title: macLocalized("Send sound", language: self.language),
                selection: self.$state.voiceWakeSendChime)
        }
        .padding(.top, 4)
    }

    private func addWord() {
        self.triggerEntries.append(TriggerEntry(id: UUID(), value: ""))
    }

    private func removeWord(id: UUID) {
        self.triggerEntries.removeAll { $0.id == id }
        self.syncTriggerEntriesToState()
    }

    private func toggleTest() {
        guard voiceWakeSupported else {
            self.testState = .failed(macLocalized("Voice Wake requires macOS 26 or newer.", language: self.language))
            return
        }
        if self.isTesting {
            self.tester.finalize()
            self.isTesting = false
            self.testState = .finalizing
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                if self.testState == .finalizing {
                    self.tester.stop()
                    self.testState = .failed(macLocalized("Stopped", language: self.language))
                }
            }
            self.testTimeoutTask?.cancel()
            return
        }

        let triggers = self.sanitizedTriggers()
        self.tester.stop()
        self.testTimeoutTask?.cancel()
        self.isTesting = true
        self.testState = .requesting
        Task { @MainActor in
            do {
                try await self.tester.start(
                    triggers: triggers,
                    micID: self.state.voiceWakeMicID.isEmpty ? nil : self.state.voiceWakeMicID,
                    localeID: self.state.voiceWakeLocaleID,
                    onUpdate: { newState in
                        DispatchQueue.main.async { [self] in
                            self.testState = newState
                            if case .detected = newState { self.isTesting = false }
                            if case .failed = newState { self.isTesting = false }
                            if case .detected = newState { self.testTimeoutTask?.cancel() }
                            if case .failed = newState { self.testTimeoutTask?.cancel() }
                        }
                    })
                self.testTimeoutTask?.cancel()
                self.testTimeoutTask = Task { @MainActor in
                    try? await Task.sleep(nanoseconds: 10 * 1_000_000_000)
                    guard !Task.isCancelled else { return }
                    if self.isTesting {
                        self.tester.stop()
                        if case let .hearing(text) = self.testState,
                           let command = Self.textOnlyCommand(from: text, triggers: triggers)
                        {
                            self.testState = .detected(command)
                        } else {
                            self.testState = .failed(
                                macLocalized("Timeout: no trigger heard", language: self.language))
                        }
                        self.isTesting = false
                    }
                }
            } catch {
                self.tester.stop()
                self.testState = .failed(macLocalized(error.localizedDescription, language: self.language))
                self.isTesting = false
                self.testTimeoutTask?.cancel()
            }
        }
    }

    private func chimeRow(title: String, selection: Binding<VoiceWakeChime>) -> some View {
        HStack(alignment: .center, spacing: 10) {
            Text(title)
                .font(.callout.weight(.semibold))
                .frame(width: self.fieldLabelWidth, alignment: .leading)

            Menu {
                Button(macLocalized("No Sound", language: self.language)) { self.selectChime(.none, binding: selection) }
                Divider()
                ForEach(VoiceWakeChimeCatalog.systemOptions, id: \.self) { option in
                    Button(macLocalized(VoiceWakeChimeCatalog.displayName(for: option), language: self.language)) {
                        self.selectChime(.system(name: option), binding: selection)
                    }
                }
                Divider()
                Button(macLocalized("Choose file…", language: self.language)) { self.chooseCustomChime(for: selection) }
            } label: {
                HStack(spacing: 6) {
                    Text(macLocalized(selection.wrappedValue.displayLabel, language: self.language))
                        .lineLimit(1)
                        .truncationMode(.middle)
                    Spacer()
                    Image(systemName: "chevron.down")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(6)
                .frame(minWidth: self.controlWidth, maxWidth: .infinity, alignment: .leading)
                .background(Color(nsColor: .windowBackgroundColor))
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Color.secondary.opacity(0.25), lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 6))
            }

            Button(macLocalized("Play", language: self.language)) {
                VoiceWakeChimePlayer.play(selection.wrappedValue)
            }
            .keyboardShortcut(.space, modifiers: [.command])
        }
    }

    private func chooseCustomChime(for selection: Binding<VoiceWakeChime>) {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.audio]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.resolvesAliases = true
        panel.begin { response in
            guard response == .OK, let url = panel.url else { return }
            do {
                let bookmark = try url.bookmarkData(
                    options: [.withSecurityScope],
                    includingResourceValuesForKeys: nil,
                    relativeTo: nil)
                let chosen = VoiceWakeChime.custom(displayName: url.lastPathComponent, bookmark: bookmark)
                selection.wrappedValue = chosen
                VoiceWakeChimePlayer.play(chosen)
            } catch {
                // Ignore failures; user can retry.
            }
        }
    }

    private func selectChime(_ chime: VoiceWakeChime, binding: Binding<VoiceWakeChime>) {
        binding.wrappedValue = chime
        VoiceWakeChimePlayer.play(chime)
    }

    private func sanitizedTriggers() -> [String] {
        sanitizeVoiceWakeTriggers(self.state.swabbleTriggerWords)
    }

    private static func textOnlyCommand(from transcript: String, triggers: [String]) -> String? {
        VoiceWakeTextUtils.textOnlyCommand(
            transcript: transcript,
            triggers: triggers,
            minCommandLength: 1,
            trimWake: { WakeWordGate.stripWake(text: $0, triggers: $1) })
    }

    private var micPicker: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(macLocalized("Microphone", language: self.language))
                    .font(.callout.weight(.semibold))
                    .frame(width: self.fieldLabelWidth, alignment: .leading)
                Picker(macLocalized("Microphone", language: self.language), selection: self.$state.voiceWakeMicID) {
                    Text(macLocalized("System default", language: self.language)).tag("")
                    if self.isSelectedMicUnavailable {
                        Text(self.state.voiceWakeMicName.isEmpty
                            ? macLocalized("Unavailable", language: self.language)
                            : self.state.voiceWakeMicName)
                            .tag(self.state.voiceWakeMicID)
                    }
                    ForEach(self.availableMics) { mic in
                        Text(mic.name).tag(mic.uid)
                    }
                }
                .labelsHidden()
                .frame(width: self.controlWidth)
            }
            if self.isSelectedMicUnavailable {
                HStack(spacing: 10) {
                    Color.clear.frame(width: self.fieldLabelWidth, height: 1)
                    Text(macLocalized("Disconnected (using System default)", language: self.language))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            if self.loadingMics {
                ProgressView().controlSize(.small)
            }
        }
    }

    private var localePicker: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(macLocalized("Recognition language", language: self.language))
                    .font(.callout.weight(.semibold))
                    .frame(width: self.fieldLabelWidth, alignment: .leading)
                Picker(macLocalized("Language", language: self.language), selection: self.$state.voiceWakeLocaleID) {
                    let current = Locale(identifier: Locale.current.identifier)
                    Text(macVoiceWakeLocaleLabel(
                        self.friendlyName(for: current),
                        isSystem: true,
                        language: self.language))
                        .tag(Locale.current.identifier)
                    ForEach(self.availableLocales.map(\.identifier), id: \.self) { id in
                        if id != Locale.current.identifier {
                            Text(self.friendlyName(for: Locale(identifier: id))).tag(id)
                        }
                    }
                }
                .labelsHidden()
                .frame(width: self.controlWidth)
            }

            if !self.state.voiceWakeAdditionalLocaleIDs.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text(macLocalized("Additional languages", language: self.language))
                        .font(.footnote.weight(.semibold))
                    ForEach(
                        Array(self.state.voiceWakeAdditionalLocaleIDs.enumerated()),
                        id: \.offset)
                    { idx, localeID in
                        HStack(spacing: 8) {
                            Picker("\(macLocalized("Language", language: self.language)) \(idx + 1)", selection: Binding(
                                get: { localeID },
                                set: { newValue in
                                    guard self.state
                                        .voiceWakeAdditionalLocaleIDs.indices
                                        .contains(idx) else { return }
                                    self.state
                                        .voiceWakeAdditionalLocaleIDs[idx] =
                                        newValue
                                })) {
                                    ForEach(self.availableLocales.map(\.identifier), id: \.self) { id in
                                        Text(self.friendlyName(for: Locale(identifier: id))).tag(id)
                                    }
                                }
                                .labelsHidden()
                                    .frame(width: 220)

                            Button {
                                guard self.state.voiceWakeAdditionalLocaleIDs.indices.contains(idx) else { return }
                                self.state.voiceWakeAdditionalLocaleIDs.remove(at: idx)
                            } label: {
                                Image(systemName: "trash")
                            }
                            .buttonStyle(.borderless)
                            .help(macLocalized("Remove language", language: self.language))
                        }
                    }

                    Button {
                        if let first = availableLocales.first {
                            self.state.voiceWakeAdditionalLocaleIDs.append(first.identifier)
                        }
                    } label: {
                        Label(macLocalized("Add language", language: self.language), systemImage: "plus")
                    }
                    .disabled(self.availableLocales.isEmpty)
                }
                .padding(.top, 4)
            } else {
                Button {
                    if let first = availableLocales.first {
                        self.state.voiceWakeAdditionalLocaleIDs.append(first.identifier)
                    }
                } label: {
                    Label(macLocalized("Add additional language", language: self.language), systemImage: "plus")
                }
                .buttonStyle(.link)
                .disabled(self.availableLocales.isEmpty)
                .padding(.top, 4)
            }

            Text(
                macLocalized(
                    "Languages are tried in order. Models may need a first-use download on macOS 26.",
                    language: self.language))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    @MainActor
    private func loadMicsIfNeeded(force: Bool = false) async {
        guard force || self.availableMics.isEmpty, !self.loadingMics else { return }
        self.loadingMics = true
        let discovery = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.external, .microphone],
            mediaType: .audio,
            position: .unspecified)
        let aliveUIDs = AudioInputDeviceObserver.aliveInputDeviceUIDs()
        let connectedDevices = discovery.devices.filter(\.isConnected)
        let devices = aliveUIDs.isEmpty
            ? connectedDevices
            : connectedDevices.filter { aliveUIDs.contains($0.uniqueID) }
        self.availableMics = devices.map { AudioInputDevice(uid: $0.uniqueID, name: $0.localizedName) }
        self.updateSelectedMicName()
        self.loadingMics = false
    }

    private var isSelectedMicUnavailable: Bool {
        let selected = self.state.voiceWakeMicID
        guard !selected.isEmpty else { return false }
        return !self.availableMics.contains(where: { $0.uid == selected })
    }

    @MainActor
    private func updateSelectedMicName() {
        self.state.voiceWakeMicName = MicRefreshSupport.selectedMicName(
            selectedID: self.state.voiceWakeMicID,
            in: self.availableMics,
            uid: \.uid,
            name: \.name)
    }

    private func startMicObserver() {
        MicRefreshSupport.startObserver(self.micObserver) {
            self.scheduleMicRefresh()
        }
    }

    @MainActor
    private func scheduleMicRefresh() {
        MicRefreshSupport.schedule(refreshTask: &self.micRefreshTask) {
            await self.loadMicsIfNeeded(force: true)
            await self.restartMeter()
        }
    }

    @MainActor
    private func loadLocalesIfNeeded() async {
        guard self.availableLocales.isEmpty else { return }
        self.availableLocales = Array(SFSpeechRecognizer.supportedLocales()).sorted { lhs, rhs in
            self.friendlyName(for: lhs)
                .localizedCaseInsensitiveCompare(self.friendlyName(for: rhs)) == .orderedAscending
        }
    }

    private func friendlyName(for locale: Locale) -> String {
        let cleanedID = normalizeLocaleIdentifier(locale.identifier)
        let cleanLocale = Locale(identifier: cleanedID)
        let displayLocale = self.language == .id ? Locale(identifier: "id_ID") : Locale.current

        if let langCode = cleanLocale.language.languageCode?.identifier,
           let lang = displayLocale.localizedString(forLanguageCode: langCode),
           let regionCode = cleanLocale.region?.identifier,
           let region = displayLocale.localizedString(forRegionCode: regionCode)
        {
            return "\(lang) (\(region))"
        }
        if let langCode = cleanLocale.language.languageCode?.identifier,
           let lang = displayLocale.localizedString(forLanguageCode: langCode)
        {
            return lang
        }
        return displayLocale.localizedString(forIdentifier: cleanedID) ?? cleanedID
    }

    private var levelMeter: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .center, spacing: 10) {
                Text(macLocalized("Live level", language: self.language))
                    .font(.callout.weight(.semibold))
                    .frame(width: self.fieldLabelWidth, alignment: .leading)
                MicLevelBar(level: self.meterLevel)
                    .frame(width: self.controlWidth, alignment: .leading)
                Text(self.levelLabel)
                    .font(.callout.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .frame(width: 60, alignment: .trailing)
            }
            if let meterError {
                Text(macVoiceWakeFailureText(meterError, language: self.language))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var levelLabel: String {
        let db = (meterLevel * 50) - 50
        return String(format: "%.0f dB", db)
    }

    @MainActor
    private func restartMeter() async {
        self.meterError = nil
        await self.meter.stop()
        do {
            try await self.meter.start { [weak state] level in
                Task { @MainActor in
                    guard state != nil else { return }
                    self.meterLevel = level
                }
            }
        } catch {
            self.meterError = error.localizedDescription
        }
    }
}

#if DEBUG
struct VoiceWakeSettings_Previews: PreviewProvider {
    static var previews: some View {
        VoiceWakeSettings(state: .preview, isActive: true)
            .frame(width: SettingsTab.windowWidth, height: SettingsTab.windowHeight)
    }
}

@MainActor
extension VoiceWakeSettings {
    static func exerciseForTesting() {
        let state = AppState(preview: true)
        state.swabbleEnabled = true
        state.voicePushToTalkEnabled = true
        state.swabbleTriggerWords = ["Claude", "Hey"]

        state.onboardingLanguage = .id
        let view = VoiceWakeSettings(state: state, isActive: true)
        view.availableMics = [AudioInputDevice(uid: "mic-1", name: "Built-in")]
        view.availableLocales = [Locale(identifier: "en_US")]
        view.meterLevel = 0.42
        view.meterError = "No input"
        view.testState = .detected("ok")
        view.isTesting = true
        view.triggerEntries = [TriggerEntry(id: UUID(), value: "Claude")]

        _ = view.body
        _ = view.localePicker
        _ = view.micPicker
        _ = view.levelMeter
        _ = view.triggerTable
        _ = view.chimeSection

        view.addWord()
        if let entryId = view.triggerEntries.first?.id {
            view.removeWord(id: entryId)
        }
    }
}
#endif
