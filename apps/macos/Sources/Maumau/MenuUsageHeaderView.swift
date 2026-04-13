import SwiftUI

struct MenuUsageHeaderView: View {
    let count: Int

    private var language: OnboardingLanguage {
        AppStateStore.shared.effectiveOnboardingLanguage
    }

    var body: some View {
        MenuHeaderCard(
            title: macLocalized("Usage", language: self.language),
            subtitle: self.subtitle)
    }

    private var subtitle: String {
        if self.count == 1 {
            return macLocalizedHelper("usageHeader.provider.one", language: self.language, fallback: "1 provider")
        }
        return macLocalizedHelper(
            "usageHeader.provider.other",
            language: self.language,
            parameters: ["count": String(self.count)],
            fallback: "{count} providers")
    }
}
