# Data Model: Shenlun Learning Assets

## LearningAssetProvenance

Represents where a derived learning asset came from.

- `id`: unique provenance id
- `sourceDocumentId`: required source document id
- `sourceType`: `document` | `user` | `ai_generated` | `skill_generated`
- `parserSource`: optional parser or skill name
- `pageStart`, `pageEnd`: optional PDF page range
- `textStart`, `textEnd`: optional text-span offsets
- `confidence`: number from 0 to 1
- `reviewState`: `ready` | `needs_review` | `corrected` | `ignored`
- `createdAt`: ISO timestamp

Validation:

- `sourceDocumentId` is required for imported-document assets.
- `confidence` must be between 0 and 1.
- `ai_generated` and `skill_generated` scoring-related assets default to
  `needs_review` unless explicitly approved.

## AbilityTag

Normalized申论 ability dimension used for questions, scoring points, diagnosis,
and planning.

- `id`: stable ability id
- `dimension`: `reading_extraction` | `summary` | `analysis` |
  `countermeasure` | `implementation_format` | `essay_ideation` |
  `formal_expression` | `time_control`
- `label`: user-facing label
- `description`: short explanation

Validation:

- Dimension values are fixed to keep plans comparable over time.

## TopicAsset

A reusable subject-matter asset extracted from policy documents, commentaries,
materials, or answer keys.

- `id`: unique topic id
- `documentId`: source document id
- `title`: concise topic title
- `category`: `policy_theme` | `governance_case` | `problem` |
  `countermeasure` | `quote` | `expression`
- `summary`: normalized content
- `tags`: topic keywords
- `provenanceId`: source provenance
- `createdAt`: ISO timestamp

Relationships:

- Belongs to one document.
- May support many questions or learning tasks.

## LearningTask

One actionable unit in a daily or weekly plan.

- `id`: unique task id
- `taskType`: `reading_extraction` | `scoring_recall` |
  `single_question_writing` | `expression_rewrite` | `timed_practice` |
  `review_mistakes` | `import_more_assets`
- `title`: user-facing task title
- `description`: task instructions
- `estimatedMinutes`: positive integer
- `abilityTagIds`: related abilities
- `topicAssetIds`: optional topic assets
- `questionIds`: optional training questions
- `diagnosisIds`: optional diagnosis evidence
- `priority`: `high` | `medium` | `low`
- `rationale`: why this task was selected
- `status`: `pending` | `running` | `completed` | `skipped`
- `createdAt`: ISO timestamp

Validation:

- A normal task must reference at least one ability, topic, question, or
  diagnosis evidence.
- `import_more_assets` tasks may omit training evidence when the library is
  empty.

## UserLearningProfile

The current local profile used to generate plans.

- `id`: unique profile id
- `targetExam`: user-facing target, such as national exam or provincial exam
- `stage`: `beginner` | `improving` | `sprint`
- `dailyAvailableMinutes`: positive integer
- `weeklyAvailableDays`: integer from 1 to 7
- `abilityScores`: ability dimension to score from 0 to 100
- `topicCoverage`: topic id to exposure count
- `questionTypePerformance`: question type to count/average score
- `issueTagCounts`: issue tag to count
- `recentSessionIds`: recent training sessions
- `updatedAt`: ISO timestamp

Validation:

- Missing scores default to 50 for neutral ranking.
- Daily minutes below 10 should still produce a small review/import task.

## LearningPlan

A generated plan for a day or week.

- `id`: unique plan id
- `profileId`: related profile
- `scope`: `daily` | `weekly`
- `title`: plan title
- `generatedAt`: ISO timestamp
- `totalEstimatedMinutes`: sum of task estimates
- `taskIds`: ordered task ids
- `rationale`: summary of plan strategy
- `assetGapWarnings`: strings describing missing assets

Validation:

- Daily plans should not exceed the profile daily time budget unless the only
  available task is an import recommendation.
- Weekly plans group tasks by day and preserve daily budget constraints.
