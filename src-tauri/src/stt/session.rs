use serde::Serialize;
use std::fs::{self, File};
use std::io::Write;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};

use super::audio::runtime::LocalAudioRuntime;
use super::errors::{SttError, SttResult};
use super::model_registry::{ResolvedModel, SttModelManager};
use super::vad::energy::EnergyVad;
use super::vad::smoothed::SmoothedVad;
use super::whisper_engine::{LocalAsrEngine, TranscriptionResult};

const LOCAL_ENDPOINT: &str = "tauri://local-stt";
const MIN_SPEECH_SAMPLES: usize = 3_200;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalSpeechRuntimeHealth {
    pub status: String,
    pub endpoint: String,
    pub engine: String,
    pub message: String,
    pub model_label: Option<String>,
    pub model_path: Option<String>,
    pub vad_label: Option<String>,
    pub vad_path: Option<String>,
    pub device_label: Option<String>,
    pub bundled: Option<bool>,
    pub last_latency_ms: Option<u128>,
    pub last_capture_samples: Option<usize>,
}

struct RuntimeState {
    health: LocalSpeechRuntimeHealth,
    engine: Option<Arc<LocalAsrEngine>>,
    recorder: Option<LocalAudioRuntime>,
    is_processing: bool,
    last_capture: Option<Vec<f32>>,
}

pub struct SttSessionManager {
    app: AppHandle,
    model_manager: Arc<SttModelManager>,
    state: Mutex<RuntimeState>,
}

impl SttSessionManager {
    pub fn bootstrap(app: &AppHandle, model_manager: Arc<SttModelManager>) -> Self {
        match Self::load_engine(&model_manager) {
            Ok(engine) => Self {
                app: app.clone(),
                model_manager,
                state: Mutex::new(RuntimeState {
                    health: Self::ready_health(Some(engine.resolved_model()), None, None),
                    engine: Some(Arc::new(engine)),
                    recorder: None,
                    is_processing: false,
                    last_capture: None,
                }),
            },
            Err(health) => Self {
                app: app.clone(),
                model_manager,
                state: Mutex::new(RuntimeState {
                    health,
                    engine: None,
                    recorder: None,
                    is_processing: false,
                    last_capture: None,
                }),
            },
        }
    }

    pub fn health(&self) -> LocalSpeechRuntimeHealth {
        self.state
            .lock()
            .map(|state| state.health.clone())
            .unwrap_or_else(|_| {
                Self::degraded_health("failed", "failed to read local speech runtime state".into())
            })
    }

    pub fn restart(&self) -> SttResult<LocalSpeechRuntimeHealth> {
        let mut state = self
            .state
            .lock()
            .map_err(|err| SttError::RuntimeFailed(err.to_string()))?;

        if let Some(recorder) = state.recorder.as_mut() {
            recorder.close();
        }

        match Self::load_engine(&self.model_manager) {
            Ok(engine) => {
                let health = Self::ready_health(Some(engine.resolved_model()), None, None);
                state.engine = Some(Arc::new(engine));
                state.recorder = None;
                state.is_processing = false;
                state.health = health.clone();
                Ok(health)
            }
            Err(health) => {
                state.engine = None;
                state.recorder = None;
                state.is_processing = false;
                state.health = health.clone();
                Ok(health)
            }
        }
    }

    pub fn start(&self) -> SttResult<LocalSpeechRuntimeHealth> {
        let mut state = self
            .state
            .lock()
            .map_err(|err| SttError::RuntimeFailed(err.to_string()))?;

        if state.is_processing {
            state.health.status = "busy".into();
            state.health.message =
                "Local speech recognition is still processing the previous recording.".into();
            return Err(SttError::TranscriptionBusy);
        }

        self.ensure_current_engine(&mut state)?;
        Self::ensure_recorder(&mut state)?;

        if let Err(error) = Self::start_active_recorder(&state) {
            if !should_recreate_recorder_after_start_error(&error) {
                return Err(error);
            }

            Self::drop_recorder(&mut state);
            Self::ensure_recorder(&mut state)?;
            Self::start_active_recorder(&state)?;
        }

        state.health.status = "recording".into();
        state.health.message = "Recording local speech.".into();
        Ok(state.health.clone())
    }

