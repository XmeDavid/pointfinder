mod db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_pointfinder_nfc::init())
        .plugin(tauri_plugin_pointfinder_push::init())
        .plugin(tauri_plugin_pointfinder_secure_store::init())
        .plugin(tauri_plugin_websocket::init())
        .plugin(tauri_plugin_http::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:pointfinder.db", db::migrations())
                .build(),
        );

    #[cfg(mobile)]
    let builder = builder
        .plugin(tauri_plugin_geolocation::init())
        .plugin(tauri_plugin_barcode_scanner::init());

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
