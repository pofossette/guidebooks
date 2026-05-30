# ReMe 深度源码审计报告

> Sub-Agent C (ReMe Auditor) 审计成果
> 审计日期：2026-05-21
>
> **2026-05-30 验证更新**：核心架构描述（AgentScope 依赖、ReMeLight/ReMe 双系统、pre_reasoning_hook 四阶段管道、Turn 完整性保证、三级压缩、混合检索 0.7+0.3）已通过 agentscope-ai/ReMe 仓库验证为准确。向量存储后端列表已修正——PostgreSQL+pgvector、Hologres、Zvec、Obvec 在开源仓库中未找到对应实现。类继承链已补充 BaseMemory 等中间层说明。

---

## 1. 核心架构与设计哲学

ReMe 是一个 AI Agent **记忆管理工具箱**（非完整框架），提供两种记忆系统：

1. **ReMeLight**（文件型记忆）— 上下文压缩 + 文件持久化（主推）
2. **ReMe**（向量型记忆）— 结构化语义检索

基于阿里 **AgentScope** 框架构建，使用其 `Msg`、`ReActAgent`、`FormatterBase`、`ChatModelBase` 抽象。ReMe 不替代 AgentScope，而是为其扩展记忆管理能力。ReMe 的工具系统使用自定义 `FileIO` 类而非 AgentScope 的 `Toolkit` 抽象。

### 类继承链

```
Application (base)           — reme/core/application.py
  ├── ReMeLight(Application) — reme/reme_light.py    (文件型)
  └── ReMe(Application)      — reme/reme.py          (向量型)
```

> **注意**：上述继承链为简化表示。实际源码中还有 `BaseMemory` 等中间抽象层，ReMeLight 和 ReMe 并非简单的 Application 子类关系。

版本：`__version__ = "0.3.1.9"` (`reme/__init__.py:9`)

### ReMeLight 目录结构

```
working_dir/
  MEMORY.md                     # 长期持久记忆
  memory/YYYY-MM-DD.md          # 每日日志（Summarizer 写入）
  dialog/YYYY-MM-DD.jsonl       # 原始对话记录（压缩时写入）
  tool_result/<uuid>.txt        # 大 tool 输出（截断后全文保存，带 TTL）
```

---

## 2. ReMeLight 内存管理器 — 详细实现

**文件**：`reme/reme_light.py`

### 公开 API

