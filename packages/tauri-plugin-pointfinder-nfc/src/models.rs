use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Availability {
  pub available: bool,
  pub enabled: bool,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanOptions {
  #[serde(skip_serializing_if = "Option::is_none")]
  pub message: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub success_message: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub cancel_label: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteOptions {
  pub url: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub verify: Option<bool>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub application_record: Option<bool>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub message: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub success_message: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub cancel_label: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NdefRecord {
  pub tnf: u8,
  #[serde(rename = "type")]
  pub record_type: String,
  /// Base64-encoded raw payload.
  pub payload: String,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagPayload {
  /// Hex tag UID when the platform exposes it.
  pub id: Option<String>,
  /// First well-known URI record, decoded.
  pub url: Option<String>,
  pub records: Vec<NdefRecord>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteResult {
  /// True when the tag was re-read and matched. False when verification was skipped or inconclusive.
  pub verified: bool,
  pub id: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingTag {
  pub tag: Option<TagPayload>,
}
