# Research: AI Agent Orchestrator CLI v1

## Decision: Keep Codex CLI as the v1 runtime

**Rationale**: The current desktop app already has a functioning Codex CLI adapter, isolated run workspaces, JSON event parsing, trace files, artifact reading, and Inbox review handoff. Replacing this with SDK integration would add runtime packaging and API-surface risk without improving the immediate user goal.

**Alternatives considered**:
- Codex SDK adapter now: rejected for v1 because the user explicitly asked not to consider SDK yet.
- Cloud Agent service: rejected because the project constitution prioritizes local-first learning data.

## Decision: Add an application-layer orchestration model instead of a new backend daemon

**Rationale**: The app already creates `context.harness` with tool plan, context map, memory snapshot, and workflow plan. A small orchestration model can standardize these into a task plan and evidence summary without rewriting the Tauri runtime.

**Alternatives considered**:
- New standalone daemon: rejected as unnecessary for v1.
- Encode everything only in prompt text: rejected because it is not testable or easy to restore in UI state.

## Decision: Treat Tool Registry as declared routes in v1

**Rationale**: Current tools are partly metadata and partly existing app capabilities. V1 should expose route, fallback, permissions, and failure mode clearly to the user and Agent. Turning every Tool into an independently executable backend function can follow later.

**Alternatives considered**:
- Full tool execution engine: rejected as a larger feature.
- No Tool Registry changes: rejected because users need to see why PDF, MinerU, source verification, or question normalization paths were selected.

## Decision: Use bounded memory summaries only

**Rationale**: The constitution requires local-first and traceable study assets. Agent tasks should receive counts, recent run summaries, pending Inbox counts, and learning gap summaries, not complete local history by default.

**Alternatives considered**:
- Full database dump into prompt: rejected for privacy, prompt size, and traceability.
- No memory: rejected because personalization and duplicate-risk hints depend on recent local state.

## Decision: Keep formal import behind Verifier and Inbox

**Rationale**: Agent output can be useful but should never directly become official learning data. Existing schema and business verifier plus Inbox confirmation already satisfy this boundary and should be strengthened, not bypassed.

**Alternatives considered**:
- Auto-import on successful JSON parse: rejected because structure correctness does not imply learning value or source coverage.
