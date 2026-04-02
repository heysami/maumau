// swift-tools-version: 6.2
// Package manifest for the Maumau macOS companion (menu bar app + IPC library).

import PackageDescription
import Foundation

func currentMacOSSDKMajorVersion() -> Int? {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/xcrun")
    process.arguments = ["--sdk", "macosx", "--show-sdk-version"]

    let output = Pipe()
    process.standardOutput = output
    process.standardError = Pipe()

    do {
        try process.run()
    } catch {
        return nil
    }

    process.waitUntilExit()
    guard process.terminationStatus == 0 else {
        return nil
    }

    let data = output.fileHandleForReading.readDataToEndOfFile()
    guard let version = String(data: data, encoding: .utf8)?
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .split(separator: ".")
        .first
    else {
        return nil
    }

    return Int(version)
}

let disablePeekabooBridge = ProcessInfo.processInfo.environment["MAUMAU_DISABLE_PEEKABOO_BRIDGE"] == "1"
    || (currentMacOSSDKMajorVersion().map { $0 >= 26 } ?? false)

let package = Package(
    name: "Maumau",
    platforms: [
        .macOS(.v15),
    ],
    products: [
        .library(name: "MaumauIPC", targets: ["MaumauIPC"]),
        .library(name: "MaumauDiscovery", targets: ["MaumauDiscovery"]),
        .executable(name: "Maumau", targets: ["Maumau"]),
        .executable(name: "maumau-mac", targets: ["MaumauMacCLI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/orchetect/MenuBarExtraAccess", exact: "1.3.0"),
        .package(url: "https://github.com/swiftlang/swift-subprocess.git", from: "0.1.0"),
        .package(url: "https://github.com/apple/swift-log.git", from: "1.8.0"),
        .package(url: "https://github.com/sparkle-project/Sparkle", from: "2.8.1"),
        .package(url: "https://github.com/steipete/Peekaboo.git", branch: "main"),
        .package(path: "../shared/MaumauKit"),
        .package(path: "../../Swabble"),
    ],
    targets: [
        .target(
            name: "MaumauIPC",
            dependencies: [],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "MaumauDiscovery",
            dependencies: [
                .product(name: "MaumauKit", package: "MaumauKit"),
            ],
            path: "Sources/MaumauDiscovery",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .executableTarget(
            name: "Maumau",
            dependencies: [
                "MaumauIPC",
                "MaumauDiscovery",
                .product(name: "MaumauKit", package: "MaumauKit"),
                .product(name: "MaumauChatUI", package: "MaumauKit"),
                .product(name: "MaumauProtocol", package: "MaumauKit"),
                .product(name: "SwabbleKit", package: "swabble"),
                .product(name: "MenuBarExtraAccess", package: "MenuBarExtraAccess"),
                .product(name: "Subprocess", package: "swift-subprocess"),
                .product(name: "Logging", package: "swift-log"),
                .product(name: "Sparkle", package: "Sparkle"),
            ] + (disablePeekabooBridge ? [] : [
                .product(name: "PeekabooBridge", package: "Peekaboo"),
                .product(name: "PeekabooAutomationKit", package: "Peekaboo"),
            ]),
            exclude: [
                "Resources/Info.plist",
            ],
            resources: [
                .copy("Resources/Maumau.icns"),
                .copy("Resources/DeviceModels"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ] + (disablePeekabooBridge ? [
                .define("MAUMAU_DISABLE_PEEKABOO_BRIDGE"),
            ] : [])),
        .executableTarget(
            name: "MaumauMacCLI",
            dependencies: [
                "MaumauDiscovery",
                .product(name: "MaumauKit", package: "MaumauKit"),
                .product(name: "MaumauProtocol", package: "MaumauKit"),
            ],
            path: "Sources/MaumauMacCLI",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .testTarget(
            name: "MaumauIPCTests",
            dependencies: [
                "MaumauIPC",
                "Maumau",
                "MaumauDiscovery",
                .product(name: "MaumauProtocol", package: "MaumauKit"),
                .product(name: "SwabbleKit", package: "swabble"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
                .enableExperimentalFeature("SwiftTesting"),
            ]),
    ])
