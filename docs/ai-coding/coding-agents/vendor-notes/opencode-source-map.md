# OpenCode 源码地图

这一页只列和本组专题最相关的入口。

## UI / Runtime / Provider / State

- `opencode/specs/v2/session.md`
  - 职责：V2 Session、inbox、runner、context epoch、history、compaction 规格。
  - 为什么相关：三篇专题里最核心的官方设计依据。
- `opencode/packages/core/src/session/context-epoch.ts`
  - 职责：系统上下文基线与快照推进。
  - 为什么相关：解释 runtime/state/provider 之间为什么要有单独上下文层。
- `opencode/packages/core/src/session/history.ts`
  - 职责：按 baseline 与 compaction 裁剪 runner 可见历史。
  - 为什么相关：支撑恢复与可追溯主线。

## Tool Plane / Control Plane

- `opencode/packages/core/src/tool/registry.ts`
  - 职责：工具注册、materialize、settle。
  - 为什么相关：是“工具协议与控制面”专题的中心文件。
- `opencode/packages/core/src/permission.ts`
  - 职责：`evaluate / ask / assert / reply` 与权限事件发布。
  - 为什么相关：展示 control plane 并不藏在 UI 层。
- `opencode/packages/core/src/tool/todowrite.ts`
  - 职责：具体 built-in 工具如何显式声明权限并更新 session todo。
  - 为什么相关：说明 registry、permission、tool executor 如何分责。

## Event / Inbox / Auditability

- `opencode/packages/core/src/session/input.ts`
  - 职责：`PromptAdmitted`、`Prompted`、steer/queue promotion。
  - 为什么相关：是事件与恢复语义最直接的证据。
- `opencode/packages/core/src/session/todo.ts`
  - 职责：session-scope todo 持久化与事件发布。
  - 为什么相关：补足“会话状态不是临时 prompt 片段”的论点。
- `opencode/packages/opencode/src/control-plane/workspace.ts`
  - 职责：workspace sync、remote target、SSE 事件桥接。
  - 为什么相关：说明 runtime 不局限于本地 CLI。

## 使用提醒

- 最容易写错的是把 OpenCode 当成“另一个终端 agent”。
- 更稳的表述是：它把 `Session + Location + EventV2 + ToolRegistry + PermissionV2` 组合成了 runtime/control plane。
