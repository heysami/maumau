import Foundation
import MaumauProtocol

enum ManagedBrowserSignInLauncher {
    private struct StartResult: Decodable {
        let ok: Bool
        let profile: String?
    }

    static func startParams(profile: String = "maumau") -> [String: AnyCodable] {
        [
            "method": AnyCodable("POST"),
            "path": AnyCodable("/start"),
            "query": AnyCodable([
                "profile": AnyCodable(profile),
            ]),
            "timeoutMs": AnyCodable(15000),
        ]
    }

    static func start(profile: String = "maumau") async throws {
        let wasBrowserDisabled = !MaumauConfigFile.browserControlEnabled()
        if wasBrowserDisabled {
            MaumauConfigFile.setBrowserControlEnabled(true)
        }

        try await self.startOnce(profile: profile)
    }

    private static func startOnce(profile: String) async throws {
        let data = try await GatewayConnection.shared.requestRaw(
            method: "browser.request",
            params: self.startParams(profile: profile),
            timeoutMs: 20000)
        let decoded = try JSONDecoder().decode(StartResult.self, from: data)
        guard decoded.ok else {
            throw NSError(domain: "ManagedBrowserSignInLauncher", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "browser start did not return ok",
            ])
        }
    }
}
