# 申论训练闭环 SDD 主规格

日期：2026-05-27

关联需求：[2026-05-27-shenlun-training-loop.md](./2026-05-27-shenlun-training-loop.md)

## 1. SDD 原则

本功能采用 SDD（Specification-Driven Development，规范驱动开发）。

开发顺序必须是：

```text
需求规格
-> 领域模型
-> 数据契约
-> 状态机
-> 验收场景
-> 测试用例
-> 实现
-> 验证
```

禁止直接从 UI 开始堆功能。每个阶段都必须先有可验证规格，再写测试，再实现。

## 2. 产品边界

本规格只覆盖申论训练，不覆盖行测。

系统定位：

```text
素材知识库 = 资料加工中心
申论训练闭环 = 训练执行中心
智能温故舱 = 复盘记忆中心
字帖导出舱 = 表达沉淀中心
```

左侧主导航只出现一个入口：

```text
申论训练闭环
```

页面内部承载：

```text
今日训练
时间感训练
复盘诊断
评论转表达
考场模式
阶段校准
```

## 3. 第一阶段垂直切片

完整需求很大，第一阶段必须先做一个可闭环的最小垂直切片。

第一阶段目标：

```text
离线真题文档入库
-> 解析为材料、题目、参考答案、评分要点
-> 从申论训练闭环调用单题训练
-> 记录分阶段耗时与作答内容
-> 生成结构化诊断和错因标签
-> 更新阶段校准统计
```

第一阶段不做：

- 全套复杂题库管理
- 公开网络爬虫
- 多人账号系统
- 自动判分绝对准确性承诺
- 完整大作文深度评分

## 4. 领域模型

### 4.1 文档资产

`ShenlunDocument`

表示用户导入的一份离线资料。

字段：

```ts
type ShenlunDocument = {
  id: string
  title: string
  documentType:
    | "exam_paper"
    | "single_question"
    | "answer_key"
    | "policy_file"
    | "commentary"
    | "lecture"
    | "personal_note"
  sourceType: "pdf" | "markdown" | "text"
  originalName?: string
  rawText: string
  createdAt: string
  parseStatus: "pending" | "parsed" | "needs_review" | "failed"
  parseError?: string
}
```

### 4.2 真题套卷

`ExamPaper`

表示一套可训练的申论真题。

字段：

```ts
type ExamPaper = {
  id: string
  documentId: string
  title: string
  year?: number
  province?: string
  examName?: string
  totalMinutes: number
  materialIds: string[]
  questionIds: string[]
  createdAt: string
}
```

### 4.3 材料段落

`MaterialPassage`

表示真题或资料中的一段材料。

字段：

```ts
type MaterialPassage = {
  id: string
  documentId: string
  paperId?: string
  order: number
  title?: string
  text: string
  pageStart?: number
  pageEnd?: number
  tags: string[]
}
```

### 4.4 训练题目

`TrainingQuestion`

表示可进入训练闭环的一道题。

字段：

```ts
type TrainingQuestion = {
  id: string
  documentId?: string
  paperId?: string
  materialIds: string[]
  type:
    | "summary"
    | "countermeasure"
    | "analysis"
    | "implementation"
    | "essay"
  title: string
  prompt: string
  wordLimit?: number
  suggestedMinutes: number
  answerKeyId?: string
  scoringPointIds: string[]
  createdAt: string
}
```

### 4.5 参考答案与评分要点

`AnswerKey`

```ts
type AnswerKey = {
  id: string
  questionId: string
  answerText: string
  source: "document" | "manual" | "ai_generated"
  createdAt: string
}
```

`ScoringPoint`

```ts
type ScoringPoint = {
  id: string
  questionId: string
  text: string
  weight: number
  aliases: string[]
}
```

### 4.6 训练会话

`TrainingSession`

表示一次用户训练。

字段：

```ts
type TrainingSession = {
  id: string
  mode: "timed_single" | "exam" | "expression_transfer"
  questionIds: string[]
  startedAt: string
  endedAt?: string
  status: "draft" | "running" | "submitted" | "diagnosed" | "abandoned"
  totalLimitSeconds: number
  stageTimings: TrainingStageTiming[]
}
```

`TrainingStageTiming`

```ts
type TrainingStageTiming = {
  stage: "reading" | "marking" | "outline" | "writing" | "review"
  startedAt: string
  endedAt?: string
  durationSeconds: number
  exceeded: boolean
}
```

### 4.7 用户作答

`TrainingAnswer`

```ts
type TrainingAnswer = {
  id: string
  sessionId: string
  questionId: string
  answerText: string
  wordCount: number
  submittedAt: string
}
```

### 4.8 诊断结果

`ShenlunDiagnosis`

```ts
type ShenlunDiagnosis = {
  id: string
  sessionId: string
  questionId: string
  score?: number
  scoringPointHits: {
    scoringPointId: string
    hit: boolean
    evidence?: string
  }[]
  issueTags: ShenlunIssueTag[]
  structureComments: string[]
  languageSuggestions: {
    original: string
    revised: string
    reason: string
  }[]
  modelAnswer?: string
  createdAt: string
}
```

