import Foundation
import MaumauKit
import OSLog

@MainActor
final class MacNodeModeCoordinator {
    static let shared = MacNodeModeCoordinator()

    private let logger = Logger(subsystem: "ai.maumau", category: "mac-node")
    private var task: Task<Void, Never>?
    private let runtime = MacNodeRuntime()
    private let session = GatewayNodeSession()

    func start() {
        guard self.task == nil else { return }
        self.task = Task { [weak self] in
            await self?.run()
        }
    }

    func stop() {
        self.task?.cancel()
        self.task = nil
        Task { await self.session.disconnect() }
    }

    func setPreferredGatewayStableID(_ stableID: String?) {
        GatewayDiscoveryPreferences.setPreferredStableID(stableID)
        Task { await self.session.disconnect() }
    }

    private func run() async {
        var retryDelay: UInt64 = 1_000_000_000
        var lastCameraEnabled: Bool?
        var lastBrowserControlEnabled: Bool?
        var suspendedForOnboarding = false
        let defaults = UserDefaults.standard

        while !Task.isCancelled {
            if self.shouldSuspendForOnboarding(defaults: defaults) {
                if !suspendedForOnboarding {
                    suspendedForOnboarding = true
                    await self.runtime.setEventSender(nil)
                    await self.session.disconnect()
                    self.logger.info("mac node suspended until onboarding completes")
                }
                try? await Task.sleep(nanoseconds: 500_000_000)
                continue
            }
            suspendedForOnboarding = false

            if await MainActor.run(body: { AppStateStore.shared.isPaused }) {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                continue
            }

            let cameraEnabled = defaults.object(forKey: cameraEnabledKey) as? Bool ?? false
            if lastCameraEnabled == nil {
                lastCameraEnabled = cameraEnabled
            } else if lastCameraEnabled != cameraEnabled {
                lastCameraEnabled = cameraEnabled
                await self.session.disconnect()
                try? await Task.sleep(nanoseconds: 200_000_000)
            }
            let browserControlEnabled = MaumauConfigFile.browserControlEnabled()
            if lastBrowserControlEnabled == nil {
                lastBrowserControlEnabled = browserControlEnabled
            } else if lastBrowserControlEnabled != browserControlEnabled {
                lastBrowserControlEnabled = browserControlEnabled
                await self.session.disconnect()
                try? await Task.sleep(nanoseconds: 200_000_000)
            }

            do {
                let config = try await GatewayEndpointStore.shared.requireConfig()
                let caps = self.currentCaps()
                let commands = self.currentCommands(caps: caps)
                let permissions = await self.currentPermissions()
                let connectOptions = GatewayConnectOptions(
                    role: "node",
                    scopes: [],
                    caps: caps,
                    commands: commands,
                    permissions: permissions,
                    clientId: "maumau-macos",
                    clientMode: "node",
                    clientDisplayName: InstanceIdentity.displayName,
                    deviceIdentityNamespace: "node")
                let sessionBox = self.buildSessionBox(url: config.url)

                try await self.session.connect(
                    url: config.url,
                    token: config.token,
                    bootstrapToken: nil,
                    password: config.password,
                    connectOptions: connectOptions,
                    sessionBox: sessionBox,
                    onConnected: { [weak self] in
                        guard let self else { return }
                        self.logger.info("mac node connected to gateway")
                        let mainSessionKey = await GatewayConnection.shared.mainSessionKey()
                        await self.runtime.updateMainSessionKey(mainSessionKey)
                        await self.runtime.setEventSender { [weak self] event, payload in
                            guard let self else { return }
                            await self.session.sendEvent(event: event, payloadJSON: payload)
                        }
                    },
                    onDisconnected: { [weak self] reason in
                        guard let self else { return }
                        await self.runtime.setEventSender(nil)
                        self.logger.error("mac node disconnected: \(reason, privacy: .public)")
                    },
                    onInvoke: { [weak self] req in
                        guard let self else {
                            return BridgeInvokeResponse(
                                id: req.id,
                                ok: false,
                                error: MaumauNodeError(code: .unavailable, message: "UNAVAILABLE: node not ready"))
                        }
                        return await self.runtime.handleInvoke(req)
                    })

                retryDelay = 1_000_000_000
                try? await Task.sleep(nanoseconds: 1_000_000_000)
            } catch {
                self.logger.error("mac node gateway connect failed: \(error.localizedDescription, privacy: .public)")
                try? await Task.sleep(nanoseconds: min(retryDelay, 10_000_000_000))
                retryDelay = min(retryDelay * 2, 10_000_000_000)
            }
        }
    }

