use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, Stream};
use std::sync::{Arc, Mutex};

use super::errors::{SttError, SttResult};

pub struct CapturedAudio {
  pub samples: Vec<f32>,
  pub sample_rate: u32,
  pub capture_error: Option<String>,
}

pub struct AudioCapture {
  stream: Stream,
  samples: Arc<Mutex<Vec<f32>>>,
  capture_error: Arc<Mutex<Option<String>>>,
  sample_rate: u32,
}

impl AudioCapture {
  pub fn start() -> SttResult<Self> {
    let host = cpal::default_host();
    let device = host.default_input_device().ok_or(SttError::MicNotFound)?;
    let supported_config = device
      .default_input_config()
      .map_err(|err| Self::map_capture_error(&err.to_string()))?;
    let config = supported_config.config();
    let channels = config.channels as usize;
    let sample_rate = config.sample_rate;

    let samples = Arc::new(Mutex::new(Vec::<f32>::new()));
    let capture_error = Arc::new(Mutex::new(None));

    let stream = match supported_config.sample_format() {
      SampleFormat::F32 => device
        .build_input_stream(
          &config,
          {
            let samples_f32 = Arc::clone(&samples);
            move |data: &[f32], _| push_f32(data, channels, &samples_f32)
          },
          {
            let capture_error = Arc::clone(&capture_error);
            move |err| {
              if let Ok(mut slot) = capture_error.lock() {
                *slot = Some(err.to_string());
              }
            }
          },
          None,
        )
        .map_err(|err| Self::map_capture_error(&err.to_string()))?,
      SampleFormat::I16 => {
        let samples_i16 = Arc::clone(&samples);
        device
          .build_input_stream(
            &config,
            move |data: &[i16], _| push_i16(data, channels, &samples_i16),
            {
              let capture_error = Arc::clone(&capture_error);
              move |err| {
                if let Ok(mut slot) = capture_error.lock() {
                  *slot = Some(err.to_string());
                }
              }
            },
            None,
          )
          .map_err(|err| Self::map_capture_error(&err.to_string()))?
      }
      SampleFormat::U16 => {
        let samples_u16 = Arc::clone(&samples);
        device
          .build_input_stream(
            &config,
            move |data: &[u16], _| push_u16(data, channels, &samples_u16),
            {
              let capture_error = Arc::clone(&capture_error);
              move |err| {
                if let Ok(mut slot) = capture_error.lock() {
                  *slot = Some(err.to_string());
                }
              }
            },
            None,
          )
          .map_err(|err| Self::map_capture_error(&err.to_string()))?
      }
      other => {
        return Err(SttError::RuntimeFailed(format!(
          "unsupported input sample format: {other:?}"
        )));
      }
    };

    stream
      .play()
      .map_err(|err| Self::map_capture_error(&err.to_string()))?;

    Ok(Self {
      stream,
      samples,
      capture_error,
      sample_rate,
    })
  }

  pub fn stop(self) -> CapturedAudio {
    drop(self.stream);
    let samples = self.samples.lock().map(|buffer| buffer.clone()).unwrap_or_default();
    let capture_error = self.capture_error.lock().map(|slot| slot.clone()).unwrap_or(None);
    CapturedAudio {
      samples,
      sample_rate: self.sample_rate,
      capture_error,
    }
  }

  fn map_capture_error(message: &str) -> SttError {
    let lowered = message.to_lowercase();
    if lowered.contains("permission") || lowered.contains("denied") {
      SttError::MicDenied
    } else {
      SttError::RuntimeFailed(message.to_string())
    }
  }
}

fn push_f32(data: &[f32], channels: usize, sink: &Arc<Mutex<Vec<f32>>>) {
  let mut output = Vec::with_capacity(data.len().saturating_div(channels.max(1)));
  if channels <= 1 {
    output.extend_from_slice(data);
  } else {
    for frame in data.chunks(channels) {
      if frame.is_empty() {
        continue;
      }
      let sum: f32 = frame.iter().copied().sum();
      output.push(sum / frame.len() as f32);
    }
  }

  if let Ok(mut guard) = sink.lock() {
    guard.extend(output);
  }
}

fn push_i16(data: &[i16], channels: usize, sink: &Arc<Mutex<Vec<f32>>>) {
  let mut output = Vec::with_capacity(data.len().saturating_div(channels.max(1)));
  if channels <= 1 {
    output.extend(data.iter().copied().map(|sample| sample as f32 / i16::MAX as f32));
  } else {
    for frame in data.chunks(channels) {
      if frame.is_empty() {
        continue;
      }
      let sum: f32 = frame.iter().copied().map(|sample| sample as f32 / i16::MAX as f32).sum();
      output.push(sum / frame.len() as f32);
    }
  }

  if let Ok(mut guard) = sink.lock() {
    guard.extend(output);
  }
}

fn push_u16(data: &[u16], channels: usize, sink: &Arc<Mutex<Vec<f32>>>) {
  let mut output = Vec::with_capacity(data.len().saturating_div(channels.max(1)));
  if channels <= 1 {
    output.extend(data.iter().copied().map(|sample| sample as f32 / u16::MAX as f32 * 2.0 - 1.0));
  } else {
    for frame in data.chunks(channels) {
      if frame.is_empty() {
        continue;
      }
      let sum: f32 = frame
        .iter()
        .copied()
        .map(|sample| sample as f32 / u16::MAX as f32 * 2.0 - 1.0)
        .sum();
      output.push(sum / frame.len() as f32);
    }
  }

  if let Ok(mut guard) = sink.lock() {
    guard.extend(output);
  }
}
