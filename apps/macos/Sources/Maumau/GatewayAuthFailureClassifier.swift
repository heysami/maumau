import Foundation
import MaumauKit

enum GatewayAuthFailureClassifier {
    private static let explicitAuthMessageFragments = [
        "unauthorized",
        "auth rejected",
        "rejected auth",
        "auth required",
        "authentication required",
        "authentication failed",
        "auth failed",
        "token mismatch",
        "token missing",
        "token not configured",
        "password mismatch",
        "password missing",
        "password not configured",
        "bootstrap token",
        "pairing required",
        "device identity required",
        "device auth invalid",
        "device auth",
    ]

    static func isAuthFailure(_ error: Error) -> Bool {
        if let authError = error as? GatewayConnectAuthError {
            return authError.detail != nil || !authError.message.isEmpty
        }
        if let urlError = error as? URLError, urlError.code == .dataNotAllowed {
            return true
        }
        let nsError = error as NSError
        if nsError.domain == "Gateway", nsError.code == 1008 {
            return true
        }
        let message = nsError.localizedDescription
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        if message.isEmpty {
            return false
        }
        if message.contains("timed out") || message.contains("timeout") {
            return false
        }
        return Self.explicitAuthMessageFragments.contains { message.contains($0) }
    }
}
