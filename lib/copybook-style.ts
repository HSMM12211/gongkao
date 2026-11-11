export const STROKE_WEIGHT_MIN = 0
export const STROKE_WEIGHT_MAX = 6
export const STROKE_WEIGHT_STEP = 0.5

type TraceTextStyle = {
  opacity: number
  color: string
  fontSize: string
  fontWeight: number
  WebkitTextStrokeWidth: string
  WebkitTextStrokeColor: string
  textShadow: string
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function getTraceTextStyle(traceOpacity: number, strokeWeight: number): TraceTextStyle {
  const weight = clamp(strokeWeight, STROKE_WEIGHT_MIN, STROKE_WEIGHT_MAX)
  const fontSize = 20 + Math.min(2, weight * 0.5)
  const strokeWidth = weight <= 2 ? 0 : Number(((weight - 2) * 0.1).toFixed(2))
  const shadowOffset = weight <= 3 ? 0 : Number(((weight - 3) * 0.06).toFixed(2))

  return {
    opacity: traceOpacity,
    color: "#b3b3b3",
    fontSize: `${fontSize}pt`,
    fontWeight: Math.round(100 + weight * 70),
    WebkitTextStrokeWidth: `${strokeWidth}px`,
    WebkitTextStrokeColor: "currentColor",
    textShadow:
      shadowOffset === 0
        ? "none"
        : `${shadowOffset}px 0 currentColor, -${shadowOffset}px 0 currentColor, 0 ${shadowOffset}px currentColor, 0 -${shadowOffset}px currentColor`,
  }
}
