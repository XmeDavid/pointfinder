use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::*;

/// Desktop has no NFC. Every operation reports `unavailable` so the UI can
/// be developed in a desktop window with a mocked tag flow on the JS side.
pub fn init<R: Runtime, C: DeserializeOwned>(
  app: &AppHandle<R>,
  _api: PluginApi<R, C>,
) -> crate::Result<PointfinderNfc<R>> {
  Ok(PointfinderNfc(app.clone()))
}

pub struct PointfinderNfc<R: Runtime>(AppHandle<R>);

impl<R: Runtime> PointfinderNfc<R> {
  pub fn is_available(&self) -> crate::Result<Availability> {
    Ok(Availability { available: false, enabled: false })
  }
  pub fn start_listening(&self) -> crate::Result<()> {
    Ok(())
  }
  pub fn stop_listening(&self) -> crate::Result<()> {
    Ok(())
  }
  pub fn scan(&self, _options: ScanOptions) -> crate::Result<TagPayload> {
    Err(crate::Error::Unavailable)
  }
  pub fn cancel_scan(&self) -> crate::Result<()> {
    Ok(())
  }
  pub fn write(&self, _options: WriteOptions) -> crate::Result<WriteResult> {
    Err(crate::Error::Unavailable)
  }
  pub fn consume_pending_tag(&self) -> crate::Result<PendingTag> {
    Ok(PendingTag { tag: None })
  }
}
