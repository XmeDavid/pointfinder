use tauri::{command, AppHandle, Runtime};

use crate::models::*;
use crate::Result;
use crate::SecureStoreExt;

#[command]
pub(crate) async fn get<R: Runtime>(app: AppHandle<R>, key: String) -> Result<ValueResponse> {
  app.secure_store().get(KeyArgs { key })
}

#[command]
pub(crate) async fn set<R: Runtime>(app: AppHandle<R>, key: String, value: String) -> Result<()> {
  app.secure_store().set(SetArgs { key, value })
}

#[command]
pub(crate) async fn remove<R: Runtime>(app: AppHandle<R>, key: String) -> Result<()> {
  app.secure_store().remove(KeyArgs { key })
}

#[command]
pub(crate) async fn clear<R: Runtime>(app: AppHandle<R>) -> Result<()> {
  app.secure_store().clear()
}

#[command]
pub(crate) async fn keys<R: Runtime>(app: AppHandle<R>) -> Result<KeysResponse> {
  app.secure_store().keys()
}
