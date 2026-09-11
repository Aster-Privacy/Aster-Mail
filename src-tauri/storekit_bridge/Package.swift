// swift-tools-version:5.9

import PackageDescription

let package = Package(
    name: "storekit_bridge",
    platforms: [.macOS(.v12)],
    products: [
        .library(name: "storekit_bridge", type: .static, targets: ["storekit_bridge"])
    ],
    targets: [
        .target(name: "storekit_bridge", path: "Sources/storekit_bridge")
    ],
    swiftLanguageVersions: [.v5]
)
