---
name: gongkao-hotspot-collector
description: Collect public-exam hotspot source material and produce a validated Gongkao material draft.
triggers:
  - collection
  - policy
  - hotspot
---

# Gongkao Hotspot Collector

Collect policy, mainstream media, and exam-relevant public material for the requested topic.

Write `material-draft.json` at the run workspace root. The file must use `schemaVersion: 1`, include a `source.references` array with provenance, and include a `draft` with topic, summary, tags, keywords, flashcards, practice questions, and copybook items.

Do not write to the app database or user profile. Use local files only for source snapshots and reports inside the workspace.
