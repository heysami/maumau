import Foundation
import Testing
@testable import Maumau

struct GatewayEndpointStoreTests {
    private func makeLaunchAgentSnapshot(
        env: [String: String],
        token: String?,
        password: String?) -> LaunchAgentPlistSnapshot
    {
        LaunchAgentPlistSnapshot(
            programArguments: [],
            environment: env,
            stdoutPath: nil,
            stderrPath: nil,
            configPath: env["MAUMAU_CONFIG_PATH"],
            port: nil,
            bind: nil,
            token: token,
            password: password)
    }

    private func makeDefaults() -> UserDefaults {
        let suiteName = "GatewayEndpointStoreTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
        return defaults
    }

    @Test func `resolve local gateway token follows config then launchd then env`() {
        let snapshot = self.makeLaunchAgentSnapshot(
            env: ["MAUMAU_GATEWAY_TOKEN": "launchd-token"],
            token: "launchd-token",
            password: nil)

        let configToken = GatewayEndpointStore._testResolveGatewayToken(
            isRemote: false,
            root: [
                "gateway": [
                    "auth": [
                        "mode": "token",
                        "token": "config-token",
                    ],
                ],
            ],
            env: ["MAUMAU_GATEWAY_TOKEN": "env-token"],
            launchdSnapshot: snapshot)
        #expect(configToken == "config-token")

        let configOnlyToken = GatewayEndpointStore._testResolveGatewayToken(
            isRemote: false,
            root: [
                "gateway": [
                    "auth": [
                        "mode": "token",
                        "token": "config-token",
                    ],
                ],
            ],
            env: ["MAUMAU_GATEWAY_TOKEN": "env-token"],
            launchdSnapshot: nil)
        #expect(configOnlyToken == "config-token")

        let envFallbackToken = GatewayEndpointStore._testResolveGatewayToken(
            isRemote: false,
            root: ["gateway": ["auth": ["mode": "token"]]],
            env: ["MAUMAU_GATEWAY_TOKEN": "env-token"],
            launchdSnapshot: nil)
        #expect(envFallbackToken == "env-token")

        let launchdFallbackToken = GatewayEndpointStore._testResolveGatewayToken(
            isRemote: false,
            root: ["gateway": ["auth": ["mode": "token"]]],
            env: [:],
            launchdSnapshot: snapshot)
        #expect(launchdFallbackToken == "launchd-token")
    }

    @Test func `resolve local gateway token prefers launchd config path token over embedded launchd token`() throws {
        let tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        let configURL = tempDir.appendingPathComponent("maumau.json")
        try """
        {
          "gateway": {
            "auth": {
              "mode": "token",
              "token": "launchd-config-token"
            }
          }
        }
        """.write(to: configURL, atomically: true, encoding: .utf8)
        defer { try? FileManager.default.removeItem(at: tempDir) }

        let token = GatewayEndpointStore._testResolveGatewayToken(
            isRemote: false,
            root: [
                "gateway": [
                    "auth": [
                        "mode": "token",
                        "token": "home-config-token",
                    ],
                ],
            ],
            env: ["MAUMAU_GATEWAY_TOKEN": "env-token"],
            launchdSnapshot: self.makeLaunchAgentSnapshot(
                env: [
                    "MAUMAU_CONFIG_PATH": configURL.path,
                    "MAUMAU_GATEWAY_TOKEN": "embedded-launchd-token",
                ],
                token: "embedded-launchd-token",
                password: nil))
        #expect(token == "launchd-config-token")
    }


    @Test func `resolve gateway token ignores launchd in remote mode`() {
        let snapshot = self.makeLaunchAgentSnapshot(
            env: ["MAUMAU_GATEWAY_TOKEN": "launchd-token"],
            token: "launchd-token",
            password: nil)

        let token = GatewayEndpointStore._testResolveGatewayToken(
            isRemote: true,
            root: [:],
            env: [:],
            launchdSnapshot: snapshot)
        #expect(token == nil)
    }

