# 申论训练闭环 Phase 2-5 SDD 规格

日期：2026-05-28

## 目标

在 Phase 1 单题闭环基础上，一次性补齐后续 5 个方向：

1. 真题 PDF / MinerU 文本结构化解析强化。
2. 整套考场模式。
3. 评论 / 政策文件转表达训练。
4. 阶段校准增强为周期报告。
5. AI / Agent 结构化解析与评分契约。

## 规格

### 1. 真题解析强化

- 输入：MinerU 或 PDF.js 提取后的纯文本。
- 输出：`ShenlunDocumentParserOutput`。
- 必须识别：
  - 材料段落。
  - 作答要求 / 问题。
  - 参考答案。
  - 评分要点。
- 失败时返回 warnings，不能静默生成空题。

验收：

```text
包含“材料一”“问题一”“参考答案”“评分要点”的文本
-> 至少生成 1 个 passage、1 个 question、1 个 answerKey、1 个 scoringPoint
```

### 2. 考场模式

- 支持从 `ExamPaper` 创建 `TrainingSession(mode="exam")`。
- 一次提交多题答案。
- 每题生成诊断。
- 汇总整卷得分、平均命中率、总用时、时间控制问题。

验收：

```text
一套含 2 道题的真题
-> 创建 exam session
-> 提交 2 份答案
-> 生成 2 条 diagnosis 和 1 个 exam summary
```

### 3. 评论转表达

- 对 `commentary` / `policy_file` 文档提取表达资产。
- 表达资产包含原句、可迁移表达、适用场景、标签。
- 可生成表达迁移训练题。
- 用户改写后给出本地迁移诊断。

验收：

```text
评论文章输入
-> 生成 expression asset
-> 生成 expression_transfer session
-> 提交改写后生成 diagnosis
```

### 4. 阶段校准增强

- 从 session、diagnosis、question 生成周期报告。
- 包含：
  - 训练量。
  - 平均分。
  - 高频错因。
  - 题型分布。
  - 时间控制。
  - 下一阶段训练计划。

验收：

```text
多次训练诊断
-> 输出 calibration report
-> 报告包含 topIssueTags、questionTypeBreakdown、timeControl、trainingPlan
```

### 5. AI / Agent 契约

- AI 解析真题输出必须通过 parser schema。
- AI 评分输出必须通过 diagnosis schema。
- 不合法 JSON 或未知错因标签必须被拒绝。
- Agent 输出只进入可审计结构，不直接覆盖用户资产。

验收：

```text
合法 structured JSON -> accepted
未知 issue tag -> rejected
```

## 执行规则

- 每个方向先写测试，再实现。
- 页面只调用领域函数，不在 JSX 中堆业务规则。
- 所有新增 IndexedDB store 使用 `id` 作为主键。
- 完成后必须运行：

```text
npm run test
npx tsc --noEmit
npm run build
cargo test --no-default-features
npm run desktop:build
```
