# Materials Knowledge Agent Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/materials` into a Gongkao materials knowledge-base workbench with enhanced Agent status, Skill forms, `@` context binding, run center, trust checks, and prompt-budget protection.

**Architecture:** Keep the existing Next.js + Tauri split. Tauri already owns CLI execution, isolated run workspaces, Skill staging, and `material-draft.json` output retrieval; this plan adds the missing frontend domain model and validation layer, then redesigns `/materials` around those primitives. Agent output still enters Inbox first and is imported only after user confirmation.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Tauri 2, Rust agent runtime, IndexedDB repositories, shadcn UI, lucide-react.

---

## File Structure

### Create

- `lib/agent/capabilities.ts`  
  Agent capability, model-source, adapter-status, and display helpers used by the topbar and materials workbench.

- `lib/agent/skill-inputs.ts`  
  Built-in Gongkao Skill metadata, typed input defaults, normalization, trust/permission checks, and output asset labels.

- `lib/agent/context-mentions.ts`  
  `@` mention parser and resolver for Skill, topic, file, source, question type, and tag contexts.

- `lib/agent/prompt-budget.ts`  
  Prompt budget estimation and deterministic trimming policy for long PDF/source contexts.

- `test/lib/agent/capabilities.test.ts`  
  Tests for adapter display, model-source labeling, and capability gating.

- `test/lib/agent/skill-inputs.test.ts`  
  Tests for default values, multi-select normalization, trust blocking, and required inputs.

- `test/lib/agent/context-mentions.test.ts`  
  Tests for known/unknown `@` mention extraction and context payload generation.

- `test/lib/agent/prompt-budget.test.ts`  
  Tests for source-length estimation and automatic trim warnings.

### Modify

- `types/agent-executor.ts`  
  Add model source, capabilities, install/auth status, and optional Pi Agent metadata.

- `types/agent-runtime.ts`  
  Extend Skill and run request DTOs with structured inputs, context mentions, trust, capabilities, prompt budget, and source trimming metadata.

- `lib/agent/executor-settings.ts`  
  Update display format from `Codex CLI / gpt-5.5` to `本地 CLI · Codex CLI · gpt-5.5`, while keeping backward-compatible normalization.

- `lib/agent/material-run.ts`  
  Add trust/capability/prompt-budget validation before starting a run.

- `lib/runtime-store.tsx`  
  Surface richer default adapter statuses to the topbar.

- `components/agent/agent-executor-menu.tsx`  
  Redesign the topbar popover to show install state, auth state, model source, capabilities, and mode/model/reasoning controls.

- `app/materials/page.tsx`  
  Replace the old import-form first screen with the knowledge-base workbench: command composer, quick chips, recent material projects, knowledge layers, Skill cards with typed inputs, run center, Inbox import preview, and legacy paste/upload flows as supporting panels.

## Implementation Tasks

### Task 1: Add Agent Capability And Model Source Domain Helpers

**Files:**
- Create: `lib/agent/capabilities.ts`
- Modify: `types/agent-executor.ts`
- Test: `test/lib/agent/capabilities.test.ts`

- [ ] Write failing tests that assert:
  - Codex displays as `本地 CLI · Codex CLI · gpt-5.5`.
  - fallback model source renders an explicit fallback label.
  - an adapter missing `structuredOutput` blocks a structured material run.
- [ ] Implement typed capability constants, default adapter statuses, and display helpers.
- [ ] Run `npm.cmd run test -- test/lib/agent/capabilities.test.ts`.

### Task 2: Add Skill Input, Trust, And Permission Helpers

**Files:**
- Create: `lib/agent/skill-inputs.ts`
- Test: `test/lib/agent/skill-inputs.test.ts`

- [ ] Write failing tests for built-in Skill metadata, required input validation, multi-select defaults, and blocked external Skill permissions.
- [ ] Implement built-in Skill cards for hotspot collection, material parsing, topic Wiki, source verification, question generation, and copybook extraction.
- [ ] Run `npm.cmd run test -- test/lib/agent/skill-inputs.test.ts`.

