use rubato::{FftFixedIn, Resampler};
use std::time::Duration;

const RESAMPLER_CHUNK_SIZE: usize = 1024;

pub struct FrameResampler {
    resampler: Option<FftFixedIn<f32>>,
    chunk_in: usize,
    in_buf: Vec<f32>,
    frame_samples: usize,
    pending: Vec<f32>,
}

impl FrameResampler {
    pub fn new(in_hz: usize, out_hz: usize, frame_duration: Duration) -> Self {
        let frame_samples = ((out_hz as f64 * frame_duration.as_secs_f64()).round()) as usize;
        assert!(
            frame_samples > 0,
            "frame duration must produce at least one sample"
        );
        let resampler = (in_hz != out_hz).then(|| {
            FftFixedIn::<f32>::new(in_hz, out_hz, RESAMPLER_CHUNK_SIZE, 1, 1)
                .expect("failed to create frame resampler")
        });

        Self {
            resampler,
            chunk_in: RESAMPLER_CHUNK_SIZE,
            in_buf: Vec::with_capacity(RESAMPLER_CHUNK_SIZE),
            frame_samples,
            pending: Vec::with_capacity(frame_samples),
        }
    }

    pub fn push(&mut self, mut src: &[f32], mut emit: impl FnMut(&[f32])) {
        if self.resampler.is_none() {
            self.emit_frames(src, &mut emit);
            return;
        }

        while !src.is_empty() {
            let space = self.chunk_in - self.in_buf.len();
            let take = space.min(src.len());
            self.in_buf.extend_from_slice(&src[..take]);
            src = &src[take..];

            if self.in_buf.len() == self.chunk_in {
                if let Ok(out) = self
                    .resampler
                    .as_mut()
                    .unwrap()
                    .process(&[&self.in_buf[..]], None)
                {
                    self.emit_frames(&out[0], &mut emit);
                }
                self.in_buf.clear();
            }
        }
    }

    pub fn finish(&mut self, mut emit: impl FnMut(&[f32])) {
        if let Some(resampler) = self.resampler.as_mut() {
            if !self.in_buf.is_empty() {
                self.in_buf.resize(self.chunk_in, 0.0);
                if let Ok(out) = resampler.process(&[&self.in_buf[..]], None) {
                    self.emit_frames(&out[0], &mut emit);
                }
            }
        }

        if !self.pending.is_empty() {
            self.pending.resize(self.frame_samples, 0.0);
            emit(&self.pending);
            self.pending.clear();
        }
    }

    fn emit_frames(&mut self, mut data: &[f32], emit: &mut impl FnMut(&[f32])) {
        while !data.is_empty() {
            let space = self.frame_samples - self.pending.len();
            let take = space.min(data.len());
            self.pending.extend_from_slice(&data[..take]);
            data = &data[take..];

            if self.pending.len() == self.frame_samples {
                emit(&self.pending);
                self.pending.clear();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::FrameResampler;
    use std::time::Duration;

    #[test]
    fn emits_30_ms_frames_when_input_is_already_16khz() {
        let mut resampler = FrameResampler::new(16_000, 16_000, Duration::from_millis(30));
        let input = vec![0.1; 960];
        let mut frames = Vec::new();
        resampler.push(&input, |frame| frames.push(frame.to_vec()));

        assert_eq!(frames.len(), 2);
        assert_eq!(frames[0].len(), 480);
        assert_eq!(frames[1].len(), 480);
    }

    #[test]
    fn finish_pads_partial_frame() {
        let mut resampler = FrameResampler::new(16_000, 16_000, Duration::from_millis(30));
        let input = vec![0.1; 240];
        let mut frames = Vec::new();
        resampler.push(&input, |frame| frames.push(frame.to_vec()));
        resampler.finish(|frame| frames.push(frame.to_vec()));

        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0].len(), 480);
        assert_eq!(frames[0][0], 0.1);
        assert_eq!(frames[0][239], 0.1);
        assert_eq!(frames[0][240], 0.0);
    }
}
