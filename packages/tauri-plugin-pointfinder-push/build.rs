const COMMANDS: &[&str] = &[
  "permission_status",
  "request_permission",
  "register",
  "unregister",
  "consume_launch_tap",
  "register_listener",
  "remove_listener",
];

fn main() {
  tauri_plugin::Builder::new(COMMANDS)
    .android_path("android")
    .ios_path("ios")
    .build();
}
