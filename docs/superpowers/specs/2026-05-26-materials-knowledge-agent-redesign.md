# 素材知识库与 Agent 工作流新版需求

日期：2026-05-26  
状态：设计需求稿  
关联计划：

- `docs/superpowers/plans/2026-05-26-agent-frontend-alignment.md`
- `docs/superpowers/plans/2026-05-26-gongkao-cli-skill-runtime.md`
- 参考源码：`docs/open-design-main`
- 可视化草图：`.superpowers/brainstorm/materials-kb-redesign-20260526/content/materials-kb-home-v4-no-star.html`

## 1. 背景

当前素材模块已经具备本地素材处理、Agent 采集、Inbox 审核和本地入库的基础能力。下一阶段需要把 `/materials` 从“素材导入页”升级为“素材知识库工作台”：用户在一个页面中完成素材搜索、采集、解析、审核、入库，并把入库内容持续复用于温故、演练和字帖模块。

本次设计借鉴 Open Design 的底层范式，而不是照搬外观：

- 顶部统一 Agent / 模型入口。
- 中央输入框作为主要任务启动器。
- `@` mention 绑定 Skill、文件、专题、来源等上下文。
- 最近项目、工作流模板、运行状态构成首页信息架构。
- Agent 只生成候选结果，应用负责校验、审核和正式写库。

## 2. 产品目标

1. 用户能把公考热点、政策文件、真题材料、PDF 和网页素材转化为可复用的个人知识库资产。
2. 用户能通过 Codex CLI、Claude Code，后续可扩展 Pi Agent 等本地 Agent 执行 Skill 工作流。
3. 用户不用理解复杂技术细节，也能看清当前 Agent 是否可用、是否已登录、模型来源是否真实、当前任务是否成功。
4. 所有 Agent 输出必须先进入 Inbox，经过结构校验和用户确认后才能写入正式本地知识库。
5. 长 PDF、长上下文和外部 Skill 必须有安全边界，避免任务失败、污染知识库或扩大本地文件风险。

## 3. 范围

本需求覆盖：

- `/materials` 素材知识库首页重设计。
- 顶部 Agent 菜单增强。
- Skill 卡片与结构化输入。
- `@` 上下文绑定。
- Agent 运行中心。
- Skill 隔离工作区。
- 外部 Skill 信任等级和权限提示。
- 长上下文 prompt 预算和自动裁剪。

本需求不覆盖：

- Obsidian 集成。
- 完整插件市场、发布、分享体系。
- Open Design 的 GenUI、Live Artifact、设计预览能力。
- 让 Agent 直接写入正式 IndexedDB 知识库。
- 一次性支持所有 Open Design Agent。第一阶段仍以 Codex CLI / Claude Code 为主。

## 4. 信息架构

`/materials` 页面应采用“素材知识库工作台”结构：

1. 顶部：当前页面标题、运行内核、Agent 执行器、用户身份。
2. 主启动器：输入主题、网址、文件线索、粘贴材料或采集要求。
3. 快捷任务：热点采集、本地解析、专题 Wiki、真题演练、金句温故、字帖摘抄、来源核验、批量入库。
4. 最近素材工程：按专题展示最近更新的素材项目。
5. 知识库分层：专题库、来源库、金句库、温故卡、题型库、字帖摘抄、Inbox、关系图谱。
6. 官方素材工作流：内置 Skill 模板库。
7. Agent 运行中心：任务队列、日志、取消、重试、输出入口。

## 5. 顶部 Agent 菜单

### 5.1 显示格式

顶部 Agent 胶囊参考 Open Design 的统一格式：

```text
本地 CLI · Codex CLI · gpt-5.5
```

或：

```text
自带 Key · Claude Code · sonnet
```

不显示 GitHub Star 等与本项目无关的标识。

### 5.2 菜单内容

Agent 菜单必须显示：

- 模式：`本地 CLI` / `自带 Key`
- Agent：`Codex CLI` / `Claude Code`
- 后续扩展：`Pi Agent`
- 模型列表
- reasoning / thinking 档位
- 安装状态
- 登录状态
- 模型来源
- 能力标签

### 5.3 安装与登录状态

每个 Agent 应显示：

- `已安装`
- `未安装`
- `路径异常`
- `已登录`
- `未登录`
- `状态未知`

状态来源应来自 Tauri 后端真实检测，不应只用前端静态配置。

### 5.4 模型来源

模型列表需要区分来源：

- `live`：从本地 CLI 实时读取。
- `fallback`：读取失败时使用应用内置备用列表。
- `custom`：用户手动输入的模型 id。

用户看到 fallback 时，应明确知道这不是 CLI 实时返回的模型列表。

### 5.5 能力标签

Agent 适配器需要声明能力，前端根据能力启用或禁用功能。

建议能力：

- `streaming`：支持流式事件。
- `cancel`：支持取消任务。
- `resume`：支持恢复任务。
- `nativeSkillLoading`：支持原生 Skill 加载。
- `fileRead`：支持读取工作区文件。
- `fileWrite`：支持写入工作区文件。
- `imageInput`：支持图片输入。
- `largeContext`：适合长上下文。
- `structuredOutput`：更适合 JSON 输出。

