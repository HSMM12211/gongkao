# Research: Agent Harness Trace State Machine

## Decision: Persist trace as local JSONL in each run workspace

**Rationale**: The runtime already creates an isolated workspace and writes `input.json`, `prompt.md`, `stdout.log`, `stderr.log`, and `material-draft.json`. A `trace.jsonl` file fits this model, keeps the feature local-first, and avoids IndexedDB schema churn for high-volume event logs.

**Alternatives considered**:

- Persist every trace event in IndexedDB: rejected because long runs may emit many events and the workspace is already the source for run artifacts.
- Store only stdout/stderr: rejected because user-facing trace needs normalized phases and metadata.

## Decision: Keep `AgentRunEvent` as the stream contract and add trace metadata incrementally

**Rationale**: Frontend and Tauri runtime already consume `AgentRunEvent`. Extending it minimizes blast radius and preserves existing Skill and material workflows.

**Alternatives considered**:

- Introduce an entirely new SSE/IPC event protocol: rejected for this first slice because it would duplicate existing parser logic.
- Let frontend infer everything from raw stdout: rejected because persisted recovery needs machine-readable steps.

## Decision: Add `hasTrace` to workspace probe

**Rationale**: The app already probes workspace status for active or recoverable runs. Adding trace availability gives the UI enough information to show that a run has recoverable diagnostics without loading full logs in the first pass.

**Alternatives considered**:

- Read full trace on every page load: rejected to keep navigation cheap.
- Only show in-memory events: rejected because it fails the recovery scenario.

## Decision: Preserve review boundary as a status/summary behavior, not an automatic import

**Rationale**: The Harness requirement says Agent output is a candidate. Existing application import and Inbox flow should remain the write boundary.

**Alternatives considered**:

- Auto-import validated `material-draft.json`: rejected because it violates traceable, reviewable learning assets.
- Mark every successful run as completed only: rejected because users need to distinguish "Agent done" from "application reviewed/imported".
