# Data Model: Materials Agent Composer UX

## ComposerState

- `prompt`: current editable task text.
- `cursor`: current textarea cursor position.
- `selectedSkillId`: current workflow Skill selected by quick action, mention, or restored state.
- `mentions`: parsed known and unknown context mentions.
- `activeSkillMention`: partial Skill token currently being edited.

## ComposerContextChip

- `id`: stable mention entity id.
- `kind`: Skill, topic, file, source, question type, or tag.
- `label`: user-facing text.
- `token`: original mention token in the prompt.
- `value`: runtime payload value.

## QuickWorkflow

- `label`: short chip label.
- `skillId`: Skill to select.
- `prompt`: editable starter prompt inserted into the composer.

## AgentStatusSummary

- `executorLabel`: configured adapter and model.
- `statusLabel`: installed/login/unknown status from current adapter.
- `capabilities`: existing capability labels when available.
