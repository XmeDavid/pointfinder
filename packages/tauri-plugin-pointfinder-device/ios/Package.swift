// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "tauri-plugin-pointfinder-device",
    platforms: [
        .iOS(.v17),
    ],
    products: [
        .library(
            name: "tauri-plugin-pointfinder-device",
            type: .static,
            targets: ["tauri-plugin-pointfinder-device"]),
    ],
    dependencies: [
        .package(name: "Tauri", path: "../.tauri/tauri-api")
    ],
    targets: [
        .target(
            name: "tauri-plugin-pointfinder-device",
            dependencies: [
                .byName(name: "Tauri")
            ],
            path: "Sources")
    ]
)
