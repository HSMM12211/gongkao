# Implementation Plan: AI Agent Orchestrator CLI v1

**Branch**: `007-ai-agent-orchestrator-cli-v1` | **Date**: 2026-06-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/007-ai-agent-orchestrator-cli-v1/spec.md`

## Summary

Upgrade the existing local CLI Agent harness without introducing Codex SDK. The first version makes Agent runs more explicit and recoverable by adding a structured orchestration model: task plan, context summary, memory summary, run evidence, validation summary, and review handoff. The implementation reuses the current Codex CLI / Claude Code adapter layer, Tauri isolated run workspace, material chat stream, trace, verifier, and Inbox flow.

## Technical Context

**Language/Version**: TypeScript 5.7, React 19, Next.js 16, Rust/Tauri 2 desktop backend.

**Primary Dependencies**: Existing `lib/agent`, `/materials` workbench, Tauri Agent runtime, Codex CLI adapter, existing UI components, Vitest.

**Storage**: Existing local workbench session/state, app local repositories, and `agent-runs/<runId>` filesystem workspaces.

**Testing**: Vitest focused tests, `npx tsc --noEmit`, `npm run lint`, targeted Rust `cargo test` when backend runtime code changes.

**Target Platform**: Local web development and Windows Tauri desktop app.

**Project Type**: Local-first desktop/web study application.

**Performance Goals**: Task plan visible within 3 seconds after submission; bounded event rendering; no unbounded local history in Agent prompt.

**Constraints**: Local-first data, Inbox review boundary, isolated Skill/Agent execution, no Codex SDK dependency in v1, preserve existing CLI adapter behavior.

**Scale/Scope**: `/materials` Agent workbench and reusable `lib/agent` orchestration helpers. No full multi-process multi-Agent runtime in v1.

## Constitution Check

- Local-first learning data: PASS. The feature uses local summaries and local run workspaces; it does not add remote data sync.
- Traceable study assets: PASS. It improves provenance by making context, memory, artifacts, validation, and review status explicit.
- Test-first core logic: PASS. New orchestration helpers and persistence changes require focused tests before completion.
- Isolated Skill and Agent execution: PASS. Codex CLI remains isolated in the existing run workspace.
- Incremental delivery: PASS. US1 delivers a useful vertical slice before broader memory and recovery enhancements.

## Project Structure

### Documentation

```text
specs/007-ai-agent-orchestrator-cli-v1/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── agent-orchestrator.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code

```text
lib/agent/
├── orchestrator.ts              # New unified task plan/evidence helpers
├── context-engine.ts            # Extend bounded context summaries if needed
├── memory.ts                    # Extend bounded memory snapshot if needed
├── material-chat.ts             # Display orchestration events in chat
├── material-workbench-session.ts
└── material-workbench-state.ts

app/materials/page.tsx           # Wire orchestration summary into run request and UI

types/
└── agent-runtime.ts             # Extend request/event types only if needed

test/lib/agent/
├── orchestrator.test.ts
├── material-chat.test.ts
├── material-workbench-session.test.ts
└── material-workbench-state.test.ts

src-tauri/src/agent/
├── workspace.rs                 # Prompt includes orchestration summary if backend contract changes
└── runner.rs                    # Runtime event behavior if needed
```

**Structure Decision**: Keep v1 orchestration in TypeScript helpers and pass it through the existing `context.harness` request field. Avoid backend schema churn unless a missing field blocks reliable runtime or recovery behavior.

## Phase 0 Research Decisions

See [research.md](./research.md).

## Phase 1 Design Artifacts

- Data model: [data-model.md](./data-model.md)
- Contract: [contracts/agent-orchestrator.md](./contracts/agent-orchestrator.md)
- Quickstart: [quickstart.md](./quickstart.md)

## Acceptance Matrix

| Requirement | Planned implementation | Verification |
| --- | --- | --- |
| FR-001/FR-002 CLI only | Keep `adapterId=codex` support and no SDK adapter | Code review, no new SDK dependency |
| FR-003 task plan visible | `AgentTaskPlan` helper + assistant plan event | `orchestrator.test.ts`, UI manual check |
| FR-004 lifecycle | Existing run statuses plus orchestration evidence | `material-chat.test.ts`, runtime smoke |
| FR-005 evidence | `AgentRunEvidence` summary from plan/context/memory/events | `orchestrator.test.ts` |
| FR-006 diagnostics | Existing stderr diagnostic mapping retained | `material-chat.test.ts`, trace tests |
| FR-007/FR-014 review gate | Existing verifier + Inbox handoff preserved | `material-output`, `verifier` tests |
| FR-008/FR-009 context | Context summary exposes original/provided size and warnings | `context-engine.test.ts`, `orchestrator.test.ts` |
| FR-010/FR-011 memory | Bounded memory summary only | `memory.test.ts`, `orchestrator.test.ts` |
| FR-012/FR-013 validation | Validation summary from business verifier | `verifier.test.ts`, `orchestrator.test.ts` |
| FR-015/FR-017 recovery | Persist orchestration metadata in workbench session | `material-workbench-session.test.ts` |
| FR-016 cancel | Preserve existing cancel run behavior | Manual desktop check or existing runtime tests |
| FR-018 smoke path | Use existing smoke Skill with clearer evidence | Manual quickstart, optional skill test run |

## Quality Gates

Run before handoff:

```powershell
npm.cmd test -- orchestrator material-chat material-workbench-session material-workbench-state context-engine memory verifier
npx.cmd tsc --noEmit
npm.cmd run lint
```

If backend runtime files change:

```powershell
cargo test --manifest-path src-tauri\Cargo.toml agent::runner::tests agent::workspace::tests agent::streams::tests
```

## Complexity Tracking

No constitution violations. The feature intentionally avoids Codex SDK and true multi-process multi-Agent orchestration in v1.
