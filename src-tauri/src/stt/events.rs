use serde::Serialize;

pub const STT_STATUS_EVENT: &str = "stt://status";
pub const STT_TRANSCRIPT_EVENT: &str = "stt://transcript";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SttStatusPayload {
    pub status: String,
    pub message: String,
    pub engine: String,
    pub endpoint: String,
    pub model_label: Option<String>,
    pub model_path: Option<String>,
    pub vad_label: Option<String>,
    pub vad_path: Option<String>,
    pub device_label: Option<String>,
    pub bundled: Option<bool>,
    pub last_latency_ms: Option<u128>,
    pub last_capture_samples: Option<usize>,
    pub audio_level: Option<Vec<f32>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SttTranscriptPayload {
    pub kind: String,
    pub text: String,
    pub duration_ms: u128,
}
