# MinerU 结构化版式解析 SDD

日期：2026-05-28

## 背景

申论真题 PDF 不能只把 MinerU 输出合并成纯文本。真题材料、题目、参考答案、评分要点经常跨页出现，后续训练闭环需要知道段落顺序、页码、版式块类型，才能减少误切题、错绑材料和丢失表格的问题。

## 目标

1. Tauri 桌面端 MinerU 解析命令保留结构化输出。
2. 前端 PDF 导入链路不丢弃 layout blocks / pages。
3. 申论真题解析器优先使用 layout blocks，保留材料页码。
4. 当 MinerU JSON 不存在时，从 markdown 回退推断 heading / paragraph / table / list。

## 数据契约

`material_parse_pdf_with_mineru` 必须继续兼容旧字段：

- `text`
- `output_dir`
- `markdown_files`

新增字段：

- `content_json_files`: MinerU content/list JSON 文件路径。
- `layout_blocks`: 按页码和阅读顺序排序的版式块。
- `pages`: 由 blocks 聚合出的页面文本和 block id 列表。

`layout_blocks` 字段：

- `id`
- `page_number`
- `order`
- `block_type`: `heading | paragraph | list | table | image | formula | unknown`
- `text`
- `markdown?`
- `source_path?`
- `bbox?`

## 验收标准

1. 模拟 Tauri snake_case 返回值时，前端 runtime 能规范化为 camelCase。
2. PDF 文件导入后，`MaterialFileInput` 保留 `layoutBlocks` 和 `pages`。
3. `buildImportBundle` 保留 MinerU layout 元数据。
4. `/materials` 申论真题入库调用 `parseExamDocumentText` 时传入 layout blocks。
5. layout blocks 中的“材料一 / 问题一”等 heading 能生成 page-aware passages 和 questions。
6. Rust 端能从 `content_list.json` 解析 block type、page number、bbox。
7. Rust 端在没有 JSON 时能从 markdown 推断 heading / paragraph / table / list。

## 验证命令

```text
npm run test
npx tsc --noEmit
npm run build
cargo test --no-default-features
npm run desktop:build
```