`ShenlunIssueTag`

```ts
type ShenlunIssueTag =
  | "missing_points"
  | "wrong_material_location"
  | "inaccurate_summary"
  | "empty_countermeasure"
  | "weak_structure"
  | "colloquial_expression"
  | "word_count_failed"
  | "wrong_question_type"
  | "time_allocation_failed"
```

### 4.9 阶段校准

`CalibrationSnapshot`

```ts
type CalibrationSnapshot = {
  id: string
  createdAt: string
  periodStart: string
  periodEnd: string
  abilityScores: {
    readingExtraction: number
    summary: number
    analysis: number
    countermeasure: number
    documentFormat: number
    essayIdeation: number
    formalExpression: number
    timeControl: number
  }
  topIssueTags: {
    tag: ShenlunIssueTag
    count: number
    ratio: number
  }[]
  nextTrainingAdvice: string[]
}
```

## 5. 状态机

### 5.1 文档解析状态

```text
pending
-> parsed
-> needs_review
-> parsed
```

失败路径：

```text
pending
-> failed
```

规则：

- `pending`：文档已导入但未完成解析。
- `parsed`：至少生成一种可训练资产。
- `needs_review`：解析结果存在低置信字段，需要用户确认。
- `failed`：解析失败，必须记录 `parseError`。

### 5.2 训练会话状态

```text
draft
-> running
-> submitted
-> diagnosed
```

中断路径：

```text
running
-> abandoned
```

规则：

- `draft`：已选题但未开始计时。
- `running`：计时中。
- `submitted`：用户已提交答案。
- `diagnosed`：诊断结果已生成。
- `abandoned`：用户主动放弃或异常退出。

## 6. 核心交互规格

### 6.1 左侧入口

规格：

- 左侧主导航只新增或替换为一个入口：`申论训练闭环`。
- 不允许把“时间感训练、复盘诊断、评论转表达、考场模式、阶段校准”拆成左侧多个入口。
- 二级功能只在申论训练闭环页面内部出现。

验收：

```gherkin
Given 用户打开应用
When 用户查看左侧主导航
Then 应看到“申论训练闭环”
And 不应看到 5 个分散的申论能力入口
```

### 6.2 离线真题入库

规格：

- 用户可从素材知识库导入 PDF / Markdown / Text。
- 导入时必须选择文档类型。
- 文档类型为 `exam_paper` 时，解析结果至少尝试生成：
  - 材料段落
  - 题目
  - 参考答案
  - 评分要点

验收：

```gherkin
Given 用户导入一份历年申论真题 PDF
And 选择文档类型为“真题套卷”
When 解析完成
Then 系统应生成一条 ShenlunDocument
And 至少生成一道 TrainingQuestion
And 如果文档包含参考答案，应生成 AnswerKey
And 如果文档包含评分要点，应生成 ScoringPoint
```

### 6.3 从真题进入训练

规格：

- 训练闭环页面可以选择来自素材知识库的真题题目。
- 单题训练进入 `timed_single` 模式。
- 完整套卷进入 `exam` 模式。

验收：

```gherkin
Given 素材知识库中存在一套已解析真题
When 用户在申论训练闭环中选择其中一道题
Then 系统应创建 TrainingSession
And mode 应为 timed_single
And status 应从 draft 进入 running
```

### 6.4 时间感训练

规格：

- 单题训练必须记录阶段耗时。
- 阶段包括 reading、marking、outline、writing、review。
- 用户可手动切换阶段。
- 系统必须记录每阶段是否超时。

验收：

```gherkin
Given 用户进入一道题的时间感训练
When 用户依次完成读材料、标注、提纲、作答、自查
Then TrainingSession 应包含 5 条 TrainingStageTiming
And 每条记录应有 durationSeconds
And exceeded 应反映是否超过建议时间
```

### 6.5 复盘诊断

规格：

- 用户提交答案后，系统生成 ShenlunDiagnosis。
- 如果存在 ScoringPoint，诊断必须包含 scoringPointHits。
- 诊断必须包含 issueTags。
- 诊断必须能反哺阶段校准。

验收：

```gherkin
Given 用户完成一道带评分要点的申论题
When 用户提交答案
Then 系统应生成 ShenlunDiagnosis
And scoringPointHits 数量应等于该题评分要点数量
And issueTags 至少包含一个错因标签
```

### 6.6 阶段校准

规格：

- 阶段校准基于训练历史生成。
- 统计维度包括错因频次、题型表现和时间控制。
- 结果应给出下一阶段训练建议。

验收：

```gherkin
Given 用户完成至少 3 次训练并生成诊断
When 用户打开阶段校准
Then 系统应展示 topIssueTags
And 应展示 abilityScores
And 应生成 nextTrainingAdvice
```

## 7. 数据存储规格

现有 IndexedDB 已有：

```text
materialSources
importedFlashcards
importedQuestions
copybookItems
practiceAttempts
materialInboxDrafts
agentRuns
```

