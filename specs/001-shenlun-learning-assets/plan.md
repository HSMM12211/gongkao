# Implementation Plan: Shenlun Learning Assets

**Branch**: `001-shenlun-learning-assets` | **Date**: 2026-06-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-shenlun-learning-assets/spec.md`

## Summary

Convert parsed Shenlun PDF/document imports into a traceable learning asset graph
and use those assets plus diagnosis history to generate personalized daily and
weekly study plans. The implementation extends the existing `lib/shenlun`
domain model, parser output, import persistence, repositories, and practice UI
with deterministic local-first planning logic before optional AI enrichment.

## Technical Context

**Language/Version**: TypeScript 5.7, React 19, Next.js 16, Rust/Tauri runtime unchanged for this feature

**Primary Dependencies**: Existing Zod validation, IndexedDB storage helpers, existing `lib/shenlun` domain modules, existing UI component system

**Storage**: Existing IndexedDB stores through `lib/storage/idb` and `lib/storage/schema`

**Testing**: Vitest (`npm run test`) with focused `test/lib/shenlun/*` unit and integration tests

**Target Platform**: Local web app and Tauri desktop app

**Project Type**: Desktop-capable Next.js application with local browser storage and Tauri integrations

**Performance Goals**: Generate a plan from local assets/profile within one second for normal local study libraries; no blocking remote calls for core logic

**Constraints**: Local-first, provenance required, no silent remote upload, imported uncertain scoring assets must remain reviewable

**Scale/Scope**: One user's local申论 library, dozens to hundreds of imported documents, daily/weekly plans, existing PDF parsing pipeline reused

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Local-First Learning Data: PASS. The plan uses IndexedDB and deterministic local planning.
- Traceable Study Assets: PASS. Provenance is a first-class model and all derived assets reference source evidence.
- Test-First Core Logic: PASS. Tasks include focused Vitest tests before model/import/planning implementation.
- Isolated Skill and Agent Execution: PASS. This feature starts after parsed output and does not expand Skill execution privileges.
- Incremental, Demonstrable Delivery: PASS. User stories are independently testable: asset graph, plan generation, feedback calibration.

## Project Structure

### Documentation (this feature)

```text
specs/001-shenlun-learning-assets/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- parser-output.schema.md
|   |-- learning-plan.contract.md
|-- checklists/
|   |-- requirements.md
|-- tasks.md
```

### Source Code (repository root)

```text
lib/shenlun/
|-- types.ts                    # Extend domain types with learning assets/profile/plan
|-- parser-output.ts            # Extend validated parser output for topic/ability/provenance data
|-- document-parser.ts          # Add deterministic topic/ability/expression derivation from parsed text
|-- import-assets.ts            # Persist new learning assets from parser output
|-- repositories.ts             # Add repository accessors for new stores
|-- learning-assets.ts          # Normalize/import asset graph utilities
|-- learning-profile.ts         # Build/update user learning profile from diagnosis history
|-- learning-plan.ts            # Generate daily/weekly plans from assets and profile

lib/storage/
|-- schema.ts                   # Add IndexedDB store names for new asset/profile/plan records

app/practice/page.tsx           # Surface generated plan and plan rationale in申论训练 flow
app/materials/page.tsx          # Show import review summary and asset counts after save

test/lib/shenlun/
|-- learning-assets.test.ts
|-- learning-profile.test.ts
|-- learning-plan.test.ts
|-- import-assets.test.ts       # Extend existing tests for new persisted asset records
|-- parser-output.test.ts       # Extend schema tests for new parser fields
```

**Structure Decision**: Keep the feature inside existing `lib/shenlun` bounded
domain modules. Do not add a new backend service or remote API. UI changes are
thin consumers of tested local domain functions.

## Complexity Tracking

No constitution violations.

## Phase 0: Research

### Decision: Extend the existing Shenlun domain model instead of creating a separate knowledge-base model.

**Rationale**: Existing types already model documents, papers, passages,
questions, answer keys, scoring points, diagnosis, calibration, and expression
assets. Extending them keeps imported assets directly usable by practice and
review features.

**Alternatives considered**:
- Separate generic knowledge graph: more flexible but duplicates current申论
  concepts and slows delivery.
- Store only raw JSON blobs from Skill output: quick but weak for UI, testing,
  and plan generation.

### Decision: Use deterministic local derivation first, with AI/Skill enrichment later.

**Rationale**: The user wants learning plans to work from local PDFs without
depending on network or a particular agent. Deterministic rules can classify
common question types, topics, abilities, and expression assets; AI enrichment
can improve quality without becoming a required dependency.

**Alternatives considered**:
- AI-only extraction: stronger semantic labels but risks hallucinated scoring
  points and remote dependency.
- Manual-only asset review: trustworthy but too much friction after each import.

### Decision: Store provenance and review status on derived assets.

**Rationale**: Scoring points and learning advice influence user training, so the
app must show which items came from documents, user edits, or AI inference.

**Alternatives considered**:
- Store confidence only: insufficient to support review workflows.
- Store provenance only in logs: not available to UI and future plan generation.

### Decision: Plan generation should be rule-based and explainable.

**Rationale**: The first reliable version should choose tasks from ability
scores, issue tags, time budget, available assets, and target stage. Each task
can cite the evidence that caused it to be selected.

**Alternatives considered**:
- LLM-generated plans: natural language is better, but reproducibility and local
  operation are weaker.
- Fixed templates only: easy to build but not personalized enough.

## Phase 1: Design & Contracts

Design artifacts are stored beside this plan:

- [data-model.md](./data-model.md)
- [contracts/parser-output.schema.md](./contracts/parser-output.schema.md)
- [contracts/learning-plan.contract.md](./contracts/learning-plan.contract.md)
- [quickstart.md](./quickstart.md)

## Post-Design Constitution Check

- Local-First Learning Data: PASS. New persistence stays in local IndexedDB stores.
- Traceable Study Assets: PASS. `LearningAssetProvenance` is required for derived assets.
- Test-First Core Logic: PASS. Tasks require tests for parser schema, import persistence, profile calibration, and plan generation.
- Isolated Skill and Agent Execution: PASS. The plan consumes parser output and does not change external execution policy.
- Incremental, Demonstrable Delivery: PASS. US1 can ship as asset graph before plan UI; US2 and US3 build on it.
