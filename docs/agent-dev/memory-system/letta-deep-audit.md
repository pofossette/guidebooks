# Letta (MemGPT) 深度源码审计报告

> Sub-Agent B (Letta Auditor) 审计成果
> 审计日期：2026-05-21

---

## 1. OS 虚拟内存模型架构

Letta 将 LLM 上下文窗口建模为易失性 "RAM"（上下文内记忆），将持久化后端存储建模为 "Disk"（PostgreSQL/SQLite + 向量扩展）。这一类比通过 `Block`、`Memory`、`Passage`、`AgentState` 的分层系统实现。

### 1a. Memory Block — LLM 的 "RAM"

**Pydantic Schema**：`letta/schemas/block.py`

```python
class BaseBlock:                    # line 13
    value: str        # 文本内容
    limit: int        # 字符上限
    label: str        # 语义名称（如 "human", "persona"）
    read_only: bool   # 是否只读

class Block(BaseBlock):             # line 67
    id: str
    tags: List[str]
    # 描述："A Block represents a reserved section of the LLM's context window."

class FileBlock(Block):             # line 107
    file_id: str
    is_open: bool
    last_accessed_at: datetime

class Human(Block):                 # line 117
    label: str = "human"

class Persona(Block):               # line 124
    label: str = "persona"
```

**ORM 模型**：`letta/orm/block.py:20`

```python
class Block(Base):
    __tablename__ = "block"
    value = Column(Text)                    # line 44: 存储 Block 文本内容
    label = Column(String)                  # line 39: 语义标识
    version_id_col = Column(Integer)        # line 56-61: 乐观锁
    current_history_entry_id = ForeignKey   # line 53-55: 指向 BlockHistory (undo/redo)
```

**BlockHistory**：`letta/orm/block_history.py`

- 存储 Block 的历史快照 (line 12)
- `sequence_number` (line 46)：排序序号
- 本质是 "swap file" / journal 机制——每次编辑都可追踪和回滚

### 1b. Memory — 记忆管理器

**文件**：`letta/schemas/memory.py`

```python
class Memory:                       # line 68
    blocks: List[Block]             # line 77
    file_blocks: List[FileBlock]
    # 描述："Represents the in-context memory (i.e. Core memory) of the agent."

    def compile() -> str            # line 688
    # 将所有 Block 渲染为 XML 格式注入 system prompt
```

**三种渲染模式**：

| 方法 | 行号 | 用途 |
|------|------|------|
| `_render_memory_blocks_standard()` | 143 | 标准 XML：`<memory_blocks><human>...</human></memory_blocks>` |
| `_render_memory_blocks_line_numbered()` | 175 | 带行号（供 Anthropic 模型精确编辑） |
| `_render_memory_blocks_git()` | 205 | Git-backed Agent 的树状结构 |

**便捷类**：
- `BasicBlockMemory` (line 783)：预装 `core_memory_append` 和 `core_memory_replace` 工具
- `ChatMemory` (line 840)：创建默认 `persona` 和 `human` 两个 Block

### 1c. Archival Memory — "磁盘存储"

**Passage Schema**：`letta/schemas/passage.py:35`

```python
class Passage:
    text: str
    embedding: List[float]     # 向量
    embedding_config: dict
    archive_id: str
```

**Passage ORM**：`letta/orm/passage.py`

| 类 | 表名 | 用途 |
|---|---|---|
| `ArchivalPassage` (line 76) | `archival_passages` | 长期记忆，使用 pgvector `Vector(MAX_EMBEDDATION_DIM)` |
| `SourcePassage` (line 48) | `source_passages` | 从上传文件派生的 Passage |

**Archive ORM**：`letta/orm/archive.py:24` — 命名的 Passage 集合，多个 Agent 可通过 `ArchivesAgents` 关联表共享。

### 1d. MemFS — 虚拟文件系统

对于 git-memory-enabled Agent，Block 使用路径式标签（如 `system/human`、`skills/coding/SKILL`）组织成文件系统层级：

- `Memory._render_memory_filesystem()` (`memory.py:351`)：将所有 Block 渲染为树状结构，使用 box-drawing 字符
- `Memory._render_memory_blocks_git()` (`memory.py:205`)：渲染为嵌套 XML 标签（从路径组件派生）

---

## 2. 状态同步机制 (Context ↔ Persistence)

### 2a. 每步开始的内存刷新

在 `LettaAgent._step()` (`letta_agent.py:562`) 中，调用 `_create_llm_request_data_async()` (line 1634)，其调用 `_rebuild_memory_async()` (line 1652)。

