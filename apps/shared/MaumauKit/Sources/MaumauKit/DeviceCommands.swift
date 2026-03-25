import Foundation

public enum MaumauDeviceCommand: String, Codable, Sendable {
    case status = "device.status"
    case info = "device.info"
}

public enum MaumauBatteryState: String, Codable, Sendable {
    case unknown
    case unplugged
    case charging
    case full
}

public enum MaumauThermalState: String, Codable, Sendable {
    case nominal
    case fair
    case serious
    case critical
}

public enum MaumauNetworkPathStatus: String, Codable, Sendable {
    case satisfied
    case unsatisfied
    case requiresConnection
}

public enum MaumauNetworkInterfaceType: String, Codable, Sendable {
    case wifi
    case cellular
    case wired
    case other
}

public struct MaumauBatteryStatusPayload: Codable, Sendable, Equatable {
    public var level: Double?
    public var state: MaumauBatteryState
    public var lowPowerModeEnabled: Bool

    public init(level: Double?, state: MaumauBatteryState, lowPowerModeEnabled: Bool) {
        self.level = level
        self.state = state
        self.lowPowerModeEnabled = lowPowerModeEnabled
    }
}

public struct MaumauThermalStatusPayload: Codable, Sendable, Equatable {
    public var state: MaumauThermalState

    public init(state: MaumauThermalState) {
        self.state = state
    }
}

public struct MaumauStorageStatusPayload: Codable, Sendable, Equatable {
    public var totalBytes: Int64
    public var freeBytes: Int64
    public var usedBytes: Int64

    public init(totalBytes: Int64, freeBytes: Int64, usedBytes: Int64) {
        self.totalBytes = totalBytes
        self.freeBytes = freeBytes
        self.usedBytes = usedBytes
    }
}

public struct MaumauNetworkStatusPayload: Codable, Sendable, Equatable {
    public var status: MaumauNetworkPathStatus
    public var isExpensive: Bool
    public var isConstrained: Bool
    public var interfaces: [MaumauNetworkInterfaceType]

    public init(
        status: MaumauNetworkPathStatus,
        isExpensive: Bool,
        isConstrained: Bool,
        interfaces: [MaumauNetworkInterfaceType])
    {
        self.status = status
        self.isExpensive = isExpensive
        self.isConstrained = isConstrained
        self.interfaces = interfaces
    }
}

public struct MaumauDeviceStatusPayload: Codable, Sendable, Equatable {
    public var battery: MaumauBatteryStatusPayload
    public var thermal: MaumauThermalStatusPayload
    public var storage: MaumauStorageStatusPayload
    public var network: MaumauNetworkStatusPayload
    public var uptimeSeconds: Double

    public init(
        battery: MaumauBatteryStatusPayload,
        thermal: MaumauThermalStatusPayload,
        storage: MaumauStorageStatusPayload,
        network: MaumauNetworkStatusPayload,
        uptimeSeconds: Double)
    {
        self.battery = battery
        self.thermal = thermal
        self.storage = storage
        self.network = network
        self.uptimeSeconds = uptimeSeconds
    }
}

public struct MaumauDeviceInfoPayload: Codable, Sendable, Equatable {
    public var deviceName: String
    public var modelIdentifier: String
    public var systemName: String
    public var systemVersion: String
    public var appVersion: String
    public var appBuild: String
    public var locale: String

    public init(
        deviceName: String,
        modelIdentifier: String,
        systemName: String,
        systemVersion: String,
        appVersion: String,
        appBuild: String,
        locale: String)
    {
        self.deviceName = deviceName
        self.modelIdentifier = modelIdentifier
        self.systemName = systemName
        self.systemVersion = systemVersion
        self.appVersion = appVersion
        self.appBuild = appBuild
        self.locale = locale
    }
}
