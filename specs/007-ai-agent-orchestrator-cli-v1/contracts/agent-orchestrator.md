# Contract: Agent Orchestrator CLI v1

## Request Harness Context

The Agent request may include:

```ts
type AgentHarnessContext = {
  taskPlan: AgentTaskPlan
  toolPlan: AgentToolPlan
  contextMap: AgentContextMap
  memory: AgentMemorySnapshot
  workflowPlan: AgentWorkflowPlan
}
```

Rules:
- `taskPlan.reviewRequired` must be `true` for study assets.
- `contextMap` must disclose truncation or partial coverage.
- `memory` must be bounded and summary-only.

## Chat Event Contract

Task plan and evidence events should map to existing material chat events:

| Event | Chat type | Severity |
| --- | --- | --- |
| Task plan ready | `status` | `info` |
| Context warning | `validation` | `warning` |
| Tool route ready | `tool_call` | `info` |
| CLI diagnostic | `status` | `warning` |
| Artifact generated | `file_write` | `success` |
| Structure validation | `validation` | `info` or `error` |
| Business validation warning | `validation` | `warning` |
| Inbox handoff | `inbox` | `success` |

## Review Boundary Contract

Agent output can only move to formal assets by this sequence:

```text
Agent artifact
-> structure validation
-> business validation
-> Inbox / candidate review
-> user confirmation
-> formal local asset
```

Any bypass is a feature violation.

## Runtime Boundary Contract

- Codex CLI remains the v1 default runtime.
- Codex SDK must not be required for v1.
- Agent runs must keep isolated workspace execution.
- Run evidence must be inspectable after completion or failure.
