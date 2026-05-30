# AI Agent 终端编码系统：Claude Code vs Codex vs OpenCode 深度架构对比白皮书

> 本报告基于对三个项目源码的分析生成。**注意**：Claude Code 核心源码已从 `restored-src.zip` 解压验证（`src/Tool.ts`、`src/services/tools/StreamingToolExecutor.ts`、`src/query.ts` 等），相关描述基于实际源码。Codex 和 OpenCode 为开源项目，描述基于完整源码验证。

---

## 1. 三大系统架构概览与定位对比

| 维度 | **Claude Code** | **Codex (OpenAI)** | **OpenCode** |
|---|---|---|---|
| **系统架构范式** | 单体 CLI + 可选 MCP Server / Daemon 模式 | SQ/EQ 消息驱动 + 多 Agent 线程树 | 显式 Client-Server 分离（HTTP/WebSocket/SSE） |
| **核心开发语言与运行时** | TypeScript + TSX / **Bun** | **Rust** (edition 2024, 100+ crates) / tokio | TypeScript / **Bun** + Effect TS |
| **TUI 框架** | **Ink** (React for CLI) | **ratatui** (Rust 原生 TUI) | **OpenTUI** (SolidJS for CLI, 自研) |
| **核心设计哲学** | 流式优先、极致的上下文管理、单 Agent 深度 | 性能安全并重、平台原生沙箱、多 Agent 并行 | provider 无关、函数式 Effect 全栈、C/S 可分离 |
| **外部 LLM 依赖** | Anthropic Messages API (Beta, 仅自家模型) | OpenAI Responses API (SSE + WebSocket 双通道) | Vercel AI SDK (20+ providers: Anthropic/OpenAI/Google/Azure/Bedrock/Groq/Mistral/xAI...) |
| **MCP 协议支持** | 完整支持（客户端 + 可作为 MCP Server） | 完整支持（`rmcp` crate，含 Elicitation） | 完整支持（`@modelcontextprotocol/sdk`，含 OAuth） |
| **持久化方案** | 文件系统 (CLAUDE.md memory files) | 文件系统 + 远程 compact API | **SQLite** (Drizzle ORM) + 文件系统 |
| **配置格式** | JSON (settings hierarchy: policy→managed→user→project→local) | **TOML** (config.toml + JSON Schema) | **JSON** (opencode.json, 多源合并) |

---

## 2. 核心组件与分层架构对齐

### 2.1 Agent 编排与状态机

#### Claude Code — AsyncGenerator 状态机

核心循环位于 `src/query.ts`，采用 **AsyncGenerator** 模式：

```
query() → queryLoop() → while(true) {
    上下文压缩 → 系统提示组装 → Token 预算检查 →
    callModel() → 流式响应处理 → runTools() →
    if (needsFollowUp) continue; else return Terminal;
}
```

- 状态封装在 `State` 类型中（messages、autoCompactTracking、maxOutputTokensRecoveryCount、turnCount、transition 等）
- 工具执行通过 `StreamingToolExecutor` 实现**边流式边执行**——API 响应还在流入时就开始执行已到达的工具调用
- 并发控制基于工具级 `isConcurrencySafe` 属性：并发安全工具可并行执行，非安全工具独占执行（exclusive access）
- 支持 Coordinator 模式：Coordinator Agent 通过 `AgentTool` / `SendMessageTool` 委派给 Worker Agent，共享 Scratchpad

#### Codex — SQ/EQ 消息队列驱动

核心循环位于 `codex-rs/core/src/session/turn.rs` 的 `run_turn()`，采用 **Submission Queue / Event Queue** 模式：

```
客户端 → Submission(Op) → submission_loop 分发 →
run_turn(): while(true) {
    排空挂起输入 → 构建 Prompt → run_sampling_request() →
    if (tool_calls) ToolRouter.dispatch() → 记录结果 → continue;
    if (assistant_message) → 执行 stop/after_agent hooks → break;
}
```

- `Op` 枚举定义所有操作（UserInput、UserTurn、Interrupt...），`EventMsg` 枚举定义所有事件（TurnStarted、ExecCommandBegin、ExecApprovalRequest...）
- 整个系统天然解耦——TUI、SDK、远程客户端都通过同一对 SQ/EQ channel 与 Agent 通信
- 多 Agent 系统通过 `ThreadManager` / `AgentControl` 实现父子线程树，子 Agent 拥有独立的 `Codex` 实例和 channel

