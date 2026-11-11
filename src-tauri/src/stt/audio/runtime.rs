use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, FromSample, Sample, SampleFormat, SizedSample};

use super::device::{is_microphone_access_denied, is_no_input_device_error};
use super::frame_resampler::FrameResampler;
use crate::stt::errors::{SttError, SttResult};
use crate::stt::vad::{VadFrame, VoiceActivityDetector, VAD_SAMPLE_RATE};

pub enum RecorderCommand {
    Start,
    Stop(mpsc::Sender<Vec<f32>>),
    Shutdown,
}

enum AudioChunk {
    Samples(Vec<f32>),
}

pub struct LocalAudioRuntime {
    device: Option<Device>,
    cmd_tx: Option<mpsc::Sender<RecorderCommand>>,
    worker_handle: Option<JoinHandle<()>>,
    vad: Option<Arc<Mutex<Box<dyn VoiceActivityDetector>>>>,
    stream_error: Option<Arc<Mutex<Option<String>>>>,
}

impl LocalAudioRuntime {
    pub fn new(vad: Option<Box<dyn VoiceActivityDetector>>) -> Self {
        Self {
            device: None,
            cmd_tx: None,
            worker_handle: None,
            vad: vad.map(|vad| Arc::new(Mutex::new(vad))),
            stream_error: None,
        }
    }

    pub fn open(&mut self, device: Option<Device>) -> SttResult<()> {
        if self.worker_handle.is_some() {
            return Ok(());
        }

        let host = cpal::default_host();
        let device = match device {
            Some(device) => device,
            None => host.default_input_device().ok_or(SttError::MicNotFound)?,
        };

        let (sample_tx, sample_rx) = mpsc::channel::<AudioChunk>();
        let (cmd_tx, cmd_rx) = mpsc::channel::<RecorderCommand>();
        let (init_tx, init_rx) = mpsc::sync_channel::<Result<(), String>>(1);
        let stream_error = Arc::new(Mutex::new(None::<String>));
        let thread_device = device.clone();
        let vad = self.vad.clone();
        let thread_stream_error = Arc::clone(&stream_error);

        let worker = thread::spawn(move || {
            let init_result = (|| -> Result<(cpal::Stream, u32), String> {
                let supported_config = preferred_input_config(&thread_device)
                    .map_err(|error| format!("failed to fetch preferred input config: {error}"))?;
                let sample_rate = supported_config.sample_rate();
                let channels = supported_config.channels() as usize;
                let stream = match supported_config.sample_format() {
                    SampleFormat::F32 => build_stream_f32(
                        &thread_device,
                        &supported_config,
                        sample_tx,
                        channels,
                        Arc::clone(&thread_stream_error),
                    ),
                    SampleFormat::I16 => build_stream_i16(
                        &thread_device,
                        &supported_config,
                        sample_tx,
                        channels,
                        Arc::clone(&thread_stream_error),
                    ),
                    SampleFormat::U16 => build_stream_u16(
                        &thread_device,
                        &supported_config,
                        sample_tx,
                        channels,
                        Arc::clone(&thread_stream_error),
                    ),
                    SampleFormat::I8 => build_stream::<i8>(
                        &thread_device,
                        &supported_config,
                        sample_tx,
                        channels,
                        Arc::clone(&thread_stream_error),
                    ),
                    SampleFormat::U8 => build_stream::<u8>(
                        &thread_device,
                        &supported_config,
                        sample_tx,
                        channels,
                        Arc::clone(&thread_stream_error),
                    ),
                    SampleFormat::I32 => build_stream::<i32>(
                        &thread_device,
                        &supported_config,
                        sample_tx,
                        channels,
                        Arc::clone(&thread_stream_error),
                    ),
                    SampleFormat::U32 => build_stream::<u32>(
                        &thread_device,
                        &supported_config,
                        sample_tx,
                        channels,
                        Arc::clone(&thread_stream_error),
                    ),
                    other => return Err(format!("unsupported input sample format: {other:?}")),
                }
                .map_err(|error| format!("failed to build input stream: {error}"))?;
                stream
                    .play()
                    .map_err(|error| format!("failed to start microphone stream: {error}"))?;
                Ok((stream, sample_rate))
            })();

            match init_result {
                Ok((stream, sample_rate)) => {
                    let _ = init_tx.send(Ok(()));
                    run_consumer(sample_rate, vad, sample_rx, cmd_rx);
                    drop(stream);
                }
                Err(message) => {
                    let _ = init_tx.send(Err(message));
                }
            }
        });

        match init_rx.recv() {
            Ok(Ok(())) => {
                self.device = Some(device);
                self.cmd_tx = Some(cmd_tx);
                self.worker_handle = Some(worker);
                self.stream_error = Some(stream_error);
                Ok(())
            }
            Ok(Err(message)) => {
                let _ = worker.join();
                Err(map_capture_error(&message))
            }
            Err(error) => {
                let _ = worker.join();
                Err(SttError::RuntimeFailed(format!(
                    "failed to initialize microphone worker: {error}"
                )))
            }
        }
    }

