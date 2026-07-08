# Task 4 报告

## 交付结果

已新增以下五篇专题文档：

- `docs/ai-coding/coding-agents/design-principles/context-management-and-compaction.md`
- `docs/ai-coding/coding-agents/design-principles/memory-rules-and-project-instructions.md`
- `docs/ai-coding/coding-agents/design-principles/subagent-handoff-and-orchestration.md`
- `docs/ai-coding/coding-agents/design-principles/evaluation-observability-and-regression.md`
- `docs/ai-coding/coding-agents/design-principles/retry-recovery-and-failure-handling.md`

## 实现说明

这五篇文档都按同一主线重构：

1. 先给设计原则型结论，而不是源码导读。
2. 每篇都并排覆盖 `Claude Code`、`OpenCode`、`Codex`。
3. 每个关键结论都标注了证据类型：
   - 本地源码
   - 官方文档
   - 公开 issue / discussion
   - 推断
4. 每篇至少包含一张 Mermaid 图。
5. 明确写出三套系统的差异与 trade-off，避免误写成同构架构。

## 各文档重点

### 1. 上下文管理与压缩

- 重点解释：
  - 前缀规则
  - 尾部保留
  - 工具输出裁剪
  - pre-turn / mid-turn compaction
- 关键差异：
  - `Claude Code` 偏 boundary relink + preserved tail
  - `OpenCode` 偏 durable compaction checkpoint
  - `Codex` 偏 instruction/thread/item 视图先行，compaction 当前更多出现在线程系统周边

### 2. 记忆、规则与项目说明

- 明确区分：
  - 规则文件
  - 长期记忆
  - 会话上下文
  - skills / instructions 注入
- 关键差异：
  - `Claude Code` 有 `CLAUDE.md`、memory 机制、session memory 双层结构
  - `OpenCode` 把 `AGENTS.md` 与 session history 分成两条 durable 轨道
  - `Codex` 把 `AGENTS.md` 与 memories pipeline 显式拆开

### 3. 子代理交接与编排

- 重点解释：
  - handoff contract
  - 上下文裁剪
  - 任务工件
  - 主代理/子代理边界
- 关键差异：
  - `Claude Code` 偏 prompt brief + context factory
  - `OpenCode` 偏 durable background orchestration
  - `Codex` 偏 parent/child thread protocol 与审计链

### 4. 评估、可观测性与回归

- 至少覆盖了：
  - 恢复后重复执行
  - 压缩后丢目标
  - 审批绕过
  - subagent 漏交接
- 关键差异：
  - `Claude Code` 观测点多但分散
  - `OpenCode` 适合做 replayable regression
  - `Codex` 适合做线程/审批/子代理系统审计

### 5. 重试、恢复与失败处理

- 重点解释：
  - retry boundary
  - 什么时候不能重试
  - 部分失败
  - 取消 race
  - 工具失败分类
- 关键差异：
  - `Claude Code` 失败分类细，但逻辑分散在多层
  - `OpenCode` 对不能自动重试的边界写得最明确
  - `Codex` 适合把失败归到线程/目标/审批不同层

## 主要证据来源

### Claude Code

- 本地源码：
  - `src/QueryEngine.ts`
  - `src/Tool.ts`
  - `src/bootstrap/state.ts`
  - `src/services/compact/compact.ts`
  - `src/services/compact/sessionMemoryCompact.ts`
  - `src/services/SessionMemory/sessionMemory.ts`
  - `src/utils/forkedAgent.ts`
  - `src/bridge/*`
- 公开 issue / discussion：
  - `anthropics/claude-code#65099`
  - `anthropics/claude-code#58558`

### OpenCode

- 本地源码：
  - `packages/core/src/instruction-context.ts`
  - `packages/core/src/session/compaction.ts`
  - `packages/core/src/session/input.ts`
  - `packages/core/src/session/history.ts`
  - `packages/core/src/session/context-epoch.ts`
  - `packages/core/src/session/runner/llm.ts`
  - `packages/core/src/background-job.ts`
- 官方文档：
  - `specs/v2/session.md`
  - `specs/v2/tools.md`
  - `specs/v2/todo.md`

### Codex

- 本地源码：
  - `codex-rs/app-server-protocol/src/protocol/v2/thread.rs`
  - `codex-rs/app-server-protocol/src/protocol/v2/thread_data.rs`
  - `codex-rs/ext/goal/src/spec.rs`
  - `codex-rs/ext/goal/src/tool.rs`
  - `codex-rs/ext/goal/src/runtime.rs`
  - `codex-rs/state/src/audit.rs`
  - `codex-rs/analytics/src/events.rs`
  - `codex-rs/agent-graph-store/src/store.rs`
  - `codex-rs/ext/memories/*`
- 官方文档：
  - `codex/docs/agents_md.md`
  - `codex-rs/README.md`
  - `codex-rs/memories/README.md`

## 自检结果

- 已检查五篇文档均为简体中文。
- 已检查五篇文档均包含 Mermaid 图。
- 已检查五篇文档均覆盖 `Claude Code`、`OpenCode`、`Codex`。
- 已检查五篇文档均以设计原则和差异/权衡为主，不是功能清单。
- 已检查关键结论都带有证据类型说明。

## 风险与保留意见

- `Codex` 当前公开仓库中关于 compaction 的一等设计文档不如 `OpenCode` 与 `Claude Code` 明显，因此 `context-management-and-compaction.md` 里关于 Codex 的部分更偏“从协议、memory 与 analytics 侧反推其上下文管理设计”，文中已明确标注为推断或本地源码依据。
- `OpenCode` 的 subagent/background agent 公开语义仍在演进中，因此 `subagent-handoff-and-orchestration.md` 与 `evaluation-observability-and-regression.md` 对它的部分有意保留“尚在收敛”的表述，没有过度补齐不存在的细节。

## Task 4 review 修复追加自检

- 已将 `context-management-and-compaction.md` 开篇对 `Codex` 的总论拆成两句：前半句保留 `本地源码`，后半句改为 `本地源码 + 推断`。
- 已将 `subagent-handoff-and-orchestration.md` 开篇对 `OpenCode` 的总论拆成两句：事实描述保留 `官方文档`，关于“先放在编排一致性而非公开 prompt contract”的判断降级为 `官方文档 + 推断`。
- 已复查两处修改仅收紧证据归类，未调整章节结构、表格、图示和后文展开。
