import Foundation
import MaumauKit
import Testing

struct DeviceIdentityStoreTests {
    @Test
    func namespacesUseIndependentDeviceIdentityFiles() throws {
        let tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        let previousStateDir = ProcessInfo.processInfo.environment["MAUMAU_STATE_DIR"]
        setenv("MAUMAU_STATE_DIR", tempDir.path, 1)
        defer {
            if let previousStateDir {
                setenv("MAUMAU_STATE_DIR", previousStateDir, 1)
            } else {
                unsetenv("MAUMAU_STATE_DIR")
            }
            try? FileManager.default.removeItem(at: tempDir)
        }

        let uiIdentity = DeviceIdentityStore.loadOrCreate(namespace: "ui")
        let nodeIdentity = DeviceIdentityStore.loadOrCreate(namespace: "node")
        let repeatedUIIdentity = DeviceIdentityStore.loadOrCreate(namespace: "ui")

        #expect(uiIdentity.deviceId == repeatedUIIdentity.deviceId)
        #expect(uiIdentity.deviceId != nodeIdentity.deviceId)
    }

    @Test
    func namespacedAuthStoresDoNotLeakAcrossProfiles() throws {
        let tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        let previousStateDir = ProcessInfo.processInfo.environment["MAUMAU_STATE_DIR"]
        setenv("MAUMAU_STATE_DIR", tempDir.path, 1)
        defer {
            if let previousStateDir {
                setenv("MAUMAU_STATE_DIR", previousStateDir, 1)
            } else {
                unsetenv("MAUMAU_STATE_DIR")
            }
            try? FileManager.default.removeItem(at: tempDir)
        }

        let uiIdentity = DeviceIdentityStore.loadOrCreate(namespace: "ui")
        let nodeIdentity = DeviceIdentityStore.loadOrCreate(namespace: "node")
        _ = DeviceAuthStore.storeToken(
            deviceId: uiIdentity.deviceId,
            role: "operator",
            token: "ui-token",
            namespace: "ui")
        _ = DeviceAuthStore.storeToken(
            deviceId: nodeIdentity.deviceId,
            role: "node",
            token: "node-token",
            namespace: "node")

        #expect(DeviceAuthStore.loadToken(
            deviceId: uiIdentity.deviceId,
            role: "operator",
            namespace: "ui")?.token == "ui-token")
        #expect(DeviceAuthStore.loadToken(
            deviceId: nodeIdentity.deviceId,
            role: "node",
            namespace: "node")?.token == "node-token")
        #expect(DeviceAuthStore.loadToken(
            deviceId: uiIdentity.deviceId,
            role: "operator",
            namespace: "node") == nil)
        #expect(DeviceAuthStore.loadToken(
            deviceId: nodeIdentity.deviceId,
            role: "node",
            namespace: "ui") == nil)
    }
}
