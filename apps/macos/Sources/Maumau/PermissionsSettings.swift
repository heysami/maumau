import CoreLocation
import MaumauIPC
import MaumauKit
import SwiftUI

struct PermissionsSettings: View {
    let status: [Capability: Bool]
    let refresh: () async -> Void
    let showOnboarding: () -> Void

    private var language: OnboardingLanguage {
        AppStateStore.shared.effectiveOnboardingLanguage
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                SystemRunSettingsView()

                Text(macLocalized("Allow these so Maumau can notify and capture when needed.", language: self.language))
                    .padding(.top, 4)
                    .fixedSize(horizontal: false, vertical: true)

                PermissionStatusList(status: self.status, refresh: self.refresh)
                    .padding(.horizontal, 2)
                    .padding(.vertical, 6)

                LocationAccessSettings()

                Button(macLocalized("Restart onboarding", language: self.language)) { self.showOnboarding() }
                    .buttonStyle(.bordered)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

private struct LocationAccessSettings: View {
    @AppStorage(locationModeKey) private var locationModeRaw: String = MaumauLocationMode.off.rawValue
    @AppStorage(locationPreciseKey) private var locationPreciseEnabled: Bool = true
    @State private var lastLocationModeRaw: String = MaumauLocationMode.off.rawValue

    private var language: OnboardingLanguage {
        AppStateStore.shared.effectiveOnboardingLanguage
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(macLocalized("Location Access", language: self.language))
                .font(.body)

            Picker("", selection: self.$locationModeRaw) {
                Text(macLocalized("Off", language: self.language)).tag(MaumauLocationMode.off.rawValue)
                Text(macLocalized("While Using", language: self.language)).tag(MaumauLocationMode.whileUsing.rawValue)
                Text(macLocalized("Always", language: self.language)).tag(MaumauLocationMode.always.rawValue)
            }
            .labelsHidden()
            .pickerStyle(.menu)

            Toggle(macLocalized("Precise Location", language: self.language), isOn: self.$locationPreciseEnabled)
                .disabled(self.locationMode == .off)

            Text(macLocalized("Always may require System Settings to approve background location.", language: self.language))
                .font(.footnote)
                .foregroundStyle(.tertiary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .onAppear {
            self.lastLocationModeRaw = self.locationModeRaw
        }
        .onChange(of: self.locationModeRaw) { _, newValue in
            let previous = self.lastLocationModeRaw
            self.lastLocationModeRaw = newValue
            guard let mode = MaumauLocationMode(rawValue: newValue) else { return }
            Task {
                let granted = await self.requestLocationAuthorization(mode: mode)
                if !granted {
                    await MainActor.run {
                        self.locationModeRaw = previous
                        self.lastLocationModeRaw = previous
                    }
                }
            }
        }
    }

    private var locationMode: MaumauLocationMode {
        MaumauLocationMode(rawValue: self.locationModeRaw) ?? .off
    }

    private func requestLocationAuthorization(mode: MaumauLocationMode) async -> Bool {
        guard mode != .off else { return true }
        guard CLLocationManager.locationServicesEnabled() else {
            await MainActor.run { LocationPermissionHelper.openSettings() }
            return false
        }

        let status = CLLocationManager().authorizationStatus
        let requireAlways = mode == .always
        if PermissionManager.isLocationAuthorized(status: status, requireAlways: requireAlways) {
            return true
        }
        let updated = await LocationPermissionRequester.shared.request(always: requireAlways)
        return PermissionManager.isLocationAuthorized(status: updated, requireAlways: requireAlways)
    }
}

struct PermissionStatusList: View {
    let status: [Capability: Bool]
    let refresh: () async -> Void
    @State private var pendingCapability: Capability?

    private var language: OnboardingLanguage {
        AppStateStore.shared.effectiveOnboardingLanguage
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(Capability.allCases, id: \.self) { cap in
                PermissionRow(
                    capability: cap,
                    status: self.status[cap] ?? false,
                    isPending: self.pendingCapability == cap)
                {
                    Task { await self.handle(cap) }
                }
            }
            Button {
                Task { await self.refresh() }
            } label: {
                Label(macLocalized("Refresh", language: self.language), systemImage: "arrow.clockwise")
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .font(.footnote)
            .padding(.top, 2)
            .help(macLocalized("Refresh status", language: self.language))
        }
    }

    @MainActor
    private func handle(_ cap: Capability) async {
        guard self.pendingCapability == nil else { return }
        self.pendingCapability = cap
        defer { self.pendingCapability = nil }

        _ = await PermissionManager.ensure([cap], interactive: true)
        await self.refreshStatusTransitions()
    }

    @MainActor
    private func refreshStatusTransitions() async {
        await self.refresh()

        // TCC and notification settings can settle after the prompt closes or when the app regains focus.
        for delay in [300_000_000, 900_000_000, 1_800_000_000] {
            try? await Task.sleep(nanoseconds: UInt64(delay))
            await self.refresh()
        }
    }
}

struct PermissionRow: View {
    let capability: Capability
    let status: Bool
    let isPending: Bool
    let compact: Bool
    let action: () -> Void

    private var language: OnboardingLanguage {
        AppStateStore.shared.effectiveOnboardingLanguage
    }

    init(
        capability: Capability,
        status: Bool,
        isPending: Bool = false,
        compact: Bool = false,
        action: @escaping () -> Void)
    {
        self.capability = capability
        self.status = status
        self.isPending = isPending
        self.compact = compact
        self.action = action
    }

    var body: some View {
        HStack(spacing: self.compact ? 10 : 12) {
            ZStack {
                Circle().fill(self.status ? Color.green.opacity(0.2) : Color.gray.opacity(0.15))
                    .frame(width: self.iconSize, height: self.iconSize)
                Image(systemName: self.icon)
                    .foregroundStyle(self.status ? Color.green : Color.secondary)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(self.title).font(.body.weight(.semibold))
                Text(self.subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .layoutPriority(1)
            VStack(alignment: .trailing, spacing: 4) {
                if self.status {
                    Label(macLocalized("Granted", language: self.language), systemImage: "checkmark.circle.fill")
                        .labelStyle(.iconOnly)
                        .foregroundStyle(.green)
                        .font(.title3)
                        .help(macLocalized("Granted", language: self.language))
                } else if self.isPending {
                    ProgressView()
                        .controlSize(.small)
                        .frame(width: 78)
                } else {
                    Button(macLocalized("Grant", language: self.language)) { self.action() }
                        .buttonStyle(.bordered)
                        .controlSize(self.compact ? .small : .regular)
                        .frame(minWidth: self.compact ? 68 : 78, alignment: .trailing)
                }

                if self.status {
                    Text(macLocalized("Granted", language: self.language))
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.green)
                } else if self.isPending {
                    Text(macLocalized("Checking…", language: self.language))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    Text(macLocalized("Request access", language: self.language))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(minWidth: self.compact ? 86 : 104, alignment: .trailing)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.vertical, self.compact ? 4 : 6)
    }

    private var iconSize: CGFloat {
        self.compact ? 28 : 32
    }

    private var title: String {
        switch self.capability {
        case .appleScript: macLocalized("Automation (AppleScript)", language: self.language)
        case .notifications: macLocalized("Notifications", language: self.language)
        case .accessibility: macLocalized("Accessibility", language: self.language)
        case .screenRecording: macLocalized("Screen Recording", language: self.language)
        case .microphone: macLocalized("Microphone", language: self.language)
        case .speechRecognition: macLocalized("Speech Recognition", language: self.language)
        case .camera: macLocalized("Camera", language: self.language)
        case .location: macLocalized("Location", language: self.language)
        }
    }

    private var subtitle: String {
        switch self.capability {
        case .appleScript:
            macLocalized("Control other apps (e.g. Terminal) for automation actions", language: self.language)
        case .notifications:
            macLocalized("Show desktop alerts for agent activity", language: self.language)
        case .accessibility:
            macLocalized("Control UI elements when an action requires it", language: self.language)
        case .screenRecording:
            macLocalized("Capture the screen for context or screenshots", language: self.language)
        case .microphone:
            macLocalized("Allow Voice Wake and audio capture", language: self.language)
        case .speechRecognition:
            macLocalized("Transcribe Voice Wake trigger phrases on-device", language: self.language)
        case .camera:
            macLocalized("Capture photos and video from the camera", language: self.language)
        case .location:
            macLocalized("Share location when requested by the agent", language: self.language)
        }
    }

    private var icon: String {
        switch self.capability {
        case .appleScript: "applescript"
        case .notifications: "bell"
        case .accessibility: "hand.raised"
        case .screenRecording: "display"
        case .microphone: "mic"
        case .speechRecognition: "waveform"
        case .camera: "camera"
        case .location: "location"
        }
    }
}

#if DEBUG
struct PermissionsSettings_Previews: PreviewProvider {
    static var previews: some View {
        PermissionsSettings(
            status: [
                .appleScript: true,
                .notifications: true,
                .accessibility: false,
                .screenRecording: false,
                .microphone: true,
                .speechRecognition: false,
            ],
            refresh: {},
            showOnboarding: {})
            .frame(width: SettingsTab.windowWidth, height: SettingsTab.windowHeight)
    }
}
#endif