`_rebuild_memory_async()` 定义于 `BaseAgent` (`base_agent.py:93`)：

```python
async def _rebuild_memory_async(self, ...):
    # 1. 从 DB 重新加载所有 Block
    await agent_manager.refresh_memory_async(agent_state)
    # refresh_memory_async() (agent_manager.py:1805):
    #   通过 BlockManager 按 ID 获取所有 Block（包括 FileBlock）
    #   更新 agent_state.memory.blocks 和 agent_state.memory.file_blocks

    # 2. 编译 Memory 为字符串
    compiled_memory = agent_state.memory.compile()  # line 134

    # 3. 与当前 system message 对比
    if compiled_memory != current_system_message_text:  # line 142
        # 4. 生成新 system prompt
        new_system_msg = PromptGenerator.get_system_message_from_compiled_memory(...)  # line 157
        # 5. 原地更新 system message
        self.update_system_message(new_system_msg)  # line 174
```

### 2b. 缺页中断 (Page Fault)

当 LLM 返回 `ContextWindowExceededError`：

**处理链**：`letta_agent.py`

```python
# line 1549: _handle_llm_error()
async def _handle_llm_error(self, error, ...):
    if isinstance(error, ContextWindowExceededError):
        await self._rebuild_context_window(...)

# line 1576: _rebuild_context_window()
async def _rebuild_context_window(self, ...):
    if force or (total_tokens > llm_config.context_window):  # line 1589
        # 强制调用 Summarizer
        new_messages, _ = await self.summarizer.summarize(
            force=True, clear=True  # line 1593
        )
    # line 1612: 更新 agent 的 message_ids
    await self.update_message_ids_async(new_in_context_messages)
```

**Summarizer** (`summarizer.py:36`) 支持多种模式：

| 模式 | 来源 | 说明 |
|------|------|------|
| Sliding Window | `summarizer_sliding_window.py` | 保留最近 N 条，压缩旧消息 |
| Summarize All | `summarizer_all.py` | 全量总结 |
| Self-Summarize | `self_summarizer.py` | Agent 自己调用自己的 LLM 总结 |
| Ephemeral Summary | `ephemeral_summary_agent.py:22` | 无状态 Agent 专门做摘要 |

`CompactResult` (`compact.py:33`)：包含 `summary_message`、`compacted_messages`、`summary_text`。

### 2c. 消息持久化

每步结束后，消息通过 `MessageManager.create_many_messages_async()` 持久化。Agent 的 `message_ids` 字段（`agents` 表，`orm/agent.py:71`）跟踪当前在上下文窗口中的消息（类似页表：虚拟地址 → 物理地址）。

---

## 3. 自我修正：Memory Tools

### 3a. 工具定义

所有记忆工具定义在 `letta/functions/function_sets/base.py`：

| 工具 | 行号 | 签名 | 功能 |
|------|------|------|------|
| `core_memory_append` | 246 | `(agent_state, label, content) -> str` | 追加内容到 Block |
| `core_memory_replace` | 263 | `(agent_state, label, old_content, new_content) -> str` | 替换 Block 中的内容 |
| `rethink_memory` | 283 | `(agent_state, new_memory, target_block_label) -> None` | 完全重写 Block |
| `memory_replace` | 311 | `(agent_state, label, old_string, new_string) -> str` | 精确字符串替换 |
| `memory_insert` | 391 | `(agent_state, label, new_string, insert_line) -> str` | 在指定行插入 |
| `memory_apply_patch` | 453 | `(agent_state, label, patch) -> str` | 应用 diff patch |
| `memory_rethink` | 488 | `(agent_state, label, new_memory) -> str` | 完全重写 Block |
| `memory_finish_edits` | 520 | `(agent_state) -> None` | 结束编辑序列 |
| `archival_memory_insert` | 164 | `async (self, content, tags) -> Optional[str]` | 插入长期记忆 |
| `archival_memory_search` | 194 | `async (self, query, tags, top_k, ...) -> Optional[str]` | 向量检索长期记忆 |
| `conversation_search` | 87 | `(self, query, roles, limit, ...) -> Optional[str]` | 搜索对话历史 |
| `memory` | 10 | `(agent_state, command, path, ...) -> Optional[str]` | 统一多命令工具 (V3) |

**工具注册** (`constants.py:115-131`)：