#### OpenCode — Effect Stream 驱动的函数式循环

核心循环位于 `packages/opencode/src/session/prompt.ts` 的 `runLoop`，采用 **Effect Stream** 模式：

```
while (true):
    加载压缩消息 → 检查最后 assistant 是否完成 → 处理子任务/压缩 →
    检查 Token 溢出 → 解析 agent/model → 注入提醒 →
    创建 assistant 消息 → processor.process() →
    llm.stream() → handleEvent() 逐事件处理 →
    result: "compact" | "stop" | "continue"
```

- `SessionProcessor` 通过 Effect Stream 管道处理 LLM 流式事件
- 内置 **Doom Loop 检测**：同一工具连续 3 次相同调用自动拦截
- 通过 Effect 的 `Deferred`、`Latch`、`Bus` 实现并发同步

#### 解耦程度对比

Codex 的 SQ/EQ 模式天然支持多客户端接入，解耦最彻底；OpenCode 通过 C/S 架构 + SDK 实现解耦；Claude Code 在单体模式下解耦度较低，但 Daemon 模式和 Bridge 模式提供了远程能力。

### 2.2 上下文与记忆管理

| 策略 | **Claude Code** | **Codex** | **OpenCode** |
|---|---|---|---|
| **压缩层数** | **3 层已确认**：Autocompact（自动触发）→ Reactive Compact（prompt-too-long 响应）→ Manual `/compact`。另有 snip/microcompact/context collapse 等术语在网络文章中流传，但无法从公开证据验证 | **3 层**：Pre-turn → Mid-turn (auto) → Manual + Model Downshift | **2 层**：Overflow 触发自动压缩 + 工具输出裁剪 |
| **压缩触发** | Token > (窗口 - 13K buffer)，熔断器 3 次后停止 | Token 超过 auto-compact limit | Token > (窗口 - 20K buffer) |
| **压缩方式** | 发送给模型总结（compact agent） | 发送给模型总结，生成 "handoff summary" | **专用 compaction agent** + 结构化模板（Goal/Constraints/Progress/Key Decisions/Next Steps） |
| **增量压缩** | 支持（Session Memory Compact） | 支持（CompactedItem 记录 replacement_history） | 支持（增量更新前次摘要，保留仍有效的细节） |
| **Token 估算** | 精确（Anthropic API 返回 usage） | 字节启发式 + API 返回值 | Token 计数器 + API 返回值 |
| **工具输出管理** | `toolResultStorage.ts` 按消息聚合限制大小 | 输出截断（`EXEC_OUTPUT_MAX_BYTES`）+ `TruncationPolicy` | `Truncate` 服务写临时文件 + 引用路径；裁剪时保护最近 40K tokens |
| **持久化记忆** | 文件系统（`memdir/` + CLAUDE.md），自动 memory 文件管理 | 文件系统 + 远程 `/responses/compact` 端点 | **SQLite**（Drizzle ORM），支持 JSON→SQLite 迁移 |
| **上下文窗口** | 默认 200K，特定模型支持 1M（`[1m]` 后缀） | 取决于模型，支持 remote compaction | 取决于模型，provider 无关 |

Claude Code 的压缩体系是三者中最精细的，其中 Reactive Compact（响应 prompt-too-long 错误自动触发）是已确认的独有特性。"五层"命名（Snip/Microcompact/Context Collapse 等）在网络文章中流传，但无法从 CHANGELOG 或 SDK 中直接验证。

### 2.3 工具/插件执行机制

