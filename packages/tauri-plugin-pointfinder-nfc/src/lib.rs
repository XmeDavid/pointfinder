//! NDEF URL tag support for PointFinder.
//!
//! Read tags (one-shot `scan` or passive `startListening`), write URL tags
//! with verification, and pick up a tag that launched the app. The plugin is
//! deliberately unaware of the PointFinder tag format: it returns the URL and
//! the raw records, and the shared TypeScript code decides what they mean.

use tauri::{
  plugin::{Builder, TauriPlugin},
  Manager, Runtime,
};

pub use models::*;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

mod commands;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(desktop)]
use desktop::PointfinderNfc;
#[cfg(mobile)]
use mobile::PointfinderNfc;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the NFC APIs.
pub trait PointfinderNfcExt<R: Runtime> {
  fn pointfinder_nfc(&self) -> &PointfinderNfc<R>;
}

impl<R: Runtime, T: Manager<R>> crate::PointfinderNfcExt<R> for T {
  fn pointfinder_nfc(&self) -> &PointfinderNfc<R> {
    self.state::<PointfinderNfc<R>>().inner()
  }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("pointfinder-nfc")
    .invoke_handler(tauri::generate_handler![
      commands::is_available,
      commands::start_listening,
      commands::stop_listening,
      commands::scan,
      commands::cancel_scan,
      commands::write,
      commands::consume_pending_tag,
    ])
    .setup(|app, api| {
      #[cfg(mobile)]
      let nfc = mobile::init(app, api)?;
      #[cfg(desktop)]
      let nfc = desktop::init(app, api)?;
      app.manage(nfc);
      Ok(())
    })
    .build()
}
