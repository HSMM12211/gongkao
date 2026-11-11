use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
#[serde(tag = "code", content = "message")]
pub enum SttError {
    #[serde(rename = "model-missing")]
    #[error("local speech model is missing")]
    ModelMissing,

    #[serde(rename = "model-hash-mismatch")]
    #[error("local speech model hash mismatch")]
    ModelHashMismatch,

    #[serde(rename = "mic-denied")]
    #[error("microphone permission denied")]
    MicDenied,

    #[serde(rename = "mic-not-found")]
    #[error("microphone input device was not found")]
    MicNotFound,

    #[serde(rename = "no-speech-detected")]
    #[error("no clear speech was detected")]
    NoSpeechDetected,

    #[serde(rename = "transcription-busy")]
    #[error("local speech transcription is busy")]
    TranscriptionBusy,

    #[serde(rename = "runtime-failed")]
    #[error("local speech runtime failed: {0}")]
    RuntimeFailed(String),
}

pub type SttResult<T> = Result<T, SttError>;