| 能力 | **Claude Code** | **Codex** | **OpenCode** |
|---|---|---|---|
| **工具定义方式** | JSON Schema + Zod（闭源，具体实现不可见） | `ToolHandler` trait (Rust) | Effect Schema + `Def` interface |
| **工具数量** | 40+ 内置工具 | 15+ handler 类型 | 16 内置工具 |
| **Shell 执行** | `BashTool` → `exec()` → 沙箱 | `ShellHandler` → PTY → 平台沙箱 | `shell` tool → tree-sitter 解析 → 进程执行 |
| **Shell 安全** | AST 解析（`bash/ast.ts`）+ 沙箱 + 文件系统权限 | 审批策略（`exec_policy`）+ Guardian 自动审查 | tree-sitter 解析命令提取路径 + 外部目录权限检查 |
| **文件操作** | FileEditTool / FileWriteTool / FileReadTool | apply_patch（统一 diff 补丁） | read / write / edit / apply_patch |
| **并发安全** | `isConcurrencySafe` 工具级属性，安全工具并行、非安全独占 | 按 `is_mutating()` 分离 | 按工具类型分离 |
| **流式执行** | StreamingToolExecutor（边流入边执行） | 流式接收后执行 | 流式工具输入解析（tool-input-start/delta/end） |
| **自定义工具** | MCP Server 扩展 | MCP Server + 动态工具 | 配置文件加载 `{tool,tools}/*.{js,ts}` + 插件系统 |
| **MCP 集成深度** | 极深——可同时作为 MCP Client 和 Server | 深——支持 Elicitation、并行执行、Guardian 审查 | 深——支持 OAuth、Tool 变更通知、Resource/Prompt |
| **子 Agent** | AgentTool 创建子 Agent（worktree 隔离可选） | spawn_agent 工具 → ThreadManager 创建子线程 | task 工具 → 创建子 Session 递归执行 runLoop |

**关键差异**：Codex 使用 Rust trait 系统，工具在编译期获得类型安全保证；Claude Code 的 `StreamingToolExecutor` 是独有的流式执行优化；OpenCode 的 tree-sitter 命令解析是三者中最先进的 shell 安全分析方案。

---

## 3. 数据流与交互时序对比

**场景**："用户在终端输入重构指令 → Agent 拆解任务 → 调用工具改写本地代码"

### Claude Code（进程内直连）

```
用户终端 → Ink REPL (React 组件)
    → queryLoop (AsyncGenerator)
        → 构建 messages[] + system context (git status, CLAUDE.md)
        → Anthropic SDK → Anthropic API (streaming)
        → 流式回传 → StreamingToolExecutor 边解析边执行
            → FileEditTool (本地文件系统直写)
            → BashTool (exec() + 沙箱)
        → 工具结果注入 messages → 继续循环
    → Ink 渲染输出
```

**特点**：全程进程内，无网络转发。API 调用是唯一的外部网络 I/O。

### Codex（SQ/EQ 解耦通道）

```
用户终端 → ratatui TUI
    → Submission(Op::UserTurn) → tx_sub channel (bounded 512)
    → submission_loop 接收 → run_turn()
        → ContextManager.for_prompt() 构建历史
        → ModelClient → OpenAI Responses API (SSE 或 WebSocket)
        → 流式回传 → ToolRouter.dispatch()
            → ShellHandler → SandboxManager.transform() → PTY 执行
            → apply_patch → codex-apply-patch 补丁应用
        → 工具结果写入 ContextManager → 继续循环
    → Event(EventMsg::AgentMessage) → rx_event channel
    → TUI 渲染
```

**特点**：SQ/EQ channel 天然解耦。TUI 和核心引擎通过 message passing 通信，支持远程客户端接入同一 Session。

### OpenCode（C/S 架构 + SDK）

```
用户终端 → OpenTUI (SolidJS 组件)
    → SDK (HTTP/WebSocket) → Hono Server
    → Session.runLoop()
        → 加载 SQLite 中的消息历史
        → Vercel AI SDK → Provider API (Anthropic/OpenAI/Google/...)
        → 流式回传 → SessionProcessor.handleEvent()
            → shell tool → tree-sitter 解析 → 进程执行
            → edit tool → 文件系统写入
        → 工具结果持久化到 SQLite → 继续循环
    → SSE /event → TUI 实时更新
```

**特点**：标准 C/S 分离。Server 可独立运行（`opencode serve`），支持多客户端（TUI/Web/Desktop/SDK/CLI）连接同一实例。SQLite 持久化使得会话可跨进程存活。

### 数据流对比总结

