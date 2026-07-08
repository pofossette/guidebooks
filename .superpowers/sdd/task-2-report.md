# Task 2 报告

## 完成范围

已完成以下 6 个目标文件：

- `docs/ai-coding/coding-agents/design-principles/ui-runtime-decoupling.md`
- `docs/ai-coding/coding-agents/design-principles/tool-protocol-and-control-plane.md`
- `docs/ai-coding/coding-agents/design-principles/event-log-state-and-auditability.md`
- `docs/ai-coding/coding-agents/vendor-notes/claude-code-source-map.md`
- `docs/ai-coding/coding-agents/vendor-notes/opencode-source-map.md`
- `docs/ai-coding/coding-agents/vendor-notes/codex-source-map.md`

## 产出摘要

### 1. 设计原则主线已重构为问题驱动叙事

三篇专题都采用了统一结构：

- 问题
- 三家做法
- trade-off
- 设计启发

并且每篇都同时覆盖了 `Claude Code`、`OpenCode`、`Codex`，没有把三家错误写成同一种架构。

### 2. 每篇专题都补了 Mermaid 图

- `ui-runtime-decoupling.md`：2 张图，分别解释抽象边界和 OpenCode/Codex 的 runtime 形态
- `tool-protocol-and-control-plane.md`：2 张图，解释 tool plane/control plane 分工
- `event-log-state-and-auditability.md`：2 张图，解释事件链和审计状态机

### 3. 证据标注已落到关键结论

关键结论都标了证据类型，使用了以下类别：

- 本地源码
- 官方文档
- 推断

本次没有强依赖公开 issue / discussion，因此未强行填充该证据类型。

### 4. 源码地图页控制为辅助页

三篇 `vendor-notes` 都采取短页结构，只列：

- 模块
- 职责
- 与本专题的关联

没有写成长篇源码导读。

## 主要证据锚点

### Claude Code

- `src/QueryEngine.ts`
- `src/Tool.ts`
- `src/bootstrap/state.ts`
- `src/bridge/bridgeMessaging.ts`
- `src/assistant/sessionHistory.ts`
- `src/utils/sessionRestore.ts`

### OpenCode

- `specs/v2/session.md`
- `packages/core/src/tool/registry.ts`
- `packages/core/src/permission.ts`
- `packages/core/src/session/input.ts`
- `packages/core/src/session/history.ts`
- `packages/core/src/session/context-epoch.ts`
- `packages/core/src/session/todo.ts`
- `packages/opencode/src/control-plane/workspace.ts`

### Codex

- `codex-rs/app-server-protocol/src/protocol/v2/thread.rs`
- `codex-rs/app-server-protocol/src/protocol/v2/thread_data.rs`
- `codex-rs/ext/goal/src/spec.rs`
- `codex-rs/ext/goal/src/tool.rs`
- `codex-rs/ext/goal/src/runtime.rs`
- `codex-rs/ext/goal/src/events.rs`
- `codex-rs/state/src/lib.rs`

## 自检结果

### 约束核对

- 文档语言：简体中文，已满足
- 三篇设计原则页均覆盖三家系统，已满足
- 三篇设计原则页均含 Mermaid 图，已满足
- 主叙事为设计原则型，不是源码导读型，已满足
- 源码地图页为辅助页且较短，已满足
- `ui-runtime-decoupling.md` 聚焦 `UI/runtime/provider/state` 边界，已满足
- `tool-protocol-and-control-plane.md` 聚焦 `tool schema/tool plane/control plane/权限边界`，已满足
- `event-log-state-and-auditability.md` 聚焦 `event/state/log/protocol` 对恢复与审计的支撑，已满足

### 风险与保留项

- `Claude Code` 与 `OpenCode` 的一部分判断依赖仓库内规格和实现注释，而非外部产品白皮书，因此文中已把超出直接代码陈述的部分标为“推断”。
- 当前未修改导航页；如果后续主任务要求把这 6 页挂到 `.pages` 或索引页，需要由负责导航的任务统一处理，避免和 Task 1 冲突。

## 验证

执行了文本级自检，关注点包括：

- 目标文件已创建
- Mermaid 代码块存在
- 每篇专题同时包含 `Claude Code`、`OpenCode`、`Codex`
- 文中包含“证据类型”标注

未执行站点构建或 Markdown 渲染测试，因为当前任务需求只要求文档实现与自检，没有给出固定构建命令。

## 本次修订自检

### 命令

- `rtk rg -n "## 并排比较|## 设计启发|最后给一个稳妥判断|最后的稳妥判断|证据类型：OpenCode 官方规格文档|证据类型：推断。" /home/wunai/Disks/Data/my-project/guidebooks/docs/ai-coding/coding-agents/design-principles/ui-runtime-decoupling.md /home/wunai/Disks/Data/my-project/guidebooks/docs/ai-coding/coding-agents/design-principles/tool-protocol-and-control-plane.md /home/wunai/Disks/Data/my-project/guidebooks/docs/ai-coding/coding-agents/design-principles/event-log-state-and-auditability.md`
- `rtk git diff --check`

### 结果

- 三篇文档的综合比较表后、设计启发和最终收束总结处都已补齐统一的 `证据类型` 标注。
- OpenCode 的官方证据已统一写明为仓库内 `specs/v2/*.md` 规格文档，与本地源码实现区分开。
- `git diff --check` 未报告空白或格式错误。

## Task 2 Review Gap Closure

### 命令

- `rtk rg -n "证据类型：|OpenCode 官方规格文档|这三者不是同一种架构的轻微变体|最终 control plane 由 session、permission、tool registry、location 一起构成|这三种路线各有上限，也各有成本|这三种侧重点不该被写成同一个层级的“日志系统”" docs/ai-coding/coding-agents/design-principles/ui-runtime-decoupling.md docs/ai-coding/coding-agents/design-principles/tool-protocol-and-control-plane.md docs/ai-coding/coding-agents/design-principles/event-log-state-and-auditability.md`
- `rtk git diff --check -- docs/ai-coding/coding-agents/design-principles/ui-runtime-decoupling.md docs/ai-coding/coding-agents/design-principles/tool-protocol-and-control-plane.md docs/ai-coding/coding-agents/design-principles/event-log-state-and-auditability.md`

### 结果

- 三篇文档中综合比较表后的统一判断、设计启发条目、最终总结和最后一句收口判断均已显式带上 `证据类型` 标注。
- OpenCode 的官方文档证据已统一为“OpenCode 官方规格文档（仓库内 `specs/v2/*.md`）”表述，避免与本地源码证据混淆。
- `rtk rg` 命中 82 处 `证据类型` 或目标结论句，覆盖本次补改位置；`rtk git diff --check -- ...` 无输出，说明本次改动未引入空白或补丁格式问题。
