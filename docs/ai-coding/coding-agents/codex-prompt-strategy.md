# Codex Prompt Construction Strategy

> 源码路径: `codex/` (codex-rs)  
> 语言: Rust  
> 目标 API: OpenAI Responses API  
> 架构: 分层 crate (protocol, core, tools, utils)

---

## 1. 系统提示词构建

### 1.1 Base Instructions 解析优先级

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

### 1.2 模型指令模板系统

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

### 1.3 Base Instructions → API 请求

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

### 1.4 AGENTS.md 注入

`AgentsMdManager` (`core/src/agents_md.rs`):

1. **发现**: 从 CWD 向上遍历到项目根 (通过 `.git` 或 `project_root_markers`), 收集 `AGENTS.md` 和 `AGENTS.override.md`
2. **加载**: 按顺序连接 (项目根到 CWD), 受 `project_doc_max_bytes` 预算限制
3. **组装**: 与 `user_instructions` 组合, 使用分隔符 `--- project-doc ---`

组装后的指令存储在 `turn_context.user_instructions` 中, 作为 user-role 消息注入。

### 1.5 Context Fragment 系统

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

### 1.6 工具描述组装

`ToolRouter` (在 `built_tools()` 中构建, `core/src/session/turn.rs`, lines 991-1078):

- 内置工具 (shell, apply_patch 等)
- MCP 服务器工具
- 动态工具 (per-thread)
- 可发现工具建议 (app connectors)

通过 `create_tools_json_for_responses_api()` 序列化为 Responses API 格式。

---

## 2. User/Agent 消息格式

### 2.1 初始上下文构建

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

### 2.2 稳态上下文更新 (Diff-Based)

初始 turn 后, `record_context_updates_and_set_reference_context_item()` (line 2929) 使用 **diff 方式**:

- 无 `reference_context_item` → 注入完整初始上下文
- 有 → 只计算和发射 **设置差异项**:
  - 模型切换指令 (如果模型变了)
  - 权限差异 (如果审批/profile 变了)
  - 协作模式差异
  - 实时状态变更
  - 人格变更
  - 环境上下文差异 (如果 cwd/network 变了)

### 2.3 用户输入格式

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

### 2.4 Prompt 结构体

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

## 3. 工具输出处理

### 3.1 截断策略

使用模型元数据中的 `TruncationPolicy` (`protocol/src/openai_models.rs`, line 292):

```rust
pub truncation_policy: TruncationPolicyConfig,
```

`TruncationPolicyConfig` 指定模式 (Bytes 或 Tokens) 和限制。`ContextManager::process_item()` (lines 377-412) 对所有 `FunctionCallOutput` 和 `CustomToolCallOutput` 应用 1.2x 序列化预算乘数:

```rust
let policy_with_serialization_budget = policy * 1.2;
```

### 3.2 中间截断策略 (核心特色)

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

### 3.3 Shell 输出上限

Shell 命令输出硬限制 `EXEC_OUTPUT_MAX_BYTES` (`core/src/exec.rs`, line 68):

竞争聚合时:
- stdout: 1/3 预算
- stderr: 2/3 预算

### 3.4 工具输出格式

工具输出变为 `ResponseItem::FunctionCallOutput` 或 `ResponseItem::CustomToolCallOutput`:

```rust
FunctionCallOutputPayload {
    body: String | ContentItems,  // 文本或混合内容
    success: bool,
}
```

---

## 4. 预留安全空间 / 上下文预算

### 4.1 有效上下文窗口

`effective_context_window_percent` (默认 95%, `protocol/src/openai_models.rs`, line 257):

```rust
const fn default_effective_context_window_percent() -> i64 { 95 }

pub(crate) fn model_context_window(&self) -> Option<i64> {
    self.model_info.resolved_context_window()
        .map(|cw| cw.saturating_mul(effective_context_window_percent) / 100)
}
```

5% 的上下文窗口预留给系统提示词、工具开销和模型输出。

### 4.2 Auto-Compact Token 限制

`auto_compact_token_limit()` (`protocol/src/openai_models.rs`, lines 304-338):

```rust
pub fn auto_compact_token_limit(&self) -> Option<i64> {
    let context_limit = self.resolved_context_window()
        .map(|cw| (cw * 9) / 10);  // 90% of context window
    // ...
}
```

**默认触发点: 上下文窗口的 90%**。90%-95% 之间的 5% 作为安全余量。

### 4.3 两种 Auto-Compact 范围

| 范围 | 说明 |
|---|---|
| `Total` | 计算所有活跃上下文 tokens |
| `BodyAfterPrefix` | 只计算 "prefill prefix" (缓存稳定前缀) 之后的 tokens |

### 4.4 预算分配可视化

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

## 5. U 形注意力机制的应用

### 5.1 工具输出的中间截断

最显式的 U 形注意力机制: 保留工具输出的 **开头** (初始上下文) 和 **结尾** (最终结果, 退出码), 截断中间。

```
[完整工具输出]
├── [保留] 开头: 命令初始输出, 早期结果
├── [截断] 中间: 大量重复/中间数据
└── [保留] 结尾: 最终结果, 退出状态, 错误摘要
```

### 5.2 压缩后保留最近用户消息

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

### 5.3 压缩中的初始上下文重注入

Mid-turn 压缩时, `insert_initial_context_before_last_real_user_or_summary()` (`core/src/compact.rs`, lines 419-464) 在最后用户消息前重注入初始上下文:

