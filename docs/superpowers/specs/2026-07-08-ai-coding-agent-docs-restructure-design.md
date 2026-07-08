# AI Coding Agent Docs Restructure Design

**Date:** 2026-07-08

## Goal

整理 `docs/ai-coding` 下与 coding agents 相关的 mkdocs 文档，收敛为更少的主干页面，统一目录与阅读路径，并基于源码与最新公开资料修正 `Claude Code`、`OpenCode`、`Codex` 在 `todo` 与 `goal` 策略上的表述。

## Scope

本次工作只覆盖：

- `docs/ai-coding/index.md`
- `docs/ai-coding/coding-agents/`
- 对应的 `.pages` 导航文件

本次工作不覆盖：

- `workflow/gsd-pause-and-resume.md`
- `code-graph-tools-and-technical-routes.md`
- `coding-agent-lsp-strategies.md`
- 与本主题无直接关系的其他 guidebooks 子栏目

## Desired Outcome

文档应从“源码考据堆叠”改成“判断优先、证据后置”的结构：

- 主文回答“它们怎么不同、何时适用、哪些旧判断需要修正”
- 附录负责“这些判断来自哪些实现文件与公开证据”
- mkdocs 导航缩短到少数主页面，减少读者在大量重叠页面之间来回跳转

## Information Architecture

`docs/ai-coding/coding-agents/` 收敛为四个主页面：

1. `index.md`
2. `agent-architecture-and-prompting.md`
3. `agent-task-and-goal-strategies.md`
4. `source-evidence-and-code-index.md`

页面职责如下。

### 1. index.md

作为子栏目总入口，只做三件事：

- 说明这一组文档回答什么问题
- 给出推荐阅读顺序
- 概括三大系统的核心差异

不再承载大量细节表格和零散专题列表。

### 2. agent-architecture-and-prompting.md

统一整合这些主题：

- prompt construction
- context management
- tool system
- compaction and output truncation
- multi-agent / subagent patterns

写法以横向比较为主，不再一篇产品一篇产品平铺。

旧文中可吸收的内容主要来自：

- `prompt-construction-strategies.md`
- `claude-code-prompt-strategy.md`
- `opencode-prompt-strategy.md`
- `codex-prompt-strategy.md`
- `context-management.md`
- `context-management-enhanced.md`
- `compaction-tool-output-strategy-analysis.md`
- `tool-system.md`
- `multi-agent.md`
- `multi-agent-collaboration-patterns.md`
- `file-editing-comparison.md`
- `sandbox-security-comparison.md`

### 3. agent-task-and-goal-strategies.md

这是本次修订的核心页面，统一整合：

- `todo`
- `task`
- `goal`
- `pause/resume`
- 长任务 continuation
- “什么时候是会话内任务管理，什么时候是线程级目标控制”

正文优先给出判断，再给出产品差异：

- `Claude Code`：核心是 `TodoWrite` 与 `TaskCreate` / `TaskUpdate` 的会话任务管理；`/goal` 更像自动续跑控制面，不等于 Codex 式 thread goal runtime
- `OpenCode`：核心是 `session todo` 持久化、task/subagent、权限与控制面；目前不应描述成与 Codex 同级的 goal state machine
- `Codex`：核心是线程级持久化 `goal`，有显式状态、预算、计量、恢复与受限 tool authority

旧文中可吸收的内容主要来自：

- `todo-system-analysis.md`
- `goal-command-strategy-claude-code-vs-codex.md`
- `queryloop.md`
- 与 `workflow/gsd-pause-and-resume.md` 相关但不直接复制的少量结论

### 4. source-evidence-and-code-index.md

只保留证据索引，不再尝试做完整正文叙述。

内容包括：

- `Claude Code` 相关实现文件
- `OpenCode` 相关实现文件
- `Codex` 相关实现文件
- 重要公开资料链接
- 每条关键结论对应的源码或公开来源

## Navigation Strategy

`coding-agents/.pages` 调整为只暴露上述四页。

迁移原则：

