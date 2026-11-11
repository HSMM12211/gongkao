# Feature Specification: AI Agent Orchestrator CLI v1

**Feature Branch**: `007-ai-agent-orchestrator-cli-v1`

**Created**: 2026-06-12

**Status**: Draft

**Input**: User description: "先不考虑 Codex SDK，先用 SDD 开发第一版 AI Agent 完善需求。底层继续使用 Codex CLI，完善项目的 AI Agent。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 可解释的素材整理 Agent 任务 (Priority: P1)

用户在素材知识库提交一个素材整理、PDF 入库或题库生成任务后，希望看到 Agent 不只是输出结果，而是清楚展示本次任务将如何处理、使用了哪些上下文、选择了哪些工具路径、生成了哪些候选产物，以及为什么需要审核后才能入库。

**Why this priority**: 这是当前 Agent 从“能跑 CLI”升级为“可靠业务 Agent”的最小闭环。用户必须能理解任务进度和产物可信度，否则无法放心把素材导入训练闭环。

**Independent Test**: 上传或粘贴一份素材，提交“解析文档入库”任务；只实现该故事时，用户也能看到任务计划、上下文摘要、工具路径、运行过程、产物和待审核状态。

**Acceptance Scenarios**:

1. **Given** 用户已选择一个官方或本地 Skill 并提交素材任务，**When** Agent 任务开始，**Then** 系统展示本次任务计划，包括目标、输入来源、Skill、上下文范围、工具路径和预期产物。
2. **Given** Agent 正在处理任务，**When** 本地 CLI 输出思考、工具调用、文件写入或诊断信息，**Then** 用户能在同一条 assistant 消息或运行详情中看到结构化进度，而不是只能看到原始日志。
3. **Given** Agent 生成了候选素材，**When** 系统完成校验，**Then** 用户看到候选素材进入 Inbox 或题库候选审核，并明确知道正式入库仍需人工确认。

---

### User Story 2 - 长文档和题库任务的上下文控制 (Priority: P2)

用户上传长 PDF、课程讲义或真题资料时，希望 Agent 不把整份资料粗暴压成一道泛题，而是先说明覆盖范围、上下文裁剪情况、已处理片段和未覆盖风险，再生成可审核的多题目、多素材候选。

**Why this priority**: 长 PDF 入库是当前项目的关键使用场景。没有上下文控制和覆盖提示，Agent 容易过度声称“完整解析”，导致训练资产质量不可控。

**Independent Test**: 使用一份长 PDF 或长文本，提交“解析为题库标准格式”；只实现该故事时，用户能看到上下文地图、裁剪提示、覆盖风险和多条候选资产。

**Acceptance Scenarios**:

1. **Given** 输入素材超过常规上下文预算，**When** 用户提交任务，**Then** 系统展示上下文地图、原文规模、实际提供给 Agent 的范围和裁剪警告。
2. **Given** 文档被裁剪或仅处理片段，**When** Agent 输出结果，**Then** 结果报告不能声称覆盖未处理内容，并必须提示用户需要继续分批解析或复核。
3. **Given** 文档足以生成多道练习，**When** 候选结果进入审核，**Then** 系统提示题目数量、来源覆盖和低覆盖风险。

---

### User Story 3 - 基于本地学习记忆的 Agent 建议 (Priority: P3)

用户希望 Agent 在整理素材或生成学习任务时，能够参考本地已有素材、待审核 Inbox、题库状态和近期练习诊断，但不希望它无限制读取所有个人数据。

**Why this priority**: AI Agent 的价值不只是单次生成，而是结合用户长期学习资产做个性化建议；同时必须符合本地优先和可控记忆原则。

**Independent Test**: 在已有素材、待审核草稿和练习记录的情况下提交任务；只实现该故事时，Agent 请求里包含有限的本地记忆摘要，并在结果中解释使用了哪些本地学习信号。

**Acceptance Scenarios**:

1. **Given** 本地已有素材和题库记录，**When** 用户提交新任务，**Then** 系统向 Agent 提供经过筛选的记忆摘要，而不是完整数据库内容。
2. **Given** 最近存在失败运行或待审核草稿，**When** Agent 生成任务计划，**Then** 计划中提示相关风险或待处理项。
3. **Given** Agent 使用了用户学习记忆生成建议，**When** 用户查看结果，**Then** 系统说明建议依据来自哪些本地摘要或学习状态。

---

### User Story 4 - 可恢复、可取消、可诊断的 CLI Agent 运行 (Priority: P4)

用户在长任务运行中切换页面、遇到 CLI 诊断输出或需要中止任务时，希望任务状态不会误判、不会丢失，并能回到运行详情定位问题。

**Why this priority**: 本地 CLI 任务可能耗时长、输出复杂。没有恢复和诊断能力，用户会误以为任务失败，开发者也难以定位问题。

**Independent Test**: 启动一个素材任务后切换页面再回来，或触发一次 CLI 诊断输出；只实现该故事时，任务状态和运行记录仍可恢复，普通诊断不会被误判为失败。

**Acceptance Scenarios**:

