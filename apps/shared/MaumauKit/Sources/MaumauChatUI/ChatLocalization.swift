import Foundation
import MaumauKit

struct ChatLocalization {
    let localeID: String?

    func text(_ key: String, fallback: String, parameters: [String: String] = [:]) -> String {
        MaumauSharedLocalization.fallbackString(
            path: ["shared", "chat", key],
            localeID: self.localeID,
            fallback: fallback,
            parameters: parameters)
    }
}
