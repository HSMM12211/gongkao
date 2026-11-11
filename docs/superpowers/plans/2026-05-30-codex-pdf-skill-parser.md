# Codex PDF Skill Parser Migration Plan

## Goal

把当前应用的 PDF 解析主链路，从“桌面端直接调用 MinerU CLI”调整为“桌面端调用本地 Codex CLI，由 Codex 在隔离工作区使用本地 `$pdf` skill 解析 PDF，并输出应用可消费的结构化结果”。

目标不是简单替换一个命令，而是把 PDF 解析纳入现有 Agent / Skill Runtime：

```text
用户上传 PDF
  -> Tauri 保存到隔离工作区
  -> 调用 Codex CLI
  -> Codex 加载 C:\Users\djy\.codex\skills\pdf\SKILL.md
  -> 使用 pdfplumber / pypdf / Poppler 等工具解析
  -> 写出 pdf-parse-result.json + markdown/pages/logs
  -> Tauri 读取并校验
  -> 前端展示进度
  -> 进入素材加工 / 申论训练闭环
```

## Current State

当前 PDF 解析链路：

- 前端入口：`lib/material/file.ts`
- 桌面端桥接：`lib/desktop/material-parser-runtime.ts`
- Tauri 后端：`src-tauri/src/material.rs`
- 当前主解析器：MinerU CLI
- 当前策略：
  - 先 `mineru -m txt`
  - 文本为空再 `mineru -m ocr`
  - 使用 `pipeline + ch + cpu + --source modelscope`
  - 前端已支持进度事件 `material://mineru-parse-progress`

现有问题：

- MinerU 首次安装和模型下载较重。
- 模型/依赖对普通用户不可见，失败原因不好解释。
- PDF 解析逻辑固定在 MinerU，不能灵活利用 Codex 的可视化检查、Python 解析库和上下文判断。
- 后续如果要处理复杂 PDF、表格、真题排版、扫描页混排，单一解析器不够灵活。

## Important Constraint

`$pdf` skill 是 Codex 的本地 skill 指令，不是独立服务 API。应用不能像调用 `mineru.exe` 那样直接“调用 skill 函数”。

正确接入方式是：

```text
应用 -> codex exec -> prompt 明确要求使用 $pdf skill -> Codex 读 skill -> Codex 执行本地工具 -> 输出约定文件
```

因此必须做：

- Codex CLI 检测
- PDF 解析隔离工作区
- Prompt / 输出 schema 约束
- 运行日志和进度事件
- 结果校验
- 失败兜底

## Product Decision

### 默认解析模式

新增 PDF 解析模式：

```ts
type PdfParserMode = "codex_pdf_skill" | "mineru" | "browser_pdfjs"
```

默认优先级：

1. 桌面端优先：`codex_pdf_skill`
2. Codex CLI 不可用时：提示用户安装/登录 Codex CLI
3. 可选兜底：保留 MinerU 作为高级备用解析器
4. 浏览器预览环境：继续使用 `pdfjs-dist` 轻量文本提取

建议不要立刻删除 MinerU：

- 已经实现了 MinerU 安装、状态检测、进度监控。
- Codex CLI 解析依赖用户账号、模型、网络和工具权限，不适合做唯一兜底。
- 设置页可以把 MinerU 改为“备用本地解析引擎”。

## User Experience

### 素材库上传 PDF

用户上传 PDF 后，页面显示：

- 当前解析方式：`Codex PDF Skill`
- Codex CLI 状态：已检测 / 未检测 / 未登录疑似 / 运行中
- 当前阶段：
  - 准备工作区
  - 启动 Codex CLI
  - 加载 PDF Skill
  - 检查依赖
  - 提取文本
  - 渲染页面检查
  - 解析表格/分栏
  - 写入结构化结果
  - 校验结果
  - 完成 / 失败
- 实时日志
- 失败时显示：
  - 缺少 Codex CLI
  - Codex 未登录
  - 缺少 Python 依赖
  - 缺少 Poppler
  - PDF 加密/损坏
  - 输出 JSON 校验失败

### 设置页

在 `系统设置 -> 本地文档解析` 中调整为：

```text
本地文档解析
  默认解析器：Codex PDF Skill
  Codex CLI：已检测 / 未检测
  PDF Skill：已检测 / 未检测
  Python 依赖：pdfplumber / pypdf / reportlab
  Poppler：pdftoppm 可用 / 不可用
  备用解析器：MinerU
```

保留操作：

- 检测 Codex CLI
- 检测 PDF Skill
- 检测 PDF 工具链
- 测试解析一个内置样例 PDF
- 备用 MinerU 管理入口

