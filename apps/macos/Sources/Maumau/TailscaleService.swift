import AppKit
import Foundation
import Observation
import MaumauDiscovery
import os

/// Manages Tailscale integration and status checking.
@Observable
@MainActor
final class TailscaleService {
    struct ExposureStatus: Equatable {
        let mode: String
        let checked: Bool
        let featureEnabled: Bool
        let active: Bool
        let detail: String?
        let enableURL: String?

        static func idle(mode: String) -> ExposureStatus {
            ExposureStatus(
                mode: mode,
                checked: false,
                featureEnabled: false,
                active: false,
                detail: nil,
                enableURL: nil)
        }
    }

    enum AccessRequirementKind: String, Equatable {
        case install
        case signIn
        case enableFeature
        case password
    }

    struct AccessRequirement: Equatable, Identifiable {
        let kind: AccessRequirementKind
        let mode: String
        let enableURL: String?

        var id: String {
            "\(self.mode):\(self.kind.rawValue)"
        }
    }

    enum AccessFlowPhase: Equatable {
        case idle
        case blocked
        case activating
        case active
        case failed
    }

    struct AccessReadiness: Equatable {
        let mode: String
        let requirements: [AccessRequirement]
        let exposure: ExposureStatus?
        let detail: String?

        var isReady: Bool {
            self.requirements.isEmpty
        }

        var isActive: Bool {
            self.exposure?.active == true
        }

        var enableURL: String? {
            self.requirements.first(where: { $0.kind == .enableFeature })?.enableURL
                ?? self.exposure?.enableURL
        }
    }

    struct AccessFlowState: Equatable {
        let appliedMode: String
        let requestedMode: String
        let phase: AccessFlowPhase
        let requirements: [AccessRequirement]
        let detail: String?
        let exposure: ExposureStatus?

        var enableURL: String? {
            self.requirements.first(where: { $0.kind == .enableFeature })?.enableURL
                ?? self.exposure?.enableURL
        }

        var blocksOnboardingAdvance: Bool {
            self.requestedMode != "off" && self.phase != .idle && self.phase != .active
        }

        static func idle(appliedMode: String) -> AccessFlowState {
            AccessFlowState(
                appliedMode: appliedMode,
                requestedMode: appliedMode,
                phase: .idle,
                requirements: [],
                detail: nil,
                exposure: nil)
        }
    }

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

    private(set) var serveExposure = ExposureStatus.idle(mode: "serve")
    private(set) var funnelExposure = ExposureStatus.idle(mode: "funnel")
    private(set) var accessFlow = AccessFlowState.idle(appliedMode: "off")

    private init() {
        Task { await self.checkTailscaleStatus() }
    }

