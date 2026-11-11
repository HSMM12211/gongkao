# Gongkao CLI Skill Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate open-design's local CLI-agent + `SKILL.md` paradigm into this Gongkao desktop app so Codex CLI and Claude Code can collect, parse, and structure public-exam materials, while the app keeps validation, review, and final local knowledge-base writes.

**Architecture:** Do not copy open-design's Node daemon wholesale. This app is a Next.js + Tauri desktop app, so the CLI runtime belongs in the Tauri/Rust backend: Rust detects Codex/Claude, stages skills into an isolated run workspace, spawns the chosen CLI with stdin prompts, streams events to React, and exposes final output files. The frontend execution environment is global and owned by the topbar Agent menu from `docs/superpowers/plans/2026-05-26-agent-frontend-alignment.md`; Materials only passes the selected adapter/model/reasoning plus the material task into this backend. React/TypeScript validates `material-draft.json`, shows an inbox preview, then writes into the existing IndexedDB material stores only after user confirmation.

**Tech Stack:** Next.js 16, React 19, TypeScript, Zod, IndexedDB, Tauri 2, Rust `std::process::Command`, `serde`, `serde_json`, `uuid`, Vitest, Rust unit tests.

---

## Source Reading Summary

The requested `gsd-map-codebase` skill folder exists locally under `.codex/skills/gsd-map-codebase`, but it is not exposed in this session's registered skill list. Source mapping was therefore done with local `rg` and focused reads.

Key open-design files and portable ideas:

- `docs/open-design-main/docs/agent-adapters.md`: the core thesis is to delegate the full agent loop to existing user CLI agents. The host app detects agents, feeds skill + prompt + working directory, and streams output back.
- `docs/open-design-main/docs/skills-protocol.md`: a skill is a folder with `SKILL.md`, optional `assets/`, `references/`, and optional frontmatter extensions.
- `docs/open-design-main/apps/daemon/src/runtimes/defs/codex.ts`: Codex runs as `codex exec --json --skip-git-repo-check`, with prompt over stdin and `-C <cwd>`.
- `docs/open-design-main/apps/daemon/src/runtimes/defs/claude.ts`: Claude Code runs as `claude -p --input-format stream-json --output-format stream-json --verbose`, with prompt over stdin and optional `--add-dir`.
- `docs/open-design-main/apps/daemon/src/cwd-aliases.ts`: active skill side files are copied into the run cwd rather than symlinked, preventing agents from mutating the source skill.
- `docs/open-design-main/apps/daemon/src/json-event-stream.ts` and `docs/open-design-main/apps/daemon/src/claude-stream.ts`: normalize CLI JSON streams into common events.
- `docs/open-design-main/apps/daemon/src/runs.ts`: run state is event-driven and cancellable.

Existing Gongkao integration points:

- `app/materials/page.tsx` already has the user-facing material import screen.
- `lib/material/types.ts` defines `MaterialDraft`, `MaterialFileInput`, and `MaterialImportBundle`.
- `lib/material/processor.ts` already validates a material draft and converts it into an import bundle.
- `lib/storage/schema.ts`, `lib/storage/repositories.ts`, and `lib/storage/idb.ts` already persist local material sources, flashcards, questions, and copybook items.
- `src-tauri/src/main.rs` already registers Tauri commands and manages backend state for local STT.
- `lib/desktop/tauri-speech-runtime.ts` is the frontend bridge pattern to mirror for the new agent runtime.

## Product Boundaries

This plan intentionally removes Obsidian from scope. The app remains the material knowledge base.

The first supported Agent Adapters are only:

- Codex CLI
- Claude Code

The agent may collect/search/parse/write candidate files inside a run workspace, but it must not directly write the official IndexedDB material stores. The formal import path stays:

```text
CLI Agent run
  -> material-draft.json + source snapshots + report
  -> TypeScript Zod validation
  -> Material Inbox preview
  -> user selects import scope
  -> materialRepository.saveImportBundle()
```

This prevents untrusted free-form agent output from becoming knowledge-base data without schema validation and user review.

## Frontend Alignment Contract

This backend runtime must align with the approved frontend direction:

- The daily Agent selector lives in the current project topbar, implemented by `docs/superpowers/plans/2026-05-26-agent-frontend-alignment.md`.
- `app/materials/page.tsx` must not own an `Agent Adapter` picker. It only displays the current global execution environment, lets the user choose a material Skill, and starts a run.
- `app/settings/page.tsx` is a diagnostics surface for detection, logs, paths, and test runs. It is not the primary workflow.
- The backend command contract must accept `adapterId`, `model`, and `reasoning` on each run request. These values come from the global topbar state.
- If no backend runtime is available, the frontend may show static placeholder status, but the real runtime must expose adapter detection through `agent_detect_adapters`.

## File Structure

### Create

- `src-tauri/src/agent/mod.rs`  
  Module root for CLI agent runtime.

- `src-tauri/src/agent/errors.rs`  
  Shared `AgentError` and `AgentResult` for Tauri command serialization.

- `src-tauri/src/agent/types.rs`  
  Serializable Rust DTOs for adapters, skills, runs, events, and material run results.

- `src-tauri/src/agent/frontmatter.rs`  
  Minimal `SKILL.md` frontmatter parser, ported in spirit from open-design's `frontmatter.ts`.

- `src-tauri/src/agent/skills.rs`  
  Skill discovery for bundled app skills and user skills under app data.

- `src-tauri/src/agent/workspace.rs`  
  Creates run workspaces under app data, writes input files, and copies active skill side files into `.gongkao-skills/<slug-hash>/`.

- `src-tauri/src/agent/adapters/mod.rs`  
  Adapter registry and shared adapter trait/functions.

- `src-tauri/src/agent/adapters/codex.rs`  
  Codex detection and command construction.

- `src-tauri/src/agent/adapters/claude.rs`  
  Claude Code detection and command construction.

- `src-tauri/src/agent/streams.rs`  
  JSONL stream parsers for Codex and Claude Code output into common app events.

- `src-tauri/src/agent/runner.rs`  
  Run manager that spawns, streams, cancels, and records CLI runs.

- `src-tauri/src/agent/commands.rs`  
  Tauri command layer: detect adapters, list skills, start material run, cancel run, read result.

- `types/agent-runtime.ts`  
  Frontend TypeScript DTOs matching Rust command payloads.

- `lib/desktop/tauri-agent-runtime.ts`  
  Frontend Tauri bridge mirroring the existing speech runtime bridge.

- `lib/agent/material-output.ts`  
  Zod schemas for agent output and conversion into existing `MaterialDraft`.

- `lib/agent/material-run.ts`  
  Frontend orchestration helpers for starting a material-agent run and reading final output. This consumes the global executor state created by `types/agent-executor.ts` / `lib/agent/executor-settings.ts` instead of creating a page-local adapter picker.

- `skills/gongkao-hotspot-collector/SKILL.md`  
  Built-in skill for collecting public-exam hotspot materials from a topic and optional URLs.

- `skills/gongkao-material-parser/SKILL.md`  
  Built-in skill for converting pasted/PDF-extracted text into structured Gongkao materials.

- `skills/gongkao-topic-wiki-curator/SKILL.md`  
  Built-in skill for turning several materials into a stable topic knowledge entry and reusable practice assets.

- `test/lib/agent/material-output.test.ts`  
  Zod validation tests.

- `test/lib/agent/material-run.test.ts`  
  Frontend bridge/orchestration tests with a fake Tauri runtime.

### Modify

- `src-tauri/src/main.rs`  
  Register `agent` module state and new Tauri commands.

- `src-tauri/Cargo.toml`  
  Add `uuid` features if needed for run ids and confirm existing `serde_json` support.

- `lib/storage/schema.ts`  
  Add `agentRuns`, `materialInboxDrafts`, and `agentSettings` stores and bump `DB_VERSION`.

- `lib/storage/idb.ts`  
  Create the new stores on upgrade.

- `lib/storage/repositories.ts`  
  Add `agentRepository` and `materialInboxRepository`.

- `lib/material/types.ts`  
  Add provenance types used by agent-created material drafts.

- `lib/material/processor.ts`  
  Reuse `validateMaterialDraft()` and `buildImportBundle()` for agent inbox drafts.

- `app/materials/page.tsx`  
  Add CLI Agent collection/processing mode, global executor status, skill picker, event feed, output preview, and inbox import. Do not add a Materials-local adapter/model picker.

- `app/settings/page.tsx`  
  Add Agent Adapter diagnostics: Codex CLI / Claude Code detection, paths, versions, auth status, and a small test run. Selection remains in the topbar Agent menu.

- `src-tauri/capabilities/default.json`  
  Keep event permission and confirm command invocation remains available under current Tauri capabilities.

## Data Contracts

### Agent Output File Contract

Every material-related skill must write `material-draft.json` at the run workspace root:

```json
{
  "schemaVersion": 1,
  "source": {
    "title": "数字乡村建设热点材料",
    "sourceType": "text",
    "originalName": "agent://gongkao-hotspot-collector",
    "text": "合并后的可入库材料正文，不少于 20 字。",
    "references": [
      {
        "title": "国务院相关政策文件",
        "url": "https://example.gov.cn/policy",
        "publisher": "国务院",
        "publishedAt": "2026-05-01",
        "accessedAt": "2026-05-26T10:00:00.000Z",
        "snapshotPath": "source-snapshots/001.md",
        "excerpt": "用于证明主题归纳的短摘录。"
      }
    ]
  },
  "draft": {
    "topic": "数字乡村建设",
    "summary": "围绕基础设施、数字素养、数据治理等维度形成申论素材。",
    "source": "agent",
    "tags": ["数字乡村", "乡村振兴"],
    "keywords": ["基础设施", "数字素养", "数据共享"],
    "goldenSentences": ["以数字化赋能乡村治理现代化。"],
    "flashcards": [
      {
        "front": "数字乡村建设的核心抓手有哪些？",
        "keywords": ["基础设施", "人才支撑", "数据治理"],
        "category": "对策"
      }
    ],
    "practiceQuestions": [
      {
        "type": "对策题",
        "title": "请就如何推进数字乡村建设提出对策建议",
        "material": "材料正文节选。",
        "prompt": "要求：对策具体、有针对性，不超过 400 字。",
        "keywords": ["基础设施", "数字素养", "治理效能"],
        "modelAnswer": "一是夯实数字基础设施，二是提升群众数字素养，三是完善数据治理机制。"
      }
    ],
    "copybookItems": [
      {
        "title": "数字乡村规范表达",
        "text": "以数字化赋能乡村治理现代化。",
        "tags": ["数字乡村", "规范表达"]
      }
    ]
  },
  "report": {
    "summary": "本次运行生成 1 个主题、1 张闪卡、1 道练习题。",
    "warnings": [],
    "confidence": 0.82
  }
}
```

Optional output files:

- `report.md`: human-readable run report.
- `errors.json`: recoverable collection/parsing errors.
- `source-snapshots/*.md`: source text snapshots used as provenance.

## Task 1: Frontend Agent Output Schema

**Files:**

- Create: `lib/agent/material-output.ts`
- Create: `test/lib/agent/material-output.test.ts`
- Modify: `lib/material/types.ts`

- [ ] **Step 1: Write failing validation tests**

