# Tasks: AI Agent Orchestrator CLI v1

**Input**: Design documents from `specs/007-ai-agent-orchestrator-cli-v1/`

## Phase 1: Foundation

- [X] T001 Create orchestration helpers in `lib/agent/orchestrator.ts`
- [X] T002 [P] Add orchestration tests in `test/lib/agent/orchestrator.test.ts`
- [X] T003 [P] Update `AGENTS.md` Spec Kit pointer to `specs/007-ai-agent-orchestrator-cli-v1/plan.md`

## Phase 2: User Story 1 - 可解释的素材整理 Agent 任务

- [X] T004 [US1] Build `AgentTaskPlan` from existing tool/context/memory/workflow inputs in `lib/agent/orchestrator.ts`
- [X] T005 [US1] Attach `taskPlan` to `context.harness` in `app/materials/page.tsx`
- [X] T006 [US1] Append a task plan chat event before CLI execution in `app/materials/page.tsx`
- [X] T007 [US1] Render task plan summary in assistant message output in `app/materials/page.tsx`

## Phase 3: User Story 2 - 长文档和题库任务的上下文控制

- [X] T008 [US2] Add context coverage summary helpers in `lib/agent/orchestrator.ts`
- [X] T009 [US2] Surface context coverage warnings as validation events in `app/materials/page.tsx`
- [X] T010 [P] [US2] Extend context tests in `test/lib/agent/orchestrator.test.ts`

## Phase 4: User Story 3 - 本地学习记忆摘要

- [X] T011 [US3] Add bounded memory summary formatting in `lib/agent/orchestrator.ts`
- [X] T012 [US3] Include memory summary in task plan and assistant evidence in `app/materials/page.tsx`
- [X] T013 [P] [US3] Add memory boundary tests in `test/lib/agent/orchestrator.test.ts`

## Phase 5: User Story 4 - 可恢复、可取消、可诊断运行

- [X] T014 [US4] Persist task plan metadata in `lib/agent/material-workbench-session.ts`
- [X] T015 [US4] Persist task plan metadata in `lib/agent/material-workbench-state.ts`
- [X] T016 [P] [US4] Update session/state tests for task plan recovery
- [X] T017 [US4] Ensure diagnostic events remain non-terminal in `lib/agent/material-chat.ts`

## Phase 6: Validation

- [X] T018 Run `npm.cmd test -- orchestrator material-chat material-workbench-session material-workbench-state context-engine memory verifier`
- [X] T019 Run `npx.cmd tsc --noEmit`
- [X] T020 Run `npm.cmd run lint`

## Dependencies

- Phase 1 blocks all user stories.
- US1 should ship before US2-US4 because it establishes the visible task plan.
- US2 and US3 can proceed in parallel after US1.
- US4 depends on the final task plan shape from US1.

## MVP Scope

Implement US1 first: a visible Agent task plan with existing CLI runtime and existing Inbox boundary. Then add context coverage, memory summary, and recovery persistence.
