import SwiftUI

struct SettingsRefreshButton: View {
    let isLoading: Bool
    let action: () -> Void

    private var language: OnboardingLanguage {
        macCurrentLanguage()
    }

    var body: some View {
        if self.isLoading {
            ProgressView()
        } else {
            Button(action: self.action) {
                Label(macLocalized("Refresh", language: self.language), systemImage: "arrow.clockwise")
            }
            .buttonStyle(.bordered)
            .help(macLocalized("Refresh", language: self.language))
        }
    }
}
