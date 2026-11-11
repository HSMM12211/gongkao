# Local Learning MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the A-phase MVP: a local-first single-user 公考申论 learning tool with persistent study data, review scheduling, practice attempt history, pluggable speech/AI providers, and enhanced copybook controls.

**Architecture:** Keep the current Next.js App Router application as a single local-first app. Add focused pure modules for data schema, local persistence, review scheduling, keyword scoring, speech provider adapters, and AI provider adapters; pages consume those modules through small hooks. Use IndexedDB for durable learning records and keep lightweight UI preferences in `localStorage`.

**Tech Stack:** Next.js 16, React 19, TypeScript, existing shadcn/Radix UI components, native IndexedDB, MediaRecorder API, optional OpenAI-compatible HTTP APIs, optional local services such as Ollama/Faster-Whisper, Vitest for pure module tests.

---

## Scope

This is the master MVP plan. The MVP touches multiple independent subsystems, so implementation should be split into six deliverable slices:

1. Local data foundation
2. Smart review scheduling
3. Practice attempt and AI diagnosis flow
4. Speech and AI provider abstraction
5. Copybook controls and material packaging
6. Verification, browser QA, and release hardening

Each slice should leave the app runnable and testable. Do not start with Electron/Tauri packaging in this MVP. Keep the architecture ready for a later desktop/offline phase.

## Current State

The repo is currently a single Next.js app:

- `app/page.tsx` is the dashboard.
- `app/focus/page.tsx` implements a Schulte grid focus exercise and stores a daily focus flag in `localStorage`.
- `app/review/page.tsx` shows flashcards, accepts typed input, and simulates voice input.
- `app/practice/page.tsx` shows questions, accepts typed/voice-mode answers, and simulates AI diagnosis with keyword matching.
- `app/copybook/page.tsx` lets users select static wrong records and print A4 copybook pages.
- `components/copybook-page.tsx` renders A4 grid pages from static AI answers.
- `lib/data.ts` contains hard-coded questions, flashcards, and wrong records.
- `lib/runtime-store.tsx` stores runtime/theme UI state.

## MVP Non-Goals

- No account system.
- No cloud sync.
- No separate backend service.
- No Electron/Tauri packaging yet.
- No mandatory local model installation.
- No paid API hard-coding in the repo.

## File Structure

### Create

- `lib/storage/schema.ts`  
  Owns persisted TypeScript types and constants for object store names.

- `lib/storage/idb.ts`  
  Small native IndexedDB wrapper: open DB, upgrade stores, get/put/delete/list helpers.

- `lib/storage/repositories.ts`  
  Domain-specific repository functions for review states, review events, practice attempts, copybook items, and provider settings.

- `lib/review/scheduler.ts`  
  Pure spaced-repetition scheduling functions.

- `lib/analysis/keyword-match.ts`  
  Pure keyword normalization/scoring helpers shared by review and practice pages.

- `lib/providers/types.ts`  
  Shared provider request/response types for speech and AI.

- `lib/providers/settings.ts`  
  Provider settings defaults, validation, and persistence helpers.

- `lib/providers/speech.ts`  
  Speech provider implementations: mock, API endpoint, local endpoint.

- `lib/providers/ai.ts`  
  AI provider implementations: mock, OpenAI-compatible API endpoint, Ollama/local endpoint.

- `hooks/use-local-data.ts`  
  Client-side hydration helper for repository-backed data.

- `hooks/use-speech-transcription.ts`  
  MediaRecorder and speech provider orchestration.

- `hooks/use-ai-diagnosis.ts`  
  AI provider orchestration for practice diagnosis.

- `test/lib/review/scheduler.test.ts`  
  Unit tests for spaced-repetition scheduling.

- `test/lib/analysis/keyword-match.test.ts`  
  Unit tests for keyword scoring.

- `test/lib/providers/settings.test.ts`  
  Unit tests for provider settings validation.

