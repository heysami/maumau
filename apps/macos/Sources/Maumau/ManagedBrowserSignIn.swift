import Foundation
import MaumauIPC

enum ManagedBrowserSignInLauncher {
    private struct ProxyEnvelope<Result: Decodable>: Decodable {
        let result: Result
    }

    private struct StartResult: Decodable {
        let ok: Bool
        let profile: String?
    }

    static func startParams(profile: String = "maumau") -> [String: AnyCodable] {
        [
            "method": AnyCodable("POST"),
            "path": AnyCodable("/start"),
            "profile": AnyCodable(profile),
            "timeoutMs": AnyCodable(15000),
        ]
    }

    static func start(profile: String = "maumau") async throws {
        let wasBrowserDisabled = !MaumauConfigFile.browserControlEnabled()
        if wasBrowserDisabled {
            MaumauConfigFile.setBrowserControlEnabled(true)
            try? await Task.sleep(for: .milliseconds(700))
        }

        do {
            try await self.startOnce(profile: profile)
        } catch {
            guard wasBrowserDisabled else { throw error }
            try? await Task.sleep(for: .milliseconds(1200))
            try await self.startOnce(profile: profile)
        }
    }

    private static func encodeParamsJSON(_ params: [String: AnyCodable]) throws -> String {
        let data = try JSONEncoder().encode(params)
        guard let json = String(data: data, encoding: .utf8) else {
            throw NSError(domain: "ManagedBrowserSignInLauncher", code: 2, userInfo: [
                NSLocalizedDescriptionKey: "failed to encode browser proxy request",
            ])
        }
        return json
    }

    private static func startOnce(profile: String) async throws {
        let payload = try await MacNodeBrowserProxy.shared.request(
            paramsJSON: self.encodeParamsJSON(self.startParams(profile: profile)))
        let decoded = try JSONDecoder().decode(
            ProxyEnvelope<StartResult>.self,
            from: Data(payload.utf8))
        guard decoded.result.ok else {
            throw NSError(domain: "ManagedBrowserSignInLauncher", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "browser start did not return ok",
            ])
        }
    }
}
