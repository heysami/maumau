import MaumauChatUI
import MaumauKit
import SwiftUI

struct ChatSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: MaumauChatViewModel
    private let userAccent: Color?
    private let agentName: String?
    private let localeID: String?

    init(gateway: GatewayNodeSession, sessionKey: String, agentName: String? = nil, userAccent: Color? = nil) {
        let transport = IOSGatewayChatTransport(gateway: gateway)
        self._viewModel = State(
            initialValue: MaumauChatViewModel(
                sessionKey: sessionKey,
                transport: transport))
        self.userAccent = userAccent
        self.agentName = agentName
        self.localeID = Locale.preferredLanguages.first ?? Locale.current.identifier
    }

    var body: some View {
        NavigationStack {
            MaumauChatView(
                viewModel: self.viewModel,
                showsSessionSwitcher: true,
                userAccent: self.userAccent,
                localeID: self.localeID)
                .navigationTitle(self.chatTitle)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            self.dismiss()
                        } label: {
                            Image(systemName: "xmark")
                        }
                        .accessibilityLabel(
                            MaumauSharedLocalization.fallbackString(
                                path: ["shared", "chat", "closeButton"],
                                localeID: self.localeID,
                                fallback: "Close"))
                    }
                }
        }
    }

    private var chatTitle: String {
        let trimmed = (self.agentName ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let title = MaumauSharedLocalization.fallbackString(
            path: ["shared", "chat", "titleDefault"],
            localeID: self.localeID,
            fallback: "Chat")
        if trimmed.isEmpty { return title }
        return MaumauSharedLocalization.fallbackString(
            path: ["shared", "chat", "titleWithAgent"],
            localeID: self.localeID,
            fallback: "\(title) (\(trimmed))",
            parameters: ["agentName": trimmed])
    }
}