- `vitest.config.ts`  
  Vitest config for TypeScript pure module tests.

### Modify

- `package.json`  
  Add test scripts and dev dependencies.

- `app/page.tsx`  
  Replace static dashboard numbers with local aggregated stats where practical.

- `app/review/page.tsx`  
  Use due flashcards, real review outcomes, saved review state, and speech hook.

- `app/practice/page.tsx`  
  Save attempts, call AI diagnosis provider, create copybook candidate items from weak answers.

- `app/copybook/page.tsx`  
  Load copybook materials from persisted attempts plus seeded records; add opacity and stroke sliders.

- `components/copybook-page.tsx`  
  Accept `traceOpacity` and `strokeWeight` props and apply them to rendered trace text.

- `app/settings/page.tsx`  
  Add provider settings for speech and AI: mock/API/local modes, endpoints, model names, API key fields, and connection test buttons.

- `lib/runtime-store.tsx`  
  Keep only runtime/theme UI state or delegate provider settings to `lib/providers/settings.ts`.

- `app/globals.css`  
  Add copybook CSS variables/classes for opacity and font weight if inline styles are insufficient for print.

## Data Model

Create these persisted types in `lib/storage/schema.ts`:

```ts
export type ReviewGrade = "again" | "hard" | "good" | "easy"

export type ReviewState = {
  cardId: string
  dueAt: string
  intervalDays: number
  ease: number
  repetitions: number
  lapses: number
  updatedAt: string
}

export type ReviewEvent = {
  id: string
  cardId: string
  reviewedAt: string
  input: string
  hitCount: number
  keywordCount: number
  grade: ReviewGrade
  nextDueAt: string
}

export type PracticeAttempt = {
  id: string
  questionId: string
  createdAt: string
  mode: "type" | "voice-full" | "voice-outline"
  answer: string
  score: number
  keywordHit: number
  keywordCount: number
  diagnosis: AiDiagnosis
  copybookText: string
}

export type CopybookItem = {
  id: string
  source: "seed" | "practice-attempt" | "manual"
  sourceId: string
  title: string
  questionId?: string
  text: string
  tags: string[]
  createdAt: string
}

export type ProviderMode = "mock" | "api" | "local"

export type SpeechProviderSettings = {
  mode: ProviderMode
  apiEndpoint: string
  apiKey: string
  localEndpoint: string
}

export type AiProviderSettings = {
  mode: ProviderMode
  apiEndpoint: string
  apiKey: string
  apiModel: string
  localEndpoint: string
  localModel: string
}

export type AiDiagnosis = {
  score: number
  keywordHits: string[]
  missingKeywords: string[]
  logicIssues: string[]
  languageSuggestions: { original: string; revised: string; reason: string }[]
  modelAnswer: string
  copybookText: string
}
```

## Milestone 1: Local Data Foundation

### Task 1: Add Test Harness

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `test/lib/analysis/keyword-match.test.ts`

- [ ] **Step 1: Add test scripts to `package.json`**

Add:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^3.2.4"
  }
}
```

Preserve existing scripts and dependencies.

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
})
```

- [ ] **Step 3: Create a failing keyword test**

```ts
import { describe, expect, it } from "vitest"
import { scoreKeywords } from "@/lib/analysis/keyword-match"

describe("scoreKeywords", () => {
  it("counts exact keyword hits and misses", () => {
    const result = scoreKeywords("要夯实基础设施，提升数字素养。", [
      "夯实基础设施",
      "提升数字素养",
      "打破数据壁垒",
    ])

    expect(result.hitCount).toBe(2)
    expect(result.keywordCount).toBe(3)
    expect(result.hits).toEqual(["夯实基础设施", "提升数字素养"])
    expect(result.misses).toEqual(["打破数据壁垒"])
    expect(result.ratio).toBeCloseTo(2 / 3)
  })
})
```

- [ ] **Step 4: Run failing test**

Run: `pnpm test`