Create `test/lib/agent/material-output.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { parseAgentMaterialOutput, toMaterialDraftFromAgentOutput } from "@/lib/agent/material-output"

const validOutput = {
  schemaVersion: 1,
  source: {
    title: "数字乡村建设热点材料",
    sourceType: "text",
    originalName: "agent://gongkao-hotspot-collector",
    text: "数字乡村建设要夯实基础设施，提升数字素养，推进数据共享，完善治理机制。",
    references: [
      {
        title: "政策文件",
        url: "https://example.gov.cn/policy",
        publisher: "国务院",
        publishedAt: "2026-05-01",
        accessedAt: "2026-05-26T10:00:00.000Z",
        snapshotPath: "source-snapshots/001.md",
        excerpt: "推进数字乡村建设。",
      },
    ],
  },
  draft: {
    topic: "数字乡村建设",
    summary: "围绕基础设施、数字素养、数据治理形成申论素材。",
    source: "agent",
    tags: ["数字乡村", "乡村振兴"],
    keywords: ["基础设施", "数字素养", "数据共享"],
    goldenSentences: ["以数字化赋能乡村治理现代化。"],
    flashcards: [{ front: "数字乡村建设的核心抓手有哪些？", keywords: ["基础设施"], category: "对策" }],
    practiceQuestions: [
      {
        type: "对策题",
        title: "请就如何推进数字乡村建设提出对策建议",
        material: "数字乡村建设材料。",
        prompt: "要求：对策具体、有针对性。",
        keywords: ["基础设施"],
        modelAnswer: "一是夯实基础设施，二是提升数字素养，三是完善数据治理。",
      },
    ],
    copybookItems: [{ title: "规范表达", text: "以数字化赋能乡村治理现代化。", tags: ["数字乡村"] }],
  },
  report: {
    summary: "生成完整材料。",
    warnings: [],
    confidence: 0.82,
  },
}

describe("agent material output", () => {
  it("parses valid agent material output", () => {
    const parsed = parseAgentMaterialOutput(JSON.stringify(validOutput))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.source.references[0].publisher).toBe("国务院")
    expect(toMaterialDraftFromAgentOutput(parsed.value).topic).toBe("数字乡村建设")
  })

  it("rejects output without references and enough source text", () => {
    const invalid = {
      ...validOutput,
      source: { ...validOutput.source, text: "太短", references: [] },
    }
    const parsed = parseAgentMaterialOutput(JSON.stringify(invalid))
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.errors.join("\n")).toContain("source.text")
    expect(parsed.errors.join("\n")).toContain("references")
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm.cmd run test -- test/lib/agent/material-output.test.ts
```

Expected: fail because `@/lib/agent/material-output` does not exist.

- [ ] **Step 3: Add provenance types**

Modify `lib/material/types.ts` by adding these exported types at the end:

```ts
export type MaterialSourceReference = {
  title: string
  url?: string
  publisher?: string
  publishedAt?: string
  accessedAt: string
  snapshotPath?: string
  excerpt: string
}

export type AgentMaterialOutput = {
  schemaVersion: 1
  source: MaterialFileInput & {
    references: MaterialSourceReference[]
  }
  draft: MaterialDraft
  report: {
    summary: string
    warnings: string[]
    confidence: number
  }
}
```

- [ ] **Step 4: Implement Zod schema and conversion**

Create `lib/agent/material-output.ts`:

```ts
import { z } from "zod"
import type { AgentMaterialOutput, MaterialDraft } from "@/lib/material/types"

const FlashcardCategorySchema = z.enum(["金句", "规范语", "对策"])
const QuestionTypeSchema = z.enum(["概括题", "对策题", "综合分析", "应用文", "大作文"])

const MaterialDraftSchema: z.ZodType<MaterialDraft> = z.object({
  topic: z.string().min(1),
  summary: z.string().min(1),
  source: z.string().optional(),
  tags: z.array(z.string().min(1)).min(1),
  keywords: z.array(z.string().min(1)).min(3),
  goldenSentences: z.array(z.string().min(1)),
  flashcards: z
    .array(
      z.object({
        front: z.string().min(1),
        keywords: z.array(z.string().min(1)).min(1),
        category: FlashcardCategorySchema,
      }),
    )
    .min(1),
  practiceQuestions: z
    .array(
      z.object({
        type: QuestionTypeSchema,
        title: z.string().min(1),
        material: z.string().min(1),
        prompt: z.string().min(1),
        keywords: z.array(z.string().min(1)).min(1),
        modelAnswer: z.string().min(1),
      }),
    )
    .min(1),
  copybookItems: z.array(
    z.object({
      title: z.string().min(1),
      text: z.string().min(1),
      tags: z.array(z.string().min(1)),
    }),
  ),
})

export const AgentMaterialOutputSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.object({
    title: z.string().min(1),
    sourceType: z.enum(["text", "markdown", "pdf"]),
    originalName: z.string().optional(),
    text: z.string().min(20),
    references: z
      .array(
        z.object({
          title: z.string().min(1),
          url: z.string().url().optional(),
          publisher: z.string().optional(),
          publishedAt: z.string().optional(),
          accessedAt: z.string().min(1),
          snapshotPath: z.string().optional(),
          excerpt: z.string().min(1),
        }),
      )
      .min(1),
  }),
  draft: MaterialDraftSchema,
  report: z.object({
    summary: z.string().min(1),
    warnings: z.array(z.string()),
    confidence: z.number().min(0).max(1),
  }),
})

export type ParseAgentMaterialOutputResult =
  | { ok: true; value: AgentMaterialOutput }
  | { ok: false; errors: string[] }

export function parseAgentMaterialOutput(raw: string): ParseAgentMaterialOutputResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, errors: ["material-draft.json is not valid JSON"] }
  }

  const result = AgentMaterialOutputSchema.safeParse(parsed)
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    }
  }

  return { ok: true, value: result.data }
}

export function toMaterialDraftFromAgentOutput(output: AgentMaterialOutput): MaterialDraft {
  return output.draft
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run:

```powershell
npm.cmd run test -- test/lib/agent/material-output.test.ts
```

Expected: pass.

## Task 2: IndexedDB Stores For Agent Runs And Inbox

**Files:**

- Modify: `lib/storage/schema.ts`
- Modify: `lib/storage/idb.ts`
- Modify: `lib/storage/repositories.ts`
- Modify: `test/lib/storage/repositories.test.ts`

- [ ] **Step 1: Add failing repository tests**

Append to `test/lib/storage/repositories.test.ts`:

```ts
import { agentRepository, materialInboxRepository } from "@/lib/storage/repositories"
import type { AgentRunRecord, MaterialInboxDraft } from "@/lib/storage/schema"

