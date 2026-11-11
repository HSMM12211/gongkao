# Contract: Learning Plan Generation

## Input

Plan generation consumes local records:

- `UserLearningProfile`
- `ShenlunDocument[]`
- `ExamPaper[]`
- `MaterialPassage[]`
- `TrainingQuestion[]`
- `AnswerKey[]`
- `ScoringPoint[]`
- `TopicAsset[]`
- `ExpressionAsset[]`
- `ShenlunDiagnosis[]`
- `TrainingSession[]`

## Output

The generator returns:

- `plan`: `LearningPlan`
- `tasks`: `LearningTask[]`
- `warnings`: string[]

## Selection Rules

1. If no usable assets exist, return an `import_more_assets` task.
2. Rank weak abilities by lower score, repeated issue tags, and recent diagnosis
   failures.
3. Prefer tasks with source evidence from imported assets.
4. Fit daily plans inside `dailyAvailableMinutes` when possible.
5. Include at least one rationale sentence explaining why the top task was
   selected.

## Error Handling

- Missing profile: create a default beginner profile before planning.
- Missing diagnosis history: use neutral ability scores and imported asset mix.
- Missing scoring standards: produce review/import tasks instead of scored
  writing tasks.