新增 store 建议：

```text
shenlunDocuments
shenlunExamPapers
shenlunMaterialPassages
shenlunTrainingQuestions
shenlunAnswerKeys
shenlunScoringPoints
shenlunTrainingSessions
shenlunTrainingAnswers
shenlunDiagnoses
shenlunCalibrationSnapshots
```

DB 版本需要递增。

所有新增 store 都必须以 `id` 为主键。

索引建议：

```text
shenlunMaterialPassages.documentId
shenlunMaterialPassages.paperId
shenlunTrainingQuestions.paperId
shenlunTrainingAnswers.sessionId
shenlunDiagnoses.sessionId
shenlunDiagnoses.questionId
```

## 8. AI / Agent 规格

AI 不直接决定是否入库，必须进入可审核流程。

### 8.1 真题解析 Skill

输入：

```json
{
  "documentType": "exam_paper",
  "title": "2025 年某省申论真题",
  "rawText": "..."
}
```

输出：

```json
{
  "document": {},
  "examPapers": [],
  "passages": [],
  "questions": [],
  "answerKeys": [],
  "scoringPoints": [],
  "warnings": []
}
```

要求：

- 输出必须是结构化 JSON。
- 低置信字段进入 `warnings`。
- 不允许直接覆盖用户已有资产。

### 8.2 批改诊断 Skill

输入：

```json
{
  "question": {},
  "materials": [],
  "answer": {},
  "answerKey": {},
  "scoringPoints": []
}
```

输出：

```json
{
  "diagnosis": {
    "score": 72,
    "scoringPointHits": [],
    "issueTags": [],
    "structureComments": [],
    "languageSuggestions": [],
    "modelAnswer": ""
  }
}
```

要求：

- 没有评分要点时可以不生成精确分数。
- 有评分要点时必须逐条判断命中情况。
- 错因标签必须使用固定枚举。

## 9. 测试规格

### 9.1 单元测试

必须覆盖：

- 文档类型枚举解析。
- 真题解析输出校验。
- 训练会话状态转移。
- 阶段耗时统计。
- 诊断结果 issueTags 校验。
- 阶段校准聚合逻辑。

### 9.2 集成测试

必须覆盖：

```text
导入真题
-> 解析为训练资产
-> 创建训练会话
-> 提交答案
-> 生成诊断
-> 更新阶段校准
```

### 9.3 UI 验收

必须覆盖：

- 左侧只有一个申论训练闭环入口。
- 页面内部二级导航正确。
- 单题训练能记录五阶段耗时。
- 诊断结果展示错因和评分要点命中。
- 阶段校准展示弱项和建议。

## 10. 实施分期

### Phase 1：真题入库到单题训练闭环

交付：

- 新增干净的申论训练数据模型。
- 素材知识库支持真题文档类型。
- 真题解析结果进入审核队列。
- 申论训练闭环页面可选择一道题训练。
- 训练后生成结构化诊断和错因。
- 阶段校准可统计最基础错因。

### Phase 2：考场模式

交付：

- 完整套卷训练。
- 全屏或沉浸式考试界面。
- 多题连续作答。
- 总时间与单题耗时统计。

### Phase 3：评论转表达

交付：

- 评论文章 / 政策文件转表达资产。
- 表达迁移训练。
- 优质表达进入温故和字帖。

### Phase 4：阶段校准增强

交付：

- 能力雷达。
- 周期报告。
- 下一阶段训练推荐。

## 11. 规格追踪矩阵

| 需求 | 规格位置 | 第一阶段是否覆盖 |
| --- | --- | --- |
| 左侧只保留一个入口 | 6.1 | 是 |
| 离线真题入库 | 6.2 | 是 |
| 真题联动训练 | 6.3 | 是 |
| 时间感训练 | 6.4 | 是 |
| 复盘诊断 | 6.5 | 是 |
| 阶段校准 | 6.6 | 基础覆盖 |
| 评论转表达 | 4.4 / Phase 3 | 否 |
| 考场模式 | 4.5 / Phase 2 | 否 |

## 12. SDD 执行规则

后续开发必须遵守：

1. 每个 Phase 先生成 implementation plan。
2. 每个数据模型先写 schema 测试。
3. 每个状态机先写状态转移测试。
4. 每个 AI 输出先写 JSON schema 校验测试。
5. 每个 UI 流程先写验收清单。
6. 实现完成后必须运行：

```text
npm run test
npx tsc --noEmit
npm run build
cargo test --no-default-features
```

7. 涉及桌面能力时，最后运行：

```text
npm run desktop:build
```

## 13. 下一步

下一步不是直接实现全部需求，而是为 Phase 1 生成实施计划：

```text
Phase 1：真题入库到单题训练闭环
```

Phase 1 计划必须包含：

- IndexedDB 迁移方案
- 新增类型与 repository
- 真题解析结果 schema
- 申论训练闭环入口与页面骨架
- 单题时间感训练状态机
- 诊断结果结构化校验
- 阶段校准基础聚合
- 测试与打包验证
