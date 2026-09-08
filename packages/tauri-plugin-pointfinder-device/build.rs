fn main() {
    tauri_plugin::Builder::new(&["share_file", "safe_area_insets", "start_orientation", "stop_orientation", "register_listener", "remove_listener"])
        .android_path("android").ios_path("ios").build();
}