| 方法 | 行号 | 功能 |
|------|------|------|
| `start()` | 207 | 初始化所有组件，清理过期 tool_result |
| `close()` | 226 | 最终清理和关闭 |
| `compact_tool_result(messages, ...)` | 244 | 截断大 tool 输出，保存全文到文件 |
| `check_context(messages, ...)` | 309 | 检查上下文是否超阈值，分割消息 |
| `compact_memory(messages, ...)` | 360 | 通过 LLM 生成结构化摘要 |
| `summary_memory(messages, ...)` | 436 | 生成详细摘要并通过 ReActAgent + file tools 写入文件 |
| `pre_reasoning_hook(messages, ...)` | 563 | **核心方法**：编排完整的预推理管道 |
| `memory_search(query, ...)` | 730 | 语义搜索 MEMORY.md + memory/*.md |
| `get_in_memory_memory(...)` | 806 | 创建带对话持久化的内存记忆实例 |
| `await_summary_tasks()` | 672 | 等待后台摘要任务完成 |
| `add_async_summary_task(messages, ...)` | 509 | 发射后台异步摘要任务 |
| `calculate_memory_compact_threshold(max_input_length, compact_ratio)` | 174 | 静态方法：`int(max_input_length * compact_ratio * 0.95)` |

---

## 3. ContextChecker 与 Compactor 协同机制

### 3.1 总入口：`pre_reasoning_hook`

**文件**：`reme/reme_light.py:563-670`

在**每次推理前**调用的四阶段管道：

#### Stage 1: Tool Result 压缩 (lines 630-632)

```python
if enable_tool_result_compact and tool_result_compact_keep_n > 0:
    compact_msgs = messages[:-tool_result_compact_keep_n]
    await self.compact_tool_result(compact_msgs)
```

处理 `keep_n` 之外的旧消息。将大 tool_result 截断为 `old_max_bytes`（默认 3KB），全文保存到 `tool_result/<uuid>.txt`。

#### Stage 2: 阈值计算 (lines 624-628)

```python
system_token_count = await msg_handler.count_str_token(system_prompt)
compressed_token_count = await msg_handler.count_str_token(compressed_summary)
memory_compact_threshold = self.calculate_memory_compact_threshold(
    max_input_length, compact_ratio
)
left_compact_threshold = memory_compact_threshold - (
    system_token_count + compressed_token_count
)
```

可用消息空间 = 总阈值 - system prompt tokens - 已有摘要 tokens。

#### Stage 3: 上下文检查与分割 (lines 634-639)

```python
messages_to_compact, messages_to_keep, is_valid = await self.check_context(
    messages=messages,
    memory_compact_threshold=left_compact_threshold,
    memory_compact_reserve=memory_compact_reserve,  # 默认 10000
    as_token_counter=as_token_counter,
)
```

#### Stage 4: 压缩 + 异步总结 (lines 648-668)

如果分割有效：
- **后台任务**：`summary_memory()` → 写入 `memory/YYYY-MM-DD.md`（详细日志）
- **前台同步**：`compact_memory()` → 生成内联结构化摘要
- **原始消息归档**：`mark_messages_compressed()` → 写入 `dialog/YYYY-MM-DD.jsonl`
- 压缩摘要存入 `ReMeInMemoryMemory._compressed_summary`

### 3.2 ContextChecker

**文件**：`reme/memory/file_based/components/context_checker.py:12`

```python
class ContextChecker(BaseOp):
    def execute(self, context):    # line 46
        return AsMsgHandler.context_check(...)
```

**参数**：
- `memory_compact_threshold` (int)：触发压缩的 token 阈值
- `memory_compact_reserve` (int)：为最近消息保留的 token 数（默认 10000）

**返回**：`tuple[list[Msg], list[Msg], bool]` — (待压缩消息, 保留消息, 是否有效)

### 3.3 Compactor

**文件**：`reme/memory/file_based/components/compactor.py:29`

```python
class Compactor(BaseOp):
    def execute(self, context):    # line 49
        # 1. 从 context 获取 messages 和 previous_summary
        # 2. 格式化为字符串（带 token 感知截断）
        formatted = AsMsgHandler.format_msgs_to_str(messages, ...)
        # 3. 创建 ReActAgent "reme_compactor" (line 74)
        agent = ReActAgent(name="reme_compactor", ...)
        # 4. 发送对话 + prompt
        # 5. 验证: _is_valid_summary() (line 13)
        #    检查非空且包含 "##" 标题
```

**Prompt 模板** (`compactor.yaml`)：

- `system_prompt`："You are a context compaction assistant..."
- `initial_user_message`：生成结构化摘要，包含：
  - **Goal** — 当前目标
  - **Constraints & Preferences** — 约束与偏好
  - **Progress** (Done / In Progress / Blocked) — 进度
  - **Key Decisions** — 关键决策
  - **Next Steps** — 下一步
  - **Critical Context** — 关键上下文
- `update_user_message`：增量更新已有摘要，保留已有信息并添加新进展

---

## 4. 压缩时的 Turn 完整性保证（核心机制）

这是整个审计最关键的发现。

### 4.1 算法：反向迭代 + 依赖追踪

**文件**：`reme/memory/file_based/utils/as_msg_handler.py:273-398`

`context_check()` 方法实现完整性保护：

#### Step 1: 计算总 token 使用 (lines 299-308)

```python
msg_stats: list[tuple[Msg, AsMsgStat]] = []
total_tokens = 0
for msg in messages:
    stat = await self.stat_message(msg)
    msg_stats.append((msg, stat))
    total_tokens += stat.total_tokens

if total_tokens < memory_compact_threshold:
    return [], messages, True  # 无需分割
```

#### Step 2: 构建 tool_use / tool_result 依赖映射 (lines 312-325)

```python
tool_use_locations: dict[str, int] = {}      # tool_id → message_index
tool_result_locations: dict[str, int] = {}    # tool_id → message_index

for idx, (msg, _) in enumerate(msg_stats):
    for block in msg.get_content_blocks("tool_use"):
        tool_id = block.get("id", "")
        if tool_id:
            tool_use_locations[tool_id] = idx

    for block in msg.get_content_blocks("tool_result"):
        tool_id = block.get("id", "")
        if tool_id:
            tool_result_locations[tool_id] = idx
```

#### Step 3: 反向迭代（核心）(lines 328-375)

```python
keep_indices: set[int] = set()
accumulated_tokens = 0

for i in range(len(msg_stats) - 1, -1, -1):   # 从最新消息往回走
    if i in keep_indices:
        continue

    msg, stat = msg_stats[i]

    # 检查是否超出保留预算
    if accumulated_tokens + stat.total_tokens > memory_compact_reserve:
        break

    # 关键：检查此消息中的 tool_result 的依赖
    tool_result_ids = [
        block.get("id", "") for block in msg.get_content_blocks("tool_result")
        if block.get("id", "")
    ]

    # 计算依赖 tool_use 消息的额外 token
    extra_tokens = 0
    dependent_indices: set[int] = set()

    for tool_id in tool_result_ids:
        if tool_id in tool_use_locations:
            tool_use_idx = tool_use_locations[tool_id]
            if tool_use_idx not in keep_indices and tool_use_idx != i:
                dependent_indices.add(tool_use_idx)
                _, dep_stat = msg_stats[tool_use_idx]
                extra_tokens += dep_stat.total_tokens

    # 如果连依赖一起放不下，就停止
    if accumulated_tokens + stat.total_tokens + extra_tokens > memory_compact_reserve:
        break

    # 保留此消息 AND 所有 tool_use 依赖
    keep_indices.add(i)
    keep_indices.update(dependent_indices)
    accumulated_tokens += stat.total_tokens + extra_tokens
```

**完整性保证原理**：

1. **User-Assistant Turn 对**：算法从最近消息反向迭代。如果保留了 tool_result 消息，系统会查找对应的 tool_use 块（可能在不同消息中），将其作为依赖一并拉入。这保证了完整工具调用链（assistant 请求工具 → 工具返回结果）被作为单元保留。

2. **tool_use / tool_result 配对**：`tool_use_locations` 和 `tool_result_locations` 映射跟踪每个块在哪个消息中。每个 tool_result 块有唯一 `id` 对应其 tool_use 块。算法按块处理，多个跨轮次的工具调用都能正确配对。

3. **Token 预算核算**：依赖消息的 token 也计入预算，确保不超出保留空间。

#### Step 4: 验证 (lines 388, 250-271)

```python
tools_aligned = self.validate_tool_ids_alignment(messages_to_keep)

@staticmethod
def validate_tool_ids_alignment(messages: list[Msg]) -> bool:
    tool_use_ids: set[str] = set()
    tool_result_ids: set[str] = set()

    for msg in messages:
        for block in msg.get_content_blocks("tool_use"):
            if tool_id := block.get("id"):
                tool_use_ids.add(tool_id)
        for block in msg.get_content_blocks("tool_result"):
            if tool_id := block.get("id"):
                tool_result_ids.add(tool_id)

    return tool_use_ids == tool_result_ids
```

**安全兜底**：如果 `tools_aligned` 为 False（保留集中 tool_use 和 tool_result ID 不完全匹配），则 `is_valid = False`，`pre_reasoning_hook` 直接返回——**跳过压缩**而非破坏上下文。

### 4.2 三重安全机制总结

| 层级 | 机制 | 作用 |
|------|------|------|
| 1. 依赖追踪 | 保留 tool_result 时自动拉入 tool_use | 保证工具调用链完整 |
| 2. Token 预算 | 依赖消息 token 也计入预算 | 防止保留过多导致溢出 |
| 3. 完整性验证 | `validate_tool_ids_alignment()` | 最终安全网，不对齐则放弃压缩 |

---

## 5. 三级压缩策略

| 策略 | 实现 | 损失程度 | 说明 |
|------|------|----------|------|
| **Tool Result 截断** | `ToolResultCompactor` (`components/tool_result_compactor.py`) | **无损** | 字节级截断，全文存盘，Agent 可按需读取文件 |
| **LLM 结构化摘要** | `Compactor` | **有损** | 细节丢失，关键信息保留（Goal/Progress/Decisions） |
| **原始对话归档** | `ReMeInMemoryMemory.mark_messages_compressed()` (`reme_in_memory_memory.py:179`) | **无损归档** | 完整原文可回溯 |

### Tool Result 两阶段截断

**文件**：`reme/memory/file_based/utils/file_utils.py`

`truncate_text_output()` (line 149)：

- **Phase 1** (`_fresh_truncate`, line 29)：首次截断。在字节边界切分，保留最后完整行，追加 `<<<TRUNCATED>>>` 标记和文件路径
- **Phase 2** (`_retruncate`, line 94)：再次截断已截断内容。提取原文，应用新字节限制

`TRUNCATION_NOTICE_MARKER = "<<<TRUNCATED>>>"` (line 26)

**ToolResultCompactor** (`components/tool_result_compactor.py`)：
- 区分 "recent" vs "old" tool results：尾部连续 tool_result 消息视为 "recent"
- Recent 结果：`recent_max_bytes`（默认 100KB）
- Old 结果：`old_max_bytes`（默认 3KB）
- 特殊处理：`read_file` 结果对 `.md` 文件始终使用 `recent_max_bytes` (lines 94-113)
- 过期文件清理：基于 `retention_days`（默认 3 天）

---

## 6. 记忆持久化与检索

### 6.1 持久化

#### 对话归档 (`ReMeInMemoryMemory`)

**文件**：`reme/memory/file_based/reme_in_memory_memory.py`

- `mark_messages_compressed()` (line 179)：将消息持久化到 `dialog/YYYY-MM-DD.jsonl`，然后从内存中移除
- `clear_content()` (line 211)：清空前持久化所有消息
- `get_memory()` (line 112)：返回未压缩消息，将压缩摘要作为合成 user 消息前置：

```
# Summary of previous conversation
Previous conversation logs are offloaded to dialog/YYYY-MM-DD.jsonl...
{compressed_summary}
The above is a summary of previous conversation, use it as context to maintain continuity.
```

#### 长期记忆持久化 (`Summarizer`)

**文件**：`reme/memory/file_based/components/summarizer.py`

- 使用 `ReActAgent` + file tools (`read_file`, `write_file`, `edit_file`) 写入结构化记忆到 `memory/YYYY-MM-DD.md`
- Prompt 指示 Agent 提取：
  - **Persistent Memory**：事实、用户画像更新
  - **Experience Reflection**：可复用思维逻辑、成功策略、陷阱
- 与现有每日文件智能合并（读取现有内容，编辑特定段落）
- 作为**后台异步任务**运行 (`add_async_summary_task`)

### 6.2 检索

#### 文件型检索 (`memory_search`)

**文件**：`reme/memory/file_based/tools/memory_search.py`

- `file_store.hybrid_search()`：混合向量相似度搜索 + BM25 关键词搜索
- `vector_weight`（默认 0.7）：语义权重
- `candidate_multiplier`（默认 3.0）：检索 3x 候选后最终排序
- 搜索范围：`MemorySource.MEMORY`（MEMORY.md + memory/*.md）

#### 向量型检索 (`ReMe.retrieve_memory`)

**文件**：`reme/reme.py:445`

三个专用检索 Agent：
- `PersonalRetriever`
- `ProceduralRetriever`
- `ToolRetriever`

由 `ReMeRetriever` 编排，通过 `DelegateTask` 委派任务。

**PersonalRetriever 三阶段策略** (`personal_retriever.yaml`)：
1. **Semantic Search**（无时间过滤）：3-5 个多样化查询（原始、重述、实体聚焦、关键词）
2. **Temporal Search**（可选）：仅当问题含时间引用时；使用日期范围过滤
3. **Deep Dive into History**：通过 `read_history` 工具读取原始对话历史（最多 3 条）

### 6.3 存储后端

#### 向量存储 (`reme/core/vector_store/`)

| 类 | 说明 |
|---|---|
| `BaseVectorStore` | 抽象基类 |
| `ChromaVectorStore` | ChromaDB |
| `LocalVectorStore` | 本地向量 |
| `QdrantVectorStore` | Qdrant |
| `ESVectorStore` | Elasticsearch |

> **注意**：以下后端在审计报告初版中列出，但在开源仓库 (agentscope-ai/ReMe) 中未找到对应实现，可能为内部版本或计划中的扩展：
> - PostgreSQL + pgvector
> - ZvecVectorStore / ObvecVectorStore / HologresStore

#### 文件存储 (`reme/core/file_store/`)

| 类 | 说明 |
|---|---|
| `BaseFileStore` | 抽象基类 |
| `ChromaFileStore` | ReMeLight 默认 (`light.yaml`) |
| `LocalFileStore` | 本地文件 |
| `SQLiteFileStore` | SQLite |
| `ZvecFileStore` | Zvec |

---

## 7. 配置选项

**文件**：`reme/config/light.yaml`

默认 ReMeLight 配置：
- LLM：`qwen3.5-plus`（OpenAI 兼容 API）
- Token counter：`rule` 后端，除数 3.75
- Embedding：OpenAI 兼容，1024 维，带缓存（最多 2000 条）
- File store：ChromaDB 后端
- File watcher：完整文件监视器（.md 文件）

### `pre_reasoning_hook` 关键参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `max_input_length` | 128K | 总上下文窗口大小 |
| `compact_ratio` | 0.7 | 作为阈值的窗口比例 |
| `memory_compact_reserve` | 10000 | 为最近消息保留的 token 数 |
| `enable_tool_result_compact` | True | 是否截断 tool result |
| `tool_result_compact_keep_n` | 3 | 免除截断的最近消息数 |
| `language` | "zh" | 输出语言 |

### `compact_memory` 参数

| 参数 | 说明 |
|------|------|
| `previous_summary` | 已有摘要（支持增量更新） |
| `return_dict` | 返回结构化结果 |
| `add_thinking_block` | 是否包含 thinking block |
| `extra_instruction` | 自定义压缩 prompt 指令 |

---

## 8. 关键设计观察

1. **两层压缩**：ReMeLight 维护内联 `compressed_summary`（即时上下文）和 `memory/YYYY-MM-DD.md`（长期检索）。内联摘要紧凑结构化，文件摘要丰富持久。

2. **增量摘要更新**：Compactor 支持 `initial_user_message` 和 `update_user_message` 两种 prompt。已有 `previous_summary` 时使用更新 prompt，保留已有信息并融入新数据。

3. **安全优先设计**：`validate_tool_ids_alignment()` 的 `is_valid` 标志作为断路器。如果无法保证工具调用完整性，跳过压缩而非生成损坏上下文。

4. **优雅降级**：Token 计数失败时回退到字节估算 (`int(len(text.encode("utf-8")) / 3.75)`)。Embedding 失败时回退到纯关键词搜索。

5. **后台摘要**：详细记忆摘要作为异步后台任务运行，不阻塞主推理循环。内联压缩（用于即时上下文）同步运行。

6. **记忆即文件**：核心哲学是 "memory as files"——所有持久化都是人类可读的（Markdown 摘要、JSONL 对话、纯文本 tool result）。可调试、可移植、人类可编辑。