- 高价值内容先并入新页
- 旧页先从主导航移除
- 明显重复、结论已被新页取代、且不再需要保留的旧页再删除

这样可以避免一次性大删造成信息丢失，也便于校对迁移是否完整。

## Content Strategy

正文统一采用以下写法：

- 先给结论
- 再讲差异
- 再讲适用边界
- 最后用少量源码或公开证据支撑

避免的问题：

- 一段话里塞过多文件路径
- 把源码结构说明当正文主线
- 相同结论在不同产品页重复出现
- 用“可能”“大概”覆盖已经可以用实现证据确认的判断

## Required Corrections

### Claude Code

需要修正为：

- `TodoWriteTool` 是会话任务追踪工具，强调“多步骤任务应主动使用 todo list”，并要求任务状态及时更新
- `TaskCreateTool` / `TaskUpdateTool` 属于较新的任务体系，不应再只用旧 `todo` 视角概括全部任务管理
- `/goal` 不能再简单写成 “与 Codex 相同的持久化目标系统”

截至 **2026-07-08**，公开资料更准确的表述应是：

- 官方文档把 `/goal` 描述成基于 `Stop hook` 的内建快捷方式，用来“设置完成条件并持续工作直到满足”
- 公开发布记录显示 `/goal` 后续持续有 evaluator、background shell、delegated subagent、hook interaction 相关修复
- 公开 issue 仍表明 `/goal` 在不同入口和环境下存在行为差异，至少包括 Remote Control 立即启动 turn 的回归，以及 Desktop Code tab 中不可用或受限的情况

因此新文应把 `Claude Code /goal` 写成：

- 一个跨 turn 的 completion-condition loop / control surface
- 依赖停止判定与 orchestration 收敛
- 具备持续执行语义
- 但公开证据不足以支持把它等同于 Codex 那种完整 thread-goal state machine

### OpenCode

需要修正为：

- `todowrite` 与 `SessionTodo` 是 session-scope todo 机制
- todo 列表是持久化的，但不是线程目标状态机
- `task` 更偏子代理/执行控制，而不是 `goal` 抽象
- 现阶段文档应避免把 OpenCode 写成既有 Claude Code 式 `/goal`，又有 Codex 式 thread goal 的混合体

### Codex

需要强化并校正为：

- `goal` 是线程级持久化对象
- 模型只能通过 `get_goal` / `create_goal` / `update_goal` 接触
- `update_goal` 权限受限，只能标记 `complete` 或 `blocked`
- `pause` / `resume` / `budget-limited` / `usage-limited` 由用户或系统控制
- 这是一个显式状态机与 accounting runtime，而不是 todo list

## External Verification Requirement

本次修订必须把 `Claude Code /goal` 的结论同时建立在：

- 本地源码与既有文档材料
- 联网检索到的最新公开资料

至少应覆盖两类外部证据：

- 官方文档或发布说明
- 最新公开 issue / discussion / changelog 线索

所有“最新”判断都要写明检索日期为 **2026-07-08**。

## Implementation Notes

实施时建议按这个顺序：

1. 盘点旧文，标记“保留吸收 / 下沉附录 / 删除”
2. 新建三篇主页面草稿
3. 更新 `coding-agents/index.md`
4. 更新 `coding-agents/.pages`
5. 校对链接与引用
6. 再删除明显已废弃的旧页

## Risks

- 旧文删除过快可能导致未迁移信息丢失
- `Claude Code /goal` 的公开证据仍以行为说明和 issue 为主，不能过度推断内部实现
- 如果正文保留过多文件级细节，会再次膨胀回“源码考据集”

## Acceptance Criteria

- `coding-agents` 主导航收敛到四个页面
- 读者从 `index.md` 能顺着一条清晰阅读路径进入
- `todo` / `goal` 的三方对比不再混淆“会话任务追踪”和“线程目标状态机”
- `Claude Code /goal` 表述已依据 **2026-07-08** 的最新公开资料修正
- 旧文重复内容明显减少，主文长度和重叠度下降
