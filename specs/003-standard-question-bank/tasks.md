# Tasks: Standard Shenlun Question Bank

**Input**: Design documents from `specs/003-standard-question-bank/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/question-bank-import.md`, `quickstart.md`

**Tests**: Required by project constitution for normalization, import persistence, repository access, plan selection, and practice selection.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Phase 1: Setup

- [X] T001 Add question-bank store names and DB version update in `lib/storage/schema.ts`
- [X] T002 Add question-bank domain types in `lib/shenlun/types.ts`
- [X] T003 Add repository methods for question-bank items and import batches in `lib/shenlun/repositories.ts`

---

## Phase 2: Foundational

- [X] T004 [P] Add repository persistence tests for question-bank records in `test/lib/shenlun/repositories.test.ts`
- [X] T005 [P] Add normalization tests in `test/lib/shenlun/question-bank.test.ts`
- [X] T006 Implement question-bank normalization helpers in `lib/shenlun/question-bank.ts`

---

## Phase 3: User Story 1 - Imported Material Becomes Standard Practice Items (Priority: P1)

**Goal**: Parsed imports create standard question-bank items and an import-batch summary.

**Independent Test**: Save a parsed output with several questions and verify matching question-bank records and batch counts.

- [X] T007 [P] [US1] Extend import persistence tests for question-bank records in `test/lib/shenlun/import-assets.test.ts`
- [X] T008 [US1] Integrate question-bank record creation into `lib/shenlun/import-assets.ts`
- [X] T009 [US1] Update parser output tests or fixtures to assert multi-question import behavior in `test/lib/shenlun/parser-output.test.ts`

---

## Phase 4: User Story 2 - Practice Area Uses One Unified Source (Priority: P2)

**Goal**: Practice page can show and select ready question-bank items from one pool while keeping existing training session behavior.

**Independent Test**: Seed bank items from multiple source categories and verify practice selection/filtering behavior.

- [X] T010 [P] [US2] Add practice-selection tests in `test/lib/shenlun/question-bank.test.ts`
- [X] T011 [US2] Add practice-bank selectors in `lib/shenlun/question-bank.ts`
- [X] T012 [US2] Load question-bank items in `app/practice/page.tsx`
- [X] T013 [US2] Add category/type/source summary UI for question-bank items in `app/practice/page.tsx`

---

## Phase 5: User Story 3 - Learning Plans Select From the Standard Bank (Priority: P3)

**Goal**: Daily learning plans prefer ready bank items that match weak abilities and explain selection rationale.

**Independent Test**: Generate a plan with ready bank items tagged to a weak ability and verify the selected task references the bank item.

- [X] T014 [P] [US3] Add learning-plan tests for question-bank selection in `test/lib/shenlun/learning-plan.test.ts`
- [X] T015 [US3] Extend `LearningTask` links for question-bank item ids in `lib/shenlun/types.ts`
- [X] T016 [US3] Update `generateDailyLearningPlan` to accept and select ready question-bank items in `lib/shenlun/learning-plan.ts`
- [X] T017 [US3] Pass bank items into generated practice-page learning plans in `app/practice/page.tsx`

---

## Phase 6: User Story 4 - Batch Review Prevents Bad Imports (Priority: P4)

**Goal**: Import batches preserve counts, warnings, review state, and duplicate handling.

**Independent Test**: Normalize a noisy import with duplicate questions and missing rubrics; verify duplicate counts and needs-review status.

- [X] T018 [P] [US4] Add duplicate/review-state tests in `test/lib/shenlun/question-bank.test.ts`
- [X] T019 [US4] Implement duplicate detection and batch warnings in `lib/shenlun/question-bank.ts`
- [X] T020 [US4] Persist import-batch summaries from `lib/shenlun/import-assets.ts`

---

## Phase 7: Polish & Validation

- [X] T021 Update built-in parser Skill output contract guidance in `skills/gongkao-material-parser/SKILL.md`
- [X] T022 Run `npx tsc --noEmit`
- [X] T023 Run `npm run lint`
- [X] T024 Run focused and full unit tests with `npm test`

---

## Dependencies & Execution Order

- Phase 1 blocks all later phases.
- Phase 2 blocks import, practice, plan, and batch-review stories.
- US1 should complete before US2 and US3 so practice and plan have persisted bank records.
- US4 can be implemented after foundational normalization exists.
- Validation runs after all story tasks.

## Parallel Opportunities

- T004 and T005 can run in parallel.
- T007 can run while T009 fixture assertions are prepared.
- T010 and T014 can be written independently after foundational types exist.
- T018 can be added independently of UI changes.

## Implementation Strategy

1. Add local data model and repository support.
2. Write failing tests for normalization and persistence.
3. Implement normalization and import integration.
4. Extend practice selection and learning-plan selection.
5. Validate with typecheck, lint, and tests.
