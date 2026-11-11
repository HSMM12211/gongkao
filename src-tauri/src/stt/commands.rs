use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

use super::audio::device::{list_input_devices, MicrophoneDiagnostic};
use super::errors::SttError;
use super::events::{
    SttStatusPayload, SttTranscriptPayload, STT_STATUS_EVENT, STT_TRANSCRIPT_EVENT,
};
use super::model_registry::{ModelInfo, SttModelManager};
use super::session::{LocalSpeechRuntimeHealth, SttSessionManager};
use super::volc_asr::{self, VolcAsrConnectionTest};

fn status_payload(
    health: &LocalSpeechRuntimeHealth,
    status: &str,
    message: &str,
) -> SttStatusPayload {
    SttStatusPayload {
        status: status.to_string(),
        message: message.to_string(),
        engine: health.engine.clone(),
        endpoint: health.endpoint.clone(),
        model_label: health.model_label.clone(),
        model_path: health.model_path.clone(),
        vad_label: health.vad_label.clone(),
        vad_path: health.vad_path.clone(),
        device_label: health.device_label.clone(),
        bundled: health.bundled,
        last_latency_ms: health.last_latency_ms,
        last_capture_samples: health.last_capture_samples,
        audio_level: None,
    }
}

fn emit_status(app: &AppHandle, health: &LocalSpeechRuntimeHealth, status: &str, message: &str) {
    let _ = app.emit(STT_STATUS_EVENT, status_payload(health, status, message));
}

#[tauri::command]
pub fn stt_health(manager: State<'_, SttSessionManager>) -> LocalSpeechRuntimeHealth {
    manager.health()
}