it("stores agent run records and material inbox drafts", async () => {
  const run: AgentRunRecord = {
    id: "run-1",
    adapterId: "codex",
    skillId: "gongkao-material-parser",
    status: "completed",
    title: "数字乡村",
    startedAt: "2026-05-26T10:00:00.000Z",
    endedAt: "2026-05-26T10:01:00.000Z",
    workspacePath: "C:\\Users\\djy\\AppData\\Local\\Gongkao\\agent-runs\\run-1",
    summary: "生成完整材料。",
  }
  const inbox: MaterialInboxDraft = {
    id: "inbox-1",
    runId: "run-1",
    status: "pending",
    createdAt: "2026-05-26T10:01:00.000Z",
    outputJson: JSON.stringify({ schemaVersion: 1 }),
    validationErrors: [],
  }

  await agentRepository.saveRun(run)
  await materialInboxRepository.saveDraft(inbox)

  expect(await agentRepository.getRuns()).toEqual([run])
  expect(await materialInboxRepository.getDrafts()).toEqual([inbox])
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm.cmd run test -- test/lib/storage/repositories.test.ts
```

Expected: fail because the new repository exports and schema types do not exist.

- [ ] **Step 3: Extend storage schema**

Modify `lib/storage/schema.ts`:

```ts
export const DB_VERSION = 3

export const STORES = {
  reviewStates: "reviewStates",
  reviewEvents: "reviewEvents",
  practiceAttempts: "practiceAttempts",
  copybookItems: "copybookItems",
  providerSettings: "providerSettings",
  materialSources: "materialSources",
  importedFlashcards: "importedFlashcards",
  importedQuestions: "importedQuestions",
  agentRuns: "agentRuns",
  materialInboxDrafts: "materialInboxDrafts",
  agentSettings: "agentSettings",
} as const
```

Add types in the same file:

```ts
export type AgentAdapterId = "codex" | "claude"
export type AgentRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled"

export type AgentRunRecord = {
  id: string
  adapterId: AgentAdapterId
  skillId: string
  status: AgentRunStatus
  title: string
  startedAt: string
  endedAt?: string
  workspacePath: string
  summary: string
  error?: string
}

export type MaterialInboxStatus = "pending" | "imported" | "rejected"

export type MaterialInboxDraft = {
  id: string
  runId: string
  status: MaterialInboxStatus
  createdAt: string
  outputJson: string
  validationErrors: string[]
}

export type AgentSettings = {
  id: "agent"
  value: {
    defaultAdapterId: AgentAdapterId
    defaultSkillId: string
    defaultModel: string
    defaultReasoning: "default" | "medium" | "high" | "xhigh"
  }
}
```

- [ ] **Step 4: Create stores in IndexedDB upgrade**

Modify `lib/storage/idb.ts` inside `request.onupgradeneeded`:

```ts
createStore(db, STORES.agentRuns, "id")
createStore(db, STORES.materialInboxDrafts, "id")
createStore(db, STORES.agentSettings, "id")
```

- [ ] **Step 5: Add repositories**

Modify imports in `lib/storage/repositories.ts` to include the new types, then add:

```ts
export const agentRepository = {
  getRuns: () => listItems<AgentRunRecord>(STORES.agentRuns),
  saveRun: (run: AgentRunRecord) => putItem(STORES.agentRuns, run),
  getSettings: async () => {
    const record = await getItem<AgentSettings>(STORES.agentSettings, "agent")
    return record?.id === "agent" ? record.value : undefined
  },
  saveSettings: (value: AgentSettings["value"]) =>
    putItem<AgentSettings>(STORES.agentSettings, { id: "agent", value }),
}

export const materialInboxRepository = {
  getDrafts: () => listItems<MaterialInboxDraft>(STORES.materialInboxDrafts),
  saveDraft: (draft: MaterialInboxDraft) => putItem(STORES.materialInboxDrafts, draft),
  markImported: async (id: string) => {
    const draft = await getItem<MaterialInboxDraft>(STORES.materialInboxDrafts, id)
    if (!draft) return
    await putItem<MaterialInboxDraft>(STORES.materialInboxDrafts, { ...draft, status: "imported" })
  },
  rejectDraft: async (id: string) => {
    const draft = await getItem<MaterialInboxDraft>(STORES.materialInboxDrafts, id)
    if (!draft) return
    await putItem<MaterialInboxDraft>(STORES.materialInboxDrafts, { ...draft, status: "rejected" })
  },
}
```

- [ ] **Step 6: Run storage tests**

Run:

```powershell
npm.cmd run test -- test/lib/storage/repositories.test.ts
```

Expected: pass.

## Task 3: Rust Agent Types And Errors

**Files:**

- Create: `src-tauri/src/agent/mod.rs`
- Create: `src-tauri/src/agent/errors.rs`
- Create: `src-tauri/src/agent/types.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Create module root**

Create `src-tauri/src/agent/mod.rs`:

```rust
pub mod adapters;
pub mod commands;
pub mod errors;
pub mod frontmatter;
pub mod runner;
pub mod skills;
pub mod streams;
pub mod types;
pub mod workspace;
```

- [ ] **Step 2: Create errors**

Create `src-tauri/src/agent/errors.rs`:

```rust
use serde::Serialize;
use std::fmt;

pub type AgentResult<T> = Result<T, AgentError>;

#[derive(Debug, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum AgentError {
    AdapterUnavailable(String),
    InvalidRequest(String),
    Io(String),
    ProcessFailed(String),
    RunNotFound(String),
    SkillNotFound(String),
    OutputMissing(String),
    OutputInvalid(String),
}

impl fmt::Display for AgentError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AgentError::AdapterUnavailable(message)
            | AgentError::InvalidRequest(message)
            | AgentError::Io(message)
            | AgentError::ProcessFailed(message)
            | AgentError::RunNotFound(message)
            | AgentError::SkillNotFound(message)
            | AgentError::OutputMissing(message)
            | AgentError::OutputInvalid(message) => write!(f, "{message}"),
        }
    }
}

impl From<std::io::Error> for AgentError {
    fn from(value: std::io::Error) -> Self {
        AgentError::Io(value.to_string())
    }
}
```

- [ ] **Step 3: Create serializable DTOs**

Create `src-tauri/src/agent/types.rs`:

```rust
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AgentAdapterId {
    Codex,
    Claude,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedAgentAdapter {
    pub id: AgentAdapterId,
    pub name: String,
    pub available: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    pub auth_status: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub triggers: Vec<String>,
    pub mode: String,
    pub source: String,
    pub dir: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartMaterialAgentRunRequest {
    pub adapter_id: AgentAdapterId,
    pub model: Option<String>,
    pub reasoning: Option<String>,
    pub skill_id: String,
    pub title: String,
    pub topic: String,
    pub source_text: String,
    pub source_type: String,
    pub original_name: Option<String>,
    pub user_instruction: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunStarted {
    pub run_id: String,
    pub workspace_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunEvent {
    pub run_id: String,
    pub kind: String,
    pub message: String,
    pub payload: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentMaterialRunResult {
    pub run_id: String,
    pub workspace_path: String,
    pub output_json: String,
    pub report_markdown: Option<String>,
    pub errors_json: Option<String>,
}

#[derive(Debug, Clone)]
pub struct RunWorkspace {
    pub run_id: String,
    pub path: PathBuf,
}
```

- [ ] **Step 4: Register module in main**

Modify `src-tauri/src/main.rs`:

```rust
mod agent;
mod stt;
```

The command registration happens after Task 8.

- [ ] **Step 5: Run Rust compile check**

Run:

```powershell
$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"; cargo check
```

Expected: pass or fail only because later referenced modules do not exist yet. If it fails because `adapters`, `commands`, `frontmatter`, `runner`, `skills`, `streams`, or `workspace` are missing, continue to Task 4.

## Task 4: Rust Skill Frontmatter And Discovery

**Files:**

- Create: `src-tauri/src/agent/frontmatter.rs`
- Create: `src-tauri/src/agent/skills.rs`
- Create: `skills/gongkao-hotspot-collector/SKILL.md`
- Create: `skills/gongkao-material-parser/SKILL.md`
- Create: `skills/gongkao-topic-wiki-curator/SKILL.md`

- [ ] **Step 1: Write frontmatter parser tests**

Add the following test module to `src-tauri/src/agent/frontmatter.rs` after implementation in Step 2, then run it in Step 3:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_skill_frontmatter_and_body() {
        let raw = "---\nname: gongkao-material-parser\ndescription: |\n  Parse material.\ntriggers:\n  - pdf\n  - text\n---\n# Workflow\nWrite JSON.";
        let parsed = parse_skill_markdown(raw);

        assert_eq!(parsed.name.as_deref(), Some("gongkao-material-parser"));
        assert_eq!(parsed.description.as_deref(), Some("Parse material."));
        assert_eq!(parsed.triggers, vec!["pdf".to_string(), "text".to_string()]);
        assert_eq!(parsed.body.trim(), "# Workflow\nWrite JSON.");
    }
}
```

- [ ] **Step 2: Implement minimal parser**

Create `src-tauri/src/agent/frontmatter.rs`:

```rust
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedSkillMarkdown {
    pub name: Option<String>,
    pub description: Option<String>,
    pub triggers: Vec<String>,
    pub mode: Option<String>,
    pub body: String,
}

pub fn parse_skill_markdown(raw: &str) -> ParsedSkillMarkdown {
    let normalized = raw.trim_start_matches('\u{feff}');
    if !normalized.starts_with("---\n") && !normalized.starts_with("---\r\n") {
        return ParsedSkillMarkdown {
            name: None,
            description: None,
            triggers: Vec::new(),
            mode: None,
            body: normalized.to_string(),
        };
    }

    let delimiter = if normalized.starts_with("---\r\n") { "\r\n---" } else { "\n---" };
    let Some(end) = normalized[3..].find(delimiter) else {
        return ParsedSkillMarkdown {
            name: None,
            description: None,
            triggers: Vec::new(),
            mode: None,
            body: normalized.to_string(),
        };
    };

    let yaml_start = if normalized.starts_with("---\r\n") { 5 } else { 4 };
    let yaml_end = 3 + end;
    let yaml = &normalized[yaml_start..yaml_end];
    let body_start = yaml_end + delimiter.len();
    let body = normalized[body_start..].trim_start_matches(['\r', '\n']).to_string();

    let mut parsed = ParsedSkillMarkdown {
        name: None,
        description: None,
        triggers: Vec::new(),
        mode: None,
        body,
    };

    let lines = yaml.lines().collect::<Vec<_>>();
    let mut index = 0;
    while index < lines.len() {
        let line = lines[index];
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            index += 1;
            continue;
        }

        if let Some(value) = trimmed.strip_prefix("name:") {
            parsed.name = Some(unquote(value.trim()).to_string());
            index += 1;
            continue;
        }

        if let Some(value) = trimmed.strip_prefix("description:") {
            let value = value.trim();
            if value == "|" || value == "|-" {
                index += 1;
                let mut collected = Vec::new();
                while index < lines.len() {
                    let next = lines[index];
                    if !next.starts_with("  ") && !next.trim().is_empty() {
                        break;
                    }
                    collected.push(next.trim_start().to_string());
                    index += 1;
                }
                parsed.description = Some(collected.join("\n").trim().to_string());
            } else {
                parsed.description = Some(unquote(value).to_string());
                index += 1;
            }
            continue;
        }

        if let Some(value) = trimmed.strip_prefix("mode:") {
            parsed.mode = Some(unquote(value.trim()).to_string());
            index += 1;
            continue;
        }

        if trimmed == "triggers:" {
            index += 1;
            while index < lines.len() {
                let item = lines[index].trim();
                if let Some(value) = item.strip_prefix("- ") {
                    parsed.triggers.push(unquote(value.trim()).to_string());
                    index += 1;
                    continue;
                }
                break;
            }
            continue;
        }

        index += 1;
    }

    parsed
}

fn unquote(value: &str) -> &str {
    value
        .strip_prefix('"')
        .and_then(|v| v.strip_suffix('"'))
        .or_else(|| value.strip_prefix('\'').and_then(|v| v.strip_suffix('\'')))
        .unwrap_or(value)
}
```

- [ ] **Step 3: Run parser test**

Run:

```powershell
$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"; cargo test -q agent::frontmatter
```

Expected: pass.

- [ ] **Step 4: Implement skill discovery**

Create `src-tauri/src/agent/skills.rs`:

```rust
use super::errors::{AgentError, AgentResult};
use super::frontmatter::parse_skill_markdown;
use super::types::SkillInfo;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

pub struct SkillRegistry {
    builtin_root: PathBuf,
    user_root: PathBuf,
}

impl SkillRegistry {
    pub fn new(app: &AppHandle) -> AgentResult<Self> {
        let cwd = std::env::current_dir().map_err(AgentError::from)?;
        let builtin_root = cwd.join("skills");
        let user_root = app
            .path()
            .app_data_dir()
            .map_err(|error| AgentError::Io(error.to_string()))?
            .join("agent-skills");
        fs::create_dir_all(&user_root).map_err(AgentError::from)?;
        Ok(Self { builtin_root, user_root })
    }

    pub fn list_skills(&self) -> AgentResult<Vec<SkillInfo>> {
        let mut seen = HashSet::new();
        let mut out = Vec::new();
        self.scan_root(&self.user_root, "user", &mut seen, &mut out)?;
        self.scan_root(&self.builtin_root, "built-in", &mut seen, &mut out)?;
        out.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(out)
    }

    pub fn find_skill(&self, skill_id: &str) -> AgentResult<SkillInfo> {
        self.list_skills()?
            .into_iter()
            .find(|skill| skill.id == skill_id)
            .ok_or_else(|| AgentError::SkillNotFound(format!("skill not found: {skill_id}")))
    }

    fn scan_root(
        &self,
        root: &Path,
        source: &str,
        seen: &mut HashSet<String>,
        out: &mut Vec<SkillInfo>,
    ) -> AgentResult<()> {
        if !root.exists() {
            return Ok(());
        }
        for entry in fs::read_dir(root).map_err(AgentError::from)? {
            let entry = entry.map_err(AgentError::from)?;
            let dir = entry.path();
            if !dir.is_dir() {
                continue;
            }
            let skill_file = dir.join("SKILL.md");
            if !skill_file.is_file() {
                continue;
            }
            let raw = fs::read_to_string(&skill_file).map_err(AgentError::from)?;
            let parsed = parse_skill_markdown(&raw);
            let fallback_id = dir
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("skill")
                .to_string();
            let id = parsed.name.clone().unwrap_or(fallback_id);
            if seen.contains(&id) {
                continue;
            }
            seen.insert(id.clone());
            out.push(SkillInfo {
                id: id.clone(),
                name: id,
                description: parsed.description.unwrap_or_default(),
                triggers: parsed.triggers,
                mode: parsed.mode.unwrap_or_else(|| "material".to_string()),
                source: source.to_string(),
                dir: dir.to_string_lossy().to_string(),
            });
        }
        Ok(())
    }
}
```

- [ ] **Step 5: Add built-in collection skill**

Create `skills/gongkao-hotspot-collector/SKILL.md`:

```markdown
---
name: gongkao-hotspot-collector
description: Collect public-exam hotspot materials from a topic, optional URLs, and public sources, then produce Gongkao material-draft.json.
triggers:
  - 公考热点
  - 申论素材
  - 政策热点
mode: material
---

# 公考热点素材采集 Skill

你在一个独立运行目录中工作。只能把产物写入当前目录。不要修改当前目录之外的任何文件。

## 输入

读取当前目录下的 `input.json`。字段包括：

- `title`: 素材标题。
- `topic`: 用户要采集的主题。
- `sourceText`: 用户已经提供的资料正文，可能为空。
- `sourceType`: `text` / `markdown` / `pdf`。
- `originalName`: 原始文件名，可能为空。
- `userInstruction`: 用户补充要求，可能包含指定平台、指定 URL 或采集范围。

## 工作流

1. 优先使用用户给出的 `sourceText` 和 URL。
2. 如 CLI 环境支持联网或搜索，可以补充采集公开网页资料，优先使用政府官网、人民网、新华网、央视网、半月谈、学习时报等来源。
3. 不登录平台，不读取浏览器 Cookie，不绕过付费墙，不批量抓取需要授权的内容。
4. 将每个可信来源整理为 `source-snapshots/NNN.md`，写明标题、URL、发布者、发布时间、访问时间和短摘录。
5. 生成 `material-draft.json`，必须严格符合当前目录 `output-schema.json`。
6. 同时生成 `report.md`，说明采集过程、取舍依据、未能访问的来源和风险。

