# 实施计划：材料工作台流式聊天 UI

**分支**：`006-materials-chat-streaming-ui` | **日期**：2026-06-04 | **规格文档**：[spec.md](./spec.md) | **英文版**：[plan.md](./plan.md)

## 概要

将 `/materials` 从“文本框 + 独立 CLI 日志面板”升级为流式聊天工作台。新增类型化的聊天消息和事件模型，把现有 `AgentRunEvent` 流映射成助手消息事件，把最近聊天记录持久化到材料工作台会话里，并把原始 trace 放进可折叠详情区，而不是让命令行日志成为主界面。

## 技术上下文

**语言/版本**：TypeScript 5.7、React 19、Next.js 16，已有 Rust/Tauri 后端。

**主要依赖**：现有 `lib/agent`、`app/materials/page.tsx`、Tauri Agent runtime、lucide-react、现有 UI 组件。

**存储**：沿用内存态材料工作台 session，以及 localStorage 支持的可编辑工作台状态。

**测试**：Vitest 聚焦测试、`npx tsc --noEmit`、`npm run lint`、`npm run check:mojibake`。

**目标平台**：本地浏览器和 Tauri 桌面应用。

**项目类型**：本地优先的桌面/Web 应用。

**性能目标**：助手渲染必须限制在最近事件和最近消息内；长 PDF 任务不能无限渲染日志。

**约束**：保留本地优先数据、Inbox 人工审核边界、隔离 Agent 执行、现有上传/mention/Skill 工作流。

**范围**：只改 `/materials` 工作台；不重写 Agent Adapter。

## 宪章检查

- 本地优先学习数据：通过。本功能只改变本地 UI 状态和现有本地 Agent 流。
- 可追踪学习资产：通过。增强 trace 可见性和 Inbox 交接可见性。
- 核心逻辑测试优先：通过。事件映射和 session 持久化有聚焦测试。
- Skill 和 Agent 隔离执行：通过。不改变 workspace 隔离或 CLI 启动方式。
- 增量交付：通过。用户消息 + 助手流式消息是第一个可独立验证切片。

## 项目结构

```text
lib/agent/
|-- material-chat.ts
|-- material-workbench-session.ts
|-- material-workbench-state.ts
`-- material-chat-schema.ts

app/materials/page.tsx

test/lib/agent/
|-- material-chat.test.ts
|-- material-chat-contract.test.ts
`-- material-workbench-session.test.ts

scripts/
`-- check-mojibake.mjs
```

**结构决策**：事件映射保留为 `lib/agent/material-chat.ts` 中的小型领域 helper；React 渲染暂时保留在现有材料页中，避免为了 A 方案引入过大路由或布局改造。

## 企业级轻量护栏

本功能采用 A 方案，也就是面试和交付可讲清楚的 enterprise-lite 基线。

- **前端合同**：`/materials` 主界面以聊天消息为主，原始 trace 保持次级、可折叠。
- **后端/Agent 合同**：运行时事件必须满足 `agentRunEventSchema`，才视为受支持的 Agent 事件。
- **展示合同**：助手侧展示事件必须满足 `materialChatEventSchema`，才视为合法 UI 事件。
- **编码卫生**：使用 `scripts/check-mojibake.mjs` 扫描源码和文档，避免 UTF-8/GBK 乱码进入产品文案、测试和规格文档。
- **审核边界**：Agent 输出必须先进入 Inbox 审核，不能直接成为正式学习资产。

## 验收矩阵

| 需求 | 实现位置 | 验证方式 |
| --- | --- | --- |
| FR-001/FR-002：创建用户消息和助手消息 | `app/materials/page.tsx`、`lib/agent/material-chat.ts` | `test/lib/agent/material-chat.test.ts` |
| FR-003/FR-004：把 Agent 事件映射为助手事件 | `lib/agent/material-chat.ts` | `test/lib/agent/material-chat.test.ts`、`test/lib/agent/material-chat-contract.test.ts` |
| FR-005：原始 trace 保持次级 | `app/materials/page.tsx` | 手动检查 `/materials`；trace 只出现在助手详情区 |
| FR-006/FR-007：持久化最近聊天消息 | `lib/agent/material-workbench-session.ts`、`lib/agent/material-workbench-state.ts` | `test/lib/agent/material-workbench-session.test.ts` |
| FR-008/FR-009：保留 Agent runtime 和 Inbox 边界 | `app/materials/page.tsx`、`lib/agent/verifier.ts`、storage repositories | `test/lib/agent/material-output.test.ts`、`test/lib/agent/verifier.test.ts` |
| FR-010：核心逻辑有自动化测试 | `test/lib/agent/material-chat*.test.ts` | `npm run test -- material-chat material-workbench-session` |

## 质量门禁

交付前运行：

```powershell
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run test -- material-chat material-workbench-session
npm.cmd run check:mojibake
```

完整本地门禁：

```powershell
npm.cmd run quality
```

## 风险与回滚

- **风险：事件流变化导致聊天渲染静默损坏。** 缓解：保持 `material-chat-contract.test.ts` 和 `contracts/material-chat-events.md` 同步。
- **风险：长 Agent 任务产生过多 UI 事件。** 缓解：每条助手消息最多保留 80 个事件，工作台最多保留 12 条最近消息。
- **风险：AI 生成的中文文案因编码漂移变成乱码。** 缓解：`npm run check:mojibake` 会在常见乱码片段出现时失败。
- **回滚路径**：保持 `lib/agent/material-chat.ts` 作为隔离事件映射层。如果聊天界面回归，可以临时禁用 mapper/session 持久化，同时保留底层 Agent runtime 和 Inbox 流程。

## 数据模型

详见 [data-model.md](./data-model.md)。

核心实体包括：

- `MaterialChatMessage`：材料工作台中的一条用户或助手消息。
- `MaterialChatEvent`：从 Agent runtime 或本地验证步骤归一化出来的助手事件。
- `MaterialChatAttachment`：用户消息携带的文件或上下文 chip。
- `MaterialWorkbenchSessionSnapshot`：扩展了 `chatMessages` 的工作台 session 快照。

## 合同

详见 [contracts/material-chat-events.md](./contracts/material-chat-events.md)。

可执行合同位于：

- `lib/agent/material-chat-schema.ts`
- `test/lib/agent/material-chat-contract.test.ts`

## 复杂度跟踪

没有宪章违规。

## 开发背景

主要开发对话参考 ID：`019e4aa1-bf79-75e3-b526-6a3e75df0f39`。

该对话确定了产品方向：本地优先的公考学习应用、桌面打包、云端/本地语音识别、PDF 素材导入、AI 或本地 Agent 解析、结构化本地题库、温故/演练/字帖工作流，以及后续的 Materials Agent 工作台。

本计划中的护栏用于把这条 vibe coding 路线变成可复用、可解释、可交付的工程流程，而不是每次靠临场对话和运气推进。
