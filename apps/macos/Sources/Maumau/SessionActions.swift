import AppKit
import Foundation

enum SessionActions {
    static func patchSession(
        key: String,
        thinking: String?? = nil,
        verbose: String?? = nil,
        replyLanguage: String?? = nil) async throws
    {
        var params: [String: AnyHashable] = ["key": AnyHashable(key)]

        if let thinking {
            params["thinkingLevel"] = thinking.map(AnyHashable.init) ?? AnyHashable(NSNull())
        }
        if let verbose {
            params["verboseLevel"] = verbose.map(AnyHashable.init) ?? AnyHashable(NSNull())
        }
        if let replyLanguage {
            params["replyLanguage"] = replyLanguage.map(AnyHashable.init) ?? AnyHashable(NSNull())
        }

        _ = try await ControlChannel.shared.request(method: "sessions.patch", params: params)
    }

    static func syncReplyLanguagePreference(_ language: OnboardingLanguage) async {
        var keys: [String] = []
        var seen = Set<String>()

        let activeSessionKey = await MainActor.run {
            WebChatManager.shared.activeSessionKey?.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if let activeSessionKey, !activeSessionKey.isEmpty, seen.insert(activeSessionKey).inserted {
            keys.append(activeSessionKey)
        }

        let mainSessionKey = await GatewayConnection.shared.mainSessionKey()
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if !mainSessionKey.isEmpty, seen.insert(mainSessionKey).inserted {
            keys.append(mainSessionKey)
        }

        for key in keys {
            try? await self.patchSession(key: key, replyLanguage: .some(.some(language.replyLanguageID)))
        }
    }

    static func resetSession(key: String) async throws {
        _ = try await ControlChannel.shared.request(
            method: "sessions.reset",
            params: ["key": AnyHashable(key)])
    }

    static func deleteSession(key: String) async throws {
        _ = try await ControlChannel.shared.request(
            method: "sessions.delete",
            params: ["key": AnyHashable(key), "deleteTranscript": AnyHashable(true)])
    }

    static func compactSession(key: String, maxLines: Int = 400) async throws {
        _ = try await ControlChannel.shared.request(
            method: "sessions.compact",
            params: ["key": AnyHashable(key), "maxLines": AnyHashable(maxLines)])
    }

    @MainActor
    static func confirmDestructiveAction(title: String, message: String, action: String) -> Bool {
        let language = AppStateStore.shared.effectiveOnboardingLanguage
        let alert = NSAlert()
        alert.messageText = macLocalized(title, language: language)
        alert.informativeText = macWizardText(message, language: language) ?? message
        alert.addButton(withTitle: macLocalized(action, language: language))
        alert.addButton(withTitle: macLocalized("Cancel", language: language))
        alert.alertStyle = .warning
        return alert.runModal() == .alertFirstButtonReturn
    }

    @MainActor
    static func presentError(title: String, error: Error) {
        let language = AppStateStore.shared.effectiveOnboardingLanguage
        let alert = NSAlert()
        alert.messageText = macLocalized(title, language: language)
        let description = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        alert.informativeText = macWizardText(description, language: language) ?? description
        alert.addButton(withTitle: macLocalized("OK", language: language))
        alert.alertStyle = .warning
        alert.runModal()
    }

    @MainActor
    static func openSessionLogInCode(sessionId: String, storePath: String?) {
        let candidates: [URL] = {
            var urls: [URL] = []
            if let storePath, !storePath.isEmpty {
                let dir = URL(fileURLWithPath: storePath).deletingLastPathComponent()
                urls.append(dir.appendingPathComponent("\(sessionId).jsonl"))
            }
            urls.append(MaumauPaths.stateDirURL.appendingPathComponent("sessions/\(sessionId).jsonl"))
            return urls
        }()

        let existing = candidates.first(where: { FileManager().fileExists(atPath: $0.path) })
        guard let url = existing else {
            let language = AppStateStore.shared.effectiveOnboardingLanguage
            let alert = NSAlert()
            alert.messageText = macLocalized("Session log not found", language: language)
            alert.informativeText = sessionId
            alert.runModal()
            return
        }

        let proc = Process()
        proc.launchPath = "/usr/bin/env"
        proc.arguments = ["code", url.path]
        if (try? proc.run()) != nil {
            return
        }

        NSWorkspace.shared.activateFileViewerSelecting([url])
    }
}
