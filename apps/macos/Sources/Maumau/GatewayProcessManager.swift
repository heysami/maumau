import Foundation
import Observation

@MainActor
@Observable
final class GatewayProcessManager {
    static let shared = GatewayProcessManager()
    // Clean-reset startup stacks "install LaunchAgent" + "launch gateway" on first use.
    // The gateway can also accept a socket before its first health requests are responsive,
    // so first-run startup needs a wider budget than warm reconnects.
    static let localGatewayStartupTimeout: TimeInterval = 60
    private static let launchAgentWarmupTimeout: TimeInterval = 15
    private static let attachExistingHealthTimeoutMs: Double = 10_000
    private static let readinessHealthTimeoutMs: Double = 5_000

    enum Status: Equatable {
        case stopped
        case starting
        case running(details: String?)
        case attachedExisting(details: String?)
        case failed(String)

        var label: String {
            switch self {
            case .stopped: return "Stopped"
            case .starting: return "Starting…"
            case let .running(details):
                if let details, !details.isEmpty { return "Running (\(details))" }
                return "Running"
            case let .attachedExisting(details):
                if let details, !details.isEmpty {
                    return "Using existing gateway (\(details))"
                }
                return "Using existing gateway"
            case let .failed(reason): return "Failed: \(reason)"
            }
        }
    }

    private(set) var status: Status = .stopped {
        didSet { CanvasManager.shared.refreshDebugStatus() }
    }

    private(set) var log: String = ""
    private(set) var environmentStatus: GatewayEnvironmentStatus = .checking
    private(set) var existingGatewayDetails: String?
    private(set) var lastFailureReason: String?
    private var desiredActive = false
    private var environmentRefreshTask: Task<Void, Never>?
    private var lastEnvironmentRefresh: Date?
    private var logRefreshTask: Task<Void, Never>?
    private var readinessWait: (id: UUID, deadline: Date, task: Task<Bool, Never>)?
    private var managedAuthRecoveryTask: Task<Bool, Never>?
    #if DEBUG
    private var testingConnection: GatewayConnection?
    private var testingManagedAuthRecoveryHandler: ((Error) async -> Bool)?
    #endif
    private let logger = Logger(subsystem: "ai.maumau", category: "gateway.process")

    private let logLimit = 20000 // characters to keep in-memory
    private let environmentRefreshMinInterval: TimeInterval = 30
    private var connection: GatewayConnection {
        #if DEBUG
        return self.testingConnection ?? .shared
        #else
        return .shared
        #endif
    }

    static func shouldDeferLaunchAgentAutoEnable(status: Status) -> Bool {
        if case .starting = status {
            return true
        }
        return false
    }

    static func shouldRefreshControlChannel(
        state: ControlChannel.ConnectionState)
        -> Bool
    {
        if case .connected = state {
            return false
        }
        return true
    }

    func setActive(_ active: Bool) {
        // Remote mode should never spawn a local gateway; treat as stopped.
        if CommandResolver.connectionModeIsRemote() {
            self.desiredActive = false
            self.stop()
            self.status = .stopped
            self.appendLog("[gateway] remote mode active; skipping local gateway\n")
            self.logger.info("gateway process skipped: remote mode active")
            return
        }
        self.logger.debug("gateway active requested active=\(active)")
        self.desiredActive = active
        self.refreshEnvironmentStatus()
        if active {
            self.startIfNeeded()
        } else {
            self.stop()
        }
    }

    func ensureLaunchAgentEnabledIfNeeded() async {
        guard !CommandResolver.connectionModeIsRemote() else { return }
        if Self.shouldDeferLaunchAgentAutoEnable(status: self.status) {
            self.logger.debug("gateway launchd auto-enable deferred while startup is already in progress")
            return
        }
        if GatewayLaunchAgentManager.isLaunchAgentWriteDisabled() {
            self.appendLog("[gateway] launchd auto-enable skipped (attach-only)\n")
            self.logger.info("gateway launchd auto-enable skipped (disable marker set)")
            return
        }
        let enabled = await GatewayLaunchAgentManager.isLoaded()
        guard !enabled else { return }
        let bundlePath = Bundle.main.bundleURL.path
        let port = GatewayEnvironment.gatewayPort()
        self.appendLog("[gateway] auto-enabling launchd job (\(gatewayLaunchdLabel)) on port \(port)\n")
        let err = await GatewayLaunchAgentManager.set(enabled: true, bundlePath: bundlePath, port: port)
        if let err {
            self.appendLog("[gateway] launchd auto-enable failed: \(err)\n")
        }
    }