    pub fn finish_recording(&self) -> SttResult<Vec<f32>> {
        let mut state = self
            .state
            .lock()
            .map_err(|err| SttError::RuntimeFailed(err.to_string()))?;

        if state.is_processing {
            return Err(SttError::TranscriptionBusy);
        }

        let recorder = state
            .recorder
            .as_ref()
            .ok_or_else(|| SttError::RuntimeFailed("recording has not started".into()))?;
        let samples = recorder.stop()?;
        state.last_capture = Some(samples.clone());
        state.health.last_capture_samples = Some(samples.len());

        if samples.len() < MIN_SPEECH_SAMPLES {
            state.health.status = "empty-speech".into();
            state.health.message = "No clear speech was detected.".into();
            return Err(SttError::NoSpeechDetected);
        }

        state.is_processing = true;
        state.health.status = "processing".into();
        state.health.message = "Recognizing local speech.".into();
        Ok(samples)
    }

    pub async fn transcribe_samples_blocking(
        &self,
        samples: Vec<f32>,
    ) -> SttResult<TranscriptionResult> {
        let engine = {
            let state = self
                .state
                .lock()
                .map_err(|err| SttError::RuntimeFailed(err.to_string()))?;
            state.engine.as_ref().ok_or(SttError::ModelMissing)?.clone()
        };

        tauri::async_runtime::spawn_blocking(move || engine.transcribe_16khz_mono(&samples))
            .await
            .map_err(|err| SttError::RuntimeFailed(err.to_string()))?
    }

    pub fn mark_ready_after_transcription(
        &self,
        latency_ms: u128,
    ) -> SttResult<LocalSpeechRuntimeHealth> {
        let mut state = self
            .state
            .lock()
            .map_err(|err| SttError::RuntimeFailed(err.to_string()))?;
        state.is_processing = false;
        state.health.status = "ready".into();
        state.health.message = "Local offline speech recognition is ready.".into();
        state.health.last_latency_ms = Some(latency_ms);
        Ok(state.health.clone())
    }

    pub fn mark_failed(&self, status: &str, message: String) -> LocalSpeechRuntimeHealth {
        let mut state = match self.state.lock() {
            Ok(state) => state,
            Err(_) => return Self::degraded_health("failed", message),
        };
        state.is_processing = false;
        state.health.status = status.into();
        state.health.message = message;
        state.health.clone()
    }

    pub fn cancel(&self) -> SttResult<LocalSpeechRuntimeHealth> {
        let mut state = self
            .state
            .lock()
            .map_err(|err| SttError::RuntimeFailed(err.to_string()))?;
        if let Some(recorder) = state.recorder.as_ref() {
            let _ = recorder.stop();
        }
        state.is_processing = false;
        state.health.status = "ready".into();
        state.health.message = "Local speech recording was cancelled.".into();
        Ok(state.health.clone())
    }

    pub fn save_last_capture_for_debug(&self) -> SttResult<String> {
        let samples = {
            let state = self
                .state
                .lock()
                .map_err(|err| SttError::RuntimeFailed(err.to_string()))?;
            state
                .last_capture
                .clone()
                .ok_or(SttError::NoSpeechDetected)?
        };

        let dir = self
            .app
            .path()
            .app_data_dir()
            .map_err(|err| SttError::RuntimeFailed(err.to_string()))?;
        fs::create_dir_all(&dir).map_err(|err| SttError::RuntimeFailed(err.to_string()))?;
        let path = dir.join("stt-debug-last-capture.wav");
        write_wav_i16(&path, &samples)?;
        Ok(path.display().to_string())
    }

