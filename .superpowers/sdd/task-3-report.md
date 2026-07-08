# Task 3 Report

## Status

DONE_WITH_CONCERNS

## Delivered Files

- `docs/ai-coding/coding-agents/design-principles/interrupt-resume-and-traceability.md`
- `docs/ai-coding/coding-agents/design-principles/permission-approval-and-human-override.md`
- `docs/ai-coding/coding-agents/design-principles/sandbox-and-execution-isolation.md`

## What Changed

### 1. 中断恢复专题

- 明确拆分了 `中断 / 暂停 / 恢复 / 续跑 / 可追溯` 五个概念。
- 用 `stateDiagram-v2` 和 `sequenceDiagram` 区分了：
  - `Claude Code` 的 `session restore + /goal + Stop hook`
  - `OpenCode` 的 durable continuation / local continuation reload
  - `Codex` 的 `thread/resume + goal runtime + audit/state`
- 纳入了公开失效面：
  - `Claude Code` cancel 后继续跑、Stop hook JSON 校验失效、Desktop / 非交互环境边界
  - `Codex` resume 后 sandbox/approval profile 漂移、5 小时 usage limit 后 goal 卡在 approval

### 2. 权限审批专题

- 明确拆分了 `approval policy / human override / permission scope / tool authority` 四层边界。
- 对三家系统分别给出设计差异：
  - `Claude Code`：runtime mode + hook + bridge control request
  - `OpenCode`：`PermissionV2` 与 `ToolRegistry` 分责
  - `Codex`：`AskForApproval`、`ApprovalsReviewer`、`ActivePermissionProfile`、tool contract 分层
- 纳入了 headless / compaction / auto-review 丢失等真实公开边界。

### 3. 沙箱隔离专题

- 明确拆分了文件系统、shell、网络、cwd、权限升级、容器/进程隔离六层。
- 对三家系统分别给出主叙事：
  - `Claude Code`：permission runtime + host 差异
  - `OpenCode`：location/workspace/process containment
  - `Codex`：protocolized sandbox mode / policy / permission profile
- 纳入了公开失效面：
  - app-server 仍跑只读沙箱
  - Desktop / VS Code / app 注入的 network/profile 不一致

## Evidence Policy Used

- 每篇开头结论都显式标记了证据类型。
- 关键判断仅使用四类证据：
  - 本地源码
  - 官方文档
  - 公开 issue / discussion
  - 推断
- 避免把三套系统写成同一种目标状态机或同一种 sandbox 架构。

## Self-Check Performed

- 检查三篇文档都同时出现 `Claude Code`、`OpenCode`、`Codex`。
- 检查三篇文档都至少包含一段 Mermaid。
- 检查专题关键词边界存在：
  - `中断 / 暂停 / 恢复 / 续跑 / 可追溯`
  - `approval policy / human override / permission scope / tool authority`
  - `sandbox / shell / network / cwd / writable roots / permission profile`
- 检查文内均包含证据类型标注和公开失效面段落。

## Commands Used For Verification

```bash
rtk rg -n "Claude Code|OpenCode|Codex|mermaid|证据类型|公开 issue|官方文档|本地源码" docs/ai-coding/coding-agents/design-principles/interrupt-resume-and-traceability.md docs/ai-coding/coding-agents/design-principles/permission-approval-and-human-override.md docs/ai-coding/coding-agents/design-principles/sandbox-and-execution-isolation.md

rtk rg -n "approval policy|human override|permission scope|tool authority|sandbox|中断|暂停|恢复|续跑|可追溯" docs/ai-coding/coding-agents/design-principles/interrupt-resume-and-traceability.md docs/ai-coding/coding-agents/design-principles/permission-approval-and-human-override.md docs/ai-coding/coding-agents/design-principles/sandbox-and-execution-isolation.md
```

## Concerns

- 未运行 Markdown/Mermaid 渲染器做最终视觉校验；当前只做了文本结构自检。
- 公开 issue 采用了截至 `2026-07-08` 可见的公开页面，若后续 issue 被合并、重命名或关闭，编号仍有效但摘要可能变化。

## Review Fix Follow-Up

- 已把 reviewer 指出的三类关键结论改成“结论后紧邻 `证据类型`”：
  - `interrupt-resume-and-traceability.md` 中“如果把这五个词压成同一个 resume...”
  - `permission-approval-and-human-override.md` 中“人工 override 在 OpenCode 里不是神奇大按钮...”
  - `sandbox-and-execution-isolation.md` 中 “OpenCode 的第一层隔离单位...” 与 “只读文件系统 != 禁网 / 可写工作区 != 自动放开网络”
- 已把缺失性比较或综合归纳判断从偏强的“本地源码”收紧为“推断”或“本地源码 + 推断”。
- 已在 `sandbox-and-execution-isolation.md` 的 Claude Code 段落补强“权限升级”边界，说明 UI / hook / mode / remote/bridge 控制面可以临时放宽限制，但仍不是 `Codex` 式显式 profile overlay。
- 已在 `interrupt-resume-and-traceability.md` 文首补一句，说明状态图是跨系统概念图，不代表三家都公开实现了同构 `Paused` 状态。

## Follow-Up Self-Check

Command:

```bash
rtk rg -n "跨系统概念图|同构的 `Paused`|误判三家的设计重点|神奇大按钮|权限升级边界|协商式调整|profile overlay|第一层隔离单位|只读文件系统 != 禁网|可写工作区 != 自动放开网络|证据类型：本地源码 \+ 推断|证据类型：公开 issue / discussion \+ 推断" docs/ai-coding/coding-agents/design-principles/interrupt-resume-and-traceability.md docs/ai-coding/coding-agents/design-principles/permission-approval-and-human-override.md docs/ai-coding/coding-agents/design-principles/sandbox-and-execution-isolation.md
```

Result:

- 命中了文首状态图说明、三处 reviewer 点名句子、Claude Code 权限升级边界段，以及新增的 `本地源码 + 推断` / `公开 issue / discussion + 推断` 标注。
- `rtk git diff -- <three docs>` 仅显示三份目标文档改动；未波及其他文档。

## Task 3 Final Important Finding Fix

Command:

```bash
rtk nl -ba docs/ai-coding/coding-agents/design-principles/interrupt-resume-and-traceability.md | sed -n '24,29p'
```

Result:

- `暂停` 条目的证据类型已从偏硬的 `本地源码` 收紧为 `本地源码 + 推断`。
- `Codex` 的 `ThreadGoalStatus::Paused` 仍明确保留为源码事实。
- `Claude Code` 与 `OpenCode` “没有同层公开 goal pause 对象” 仍保留原意，但不再被单独表述为纯源码结论。
