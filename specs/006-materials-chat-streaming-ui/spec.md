# Feature Specification: Materials Chat Streaming UI

**Feature Branch**: `006-materials-chat-streaming-ui`

**Created**: 2026-06-04

**Status**: Draft

**Input**: User description: "Adopt SDD to upgrade `/materials` from a textarea plus CLI log panel into an Open Design style streaming chat experience. The existing Agent runtime already streams events; the UI must show user messages, assistant streaming progress, tool/file/validation events, collapsible trace, and Inbox review state."

## User Scenarios & Testing

### User Story 1 - Agent Run Appears As Conversation (Priority: P1)

A user sends a material collection or parsing request from `/materials`. The app immediately shows the user's request as a chat message and creates an assistant message that streams the Agent run lifecycle.

**Why this priority**: This is the core UX gap. The existing app already runs the Agent, but users see a command box and detached log panel instead of a conversational flow.

**Independent Test**: Start an Agent run with mocked or real stream events and verify user and assistant messages appear, with the assistant status changing from queued to streaming/validating/review or failure.

**Acceptance Scenarios**:

1. **Given** the user has typed a material task, **When** they click send, **Then** a user message is created immediately with the prompt and file chips.
2. **Given** the run has started, **When** the local runtime emits run events, **Then** the assistant message updates in place rather than only updating a separate log panel.
3. **Given** the run finishes and validation succeeds, **When** the candidate enters Inbox, **Then** the assistant message shows a waiting-review state.

---

### User Story 2 - Streaming Events Are Readable (Priority: P2)

A user can see what the local CLI is doing: thinking, calling tools, writing files, validating output, and handing off to Inbox.

**Why this priority**: Users need observability without reading raw stdout/stderr.

**Independent Test**: Feed `thinking_delta`, `tool_call`, `tool_result`, `file_write`, `completed`, `failed`, and local validation events into the mapper and verify the chat events are categorized correctly.

**Acceptance Scenarios**:

1. **Given** a `thinking_delta` event arrives, **When** the assistant message renders, **Then** it appears as an ongoing thinking/observation event.
2. **Given** a `tool_call` event arrives, **When** the assistant message renders, **Then** it appears as a tool card.
3. **Given** a `file_write` event arrives, **When** the assistant message renders, **Then** generated artifacts such as `material-draft.json` are visible.
4. **Given** validation fails, **When** the assistant message renders, **Then** the failure reason and trace entry are visible.

---

### User Story 3 - Trace Remains Available But Secondary (Priority: P3)

A user can inspect raw run details when needed, while the primary view remains the assistant stream.

**Why this priority**: The current CLI process panel is useful for debugging, but it should not be the primary interaction.

**Independent Test**: After a run has events, the assistant message contains a collapsible trace section that shows recent normalized steps and runId.

**Acceptance Scenarios**:

1. **Given** run events exist, **When** the assistant message is expanded, **Then** recent trace steps are visible.
2. **Given** no run has started, **When** the page loads, **Then** no oversized log panel dominates the workbench.

---

### User Story 4 - Conversation Survives Page Switching (Priority: P4)

A user can switch from Materials Workbench to Skill Management or Inbox and return without losing the current conversation or running state.

**Why this priority**: The user already reported state reset during page switching. The streaming chat must not regress this.

**Independent Test**: Patch the workbench session with chat messages and run state, then read a new snapshot and verify messages, events, and status survive.

**Acceptance Scenarios**:

1. **Given** a run is active, **When** the page unmounts and remounts, **Then** recent chat messages and run status restore.
2. **Given** a run completed into Inbox, **When** the user returns to `/materials`, **Then** the assistant message still shows the Inbox handoff.

## Edge Cases

- Agent emits only stderr and fails before producing a run result.
- Agent emits many tool events for a long PDF.
- User starts a run with an empty prompt but selected files.
- User clears the composer while prior assistant messages remain.
- Page switches while an assistant message is validating.
- Legacy localStorage has no chat message field.

## Requirements

### Functional Requirements

- **FR-001**: System MUST create a user chat message when a material Agent run is submitted.
- **FR-002**: System MUST create an assistant chat message for each submitted run.
- **FR-003**: System MUST map `AgentRunEvent` stream events into assistant message events.
- **FR-004**: System MUST display thinking, tool call, tool result, file write, validation, failure, and Inbox handoff inside the assistant message.
- **FR-005**: System MUST keep raw trace details available in a collapsible detail section.
- **FR-006**: System MUST persist recent chat messages in the existing materials workbench session.
- **FR-007**: System MUST restore recent chat messages when the materials page remounts.
- **FR-008**: System MUST preserve the existing Agent runtime, Skill selection, file upload, mention parsing, schema validation, business verification, and Inbox review boundary.
- **FR-009**: System MUST avoid allowing Agent output to bypass Inbox and directly write official learning assets.
- **FR-010**: Event mapping and session persistence MUST have focused automated tests.

### Key Entities

- **MaterialChatMessage**: A user or assistant message in the materials workbench conversation.
- **MaterialChatEvent**: A normalized event displayed inside an assistant message, derived from Agent runtime events or local validation.
- **MaterialChatAttachment**: Uploaded or parsed file context shown alongside a user message.
- **MaterialWorkbenchSessionSnapshot**: Existing cross-page session state extended with recent chat messages.

## Success Criteria

- **SC-001**: Starting a material Agent run immediately renders a user message and assistant message before CLI completion.
- **SC-002**: At least six event kinds (`thinking_delta`, `tool_call`, `tool_result`, `file_write`, `validating`, `waiting_review`) are visible in the assistant message flow.
- **SC-003**: The former CLI process panel is no longer the primary always-expanded view; trace is secondary/collapsible.
- **SC-004**: Switching away from `/materials` and returning preserves the current chat transcript and run status.
- **SC-005**: Unit tests cover event mapping and session persistence for chat messages.

## Assumptions

- Existing Tauri and HTTP Agent streams remain the source of truth.
- The first implementation reuses current app styling rather than copying Open Design visual styling.
- The feature does not implement true multi-agent orchestration or Open Design Live Artifact previews.
- In-app browser verification is feasible if the local dev server remains available.
