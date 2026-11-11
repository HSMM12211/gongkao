# Feature Specification: Agent Harness Trace State Machine

**Feature Branch**: `codex/004-agent-harness-trace`

**Created**: 2026-06-03

**Status**: Draft

**Input**: User description: "Use SDD to develop from `docs/superpowers/specs/2026-06-03-gongkao-agent-harness.md`, starting with the shared Agent Harness foundation: run state machine, trace persistence, observable CLI thinking/tool/output/validation flow, and safe review before import."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See Agent Execution Trace (Priority: P1)

A user starts a materials Agent task from the workbench and can see the full execution path rather than only a final success or failure message. The trace shows the task being prepared, the local CLI starting, model thinking or text output, tool calls, file writes, validation, and completion or failure.

**Why this priority**: The user wants the app to behave like an Agent Harness, not a hidden prompt runner. Without an observable trace, later Tool Registry, PDF fallback, and Verifier work cannot be trusted or debugged.

**Independent Test**: Start a Skill run that emits local CLI stream events and writes `material-draft.json`; verify the run detail timeline contains ordered phase entries for startup, output/tool activity, artifact write, validation, and completion.

**Acceptance Scenarios**:

1. **Given** a user starts a material Agent run, **When** the local CLI emits stdout, thinking, tool, file, and completion events, **Then** the UI presents them as a readable ordered Agent trace.
2. **Given** an Agent run writes `material-draft.json`, **When** the app reads the result, **Then** the trace includes a validation phase before the run is considered ready for review.
3. **Given** an Agent run fails, **When** the user opens the run detail, **Then** the trace shows the failure phase and the latest error message without hiding previous useful events.

---

### User Story 2 - Persist Trace For Recovery And Debugging (Priority: P2)

A user or developer can recover the run trace after page navigation, refresh, or app restart. The run workspace stores structured trace records alongside stdout, stderr, prompt, input, and generated artifacts.

**Why this priority**: Long document and Skill tasks are slow and failure-prone. If the trace disappears when the user switches pages, the user cannot understand whether the task is still running, failed, or ready for import.

**Independent Test**: Run an Agent task, navigate away from the materials page and back, then verify the latest run summary and trace can be reconstructed from the workspace record.

**Acceptance Scenarios**:

1. **Given** a run has emitted multiple events, **When** the app writes the run workspace, **Then** the workspace contains a machine-readable trace file.
2. **Given** the user revisits the materials page after a run finishes, **When** the app probes the run workspace, **Then** it can show whether artifacts and trace records exist.
3. **Given** a stale or failed run, **When** the user reviews the run, **Then** the persisted trace still contains enough information to retry or report the problem.

---

### User Story 3 - Enforce Review Before Official Import (Priority: P3)

A user can see that Agent output is a candidate artifact and must pass validation before entering Inbox or the standard question-bank import flow. The trace identifies the handoff from Agent output to application validation.

**Why this priority**: The Agent Harness principle requires the app, not the model, to control official writes. Visible validation and review boundaries reduce polluted materials and bad question-bank imports.

**Independent Test**: Complete a run and verify the UI labels the output as "waiting review" or "validated candidate" rather than directly imported official data.

**Acceptance Scenarios**:

1. **Given** an Agent run completes, **When** validation succeeds, **Then** the run status becomes review-oriented instead of silently importing official data.
2. **Given** validation fails, **When** the output schema is invalid, **Then** the user sees validation errors and no import action is treated as completed.
3. **Given** a valid run result, **When** the user chooses to import, **Then** the app still uses the existing application import flow and preserves provenance.

### Edge Cases

- The local CLI emits plain stdout instead of JSONL structured frames.
- The local CLI exits successfully but does not write `material-draft.json`.
- `material-draft.json` exists but is invalid JSON.
- A run is cancelled while stdout/stderr readers are still active.
- A user navigates away and back while a run is still running.
- A trace file exists but includes malformed JSONL records.
- A long task emits many events; the UI should stay readable and not freeze.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST define a unified Agent run phase model covering queued, context preparation, planning, running, tool activity, observation, artifact writing, validation, waiting review, completion, failure, and cancellation.
- **FR-002**: System MUST map local CLI stdout, stderr, thinking, text, tool, file write, completion, cancellation, and error frames into readable Agent trace steps.
- **FR-003**: System MUST persist machine-readable trace records in each isolated Agent run workspace.
- **FR-004**: System MUST keep trace persistence separate from official study data persistence.
- **FR-005**: Users MUST be able to see the latest run trace in the materials Agent workbench.
- **FR-006**: System MUST include validation-related trace steps before presenting Agent output as ready for review.
- **FR-007**: System MUST mark successful Agent output as a candidate waiting for review, not as automatically imported official data.
- **FR-008**: System MUST preserve previous trace events when a later event fails, is malformed, or is unknown.
- **FR-009**: System MUST support recovering at least the latest completed or failed run state from the workspace artifact.
- **FR-010**: System MUST expose run trace availability when probing a run workspace.
- **FR-011**: System MUST keep existing Skill and `material-draft.json` workflows compatible.
- **FR-012**: Core trace mapping, persistence, and run status behavior MUST be covered by focused automated tests.

### Key Entities *(include if feature involves data)*

- **AgentRunTrace**: The machine-readable record for one run, including run id, adapter, model, task summary, phase entries, artifacts, validation summaries, and timestamps.
- **AgentTraceStep**: A single ordered step in the run, such as CLI started, thinking, tool call, file write, validation, failure, or completion.
- **RunWorkspaceProbe**: A status summary for a workspace, including whether output artifacts, reports, and trace records exist.
- **ReviewBoundary**: The state that separates Agent-generated candidates from official imported data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A normal material Agent run produces at least five trace steps: start, CLI output or thinking, artifact write, validation, and completion or review-ready state.
- **SC-002**: A failed run preserves prior trace steps and displays the final failure reason.
- **SC-003**: Every run workspace that receives events stores a machine-readable trace file.
- **SC-004**: Page navigation does not erase the latest run summary or trace availability.
- **SC-005**: Valid Agent output is shown as a candidate requiring application review instead of being silently treated as official imported data.
- **SC-006**: Automated tests cover event-to-trace mapping, trace file parsing, workspace probe trace detection, and failed-output handling.

## Assumptions

- The first SDD slice implements the shared Harness trace foundation, not the full Tool Registry, Memory, or multi-Agent workflow.
- Existing Codex CLI / Claude Code Adapter behavior remains the runtime source for stream events.
- Existing `material-draft.json` validation and import flow remain the official write boundary.
- Persisted trace records are local-only and live inside the existing isolated run workspace.