1. **Given** Agent 任务正在运行，**When** 用户切换到其他页面再返回，**Then** 当前任务、消息状态和最近运行事件仍然可见。
2. **Given** 本地 CLI 输出非终止诊断信息，**When** 用户查看运行过程，**Then** 系统将其标记为诊断或警告，而不是直接标记整次任务失败。
3. **Given** 用户取消运行，**When** CLI 被终止，**Then** 系统显示已取消状态并保留已生成日志和工作区路径。

### Edge Cases

- 本地 CLI 未安装、未登录或状态无法确认时，系统应阻止启动任务并提示用户修复本地 Agent 状态。
- Skill 被禁用、阻断或请求高风险权限时，系统应阻止或要求用户明确确认。
- Agent 没有生成候选产物时，系统应保留工作区、日志和失败原因，不能静默丢失。
- Agent 生成的候选结果结构正确但业务质量不足时，应进入待复核或失败状态，而不是直接入库。
- 长任务超过合理空闲时间时，应提示用户检查 CLI 状态，并保留诊断入口。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST keep Codex CLI as the default local Agent runtime for this feature version.
- **FR-002**: System MUST NOT require Codex SDK for this feature version.
- **FR-003**: System MUST show a user-facing Agent task plan before or immediately after a task starts, including goal, selected Skill, context scope, tool route, expected artifacts, and review requirement.
- **FR-004**: System MUST represent each Agent run with a clear lifecycle: queued, planning, running, observing, validating, waiting for review, completed, failed, or cancelled.
- **FR-005**: System MUST preserve structured run evidence for every Agent task, including input summary, selected Skill, context summary, tool route, emitted events, generated artifacts, validation result, and review status.
- **FR-006**: System MUST distinguish non-terminal CLI diagnostic output from terminal failures.
- **FR-007**: System MUST prevent Agent-generated results from being written directly to formal study assets without application validation and user confirmation.
- **FR-008**: System MUST provide a bounded context summary for long documents, including original size, provided size, selected snippets or sections, and any coverage warnings.
- **FR-009**: System MUST ensure outputs generated from partial context clearly disclose partial coverage.
- **FR-010**: System MUST provide a bounded local memory summary to Agent tasks when relevant, covering recent runs, pending review items, local asset counts, and recent learning gaps.
- **FR-011**: System MUST avoid sending complete local study history or full personal records into Agent context unless the user explicitly binds that source.
- **FR-012**: System MUST validate Agent outputs using structure checks and business-quality checks before presenting them for review.
- **FR-013**: System MUST show validation warnings for source coverage, low confidence, too few generated exercises, duplicate risk, or missing training value.
- **FR-014**: System MUST keep generated candidates in an explicit review state until the user confirms import.
- **FR-015**: System MUST allow users to inspect run details, including workspace location, generated files, recent events, and diagnostic messages.
- **FR-016**: System MUST allow users to cancel a running Agent task and retain the run record.
- **FR-017**: System MUST restore recent Agent task state after navigation within the app.
- **FR-018**: System MUST provide an independently testable smoke path that verifies Skill discovery, CLI execution, artifact generation, validation, and review handoff.

### Key Entities *(include if feature involves data)*

- **Agent Task Plan**: User-facing plan for one run, including goal, selected Skill, context scope, tool route, expected artifacts, and review requirement.
- **Agent Run Evidence**: Durable record of the run inputs, events, diagnostics, artifacts, validation outcomes, and workspace pointer.
- **Context Summary**: Bounded description of source material and selected context range, including truncation and coverage warnings.
- **Memory Summary**: Bounded local learning-state summary that may be given to the Agent without exposing full personal records.
- **Validation Result**: Structure and business-quality gate result, including errors, warnings, confidence, and review recommendation.
- **Review Candidate**: Agent-generated candidate waiting for user confirmation before formal import.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a normal素材整理任务, users can see the task plan and first run status within 3 seconds after submitting.
- **SC-002**: 95% of non-terminal CLI diagnostic messages are shown as diagnostics or warnings rather than terminal failures during manual test runs.
- **SC-003**: For long-document tasks, users can identify original size, processed size, and at least one coverage warning before reviewing candidates.
- **SC-004**: 100% of Agent-generated study assets require validation and user confirmation before becoming formal imported assets.
- **SC-005**: A smoke test can complete Skill discovery, CLI execution, artifact generation, validation, and review handoff without manual file inspection.
- **SC-006**: After navigating away and returning during a run, users can still see the active or most recent Agent task state.

## Assumptions

- Codex CLI remains the primary runtime for this first version; Claude Code may remain available through existing adapter support, but no new SDK runtime is introduced.
- The feature builds on the existing素材知识库, Skill 管理, Inbox, trace, and local run workspace concepts.
- Formal database import remains controlled by the application and user confirmation.
- True multi-process Planner / Executor / Evaluator Agent orchestration is out of scope for v1; the first version may represent those roles as a plan and validation stages within one CLI run.
- UI changes should stay consistent with the existing application style rather than adopting a new visual theme.
