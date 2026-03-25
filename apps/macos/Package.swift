// swift-tools-version: 6.2
// Package manifest for the Maumau macOS companion (menu bar app + IPC library).

import PackageDescription

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
        .package(url: "https://github.com/orchetect/MenuBarExtraAccess", exact: "1.2.2"),
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
                .product(name: "PeekabooBridge", package: "Peekaboo"),
                .product(name: "PeekabooAutomationKit", package: "Peekaboo"),
            ],
            exclude: [
                "Resources/Info.plist",
            ],
            resources: [
                .copy("Resources/Maumau.icns"),
                .copy("Resources/DeviceModels"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
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