    private func shouldSuspendForOnboarding(defaults: UserDefaults) -> Bool {
        OnboardingController.shared.isPresented ||
            !AppStateStore.shared.onboardingSeen ||
            defaults.integer(forKey: onboardingVersionKey) < currentOnboardingVersion
    }

    private func currentCaps() -> [String] {
        var caps: [String] = [MaumauCapability.canvas.rawValue, MaumauCapability.screen.rawValue]
        if MaumauConfigFile.browserControlEnabled() {
            caps.append(MaumauCapability.browser.rawValue)
        }
        if UserDefaults.standard.object(forKey: cameraEnabledKey) as? Bool ?? false {
            caps.append(MaumauCapability.camera.rawValue)
        }
        let rawLocationMode = UserDefaults.standard.string(forKey: locationModeKey) ?? "off"
        if MaumauLocationMode(rawValue: rawLocationMode) != .off {
            caps.append(MaumauCapability.location.rawValue)
        }
        return caps
    }

    private func currentPermissions() async -> [String: Bool] {
        let statuses = await PermissionManager.status()
        return Dictionary(uniqueKeysWithValues: statuses.map { ($0.key.rawValue, $0.value) })
    }

    private func currentCommands(caps: [String]) -> [String] {
        var commands: [String] = [
            MaumauCanvasCommand.present.rawValue,
            MaumauCanvasCommand.hide.rawValue,
            MaumauCanvasCommand.navigate.rawValue,
            MaumauCanvasCommand.evalJS.rawValue,
            MaumauCanvasCommand.snapshot.rawValue,
            MaumauCanvasA2UICommand.push.rawValue,
            MaumauCanvasA2UICommand.pushJSONL.rawValue,
            MaumauCanvasA2UICommand.reset.rawValue,
            MacNodeScreenCommand.record.rawValue,
            MaumauSystemCommand.notify.rawValue,
            MaumauSystemCommand.which.rawValue,
            MaumauSystemCommand.run.rawValue,
            MaumauSystemCommand.execApprovalsGet.rawValue,
            MaumauSystemCommand.execApprovalsSet.rawValue,
        ]

        let capsSet = Set(caps)
        if capsSet.contains(MaumauCapability.browser.rawValue) {
            commands.append(MaumauBrowserCommand.proxy.rawValue)
        }
        if capsSet.contains(MaumauCapability.camera.rawValue) {
            commands.append(MaumauCameraCommand.list.rawValue)
            commands.append(MaumauCameraCommand.snap.rawValue)
            commands.append(MaumauCameraCommand.clip.rawValue)
        }
        if capsSet.contains(MaumauCapability.location.rawValue) {
            commands.append(MaumauLocationCommand.get.rawValue)
        }

        return commands
    }

    private func buildSessionBox(url: URL) -> WebSocketSessionBox? {
        guard url.scheme?.lowercased() == "wss" else { return nil }
        let host = url.host ?? "gateway"
        let port = url.port ?? 443
        let stableID = "\(host):\(port)"
        let stored = GatewayTLSStore.loadFingerprint(stableID: stableID)
        let params = GatewayTLSParams(
            required: true,
            expectedFingerprint: stored,
            allowTOFU: stored == nil,
            storeKey: stableID)
        let session = GatewayTLSPinningSession(params: params)
        return WebSocketSessionBox(session: session)
    }
}
