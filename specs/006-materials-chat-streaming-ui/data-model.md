# Data Model: Materials Chat Streaming UI

## MaterialChatMessage

Represents one message in the materials workbench conversation.

Fields:

- `id`: Stable local identifier.
- `role`: `user` or `assistant`.
- `runId`: Optional Agent run id.
- `content`: Main readable message text.
- `createdAt`: ISO timestamp.
- `status`: Optional lifecycle state: `queued`, `streaming`, `validating`, `waiting_review`, `completed`, `failed`, `cancelled`.
- `events`: Normalized events displayed inside an assistant message.
- `attachments`: File chips or source context shown with a user message.
- `outputSummary`: Optional final result counts and warnings.

Rules:

- User messages are immutable after creation.
- Assistant messages update in place as events arrive.
- Recent messages are bounded in the workbench session.

## MaterialChatEvent

Represents one normalized, user-facing event in an assistant message.

Fields:

- `id`: Stable local identifier.
- `runId`: Agent run id.
- `type`: `thinking_delta`, `text_delta`, `tool_call`, `tool_result`, `file_write`, `validation`, `inbox`, `status`, `error`.
- `label`: Short display label.
- `message`: User-facing summary.
- `timestamp`: ISO timestamp.
- `severity`: `muted`, `info`, `success`, `warning`, `error`.
- `rawKind`: Original `AgentRunEvent.kind` when applicable.

Rules:

- Long messages are collapsible in UI.
- Only the latest bounded event list is kept per assistant message.
- `failed` and `agent_error` map to error severity.

## MaterialChatAttachment

Represents file or context attached to a user message.

Fields:

- `id`: Stable local identifier.
- `name`: Display name.
- `kind`: `file` or `context`.
- `status`: `ready`, `parsing`, `parsed`, `failed`, or `bound`.

## MaterialWorkbenchSessionSnapshot

Existing session state extended with:

- `chatMessages`: Recent `MaterialChatMessage[]`.

Rules:

- Page switching must preserve messages in memory.
- LocalStorage restore tolerates legacy state without `chatMessages`.
