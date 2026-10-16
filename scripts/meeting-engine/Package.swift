// swift-tools-version: 6.0
import PackageDescription

// Prototype « dicta-meeting » : FluidAudio (Apache-2.0) + Parakeet TDT v3 + diarisation pyannote/WeSpeaker en Core ML.
let package = Package(
    name: "dicta-meeting",
    platforms: [.macOS(.v14)],
    dependencies: [
        .package(url: "https://github.com/FluidInference/FluidAudio.git", exact: "0.17.7"),
    ],
    targets: [
        .executableTarget(
            name: "dicta-meeting",
            dependencies: [.product(name: "FluidAudio", package: "FluidAudio")],
            path: "Sources/dicta-meeting",
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
    ]
)
