# Tasks: Materials Agent Composer UX

**Input**: Design documents from `specs/002-materials-agent-composer/`

**Prerequisites**: spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required for pure mention/composer behavior before implementation.

## Phase 1: Setup

- [x] T001 Create SDD feature documents in `specs/002-materials-agent-composer/`

## Phase 2: Foundational

- [x] T002 Add failing composer helper tests in `test/lib/agent/material-composer.test.ts`
- [x] T003 Extend mention tests in `test/lib/agent/context-mentions.test.ts` for generic `@` composer matching if needed

## Phase 3: User Story 1 - Unified Composer

- [x] T004 Refactor top workbench markup in `app/materials/page.tsx` into a unified composer surface
- [x] T005 Show compact Agent status, selected Skill summary, prompt budget, and start action inside the composer

## Phase 4: User Story 2 - Floating Mention Suggestions

- [x] T006 Improve suggestion panel copy/metadata and keyboard/click completion in `app/materials/page.tsx`
- [x] T007 Ensure quick workflow chips set selected Skill and prompt consistently

## Phase 5: User Story 3 - Context Visibility

- [x] T008 Render known context chips by kind and unknown warning chips in composer footer
- [x] T009 Keep attachment entry and existing PDF/import flow reachable from the composer

## Final Phase: Verification

- [x] T010 Run focused Vitest commands from quickstart
- [x] T011 Run `npm run lint`
- [x] T012 Inspect `/materials` in browser or report if browser/Tauri verification is unavailable
