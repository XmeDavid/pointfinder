fn main() {
    tauri_plugin::Builder::new(&["share_file", "register_listener", "remove_listener"])
        .android_path("android").ios_path("ios").build();
}
