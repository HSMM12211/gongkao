# Composer UI Contract

## Inputs

- Current prompt text
- Current cursor position
- Available Skill definitions
- Parsed context entities
- Active Agent adapter status
- Current processing state

## Behaviors

1. Quick workflow chip click sets `selectedSkillId` and replaces `commandPrompt` with the workflow starter.
2. Typing a partial `@Skill:` token produces a floating suggestion list when matches exist.
3. Clicking a suggestion or pressing Tab with one match replaces the partial token with a full mention.
4. Known mentions render as context chips by kind.
5. Unknown mentions render as warning chips.
6. Start button calls the existing material Agent start handler.

## Non-goals

- No new Agent adapter protocol.
- No new Skill manifest schema.
- No database schema changes.