## 质量标准

- 输出必须是简体中文。
- 主题要适合申论训练，不要泛泛摘抄新闻。
- 练习题要覆盖词、句、篇：至少 1 张温故闪卡、1 道申论演练题、1 条字帖规范表达。
- 关键词必须能用于后续 AI 匹配。
- 对不确定事实写入 `report.md` 的风险说明，不要编造来源。
```

- [ ] **Step 6: Add parser skill**

Create `skills/gongkao-material-parser/SKILL.md`:

```markdown
---
name: gongkao-material-parser
description: Parse pasted text or extracted PDF text into structured Gongkao material draft JSON.
triggers:
  - PDF解析
  - 文本入库
  - 素材结构化
mode: material
---

# 公考素材结构化 Skill

你在一个独立运行目录中工作。只能把产物写入当前目录。不要修改当前目录之外的任何文件。

读取 `input.json` 和 `output-schema.json`，把用户提供的 `sourceText` 加工成 `material-draft.json`。

## 输出要求

1. `source.text` 保留整理后的核心材料正文。
2. `source.references` 至少包含一项；若没有 URL，使用 `originalName` 或 `agent://local-input` 作为来源线索。
3. `draft.topic` 要是可复习的申论主题。
4. `draft.flashcards` 用于“智能温故”。
5. `draft.practiceQuestions` 用于“真题/时政演练”。
6. `draft.copybookItems` 用于“红/绿米字格字帖”。
7. `report.md` 说明结构化策略和删减内容。

输出必须严格是简体中文。
```

- [ ] **Step 7: Add topic wiki skill**

Create `skills/gongkao-topic-wiki-curator/SKILL.md`:

```markdown
---
name: gongkao-topic-wiki-curator
description: Convert several materials into a durable public-exam topic wiki entry and reusable review/practice assets.
triggers:
  - 主题知识库
  - wiki
  - 素材沉淀
mode: material
---

# 公考主题知识条目 Skill

你在一个独立运行目录中工作。只能把产物写入当前目录。不要修改当前目录之外的任何文件。

读取 `input.json`，把资料整理成一个长期可复用的主题条目，并输出 `material-draft.json` 和 `topic-entry.md`。

`topic-entry.md` 必须包含：

1. 主题定义。
2. 政策背景。
3. 问题表现。
4. 原因分析。
5. 对策框架。
6. 金句和规范表达。
7. 可迁移到其他主题的表达模板。

`material-draft.json` 必须符合 `output-schema.json`，用于进入本应用的温故、演练和字帖模块。
```

- [ ] **Step 8: Run compile check**

Run:

```powershell
$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"; cargo check
```

Expected: remaining failures only point to modules planned in later tasks.

## Task 5: Run Workspace And Prompt Composer

**Files:**

- Create: `src-tauri/src/agent/workspace.rs`
- Create: `src-tauri/src/agent/runner.rs`

- [ ] **Step 1: Add workspace tests**

Add this test module to `src-tauri/src/agent/workspace.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn rejects_unsafe_alias_segments() {
        assert!(safe_alias_segment("skill-abc"));
        assert!(!safe_alias_segment("../skill"));
        assert!(!safe_alias_segment("a\\b"));
        assert!(!safe_alias_segment(""));
    }

    #[test]
    fn writes_schema_file() {
        let dir = std::env::temp_dir().join("gongkao-agent-workspace-test");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        write_output_schema(&dir).unwrap();
        let schema = fs::read_to_string(dir.join("output-schema.json")).unwrap();
        assert!(schema.contains("\"material-draft.json\""));
        assert!(schema.contains("\"schemaVersion\""));
    }
}
```

- [ ] **Step 2: Implement workspace helpers**

Create `src-tauri/src/agent/workspace.rs`:

```rust
use super::errors::{AgentError, AgentResult};
use super::types::{RunWorkspace, StartMaterialAgentRunRequest};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

pub fn create_run_workspace(app: &AppHandle) -> AgentResult<RunWorkspace> {
    let run_id = Uuid::new_v4().to_string();
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| AgentError::Io(error.to_string()))?
        .join("agent-runs");
    let path = root.join(&run_id);
    fs::create_dir_all(&path).map_err(AgentError::from)?;
    Ok(RunWorkspace { run_id, path })
}

pub fn write_run_inputs(workspace: &Path, request: &StartMaterialAgentRunRequest) -> AgentResult<()> {
    let input = json!({
        "title": request.title,
        "topic": request.topic,
        "sourceText": request.source_text,
        "sourceType": request.source_type,
        "originalName": request.original_name,
        "userInstruction": request.user_instruction
    });
    fs::write(
        workspace.join("input.json"),
        serde_json::to_string_pretty(&input).map_err(|error| AgentError::OutputInvalid(error.to_string()))?,
    )
    .map_err(AgentError::from)?;
    write_output_schema(workspace)?;
    Ok(())
}

pub fn write_output_schema(workspace: &Path) -> AgentResult<()> {
    let schema = json!({
        "requiredFile": "material-draft.json",
        "schemaVersion": 1,
        "requiredTopLevelFields": ["schemaVersion", "source", "draft", "report"],
        "source": {
            "sourceType": ["text", "markdown", "pdf"],
            "referencesRequired": true
        },
        "draft": {
            "questionTypes": ["概括题", "对策题", "综合分析", "应用文", "大作文"],
            "flashcardCategories": ["金句", "规范语", "对策"]
        },
        "language": "简体中文"
    });
    fs::write(
        workspace.join("output-schema.json"),
        serde_json::to_string_pretty(&schema).map_err(|error| AgentError::OutputInvalid(error.to_string()))?,
    )
    .map_err(AgentError::from)
}

pub fn stage_skill_into_workspace(skill_dir: &Path, workspace: &Path) -> AgentResult<PathBuf> {
    let folder = skill_alias_segment(skill_dir);
    if !safe_alias_segment(&folder) {
        return Err(AgentError::InvalidRequest(format!("unsafe skill alias: {folder}")));
    }
    let alias_root = workspace.join(".gongkao-skills");
    let target = alias_root.join(folder);
    if target.exists() {
        fs::remove_dir_all(&target).map_err(AgentError::from)?;
    }
    fs::create_dir_all(&alias_root).map_err(AgentError::from)?;
    copy_dir_all(skill_dir, &target)?;
    Ok(target)
}

pub fn build_material_prompt(skill_body: &str, staged_skill_path: &Path) -> String {
    format!(
        "{}\n\n---\n\n运行约束：\n1. 当前工作目录是本次运行的唯一输出目录。\n2. 技能文件已复制到 `{}`。\n3. 读取 `input.json` 和 `output-schema.json`。\n4. 必须写出 `material-draft.json`。\n5. 输出内容必须是简体中文。\n",
        skill_body.trim(),
        staged_skill_path.to_string_lossy()
    )
}

pub fn safe_alias_segment(value: &str) -> bool {
    !value.is_empty()
        && value != "."
        && value != ".."
        && !value.contains('/')
        && !value.contains('\\')
        && !value.contains('\0')
}

fn skill_alias_segment(skill_dir: &Path) -> String {
    let folder = skill_dir.file_name().and_then(|name| name.to_str()).unwrap_or("skill");
    let mut hasher = Sha256::new();
    hasher.update(skill_dir.to_string_lossy().as_bytes());
    let digest = format!("{:x}", hasher.finalize());
    format!("{folder}-{}", &digest[..10])
}

fn copy_dir_all(source: &Path, target: &Path) -> AgentResult<()> {
    fs::create_dir_all(target).map_err(AgentError::from)?;
    for entry in fs::read_dir(source).map_err(AgentError::from)? {
        let entry = entry.map_err(AgentError::from)?;
        let ty = entry.file_type().map_err(AgentError::from)?;
        let next_target = target.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &next_target)?;
        } else if ty.is_file() {
            fs::copy(entry.path(), next_target).map_err(AgentError::from)?;
        }
    }
    Ok(())
}
```

- [ ] **Step 3: Run workspace tests**

Run:

```powershell
$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"; cargo test -q agent::workspace
```

Expected: pass.

## Task 6: Codex And Claude Adapters

**Files:**

- Create: `src-tauri/src/agent/adapters/mod.rs`
- Create: `src-tauri/src/agent/adapters/codex.rs`
- Create: `src-tauri/src/agent/adapters/claude.rs`

- [ ] **Step 1: Add adapter argument tests**

Add tests in `src-tauri/src/agent/adapters/codex.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_codex_exec_args_with_cwd() {
        let args = build_codex_args("C:\\agent-runs\\run-1");
        assert!(args.contains(&"exec".to_string()));
        assert!(args.contains(&"--json".to_string()));
        assert!(args.contains(&"--skip-git-repo-check".to_string()));
        assert!(args.contains(&"-C".to_string()));
        assert!(args.contains(&"C:\\agent-runs\\run-1".to_string()));
    }
}
```

Add tests in `src-tauri/src/agent/adapters/claude.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_claude_print_args() {
        let args = build_claude_args();
        assert_eq!(args[0], "-p");
        assert!(args.contains(&"--output-format".to_string()));
        assert!(args.contains(&"stream-json".to_string()));
        assert!(args.contains(&"--verbose".to_string()));
    }
}
```

- [ ] **Step 2: Implement adapter registry**

Create `src-tauri/src/agent/adapters/mod.rs`:

```rust
pub mod claude;
pub mod codex;

use super::errors::{AgentError, AgentResult};
use super::types::{AgentAdapterId, DetectedAgentAdapter};
use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Clone)]
pub struct LaunchCommand {
    pub program: String,
    pub args: Vec<String>,
    pub cwd: PathBuf,
    pub stream_kind: String,
}

pub fn detect_all() -> Vec<DetectedAgentAdapter> {
    vec![codex::detect(), claude::detect()]
}

pub fn build_launch(
    adapter_id: &AgentAdapterId,
    cwd: PathBuf,
    model: Option<&str>,
    reasoning: Option<&str>,
) -> AgentResult<LaunchCommand> {
    match adapter_id {
        AgentAdapterId::Codex => codex::build_launch(cwd, model, reasoning),
        AgentAdapterId::Claude => claude::build_launch(cwd, model),
    }
}

pub fn probe_version(program: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(program).args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        None
    } else {
        Some(stdout.lines().next().unwrap_or_default().to_string())
    }
}

pub fn command_available(program: &str) -> bool {
    Command::new(program).arg("--version").output().is_ok()
}

pub fn unavailable(id: AgentAdapterId, name: &str, install_hint: &str) -> DetectedAgentAdapter {
    DetectedAgentAdapter {
        id,
        name: name.to_string(),
        available: false,
        path: None,
        version: None,
        auth_status: "unknown".to_string(),
        message: install_hint.to_string(),
    }
}

pub fn ensure_available(program: &str, adapter_name: &str) -> AgentResult<()> {
    if command_available(program) {
        Ok(())
    } else {
        Err(AgentError::AdapterUnavailable(format!("{adapter_name} is not available on PATH")))
    }
}
```

- [ ] **Step 3: Implement Codex adapter**

Create `src-tauri/src/agent/adapters/codex.rs`:

```rust
use super::{ensure_available, probe_version, LaunchCommand};
use crate::agent::errors::AgentResult;
use crate::agent::types::{AgentAdapterId, DetectedAgentAdapter};
use std::path::PathBuf;

