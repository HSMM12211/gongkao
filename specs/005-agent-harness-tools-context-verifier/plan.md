# Implementation Plan: Agent Harness Tools Context Verifier

**Branch**: `codex/004-agent-harness-trace` | **Date**: 2026-06-03 | **Spec**: [spec.md](./spec.md)

## Summary

Complete the remaining practical Agent Harness foundation after trace: add a Tool Registry, derive tool/context/memory/workflow plans before Agent launch, verify Agent material output with business checks after schema validation, and surface these Harness facts in the materials workbench.

## Technical Context

**Language/Version**: TypeScript/React/Next.js for frontend Harness logic.

**Primary Dependencies**: Existing `lib/agent`, `lib/material`, `lib/shenlun`, IndexedDB repositories, Vitest.

**Storage**: Existing local IndexedDB and Tauri run workspace. This feature adds structured context to existing Agent run requests but does not add new stores.

**Testing**: Focused Vitest tests plus `npx tsc --noEmit`, `npm run lint`.

**Target Platform**: Local desktop app and local browser runtime.

**Project Type**: Desktop app with web frontend and local Agent runtime.

**Constraints**: Preserve official write boundary; do not directly import Agent output; keep raw user history bounded; preserve existing dirty worktree.

## Constitution Check

- Local-first learning data: PASS. Memory is local and summarized.
- Traceable study assets: PASS. Verifier improves provenance and review warnings.
- Test-first core logic: PASS. Each helper module has tests.
- Isolated Skill and Agent execution: PASS. Tool planning does not bypass workspace isolation.
- Incremental delivery: PASS. This is the remaining foundation slice after trace.

## Project Structure

```text
lib/agent/
├── tool-registry.ts
├── context-engine.ts
├── memory.ts
├── verifier.ts
└── workflow-plan.ts

test/lib/agent/
├── tool-registry.test.ts
├── context-engine.test.ts
├── memory.test.ts
├── verifier.test.ts
└── workflow-plan.test.ts

app/materials/page.tsx
types/agent-runtime.ts
```

## Complexity Tracking

No constitution violations.
