# 素材工作台 Open Design 式流式对话需求

日期：2026-06-04  
状态：新需求整理  
关联页面：`/materials`  
参考源码：`docs/open-design-main`

## 1. 背景

当前素材知识库已经可以通过本地 Codex CLI / Claude Code 执行 Agent 任务，并且后端已经具备流式事件能力。`runMaterialAgentChat()` 能接收 Tauri 事件或 `/api/chat` SSE 事件，事件类型也包含 `thinking_delta`、`tool_call`、`tool_result`、`file_write`、`completed`、`failed` 等。

但当前 `/materials` 页面把这些事件主要展示在输入框下方的“CLI 运行过程”面板里。用户看到的是“命令输入框 + 日志面板”，而不是 Open Design 那种“用户消息 + assistant 流式回复 + 工具过程内嵌展示”的对话体验。

因此，本次需求不是重新实现底层 Agent，而是把素材工作台的交互形态升级为 Open Design 式流式对话。

## 2. 核心问题

1. 输入框只是普通 `textarea`，没有形成真正的 ChatComposer 体验。
2. 点击开始整理后，没有立即生成一条用户消息和一条 assistant 占位消息。
3. Agent 的思考、工具调用、文件写入和校验过程没有在 assistant 消息内实时展开。
4. “CLI 运行过程”作为独立面板存在，割裂了对话体验。
5. 用户无法从对话流里直观看到：当前 CLI 正在做什么、生成了什么、为什么失败、下一步该确认入库还是重试。
6. Open Design 的 `ChatComposer -> ChatPane -> POST /api/chat -> daemon run -> SSE -> assistant message` 范式尚未在本项目素材工作台前端完整落地。

## 3. 目标

把 `/materials` 的主交互升级为：

```text
ChatComposer 输入素材任务
-> 创建用户消息
-> 创建 assistant 流式消息
-> 本地 CLI / Agent 开始运行
-> thinking/tool/file/validation 事件实时追加到 assistant 消息
-> 生成候选素材
-> 显示 Inbox 待审核状态
-> 用户确认后入库
```

最终用户看到的不是日志堆叠，而是一段可阅读、可追踪、可复核的 Agent 对话过程。

## 4. 参考 Open Design 的部分

需要借鉴 Open Design 的底层交互范式，而不是照搬视觉风格。

重点参考：

- `docs/open-design-main/apps/web/src/components/ChatComposer.tsx`
- `docs/open-design-main/apps/web/src/components/ChatPane.tsx`
- `docs/open-design-main/apps/web/src/runtime/chat-events.ts`
- `docs/open-design-main/packages/contracts/src/sse/chat.ts`
- `docs/open-design-main/apps/daemon/src/chat-routes.ts`

参考点：

1. Composer 只负责输入、附件、上下文绑定和发送。
2. ChatPane 负责维护消息列表、流式 assistant 消息、滚动跟随、错误状态和重试。
3. 后端 run 事件通过统一协议回传前端。
4. `text_delta` / `thinking_delta` / `tool_use` / `tool_result` / artifact 事件都归并到 assistant message。
5. 工具过程不单独漂浮成日志区，而是作为 assistant 消息的一部分展示。

## 5. 新交互结构

`/materials` 主工作台应调整为四个区域：

1. 顶部 Agent 状态栏  
   显示本地 CLI、模型、登录状态、安装状态和能力标签。

2. 对话消息区  
   显示用户输入、assistant 流式回复、工具调用、文件产物、校验结果、Inbox 状态。

3. ChatComposer 输入区  
   支持自由 prompt、`@Skill`、`@文件`、`@专题`、多文件上传、Tab 补全、快捷任务。

4. 可折叠 Trace / 运行详情  
   保留原始事件、stdout/stderr、workspace 路径、`material-draft.json`、校验日志，但默认折叠。

## 6. 消息模型

新增或复用前端消息结构，用于承载一次 Agent 对话。

建议字段：

```ts
type MaterialChatMessage = {
  id: string
  role: "user" | "assistant" | "system"
  runId?: string
  content: string
  createdAt: string
  status?: "queued" | "streaming" | "validating" | "waiting_review" | "completed" | "failed" | "cancelled"
  events?: MaterialChatEvent[]
  attachments?: MaterialChatAttachment[]
  outputSummary?: {
    inboxDraftId?: string
    questionCount?: number
    flashcardCount?: number
    sourceCount?: number
    warnings?: string[]
  }
}
```

