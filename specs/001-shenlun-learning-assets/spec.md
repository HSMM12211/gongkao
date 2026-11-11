# Feature Specification: Shenlun Learning Assets

**Feature Branch**: `001-shenlun-learning-assets`

**Created**: 2026-06-01

**Status**: Draft

**Input**: User description: "PDF parsing/import produces structured Shenlun learning assets and personalized learning plans for different users."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Imported PDFs Become Learning Assets (Priority: P1)

A user imports a Shenlun PDF such as a past paper, answer key, commentary, or
lecture handout. After parsing finishes, the app turns the imported content into
structured, reviewable learning assets instead of only storing raw text.

**Why this priority**: Without structured assets, later personalized training is
not grounded in source material and cannot be trusted.

**Independent Test**: Import a representative parsed document and verify that
the app produces document, paper, passage, question, answer key, scoring point,
topic, ability, and expression assets with provenance back to the imported file.

**Acceptance Scenarios**:

1. **Given** a parsed past-paper PDF with materials, questions, answer text, and
   scoring points, **When** the import is saved, **Then** the app stores linked
   learning assets that preserve source document, page, passage, and question
   references.
2. **Given** a parsed PDF that lacks an answer key or scoring standard, **When**
   the import is saved, **Then** the app marks missing assets as needing review
   instead of fabricating document-derived scoring points.
3. **Given** an imported commentary or policy document, **When** the import is
   saved, **Then** the app extracts topic and expression assets without creating
   fake exam questions.

---

### User Story 2 - User Profile Drives Today’s Training Plan (Priority: P2)

A user opens the Shenlun training area and sees a daily plan tailored to their
stage, target exam, available time, weak question types, topic gaps, and recent
diagnosis history.

**Why this priority**: The product value is the training loop: imported assets
must turn into an actionable plan that tells different users what to practice
next.

**Independent Test**: Create a user profile plus imported assets and diagnosis
history, generate a plan, and verify that the plan chooses tasks matching the
profile constraints and explains the selection.

**Acceptance Scenarios**:

1. **Given** a beginner profile with limited daily time and weak summary ability,
   **When** a plan is generated, **Then** the app prioritizes reading extraction,
   summary questions, and short review tasks that fit the time budget.
2. **Given** a sprint-stage user with recent missed scoring points in
   countermeasure questions, **When** a plan is generated, **Then** the app
   assigns targeted countermeasure drills and scoring-point review before broad
   essay practice.
3. **Given** there are not enough assets for the requested exam area, **When** a
   plan is generated, **Then** the app reports the asset gap and recommends what
   to import next.

---

### User Story 3 - Training Results Update the Learning Loop (Priority: P3)

After a user completes Shenlun practice and receives diagnosis, the app updates
their ability profile and future plans so repeated practice becomes calibrated
rather than static.

**Why this priority**: Personalized learning must adapt to performance, or the
plan becomes a fixed checklist.

**Independent Test**: Submit a training answer with diagnosis, update the user
profile, regenerate the plan, and verify that weak abilities and repeated issue
tags affect the next task sequence.

**Acceptance Scenarios**:

1. **Given** a diagnosis with missed points, weak structure, and time overrun,
   **When** the profile is recalibrated, **Then** the related ability scores and
   issue counters change.
2. **Given** repeated high performance on one question type, **When** the next
   plan is generated, **Then** the app reduces routine drills for that type and
   allocates time to weaker abilities.
3. **Given** a user improves across multiple sessions, **When** the plan is
   regenerated, **Then** the app shows the reason for moving from foundation
   tasks to integrated timed practice.

---

### Edge Cases

- Imported PDF contains only raw article text and no exam structure.
- Parsed output contains duplicate questions, duplicated passages, or repeated
  answer-key sections.
- AI/Skill parsing returns uncertain or conflicting topic and ability labels.
- A plan is requested before any imported Shenlun asset exists.
- A plan is requested for a user with no diagnosis history.
- The user has less available time than a full task normally requires.
- A training diagnosis references a question that has since been deleted or
  is missing from local storage.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST represent imported Shenlun content as a structured
  learning asset graph that links documents, papers, passages, questions,
  answer keys, scoring points, topic assets, ability tags, expression assets,
  and provenance records.
