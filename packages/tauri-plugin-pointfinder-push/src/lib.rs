//! Push notifications for PointFinder: APNs on iOS, FCM on Android.
//!
//! The plugin returns the platform's own token and platform name, which is
//! exactly what the backend's push-token endpoints expect. Delivery,
//! foreground presentation, and taps are surfaced as events.

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
use desktop::PointfinderPush;
#[cfg(mobile)]
use mobile::PointfinderPush;

pub trait PointfinderPushExt<R: Runtime> {
  fn pointfinder_push(&self) -> &PointfinderPush<R>;
}

impl<R: Runtime, T: Manager<R>> crate::PointfinderPushExt<R> for T {
  fn pointfinder_push(&self) -> &PointfinderPush<R> {
    self.state::<PointfinderPush<R>>().inner()
  }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("pointfinder-push")
    .invoke_handler(tauri::generate_handler![
      commands::permission_status,
      commands::request_permission,
      commands::register,
      commands::consume_launch_tap,
    ])
    .setup(|app, api| {
      #[cfg(mobile)]
      let push = mobile::init(app, api)?;
      #[cfg(desktop)]
      let push = desktop::init(app, api)?;
      app.manage(push);
      Ok(())
    })
    .build()
}
