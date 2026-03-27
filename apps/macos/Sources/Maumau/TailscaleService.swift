import AppKit
import Foundation
import Observation
import MaumauDiscovery
import os

/// Manages Tailscale integration and status checking.
@Observable
@MainActor
final class TailscaleService {
    struct ActionOutcome {
        let success: Bool
        let message: String
    }

    static let shared = TailscaleService()

    /// Tailscale local API endpoint.
    private static let tailscaleAPIEndpoint = "http://100.100.100.100/api/data"

    /// API request timeout in seconds.
    private static let apiTimeoutInterval: TimeInterval = 5.0

    private let logger = Logger(subsystem: "ai.maumau", category: "tailscale")

    /// Indicates if the Tailscale app is installed on the system.
    private(set) var isInstalled = false

    /// Indicates if Tailscale is currently running.
    private(set) var isRunning = false

    /// The Tailscale hostname for this device (e.g., "my-mac.tailnet.ts.net").
    private(set) var tailscaleHostname: String?

    /// The Tailscale IPv4 address for this device.
    private(set) var tailscaleIP: String?

    /// Error message if status check fails.
    private(set) var statusError: String?

    private init() {
        Task { await self.checkTailscaleStatus() }
    }

    #if DEBUG
    init(
        isInstalled: Bool,
        isRunning: Bool,
        tailscaleHostname: String? = nil,
        tailscaleIP: String? = nil,
        statusError: String? = nil)
    {
        self.isInstalled = isInstalled
        self.isRunning = isRunning
        self.tailscaleHostname = tailscaleHostname
        self.tailscaleIP = tailscaleIP
        self.statusError = statusError
    }
    #endif

    func checkAppInstallation() -> Bool {
        let installed = FileManager().fileExists(atPath: TailscaleInstaller.standaloneAppPath)
        self.logger.info("Tailscale app installed: \(installed)")
        return installed
    }

    private struct TailscaleAPIResponse: Codable {
        let status: String
        let deviceName: String
        let tailnetName: String
        let iPv4: String?

        private enum CodingKeys: String, CodingKey {
            case status = "Status"
            case deviceName = "DeviceName"
            case tailnetName = "TailnetName"
            case iPv4 = "IPv4"
        }
    }

    private func fetchTailscaleStatus() async -> TailscaleAPIResponse? {
        guard let url = URL(string: Self.tailscaleAPIEndpoint) else {
            self.logger.error("Invalid Tailscale API URL")
            return nil
        }

        do {
            let configuration = URLSessionConfiguration.default
            configuration.timeoutIntervalForRequest = Self.apiTimeoutInterval
            let session = URLSession(configuration: configuration)

            let (data, response) = try await session.data(from: url)
            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200
            else {
                self.logger.warning("Tailscale API returned non-200 status")
                return nil
            }

            let decoder = JSONDecoder()
            return try decoder.decode(TailscaleAPIResponse.self, from: data)
        } catch {
            self.logger.debug("Failed to fetch Tailscale status: \(String(describing: error))")
            return nil
        }
    }

    func checkTailscaleStatus() async {
        let previousIP = self.tailscaleIP
        self.isInstalled = self.checkAppInstallation()
        if !self.isInstalled {
            self.isRunning = false
            self.tailscaleHostname = nil
            self.tailscaleIP = nil
            self.statusError = "Tailscale is not installed"
        } else if let apiResponse = await fetchTailscaleStatus() {
            self.isRunning = apiResponse.status.lowercased() == "running"

            if self.isRunning {
                let deviceName = apiResponse.deviceName
                    .lowercased()
                    .replacingOccurrences(of: " ", with: "-")
                let tailnetName = apiResponse.tailnetName
                    .replacingOccurrences(of: ".ts.net", with: "")
                    .replacingOccurrences(of: ".tailscale.net", with: "")

                self.tailscaleHostname = "\(deviceName).\(tailnetName).ts.net"
                self.tailscaleIP = apiResponse.iPv4
                self.statusError = nil

                self.logger.info(
                    "Tailscale running host=\(self.tailscaleHostname ?? "nil") ip=\(self.tailscaleIP ?? "nil")")
            } else {
                self.tailscaleHostname = nil
                self.tailscaleIP = nil
                self.statusError = "Tailscale is not running"
            }
        } else {
            self.isRunning = false
            self.tailscaleHostname = nil
            self.tailscaleIP = nil
            self.statusError = "Please start the Tailscale app"
            self.logger.info("Tailscale API not responding; app likely not running")
        }

        if self.tailscaleIP == nil, let fallback = TailscaleNetwork.detectTailnetIPv4() {
            self.tailscaleIP = fallback
            if !self.isRunning {
                self.isRunning = true
            }
            self.statusError = nil
            self.logger.info("Tailscale interface IP detected (fallback) ip=\(fallback, privacy: .public)")
        }

        if previousIP != self.tailscaleIP {
            await GatewayEndpointStore.shared.refresh()
        }
    }

