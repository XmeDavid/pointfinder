use serde::de::DeserializeOwned;
use tauri::{
  plugin::{PluginApi, PluginHandle},
  AppHandle, Runtime,
};

use crate::models::*;

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_pointfinder_secure_store);

pub fn init<R: Runtime, C: DeserializeOwned>(
  _app: &AppHandle<R>,
  api: PluginApi<R, C>,
) -> crate::Result<SecureStore<R>> {
  #[cfg(target_os = "android")]
  let handle = api.register_android_plugin("com.prayer.pointfinder.securestore", "SecureStorePlugin")?;
  #[cfg(target_os = "ios")]
  let handle = api.register_ios_plugin(init_plugin_pointfinder_secure_store)?;
  Ok(SecureStore(handle))
}

/// Keychain (iOS) / Android Keystore backed key-value store.
pub struct SecureStore<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> SecureStore<R> {
  pub fn get(&self, args: KeyArgs) -> crate::Result<ValueResponse> {
    self.0.run_mobile_plugin("get", args).map_err(Into::into)
  }

  pub fn set(&self, args: SetArgs) -> crate::Result<()> {
    self.0.run_mobile_plugin::<serde_json::Value>("set", args).map(|_| ()).map_err(Into::into)
  }

  pub fn remove(&self, args: KeyArgs) -> crate::Result<()> {
    self.0.run_mobile_plugin::<serde_json::Value>("remove", args).map(|_| ()).map_err(Into::into)
  }

  pub fn clear(&self) -> crate::Result<()> {
    self.0.run_mobile_plugin::<serde_json::Value>("clear", ()).map(|_| ()).map_err(Into::into)
  }

  pub fn keys(&self) -> crate::Result<KeysResponse> {
    self.0.run_mobile_plugin("keys", ()).map_err(Into::into)
  }
}
