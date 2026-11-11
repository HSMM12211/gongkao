use flate2::read::GzDecoder;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fmt;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tar::Archive;
use tauri::{AppHandle, Emitter, Manager};

use super::errors::{SttError, SttResult};

pub const STT_MODEL_DOWNLOAD_PROGRESS_EVENT: &str = "stt://model-download-progress";
pub const STT_MODEL_DOWNLOAD_COMPLETE_EVENT: &str = "stt://model-download-complete";
pub const STT_MODEL_DOWNLOAD_FAILED_EVENT: &str = "stt://model-download-failed";
pub const STT_MODEL_DOWNLOAD_CANCELLED_EVENT: &str = "stt://model-download-cancelled";
pub const STT_MODEL_VERIFICATION_STARTED_EVENT: &str = "stt://model-verification-started";
pub const STT_MODEL_VERIFICATION_COMPLETED_EVENT: &str = "stt://model-verification-completed";
pub const STT_MODEL_EXTRACTION_STARTED_EVENT: &str = "stt://model-extraction-started";
pub const STT_MODEL_EXTRACTION_COMPLETED_EVENT: &str = "stt://model-extraction-completed";
pub const STT_MODEL_DELETED_EVENT: &str = "stt://model-deleted";
pub const STT_MODEL_SELECTION_CHANGED_EVENT: &str = "stt://model-selection-changed";

const SELECTED_MODEL_FILE: &str = "stt-selected-model.json";

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "kebab-case")]
pub enum EngineType {
    Whisper,
    Parakeet,
    Moonshine,
    MoonshineStreaming,
    SenseVoice,
    #[serde(rename = "gigaam")]
    GigaAM,
    Canary,
    Cohere,
}