    func openTailscaleApp() {
        NSWorkspace.shared.open(URL(fileURLWithPath: TailscaleInstaller.standaloneAppPath))
    }

    func openSetupGuide() {
        if let url = URL(string: "https://tailscale.com/kb/1017/install/") {
            NSWorkspace.shared.open(url)
        }
    }

    func installOnThisMac() async -> ActionOutcome {
        let cacheDirectory = TailscaleInstaller.packageCacheDirectory()
        let download = await ShellExecutor.runDetailed(
            command: TailscaleInstaller.downloadCommand(cacheDirectory: cacheDirectory),
            cwd: nil,
            env: nil,
            timeout: 900)

        guard download.success else {
            let message = self.summarizeShellFailure(
                download,
                fallback: "Could not download the official Tailscale installer.")
            self.logger.error("tailscale download failed: \(message, privacy: .public)")
            return ActionOutcome(success: false, message: message)
        }

        guard let packagePath = TailscaleInstaller.parseDownloadedPackagePath(download.stdout) else {
            let message = "Downloaded the Tailscale installer, but Maumau could not find the package file."
            self.logger.error("tailscale package path missing after download")
            return ActionOutcome(success: false, message: message)
        }

        let installResult = self.runPrivilegedShell(TailscaleInstaller.installCommand(pkgPath: packagePath))
        guard installResult.success else {
            self.logger.error("tailscale install failed: \(installResult.message, privacy: .public)")
            return installResult
        }

        await self.checkTailscaleStatus()
        guard self.isInstalled else {
            let message = "The installer finished, but Tailscale was not found in /Applications."
            self.logger.error("tailscale install completed but app not found")
            return ActionOutcome(success: false, message: message)
        }

        self.logger.info("tailscale install completed")
        return ActionOutcome(
            success: true,
            message: "Tailscale is installed on this Mac. Next, open browser sign-in.")
    }

    func openBrowserSignIn() async -> ActionOutcome {
        guard self.checkAppInstallation() else {
            return ActionOutcome(success: false, message: "Install Tailscale on this Mac first.")
        }

        self.openTailscaleApp()
        try? await Task.sleep(nanoseconds: 1_000_000_000)

        if let binaryPath = self.installedBinaryPath() {
            let response = await ShellExecutor.runDetailed(
                command: TailscaleInstaller.browserSignInCommand(binaryPath: binaryPath),
                cwd: nil,
                env: nil,
                timeout: 20)
            let combinedOutput = [response.stdout, response.stderr]
                .filter { !$0.isEmpty }
                .joined(separator: "\n")

            if let rawURL = TailscaleInstaller.extractFirstHTTPSURL(from: combinedOutput),
               let url = URL(string: rawURL)
            {
                NSWorkspace.shared.open(url)
                self.logger.info("tailscale browser sign-in opened")
                return ActionOutcome(
                    success: true,
                    message: "Browser sign-in opened. Finish signing in there, then come back here.")
            }
        }

        await self.checkTailscaleStatus()
        if self.isRunning {
            return ActionOutcome(success: true, message: "This Mac is signed in to Tailscale.")
        }

        return ActionOutcome(
            success: true,
            message: "Tailscale opened. If sign-in is needed, it should send you to your browser.")
    }

    nonisolated static func fallbackTailnetIPv4() -> String? {
        TailscaleNetwork.detectTailnetIPv4()
    }

    private func installedBinaryPath(fileManager: FileManager = .default) -> String? {
        if fileManager.isExecutableFile(atPath: TailscaleInstaller.standaloneBinaryPath) {
            return TailscaleInstaller.standaloneBinaryPath
        }
        return nil
    }

    private func runPrivilegedShell(_ command: String) -> ActionOutcome {
        let escapedCommand = TailscaleInstaller.appleScriptEscape(command)
        let source = """
        do shell script "\(escapedCommand)" with administrator privileges
        """

        var error: NSDictionary?
        let appleScript = NSAppleScript(source: source)
        _ = appleScript?.executeAndReturnError(&error)

        guard let error else {
            return ActionOutcome(success: true, message: "Tailscale installed on this Mac.")
        }

        let code = error["NSAppleScriptErrorNumber"] as? Int
        let message = (error["NSAppleScriptErrorMessage"] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if code == -128 {
            return ActionOutcome(success: false, message: "Installation canceled.")
        }
        return ActionOutcome(
            success: false,
            message: {
                if let message, !message.isEmpty {
                    return message
                }
                return "The installer command failed."
            }())
    }

    private func summarizeShellFailure(_ result: ShellExecutor.ShellResult, fallback: String) -> String {
        let detail = self.lastNonEmptyLine(in: result.stderr) ?? self.lastNonEmptyLine(in: result.stdout)
        let message = detail?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let message, !message.isEmpty {
            return message
        }
        if let resultError = result.errorMessage, !resultError.isEmpty {
            return resultError
        }
        return fallback
    }

    private func lastNonEmptyLine(in text: String) -> String? {
        text
            .split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .reversed()
            .first(where: { !$0.isEmpty })
    }
}
