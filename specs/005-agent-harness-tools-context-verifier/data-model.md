# Data Model: Agent Harness Tools Context Verifier

## AgentToolDefinition

- `id`: stable tool id.
- `name`: user-facing tool name.
- `description`: bounded responsibility.
- `requiredPermissions`: permission labels.
- `requiredCapabilities`: adapter capabilities.
- `timeoutMs`: expected timeout.
- `failureMode`: retryable, fallback, or manual-review-required.

## AgentToolPlan

- `primaryToolId`: selected primary tool.
- `fallbackToolIds`: ordered fallbacks.
- `reasons`: why the plan was selected.
- `warnings`: tool capability or risk warnings.

## AgentContextMap

- `mode`: map, snippets, or full_source.
- `source`: source metadata and character counts.
- `snippets`: bounded source snippets.
- `boundContext`: mention-derived context.
- `budget`: prompt budget counts and warnings.
- `warnings`: context-specific warnings.

## AgentMemorySnapshot

- `recentRuns`: bounded recent run summaries.
- `assets`: source, inbox, topic, and provenance counts.
- `warnings`: asset gaps or repeated failures.

## AgentBusinessVerification

- `ok`: whether the output can continue to review.
- `warnings`: non-blocking risks.
- `errors`: blocking issues.
- `confidence`: business confidence score.
- `reviewRecommendation`: ready, needs_review, or rejected.

## AgentWorkflowPlan

- `mode`: single_agent or planner_executor_evaluator.
- `roles`: role names and responsibilities.
- `reason`: why this mode was selected.
- `warnings`: multi-role caveats.
