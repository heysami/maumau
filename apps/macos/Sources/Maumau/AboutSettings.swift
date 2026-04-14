import SwiftUI

struct AboutSettings: View {
    private enum AboutLinks {
        static let defaultMaumauGitHub = "https://github.com/maumau/maumau"
        static let website = "https://maumau.ai"
        static let threads = "https://www.threads.net/@ohhh.sami"
        static let email = "mailto:samiadji.fr@gmail.com"
        static let peterX = "https://x.com/steipete"
    }

    weak var updater: UpdaterProviding?
    @State private var iconHover = false
    @AppStorage("autoUpdateEnabled") private var autoCheckEnabled = true
    @State private var didLoadUpdaterState = false

    private var language: OnboardingLanguage {
        AppStateStore.shared.effectiveOnboardingLanguage
    }

    private var maumauGitHubURL: String {
        let packagedURL = (Bundle.main.object(forInfoDictionaryKey: "MaumauGitHubURL") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return if let packagedURL, !packagedURL.isEmpty {
            packagedURL
        } else {
            AboutLinks.defaultMaumauGitHub
        }
    }

    var body: some View {
        VStack(spacing: 8) {
            let appIcon = NSApplication.shared.applicationIconImage ?? CritterIconRenderer.makeIcon(blink: 0)
            Button {
                if let url = URL(string: self.maumauGitHubURL) {
                    NSWorkspace.shared.open(url)
                }
            } label: {
                Image(nsImage: appIcon)
                    .resizable()
                    .frame(width: 160, height: 160)
                    .cornerRadius(24)
                    .shadow(color: self.iconHover ? .accentColor.opacity(0.25) : .clear, radius: 10)
                    .scaleEffect(self.iconHover ? 1.05 : 1.0)
            }
            .buttonStyle(.plain)
            .focusable(false)
            .pointingHandCursor()
            .onHover { hover in
                withAnimation(.spring(response: 0.3, dampingFraction: 0.72)) { self.iconHover = hover }
            }

            VStack(spacing: 3) {
                Text("Maumau")
                    .font(.title3.bold())
                Text("\(macLocalized("Version", language: self.language)) \(self.versionString)")
                    .foregroundStyle(.secondary)
                if let buildTimestamp {
                    Text("\(macLocalized("Built", language: self.language)) \(buildTimestamp)\(self.buildSuffix)")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                Text(
                    macLocalized(
                        "Menu bar companion for notifications, screenshots, and privileged agent actions.",
                        language: self.language))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 18)

                VStack(spacing: 2) {
                    Text("Maumau is built by Peter Steinberger.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Link("Peter Steinberger on X", destination: URL(string: AboutLinks.peterX)!)
                        .font(.footnote)
                }
            }

            VStack(alignment: .center, spacing: 6) {
                AboutLinkRow(
                    icon: "chevron.left.slash.chevron.right",
                    title: "GitHub",
                    url: self.maumauGitHubURL)
                AboutLinkRow(icon: "globe", title: macLocalized("Website", language: self.language), url: AboutLinks.website)
                AboutLinkRow(icon: "bubble.left.and.bubble.right", title: "Threads", url: AboutLinks.threads)
                AboutLinkRow(icon: "envelope", title: "Email", url: AboutLinks.email)
            }
            .frame(maxWidth: .infinity)
            .multilineTextAlignment(.center)
            .padding(.vertical, 10)

            if let updater {
                Divider()
                    .padding(.vertical, 8)

                if updater.isAvailable {
                    VStack(spacing: 10) {
                        Toggle(macLocalized("Check for updates automatically", language: self.language), isOn: self.$autoCheckEnabled)
                            .toggleStyle(.checkbox)
                            .frame(maxWidth: .infinity, alignment: .center)

                        Button(macLocalized("Check for Updates…", language: self.language)) { updater.checkForUpdates(nil) }
                    }
                } else {
                    Text(macLocalized("Updates unavailable in this build.", language: self.language))
                        .foregroundStyle(.secondary)
                        .padding(.top, 4)
                }
            }

            Text("Maumau © 2025 Peter Steinberger — MIT License.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .padding(.top, 4)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.top, 4)
        .padding(.horizontal, 24)
        .padding(.bottom, 24)
        .onAppear {
            guard let updater, !self.didLoadUpdaterState else { return }
            // Keep Sparkle’s auto-check setting in sync with the persisted toggle.
            updater.automaticallyChecksForUpdates = self.autoCheckEnabled
            updater.automaticallyDownloadsUpdates = self.autoCheckEnabled
            self.didLoadUpdaterState = true
        }
        .onChange(of: self.autoCheckEnabled) { _, newValue in
            self.updater?.automaticallyChecksForUpdates = newValue
            self.updater?.automaticallyDownloadsUpdates = newValue
        }
    }

    private var versionString: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "dev"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String
        return build.map { "\(version) (\($0))" } ?? version
    }

    private var buildTimestamp: String? {
        guard
            let raw =
            (Bundle.main.object(forInfoDictionaryKey: "MaumauBuildTimestamp") as? String) ??
            (Bundle.main.object(forInfoDictionaryKey: "MaumauBuildTimestamp") as? String)
        else { return nil }
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime]
        guard let date = parser.date(from: raw) else { return raw }

        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        formatter.locale = .current
        return formatter.string(from: date)
    }

    private var gitCommit: String {
        (Bundle.main.object(forInfoDictionaryKey: "MaumauGitCommit") as? String) ??
            (Bundle.main.object(forInfoDictionaryKey: "MaumauGitCommit") as? String) ??
            "unknown"
    }

    private var bundleID: String {
        Bundle.main.bundleIdentifier ?? "unknown"
    }

    private var buildSuffix: String {
        let git = self.gitCommit
        guard !git.isEmpty, git != "unknown" else { return "" }

        var suffix = " (\(git)"
        #if DEBUG
        suffix += " DEBUG"
        #endif
        suffix += ")"
        return suffix
    }
}

@MainActor
private struct AboutLinkRow: View {
    let icon: String
    let title: String
    let url: String

    @State private var hovering = false

    var body: some View {
        Button {
            if let url = URL(string: url) { NSWorkspace.shared.open(url) }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: self.icon)
                Text(self.title)
                    .underline(self.hovering, color: .accentColor)
            }
            .foregroundColor(.accentColor)
        }
        .buttonStyle(.plain)
        .onHover { self.hovering = $0 }
        .pointingHandCursor()
    }
}

private struct AboutMetaRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(self.label)
                .foregroundStyle(.secondary)
            Spacer()
            Text(self.value)
                .font(.caption.monospaced())
                .foregroundStyle(.primary)
        }
    }
}

#if DEBUG
struct AboutSettings_Previews: PreviewProvider {
    private static let updater = DisabledUpdaterController()
    static var previews: some View {
        AboutSettings(updater: updater)
            .frame(width: SettingsTab.windowWidth, height: SettingsTab.windowHeight)
    }
}
#endif
