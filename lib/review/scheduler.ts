import type { ReviewGrade, ReviewState } from "@/lib/storage/schema"

const MIN_EASE = 1.3
const DEFAULT_EASE = 2.5

function addDays(date: Date, days: number): string {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString()
}

function addMinutes(date: Date, minutes: number): string {
  const next = new Date(date)
  next.setUTCMinutes(next.getUTCMinutes() + minutes)
  return next.toISOString()
}

function clampEase(ease: number) {
  return Math.max(MIN_EASE, Number(ease.toFixed(2)))
}

export function scheduleReview(
  current: ReviewState | undefined,
  grade: ReviewGrade,
  now = new Date(),
): Omit<ReviewState, "cardId"> {
  const ease = current?.ease ?? DEFAULT_EASE
  const intervalDays = current?.intervalDays ?? 0
  const repetitions = current?.repetitions ?? 0
  const lapses = current?.lapses ?? 0

  if (grade === "again") {
    return {
      dueAt: addMinutes(now, 10),
      intervalDays: 0,
      ease: clampEase(ease - 0.2),
      repetitions,
      lapses: lapses + 1,
      updatedAt: now.toISOString(),
    }
  }

  if (grade === "hard") {
    return {
      dueAt: addDays(now, 1),
      intervalDays: Math.max(1, intervalDays),
      ease: clampEase(ease - 0.1),
      repetitions: repetitions + 1,
      lapses,
      updatedAt: now.toISOString(),
    }
  }

  if (grade === "easy") {
    const nextInterval = intervalDays === 0 ? 3 : Math.max(3, Math.round(intervalDays * 3))
    return {
      dueAt: addDays(now, nextInterval),
      intervalDays: nextInterval,
      ease: clampEase(ease + 0.15),
      repetitions: repetitions + 1,
      lapses,
      updatedAt: now.toISOString(),
    }
  }

  const nextInterval = intervalDays === 0 ? 1 : Math.max(1, Math.round(intervalDays * 2))
  return {
    dueAt: addDays(now, nextInterval),
    intervalDays: nextInterval,
    ease: clampEase(ease),
    repetitions: repetitions + 1,
    lapses,
    updatedAt: now.toISOString(),
  }
}
