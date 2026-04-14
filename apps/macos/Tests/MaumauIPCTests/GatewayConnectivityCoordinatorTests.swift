import Foundation
import Testing
@testable import Maumau

@MainActor
struct GatewayConnectivityCoordinatorTests {
    @Test func `refreshes control channel when auth changes on the same endpoint`() throws {
        let url = try #require(URL(string: "http://127.0.0.1:18789/"))
        #expect(GatewayConnectivityCoordinator.shouldRefreshControlChannel(
            previous: .ready(mode: .local, url: url, token: "token-a", password: nil),
            next: .ready(mode: .local, url: url, token: "token-b", password: nil)))
    }

    @Test func `refreshes control channel when the endpoint url changes`() throws {
        let current = try #require(URL(string: "http://127.0.0.1:18789/"))
        let next = try #require(URL(string: "http://127.0.0.1:28789/"))
        #expect(GatewayConnectivityCoordinator.shouldRefreshControlChannel(
            previous: .ready(mode: .local, url: current, token: "token-a", password: nil),
            next: .ready(mode: .local, url: next, token: "token-a", password: nil)))
    }

    @Test func `does not refresh control channel when the ready endpoint is unchanged`() throws {
        let url = try #require(URL(string: "http://127.0.0.1:18789/"))
        #expect(!GatewayConnectivityCoordinator.shouldRefreshControlChannel(
            previous: .ready(mode: .local, url: url, token: "token-a", password: nil),
            next: .ready(mode: .local, url: url, token: "token-a", password: nil)))
    }
}
