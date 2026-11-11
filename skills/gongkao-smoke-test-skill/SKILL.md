---
name: gongkao-smoke-test-skill
description: Minimal Gongkao material-agent smoke test. It verifies that the app can stage a Skill, call the selected CLI Agent, and read a valid material-draft.json.
triggers:
  - smoke-test
  - material-runtime
  - health-check
---

# Gongkao Smoke Test Skill

This Skill is intentionally small. Its only job is to prove that the Gongkao material-agent runtime can complete the full path:

1. Stage this Skill into an isolated run workspace.
2. Read the run request from the prompt.
3. Write `material-draft.json` at the run workspace root.
4. Keep the output valid against `output-schema.json`.

## Required Output

Create `material-draft.json` with this exact top-level shape:

```json
{
  "schemaVersion": 1,
  "source": {
    "title": "Skill Runtime Smoke Test",
    "sourceType": "text",
    "text": "This is a smoke-test material source for Gongkao Agent runtime validation.",
    "references": [
      {
        "title": "Local smoke-test input",
        "publisher": "Gongkao Desktop",
        "accessedAt": "2026-05-27",
        "excerpt": "Smoke-test material source for runtime validation."
      }
    ]
  },
  "draft": {
    "topic": "Skill Runtime Smoke Test",
    "summary": "The Agent runtime can read the Skill instruction and produce a valid structured material draft.",
    "tags": ["smoke-test", "runtime"],
    "keywords": ["Skill", "Agent", "material-draft"],
    "goldenSentences": ["基础能力稳定，复杂工作流才有可靠落点。"],
    "flashcards": [
      {
        "front": "Skill 冒烟测试验证哪条链路？",
        "keywords": ["Skill", "隔离工作区", "结构化输出"],
        "category": "对策"
      }
    ],
    "practiceQuestions": [
      {
        "type": "综合分析",
        "title": "Skill 运行链路验证",
        "material": "应用通过本地 CLI Agent 执行 Skill，并读取 material-draft.json。",
        "prompt": "请简要分析为什么需要先做冒烟测试。",
        "keywords": ["稳定性", "可观测", "闭环"],
        "modelAnswer": "冒烟测试能够用最小任务验证 Skill 发现、隔离工作区、CLI 调用和结构化输出是否贯通，便于在复杂素材采集前快速定位基础链路问题。"
      }
    ],
    "copybookItems": [
      {
        "title": "运行稳定",
        "text": "基础能力稳定，复杂工作流才有可靠落点。",
        "tags": ["smoke-test"]
      }
    ]
  },
  "report": {
    "summary": "Smoke test completed.",
    "warnings": [],
    "confidence": 0.9
  }
}
```

Use the enum values exactly as shown above. They match the current app validator.

Also write a short `report.md` explaining whether the file was created successfully.
