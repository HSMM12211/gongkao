# Data Model: Agent Harness Trace State Machine

## AgentRunTrace

Represents the observable execution record for one Agent run.

Fields:

- `schemaVersion`: fixed version for trace compatibility.
- `runId`: run identifier.
- `createdAt`: first trace timestamp.
- `updatedAt`: latest trace timestamp.
- `steps`: ordered `AgentTraceStep` entries.

Validation rules:

- `runId` must be non-empty.
- `steps` must remain in event order.
- Unknown event kinds are preserved as log/output steps rather than discarded.

## AgentTraceStep

Represents one observable Agent Harness step.

Fields:

- `runId`: run identifier.
- `kind`: raw event kind from runtime.
- `phase`: normalized Harness phase.
- `label`: short user-facing label.
- `message`: human-readable message.
- `severity`: muted, info, success, warning, or error.
- `timestamp`: event timestamp.
- `eventType`: optional adapter-specific event type.
- `raw`: optional shrink-wrapped source frame.

Validation rules:

- `phase` must be one of the supported Harness phases.
- `message` should be retained even if raw event parsing is partial.
- Error and failure events must have error severity.

## RunWorkspaceProbe

Represents a cheap status check for a run workspace.

Fields:

- `status`: queued, running, completed, failed, or cancelled.
- `summary`: status summary.
- `error`: optional error message.
- `hasMaterialDraft`: whether `material-draft.json` exists.
- `hasReport`: whether `report.md` exists.
- `hasTrace`: whether a trace file exists and is non-empty.

Validation rules:

- `hasTrace` does not imply success; it only indicates diagnostics are available.
- Invalid `material-draft.json` should still surface `hasTrace` when trace exists.

## ReviewBoundary

Represents the application boundary between Agent-generated candidate output and official study data.

States:

- `validating`: application is reading and validating artifacts.
- `waiting_review`: output passed enough validation to be reviewed/imported.
- `failed`: output cannot enter review without user or Agent correction.

Validation rules:

- A run cannot skip from Agent completion directly to official import.
- Failed validation may create an Inbox draft for diagnostics, but it must not mark official import complete.