事件结构：

```ts
type MaterialChatEvent =
  | { type: "thinking_delta"; text: string; timestamp: string }
  | { type: "text_delta"; text: string; timestamp: string }
  | { type: "tool_call"; name: string; summary: string; timestamp: string }
  | { type: "tool_result"; name?: string; summary: string; timestamp: string }
  | { type: "file_write"; path: string; summary: string; timestamp: string }
  | { type: "validation"; summary: string; level: "info" | "warning" | "error"; timestamp: string }
  | { type: "inbox"; draftId?: string; summary: string; timestamp: string }
```

## 7. 事件映射规则

当前项目已有 `AgentRunEvent`，需要在前端映射成对话事件。

映射建议：

| AgentRunEvent.kind | 对话展示 |
| --- | --- |
| `started` | assistant 消息状态改为 `streaming` |
| `thinking_delta` | 显示“正在思考”增量，可折叠 |
| `text_delta` | 追加到 assistant 主回复正文 |
| `tool_call` | 显示工具调用卡片 |
| `tool_result` | 显示工具结果摘要 |
| `file_write` | 显示文件产物，如 `material-draft.json` |
| `completed` | 进入 `validating` |
| `failed` | assistant 消息状态改为 `failed` |
| `cancelled` | assistant 消息状态改为 `cancelled` |
| 本地校验通过 | 显示“已进入 Inbox 待审核” |
| 本地校验失败 | 显示错误和重试入口 |

## 8. ChatComposer 要求

Composer 应保留当前素材工作台能力，并优化交互：

1. 支持多文件上传，上传后展示文件 chip。
2. 支持 `@` 触发上下文菜单。
3. 输入 `@Skill:` 或 skill 首字母时显示候选项。
4. 只有一个匹配项时，按 Tab 自动补全。
5. 多个匹配项时展示候选列表，Tab 选择当前高亮项。
6. 支持 Enter 发送，Shift+Enter 换行。
7. 发送后清空输入框，但保留消息记录和正在运行状态。
8. 发送按钮在运行时显示 loading，并允许后续扩展取消按钮。

## 9. Assistant 流式消息要求

assistant 消息应完整展示一次 Agent run 的生命周期：

1. 任务排队：显示使用的 Skill、模型、文件数量。
2. 启动 CLI：显示本地 CLI 和 workspace。
3. 思考过程：以折叠块或轻量流式文本展示。
4. 工具调用：显示工具名、输入摘要、结果摘要。
5. 文件产物：显示生成的 `material-draft.json`、`report.md` 等。
6. 结构校验：显示 schema 校验、业务校验、警告数量。
7. Inbox：显示“候选素材已进入 Inbox，等待确认入库”。
8. 失败：显示失败原因、原始日志入口和重试按钮。

## 10. 原“CLI 运行过程”面板调整

原来的独立面板不再作为主视觉区域。

调整为：

1. 默认隐藏或折叠在 assistant 消息下方。
2. 名称改为“运行详情”或“Trace”。
3. 展示最近事件、stdout/stderr、workspace、runId。
4. 保留给排错使用，不再承担主要交互说明。

## 11. 数据持久化

需要支持页面切换后恢复当前对话状态。

至少持久化：

1. 最近消息列表。
2. 正在运行或最近完成的 runId。
3. 用户上传文件队列摘要。
4. assistant 消息状态。
5. Inbox draft 关联关系。

如果应用重启后无法继续追踪正在运行的 CLI，也应恢复最近 run 的最终状态、日志路径和输出摘要。

## 12. 后端要求

当前 Tauri 后端已经支持：

- 创建 run
- 创建隔离 workspace
- spawn 本地 CLI
- 读取 stdout/stderr
- 解析 JSONL 事件
- 写入 `trace.jsonl`
- 读取 `material-draft.json`

本次后端主要补充：

1. 确保 Tauri 事件和 HTTP SSE 事件语义一致。
2. 确保事件包含足够的 `runId`、`kind`、`message`、`timestamp`、`raw`。
3. 对 Codex / Claude 的 stdout JSONL 继续标准化为统一 `AgentRunEvent`。
4. 保证失败时也能回传最后的 stderr 摘要。
5. 保证 `completed` 后前端能继续收到本地校验和 Inbox 状态。

