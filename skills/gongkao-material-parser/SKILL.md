---
name: gongkao-material-parser
description: Convert pasted, TXT, Markdown, or extracted PDF text into structured Gongkao training material.
triggers:
  - text
  - markdown
  - pdf
---

# Gongkao Material Parser

Parse the supplied material text into a structured public-exam study draft.

Write `material-draft.json` at the run workspace root. Preserve the source text in `source.text`, include at least one reference entry, and create a `draft` with:

- topic
- summary
- tags
- at least three keywords
- golden sentences
- at least one flashcard for short text; for local PDFs or long documents, create 8-20 flashcards when enough material exists
- at least one practice question for short text; for local PDFs or long documents, create 6-12 practice questions when enough material exists
- copybook items

For a PDF, course handout, or question bank:

- Do not compress the whole document into one generic exercise.
- Preserve coverage across major sections, page ranges, tables, formulas, and answer requirements.
- Use `source.references` entries with page or section locators.
- If the source appears to be OCR output, keep OCR caveats in `report.warnings`.
- If the retained source is truncated, only claim coverage for the retained text and state that in `report.warnings`.

For each generated practice question, include enough structure for standard Shenlun question-bank import:

- Keep one source-derived exercise as one practice question; do not merge unrelated sections.
- Include question type, title, prompt, material excerpt or material reference, suggested minutes, optional word limit, and topic tags.
- Include answer text and scoring points when they are present in the document.
- Mark answer or scoring data as uncertain in `report.warnings` when it is inferred instead of document-derived.
- Prefer page or section references for every question so the app can preserve provenance.
- For long PDFs, distribute questions across the document instead of using only the first retained pages.

Use `金句`, `规范词`, or `对策` for flashcard categories. Use `概括题`, `对策题`, `综合分析`, `应用文`, or `大作文` for practice-question types.

Use `report.md` for any notes, uncertainty, or warnings.
