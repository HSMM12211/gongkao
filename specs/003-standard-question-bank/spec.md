# Feature Specification: Standard Shenlun Question Bank

**Feature Branch**: `codex/003-standard-question-bank`

**Created**: 2026-06-03

**Status**: Draft

**Input**: User description: "Parsed and imported materials from PDFs, web pages, pasted text, course handouts, and past-paper documents must be classified into a unified Shenlun question-bank format, then appear in one practice area for the Shenlun training loop. Imported data should support learning plans for different users and preserve source traceability."

## User Scenarios & Testing

### User Story 1 - Imported Material Becomes Standard Practice Items (Priority: P1)

A user imports a PDF, web article, pasted text, course handout, or past-paper document. After parsing and review, the app converts useful content into standard Shenlun question-bank items that can be practiced in the same training area regardless of source type.

**Why this priority**: The user's final learning goal is practice, not document storage. Without a standard question-bank layer, every parser output remains a separate one-off asset and cannot reliably enter the training loop.

**Independent Test**: Import a parsed document containing multiple passages, questions, answer references, and scoring points; save it; then verify that standard question-bank items are created with linked materials, prompts, answer references, rubrics, classifications, and provenance.

**Acceptance Scenarios**:

1. **Given** a parsed past-paper PDF with several questions and materials, **When** the user imports it, **Then** the app creates one standard question-bank item per detected practice question and each item is available in the practice area.
2. **Given** a parsed lecture handout with no original exam question, **When** the user imports it, **Then** the app classifies reusable sections and creates reviewable practice candidates instead of hiding the content or creating only one generic item.
3. **Given** the parsed source contains answer keys or scoring standards, **When** question-bank items are created, **Then** each item preserves answer and rubric references and marks uncertain AI-inferred fields as needing review.

---

### User Story 2 - Practice Area Uses One Unified Source (Priority: P2)

A user opens the Shenlun practice area and sees imported questions, generated practice questions, and manually curated items in one consistent pool. The user can choose by category, question type, topic, source, difficulty, or weak ability without caring whether the original source was a PDF, web page, or pasted text.

**Why this priority**: The practice loop must be stable and user-facing. If source-specific imports stay separate, the user cannot build a reliable daily routine or compare performance across sources.

**Independent Test**: Seed question-bank items from at least two source types, open the practice area, filter by category and question type, start a timed practice item, submit an answer, and verify the diagnosis references the selected question-bank item.

**Acceptance Scenarios**:

1. **Given** the user has imported questions from multiple sources, **When** they open the practice area, **Then** the app shows a unified practice pool with counts by category and question type.
2. **Given** the user selects a source category such as past paper, topic drill, or material-to-question, **When** the filter changes, **Then** only matching question-bank items appear without resetting stored training state.
3. **Given** the user starts practice from a question-bank item, **When** the answer is submitted, **Then** the training session, answer, diagnosis, and review history remain linked to that item and its source provenance.

---

### User Story 3 - Learning Plans Select From the Standard Bank (Priority: P3)

A user with a learning profile receives daily or weekly study recommendations that choose concrete question-bank items and explain why those items match the user's weak abilities, recent diagnoses, target exam, and available time.

**Why this priority**: Imported assets only become valuable when they shape what the user practices next.

**Independent Test**: Create a profile with weak summary ability and imported question-bank items tagged with summary and reading-extraction dimensions; generate a daily plan; verify that the plan selects matching items and explains the selection.

**Acceptance Scenarios**:

1. **Given** a beginner user with weak summary and limited time, **When** the app generates today's plan, **Then** it selects short summary or reading-extraction items from the question bank and fits the time budget.
2. **Given** a user repeatedly misses countermeasure scoring points, **When** the plan is regenerated, **Then** countermeasure question-bank items and scoring-point recall tasks increase in priority.
3. **Given** there are not enough bank items for a weak ability, **When** a plan is generated, **Then** the app reports the asset gap and recommends what to import or generate next.

---

### User Story 4 - Batch Review Prevents Bad Imports (Priority: P4)

A user can review a parsed/imported batch before it becomes authoritative practice data. The app shows how many questions, materials, rubrics, and uncertain fields were detected and allows the user to approve, ignore, or keep items as draft.

**Why this priority**: Long PDFs and AI/Skill extraction can be imperfect. A review layer prevents polluted training data while still allowing fast ingestion.

**Independent Test**: Import a noisy parsed document with uncertain answer keys; verify the batch summary flags uncertainty, saves candidates as drafts, and only approved items are treated as ready for normal practice.

**Acceptance Scenarios**:

1. **Given** an import batch contains low-confidence or missing fields, **When** the batch is saved, **Then** those items are marked for review and are visually distinguishable from ready items.
2. **Given** a user approves a draft item, **When** the approval is saved, **Then** the item becomes eligible for practice and planning.
3. **Given** a user ignores a bad item, **When** the item is ignored, **Then** it is excluded from practice recommendations but remains traceable in the import batch history.

