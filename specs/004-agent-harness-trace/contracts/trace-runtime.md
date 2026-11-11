# Contract: Agent Trace Runtime

## Tauri runtime event contract

`AgentRunEvent` remains the stream event emitted from the Tauri runtime.

Required fields:

- `runId: string`
- `kind: string`
- `message: string`
- `timestamp: string`

Optional fields:

- `eventType?: string`
- `raw?: unknown`

New expectations:

- Every emitted event for a material run should also be appended to `trace.jsonl`.
- Trace append failure must not crash the Agent run.
- Unknown event kinds must be preserved.

## Workspace probe contract

`probeRunStatus(workspacePath)` returns:

```json
{
  "status": "completed",
  "summary": "material-draft.json 已生成",
  "error": null,
  "hasMaterialDraft": true,
  "hasReport": false,
  "hasTrace": true
}
```

Rules:

- `hasTrace` is true when `trace.jsonl` exists and contains at least one non-empty line.
- `hasTrace` is independent from `hasMaterialDraft`.
- Existing callers that ignore `hasTrace` must remain compatible.

## Frontend trace mapping contract

`buildAgentRunProcessTimeline(events)` maps runtime events to user-facing steps.

Required behavior:

- `running` -> running phase.
- `thinking_delta` and `text_delta` -> output/observation phase.
- `tool_call` -> tool activity phase.
- `tool_result` -> observation phase.
- `file_write` -> artifact phase.
- validation logs -> validation phase.
- successful completion after output validation can be represented as waiting review or completed, depending on caller context.
- `stderr`, `agent_error`, and `failed` -> error severity.
