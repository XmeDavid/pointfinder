use serde::de::DeserializeOwned;
use tauri::{
  plugin::{PluginApi, PluginHandle},
  AppHandle, Runtime,
};

use crate::models::*;

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_pointfinder_push);

pub fn init<R: Runtime, C: DeserializeOwned>(
  _app: &AppHandle<R>,
  api: PluginApi<R, C>,
) -> crate::Result<PointfinderPush<R>> {
  #[cfg(target_os = "android")]
  let handle = api.register_android_plugin("com.prayer.pointfinder.push", "PushPlugin")?;
  #[cfg(target_os = "ios")]
  let handle = api.register_ios_plugin(init_plugin_pointfinder_push)?;
  Ok(PointfinderPush(handle))
}

pub struct PointfinderPush<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> PointfinderPush<R> {
  pub fn unregister(&self) -> crate::Result<()> {
    self.0.run_mobile_plugin::<serde_json::Value>("unregister", ()).map(|_| ()).map_err(Into::into)
  }
  pub fn permission_status(&self) -> crate::Result<PermissionStatus> {
    self.0.run_mobile_plugin("permissionStatus", ()).map_err(Into::into)
  }

  /// Blocks until the user answers the system prompt.
  pub fn request_permission(&self) -> crate::Result<PermissionStatus> {
    self.0.run_mobile_plugin("requestPermission", ()).map_err(Into::into)
  }

  /// Blocks until the platform returns a token.
  pub fn register(&self) -> crate::Result<Registration> {
    self.0.run_mobile_plugin("register", ()).map_err(Into::into)
  }

  pub fn consume_launch_tap(&self) -> crate::Result<LaunchTap> {
    self.0.run_mobile_plugin("consumeLaunchTap", ()).map_err(Into::into)
  }
}
