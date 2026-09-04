// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "tauri-plugin-pointfinder-nfc",
    platforms: [
        .iOS(.v17),
    ],
    products: [
        .library(
            name: "tauri-plugin-pointfinder-nfc",
            type: .static,
            targets: ["tauri-plugin-pointfinder-nfc"]),
    ],
    dependencies: [
        .package(name: "Tauri", path: "../.tauri/tauri-api")
    ],
    targets: [
        .target(
            name: "tauri-plugin-pointfinder-nfc",
            dependencies: [
                .byName(name: "Tauri")
            ],
            path: "Sources")
    ]
)
