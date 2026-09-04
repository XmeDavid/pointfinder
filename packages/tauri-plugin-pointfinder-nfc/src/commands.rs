use tauri::{command, AppHandle, Runtime};

use crate::models::*;
use crate::PointfinderNfcExt;
use crate::Result;

#[command]
pub(crate) async fn is_available<R: Runtime>(app: AppHandle<R>) -> Result<Availability> {
  app.pointfinder_nfc().is_available()
}

#[command]
pub(crate) async fn start_listening<R: Runtime>(app: AppHandle<R>) -> Result<()> {
  app.pointfinder_nfc().start_listening()
}

#[command]
pub(crate) async fn stop_listening<R: Runtime>(app: AppHandle<R>) -> Result<()> {
  app.pointfinder_nfc().stop_listening()
}

/// The native side blocks until a tag arrives, so run it on a blocking
/// thread instead of tying up an async runtime worker for the whole wait.
#[command]
pub(crate) async fn scan<R: Runtime>(app: AppHandle<R>, options: Option<ScanOptions>) -> Result<TagPayload> {
  let options = options.unwrap_or_default();
  tauri::async_runtime::spawn_blocking(move || app.pointfinder_nfc().scan(options))
    .await
    .map_err(|e| crate::Error::Other(e.to_string()))?
}

#[command]
pub(crate) async fn cancel_scan<R: Runtime>(app: AppHandle<R>) -> Result<()> {
  app.pointfinder_nfc().cancel_scan()
}

#[command]
pub(crate) async fn write<R: Runtime>(app: AppHandle<R>, options: WriteOptions) -> Result<WriteResult> {
  tauri::async_runtime::spawn_blocking(move || app.pointfinder_nfc().write(options))
    .await
    .map_err(|e| crate::Error::Other(e.to_string()))?
}

#[command]
pub(crate) async fn consume_pending_tag<R: Runtime>(app: AppHandle<R>) -> Result<PendingTag> {
  app.pointfinder_nfc().consume_pending_tag()
}
