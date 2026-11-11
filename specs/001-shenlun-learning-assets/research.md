# Research: Shenlun Learning Assets

## Existing Domain Fit

**Decision**: Extend `lib/shenlun` instead of introducing a separate generic
knowledge-base subsystem.

**Rationale**: The project already has documents, exam papers, passages,
questions, answer keys, scoring points, training sessions, answers, diagnoses,
calibration snapshots, and expression assets. Personalized plans need to reuse
these records directly.

**Alternatives considered**:

- Generic graph model: flexible but duplicates the申论 domain and increases UI
  mapping work.
- Material-only metadata: too shallow for training and scoring feedback.

## Asset Extraction Strategy

**Decision**: Use deterministic extraction and normalization as the required
baseline, then allow Skill/Agent enrichment as optional future input.

**Rationale**: Local-first operation must work after PDF parsing without a cloud
model. Deterministic derivation can map common question phrases to ability tags,
extract topic keywords, and capture expression snippets while marking uncertain
items for review.

**Alternatives considered**:

- AI-only extraction: higher semantic quality, but not dependable offline and
  risks hallucinated scoring points.
- Manual-only curation: trustworthy, but too slow after every import.

## Provenance and Review

**Decision**: Every derived topic, ability mapping, expression asset, and
learning task keeps provenance with confidence and review status.

**Rationale**: Users must know whether training advice is grounded in a document,
their own corrections, or an inferred result. This also supports later reruns and
review queues.

**Alternatives considered**:

- Store provenance only on documents: loses source evidence for individual
  topics or tasks.
- Confidence without review status: cannot drive correction workflows.

## Plan Generation

**Decision**: Generate plans with a deterministic scoring function that ranks
tasks by ability weakness, issue frequency, time budget, target stage, and asset
availability.

**Rationale**: The system can explain why a task appears and can be tested
without nondeterministic model output. Later AI can rewrite the explanation, but
selection must remain auditable.

**Alternatives considered**:

- Fixed plans by user stage: simple but ignores imported documents and diagnosis
  history.
- LLM-selected tasks: expressive but hard to verify and not local-first.

## Storage

**Decision**: Add local IndexedDB stores through the existing storage schema and
repository pattern.

**Rationale**: Existing申论 data already persists this way, so the new feature can
reuse test setup and app state patterns.

**Alternatives considered**:

- File-based JSON store: easier to inspect but inconsistent with the current web
  runtime.
- Tauri-side SQLite: better long-term durability, but too large for this
  feature and not needed for a first vertical slice.
