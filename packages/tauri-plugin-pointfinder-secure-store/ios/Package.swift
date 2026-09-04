// swift-tools-version:5.3
import PackageDescription

let package = Package(
    name: "tauri-plugin-pointfinder-secure-store",
    platforms: [
        .iOS(.v17),
    ],
    products: [
        .library(
            name: "tauri-plugin-pointfinder-secure-store",
            type: .static,
            targets: ["tauri-plugin-pointfinder-secure-store"]),
    ],
    dependencies: [
        .package(name: "Tauri", path: "../.tauri/tauri-api")
    ],
    targets: [
        .target(
            name: "tauri-plugin-pointfinder-secure-store",
            dependencies: [
                .byName(name: "Tauri")
            ],
            path: "Sources")
    ]
)
