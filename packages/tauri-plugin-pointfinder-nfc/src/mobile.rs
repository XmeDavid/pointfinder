use serde::de::DeserializeOwned;
use tauri::{
  plugin::{PluginApi, PluginHandle},
  AppHandle, Runtime,
};

use crate::models::*;

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_pointfinder_nfc);

pub fn init<R: Runtime, C: DeserializeOwned>(
  _app: &AppHandle<R>,
  api: PluginApi<R, C>,
) -> crate::Result<PointfinderNfc<R>> {
  #[cfg(target_os = "android")]
  let handle = api.register_android_plugin("com.prayer.pointfinder.nfc", "NfcPlugin")?;
  #[cfg(target_os = "ios")]
  let handle = api.register_ios_plugin(init_plugin_pointfinder_nfc)?;
  Ok(PointfinderNfc(handle))
}

/// Access to the NFC APIs.
pub struct PointfinderNfc<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> PointfinderNfc<R> {
  pub fn is_available(&self) -> crate::Result<Availability> {
    self.0.run_mobile_plugin("isAvailable", ()).map_err(Into::into)
  }

  pub fn start_listening(&self) -> crate::Result<()> {
    self.0.run_mobile_plugin("startListening", ()).map_err(Into::into)
  }

  pub fn stop_listening(&self) -> crate::Result<()> {
    self.0.run_mobile_plugin("stopListening", ()).map_err(Into::into)
  }

  /// Blocks until a tag is read, the user cancels, or the timeout elapses.
  /// Callers must run this off the async runtime (see commands.rs).
  pub fn scan(&self, options: ScanOptions) -> crate::Result<TagPayload> {
    self.0.run_mobile_plugin("scan", options).map_err(Into::into)
  }

  pub fn cancel_scan(&self) -> crate::Result<()> {
    self.0.run_mobile_plugin("cancelScan", ()).map_err(Into::into)
  }

  /// Blocks until the write completes. See `scan`.
  pub fn write(&self, options: WriteOptions) -> crate::Result<WriteResult> {
    self.0.run_mobile_plugin("write", options).map_err(Into::into)
  }

  pub fn consume_pending_tag(&self) -> crate::Result<PendingTag> {
    self.0.run_mobile_plugin("consumePendingTag", ()).map_err(Into::into)
  }

  pub fn handle(&self) -> PluginHandle<R> {
    self.0.clone()
  }
}