```python
BASE_TOOLS = ["send_message", "conversation_search",
              "archival_memory_insert", "archival_memory_search"]
BASE_MEMORY_TOOLS = ["core_memory_append", "core_memory_replace",
                     "memory", "memory_apply_patch"]
BASE_MEMORY_TOOLS_V2 = ["memory_replace", "memory_insert"]
BASE_MEMORY_TOOLS_V3 = ["memory"]  # Anthropic 模型统一工具
BASE_SLEEPTIME_TOOLS = ["memory_replace", "memory_insert",
                        "memory_rethink", "memory_finish_edits"]
```

### 3b. 工具执行管线

完整代码路径：

```
LLM 返回 tool_call
  → _handle_ai_response()                          # letta_agent.py:1714
  → _execute_tool()                                # letta_agent.py:1922
  → ToolExecutorFactory                            # tool_execution_manager.py:32
    → 映射 ToolType → Executor 类
  → LettaCoreToolExecutor.execute()                # core_tool_executor.py:29
    → function_map 分发到具体方法
```

**Executor 工厂** (`tool_execution_manager.py:32`)：

| ToolType | Executor | 用途 |
|----------|----------|------|
| LETTA_CORE | `LettaCoreToolExecutor` | 记忆相关工具 |
| LETTA_BUILTIN | `LettaBuiltinToolExecutor` | 代码执行、Web 工具 |
| LETTA_FILE | `LettaFileToolExecutor` | 文件操作 |
| SANDBOX | `SandboxToolExecutor` | 自定义工具（沙箱执行） |
| EXTERNAL_MCP | `ExternalMCPToolExecutor` | MCP 工具 |

### 3c. 记忆更新与 System Prompt 刷新

每个 Core Memory 工具遵循相同模式：

```python
# 1. 验证 read_only 标志
if block.read_only:
    raise ValueError(...)

# 2. 内存中更新 Block
agent_state.memory.update_block_value(label, new_value)

# 3. 持久化到 DB
await agent_manager.update_memory_if_changed_async(...)
  # agent_manager.py:1747:
  #   比较新 memory string 与 system message (line 1768)
  #   遍历 blocks，调用 block_manager.update_block_async() (line 1779)
  #   重建 system prompt: rebuild_system_prompt_async() (line 1799)

# 4. 重建 System Prompt
await rebuild_system_prompt_async(...)
  # agent_manager.py:1523
  # 用最新 Block 内容重新生成完整 system message 并更新到 DB
```

### 3d. 统一 `memory` 工具 (V3)

`base.py:10` 定义，`core_tool_executor.py:1014` 执行。面向 Anthropic 模型的多命令接口：

| 命令 | 功能 |
|------|------|
| `memory_create` | 创建新 Block（`block_manager.create_or_update_block_async()` + `agent_manager.attach_block_async()`） |
| `memory_str_replace` | 精确编辑 Block |
| `memory_insert` | 在 Block 中插入内容 |
| `memory_delete` | 从 Agent 分离 Block（`agent_manager.detach_block_async()`） |
| `memory_rename` | 修改 Block 标签 |

### 3e. Sleeptime Agent

当 `enable_sleeptime=True` 时：

- **Chat Agent**：只保留 `send_message`、`conversation_search`、`archival_memory_search`
- **Sleeptime Agent**：独立后台 Agent，拥有 `memory_replace`、`memory_insert`、`memory_rethink`、`memory_finish_edits`

这是一种优雅的关注点分离——主 Agent 专注于对话，记忆整理 offload 到后台。

---

## 4. Agent 生命周期与 Session 管理

### 4a. Agent 创建

`AgentManager.create_agent_async()` (`agent_manager.py:332`)：

1. 验证 `llm_config` 并应用推理设置 (lines 341-367)
2. 创建 Memory Block：`block_manager.batch_create_blocks_async()` (line 383)
   - 默认 Block：`Human(value="")` 和 `Persona(value="")` (`block.py:131`)
3. 解析工具名称/ID (lines 390-427)，包括根据 AgentType 确定的基础工具
4. 持久化 `Agent` ORM 模型
5. 初始化消息序列：`initialize_message_sequence_async()` 或 `package_initial_message_sequence()`
6. 返回 `AgentState`（Pydantic 模型，`schemas/agent.py:67`）

`AgentState` 包含：`id`、`name`、`system`（prompt）、`message_ids`、`memory`、`blocks`、`tools`、`llm_config` 等。

### 4b. Agent 恢复

