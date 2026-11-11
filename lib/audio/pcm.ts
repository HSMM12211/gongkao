export function downsampleFloat32(input: Float32Array, inputSampleRate: number, outputSampleRate: number) {
  if (inputSampleRate <= 0 || outputSampleRate <= 0) {
    throw new Error("Sample rates must be positive")
  }

  if (outputSampleRate === inputSampleRate) return input

  if (outputSampleRate > inputSampleRate) {
    throw new Error("Output sample rate cannot exceed input sample rate")
  }

  const ratio = inputSampleRate / outputSampleRate
  const outputLength = Math.floor(input.length / ratio)
  const output = new Float32Array(outputLength)

  for (let i = 0; i < outputLength; i++) {
    const start = Math.floor(i * ratio)
    const end = Math.min(Math.floor((i + 1) * ratio), input.length)
    let sum = 0
    for (let j = start; j < end; j++) sum += input[j] ?? 0
    output[i] = sum / Math.max(1, end - start)
  }

  return output
}

export function floatToPcm16(input: Float32Array) {
  const output = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const sample = Math.max(-1, Math.min(1, input[i] ?? 0))
    output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
  }
  return output
}

export function pcm16ToArrayBuffer(input: Int16Array): ArrayBuffer {
  const output = new ArrayBuffer(input.byteLength)
  new Uint8Array(output).set(new Uint8Array(input.buffer, input.byteOffset, input.byteLength))
  return output
}