pub fn detect() -> DetectedAgentAdapter {
    let version = probe_version("codex", &["--version"]);
    let available = version.is_some();
    DetectedAgentAdapter {
        id: AgentAdapterId::Codex,
        name: "Codex CLI".to_string(),
        available,
        path: if available { Some("codex".to_string()) } else { None },
        version,
        auth_status: if available { "unknown".to_string() } else { "missing".to_string() },
        message: if available {
            "Codex CLI detected. Authentication is owned by Codex CLI.".to_string()
        } else {
            "Install and login to Codex CLI, then restart detection.".to_string()
        },
    }
}

pub fn build_launch(cwd: PathBuf, model: Option<&str>, reasoning: Option<&str>) -> AgentResult<LaunchCommand> {
    ensure_available("codex", "Codex CLI")?;
    Ok(LaunchCommand {
        program: "codex".to_string(),
        args: build_codex_args(&cwd.to_string_lossy(), model, reasoning),
        cwd,
        stream_kind: "codex-json".to_string(),
    })
}

pub fn build_codex_args(cwd: &str, model: Option<&str>, reasoning: Option<&str>) -> Vec<String> {
    let mut args = vec![
        "exec".to_string(),
        "--json".to_string(),
        "--skip-git-repo-check".to_string(),
    ];

    if cfg!(target_os = "windows") {
        args.extend(["--sandbox".to_string(), "danger-full-access".to_string()]);
    } else {
        args.extend([
            "--sandbox".to_string(),
            "workspace-write".to_string(),
            "-c".to_string(),
            "sandbox_workspace_write.network_access=true".to_string(),
        ]);
    }

    args.extend(["-C".to_string(), cwd.to_string()]);
    if let Some(model) = model.filter(|value| !value.trim().is_empty() && *value != "default") {
        args.extend(["--model".to_string(), model.to_string()]);
    }
    if let Some(reasoning) = reasoning.filter(|value| !value.trim().is_empty() && *value != "default") {
        args.extend(["-c".to_string(), format!("model_reasoning_effort=\"{reasoning}\"")]);
    }
    args
}
```

- [ ] **Step 4: Implement Claude adapter**

Create `src-tauri/src/agent/adapters/claude.rs`:

```rust
use super::{ensure_available, probe_version, LaunchCommand};
use crate::agent::errors::AgentResult;
use crate::agent::types::{AgentAdapterId, DetectedAgentAdapter};
use std::path::PathBuf;

pub fn detect() -> DetectedAgentAdapter {
    let version = probe_version("claude", &["--version"]);
    let available = version.is_some();
    DetectedAgentAdapter {
        id: AgentAdapterId::Claude,
        name: "Claude Code".to_string(),
        available,
        path: if available { Some("claude".to_string()) } else { None },
        version,
        auth_status: if available { "unknown".to_string() } else { "missing".to_string() },
        message: if available {
            "Claude Code detected. Authentication is owned by Claude Code.".to_string()
        } else {
            "Install and login to Claude Code, then restart detection.".to_string()
        },
    }
}

pub fn build_launch(cwd: PathBuf, model: Option<&str>) -> AgentResult<LaunchCommand> {
    ensure_available("claude", "Claude Code")?;
    Ok(LaunchCommand {
        program: "claude".to_string(),
        args: build_claude_args(model),
        cwd,
        stream_kind: "claude-stream-json".to_string(),
    })
}

pub fn build_claude_args(model: Option<&str>) -> Vec<String> {
    let mut args = vec![
        "-p".to_string(),
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--verbose".to_string(),
        "--permission-mode".to_string(),
        "bypassPermissions".to_string(),
    ];
    if let Some(model) = model.filter(|value| !value.trim().is_empty() && *value != "default") {
        args.extend(["--model".to_string(), model.to_string()]);
    }
    args
}
```

- [ ] **Step 5: Run adapter tests**

Run:

```powershell
$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"; cargo test -q agent::adapters
```

Expected: pass.

## Task 7: Stream Parsers

**Files:**

- Create: `src-tauri/src/agent/streams.rs`

- [ ] **Step 1: Add parser tests**

Create `src-tauri/src/agent/streams.rs` with implementation in Step 2 and this test module:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_codex_agent_message() {
        let line = r#"{"type":"item.completed","item":{"type":"agent_message","text":"完成素材加工"}}"#;
        let event = parse_stream_line("codex-json", line).unwrap();
        assert_eq!(event.kind, "text_delta");
        assert_eq!(event.message, "完成素材加工");
    }

    #[test]
    fn parses_claude_text_block() {
        let line = r#"{"type":"assistant","message":{"content":[{"type":"text","text":"已生成 material-draft.json"}]}}"#;
        let event = parse_stream_line("claude-stream-json", line).unwrap();
        assert_eq!(event.kind, "text_delta");
        assert_eq!(event.message, "已生成 material-draft.json");
    }
}
```

- [ ] **Step 2: Implement parser**

Use this implementation above the test module:

```rust
use super::types::AgentRunEvent;
use serde_json::Value;

pub fn parse_stream_line(kind: &str, line: &str) -> Option<AgentRunEvent> {
    let value = serde_json::from_str::<Value>(line).ok()?;
    match kind {
        "codex-json" => parse_codex(value),
        "claude-stream-json" => parse_claude(value),
        _ => Some(event_without_run("raw", line, None)),
    }
}

pub fn attach_run_id(mut event: AgentRunEvent, run_id: &str) -> AgentRunEvent {
    event.run_id = run_id.to_string();
    event
}

fn parse_codex(value: Value) -> Option<AgentRunEvent> {
    let event_type = value.get("type").and_then(Value::as_str).unwrap_or_default();
    if event_type == "thread.started" {
        return Some(event_without_run("status", "initializing", Some(value)));
    }
    if event_type == "turn.started" {
        return Some(event_without_run("status", "running", Some(value)));
    }
    if event_type == "turn.failed" || event_type == "error" {
        let message = value
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("Codex run failed")
            .to_string();
        return Some(event_without_run("error", &message, Some(value)));
    }
    if event_type == "item.completed" {
        let item = value.get("item")?;
        if item.get("type").and_then(Value::as_str) == Some("agent_message") {
            let text = item.get("text").and_then(Value::as_str).unwrap_or_default();
            if !text.is_empty() {
                return Some(event_without_run("text_delta", text, Some(value)));
            }
        }
        if item.get("type").and_then(Value::as_str) == Some("command_execution") {
            let output = item
                .get("aggregated_output")
                .and_then(Value::as_str)
                .unwrap_or_default();
            return Some(event_without_run("tool_result", output, Some(value)));
        }
    }
    None
}

fn parse_claude(value: Value) -> Option<AgentRunEvent> {
    let event_type = value.get("type").and_then(Value::as_str).unwrap_or_default();
    if event_type == "system" {
        return Some(event_without_run("status", "initializing", Some(value)));
    }
    if event_type == "result" {
        return Some(event_without_run("usage", "result", Some(value)));
    }
    if event_type == "assistant" {
        let content = value
            .get("message")
            .and_then(|message| message.get("content"))
            .and_then(Value::as_array)?;
        let text = content
            .iter()
            .filter_map(|block| {
                if block.get("type").and_then(Value::as_str) == Some("text") {
                    block.get("text").and_then(Value::as_str)
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
            .join("");
        if !text.is_empty() {
            return Some(event_without_run("text_delta", &text, Some(value)));
        }
    }
    if event_type == "stream_event" {
        let text = value
            .get("event")
            .and_then(|event| event.get("delta"))
            .and_then(|delta| delta.get("text"))
            .and_then(Value::as_str)
            .unwrap_or_default();
        if !text.is_empty() {
            return Some(event_without_run("text_delta", text, Some(value)));
        }
    }
    None
}

fn event_without_run(kind: &str, message: &str, payload: Option<Value>) -> AgentRunEvent {
    AgentRunEvent {
        run_id: String::new(),
        kind: kind.to_string(),
        message: message.to_string(),
        payload,
    }
}
```

- [ ] **Step 3: Run parser tests**

Run:

```powershell
$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"; cargo test -q agent::streams
```

Expected: pass.

## Task 8: Rust Runner And Tauri Commands

**Files:**

- Create: `src-tauri/src/agent/runner.rs`
- Create: `src-tauri/src/agent/commands.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Implement run manager**

Create `src-tauri/src/agent/runner.rs`:

```rust
use super::adapters::{build_launch, detect_all};
use super::errors::{AgentError, AgentResult};
use super::frontmatter::parse_skill_markdown;
use super::skills::SkillRegistry;
use super::streams::{attach_run_id, parse_stream_line};
use super::types::{
    AgentMaterialRunResult, AgentRunEvent, AgentRunStarted, DetectedAgentAdapter,
    StartMaterialAgentRunRequest,
};
use super::workspace::{
    build_material_prompt, create_run_workspace, stage_skill_into_workspace, write_run_inputs,
};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

pub const AGENT_RUN_EVENT: &str = "agent://run-event";

pub struct AgentRunManager {
    app: AppHandle,
    children: Mutex<HashMap<String, Child>>,
}

impl AgentRunManager {
    pub fn new(app: &AppHandle) -> Self {
        Self {
            app: app.clone(),
            children: Mutex::new(HashMap::new()),
        }
    }

    pub fn detect_adapters(&self) -> Vec<DetectedAgentAdapter> {
        detect_all()
    }

    pub fn start_material_run(
        self: &Arc<Self>,
        request: StartMaterialAgentRunRequest,
    ) -> AgentResult<AgentRunStarted> {
        let workspace = create_run_workspace(&self.app)?;
        write_run_inputs(&workspace.path, &request)?;

        let registry = SkillRegistry::new(&self.app)?;
        let skill = registry.find_skill(&request.skill_id)?;
        let skill_dir = std::path::PathBuf::from(&skill.dir);
        let skill_md = fs::read_to_string(skill_dir.join("SKILL.md")).map_err(AgentError::from)?;
        let parsed = parse_skill_markdown(&skill_md);
        let staged_skill = stage_skill_into_workspace(&skill_dir, &workspace.path)?;
        let prompt = build_material_prompt(&parsed.body, &staged_skill);

        let launch = build_launch(
            &request.adapter_id,
            workspace.path.clone(),
            request.model.as_deref(),
            request.reasoning.as_deref(),
        )?;
        let run_id = workspace.run_id.clone();
        let workspace_path = workspace.path.to_string_lossy().to_string();
        let manager = Arc::clone(self);

        tauri::async_runtime::spawn_blocking(move || {
            let result = manager.run_child_process(run_id.clone(), prompt, launch.program, launch.args, launch.cwd, launch.stream_kind);
            if let Err(error) = result {
                manager.emit(&run_id, "error", &error.to_string(), None);
            }
        });

        Ok(AgentRunStarted { run_id: workspace.run_id, workspace_path })
    }

    pub fn cancel_run(&self, run_id: &str) -> AgentResult<()> {
        let mut children = self.children.lock().map_err(|error| AgentError::ProcessFailed(error.to_string()))?;
        let Some(child) = children.get_mut(run_id) else {
            return Err(AgentError::RunNotFound(format!("run not found: {run_id}")));
        };
        child.kill().map_err(AgentError::from)?;
        self.emit(run_id, "cancelled", "run cancelled", None);
        Ok(())
    }

