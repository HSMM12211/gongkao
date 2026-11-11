# Research: Materials Agent Composer UX

## Decision: Borrow Open Design Composer Interaction, Not Its Visual Identity

**Rationale**: The useful pattern in `docs/open-design-main/apps/web/src/components/HomeHero.tsx` is the unified prompt surface: one textarea, contextual picker, active context tokens, file staging, and action button. The Gongkao app should reuse this interaction model while keeping its existing sidebar, typography, card style, and restrained palette.

**Alternatives considered**:

- Copy Open Design HomeHero wholesale: rejected because it would introduce unrelated plugin/catalog concepts and visual mismatch.
- Keep current textarea and only tweak spacing: rejected because it does not solve the selected UX problem around context clarity.

## Decision: Keep Runtime Data Flow Unchanged

**Rationale**: The existing `/materials` page already maps prompt, selected Skill, mentions, prompt budget, and runtime execution into working Agent runs. The redesign should reduce user confusion without increasing backend risk.

**Alternatives considered**:

- Introduce a new composer runtime abstraction: rejected as too broad for this UI-focused phase.

## Decision: Test Pure Mention/Composer Behavior and Reuse Existing Integration Tests

**Rationale**: DOM-level tests for this large client page would require heavier setup. The key regressions are Skill availability, mention matching/completion, and run validation, already covered by focused tests with one new composer contract test.

**Alternatives considered**:

- Add Playwright immediately: useful later for visual QA, but too slow for this scoped implementation.
