# Feature Specification: Agent Harness Tools Context Verifier

**Feature Branch**: `codex/004-agent-harness-trace`

**Created**: 2026-06-03

**Status**: Draft

**Input**: User description: "Continue remaining Agent Harness development from `docs/superpowers/specs/2026-06-03-gongkao-agent-harness.md` until complete. Build the remaining executable foundation after trace: Tool Registry, progressive context engine, layered memory summary, business verifier, and a practical workflow role plan."

## User Scenarios & Testing

### User Story 1 - Tool Choice Is Explicit (Priority: P1)

A user uploads or pastes material and starts an Agent task. The workbench can explain which Harness tool path will be used, such as normal material parsing, local PDF Skill, MinerU OCR fallback, source verification, question normalization, or learning-plan planning.

**Why this priority**: Agent reliability depends on bounded tools. The user must not see a vague "AI is doing it" flow.

**Independent Test**: Given a PDF-like source and prompt, the app selects a primary PDF extraction tool and a MinerU fallback. Given a normal text source, it selects material parsing without OCR.

**Acceptance Scenarios**:

1. **Given** a PDF file is uploaded, **When** the run is prepared, **Then** the tool plan includes `pdf.extract` and fallback `pdf.ocr.mineru`.
2. **Given** pasted policy text is used, **When** the run is prepared, **Then** the tool plan uses `material.parse`.
3. **Given** the user binds a source verification Skill, **When** the run is prepared, **Then** the tool plan includes source verification capabilities.

---

### User Story 2 - Context Is Disclosed Progressively (Priority: P2)

A user can run Agent tasks against long sources without the app dumping everything into the model. The Harness creates a context map, selected snippets, prompt budget metadata, and warnings.

**Why this priority**: Long PDF and large knowledge-base workflows require context engineering, not one giant prompt.

**Independent Test**: Feed short and long source texts to the context engine and verify it chooses full source for short text, snippet/map mode for long text, and records budget warnings.

**Acceptance Scenarios**:

1. **Given** a short source, **When** context is built, **Then** the context mode is `full_source`.
2. **Given** a long source, **When** context is built, **Then** the context mode is `snippets` and includes a context map.
3. **Given** prompt budget trimming occurred, **When** context is sent to the Agent, **Then** warnings state the retained coverage.

---

### User Story 3 - Agent Output Has Business Verification (Priority: P3)

A user receives candidate output that has passed not only JSON schema validation but also business checks for source coverage, long-document question count, learning value, and review risk.

**Why this priority**: A valid JSON can still be a bad learning asset. The app must catch common Agent failures such as long PDFs producing one generic question.

**Independent Test**: Verify a valid but weak long-PDF output returns warnings or review requirements, while a complete output passes with higher confidence.

**Acceptance Scenarios**:

1. **Given** a long PDF output contains only one practice question, **When** verification runs, **Then** the run receives a warning and remains review-oriented.
2. **Given** references are sparse or generic, **When** verification runs, **Then** the report flags source coverage risk.
3. **Given** generated questions are usable, **When** verification runs, **Then** they can enter Inbox as reviewed candidates, not official data.

---

### User Story 4 - Memory Summary Is Passed Safely (Priority: P4)

A user’s recent runs, imported sources, pending Inbox count, and learning asset stats are summarized for the Agent without sending raw history wholesale.

**Why this priority**: The Agent should be aware of recent context and gaps but must remain local-first and budget-aware.

**Independent Test**: Build memory from sample runs and sources and verify it produces bounded recent summaries and asset-gap warnings.

**Acceptance Scenarios**:

1. **Given** recent failed runs exist, **When** memory is built, **Then** their summaries appear as recovery context.
2. **Given** the question bank or topic assets are empty, **When** memory is built, **Then** an asset gap warning is produced.
3. **Given** many historical records exist, **When** memory is built, **Then** only bounded summaries are included.

## Edge Cases

- Long PDF text has no clear paragraph boundaries.
- Tool requirements exceed current Adapter capabilities.
- Agent output is schema-valid but low value.
- The user has no local memory assets yet.
- Mention context includes unknown `@` tokens.
- Verifier produces warnings but no blocking errors.

## Requirements

### Functional Requirements

- **FR-001**: System MUST define a Tool Registry with bounded tool IDs, permissions, input expectations, output expectations, and fallback behavior.
- **FR-002**: System MUST derive a tool plan before launching a material Agent run.
- **FR-003**: System MUST include PDF primary and MinerU OCR fallback tool planning for PDF sources.
- **FR-004**: System MUST build a context map for each Agent run.
- **FR-005**: System MUST use snippet/map mode for long sources and full-source mode for short sources.
- **FR-006**: System MUST include prompt budget warnings in the structured context sent to the Agent.
- **FR-007**: System MUST build a bounded memory snapshot from local recent runs, material sources, Inbox state, and learning asset stats.
- **FR-008**: System MUST run business verification after schema validation and before Inbox candidate handoff.
- **FR-009**: System MUST warn when long PDF or long document output collapses into too few practice questions.
- **FR-010**: System MUST warn when provenance/reference coverage is weak.
- **FR-011**: System MUST keep all Agent outputs review-oriented and must not mark official import complete automatically.
- **FR-012**: Tool planning, context engine, memory snapshot, and verifier behavior MUST have focused automated tests.

### Key Entities

- **AgentToolDefinition**: Declares one bounded Harness tool, its permissions, capabilities, timeout, and fallback behavior.
- **AgentToolPlan**: The selected primary/fallback tools and reasons for a run.
- **AgentContextMap**: Structured context metadata, source shape, snippet strategy, and budget warnings.
- **AgentMemorySnapshot**: Bounded summary of local recent work and learning assets.
- **AgentBusinessVerification**: Warnings/errors/confidence from business checks after schema validation.
- **AgentWorkflowPlan**: Practical role plan declaring single-agent or planner/executor/evaluator mode.

## Success Criteria

- **SC-001**: PDF sources produce a tool plan with `pdf.extract` primary and `pdf.ocr.mineru` fallback.
- **SC-002**: Long sources produce snippet/map context and warnings without losing the original run workspace behavior.
- **SC-003**: Long-document outputs with too few questions are flagged before review.
- **SC-004**: Agent request context includes tool plan, context map, memory snapshot, workflow plan, and prompt budget metadata.
- **SC-005**: Automated tests cover tool selection, context mapping, memory summarization, and business verification.

## Assumptions

- This feature completes the executable Harness foundation; true autonomous multi-Agent execution can be built later on top of `AgentWorkflowPlan`.
- Existing PDF parsing runtime already performs the actual `$pdf` and MinerU fallback; this feature makes that path explicit in Agent context.
- Existing Inbox and import flow remain the official write boundary.