    func startIfNeeded() {
        guard self.desiredActive else { return }
        // Do not spawn in remote mode (the gateway should run on the remote host).
        guard !CommandResolver.connectionModeIsRemote() else {
            self.status = .stopped
            return
        }
        // Many surfaces can call `setActive(true)` in quick succession (startup, Canvas, health checks).
        // Avoid spawning multiple concurrent "start" tasks that can thrash launchd and flap the port.
        switch self.status {
        case .starting, .running, .attachedExisting:
            return
        case .stopped, .failed:
            break
        }
        self.status = .starting
        self.logger.debug("gateway start requested")

        // First try to latch onto an already-running gateway to avoid spawning a duplicate.
        Task { [weak self] in
            guard let self else { return }
            if await self.attachExistingGatewayIfAvailable() {
                return
            }
            await self.enableLaunchdGateway()
        }
    }

    func stop() {
        self.desiredActive = false
        self.existingGatewayDetails = nil
        self.lastFailureReason = nil
        self.readinessWait?.task.cancel()
        self.readinessWait = nil
        self.status = .stopped
        self.logger.info("gateway stop requested")
        if CommandResolver.connectionModeIsRemote() {
            return
        }
        let bundlePath = Bundle.main.bundleURL.path
        Task {
            _ = await GatewayLaunchAgentManager.set(
                enabled: false,
                bundlePath: bundlePath,
                port: GatewayEnvironment.gatewayPort())
        }
    }

    func clearLastFailure() {
        self.lastFailureReason = nil
    }

    func refreshEnvironmentStatus(force: Bool = false) {
        let now = Date()
        if !force {
            if self.environmentRefreshTask != nil { return }
            if let last = self.lastEnvironmentRefresh,
               now.timeIntervalSince(last) < self.environmentRefreshMinInterval
            {
                return
            }
        }
        self.lastEnvironmentRefresh = now
        self.environmentRefreshTask = Task { [weak self] in
            let status = await Task.detached(priority: .utility) {
                GatewayEnvironment.check()
            }.value
            await MainActor.run {
                guard let self else { return }
                self.environmentStatus = status
                self.environmentRefreshTask = nil
            }
        }
    }

    func refreshLog() {
        guard self.logRefreshTask == nil else { return }
        let path = GatewayLaunchAgentManager.launchdGatewayLogPath()
        let limit = self.logLimit
        self.logRefreshTask = Task { [weak self] in
            let log = await Task.detached(priority: .utility) {
                Self.readGatewayLog(path: path, limit: limit)
            }.value
            await MainActor.run {
                guard let self else { return }
                if !log.isEmpty {
                    self.log = log
                }
                self.logRefreshTask = nil
            }
        }
    }

    // MARK: - Internals

    /// Attempt to connect to an already-running gateway on the configured port.
    /// If successful, mark status as attached and skip spawning a new process.
    private func attachExistingGatewayIfAvailable() async -> Bool {
        let port = GatewayEnvironment.gatewayPort()
        let instance = await PortGuardian.shared.describe(port: port)
        let instanceText = instance.map { self.describe(instance: $0) }
        let hasListener = instance != nil

        let attemptAttach = {
            try await self.connection.requestRawWithoutRecovery(
                method: .health,
                timeoutMs: Self.attachExistingHealthTimeoutMs)
        }

        for attempt in 0..<(hasListener ? 3 : 1) {
            do {
                let data = try await attemptAttach()
                let snap = decodeHealthSnapshot(from: data)
                let details = self.describe(details: instanceText, port: port, snap: snap)
                self.existingGatewayDetails = details
                self.clearLastFailure()
                self.status = .attachedExisting(details: details)
                self.appendLog("[gateway] using existing instance: \(details)\n")
                self.logger.info("gateway using existing instance details=\(details)")
                self.refreshControlChannelIfNeeded(reason: "attach existing")
                self.refreshLog()
                return true
            } catch {
                if attempt < 2, hasListener {
                    try? await Task.sleep(nanoseconds: 250_000_000)
                    continue
                }

                if hasListener {
                    if Self.shouldTreatExistingListenerAttachFailureAsWarmup(error) {
                        self.existingGatewayDetails = instanceText
                        self.clearLastFailure()
                        self.status = .starting
                        self.appendLog(
                            "[gateway] existing listener on port \(port) is still warming up; continuing readiness wait\n")
                        self.logger.notice(
                            "gateway existing listener still warming up: \(error.localizedDescription, privacy: .public)")
                        return true
                    }
                    if Self.shouldReplaceExistingManagedGatewayAfterAuthFailure(error, instance: instance) {
                        self.existingGatewayDetails = instanceText
                        self.clearLastFailure()
                        self.status = .starting
                        if let instance {
                            let terminated = await PortGuardian.shared.terminate(pid: instance.pid)
                            let action = terminated ? "terminated" : "could not terminate"
                            self.appendLog(
                                "[gateway] managed listener on port \(port) rejected auth; \(action) pid \(instance.pid) and reinstalling launchd gateway\n")
                        } else {
                            self.appendLog(
                                "[gateway] managed listener on port \(port) rejected auth; reinstalling launchd gateway\n")
                        }
                        self.logger.notice(
                            "gateway existing managed listener rejected auth; replacing listener on port \(port, privacy: .public)")
                        return false
                    }
                    let reason = self.describeAttachFailure(error, port: port, instance: instance)
                    self.existingGatewayDetails = instanceText
                    self.status = .failed(reason)
                    self.lastFailureReason = reason
                    self.appendLog("[gateway] existing listener on port \(port) but attach failed: \(reason)\n")
                    self.logger.warning("gateway attach failed reason=\(reason)")
                    return true
                }

                // No reachable gateway (and no listener) — fall through to spawn.
                self.existingGatewayDetails = nil
                return false
            }
        }

        self.existingGatewayDetails = nil
        return false
    }

