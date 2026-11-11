# Tasks: Shenlun Learning Assets

**Input**: Design documents from `specs/001-shenlun-learning-assets/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required for core domain logic per project constitution.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it touches different files and has no dependency on incomplete tasks
- **[Story]**: User story label from spec.md
- Every task includes exact file paths

## Phase 1: Setup

**Purpose**: Prepare storage and type surfaces shared by all stories.

- [x] T001 Add IndexedDB store names for learning provenance, topic assets, ability tags, learning profiles, learning tasks, and learning plans in `lib/storage/schema.ts`
- [x] T002 Extend Shenlun domain exports with `LearningAssetProvenance`, `AbilityTag`, `TopicAsset`, `LearningTask`, `UserLearningProfile`, `LearningPlan`, and review-state types in `lib/shenlun/types.ts`
- [x] T003 [P] Add repository accessors for the new learning stores in `lib/shenlun/repositories.ts`
- [x] T004 [P] Add parser schema tests for optional provenance, ability tag, and topic asset sections in `test/lib/shenlun/parser-output.test.ts`

---

## Phase 2: Foundational

**Purpose**: Build reusable local domain services before user stories.

- [x] T005 Extend parser output validation for optional `provenance`, `abilityTags`, and `topicAssets` arrays in `lib/shenlun/parser-output.ts`
- [x] T006 [P] Create failing tests for asset normalization and deterministic ability/topic derivation in `test/lib/shenlun/learning-assets.test.ts`
- [x] T007 [P] Create failing tests for learning profile calibration from diagnosis and timing history in `test/lib/shenlun/learning-profile.test.ts`
- [x] T008 [P] Create failing tests for daily plan generation, empty-library fallback, and time-budget fitting in `test/lib/shenlun/learning-plan.test.ts`
- [x] T009 Implement asset normalization and deterministic topic/ability helpers in `lib/shenlun/learning-assets.ts`
- [x] T010 Implement user profile creation and calibration helpers in `lib/shenlun/learning-profile.ts`
- [x] T011 Implement explainable daily and weekly plan generation in `lib/shenlun/learning-plan.ts`

**Checkpoint**: Shared services compile and focused tests can drive each user story.

---

## Phase 3: User Story 1 - Imported PDFs Become Learning Assets (Priority: P1) MVP

**Goal**: Imported parsed documents persist as a structured, traceable asset graph.

**Independent Test**: Save a parsed past-paper output and verify linked provenance, topic, ability, question, answer, and scoring records exist.

### Tests for User Story 1

- [x] T012 [US1] Extend import persistence tests for provenance, topic assets, ability tags, and review states in `test/lib/shenlun/import-assets.test.ts`
- [x] T013 [P] Extend document parser tests for topic/ability/expression derivation from past-paper and commentary text in `test/lib/shenlun/document-parser.test.ts`

### Implementation for User Story 1

- [x] T014 [US1] Extend `buildParsedShenlunAssetRecords` to build new learning asset records in `lib/shenlun/import-assets.ts`
- [x] T015 [US1] Persist new learning asset records in `saveParsedShenlunDocumentOutput` in `lib/shenlun/import-assets.ts`
- [x] T016 [US1] Add deterministic topic and ability derivation to `parseExamDocumentText` in `lib/shenlun/document-parser.ts`
- [x] T017 [US1] Show imported learning asset counts and review-needed status in `app/materials/page.tsx`

**Checkpoint**: US1 can be demonstrated by importing a parsed document and inspecting asset counts/review state.

---

## Phase 4: User Story 2 - User Profile Drives Today鈥檚 Training Plan (Priority: P2)

**Goal**: A user can generate a daily/weekly plan from local assets and profile constraints.

**Independent Test**: Given a profile, assets, and no diagnosis history, generate a plan with tasks, estimates, and rationale.

### Tests for User Story 2

- [x] T018 [US2] Add integration test for default profile plus imported assets producing a daily plan in `test/lib/shenlun/learning-plan.test.ts`
- [x] T019 [P] Add empty-library fallback test that returns an import recommendation in `test/lib/shenlun/learning-plan.test.ts`

### Implementation for User Story 2

- [x] T020 [US2] Add repository save/load methods for profiles, tasks, and plans in `lib/shenlun/repositories.ts`
- [x] T021 [US2] Add plan generation orchestration that loads local assets and profile data in `lib/shenlun/learning-plan.ts`
- [x] T022 [US2] Surface today鈥檚 plan, task rationale, time budget, and asset-gap warnings in `app/practice/page.tsx`

**Checkpoint**: US2 can be demonstrated without diagnosis history by generating a plan from imported assets.

---

## Phase 5: User Story 3 - Training Results Update the Learning Loop (Priority: P3)

**Goal**: Diagnosis and timing results update the profile and change future plans.

**Independent Test**: Submit diagnosis data, recalibrate the profile, regenerate a plan, and verify task priorities change.

### Tests for User Story 3

- [x] T023 [US3] Add profile recalibration tests using issue tags, missed scoring points, and exceeded stage timings in `test/lib/shenlun/learning-profile.test.ts`
- [x] T024 [P] Add plan-regeneration test proving repeated weak issue tags change next-task priority in `test/lib/shenlun/learning-plan.test.ts`

### Implementation for User Story 3

- [x] T025 [US3] Integrate profile recalibration after diagnosis save paths in `app/practice/page.tsx`
- [x] T026 [US3] Persist updated profile and regenerated plan after training diagnosis in `lib/shenlun/repositories.ts` and `app/practice/page.tsx`
- [x] T027 [US3] Display plan update rationale after diagnosis so the user sees why the next task changed in `app/practice/page.tsx`

**Checkpoint**: US3 can be demonstrated by completing practice and seeing a changed next plan.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [x] T028 [P] Update feature documentation in `specs/001-shenlun-learning-assets/quickstart.md` with final UI verification notes
- [x] T029 Run focused tests from `specs/001-shenlun-learning-assets/quickstart.md`
- [x] T030 Run full `npm run test`
- [x] T031 Run `npm run lint`
- [x] T032 Inspect `/materials` and `/practice` in the in-app browser for layout regressions after UI changes

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 Setup: no dependencies.
- Phase 2 Foundational: depends on Phase 1 types/storage surface.
- US1: depends on Phase 2 asset helpers and parser schema.
- US2: depends on Phase 2 plan/profile helpers and can use sample/imported assets.
- US3: depends on US2 plan generation and existing diagnosis flow.
- Polish: depends on selected user stories being complete.

### User Story Dependencies

- US1 is the MVP and can ship independently after foundational work.
- US2 can be implemented after foundation and uses US1 assets for realistic data.
- US3 depends on US2 because it regenerates plans from updated profile state.

### Parallel Opportunities

- T003 and T004 can run after T002.
- T006, T007, and T008 can run in parallel.
- T013 can run alongside T012.
- T019 can run alongside T018.
- T024 can run alongside T023.
- T028 can run while verification commands execute.

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete US1.
3. Validate import creates traceable learning assets.
4. Then implement US2 plan generation UI.
5. Finish US3 feedback loop after daily planning is visible.


