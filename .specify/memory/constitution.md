<!--
Sync Impact Report
Version change: template -> 1.0.0
Modified principles: template placeholders -> project-specific SDD rules
Added sections: Local Data & AI Constraints; Development Workflow
Removed sections: none
Templates requiring updates: no template changes required
Follow-up TODOs: none
-->

# Gongkao Constitution

## Core Principles

### I. Local-First Learning Data
All study records, imported documents, generated assets, plans, and diagnosis
history MUST be useful without a network dependency. Cloud or agent assistance
may enrich data, but local persisted records remain the source of truth.

### II. Traceable Study Assets
Every generated learning asset MUST retain provenance back to a source document,
question, passage, scoring point, diagnosis, or explicit user input. AI inferred
content MUST carry confidence and review status when it affects scoring,
planning, or user-facing learning advice.

### III. Test-First Core Logic
Domain logic for parsing, asset normalization, diagnosis aggregation, plan
generation, and repository persistence MUST be covered by focused automated
tests before implementation changes are considered complete.

### IV. Isolated Skill and Agent Execution
External Skills, Codex CLI, Claude Code, MinerU, and document parsers MUST run
with explicit boundaries: declared inputs, declared outputs, isolated working
directories where possible, permission prompts for risky operations, and clear
fallback behavior.

### V. Incremental, Demonstrable Delivery
Each feature MUST be split into independently testable user stories. The first
story should deliver a useful vertical slice before broad UI or automation work
continues.

## Local Data & AI Constraints

- User data, imported documents, and study history MUST NOT be silently sent to
  remote services.
- Any AI-generated answer key, scoring point, topic tag, or learning plan MUST
  be distinguishable from document-derived or user-authored content.
- Long document processing MUST expose progress, errors, and retry state.
- Generated plans MUST explain why tasks were chosen from the user's profile and
  recent performance.

## Development Workflow

- New multi-step features MUST begin with Spec Kit specification, plan, and
  tasks artifacts under `specs/`.
- Existing user work in the repository MUST be preserved; unrelated dirty files
  are not reverted.
- Verification MUST include the narrowest relevant automated tests and, for UI
  features, an in-app browser check when feasible.
- Desktop changes MUST account for Tauri runtime behavior and packaging impact.

## Governance

This constitution guides Spec Kit planning and review. Amendments require a
documented reason, an updated version number, and a Sync Impact Report that
states which templates or feature plans need follow-up. Feature plans that
violate a principle MUST document the violation and the simpler alternative that
was rejected.

**Version**: 1.0.0 | **Ratified**: 2026-06-01 | **Last Amended**: 2026-06-01
