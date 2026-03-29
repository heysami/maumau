import Foundation
import Observation
import OSLog

@MainActor
@Observable
final class GatewayConnectivityCoordinator {
    static let shared = GatewayConnectivityCoordinator()

    private let logger = Logger(subsystem: "ai.maumau", category: "gateway.connectivity")
    private var endpointTask: Task<Void, Never>?
    private var lastResolvedEndpoint: ReadyEndpointIdentity?

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

    private func handleEndpointState(_ state: GatewayEndpointState) {
        self.endpointState = state
        switch state {
        case let .ready(mode, url, token, password):
            self.resolvedMode = mode
            self.resolvedURL = url
            self.resolvedHostLabel = Self.hostLabel(for: url)
            let endpoint = ReadyEndpointIdentity(
                mode: mode,
                url: url,
                token: token,
                password: password)
            if Self.shouldRefreshControlChannel(
                previous: self.lastResolvedEndpoint,
                next: endpoint)
            {
                self.lastResolvedEndpoint = endpoint
                Task { await ControlChannel.shared.refreshEndpoint(reason: "endpoint changed") }
            } else {
                self.lastResolvedEndpoint = endpoint
            }
        case let .connecting(mode, _):
            self.resolvedMode = mode
        case let .unavailable(mode, _):
            self.resolvedMode = mode
        }
    }

    struct ReadyEndpointIdentity: Equatable {
        let mode: AppState.ConnectionMode
        let url: URL
        let token: String?
        let password: String?

        static func == (lhs: Self, rhs: Self) -> Bool {
            lhs.mode == rhs.mode &&
                lhs.url.absoluteString == rhs.url.absoluteString &&
                lhs.token == rhs.token &&
                lhs.password == rhs.password
        }
    }

    nonisolated static func shouldRefreshControlChannel(
        previous: ReadyEndpointIdentity?,
        next: ReadyEndpointIdentity
    ) -> Bool {
        previous != next
    }

    private static func hostLabel(for url: URL) -> String {
        let host = url.host ?? url.absoluteString
        if let port = url.port { return "\(host):\(port)" }
        return host
    }
}
