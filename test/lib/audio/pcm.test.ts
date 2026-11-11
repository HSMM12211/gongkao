import { describe, expect, it } from "vitest"
import { downsampleFloat32, floatToPcm16, pcm16ToArrayBuffer } from "@/lib/audio/pcm"

describe("pcm audio helpers", () => {
  it("converts float samples to signed 16-bit pcm", () => {
    const pcm = floatToPcm16(new Float32Array([-1, 0, 1]))
    expect([...pcm]).toEqual([-32768, 0, 32767])
  })

  it("downsamples by preserving approximate duration", () => {
    const input = new Float32Array(48_000).fill(0.25)
    const output = downsampleFloat32(input, 48_000, 16_000)
    expect(output.length).toBe(16_000)
    expect(output[0]).toBeCloseTo(0.25)
  })

  it("returns a tightly sliced array buffer for pcm data", () => {
    const source = new Int16Array([1, 2, 3, 4])
    const view = source.subarray(1, 3)
    const buffer = pcm16ToArrayBuffer(view)
    expect([...new Int16Array(buffer)]).toEqual([2, 3])
  })
})
