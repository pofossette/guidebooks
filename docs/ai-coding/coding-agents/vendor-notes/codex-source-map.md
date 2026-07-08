# Codex 源码地图

这一页只保留与“解耦、控制面、事件与可追溯”直接相关的模块。

## Protocol / Runtime / State

- `codex/codex-rs/app-server-protocol/src/protocol/v2/thread.rs`
  - 职责：thread start/settings/update 的协议定义，包含 model、sandbox、approval、dynamic tools、instruction sources。
  - 为什么相关：是 UI/runtime 解耦和 control plane 协议化的第一入口。
- `codex/codex-rs/app-server-protocol/src/protocol/v2/thread_data.rs`
  - 职责：`Thread`、`Turn`、`TurnItemsView` 等线程载荷结构。
  - 为什么相关：解释为什么 UI 只是协议消费者。
- `codex/codex-rs/state/src/lib.rs`
  - 职责：SQLite-backed state、goal、log、audit row 的统一入口。
  - 为什么相关：三篇专题都要用到的持久化支点。

## Goal / Tool / Control Plane

- `codex/codex-rs/ext/goal/src/spec.rs`
  - 职责：`get_goal/create_goal/update_goal` 工具 schema 与说明。
  - 为什么相关：展示工具契约如何直接携带控制面约束。
- `codex/codex-rs/ext/goal/src/tool.rs`
  - 职责：goal 工具执行、状态迁移限制、progress accounting。
  - 为什么相关：说明哪些状态能由模型改，哪些不能。
- `codex/codex-rs/ext/goal/src/runtime.rs`
  - 职责：active turn steering、external mutation、idle/active goal accounting。
  - 为什么相关：解释 goal 不只是静态对象，而是运行时的一部分。

## Event / Auditability

- `codex/codex-rs/ext/goal/src/events.rs`
  - 职责：发出 `ThreadGoalUpdated` 事件。
  - 为什么相关：把工具执行、turn、goal 状态与事件流连起来。
- `codex/codex-rs/state/src/audit.rs`
  - 职责：线程状态审计读取。
  - 为什么相关：是“可审计”这一结论的直接落点。

## 使用提醒

- 最容易写错的是把 Codex 写成“prompt 更强的聊天工具”。
- 更稳的表述是：它先有 `thread/turn/protocol/state/audit` 这条主干，再让 UI、goal tool、review 等能力挂上去。