Expected: FAIL because `@/lib/analysis/keyword-match` does not exist.

### Task 2: Add Keyword Scoring Module

**Files:**
- Create: `lib/analysis/keyword-match.ts`
- Test: `test/lib/analysis/keyword-match.test.ts`

- [ ] **Step 1: Implement `scoreKeywords`**

```ts
export type KeywordScore = {
  hits: string[]
  misses: string[]
  hitCount: number
  keywordCount: number
  ratio: number
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase()
}

export function scoreKeywords(input: string, keywords: string[]): KeywordScore {
  const normalizedInput = normalizeText(input)
  const hits: string[] = []
  const misses: string[] = []

  for (const keyword of keywords) {
    const normalizedKeyword = normalizeText(keyword)
    if (normalizedKeyword && normalizedInput.includes(normalizedKeyword)) {
      hits.push(keyword)
    } else {
      misses.push(keyword)
    }
  }

  return {
    hits,
    misses,
    hitCount: hits.length,
    keywordCount: keywords.length,
    ratio: keywords.length === 0 ? 0 : hits.length / keywords.length,
  }
}
```

- [ ] **Step 2: Run keyword tests**

Run: `pnpm test -- test/lib/analysis/keyword-match.test.ts`

Expected: PASS.

### Task 3: Add Storage Schema and IndexedDB Wrapper

**Files:**
- Create: `lib/storage/schema.ts`
- Create: `lib/storage/idb.ts`
- Create: `lib/storage/repositories.ts`

- [ ] **Step 1: Create schema constants and types**

Use the data model from this plan and export:

```ts
export const DB_NAME = "shenlun-local-mvp"
export const DB_VERSION = 1

export const STORES = {
  reviewStates: "reviewStates",
  reviewEvents: "reviewEvents",
  practiceAttempts: "practiceAttempts",
  copybookItems: "copybookItems",
  providerSettings: "providerSettings",
} as const
```

- [ ] **Step 2: Create native IndexedDB helpers**

Implement:

```ts
export async function getItem<T>(storeName: StoreName, key: IDBValidKey): Promise<T | undefined>
export async function putItem<T>(storeName: StoreName, value: T, key?: IDBValidKey): Promise<void>
export async function deleteItem(storeName: StoreName, key: IDBValidKey): Promise<void>
export async function listItems<T>(storeName: StoreName): Promise<T[]>
```

Object stores:

- `reviewStates`: keyPath `cardId`
- `reviewEvents`: keyPath `id`
- `practiceAttempts`: keyPath `id`
- `copybookItems`: keyPath `id`
- `providerSettings`: keyPath `id`

- [ ] **Step 3: Create repository functions**

Implement named functions:

```ts
export const reviewRepository = {
  getStates: () => listItems<ReviewState>(STORES.reviewStates),
  saveState: (state: ReviewState) => putItem(STORES.reviewStates, state),
  saveEvent: (event: ReviewEvent) => putItem(STORES.reviewEvents, event),
  getEvents: () => listItems<ReviewEvent>(STORES.reviewEvents),
}

export const practiceRepository = {
  getAttempts: () => listItems<PracticeAttempt>(STORES.practiceAttempts),
  saveAttempt: (attempt: PracticeAttempt) => putItem(STORES.practiceAttempts, attempt),
}

export const copybookRepository = {
  getItems: () => listItems<CopybookItem>(STORES.copybookItems),
  saveItem: (item: CopybookItem) => putItem(STORES.copybookItems, item),
  deleteItem: (id: string) => deleteItem(STORES.copybookItems, id),
}
```

- [ ] **Step 4: Verify build types**

Run: `pnpm build`

Expected: PASS or only existing unrelated Next/font network issues. If Next/font fails due network, run `pnpm lint` and document the build blocker.

## Milestone 2: Smart Review Scheduling

### Task 4: Add Scheduler Tests and Pure Scheduler

