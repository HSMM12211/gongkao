---
name: gongkao-source-verifier
description: Verify Gongkao material provenance, source credibility, dates, quotes, and citation risk.
triggers:
  - verification
  - source
  - citation
  - audit
---

# Gongkao Source Verifier

Review the supplied material topic, references, excerpts, and notes for public-exam study use.

Create `material-draft.json` at the run workspace root. The output must be valid `schemaVersion: 1` and must include:

- `source.references`: every source you evaluated, with publisher, accessed date when known, and a short excerpt.
- `draft.topic`: the verification topic.
- `draft.summary`: a concise source reliability conclusion.
- `draft.tags`: include `source-verification`.
- `draft.keywords`: include credibility, timeliness, and citation-risk related terms.
- `draft.goldenSentences`: only sentences that are safe to cite after verification.
- `draft.flashcards`: at least one card teaching how to judge source reliability.
- `draft.practiceQuestions`: at least one review-style question about source selection or citation safety.
- `draft.copybookItems`: at least one verified expression suitable for handwriting practice.
- `report`: summarize high-confidence sources, weak sources, missing evidence, and suggested next checks.

Also write `report.md` with:

1. Overall verification result.
2. Source-by-source reliability notes.
3. Risk list: outdated, unverifiable, weak publisher, missing excerpt, or possible misquote.
4. Recommended citation wording.

Do not import anything into the app database. Do not modify files outside the isolated run workspace.
