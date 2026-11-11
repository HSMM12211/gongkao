---
name: gongkao-question-generator
description: Convert materials into Shenlun practice questions, answer requirements, keywords, and model-answer assets.
triggers:
  - question
  - practice
  - shenlun
  - exam
---

# Gongkao Question Generator

Turn the supplied topic and material context into structured Shenlun practice assets.

Create `material-draft.json` at the run workspace root. The output must be valid `schemaVersion: 1` and must include:

- `source.title`: the source material or generated practice set title.
- `source.sourceType`: use `text` unless the prompt clearly provides another source type.
- `source.text`: preserve the source context or summarize the generated scenario basis.
- `source.references`: include at least one reference for the material basis.
- `draft.topic`: the practice topic.
- `draft.summary`: what capability this practice trains.
- `draft.tags`: include `shenlun-practice`.
- `draft.keywords`: at least three scoring keywords.
- `draft.goldenSentences`: reusable official-style expressions.
- `draft.flashcards`: at least one card for method or scoring keywords.
- `draft.practiceQuestions`: one or more exam-style questions with:
  - valid question type from the app enum.
  - title.
  - material.
  - prompt.
  - keywords.
  - modelAnswer.
- `draft.copybookItems`: concise official-style sentences extracted from the answer.

For local PDFs, course handouts, or question banks, generate a real question set instead of a single summary question:

- Create 6-12 `practiceQuestions` when enough source material exists.
- Cover different chapters, page ranges, data tables, formulas, and common traps.
- Use the original question stems and options when the document provides them.
- Keep each question linked to its source material excerpt and scoring keywords.
- Create 8-20 flashcards for methods, formulas, traps, and review points.

Also write `report.md` explaining:

1. Question type and intended difficulty.
2. Scoring points.
3. Common traps.
4. Suggested review path after answering.

Do not import anything into the app database. Do not modify files outside the isolated run workspace.