```
┌──────────────────────────────────────────────────────────────────┐
│                    Claude Code (进程内直连)                       │
│  [TUI/REPL] ←→ [Agent Loop] ←→ [Anthropic API]                │
│       ↕ 直接调用     ↕ 直接调用                                  │
│  [Tools: Bash/Edit/Read/Write...]                               │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                    Codex (SQ/EQ 消息驱动)                        │
│  [TUI] ←SQ/EQ→ [Core Engine] ←→ [OpenAI API]                  │
│  [SDK] ←SQ/EQ↗      ↕ dispatch                                 │
│  [Remote] ←SQ/EQ↗ [ToolRouter] → [Handlers: Shell/Patch/MCP]  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                    OpenCode (C/S 分离)                           │
│  [TUI] ←HTTP/WS→ [Hono Server] ←→ [Vercel AI SDK → 20+ APIs] │
│  [Web]  ←HTTP/WS↗      ↕                                        │
│  [Desktop]↗     [Session Loop] → [Tools: Shell/Edit/Task/MCP]  │
│  [SDK/CLI]↗          ↕ SQLite 持久化                            │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. 架构亮点、折中与技术债总结

### 4.1 Claude Code

**架构优势：**

- **StreamingToolExecutor 是核心壁垒**：边流式接收 API 响应边执行工具，极大降低了首次工具响应延迟。这是其他两者都不具备的独占优化。
- **多层上下文压缩体系**：Autocompact + Reactive Compact 覆盖了从自动触发到紧急压缩的场景，配合熔断器（3 次失败后停止）确保稳定性。
- **Coordinator 模式**提供了一个生产级的多 Agent 编排方案，通过 Scratchpad 实现跨 Agent 知识共享。
- **bun:bundle feature gates** 实现同一代码库的内部/外部构建分离，编译期死代码消除效率极高。
- **完整的 MCP 双向能力**：既能作为 Client 消费外部 MCP Server，又能作为 MCP Server 暴露自身能力。

**架构局限：**

- **强绑定 Anthropic API**：直接使用 `@anthropic-ai/sdk` 的 Beta Messages API，无法原生支持其他 LLM provider。这是最大的架构锁定点。
- **单体架构的可扩展性天花板**：785KB 的 `main.tsx` 文件暗示了功能膨胀问题。虽然 Daemon 模式提供了一定的进程分离，但核心仍是单进程。
- **内存型记忆系统**：持久化依赖文件系统（CLAUDE.md），缺乏结构化查询能力，难以支撑复杂的跨会话记忆检索。
- **无原生 SQLite/数据库层**：所有状态管理依赖内存 + 文件，会话恢复能力有限。

### 4.2 Codex (OpenAI)

**架构优势：**

- **Rust 带来的性能和安全优势**：内存安全、零成本抽象、tokio 异步运行时的高并发吞吐。启动速度和运行时性能远超 TypeScript 方案。
- **SQ/EQ 模式是最优雅的架构解耦**：`Op`/`EventMsg` 枚举定义了清晰的协议边界，TUI、SDK、远程客户端可无差别接入同一引擎。
- **平台原生沙箱是安全标杆**：macOS Seatbelt、Linux Landlock+seccomp（bubblewrap）、Windows Restricted Token 三平台全覆盖，且内核级隔离远比应用层权限检查可靠。
- **Guardian 自动审查系统**提供了工具调用的安全自动化判断，减少用户审批摩擦。
- **ThreadManager 的多 Agent 线程树**支持 `agent_max_threads` 和 `agent_max_depth` 限制，子 Agent 拥有独立的 Codex 实例和 channel，并发原生。
- **100+ crate 的模块化**：每个功能域（sandboxing、MCP、exec policy、hooks）都是独立 crate，可单独测试和复用。

**架构局限：**

- **强绑定 OpenAI Responses API**：虽然支持 SSE + WebSocket 双通道，但 API 协议是 OpenAI 专有的。`/responses`、`/responses/compact`、`/memories/trace_summarize` 都是私有端点。
- **Rust 的开发迭代速度**：相比 TypeScript，Rust 的编译时间更长，社区贡献门槛更高，原型验证速度更慢。
- **复杂的构建系统**：Cargo + pnpm + Bazel + justfile 四套构建工具共存，新开发者入门成本高。
- **Token 估算依赖字节启发式**：在 API 未返回精确 usage 时，使用字节估算可能不准确，影响压缩触发时机。
- **无持久化会话存储**（相对于 OpenCode 的 SQLite）：Session 状态主要在内存中，虽然支持 `resume`/`fork` 但底层持久化能力不如 SQLite 方案灵活。

### 4.3 OpenCode

**架构优势：**

- **Provider 无关是最大战略优势**：通过 Vercel AI SDK 支持 20+ LLM provider，用户零成本切换模型，不被任何单一 vendor 锁定。
- **Effect TS 带来的架构纯粹性**：依赖注入（Layer/Context）、结构化并发（Fork/Race/Par）、类型安全错误处理（Effect.gen）——每个子系统都是独立的 Effect Service，可组合、可测试、可mock。
- **真正的 C/S 架构**：Server 可独立运行，TUI/Web/Desktop/SDK/CLI 五种客户端接入同一后端。`--attach` 支持远程连接，天然适合团队协作场景。
- **SQLite 持久化**：会话、消息、工具调用全部结构化存储，支持跨进程会话恢复和历史查询。这在三者中是唯一的数据库级持久化方案。
- **自研 OpenTUI 框架**（SolidJS for CLI）：30+ 内置主题、插件化 TUI 组件、完整的路由系统，TUI 体验最丰富。
- **最丰富的 Agent 生态**：build/plan/general/explore/compaction/title/summary 七种内建 Agent 角色，每种有独立权限配置。
- **Doom Loop 检测**是简单但有效的安全防护，防止工具调用死循环。

**架构局限：**

- **Effect TS 的学习曲线是最大准入门槛**：Effect 的心智模型（Layer、Context、Service、Stream、Deferred...）对大多数开发者来说非常陌生，社区贡献和招聘难度大。
- **C/S 架构的性能开销**：即使是本地 TUI，数据也要经过 HTTP/WS 序列化往返，相比 Claude Code 的进程内直连和 Codex 的内存 channel，增加了不必要的延迟。
- **Bun 运行时的成熟度风险**：Bun 虽然快，但生态成熟度和长期维护性仍是问号。特别是 SQLite 集成依赖 Bun 内建实现。
- **过度工程化的嫌疑**：monorepo 18 个 packages（包括 app、console、containers、core、desktop、docs、enterprise、extensions、function、identity、opencode、plugin、script、sdk、slack、storybook、ui、web），对于一个终端编码工具来说，分散了核心能力的专注度。
- **Compaction 策略相对简单**：OpenCode 的两层压缩（overflow + 工具裁剪）在极端长对话场景下可能不足，但其 compaction agent 使用结构化模板（Goal/Constraints/Progress/Key Decisions/Next Steps）和增量摘要更新机制，比简单两层复杂得多。

---

## 5. 选型建议：下一代 AI 编码工具应吸取的架构长处

如果要基于这三者的经验构建一个全新的下一代 AI 编码辅助工具，建议：

| 模块 | 吸取来源 | 理由 |
|---|---|---|
| **Agent 循环编排** | **Codex 的 SQ/EQ** | 消息驱动解耦是最佳实践，支持多客户端、多 Agent、远程接入，且协议边界清晰 |
| **流式工具执行** | **Claude Code 的 StreamingToolExecutor** | 边流入边执行的优化显著降低响应延迟，是用户体验的关键差异点 |
| **LLM Provider 抽象** | **OpenCode 的 Vercel AI SDK** | Provider 无关是生存必需——不被单一 vendor 锁定，用户自由切换模型 |
| **上下文压缩** | **Claude Code 的多层体系** | Autocompact + Reactive Compact 渐进式压缩是已确认的最成熟方案（注："五层"命名无法从公开证据验证） |
| **沙箱安全** | **Codex 的平台原生沙箱** | 内核级隔离（Seatbelt/Landlock/seccomp）远比应用层权限可靠 |
| **持久化** | **OpenCode 的 SQLite** | 结构化存储会话/消息/工具调用，支持复杂查询和跨进程恢复 |
| **MCP 集成** | **三者共同支持** | MCP 已成为行业标准，必须一等公民支持 |
| **核心语言** | **Rust (Codex) 或 TypeScript+Bun (OpenCode)** | Rust 适合性能关键路径（沙箱、工具执行引擎）；TypeScript 适合上层编排和 UI |
| **TUI 框架** | **OpenCode 的 OpenTUI** | SolidJS 响应式模型比 Ink 的 React 模型更适合终端 UI 的细粒度更新 |
| **权限系统** | **Claude Code 的分层设置** | policy→managed→user→project→local 的五级配置层次最灵活，适合企业部署 |
| **多 Agent** | **Codex 的 ThreadManager** | 父子线程树 + 独立 channel + 深度/宽度限制，是最完善的多 Agent 编排方案 |

**理想架构蓝图**：以 Rust 编写高性能核心引擎（Agent Loop + Tool Router + Sandbox），通过 SQ/EQ 消息协议暴露接口；上层用 TypeScript + Effect 编排多 Provider LLM 调用和 C/S 服务；SQLite 做结构化持久化；MCP 做工具扩展协议；StreamingToolExecutor 做流式优化；多层压缩管理上下文。
