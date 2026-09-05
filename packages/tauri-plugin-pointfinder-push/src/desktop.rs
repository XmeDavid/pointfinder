use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::*;

/// Desktop has no push. Registration reports `unavailable`.
pub fn init<R: Runtime, C: DeserializeOwned>(
  app: &AppHandle<R>,
  _api: PluginApi<R, C>,
) -> crate::Result<PointfinderPush<R>> {
  Ok(PointfinderPush(app.clone()))
}

pub struct PointfinderPush<R: Runtime>(AppHandle<R>);

impl<R: Runtime> PointfinderPush<R> {
  pub fn unregister(&self) -> crate::Result<()> { Ok(()) }
  pub fn permission_status(&self) -> crate::Result<PermissionStatus> {
    Ok(PermissionStatus { status: "denied".into() })
  }
  pub fn request_permission(&self) -> crate::Result<PermissionStatus> {
    Ok(PermissionStatus { status: "denied".into() })
  }
  pub fn register(&self) -> crate::Result<Registration> {
    Err(crate::Error::Unavailable)
  }
  pub fn consume_launch_tap(&self) -> crate::Result<LaunchTap> {
    Ok(LaunchTap { tap: None })
  }
}