    private func describe(details instance: String?, port: Int, snap: HealthSnapshot?) -> String {
        let instanceText = instance ?? "pid unknown"
        if let snap {
            let order = snap.channelOrder ?? Array(snap.channels.keys)
            let linkId = order.first(where: { snap.channels[$0]?.linked == true })
                ?? order.first(where: { snap.channels[$0]?.linked != nil })
            guard let linkId else {
                return "port \(port), health probe succeeded, \(instanceText)"
            }
            let linked = snap.channels[linkId]?.linked ?? false
            let authAge = snap.channels[linkId]?.authAgeMs.flatMap(msToAge) ?? "unknown age"
            let label =
                snap.channelLabels?[linkId] ??
                linkId.capitalized
            let linkText = linked ? "linked" : "not linked"
            return "port \(port), \(label) \(linkText), auth \(authAge), \(instanceText)"
        }
        return "port \(port), health probe succeeded, \(instanceText)"
    }

    private func describe(instance: PortGuardian.Descriptor) -> String {
        let path = instance.executablePath ?? "path unknown"
        return "pid \(instance.pid) \(instance.command) @ \(path)"
    }

    private func describeAttachFailure(_ error: Error, port: Int, instance: PortGuardian.Descriptor?) -> String {
        let ns = error as NSError
        let message = ns.localizedDescription.isEmpty ? "unknown error" : ns.localizedDescription
        let lower = message.lowercased()
        if Self.isGatewayAuthFailure(error) {
            return """
            Gateway on port \(port) rejected auth. Set gateway.auth.token to match the running gateway \
            (or clear it on the gateway) and retry.
            """
        }
        if lower.contains("protocol mismatch") {
            return "Gateway on port \(port) is incompatible (protocol mismatch). Update the app/gateway."
        }
        if lower.contains("unexpected response") || lower.contains("invalid response") {
            return "Port \(port) returned non-gateway data; another process is using it."
        }
        if let instance {
            let instanceText = self.describe(instance: instance)
            return "Gateway listener found on port \(port) (\(instanceText)) but health check failed: \(message)"
        }
        return "Gateway listener found on port \(port) but health check failed: \(message)"
    }

    private static func isGatewayAuthFailure(_ error: Error) -> Bool {
        GatewayAuthFailureClassifier.isAuthFailure(error)
    }

    static func shouldReplaceExistingManagedGatewayAfterAuthFailure(
        _ error: Error,
        instance: PortGuardian.Descriptor?) -> Bool
    {
        guard Self.isGatewayAuthFailure(error) else { return false }
        guard let instance else { return false }
        return PortGuardian.isManagedLocalGatewayCandidate(
            command: instance.command,
            fullCommand: instance.fullCommand)
    }

    static func shouldTreatExistingListenerAttachFailureAsWarmup(_ error: Error) -> Bool {
        if let urlError = error as? URLError {
            switch urlError.code {
            case .timedOut, .cannotConnectToHost, .networkConnectionLost, .resourceUnavailable:
                return true
            default:
                break
            }
        }
        let ns = error as NSError
        if ns.domain == "Gateway", ns.code == 5 {
            return true
        }
        let lower = ns.localizedDescription.lowercased()
        return lower.contains("timed out") ||
            lower.contains("could not connect to the server") ||
            lower.contains("connection refused")
    }

