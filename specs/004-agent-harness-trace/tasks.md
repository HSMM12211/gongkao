# Tasks: Agent Harness Trace State Machine

**Input**: Design documents from `/specs/004-agent-harness-trace/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/trace-runtime.md`, `quickstart.md`

**Tests**: Required by FR-012.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm existing runtime structure and add shared trace type surfaces.

- [x] T001 Extend Agent runtime probe and event types with trace availability fields in `types/agent-runtime.ts`
- [x] T002 Extend Rust Agent run status probe type with trace availability in `src-tauri/src/agent/types.rs`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared trace mapping and persistence helpers used by all user stories.

- [x] T003 [P] Add TypeScript trace parsing and summarizing helpers in `lib/agent/trace.ts`
- [x] T004 [P] Add TypeScript unit tests for trace helpers in `test/lib/agent/trace.test.ts`
- [x] T005 Add Rust trace append helper in `src-tauri/src/agent/trace.rs`
- [x] T006 Register Rust trace module in `src-tauri/src/agent/mod.rs`

---

## Phase 3: User Story 1 - See Agent Execution Trace (Priority: P1)

**Goal**: Users see ordered Agent Harness steps for startup, output/thinking, tool calls, file writes, validation, and failure/completion.

**Independent Test**: Run `npm test -- run-process` and verify event mapping covers Harness phases.

### Tests for User Story 1

- [x] T007 [P] [US1] Extend run process unit tests for thinking, tool, observation, artifact, validation, waiting review, and failure phases in `test/lib/agent/run-process.test.ts`

### Implementation for User Story 1

- [x] T008 [US1] Extend Agent process stage mapping in `lib/agent/run-process.ts`
- [x] T009 [US1] Update materials workbench event handling to append validation and review-boundary events in `app/materials/page.tsx`
- [x] T010 [US1] Update Agent process panel copy and status badges for Harness trace phases in `app/materials/page.tsx`

---

## Phase 4: User Story 2 - Persist Trace For Recovery And Debugging (Priority: P2)

**Goal**: Every material Agent run writes a local trace artifact and workspace probes expose trace availability.

**Independent Test**: Run Rust agent tests and TypeScript run-status tests to verify trace file availability is detected.

### Tests for User Story 2

- [x] T011 [P] [US2] Extend run status sync tests for `hasTrace` compatibility in `test/lib/agent/run-status-sync.test.ts`
- [x] T012 [US2] Extend Rust agent runner tests for `trace.jsonl` detection in `src-tauri/src/agent/runner.rs`

### Implementation for User Story 2

- [x] T013 [US2] Append emitted Tauri Agent run events to `trace.jsonl` in `src-tauri/src/agent/runner.rs`
- [x] T014 [US2] Include trace detection in workspace probing in `src-tauri/src/agent/runner.rs`
- [x] T015 [US2] Surface trace availability in frontend run status reconciliation in `lib/agent/run-status-sync.ts`

---

## Phase 5: User Story 3 - Enforce Review Before Official Import (Priority: P3)

**Goal**: Successful Agent output is visibly treated as a review candidate, while invalid output remains failed and does not imply official import.

**Independent Test**: Run material output and workbench tests, then inspect `/materials` behavior during a successful run.

### Tests for User Story 3

- [x] T016 [P] [US3] Add review-boundary assertions to material workbench tests in `test/lib/agent/material-workbench-session.test.ts`

### Implementation for User Story 3

- [x] T017 [US3] Persist review-oriented run summaries after successful validation in `app/materials/page.tsx`
- [x] T018 [US3] Ensure failed validation still saves Inbox diagnostics without marking official import complete in `app/materials/page.tsx`

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify the feature and keep SDD artifacts accurate.

- [x] T019 Run focused frontend tests with `npm test -- run-process trace run-status-sync material-workbench-session`
- [x] T020 Run TypeScript verification with `npx tsc --noEmit`
- [x] T021 Run focused Rust verification with `cargo test agent` from `src-tauri`
- [x] T022 Update `specs/004-agent-harness-trace/tasks.md` to mark completed tasks

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 blocks all implementation.
- Phase 2 blocks all user stories.
- User stories should run in priority order: US1 -> US2 -> US3.
- Polish runs after all selected stories are complete.

### Parallel Opportunities

- T003 and T004 can be developed independently once type surfaces are known.
- T007 and T011 can be written in parallel because they cover different frontend modules.
- T016 can be written after US1 and US2 are in place.

## Implementation Strategy

1. Add type surfaces and trace helpers.
2. Make current in-memory UI trace richer and testable.
3. Persist Tauri events to local workspace trace.
4. Expose trace availability through probe/reconciliation.
5. Make validation/review boundary visible.
6. Run focused tests and mark tasks complete.
