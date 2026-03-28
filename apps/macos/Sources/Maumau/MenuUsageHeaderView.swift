import SwiftUI

struct MenuUsageHeaderView: View {
    let count: Int

    private var language: OnboardingLanguage {
        AppStateStore.shared.effectiveOnboardingLanguage
    }

    var body: some View {
        MenuHeaderCard(
            title: self.language == .id ? "Penggunaan" : "Usage",
            subtitle: self.subtitle)
    }

    private var subtitle: String {
        if self.language == .id {
            return self.count == 1 ? "1 penyedia" : "\(self.count) penyedia"
        }
        return self.count == 1 ? "1 provider" : "\(self.count) providers"
    }
}
