# Implementation Plan: Materials Agent Composer UX

**Branch**: `002-materials-agent-composer` | **Date**: 2026-06-01 | **Spec**: specs/002-materials-agent-composer/spec.md

**Input**: Feature specification from `specs/002-materials-agent-composer/spec.md`

## Summary

Redesign the `/materials` top Agent workbench input into a unified composer inspired by Open Design HomeHero interaction patterns: status context, large editable task prompt, floating mention suggestions, context chips, attachment entry, and quick workflow starters. Preserve the existing Agent runtime and material import behavior.

## Technical Context

**Language/Version**: TypeScript 5.7, React 19, Next 16, Rust/Tauri existing runtime

**Primary Dependencies**: Existing shadcn/ui components, lucide-react icons, existing material Agent runtime helpers

**Storage**: Existing localStorage workbench persistence and IndexedDB repositories remain unchanged

**Testing**: Vitest for TS helpers; focused existing material/agent tests; lint for static validation

**Target Platform**: Desktop web inside Tauri and browser preview at `/materials`

**Project Type**: Desktop app with Next frontend and Tauri backend

**Performance Goals**: Composer interactions should be immediate for the existing built-in Skill list

**Constraints**: Preserve current app visual language; no backend runtime changes; no Open Design branding

**Scale/Scope**: One page interaction surface plus small helper/test additions if needed

## Constitution Check

- Test-first for changed behavior: required. Add/extend focused tests before implementation.
- Scoped edits: required. Limit production changes to material composer UI and existing helper surfaces.
- Preserve user worktree: required. Do not revert unrelated dirty files.

## Project Structure

### Documentation

```text
specs/002-materials-agent-composer/
  spec.md
  plan.md
  research.md
  data-model.md
  quickstart.md
  contracts/
    composer-ui.contract.md
  tasks.md
```

### Source Code

```text
app/materials/page.tsx
lib/agent/context-mentions.ts
test/lib/agent/context-mentions.test.ts
test/lib/agent/material-composer.test.ts
```

**Structure Decision**: Keep the composer in `app/materials/page.tsx` because the current page owns prompt state, Skill selection, runtime status, and start behavior. Extract only pure helper behavior to `lib/agent/context-mentions.ts` when testability requires it.

## Complexity Tracking

No constitution violations.
