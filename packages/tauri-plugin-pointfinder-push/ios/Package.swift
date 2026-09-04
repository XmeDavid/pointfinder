// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "tauri-plugin-pointfinder-push",
    platforms: [
        .iOS(.v17),
    ],
    products: [
        .library(
            name: "tauri-plugin-pointfinder-push",
            type: .static,
            targets: ["tauri-plugin-pointfinder-push"]),
    ],
    dependencies: [
        .package(name: "Tauri", path: "../.tauri/tauri-api")
    ],
    targets: [
        .target(
            name: "tauri-plugin-pointfinder-push",
            dependencies: [
                .byName(name: "Tauri")
            ],
            path: "Sources")
    ]
)
