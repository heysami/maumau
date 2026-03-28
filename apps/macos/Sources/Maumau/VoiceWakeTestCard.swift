import SwiftUI

struct VoiceWakeTestCard: View {
    @Binding var testState: VoiceWakeTestState
    @Binding var isTesting: Bool
    let language: OnboardingLanguage
    let onToggle: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(macLocalized("Test Voice Wake", language: self.language))
                    .font(.callout.weight(.semibold))
                Spacer()
                Button(action: self.onToggle) {
                    Label(
                        self.isTesting
                            ? macLocalized("Stop", language: self.language)
                            : macLocalized("Start test", language: self.language),
                        systemImage: self.isTesting ? "stop.circle.fill" : "play.circle")
                }
                .buttonStyle(.borderedProminent)
                .tint(self.isTesting ? .red : .accentColor)
            }

            HStack(spacing: 8) {
                self.statusIcon
                VStack(alignment: .leading, spacing: 4) {
                    Text(self.statusText)
                        .font(.subheadline)
                        .frame(maxHeight: 22, alignment: .center)
                    if case let .detected(text) = testState {
                        Text(macVoiceWakeHeard(text, language: self.language))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                }
                Spacer()
            }
            .padding(10)
            .background(.quaternary.opacity(0.2))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .frame(minHeight: 54)
        }
        .padding(.vertical, 2)
    }

    private var statusIcon: some View {
        switch self.testState {
        case .idle:
            AnyView(Image(systemName: "waveform").foregroundStyle(.secondary))

        case .requesting:
            AnyView(ProgressView().controlSize(.small))

        case .listening, .hearing:
            AnyView(
                Image(systemName: "ear.and.waveform")
                    .symbolEffect(.pulse)
                    .foregroundStyle(Color.accentColor))

        case .finalizing:
            AnyView(ProgressView().controlSize(.small))

        case .detected:
            AnyView(Image(systemName: "checkmark.circle.fill").foregroundStyle(.green))

        case .failed:
            AnyView(Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.yellow))
        }
    }

    private var statusText: String {
        switch self.testState {
        case .idle:
            macLocalized("Press start, say a trigger word, and wait for detection.", language: self.language)

        case .requesting:
            macLocalized("Requesting mic & speech permission…", language: self.language)

        case .listening:
            macLocalized("Listening… say your trigger word.", language: self.language)

        case let .hearing(text):
            macVoiceWakeHeard(text, language: self.language)

        case .finalizing:
            macLocalized("Finalizing…", language: self.language)

        case .detected:
            macLocalized("Voice wake detected!", language: self.language)

        case let .failed(reason):
            macVoiceWakeFailureText(reason, language: self.language)
        }
    }
}