    #if DEBUG
    init(
        isInstalled: Bool,
        isRunning: Bool,
        tailscaleHostname: String? = nil,
        tailscaleIP: String? = nil,
        statusError: String? = nil,
        serveExposure: ExposureStatus = .idle(mode: "serve"),
        funnelExposure: ExposureStatus = .idle(mode: "funnel"),
        accessFlow: AccessFlowState = .idle(appliedMode: "off"))
    {
        self.isInstalled = isInstalled
        self.isRunning = isRunning
        self.tailscaleHostname = tailscaleHostname
        self.tailscaleIP = tailscaleIP
        self.statusError = statusError
        self.serveExposure = serveExposure
        self.funnelExposure = funnelExposure
        self.accessFlow = accessFlow
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
            self.resetExposureStatuses()
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
                await self.refreshExposureStatuses()
            } else {
                self.tailscaleHostname = nil
                self.tailscaleIP = nil
                self.statusError = "Tailscale is not running"
                self.resetExposureStatuses()
            }
        } else {
            self.isRunning = false
            self.tailscaleHostname = nil
            self.tailscaleIP = nil
            self.statusError = "Please start the Tailscale app"
            self.logger.info("Tailscale API not responding; app likely not running")
            self.resetExposureStatuses()
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

    func exposureStatus(for mode: String) -> ExposureStatus {
        switch mode {
        case "funnel":
            return self.funnelExposure
        default:
            return self.serveExposure
        }
    }

    func readinessForSelection(
        mode: String,
        requiresPassword: Bool,
        password: String,
        refreshStatus: Bool = false) async -> AccessReadiness
    {
        if refreshStatus {
            await self.checkTailscaleStatus()
        }
        let exposure = mode == "serve" || mode == "funnel" ? self.exposureStatus(for: mode) : nil
        return Self.classifyAccessReadiness(
            mode: mode,
            isInstalled: self.isInstalled,
            isRunning: self.isRunning,
            exposure: exposure,
            requiresPassword: requiresPassword,
            password: password)
    }

    func updateAccessFlow(
        appliedMode: String,
        requestedMode: String,
        phase: AccessFlowPhase,
        requirements: [AccessRequirement] = [],
        detail: String? = nil,
        exposure: ExposureStatus? = nil)
    {
        self.accessFlow = AccessFlowState(
            appliedMode: appliedMode,
            requestedMode: requestedMode,
            phase: phase,
            requirements: requirements,
            detail: detail,
            exposure: exposure)
    }

    func clearAccessFlow(appliedMode: String) {
        self.accessFlow = .idle(appliedMode: appliedMode)
    }

    func canPersistExposureSelection(mode: String) async -> (ok: Bool, message: String?) {
        guard mode == "serve" || mode == "funnel" else {
            return (true, nil)
        }
        let status = await Self.probeExposureStatus(mode: mode, binaryPath: self.installedBinaryPath())
        if status.checked, !status.featureEnabled {
            return (false, status.detail ?? "Tailscale exposure is not enabled on this tailnet yet.")
        }
        return (true, nil)
    }

    func applyExposureSelection(mode: String, port: Int) async -> (ok: Bool, message: String?) {
        guard let binaryPath = self.installedBinaryPath() else {
            return (false, "Install Tailscale on this Mac first.")
        }

        switch mode {
        case "serve":
            let result = await ShellExecutor.runDetailed(
                command: [binaryPath, "serve", "--bg", "--yes", "\(port)"],
                cwd: nil,
                env: nil,
                timeout: 15)
            guard result.success else {
                return (false, self.summarizeExposureApplyFailure(mode: mode, result: result))
            }
        case "funnel":
            let result = await ShellExecutor.runDetailed(
                command: [binaryPath, "funnel", "--bg", "--yes", "\(port)"],
                cwd: nil,
                env: nil,
                timeout: 15)
            guard result.success else {
                return (false, self.summarizeExposureApplyFailure(mode: mode, result: result))
            }
        default:
            _ = await ShellExecutor.runDetailed(
                command: [binaryPath, "serve", "reset"],
                cwd: nil,
                env: nil,
                timeout: 10)
            _ = await ShellExecutor.runDetailed(
                command: [binaryPath, "funnel", "reset"],
                cwd: nil,
                env: nil,
                timeout: 10)
        }

        await self.checkTailscaleStatus()

        guard mode == "serve" || mode == "funnel" else {
            return (true, nil)
        }

        let status = self.exposureStatus(for: mode)
        if status.checked, status.active {
            return (true, nil)
        }

        return (
            false,
            status.detail ??
                (mode == "serve"
                    ? "Tailscale Serve is selected, but it is not active on this Mac yet."
                    : "Tailscale Funnel is selected, but it is not active on this Mac yet.")
        )
    }

    func openTailscaleApp() {
        NSWorkspace.shared.open(URL(fileURLWithPath: TailscaleInstaller.standaloneAppPath))
    }

    func openSetupGuide() {
        if let url = URL(string: "https://tailscale.com/kb/1017/install/") {
            NSWorkspace.shared.open(url)
        }
    }

    func openExternalURL(_ urlString: String) -> Bool {
        guard let url = URL(string: urlString) else { return false }
        NSWorkspace.shared.open(url)
        return true
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

    private func resetExposureStatuses() {
        self.serveExposure = .idle(mode: "serve")
        self.funnelExposure = .idle(mode: "funnel")
    }

    private func refreshExposureStatuses() async {
        let binaryPath = self.installedBinaryPath()
        async let serveStatus = Self.probeExposureStatus(mode: "serve", binaryPath: binaryPath)
        async let funnelStatus = Self.probeExposureStatus(mode: "funnel", binaryPath: binaryPath)
        self.serveExposure = await serveStatus
        self.funnelExposure = await funnelStatus
    }

    private static func probeExposureStatus(mode: String, binaryPath: String?) async -> ExposureStatus {
        guard let binaryPath else {
            return .idle(mode: mode)
        }
        let command: [String]
        if mode == "funnel" {
            command = [binaryPath, "funnel", "status", "--json"]
        } else {
            command = [binaryPath, "serve", "status"]
        }
        let result = await ShellExecutor.runDetailed(
            command: command,
            cwd: nil,
            env: nil,
            timeout: 5)
        return self.parseExposureStatus(
            mode: mode,
            stdout: result.stdout,
            stderr: result.stderr,
            success: result.success,
            errorMessage: result.errorMessage)
    }

    static func classifyAccessReadiness(
        mode: String,
        isInstalled: Bool,
        isRunning: Bool,
        exposure: ExposureStatus?,
        requiresPassword: Bool,
        password: String) -> AccessReadiness
    {
        guard mode == "serve" || mode == "funnel" else {
            return AccessReadiness(mode: mode, requirements: [], exposure: nil, detail: nil)
        }

        var requirements: [AccessRequirement] = []
        if !isInstalled {
            requirements.append(AccessRequirement(kind: .install, mode: mode, enableURL: nil))
        } else if !isRunning {
            requirements.append(AccessRequirement(kind: .signIn, mode: mode, enableURL: nil))
        } else if let exposure, exposure.checked, !exposure.featureEnabled {
            requirements.append(AccessRequirement(kind: .enableFeature, mode: mode, enableURL: exposure.enableURL))
        }

        if requiresPassword,
           password.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        {
            requirements.append(AccessRequirement(kind: .password, mode: mode, enableURL: nil))
        }

        let detail: String?
        if let firstRequirement = requirements.first {
            switch firstRequirement.kind {
            case .install:
                detail = "Install Tailscale on this Mac first."
            case .signIn:
                detail = "Sign in to Tailscale on this Mac first."
            case .enableFeature:
                detail = mode == "serve"
                    ? "Tailscale Serve is not enabled on this tailnet yet."
                    : "Tailscale Funnel is not enabled on this tailnet yet."
            case .password:
                detail = "Password required for this mode."
            }
        } else if let exposure, !exposure.active {
            detail = exposure.detail
        } else {
            detail = nil
        }

        return AccessReadiness(
            mode: mode,
            requirements: requirements,
            exposure: exposure,
            detail: detail)
    }

    static func parseExposureStatus(
        mode: String,
        stdout: String,
        stderr: String,
        success: Bool,
        errorMessage: String?) -> ExposureStatus
    {
        let combined = [stdout, stderr, errorMessage ?? ""]
            .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            .joined(separator: "\n")
        let lower = combined.lowercased()

        if mode == "serve" {
            if lower.contains("serve is not enabled on your tailnet") {
                return ExposureStatus(
                    mode: mode,
                    checked: true,
                    featureEnabled: false,
                    active: false,
                    detail: "Tailscale Serve is not enabled on this tailnet yet.",
                    enableURL: TailscaleInstaller.extractFirstHTTPSURL(from: combined))
            }
            if lower.contains("no serve config") || combined.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return ExposureStatus(
                    mode: mode,
                    checked: true,
                    featureEnabled: true,
                    active: false,
                    detail: "Tailscale Serve is selected, but it is not active on this Mac yet.",
                    enableURL: nil)
            }
            if success {
                return ExposureStatus(
                    mode: mode,
                    checked: true,
                    featureEnabled: true,
                    active: true,
                    detail: nil,
                    enableURL: nil)
            }
            return ExposureStatus(
                mode: mode,
                checked: false,
                featureEnabled: true,
                active: false,
                detail: self.lastNonEmptyLine(in: combined)
                    ?? "Could not verify Tailscale Serve status on this Mac.",
                enableURL: TailscaleInstaller.extractFirstHTTPSURL(from: combined))
        }

        if lower.contains("funnel is not enabled") || lower.contains("enable in admin console") {
            return ExposureStatus(
                mode: mode,
                checked: true,
                featureEnabled: false,
                active: false,
                detail: "Tailscale Funnel is not enabled on this tailnet yet.",
                enableURL: TailscaleInstaller.extractFirstHTTPSURL(from: combined))
        }
        let trimmedStdout = stdout.trimmingCharacters(in: .whitespacesAndNewlines)
        if success, !trimmedStdout.isEmpty, trimmedStdout != "{}" {
            return ExposureStatus(
                mode: mode,
                checked: true,
                featureEnabled: true,
                active: true,
                detail: nil,
                enableURL: nil)
        }
        if success {
            return ExposureStatus(
                mode: mode,
                checked: true,
                featureEnabled: true,
                active: false,
                detail: "Tailscale Funnel is selected, but it is not active on this Mac yet.",
                enableURL: nil)
        }
        return ExposureStatus(
            mode: mode,
            checked: false,
            featureEnabled: true,
            active: false,
            detail: self.lastNonEmptyLine(in: combined)
                ?? "Could not verify Tailscale Funnel status on this Mac.",
            enableURL: TailscaleInstaller.extractFirstHTTPSURL(from: combined))
    }

    private static func lastNonEmptyLine(in text: String) -> String? {
        text
            .split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .reversed()
            .first(where: { !$0.isEmpty })
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

    private func summarizeExposureApplyFailure(mode: String, result: ShellExecutor.ShellResult) -> String {
        let combined = [result.stdout, result.stderr, result.errorMessage ?? ""]
            .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            .joined(separator: "\n")
        let lower = combined.lowercased()

        if mode == "serve", lower.contains("serve is not enabled on your tailnet") {
            if let url = TailscaleInstaller.extractFirstHTTPSURL(from: combined) {
                return "Tailscale Serve is not enabled on this tailnet yet. Enable it here: \(url)"
            }
            return "Tailscale Serve is not enabled on this tailnet yet."
        }

        if mode == "funnel",
           lower.contains("funnel is not enabled") || lower.contains("enable in admin console")
        {
            if let url = TailscaleInstaller.extractFirstHTTPSURL(from: combined) {
                return "Tailscale Funnel is not enabled on this tailnet yet. Enable it here: \(url)"
            }
            return "Tailscale Funnel is not enabled on this tailnet yet."
        }

        return self.summarizeShellFailure(
            result,
            fallback: mode == "serve"
                ? "Could not activate Tailscale Serve on this Mac."
                : "Could not activate Tailscale Funnel on this Mac.")
    }

    private func lastNonEmptyLine(in text: String) -> String? {
        text
            .split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .reversed()
            .first(where: { !$0.isEmpty })
    }
}