impl EngineType {
    pub fn runtime_label(self) -> &'static str {
        match self {
            EngineType::Whisper => "transcribe-rs/whisper",
            EngineType::Parakeet => "transcribe-rs/parakeet",
            EngineType::Moonshine => "transcribe-rs/moonshine",
            EngineType::MoonshineStreaming => "transcribe-rs/moonshine-streaming",
            EngineType::SenseVoice => "transcribe-rs/sensevoice",
            EngineType::GigaAM => "transcribe-rs/gigaam",
            EngineType::Canary => "transcribe-rs/canary",
            EngineType::Cohere => "transcribe-rs/cohere",
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub filename: String,
    pub url: Option<String>,
    pub sha256: Option<String>,
    pub size_mb: u64,
    pub is_downloaded: bool,
    pub is_downloading: bool,
    pub partial_size: u64,
    pub is_directory: bool,
    pub engine_type: EngineType,
    pub accuracy_score: f32,
    pub speed_score: f32,
    pub supports_translation: bool,
    pub is_recommended: bool,
    pub supported_languages: Vec<String>,
    pub supports_language_selection: bool,
    pub is_custom: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedModel {
    pub info: ModelInfo,
    pub path: PathBuf,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub model_id: String,
    pub downloaded: u64,
    pub total: u64,
    pub percentage: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelEventPayload {
    pub model_id: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SelectedModelFile {
    selected_model_id: Option<String>,
}

struct DownloadCleanup<'a> {
    cancel_flags: &'a Mutex<HashMap<String, Arc<AtomicBool>>>,
    model_id: String,
    disarmed: bool,
}

impl Drop for DownloadCleanup<'_> {
    fn drop(&mut self) {
        if !self.disarmed {
            let _ = self.cancel_flags.lock().map(|mut flags| {
                flags.remove(&self.model_id);
            });
        }
    }
}

pub struct SttModelManager {
    app: AppHandle,
    models_dir: PathBuf,
    cancel_flags: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl SttModelManager {
    pub fn new(app: &AppHandle) -> SttResult<Self> {
        let models_dir = app_data_dir(app)?.join("models");
        fs::create_dir_all(&models_dir).map_err(runtime_error)?;
        Ok(Self {
            app: app.clone(),
            models_dir,
            cancel_flags: Mutex::new(HashMap::new()),
        })
    }

    pub fn list_models(&self) -> SttResult<Vec<ModelInfo>> {
        let mut models = builtin_asr_models()
            .into_iter()
            .map(|model| self.with_download_status(model))
            .collect::<Vec<_>>();
        self.discover_custom_whisper_models(&mut models)?;
        sort_models_for_gongkao(&mut models);
        Ok(models)
    }

    pub fn selected_model_id(&self) -> SttResult<Option<String>> {
        self.read_selected_model_id()
    }

    pub fn select_model(&self, model_id: &str) -> SttResult<ModelInfo> {
        let model = self
            .list_models()?
            .into_iter()
            .find(|model| model.id == model_id)
            .ok_or(SttError::ModelMissing)?;

        if !model.is_downloaded || model.is_downloading {
            return Err(SttError::ModelMissing);
        }

        self.write_selected_model_id(Some(model_id))?;
        let _ = self.app.emit(
            STT_MODEL_SELECTION_CHANGED_EVENT,
            ModelEventPayload {
                model_id: model_id.to_string(),
                error: None,
            },
        );
        Ok(model)
    }

    pub fn clear_selected_model(&self) -> SttResult<()> {
        self.write_selected_model_id(None)
    }

    pub fn resolve_selected_model(&self) -> SttResult<ResolvedModel> {
        let models = self.list_models()?;
        if let Some(selected_id) = self.read_selected_model_id()? {
            if let Some(model) = models.iter().find(|model| model.id == selected_id) {
                if model.is_downloaded && !model.is_downloading {
                    return Ok(self.resolve_downloaded_model(model.clone())?);
                }
                return Err(SttError::ModelMissing);
            }
        }

        let fallback = models
            .into_iter()
            .filter(|model| model.is_downloaded && !model.is_downloading)
            .max_by_key(|model| {
                let chinese = supports_simplified_chinese(model);
                (
                    model.is_recommended,
                    chinese,
                    model.speed_score.round() as i32,
                )
            });

        if let Some(model) = fallback {
            self.write_selected_model_id(Some(&model.id))?;
            return Ok(self.resolve_downloaded_model(model)?);
        }

        Err(SttError::ModelMissing)
    }

    pub async fn download_model(&self, model_id: &str) -> SttResult<()> {
        let model_info = self
            .list_models()?
            .into_iter()
            .find(|model| model.id == model_id)
            .ok_or(SttError::ModelMissing)?;
        let url = model_info.url.clone().ok_or(SttError::ModelMissing)?;
        let model_path = self.model_path(&model_info);
        let partial_path = self.partial_path(&model_info);

        if model_path.exists() {
            let _ = fs::remove_file(&partial_path);
            return Ok(());
        }

        let cancel_flag = Arc::new(AtomicBool::new(false));
        {
            let mut flags = self
                .cancel_flags
                .lock()
                .map_err(|err| SttError::RuntimeFailed(err.to_string()))?;
            flags.insert(model_id.to_string(), Arc::clone(&cancel_flag));
        }
        let mut cleanup = DownloadCleanup {
            cancel_flags: &self.cancel_flags,
            model_id: model_id.to_string(),
            disarmed: false,
        };

        let mut resume_from = if partial_path.exists() {
            partial_path.metadata().map_err(runtime_error)?.len()
        } else {
            0
        };

        let client = reqwest::Client::new();
        let mut request = client.get(&url);
        if resume_from > 0 {
            request = request.header("Range", format!("bytes={resume_from}-"));
        }
        let mut response = request.send().await.map_err(runtime_error)?;
        if resume_from > 0 && response.status() == reqwest::StatusCode::OK {
            drop(response);
            let _ = fs::remove_file(&partial_path);
            resume_from = 0;
            response = client.get(&url).send().await.map_err(runtime_error)?;
        }
        if !response.status().is_success()
            && response.status() != reqwest::StatusCode::PARTIAL_CONTENT
        {
            return Err(SttError::RuntimeFailed(format!(
                "failed to download model: HTTP {}",
                response.status()
            )));
        }

        let total_size = response
            .content_length()
            .map(|length| length + resume_from)
            .unwrap_or(0);
        let mut downloaded = resume_from;
        let mut file = if resume_from > 0 {
            OpenOptions::new()
                .create(true)
                .append(true)
                .open(&partial_path)
                .map_err(runtime_error)?
        } else {
            File::create(&partial_path).map_err(runtime_error)?
        };

        self.emit_progress(model_id, downloaded, total_size);
        let mut stream = response.bytes_stream();
        let mut last_emit = Instant::now();
        while let Some(chunk) = stream.next().await {
            if cancel_flag.load(Ordering::Relaxed) {
                self.emit_model_event(STT_MODEL_DOWNLOAD_CANCELLED_EVENT, model_id, None);
                return Ok(());
            }

            let chunk = chunk.map_err(runtime_error)?;
            file.write_all(&chunk).map_err(runtime_error)?;
            downloaded += chunk.len() as u64;

            if last_emit.elapsed() >= Duration::from_millis(100) {
                self.emit_progress(model_id, downloaded, total_size);
                last_emit = Instant::now();
            }
        }
        file.flush().map_err(runtime_error)?;
        drop(file);
        self.emit_progress(model_id, downloaded, total_size);

        if total_size > 0 {
            let actual_size = partial_path.metadata().map_err(runtime_error)?.len();
            if actual_size != total_size {
                let _ = fs::remove_file(&partial_path);
                return Err(SttError::RuntimeFailed(format!(
                    "download incomplete: expected {total_size} bytes, got {actual_size}"
                )));
            }
        }

        self.emit_model_event(STT_MODEL_VERIFICATION_STARTED_EVENT, model_id, None);
        let verify_path = partial_path.clone();
        let expected = model_info.sha256.clone();
        tauri::async_runtime::spawn_blocking(move || {
            verify_sha256_file(&verify_path, expected.as_deref())
        })
        .await
        .map_err(runtime_error)??;
        self.emit_model_event(STT_MODEL_VERIFICATION_COMPLETED_EVENT, model_id, None);

        if model_info.is_directory {
            self.extract_directory_model(model_id, &model_info, &partial_path)?;
        } else {
            if let Some(parent) = model_path.parent() {
                fs::create_dir_all(parent).map_err(runtime_error)?;
            }
            fs::rename(&partial_path, &model_path).map_err(runtime_error)?;
        }

        cleanup.disarmed = true;
        self.cancel_flags
            .lock()
            .map_err(|err| SttError::RuntimeFailed(err.to_string()))?
            .remove(model_id);

        if self.read_selected_model_id()?.is_none() {
            self.write_selected_model_id(Some(model_id))?;
        }
        self.emit_model_event(STT_MODEL_DOWNLOAD_COMPLETE_EVENT, model_id, None);
        Ok(())
    }

    pub fn cancel_download(&self, model_id: &str) -> SttResult<()> {
        let flags = self
            .cancel_flags
            .lock()
            .map_err(|err| SttError::RuntimeFailed(err.to_string()))?;
        if let Some(flag) = flags.get(model_id) {
            flag.store(true, Ordering::Relaxed);
        }
        Ok(())
    }

    pub fn delete_model(&self, model_id: &str) -> SttResult<()> {
        let model = self
            .list_models()?
            .into_iter()
            .find(|model| model.id == model_id)
            .ok_or(SttError::ModelMissing)?;
        let model_path = self.model_path(&model);
        let partial_path = self.partial_path(&model);
        let extracting_path = self.extracting_path(&model);

        if model.is_directory {
            remove_dir_if_exists(&model_path)?;
            remove_dir_if_exists(&extracting_path)?;
        } else {
            remove_file_if_exists(&model_path)?;
        }
        remove_file_if_exists(&partial_path)?;

        if self
            .read_selected_model_id()?
            .as_deref()
            .is_some_and(|selected| selected == model_id)
        {
            self.clear_selected_model()?;
        }

        self.emit_model_event(STT_MODEL_DELETED_EVENT, model_id, None);
        Ok(())
    }

    fn with_download_status(&self, mut model: ModelInfo) -> ModelInfo {
        let model_path = self.model_path(&model);
        let partial_path = self.partial_path(&model);
        model.partial_size = partial_path
            .metadata()
            .map(|metadata| metadata.len())
            .unwrap_or(0);
        model.is_downloaded = if model.is_directory {
            model_path.is_dir() && !partial_path.exists()
        } else {
            model_path.is_file() && !partial_path.exists()
        };
        model.is_downloading = self
            .cancel_flags
            .lock()
            .ok()
            .is_some_and(|flags| flags.contains_key(&model.id));
        model
    }

    fn discover_custom_whisper_models(&self, models: &mut Vec<ModelInfo>) -> SttResult<()> {
        if !self.models_dir.exists() {
            return Ok(());
        }

        let predefined = models
            .iter()
            .filter(|model| model.engine_type == EngineType::Whisper && !model.is_directory)
            .map(|model| model.filename.clone())
            .collect::<HashSet<_>>();
        let existing_ids = models
            .iter()
            .map(|model| model.id.clone())
            .collect::<HashSet<_>>();

        for entry in fs::read_dir(&self.models_dir).map_err(runtime_error)? {
            let entry = match entry {
                Ok(entry) => entry,
                Err(_) => continue,
            };
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let Some(filename) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            if filename.starts_with('.') || !filename.ends_with(".bin") {
                continue;
            }
            if predefined.contains(filename) {
                continue;
            }

            let id = filename.trim_end_matches(".bin").to_string();
            if existing_ids.contains(&id) {
                continue;
            }
            let size_mb = path
                .metadata()
                .map(|meta| meta.len() / 1_048_576)
                .unwrap_or(0);
            models.push(ModelInfo {
                id: id.clone(),
                name: display_name_from_model_id(&id),
                description: "User supplied Whisper GGML model.".into(),
                filename: filename.into(),
                url: None,
                sha256: None,
                size_mb,
                is_downloaded: true,
                is_downloading: false,
                partial_size: 0,
                is_directory: false,
                engine_type: EngineType::Whisper,
                accuracy_score: 0.0,
                speed_score: 0.0,
                supports_translation: false,
                is_recommended: false,
                supported_languages: Vec::new(),
                supports_language_selection: true,
                is_custom: true,
            });
        }

        Ok(())
    }

    fn resolve_downloaded_model(&self, model: ModelInfo) -> SttResult<ResolvedModel> {
        let path = self.model_path(&model);
        let exists = if model.is_directory {
            path.is_dir()
        } else {
            path.is_file()
        };
        if !exists {
            return Err(SttError::ModelMissing);
        }
        Ok(ResolvedModel { info: model, path })
    }

    fn model_path(&self, model: &ModelInfo) -> PathBuf {
        self.models_dir.join(&model.filename)
    }

    fn partial_path(&self, model: &ModelInfo) -> PathBuf {
        self.models_dir.join(format!("{}.partial", model.filename))
    }

    fn extracting_path(&self, model: &ModelInfo) -> PathBuf {
        self.models_dir
            .join(format!("{}.extracting", model.filename))
    }

    fn selected_model_file_path(&self) -> SttResult<PathBuf> {
        Ok(app_data_dir(&self.app)?.join(SELECTED_MODEL_FILE))
    }

    fn read_selected_model_id(&self) -> SttResult<Option<String>> {
        let path = self.selected_model_file_path()?;
        if !path.exists() {
            return Ok(None);
        }
        let content = fs::read_to_string(path).map_err(runtime_error)?;
        let parsed = serde_json::from_str::<SelectedModelFile>(&content).map_err(runtime_error)?;
        Ok(parsed.selected_model_id.filter(|id| !id.trim().is_empty()))
    }

    fn write_selected_model_id(&self, model_id: Option<&str>) -> SttResult<()> {
        let dir = app_data_dir(&self.app)?;
        fs::create_dir_all(&dir).map_err(runtime_error)?;
        let payload = SelectedModelFile {
            selected_model_id: model_id.map(ToString::to_string),
        };
        let path = dir.join(SELECTED_MODEL_FILE);
        fs::write(
            path,
            serde_json::to_string_pretty(&payload).map_err(runtime_error)?,
        )
        .map_err(runtime_error)
    }

    fn extract_directory_model(
        &self,
        model_id: &str,
        model: &ModelInfo,
        archive_path: &Path,
    ) -> SttResult<()> {
        self.emit_model_event(STT_MODEL_EXTRACTION_STARTED_EVENT, model_id, None);
        let temp_dir = self.extracting_path(model);
        let final_dir = self.model_path(model);
        remove_dir_if_exists(&temp_dir)?;
        fs::create_dir_all(&temp_dir).map_err(runtime_error)?;

        let tar_gz = File::open(archive_path).map_err(runtime_error)?;
        let tar = GzDecoder::new(tar_gz);
        let mut archive = Archive::new(tar);
        archive.unpack(&temp_dir).map_err(|err| {
            let _ = fs::remove_dir_all(&temp_dir);
            let _ = fs::remove_file(archive_path);
            SttError::RuntimeFailed(format!("failed to extract model archive: {err}"))
        })?;

        let dirs = fs::read_dir(&temp_dir)
            .map_err(runtime_error)?
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .file_type()
                    .map(|file_type| file_type.is_dir())
                    .unwrap_or(false)
            })
            .collect::<Vec<_>>();

        remove_dir_if_exists(&final_dir)?;
        if dirs.len() == 1 {
            fs::rename(dirs[0].path(), &final_dir).map_err(runtime_error)?;
            remove_dir_if_exists(&temp_dir)?;
        } else {
            fs::rename(&temp_dir, &final_dir).map_err(runtime_error)?;
        }
        remove_file_if_exists(archive_path)?;
        self.emit_model_event(STT_MODEL_EXTRACTION_COMPLETED_EVENT, model_id, None);
        Ok(())
    }

    fn emit_progress(&self, model_id: &str, downloaded: u64, total: u64) {
        let percentage = if total > 0 {
            downloaded as f64 / total as f64 * 100.0
        } else {
            0.0
        };
        let _ = self.app.emit(
            STT_MODEL_DOWNLOAD_PROGRESS_EVENT,
            DownloadProgress {
                model_id: model_id.to_string(),
                downloaded,
                total,
                percentage,
            },
        );
    }

    fn emit_model_event(&self, event: &str, model_id: &str, error: Option<String>) {
        let _ = self.app.emit(
            event,
            ModelEventPayload {
                model_id: model_id.to_string(),
                error,
            },
        );
    }
}

pub fn builtin_asr_models() -> Vec<ModelInfo> {
    let whisper_languages = languages(&[
        "en", "zh", "zh-Hans", "zh-Hant", "de", "es", "ru", "ko", "fr", "ja", "pt", "tr", "pl",
        "ca", "nl", "ar", "sv", "it", "id", "hi", "fi", "vi", "he", "uk", "el", "ms", "cs", "ro",
        "da", "hu", "ta", "no", "th", "ur", "hr", "bg", "lt", "la", "mi", "ml", "cy", "sk", "te",
        "fa", "lv", "bn", "sr", "az", "sl", "kn", "et", "mk", "br", "eu", "is", "hy", "ne", "mn",
        "bs", "kk", "sq", "sw", "gl", "mr", "pa", "si", "km", "sn", "yo", "so", "af", "oc", "ka",
        "be", "tg", "sd", "gu", "am", "yi", "lo", "uz", "fo", "ht", "ps", "tk", "nn", "mt", "sa",
        "lb", "my", "bo", "tl", "mg", "as", "tt", "haw", "ln", "ha", "ba", "jw", "su", "yue",
    ]);
    let parakeet_v3_languages = languages(&[
        "bg", "hr", "cs", "da", "nl", "en", "et", "fi", "fr", "de", "el", "hu", "it", "lv", "lt",
        "mt", "pl", "pt", "ro", "sk", "sl", "es", "sv", "ru", "uk",
    ]);
    let sense_voice_languages = languages(&["zh", "zh-Hans", "zh-Hant", "en", "yue", "ja", "ko"]);
    let canary_flash_languages = languages(&["en", "de", "es", "fr"]);
    let canary_1b_languages = parakeet_v3_languages.clone();
    let cohere_languages = languages(&[
        "en", "fr", "de", "it", "es", "pt", "el", "nl", "pl", "zh", "zh-Hans", "zh-Hant", "ja",
        "ko", "vi", "ar",
    ]);

    vec![
        model(
            "small",
            "Whisper Small",
            "Fast and fairly accurate. Chinese-capable baseline.",
            "ggml-small.bin",
            "https://blob.handy.computer/ggml-small.bin",
            "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b",
            465,
            false,
            EngineType::Whisper,
            0.60,
            0.85,
            true,
            false,
            whisper_languages.clone(),
            true,
        ),
        model(
            "medium",
            "Whisper Medium",
            "Good accuracy with moderate speed.",
            "whisper-medium-q4_1.bin",
            "https://blob.handy.computer/whisper-medium-q4_1.bin",
            "79283fc1f9fe12ca3248543fbd54b73292164d8df5a16e095e2bceeaaabddf57",
            469,
            false,
            EngineType::Whisper,
            0.75,
            0.60,
            true,
            false,
            whisper_languages.clone(),
            true,
        ),
        model(
            "turbo",
            "Whisper Turbo",
            "High quality multilingual Whisper model, larger download.",
            "ggml-large-v3-turbo.bin",
            "https://blob.handy.computer/ggml-large-v3-turbo.bin",
            "1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69",
            1549,
            false,
            EngineType::Whisper,
            0.80,
            0.40,
            false,
            false,
            whisper_languages.clone(),
            true,
        ),
        model(
            "large",
            "Whisper Large",
            "Accurate multilingual Whisper model, slower on CPU.",
            "ggml-large-v3-q5_0.bin",
            "https://blob.handy.computer/ggml-large-v3-q5_0.bin",
            "d75795ecff3f83b5faa89d1900604ad8c780abd5739fae406de19f23ecd98ad1",
            1031,
            false,
            EngineType::Whisper,
            0.85,
            0.30,
            true,
            false,
            whisper_languages.clone(),
            true,
        ),
        model(
            "breeze-asr",
            "Breeze ASR",
            "Optimized for Taiwanese Mandarin and code-switching.",
            "breeze-asr-q5_k.bin",
            "https://blob.handy.computer/breeze-asr-q5_k.bin",
            "8efbf0ce8a3f50fe332b7617da787fb81354b358c288b008d3bdef8359df64c6",
            1030,
            false,
            EngineType::Whisper,
            0.85,
            0.35,
            false,
            false,
            whisper_languages,
            true,
        ),
        model(
            "parakeet-tdt-0.6b-v2",
            "Parakeet V2",
            "English-only model with high speed and accuracy.",
            "parakeet-tdt-0.6b-v2-int8",
            "https://blob.handy.computer/parakeet-v2-int8.tar.gz",
            "ac9b9429984dd565b25097337a887bb7f0f8ac393573661c651f0e7d31563991",
            451,
            true,
            EngineType::Parakeet,
            0.85,
            0.85,
            false,
            false,
            languages(&["en"]),
            false,
        ),
        model(
            "parakeet-tdt-0.6b-v3",
            "Parakeet V3",
            "Fast model for 25 European languages.",
            "parakeet-tdt-0.6b-v3-int8",
            "https://blob.handy.computer/parakeet-v3-int8.tar.gz",
            "43d37191602727524a7d8c6da0eef11c4ba24320f5b4730f1a2497befc2efa77",
            456,
            true,
            EngineType::Parakeet,
            0.80,
            0.85,
            false,
            true,
            parakeet_v3_languages,
            false,
        ),
        model(
            "moonshine-base",
            "Moonshine Base",
            "Very fast English-only model.",
            "moonshine-base",
            "https://blob.handy.computer/moonshine-base.tar.gz",
            "04bf6ab012cfceebd4ac7cf88c1b31d027bbdd3cd704649b692e2e935236b7e8",
            55,
            true,
            EngineType::Moonshine,
            0.70,
            0.90,
            false,
            false,
            languages(&["en"]),
            false,
        ),
        model(
            "moonshine-tiny-streaming-en",
            "Moonshine V2 Tiny",
            "Ultra-fast English-only streaming model.",
            "moonshine-tiny-streaming-en",
            "https://blob.handy.computer/moonshine-tiny-streaming-en.tar.gz",
            "465addcfca9e86117415677dfdc98b21edc53537210333a3ecdb58509a80abaf",
            31,
            true,
            EngineType::MoonshineStreaming,
            0.55,
            0.95,
            false,
            false,
            languages(&["en"]),
            false,
        ),
        model(
            "moonshine-small-streaming-en",
            "Moonshine V2 Small",
            "Fast English-only streaming model.",
            "moonshine-small-streaming-en",
            "https://blob.handy.computer/moonshine-small-streaming-en.tar.gz",
            "dbb3e1c1832bd88a4ac712f7449a136cc2c9a18c5fe33a12ed1b7cb1cfe9cdd5",
            99,
            true,
            EngineType::MoonshineStreaming,
            0.65,
            0.90,
            false,
            false,
            languages(&["en"]),
            false,
        ),
        model(
            "moonshine-medium-streaming-en",
            "Moonshine V2 Medium",
            "Higher quality English-only streaming model.",
            "moonshine-medium-streaming-en",
            "https://blob.handy.computer/moonshine-medium-streaming-en.tar.gz",
            "07a66f3bff1c77e75a2f637e5a263928a08baae3c29c4c053fc968a9a9373d13",
            192,
            true,
            EngineType::MoonshineStreaming,
            0.75,
            0.80,
            false,
            false,
            languages(&["en"]),
            false,
        ),
        model(
            "sense-voice-int8",
            "SenseVoice",
            "Very fast model for Chinese, English, Japanese, Korean and Cantonese.",
            "sense-voice-int8",
            "https://blob.handy.computer/sense-voice-int8.tar.gz",
            "171d611fe5d353a50bbb741b6f3ef42559b1565685684e9aa888ef563ba3e8a4",
            152,
            true,
            EngineType::SenseVoice,
            0.65,
            0.95,
            false,
            true,
            sense_voice_languages,
            true,
        ),
        model(
            "gigaam-v3-e2e-ctc",
            "GigaAM v3",
            "Russian speech recognition model.",
            "giga-am-v3-int8",
            "https://blob.handy.computer/giga-am-v3-int8.tar.gz",
            "d872462268430db140b69b72e0fc4b787b194c1dbe51b58de39444d55b6da45b",
            151,
            true,
            EngineType::GigaAM,
            0.85,
            0.75,
            false,
            false,
            languages(&["ru"]),
            false,
        ),
        model(
            "canary-180m-flash",
            "Canary 180M Flash",
            "Fast multilingual model for English, German, Spanish and French.",
            "canary-180m-flash",
            "https://blob.handy.computer/canary-180m-flash.tar.gz",
            "6d9cfca6118b296e196eaedc1c8fa9788305a7b0f1feafdb6dc91932ab6e53f7",
            146,
            true,
            EngineType::Canary,
            0.75,
            0.85,
            true,
            false,
            canary_flash_languages,
            true,
        ),
        model(
            "canary-1b-v2",
            "Canary 1B v2",
            "Accurate multilingual model for 25 European languages.",
            "canary-1b-v2",
            "https://blob.handy.computer/canary-1b-v2.tar.gz",
            "02305b2a25f9cf3e7deaffa7f94df00efa44f442cd55c101c2cb9c000f904666",
            691,
            true,
            EngineType::Canary,
            0.85,
            0.70,
            true,
            false,
            canary_1b_languages,
            true,
        ),
        model(
            "cohere-int8",
            "Cohere",
            "Large multilingual model with Chinese support.",
            "cohere-int8",
            "https://blob.handy.computer/cohere-int8.tar.gz",
            "ea2257d52434f3644574f187dcdcf666e302cd11b92866116ab8e14cd9c887f0",
            1708,
            true,
            EngineType::Cohere,
            0.90,
            0.60,
            false,
            false,
            cohere_languages,
            true,
        ),
    ]
}

#[allow(clippy::too_many_arguments)]
fn model(
    id: &str,
    name: &str,
    description: &str,
    filename: &str,
    url: &str,
    sha256: &str,
    size_mb: u64,
    is_directory: bool,
    engine_type: EngineType,
    accuracy_score: f32,
    speed_score: f32,
    supports_translation: bool,
    is_recommended: bool,
    supported_languages: Vec<String>,
    supports_language_selection: bool,
) -> ModelInfo {
    ModelInfo {
        id: id.into(),
        name: name.into(),
        description: description.into(),
        filename: filename.into(),
        url: Some(url.into()),
        sha256: Some(sha256.into()),
        size_mb,
        is_downloaded: false,
        is_downloading: false,
        partial_size: 0,
        is_directory,
        engine_type,
        accuracy_score,
        speed_score,
        supports_translation,
        is_recommended,
        supported_languages,
        supports_language_selection,
        is_custom: false,
    }
}

fn sort_models_for_gongkao(models: &mut [ModelInfo]) {
    models.sort_by(|a, b| {
        let a_chinese = supports_simplified_chinese(a);
        let b_chinese = supports_simplified_chinese(b);
        b.is_downloaded
            .cmp(&a.is_downloaded)
            .then(b.is_recommended.cmp(&a.is_recommended))
            .then(b_chinese.cmp(&a_chinese))
            .then_with(|| a.name.cmp(&b.name))
    });
}

fn supports_simplified_chinese(model: &ModelInfo) -> bool {
    model.supported_languages.iter().any(|language| {
        matches!(
            language.as_str(),
            "zh" | "zh-CN" | "zh-Hans" | "cmn" | "yue"
        )
    })
}

fn languages(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| (*value).to_string()).collect()
}