## Output Contract

Codex 必须在工作区根目录写出：

```text
pdf-parse-result.json
pdf-parse-report.md
pages/
  page-001.md
  page-002.md
renders/
  page-001.png
logs/
  codex-jsonl.log
  parser.log
```

### `pdf-parse-result.json`

```json
{
  "schemaVersion": 1,
  "parser": {
    "id": "codex-pdf-skill",
    "skillPath": "C:\\Users\\djy\\.codex\\skills\\pdf\\SKILL.md",
    "codexVersion": "codex ...",
    "startedAt": "2026-05-30T10:00:00.000Z",
    "endedAt": "2026-05-30T10:01:00.000Z"
  },
  "document": {
    "title": "刷题册2023",
    "originalName": "刷题册2023.pdf",
    "pageCount": 12,
    "isScanned": false,
    "language": "zh-CN"
  },
  "text": "完整可入库文本...",
  "pages": [
    {
      "pageNumber": 1,
      "text": "第一页文本...",
      "markdown": "# 材料一\n\n...",
      "confidence": 0.86,
      "warnings": []
    }
  ],
  "layoutBlocks": [
    {
      "id": "p1-b1",
      "pageNumber": 1,
      "order": 1,
      "blockType": "heading",
      "text": "材料一",
      "markdown": "# 材料一",
      "sourcePath": "pages/page-001.md",
      "bbox": [0, 0, 0, 0]
    }
  ],
  "tables": [
    {
      "id": "p2-table1",
      "pageNumber": 2,
      "markdown": "| 项目 | 内容 |\\n| --- | --- |",
      "text": "项目 内容"
    }
  ],
  "warnings": [
    "Poppler unavailable; visual render check skipped."
  ]
}
```

必须能映射回现有前端类型：

- `MaterialFileInput.text`
- `MaterialFileInput.layoutBlocks`
- `MaterialFileInput.pages`
- 后续 `parseExamDocumentText(...)`
- 后续 `saveParsedShenlunDocumentOutput(...)`

## Codex Prompt Contract

Tauri 后端调用 Codex CLI 时，向 stdin 传入固定 prompt：

```text
你正在为申论训练应用解析 PDF。

必须使用本地 pdf skill：
C:\Users\djy\.codex\skills\pdf\SKILL.md

输入 PDF：
{workspace}\input\{fileName}

任务：
1. 按 pdf skill 工作流解析 PDF。
2. 优先使用 pdfplumber / pypdf 提取文本。
3. 如果 pdftoppm 可用，渲染前 3 页做视觉检查。
4. 保留材料、题目、作答要求、参考答案、表格结构。
5. 不要编造 PDF 中不存在的内容。
6. 输出必须是简体中文。
7. 必须在工作区根目录写出 pdf-parse-result.json。
8. 必须写出 pdf-parse-report.md，说明解析质量、警告和失败原因。

输出 JSON 必须符合应用 schema，不要在最终回答中粘贴大段正文。
```

## Backend Design

### New Rust Module

建议新增：

```text
src-tauri/src/material/
  mod.rs
  commands.rs
  types.rs
  pdf_skill_parser.rs
  mineru_parser.rs
  parser_runtime.rs
```

如果不做目录拆分，也至少在现有 `src-tauri/src/material.rs` 中分区重构，避免 MinerU 和 Codex 逻辑混在一起。

### New Tauri Commands

新增：

```rust
material_parse_pdf_with_codex_skill(file_name, file_bytes, run_id)
material_get_pdf_skill_runtime_status()
material_test_pdf_skill_runtime()
```

保留：

```rust
material_parse_pdf_with_mineru(...)
material_get_mineru_runtime_status(...)
material_install_mineru_runtime(...)
```

### Runtime Status

新增 DTO：

```rust
pub struct PdfSkillRuntimeStatus {
    pub ready: bool,
    pub codex_available: bool,
    pub codex_path: Option<String>,
    pub codex_version: Option<String>,
    pub pdf_skill_available: bool,
    pub pdf_skill_path: String,
    pub python_available: bool,
    pub pdfplumber_available: bool,
    pub pypdf_available: bool,
    pub poppler_available: bool,
    pub message: String,
}
```

### Progress Event

新增事件：

```text
material://pdf-skill-parse-progress
```

Payload：

```ts
type PdfSkillParseProgressPayload = {
  runId: string
  parser: "codex-pdf-skill"
  stage:
    | "preparing"
    | "checking_runtime"
    | "starting_codex"
    | "loading_skill"
    | "extracting_text"
    | "rendering_pages"
    | "analyzing_layout"
    | "writing_output"
    | "validating_output"
    | "completed"
    | "failed"
  status: "running" | "completed" | "failed"
  message: string
  percentage?: number
  logLine?: string
  workspacePath?: string
}
```