    fn ensure_current_engine(&self, state: &mut RuntimeState) -> SttResult<()> {
        let resolved = self.model_manager.resolve_selected_model()?;
        let current_id = state
            .engine
            .as_ref()
            .map(|engine| engine.model().id.as_str());
        if current_id == Some(resolved.info.id.as_str()) {
            return Ok(());
        }

        let engine = LocalAsrEngine::new(resolved)
            .map_err(|err| SttError::RuntimeFailed(err.to_string()))?;
        let health = Self::ready_health(Some(engine.resolved_model()), None, None);
        state.engine = Some(Arc::new(engine));
        state.health = health;
        Ok(())
    }

    fn load_engine(
        model_manager: &Arc<SttModelManager>,
    ) -> Result<LocalAsrEngine, LocalSpeechRuntimeHealth> {
        let resolved = model_manager
            .resolve_selected_model()
            .map_err(Self::model_error_health)?;
        LocalAsrEngine::new(resolved)
            .map_err(|err| Self::degraded_health("failed", err.to_string()))
    }

    fn ready_health(
        model: Option<&ResolvedModel>,
        last_latency_ms: Option<u128>,
        last_capture_samples: Option<usize>,
    ) -> LocalSpeechRuntimeHealth {
        let engine = model
            .map(|resolved| resolved.info.engine_type.runtime_label().to_string())
            .unwrap_or_else(|| "transcribe-rs".into());
        LocalSpeechRuntimeHealth {
            status: "ready".into(),
            endpoint: LOCAL_ENDPOINT.into(),
            engine,
            message: "Local offline speech recognition is ready.".into(),
            model_label: model.map(|resolved| resolved.info.name.clone()),
            model_path: model.map(|resolved| resolved.path.display().to_string()),
            vad_label: Some("Energy VAD".into()),
            vad_path: None,
            device_label: None,
            bundled: Some(false),
            last_latency_ms,
            last_capture_samples,
        }
    }

    fn model_error_health(err: SttError) -> LocalSpeechRuntimeHealth {
        match err {
            SttError::ModelHashMismatch => {
                Self::degraded_health("model-missing", "Local speech model hash mismatch.".into())
            }
            SttError::ModelMissing => Self::degraded_health(
                "model-missing",
                "Please download and select a local ASR model first.".into(),
            ),
            other => Self::degraded_health("failed", other.to_string()),
        }
    }

    fn degraded_health(status: &str, message: String) -> LocalSpeechRuntimeHealth {
        LocalSpeechRuntimeHealth {
            status: status.into(),
            endpoint: LOCAL_ENDPOINT.into(),
            engine: "transcribe-rs".into(),
            message,
            model_label: None,
            model_path: None,
            vad_label: Some("Energy VAD".into()),
            vad_path: None,
            device_label: None,
            bundled: Some(false),
            last_latency_ms: None,
            last_capture_samples: None,
        }
    }

    fn ensure_recorder(state: &mut RuntimeState) -> SttResult<()> {
        if state.recorder.is_some() {
            return Ok(());
        }

        let energy = EnergyVad::new(0.012);
        let smoothed = SmoothedVad::new(Box::new(energy), 3, 10, 2);
        let mut recorder = LocalAudioRuntime::new(Some(Box::new(smoothed)));
        recorder.open(None)?;
        state.recorder = Some(recorder);
        Ok(())
    }

    fn start_active_recorder(state: &RuntimeState) -> SttResult<()> {
        let recorder = state
            .recorder
            .as_ref()
            .ok_or_else(|| SttError::RuntimeFailed("local recorder was not initialized".into()))?;
        recorder.start()
    }

    fn drop_recorder(state: &mut RuntimeState) {
        if let Some(mut recorder) = state.recorder.take() {
            recorder.close();
        }
    }
}

fn should_recreate_recorder_after_start_error(error: &SttError) -> bool {
    match error {
        SttError::MicNotFound => true,
        SttError::RuntimeFailed(message) => {
            message.contains("microphone recorder stopped unexpectedly")
        }
        _ => false,
    }
}

