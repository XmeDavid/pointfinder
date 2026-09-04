use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionStatus {
  /// "granted", "denied" or "prompt".
  pub status: String,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Registration {
  /// Raw APNs token (hex) on iOS, FCM registration token on Android.
  pub token: String,
  /// "ios" or "android", matching the backend's push platform enum.
  pub platform: String,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchTap {
  pub tap: Option<serde_json::Value>,
}
