# AI Coding Agent 提示词构建策略深度分析

> 深入分析 Claude Code、OpenCode、Codex 三大 AI 编码 Agent 的提示词工程架构  
> 覆盖: 系统提示词、消息格式、工具输出处理、上下文预算、U 形注意力、压缩策略、完整管线  
> 生成日期: 2025-05-30

---

## 目录

- [总览与交叉对比](#总览与交叉对比)
  - [项目概览](#项目概览)
  - [上下文预算策略对比](#上下文预算策略对比)
  - [压缩层次对比](#压缩层次对比)
  - [U 形注意力对比](#u-形注意力对比)
  - [系统提示词架构对比](#系统提示词架构对比)
- [Part I: Claude Code](#part-i-claude-code)
  - [I.1 系统提示词构建](#i1-系统提示词构建)
  - [I.2 User/Agent 消息格式](#i2-useragent-消息格式)
  - [I.3 工具输出处理](#i3-工具输出处理)
  - [I.4 预留安全空间 / 上下文预算](#i4-预留安全空间--上下文预算)
  - [I.5 U 形注意力机制的应用](#i5-u-形注意力机制的应用)
  - [I.6 压缩/摘要策略](#i6-压缩摘要策略)
  - [I.7 信息处理管线](#i7-信息处理管线)
  - [I.8 完整提示词构建示例](#i8-完整提示词构建示例)
- [Part II: OpenCode](#part-ii-opencode)
  - [II.1 系统提示词构建](#ii1-系统提示词构建)
  - [II.2 User/Agent 消息格式](#ii2-useragent-消息格式)
  - [II.3 工具输出处理](#ii3-工具输出处理)
  - [II.4 预留安全空间 / 上下文预算](#ii4-预留安全空间--上下文预算)
  - [II.5 U 形注意力机制的应用](#ii5-u-形注意力机制的应用)
  - [II.6 压缩/摘要策略](#ii6-压缩摘要策略)
  - [II.7 信息处理管线](#ii7-信息处理管线)
  - [II.8 完整提示词构建示例](#ii8-完整提示词构建示例)
- [Part III: Codex](#part-iii-codex)
  - [III.1 系统提示词构建](#iii1-系统提示词构建)
  - [III.2 User/Agent 消息格式](#iii2-useragent-消息格式)
  - [III.3 工具输出处理](#iii3-工具输出处理)
  - [III.4 预留安全空间 / 上下文预算](#iii4-预留安全空间--上下文预算)
  - [III.5 U 形注意力机制的应用](#iii5-u-形注意力机制的应用)
  - [III.6 压缩/摘要策略](#iii6-压缩摘要策略)
  - [III.7 信息处理管线](#iii7-信息处理管线)
  - [III.8 完整提示词构建示例](#iii8-完整提示词构建示例)
- [Part IV: /compact 命令深度对比](#part-iv-compact-命令深度对比)
  - [IV.1 命令注册与入口](#iv1-命令注册与入口)
  - [IV.2 执行流程对比](#iv2-执行流程对比)
  - [IV.3 手动 vs 自动压缩](#iv3-手动-vs-自动压缩)
  - [IV.4 摘要提示词原文](#iv4-摘要提示词原文)
  - [IV.5 保留 vs 丢弃策略](#iv5-保留-vs-丢弃策略)
  - [IV.6 压缩后重注入机制](#iv6-压缩后重注入机制)
  - [IV.7 错误处理](#iv7-错误处理)
  - [IV.8 关键常量速查表](#iv8-关键常量速查表)

---

# 总览与交叉对比

## 项目概览

| 项目 | 源码路径 | 语言 | 框架/目标 API |
|---|---|---|---|
| **Claude Code** | `claude-code-src/` | TypeScript | Anthropic Messages API |
| **OpenCode** | `opencode/` | TypeScript | AI SDK (Vercel), Effect-TS — 多 Provider |
| **Codex** | `codex/` (codex-rs) | Rust | OpenAI Responses API |

## 上下文预算策略对比

| 方面 | Claude Code | OpenCode | Codex |
|---|---|---|---|
| 安全缓冲 | 13K tokens (autocompact) + 20K (output) | 20K tokens (COMPACTION_BUFFER) | 上下文窗口的 5% |
| 压缩触发 | 95% 有效上下文 - buffer | `usable = input - reserved` | 上下文窗口的 90% |
| 保留最近内容 | 5 文件 + plan + skills (token 预算) | 25% usable (2K-8K tokens) | 20K tokens 最近用户消息 |
| 工具结果上限 | 50K 字符/结果, 200K/消息 | 50KB / 2000 行/结果 | Per-model TruncationPolicy |

## 压缩层次对比

| 层次 | Claude Code | OpenCode | Codex |
|---|---|---|---|
| 1 | 工具结果磁盘持久化 | 工具输出截断 + 文件回退 | 工具输出中间截断 |
| 2 | Snip compaction (历史移除) | 修剪 (40K 保护, 20K 最低) | 上下文 diff (只重发变更片段) |
| 3 | Microcompact (清除旧工具结果) | 压缩 + tail 保持 | Pre-turn 压缩 |
| 4 | Context collapse | -- | Mid-turn 压缩 |
| 5 | Auto-compact (完整摘要) | -- | Inline/Remote v1/v2 压缩 |
| 6 | Reactive compact (413 恢复) | -- | -- |

## U 形注意力对比

| 方面 | Claude Code | OpenCode | Codex |
|---|---|---|---|
| 开头 | 静态系统提示词 (global cache) | Provider base prompt (缓存稳定 header) | `instructions` 字段中的 base instructions |
| 尾部 | 最近消息 + 恢复的文件/skills | Tail preservation (最后 2 turns, 2K-8K tokens) | 最近用户消息 (20K token 预算) |
| 中间 | 压缩摘要 + 已清除工具输出 | 摘要 + 已修剪工具输出 | 摘要 + 已丢弃 assistant/tool 历史 |
| 独特机制 | Post-compact 附件 (files, MCP, skills) | `filterCompacted()` U 形重排序 | Mid-turn 在最后用户消息前重注入初始上下文 |

## 系统提示词架构对比

| 方面 | Claude Code | OpenCode | Codex |
|---|---|---|---|
| 结构 | `string[]` + 缓存边界标记 | 多层 join 的单个字符串 | API 请求的 `instructions` 字段 |
| 缓存 | 拆分为 `global` 作用域块 | 2-part: header (缓存稳定) + body | 不显式管理 (Responses API) |
| 项目上下文 | CLAUDE.md (层级化, `@include`) | AGENTS.md / CLAUDE.md (首个匹配) | AGENTS.md (向上收集, 有预算) |
| 环境信息 | 内联在系统提示词 | `<env>` 块在系统提示词 | `EnvironmentContext` fragment (user role) |
| 工具描述 | 内联在系统提示词 (function schemas) | AI SDK `tool()` 对象 | Responses API `tools` 数组 |

---

# Part I: Claude Code

> 源码路径: `claude-code-src/` | 语言: TypeScript | 目标 API: Anthropic Messages API

---

## I.1 系统提示词构建

### I.1.1 架构概览

系统提示词在 `src/constants/prompts.ts` 的 `getSystemPrompt()` (line 444) 中构建,返回 `string[]` 数组。使用一个边界标记将系统提示词分为两个区域:

```
SYSTEM_PROMPT_DYNAMIC_BOUNDARY = '__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__'
```

### I.1.2 静态内容 (可全局缓存, `cacheScope: 'global'`)

| Section | 函数 | 内容 |
|---|---|---|
| Intro | `getSimpleIntroSection` (line 175) | 身份声明 ("You are an interactive agent..."), 安全指令, URL 限制 |
| System | `getSimpleSystemSection` (line 186) | Markdown 输出规则, 工具权限模式, `<system-reminder>` 标签说明 |
| Doing Tasks | `getSimpleDoingTasksSection` (line 199) | 软件工程任务指令, 代码风格 (最少注释, 不过度设计) |
| Actions | `getActionsSection` (line 255) | 可逆性和爆炸半径指导, 危险操作确认 |
| Using Tools | `getUsingYourToolsSection` (line 269) | 优先使用专用工具而非 Bash, 并行工具调用 |
| Tone & Style | `getSimpleToneAndStyleSection` (line 430) | 不使用 emoji, 简洁回复, 文件路径引用 |
| Output Efficiency | `getOutputEfficiencySection` (line 403) | 内部/外部版本有差异 |

### I.1.3 动态内容 (每个会话不同, 位于边界标记之后)

- 会话特定指导 (agent tools, skills, verification agent)
- **CLAUDE.md 内容** (见下文注入机制)
- 环境信息 (工作目录, git 状态, 平台, shell, OS, 模型名称, 知识截止日期)
- MCP 服务器指令
- 语言偏好, 输出风格配置
- Function result clearing 指令
- Token budget 指令

### I.1.4 缓存策略

`splitSysPromptPrefix()` (文件 `src/utils/api.ts`, line 321) 将系统提示词拆分为不同缓存作用域的块:

```
Attribution header  → cacheScope: null (不缓存)
CLI prefix          → cacheScope: null
Static content      → cacheScope: 'global' (跨用户共享)
Dynamic content     → cacheScope: null (不全局缓存)
```

`src/constants/systemPromptSections.ts` 实现了记忆化层:
- `systemPromptSection()` — 计算一次, 存储直到 `/clear` 或 `/compact`
- `DANGEROUS_uncachedSystemPromptSection()` — 每轮重算, 破坏 prompt cache

### I.1.5 CLAUDE.md 注入机制

文件加载链 (文件 `src/utils/claudemd.ts`):

```
1. /etc/claude-code/CLAUDE.md          (托管级)
2. ~/.claude/CLAUDE.md                 (用户级)
3. CLAUDE.md, .claude/CLAUDE.md        (项目级, 从 cwd 向上遍历到根)
   .claude/rules/*.md
4. CLAUDE.local.md                     (本地覆盖)
```

支持 `@path` include 指令。

注入位置: 作为第一条用户消息, 包裹在 `<system-reminder>` 标签中 (文件 `src/utils/api.ts`, line 449 的 `prependUserContext()`):

```
<system-reminder>
As you answer the user's questions, you can use the following context:
# claudeMd
{CLAUDE.md content}
# currentDate
Today's date is {date}.
IMPORTANT: this context may or may not be relevant to your tasks.
</system-reminder>
```

---

## I.2 User/Agent 消息格式

### I.2.1 用户消息结构

```typescript
// src/utils/messages.ts, line 460
{
  type: 'user',
  message: { role: 'user', content: string | ContentBlockParam[] },
  isMeta?: boolean,              // 合成的系统消息
  isVisibleInTranscriptOnly?: boolean,
  isCompactSummary?: boolean,
  toolUseResult?: unknown,
  uuid: UUID,
  timestamp: ISO string,
  origin?: MessageOrigin,        // undefined = 人工键盘输入
}
```

ContentBlockParam 可以是: text blocks, tool_result blocks, image blocks, document blocks。

### I.2.2 助手消息结构

```typescript
// src/utils/messages.ts, line 411
{
  type: 'assistant',
  message: {
    role: 'assistant',
    content: BetaContentBlock[],   // text, tool_use, thinking blocks
    stop_reason: string,
    usage: Usage,
    model: string,
    id: UUID,
  },
  uuid: UUID,
  timestamp: ISO string,
}
```

### I.2.3 工具结果消息

工具结果是包含 `tool_result` content block 的 user message, 通过 `tool_use_id` 与助手的 `tool_use` block 关联。严格的配对机制: 每个 `tool_use` 必须有匹配的 `tool_result`。

### I.2.4 API 请求前的消息规范化

`normalizeMessagesForAPI()` (line 1989) 执行 12 步变换:

1. 重排附件 (bubble up 到最近的 tool_result 或 assistant message)
2. 剥离虚拟消息 (仅显示)
3. 剥离不可用工具引用
4. 合并连续用户消息 (Bedrock 要求)
5. 规范化工具输入
6. 过滤孤立的 thinking-only 助手消息
7. 剥离最后助手消息的尾部 thinking
8. 过滤空白助手消息
9. 将 `<system-reminder>` 文本兄弟节点挤压到相邻 tool_result 块中
10. 清理错误工具结果内容 (错误结果中的图片)
11. 追加 `[id:xxx]` 消息 ID 标签
12. 验证图片尺寸

---

## I.3 工具输出处理

### I.3.1 工具结果预算

关键常量 (文件 `src/constants/toolLimits.ts`):

| 常量 | 值 | 含义 |
|---|---|---|
| `DEFAULT_MAX_RESULT_SIZE_CHARS` | 50,000 | 单个工具结果大小上限 |
| `MAX_TOOL_RESULTS_PER_MESSAGE_CHARS` | 200,000 | 每条消息的聚合上限 |

超限结果被持久化到磁盘, 替换为 `<persisted-output>` 标签引用。

### I.3.2 Microcompact

文件 `src/services/compact/microCompact.ts` 针对特定工具结果执行定向压缩:

可压缩工具: `FileRead, Bash, Shell, Grep, Glob, WebSearch, WebFetch, FileEdit, FileWrite`

效果: 将旧工具结果内容替换为 `[Old tool result content cleared]`

### I.3.3 工具使用摘要

每批工具执行后, 异步通过 Haiku 模型生成工具使用摘要 (`generateToolUseSummary()`, `query.ts` line 1469), 作为下一轮迭代的上下文传递。

### I.3.4 Function Result Clearing

系统提示词中指示模型: "When working with tool results, write down any important information you might need later in your response, as the original tool result may be cleared later."

系统保留最近 N 个工具结果, 清除更早的结果。

---

## I.4 预留安全空间 / 上下文预算

### I.4.1 Token 预算分配层次

```
完整上下文窗口
├── MAX_OUTPUT_TOKENS_FOR_SUMMARY = 20,000 (压缩期间输出预留)
│   └── 有效上下文窗口 = 上下文窗口 - 20,000
│       ├── AUTOCOMPACT_BUFFER_TOKENS = 13,000
│       │   └── 自动压缩阈值 = 有效窗口 - 13,000
│       │       ├── WARNING_THRESHOLD_BUFFER = 20,000 → 警告阈值
│       │       └── ERROR_THRESHOLD_BUFFER = 20,000 → 错误阈值
│       └── MANUAL_COMPACT_BUFFER_TOKENS = 3,000
│           └── 阻塞限制 (自动压缩关闭时) = 有效窗口 - 3,000
```

### I.4.2 上下文使用分析

`analyzeContextUsage()` (`src/utils/analyzeContext.ts`, line 918) 分类统计:

| 类别 | 说明 |
|---|---|
| System prompt | 系统提示词本体 |
| System tools | 内置工具描述 |
| MCP tools | MCP 服务器工具描述 |
| Custom agents | 自定义 agent 定义 |
| Memory files | CLAUDE.md 内容 |
| Skills | 技能描述 |
| Messages | 对话历史 |
| Autocompact buffer | 预留的压缩缓冲 |
| Free space | 剩余可用空间 |

---

## I.5 U 形注意力机制的应用

Claude Code 没有显式实现传统的 U 形注意力机制, 但通过以下策略达到类似效果:

### I.5.1 开头保持 (系统提示词)

- 最关键的指令放在最前面
- 静态部分使用 `cacheScope: 'global'` 缓存, 确保始终在开头且始终被关注

### I.5.2 尾部保持 (最近消息)

压缩后保留的上下文:
- 最近访问的文件 (最多 5 个, `POST_COMPACT_MAX_FILES_TO_RESTORE = 5`)
- Plan 文件
- 重新宣布的 MCP 指令、延迟工具、agent 列表
- 已调用的 skill 内容
- `messagesToKeep` 机制保留特定消息范围

### I.5.3 Compact Boundary 作为锚点

`compact_boundary` 系统消息作为摘要历史和最近消息之间的锚点, 摘要消息明确声明: "This session is being continued from a previous conversation that ran out of context."

---

## I.6 压缩/摘要策略

### I.6.1 六层压缩体系

```
Layer 1: Tool Result Budget (toolResultStorage.ts)
  → 大结果持久化到磁盘, 替换为 <persisted-output>

Layer 2: Snip Compaction (feature flag: HISTORY_SNIP)
  → 移除特定消息组

Layer 3: Microcompact (microCompact.ts)
  → 定向清除旧工具结果内容

Layer 4: Context Collapse (feature flag: CONTEXT_COLLAPSE)
  → 投射折叠视图, 90%提交/95%阻塞阈值

Layer 5: Auto-Compact (autoCompact.ts)
  → 超过阈值时触发完整对话摘要
  → 断路器: 连续 3 次失败后停止

Layer 6: Reactive Compact (feature flag: REACTIVE_COMPACT)
  → API 返回 413 (prompt-too-long) 时触发
  → 单次恢复尝试
```

### I.6.2 压缩过程

`compactConversation()` (`src/services/compact/compact.ts`, line 387):

1. 执行 pre-compact hooks
2. 从消息中剥离图片 (替换为 `[image]` 标记)
3. 剥离重新注入的附件
4. 发送到摘要模型, 使用结构化摘要提示词

摘要提示词要求 9 个部分:

```
- Primary Request and Intent
- Key Technical Concepts
- Files and Code Sections (保留代码片段)
- Errors and fixes
- Problem Solving
- All user messages
- Pending Tasks
- Current Work
- Optional Next Step
```

5. 模型先生成 `<analysis>` 草稿 (存储前被剥离), 再生成 `<summary>` 块
6. 创建 post-compact 附件:
   - 最近访问的文件 (最多 5 个, 预算 50K tokens)
   - Plan 文件
   - 已调用的 skills (预算 25K tokens, 每个 skill 上限 5K)
   - MCP 指令增量
   - Agent 列表增量
7. 创建 compact boundary 消息和摘要消息
8. 执行 post-compact hooks

### I.6.3 输出 Token 恢复

输出 token 超限时 (`query.ts` line 1188):
1. 先尝试从默认升级到 64K tokens (一次性)
2. 注入恢复消息: "Output token limit hit. Resume directly -- no apology, no recap..."
3. 最多 3 次恢复尝试 (`MAX_OUTPUT_TOKENS_RECOVERY_LIMIT = 3`)

---

## I.7 信息处理管线

### I.7.1 完整管线流程

```
Step 1: System Prompt Construction
  fetchSystemPromptParts() 并行调用:
  ├── getSystemPrompt()      → 构建系统提示词各节
  ├── getUserContext()        → 加载 CLAUDE.md + 当前日期
  └── getSystemContext()      → 加载 git 状态 + cache breaker

Step 2: QueryEngine Assembly
  QueryEngine.submitMessage():
  ├── 获取系统提示词部件
  ├── 组装最终 systemPrompt 数组
  ├── 处理用户输入 processUserInput()
  └── 构建工具/权限配置上下文

Step 3: Query Loop (每次迭代)
  ├── getMessagesAfterCompactBoundary() → 获取压缩后的消息
  ├── applyToolResultBudget()           → 持久化超大结果到磁盘
  ├── Snip compaction (可选)            → 移除历史消息组
  ├── Microcompact                      → 清除旧工具结果
  ├── Context collapse (可选)           → 投射折叠视图
  ├── appendSystemContext()             → 添加 git 状态到系统提示词
  ├── Auto-compact check                → 必要时触发摘要
  ├── prependUserContext()              → 注入 CLAUDE.md 为第一条用户消息
  ├── callModel()                       → 调用 API
  ├── 处理流式响应                       → 解析助手消息和工具调用
  ├── 执行工具                          → StreamingToolExecutor
  ├── generateToolUseSummary()          → Haiku 摘要 (异步)
  ├── 收集附件                          → Memory, skills, MCP
  └── 构建下一轮状态

Step 4: API 调用细节
  ├── messages: 规范化后的消息 (prepend 了用户上下文)
  ├── systemPrompt: 拆分为不同 cache_control 作用域的块
  ├── thinkingConfig: 自适应或禁用
  ├── tools: 所有可用工具的 API schema
  ├── model: 当前模型 (可能回退)
  └── maxOutputTokensOverride: 可能升级到 64K
```

### I.7.2 关键文件索引

| 文件 | 职责 |
|---|---|
| `src/constants/prompts.ts` | 系统提示词构建, 所有提示词节 |
| `src/constants/systemPromptSections.ts` | 记忆化/易变节管理 |
| `src/context.ts` | Git 状态, CLAUDE.md 加载, 用户/系统上下文 |
| `src/utils/claudemd.ts` | CLAUDE.md 文件发现和加载 |
| `src/utils/queryContext.ts` | 获取系统提示词部件, 构建缓存安全参数 |
| `src/utils/api.ts` | 系统提示词缓存作用域拆分, 用户上下文前置 |
| `src/utils/messages.ts` | 消息创建, 规范化, 合并, API 准备 |
| `src/QueryEngine.ts` | 顶层查询生命周期, 会话状态管理 |
| `src/query.ts` | 主查询循环 (压缩, 工具执行, 恢复) |
| `src/services/compact/autoCompact.ts` | 自动压缩阈值和触发逻辑 |
| `src/services/compact/compact.ts` | 完整对话摘要 (结构化提示词) |
| `src/services/compact/prompt.ts` | 实际的压缩/摘要提示词 |
| `src/services/compact/microCompact.ts` | 定向工具结果清除 |
| `src/utils/toolResultStorage.ts` | 大工具结果磁盘持久化 |
| `src/utils/analyzeContext.ts` | 上下文使用分析和可视化 |

---

## I.8 完整提示词构建示例

以下是一次典型对话中发送给 Anthropic API 的完整请求结构:

### 系统提示词 (system parameter)

```
You are Claude Code, Anthropic's official CLI for Claude.
You are an interactive agent that helps users with software engineering tasks...

# Security
Assist with authorized security testing, defensive security, CTF challenges...
IMPORTANT: You must NEVER generate or guess URLs...

# System
- All text you output outside of tool use is displayed to the user...
- Tools are executed in a user-selected permission mode...

# Doing tasks
- The user will primarily request you to perform software engineering tasks...
- Prefer editing existing files to creating new ones...
- Be careful not to introduce security vulnerabilities...

# Executing actions with care
Carefully consider the reversibility and blast radius of actions...

# Using your tools
- Prefer dedicated tools over Bash when one fits...
- Use TaskCreate to plan and track work...

# Tone and style
- Only use emojis if the user explicitly requests them...
- Your responses should be short and concise...

# Output efficiency
Two or three sentences is usually enough...

__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__

## Session-specific guidance
- If you need the user to run a shell command themselves...

## Memory system
You have a persistent, file-based memory system at ~/.claude/projects/...
[完整的记忆系统指令]

## Auto memory
[detailed memory type definitions and instructions]

# Environment
- Primary working directory: /home/user/my-project
- Is a git repository: true
- Platform: linux
- Shell: zsh
- OS Version: Linux 6.8.0
- You are powered by the model named Claude Opus 4.7...

# MCP Server Instructions
## codegraph
[CodeGraph MCP 服务器使用说明]

## tavily
[Tavily 搜索 MCP 使用说明]
```

### 消息序列 (messages parameter)

```
Messages:
├── [user] <system-reminder>
│     As you answer the user's questions, you can use the following context:
│     # claudeMd
│     @RTK.md
│     ## CodeGraph
│     This project has a CodeGraph MCP server configured...
│     # currentDate
│     Today's date is 2025-05-30.
│     IMPORTANT: this context may or may not be relevant...
│   </system-reminder>
│
├── [user] /goal 使用subagent分析三个项目的策略...
│
├── [assistant] 我将并行分析三个代码库...
│   [tool_use] Agent(prompt="...", subagent_type="general-purpose")
│   [tool_use] Agent(prompt="...", subagent_type="general-purpose")
│   [tool_use] Agent(prompt="...", subagent_type="general-purpose")
│
├── [user] [tool_result for Agent #1]
│     "Claude Code Prompt Construction Strategy: Comprehensive Analysis..."
│     [truncated to 50K chars, full persisted to disk]
│   [tool_result for Agent #2]
│     "OpenCode Prompt Construction Strategy..."
│   [tool_result for Agent #3]
│     "Codex Prompt Construction Strategy..."
│
├── [assistant] All three analyses are complete. Now I'll write the documents.
│   [tool_use] Write(file_path=".../README.md", content="...")
│   [tool_use] Bash(command="mkdir -p ...")
│
├── [user] [tool_result for Write] "File created successfully"
│   [tool_result for Bash] ""
│
└── [assistant] 正在创建三个详细文档...
    [tool_use] Write(file_path=".../claude-code-prompt-strategy.md", content="[完整文档]")
    [tool_use] Write(file_path=".../opencode-prompt-strategy.md", content="[完整文档]")
    [tool_use] Write(file_path=".../codex-prompt-strategy.md", content="[完整文档]")
```

### 请求元数据

```json
{
  "model": "claude-opus-4-7",
  "max_tokens": 16384,
  "thinking": { "type": "adaptive", "budget_tokens": 10000 },
  "stream": true,
  "tools": [
    { "name": "Agent", "description": "Launch a new agent...", "input_schema": {...} },
    { "name": "Read", "description": "Reads a file...", "input_schema": {...} },
    { "name": "Write", "description": "Writes a file...", "input_schema": {...} },
    { "name": "Edit", "description": "Performs exact string replacements...", "input_schema": {...} },
    { "name": "Bash", "description": "Executes a given bash command...", "input_schema": {...} },
    { "name": "codegraph_search", "description": "Search symbols...", "input_schema": {...} },
    { "name": "tavily_search", "description": "Web search...", "input_schema": {...} }
  ]
}
```

### 上下文预算分配示例 (200K context window)

```
200,000 total context window
├── 20,000  reserved for output during compaction
├── 180,000 effective context window
│   ├── ~15,000  system prompt (static sections)
│   ├── ~3,000   system prompt (dynamic sections)
│   ├── ~8,000   tool descriptions (built-in + MCP)
│   ├── ~5,000   CLAUDE.md / memory content
│   ├── 13,000   autocompact buffer (reserved)
│   ├── ~100,000 conversation messages
│   │   ├── ~50,000  tool results (budget-capped)
│   │   ├── ~30,000  user messages + assistant responses
│   │   └── ~20,000  tool use summaries
│   └── ~36,000  free space
```

---

# Part II: OpenCode

> 源码路径: `opencode/` | 语言: TypeScript | 框架: AI SDK (Vercel), Effect-TS | 目标: 多 Provider (Anthropic, OpenAI, Google, Mistral, DeepSeek 等)

---

## II.1 系统提示词构建

### II.1.1 多层组装架构

系统提示词在 `src/session/llm.ts` (lines 103-115) 和 `src/session/prompt.ts` (lines 1568-1574) 中从多个层组装:

```
最终 system = [provider基础提示 | 环境上下文 | 指令文件 | Skills | 用户自定义system]
```

各层通过换行连接为单个字符串, 然后通过插件系统允许变换。

### II.1.2 Layer 1: Provider 特定基础提示词

`src/session/system.ts` 的 `provider()` 函数 (lines 19-33) 根据模型 ID 选择对应的系统提示词文件:

| 模型族 | 提示词文件 | 适用模型 |
|---|---|---|
| Claude | `anthropic.txt` | Claude 系列 |
| GPT-4/o1/o3 | `beast.txt` | GPT-4, o1, o3 |
| Gemini | `gemini.txt` | Gemini |
| 通用 GPT | `gpt.txt` | 通用 GPT |
| Codex | `codex.txt` | GPT Codex |
| Kimi | `kimi.txt` | Kimi |
| Trinity | `trinity.txt` | Trinity |
| 回退 | `default.txt` | 其他 |

每个提示词文件是一份完整的人格定义 (通常 7-10KB)。例如 `anthropic.txt` 以 "You are OpenCode, the best coding agent on the planet" 开头。

Agent 可以用自己的 `prompt` 字段覆盖基础提示词:
- `explore` agent → `prompt/explore.txt`
- `compaction` agent → `prompt/compaction.txt`

### II.1.3 Layer 2: 环境上下文

`SystemPrompt.environment()` (`src/session/system.ts`, lines 48-62):

```
You are powered by the model named {model.api.id}. The exact model ID is {providerID}/{model.api.id}
Here is some useful information about the environment you are running in:
<env>
  Working directory: {ctx.directory}
  Workspace root folder: {ctx.worktree}
  Is directory a git repo: {yes/no}
  Platform: {process.platform}
  Today's date: {date}
</env>
```

### II.1.4 Layer 3: 指令文件

`src/session/instruction.ts` 的 `Instruction.system()` 函数 (lines 13-17, 149-163):

**加载优先级:**
1. **全局**: `~/.config/opencode/AGENTS.md` 或 `~/.claude/CLAUDE.md`
2. **项目级**: 从 CWD 向上搜索到 workspace root, 查找 `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md` (已废弃)。第一个匹配生效 — 不会叠加每个祖先目录的文件
3. **配置定义**: 配置中 `instructions` 条目 (文件路径, glob 模式, 或 HTTP URL)

格式: `Instructions from: {path}\n{content}`

### II.1.5 Layer 4: Skills

`SystemPrompt.skills()` (`src/session/system.ts`, lines 65-77):

```
Skills provide specialized instructions and workflows for specific tasks.
Use the skill tool to load a skill when a task matches its description.
<available_skills>
  <skill>
    <name>{name}</name>
    <description>{description}</description>
    <location>{url}</location>
  </skill>
</available_skills>
```

### II.1.6 Prompt Caching 策略

系统维护 2-part 结构用于 prompt caching (`llm.ts`, lines 124-128):
- 如果插件变换后 header 未改变, 剩余部分重新连接以保持第一个元素 (header) 缓存稳定
- Provider transform 层应用 `cacheControl: "ephemeral"` 到前 2 个系统消息和最后 2 个对话消息

### II.1.7 工具描述组装

`resolveTools()` (`src/session/prompt.ts`, lines 368-546):
- 从 `ToolRegistry` 和 MCP 服务器注册工具
- 每个工具注册为 AI SDK `tool()` 对象 (描述 + JSON schema)
- Schema 通过 `ProviderTransform.schema()` 按 provider 转换

---

## II.2 User/Agent 消息格式

### II.2.1 用户消息创建

`createUserMessage()` (`src/session/prompt.ts`, lines 923-1369):

`PromptInput` 接受:
- `parts`: text, file, agent, subtask 部件数组
- `model`, `agent`, `system`, `format`, `variant`, `tools`

**部件解析:**
- **Text parts**: 原样存储
- **File parts** (`file:` 协议): 使用 Read 工具读取, 结果包装为合成文本: `"Called the Read tool with the following input: {JSON}"`
- **Agent parts**: 转换为提示使用 task 工具的文本: `"Use the above message and context to generate a prompt and call the task tool with subagent: {name}"`
- **Subtask parts**: 作为并行子 agent 执行

每个部件被分类为 `text` (用户输入) 或 `synthetic` (系统生成)。

### II.2.2 助手消息

`src/session/message-v2.ts`, lines 546-586:

```typescript
{
  role: "assistant",
  agent: string,
  modelID: string,
  providerID: string,
  usage: { input, output, reasoning, cache: { read, write } },
  finish: string,        // stop reason
  summary: boolean,      // compaction 消息标记
  parts: [text, reasoning, tool calls, step markers, patches]
}
```

### II.2.3 消息到模型转换

`toModelMessagesEffect()` (`src/session/message-v2.ts`, lines 729-1010):

- **用户消息**: Text parts 直传; file parts 变为文件附件; compaction parts 变为 `"What did we do so far?"`
- **助手消息**: Text, reasoning, step-start, tool parts 映射到 AI SDK 等价物
- **Signed reasoning**: Anthropic 自适应 thinking 签名保持缓存一致性 (lines 869-876)
- **Media 处理**: 不支持 media 的 provider, media 附件提取为独立 user message (lines 978-994)
- **错误恢复**: 末尾的 pending/running tool calls 合成 `"Tool execution was interrupted"` 错误 (lines 947-957)

### II.2.4 多轮消息包装

第一条助手响应后的消息被包装在 `<system-reminder>` 标签中 (`insertReminders()`, lines 231-366)。

---

## II.3 工具输出处理

### II.3.1 截断策略

`src/tool/truncate.ts`:

| 参数 | 默认值 | 说明 |
|---|---|---|
| `MAX_LINES` | 2000 | 最大行数 |
| `MAX_BYTES` | 50KB (51,200) | 最大字节数 |

截断时:
1. 完整输出写入文件 (`{data}/tool-output/`)
2. 返回预览 + 提示: `"The tool call succeeded but the output was truncated. Full output saved to: {file}\nUse the Task tool to have explore agent process this file..."`
3. 截断方向默认为 `"head"` (保留开头)

### II.3.2 压缩时的工具输出

压缩期间工具输出被进一步积极截断 (`src/session/message-v2.ts`, lines 326-330):

```typescript
TOOL_OUTPUT_MAX_CHARS = 2_000  // 压缩时每个工具输出最大 2000 字符
```

已压缩的工具输出替换为 `"[Old tool result content cleared]"`。

### II.3.3 MCP 工具输出

MCP 工具结果通过 `truncate.output()` 截断, 截断标记和输出路径存储在元数据中。

---

## II.4 预留安全空间 / 上下文预算

### II.4.1 Token 预算计算

`src/session/overflow.ts`:

```typescript
function usable(input) {
  const context = input.model.limit.context
  const reserved = input.cfg.compaction?.reserved ?? 
    Math.min(COMPACTION_BUFFER, maxOutputTokens(input.model))
  // COMPACTION_BUFFER = 20,000
  return input.model.limit.input
    ? Math.max(0, input.model.limit.input - reserved)
    : Math.max(0, context - maxOutputTokens(input.model))
}
```

预留空间是 20,000 tokens 和模型最大输出 tokens 的 **最小值**。

### II.4.2 输出 Token 最大值

```typescript
OUTPUT_TOKEN_MAX = Flag.OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX || 32_000
```

### II.4.3 溢出检测

```typescript
function isOverflow(input) {
  if (input.cfg.compaction?.auto === false) return false
  if (input.model.limit.context === 0) return false
  const count = input.tokens.total || input.tokens.input + input.tokens.output + 
    input.tokens.cache.read + input.tokens.cache.write
  return count >= usable(input)
}
```

step-finish 事件后检测到溢出时, 设置 `ctx.needsCompaction = true`。

### II.4.4 上下文预算可视化

```
模型上下文窗口
├── maxOutputTokens (模型最大输出)
│   └── 可用输入 = 上下文窗口 - maxOutputTokens
│       ├── COMPACTION_BUFFER = 20,000 (预留压缩空间)
│       │   └── usable = 可用输入 - 20,000
│       │       ├── 系统提示词
│       │       ├── 工具描述
│       │       ├── 指令文件
│       │       ├── 对话历史
│       │       └── free space
│       └── 压缩安全区 (20K tokens)
└── 模型输出空间
```

---

## II.5 U 形注意力机制的应用

### II.5.1 Tail Preservation 系统

OpenCode 通过 `src/session/compaction.ts` 的 `select()` 函数 (lines 247-296) 实现 U 形注意力:

1. 对话被划分为 "turns" (用户消息 + 跟随的助手消息)
2. 最后 `DEFAULT_TAIL_TURNS = 2` 个 turns 被标识为 "tail"
3. 从最近 turn 向后工作, 估算 token 大小
4. 适合 `preserveRecentBudget` 的 turns 被完整保留
5. 部分适合时, `splitTurn()` (lines 162-185) 找到仍然适合预算的最早消息

```
preserveRecentBudget = max(2000, min(8000, usable * 0.25))
```

### II.5.2 filterCompacted 的 U 形重组

`filterCompacted()` (`src/session/message-v2.ts`, lines 1101-1152) 从数据库重建对话:

```
[compaction user message] → [summary assistant message] → [preserved tail messages] → [latest messages]
```

`CompactionPart` 存储 `tail_start_id` 标记保留 tail 的起始消息。

---

## II.6 压缩/摘要策略

### II.6.1 触发条件

| 触发方式 | 条件 |
|---|---|
| Auto-overflow | step-finish 后 token 超过 usable 预算 |
| Explicit error | 捕获 `ContextOverflowError` |
| Manual | 用户手动触发 |

### II.6.2 压缩流程

`processCompaction()` (`src/session/compaction.ts`, lines 346-578):

1. **选择压缩目标**: `select()` 将消息分为 head (摘要) 和 tail (保留)
2. **准备消息**: head 消息以 `stripMedia: true` 和 `toolOutputMaxChars: 2000` 转换
3. **构建提示词**: 使用 `SUMMARY_TEMPLATE`

### II.6.3 摘要模板

```
## Goal
- [single-sentence task summary]

## Constraints & Preferences
- [user constraints, preferences, specs, or "(none)"]

## Progress
### Done
- [items]
### In Progress
- [items]
### Blocked
- [items]

## Key Decisions
- [items]

## Next Steps
- [items]

## Critical Context
- [items]

## Relevant Files
- [items]
```

规则: 保留每个节, 使用简洁 bullet, 保留精确的文件路径/命令/错误字符串。

### II.6.4 增量摘要

如果有现有摘要, 作为 `<previous-summary>` 传递, 指令为:
"preserve still-true details, remove stale details, merge in new facts"

### II.6.5 工具输出修剪

`prune()` 函数 (`src/session/compaction.ts`, lines 300-344):

| 参数 | 值 | 说明 |
|---|---|---|
| `PRUNE_PROTECT` | 40,000 tokens | 受保护的最近工具输出 |
| `PRUNE_MINIMUM` | 20,000 tokens | 开始修剪的最低可修剪量 |

受保护的工具 (如 `skill`) 永不被修剪。已修剪的输出在未来消息转换中显示为 `"[Old tool result content cleared]"`。

### II.6.6 溢出压缩后的重放

当压缩由溢出触发时, 系统识别导致溢出的前一个用户消息并在压缩后 "重放" 它, 使模型可以在新的摘要上下文中重试。

---

## II.7 信息处理管线

### II.7.1 完整管线流程

```
Step 1: User Input (createUserMessage)
  ├── 解析 agent 和 model
  ├── 处理每个 part (读文件, 解析 agents, 处理 MCP 资源)
  ├── 持久化消息和 parts 到数据库
  └── 发射 v2 事件

Step 2: Loop Entry (runLoop)
  ├── MessageV2.filterCompactedEffect() → U 形重排序
  ├── 找到最后用户消息, 最后助手消息, 挂起任务
  └── 检查助手是否完成 (非 tool-calls)

Step 3: Pre-Processing
  ├── 处理 subtasks → 生成子 agents 并收集结果
  ├── 处理 compaction parts → 触发压缩并可能重放
  ├── 检查溢出 → 创建压缩任务
  ├── 插入提醒 → plan mode, build-switch reminders
  └── 多轮包装 → <system-reminder> 标签

Step 4: System Prompt Assembly
  ├── sys.skills(agent)           → skill 列表
  ├── sys.environment(model)      → <env> 块
  ├── instruction.system()        → 指令文件内容
  └── system = [...env, ...instructions, ...(skills ? [skills] : [])]

Step 5: Tool Resolution (resolveTools)
  ├── 注册 ToolRegistry 和 MCP 工具
  ├── 转换 schemas per provider
  └── 包装工具执行 (权限检查 + 插件 hooks)

Step 6: Message Conversion (toModelMessagesEffect)
  ├── 内部 WithParts[] → AI SDK ModelMessage[]
  ├── 处理 media, 工具输出, reasoning blocks
  └── Provider 特定 quirks

Step 7: Provider Transform
  ├── Unicode surrogate 清理
  ├── Provider 特定规范化 (Anthropic empty content, Bedrock, DeepSeek reasoning...)
  └── Prompt caching markers (前2系统 + 后2对话)

Step 8: LLM Stream
  ├── 最终系统提示词组装
  ├── 插件变换 (experimental.chat.system.transform)
  ├── 合并模型选项: base ← model ← agent ← variant
  └── streamText() 调用

Step 9: Stream Processing
  ├── text deltas → 流式输出
  ├── reasoning → 推理内容
  ├── tool calls/results → 工具执行
  ├── step markers → 步骤标记
  ├── doom loop 检测 (3次连续相同工具调用)
  └── context overflow 检测 → 触发压缩

Step 10: Loop Continuation
  ├── "compact" → 创建压缩任务并继续
  ├── "stop" → 退出循环
  ├── "continue" → 下一轮迭代 (发送工具结果)
  └── 退出后: 修剪旧工具输出, 返回最终助手消息
```

### II.7.2 关键文件索引

| 文件 | 职责 |
|---|---|
| `src/session/prompt.ts` | 主编排器: 用户消息创建, 循环控制, 工具解析 |
| `src/session/system.ts` | 系统提示词 provider 选择 + 环境/skills 注入 |
| `src/session/instruction.ts` | 指令文件发现和加载 (AGENTS.md, CLAUDE.md) |
| `src/session/llm.ts` | LLM streaming: 最终系统组装, provider 选项, streamText 调用 |
| `src/session/processor.ts` | 流事件处理器: text/tool/reasoning/step 处理 |
| `src/session/compaction.ts` | 上下文压缩: 摘要, tail 选择, 修剪 |
| `src/session/overflow.ts` | 上下文预算计算和溢出检测 |
| `src/session/message-v2.ts` | 消息 schema, toModelMessages 转换, filterCompacted 排序 |
| `src/tool/truncate.ts` | 工具输出截断 (文件回退) |
| `src/provider/transform.ts` | Provider 特定消息/schema/选项变换和缓存 |
| `src/agent/agent.ts` | Agent 定义 (build, plan, explore, compaction, title) |
| `src/session/prompt/*.txt` | 模型族特定系统提示词模板 |

---

## II.8 完整提示词构建示例

### 发送给 Anthropic API 的系统提示词 (合并后)

```
You are OpenCode, the best coding agent on the planet.

# Tone and Style
You are direct, professional, and technically precise...
You do not add unnecessary pleasantries or filler language...

# Professional Objectivity
If you believe the user's approach is suboptimal, you say so clearly...

# Task Management
You track tasks using the TodoWrite tool...

# Tool Usage Policy
You use tools proactively when they help accomplish the task...

# Code References
When referencing code, use the format: path/to/file.ts:42...

[... 完整的 anthropic.txt 内容 ...]

You are powered by the model named claude-sonnet-4-20250514.
The exact model ID is anthropic/claude-sonnet-4-20250514
Here is some useful information about the environment you are running in:
<env>
  Working directory: /home/user/my-project
  Workspace root folder: /home/user/my-project
  Is directory a git repo: true
  Platform: linux
  Today's date: 2025-05-30
</env>

Instructions from: /home/user/.claude/CLAUDE.md
[CLAUDE.md content]

Instructions from: /home/user/my-project/AGENTS.md
[AGENTS.md content]

Skills provide specialized instructions and workflows for specific tasks.
<available_skills>
  <skill>
    <name>code-review</name>
    <description>Review the current diff for correctness bugs...</description>
    <location>skill://code-review</location>
  </skill>
</available_skills>
```

### 消息序列示例

```
Messages:
├── [user] Analyze three projects for prompt construction strategies
│
├── [assistant] I'll launch three parallel agents to explore each codebase.
│   [tool_use] Task(prompt="...", subagent="general-purpose")
│   [tool_use] Task(prompt="...", subagent="general-purpose")
│   [tool_use] Task(prompt="...", subagent="general-purpose")
│
├── [user] <system-reminder>
│     [plan mode instructions or build-switch reminder if applicable]
│   </system-reminder>
│   [tool_result] "Claude Code Prompt Construction Strategy..."
│   [tool_result] "OpenCode Prompt Construction Strategy..."
│   [tool_result] "Codex Prompt Construction Strategy..."
│
├── [assistant] Now I'll write the documentation files.
│   [tool_use] Write(file_path=".../README.md", content="...")
│
├── [user] [tool_result] "File created successfully"
│
└── [assistant] Creating the three detailed documents...
    [tool_use] Write(file_path=".../claude-code.md", content="[文档1]")
    [tool_use] Write(file_path=".../opencode.md", content="[文档2]")
    [tool_use] Write(file_path=".../codex.md", content="[文档3]")
```

### 上下文预算分配示例 (200K context window)

```
200,000 total context window
├── 32,000  maxOutputTokens (模型输出空间)
├── 168,000 可用输入
│   ├── 20,000  COMPACTION_BUFFER (压缩预留)
│   ├── 148,000 usable 空间
│   │   ├── ~12,000  系统提示词 (provider base + env + instructions + skills)
│   │   ├── ~6,000   工具描述 (ToolRegistry + MCP)
│   │   ├── ~100,000 对话历史
│   │   │   ├── ~60,000  tool results (截断后)
│   │   │   ├── ~25,000  assistant messages
│   │   │   └── ~15,000  user messages
│   │   └── ~30,000  free space
│   └── 20,000  压缩安全缓冲
└── 32,000  模型输出

压缩后:
  [summary ~3,000 tokens] + [tail ~6,000 tokens] + [后续对话...]
```

---

# Part III: Codex

> 源码路径: `codex/` (codex-rs) | 语言: Rust | 目标 API: OpenAI Responses API | 架构: 分层 crate (protocol, core, tools, utils)

---

## III.1 系统提示词构建

### III.1.1 Base Instructions 解析优先级

系统提示词 (称为 "base instructions") 在 `core/src/session/mod.rs` (lines 534-545) 中按以下优先级解析:

```rust
let base_instructions = config
    .base_instructions                           // 1. 配置覆盖
    .clone()
    .or_else(|| conversation_history             // 2. 会话历史 (恢复线程时)
        .get_base_instructions().map(|s| s.text))
    .unwrap_or_else(|| model_info                // 3. 模型特定指令
        .get_model_instructions(config.personality));
```

### III.1.2 模型指令模板系统

`ModelInfo` 结构体 (`protocol/src/openai_models.rs`, lines 260-367) 包含 `base_instructions` 字段和可选的 `model_messages` 字段。`get_model_instructions()` 方法使用 `{{ personality }}` 占位符模板:

```rust
pub fn get_model_instructions(&self, personality: Option<Personality>) -> String {
    if let Some(model_messages) = &self.model_messages
        && let Some(template) = &model_messages.instructions_template
    {
        let personality_message = model_messages
            .get_personality_message(personality)
            .unwrap_or_default();
        template.replace(PERSONALITY_PLACEHOLDER, personality_message.as_str())
    } else {
        self.base_instructions.clone()
    }
}
```

实际的提示词模板位于 `core/templates/model_instructions/` 目录:

| 模型 | 模板文件 |
|---|---|
| GPT-5.2 Codex | `gpt-5.2-codex_instructions_template.md` |
| 其他模型 | 对应的 `*_instructions_template.md` |

GPT-5.2 模板开头: "You are Codex, a coding agent based on GPT-5. You and the user share the same workspace and collaborate to achieve the user's goals."

### III.1.3 Base Instructions → API 请求

`BaseInstructions` 结构体 (`protocol/src/models.rs`, line 910):

```rust
pub struct BaseInstructions {
    pub text: String,
}
```

在 `build_responses_request()` (`core/src/client.rs`, lines 717-773) 中成为 Responses API 的 `instructions` 字段:

```rust
let request = ResponsesApiRequest {
    model: model_info.slug.clone(),
    instructions: prompt.base_instructions.text.clone(),
    input,
    tools,
    // ...
};
```

### III.1.4 AGENTS.md 注入

`AgentsMdManager` (`core/src/agents_md.rs`):

1. **发现**: 从 CWD 向上遍历到项目根 (通过 `.git` 或 `project_root_markers`), 收集 `AGENTS.md` 和 `AGENTS.override.md`
2. **加载**: 按顺序连接 (项目根到 CWD), 受 `project_doc_max_bytes` 预算限制
3. **组装**: 与 `user_instructions` 组合, 使用分隔符 `--- project-doc ---`

组装后的指令存储在 `turn_context.user_instructions` 中, 作为 user-role 消息注入。

### III.1.5 Context Fragment 系统

所有上下文片段实现 `ContextualUserFragment` trait (`core/src/context/fragment.rs`):

```rust
pub trait ContextualUserFragment {
    fn role() -> &'static str;       // "user" 或 "developer"
    fn markers(&self) -> (&'static str, &'static str);
    fn body(&self) -> String;
    fn type_markers() -> (&'static str, &'static str);
    fn render(&self) -> String;      // markers + body
    fn into(self) -> ResponseItem;   // 转换为消息
}
```

超过 25 种片段类型 (`core/src/context/mod.rs`):

| 片段 | Role | 用途 |
|---|---|---|
| `UserInstructions` | user | AGENTS.md 内容 |
| `EnvironmentContext` | user | cwd, shell, date, timezone, network policy |
| `PermissionsInstructions` | developer | 沙箱模式, 审批策略 |
| `CollaborationModeInstructions` | developer | plan/default 模式 |
| `PersonalitySpecInstructions` | developer | 人格覆盖 |
| `SkillInstructions` | developer | 可用技能 |
| `PluginInstructions` | developer | 可用插件 |
| `AppsInstructions` | developer | 连接器能力 |
| `HookAdditionalContext` | developer | Hook 额外上下文 |
| `GuardianFollowupReviewReminder` | developer | Guardian 子 agent 审查提醒 |
| `RealtimeStartInstructions` | developer | 实时开始指令 |
| `RealtimeEndInstructions` | developer | 实时结束指令 |

### III.1.6 工具描述组装

`ToolRouter` (在 `built_tools()` 中构建, `core/src/session/turn.rs`, lines 991-1078):

- 内置工具 (shell, apply_patch 等)
- MCP 服务器工具
- 动态工具 (per-thread)
- 可发现工具建议 (app connectors)

通过 `create_tools_json_for_responses_api()` 序列化为 Responses API 格式。

---

## III.2 User/Agent 消息格式

### III.2.1 初始上下文构建

`build_initial_context()` (`core/src/session/mod.rs`, lines 2670-2896):

**Developer sections** (role: "developer"):
```
[模型切换指令] (当模型变更时)
[权限指令] (沙箱/审批策略)
[开发者指令] (自定义开发者文本)
[协作模式指令]
[实时指令]
[人格规范]
[Apps 指令] (连接器能力)
[可用 Skills 指令]
[可用 Plugins 指令]
[Context contributor 扩展]
```

**Contextual user sections** (role: "user"):
```
[用户指令] (AGENTS.md 内容)
[环境上下文] (cwd, shell, date, timezone, network, subagents)
```

所有 developer sections 合并为单条 developer 消息, 所有 user sections 合并为单条 user 消息。

### III.2.2 稳态上下文更新 (Diff-Based)

初始 turn 后, `record_context_updates_and_set_reference_context_item()` (line 2929) 使用 **diff 方式**:

- 无 `reference_context_item` → 注入完整初始上下文
- 有 → 只计算和发射 **设置差异项**:
  - 模型切换指令 (如果模型变了)
  - 权限差异 (如果审批/profile 变了)
  - 协作模式差异
  - 实时状态变更
  - 人格变更
  - 环境上下文差异 (如果 cwd/network 变了)

### III.2.3 用户输入格式

用户输入通过 `TurnInput` 进入:
- `UserInput` (来自 UI)
- `ResponseInputItem` (来自 hooks/内部)

转换为 `ResponseItem::Message`, role 为 "user"。

`ResponseItem` 枚举 (`protocol/src/models.rs`, line 752) 是通用消息格式:
- `Message` — 文本消息
- `FunctionCall` — 函数调用
- `FunctionCallOutput` — 函数结果
- `CustomToolCall` / `CustomToolCallOutput` — 自定义工具
- `Reasoning` / `EncryptedReasoning` — 推理内容
- `Compaction` — 压缩消息

### III.2.4 Prompt 结构体

```rust
// core/src/client_common.rs, lines 24-46
pub struct Prompt {
    pub input: Vec<ResponseItem>,           // 对话历史
    pub(crate) tools: Vec<ToolSpec>,        // 可用工具
    pub(crate) parallel_tool_calls: bool,
    pub base_instructions: BaseInstructions, // 系统提示词
    pub personality: Option<Personality>,
    pub output_schema: Option<Value>,       // 结构化输出
    pub output_schema_strict: bool,
}
```

---

## III.3 工具输出处理

### III.3.1 截断策略

使用模型元数据中的 `TruncationPolicy` (`protocol/src/openai_models.rs`, line 292):

```rust
pub truncation_policy: TruncationPolicyConfig,
```

`TruncationPolicyConfig` 指定模式 (Bytes 或 Tokens) 和限制。`ContextManager::process_item()` (lines 377-412) 对所有 `FunctionCallOutput` 和 `CustomToolCallOutput` 应用 1.2x 序列化预算乘数:

```rust
let policy_with_serialization_budget = policy * 1.2;
```

### III.3.2 中间截断策略 (核心特色)

`utils/output-truncation/src/lib.rs` 使用 **中间截断** — 保留开头和结尾, 截断中间:

```rust
pub fn truncate_text(content: &str, policy: TruncationPolicy) -> String {
    match policy {
        TruncationPolicy::Bytes(bytes) => truncate_middle_chars(content, bytes),
        TruncationPolicy::Tokens(tokens) => 
            truncate_middle_with_token_budget(content, tokens).0,
    }
}
```

对于混合内容 (text + images), 遍历 items 使用共享预算, 截断 text items 但保留 images 和 encrypted content。省略的 items 用 `"[omitted N text items ...]"` 摘要。

### III.3.3 Shell 输出上限

Shell 命令输出硬限制 `EXEC_OUTPUT_MAX_BYTES` (`core/src/exec.rs`, line 68):

竞争聚合时:
- stdout: 1/3 预算
- stderr: 2/3 预算

### III.3.4 工具输出格式

工具输出变为 `ResponseItem::FunctionCallOutput` 或 `ResponseItem::CustomToolCallOutput`:

```rust
FunctionCallOutputPayload {
    body: String | ContentItems,  // 文本或混合内容
    success: bool,
}
```

---

## III.4 预留安全空间 / 上下文预算

### III.4.1 有效上下文窗口

`effective_context_window_percent` (默认 95%, `protocol/src/openai_models.rs`, line 257):

```rust
const fn default_effective_context_window_percent() -> i64 { 95 }

pub(crate) fn model_context_window(&self) -> Option<i64> {
    self.model_info.resolved_context_window()
        .map(|cw| cw.saturating_mul(effective_context_window_percent) / 100)
}
```

5% 的上下文窗口预留给系统提示词、工具开销和模型输出。

### III.4.2 Auto-Compact Token 限制

`auto_compact_token_limit()` (`protocol/src/openai_models.rs`, lines 304-338):

```rust
pub fn auto_compact_token_limit(&self) -> Option<i64> {
    let context_limit = self.resolved_context_window()
        .map(|cw| (cw * 9) / 10);  // 90% of context window
    // ...
}
```

**默认触发点: 上下文窗口的 90%**。90%-95% 之间的 5% 作为安全余量。

### III.4.3 两种 Auto-Compact 范围

| 范围 | 说明 |
|---|---|
| `Total` | 计算所有活跃上下文 tokens |
| `BodyAfterPrefix` | 只计算 "prefill prefix" (缓存稳定前缀) 之后的 tokens |

### III.4.4 预算分配可视化

```
模型上下文窗口 (100%)
├── 95% 有效上下文窗口 (effective_context_window_percent)
│   ├── 90% auto-compact 触发点
│   │   ├── Base instructions (系统提示词)
│   │   ├── Context fragments (AGENTS.md, env, permissions)
│   │   ├── 对话历史
│   │   └── 工具描述
│   └── 90%-95% 安全余量 (5%)
└── 5% 预留 (系统开销 + 模型输出)
```

---

## III.5 U 形注意力机制的应用

### III.5.1 工具输出的中间截断

最显式的 U 形注意力机制: 保留工具输出的 **开头** (初始上下文) 和 **结尾** (最终结果, 退出码), 截断中间。

```
[完整工具输出]
├── [保留] 开头: 命令初始输出, 早期结果
├── [截断] 中间: 大量重复/中间数据
└── [保留] 结尾: 最终结果, 退出状态, 错误摘要
```

### III.5.2 压缩后保留最近用户消息

`build_compacted_history_with_limit()` (`core/src/compact.rs`, lines 479-530):

```rust
const COMPACT_USER_MESSAGE_MAX_TOKENS: usize = 20_000;

for message in user_messages.iter().rev() {  // 从最新到最旧
    if remaining == 0 { break; }
    let tokens = approx_token_count(message);
    if tokens <= remaining {
        selected_messages.push(message.clone());
        remaining = remaining.saturating_sub(tokens);
    } else {
        let truncated = truncate_text(message, TruncationPolicy::Tokens(remaining));
        selected_messages.push(truncated);
        break;
    }
}
selected_messages.reverse();
```

### III.5.3 压缩中的初始上下文重注入

Mid-turn 压缩时, `insert_initial_context_before_last_real_user_or_summary()` (`core/src/compact.rs`, lines 419-464) 在最后用户消息前重注入初始上下文:

```
[压缩摘要] → [初始上下文重注入] → [最后用户消息]
```

确保环境、权限和 AGENTS.md 指令在压缩后存活并留在上下文窗口尾部 (模型注意力最强处)。

### III.5.4 Remote Compaction 保留预算

Remote compaction v2 使用 `RETAINED_MESSAGE_TOKEN_BUDGET = 64,000` tokens (`core/src/compact_remote_v2.rs`, line 49)。

---

## III.6 压缩/摘要策略

### III.6.1 触发时机

| 时机 | 函数 | 说明 |
|---|---|---|
| Pre-turn | `run_pre_sampling_compact()` (line 693) | 采样前检查 token 限制 |
| Mid-turn | lines 283-309 | 采样后模型需要 follow-up 但超限 |
| Model downshift | line 693 | 切换到更小上下文窗口的模型 |

### III.6.2 三种压缩实现

| 路径 | 文件 | 说明 |
|---|---|---|
| Inline local | `compact.rs` | 发送到同一模型进行摘要 |
| Remote v1 | `compact_remote.rs` | 使用 `/responses/compact` 端点 |
| Remote v2 | `compact_remote_v2.rs` | 增强的远程压缩 (streaming + retry) |

### III.6.3 摘要提示词

`core/templates/compact/prompt.md`:

> "You are performing a CONTEXT CHECKPOINT COMPACTION. Create a handoff summary for another LLM that will resume the task. Include: Current progress and key decisions made; Important context, constraints, or user preferences; What remains to be done (clear next steps); Any critical data, examples, or references needed to continue. Be concise, structured, and focused on helping the next LLM seamlessly continue the work."

### III.6.4 摘要前缀

`core/templates/compact/summary_prefix.md`:

> "Another language model started to solve this problem and produced a summary of its thinking process. You also have access to the state of the tools that were used by that language model. Use this to build on the work that has already been done and avoid duplicating work."

### III.6.5 保留 vs. 丢弃

**保留:**
- 压缩摘要文本 (作为 user message)
- 最近用户消息 (最多 20,000 tokens, 从最新向旧)
- 初始上下文 (mid-turn 压缩时, 在最后用户消息前重注入)

**丢弃:**
- 所有中间助手消息、工具调用和工具输出
- 超出 token 预算的旧用户消息
- 推理/加密推理内容
- 执行输出和中间工件

### III.6.6 历史版本控制

`ContextManager` 跟踪 `history_version` 计数器 (`context_manager/history.rs`, line 38), 每次历史重写 (压缩, 回滚) 时递增, 使下游消费者可以检测历史变更。

---

## III.7 信息处理管线

### III.7.1 完整管线流程

```
Step 1: Pre-sampling Compaction (run_turn, line 146)
  ├── 检查模型降级 (model downshift)
  ├── 检查 auto-compact token 限制
  └── 必要时运行压缩释放上下文空间

Step 2: Record Context Updates (line 160)
  ├── record_context_updates_and_set_reference_context_item()
  ├── 首次: 注入完整初始上下文
  │   ├── Developer messages (权限, 协作模式, etc.)
  │   └── User messages (AGENTS.md, 环境上下文)
  └── 后续: 只发射 diff items

Step 3: Build Skills and Plugins (line 163)
  ├── 解析用户输入中的显式 skill/plugin 引用
  ├── 构建注入 items
  └── 记录到对话历史

Step 4: Run Hooks and Record Inputs (line 170)
  ├── 执行 pre-input hooks
  └── 记录用户输入到对话历史

Step 5: Build Prompt (run_sampling_request, lines 893-985)
  ├── 克隆历史 → for_prompt() 规范化
  │   ├── 确保 call/output 配对
  │   └── 剥离不支持的图片
  └── 构建 Prompt 结构体:
      ├── input: 规范化的对话历史
      ├── tools: ToolRouter (内置 + MCP + 动态)
      ├── base_instructions: 来自 session config
      └── personality, output_schema

Step 6: Stream to API (try_run_sampling_request, lines 1651-2129)
  ├── 打开 WebSocket 或 HTTP stream
  ├── 处理响应事件:
  │   ├── OutputItemAdded → 跟踪新 items
  │   ├── OutputItemDone → 记录完成的 items, 调度工具调用
  │   ├── OutputTextDelta → 流式文本到 TUI
  │   └── Completed → 更新 token 使用, 发射 token 计数事件
  └── 记录助手输出到历史

Step 7: Handle Tool Calls
  ├── 通过 ToolCallRuntime 并行执行
  ├── 工具输出记录到历史
  └── 如果模型需要 follow-up → 返回 Step 5

Step 8: Mid-turn Compaction Check (lines 257-309)
  ├── 每次采样后检查 token 限制
  ├── 模型需要 follow-up 且超限 → mid-turn 压缩
  │   └── InitialContextInjection::BeforeLastUserMessage
  └── 压缩后返回 Step 5
```

### III.7.2 Token 计数

使用字节启发式 (`approx_token_count()`), 非实际 tokenizer:

```rust
fn estimate_token_count_with_base_instructions() {
    base_instructions_tokens +
    items.iter().map(|item| {
        // 序列化 JSON 大小, 调整图片和加密内容
        approx_token_count(serialize(item))
    }).sum()
}
```

`get_total_token_usage()` 结合:
- 上次 API 报告的 `total_tokens`
- 上次 API 响应后新增 items 的估算 tokens
- 旧 turns 的 reasoning tokens

### III.7.3 WebSocket 增量请求

WebSocket 传输时, 后续请求可发送 **增量 input deltas** 而非完整历史 (`core/src/client.rs`, `get_incremental_items()`, lines 996-1033), 只发送上次响应后新增的 items。

### III.7.4 关键文件索引

| 文件 | 职责 |
|---|---|
| `core/src/session/mod.rs` | 会话管理, base instructions 解析, 上下文构建 |
| `core/src/session/turn.rs` | Turn 执行, pre-sampling compact, 工具路由构建 |
| `core/src/client.rs` | API 请求构建, WebSocket 增量请求 |
| `core/src/client_common.rs` | Prompt 结构体定义 |
| `core/src/context/mod.rs` | Context fragment 类型定义 |
| `core/src/context/fragment.rs` | ContextualUserFragment trait |
| `core/src/context/manager.rs` | 上下文管理器 |
| `core/src/agents_md.rs` | AGENTS.md 发现和加载 |
| `core/src/compact.rs` | 本地内联压缩 |
| `core/src/compact_remote.rs` | Remote compression v1 |
| `core/src/compact_remote_v2.rs` | Remote compression v2 |
| `core/templates/compact/` | 压缩提示词模板 |
| `core/templates/model_instructions/` | 模型指令模板 |
| `protocol/src/openai_models.rs` | 模型元数据, 有效上下文窗口, auto-compact 限制 |
| `protocol/src/models.rs` | ResponseItem 枚举, BaseInstructions |
| `utils/output-truncation/` | 中间截断实现 |
| `tools/src/responses_api.rs` | 工具 Responses API 格式序列化 |

---

## III.8 完整提示词构建示例

### 通过 Responses API 发送的完整请求

#### instructions 字段 (系统提示词)

```
You are Codex, a coding agent based on GPT-5.
You and the user share the same workspace and collaborate to achieve
the user's goals.

{{ personality }}

You have access to tools that let you execute shell commands, apply
patches to files, and manage the user's codebase. Use these tools
proactively when they help accomplish the task.

When you need to run shell commands, prefer non-interactive flags.
Always explain what you're about to do before running a command that
has side effects.

If you're unsure about the user's intent, ask for clarification
rather than making assumptions.

[... 完整模板内容 ...]
```

#### input 数组 (对话历史)

```json
[
  {
    "type": "message",
    "role": "developer",
    "content": [
      {
        "type": "input_text",
        "text": "<model-switch-instructions>The model has been switched to gpt-5.2-codex.</model-switch-instructions>"
      },
      {
        "type": "input_text",
        "text": "<permissions-instructions>Sandbox mode: enabled. Network access: restricted. Approval policy: suggest.</permissions-instructions>"
      },
      {
        "type": "input_text",
        "text": "<collaboration-mode-instructions>You are operating in default mode. Execute tasks directly.</collaboration-mode-instructions>"
      },
      {
        "type": "input_text",
        "text": "<personality-spec>You are helpful, direct, and technically precise.</personality-spec>"
      }
    ]
  },
  {
    "type": "message",
    "role": "user",
    "content": [
      {
        "type": "input_text",
        "text": "<user-instructions>## AGENTS.md\nThis is a TypeScript monorepo using pnpm workspaces.\nAlways run tests before committing.\n\n--- project-doc ---\nFollow the code style in .prettierrc.</user-instructions>"
      },
      {
        "type": "input_text",
        "text": "<environment-context>Working directory: /home/user/my-project\nShell: /bin/bash\nToday's date: 2025-05-30\nTimezone: UTC\nNetwork policy: restricted</environment-context>"
      }
    ]
  },
  {
    "type": "message",
    "role": "user",
    "content": [{ "type": "input_text", "text": "Analyze the prompt construction strategies of three AI coding agents" }]
  },
  {
    "type": "message",
    "role": "assistant",
    "content": [
      { "type": "output_text", "text": "I'll explore three codebases in parallel." },
      { "type": "function_call", "name": "shell", "call_id": "call_001",
        "arguments": "{\"command\": [\"find\", \"src/\", \"-name\", \"*.ts\"]}" }
    ]
  },
  {
    "type": "function_call_output", "call_id": "call_001",
    "output": "src/session/prompt.ts\n[... middle truncated ...]\nTotal: 47 files found"
  },
  {
    "type": "function_call", "name": "shell", "call_id": "call_002",
    "arguments": "{\"command\": [\"head\", \"-100\", \"src/session/prompt.ts\"]}"
  },
  {
    "type": "function_call_output", "call_id": "call_002",
    "output": "import { Effect } from \"effect\"...\n[... output truncated in middle ...]\nreturn sections\n}"
  }
]
```

#### tools 数组

```json
[
  {
    "type": "function",
    "name": "shell",
    "description": "Execute shell commands in a sandboxed environment.",
    "strict": true,
    "parameters": {
      "type": "object",
      "properties": {
        "command": { "type": "array", "items": { "type": "string" }, "description": "Command and arguments" },
        "workdir": { "type": "string", "description": "Working directory" },
        "timeout": { "type": "number", "description": "Timeout in milliseconds" }
      },
      "required": ["command"]
    }
  },
  {
    "type": "function",
    "name": "apply_patch",
    "description": "Apply a unified diff patch to files in the workspace.",
    "strict": true,
    "parameters": {
      "type": "object",
      "properties": { "patch": { "type": "string", "description": "Unified diff format patch" } },
      "required": ["patch"]
    }
  }
]
```

### 上下文预算分配示例 (200K context window)

```
200,000 total context window
├── 5% effective reduction → 190,000 effective context window
│   ├── 90% auto-compact trigger → 180,000
│   │   ├── ~5,000   base instructions (系统提示词)
│   │   ├── ~3,000   context fragments (AGENTS.md, env, permissions)
│   │   ├── ~8,000   tool descriptions
│   │   ├── ~140,000 对话历史
│   │   │   ├── ~80,000  压缩摘要 (压缩后)
│   │   │   ├── ~20,000  最近用户消息 (压缩后保留)
│   │   │   └── ~40,000  最近的工具调用和输出
│   │   └── ~24,000  free space
│   └── 180,000-190,000 安全余量 (10,000 tokens)
└── 190,000-200,000 预留 (系统开销 + 模型输出)

压缩后:
  [summary_prefix] + [压缩摘要] + [初始上下文重注入] + [最近用户消息 20K] + [继续...]
```

---

# Part IV: /compact 命令深度对比

> 三大 Agent 均支持 `/compact` 手动触发上下文压缩, 本节从命令注册、执行流程、摘要提示词、保留策略、错误处理等维度进行逐项对比。

---

## IV.1 命令注册与入口

| 方面 | Claude Code | OpenCode | Codex |
|---|---|---|---|
| **命令名** | `"compact"` | `"session.compact"` | `SlashCommand::Compact` |
| **别名** | 无 | `["summarize"]` | 无 |
| **类型** | `'local'` (执行代码, 不发送模型请求) | 内置 session action | TUI slash command |
| **描述** | "Clear conversation history but keep a summary in context" | "Compact session" | (无描述文本, 直接执行) |
| **自定义参数** | `/compact <instructions>` 支持自由文本 | 不支持自定义参数 | 不支持自定义参数 |
| **禁用方式** | `DISABLE_COMPACT=1` 环境变量 | `compaction.auto: false` 配置 | 无 |
| **快捷键** | 无 | `<leader>c` (Ctrl+X → c) | 无 |
| **SDK/非交互** | 支持 (`supportsNonInteractive: true`) | 通过 HTTP API | 通过 app-server |

**注册文件:**
- Claude Code: `src/commands/compact/index.ts` (line 1-15), 注册于 `src/commands.ts` line 268
- OpenCode: `src/cli/cmd/tui/routes/session/index.tsx` (lines 482-506)
- Codex: `tui/src/slash_command.rs` (line 36), 分发于 `tui/src/chatwidget/slash_dispatch.rs` (lines 188-193)

---

## IV.2 执行流程对比

### Claude Code 执行流程

```
用户输入 /compact [instructions]
  ↓
parseSlashCommand() → commandName="compact", args="[instructions]"
  ↓
command.load() → 动态导入 compact.ts
  ↓
call(args, context):
  ├── getMessagesAfterCompactBoundary() → 只处理上次压缩后的消息
  ├── 如果无自定义指令 → trySessionMemoryCompaction() (优先尝试)
  ├── 如果有自定义指令 → 跳过 session memory
  ├── microcompactMessages() → 先清理旧工具结果
  └── compactConversation(isAutoCompact=false):
      ├── tokenCountWithEstimation() → 计算压缩前 token
      ├── 执行 PreCompact hooks (trigger='manual')
      ├── getCompactPrompt(customInstructions) → 构建摘要提示词
      ├── streamCompactSummary() → 发送到摘要模型 (含 PTL 重试)
      ├── formatCompactSummary() → 剥离 <analysis>, 提取 <summary>
      ├── 并行生成 post-compact 附件:
      │   ├── 最近读取的文件 (最多 5 个, 50K tokens)
      │   ├── Plan 文件
      │   ├── Plan mode 指令
      │   ├── 已调用的 skills (25K tokens)
      │   ├── 延迟工具 delta
      │   ├── Agent 列表 delta
      │   └── MCP 指令 delta
      ├── processSessionStartHooks('compact') → 重新注入 CLAUDE.md
      ├── 创建 compact_boundary 消息 + 摘要消息
      └── 执行 PostCompact hooks
  ↓
结果替换对话历史 (shouldQuery=false, 不再查询模型)
```

### OpenCode 执行流程

```
用户输入 /compact 或按 <leader>c
  ↓
TuiEvent.CommandExecute → command="session.compact"
  ↓
SDK 调用 POST /:sessionID/summarize
  ↓
服务端处理:
  ├── revert.cleanup() → 清理回滚状态
  ├── 加载所有消息
  ├── compact.create(auto=false) → 创建 CompactionPart
  └── prompt.loop() → 进入 agent 循环
  ↓
Agent 循环检测到 compaction part:
  └── compaction.process():
      ├── 获取 "compaction" agent (hidden, 无工具权限)
      ├── select() → 拆分 head(摘要) 和 tail(保留)
      ├── buildPrompt() → 构建摘要提示词
      │   ├── 如果有旧摘要: "Update the anchored summary..."
      │   └── 如果无旧摘要: "Create a new anchored summary..."
      ├── 转换消息 (stripMedia=true, toolOutputMaxChars=2000)
      ├── 发送到 LLM (无工具可用)
      └── 发布 SessionEvent.Compaction.Ended.Sync
  ↓
手动压缩不自动继续 (auto-continue 被 guard 阻止)
```

### Codex 执行流程

```
用户输入 /compact
  ↓
AppCommand::compact() → AppEvent::CodexOp
  ↓
CompactTask::run():
  ├── should_use_remote_compact_task() → 检查 provider 类型
  │
  ├── [OpenAI/Azure] 远程压缩:
  │   ├── [V2 feature flag on] compact_remote_v2::run_remote_compact_task()
  │   │   ├── 追加 CompactionTrigger 到 input
  │   │   ├── 使用常规 stream() API
  │   │   └── 期望 1 个 Compaction 输出项 (加密内容)
  │   └── [V1] compact_remote::run_remote_compact_task()
  │       ├── 调用 /responses/compact 端点
  │       └── 服务端处理摘要
  │
  └── [其他 provider] 本地压缩:
      └── compact::run_compact_task()
          ├── 收集用户消息 (排除旧摘要)
          ├── 发送历史 + 摘要提示词到同一模型
          ├── 提取最后一个助手消息作为摘要
          ├── 加上 SUMMARY_PREFIX 前缀
          ├── 保留最近用户消息 (20K tokens)
          └── 构建替换历史
  ↓
警告: "Long threads and multiple compactions can cause the model to be less accurate."
```

---

## IV.3 手动 vs 自动压缩

| 方面 | Claude Code | OpenCode | Codex |
|---|---|---|---|
| **自动触发条件** | token >= 有效窗口 - 13K buffer | token >= usable (context - maxOutput - 20K) | token >= 90% 上下文窗口 |
| **自动压缩后行为** | `suppressFollowUpQuestions=true`, 模型静默继续 | 注入 "Continue if you have next steps" 消息 | 如果需要 follow-up, 继续采样循环 |
| **手动压缩后行为** | 显示 "Compacted", 模型不自动继续 | 不自动继续 | 显示 "Context compacted" 警告 |
| **自定义指令** | 支持 (`/compact <text>`) | 不支持 | 不支持 (但可通过配置覆盖 prompt 文件) |
| **断路器** | 连续 3 次失败后停止自动压缩 | 无断路器 (但可禁用 auto) | 无断路器 |
| **Session memory 快速路径** | 无自定义指令时优先尝试 | 无 | 无 |
| **重放机制** | 无 | 有 — 溢出时找到触发溢出的用户消息并重放 | 有 — mid-turn 压缩后继续采样 |
| **压缩前清理** | microcompactMessages() 先清理旧工具结果 | 无 (prune 在循环结束后独立运行) | 无独立清理步骤 |

### 自动压缩阈值详情

| 参数 | Claude Code | OpenCode | Codex |
|---|---|---|---|
| **计算公式** | `contextWindow - min(maxOutput, 20K) - 13K` | `context - maxOutput - min(20K, maxOutput)` | `contextWindow * 0.9` |
| **可配置** | `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` (百分比) | `compaction.reserved` (绝对值) | `auto_compact_token_limit` (绝对值) |
| **窗口变量** | `CLAUDE_CODE_AUTO_COMPACT_WINDOW` | `compaction.reserved` | `AutoCompactTokenLimitScope` (Total/BodyAfterPrefix) |
| **200K 窗口示例** | 200K - 20K - 13K = **167K** | 200K - 32K - 20K = **148K** | 200K * 0.9 = **180K** |

---

## IV.4 摘要提示词原文

### Claude Code 摘要提示词

**系统提示:** `'You are a helpful AI assistant tasked with summarizing conversations.'`

**核心提示 (BASE_COMPACT_PROMPT):**

```
CRITICAL: Respond with TEXT ONLY. Do NOT call any tools.
- Do NOT use Read, Bash, Grep, Glob, Edit, Write, or ANY other tool.
- You already have all the context you need in the conversation above.
- Tool calls will be REJECTED and will waste your only turn — you will fail the task.
- Your entire response must be plain text: an <analysis> block followed by a <summary> block.

[... produces summary with 9 sections ...]
1. Primary Request and Intent
2. Key Technical Concepts
3. Files and Code Sections
4. Errors and fixes
5. Problem Solving
6. All user messages
7. Pending Tasks
8. Current Work
9. Optional Next Step

REMINDER: Do NOT call any tools. Respond with plain text only.
```

**输出格式:** `<analysis>` (草稿, 存储前剥离) → `<summary>` (实际摘要)

**自定义指令追加:**
```
Additional Instructions:
<user-provided instructions>
```

**来源:** `src/services/compact/prompt.ts` lines 19-272

### OpenCode 摘要提示词

**系统提示 (compaction.txt):**

```
You are an anchored context summarization assistant for coding sessions.

Summarize only the conversation history you are given. The newest turns
may be kept verbatim outside your summary, so focus on the older context
that still matters for continuing the work.

If the prompt includes a <previous-summary> block, treat it as the current
anchored summary. Update it with the new history by preserving still-true
details, removing stale details, and merging in new facts.

Always follow the exact output structure requested by the user prompt.
Keep every section, preserve exact file paths and identifiers when known,
and prefer terse bullets over paragraphs.

Do not answer the conversation itself. Do not mention that you are
summarizing, compacting, or merging context. Respond in the same language
as the conversation.
```

**用户提示 (SUMMARY_TEMPLATE):**

```
Output exactly the Markdown structure shown inside <template>...
<template>
## Goal
- [single-sentence task summary]
## Constraints & Preferences
## Progress
### Done / In Progress / Blocked
## Key Decisions
## Next Steps
## Critical Context
## Relevant Files
</template>

Rules:
- Keep every section, even when empty.
- Use terse bullets, not prose paragraphs.
- Preserve exact file paths, commands, error strings, and identifiers when known.
- Do not mention the summary process or that context was compacted.
```

**增量摘要:** 有旧摘要时追加 `<previous-summary>` 块, 指令 "preserve still-true details, remove stale details, merge in new facts"

**来源:** `src/agent/prompt/compaction.txt` + `src/session/compaction.ts` lines 43-78

### Codex 摘要提示词

**核心提示 (prompt.md):**

```
You are performing a CONTEXT CHECKPOINT COMPACTION. Create a handoff
summary for another LLM that will resume the task.

Include:
- Current progress and key decisions made
- Important context, constraints, or user preferences
- What remains to be done (clear next steps)
- Any critical data, examples, or references needed to continue

Be concise, structured, and focused on helping the next LLM
seamlessly continue the work.
```

**摘要前缀 (summary_prefix.md):**

```
Another language model started to solve this problem and produced a
summary of its thinking process. You also have access to the state of
the tools that were used by that language model. Use this to build on
the work that has already been done and avoid duplicating work. Here is
the summary produced by the other language model, use the information
in this summary to assist with your own analysis:
```

**可覆盖:** 通过 `compact_prompt` 配置字段或 `experimental_compact_prompt_file`

**来源:** `core/templates/compact/prompt.md` + `core/templates/compact/summary_prefix.md`

### 摘要提示词对比总结

| 方面 | Claude Code | OpenCode | Codex |
|---|---|---|---|
| **结构化程度** | 最高 — 9 个强制节 + analysis 草稿 | 中等 — 7 个 Markdown 节 | 最低 — 4 个 bullet 要点 |
| **输出格式** | `<analysis>` + `<summary>` XML 标签 | 纯 Markdown | 纯文本 |
| **自定义指令** | 支持 | 不支持 (但插件可注入) | 支持 (配置覆盖) |
| **增量摘要** | 无 (每次全量) | 有 (`<previous-summary>` 合并) | 无 (本地); 服务端处理 (远程) |
| **角色定位** | "summarizing conversations" | "anchored context summarization" | "handoff summary for another LLM" |
| **禁止工具调用** | 显式禁止 (3 处强调) | agent 权限 `"*": "deny"` | 不适用 (无工具) |
| **代码片段保留** | 显式要求 "with code snippets" | "preserve exact file paths" | "critical data, examples, or references" |

---

## IV.5 保留 vs 丢弃策略

### 压缩后保留的内容

| 保留项 | Claude Code | OpenCode | Codex (本地) | Codex (远程V2) |
|---|---|---|---|---|
| **摘要文本** | `<summary>` 内容 → user message | assistant message (summary:true) | user message + SUMMARY_PREFIX | 加密 Compaction item |
| **最近用户消息** | 不保留 (全部摘要) | tail 1-2 turns (2K-8K tokens) | 最近 20K tokens 用户消息 | 最近 64K tokens (user/dev/sys) |
| **最近读取的文件** | 最多 5 个, 50K tokens 总计 | 不保留 | 不保留 | 不保留 |
| **Plan 文件** | 重新附加 | 不保留 | 不保留 | 不保留 |
| **Plan mode 指令** | 重新附加 (如在 plan mode) | 不保留 | 不保留 | 不保留 |
| **已调用 Skills** | 最多 25K tokens (每 skill 5K) | 不保留 | 不保留 | 不保留 |
| **工具 schema** | 重新宣布 delta | 不保留 (agent loop 管理) | 不保留 (每次重新构建) | 不保留 |
| **MCP 指令** | 重新宣布 delta | 不保留 | 不保留 | 不保留 |
| **CLAUDE.md** | SessionStart hooks 重注入 | 不保留 (系统提示词包含) | 重注入 (mid-turn) 或下 turn | 服务端管理 |
| **环境上下文** | SessionStart hooks 重注入 | 不保留 (系统提示词包含) | 重注入 (mid-turn) 或下 turn | 服务端管理 |
| **权限指令** | SessionStart hooks 重注入 | 不保留 | 重注入 (mid-turn) 或下 turn | 服务端管理 |

### 被丢弃的内容

| 丢弃项 | Claude Code | OpenCode | Codex |
|---|---|---|---|
| **中间助手消息** | 全部 | 全部 (tail 除外) | 全部 |
| **工具调用和结果** | 全部 | 全部 (tail 除外) | 全部 |
| **图片** | 替换为 `[image]` 标记 | 剥离 (stripMedia=true) | 不支持图片 |
| **旧摘要** | 被新摘要替换 | 被新摘要替换 | 被新摘要替换 |
| **已修剪工具输出** | `[Old tool result content cleared]` | `[Old tool result content cleared]` | 不适用 |

### Tail 保留机制对比

| 方面 | Claude Code | OpenCode | Codex |
|---|---|---|---|
| **策略** | 无 tail — 全量摘要 + post-compact 附件 | tail turns 保留 (U 形) | 最近用户消息保留 (20K) |
| **保留粒度** | 附件 (文件内容, skill 内容) | 完整 turns (用户 + 助手 + 工具) | 仅用户消息 (非助手/工具) |
| **预算** | 文件 50K + skills 25K + plan 无上限 | `min(8K, max(2K, usable*0.25))` | `COMPACT_USER_MESSAGE_MAX_TOKENS = 20K` |
| **选择算法** | 最近优先 (文件按读取时间, skills 按调用时间) | 从最近 turn 向后, 适合即保留 | 从最新消息向旧, 适合即保留 |

---

## IV.6 压缩后重注入机制

### Claude Code: Post-Compact Attachments

压缩成功后, 以下内容作为 "attachments" 重新注入到摘要之后:

1. **SessionStart hooks** (`processSessionStartHooks('compact')`) — 重新加载 CLAUDE.md (所有层级), 清除 `getUserContext` 缓存确保从磁盘重读
2. **最近读取的文件** — 通过 `FileReadTool` 从磁盘重新读取 (排除 CLAUDE.md 和 plan 文件, 它们单独处理)
3. **Plan 文件** — `createPlanAttachmentIfNeeded()` 检查是否有活跃 plan
4. **Skills** — `createSkillAttachmentIfNeeded()` 附加已调用 skill 的内容
5. **工具/Agent/MCP delta** — 对空数组 diff, 即宣布全集 (因为之前的宣布已在丢弃的历史中)

### OpenCode: 无重注入

OpenCode 不重注入 — 系统提示词在每轮都重新组装 (environment + instructions + skills), 所以压缩后下一轮自然包含完整上下文。Tail 保留的 turns 提供了最近上下文的连续性。

### Codex: Initial Context Reinjection

两种模式:
1. **Pre-turn 压缩** (`DoNotInject`): 不注入, `reference_context_item = None`, 下一 turn 的正常流程会检测到并调用 `build_initial_context()` 全量注入
2. **Mid-turn 压缩** (`BeforeLastUserMessage`): 立即调用 `build_initial_context()`, 在最后用户消息前插入 developer + user 上下文片段

---

## IV.7 错误处理

| 错误场景 | Claude Code | OpenCode | Codex |
|---|---|---|---|
| **压缩 API 本身 PTL** | 最多 3 次重试, 每次丢弃最旧 API 轮次 | 无特殊处理 — ContextOverflowError 触发再次压缩 | 上下文超限 → 移除最旧历史项重试 |
| **连续失败** | 断路器: 3 次后停止自动压缩 | 无断路器 | 无断路器 |
| **用户取消** | "Compaction canceled." | 通过 bus 事件传播 | `CodexErr::Interrupted` 立即返回 |
| **消息不足** | "Not enough messages to compact." | parent 验证失败抛异常 | 无特殊检查 |
| **网络中断** | "Compaction interrupted - network issues" | ContextOverflowError + 错误消息 | 指数退避重试 (最多 stream_max_retries) |
| **错误通知** | 手动: 显示通知; 自动: 静默日志 | Toast 通知 | 错误事件 + 日志 |
| **流式重试** | 最多 2 次 (feature-gated) | 无 | 远程V2: 最多 2 次重试 |

### Codex 特有的 Pre/Post Hooks

```rust
// Pre-compact hook 可以阻止压缩
PreCompactHookOutcome::Stopped → CodexErr::TurnAborted

// Post-compact hook 也可以阻止 (仅在成功时)
```

Claude Code 也有类似机制: `PreCompact hooks` 和 `PostCompact hooks` (compact.ts lines 413-419, 714-729)。

---

## IV.8 关键常量速查表

| 常量 | Claude Code | OpenCode | Codex |
|---|---|---|---|
| **自动压缩 buffer** | `AUTOCOMPACT_BUFFER_TOKENS = 13,000` | `COMPACTION_BUFFER = 20,000` | `contextWindow * 9 / 10` (90%) |
| **输出预留** | `MAX_OUTPUT_TOKENS_FOR_SUMMARY = 20,000` | `OUTPUT_TOKEN_MAX = 32,000` | 5% of context window |
| **Tail turns** | N/A (附件机制) | `DEFAULT_TAIL_TURNS = 2` | N/A (用户消息保留) |
| **Tail 预算** | 文件 50K + skills 25K | `min(8K, max(2K, usable*0.25))` | `COMPACT_USER_MESSAGE_MAX_TOKENS = 20,000` |
| **工具输出截断** | 50K chars/result | `TOOL_OUTPUT_MAX_CHARS = 2,000` (压缩时) | Per-model TruncationPolicy |
| **远程保留预算** | N/A | N/A | `RETAINED_MESSAGE_TOKEN_BUDGET = 64,000` |
| **PTL 重试** | `MAX_PTL_RETRIES = 3` | N/A | 本地: stream_max_retries; 远程V2: 2 |
| **流式重试** | `MAX_COMPACT_STREAMING_RETRIES = 2` | N/A | 远程V2: `MAX_REMOTE_COMPACTION_V2_STREAM_RETRIES = 2` |
| **断路器阈值** | `MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3` | 无 | 无 |
| **修剪保护** | N/A | `PRUNE_PROTECT = 40,000` | N/A |
| **修剪最低量** | N/A | `PRUNE_MINIMUM = 20,000` | N/A |
| **每 skill 预算** | `POST_COMPACT_MAX_TOKENS_PER_SKILL = 5,000` | N/A | N/A |
| **Skills 总预算** | `POST_COMPACT_SKILLS_TOKEN_BUDGET = 25,000` | N/A | N/A |
| **手动压缩 buffer** | `MANUAL_COMPACT_BUFFER_TOKENS = 3,000` | N/A | N/A |
