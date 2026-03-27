import Foundation

public struct DeviceAuthEntry: Codable, Sendable {
    public let token: String
    public let role: String
    public let scopes: [String]
    public let updatedAtMs: Int

    public init(token: String, role: String, scopes: [String], updatedAtMs: Int) {
        self.token = token
        self.role = role
        self.scopes = scopes
        self.updatedAtMs = updatedAtMs
    }
}

private struct DeviceAuthStoreFile: Codable {
    var version: Int
    var deviceId: String
    var tokens: [String: DeviceAuthEntry]
}

public enum DeviceAuthStore {
    private static let fileName = "device-auth.json"

    public static func loadToken(
        deviceId: String,
        role: String,
        namespace: String? = nil
    ) -> DeviceAuthEntry? {
        guard let store = readStore(namespace: namespace), store.deviceId == deviceId else { return nil }
        let role = normalizeRole(role)
        return store.tokens[role]
    }

    public static func storeToken(
        deviceId: String,
        role: String,
        token: String,
        scopes: [String] = [],
        namespace: String? = nil
    ) -> DeviceAuthEntry {
        let normalizedRole = normalizeRole(role)
        var next = readStore(namespace: namespace)
        if next?.deviceId != deviceId {
            next = DeviceAuthStoreFile(version: 1, deviceId: deviceId, tokens: [:])
        }
        let entry = DeviceAuthEntry(
            token: token,
            role: normalizedRole,
            scopes: normalizeScopes(scopes),
            updatedAtMs: Int(Date().timeIntervalSince1970 * 1000)
        )
        if next == nil {
            next = DeviceAuthStoreFile(version: 1, deviceId: deviceId, tokens: [:])
        }
        next?.tokens[normalizedRole] = entry
        if let store = next {
            writeStore(store, namespace: namespace)
        }
        return entry
    }

    public static func clearToken(deviceId: String, role: String, namespace: String? = nil) {
        guard var store = readStore(namespace: namespace), store.deviceId == deviceId else { return }
        let normalizedRole = normalizeRole(role)
        guard store.tokens[normalizedRole] != nil else { return }
        store.tokens.removeValue(forKey: normalizedRole)
        writeStore(store, namespace: namespace)
    }

    private static func normalizeRole(_ role: String) -> String {
        role.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func normalizeScopes(_ scopes: [String]) -> [String] {
        let trimmed = scopes
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        return Array(Set(trimmed)).sorted()
    }

    private static func fileURL(namespace: String?) -> URL {
        DeviceIdentityPaths.stateDirURL()
            .appendingPathComponent("identity", isDirectory: true)
            .appendingPathComponent(self.authFileName(namespace: namespace), isDirectory: false)
    }

    private static func readStore(namespace: String?) -> DeviceAuthStoreFile? {
        let url = fileURL(namespace: namespace)
        guard let data = try? Data(contentsOf: url) else { return nil }
        guard let decoded = try? JSONDecoder().decode(DeviceAuthStoreFile.self, from: data) else {
            return nil
        }
        guard decoded.version == 1 else { return nil }
        return decoded
    }

    private static func writeStore(_ store: DeviceAuthStoreFile, namespace: String?) {
        let url = fileURL(namespace: namespace)
        do {
            try FileManager.default.createDirectory(
                at: url.deletingLastPathComponent(),
                withIntermediateDirectories: true)
            let data = try JSONEncoder().encode(store)
            try data.write(to: url, options: [.atomic])
            try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
        } catch {
            // best-effort only
        }
    }

    private static func authFileName(namespace: String?) -> String {
        guard let namespace = self.sanitize(namespace), !namespace.isEmpty else {
            return self.fileName
        }
        return "device-auth-\(namespace).json"
    }

    private static func sanitize(_ namespace: String?) -> String? {
        guard let namespace else { return nil }
        let trimmed = namespace.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let sanitized = trimmed.unicodeScalars.map { scalar -> Character in
            if CharacterSet.alphanumerics.contains(scalar) || scalar == "-" || scalar == "_" {
                return Character(scalar)
            }
            return "-"
        }
        return String(sanitized)
    }
}
