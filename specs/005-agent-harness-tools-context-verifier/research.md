# Research: Agent Harness Tools Context Verifier

## Decision: Tool Registry is declarative TypeScript first

**Rationale**: Current tools are app-local flows and Skills. A declarative registry makes capabilities visible without forcing a new execution engine.

**Alternatives considered**: A new remote tool API was rejected because the current product is local-first and already has Tauri/Skill execution.

## Decision: Context map is sent as structured request context

**Rationale**: `StartMaterialAgentRunRequest.context` already accepts JSON-like data. Extending it keeps the run prompt composer unchanged except for richer serialized context.

**Alternatives considered**: Rewriting the prompt composer to load context files lazily was deferred; it is a future optimization after the structured map exists.

## Decision: Business verifier returns warnings before blocking by default

**Rationale**: Some AI outputs are still useful as drafts. Warnings and review status are safer than deleting candidate output.

**Alternatives considered**: Hard-failing long PDF outputs with fewer than six questions was rejected because users may still want to inspect the candidate.

## Decision: Multi-agent is represented as workflow plan before process-level orchestration

**Rationale**: True multi-agent CLI orchestration is a larger runtime change. A role plan makes the Harness decision explicit and can guide future planner/executor/evaluator spawning.
