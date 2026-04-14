import Foundation
import Observation
import OSLog

@MainActor
@Observable
final class GatewayConnectivityCoordinator {
    static let shared = GatewayConnectivityCoordinator()

    private let logger = Logger(subsystem: "ai.maumau", category: "gateway.connectivity")
    private var endpointTask: Task<Void, Never>?

    private(set) var endpointState: GatewayEndpointState?
    private(set) var resolvedURL: URL?
    private(set) var resolvedMode: AppState.ConnectionMode?
    private(set) var resolvedHostLabel: String?

    private init() {
        self.start()
    }

    func start() {
        guard self.endpointTask == nil else { return }
        self.endpointTask = Task { [weak self] in
            guard let self else { return }
            let stream = await GatewayEndpointStore.shared.subscribe()
            for await state in stream {
                await MainActor.run { self.handleEndpointState(state) }
            }
        }
    }

    var localEndpointHostLabel: String? {
        guard self.resolvedMode == .local, let url = self.resolvedURL else { return nil }
        return Self.hostLabel(for: url)
    }

    static func shouldRefreshControlChannel(
        previous: GatewayEndpointState?,
        next: GatewayEndpointState) -> Bool
    {
        guard case let .ready(nextMode, nextURL, nextToken, nextPassword) = next else { return false }
        guard let previous else { return true }
        guard case let .ready(previousMode, previousURL, previousToken, previousPassword) = previous else {
            return true
        }
        return previousMode != nextMode ||
            previousURL != nextURL ||
            previousToken != nextToken ||
            previousPassword != nextPassword
    }

    private func handleEndpointState(_ state: GatewayEndpointState) {
        let previousState = self.endpointState
        self.endpointState = state
        switch state {
        case let .ready(mode, url, _, _):
            self.resolvedMode = mode
            self.resolvedURL = url
            self.resolvedHostLabel = Self.hostLabel(for: url)
            if Self.shouldRefreshControlChannel(previous: previousState, next: state) {
                Task { await ControlChannel.shared.refreshEndpoint(reason: "endpoint changed") }
            }
        case let .connecting(mode, _):
            self.resolvedMode = mode
        case let .unavailable(mode, _):
            self.resolvedMode = mode
        }
    }

    private static func hostLabel(for url: URL) -> String {
        let host = url.host ?? url.absoluteString
        if let port = url.port { return "\(host):\(port)" }
        return host
    }
}
