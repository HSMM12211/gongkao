---
name: gongkao-copybook-extractor
description: Extract concise official-style sentences from Gongkao material for copybook and handwriting practice.
triggers:
  - copybook
  - sentence
  - excerpt
  - handwriting
---

# Gongkao Copybook Extractor

Extract short, accurate, official-style Chinese sentences suitable for handwriting practice and Shenlun expression accumulation.

Create `material-draft.json` at the run workspace root. The output must be valid `schemaVersion: 1` and must include:

- `source.title`: the source material title or extraction topic.
- `source.sourceType`: use `text` unless another type is explicitly provided.
- `source.text`: preserve or summarize the input material basis.
- `source.references`: include provenance for extracted sentences when available.
- `draft.topic`: the extraction topic.
- `draft.summary`: what expression style the extracted sentences train.
- `draft.tags`: include `copybook`.
- `draft.keywords`: at least three expression themes.
- `draft.goldenSentences`: selected sentences, deduplicated and polished only when the source allows it.
- `draft.flashcards`: at least one card explaining how to use a selected sentence.
- `draft.practiceQuestions`: at least one small Shenlun expression practice question.
- `draft.copybookItems`: the main output. Each item should have a short title, text, and tags.
- `report`: include extraction standards and discarded examples if useful.

Selection rules:

- Prefer sentences with clear policy tone, compact structure, and reusable governance expression.
- Avoid empty slogans, unverifiable claims, and overly long paragraphs.
- Keep copybook sentences short enough for repeated handwriting practice.

Also write `report.md` with extraction count, quality notes, and any provenance gaps.

Do not import anything into the app database. Do not modify files outside the isolated run workspace.
