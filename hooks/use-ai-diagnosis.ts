"use client"

import { useState } from "react"
import { createMockDiagnosis, diagnoseAnswer } from "@/lib/providers/ai"
import { loadAiSettings } from "@/lib/providers/settings"
import type { AiDiagnosisRequest } from "@/lib/providers/types"

export function useAiDiagnosis() {
  const [diagnosing, setDiagnosing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [usedFallback, setUsedFallback] = useState(false)

  const diagnose = async (request: Omit<AiDiagnosisRequest, "settings">) => {
    setDiagnosing(true)
    setError(null)
    setUsedFallback(false)

    const settings = await loadAiSettings()

    try {
      return await diagnoseAnswer({ ...request, settings })
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI 诊断失败"
      setError(message)
      setUsedFallback(true)
      return createMockDiagnosis({ ...request, settings })
    } finally {
      setDiagnosing(false)
    }
  }

  return {
    diagnosing,
    error,
    usedFallback,
    diagnose,
  }
}