**Files:**
- Create: `test/lib/review/scheduler.test.ts`
- Create: `lib/review/scheduler.ts`

- [ ] **Step 1: Write scheduler tests**

```ts
import { describe, expect, it } from "vitest"
import { scheduleReview } from "@/lib/review/scheduler"

describe("scheduleReview", () => {
  it("schedules a new good review for tomorrow", () => {
    const now = new Date("2026-05-21T08:00:00.000Z")
    const next = scheduleReview(undefined, "good", now)

    expect(next.intervalDays).toBe(1)
    expect(next.repetitions).toBe(1)
    expect(next.lapses).toBe(0)
    expect(next.dueAt).toBe("2026-05-22T08:00:00.000Z")
  })

  it("resets interval when graded again", () => {
    const now = new Date("2026-05-21T08:00:00.000Z")
    const next = scheduleReview(
      {
        cardId: "f1",
        dueAt: "2026-05-21T08:00:00.000Z",
        intervalDays: 6,
        ease: 2.5,
        repetitions: 3,
        lapses: 0,
        updatedAt: "2026-05-20T08:00:00.000Z",
      },
      "again",
      now,
    )

    expect(next.intervalDays).toBe(0)
    expect(next.lapses).toBe(1)
    expect(next.dueAt).toBe("2026-05-21T08:10:00.000Z")
  })
})
```

- [ ] **Step 2: Implement scheduler**

Rules:

- `again`: due in 10 minutes, interval `0`, ease minus `0.2`, lapses plus `1`.
- `hard`: due tomorrow, interval at least `1`, ease minus `0.1`.
- `good`: new card due tomorrow; reviewed card interval roughly doubles.
- `easy`: new card due in 3 days; reviewed card interval roughly triples, ease plus `0.15`.
- Minimum ease: `1.3`.

- [ ] **Step 3: Run scheduler tests**

Run: `pnpm test -- test/lib/review/scheduler.test.ts`

Expected: PASS.

### Task 5: Convert Review Page to Due-Card Workflow

**Files:**
- Modify: `app/review/page.tsx`
- Modify: `lib/data.ts` only if seed data needs richer fields

- [ ] **Step 1: Load review states on mount**

Use `reviewRepository.getStates()` and derive due cards:

```ts
const dueCards = FLASHCARDS.filter((card) => {
  const state = stateByCardId.get(card.id)
  return !state || new Date(state.dueAt).getTime() <= Date.now()
})
```

- [ ] **Step 2: Replace plain next button with review grades**

Add four buttons after answer reveal:

- `忘了`: grade `again`
- `吃力`: grade `hard`
- `记住`: grade `good`
- `熟练`: grade `easy`

- [ ] **Step 3: Persist review event and state**

On grade click:

```ts
const nextState = scheduleReview(currentState, grade, new Date())
await reviewRepository.saveState({ ...nextState, cardId: card.id })
await reviewRepository.saveEvent({
  id: crypto.randomUUID(),
  cardId: card.id,
  reviewedAt: new Date().toISOString(),
  input,
  hitCount,
  keywordCount: card.keywords.length,
  grade,
  nextDueAt: nextState.dueAt,
})
```

- [ ] **Step 4: Show empty state**

When no cards are due, show:

- due count `0`
- next due time from the earliest review state
- button to review all cards manually

- [ ] **Step 5: Run verification**

Run:

- `pnpm test`
- `pnpm lint`
- `pnpm build`

Expected: all pass or documented build blocker.

## Milestone 3: Practice Attempts and AI Diagnosis Flow

### Task 6: Extract Practice Attempt Creation

**Files:**
- Modify: `app/practice/page.tsx`
- Modify: `lib/storage/schema.ts`
- Modify: `lib/storage/repositories.ts`

- [ ] **Step 1: Save every submitted answer**

After scoring/diagnosis, create a `PracticeAttempt` with:

- `questionId`
- `mode`
- raw `answer`
- `score`
- `keywordHit`
- `keywordCount`
- `diagnosis`
- `copybookText`

