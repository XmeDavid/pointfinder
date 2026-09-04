//! Small encrypted key-value store for secrets (auth tokens, device ids).
//! iOS: Keychain. Android: AES-GCM with a key held in the Android Keystore.
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
use desktop::SecureStore;
#[cfg(mobile)]
use mobile::SecureStore;

pub trait SecureStoreExt<R: Runtime> {
  fn secure_store(&self) -> &SecureStore<R>;
}

impl<R: Runtime, T: Manager<R>> crate::SecureStoreExt<R> for T {
  fn secure_store(&self) -> &SecureStore<R> {
    self.state::<SecureStore<R>>().inner()
  }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("pointfinder-secure-store")
    .invoke_handler(tauri::generate_handler![
      commands::get,
      commands::set,
      commands::remove,
      commands::clear,
      commands::keys
    ])
    .setup(|app, api| {
      #[cfg(mobile)]
      let store = mobile::init(app, api)?;
      #[cfg(desktop)]
      let store = desktop::init(app, api)?;
      app.manage(store);
      Ok(())
    })
    .build()
}