### Codex CLI Command

复用现有 Codex adapter 思路：

```powershell
codex exec --json --skip-git-repo-check --sandbox danger-full-access -C <workspace>
```

Windows 上继续使用：

- `CODEX_BIN` 环境变量优先
- `%APPDATA%\npm\codex.cmd`
- `codex.cmd`

Codex 输出 JSONL 要写到：

```text
logs/codex-jsonl.log
```

同时解析流式事件，用于前端进度。

### Workspace Layout

每次解析一个独立目录：

```text
%LOCALAPPDATA%\申论 AI 智能修炼\pdf-skill-runs\{runId}\
  input\
    刷题册2023.pdf
  .codex-skills\
    pdf\
      SKILL.md
  pages\
  renders\
  logs\
  pdf-parse-result.json
  pdf-parse-report.md
```

注意：

- 不直接让 Codex 写入应用数据库。
- 不直接让 Codex 修改项目源码。
- 只允许读取 `input/`，写入当前 run workspace。
- 结果必须由 Tauri 读取后校验。

## Frontend Design

### Runtime Bridge

新增或扩展：

```text
lib/desktop/material-parser-runtime.ts
```

新增方法：

```ts
parsePdfWithCodexSkill(input: {
  fileName: string
  fileBytes: number[]
  runId?: string
}): Promise<MaterialPdfParseResult>

getPdfSkillRuntimeStatus(): Promise<PdfSkillRuntimeStatus>

onPdfSkillParseProgress(
  handler: (payload: PdfSkillParseProgressPayload) => void
): Promise<() => void>
```

### File Extraction

修改：

```text
lib/material/file.ts
```

从：

```ts
runtime.parsePdf(...)
```

改为：

```ts
runtime.parsePdfWithCodexSkill(...)
```

并保留配置：

```ts
const parserMode = "codex_pdf_skill"
```

后续可以接系统设置。

### Materials Page

修改：

```text
app/materials/page.tsx
```

当前 `PdfParseProgressPanel` 要泛化：

```text
PdfParseProgressPanel
  parserLabel: Codex PDF Skill / MinerU
  stageLabel
  progress
  logs
  workspacePath
```

当用户上传 PDF：

1. 生成 runId
2. 订阅 `material://pdf-skill-parse-progress`
3. 调用 `extractMaterialFile(file, { parseRunId, parserMode: "codex_pdf_skill" })`
4. 成功后走现有素材加工
5. 失败时展示日志和设置页入口

## Settings Design

修改：

```text
app/settings/page.tsx
```

在 `系统设置 -> 本地文档解析` 下新增：

```text
默认 PDF 解析器
  Codex PDF Skill
  MinerU 备用

Codex PDF Skill 状态
  Codex CLI
  PDF Skill
  Python
  pdfplumber
  pypdf
  Poppler / pdftoppm

操作
  重新检测
  测试解析
  打开工作区
```

不建议自动安装 Codex CLI，因为它涉及用户登录和认证。可以提供安装提示。

可自动检测 Python 包，但安装要用户确认。

## Test Plan

### TypeScript Tests

新增：

```text
test/lib/desktop/pdf-skill-parser-runtime.test.ts
test/lib/material/file-pdf-parser-mode.test.ts
```

覆盖：

- runtime 正确调用 `material_parse_pdf_with_codex_skill`
- 进度事件 normalize
- `extractMaterialFile` 在桌面端默认走 Codex PDF Skill
- 输出结果能映射成 `MaterialFileInput`
- 失败时错误信息可读

### Rust Tests

新增：

```rust
detects_pdf_skill_path
builds_codex_pdf_skill_command
normalizes_pdf_skill_parse_result
rejects_invalid_pdf_skill_json
classifies_codex_pdf_skill_progress_logs
```

### Manual UAT

用真实文件测试：

- `刷题册2023.pdf`
- 文本型 PDF
- 扫描型 PDF
- 包含表格的真题 PDF
- 很长 PDF
- 损坏/加密 PDF

验收标准：

- 上传后有可见进度。
- 能看到 Codex CLI 日志。
- 能看到是否加载 `$pdf` skill。
- 成功后生成文本、页面、layout blocks。
- 真题类 PDF 入库后能联动申论训练闭环。
- 失败时能明确知道是 Codex、依赖、PDF、还是输出 schema 的问题。

## Implementation Steps

