import AppKit
import SwiftUI

enum OnboardingStepBadge: String, CaseIterable, Identifiable {
    case required
    case optional
    case needsPrep

    var id: String { self.rawValue }

    func title(in language: OnboardingLanguage) -> String {
        OnboardingStrings(language: language).badgeTitle(self)
    }

    func compactTitle(in language: OnboardingLanguage) -> String {
        OnboardingStrings(language: language).badgeTitle(self, compact: true)
    }

    var tint: Color {
        switch self {
        case .required:
            .blue
        case .optional:
            .secondary
        case .needsPrep:
            .orange
        }
    }
}

enum OnboardingHeaderStage: String, CaseIterable, Identifiable {
    case home
    case brain
    case chat
    case access
    case permissions
    case automation
    case tools

    var id: String { self.rawValue }

    func title(in language: OnboardingLanguage) -> String {
        OnboardingStrings(language: language).stageTitle(self)
    }

    func headerSubtitle(in language: OnboardingLanguage) -> String {
        OnboardingStrings(language: language).stageHeaderSubtitle(self)
    }

    func explainerTitle(in language: OnboardingLanguage) -> String {
        OnboardingStrings(language: language).stageExplainerTitle(self)
    }

    func explainerBody(in language: OnboardingLanguage) -> String {
        OnboardingStrings(language: language).stageExplainerBody(self)
    }

    var systemImage: String {
        switch self {
        case .home:
            "house.fill"
        case .brain:
            "sparkles"
        case .chat:
            "message.fill"
        case .access:
            "point.3.connected.trianglepath.dotted"
        case .permissions:
            "lock.shield.fill"
        case .automation:
            "phone.connection.fill"
        case .tools:
            "wrench.and.screwdriver.fill"
        }
    }

    var tint: Color {
        switch self {
        case .home:
            .blue
        case .brain:
            .orange
        case .chat:
            .green
        case .access:
            .indigo
        case .permissions:
            .pink
        case .automation:
            .blue
        case .tools:
            .teal
        }
    }
}

struct OnboardingHeaderHero: View {
    struct StepItem: Identifiable {
        let stage: OnboardingHeaderStage
        let title: String
        let metaText: String?
        let isActive: Bool
        let isComplete: Bool
        let isLocked: Bool
        let action: () -> Void

        var id: String { self.stage.id }
    }

    let steps: [StepItem]

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(self.steps.enumerated()), id: \.element.id) { index, step in
                if index > 0 {
                    OnboardingHeaderConnector(isComplete: self.steps[index - 1].isComplete)
                }
                OnboardingHeaderStageCard(step: step, stepNumber: index + 1)
                    .frame(maxWidth: .infinity)
            }
        }
        .frame(maxWidth: .infinity)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.horizontal, 18)
        .padding(.vertical, 8)
    }
}

struct OnboardingMeaningCard: View {
    let stage: OnboardingHeaderStage
    let title: String
    let bodyText: String
    let badges: [OnboardingStepBadge]
    let detailNote: String?
    let language: OnboardingLanguage

    init(
        stage: OnboardingHeaderStage,
        title: String,
        bodyText: String,
        badges: [OnboardingStepBadge] = [],
        detailNote: String? = nil,
        language: OnboardingLanguage = .fallback)
    {
        self.stage = stage
        self.title = title
        self.bodyText = bodyText
        self.badges = badges
        self.detailNote = detailNote
        self.language = language
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack {
                Circle()
                    .fill(self.stage.tint.opacity(0.16))
                    .frame(width: 34, height: 34)

                Image(systemName: self.stage.systemImage)
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(self.stage.tint)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(self.title)
                    .font(.headline)

                if !self.badges.isEmpty {
                    HStack(spacing: 6) {
                        ForEach(self.badges) { badge in
                            StatusPill(text: badge.title(in: self.language), tint: badge.tint)
                        }
                    }
                }

                Text(self.bodyText)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                if let detailNote, !detailNote.isEmpty {
                    Text(detailNote)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

private struct OnboardingHeaderStageCard: View {
    let step: OnboardingHeaderHero.StepItem
    let stepNumber: Int

    var body: some View {
        Button(action: self.step.action) {
            VStack(spacing: 6) {
                ZStack {
                    Circle()
                        .fill(self.circleFill)
                        .frame(width: 26, height: 26)
                        .overlay(
                            Circle()
                                .stroke(self.circleStroke, lineWidth: 1))

                    if self.step.isComplete && !self.step.isActive {
                        Image(systemName: "checkmark")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(self.step.stage.tint)
                    } else {
                        Text("\(self.stepNumber)")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(self.step.isActive ? self.step.stage.tint : .secondary)
                    }
                }

                Text(self.step.title)
                    .font(.caption2.weight(self.step.isActive ? .semibold : .medium))
                    .foregroundStyle(self.labelColor)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity, minHeight: 26, alignment: .top)
                    .lineLimit(2)

                if let metaText = self.step.metaText, !metaText.isEmpty {
                    Text(metaText)
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(.tertiary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.72)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 4)
        }
        .contentShape(Rectangle())
        .opacity(self.step.isLocked ? 0.45 : 1)
        .buttonStyle(.plain)
        .disabled(self.step.isLocked)
        .accessibilityLabel(self.step.title)
    }

    private var circleFill: Color {
        if self.step.isActive || self.step.isComplete {
            return self.step.stage.tint.opacity(0.18)
        }
        return Color.secondary.opacity(0.08)
    }

    private var circleStroke: Color {
        if self.step.isActive || self.step.isComplete {
            return self.step.stage.tint.opacity(0.35)
        }
        return Color.secondary.opacity(0.12)
    }

    private var labelColor: Color {
        self.step.isActive ? .primary : .secondary
    }
}

private struct OnboardingHeaderConnector: View {
    let isComplete: Bool

    var body: some View {
        Rectangle()
            .fill(self.isComplete ? Color.accentColor.opacity(0.28) : Color.secondary.opacity(0.12))
            .frame(width: 18, height: 1.5)
            .padding(.horizontal, 2)
            .padding(.bottom, 20)
            .accessibilityHidden(true)
    }
}