    @Test func `resolve gateway token ignores local token when password mode is active`() {
        let snapshot = self.makeLaunchAgentSnapshot(
            env: ["MAUMAU_GATEWAY_TOKEN": "launchd-token"],
            token: "launchd-token",
            password: nil)

        let token = GatewayEndpointStore._testResolveGatewayToken(
            isRemote: false,
            root: [
                "gateway": [
                    "auth": [
                        "mode": "password",
                        "password": "secret",
                        "token": "config-token",
                    ],
                ],
            ],
            env: ["MAUMAU_GATEWAY_TOKEN": "env-token"],
            launchdSnapshot: snapshot)
        #expect(token == nil)
    }

    @Test func `resolve local gateway token follows launchd config path before home config`() throws {
        let tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        let configURL = tempDir.appendingPathComponent("maumau.json")
        try """
        {
          "gateway": {
            "auth": {
              "mode": "token",
              "token": "launchd-config-token"
            }
          }
        }
        """.write(to: configURL, atomically: true, encoding: .utf8)
        defer { try? FileManager.default.removeItem(at: tempDir) }

        let token = GatewayEndpointStore._testResolveGatewayToken(
            isRemote: false,
            root: [
                "gateway": [
                    "auth": [
                        "mode": "token",
                        "token": "home-config-token",
                    ],
                ],
            ],
            env: [:],
            launchdSnapshot: self.makeLaunchAgentSnapshot(
                env: ["MAUMAU_CONFIG_PATH": configURL.path],
                token: nil,
                password: nil))
        #expect(token == "launchd-config-token")
    }

    @Test func resolveGatewayTokenUsesRemoteConfigToken() {
        let token = GatewayEndpointStore._testResolveGatewayToken(
            isRemote: true,
            root: [
                "gateway": [
                    "remote": [
                        "token": "  remote-token  ",
                    ],
                ],
            ],
            env: [:],
            launchdSnapshot: nil)
        #expect(token == "remote-token")
    }

    @Test func `resolve local gateway password follows config then launchd then env`() {
        let snapshot = self.makeLaunchAgentSnapshot(
            env: ["MAUMAU_GATEWAY_PASSWORD": "launchd-pass"],
            token: nil,
            password: "launchd-pass")

        let configPassword = GatewayEndpointStore._testResolveGatewayPassword(
            isRemote: false,
            root: [
                "gateway": [
                    "auth": [
                        "mode": "password",
                        "password": "config-pass",
                    ],
                ],
            ],
            env: ["MAUMAU_GATEWAY_PASSWORD": "env-pass"],
            launchdSnapshot: snapshot)
        #expect(configPassword == "config-pass")

        let configOnlyPassword = GatewayEndpointStore._testResolveGatewayPassword(
            isRemote: false,
            root: [
                "gateway": [
                    "auth": [
                        "mode": "password",
                        "password": "config-pass",
                    ],
                ],
            ],
            env: ["MAUMAU_GATEWAY_PASSWORD": "env-pass"],
            launchdSnapshot: nil)
        #expect(configOnlyPassword == "config-pass")

        let envFallbackPassword = GatewayEndpointStore._testResolveGatewayPassword(
            isRemote: false,
            root: ["gateway": ["auth": ["mode": "password"]]],
            env: ["MAUMAU_GATEWAY_PASSWORD": "env-pass"],
            launchdSnapshot: nil)
        #expect(envFallbackPassword == "env-pass")

        let launchdFallbackPassword = GatewayEndpointStore._testResolveGatewayPassword(
            isRemote: false,
            root: ["gateway": ["auth": ["mode": "password"]]],
            env: [:],
            launchdSnapshot: snapshot)
        #expect(launchdFallbackPassword == "launchd-pass")
    }

