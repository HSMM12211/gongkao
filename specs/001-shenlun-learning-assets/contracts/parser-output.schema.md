# Contract: Parser Output Learning Asset Extensions

## Purpose

The parser output contract extends the existing Shenlun document parser result
so import can persist a complete learning asset graph.

## Existing Required Sections

The output continues to include:

- `document`
- `examPapers`
- `passages`
- `questions`
- `answerKeys`
- `scoringPoints`
- `warnings`

## New Optional Sections

### `provenance`

Array of source references.

Required fields:

- `ref`
- `sourceType`
- `confidence`
- `reviewState`

Optional fields:

- `documentRef`
- `parserSource`
- `pageStart`
- `pageEnd`
- `textStart`
- `textEnd`

### `abilityTags`

Array of ability mappings. These may refer to questions or scoring points.

Required fields:

- `ref`
- `dimension`
- `label`

Optional fields:

- `targetRef`
- `provenanceRef`
- `confidence`

### `topicAssets`

Array of topic or expression assets extracted from the document.

Required fields:

- `ref`
- `title`
- `category`
- `summary`
- `tags`
- `provenanceRef`

Optional fields:

- `relatedQuestionRefs`
- `relatedPassageRefs`

## Compatibility Rules

- Import MUST still work when the new optional sections are absent.
- Missing optional sections trigger deterministic local derivation during import.
- Any AI or Skill generated scoring-related output MUST default to `needs_review`
  unless a user has explicitly approved it.
