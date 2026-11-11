# Codex PDF Skill Parser SDD

## Problem

当前应用上传 PDF 时，桌面端默认直接调用 MinerU。用户希望改为优先通过本地 Codex CLI 调用本地 `$pdf` skill 解析 PDF，让 Codex 根据 skill 工作流使用 `pdfplumber`、`pypdf`、Poppler 渲染检查等方式产出结构化解析结果。

## Scope

本阶段交付的是“PDF 解析入口切换和运行闭环”，不是重做素材库或申论训练算法。

包含：

- 桌面端新增 Codex PDF Skill 解析器。
- 上传 PDF 默认走 Codex PDF Skill。
- Codex 不可用或解析失败时，保留 MinerU 作为备用能力，但不静默入库失败结果。
- 前端能看到 Codex PDF Skill 解析进度和日志。
- 设置页能检测 Codex CLI、PDF Skill、Python PDF 包、Poppler。
- Codex 解析结果必须通过 Tauri schema 校验后映射到现有 `PdfParseResult`。

不包含：

- 自动安装 Codex CLI。
- 自动登录 Codex。
- 删除 MinerU。
- 云端隐私策略开关。
- PDF 编辑/生成能力。

## Functional Requirements

### FR1: Runtime Detection

系统必须检测：

- Codex CLI 是否可执行。
- Codex CLI 版本。
- 本地 `$pdf` skill 是否存在，默认路径为 `C:\Users\djy\.codex\skills\pdf\SKILL.md`。
- Python 是否可用。
- `pdfplumber` 是否可导入。
- `pypdf` 是否可导入。
- `pdftoppm` 是否可用。

检测结果必须通过 Tauri 命令暴露给前端。

### FR2: Parser Command

系统必须新增 Tauri 命令：

```text
material_parse_pdf_with_codex_skill(fileName, fileBytes, runId?)
```

该命令必须：

- 创建隔离工作区。
- 将上传 PDF 写入 `input/`。
- 将 `$pdf` skill 复制到工作区 `.codex-skills/pdf/SKILL.md` 作为快照。
- 调用 `codex exec --json --skip-git-repo-check -C <workspace>`。
- Windows 下使用 `--sandbox danger-full-access`，沿用当前 Codex adapter 策略。
- 通过 stdin 传入固定 prompt。
- 等待 Codex 写出 `pdf-parse-result.json`。
- 读取并校验 JSON。
- 返回现有 `PdfParseResult`。

### FR3: Output Contract

Codex 必须写出：

```text
pdf-parse-result.json
pdf-parse-report.md
```

`pdf-parse-result.json` 最低要求：

- `schemaVersion: 1`
- `text` 至少 20 个字符。
- `pages[]` 可选，但如果存在必须包含 `pageNumber` 和 `text`。
- `layoutBlocks[]` 可选，但如果存在必须包含 `id`、`pageNumber`、`order`、`blockType`、`text`。
- `warnings[]` 可选。

应用不得相信 Codex 自由文本回答，只读取工作区中的 JSON 文件。

### FR4: Progress Monitoring

系统必须新增事件：

```text
material://pdf-skill-parse-progress
```

前端必须展示：

- 解析器名称：Codex PDF Skill。
- 当前阶段。
- 进度条。
- 最近日志。
- 工作区路径。
- 失败原因。

### FR5: Frontend Default Parser

桌面环境中，`extractMaterialFile(file)` 遇到 PDF 默认调用 Codex PDF Skill。

浏览器预览环境仍使用 `pdfjs-dist`。

MinerU 保留为备用 API，不作为默认路径。

### FR6: Settings Visibility

设置页 `本地文档解析` 必须展示 Codex PDF Skill 状态，并保留 MinerU 备用管理。

## Acceptance Criteria

- 上传 PDF 时默认触发 `material_parse_pdf_with_codex_skill`。
- 前端能收到 `material://pdf-skill-parse-progress` 事件。
- Codex CLI 不可用时，前端显示明确错误，不产生空素材。
- `$pdf` skill 不存在时，设置页显示未就绪。
- Codex 输出无效 JSON 时，Tauri 返回 parse failed。
- 有效 `pdf-parse-result.json` 能映射为现有 `MaterialFileInput.text/pages/layoutBlocks`。
- `npx.cmd tsc --noEmit` 通过。
- `npm.cmd run test` 通过。
- `cargo test --no-default-features` 通过。
- `npm.cmd run desktop:build` 通过。

## Ambiguity Score

- Product behavior: 0.10
- Data contract: 0.12
- Runtime dependencies: 0.18
- UI acceptance: 0.12

Overall ambiguity: 0.13. Gate passed.