    @Test func `resolve gateway password ignores local password when token mode is active`() {
        let password = GatewayEndpointStore._testResolveGatewayPassword(
            isRemote: false,
            root: [
                "gateway": [
                    "auth": [
                        "mode": "token",
                        "token": "config-token",
                        "password": "secret",
                    ],
                ],
            ],
            env: ["MAUMAU_GATEWAY_PASSWORD": "env-pass"],
            launchdSnapshot: self.makeLaunchAgentSnapshot(
                env: ["MAUMAU_GATEWAY_PASSWORD": "launchd-pass"],
                token: nil,
                password: "launchd-pass"))
        #expect(password == nil)
    }

    @Test func `resolve local gateway password follows launchd config path before home config`() throws {
        let tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        let configURL = tempDir.appendingPathComponent("maumau.json")
        try """
        {
          "gateway": {
            "auth": {
              "mode": "password",
              "password": "launchd-config-pass"
            }
          }
        }
        """.write(to: configURL, atomically: true, encoding: .utf8)
        defer { try? FileManager.default.removeItem(at: tempDir) }

        let password = GatewayEndpointStore._testResolveGatewayPassword(
            isRemote: false,
            root: [
                "gateway": [
                    "auth": [
                        "mode": "password",
                        "password": "home-config-pass",
                    ],
                ],
            ],
            env: [:],
            launchdSnapshot: self.makeLaunchAgentSnapshot(
                env: ["MAUMAU_CONFIG_PATH": configURL.path],
                token: nil,
                password: nil))
        #expect(password == "launchd-config-pass")
    }

    @Test func `connection mode resolver prefers config mode over defaults`() {
        let defaults = self.makeDefaults()
        defaults.set("remote", forKey: connectionModeKey)

        let root: [String: Any] = [
            "gateway": [
                "mode": " local ",
            ],
        ]

        let resolved = ConnectionModeResolver.resolve(root: root, defaults: defaults)
        #expect(resolved.mode == .local)
    }

    @Test func `connection mode resolver trims config mode`() {
        let defaults = self.makeDefaults()
        defaults.set("local", forKey: connectionModeKey)

        let root: [String: Any] = [
            "gateway": [
                "mode": " remote ",
            ],
        ]

        let resolved = ConnectionModeResolver.resolve(root: root, defaults: defaults)
        #expect(resolved.mode == .remote)
    }

    @Test func `connection mode resolver falls back to defaults when missing config`() {
        let defaults = self.makeDefaults()
        defaults.set("remote", forKey: connectionModeKey)

        let resolved = ConnectionModeResolver.resolve(root: [:], defaults: defaults)
        #expect(resolved.mode == .remote)
    }

    @Test func `connection mode resolver falls back to defaults on unknown config`() {
        let defaults = self.makeDefaults()
        defaults.set("local", forKey: connectionModeKey)

        let root: [String: Any] = [
            "gateway": [
                "mode": "staging",
            ],
        ]

        let resolved = ConnectionModeResolver.resolve(root: root, defaults: defaults)
        #expect(resolved.mode == .local)
    }

    @Test func `connection mode resolver prefers remote URL when mode missing`() {
        let defaults = self.makeDefaults()
        defaults.set("local", forKey: connectionModeKey)

        let root: [String: Any] = [
            "gateway": [
                "remote": [
                    "url": " ws://umbrel:18789 ",
                ],
            ],
        ]

        let resolved = ConnectionModeResolver.resolve(root: root, defaults: defaults)
        #expect(resolved.mode == .remote)
    }

    @Test func `resolve local gateway host uses loopback for auto even with tailnet`() {
        let host = GatewayEndpointStore._testResolveLocalGatewayHost(
            bindMode: "auto",
            tailscaleIP: "100.64.1.2")
        #expect(host == "127.0.0.1")
    }

    @Test func `resolve local gateway host uses loopback for auto without tailnet`() {
        let host = GatewayEndpointStore._testResolveLocalGatewayHost(
            bindMode: "auto",
            tailscaleIP: nil)
        #expect(host == "127.0.0.1")
    }