    pub fn start(&self) -> SttResult<()> {
        if let Some(message) = self.current_stream_error() {
            return Err(map_capture_error(&message));
        }

        let tx = self
            .cmd_tx
            .as_ref()
            .ok_or_else(|| SttError::RuntimeFailed("microphone runtime is not open".into()))?;
        tx.send(RecorderCommand::Start)
            .map_err(|error| self.map_command_channel_error(&error.to_string()))
    }

    pub fn stop(&self) -> SttResult<Vec<f32>> {
        if let Some(message) = self.current_stream_error() {
            return Err(map_capture_error(&message));
        }

        let tx = self
            .cmd_tx
            .as_ref()
            .ok_or_else(|| SttError::RuntimeFailed("microphone runtime is not open".into()))?;
        let (reply_tx, reply_rx) = mpsc::channel();
        tx.send(RecorderCommand::Stop(reply_tx))
            .map_err(|error| self.map_command_channel_error(&error.to_string()))?;
        reply_rx
            .recv()
            .map_err(|error| self.map_command_channel_error(&error.to_string()))
    }

    pub fn close(&mut self) {
        if let Some(tx) = self.cmd_tx.take() {
            let _ = tx.send(RecorderCommand::Shutdown);
        }
        if let Some(handle) = self.worker_handle.take() {
            let _ = handle.join();
        }
        self.device = None;
        self.stream_error = None;
    }

    fn current_stream_error(&self) -> Option<String> {
        self.stream_error
            .as_ref()
            .and_then(|error| error.lock().ok().and_then(|slot| slot.clone()))
    }

    fn map_command_channel_error(&self, fallback: &str) -> SttError {
        self.current_stream_error()
            .map(|message| map_capture_error(&message))
            .unwrap_or_else(|| map_capture_error(fallback))
    }
}

impl Drop for LocalAudioRuntime {
    fn drop(&mut self) {
        self.close();
    }
}

fn preferred_input_config(
    device: &Device,
) -> Result<cpal::SupportedStreamConfig, cpal::DefaultStreamConfigError> {
    device.default_input_config()
}

fn build_stream<T>(
    device: &Device,
    supported_config: &cpal::SupportedStreamConfig,
    sample_tx: mpsc::Sender<AudioChunk>,
    channels: usize,
    stream_error: Arc<Mutex<Option<String>>>,
) -> Result<cpal::Stream, cpal::BuildStreamError>
where
    T: Sample + SizedSample + Send + Copy + 'static,
    f32: FromSample<T>,
{
    let config = supported_config.config();
    let mut output = Vec::<f32>::new();
    device.build_input_stream(
        &config,
        move |data: &[T], _| {
            output.clear();
            push_mono_sample(data, channels, &mut output);
            let _ = sample_tx.send(AudioChunk::Samples(output.clone()));
        },
        move |error| record_stream_error(&stream_error, error.to_string()),
        None,
    )
}

fn build_stream_f32(
    device: &Device,
    supported_config: &cpal::SupportedStreamConfig,
    sample_tx: mpsc::Sender<AudioChunk>,
    channels: usize,
    stream_error: Arc<Mutex<Option<String>>>,
) -> Result<cpal::Stream, cpal::BuildStreamError> {
    let config = supported_config.config();
    let mut output = Vec::<f32>::new();
    device.build_input_stream(
        &config,
        move |data: &[f32], _| {
            output.clear();
            push_mono_f32(data, channels, &mut output);
            let _ = sample_tx.send(AudioChunk::Samples(output.clone()));
        },
        move |error| record_stream_error(&stream_error, error.to_string()),
        None,
    )
}