### Edge Cases

- A long OCR PDF produces many sections but no explicit questions.
- A source produces duplicate questions, duplicate material passages, or repeated answer-key blocks.
- A parser creates only one generic question from a large document that should yield multiple practice items.
- A question has material and prompt but no answer key or scoring rubric.
- AI-inferred answers conflict with document-derived answers.
- Imported items reference a source document that later fails parsing or is removed.
- The practice page loads when the local question bank is empty.
- A user has active practice state and switches between practice, materials, and skill-management pages.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST define a standard Shenlun question-bank item that can represent imported, generated, and manually curated practice content.
- **FR-002**: Every standard question-bank item MUST include source identity, source category, Shenlun question type, title, prompt, bound material passages, estimated time, review state, and creation metadata.
- **FR-003**: Every standard question-bank item MUST support optional answer text, scoring rubric, scoring keywords, ability tags, topic tags, difficulty, and source page or section references.
- **FR-004**: The system MUST convert parsed document outputs into one or more standard question-bank items during import.
- **FR-005**: The system MUST classify imported items into practice categories such as past-paper practice, special-topic drill, weak-point drill, material-to-question, expression transfer, and draft review.
- **FR-006**: The system MUST preserve provenance from each standard item back to source document, source section, parser or Skill source, and confidence or review status.
- **FR-007**: The system MUST distinguish ready items from draft, needs-review, ignored, and archived items.
- **FR-008**: The system MUST avoid treating AI-inferred answer keys or rubrics as authoritative unless they are marked reviewed or document-derived.
- **FR-009**: The practice area MUST read from the standard question bank as the unified source for selectable Shenlun practice items.
- **FR-010**: The practice area MUST show meaningful empty states and category counts when the local bank has no ready items or only draft items.
- **FR-011**: Training sessions, answers, diagnoses, calibration snapshots, and learning-plan tasks MUST retain links to the standard question-bank item used for practice.
- **FR-012**: Learning plans MUST select tasks from ready standard question-bank items before falling back to generic generated drills.
- **FR-013**: Learning plans MUST explain which ability weakness, topic gap, diagnosis pattern, or source category caused an item to be selected.
- **FR-014**: Import batches MUST summarize detected documents, sections, questions, answer keys, scoring points, draft items, ready items, warnings, and ignored duplicates.
- **FR-015**: The system MUST deduplicate obvious repeated items within one import batch based on source, prompt, and material references.
- **FR-016**: The system MUST provide deterministic fallback classification for common sources when Agent or Skill output is incomplete.
- **FR-017**: The system MUST keep local persisted question-bank data usable without a network dependency.
- **FR-018**: Core normalization, import, repository, plan-selection, and practice-selection behavior MUST be covered by automated tests.

### Key Entities

- **QuestionBankItem**: The normalized practice asset used by the training loop, including prompt, materials, type, tags, difficulty, review state, and provenance.
- **QuestionBankRubric**: Scoring points, weights, keywords, answer notes, and whether the scoring data is document-derived, user-reviewed, or AI-inferred.
- **QuestionBankSource**: Source metadata for a document, URL, pasted text, generated skill output, or manual entry.
- **QuestionBankImportBatch**: A saved import event containing candidate items, warnings, counts, and review decisions.
- **PracticeCategory**: User-facing grouping for ready items, such as past-paper practice, topic drill, weak-point drill, material-to-question, and draft review.
- **ReviewState**: The lifecycle state controlling whether an item can be practiced or planned.
- **LearningPlanSelection**: The link between a learning task and the question-bank item or asset gap that caused the recommendation.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A parsed document with six detected practice questions results in six standard question-bank items, not one generic imported item.
- **SC-002**: At least two different source types can produce items that appear together in the same practice pool.
- **SC-003**: A user can filter ready practice items by question type, practice category, and topic before starting a timed practice session.
- **SC-004**: Every ready item created from import has at least one provenance reference to its source and no orphan material references.
- **SC-005**: Items without trusted answer keys remain usable for reading or drafting practice but are clearly marked as needing review before authoritative scoring.
- **SC-006**: Daily learning plans choose concrete ready question-bank items when available and provide an asset-gap message when none match the user's weak ability.
- **SC-007**: Switching away from and back to the practice or materials area does not discard active import or practice state.
- **SC-008**: Automated tests verify normalization, deduplication, import persistence, practice selection, and learning-plan selection.

## Assumptions

- The first implementation is limited to Shenlun practice and does not redesign Xingce or interview training.
- Existing document parsing, Agent, Skill, PDF, and MinerU workflows remain responsible for extracting source text and candidate structures.
- Existing local persistence remains the source of truth for imported study assets.
- The first UI update can extend the current practice page instead of creating a completely separate question-bank app.
- AI-generated or Skill-generated answers may assist the user, but review state and provenance must make their trust level visible.
