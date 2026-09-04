const COMMANDS: &[&str] = &[
  "is_available",
  "start_listening",
  "stop_listening",
  "scan",
  "cancel_scan",
  "write",
  "consume_pending_tag",
  "register_listener",
  "remove_listener",
];

fn main() {
  tauri_plugin::Builder::new(COMMANDS)
    .android_path("android")
    .ios_path("ios")
    .build();
}