fn build_stream_i16(
    device: &Device,
    supported_config: &cpal::SupportedStreamConfig,
    sample_tx: mpsc::Sender<AudioChunk>,
    channels: usize,
    stream_error: Arc<Mutex<Option<String>>>,
) -> Result<cpal::Stream, cpal::BuildStreamError> {
    let config = supported_config.config();
    let mut output = Vec::<f32>::new();
    device.build_input_stream(
        &config,
        move |data: &[i16], _| {
            output.clear();
            push_mono_i16(data, channels, &mut output);
            let _ = sample_tx.send(AudioChunk::Samples(output.clone()));
        },
        move |error| record_stream_error(&stream_error, error.to_string()),
        None,
    )
}

fn build_stream_u16(
    device: &Device,
    supported_config: &cpal::SupportedStreamConfig,
    sample_tx: mpsc::Sender<AudioChunk>,
    channels: usize,
    stream_error: Arc<Mutex<Option<String>>>,
) -> Result<cpal::Stream, cpal::BuildStreamError> {
    let config = supported_config.config();
    let mut output = Vec::<f32>::new();
    device.build_input_stream(
        &config,
        move |data: &[u16], _| {
            output.clear();
            push_mono_u16(data, channels, &mut output);
            let _ = sample_tx.send(AudioChunk::Samples(output.clone()));
        },
        move |error| record_stream_error(&stream_error, error.to_string()),
        None,
    )
}

fn record_stream_error(stream_error: &Arc<Mutex<Option<String>>>, message: String) {
    log::error!("microphone stream error: {message}");
    if let Ok(mut slot) = stream_error.lock() {
        *slot = Some(message);
    }
}

