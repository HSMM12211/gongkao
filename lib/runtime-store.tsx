"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import {
  DEFAULT_AGENT_ADAPTER_STATUSES,
  DEFAULT_AGENT_EXECUTOR_SETTINGS,
  type AgentAdapterStatus,
  type AgentExecutorSettings,
} from "@/types/agent-executor"
import type { DetectedAgentAdapter } from "@/types/agent-runtime"
import { mergeDetectedAgentAdapters } from "@/lib/agent/capabilities"
import {
  loadAgentExecutorSettings,
  normalizeAgentExecutorSettings,
  saveAgentExecutorSettings,
} from "@/lib/agent/executor-settings"
import { loadTauriAgentRuntime } from "@/lib/agent/material-run"

export type Runtime = "cloud" | "local"

interface RuntimeState {
  runtime: Runtime
  setRuntime: (r: Runtime) => void
  themeColor: string
  setThemeColor: (hex: string) => void
  agentExecutor: AgentExecutorSettings
  setAgentExecutor: (settings: AgentExecutorSettings) => void
  agentAdapters: AgentAdapterStatus[]
  agentAdaptersChecking: boolean
  refreshAgentAdapters: () => Promise<void>
}

const DEFAULT_THEME = "#1f5f5b"

const RuntimeCtx = createContext<RuntimeState | null>(null)

// hex(#rrggbb) -> "r g b"
function hexToRgbTriplet(hex: string): string | null {
  const m = /^#?([a-f\d]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = Number.parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `${r} ${g} ${b}`
}

export function RuntimeProvider({ children }: { children: ReactNode }) {
  const [runtime, setRuntime] = useState<Runtime>("cloud")
  const [themeColor, setThemeColor] = useState<string>(DEFAULT_THEME)
  const [agentExecutor, setAgentExecutorState] = useState<AgentExecutorSettings>(DEFAULT_AGENT_EXECUTOR_SETTINGS)
  const [agentAdapters, setAgentAdapters] = useState<AgentAdapterStatus[]>(DEFAULT_AGENT_ADAPTER_STATUSES)
  const [agentAdaptersChecking, setAgentAdaptersChecking] = useState(false)

  // hydrate from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return
    const saved = window.localStorage.getItem("app.themeColor")
    if (saved) setThemeColor(saved)
    setAgentExecutorState(loadAgentExecutorSettings())
  }, [])

  const refreshAgentAdapters = async () => {
    setAgentAdaptersChecking(true)
    try {
      const detected = await detectAgentAdapters()
      setAgentAdapters(mergeDetectedAgentAdapters(DEFAULT_AGENT_ADAPTER_STATUSES, detected))
    } catch {
      setAgentAdapters(DEFAULT_AGENT_ADAPTER_STATUSES)
    } finally {
      setAgentAdaptersChecking(false)
    }
  }

  useEffect(() => {
    void refreshAgentAdapters()
  }, [])

  const setAgentExecutor = (settings: AgentExecutorSettings) => {
    const normalized = normalizeAgentExecutorSettings(settings)
    setAgentExecutorState(normalized)
    saveAgentExecutorSettings(normalized)
  }

  // persist + apply CSS variables
  useEffect(() => {
    if (typeof document === "undefined") return
    window.localStorage.setItem("app.themeColor", themeColor)
    const triplet = hexToRgbTriplet(themeColor)
    const root = document.documentElement
    // override primary tokens (keep existing palette as default, just shift primary hue)
    root.style.setProperty("--primary", themeColor)
    root.style.setProperty("--ring", themeColor)
    root.style.setProperty("--sidebar-primary", themeColor)
    if (triplet) {
      root.style.setProperty("--primary-rgb", triplet)
    }
  }, [themeColor])

  return (
    <RuntimeCtx.Provider
      value={{
        runtime,
        setRuntime,
        themeColor,
        setThemeColor,
        agentExecutor,
        setAgentExecutor,
        agentAdapters,
        agentAdaptersChecking,
        refreshAgentAdapters,
      }}
    >
      {children}
    </RuntimeCtx.Provider>
  )
}

export function useRuntime() {
  const ctx = useContext(RuntimeCtx)
  if (!ctx) throw new Error("useRuntime must be used within RuntimeProvider")
  return ctx
}

async function detectAgentAdapters(): Promise<DetectedAgentAdapter[]> {
  try {
    const agentRuntime = await loadTauriAgentRuntime()
    return await agentRuntime.detectAdapters()
  } catch {
    return detectAgentAdaptersFromLocalApi()
  }
}

async function detectAgentAdaptersFromLocalApi(): Promise<DetectedAgentAdapter[]> {
  if (typeof window === "undefined") return []
  const response = await fetch("/api/agent/adapters", { cache: "no-store" })
  if (!response.ok) return []
  const detected = (await response.json()) as unknown
  return Array.isArray(detected) ? (detected as DetectedAgentAdapter[]) : []
}