- [ ] **Step 2: Create a copybook item when score is below 80**

Rule:

```ts
if (attempt.score < 80) {
  await copybookRepository.saveItem({
    id: crypto.randomUUID(),
    source: "practice-attempt",
    sourceId: attempt.id,
    title: q.title,
    questionId: q.id,
    text: attempt.copybookText || attempt.diagnosis.modelAnswer,
    tags: ["本周错题", q.type, "AI精修"],
    createdAt: attempt.createdAt,
  })
}
```

- [ ] **Step 3: Show save status**

After submit, show a small badge:

- `已保存到练习记录`
- If score below 80: `已加入字帖素材`

- [ ] **Step 4: Run verification**

Run: `pnpm lint && pnpm build`

Expected: PASS.

## Milestone 4: Speech and AI Provider Abstraction

### Task 7: Add Provider Settings

**Files:**
- Create: `lib/providers/types.ts`
- Create: `lib/providers/settings.ts`
- Create: `test/lib/providers/settings.test.ts`
- Modify: `app/settings/page.tsx`

- [ ] **Step 1: Define provider settings types**

Use the `SpeechProviderSettings` and `AiProviderSettings` shapes from this plan.

- [ ] **Step 2: Add defaults**

```ts
export const DEFAULT_SPEECH_SETTINGS: SpeechProviderSettings = {
  mode: "mock",
  apiEndpoint: "",
  apiKey: "",
  localEndpoint: "http://127.0.0.1:8001/transcribe",
}

export const DEFAULT_AI_SETTINGS: AiProviderSettings = {
  mode: "mock",
  apiEndpoint: "",
  apiKey: "",
  apiModel: "gpt-4.1-mini",
  localEndpoint: "http://127.0.0.1:11434/api/chat",
  localModel: "qwen2.5",
}
```

- [ ] **Step 3: Add validation tests**

Test cases:

- mock mode is valid with empty endpoints.
- api mode requires `apiEndpoint`.
- local mode requires `localEndpoint`.

- [ ] **Step 4: Extend settings page**

Add two cards:

- `语音识别`
  - mode select: `模拟 / API / 本地服务`
  - API endpoint input
  - API key password input
  - local endpoint input

- `AI 精修`
  - mode select: `模拟 / OpenAI兼容 API / 本地 Ollama`
  - API endpoint input
  - API model input
  - API key password input
  - local endpoint input
  - local model input

Store settings locally through `providerSettingsRepository`.

### Task 8: Replace Simulated Voice with Speech Hook

**Files:**
- Create: `hooks/use-speech-transcription.ts`
- Create: `lib/providers/speech.ts`
- Modify: `app/review/page.tsx`
- Modify: `app/practice/page.tsx`

- [ ] **Step 1: Implement mock provider**

Mock provider returns deterministic text:

```ts
export async function transcribeWithMock(seedText: string): Promise<TranscriptionResult> {
  return {
    text: seedText,
    provider: "mock",
    durationMs: 0,
  }
}
```

- [ ] **Step 2: Implement API provider**

Browser posts `FormData`:

```ts
const form = new FormData()
form.append("file", audioBlob, "speech.webm")
const res = await fetch(settings.apiEndpoint, {
  method: "POST",
  headers: settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : undefined,
  body: form,
})
```

Expected response shape:

```ts
{ "text": "转写后的文本" }
```

- [ ] **Step 3: Implement local provider**

Use the same `FormData` request to `settings.localEndpoint`. This allows a later Faster-Whisper local service without changing UI code.

- [ ] **Step 4: Implement hook states**

Hook returns:

```ts
{
  recording: boolean
  transcribing: boolean
  error: string | null
  startRecording: () => Promise<void>
  stopRecording: () => Promise<string>
}
```

- [ ] **Step 5: Wire review and practice pages**

Replace simulated append text with returned transcription text. Show error toast when microphone permission or provider call fails.

