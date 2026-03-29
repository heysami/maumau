import Foundation
import Testing
@testable import Maumau

struct GatewayConnectivityCoordinatorTests {
    @Test func `refreshes control channel when token changes on same url`() throws {
        let url = try #require(URL(string: "http://127.0.0.1:18789"))
        let previous = GatewayConnectivityCoordinator.ReadyEndpointIdentity(
            mode: .local,
            url: url,
            token: "old-token",
            password: nil)
        let next = GatewayConnectivityCoordinator.ReadyEndpointIdentity(
            mode: .local,
            url: url,
            token: "new-token",
            password: nil)

        #expect(GatewayConnectivityCoordinator.shouldRefreshControlChannel(
            previous: previous,
            next: next))
    }

    @Test func `refreshes control channel when password changes on same url`() throws {
        let url = try #require(URL(string: "http://127.0.0.1:18789"))
        let previous = GatewayConnectivityCoordinator.ReadyEndpointIdentity(
            mode: .local,
            url: url,
            token: nil,
            password: "old-password")
        let next = GatewayConnectivityCoordinator.ReadyEndpointIdentity(
            mode: .local,
            url: url,
            token: nil,
            password: "new-password")

        #expect(GatewayConnectivityCoordinator.shouldRefreshControlChannel(
            previous: previous,
            next: next))
    }

    @Test func `does not refresh control channel when endpoint identity is unchanged`() throws {
        let url = try #require(URL(string: "http://127.0.0.1:18789"))
        let endpoint = GatewayConnectivityCoordinator.ReadyEndpointIdentity(
            mode: .local,
            url: url,
            token: "shared-token",
            password: nil)

        #expect(!GatewayConnectivityCoordinator.shouldRefreshControlChannel(
            previous: endpoint,
            next: endpoint))
    }
}
