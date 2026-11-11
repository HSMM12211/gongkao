# Quickstart: Agent Harness Tools Context Verifier

## Scenario 1: PDF Agent run

1. Upload a PDF in `/materials`.
2. Start Agent整理.
3. Confirm the Harness panel/tool context shows PDF extraction plus MinerU fallback.
4. Confirm context mode is snippets/map for long content.

## Scenario 2: Long PDF weak output

1. Use a long source with only one generated question.
2. Let the Agent output pass schema validation.
3. Confirm business verifier adds a warning and keeps the item as review candidate.

## Scenario 3: Empty memory

1. Clear material assets.
2. Build an Agent run.
3. Confirm memory snapshot warns that local assets are insufficient.

## Automated verification

```powershell
npm test -- tool-registry context-engine memory verifier workflow-plan
npx tsc --noEmit
npm run lint
```