### Phase 1: Spec And Contract

- [ ] 新增 PDF Skill parser 输出 schema 文档。
- [ ] 固定 `pdf-parse-result.json` 格式。
- [ ] 固定 progress event payload。
- [ ] 明确 MinerU 降级策略。

### Phase 2: Backend Runtime

- [ ] 新增 Codex PDF Skill runtime status 检测。
- [ ] 检测 `C:\Users\djy\.codex\skills\pdf\SKILL.md`。
- [ ] 检测 Codex CLI。
- [ ] 创建 PDF 解析工作区。
- [ ] 保存上传 PDF 到工作区。
- [ ] 复制 `$pdf` skill 到工作区快照。
- [ ] 构造 Codex prompt。
- [ ] 启动 `codex exec --json`。
- [ ] 读取 stdout/stderr JSONL。
- [ ] 推送 Tauri 进度事件。
- [ ] 读取 `pdf-parse-result.json`。
- [ ] 校验并映射到 `PdfParseResult`。

### Phase 3: Frontend Runtime

- [ ] `material-parser-runtime.ts` 增加 Codex PDF Skill API。
- [ ] 增加 progress listener。
- [ ] `file.ts` 默认切到 Codex PDF Skill。
- [ ] 保留 browser `pdfjs-dist` fallback。
- [ ] 保留 MinerU 备用方法。

### Phase 4: UI

- [ ] 素材库上传 PDF 进度面板改成通用解析进度面板。
- [ ] 展示解析器名称。
- [ ] 展示 Codex 日志。
- [ ] 失败时给出设置页入口。
- [ ] 设置页新增 Codex PDF Skill 管理状态。

### Phase 5: Tests

- [ ] Rust command/unit tests。
- [ ] TS runtime tests。
- [ ] 文件解析模式 tests。
- [ ] `npx.cmd tsc --noEmit`
- [ ] `npm.cmd run test`
- [ ] `cargo test --no-default-features`
- [ ] `npm.cmd run build`
- [ ] `npm.cmd run desktop:build`

### Phase 6: Real PDF Acceptance

- [ ] 使用 `刷题册2023.pdf` 测试。
- [ ] 确认 Codex 生成 `pdf-parse-result.json`。
- [ ] 确认页面/题目/材料可识别。
- [ ] 确认入库后申论训练闭环可用。
- [ ] 打包安装后重新测试。

## Risks

### Risk 1: Codex CLI 不是稳定 PDF 解析服务

Codex 是 Agent，不是固定解析器。输出可能受模型、prompt、依赖影响。

Mitigation：

- 强 schema 校验。
- 固定 prompt。
- 固定工作区。
- 解析失败时不入库。
- 保留 MinerU 备用。

### Risk 2: 隐私和网络

Codex CLI 可能把 PDF 内容发送给模型服务。

Mitigation：

- UI 明确提示“Codex PDF Skill 会通过当前 Codex CLI 处理文档，可能使用云端模型”。
- 对敏感 PDF 提供 MinerU 本地备用模式。
- 后续可加入“仅本地解析”开关。

### Risk 3: 首次依赖缺失

`$pdf` skill 推荐 `pdfplumber/pypdf/reportlab` 和 Poppler，但用户机器可能没有。

Mitigation：

- 设置页检测依赖。
- 缺什么提示什么。
- 可选一键安装 Python 包。
- Poppler 不可用时允许跳过视觉渲染，但提示质量降低。

### Risk 4: Codex 未登录

Codex CLI 存在但未登录时，应用无法完成解析。

Mitigation：

- 检测 `codex --version` 只能判断安装。
- 测试解析用于判断实际可运行。
- 失败文案引导用户先在终端完成 Codex 登录。

## Recommended Final Architecture

```text
PDF Parser Orchestrator
  ├─ CodexPdfSkillParser     默认
  ├─ MineruParser            备用 / 敏感文档本地模式
  └─ BrowserPdfjsParser      浏览器预览 fallback

统一输出：
  PdfParseResult
    text
    pages
    layoutBlocks
    markdownFiles
    contentJsonFiles
```

## Definition Of Done

- 上传 PDF 默认使用 Codex PDF Skill 解析。
- 前端能看到 Codex PDF Skill 解析进度和日志。
- 设置页能检测 Codex CLI、PDF Skill、Python 依赖、Poppler。
- Codex 输出结构化 JSON，经 Tauri 校验后进入现有素材加工流程。
- MinerU 不再是默认解析器，但仍可作为备用。
- `刷题册2023.pdf` 能解析并联动申论训练闭环。
- 所有测试和桌面打包通过。
