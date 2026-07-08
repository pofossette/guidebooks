# Claude Code 源码地图

这一页只列和本组专题直接相关的模块，不做长篇导读。

## UI / Runtime / State

- `claude-code-src/src/QueryEngine.ts`
  - 职责：会话 query lifecycle 与 session state 核心。
  - 为什么相关：`ui-runtime-decoupling` 的关键证据，说明 runtime 已从单一 REPL 抽出。
- `claude-code-src/src/bootstrap/state.ts`
  - 职责：session-scoped runtime state、hooks、prompt cache、telemetry、恢复辅助。
  - 为什么相关：解释 state 为什么不是 UI 局部状态。
- `claude-code-src/src/utils/sessionRestore.ts`
  - 职责：从 transcript/log 恢复 todo、file history、attribution、context collapse。
  - 为什么相关：支撑“事件、状态与可追溯”专题。

## Tool Plane / Control Plane

- `claude-code-src/src/Tool.ts`
  - 职责：`ToolUseContext`、permission context、hook/progress/UI callback 边界。
  - 为什么相关：说明工具执行边界不只是 prompt。
- `claude-code-src/src/QueryEngine.ts`
  - 职责：包裹 `canUseTool` 并追踪 permission denials。
  - 为什么相关：control plane 在 runtime 内核中，而不是独立 registry。

## Event / Bridge / Audit

- `claude-code-src/src/bridge/bridgeMessaging.ts`
  - 职责：筛选可转发消息、处理 control_request/control_response。
  - 为什么相关：说明哪些事件会进入远端视图，哪些只是本地 chatter。
- `claude-code-src/src/assistant/sessionHistory.ts`
  - 职责：按页读取 `/v1/sessions/{id}/events`。
  - 为什么相关：是可追溯与远端恢复的直接入口。

## 使用提醒

- 最容易写错的是把 `Claude Code` 描述成“终端 UI 直接驱动一切”。
- 更稳的表述是：REPL 很强，但关键设计点是 `QueryEngine + ToolUseContext + session restore + bridge` 这条运行时链路。
