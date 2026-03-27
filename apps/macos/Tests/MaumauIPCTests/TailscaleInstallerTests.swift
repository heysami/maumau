import Foundation
import Testing
@testable import Maumau

@Suite(.serialized)
struct TailscaleInstallerTests {
    @Test func `download command uses official package URL and prints package path`() {
        let command = TailscaleInstaller.downloadCommand(cacheDirectory: "/tmp/maumau-tailscale")

        #expect(command.count == 3)
        #expect(command[0] == "/bin/bash")
        #expect(command[1] == "-lc")

        let script = command[2]
        #expect(script.contains("set -euo pipefail"))
        #expect(script.contains(TailscaleInstaller.latestPackageURL))
        #expect(script.contains("/usr/bin/curl -fsSLI"))
        #expect(script.contains("/usr/bin/curl -fsSL"))
        #expect(script.contains("printf '%s\\\\n' \"$pkg_path\""))
    }

    @Test func `install command uses macOS installer target root`() {
        let command = TailscaleInstaller.installCommand(pkgPath: "/tmp/Tailscale.pkg")

        #expect(command.contains("/usr/sbin/installer"))
        #expect(command.contains("-pkg '/tmp/Tailscale.pkg'"))
        #expect(command.contains("-target /"))
    }

    @Test func `browser sign in command uses tailscale login with timeout`() {
        let command = TailscaleInstaller.browserSignInCommand(
            binaryPath: "/Applications/Tailscale.app/Contents/MacOS/Tailscale")

        #expect(command.count == 3)
        let script = command[2]
        #expect(script.contains("login --timeout \(TailscaleInstaller.browserSignInTimeoutSeconds)s"))
        #expect(script.contains("|| true"))
    }

    @Test func `extract first https url trims trailing punctuation`() {
        let output = """
        To authenticate, visit:
        https://login.tailscale.com/a/abcdef).
        """

        let url = TailscaleInstaller.extractFirstHTTPSURL(from: output)
        #expect(url == "https://login.tailscale.com/a/abcdef")
    }
}
