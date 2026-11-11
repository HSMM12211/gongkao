import type { TrainingSession, TrainingStage } from "@/lib/shenlun/types"

export function startTimedSingleSession({
  questionId,
  totalLimitSeconds,
  now,
}: {
  questionId: string
  totalLimitSeconds: number
  now: string
}): TrainingSession {
  return {
    id: crypto.randomUUID(),
    mode: "timed_single",
    questionIds: [questionId],
    startedAt: now,
    status: "running",
    totalLimitSeconds,
    stageTimings: [
      {
        stage: "reading",
        startedAt: now,
        durationSeconds: 0,
        exceeded: false,
      },
    ],
  }
}

export function transitionStage(
  session: TrainingSession,
  {
    nextStage,
    now,
    stageLimitSeconds,
  }: {
    nextStage: TrainingStage
    now: string
    stageLimitSeconds: number
  },
): TrainingSession {
  const stageTimings = [...session.stageTimings]
  const current = stageTimings[stageTimings.length - 1]
  if (!current) return session
  if (current.stage === nextStage && !current.endedAt) return session

  const durationSeconds = Math.max(0, Math.round((Date.parse(now) - Date.parse(current.startedAt)) / 1000))
  stageTimings[stageTimings.length - 1] = {
    ...current,
    endedAt: now,
    durationSeconds,
    exceeded: durationSeconds > stageLimitSeconds,
  }
  stageTimings.push({
    stage: nextStage,
    startedAt: now,
    durationSeconds: 0,
    exceeded: false,
  })
  return { ...session, stageTimings }
}

export function submitTrainingSession(session: TrainingSession, now: string): TrainingSession {
  const stageTimings = [...session.stageTimings]
  const current = stageTimings[stageTimings.length - 1]
  if (current && !current.endedAt) {
    const durationSeconds = Math.max(0, Math.round((Date.parse(now) - Date.parse(current.startedAt)) / 1000))
    stageTimings[stageTimings.length - 1] = {
      ...current,
      endedAt: now,
      durationSeconds,
    }
  }
  return {
    ...session,
    status: "submitted",
    endedAt: now,
    stageTimings,
  }
}

export function abandonTrainingSession(session: TrainingSession, now: string): TrainingSession {
  return {
    ...submitTrainingSession(session, now),
    status: "abandoned",
  }
}