- **FR-002**: System MUST classify each imported document into a supported
  learning role: past paper, single question, answer key, policy/commentary,
  lecture material, or personal note.
- **FR-003**: System MUST attach source provenance to every derived asset,
  including source document, source type, parser source, confidence level, and
  available page or text-span references.
- **FR-004**: System MUST distinguish document-derived, user-authored, and
  AI-inferred assets.
- **FR-005**: System MUST mark uncertain, incomplete, or AI-inferred scoring
  assets as needing review before they are used as authoritative scoring
  standards.
- **FR-006**: System MUST map questions and scoring points to Shenlun ability
  dimensions covering reading extraction, summary, analysis, countermeasure,
  implementation/document format, essay ideation, formal expression, and time
  control.
- **FR-007**: System MUST extract or derive topic assets from imported documents
  so a plan can target policy themes, governance issues, cases, and expression
  material.
- **FR-008**: System MUST maintain a user learning profile with target exam,
  stage, available study time, ability scores, topic coverage, question-type
  performance, issue-tag history, and recent training cadence.
- **FR-009**: System MUST generate a daily learning plan from the user profile,
  available assets, and recent diagnosis history.
- **FR-010**: System MUST generate weekly or phase-level plan summaries that
  group daily tasks into foundation, consolidation, timed practice, and review
  blocks.
- **FR-011**: Every learning task MUST reference the asset or diagnosis evidence
  that caused it to be selected.
- **FR-012**: System MUST explain plan rationale in user-facing language without
  exposing raw implementation details.
- **FR-013**: System MUST update the user learning profile from submitted
  training diagnoses and stage timing records.
- **FR-014**: System MUST avoid sending user documents or study history to remote
  services unless the user explicitly chooses a remote Skill or Agent workflow.
- **FR-015**: System MUST provide review states for imported assets so users can
  approve, correct, ignore, or re-run extraction for uncertain items.

### Key Entities *(include if feature involves data)*

- **LearningAssetProvenance**: Source metadata for any derived asset, including
  document id, optional page or text span, extraction method, confidence, and
  review state.
- **TopicAsset**: A reusable Shenlun topic, policy theme, governance case, fact,
  phrase, or argument pattern extracted from imported materials.
- **AbilityTag**: A normalized ability dimension used to connect questions,
  scoring points, diagnosis results, and learning tasks.
- **LearningTask**: One actionable training unit such as reading extraction,
  scoring-point recall, single-question writing, expression rewrite, or timed
  practice.
- **UserLearningProfile**: The user's target, stage, time budget, ability
  estimates, weaknesses, topic coverage, and recent training cadence.
- **LearningPlan**: A generated daily or weekly schedule containing ordered
  learning tasks, rationale, estimated minutes, and completion state.
- **AssetReviewState**: The status used to decide whether an asset is ready,
  needs review, was corrected, or should be ignored.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a parsed past-paper PDF that includes materials, questions,
  answer text, and scoring points, the system creates all required asset types
  with no orphan questions or scoring points.
- **SC-002**: For an imported document without scoring standards, the system
  produces usable topic or expression assets while marking missing scoring
  standards for review.
- **SC-003**: A user profile with at least one imported asset can generate a
  daily plan containing at least one task, a time estimate, and a rationale.
- **SC-004**: A diagnosis containing issue tags and timing data changes the next
  generated plan in a measurable way, such as task priority, ability score, or
  review focus.
- **SC-005**: The plan generator can produce a valid fallback message when no
  assets are available, including the next recommended import action.
- **SC-006**: Core asset extraction, profile calibration, and plan generation
  behavior is covered by automated tests.

## Assumptions

- The first implementation focuses on申论 training data; 行测 and interview
  planning are out of scope.
- Existing PDF parsing remains responsible for text and layout extraction; this
  feature starts after parsed text/layout exists.
- Existing IndexedDB-backed local repositories remain the primary persistence
  layer unless a later feature introduces a database migration.
- AI and Skill workflows may enrich classification, but deterministic fallback
  rules must exist for common past-paper and commentary imports.
- The first UI can surface plans inside the existing申论训练/素材库 flow; a
  separate mobile experience is out of scope.
