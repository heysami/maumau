import Foundation
import Testing
@testable import Maumau

@Suite(.serialized)
@MainActor
struct CLIInstallerTests {
    @Test func `installed location finds executable`() throws {
        let fm = FileManager()
        let root = fm.temporaryDirectory.appendingPathComponent(
            "maumau-cli-installer-\(UUID().uuidString)")
        defer { try? fm.removeItem(at: root) }

        let binDir = root.appendingPathComponent("bin")
        try fm.createDirectory(at: binDir, withIntermediateDirectories: true)
        let cli = binDir.appendingPathComponent("maumau")
        fm.createFile(atPath: cli.path, contents: Data())
        try fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: cli.path)

        let found = CLIInstaller.installedLocation(
            searchPaths: [binDir.path],
            fileManager: fm)
        #expect(found == cli.path)

        try fm.removeItem(at: cli)
        fm.createFile(atPath: cli.path, contents: Data())
        try fm.setAttributes([.posixPermissions: 0o644], ofItemAtPath: cli.path)

        let missing = CLIInstaller.installedLocation(
            searchPaths: [binDir.path],
            fileManager: fm)
        #expect(missing == nil)
    }

    @Test func `install command uses stable URL and pipefail`() {
        let command = CLIInstaller.installScriptCommand(
            version: "2026.3.25",
            prefix: "/tmp/maumau")

        #expect(command.count == 3)
        #expect(command[0] == "/bin/bash")
        #expect(command[1] == "-lc")

        let script = command[2]
        #expect(script.contains("set -euo pipefail"))
        #expect(script.contains(CLIInstaller.installScriptURL))
        #expect(script.contains("--json --no-onboard"))
        #expect(!script.contains("maumau.bot"))
    }

    @Test func `local fallback links repo cli into managed bin`() throws {
        let fm = FileManager()
        let root = fm.temporaryDirectory.appendingPathComponent(
            "maumau-cli-fallback-\(UUID().uuidString)")
        defer { try? fm.removeItem(at: root) }

        let projectRoot = root.appendingPathComponent("project")
        try fm.createDirectory(at: projectRoot, withIntermediateDirectories: true)
        let source = projectRoot.appendingPathComponent("maumau.mjs")
        let sourceBody = "#!/usr/bin/env node\nconsole.log('maumau')\n".data(using: .utf8)
        fm.createFile(atPath: source.path, contents: sourceBody)
        try fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: source.path)

        let prefix = root.appendingPathComponent("managed").path
        let linked = try CLIInstaller.installLocalFallback(
            prefix: prefix,
            projectRoot: projectRoot,
            fileManager: fm)

        let expected = root.appendingPathComponent("managed/bin/maumau").path
        #expect(linked == expected)
        let destination = try fm.destinationOfSymbolicLink(atPath: expected)
        #expect(destination == source.path)
    }

    @Test func `prefers local checkout for bundled local app layout`() throws {
        let fm = FileManager()
        let root = fm.temporaryDirectory.appendingPathComponent(
            "maumau-cli-local-pref-\(UUID().uuidString)")
        defer { try? fm.removeItem(at: root) }

        let projectRoot = root.appendingPathComponent("project")
        let appBundle = projectRoot.appendingPathComponent("dist/Maumau.app")
        try fm.createDirectory(at: appBundle, withIntermediateDirectories: true)
        let entrypoint = projectRoot.appendingPathComponent("maumau.mjs")
        fm.createFile(atPath: entrypoint.path, contents: Data("#!/usr/bin/env node\n".utf8))
        try fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: entrypoint.path)

        let prefersLocal = CLIInstaller.shouldPreferLocalCheckout(
            projectRoot: projectRoot,
            bundleURL: appBundle,
            fileManager: fm)
        #expect(prefersLocal == true)
    }
}