#[tauri::command]
pub fn stt_start(
    app: AppHandle,
    manager: State<'_, SttSessionManager>,
) -> Result<LocalSpeechRuntimeHealth, SttError> {
    match manager.start() {
        Ok(health) => {
            emit_status(&app, &health, "recording", "Recording local speech.");
            Ok(health)
        }
        Err(error) => {
            let status = match error {
                SttError::MicDenied => "mic-denied",
                SttError::MicNotFound => "mic-not-found",
                SttError::ModelMissing | SttError::ModelHashMismatch => "model-missing",
                SttError::TranscriptionBusy => "busy",
                _ => "failed",
            };
            let health = manager.mark_failed(status, error.to_string());
            emit_status(&app, &health, status, &health.message);
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn stt_stop(
    app: AppHandle,
    manager: State<'_, SttSessionManager>,
) -> Result<String, SttError> {
    let samples = match manager.finish_recording() {
        Ok(samples) => samples,
        Err(SttError::NoSpeechDetected) => {
            let health = manager.health();
            emit_status(
                &app,
                &health,
                "empty-speech",
                "No clear speech was detected.",
            );
            return Ok(String::new());
        }
        Err(error) => {
            let health = manager.mark_failed("failed", error.to_string());
            emit_status(&app, &health, "failed", &health.message);
            return Err(error);
        }
    };

    let processing_health = manager.health();
    emit_status(
        &app,
        &processing_health,
        "processing",
        "Recognizing local speech.",
    );
    let result = match manager.transcribe_samples_blocking(samples).await {
        Ok(result) => result,
        Err(error) => {
            let health = manager.mark_failed("failed", error.to_string());
            emit_status(&app, &health, "failed", &health.message);
            return Err(error);
        }
    };

    let _ = app.emit(
        STT_TRANSCRIPT_EVENT,
        SttTranscriptPayload {
            kind: "final".into(),
            text: result.text.clone(),
            duration_ms: result.duration_ms,
        },
    );
    let ready_health = manager.mark_ready_after_transcription(result.duration_ms)?;
    emit_status(&app, &ready_health, "ready", &ready_health.message);
    Ok(result.text)
}

#[tauri::command]
pub fn stt_cancel(
    app: AppHandle,
    manager: State<'_, SttSessionManager>,
) -> Result<LocalSpeechRuntimeHealth, SttError> {
    let health = manager.cancel()?;
    emit_status(
        &app,
        &health,
        "ready",
        "Local speech recording was cancelled.",
    );
    Ok(health)
}

#[tauri::command]
pub fn stt_restart(
    app: AppHandle,
    manager: State<'_, SttSessionManager>,
) -> Result<LocalSpeechRuntimeHealth, SttError> {
    let starting = manager.mark_failed("starting", "Restarting local speech recognition.".into());
    emit_status(
        &app,
        &starting,
        "starting",
        "Restarting local speech recognition.",
    );
    let health = manager.restart()?;
    emit_status(&app, &health, health.status.as_str(), &health.message);
    Ok(health)
}

#[tauri::command]
pub fn stt_list_input_devices() -> MicrophoneDiagnostic {
    list_input_devices()
}

#[tauri::command]
pub fn stt_open_microphone_privacy_settings() -> Result<(), SttError> {
    #[cfg(target_os = "windows")]
    {
        let mut command = std::process::Command::new("cmd");
        command
            .args(["/C", "start", "ms-settings:privacy-microphone"])
            .creation_flags(CREATE_NO_WINDOW);
        command
            .spawn()
            .map_err(|error| SttError::RuntimeFailed(error.to_string()))?;
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err(SttError::RuntimeFailed(
            "microphone privacy settings shortcut is only available on Windows".into(),
        ))
    }
}

#[tauri::command]
pub fn stt_save_last_capture_for_debug(
    manager: State<'_, SttSessionManager>,
) -> Result<String, SttError> {
    manager.save_last_capture_for_debug()
}

#[tauri::command]
pub fn stt_list_models(
    model_manager: State<'_, Arc<SttModelManager>>,
) -> Result<Vec<ModelInfo>, SttError> {
    model_manager.list_models()
}

#[tauri::command]
pub fn stt_get_selected_model(
    model_manager: State<'_, Arc<SttModelManager>>,
) -> Result<Option<String>, SttError> {
    model_manager.selected_model_id()
}

#[tauri::command]
pub async fn stt_download_model(
    app: AppHandle,
    model_manager: State<'_, Arc<SttModelManager>>,
    model_id: String,
) -> Result<(), SttError> {
    let manager = Arc::clone(&model_manager);
    let result = manager.download_model(&model_id).await;
    if let Err(error) = &result {
        let _ = app.emit(
            super::model_registry::STT_MODEL_DOWNLOAD_FAILED_EVENT,
            super::model_registry::ModelEventPayload {
                model_id,
                error: Some(error.to_string()),
            },
        );
    }
    result
}

#[tauri::command]
pub fn stt_cancel_model_download(
    model_manager: State<'_, Arc<SttModelManager>>,
    model_id: String,
) -> Result<(), SttError> {
    model_manager.cancel_download(&model_id)
}

#[tauri::command]
pub fn stt_delete_model(
    manager: State<'_, SttSessionManager>,
    model_manager: State<'_, Arc<SttModelManager>>,
    model_id: String,
) -> Result<LocalSpeechRuntimeHealth, SttError> {
    model_manager.delete_model(&model_id)?;
    manager.restart()
}

#[tauri::command]
pub fn stt_select_model(
    manager: State<'_, SttSessionManager>,
    model_manager: State<'_, Arc<SttModelManager>>,
    model_id: String,
) -> Result<LocalSpeechRuntimeHealth, SttError> {
    model_manager.select_model(&model_id)?;
    manager.restart()
}

#[tauri::command]
pub async fn stt_volc_test_connection(
    endpoint: String,
    api_key: String,
    resource_id: String,
) -> Result<VolcAsrConnectionTest, SttError> {
    tauri::async_runtime::spawn_blocking(move || {
        volc_asr::test_connection(&endpoint, &api_key, &resource_id)
    })
    .await
    .map_err(|error| SttError::RuntimeFailed(error.to_string()))?
}

#[tauri::command]
pub async fn stt_volc_transcribe_pcm(
    endpoint: String,
    api_key: String,
    resource_id: String,
    audio_pcm: Vec<u8>,
    sample_rate: u32,
) -> Result<String, SttError> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        volc_asr::transcribe_pcm(&endpoint, &api_key, &resource_id, audio_pcm, sample_rate)
    })
    .await
    .map_err(|error| SttError::RuntimeFailed(error.to_string()))??;
    Ok(result.text)
}