    private func enableLaunchdGateway() async {
        self.existingGatewayDetails = nil
        let resolution = await Task.detached(priority: .utility) {
            GatewayEnvironment.resolveGatewayCommand()
        }.value
        await MainActor.run { self.environmentStatus = resolution.status }
        guard resolution.command != nil else {
            await MainActor.run {
                self.status = .failed(resolution.status.message)
                self.lastFailureReason = resolution.status.message
            }
            self.logger.error("gateway command resolve failed: \(resolution.status.message)")
            return
        }

        guard self.desiredActive else {
            self.status = .stopped
            self.logger.debug("gateway launchd enable canceled before start")
            return
        }

        if GatewayLaunchAgentManager.isLaunchAgentWriteDisabled() {
            let message = "Launchd disabled; start the Gateway manually or disable attach-only."
            self.status = .failed(message)
            self.lastFailureReason = "launchd disabled"
            self.appendLog("[gateway] launchd disabled; skipping auto-start\n")
            self.logger.info("gateway launchd enable skipped (disable marker set)")
            return
        }

        let bundlePath = Bundle.main.bundleURL.path
        let port = GatewayEnvironment.gatewayPort()
        self.appendLog("[gateway] enabling launchd job (\(gatewayLaunchdLabel)) on port \(port)\n")
        self.logger.info("gateway enabling launchd port=\(port)")
        let err = await GatewayLaunchAgentManager.set(enabled: true, bundlePath: bundlePath, port: port)
        if let err {
            self.status = .failed(err)
            self.lastFailureReason = err
            self.logger.error("gateway launchd enable failed: \(err)")
            return
        }
        if !self.desiredActive {
            self.status = .stopped
            self.appendLog("[gateway] startup canceled after launchd enable; disabling launchd\n")
            self.logger.info("gateway launchd enable canceled after start")
            _ = await GatewayLaunchAgentManager.set(
                enabled: false,
                bundlePath: bundlePath,
                port: port)
            return
        }

        // Best-effort: wait for the gateway to accept connections.
        let deadline = Date().addingTimeInterval(Self.launchAgentWarmupTimeout)
        while Date() < deadline {
            if !self.desiredActive { return }
            do {
                _ = try await self.connection.requestRawWithoutRecovery(
                    method: .health,
                    timeoutMs: Self.readinessHealthTimeoutMs)
                await self.markGatewayReady(reason: "gateway started")
                return
            } catch {
                try? await Task.sleep(nanoseconds: 400_000_000)
            }
        }

        self.appendLog("[gateway] launchd job is still warming up; continuing readiness wait\n")
        self.logger.notice("gateway startup still warming up after initial launchd grace window")
    }

    private func markGatewayReady(reason: String) async {
        self.clearLastFailure()
        let port = GatewayEnvironment.gatewayPort()
        let instance = await PortGuardian.shared.describe(port: port)
        let details = instance.map { "pid \($0.pid)" }
        switch self.status {
        case .attachedExisting, .running:
            break
        case .starting, .stopped, .failed:
            self.status = .running(details: details)
        }
        self.logger.info("\(reason, privacy: .public) details=\(details ?? "ok", privacy: .public)")
        self.refreshControlChannelIfNeeded(reason: reason)
        self.refreshLog()
    }

    private func appendLog(_ chunk: String) {
        self.log.append(chunk)
        if self.log.count > self.logLimit {
            self.log = String(self.log.suffix(self.logLimit))
        }
    }

    private func refreshControlChannelIfNeeded(reason: String) {
        let state = ControlChannel.shared.state
        guard Self.shouldRefreshControlChannel(state: state) else {
            return
        }
        // A restart-time refresh can already be mid-flight when the gateway becomes ready.
        // Kick one more refresh here so the ready signal can supersede any stale "connecting"
        // attempt that started against the previous socket/token.
        self.appendLog("[gateway] refreshing control channel (\(reason))\n")
        self.logger.debug("gateway control channel refresh reason=\(reason)")
        Task { await ControlChannel.shared.configure() }
    }

    func waitForGatewayReady(timeout: TimeInterval = GatewayProcessManager.localGatewayStartupTimeout) async -> Bool {
        let requestedDeadline = Date().addingTimeInterval(timeout)
        if var wait = self.readinessWait {
            if requestedDeadline > wait.deadline {
                wait.deadline = requestedDeadline
                self.readinessWait = wait
            }
            return await wait.task.value
        }

        let id = UUID()
        let task = Task { [weak self] in
            guard let self else { return false }
            return await self.performSharedReadinessWait(id: id)
        }
        self.readinessWait = (id: id, deadline: requestedDeadline, task: task)
        let ready = await task.value
        if self.readinessWait?.id == id {
            self.readinessWait = nil
        }
        return ready
    }