### Task 3: Add `@` Context Mention Parser

**Files:**
- Create: `lib/agent/context-mentions.ts`
- Test: `test/lib/agent/context-mentions.test.ts`

- [ ] Write failing tests for known mentions, unknown mentions, duplicate removal, and structured context payload generation.
- [ ] Implement parsing and candidate resolution for `@Skill`, `@专题`, `@文件`, `@来源`, `@题型`, and `@标签`.
- [ ] Run `npm.cmd run test -- test/lib/agent/context-mentions.test.ts`.

### Task 4: Add Prompt Budget Estimator And Trimmer

**Files:**
- Create: `lib/agent/prompt-budget.ts`
- Test: `test/lib/agent/prompt-budget.test.ts`

- [ ] Write failing tests for under-budget text, over-budget long source trimming, and blocking when still over budget.
- [ ] Implement deterministic source truncation that keeps user prompt and Skill instructions prioritized.
- [ ] Run `npm.cmd run test -- test/lib/agent/prompt-budget.test.ts`.

### Task 5: Wire Validation Into Material Run Start

**Files:**
- Modify: `types/agent-runtime.ts`
- Modify: `lib/agent/material-run.ts`
- Test: `test/lib/agent/material-run.test.ts`

- [ ] Extend DTOs to carry structured inputs, context mentions, trust status, required capabilities, and prompt-budget metadata.
- [ ] Add validation for missing model, blocked Skill, unsupported capabilities, and over-budget text.
- [ ] Run `npm.cmd run test -- test/lib/agent/material-run.test.ts`.

### Task 6: Redesign Topbar Agent Menu

**Files:**
- Modify: `components/agent/agent-executor-menu.tsx`
- Modify: `lib/runtime-store.tsx`
- Modify: `lib/agent/executor-settings.ts`
- Test: `test/lib/agent/executor-settings.test.ts`

- [ ] Update display format and tests.
- [ ] Render mode segmented control, adapter cards, model source, install/auth badges, and capability tags.
- [ ] Keep global state persistence compatible with current `localStorage` key.
- [ ] Run `npm.cmd run test -- test/lib/agent/executor-settings.test.ts test/lib/agent/capabilities.test.ts`.

### Task 7: Redesign `/materials` Workbench

**Files:**
- Modify: `app/materials/page.tsx`

- [ ] Replace first screen with materials knowledge-base layout.
- [ ] Add central command composer with quick chips and `@` context preview.
- [ ] Add Skill cards with typed inputs.
- [ ] Add Agent run center with queue, log, cancel/retry/open-output controls.
- [ ] Keep paste/upload processing and import preview functional.
- [ ] Keep Agent output going through Inbox and existing import confirmation.

### Task 8: Final Verification

**Files:** all touched files.

- [ ] Run targeted tests:
  - `npm.cmd run test -- test/lib/agent/capabilities.test.ts test/lib/agent/skill-inputs.test.ts test/lib/agent/context-mentions.test.ts test/lib/agent/prompt-budget.test.ts test/lib/agent/material-run.test.ts test/lib/agent/executor-settings.test.ts`
- [ ] Run `npx.cmd tsc --noEmit`.
- [ ] Run `npm.cmd run lint`.
- [ ] Report any remaining build or lint gaps with exact command output.

## Self-Review

- Spec coverage: every new requirement in `2026-05-26-materials-knowledge-agent-redesign.md` maps to Tasks 1-7.
- Existing backend overlap: Skill staging and run workspace are already implemented in `src-tauri/src/agent/workspace.rs`; this plan does not duplicate them.
- Boundary: Agent still cannot write formal IndexedDB data directly; `app/materials/page.tsx` keeps the existing `buildImportBundle()` and `materialRepository.saveImportBundle()` confirmation flow.
