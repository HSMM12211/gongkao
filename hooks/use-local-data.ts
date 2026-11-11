"use client"

import { useEffect, useState } from "react"

export function useLocalData<T>(loader: () => Promise<T>, initialValue: T) {
  const [data, setData] = useState<T>(initialValue)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const load = async () => {
      try {
        const nextData = await loader()
        if (active) setData(nextData)
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "本地数据读取失败")
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [loader])

  return { data, loading, error, setData }
}
