use super::{VadFrame, VoiceActivityDetector};
use crate::stt::errors::SttResult;

pub struct EnergyVad {
    threshold: f32,
}

impl EnergyVad {
    pub fn new(threshold: f32) -> Self {
        Self { threshold }
    }
}

impl VoiceActivityDetector for EnergyVad {
    fn push_frame<'a>(&'a mut self, frame: &'a [f32]) -> SttResult<VadFrame<'a>> {
        if frame.is_empty() {
            return Ok(VadFrame::Noise);
        }

        let rms =
            (frame.iter().map(|sample| sample * sample).sum::<f32>() / frame.len() as f32).sqrt();
        if rms >= self.threshold {
            Ok(VadFrame::Speech(frame))
        } else {
            Ok(VadFrame::Noise)
        }
    }

    fn reset(&mut self) {}
}

#[cfg(test)]
mod tests {
    use super::EnergyVad;
    use crate::stt::vad::{VadFrame, VoiceActivityDetector};

    #[test]
    fn classifies_low_energy_frames_as_noise() {
        let mut vad = EnergyVad::new(0.02);
        let frame = vec![0.001; 480];
        assert!(matches!(vad.push_frame(&frame).unwrap(), VadFrame::Noise));
    }

    #[test]
    fn classifies_louder_frames_as_speech() {
        let mut vad = EnergyVad::new(0.02);
        let frame = vec![0.08; 480];
        assert!(matches!(
            vad.push_frame(&frame).unwrap(),
            VadFrame::Speech(_)
        ));
    }
}