```
[压缩摘要] → [初始上下文重注入] → [最后用户消息]
```

确保环境、权限和 AGENTS.md 指令在压缩后存活并留在上下文窗口尾部 (模型注意力最强处)。

### 5.4 Remote Compaction 保留预算

Remote compaction v2 使用 `RETAINED_MESSAGE_TOKEN_BUDGET = 64,000` tokens (`core/src/compact_remote_v2.rs`, line 49)。

---

## 6. 压缩/摘要策略

### 6.1 触发时机

| 时机 | 函数 | 说明 |
|---|---|---|
| Pre-turn | `run_pre_sampling_compact()` (line 693) | 采样前检查 token 限制 |
| Mid-turn | lines 283-309 | 采样后模型需要 follow-up 但超限 |
| Model downshift | line 693 | 切换到更小上下文窗口的模型 |

### 6.2 三种压缩实现

| 路径 | 文件 | 说明 |
|---|---|---|
| Inline local | `compact.rs` | 发送到同一模型进行摘要 |
| Remote v1 | `compact_remote.rs` | 使用 `/responses/compact` 端点 |
| Remote v2 | `compact_remote_v2.rs` | 增强的远程压缩 (streaming + retry) |

### 6.3 摘要提示词

`core/templates/compact/prompt.md`:

> "You are performing a CONTEXT CHECKPOINT COMPACTION. Create a handoff summary for another LLM that will resume the task. Include: Current progress and key decisions made; Important context, constraints, or user preferences; What remains to be done (clear next steps); Any critical data, examples, or references needed to continue. Be concise, structured, and focused on helping the next LLM seamlessly continue the work."

### 6.4 摘要前缀

`core/templates/compact/summary_prefix.md`:

> "Another language model started to solve this problem and produced a summary of its thinking process. You also have access to the state of the tools that were used by that language model. Use this to build on the work that has already been done and avoid duplicating work."

### 6.5 保留 vs. 丢弃

**保留:**
- 压缩摘要文本 (作为 user message)
- 最近用户消息 (最多 20,000 tokens, 从最新向旧)
- 初始上下文 (mid-turn 压缩时, 在最后用户消息前重注入)

**丢弃:**
- 所有中间助手消息、工具调用和工具输出
- 超出 token 预算的旧用户消息
- 推理/加密推理内容
- 执行输出和中间工件

### 6.6 历史版本控制

`ContextManager` 跟踪 `history_version` 计数器 (`context_manager/history.rs`, line 38), 每次历史重写 (压缩, 回滚) 时递增, 使下游消费者可以检测历史变更。

---

## 7. 信息处理管线

### 7.1 完整管线流程

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

### 7.2 Token 计数

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

### 7.3 WebSocket 增量请求

WebSocket 传输时, 后续请求可发送 **增量 input deltas** 而非完整历史 (`core/src/client.rs`, `get_incremental_items()`, lines 996-1033), 只发送上次响应后新增的 items。

### 7.4 关键文件索引

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

## 8. 完整提示词构建示例

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
        "text": "<model-switch-instructions>The model has been switched to gpt-5.2-codex. Adjust your approach accordingly.</model-switch-instructions>"
      },
      {
        "type": "input_text",
        "text": "<permissions-instructions>Sandbox mode: enabled. Network access: restricted. Approval policy: suggest.</permissions-instructions>"
      },
      {
        "type": "input_text",
        "text": "<collaboration-mode-instructions>You are operating in default mode. Execute tasks directly without creating a plan first.</collaboration-mode-instructions>"
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
    "content": [
      {
        "type": "input_text",
        "text": "Analyze the prompt construction strategies of three AI coding agents"
      }
    ]
  },
  {
    "type": "message",
    "role": "assistant",
    "content": [
      {
        "type": "output_text",
        "text": "I'll explore three codebases in parallel to analyze their prompt strategies."
      },
      {
        "type": "function_call",
        "name": "shell",
        "call_id": "call_001",
        "arguments": "{\"command\": [\"find\", \"src/\", \"-name\", \"*.ts\", \"-type\", \"f\"]}"
      }
    ]
  },
  {
    "type": "function_call_output",
    "call_id": "call_001",
    "output": "src/session/prompt.ts\nsrc/session/system.ts\nsrc/session/llm.ts\nsrc/session/compaction.ts\n[... middle truncated, keeping head and tail ...]\nsrc/utils/truncate.ts\nTotal: 47 files found"
  },
  {
    "type": "function_call",
    "name": "shell",
    "call_id": "call_002",
    "arguments": "{\"command\": [\"head\", \"-100\", \"src/session/prompt.ts\"]}"
  },
  {
    "type": "function_call_output",
    "call_id": "call_002",
    "output": "import { Effect } from \"effect\"...\n// ... system prompt construction code ...\nexport function getSystemPrompt(): string[] {\n  const sections: string[] = []\n  // ... [output truncated in middle] ...\n  return sections\n}"
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
        "command": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Command and arguments to execute"
        },
        "workdir": {
          "type": "string",
          "description": "Working directory for the command"
        },
        "timeout": {
          "type": "number",
          "description": "Timeout in milliseconds"
        }
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
      "properties": {
        "patch": {
          "type": "string",
          "description": "Unified diff format patch"
        }
      },
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
