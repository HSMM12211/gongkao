# Feature Specification: Materials Agent Composer UX

**Feature Branch**: `002-materials-agent-composer`

**Created**: 2026-06-01

**Status**: Approved for implementation

**Input**: User requested optimizing the materials knowledge-base Agent dialogue box by referencing `docs/open-design-main`, while keeping the current app style.

## User Scenarios & Testing

### User Story 1 - Start a Material Workflow From One Composer (Priority: P1)

A user opens the materials knowledge-base workbench and can describe what they want in one prominent composer, see the active local Agent context, and start the matching Skill workflow without reading long helper text.

**Why this priority**: This is the selected UI area and the main entry point for material accumulation.

**Independent Test**: Open `/materials`, inspect the hero composer, select a quick workflow, and verify the composer becomes a clear editable task with the correct Skill selected.

**Acceptance Scenarios**:

1. **Given** the user is on `/materials`, **When** the workbench loads, **Then** the top composer shows Agent status, selected Skill, prompt area, context chips, attachment entry, and a primary start button in one compact surface.
2. **Given** the user clicks a quick workflow chip, **When** the chip maps to an available Skill, **Then** the prompt is replaced with an editable starter and the selected Skill changes to that workflow.

---

### User Story 2 - Bind Context With @ Mentions (Priority: P2)

A user can type `@` context in the composer and get Open Design style floating suggestions instead of relying on static bottom instructions.

**Why this priority**: Agent workflows need explicit context binding for Skill, topic, source, file, tag, and question type.

**Independent Test**: Type `@Skill:` or a partial Skill token and verify the floating suggestion panel appears, can be clicked, and updates the prompt.

**Acceptance Scenarios**:

1. **Given** the cursor is inside a partial Skill mention, **When** matching Skills exist, **Then** a floating suggestion panel appears next to the composer with match labels and metadata.
2. **Given** one Skill suggestion is visible, **When** the user presses Tab or clicks the suggestion, **Then** the mention is completed and the selected Skill updates.

---

### User Story 3 - Make Bound Context Visible and Actionable (Priority: P3)

A user sees the contexts already attached to the task and can understand what will be passed to the Agent before starting.

**Why this priority**: It reduces accidental runs and makes the Agent workflow auditable.

**Independent Test**: Enter known and unknown mentions, verify known mentions appear as grouped chips and unknown mentions are shown as warnings without blocking free typing.

**Acceptance Scenarios**:

1. **Given** the prompt includes known mentions, **When** the composer renders, **Then** the footer shows context chips grouped by kind.
2. **Given** the prompt includes unknown mentions, **When** the composer renders, **Then** unknown mentions appear as warning chips and the user can still edit or run after correction.

### Edge Cases

- If no Tauri runtime is available, the composer still renders with fallback Skill data and shows an unknown/offline Agent status.
- If a quick workflow Skill is not installed, its chip is disabled and cannot overwrite the prompt.
- If no context is bound, the footer shows a short hint only; it does not display long instructional copy.
- If the prompt is empty, the start action remains governed by existing validation and error messaging.

## Requirements

### Functional Requirements

- **FR-001**: The materials page MUST present the top Agent input as a unified composer containing Agent status, selected Skill, editable prompt, context chips, and start action.
- **FR-002**: The composer MUST support quick workflow chips that set both the selected Skill and a starter prompt.
- **FR-003**: The composer MUST surface floating `@Skill:` suggestions while the user types a partial Skill mention.
- **FR-004**: The composer MUST allow mouse selection and Tab completion of Skill suggestions.
- **FR-005**: The composer MUST show known bound contexts as chips and unknown mentions as warnings.
- **FR-006**: The composer MUST preserve the existing Agent run behavior, validation, workbench persistence, and prompt-budget flow.
- **FR-007**: The UI MUST remain visually aligned with the current Gongkao app shell and avoid copying Open Design branding or unrelated layout.

### Key Entities

- **Composer Prompt**: The editable natural-language instruction that may include context mentions.
- **Context Mention**: A recognized `@` token for Skill, topic, file, source, question type, or tag.
- **Quick Workflow**: A chip that binds one Skill and inserts a starter prompt.
- **Agent Status Summary**: The current local CLI/API adapter, model, and availability state shown near the composer.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A user can choose a workflow chip and start a material run from the top composer with no navigation away from `/materials`.
- **SC-002**: A user can complete a single visible Skill mention with Tab or click in under 5 seconds.
- **SC-003**: Known context tokens and unknown context tokens are distinguishable before the user starts a run.
- **SC-004**: Existing focused Agent/material tests continue to pass after the composer redesign.

## Assumptions

- The current Skill/runtime backend remains unchanged for this feature.
- The design borrows Open Design interaction principles, not its full visual identity.
- This phase targets desktop-width usability first, with responsive wrapping for narrower widths.