    pub fn read_result(&self, run_id: &str) -> AgentResult<AgentMaterialRunResult> {
        let root = self
            .app
            .path()
            .app_data_dir()
            .map_err(|error| AgentError::Io(error.to_string()))?
            .join("agent-runs")
            .join(run_id);
        let output_path = root.join("material-draft.json");
        if !output_path.is_file() {
            return Err(AgentError::OutputMissing("material-draft.json was not produced".to_string()));
        }
        let output_json = fs::read_to_string(output_path).map_err(AgentError::from)?;
        let report_markdown = fs::read_to_string(root.join("report.md")).ok();
        let errors_json = fs::read_to_string(root.join("errors.json")).ok();
        Ok(AgentMaterialRunResult {
            run_id: run_id.to_string(),
            workspace_path: root.to_string_lossy().to_string(),
            output_json,
            report_markdown,
            errors_json,
        })
    }

    fn run_child_process(
        &self,
        run_id: String,
        prompt: String,
        program: String,
        args: Vec<String>,
        cwd: std::path::PathBuf,
        stream_kind: String,
    ) -> AgentResult<()> {
        self.emit(&run_id, "status", "starting", None);
        let mut child = Command::new(program)
            .args(args)
            .current_dir(cwd)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(AgentError::from)?;

        if let Some(stdin) = child.stdin.as_mut() {
            stdin.write_all(prompt.as_bytes()).map_err(AgentError::from)?;
        }
        drop(child.stdin.take());

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        self.children.lock().map_err(|error| AgentError::ProcessFailed(error.to_string()))?.insert(run_id.clone(), child);

        if let Some(stdout) = stdout {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                let line = line.map_err(AgentError::from)?;
                if let Some(event) = parse_stream_line(&stream_kind, &line) {
                    let event = attach_run_id(event, &run_id);
                    let _ = self.app.emit(AGENT_RUN_EVENT, event);
                }
            }
        }

        if let Some(stderr) = stderr {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                self.emit(&run_id, "stderr", &line, None);
            }
        }

        let mut child = self.children.lock().map_err(|error| AgentError::ProcessFailed(error.to_string()))?.remove(&run_id);
        if let Some(mut child) = child.take() {
            let status = child.wait().map_err(AgentError::from)?;
            if status.success() {
                self.emit(&run_id, "completed", "run completed", None);
            } else {
                self.emit(&run_id, "failed", &format!("process exited with {status}"), None);
            }
        }
        Ok(())
    }

    fn emit(&self, run_id: &str, kind: &str, message: &str, payload: Option<serde_json::Value>) {
        let _ = self.app.emit(
            AGENT_RUN_EVENT,
            AgentRunEvent {
                run_id: run_id.to_string(),
                kind: kind.to_string(),
                message: message.to_string(),
                payload,
            },
        );
    }
}
```

- [ ] **Step 2: Implement Tauri commands**

Create `src-tauri/src/agent/commands.rs`:

```rust
use super::errors::AgentError;
use super::runner::AgentRunManager;
use super::skills::SkillRegistry;
use super::types::{
    AgentMaterialRunResult, AgentRunStarted, DetectedAgentAdapter, SkillInfo,
    StartMaterialAgentRunRequest,
};
use std::sync::Arc;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn agent_detect_adapters(manager: State<'_, Arc<AgentRunManager>>) -> Vec<DetectedAgentAdapter> {
    manager.detect_adapters()
}

#[tauri::command]
pub fn agent_list_skills(app: AppHandle) -> Result<Vec<SkillInfo>, AgentError> {
    SkillRegistry::new(&app)?.list_skills()
}

#[tauri::command]
pub fn agent_start_material_run(
    manager: State<'_, Arc<AgentRunManager>>,
    request: StartMaterialAgentRunRequest,
) -> Result<AgentRunStarted, AgentError> {
    manager.inner().start_material_run(request)
}

#[tauri::command]
pub fn agent_cancel_run(
    manager: State<'_, Arc<AgentRunManager>>,
    run_id: String,
) -> Result<(), AgentError> {
    manager.cancel_run(&run_id)
}

#[tauri::command]
pub fn agent_get_material_run_result(
    manager: State<'_, Arc<AgentRunManager>>,
    run_id: String,
) -> Result<AgentMaterialRunResult, AgentError> {
    manager.read_result(&run_id)
}
```

- [ ] **Step 3: Register manager and commands**

Modify `src-tauri/src/main.rs`:

```rust
use agent::commands::{
    agent_cancel_run, agent_detect_adapters, agent_get_material_run_result,
    agent_list_skills, agent_start_material_run,
};
use agent::runner::AgentRunManager;
```

Inside `.setup()`:

```rust
let agent_manager = Arc::new(AgentRunManager::new(&app.handle()));
app.manage(agent_manager);
```

Inside `tauri::generate_handler![...]`:

```rust
agent_detect_adapters,
agent_list_skills,
agent_start_material_run,
agent_cancel_run,
agent_get_material_run_result,
```

- [ ] **Step 4: Run compile check**

Run:

```powershell
$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"; cargo check
```

Expected: pass.

## Task 9: Frontend Tauri Agent Bridge

**Files:**

- Create: `types/agent-runtime.ts`
- Create: `lib/desktop/tauri-agent-runtime.ts`
- Create: `lib/agent/material-run.ts`
- Create: `test/lib/agent/material-run.test.ts`

- [ ] **Step 1: Write frontend bridge test**

Create `test/lib/agent/material-run.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { createTauriAgentRuntime } from "@/lib/desktop/tauri-agent-runtime"

describe("tauri agent runtime", () => {
  it("starts material runs through Tauri invoke", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = []
    const runtime = createTauriAgentRuntime({
      invoke: async (command, args) => {
        calls.push({ command, args })
        return { runId: "run-1", workspacePath: "C:\\runs\\run-1" }
      },
      listen: async () => () => undefined,
    })

    const result = await runtime.startMaterialRun({
      adapterId: "codex",
      model: "gpt-5.5",
      reasoning: "medium",
      skillId: "gongkao-material-parser",
      title: "数字乡村",
      topic: "数字乡村",
      sourceText: "数字乡村建设要夯实基础设施，提升数字素养，推进数据共享。",
      sourceType: "text",
      originalName: undefined,
      userInstruction: "生成温故和演练素材",
    })

    expect(result.runId).toBe("run-1")
    expect(calls[0].command).toBe("agent_start_material_run")
  })
})
```

- [ ] **Step 2: Create shared frontend types**

Create `types/agent-runtime.ts`:

```ts
export type AgentAdapterId = "codex" | "claude"

export type DetectedAgentAdapter = {
  id: AgentAdapterId
  name: string
  available: boolean
  path?: string
  version?: string
  authStatus: string
  message: string
}

export type AgentSkillInfo = {
  id: string
  name: string
  description: string
  triggers: string[]
  mode: string
  source: string
  dir: string
}

export type StartMaterialAgentRunRequest = {
  adapterId: AgentAdapterId
  model?: string
  reasoning?: "default" | "medium" | "high" | "xhigh"
  skillId: string
  title: string
  topic: string
  sourceText: string
  sourceType: "text" | "markdown" | "pdf"
  originalName?: string
  userInstruction: string
}

export type AgentRunStarted = {
  runId: string
  workspacePath: string
}

export type AgentRunEvent = {
  runId: string
  kind: string
  message: string
  payload?: unknown
}

export type AgentMaterialRunResult = {
  runId: string
  workspacePath: string
  outputJson: string
  reportMarkdown?: string
  errorsJson?: string
}
```

- [ ] **Step 3: Implement Tauri bridge**

Create `lib/desktop/tauri-agent-runtime.ts`:

```ts
import type {
  AgentMaterialRunResult,
  AgentRunEvent,
  AgentRunStarted,
  AgentSkillInfo,
  DetectedAgentAdapter,
  StartMaterialAgentRunRequest,
} from "@/types/agent-runtime"

export type TauriAgentRuntimeApi = {
  invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>
  listen?: <T>(event: string, handler: (event: { payload: T }) => void) => Promise<() => void>
}

export type TauriAgentRuntime = {
  detectAdapters: () => Promise<DetectedAgentAdapter[]>
  listSkills: () => Promise<AgentSkillInfo[]>
  startMaterialRun: (request: StartMaterialAgentRunRequest) => Promise<AgentRunStarted>
  cancelRun: (runId: string) => Promise<void>
  getMaterialRunResult: (runId: string) => Promise<AgentMaterialRunResult>
  onRunEvent: (handler: (event: AgentRunEvent) => void) => Promise<() => void>
}

export function createTauriAgentRuntime(api: TauriAgentRuntimeApi): TauriAgentRuntime {
  const requireListen = () => {
    if (!api.listen) throw new Error("Tauri event listener is unavailable")
    return api.listen
  }

  return {
    detectAdapters: () => api.invoke("agent_detect_adapters"),
    listSkills: () => api.invoke("agent_list_skills"),
    startMaterialRun: (request) => api.invoke("agent_start_material_run", { request }),
    cancelRun: (runId) => api.invoke("agent_cancel_run", { runId }),
    getMaterialRunResult: (runId) => api.invoke("agent_get_material_run_result", { runId }),
    onRunEvent: (handler) => requireListen()<AgentRunEvent>("agent://run-event", (event) => handler(event.payload)),
  }
}
```

- [ ] **Step 4: Add browser loader helper**

Create `lib/agent/material-run.ts`:

```ts
import { createTauriAgentRuntime, type TauriAgentRuntime } from "@/lib/desktop/tauri-agent-runtime"
import type { StartMaterialAgentRunRequest } from "@/types/agent-runtime"

export async function loadTauriAgentRuntime(): Promise<TauriAgentRuntime> {
  const [{ invoke }, { listen }] = await Promise.all([
    import("@tauri-apps/api/core"),
    import("@tauri-apps/api/event"),
  ])
  return createTauriAgentRuntime({ invoke, listen })
}

