# OpenCode Prompt Construction Strategy

> 源码路径: `opencode/`  
> 语言: TypeScript  
> 框架: AI SDK (Vercel), Effect-TS  
> 目标: 多 Provider 支持 (Anthropic, OpenAI, Google, Mistral, DeepSeek 等)

---

## 1. 系统提示词构建

### 1.1 多层组装架构

系统提示词在 `src/session/llm.ts` (lines 103-115) 和 `src/session/prompt.ts` (lines 1568-1574) 中从多个层组装:

```
最终 system = [provider基础提示 | 环境上下文 | 指令文件 | Skills | 用户自定义system]
```

各层通过换行连接为单个字符串, 然后通过插件系统允许变换。

### 1.2 Layer 1: Provider 特定基础提示词

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

### 1.3 Layer 2: 环境上下文

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

### 1.4 Layer 3: 指令文件

`src/session/instruction.ts` 的 `Instruction.system()` 函数 (lines 13-17, 149-163):

**加载优先级:**
1. **全局**: `~/.config/opencode/AGENTS.md` 或 `~/.claude/CLAUDE.md`
2. **项目级**: 从 CWD 向上搜索到 workspace root, 查找 `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md` (已废弃)。第一个匹配生效 — 不会叠加每个祖先目录的文件
3. **配置定义**: 配置中 `instructions` 条目 (文件路径, glob 模式, 或 HTTP URL)

格式: `Instructions from: {path}\n{content}`

### 1.5 Layer 4: Skills

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

### 1.6 Prompt Caching 策略

系统维护 2-part 结构用于 prompt caching (`llm.ts`, lines 124-128):
- 如果插件变换后 header 未改变, 剩余部分重新连接以保持第一个元素 (header) 缓存稳定
- Provider transform 层应用 `cacheControl: "ephemeral"` 到前 2 个系统消息和最后 2 个对话消息

### 1.7 工具描述组装

`resolveTools()` (`src/session/prompt.ts`, lines 368-546):
- 从 `ToolRegistry` 和 MCP 服务器注册工具
- 每个工具注册为 AI SDK `tool()` 对象 (描述 + JSON schema)
- Schema 通过 `ProviderTransform.schema()` 按 provider 转换

---

## 2. User/Agent 消息格式

### 2.1 用户消息创建

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

### 2.2 助手消息

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

### 2.3 消息到模型转换

`toModelMessagesEffect()` (`src/session/message-v2.ts`, lines 729-1010):

- **用户消息**: Text parts 直传; file parts 变为文件附件; compaction parts 变为 `"What did we do so far?"`
- **助手消息**: Text, reasoning, step-start, tool parts 映射到 AI SDK 等价物
- **Signed reasoning**: Anthropic 自适应 thinking 签名保持缓存一致性 (lines 869-876)
- **Media 处理**: 不支持 media 的 provider, media 附件提取为独立 user message (lines 978-994)
- **错误恢复**: 末尾的 pending/running tool calls 合成 `"Tool execution was interrupted"` 错误 (lines 947-957)

### 2.4 多轮消息包装

第一条助手响应后的消息被包装在 `<system-reminder>` 标签中 (`insertReminders()`, lines 231-366)。

---

## 3. 工具输出处理

### 3.1 截断策略

`src/tool/truncate.ts`:

| 参数 | 默认值 | 说明 |
|---|---|---|
| `MAX_LINES` | 2000 | 最大行数 |
| `MAX_BYTES` | 50KB (51,200) | 最大字节数 |

截断时:
1. 完整输出写入文件 (`{data}/tool-output/`)
2. 返回预览 + 提示: `"The tool call succeeded but the output was truncated. Full output saved to: {file}\nUse the Task tool to have explore agent process this file..."`
3. 截断方向默认为 `"head"` (保留开头)

### 3.2 压缩时的工具输出

压缩期间工具输出被进一步积极截断 (`src/session/message-v2.ts`, lines 326-330):

```typescript
TOOL_OUTPUT_MAX_CHARS = 2_000  // 压缩时每个工具输出最大 2000 字符
```

已压缩的工具输出替换为 `"[Old tool result content cleared]"`。

### 3.3 MCP 工具输出

MCP 工具结果通过 `truncate.output()` 截断, 截断标记和输出路径存储在元数据中。

---

## 4. 预留安全空间 / 上下文预算

### 4.1 Token 预算计算

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

### 4.2 输出 Token 最大值

```typescript
OUTPUT_TOKEN_MAX = Flag.OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX || 32_000
```

### 4.3 溢出检测

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

### 4.4 上下文预算可视化

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

## 5. U 形注意力机制的应用

### 5.1 Tail Preservation 系统

OpenCode 通过 `src/session/compaction.ts` 的 `select()` 函数 (lines 247-296) 实现 U 形注意力:

1. 对话被划分为 "turns" (用户消息 + 跟随的助手消息)
2. 最后 `DEFAULT_TAIL_TURNS = 2` 个 turns 被标识为 "tail"
3. 从最近 turn 向后工作, 估算 token 大小
4. 适合 `preserveRecentBudget` 的 turns 被完整保留
5. 部分适合时, `splitTurn()` (lines 162-185) 找到仍然适合预算的最早消息

```
preserveRecentBudget = max(2000, min(8000, usable * 0.25))
```

### 5.2 filterCompacted 的 U 形重组

`filterCompacted()` (`src/session/message-v2.ts`, lines 1101-1152) 从数据库重建对话:

```
[compaction user message] → [summary assistant message] → [preserved tail messages] → [latest messages]
```

`CompactionPart` 存储 `tail_start_id` 标记保留 tail 的起始消息。

---

## 6. 压缩/摘要策略

### 6.1 触发条件

| 触发方式 | 条件 |
|---|---|
| Auto-overflow | step-finish 后 token 超过 usable 预算 |
| Explicit error | 捕获 `ContextOverflowError` |
| Manual | 用户手动触发 |

### 6.2 压缩流程

`processCompaction()` (`src/session/compaction.ts`, lines 346-578):

1. **选择压缩目标**: `select()` 将消息分为 head (摘要) 和 tail (保留)
2. **准备消息**: head 消息以 `stripMedia: true` 和 `toolOutputMaxChars: 2000` 转换
3. **构建提示词**: 使用 `SUMMARY_TEMPLATE`

### 6.3 摘要模板

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

### 6.4 增量摘要

如果有现有摘要, 作为 `<previous-summary>` 传递, 指令为:
"preserve still-true details, remove stale details, merge in new facts"

### 6.5 工具输出修剪

`prune()` 函数 (`src/session/compaction.ts`, lines 300-344):

| 参数 | 值 | 说明 |
|---|---|---|
| `PRUNE_PROTECT` | 40,000 tokens | 受保护的最近工具输出 |
| `PRUNE_MINIMUM` | 20,000 tokens | 开始修剪的最低可修剪量 |

受保护的工具 (如 `skill`) 永不被修剪。已修剪的输出在未来消息转换中显示为 `"[Old tool result content cleared]"`。

### 6.6 溢出压缩后的重放

当压缩由溢出触发时, 系统识别导致溢出的前一个用户消息并在压缩后 "重放" 它, 使模型可以在新的摘要上下文中重试。

---

## 7. 信息处理管线

### 7.1 完整管线流程

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

### 7.2 关键文件索引

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

## 8. 完整提示词构建示例

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
