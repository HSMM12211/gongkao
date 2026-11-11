# Quickstart: AI Agent Orchestrator CLI v1

## Manual Scenario 1: Normal素材整理

1. Open `/materials`.
2. Select a built-in Skill such as `政策文件解析器`.
3. Paste a short policy material.
4. Submit the task.
5. Verify that the assistant shows a task plan, selected Skill, context scope, tool route, and review requirement.
6. Wait for the run to finish.
7. Verify that generated candidates enter Inbox review rather than being auto-imported.

## Manual Scenario 2: Long Document

1. Upload a long PDF or paste long extracted text.
2. Submit a request to convert it into training assets.
3. Verify that the UI shows original size, provided size, context mode, and coverage warnings.
4. Verify that the final report does not claim full coverage when context was truncated.

## Manual Scenario 3: Diagnostic Output

1. Run the Skill smoke test or a normal material task.
2. Inspect trace details.
3. Verify non-terminal CLI diagnostic lines are shown as diagnostic/warning rows, not as failed task status.

## Automated Verification

```powershell
npm.cmd test -- orchestrator material-chat material-workbench-session material-workbench-state context-engine memory verifier
npx.cmd tsc --noEmit
npm.cmd run lint
```