export function canStartMaterialAgentRun(request: StartMaterialAgentRunRequest): string[] {
  const errors: string[] = []
  if (!request.adapterId) errors.push("请先在顶部 Agent 菜单选择 Codex CLI 或 Claude Code")
  if (!request.model?.trim()) errors.push("请先在顶部 Agent 菜单选择模型")
  if (!request.skillId.trim()) errors.push("请选择素材处理 Skill")
  if (!request.title.trim()) errors.push("请填写素材标题")
  if (!request.topic.trim()) errors.push("请填写采集或解析主题")
  if (request.sourceText.trim().length < 20 && request.userInstruction.trim().length < 10) {
    errors.push("请提供至少 20 字资料正文，或写清楚采集要求")
  }
  return errors
}
```

- [ ] **Step 5: Run bridge tests**

Run:

```powershell
npm.cmd run test -- test/lib/agent/material-run.test.ts
```

Expected: pass.

## Task 10: Materials Page Runtime Wiring

**Files:**

- Modify: `app/materials/page.tsx`
- Modify: `lib/agent/material-run.ts`
- Modify: `lib/material/processor.ts`

This task assumes `docs/superpowers/plans/2026-05-26-agent-frontend-alignment.md` has already added the current-project-aligned topbar Agent menu and the Materials `Agent 采集` tab. This task enables the tab by wiring it to the real Tauri runtime without reintroducing a page-local adapter/model picker.

- [ ] **Step 1: Update validation helper for global executor input**

Modify `lib/agent/material-run.ts`:

```ts
export function canStartMaterialAgentRun(request: StartMaterialAgentRunRequest): string[] {
  const errors: string[] = []
  if (!request.adapterId) errors.push("请先在顶部 Agent 菜单选择 Codex CLI 或 Claude Code")
  if (!request.model?.trim()) errors.push("请先在顶部 Agent 菜单选择模型")
  if (!request.skillId.trim()) errors.push("请选择素材处理 Skill")
  if (!request.title.trim()) errors.push("请填写素材标题")
  if (!request.topic.trim()) errors.push("请填写采集或解析主题")
  if (request.sourceText.trim().length < 20 && request.userInstruction.trim().length < 10) {
    errors.push("请提供至少 20 字资料正文，或写清楚采集要求")
  }
  return errors
}
```

- [ ] **Step 2: Add runtime imports in Materials page**

In `app/materials/page.tsx`, add or keep these imports:

```ts
import { useRuntime } from "@/lib/runtime-store"
import { displayAgentExecutor } from "@/lib/agent/executor-settings"
import { loadTauriAgentRuntime, canStartMaterialAgentRun } from "@/lib/agent/material-run"
import { parseAgentMaterialOutput, toMaterialDraftFromAgentOutput } from "@/lib/agent/material-output"
import { agentRepository, materialInboxRepository } from "@/lib/storage/repositories"
import type { AgentRunEvent, AgentSkillInfo } from "@/types/agent-runtime"
```

- [ ] **Step 3: Use global executor state and load skills only**

Inside `MaterialsPage`, keep the frontend alignment state and add runtime state:

```ts
const { agentExecutor } = useRuntime()
const [skills, setSkills] = useState<AgentSkillInfo[]>([])
const [selectedSkillId, setSelectedSkillId] = useState("gongkao-hotspot-collector")
const [agentInstruction, setAgentInstruction] = useState("")
const [agentEvents, setAgentEvents] = useState<AgentRunEvent[]>([])
const [activeRunId, setActiveRunId] = useState("")
```

Load skills, not adapters:

```ts
useEffect(() => {
  let cancelled = false
  void loadTauriAgentRuntime()
    .then(async (runtime) => {
      const nextSkills = await runtime.listSkills()
      if (!cancelled) setSkills(nextSkills)
    })
    .catch(() => {
      if (!cancelled) setSkills([])
    })
  return () => {
    cancelled = true
  }
}, [])
```

- [ ] **Step 4: Add processing handler that uses topbar executor selection**

Add inside `MaterialsPage`:

```ts
const handleAgentProcess = async () => {
  const request = {
    adapterId: agentExecutor.adapterId,
    model: agentExecutor.model,
    reasoning: agentExecutor.reasoning,
    skillId: selectedSkillId,
    title: title.trim() || "Agent 采集素材",
    topic: title.trim() || "公考热点素材",
    sourceText: cleanMaterialText(rawText),
    sourceType: fileName ? inferSourceTypeFromFileName(fileName) : "text",
    originalName: fileName || undefined,
    userInstruction: agentInstruction,
  } as const

  const errors = canStartMaterialAgentRun(request)
  if (errors.length > 0) {
    toast.error(errors[0])
    return
  }

  setProcessing(true)
  setAgentEvents([])
  try {
    const runtime = await loadTauriAgentRuntime()
    const started = await runtime.startMaterialRun(request)
    setActiveRunId(started.runId)
    const unlisten = await runtime.onRunEvent((event) => {
      if (event.runId === started.runId) setAgentEvents((current) => [...current, event])
    })

    await agentRepository.saveRun({
      id: started.runId,
      adapterId: request.adapterId,
      skillId: request.skillId,
      status: "running",
      title: request.title,
      startedAt: new Date().toISOString(),
      workspacePath: started.workspacePath,
      summary: `${displayAgentExecutor(agentExecutor)} 正在处理素材`,
    })

    await new Promise<void>((resolve) => {
      const timer = window.setInterval(() => {
        setAgentEvents((events) => {
          if (events.some((event) => event.runId === started.runId && ["completed", "failed", "cancelled"].includes(event.kind))) {
            window.clearInterval(timer)
            resolve()
          }
          return events
        })
      }, 500)
    })
    unlisten()

    const result = await runtime.getMaterialRunResult(started.runId)
    const parsed = parseAgentMaterialOutput(result.outputJson)
    if (!parsed.ok) {
      await materialInboxRepository.saveDraft({
        id: crypto.randomUUID(),
        runId: started.runId,
        status: "pending",
        createdAt: new Date().toISOString(),
        outputJson: result.outputJson,
        validationErrors: parsed.errors,
      })
      toast.error(parsed.errors[0] ?? "Agent 输出未通过校验")
      return
    }

    const nextDraft = toMaterialDraftFromAgentOutput(parsed.value)
    const draftErrors = validateMaterialDraft(nextDraft)
    if (draftErrors.length > 0) {
      toast.error(draftErrors[0])
      return
    }
    setSourceInput(parsed.value.source)
    setDraft(nextDraft)
    await materialInboxRepository.saveDraft({
      id: crypto.randomUUID(),
      runId: started.runId,
      status: "pending",
      createdAt: new Date().toISOString(),
      outputJson: result.outputJson,
      validationErrors: [],
    })
    await agentRepository.saveRun({
      id: started.runId,
      adapterId: request.adapterId,
      skillId: request.skillId,
      status: "completed",
      title: request.title,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      workspacePath: result.workspacePath,
      summary: parsed.value.report.summary,
    })
    toast.success("Agent 已生成候选素材，请确认后入库")
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Agent 素材处理失败")
  } finally {
    setProcessing(false)
  }
}
```

- [ ] **Step 5: Keep Agent tab UI aligned with global selector**

The `Agent 采集` tab must contain a compact global environment hint:

```tsx
<div className="rounded-md border border-secondary/25 bg-secondary/10 p-3 text-sm text-secondary">
  <div className="font-medium">当前执行环境：{displayAgentExecutor(agentExecutor)}</div>
  <p className="mt-1 text-xs leading-relaxed text-secondary/80">
    由顶部 Agent 菜单统一管理。素材页只负责任务、Skill、结果确认。
  </p>