fn display_name_from_model_id(id: &str) -> String {
    id.replace(['-', '_'], " ")
        .split_whitespace()
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn app_data_dir(app: &AppHandle) -> SttResult<PathBuf> {
    app.path()
        .app_data_dir()
        .map_err(|err| SttError::RuntimeFailed(err.to_string()))
}

fn remove_file_if_exists(path: &Path) -> SttResult<()> {
    if path.exists() {
        fs::remove_file(path).map_err(runtime_error)?;
    }
    Ok(())
}

fn remove_dir_if_exists(path: &Path) -> SttResult<()> {
    if path.exists() {
        fs::remove_dir_all(path).map_err(runtime_error)?;
    }
    Ok(())
}

fn verify_sha256_file(path: &Path, expected_sha256: Option<&str>) -> SttResult<()> {
    let Some(expected) = expected_sha256 else {
        return Ok(());
    };
    let actual = sha256_file(path)?;
    if actual != expected {
        let _ = fs::remove_file(path);
        return Err(SttError::ModelHashMismatch);
    }
    Ok(())
}

fn sha256_file(path: &Path) -> SttResult<String> {
    let mut file = File::open(path).map_err(|_| SttError::ModelMissing)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(runtime_error)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn runtime_error(error: impl fmt::Display) -> SttError {
    SttError::RuntimeFailed(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_sha256_for_a_model_file() {
        let dir = std::env::temp_dir().join("gongkao-model-registry");
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("model.bin");
        fs::write(&file, b"abc").unwrap();
        let digest = sha256_file(&file).unwrap();
        assert_eq!(
            digest,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn builtin_asr_catalog_covers_all_handy_engine_families() {
        let models = builtin_asr_models();
        let engines = models
            .iter()
            .map(|model| model.engine_type)
            .collect::<HashSet<_>>();

        assert!(engines.contains(&EngineType::Whisper));
        assert!(engines.contains(&EngineType::Parakeet));
        assert!(engines.contains(&EngineType::Moonshine));
        assert!(engines.contains(&EngineType::MoonshineStreaming));
        assert!(engines.contains(&EngineType::SenseVoice));
        assert!(engines.contains(&EngineType::GigaAM));
        assert!(engines.contains(&EngineType::Canary));
        assert!(engines.contains(&EngineType::Cohere));
    }

    #[test]
    fn builtin_asr_catalog_marks_chinese_capable_models() {
        let models = builtin_asr_models();
        let sense_voice = models
            .iter()
            .find(|model| model.id == "sense-voice-int8")
            .expect("SenseVoice should be available for Chinese local ASR");

        assert_eq!(sense_voice.engine_type, EngineType::SenseVoice);
        assert!(sense_voice.is_directory);
        assert!(sense_voice.supported_languages.contains(&"zh-Hans".into()));
        assert!(sense_voice
            .url
            .as_deref()
            .is_some_and(|url| url.ends_with(".tar.gz")));
    }
}
