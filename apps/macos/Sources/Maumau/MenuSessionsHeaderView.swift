import SwiftUI

struct MenuSessionsHeaderView: View {
    let count: Int
    let statusText: String?

    private var language: OnboardingLanguage {
        AppStateStore.shared.effectiveOnboardingLanguage
    }

    var body: some View {
        MenuHeaderCard(
            title: macLocalized("Context", language: self.language),
            subtitle: self.subtitle,
            statusText: self.statusText)
    }

    private var subtitle: String {
        macSessionSubtitle(count: self.count, language: self.language)
    }
}
