<!-- SPECKIT START -->
Current Spec Kit plan: specs/007-ai-agent-orchestrator-cli-v1/plan.md
Use specs/007-ai-agent-orchestrator-cli-v1/spec.md, data-model.md, contracts/, quickstart.md, and tasks.md for this feature.
<!-- SPECKIT END -->

## Enterprise-Lite Vibe Coding Rules

- Use `docs/engineering/vibe-coding-pitfalls.md` as the project-level pitfall log for AI-assisted development.
- Treat `019e4aa1-bf79-75e3-b526-6a3e75df0f39` as the main historical development thread reference when explaining product direction.
- Before handoff, run the scoped quality gate from the active plan or `npm run quality` when practical.
- If Agent runtime events change, update `specs/006-materials-chat-streaming-ui/contracts/material-chat-events.md`, `lib/agent/material-chat-schema.ts`, and `test/lib/agent/material-chat-contract.test.ts` together.
- If Chinese copy or tests are edited, run `npm run check:mojibake` before handoff.
- Agent-generated study assets must continue to pass through Inbox review before becoming official local learning assets.
