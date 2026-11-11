# Quickstart: Agent Harness Trace State Machine

## Scenario 1: Successful Skill run

1. Open `/materials`.
2. Select an enabled material Skill.
3. Enter a simple material instruction.
4. Start the Agent run.
5. Confirm the Agent process panel shows CLI startup, output or thinking, artifact write, validation, and completion/review-ready status.
6. Confirm the run workspace contains `trace.jsonl`.

Expected result:

- The UI shows observable Agent progress.
- The result is still a candidate requiring review/import.

## Scenario 2: Missing or invalid output

1. Run a Skill that exits without valid `material-draft.json`.
2. Open the Agent run center.
3. Review the trace.

Expected result:

- Previous stdout/tool events remain visible.
- The failure reason is visible.
- No official material import is marked complete.

## Scenario 3: Workspace recovery

1. Complete or fail a material Agent run.
2. Navigate away from `/materials`.
3. Return to `/materials`.
4. Let the app refresh run statuses.

Expected result:

- The latest run record can show that trace diagnostics exist.
- The workspace probe reports artifact, report, and trace availability.

## Automated verification

Run:

```powershell
npm test -- run-process trace run-status-sync
npx tsc --noEmit
```

For Tauri runtime changes:

```powershell
Set-Location src-tauri
cargo test agent
```
