# MinerU 结构化版式解析实施计划

规格：`docs/superpowers/specs/2026-05-28-mineru-structured-layout-sdd.md`

## 任务

- [x] 扩展 `MaterialFileInput` / `MaterialImportBundle`，支持 `layoutBlocks` 和 `pages`。
- [x] 扩展 Tauri material parser runtime，兼容 snake_case / camelCase。
- [x] 扩展 PDF 导入链路，桌面端返回结构化 MinerU 数据，浏览器 PDF.js 保持纯文本回退。
- [x] 扩展工作台 localStorage schema，切换页面不丢 layout 元数据。
- [x] 扩展申论真题解析器，优先用 layout blocks 解析材料、题目、答案、评分点。
- [x] 扩展 `/materials` 入库链路，传入 layout blocks。
- [x] 扩展 Tauri `material_parse_pdf_with_mineru` 返回 `content_json_files/layout_blocks/pages`。
- [x] Rust 端优先解析 MinerU content JSON，失败时从 markdown 推断结构。
- [x] 补充前端和 Rust 单测。
- [x] 运行全量验证和桌面打包。

## 风险控制

- 保持旧字段不变，避免破坏已有素材导入。
- JSON 解析失败不阻断 PDF 导入，自动回退 markdown 推断。
- 不改动用户已有素材数据结构的强制迁移，只新增可选字段。
