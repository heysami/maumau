// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "MaumauKit",
    platforms: [
        .iOS(.v18),
        .macOS(.v15),
    ],
    products: [
        .library(name: "MaumauProtocol", targets: ["MaumauProtocol"]),
        .library(name: "MaumauKit", targets: ["MaumauKit"]),
        .library(name: "MaumauChatUI", targets: ["MaumauChatUI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/steipete/ElevenLabsKit", exact: "0.1.0"),
        .package(url: "https://github.com/gonzalezreal/textual", exact: "0.3.1"),
    ],
    targets: [
        .target(
            name: "MaumauProtocol",
            path: "Sources/MaumauProtocol",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "MaumauKit",
            dependencies: [
                "MaumauProtocol",
                .product(name: "ElevenLabsKit", package: "ElevenLabsKit"),
            ],
            path: "Sources/MaumauKit",
            resources: [
                .process("Resources"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "MaumauChatUI",
            dependencies: [
                "MaumauKit",
                .product(
                    name: "Textual",
                    package: "textual",
                    condition: .when(platforms: [.macOS, .iOS])),
            ],
            path: "Sources/MaumauChatUI",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .testTarget(
            name: "MaumauKitTests",
            dependencies: ["MaumauKit", "MaumauChatUI"],
            path: "Tests/MaumauKitTests",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
                .enableExperimentalFeature("SwiftTesting"),
            ]),
    ])
