import AppKit
import Foundation
import MaumauKit
import OSLog
import Security

private let deepLinkLogger = Logger(subsystem: "ai.maumau", category: "DeepLink")

enum DeepLinkAgentPolicy {
    static let maxMessageChars = 20000
    static let maxUnkeyedConfirmChars = 240

    enum ValidationError: Error, Equatable, LocalizedError {
        case messageTooLongForConfirmation(max: Int, actual: Int)

        var errorDescription: String? {
            switch self {
            case let .messageTooLongForConfirmation(max, actual):
                macDeepLinkMessageTooLong(max: max, actual: actual, language: macCurrentLanguage())
            }
        }
    }

    static func validateMessageForHandle(message: String, allowUnattended: Bool) -> Result<Void, ValidationError> {
        if !allowUnattended, message.count > self.maxUnkeyedConfirmChars {
            return .failure(.messageTooLongForConfirmation(max: self.maxUnkeyedConfirmChars, actual: message.count))
        }
        return .success(())
    }

    static func effectiveDelivery(
        link: AgentDeepLink,
        allowUnattended: Bool) -> (deliver: Bool, to: String?, channel: GatewayAgentChannel)
    {
        if !allowUnattended {
            // Without the unattended key, ignore delivery/routing knobs to reduce exfiltration risk.
            return (deliver: false, to: nil, channel: .last)
        }
        let channel = GatewayAgentChannel(raw: link.channel)
        let deliver = channel.shouldDeliver(link.deliver)
        let to = link.to?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty
        return (deliver: deliver, to: to, channel: channel)
    }
}

@MainActor
final class DeepLinkHandler {
    static let shared = DeepLinkHandler()

    private var lastPromptAt: Date = .distantPast

    /// Ephemeral, in-memory key used for unattended deep links originating from the in-app Canvas.
    /// This avoids blocking Canvas init on UserDefaults and doesn't weaken the external deep-link prompt:
    /// outside callers can't know this randomly generated key.
    private nonisolated static let canvasUnattendedKey: String = DeepLinkHandler.generateRandomKey()

    func handle(url: URL) async {
        guard let route = DeepLinkParser.parse(url) else {
            deepLinkLogger.debug("ignored url \(url.absoluteString, privacy: .public)")
            return
        }
        guard !AppStateStore.shared.isPaused else {
            self.presentAlert(
                title: "Maumau is paused",
                message: "Unpause Maumau to run agent actions.")
            return
        }

        switch route {
        case let .agent(link):
            await self.handleAgent(link: link, originalURL: url)
        case .gateway:
            break
        }
    }

    private func handleAgent(link: AgentDeepLink, originalURL: URL) async {
        let messagePreview = link.message.trimmingCharacters(in: .whitespacesAndNewlines)
        if messagePreview.count > DeepLinkAgentPolicy.maxMessageChars {
            self.presentAlert(title: "Deep link too large", message: "Message exceeds 20,000 characters.")
            return
        }

        let allowUnattended = link.key == Self.canvasUnattendedKey || link.key == Self.expectedKey()
        if !allowUnattended {
            if Date().timeIntervalSince(self.lastPromptAt) < 1.0 {
                deepLinkLogger.debug("throttling deep link prompt")
                return
            }
            self.lastPromptAt = Date()

            if case let .failure(error) = DeepLinkAgentPolicy.validateMessageForHandle(
                message: messagePreview,
                allowUnattended: allowUnattended)
            {
                self.presentAlert(title: "Deep link blocked", message: error.localizedDescription)
                return
            }

            let urlText = originalURL.absoluteString
            let urlPreview = urlText.count > 500 ? "\(urlText.prefix(500))…" : urlText
            let body = macDeepLinkRunBody(
                messagePreview: messagePreview,
                urlPreview: urlPreview,
                language: AppStateStore.shared.effectiveOnboardingLanguage)
            guard self.confirm(title: "Run Maumau agent?", message: body) else { return }
        }

        if AppStateStore.shared.connectionMode == .local {
            GatewayProcessManager.shared.setActive(true)
        }

        do {
            let effectiveDelivery = DeepLinkAgentPolicy.effectiveDelivery(link: link, allowUnattended: allowUnattended)
            let explicitSessionKey = link.sessionKey?
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .nonEmpty
            let resolvedSessionKey: String = if let explicitSessionKey {
                explicitSessionKey
            } else {
                await GatewayConnection.shared.mainSessionKey()
            }
            let invocation = GatewayAgentInvocation(
                message: messagePreview,
                sessionKey: resolvedSessionKey,
                thinking: link.thinking?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
                deliver: effectiveDelivery.deliver,
                to: effectiveDelivery.to,
                channel: effectiveDelivery.channel,
                timeoutSeconds: link.timeoutSeconds,
                idempotencyKey: UUID().uuidString)

            let res = await GatewayConnection.shared.sendAgent(invocation)
            if !res.ok {
                throw NSError(
                    domain: "DeepLink",
                    code: 1,
                    userInfo: [NSLocalizedDescriptionKey: res.error ?? "agent request failed"])
            }
        } catch {
            self.presentAlert(title: "Agent request failed", message: error.localizedDescription)
        }
    }

    // MARK: - Auth

    static func currentKey() -> String {
        self.expectedKey()
    }

    static func currentCanvasKey() -> String {
        self.canvasUnattendedKey
    }

    private static func expectedKey() -> String {
        let defaults = UserDefaults.standard
        if let key = defaults.string(forKey: deepLinkKeyKey), !key.isEmpty {
            return key
        }
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        let data = Data(bytes)
        let key = data
            .base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        defaults.set(key, forKey: deepLinkKeyKey)
        return key
    }

    private nonisolated static func generateRandomKey() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        let data = Data(bytes)
        return data
            .base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    // MARK: - UI

    private func confirm(title: String, message: String) -> Bool {
        let language = AppStateStore.shared.effectiveOnboardingLanguage
        let alert = NSAlert()
        alert.messageText = macLocalized(title, language: language)
        alert.informativeText = macWizardText(message, language: language) ?? message
        alert.addButton(withTitle: macLocalized("Run", language: language))
        alert.addButton(withTitle: macLocalized("Cancel", language: language))
        alert.alertStyle = .warning
        return alert.runModal() == .alertFirstButtonReturn
    }

    private func presentAlert(title: String, message: String) {
        let language = AppStateStore.shared.effectiveOnboardingLanguage
        let alert = NSAlert()
        alert.messageText = macLocalized(title, language: language)
        alert.informativeText = macWizardText(message, language: language) ?? message
        alert.addButton(withTitle: macLocalized("OK", language: language))
        alert.alertStyle = .informational
        alert.runModal()
    }
}