    private func performSharedReadinessWait(id: UUID) async -> Bool {
        while true {
            if !self.desiredActive { return false }
            guard let wait = self.readinessWait, wait.id == id else { return false }
            if Date() >= wait.deadline {
                self.appendLog("[gateway] readiness wait timed out\n")
                self.logger.warning("gateway readiness wait timed out")
                return false
            }

            do {
                _ = try await self.connection.requestRawWithoutRecovery(
                    method: .health,
                    timeoutMs: Self.readinessHealthTimeoutMs)
                await self.markGatewayReady(reason: "gateway became ready")
                return true
            } catch {
                do {
                    try await Task.sleep(nanoseconds: 300_000_000)
                } catch {
                    return false
                }
            }
        }
    }

    func clearLog() {
        self.log = ""
        try? FileManager().removeItem(atPath: GatewayLaunchAgentManager.launchdGatewayLogPath())
        self.logger.debug("gateway log cleared")
    }

    func recoverManagedGatewayAfterAuthFailureIfNeeded(_ error: Error) async -> Bool {
        if let recoveryTask = self.managedAuthRecoveryTask {
            return await recoveryTask.value
        }

        guard !CommandResolver.connectionModeIsRemote() else { return false }
        let task = Task { @MainActor [weak self] in
            guard let self else { return false }
            defer { self.managedAuthRecoveryTask = nil }

            #if DEBUG
            if let handler = self.testingManagedAuthRecoveryHandler {
                return await handler(error)
            }
            #endif

            guard !GatewayLaunchAgentManager.isLaunchAgentWriteDisabled() else {
                self.appendLog("[gateway] auth recovery skipped because launchd writes are disabled\n")
                return false
            }

            let port = GatewayEnvironment.gatewayPort()
            let instance = await PortGuardian.shared.describe(port: port)
            guard Self.shouldReplaceExistingManagedGatewayAfterAuthFailure(error, instance: instance) else {
                return false
            }

            self.existingGatewayDetails = instance.map { self.describe(instance: $0) }
            self.status = .starting
            self.clearLastFailure()
            if let instance {
                let terminated = await PortGuardian.shared.terminate(pid: instance.pid)
                let action = terminated ? "terminated" : "could not terminate"
                self.appendLog(
                    "[gateway] managed listener on port \(port) rejected auth during recovery; \(action) pid \(instance.pid) before reinstalling launchd gateway\n")
            } else {
                self.appendLog(
                    "[gateway] managed listener on port \(port) rejected auth during recovery; reinstalling launchd gateway\n")
            }

            let bundlePath = Bundle.main.bundleURL.path
            if let launchdError = await GatewayLaunchAgentManager.set(
                enabled: true,
                bundlePath: bundlePath,
                port: port)
            {
                self.lastFailureReason = launchdError
                self.appendLog("[gateway] auth recovery failed: \(launchdError)\n")
                self.logger.error("gateway auth recovery failed: \(launchdError, privacy: .public)")
                return false
            }

            self.logger.notice(
                "gateway auth recovery reinstalled managed listener on port \(port, privacy: .public)")
            self.setActive(true)
            return await self.waitForGatewayReady(timeout: Self.localGatewayStartupTimeout)
        }
        self.managedAuthRecoveryTask = task
        return await task.value
    }

    func setProjectRoot(path: String) {
        CommandResolver.setProjectRoot(path)
    }

    func projectRootPath() -> String {
        CommandResolver.projectRootPath()
    }

    private nonisolated static func readGatewayLog(path: String, limit: Int) -> String {
        guard FileManager().fileExists(atPath: path) else { return "" }
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: path)) else { return "" }
        let text = String(data: data, encoding: .utf8) ?? ""
        if text.count <= limit { return text }
        return String(text.suffix(limit))
    }
}

#if DEBUG
extension GatewayProcessManager {
    func setTestingConnection(_ connection: GatewayConnection?) {
        self.testingConnection = connection
    }

    func setTestingManagedAuthRecoveryHandler(_ handler: ((Error) async -> Bool)?) {
        self.testingManagedAuthRecoveryHandler = handler
    }

    func setTestingStatus(_ status: Status) {
        self.status = status
    }

    func setTestingDesiredActive(_ active: Bool) {
        self.desiredActive = active
    }

    func setTestingLastFailureReason(_ reason: String?) {
        self.lastFailureReason = reason
    }

    func setTestingManagedAuthRecoveryTask(_ task: Task<Bool, Never>?) {
        self.managedAuthRecoveryTask = task
    }
}
#endif
