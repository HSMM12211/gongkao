# Tasks: Materials Chat Streaming UI

**Input**: Design documents from `/specs/006-materials-chat-streaming-ui/`

## Phase 1: Setup And Contracts

- [x] T001 Add `MaterialChatMessage` and `MaterialChatEvent` model helpers in `lib/agent/material-chat.ts`
- [x] T002 Add event mapping tests in `test/lib/agent/material-chat.test.ts`

## Phase 2: Session Persistence

- [x] T003 Extend persisted workbench state with chat messages in `lib/agent/material-workbench-state.ts`
- [x] T004 Extend in-memory workbench session snapshot with chat messages in `lib/agent/material-workbench-session.ts`
- [x] T005 Update session persistence tests in `test/lib/agent/material-workbench-session.test.ts`

## Phase 3: Materials Workbench Conversation

- [x] T006 Add chat message state and synced setter in `app/materials/page.tsx`
- [x] T007 Create user and assistant messages when `handleAgentProcess` submits a run in `app/materials/page.tsx`
- [x] T008 Update assistant message from `runMaterialAgentChat` `onStarted` and `onEvent` callbacks in `app/materials/page.tsx`
- [x] T009 Add validation, failure, and Inbox handoff events to the assistant message in `app/materials/page.tsx`

## Phase 4: UI Rendering

- [x] T010 Render `MaterialChatPane` above the composer in `app/materials/page.tsx`
- [x] T011 Move the existing run process timeline into a collapsible assistant trace in `app/materials/page.tsx`
- [x] T012 Remove the always-expanded standalone CLI process panel from the primary composer area in `app/materials/page.tsx`

## Phase 5: Verification

- [x] T013 Run `npm test -- material-chat material-workbench-session`
- [x] T014 Run `npx tsc --noEmit`
- [x] T015 Run `npm run lint`
- [x] T016 Mark all tasks complete in this file
