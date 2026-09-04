use tauri::{command, AppHandle, Runtime};

use crate::models::*;
use crate::PointfinderPushExt;
use crate::Result;

#[command]
pub(crate) async fn permission_status<R: Runtime>(app: AppHandle<R>) -> Result<PermissionStatus> {
  app.pointfinder_push().permission_status()
}

#[command]
pub(crate) async fn request_permission<R: Runtime>(app: AppHandle<R>) -> Result<PermissionStatus> {
  tauri::async_runtime::spawn_blocking(move || app.pointfinder_push().request_permission())
    .await
    .map_err(|e| crate::Error::Other(e.to_string()))?
}

#[command]
pub(crate) async fn register<R: Runtime>(app: AppHandle<R>) -> Result<Registration> {
  tauri::async_runtime::spawn_blocking(move || app.pointfinder_push().register())
    .await
    .map_err(|e| crate::Error::Other(e.to_string()))?
}

#[command]
pub(crate) async fn consume_launch_tap<R: Runtime>(app: AppHandle<R>) -> Result<LaunchTap> {
  app.pointfinder_push().consume_launch_tap()
}
