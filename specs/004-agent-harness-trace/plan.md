# Implementation Plan: Agent Harness Trace State Machine

**Branch**: `codex/004-agent-harness-trace` | **Date**: 2026-06-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-agent-harness-trace/spec.md`

## Summary

Implement the first Agent Harness foundation slice: a unified trace phase model, persisted local run trace artifact, workspace probe trace visibility, and a materials workbench timeline that can distinguish CLI output, thinking/text streams, tool calls, file writes, validation, failures, cancellation, and review boundary status.

The technical approach reuses the existing Tauri Agent runtime and frontend `AgentRunProcessPanel`. Backend stream events will be appended to `trace.jsonl` in each isolated `agent-runs/<runId>` workspace. Existing event parsing remains compatible. Frontend trace mapping will be extended with review-ready and artifact/validation phases, while workspace probes expose `hasTrace` so the app can recover trace availability after navigation.

## Technical Context

**Language/Version**: TypeScript/React/Next.js for frontend and local API; Rust for Tauri desktop runtime

**Primary Dependencies**: Next.js app router, Vitest, Tauri, serde/serde_json, existing local IndexedDB repositories

**Storage**: Local IndexedDB for Agent run records; local workspace files under `agent-runs/<runId>` for trace artifacts

**Testing**: `npm test` for TypeScript unit tests; `cargo test` under `src-tauri` for Rust runtime units; `npx tsc --noEmit` and `npm run lint` for verification

**Target Platform**: Windows desktop Tauri app and local Next dev/runtime environment

**Project Type**: Desktop app with web frontend and Tauri backend

**Performance Goals**: Trace append should not block CLI stream consumption; UI displays a bounded recent step window while preserving full local trace file

**Constraints**: Local-first data, isolated Agent execution, no direct official DB writes by Agent, preserve dirty worktree, keep existing Skill and `material-draft.json` flows compatible

**Scale/Scope**: One run workspace per Agent task; trace may include hundreds of events for long PDF or Skill tasks

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution gates:

- Local-first learning data: PASS. Trace is stored in local run workspace.
- Traceable study assets: PASS. Trace strengthens provenance and validation handoff.
- Test-first core logic: PASS. Add tests before/with trace mapping and probe changes.
- Isolated Skill and Agent execution: PASS. Reuses isolated `agent-runs/<runId>`.
- Incremental, demonstrable delivery: PASS. This feature is the first independently testable Harness slice.

## Project Structure

### Documentation (this feature)

```text
specs/004-agent-harness-trace/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
└── tasks.md
```

### Source Code (repository root)

```text
types/
└── agent-runtime.ts

lib/
└── agent/
    ├── run-process.ts
    ├── trace.ts
    └── run-status-sync.ts

app/
└── materials/
    └── page.tsx

src-tauri/
└── src/
    └── agent/
        ├── runner.rs
        ├── streams.rs
        ├── trace.rs
        └── types.rs

test/
└── lib/
    └── agent/
        ├── run-process.test.ts
        └── trace.test.ts
```

**Structure Decision**: Extend existing Agent runtime modules instead of introducing a separate Agent service. Add small trace helpers in Rust and TypeScript; keep UI changes inside the existing materials workbench and run center.

## Complexity Tracking

No constitution violations.