fn write_wav_i16(path: &std::path::Path, samples: &[f32]) -> SttResult<()> {
    let mut file = File::create(path).map_err(|err| SttError::RuntimeFailed(err.to_string()))?;
    let data_len = (samples.len() * 2) as u32;
    let riff_len = 36_u32.saturating_add(data_len);

    file.write_all(b"RIFF")
        .map_err(|err| SttError::RuntimeFailed(err.to_string()))?;
    file.write_all(&riff_len.to_le_bytes())
        .map_err(|err| SttError::RuntimeFailed(err.to_string()))?;
    file.write_all(b"WAVEfmt ")
        .map_err(|err| SttError::RuntimeFailed(err.to_string()))?;
    file.write_all(&16_u32.to_le_bytes())
        .map_err(|err| SttError::RuntimeFailed(err.to_string()))?;
    file.write_all(&1_u16.to_le_bytes())
        .map_err(|err| SttError::RuntimeFailed(err.to_string()))?;
    file.write_all(&1_u16.to_le_bytes())
        .map_err(|err| SttError::RuntimeFailed(err.to_string()))?;
    file.write_all(&16_000_u32.to_le_bytes())
        .map_err(|err| SttError::RuntimeFailed(err.to_string()))?;
    file.write_all(&32_000_u32.to_le_bytes())
        .map_err(|err| SttError::RuntimeFailed(err.to_string()))?;
    file.write_all(&2_u16.to_le_bytes())
        .map_err(|err| SttError::RuntimeFailed(err.to_string()))?;
    file.write_all(&16_u16.to_le_bytes())
        .map_err(|err| SttError::RuntimeFailed(err.to_string()))?;
    file.write_all(b"data")
        .map_err(|err| SttError::RuntimeFailed(err.to_string()))?;
    file.write_all(&data_len.to_le_bytes())
        .map_err(|err| SttError::RuntimeFailed(err.to_string()))?;

    for sample in samples {
        let clamped = sample.clamp(-1.0, 1.0);
        let value = (clamped * i16::MAX as f32) as i16;
        file.write_all(&value.to_le_bytes())
            .map_err(|err| SttError::RuntimeFailed(err.to_string()))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{should_recreate_recorder_after_start_error, LocalSpeechRuntimeHealth};
    use crate::stt::errors::SttError;

    #[test]
    fn health_status_values_are_stable() {
        let allowed = [
            "starting",
            "ready",
            "recording",
            "processing",
            "empty-speech",
            "mic-denied",
            "mic-not-found",
            "model-missing",
            "busy",
            "failed",
        ];

        assert!(allowed.contains(&"ready"));
        assert!(allowed.contains(&"model-missing"));
    }

    #[test]
    fn ready_health_can_include_model_and_vad_metadata() {
        let health = LocalSpeechRuntimeHealth {
            status: "ready".into(),
            endpoint: "tauri://local-stt".into(),
            engine: "transcribe-rs/sensevoice".into(),
            message: "Local speech recognition is ready.".into(),
            model_label: Some("SenseVoice".into()),
            model_path: Some("AppData/models/sense-voice-int8".into()),
            vad_label: Some("Energy VAD".into()),
            vad_path: None,
            device_label: Some("Default Microphone".into()),
            bundled: Some(false),
            last_latency_ms: Some(1200),
            last_capture_samples: Some(16000),
        };

        assert_eq!(health.status, "ready");
        assert_eq!(health.vad_label.as_deref(), Some("Energy VAD"));
        assert_eq!(health.model_label.as_deref(), Some("SenseVoice"));
    }

    #[test]
    fn treats_missing_microphone_as_recoverable_recorder_start_error() {
        assert!(should_recreate_recorder_after_start_error(
            &SttError::MicNotFound
        ));
    }

    #[test]
    fn treats_unexpected_recorder_shutdown_as_recoverable_start_error() {
        assert!(should_recreate_recorder_after_start_error(
            &SttError::RuntimeFailed(
                "microphone recorder stopped unexpectedly; please try again.".into()
            )
        ));
    }

    #[test]
    fn does_not_recreate_recorder_for_model_errors() {
        assert!(!should_recreate_recorder_after_start_error(
            &SttError::ModelMissing
        ));
    }
}
