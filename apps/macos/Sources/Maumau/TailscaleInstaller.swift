import Foundation

enum TailscaleInstaller {
    static let latestPackageURL = "https://pkgs.tailscale.com/stable/Tailscale-latest-macos.pkg"
    static let standaloneAppPath = "/Applications/Tailscale.app"
    static let standaloneBinaryPath = "/Applications/Tailscale.app/Contents/MacOS/Tailscale"
    static let browserSignInTimeoutSeconds = 15

    static func packageCacheDirectory(fileManager: FileManager = .default) -> String {
        fileManager.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Caches/ai.maumau/tailscale", isDirectory: true)
            .path
    }

    static func downloadCommand(cacheDirectory: String) -> [String] {
        let escapedCacheDirectory = self.shellEscape(cacheDirectory)
        let escapedPackageURL = self.shellEscape(self.latestPackageURL)
        let script = """
        set -euo pipefail
        cache_dir=\(escapedCacheDirectory)
        /bin/mkdir -p "$cache_dir"
        pkg_url="$(/usr/bin/curl -fsSLI -o /dev/null -w '%{url_effective}' \(escapedPackageURL))"
        pkg_name="$(/usr/bin/basename "$pkg_url")"
        pkg_path="$cache_dir/$pkg_name"
        /usr/bin/curl -fsSL "$pkg_url" -o "$pkg_path"
        printf '%s\\n' "$pkg_path"
        """
        return ["/bin/bash", "-lc", script]
    }

    static func installCommand(pkgPath: String) -> String {
        "/usr/sbin/installer -pkg \(self.shellEscape(pkgPath)) -target /"
    }

    static func browserSignInCommand(binaryPath: String) -> [String] {
        let escapedBinaryPath = self.shellEscape(binaryPath)
        let script = """
        set -euo pipefail
        \(escapedBinaryPath) login --timeout \(self.browserSignInTimeoutSeconds)s 2>&1 || true
        """
        return ["/bin/bash", "-lc", script]
    }

    static func parseDownloadedPackagePath(_ output: String) -> String? {
        output
            .split(whereSeparator: \.isNewline)
            .map(String.init)
            .reversed()
            .first(where: { $0.hasSuffix(".pkg") })
    }

    static func extractFirstHTTPSURL(from text: String) -> String? {
        let pattern = #"https://[^\s"']+"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        guard let match = regex.firstMatch(in: text, range: range),
              let matchRange = Range(match.range, in: text)
        else {
            return nil
        }
        return String(text[matchRange]).trimmingCharacters(in: CharacterSet(charactersIn: ".,)"))
    }

    static func appleScriptEscape(_ raw: String) -> String {
        raw
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
    }

    private static func shellEscape(_ raw: String) -> String {
        "'" + raw.replacingOccurrences(of: "'", with: "'\"'\"'") + "'"
    }
}
