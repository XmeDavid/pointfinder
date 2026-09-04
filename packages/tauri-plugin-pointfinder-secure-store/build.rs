const COMMANDS: &[&str] = &["get", "set", "remove", "clear", "keys"];

fn main() {
  tauri_plugin::Builder::new(COMMANDS)
    .android_path("android")
    .ios_path("ios")
    .build();
}