    @Test func `resolve local gateway host prefers tailnet for tailnet mode`() {
        let host = GatewayEndpointStore._testResolveLocalGatewayHost(
            bindMode: "tailnet",
            tailscaleIP: "100.64.1.5")
        #expect(host == "100.64.1.5")
    }

    @Test func `resolve local gateway host falls back to loopback for tailnet mode`() {
        let host = GatewayEndpointStore._testResolveLocalGatewayHost(
            bindMode: "tailnet",
            tailscaleIP: nil)
        #expect(host == "127.0.0.1")
    }

    @Test func `resolve local gateway host uses custom bind host`() {
        let host = GatewayEndpointStore._testResolveLocalGatewayHost(
            bindMode: "custom",
            tailscaleIP: "100.64.1.9",
            customBindHost: "192.168.1.10")
        #expect(host == "192.168.1.10")
    }

    @Test func `local config uses local gateway auth and host resolution`() {
        let snapshot = self.makeLaunchAgentSnapshot(
            env: [:],
            token: "launchd-token",
            password: "launchd-pass")
        let root: [String: Any] = [
            "gateway": [
                "bind": "tailnet",
                "tls": ["enabled": true],
                "remote": [
                    "url": "wss://remote.example:443",
                    "token": "remote-token",
                ],
            ],
        ]

        let config = GatewayEndpointStore._testLocalConfig(
            root: root,
            env: [:],
            launchdSnapshot: snapshot,
            tailscaleIP: "100.64.1.8")

        #expect(config.url.absoluteString == "wss://100.64.1.8:18789")
        #expect(config.token == nil)
        #expect(config.password == "launchd-pass")
    }

    @Test func `dashboard URL uses local base path in local mode`() throws {
        let config: GatewayConnection.Config = try (
            url: #require(URL(string: "ws://127.0.0.1:18789")),
            token: nil,
            password: nil)

        let url = try GatewayEndpointStore.dashboardURL(
            for: config,
            mode: .local,
            localBasePath: " control ")
        #expect(url.absoluteString == "http://127.0.0.1:18789/control/dashboard/today")
    }

    @Test func `dashboard URL skips local base path in remote mode`() throws {
        let config: GatewayConnection.Config = try (
            url: #require(URL(string: "ws://gateway.example:18789")),
            token: nil,
            password: nil)

        let url = try GatewayEndpointStore.dashboardURL(
            for: config,
            mode: .remote,
            localBasePath: "/local-ui")
        #expect(url.absoluteString == "http://gateway.example:18789/dashboard/today")
    }

    @Test func `dashboard URL prefers path from config URL`() throws {
        let config: GatewayConnection.Config = try (
            url: #require(URL(string: "wss://gateway.example:443/remote-ui")),
            token: nil,
            password: nil)

        let url = try GatewayEndpointStore.dashboardURL(
            for: config,
            mode: .remote,
            localBasePath: "/local-ui")
        #expect(url.absoluteString == "https://gateway.example:443/remote-ui/dashboard/today")
    }

    @Test func `dashboard URL uses fragment token and omits password`() throws {
        let config: GatewayConnection.Config = try (
            url: #require(URL(string: "ws://127.0.0.1:18789")),
            token: "abc123",
            password: "sekret") // pragma: allowlist secret

        let url = try GatewayEndpointStore.dashboardURL(
            for: config,
            mode: .local,
            localBasePath: "/control")
        #expect(url.absoluteString == "http://127.0.0.1:18789/control/dashboard/today#token=abc123")
        #expect(url.query == nil)
    }

    @Test func `dashboard URL carries locale query before token fragment`() throws {
        let config: GatewayConnection.Config = try (
            url: #require(URL(string: "ws://127.0.0.1:18789")),
            token: "abc123",
            password: nil)

        let url = try GatewayEndpointStore.dashboardURL(
            for: config,
            mode: .local,
            localBasePath: "/control",
            locale: "id")
        #expect(url.absoluteString == "http://127.0.0.1:18789/control/dashboard/today?locale=id#token=abc123")
    }

