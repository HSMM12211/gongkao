# Research: Standard Shenlun Question Bank

## Decision 1: Keep existing training-question entities and add a practice-facing bank layer

**Decision**: Add normalized question-bank records that can reference existing training questions, passages, answers, scoring points, topic assets, and provenance.

**Rationale**: Existing training sessions, diagnoses, and exam mode already depend on `TrainingQuestion`. Replacing those entities would create broad churn. A bank layer gives practice and planning a unified source while keeping existing flows compatible.

**Alternatives considered**:

- Replace `TrainingQuestion` with a new type everywhere. Rejected because it would touch too much working training logic.
- Store only imported questions and infer bank metadata at read time. Rejected because review state, category, and provenance need durable records.

## Decision 2: Normalize during import and keep deterministic fallback classification

**Decision**: Parsed output import will build question-bank items immediately. If parser/Skill fields are incomplete, local deterministic rules infer category, difficulty, ability tags, and review state.

**Rationale**: The user specifically observed large PDFs producing incomplete imports. Import-time normalization makes failures visible and keeps later practice selection simple.

**Alternatives considered**:

- Ask the Agent to always output the final bank format. Rejected because local fallback is required when Skills fail or output is incomplete.
- Only normalize when the user opens practice. Rejected because import-batch review and asset counts should be available right after import.

## Decision 3: Review state controls practice and plan eligibility

**Decision**: Ready items are eligible for normal practice and learning-plan selection. Draft and needs-review items remain visible in counts/review surfaces but are not treated as authoritative scoring items.

**Rationale**: This prevents AI-inferred rubrics from polluting scoring while still allowing the user to see and approve candidates.

**Alternatives considered**:

- Allow all items into plans immediately. Rejected because uncertain scoring standards could mislead users.
- Hide uncertain items entirely. Rejected because the user needs review and correction workflows.

## Decision 4: Learning plans prefer question-bank items but keep legacy fallback

**Decision**: Plan generation accepts optional question-bank items. When ready matching items exist, plans select from them; otherwise they fall back to existing questions/topics and asset-gap warnings.

**Rationale**: This delivers the new behavior while preserving compatibility with current tests and seeded data.

**Alternatives considered**:

- Make question-bank input mandatory. Rejected because existing installations may have older training questions but no bank records.
- Add a separate plan generator. Rejected because current calibration/profile logic should remain centralized.
