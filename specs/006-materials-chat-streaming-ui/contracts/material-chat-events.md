# Contract: Material Chat Events

## Input

Existing Agent stream event:

```ts
type AgentRunEvent = {
  runId: string
  kind: AgentRunEventKind
  message: string
  timestamp: string
  eventType?: string
  raw?: unknown
}
```

## Output

User-facing assistant event:

```ts
type MaterialChatEvent = {
  id: string
  runId: string
  type:
    | "thinking_delta"
    | "text_delta"
    | "tool_call"
    | "tool_result"
    | "file_write"
    | "validation"
    | "inbox"
    | "status"
    | "error"
  label: string
  message: string
  timestamp: string
  severity: "muted" | "info" | "success" | "warning" | "error"
  rawKind?: AgentRunEventKind
}
```

## Mapping Rules

- `thinking_delta` -> `thinking_delta`
- `text_delta`, `stdout`, `agent` -> `text_delta`
- `tool_call` -> `tool_call`
- `tool_result` -> `tool_result`
- `file_write` -> `file_write`
- `validating` -> `validation`
- `waiting_review` -> `inbox`
- `failed`, `agent_error` -> `error`
- `stderr` -> `status` with `warning` severity, unless the message is a known benign CLI lifecycle line, then `muted`
- `queued`, `running`, `completed`, `cancelled`, `log`, `done` -> `status`

## Bounds

- A single assistant message keeps the latest 80 events.
- The workbench keeps the latest 12 chat messages.

## Executable Contract

The markdown contract is mirrored by runtime schemas in:

- `lib/agent/material-chat-schema.ts`

Contract tests live in:

- `test/lib/agent/material-chat-contract.test.ts`

This keeps the Agent runtime/event stream and the chat UI aligned. New Agent event kinds must be added to both the schema and the mapping tests before they are treated as supported.