    @Test func `secure dashboard URL appends the current gateway token when available`() throws {
        let root: [String: Any] = [
            "gateway": [
                "auth": [
                    "mode": "token",
                    "token": "local-token",
                    "allowTailscale": true,
                ],
                "controlUi": [
                    "basePath": "/control",
                ],
                "tailscale": [
                    "mode": "serve",
                ],
            ],
        ]

        let url = GatewayEndpointStore.secureDashboardURL(
            root: root,
            tailscaleHostname: "maumau.tailnet.ts.net",
            env: [:],
            launchdSnapshot: nil)
        #expect(url?.absoluteString == "https://maumau.tailnet.ts.net/control/dashboard/today#token=local-token")
    }

    @Test func `secure dashboard URL stays nil when tailscale mode is off`() {
        let root: [String: Any] = [
            "gateway": [
                "tailscale": [
                    "mode": "off",
                ],
            ],
        ]

        let url = GatewayEndpointStore.secureDashboardURL(
            root: root,
            tailscaleHostname: "maumau.tailnet.ts.net",
            env: [:],
            launchdSnapshot: nil)
        #expect(url == nil)
    }

    @Test func `secure dashboard URL still returns a password-auth link for serve`() {
        let root: [String: Any] = [
            "gateway": [
                "auth": [
                    "mode": "password",
                    "password": "secret",
                    "allowTailscale": false,
                ],
                "tailscale": [
                    "mode": "serve",
                ],
            ],
        ]

        let url = GatewayEndpointStore.secureDashboardURL(
            root: root,
            tailscaleHostname: "maumau.tailnet.ts.net",
            env: [:],
            launchdSnapshot: nil)
        #expect(url?.absoluteString == "https://maumau.tailnet.ts.net/dashboard/today")
    }

    @Test func `secure dashboard URL supports funnel links too`() {
        let root: [String: Any] = [
            "gateway": [
                "auth": [
                    "mode": "password",
                    "password": "secret",
                    "allowTailscale": false,
                ],
                "controlUi": [
                    "basePath": "/control",
                ],
                "tailscale": [
                    "mode": "funnel",
                ],
            ],
        ]

        let url = GatewayEndpointStore.secureDashboardURL(
            root: root,
            tailscaleHostname: "maumau.tailnet.ts.net",
            env: [:],
            launchdSnapshot: nil)
        #expect(url?.absoluteString == "https://maumau.tailnet.ts.net/control/dashboard/today")
    }

    @Test func `secure dashboard URL carries locale query when requested`() {
        let root: [String: Any] = [
            "gateway": [
                "auth": [
                    "mode": "token",
                    "token": "local-token",
                    "allowTailscale": true,
                ],
                "controlUi": [
                    "basePath": "/control",
                ],
                "tailscale": [
                    "mode": "serve",
                ],
            ],
        ]

        let url = GatewayEndpointStore.secureDashboardURL(
            root: root,
            tailscaleHostname: "maumau.tailnet.ts.net",
            locale: "id",
            env: [:],
            launchdSnapshot: nil)
        #expect(url?.absoluteString == "https://maumau.tailnet.ts.net/control/dashboard/today?locale=id#token=local-token")
    }

    @Test func `normalize gateway url adds default port for loopback ws`() {
        let url = GatewayRemoteConfig.normalizeGatewayUrl("ws://127.0.0.1")
        #expect(url?.port == 18789)
        #expect(url?.absoluteString == "ws://127.0.0.1:18789")
    }

    @Test func `normalize gateway url rejects non loopback ws`() {
        let url = GatewayRemoteConfig.normalizeGatewayUrl("ws://gateway.example:18789")
        #expect(url == nil)
    }

    @Test func `normalize gateway url rejects prefix bypass loopback host`() {
        let url = GatewayRemoteConfig.normalizeGatewayUrl("ws://127.attacker.example")
        #expect(url == nil)
    }
}
