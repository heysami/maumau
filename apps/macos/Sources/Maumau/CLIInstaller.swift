import Foundation

@MainActor
enum CLIInstaller {
    static let installScriptURL = "https://maumau.ai/install-cli.sh"

    static func shouldPreferLocalCheckout(
        projectRoot: URL = CommandResolver.projectRoot(),
        bundleURL: URL = Bundle.main.bundleURL,
        fileManager: FileManager = .default) -> Bool
    {
        guard CommandResolver.prefersProjectLocalExecutables(
            projectRoot: projectRoot,
            bundleURL: bundleURL,
            fileManager: fileManager)
        else {
            return false
        }
        return CommandResolver.gatewayEntrypoint(in: projectRoot) != nil
    }

    static func installedLocation() -> String? {
        self.installedLocation(
            searchPaths: CommandResolver.preferredPaths(),
            fileManager: .default)
    }

    static func installedLocation(
        searchPaths: [String],
        fileManager: FileManager) -> String?
    {
        for basePath in searchPaths {
            let candidate = URL(fileURLWithPath: basePath).appendingPathComponent("maumau").path
            var isDirectory: ObjCBool = false

            guard fileManager.fileExists(atPath: candidate, isDirectory: &isDirectory),
                  !isDirectory.boolValue
            else {
                continue
            }

            guard fileManager.isExecutableFile(atPath: candidate) else { continue }

            return candidate
        }

        return nil
    }

    static func isInstalled() -> Bool {
        self.installedLocation() != nil
    }

    static func install(statusHandler: @escaping @MainActor @Sendable (String) async -> Void) async {
        let expected = GatewayEnvironment.expectedGatewayVersionString() ?? "latest"
        let prefix = Self.installPrefix()
        if self.shouldPreferLocalCheckout() {
            if let linkedPath = try? self.installLocalFallback(prefix: prefix) {
                await statusHandler("Linked local maumau checkout at \(linkedPath).")
                return
            }
        }
        await statusHandler("Installing maumau CLI…")
        let cmd = self.installScriptCommand(version: expected, prefix: prefix)
        let response = await ShellExecutor.runDetailed(command: cmd, cwd: nil, env: nil, timeout: 900)
        let parsed = self.parseInstallEvents(response.stdout)

        if response.success {
            guard self.installedLocation() != nil else {
                if let linkedPath = try? self.installLocalFallback(prefix: prefix) {
                    await statusHandler("Linked local maumau checkout at \(linkedPath).")
                    return
                }
                await statusHandler("Install failed: installer reported success, but maumau was not found in \(prefix)/bin.")
                return
            }

            let installedVersion = parsed.last { $0.event == "done" }?.version
            let summary = installedVersion.map { "Installed maumau \($0)." } ?? "Installed maumau."
            await statusHandler(summary)
            return
        }

        if let linkedPath = try? self.installLocalFallback(prefix: prefix) {
            await statusHandler("Linked local maumau checkout at \(linkedPath).")
            return
        }

        if let error = parsed.last(where: { $0.event == "error" })?.message {
            await statusHandler("Install failed: \(error)")
            return
        }

        let detail = response.stderr.trimmingCharacters(in: .whitespacesAndNewlines)
        let fallback = response.errorMessage ?? "install failed"
        await statusHandler("Install failed: \(detail.isEmpty ? fallback : detail)")
    }

    private static func installPrefix() -> String {
        FileManager().homeDirectoryForCurrentUser
            .appendingPathComponent(".maumau")
            .path
    }

    static func installScriptCommand(version: String, prefix: String) -> [String] {
        let escapedVersion = self.shellEscape(version)
        let escapedPrefix = self.shellEscape(prefix)
        let script = """
        set -euo pipefail
        curl -fsSL --proto '=https' --tlsv1.2 \(Self.installScriptURL) | \
        bash -s -- --json --no-onboard --prefix \(escapedPrefix) --version \(escapedVersion)
        """
        return ["/bin/bash", "-lc", script]
    }

    static func installLocalFallback(
        prefix: String,
        projectRoot: URL = CommandResolver.projectRoot(),
        fileManager: FileManager = .default) throws -> String?
    {
        let source = projectRoot.appendingPathComponent("maumau.mjs")
        guard fileManager.isExecutableFile(atPath: source.path) else {
            return nil
        }

        let binDir = URL(fileURLWithPath: prefix, isDirectory: true).appendingPathComponent("bin")
        try fileManager.createDirectory(at: binDir, withIntermediateDirectories: true)

        let target = binDir.appendingPathComponent("maumau")
        if fileManager.fileExists(atPath: target.path) {
            try fileManager.removeItem(at: target)
        }

        try fileManager.createSymbolicLink(at: target, withDestinationURL: source)
        return target.path
    }

    private static func parseInstallEvents(_ output: String) -> [InstallEvent] {
        let decoder = JSONDecoder()
        let lines = output
            .split(whereSeparator: \.isNewline)
            .map { String($0) }
        var events: [InstallEvent] = []
        for line in lines {
            guard let data = line.data(using: .utf8) else { continue }
            if let event = try? decoder.decode(InstallEvent.self, from: data) {
                events.append(event)
            }
        }
        return events
    }

    private static func shellEscape(_ raw: String) -> String {
        "'" + raw.replacingOccurrences(of: "'", with: "'\"'\"'") + "'"
    }
}

private struct InstallEvent: Decodable {
    let event: String
    let version: String?
    let message: String?
}
