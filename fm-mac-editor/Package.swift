// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "FMMacEditor",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "FMMacEditor", targets: ["FMMacEditor"]),
        .library(name: "FMEditCore", targets: ["FMEditCore"]),
    ],
    targets: [
        // Platform-neutral core: value encoding, scanner, guarded edit engine, saved table.
        // The Mach (macOS) memory backend lives here too, behind `#if os(macOS)`.
        .target(name: "FMEditCore"),
        // SwiftUI app (macOS only; compiles to an empty stub elsewhere).
        .executableTarget(name: "FMMacEditor", dependencies: ["FMEditCore"]),
        .testTarget(name: "FMEditCoreTests", dependencies: ["FMEditCore"]),
    ]
)
