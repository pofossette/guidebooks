# AI 编码 Agent 机制总览

这一组文档现在只保留一条主线，重点回答三件事：

- `Claude Code`、`OpenCode`、`Codex` 这类 AI 编码 agent 到底各自把重点放在哪一层
- 提示词、上下文、工具、多 agent、todo、目标这些机制怎样拼成一套可持续运行的系统
- 哪些旧结论需要订正，尤其是 `todo/task` 和 `goal` 的边界

## 推荐阅读顺序

1. [架构、提示词与上下文策略](./agent-architecture-and-prompting.md)
2. [任务、Todo 与目标策略](./agent-task-and-goal-strategies.md)
3. [源码与证据索引](./source-evidence-and-code-index.md)

## 这组文档现在怎么分工

### 1. 架构、提示词与上下文策略

看这一页，如果你关心的是：

- 系统提示词怎么组装
- 项目规则和环境信息怎么注入
- 上下文为什么会压缩成不同形状
- 多 agent / 子 agent 在三套系统里的角色差异

入口： [架构、提示词与上下文策略](./agent-architecture-and-prompting.md)

### 2. 任务、Todo 与目标策略

看这一页，如果你关心的是：

- `TodoWrite`、`task`、`/goal` 到底是不是一回事
- `Claude Code` 的 `/goal` 现在应该怎样准确描述
- `OpenCode` 为什么不该被写成 `Codex` 式目标运行时
- `Codex` 的线程级 goal 状态机到底和 checklist 有什么区别

入口： [任务、Todo 与目标策略](./agent-task-and-goal-strategies.md)

### 3. 源码与证据索引

看这一页，如果你需要：

- 快速找到支撑结论的本地源码位置
- 查看 `Claude Code /goal` 本次订正用到的最新公开资料
- 对照本地实现和文档判断，继续补充或复核

入口： [源码与证据索引](./source-evidence-and-code-index.md)

## 先记住这三个判断

- `Claude Code` 最强的是会话层 prompt 组织、工具纪律和任务追踪，`/goal` 是强自动续跑控制面，但不宜直接写成 Codex 式线程目标状态机。
- `OpenCode` 最强的是持久化会话 todo、`task/subagent` 执行控制，以及 `permission/runtime/control-plane` 的组合。
- `Codex` 最强的是 thread/turn/goal 的后端建模，它是三者里线程级 goal 状态机最明确的一家。

如果你之前看过旧文，这一版最大的变化就是：不再把所有“任务推进能力”混写成同一种机制。
