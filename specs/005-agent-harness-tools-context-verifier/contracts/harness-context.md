# Contract: Harness Context Request Fields

`StartMaterialAgentRunRequest.context` may include:

```json
{
  "skillIds": [],
  "topicIds": [],
  "fileIds": [],
  "sourceIds": [],
  "questionTypes": [],
  "tags": [],
  "unknownMentions": [],
  "harness": {
    "toolPlan": {},
    "contextMap": {},
    "memory": {},
    "workflowPlan": {}
  }
}
```

Rules:

- Existing fields remain compatible.
- `harness` is optional and local-first.
- Raw long source history must not be placed into memory.
- Verifier warnings are displayed and stored in run logs / Inbox diagnostics, but do not mark official import complete.
