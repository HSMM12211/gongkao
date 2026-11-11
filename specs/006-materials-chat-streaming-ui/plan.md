# Implementation Plan: Materials Chat Streaming UI

Chinese version: [plan.zh-CN.md](./plan.zh-CN.md)

**Branch**: `006-materials-chat-streaming-ui` | **Date**: 2026-06-04 | **Spec**: [spec.md](./spec.md)

## Summary

Upgrade `/materials` from a textarea plus detached CLI process panel into a streaming chat surface. Add a typed chat message/event model, map existing `AgentRunEvent` frames into assistant message events, persist recent messages in the material workbench session, and render the trace as a collapsible assistant detail rather than the primary panel.

## Technical Context

**Language/Version**: TypeScript 5.7, React 19, Next.js 16, Rust/Tauri backend already present.

**Primary Dependencies**: Existing `lib/agent`, `app/materials/page.tsx`, Tauri Agent runtime, lucide-react, existing UI components.

**Storage**: Existing in-memory material workbench session and localStorage-backed editable workbench state.

**Testing**: Vitest focused tests, `npx tsc --noEmit`, `npm run lint`, `npm run check:mojibake`.

**Target Platform**: Local browser and Tauri desktop app.

**Project Type**: Local-first desktop/web application.

**Performance Goals**: Keep assistant rendering bounded to recent events and recent messages; long PDF runs should not render unbounded logs.

**Constraints**: Preserve local-first data, Inbox review boundary, isolated Agent execution, and existing upload/mention/Skill workflows.

**Scale/Scope**: `/materials` workbench only; no Agent Adapter rewrite.

## Constitution Check

- Local-first learning data: PASS. This feature only changes local UI state and existing local Agent streams.
- Traceable study assets: PASS. It improves trace visibility and Inbox handoff visibility.
- Test-first core logic: PASS. Event mapping and session persistence get focused tests.
- Isolated Skill and Agent execution: PASS. No change to workspace isolation or CLI spawning.
- Incremental delivery: PASS. User message + assistant stream is the first independently testable slice.

## Project Structure

```text
lib/agent/
├── material-chat.ts
├── material-workbench-session.ts
└── material-workbench-state.ts

app/materials/page.tsx

test/lib/agent/
├── material-chat.test.ts
├── material-chat-contract.test.ts
└── material-workbench-session.test.ts

scripts/
└── check-mojibake.mjs
```

**Structure Decision**: Keep the event mapping as a small domain helper in `lib/agent/material-chat.ts`; keep React rendering in the existing materials page for now to minimize routing/layout churn.

## Enterprise Lite Controls

This feature now follows the A-plan enterprise-lite baseline used for interview and handoff readiness.

- **Frontend contract**: The primary UI contract is message-first rendering in `/materials`, with raw trace kept secondary and collapsible.
- **Backend/Agent contract**: Runtime frames must satisfy `agentRunEventSchema` before they are treated as supported Agent events.
- **Display contract**: Assistant-facing events must satisfy `materialChatEventSchema` before they are considered valid UI events.
- **Encoding hygiene**: Source and docs are scanned by `scripts/check-mojibake.mjs` to prevent UTF-8/GBK mojibake from entering readable product copy, tests, and specs.
- **Review boundary**: Agent output still lands in Inbox review before becoming official learning assets.

## Acceptance Matrix

| Requirement | Implementation | Verification |
| --- | --- | --- |
| FR-001/FR-002: create user and assistant messages | `app/materials/page.tsx`, `lib/agent/material-chat.ts` | `test/lib/agent/material-chat.test.ts` |
| FR-003/FR-004: map Agent events into assistant events | `lib/agent/material-chat.ts` | `test/lib/agent/material-chat.test.ts`, `test/lib/agent/material-chat-contract.test.ts` |
| FR-005: raw trace remains secondary | `app/materials/page.tsx` | Manual UI check on `/materials`; existing trace stays in assistant details |
| FR-006/FR-007: persist recent messages | `lib/agent/material-workbench-session.ts`, `lib/agent/material-workbench-state.ts` | `test/lib/agent/material-workbench-session.test.ts` |
| FR-008/FR-009: preserve Agent runtime and Inbox boundary | `app/materials/page.tsx`, `lib/agent/verifier.ts`, storage repositories | `test/lib/agent/material-output.test.ts`, `test/lib/agent/verifier.test.ts` |
| FR-010: focused automated tests | `test/lib/agent/material-chat*.test.ts` | `npm run test -- material-chat material-workbench-session` |

## Quality Gates

Run before handoff:

```powershell
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run test -- material-chat material-workbench-session
npm.cmd run check:mojibake
```

For a full local gate, run:

```powershell
npm.cmd run quality
```

## Risks And Rollback

- **Risk: Event stream changes silently break chat rendering.** Mitigation: keep `material-chat-contract.test.ts` aligned with `contracts/material-chat-events.md`.
- **Risk: Long Agent runs produce too many UI events.** Mitigation: event history remains bounded at 80 events per assistant message and 12 recent chat messages.
- **Risk: AI-generated Chinese copy becomes unreadable due to encoding drift.** Mitigation: `npm run check:mojibake` fails on common mojibake fragments.
- **Rollback path**: Keep `lib/agent/material-chat.ts` as the isolated event mapper. If the chat surface regresses, the mapper and session persistence can be disabled while leaving the underlying Agent runtime and Inbox flow intact.

## Data Model

See [data-model.md](./data-model.md).

## Contracts

See [contracts/material-chat-events.md](./contracts/material-chat-events.md).

## Complexity Tracking

No constitution violations.

## Development Context

Primary development discussion reference: `019e4aa1-bf79-75e3-b526-6a3e75df0f39`.

That thread established the product direction: local-first gongkao study app, desktop packaging, cloud/local speech recognition, PDF material ingestion, AI or local Agent parsing, structured local question bank, review/practice/copybook workflows, and later the Materials Agent workbench. The controls in this plan are intended to make that vibe-coding flow repeatable instead of ad hoc.