## 6. Skill 卡片与结构化输入

### 6.1 Skill 卡片

官方素材工作流不只是按钮，应升级为 Skill 卡片。

每张卡片显示：

- Skill 名称
- 功能说明
- 推荐场景
- 输入要求
- 输出资产
- 信任等级
- 所需能力
- 上次运行状态

示例 Skill：

- 申论热点采集器
- 政策文件解析器
- 真题材料结构化
- 专题 Wiki 生成器
- 来源核验助手
- 字帖摘抄打包器

### 6.2 结构化输入

Skill 可以在 `SKILL.md` frontmatter 中声明结构化输入，前端自动渲染表单。

示例：

```yaml
gongkao:
  inputs:
    - name: topic
      label: 主题
      type: string
      required: true
    - name: date_range
      label: 时间范围
      type: enum
      values: ["近7天", "近30天", "近一年", "不限"]
      default: "近30天"
    - name: source_scope
      label: 来源范围
      type: multi_enum
      values: ["政策文件", "人民网", "新华网", "半月谈", "真题材料", "本地文件"]
    - name: outputs
      label: 输出资产
      type: multi_enum
      values: ["专题摘要", "金句", "温故卡", "申论题", "字帖摘抄"]
```

结构化输入和自由 prompt 可以并存。结构化输入负责稳定参数，自由 prompt 负责补充个性化要求。

## 7. `@` 上下文绑定

素材启动器需要支持真正的 `@` mention，而不是只显示静态标签。

### 7.1 支持对象

第一阶段支持：

- `@Skill`：选择具体素材工作流。
- `@专题`：绑定已有专题知识库。
- `@文件`：绑定本地 PDF、TXT、DOCX、图片 OCR 结果等。
- `@来源`：绑定网页来源或来源域名。
- `@题型`：绑定题型场景。
- `@标签`：绑定素材分类标签。

### 7.2 行为要求

- 用户输入 `@` 时弹出候选面板。
- 候选按类型分组。
- 选择后在输入框中显示 mention token。
- 提交任务时，mention 需要解析成结构化上下文 id，而不是只提交普通文本。
- 未识别的 `@xxx` 应提示为未知上下文，不应静默忽略。

### 7.3 数据流

```text
用户输入 prompt + mention token
-> 前端解析 mention
-> 转成 skillId / topicId / fileId / sourceId / questionType
-> Tauri 后端创建 run workspace
-> Agent 读取结构化上下文
```

## 8. Agent 运行中心

右侧 Agent 运行中心需要从静态状态升级为真实任务中心。

### 8.1 任务队列

任务状态：

- `queued`
- `running`
- `validating`
- `waiting_review`
- `completed`
- `failed`
- `cancelled`

每个任务显示：

- 任务标题
- 使用的 Agent
- 使用的模型
- 使用的 Skill
- 当前阶段
- 开始时间
- 耗时
- 输出目录
- Inbox 状态

### 8.2 日志与事件

运行中心应展示事件流：

- 创建工作区
- 写入输入文件
- 启动 Agent
- Agent 输出文本
- 工具调用摘要
- 写出 `material-draft.json`
- Zod 校验结果
- Inbox 写入结果
- 错误信息

### 8.3 操作

任务应支持：

- 取消
- 重试
- 打开输出目录
- 查看日志
- 查看原始输出
- 重新校验
- 送入 Inbox
- 删除失败任务记录

### 8.4 断线恢复

页面刷新后，应能恢复最近任务状态。已完成任务至少保留摘要、日志尾部和输出路径。

## 9. Skill 隔离工作区

所有 Agent 执行必须在隔离工作区中完成，不能直接操作正式应用目录或正式数据库。

### 9.1 工作区结构

建议结构：

```text
appData/
  agent-runs/
    <runId>/
      input/
        prompt.md
        context.json
        source.txt
        files/
      .gongkao-skills/
        <skill-slug-hash>/
          SKILL.md
          references/
          assets/
      output/
        material-draft.json
        report.md
        source-snapshots/
      logs/
        events.jsonl
        stdout.log
        stderr.log
```

### 9.2 隔离规则

- 启动 Agent 前复制当前 Skill 到 `.gongkao-skills/<skill-slug-hash>/`。
- 不使用指向原始 Skill 的软链接。
- Agent 只能写入 run workspace。
- 正式 IndexedDB 入库只由应用代码执行。
- 每次运行都生成独立 `runId`。
- 工作区可清理，但不能影响已入库素材。

### 9.3 输出契约

Agent 必须输出：

```text
output/material-draft.json
output/report.md
output/source-snapshots/
```

`material-draft.json` 必须通过 Zod schema 校验后才能进入 Inbox。

## 10. 外部 Skill 信任等级和权限提示

### 10.1 信任等级

Skill 来源分为：

- `built-in`：应用内置，默认可信。
- `user-local`：用户本地创建，需要显示来源路径。
- `external`：从外部仓库或压缩包导入，默认受限。