1. `get_agent_by_id_async()` (`agent_manager.py:1217`)：加载 Agent ORM 模型及指定关系
2. ORM 的 `to_pydantic()` 转换为 `AgentState`
3. `core_memory` 关系 (`orm/agent.py:138`)：加载所有关联 Block
4. `message_ids` (`orm/agent.py:71`)：当前在上下文窗口中的有序消息 ID 列表
5. System prompt 从最新 Block 状态重建

### 4c. Archival Memory vs. Recall Memory

| 类型 | 存储位置 | 访问方式 | 特点 |
|------|----------|----------|------|
| **Recall Memory** | `messages` 表 | `conversation_search` 工具 | 完整对话历史，仅子集在上下文中 |
| **Archival Memory** | `archival_passages` 表 | `archival_memory_search`（向量相似度） | 长期存储，带 embedding |

`message_ids`（类似页表）跟踪哪些消息当前 "in-context"。

### 4d. 对话压缩

`Summarizer` (`summarizer.py:36`)：

- **Static Buffer**：保留固定数量最近消息 (`message_buffer_limit`)，压缩旧消息
- **Partial Eviction**：按百分比 (`partial_evict_summarizer_percentage`) 压缩消息
- **EphemeralSummaryAgent** (`ephemeral_summary_agent.py:22`)：无状态 Agent 调用 LLM 生成摘要，存入 `conversation_summary` Block

---

## 5. 关键实现细节

### 5a. ORM 模型与数据库 Schema

| 表 | ORM 文件 | 用途 |
|---|---|---|
| `agents` | `orm/agent.py` | Agent 状态、配置、`message_ids` |
| `block` | `orm/block.py` | Memory Block（value、label、limit、乐观锁） |
| `block_history` | `orm/block_history.py` | Block 历史快照 (undo/redo) |
| `blocks_agents` | `orm/blocks_agents.py` | Block-Agent 关联表 |
| `archival_passages` | `orm/passage.py` | 长期记忆 Passage (pgvector) |
| `source_passages` | `orm/passage.py` | 文件派生 Passage |
| `archives` | `orm/archive.py` | 命名 Passage 集合 |
| `message` | `orm/message.py` | 所有消息 |

数据库：PostgreSQL + `pgvector` 扩展 (`init.sql:34`: `CREATE EXTENSION IF NOT EXISTS vector`)

### 5b. Agent 循环

主循环在 `LettaAgent` (`letta_agent.py:82`)，`_step()` (line 562)：

```
for i in range(max_steps):
    1. _create_llm_request_data_async()
       a. _rebuild_memory_async()         — 刷新 Block，重建 system prompt
       b. 构建工具定义
       c. 构建 LLM 请求（messages + tools + system prompt）
    2. llm_client.request_async_with_telemetry()  — 调用 LLM
    3. _handle_ai_response()
       a. 解析 tool call
       b. _execute_tool()                 — 通过 ToolExecutionManager 执行
       c. 持久化 assistant + tool 消息
       d. 判断 should_continue (heartbeat)
    4. 检查 max_steps, stop_reason

循环结束后: _rebuild_context_window() — 处理压缩
```

### 5c. API 端点

`letta/server/rest_api/routers/v1/agents.py`：

| 端点 | 行号 | 用途 |
|------|------|------|
| `POST /` | 613 | 创建 Agent |
| `POST /{agent_id}/messages` | 1662 | 发送消息（非流式） |
| `POST /{agent_id}/messages/stream` | 1844 | 发送消息（流式） |
| `POST /{agent_id}/export` | 351 | 导出 Agent 状态 |
| `POST /import` | 464 | 导入 Agent 状态 |
| `POST /{agent_id}/archival-memory` | 1488 | 列出 archival 记忆 |
| `POST /{agent_id}/summarize` | 2430 | 手动触发压缩 |
| `POST /{agent_id}/tools/{tool_name}/run` | 747 | 直接执行工具 |

### 5d. 有趣的设计模式

1. **乐观锁** (`orm/block.py:56-61`)：`version` 列使用 SQLAlchemy 内置机制，防止多 Agent 共享 Block 时的 lost update

2. **行号注入**：使用 Anthropic 模型时，Block 渲染带行号（如 `1-> text content`），工具显式拒绝包含行号的输入（防止误编辑）

3. **Tool Rules Solver**：`ToolRulesSolver` 类根据 `ToolRule` 对象约束每步可用的工具（terminal/continue/requires-approval），创建状态机控制工具访问

4. **Git-backed Memory**：当 `git_enabled=True` 时，路径式标签 Block 渲染为虚拟文件系统，含树状目录结构视图
