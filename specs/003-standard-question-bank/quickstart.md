# Quickstart: Standard Shenlun Question Bank

## Scenario 1: Import parsed past paper

1. Build or load a parsed Shenlun document output containing multiple passages, questions, answer keys, and scoring points.
2. Save it through the Shenlun import path.
3. Verify that the repository contains matching documents, passages, training questions, answer keys, scoring points, provenance records, question-bank items, and one import batch.
4. Verify the practice page can list ready bank items.

Expected result:

- Multiple parsed questions become multiple question-bank items.
- Each ready item has provenance and no orphan material ids.

## Scenario 2: Import lecture material with incomplete question data

1. Import a lecture or course handout with useful sections but incomplete scoring data.
2. Save the normalized batch.
3. Verify items are marked `needs_review` or `draft_review` instead of treated as authoritative scoring items.

Expected result:

- The user can see candidate items and warnings.
- Plans do not rely on untrusted scoring rubrics for authoritative scoring.

## Scenario 3: Generate today's plan

1. Create a user profile with a weak ability dimension.
2. Add ready question-bank items tagged with that dimension.
3. Generate the daily plan.

Expected result:

- The plan selects a concrete question-bank item when available.
- The task rationale names the ability or source reason for selection.
