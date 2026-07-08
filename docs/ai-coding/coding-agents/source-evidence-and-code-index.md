# AI 编码 Agent 源码与证据索引

这一页不再承担完整叙述，只做两件事：

- 告诉你关键结论分别落在哪些实现文件
- 给出本次修订 `Claude Code /goal` 时使用的最新公开资料

## 1. Claude Code

### 本地实现与提示词材料

- `claude-code-src/src/tools/TodoWriteTool/prompt.ts`
- `claude-code-src/src/tools/TodoWriteTool/TodoWriteTool.ts`
- `claude-code-src/src/tools/TaskCreateTool/prompt.ts`
- `claude-code-src/src/tools/TaskCreateTool/TaskCreateTool.ts`
- `claude-code-src/src/tools/TaskUpdateTool/prompt.ts`
- `claude-code-src/src/tools/TaskUpdateTool/TaskUpdateTool.ts`
- `claude-code-src/src/utils/todo/types.ts`
- `claude-code-src/src/utils/sessionRestore.ts`

### 本次文档结论对应关系

- “Claude Code 的第一层主角是会话任务管理，而不是线程级目标运行时”
  - 主要依据：`TodoWriteTool`、`TaskCreateTool`、`TaskUpdateTool` 的工具定义与提示词
- “Todo 会要求主动使用、及时更新、完成即标记”
  - 主要依据：`src/tools/TodoWriteTool/prompt.ts`
- “关闭 3+ 项任务时会追加 verification nudge”
  - 主要依据：`src/tools/TodoWriteTool/TodoWriteTool.ts`

### 最新公开资料：/goal

以下资料均在 **2026-07-08** 检索：

- 官方 `/goal` 文档  
  https://code.claude.com/docs/en/goal
- 官方最佳实践  
  https://code.claude.com/docs/en/best-practices
- 官方 hooks 参考  
  https://docs.anthropic.com/en/docs/claude-code/hooks
- 官方 hooks 指南  
  https://docs.anthropic.com/en/docs/claude-code/hooks-guide
- 官方 “What’s new” 总览  
  https://code.claude.com/docs/en/whats-new
- 官方 Week 20 周报（`v2.1.139–v2.1.142`，首次公开 `/goal`）  
  https://code.claude.com/docs/en/whats-new/2026-w20
- 官方 release notes / changelog 入口  
  https://docs.anthropic.com/en/release-notes/claude-code

### 公开 issue 线索：/goal 与环境边界

以下 issue 不是“官方规格”，但能说明当前公开行为边界和回归面：

- Desktop Code tab 中 `/goal` 与 `/permissions` 不可用的争议  
  https://github.com/anthropics/claude-code/issues/59969
- Desktop app 中 `/remote-control` 在非交互环境被 denylist 阻止  
  https://github.com/anthropics/claude-code/issues/63988
- `/goal` 与显式 cancel 冲突，继续错误续跑  
  https://github.com/anthropics/claude-code/issues/65099
- `/goal` 的 Stop hook JSON 校验问题导致无法自动 clear  
  https://github.com/anthropics/claude-code/issues/58558
- 瞬时 529 过载会中断长时间 `/goal` 运行  
  https://github.com/anthropics/claude-code/issues/69975

这些线索共同支持一个更稳妥的结论：

- `/goal` 的公开行为已经明确是“completion-condition-driven autonomous continuation”
- 但它仍然明显依赖 stop/evaluation/orchestration 这条链路
- 因而不应在文档里被过度简化成“和 Codex 一样的 goal state machine”

## 2. OpenCode

### 本地实现

- `opencode/specs/v2/todo.md`
- `opencode/packages/core/src/tool/todowrite.ts`
- `opencode/packages/core/src/session/todo.ts`
- `opencode/packages/schema/src/session-todo.ts`
- `opencode/packages/opencode/test/tool/task.test.ts`
- `opencode/packages/opencode/src/control-plane/workspace.ts`
- `opencode/packages/opencode/src/control-plane/types.ts`

### 本次文档结论对应关系

- “OpenCode 的 todo 是 session-scope 且持久化”
  - 主要依据：`packages/core/src/session/todo.ts`
- “todowrite 是任务清单更新工具，不是 thread goal tool”
  - 主要依据：`packages/core/src/tool/todowrite.ts`
- “`task/subagent` 更偏执行控制，不应被直接等同为目标运行时”
  - 主要依据：`packages/opencode/.../task` 与 control-plane 相关实现

## 3. Codex

### 本地实现

- `codex/codex-rs/ext/goal/src/spec.rs`
- `codex/codex-rs/ext/goal/src/tool.rs`
- `codex/codex-rs/ext/goal/src/runtime.rs`
- `codex/codex-rs/ext/goal/src/steering.rs`
- `codex/codex-rs/ext/goal/src/accounting.rs`
- `codex/codex-rs/app-server-protocol/src/protocol/v2/thread.rs`
- `codex/codex-rs/app-server-protocol/src/protocol/v2/thread_data.rs`
- `codex/sdk/typescript/src/thread.ts`
- `codex/sdk/typescript/src/threadOptions.ts`

### 本次文档结论对应关系

- “Codex 有明确线程级 goal 对象”
  - 主要依据：thread goal 协议定义与 app-server protocol
- “模型通过 `get_goal` / `create_goal` / `update_goal` 接触 goal”
  - 主要依据：`ext/goal/src/spec.rs` 与 `ext/goal/src/tool.rs`
- “模型不能自行 pause/resume/budget-limit”
  - 主要依据：`update_goal` tool spec 与处理逻辑
- “goal 与 budget、elapsed time、continuation 绑定”
  - 主要依据：`runtime.rs`、`steering.rs`、`accounting.rs`

## 4. 这次修订真正改掉了什么

如果你只看旧文，最容易得出两个错误印象：

1. 三家都有差不多的 `goal` 系统
2. todo、task、goal 只是不同名字

这次修订后，文档应该回到这三个稳定判断：

- `Claude Code` 的主轴是会话任务管理，`/goal` 是自动续跑控制面
- `OpenCode` 的主轴是持久化会话 todo 与运行时控制，不应强行上升为 `Codex` 式目标运行时
- `Codex` 的主轴是线程级 goal 状态机、预算和 continuation
