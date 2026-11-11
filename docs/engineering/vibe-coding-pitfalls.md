# Enterprise-Lite Vibe Coding Pitfalls

This document records the lightweight guardrails for keeping this project usable after AI-assisted development.

Primary development thread reference: `019e4aa1-bf79-75e3-b526-6a3e75df0f39`.

## Project Context

The product direction came from an iterative AI-assisted development flow:

- Gongkao learning desktop/web app.
- Focus wake-up, review, practice, polishing, and copybook export workflows.
- Cloud API and local speech recognition support.
- PDF/material ingestion into structured local study assets.
- Local Agent/Codex/Claude-style processing for offline materials.
- Materials Agent workbench with Inbox review before official import.

The goal is not to stop vibe coding. The goal is to make the output repeatable, reviewable, and safe enough for handoff.

## Pitfalls And Guards

| Pitfall | What Happened / Risk | Guard Now In Place |
| --- | --- | --- |
| Personal paths in public screenshots | A README screenshot exposed the local CLI installation path, including the OS username. | Capture public images with local paths hidden or masked, inspect every image for usernames, paths, credentials and account details before staging, and check Git history separately when replacing a published image. |
| Prompt-only implementation drift | Free-form AI changes can produce UI and data-flow changes that are hard to explain later. | Each active feature must point to a `specs/*/plan.md` from `AGENTS.md`. |
| Frontend output without acceptance rules | UI can look plausible while missing empty, loading, error, review, or long-run states. | `specs/006-materials-chat-streaming-ui/plan.md` now has an acceptance matrix and quality gates. |
| Backend/Agent event mismatch | Agent streams can add or rename event kinds while the UI still assumes old shapes. | `lib/agent/material-chat-schema.ts` and `test/lib/agent/material-chat-contract.test.ts` make the event contract executable. |
| Raw CLI logs dominate the user workflow | A working Agent run can still feel like a terminal dump instead of a product surface. | Materials chat keeps trace secondary and collapsible while showing assistant-facing events. |
| Agent output bypasses human review | AI-generated materials could become official study assets without validation. | Inbox review remains the boundary before import into learning assets. |
| Long runs create unbounded UI state | PDF and tool-heavy runs can flood the UI and local session. | Chat events are bounded to 80 events per assistant message and 12 recent messages. |
| Encoding/mojibake regressions | Chinese product copy or tests can become unreadable after terminal or file-encoding drift. | `scripts/check-mojibake.mjs` and `npm run check:mojibake` scan source/docs for common mojibake fragments. |
| "Tests pass" without a single command | AI can claim completion from confidence rather than evidence. | Use `npm run quality` or the scoped commands in the current plan before handoff. |

## Working Rules

1. Start feature work from the active spec and plan.
2. If a backend/Agent payload changes, update the schema, contract doc, and mapping tests in the same change.
3. If UI copy includes Chinese, verify it through `npm run check:mojibake`.
4. If a failure was found during AI-assisted work, add it here with the root cause and the guard that prevents recurrence.
5. Keep A-plan changes light: document, test, and gate first; split large UI files only when executing the heavier B-plan.

## Current A-Plan Gate

Run these before presenting the current Materials chat work as handoff-ready:

```powershell
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run test -- material-chat material-workbench-session
npm.cmd run check:mojibake
```

For the full local gate:

```powershell
npm.cmd run quality
```