### Task 9: Add AI Diagnosis Provider

**Files:**
- Create: `hooks/use-ai-diagnosis.ts`
- Create: `lib/providers/ai.ts`
- Modify: `app/practice/page.tsx`

- [ ] **Step 1: Implement mock AI provider**

Mock provider wraps current deterministic keyword scoring and static answer into `AiDiagnosis`.

- [ ] **Step 2: Implement API provider**

Accept OpenAI-compatible endpoint and send:

```ts
{
  "model": settings.apiModel,
  "messages": [
    { "role": "system", "content": "你是公考申论批改老师，只返回 JSON。" },
    { "role": "user", "content": promptText }
  ],
  "temperature": 0.2
}
```

Require JSON fields:

```json
{
  "score": 78,
  "keywordHits": ["夯实基础设施"],
  "missingKeywords": ["打破数据壁垒"],
  "logicIssues": ["对策层次不完整"],
  "languageSuggestions": [
    { "original": "搞建设", "revised": "推进建设", "reason": "表达更规范" }
  ],
  "modelAnswer": "满分示范答案",
  "copybookText": "适合临摹的高分表达"
}
```

- [ ] **Step 3: Implement local Ollama provider**

Post to `settings.localEndpoint` with:

```ts
{
  "model": settings.localModel,
  "stream": false,
  "messages": [
    { "role": "system", "content": "你是公考申论批改老师，只返回 JSON。" },
    { "role": "user", "content": promptText }
  ]
}
```

- [ ] **Step 4: Validate AI response**

If provider returns invalid JSON, show a toast and fall back to mock diagnosis for display. Save the fallback result with a visible `AI结果解析失败，已使用本地规则评分` message.

## Milestone 5: Copybook Material Packaging and Controls

### Task 10: Add Copybook Sliders

**Files:**
- Modify: `app/copybook/page.tsx`
- Modify: `components/copybook-page.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Add state to copybook page**

```ts
const [traceOpacity, setTraceOpacity] = useState(0.35)
const [strokeWeight, setStrokeWeight] = useState(2)
```

- [ ] **Step 2: Add two sliders to the parameter panel**

Use existing `components/ui/slider.tsx`.

- 描红透明度: min `0.1`, max `1`, step `0.05`, default `0.35`
- 笔画粗细: min `1`, max `5`, step `1`, default `2`

- [ ] **Step 3: Pass props to every preview/print page**

```tsx
<CopybookPage
  question={r.question}
  aiAnswerText={r.question.aiAnswer}
  font={font}
  theme={theme}
  traceMode={traceMode}
  traceOpacity={traceOpacity}
  strokeWeight={strokeWeight}
/>
```

- [ ] **Step 4: Apply props in `components/copybook-page.tsx`**

Extend props:

```ts
traceOpacity: number
strokeWeight: number
```

Apply:

```tsx
<span
  className="trace-text"
  style={{
    opacity: traceOpacity,
    fontWeight: 300 + strokeWeight * 100,
    WebkitTextStrokeWidth: `${Math.max(0, strokeWeight - 2) * 0.2}px`,
  }}
>
  {ch}
