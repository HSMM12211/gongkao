# Data Model: Standard Shenlun Question Bank

## QuestionBankItem

Represents one normalized practice asset available to the Shenlun training loop.

Fields:

- `id`: Stable local id.
- `sourceId`: Source document or generated source id.
- `sourceTitle`: Human-readable source title.
- `sourceType`: `document`, `web`, `text`, `skill_generated`, `manual`, or `ai_generated`.
- `sourceDocumentId`: Optional linked Shenlun document id.
- `trainingQuestionId`: Optional linked existing training question id.
- `materialIds`: Linked passage ids.
- `answerKeyId`: Optional linked answer key id.
- `scoringPointIds`: Linked scoring point ids.
- `practiceCategory`: `past_paper`, `topic_drill`, `weakness_drill`, `material_to_question`, `expression_transfer`, or `draft_review`.
- `type`: Shenlun question type.
- `title`: User-facing title.
- `prompt`: User-facing prompt.
- `materialPreview`: Short material preview for practice lists.
- `standardAnswer`: Optional answer text.
- `rubric`: Normalized scoring rows and trust source.
- `abilityTags`: Ability dimensions.
- `topicTags`: Topic labels.
- `difficulty`: `easy`, `medium`, or `hard`.
- `estimatedMinutes`: Suggested practice time.
- `wordLimit`: Optional word limit.
- `reviewState`: `draft`, `needs_review`, `ready`, `ignored`, or `archived`.
- `provenanceIds`: Linked provenance records.
- `pageStart` / `pageEnd`: Optional source page range.
- `confidence`: 0 to 1.
- `warnings`: Import or normalization warnings.
- `createdAt` / `updatedAt`: Local timestamps.

Validation:

- Ready items must have non-empty `title`, `prompt`, `type`, `estimatedMinutes`, `sourceId`, and at least one provenance id.
- Items with AI-inferred answer/rubric data and no document-derived scoring points must use `needs_review` unless explicitly reviewed.
- Ignored and archived items must not be selected by normal practice or plans.

## QuestionBankImportBatch

Represents one import event and its normalization summary.

Fields:

- `id`: Stable local id.
- `sourceId`: Source id for the batch.
- `sourceTitle`: Human-readable source title.
- `sourceType`: Source type.
- `parserSource`: Parser, Skill, or Agent source label.
- `createdAt`: Local timestamp.
- `itemIds`: All item ids produced by the batch.
- `readyCount`: Count of ready items.
- `needsReviewCount`: Count of draft or needs-review items.
- `ignoredDuplicateCount`: Count of deduplicated items.
- `questionCount`: Detected practice-question count before filtering.
- `passageCount`: Detected passage count.
- `rubricCount`: Detected scoring-point count.
- `warnings`: Batch warnings.
- `status`: `draft`, `ready`, `needs_review`, or `failed`.

Validation:

- A batch may have zero ready items but should contain warnings that explain why.
- Duplicate items should be counted rather than silently losing traceability.

## QuestionBankRubric

Represents normalized scoring guidance attached to a bank item.

Fields:

- `answerSource`: `document`, `manual`, `ai_generated`, `skill_generated`, or `missing`.
- `answerText`: Optional answer or reference answer.
- `points`: Scoring rows with text, weight, and keywords.
- `trusted`: Whether the item can be used for authoritative scoring.

Validation:

- `trusted` is true only for document/manual/reviewed scoring data.
- Missing rubrics are allowed but should generate a warning.

## Relationships

- `QuestionBankItem.sourceDocumentId` references `ShenlunDocument.id` when available.
- `QuestionBankItem.trainingQuestionId` references `TrainingQuestion.id` when the bank item is derived from a parsed question.
- `QuestionBankItem.materialIds` reference `MaterialPassage.id`.
- `QuestionBankItem.answerKeyId` references `AnswerKey.id`.
- `QuestionBankItem.scoringPointIds` reference `ScoringPoint.id`.
- `QuestionBankItem.provenanceIds` reference `LearningAssetProvenance.id`.
- `QuestionBankImportBatch.itemIds` reference `QuestionBankItem.id`.
