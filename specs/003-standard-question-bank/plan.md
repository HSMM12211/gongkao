# Implementation Plan: Standard Shenlun Question Bank

**Branch**: `codex/003-standard-question-bank` | **Date**: 2026-06-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-standard-question-bank/spec.md`

## Summary

Add an explicit local-first Shenlun question-bank layer that normalizes parsed document output into practice-facing items. Import flows will persist question-bank items and import-batch summaries alongside existing documents, passages, training questions, answers, scoring points, provenance, and topic assets. The practice page and learning-plan logic will prefer ready question-bank items while preserving existing training-question behavior for compatibility.

## Technical Context

**Language/Version**: TypeScript 5, React/Next App Router, Rust/Tauri backend already present

**Primary Dependencies**: Existing local IndexedDB wrapper, Vitest, fake-indexeddb, current Shenlun parser/import modules

**Storage**: Existing IndexedDB local stores extended with question-bank stores

**Testing**: Vitest unit tests for normalization, import persistence, repository access, learning-plan selection, and practice selection; existing npm lint/typecheck

**Target Platform**: Local desktop/web app through Next development and Tauri packaged runtime

**Project Type**: Desktop-capable web application with local-first data persistence

**Performance Goals**: Normalizing a parsed long document batch should produce deterministic item records without blocking later practice selection; practice filtering should be immediate for locally stored item counts expected in this project phase.

**Constraints**: Preserve local-first data, retain source provenance, do not silently send documents to remote services, keep compatibility with existing training questions and learning plan code, and avoid resetting active practice state during navigation.

**Scale/Scope**: First phase supports local question-bank records derived from parsed document outputs and existing training questions. Full manual editor, advanced batch review UI, and remote collaboration are out of scope.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Local-First Learning Data**: PASS. New records are stored in local IndexedDB.
- **Traceable Study Assets**: PASS. Question-bank items require provenance and source references.
- **Test-First Core Logic**: PASS. Tasks include tests before normalization and plan-selection implementation.
- **Isolated Skill and Agent Execution**: PASS. This feature consumes parser output and does not broaden external execution.
- **Incremental, Demonstrable Delivery**: PASS. User stories are independently testable from import, practice, plan selection, and review state.

## Project Structure

### Documentation (this feature)

```text
specs/003-standard-question-bank/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   `-- question-bank-import.md
`-- tasks.md
```

### Source Code (repository root)

```text
lib/
|-- shenlun/
|   |-- types.ts
|   |-- parser-output.ts
|   |-- import-assets.ts
|   |-- question-bank.ts
|   |-- learning-plan.ts
|   `-- repositories.ts
|-- storage/
|   `-- schema.ts
app/
`-- practice/
    `-- page.tsx
test/
`-- lib/
    `-- shenlun/
        |-- question-bank.test.ts
        |-- import-assets.test.ts
        |-- learning-plan.test.ts
        `-- repositories.test.ts
```

**Structure Decision**: Extend the current Shenlun domain module instead of introducing a separate database or service. The normalized question bank is a domain layer that sits between parser/import output and practice/plan selection.

## Phase 0: Research

See [research.md](./research.md).

## Phase 1: Design & Contracts

See [data-model.md](./data-model.md), [contracts/question-bank-import.md](./contracts/question-bank-import.md), and [quickstart.md](./quickstart.md).

## Post-Design Constitution Check

- **Local-First Learning Data**: PASS. Stores are local and reuse the existing persistence boundary.
- **Traceable Study Assets**: PASS. Data model requires source, provenance, and review state.
- **Test-First Core Logic**: PASS. Test tasks cover all domain logic changed by this feature.
- **Isolated Skill and Agent Execution**: PASS. Skill output remains an input contract; no new execution permission is added.
- **Incremental, Demonstrable Delivery**: PASS. Import normalization can be verified before UI updates; practice and planning can be verified independently.

## Complexity Tracking

No constitution violations.