</span>
```

- [ ] **Step 5: Verify print preview**

Run app, open `/copybook`, change both sliders, trigger print preview, confirm preview and print area match.

### Task 11: Load Copybook Items from Saved Attempts

**Files:**
- Modify: `app/copybook/page.tsx`
- Modify: `lib/data.ts` only for seeded fallback records
- Modify: `lib/storage/repositories.ts`

- [ ] **Step 1: Load persisted copybook items on mount**

Map persisted `CopybookItem` records to shelf rows. Keep `WRONG_RECORDS` as seed examples only when IndexedDB has no saved items.

- [ ] **Step 2: Add item source labels**

Show one of:

- `示例素材`
- `练习错题`
- `手动加入`

- [ ] **Step 3: Preserve filtering**

Existing tag filters should work against persisted `tags`.

- [ ] **Step 4: Verify generated copybook text**

Submit a low-score practice answer, navigate to `/copybook`, confirm the new item is available and printable.

## Milestone 6: Dashboard and Verification

### Task 12: Dashboard Local Stats

**Files:**
- Modify: `app/page.tsx`
- Modify: `lib/storage/repositories.ts` if aggregate helpers are useful

- [ ] **Step 1: Load local aggregates**

Display:

- due review count
- practice attempts this week
- latest average keyword hit ratio
- copybook item count
- focus buff status from existing `localStorage`

- [ ] **Step 2: Keep fallback values stable**

If IndexedDB is empty, show zeros and the existing entry cards. Do not block rendering while data loads.

- [ ] **Step 3: Verify empty and non-empty states**

Clear browser storage, verify dashboard empty state. Then perform one review and one practice attempt, verify numbers update after refresh.

### Task 13: End-to-End Manual QA

**Files:**
- No code unless defects are found.

- [ ] **Step 1: Run static verification**

Run:

```powershell
pnpm test
pnpm lint
pnpm build
```

Expected: all pass.

- [ ] **Step 2: Run local dev server**

Run:

```powershell
pnpm dev
```

Open the shown local URL.

- [ ] **Step 3: Manual workflow**

Verify this exact flow:

1. Enter `/focus`, complete one Schulte grid, confirm dashboard shows focus buff.
2. Enter `/review`, answer a due card, reveal answer, grade it, refresh, confirm it is no longer immediately due.
3. Enter `/settings`, switch speech mode to mock, save settings.
4. Enter `/practice`, submit a weak typed answer, confirm AI diagnosis renders and attempt is saved.
5. Enter `/copybook`, confirm the weak attempt appears as a selectable item.
6. Adjust 描红透明度 and 笔画粗细 sliders, confirm A4 preview updates.
7. Trigger print preview, confirm selected copybook pages render.

- [ ] **Step 4: Browser persistence check**

Refresh after each module. Confirm data persists without a server.

## Development Order

Recommended order:

1. Milestone 1: local data foundation
2. Milestone 2: review scheduling
3. Milestone 5 Task 10: copybook sliders, because it is isolated and immediately useful
4. Milestone 3: practice attempts
5. Milestone 4: provider abstraction
6. Milestone 5 Task 11: copybook materials from attempts
7. Milestone 6: dashboard and QA

## Acceptance Criteria

The MVP is complete when:

- The app runs as a local Next.js app without a separate backend.
- Review progress persists after refresh.
- Review cards are scheduled by due time instead of only cycling through a static list.
- Practice submissions are saved locally.
- Weak practice attempts can become copybook materials.
- Speech input supports mock, API endpoint, and local endpoint modes through one hook.
- AI diagnosis supports mock, API endpoint, and local Ollama-compatible modes through one hook.
- Copybook preview supports 描红透明度 and 笔画粗细 sliders.
- `pnpm test`, `pnpm lint`, and `pnpm build` pass or any environmental blocker is documented with exact output.

## Risks and Decisions

- API keys in a pure frontend app are visible to the local user and browser runtime. For A-phase local single-user MVP, this is acceptable only for user-entered keys stored locally. Do not commit keys or defaults.
- Local speech recognition should be treated as a local HTTP service in A phase. Packaging Faster-Whisper belongs to the later desktop/offline phase.
- Native IndexedDB avoids a dependency, but repository code must stay small. If repository code becomes complex, switch to Dexie in a separate plan.
- AI JSON output can fail. Always validate provider output and keep deterministic mock diagnosis as fallback.

## Follow-Up Desktop Phase

After this MVP is stable, create a separate C-phase plan for:

- Electron or Tauri shell
- SQLite persistence
- local model lifecycle and health checks
- packaged Faster-Whisper integration
- secure key storage
- Electron `printToPDF` high-definition export
- installer and Windows compatibility testing