fn run_consumer(
    input_sample_rate: u32,
    vad: Option<Arc<Mutex<Box<dyn VoiceActivityDetector>>>>,
    sample_rx: mpsc::Receiver<AudioChunk>,
    cmd_rx: mpsc::Receiver<RecorderCommand>,
) {
    let mut resampler = FrameResampler::new(
        input_sample_rate as usize,
        VAD_SAMPLE_RATE as usize,
        Duration::from_millis(30),
    );
    let mut processed_samples = Vec::<f32>::new();
    let mut recording = false;
    let mut running = true;

    while running {
        while let Ok(command) = cmd_rx.try_recv() {
            match command {
                RecorderCommand::Start => {
                    recording = true;
                    processed_samples.clear();
                    resampler = FrameResampler::new(
                        input_sample_rate as usize,
                        VAD_SAMPLE_RATE as usize,
                        Duration::from_millis(30),
                    );
                    if let Some(vad) = &vad {
                        if let Ok(mut detector) = vad.lock() {
                            detector.reset();
                        }
                    }
                }
                RecorderCommand::Stop(reply_tx) => {
                    recording = false;
                    resampler
                        .finish(|frame| handle_frame(frame, true, &vad, &mut processed_samples));
                    let _ = reply_tx.send(processed_samples.clone());
                    processed_samples.clear();
                }
                RecorderCommand::Shutdown => {
                    running = false;
                }
            }
        }

        if !running {
            break;
        }

        match sample_rx.recv_timeout(Duration::from_millis(20)) {
            Ok(AudioChunk::Samples(samples)) => {
                resampler.push(&samples, |frame| {
                    handle_frame(frame, recording, &vad, &mut processed_samples);
                });
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => break,
        }
    }
}

fn handle_frame(
    frame: &[f32],
    recording: bool,
    vad: &Option<Arc<Mutex<Box<dyn VoiceActivityDetector>>>>,
    output: &mut Vec<f32>,
) {
    if !recording {
        return;
    }

    if let Some(vad) = vad {
        let Ok(mut detector) = vad.lock() else {
            output.extend_from_slice(frame);
            return;
        };
        match detector.push_frame(frame) {
            Ok(VadFrame::Speech(samples)) => output.extend_from_slice(samples),
            Ok(VadFrame::Noise) => {}
            Err(_) => output.extend_from_slice(frame),
        }
    } else {
        output.extend_from_slice(frame);
    }
}

fn map_capture_error(message: &str) -> SttError {
    if is_microphone_access_denied(message) {
        SttError::MicDenied
    } else if is_no_input_device_error(message) {
        SttError::MicNotFound
    } else if is_closed_channel_error(message) {
        SttError::RuntimeFailed(
            "microphone recorder stopped unexpectedly; please try recording again.".to_string(),
        )
    } else {
        SttError::RuntimeFailed(message.to_string())
    }
}

fn is_closed_channel_error(message: &str) -> bool {
    let normalized = message.to_lowercase();
    normalized.contains("closed channel") || normalized.contains("channel is closed")
}

fn push_mono_sample<T>(data: &[T], channels: usize, sink: &mut Vec<f32>)
where
    T: Sample + Copy,
    f32: FromSample<T>,
{
    if channels <= 1 {
        sink.extend(data.iter().map(|sample| sample.to_sample::<f32>()));
        return;
    }

    for frame in data.chunks(channels) {
        if frame.is_empty() {
            continue;
        }
        let sum: f32 = frame.iter().map(|sample| sample.to_sample::<f32>()).sum();
        sink.push(sum / frame.len() as f32);
    }
}

fn push_mono_f32(data: &[f32], channels: usize, sink: &mut Vec<f32>) {
    push_mono_sample(data, channels, sink);
}

fn push_mono_i16(data: &[i16], channels: usize, sink: &mut Vec<f32>) {
    if channels <= 1 {
        sink.extend(
            data.iter()
                .copied()
                .map(|sample| sample as f32 / i16::MAX as f32),
        );
        return;
    }

    for frame in data.chunks(channels) {
        if frame.is_empty() {
            continue;
        }
        let sum: f32 = frame
            .iter()
            .copied()
            .map(|sample| sample as f32 / i16::MAX as f32)
            .sum();
        sink.push(sum / frame.len() as f32);
    }
}

fn push_mono_u16(data: &[u16], channels: usize, sink: &mut Vec<f32>) {
    if channels <= 1 {
        sink.extend(
            data.iter()
                .copied()
                .map(|sample| sample as f32 / u16::MAX as f32 * 2.0 - 1.0),
        );
        return;
    }

    for frame in data.chunks(channels) {
        if frame.is_empty() {
            continue;
        }
        let sum: f32 = frame
            .iter()
            .copied()
            .map(|sample| sample as f32 / u16::MAX as f32 * 2.0 - 1.0)
            .sum();
        sink.push(sum / frame.len() as f32);
    }
}

#[cfg(test)]
mod tests {
    use super::{map_capture_error, push_mono_f32, push_mono_i16, push_mono_u16};
    use crate::stt::errors::SttError;

    #[test]
    fn averages_stereo_f32() {
        let mut output = Vec::new();
        push_mono_f32(&[0.0, 1.0, -1.0, 1.0], 2, &mut output);
        assert_eq!(output, vec![0.5, 0.0]);
    }

    #[test]
    fn converts_i16_to_f32() {
        let mut output = Vec::new();
        push_mono_i16(&[i16::MAX, 0], 1, &mut output);
        assert_eq!(output[0], 1.0);
        assert_eq!(output[1], 0.0);
    }

    #[test]
    fn converts_u16_to_centered_f32() {
        let mut output = Vec::new();
        push_mono_u16(&[0, u16::MAX], 1, &mut output);
        assert_eq!(output[0], -1.0);
        assert_eq!(output[1], 1.0);
    }

    #[test]
    fn maps_device_unavailable_stream_error_to_missing_microphone() {
        let error = map_capture_error(
            "The requested device is no longer available. For example, it has been unplugged.",
        );

        assert!(matches!(error, SttError::MicNotFound));
    }

    #[test]
    fn hides_closed_channel_transport_error_from_runtime_message() {
        let error = map_capture_error("sending on a closed channel");

        match error {
            SttError::RuntimeFailed(message) => {
                assert!(!message.contains("closed channel"));
                assert!(message.contains("microphone recorder stopped unexpectedly"));
            }
            other => panic!("expected runtime failure, got {other:?}"),
        }
    }
}
