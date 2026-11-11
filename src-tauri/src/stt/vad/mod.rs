pub mod energy;
pub mod smoothed;

use super::errors::SttResult;

pub const VAD_SAMPLE_RATE: u32 = 16_000;

pub enum VadFrame<'a> {
    Speech(&'a [f32]),
    Noise,
}

pub trait VoiceActivityDetector: Send {
    fn push_frame<'a>(&'a mut self, frame: &'a [f32]) -> SttResult<VadFrame<'a>>;

    fn is_voice(&mut self, frame: &[f32]) -> SttResult<bool> {
        Ok(matches!(self.push_frame(frame)?, VadFrame::Speech(_)))
    }

    fn reset(&mut self);
}