## 13. 与入库闭环的关系

流式对话只负责展示 Agent 工作过程，不改变“先审核再入库”的原则。

正确闭环是：

```text
Agent 生成 material-draft.json
-> 应用解析
-> schema 校验
-> 业务校验
-> 写入 Inbox
-> 用户确认
-> 正式入库
-> 进入申论训练闭环
```

assistant 消息末尾应明确显示当前状态：

- `已生成，等待校验`
- `已进入 Inbox`
- `校验失败`
- `已导入题库`
- `需要人工复核`

## 14. 非目标

本需求不包含：

1. 重写 Agent Adapter。
2. 重写 Codex CLI 调用方式。
3. 让 Agent 直接写入正式数据库。
4. 引入 Open Design 的视觉主题。
5. 引入 Open Design 的 Live Artifact / GenUI 全套能力。
6. 做真正多 Agent 编排。
7. 改动申论训练闭环的数据模型。

## 15. 验收标准

### 15.1 基础交互

1. 用户在 `/materials` 输入任务并点击发送后，页面立即出现用户消息。
2. 同时出现 assistant 占位消息，状态为运行中。
3. 输入框不会因为运行日志刷新而丢失焦点或异常重置。
4. 上传文件 chip 能随消息展示。

### 15.2 流式输出

1. Codex CLI 运行时，`thinking_delta` 能实时追加展示。
2. `tool_call` / `tool_result` 能以事件块展示。
3. `file_write` 能显示生成文件路径或文件名。
4. `completed` 后 assistant 消息进入校验阶段。
5. 失败时 assistant 消息显示错误摘要和重试入口。

### 15.3 Open Design 对齐

1. 交互形态符合 `ChatComposer -> ChatPane -> streaming assistant message`。
2. 运行事件不再只依赖独立日志面板展示。
3. Trace 作为详情折叠，而不是主交互区域。
4. 消息流可滚动，并在新内容流入时合理跟随底部。

### 15.4 入库闭环

1. `material-draft.json` 生成后仍必须进入校验。
2. 校验通过后进入 Inbox。
3. assistant 消息展示 Inbox 待审核状态。
4. 用户仍需确认后才能正式入库。

### 15.5 状态恢复

1. 从 Skill 管理切回素材工作台后，当前对话和 run 状态不应重置。
2. 最近一次运行结果可继续查看。
3. 已完成的 assistant 消息能展示输出摘要。

## 16. 推荐实施顺序

1. 定义 `MaterialChatMessage` 和事件映射函数。
2. 把当前 `agentEvents` 映射为 assistant message events。
3. 新增素材工作台 `MaterialChatPane` 组件。
4. 把现有 textarea 区域升级为 `MaterialChatComposer`。
5. 将 `AgentRunProcessPanel` 改成 assistant 消息内的折叠 Trace。
6. 接入 `runMaterialAgentChat()` 的 `onEvent` 实时更新 assistant 消息。
7. 将校验、Inbox、失败、重试结果写回 assistant 消息。
8. 增加状态持久化和页面切换恢复。
9. 补充前端单测和浏览器手动验收。

## 17. 风险

1. Codex CLI 输出事件不稳定，需要继续通过 `streams.rs` 做标准化。
2. assistant 消息过长时需要折叠 thinking 和 tool result，避免页面过重。
3. 长 PDF 解析事件很多，需要限制展示数量并提供完整 Trace 查看。
4. 页面切换恢复需要避免重复触发同一个 run。
5. 中文输入法和 `@` 补全需要避免 Tab / Enter 误触。

## 18. 最终期望

用户在素材知识库里看到的应该是：

```text
我：@Skill:政策文件解析器 解析这个 PDF，整理成申论题库素材

助手：
正在读取文件...
正在调用本地 Codex CLI...
正在分析 PDF 文本结构...
已生成 material-draft.json
结构校验通过
业务校验提示：长文档生成 12 道题，覆盖 5 个章节
候选素材已进入 Inbox，等待你确认入库
```

这才是目标体验：用户不用看懂底层日志，也能知道 Agent 正在做什么、做到了哪里、结果能不能入库。
