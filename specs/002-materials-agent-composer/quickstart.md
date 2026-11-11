# Quickstart: Materials Agent Composer UX

1. Start the app with `npm run dev` or Tauri desktop dev mode.
2. Open `/materials`.
3. Verify the top workbench shows one unified composer with Agent status, Skill summary, prompt area, context footer, and start button.
4. Click `专题 Wiki` or `来源核验`; verify the prompt changes and the selected Skill summary changes.
5. Type `@Skill:gong` in the prompt; verify suggestions appear and Tab/click completion works.
6. Add an unknown mention like `@未知上下文`; verify it appears as a warning chip.
7. Run focused tests:

```powershell
npm run test -- test/lib/agent/context-mentions.test.ts test/lib/agent/material-composer.test.ts test/lib/agent/skill-inputs.test.ts test/lib/agent/material-run.test.ts
npm run lint
```
