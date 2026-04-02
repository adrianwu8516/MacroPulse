// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "MacroPulse",
    platforms: [
        .macOS(.v14)
    ],
    targets: [
        .executableTarget(
            name: "MacroPulse",
            path: "Sources",
            resources: [
                .copy("Resources/AppIcon.icns")
            ]
        )
    ]
)
