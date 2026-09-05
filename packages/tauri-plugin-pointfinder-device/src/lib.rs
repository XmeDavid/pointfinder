use tauri::{plugin::{Builder, TauriPlugin}, Runtime};
#[cfg(mobile)]
use tauri::Manager;

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_pointfinder_device);

#[cfg(mobile)]
struct Device<R: Runtime>(tauri::plugin::PluginHandle<R>);

#[cfg(mobile)]
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ShareArgs { path: String, content_type: String }

#[cfg(mobile)]
#[derive(serde::Deserialize)]
struct ShareResult { result: String }

#[derive(serde::Serialize, serde::Deserialize)]
struct SafeAreaInsets { top: f64, right: f64, bottom: f64, left: f64 }

#[tauri::command]
async fn safe_area_insets<R: Runtime>(app: tauri::AppHandle<R>) -> Result<SafeAreaInsets, String> {
    #[cfg(not(mobile))]
    { let _ = app; Err("unavailable: Mobile safe areas only".into()) }
    #[cfg(mobile)]
    { app.state::<Device<R>>().0.run_mobile_plugin("safeAreaInsets", ()).map_err(|e| e.to_string()) }
}

#[tauri::command]
async fn share_file<R: Runtime>(app: tauri::AppHandle<R>, id: String, name: String, content_type: String) -> Result<String, String> {
    #[cfg(not(mobile))]
    { let _ = (app, id, name, content_type); Err("unavailable: Sharing requires a mobile device".into()) }
    #[cfg(mobile)]
    {
        if id.len() != 36 || !id.bytes().all(|c| c.is_ascii_hexdigit() || c == b'-') {
            return Err("invalid: Invalid media identifier".into());
        }
        let safe_name: String = name.chars().filter(|c| !c.is_control() && !['/', '\\', ':'].contains(c)).take(180).collect();
        if safe_name.is_empty() || safe_name == "." || safe_name == ".." { return Err("invalid: Invalid filename".into()); }
        let source = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("media").join(format!("{id}.bin"));
        let shared = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("shared");
        // Receivers may still be reading after the chooser closes. Clean only
        // old exports on a later share, never the file just handed to another app.
        if let Ok(entries) = std::fs::read_dir(&shared) {
            for entry in entries.flatten() {
                if entry.metadata().and_then(|m| m.modified()).ok().and_then(|t| t.elapsed().ok()).is_some_and(|age| age.as_secs() > 86400) {
                    let _ = std::fs::remove_dir_all(entry.path());
                }
            }
        }
        let dir = shared.join(id);
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let target = dir.join(safe_name);
        std::fs::copy(source, &target).map_err(|e| e.to_string())?;
        let handle = app.state::<Device<R>>();
        handle.0.run_mobile_plugin::<ShareResult>("shareFile", ShareArgs { path: target.to_string_lossy().into(), content_type }).map(|r| r.result).map_err(|e| e.to_string())
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("pointfinder-device")
        .invoke_handler(tauri::generate_handler![share_file, safe_area_insets])
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            let handle = _api.register_android_plugin("com.prayer.pointfinder.device", "DevicePlugin")?;
            #[cfg(target_os = "ios")]
            let handle = _api.register_ios_plugin(init_plugin_pointfinder_device)?;
            #[cfg(mobile)]
            _app.manage(Device(handle));
            Ok(())
        }).build()
}
