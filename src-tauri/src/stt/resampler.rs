use super::errors::{SttError, SttResult};

pub fn resample_mono_to_16khz(samples: &[f32], input_sample_rate: u32) -> SttResult<Vec<f32>> {
  if samples.is_empty() {
    return Ok(Vec::new());
  }

  if input_sample_rate == 16_000 {
    return Ok(samples.to_vec());
  }

  if samples.len() == 1 {
    return Ok(vec![samples[0]]);
  }

  let ratio = 16_000_f32 / input_sample_rate as f32;
  if !(ratio.is_finite() && ratio > 0.0) {
    return Err(SttError::RuntimeFailed("invalid resample ratio".into()));
  }

  let output_len = ((samples.len() as f32) * ratio).round().max(1.0) as usize;
  let mut output = Vec::with_capacity(output_len);
  let last = samples.len() - 1;

  for index in 0..output_len {
    let position = index as f32 / ratio;
    let left = position.floor() as usize;
    let left = left.min(last);
    let right = (left + 1).min(last);
    let fraction = position - left as f32;
    let value = samples[left] + (samples[right] - samples[left]) * fraction;
    output.push(value);
  }

  Ok(output)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn keeps_audio_unchanged_when_already_16khz() {
    let samples = vec![0.1, 0.2, 0.3];
    assert_eq!(resample_mono_to_16khz(&samples, 16_000).unwrap(), samples);
  }
}

