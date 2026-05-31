# Claude Code Prompt Construction Strategy

> 源码路径: `claude-code-src/`  
> 语言: TypeScript  
> 目标 API: Anthropic Messages API

---

## 1. 系统提示词构建

### 1.1 架构概览

系统提示词在 `src/constants/prompts.ts` 的 `getSystemPrompt()` (line 444) 中构建,返回 `string[]` 数组。使用一个边界标记将系统提示词分为两个区域:

```
SYSTEM_PROMPT_DYNAMIC_BOUNDARY = '__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__'
```

### 1.2 静态内容 (可全局缓存, `cacheScope: 'global'`)

| Section | 函数 | 内容 |
|---|---|---|
| Intro | `getSimpleIntroSection` (line 175) | 身份声明 ("You are an interactive agent..."), 安全指令, URL 限制 |
| System | `getSimpleSystemSection` (line 186) | Markdown 输出规则, 工具权限模式, `<system-reminder>` 标签说明 |
| Doing Tasks | `getSimpleDoingTasksSection` (line 199) | 软件工程任务指令, 代码风格 (最少注释, 不过度设计) |
| Actions | `getActionsSection` (line 255) | 可逆性和爆炸半径指导, 危险操作确认 |
| Using Tools | `getUsingYourToolsSection` (line 269) | 优先使用专用工具而非 Bash, 并行工具调用 |
| Tone & Style | `getSimpleToneAndStyleSection` (line 430) | 不使用 emoji, 简洁回复, 文件路径引用 |
| Output Efficiency | `getOutputEfficiencySection` (line 403) | 内部/外部版本有差异 |

### 1.3 动态内容 (每个会话不同, 位于边界标记之后)

- 会话特定指导 (agent tools, skills, verification agent)
- **CLAUDE.md 内容** (见下文注入机制)
- 环境信息 (工作目录, git 状态, 平台, shell, OS, 模型名称, 知识截止日期)
- MCP 服务器指令
- 语言偏好, 输出风格配置
- Function result clearing 指令
- Token budget 指令

### 1.4 缓存策略

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

### 1.5 CLAUDE.md 注入机制

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

## 2. User/Agent 消息格式

### 2.1 用户消息结构

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

### 2.2 助手消息结构

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

### 2.3 工具结果消息

工具结果是包含 `tool_result` content block 的 user message, 通过 `tool_use_id` 与助手的 `tool_use` block 关联。严格的配对机制: 每个 `tool_use` 必须有匹配的 `tool_result`。

### 2.4 API 请求前的消息规范化

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

## 3. 工具输出处理

### 3.1 工具结果预算

关键常量 (文件 `src/constants/toolLimits.ts`):

| 常量 | 值 | 含义 |
|---|---|---|
| `DEFAULT_MAX_RESULT_SIZE_CHARS` | 50,000 | 单个工具结果大小上限 |
| `MAX_TOOL_RESULTS_PER_MESSAGE_CHARS` | 200,000 | 每条消息的聚合上限 |

超限结果被持久化到磁盘, 替换为 `<persisted-output>` 标签引用。

### 3.2 Microcompact

文件 `src/services/compact/microCompact.ts` 针对特定工具结果执行定向压缩:

可压缩工具: `FileRead, Bash, Shell, Grep, Glob, WebSearch, WebFetch, FileEdit, FileWrite`

效果: 将旧工具结果内容替换为 `[Old tool result content cleared]`

### 3.3 工具使用摘要

每批工具执行后, 异步通过 Haiku 模型生成工具使用摘要 (`generateToolUseSummary()`, `query.ts` line 1469), 作为下一轮迭代的上下文传递。

### 3.4 Function Result Clearing

系统提示词中指示模型: "When working with tool results, write down any important information you might need later in your response, as the original tool result may be cleared later."

系统保留最近 N 个工具结果, 清除更早的结果。

---

## 4. 预留安全空间 / 上下文预算

### 4.1 Token 预算分配层次

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

### 4.2 上下文使用分析

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

## 5. U 形注意力机制的应用

Claude Code 没有显式实现传统的 U 形注意力机制, 但通过以下策略达到类似效果:

### 5.1 开头保持 (系统提示词)

- 最关键的指令放在最前面
- 静态部分使用 `cacheScope: 'global'` 缓存, 确保始终在开头且始终被关注

### 5.2 尾部保持 (最近消息)

压缩后保留的上下文:
- 最近访问的文件 (最多 5 个, `POST_COMPACT_MAX_FILES_TO_RESTORE = 5`)
- Plan 文件
- 重新宣布的 MCP 指令、延迟工具、agent 列表
- 已调用的 skill 内容
- `messagesToKeep` 机制保留特定消息范围

### 5.3 Compact Boundary 作为锚点

`compact_boundary` 系统消息作为摘要历史和最近消息之间的锚点, 摘要消息明确声明: "This session is being continued from a previous conversation that ran out of context."

---

## 6. 压缩/摘要策略

### 6.1 六层压缩体系

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

### 6.2 压缩过程

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

### 6.3 输出 Token 恢复

输出 token 超限时 (`query.ts` line 1188):
1. 先尝试从默认升级到 64K tokens (一次性)
2. 注入恢复消息: "Output token limit hit. Resume directly -- no apology, no recap..."
3. 最多 3 次恢复尝试 (`MAX_OUTPUT_TOKENS_RECOVERY_LIMIT = 3`)

---

## 7. 信息处理管线

### 7.1 完整管线流程

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

### 7.2 关键文件索引

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

## 8. 完整提示词构建示例

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
    // ... 更多内置和 MCP 工具
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