信任等级：

- `trusted`
- `restricted`
- `blocked`

### 10.2 权限提示

Skill 卡片和运行确认处应显示它需要的能力：

- 读取文件
- 写入工作区
- 网络访问
- 调用外部 CLI
- 读取来源快照
- 使用本地模型或 API key

外部 Skill 默认只能 prompt 注入和读取工作区输入。要扩大权限，必须由用户确认。

### 10.3 阻断条件

以下情况应阻断执行：

- Skill 缺少 `SKILL.md`。
- Skill 输出契约缺失。
- Skill 声明需要的能力当前 Agent 不支持。
- 外部 Skill 请求高危权限但用户未授权。
- Skill 路径异常或包含不安全路径片段。

## 11. 长 PDF / 长上下文 Prompt 预算

### 11.1 问题

PDF、政策文件和多个 references 拼接后可能导致：

- CLI 命令行超长。
- Agent 上下文过长。
- Windows CreateProcess 报错。
- 生成结果变慢或失败。

### 11.2 预算策略

应用应在启动 Agent 前计算上下文预算：

- prompt 字节数
- source 文本长度
- references 数量
- mention 绑定文件数量
- 当前 Agent 是否支持 stdin prompt
- 当前 Agent 推荐上下文上限

### 11.3 自动裁剪

超预算时自动执行：

1. 优先保留用户显式 prompt。
2. 保留 Skill 主体指令。
3. 保留结构化输入。
4. 对 PDF / 长文档先做分段摘要。
5. references 只注入 Skill 明确需要的文件。
6. 来源正文只传摘要和关键片段，原文以文件形式放入工作区。
7. 若仍超预算，阻断并提示用户缩小范围。

### 11.4 用户提示

超预算提示应具体说明：

- 当前估算大小。
- 限制来源。
- 已自动裁剪哪些内容。
- 用户可如何缩小任务。

## 12. 知识库数据边界

Agent 输出不能直接变成正式知识库数据。

正式流程：

```text
Agent run
-> output/material-draft.json
-> Zod 校验
-> Inbox 待审核
-> 用户确认导入范围
-> buildImportBundle()
-> materialRepository.saveImportBundle()
-> 温故 / 演练 / 字帖复用
```

入库资产包括：

- source
- topic
- tags
- keywords
- goldenSentences
- flashcards
- practiceQuestions
- copybookItems
- references
- provenance

## 13. 验收标准

### 13.1 页面验收

- `/materials` 首屏是素材知识库工作台，而不是单纯导入表单。
- 顶部 Agent 菜单显示统一格式和状态。
- GitHub Star 等无关标识不出现。
- 页面视觉对齐当前项目：政务红、墨绿、圆角胶囊、shadcn 卡片。

### 13.2 Agent 菜单验收

- 能显示 Codex CLI / Claude Code 的安装与登录状态。
- 能区分 live/fallback/custom 模型来源。
- 能显示 Agent 能力标签。
- 不可用功能有明确禁用原因。

### 13.3 Skill 验收

- Skill 卡片能显示输入、输出、信任等级和能力需求。
- 至少一个 Skill 能通过结构化输入表单启动。
- 外部 Skill 未授权高危权限时不能执行。

### 13.4 运行中心验收

- Agent 任务能进入队列。
- 运行日志可见。
- 支持取消、失败重试、查看输出。
- 成功输出进入 Inbox，而不是直接入库。

### 13.5 安全验收

- Agent 运行在独立 workspace。
- Skill 使用复制副本，不使用可写回源目录的软链接。
- 长 PDF / 长上下文超预算时不会直接崩溃。
- 正式知识库写入只发生在用户确认之后。

## 14. 分阶段建议

### Phase 1：前端与状态展示

- `/materials` 页面重构为新版知识库工作台。
- 顶部 Agent 菜单增强状态和能力标签。
- Skill 卡片展示结构化输入声明。
- 运行中心先接入现有 run 状态。

### Phase 2：真实上下文与 Skill 表单

- 实现 `@` mention 绑定。
- 实现 Skill `inputs` schema 到表单的渲染。
- 启动 Agent 时传递结构化上下文。

### Phase 3：隔离工作区与运行中心闭环

- Tauri 后端创建 run workspace。
- 复制 Skill 到 `.gongkao-skills/`。
- 写入日志和输出文件。
- 支持取消、重试、打开输出目录。

### Phase 4：信任与预算保护

- 外部 Skill 信任等级。
- 权限提示与阻断。
- prompt 预算估算。
- PDF 自动摘要和上下文裁剪。

## 15. 关键原则

- App 是知识库主控方，Agent 是候选生成器。
- Skill 是可复用任务包，不是正式数据源。
- 所有正式入库都必须经过 schema 校验和用户确认。
- 页面复杂能力要通过状态和限制表达清楚，不能让用户猜当前为什么失败。
- 优先把 Codex CLI / Claude Code 做稳定，再扩展 Pi Agent 和更多 Agent。
