//! Desktop fallback used only for `tauri dev` on a workstation: a plain JSON file in the
//! app data directory. It is NOT encrypted; mobile builds never use it.
use std::{collections::BTreeMap, fs, path::PathBuf, sync::Mutex};

use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Manager, Runtime};

use crate::models::*;

pub fn init<R: Runtime, C: DeserializeOwned>(
  app: &AppHandle<R>,
  _api: PluginApi<R, C>,
) -> crate::Result<SecureStore<R>> {
  let dir = app.path().app_data_dir()?;
  fs::create_dir_all(&dir)?;
  let file = dir.join("secure-store.json");
  let data = match fs::read(&file) {
    Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
    Err(_) => BTreeMap::new(),
  };
  Ok(SecureStore { _app: app.clone(), file, data: Mutex::new(data) })
}

pub struct SecureStore<R: Runtime> {
  _app: AppHandle<R>,
  file: PathBuf,
  data: Mutex<BTreeMap<String, String>>,
}

impl<R: Runtime> SecureStore<R> {
  fn with<T>(&self, f: impl FnOnce(&mut BTreeMap<String, String>) -> T, persist: bool) -> crate::Result<T> {
    let mut data = self.data.lock().map_err(|_| crate::Error::Poisoned)?;
    let out = f(&mut data);
    if persist {
      fs::write(&self.file, serde_json::to_vec(&*data)?)?;
    }
    Ok(out)
  }

  pub fn get(&self, args: KeyArgs) -> crate::Result<ValueResponse> {
    self.with(|d| ValueResponse { value: d.get(&args.key).cloned() }, false)
  }

  pub fn set(&self, args: SetArgs) -> crate::Result<()> {
    self.with(|d| { d.insert(args.key, args.value); }, true)
  }

  pub fn remove(&self, args: KeyArgs) -> crate::Result<()> {
    self.with(|d| { d.remove(&args.key); }, true)
  }

  pub fn clear(&self) -> crate::Result<()> {
    self.with(|d| d.clear(), true)
  }

  pub fn keys(&self) -> crate::Result<KeysResponse> {
    self.with(|d| KeysResponse { keys: d.keys().cloned().collect() }, false)
  }
}
