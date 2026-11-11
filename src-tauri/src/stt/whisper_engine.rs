use serde::Serialize;
use std::sync::Mutex;
use std::time::Instant;
use transcribe_rs::{
    onnx::{
        canary::CanaryModel,
        cohere::CohereModel,
        gigaam::GigaAMModel,
        moonshine::{MoonshineModel, MoonshineVariant, StreamingModel},
        parakeet::{ParakeetModel, ParakeetParams, TimestampGranularity},
        sense_voice::{SenseVoiceModel, SenseVoiceParams},
        Quantization,
    },
    whisper_cpp::{WhisperEngine as TranscribeWhisperEngine, WhisperInferenceParams},
    SpeechModel, TranscribeOptions,
};

use super::errors::{SttError, SttResult};
use super::model_registry::{EngineType, ModelInfo, ResolvedModel};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionResult {
    pub text: String,
    pub duration_ms: u128,
    pub sample_rate: u32,
}

enum LoadedEngine {
    Whisper(TranscribeWhisperEngine),
    Parakeet(ParakeetModel),
    Moonshine(MoonshineModel),
    MoonshineStreaming(StreamingModel),
    SenseVoice(SenseVoiceModel),
    GigaAM(GigaAMModel),
    Canary(CanaryModel),
    Cohere(CohereModel),
}

pub struct LocalAsrEngine {
    engine: Mutex<LoadedEngine>,
    model: ResolvedModel,
}

impl LocalAsrEngine {
    pub fn new(model: ResolvedModel) -> SttResult<Self> {
        let loaded = match model.info.engine_type {
            EngineType::Whisper => LoadedEngine::Whisper(
                TranscribeWhisperEngine::load(&model.path).map_err(runtime_error)?,
            ),
            EngineType::Parakeet => LoadedEngine::Parakeet(
                ParakeetModel::load(&model.path, &Quantization::Int8).map_err(runtime_error)?,
            ),
            EngineType::Moonshine => LoadedEngine::Moonshine(
                MoonshineModel::load(&model.path, MoonshineVariant::Base, &Quantization::Int8)
                    .map_err(runtime_error)?,
            ),
            EngineType::MoonshineStreaming => LoadedEngine::MoonshineStreaming(
                StreamingModel::load(&model.path, 0, &Quantization::Int8).map_err(runtime_error)?,
            ),
            EngineType::SenseVoice => LoadedEngine::SenseVoice(
                SenseVoiceModel::load(&model.path, &Quantization::Int8).map_err(runtime_error)?,
            ),
            EngineType::GigaAM => LoadedEngine::GigaAM(
                GigaAMModel::load(&model.path, &Quantization::Int8).map_err(runtime_error)?,
            ),
            EngineType::Canary => LoadedEngine::Canary(
                CanaryModel::load(&model.path, &Quantization::Int8).map_err(runtime_error)?,
            ),
            EngineType::Cohere => LoadedEngine::Cohere(
                CohereModel::load(&model.path, &Quantization::Int8).map_err(runtime_error)?,
            ),
        };

        Ok(Self {
            engine: Mutex::new(loaded),
            model,
        })
    }

    pub fn model(&self) -> &ModelInfo {
        &self.model.info
    }

    pub fn resolved_model(&self) -> &ResolvedModel {
        &self.model
    }

    pub fn transcribe_16khz_mono(&self, samples: &[f32]) -> SttResult<TranscriptionResult> {
        let started_at = Instant::now();
        if samples.is_empty() {
            return Ok(TranscriptionResult {
                text: String::new(),
                duration_ms: 0,
                sample_rate: 16_000,
            });
        }

        let mut engine = self
            .engine
            .lock()
            .map_err(|err| SttError::RuntimeFailed(err.to_string()))?;
        let result = match &mut *engine {
            LoadedEngine::Whisper(engine) => {
                let params = WhisperInferenceParams {
                    language: Some("zh".into()),
                    translate: false,
                    ..Default::default()
                };
                engine
                    .transcribe_with(samples, &params)
                    .map_err(runtime_error)?
            }
            LoadedEngine::Parakeet(engine) => {
                let params = ParakeetParams {
                    timestamp_granularity: Some(TimestampGranularity::Segment),
                    ..Default::default()
                };
                engine
                    .transcribe_with(samples, &params)
                    .map_err(runtime_error)?
            }
            LoadedEngine::Moonshine(engine) => engine
                .transcribe(samples, &TranscribeOptions::default())
                .map_err(runtime_error)?,
            LoadedEngine::MoonshineStreaming(engine) => engine
                .transcribe(samples, &TranscribeOptions::default())
                .map_err(runtime_error)?,
            LoadedEngine::SenseVoice(engine) => {
                let params = SenseVoiceParams {
                    language: Some("zh".into()),
                    use_itn: Some(true),
                };
                engine
                    .transcribe_with(samples, &params)
                    .map_err(runtime_error)?
            }
            LoadedEngine::GigaAM(engine) => engine
                .transcribe(samples, &TranscribeOptions::default())
                .map_err(runtime_error)?,
            LoadedEngine::Canary(engine) => engine
                .transcribe(
                    samples,
                    &TranscribeOptions {
                        language: Some("zh".into()),
                        translate: false,
                        ..Default::default()
                    },
                )
                .map_err(runtime_error)?,
            LoadedEngine::Cohere(engine) => engine
                .transcribe(
                    samples,
                    &TranscribeOptions {
                        language: Some("zh".into()),
                        translate: false,
                        ..Default::default()
                    },
                )
                .map_err(runtime_error)?,
        };

        Ok(TranscriptionResult {
            text: normalize_to_simplified_chinese(result.text.trim()),
            duration_ms: started_at.elapsed().as_millis(),
            sample_rate: 16_000,
        })
    }
}

fn normalize_to_simplified_chinese(text: &str) -> String {
    character_converter::traditional_to_simplified(text).into_owned()
}

fn runtime_error(error: impl std::fmt::Display) -> SttError {
    SttError::RuntimeFailed(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::normalize_to_simplified_chinese;

    #[test]
    fn normalizes_traditional_chinese_transcript_to_simplified() {
        let text = normalize_to_simplified_chinese("我們頂峰相見，為人民服務。");

        assert_eq!(text, "我们顶峰相见，为人民服务。");
    }
}
