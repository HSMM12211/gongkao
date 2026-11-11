# Tasks: Agent Harness Tools Context Verifier

**Input**: Design documents from `/specs/005-agent-harness-tools-context-verifier/`

## Phase 1: Tool Registry

- [x] T001 Add declarative tool registry in `lib/agent/tool-registry.ts`
- [x] T002 Add tool selection tests in `test/lib/agent/tool-registry.test.ts`

## Phase 2: Context Engine

- [x] T003 Add context map builder in `lib/agent/context-engine.ts`
- [x] T004 Add context engine tests in `test/lib/agent/context-engine.test.ts`
- [x] T005 Extend `MaterialContextPayload` with optional Harness context in `lib/agent/context-mentions.ts`

## Phase 3: Memory And Workflow Plan

- [x] T006 Add bounded memory snapshot builder in `lib/agent/memory.ts`
- [x] T007 Add memory tests in `test/lib/agent/memory.test.ts`
- [x] T008 Add workflow role planner in `lib/agent/workflow-plan.ts`
- [x] T009 Add workflow planner tests in `test/lib/agent/workflow-plan.test.ts`

## Phase 4: Business Verifier

- [x] T010 Add business verifier in `lib/agent/verifier.ts`
- [x] T011 Add verifier tests in `test/lib/agent/verifier.test.ts`
- [x] T012 Extend Inbox draft type with optional validation warnings in `lib/storage/schema.ts`

## Phase 5: Materials Workbench Integration

- [x] T013 Load bounded local memory inputs in `app/materials/page.tsx`
- [x] T014 Build tool plan, context map, memory snapshot, and workflow plan before Agent launch in `app/materials/page.tsx`
- [x] T015 Run business verifier after schema validation and save warnings in `app/materials/page.tsx`
- [x] T016 Surface Harness plan summary in the materials workbench UI in `app/materials/page.tsx`

## Phase 6: Verification

- [x] T017 Run focused tests with `npm test -- tool-registry context-engine memory verifier workflow-plan`
- [x] T018 Run related Agent tests with `npm test -- material-output material-workbench-session`
- [x] T019 Run `npx tsc --noEmit`
- [x] T020 Run `npm run lint`
- [x] T021 Mark all tasks complete in this file