</div>
```

Keep only the Skill selector, instruction textarea, optional local-file context area, event feed, and start button:

```tsx
<Button disabled={processing} onClick={handleAgentProcess}>
  {processing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
  启动 Agent 加工
</Button>
```

Do not add `<Label>Agent Adapter</Label>` or a page-local adapter/model `<select>`.

- [ ] **Step 6: Run page type check**

Run:

```powershell
npx.cmd tsc --noEmit
```

Expected: pass.

## Task 11: Settings Diagnostics Runtime Wiring

**Files:**

- Modify: `app/settings/page.tsx`

This task upgrades the frontend alignment card from static placeholder status to real backend detection. It still does not move selection into Settings.

- [ ] **Step 1: Import runtime bridge types**

In `app/settings/page.tsx`, import:

```ts
import { loadTauriAgentRuntime } from "@/lib/agent/material-run"
import { displayAgentExecutor } from "@/lib/agent/executor-settings"
import type { DetectedAgentAdapter } from "@/types/agent-runtime"
```

- [ ] **Step 2: Read global selection and add detection state**

Use the existing `useRuntime()` call:

```ts
const { themeColor, setThemeColor, agentExecutor } = useRuntime()
```

Add state:

```ts
const [detectedAgentAdapters, setDetectedAgentAdapters] = useState<DetectedAgentAdapter[]>([])
const [agentChecking, setAgentChecking] = useState(false)
```

- [ ] **Step 3: Add refresh handler**

Add:

```ts
const refreshAgentAdapters = async () => {
  setAgentChecking(true)
  try {
    const runtime = await loadTauriAgentRuntime()
    setDetectedAgentAdapters(await runtime.detectAdapters())
  } catch {
    setDetectedAgentAdapters([])
  } finally {
    setAgentChecking(false)
  }
}
```

Call it once:

```ts
useEffect(() => {
  void refreshAgentAdapters()
}, [])
```

- [ ] **Step 4: Render diagnostics card**

The card should say the topbar owns selection:

```tsx
<Card>
  <CardHeader>
    <CardTitle>素材 Agent 执行环境</CardTitle>
    <CardDescription>
      日常切换在顶部 Agent 菜单；这里显示 Codex CLI / Claude Code 的真实检测、路径、版本和排错信息。
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-3">
    <div className="rounded-md border border-secondary/25 bg-secondary/10 p-3 text-sm text-secondary">
      当前选择：{displayAgentExecutor(agentExecutor)}
    </div>
    <Button variant="outline" onClick={refreshAgentAdapters} disabled={agentChecking}>
      {agentChecking ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
      重新检测
    </Button>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {detectedAgentAdapters.map((adapter) => (
        <div key={adapter.id} className="rounded-md border p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="font-medium">{adapter.name}</div>
            <Badge variant={adapter.available ? "default" : "outline"}>
              {adapter.available ? "可用" : "未检测到"}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground mt-2 space-y-1">
            <div>{adapter.version || "未读取版本"}</div>
            <div>{adapter.path || "未读取路径"}</div>
            <div>{adapter.message}</div>
          </div>
        </div>
      ))}
    </div>
  </CardContent>
</Card>
```

- [ ] **Step 5: Run type check**

Run:

```powershell
npx.cmd tsc --noEmit
```

Expected: pass.

## Deprecated Task 10: Materials Page Integration (Do Not Execute)

> This section is superseded by Task 10 above and kept only as historical context. It contains a page-local Agent Adapter picker, which conflicts with the approved frontend alignment.

**Files:**

- Modify: `app/materials/page.tsx`
- Modify: `lib/material/processor.ts`

- [ ] **Step 1: Add state and runtime loading**

In `app/materials/page.tsx`, add imports:

```ts
import { loadTauriAgentRuntime, canStartMaterialAgentRun } from "@/lib/agent/material-run"
import { parseAgentMaterialOutput, toMaterialDraftFromAgentOutput } from "@/lib/agent/material-output"
import { agentRepository, materialInboxRepository } from "@/lib/storage/repositories"
import type { AgentRunEvent, AgentSkillInfo, DetectedAgentAdapter } from "@/types/agent-runtime"
```

Add component state:

```ts
const [adapters, setAdapters] = useState<DetectedAgentAdapter[]>([])
const [skills, setSkills] = useState<AgentSkillInfo[]>([])
const [selectedAdapterId, setSelectedAdapterId] = useState<"codex" | "claude">("codex")
const [selectedSkillId, setSelectedSkillId] = useState("gongkao-material-parser")
const [agentInstruction, setAgentInstruction] = useState("")
const [agentEvents, setAgentEvents] = useState<AgentRunEvent[]>([])
const [activeRunId, setActiveRunId] = useState("")
```

Add `useEffect` to load adapters and skills:

```ts
useEffect(() => {
  let cancelled = false
  void loadTauriAgentRuntime()
    .then(async (runtime) => {
      const [nextAdapters, nextSkills] = await Promise.all([runtime.detectAdapters(), runtime.listSkills()])
      if (cancelled) return
      setAdapters(nextAdapters)
      setSkills(nextSkills)
    })
    .catch(() => {
      if (!cancelled) {
        setAdapters([])
        setSkills([])
      }
    })
  return () => {
    cancelled = true
  }
}, [])
```

- [ ] **Step 2: Add agent processing handler**

Add inside `MaterialsPage`:

```ts
const handleAgentProcess = async () => {
  const request = {
    adapterId: selectedAdapterId,
    skillId: selectedSkillId,
    title: title.trim() || "Agent 采集素材",
    topic: title.trim() || "公考热点素材",
    sourceText: cleanMaterialText(rawText),
    sourceType: fileName ? inferSourceTypeFromFileName(fileName) : "text",
    originalName: fileName || undefined,
    userInstruction: agentInstruction,
  } as const

  const errors = canStartMaterialAgentRun(request)
  if (errors.length > 0) {
    toast.error(errors[0])
    return
  }

  setProcessing(true)
  setAgentEvents([])
  try {
    const runtime = await loadTauriAgentRuntime()
    const unlisten = await runtime.onRunEvent((event) => {
      setAgentEvents((current) => (event.runId === activeRunId || !activeRunId ? [...current, event] : current))
    })
    const started = await runtime.startMaterialRun(request)
    setActiveRunId(started.runId)
    await agentRepository.saveRun({
      id: started.runId,
      adapterId: selectedAdapterId,
      skillId: selectedSkillId,
      status: "running",
      title: request.title,
      startedAt: new Date().toISOString(),
      workspacePath: started.workspacePath,
      summary: "Agent 正在处理素材",
    })

    const waitForCompletion = new Promise<void>((resolve) => {
      const timer = window.setInterval(() => {
        setAgentEvents((events) => {
          if (events.some((event) => event.runId === started.runId && ["completed", "failed", "cancelled"].includes(event.kind))) {
            window.clearInterval(timer)
            resolve()
          }
          return events
        })
      }, 500)
    })
    await waitForCompletion
    unlisten()

    const result = await runtime.getMaterialRunResult(started.runId)
    const parsed = parseAgentMaterialOutput(result.outputJson)
    if (!parsed.ok) {
      await materialInboxRepository.saveDraft({
        id: crypto.randomUUID(),
        runId: started.runId,
        status: "pending",
        createdAt: new Date().toISOString(),
        outputJson: result.outputJson,
        validationErrors: parsed.errors,
      })
      toast.error(parsed.errors[0] ?? "Agent 输出未通过校验")
      return
    }

    const nextDraft = toMaterialDraftFromAgentOutput(parsed.value)
    const draftErrors = validateMaterialDraft(nextDraft)
    if (draftErrors.length > 0) {
      toast.error(draftErrors[0])
      return
    }
    setSourceInput(parsed.value.source)
    setDraft(nextDraft)
    await materialInboxRepository.saveDraft({
      id: crypto.randomUUID(),
      runId: started.runId,
      status: "pending",
      createdAt: new Date().toISOString(),
      outputJson: result.outputJson,
      validationErrors: [],
    })
    await agentRepository.saveRun({
      id: started.runId,
      adapterId: selectedAdapterId,
      skillId: selectedSkillId,
      status: "completed",
      title: request.title,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      workspacePath: result.workspacePath,
      summary: parsed.value.report.summary,
    })
    toast.success("Agent 已生成候选素材，请确认后入库")
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Agent 素材处理失败")
  } finally {
    setProcessing(false)
  }
}
```

After implementing, simplify the completion wait by using a `useRef` for `activeRunId` if React state closure issues appear in testing.

- [ ] **Step 3: Add UI tab**

Inside the existing input card tabs, add a third trigger:

```tsx
<TabsTrigger value="agent">CLI Agent</TabsTrigger>
```

Add content:

```tsx
<TabsContent value="agent" className="space-y-4">
  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
    <div className="space-y-1.5">
      <Label>Agent Adapter</Label>
      <select
        className="w-full h-10 rounded-md border bg-background px-3 text-sm"
        value={selectedAdapterId}
        onChange={(event) => setSelectedAdapterId(event.target.value as "codex" | "claude")}
      >
        {adapters.map((adapter) => (
          <option key={adapter.id} value={adapter.id} disabled={!adapter.available}>
            {adapter.name} {adapter.available ? "可用" : "未检测到"}
          </option>
        ))}
      </select>
    </div>
    <div className="space-y-1.5">
      <Label>处理 Skill</Label>
      <select
        className="w-full h-10 rounded-md border bg-background px-3 text-sm"
        value={selectedSkillId}
        onChange={(event) => setSelectedSkillId(event.target.value)}
      >
        {skills.map((skill) => (
          <option key={skill.id} value={skill.id}>
            {skill.name}
          </option>
        ))}
      </select>
    </div>
  </div>
  <Textarea
    value={agentInstruction}
    onChange={(event) => setAgentInstruction(event.target.value)}
    placeholder="写清楚要采集的主题、优先平台、指定 URL 或结构化要求。例如：围绕数字乡村建设，优先官方政策和主流媒体评论，生成温故闪卡、对策题和字帖表达。"
    className="min-h-[120px]"
  />
  <Button disabled={processing} onClick={handleAgentProcess}>
    {processing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
    启动 CLI Agent 加工
  </Button>
  {agentEvents.length > 0 && (
    <div className="rounded-md border bg-muted/30 p-3 max-h-52 overflow-auto text-xs space-y-1">
      {agentEvents.slice(-30).map((event, index) => (
        <div key={`${event.runId}-${index}`} className="font-mono">
          [{event.kind}] {event.message}
        </div>
      ))}
    </div>
  )}
</TabsContent>
```

- [ ] **Step 4: Run page type check**

Run:

```powershell
npx.cmd tsc --noEmit
```

Expected: pass.

## Deprecated Task 11: Settings Adapter Status (Do Not Execute)

> This section is superseded by Task 11 above and kept only as historical context. It puts selection pressure into Settings; the aligned design uses Settings only for diagnostics.

**Files:**

- Modify: `app/settings/page.tsx`

- [ ] **Step 1: Add agent adapter status card**

In `app/settings/page.tsx`, import:

```ts
import { loadTauriAgentRuntime } from "@/lib/agent/material-run"
import type { DetectedAgentAdapter } from "@/types/agent-runtime"
```

Add state:

```ts
const [agentAdapters, setAgentAdapters] = useState<DetectedAgentAdapter[]>([])
const [agentChecking, setAgentChecking] = useState(false)
```

Add handler:

```ts
const refreshAgentAdapters = async () => {
  setAgentChecking(true)
  try {
    const runtime = await loadTauriAgentRuntime()
    setAgentAdapters(await runtime.detectAdapters())
  } catch {
    setAgentAdapters([])
  } finally {
    setAgentChecking(false)
  }
}
```

Call it once from an existing `useEffect` or a new one:

```ts
useEffect(() => {
  void refreshAgentAdapters()
}, [])
```

Add a settings card near AI settings:

```tsx
<Card>
  <CardHeader>
    <CardTitle>素材 Agent Adapter</CardTitle>
    <CardDescription>当前先支持 Codex CLI 和 Claude Code。采集、解析、结构化由本机 CLI 执行，正式入库仍需应用校验和用户确认。</CardDescription>
  </CardHeader>
  <CardContent className="space-y-3">
    <Button variant="outline" onClick={refreshAgentAdapters} disabled={agentChecking}>
      {agentChecking ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
      重新检测
    </Button>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {agentAdapters.map((adapter) => (
        <div key={adapter.id} className="rounded-md border p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="font-medium">{adapter.name}</div>
            <Badge variant={adapter.available ? "default" : "outline"}>
              {adapter.available ? "可用" : "未检测到"}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground mt-2 space-y-1">
            <div>{adapter.version || "未读取版本"}</div>
            <div>{adapter.message}</div>
          </div>
        </div>
      ))}
    </div>
  </CardContent>
</Card>
```

- [ ] **Step 2: Run type check**

Run:

```powershell
npx.cmd tsc --noEmit
```

Expected: pass.

## Task 12: End-To-End Verification

**Files:**

- No new files.

- [ ] **Step 1: Run targeted TypeScript tests**

Run:

```powershell
npm.cmd run test -- test/lib/agent/executor-settings.test.ts test/lib/agent/material-output.test.ts test/lib/agent/material-run.test.ts test/lib/storage/repositories.test.ts
```

Expected: all pass.

- [ ] **Step 2: Run Rust tests**

Run:

```powershell
$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"; cargo test -q agent::
```

Expected: all agent module tests pass.

- [ ] **Step 3: Run full frontend checks**

Run:

```powershell
npm.cmd run test
```

Expected: all Vitest tests pass.

Run:

```powershell
npx.cmd tsc --noEmit
```

Expected: no TypeScript errors.

Run:

```powershell
npm.cmd run lint
```

Expected: no lint errors.

- [ ] **Step 4: Run desktop compile**

Run:

```powershell
$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"; cargo check
```

Expected: pass.

- [ ] **Step 5: Manual desktop test**

Run:

```powershell
npm.cmd run desktop:dev
```

Expected:

1. Open the topbar Agent menu.
2. Choose Codex CLI or Claude Code, then choose model and reasoning where applicable.
3. Open Settings and confirm the diagnostics card shows real Codex/Claude detection status, path, and version.
4. Open Materials.
5. Open the `Agent 采集` tab.
6. Confirm the tab shows the same current execution environment as the topbar menu and does not show a page-local Adapter picker.
7. Select `gongkao-material-parser`.
8. Paste at least 20 Chinese characters of public-exam material or write a clear collection instruction.
9. Start Agent processing.
10. Event feed streams status/text.
11. After completion, preview panel shows topic, keywords, flashcards, questions, and copybook items.
12. “确认导入本地题库” writes data into the existing local material stores.

- [ ] **Step 6: Package verification**

Run:

```powershell
npm.cmd run desktop:build
```

Expected:

- The desktop package builds.
- Packaged app can detect Codex/Claude if the CLI is installed on the user machine and visible to the packaged app's environment.
- If no CLI is detected, Settings shows clear unavailable status and Materials disables Agent execution without breaking pasted text / file import.

## Risk Notes

- Codex and Claude CLI authentication stays owned by the CLI. The app should not store their tokens.
- On Windows, Codex may require broad sandbox mode for non-interactive shell execution. This is inherited from the CLI, not silently invented by the app. The run workspace and final database gate reduce data risk, but they are not an OS sandbox.
- Web collection capability depends on the selected CLI's available tools and network permissions. The app should surface failures in `report.md` and the event feed rather than pretending every platform is reachable.
- The app must not use user browser cookies, log into platforms, bypass paywalls, or scrape private data.
- The first implementation must not include Obsidian, external wiki sync, or extra agent families beyond Codex CLI and Claude Code.

## Self-Review

Spec coverage:

- open-design bottom-layer paradigm mapped: skill folders, prompt injection, staged skill side files, adapter detection, CLI process launch, event streams, run result files.
- Gongkao migration covered: topbar global Agent execution environment, Materials page runtime handoff, IndexedDB inbox, final validated import path, Settings diagnostics.
- User constraints covered: no Obsidian; first adapters are Codex CLI and Claude Code; Materials page does not own Adapter/model selection; CLI can handle collection/parsing while app owns validation and入库.

Placeholder scan:

- No task uses “TBD” or “TODO”.
- Every implementation step names exact files and concrete commands.

Type consistency:

- Rust DTO fields use `camelCase` serde and match `types/agent-runtime.ts`.
- `StartMaterialAgentRunRequest` includes `adapterId`, `model`, and `reasoning`, matching the topbar global executor contract.
- `material-draft.json` maps to `AgentMaterialOutput`, then to existing `MaterialDraft`, then into existing `buildImportBundle()`.
