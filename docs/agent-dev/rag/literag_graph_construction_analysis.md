# LightRAG 图结构构建方式分析

## 核心结论：100% LLM 提取，无正则提取

LightRAG 的实体和关系提取**完全依赖 LLM**，不使用正则表达式做信息抽取。正则仅用于文本清洗和格式修复（如中文标点转换、HTML 标签移除等），而非语义层面的实体/关系识别。

---

## 完整构建管线（7 个阶段）

### 阶段 1：文档入队

入口 `lightrag/lightrag.py:1237` — `ainsert()` 将文档送入处理队列。

```
ainsert()
├── apipeline_enqueue_documents()    — 验证并排队文档
└── apipeline_process_enqueue_documents()  — 处理排队文档
```

文档处理流程 (`lightrag/lightrag.py:1740-2044`)：
- 获取待处理文档
- 异步迭代文档（信号量控制并发）
- 对每个文档：获取全文 → 分块 → 提取与合并

---

### 阶段 2：文本分块

`lightrag/operate.py:101-164` — `chunking_by_token_size()`

- 默认 1200 tokens/chunk，100 tokens 重叠
- 支持两种模式：
  - `split_by_character=False`：按字符分割后，超大 chunk 再按 token 细分
  - `split_by_character_only=True`：仅按字符分割，拒绝超大 chunk
- 输出：`[{tokens, content, chunk_order_index}, ...]`

---

### 阶段 3：LLM 实体与关系提取（核心）

`lightrag/operate.py:2883-3161` — `extract_entities()`

对每个 chunk，构造 prompt 发送给 LLM。

#### 3.1 Prompt 构造

**System Prompt** (`lightrag/prompt.py:11-61`)：
- 角色定义为 "Knowledge Graph Specialist"
- 要求输出格式化的实体和关系
- 使用分隔符 `<|#|>` 分隔字段，`<|COMPLETE|>` 标记结束
- 实体格式：`entity<|#|>name<|#|>type<|#|>description`（4 字段）
- 关系格式：`relation<|#|>source<|#|>target<|#|>keywords<|#|>description`（5 字段）
- 提供 3 个 few-shot 示例 (`prompt.py:102-183`)

**User Prompt** (`lightrag/prompt.py:63-82`)：
- 包含输入文本
- 指定实体类型（可配置，默认: Person, Organization, Location 等）
- 包含语言规范

#### 3.2 LLM 调用与缓存

```python
final_result, timestamp = await use_llm_func_with_cache(
    entity_extraction_user_prompt,
    use_llm_func,
    system_prompt=entity_extraction_system_prompt,
    llm_response_cache=llm_response_cache,
    cache_type="extract",
    chunk_id=chunk_key,
)
```

- 支持 OpenAI、Ollama、Azure、Gemini 等多种 LLM 后端
- 内置缓存机制避免重复调用

#### 3.3 Gleaning（可选二次提取）

- 配置 `entity_extract_max_gleaning`（默认 0 = 禁用）
- 启用后发送 `entity_continue_extraction_user_prompt` (`prompt.py:84-100`)
- 要求 LLM 找出遗漏或格式错误的实体/关系
- 通过描述长度比较，保留更优版本
- Token 限制检查防止上下文溢出

---

### 阶段 4：LLM 输出解析

`lightrag/operate.py:937-1062` — `_process_extraction_result()`

**非正则提取，而是字符串分割 + 校验。**

#### 4.1 分隔符分割

```python
records = split_string_by_multi_markers(
    result,
    ["\n", completion_delimiter, completion_delimiter.lower()],
)
```

- 按换行和 `<|COMPLETE|>` 分割记录
- 自动修复 LLM 常见格式错误（如用 `<|#|>` 替代换行作记录分隔符）
- 通过 `fix_tuple_delimiter_corruption()` 修复各种分隔符损坏形式

#### 4.2 实体解析

`lightrag/operate.py:386-470` — `_handle_single_entity_extraction()`

校验规则：
- 必须恰好 4 个字段，首字段包含 "entity"
- `entity_name`：去除引号、规范化处理，不能为空
- `entity_type`：无特殊字符（`'`, `(`, `)`, `<`, `>`, `|`, `/`, `\`），逗号分隔时取首个，转小写
- `description`：非空

输出：`dict(entity_name, entity_type, description, source_id, file_path, timestamp)`

#### 4.3 关系解析

`lightrag/operate.py:473-557` — `_handle_single_relationship_extraction()`

校验规则：
- 必须恰好 5 个字段，首字段包含 "relation"
- `source` 和 `target` 不能为空且不能相同
- `keywords`：逗号分隔
- `description`：非空
- `weight`：从末尾字段尝试解析浮点数，默认 1.0

输出：`dict(src_id, tgt_id, weight, description, keywords, source_id, file_path, timestamp)`

---

### 阶段 5：实体/关系合并

`lightrag/operate.py:2501-2881` — `merge_nodes_and_edges()`

两阶段合并策略：

#### 5.1 收集所有节点和边

```python
for chunk_result in chunk_results:
    all_nodes[entity_name].extend(entities)       # 按实体名分组
    all_edges[sorted_edge_key].extend(edges)       # 按 (source, target) 分组
```

#### 5.2 并发处理实体

`lightrag/operate.py:1623-1943` — `_merge_nodes_then_upsert()`

1. 从知识图谱获取已有节点
2. 合并 source IDs（chunk 引用），设上限
3. 按 description 去重（保留唯一描述）
4. 按时间戳和描述长度排序
5. **LLM 摘要**（见下方 5.4）
6. 选择最常见的 entity_type
7. 合并 file paths
8. 写入图存储和向量数据库

#### 5.3 并发处理关系

`lightrag/operate.py:1948-2501` — `_merge_edges_then_upsert()`

1. 检查源/目标实体是否存在（不存在则创建占位节点）
2. 合并 source IDs、keywords、weights
3. 按 description 去重
4. LLM 摘要
5. 写入图存储和向量数据库

#### 5.4 LLM Map-Reduce 摘要

`lightrag/operate.py:167-383` — `_handle_entity_relation_summary()`

- 当描述列表 token 总量超过 `summary_context_size` 时触发
- 当描述数 < `force_llm_summary_on_merge` 且 token < `summary_max_tokens` 时，直接拼接，不调用 LLM
- 超出时采用 Map-Reduce 策略：分块摘要 → 递归合并 → 最终摘要

---

### 阶段 6：图存储写入

#### 图存储（knowledge_graph_inst）

- 接口：`BaseGraphStorage`（支持 NetworkX、Neo4j、PostgreSQL 等）
- 方法：`upsert_node()`、`upsert_edge()`、`get_node()`、`get_edge()`
- 无向图：关系默认无方向

#### 存储结构

```
knowledge_graph_inst (Graph Storage)
├── Nodes: entity_name → {entity_type, description, source_id, file_path, created_at}
└── Edges: (entity_name, entity_name) → {weight, description, keywords, source_id, file_path, created_at}

entities_vdb (Vector DB)
└── {entity_name} → embedding of (entity_name + description)

relationships_vdb (Vector DB)
└── {src_id+tgt_id} → embedding of (src_id + tgt_id + keywords)

entity_chunks_storage (KV)
└── entity_name → {chunk_ids: [list], count: int}

relation_chunks_storage (KV)
└── (src_id, tgt_id) → {chunk_ids: [list], count: int}
```

---

### 阶段 7：持久化

`lightrag/lightrag.py:2339-2368` — `_insert_done()`

```python
await asyncio.gather(
    self.full_docs.index_done_callback(),
    self.text_chunks.index_done_callback(),
    self.full_entities.index_done_callback(),
    self.full_relations.index_done_callback(),
    self.entities_vdb.index_done_callback(),
    self.relationships_vdb.index_done_callback(),
    self.chunk_entity_relation_graph.index_done_callback(),
)
```

刷写所有存储到持久层。

---

## 方法论总结

| 环节 | 方法 | 说明 |
|------|------|------|
| **实体/关系识别** | LLM | 通过精心设计的 few-shot prompt 引导 LLM 结构化输出 |
| **输出解析** | 字符串分割 + 校验 | 按分隔符拆分，校验字段数和内容，非正则匹配 |
| **格式修复** | 字符串操作 | 自动修复 LLM 输出的常见格式偏差 |
| **实体合并** | 规则 + LLM 摘要 | 去重用规则，描述压缩用 LLM Map-Reduce |
| **图写入** | Graph/Vector/KV 存储 | 多存储协同，支持多种后端 |

## 设计哲学

LightRAG 将**所有语义理解任务委托给 LLM**，代码层只做格式解析和数据清洗，不尝试用规则或正则来理解文本含义。这种设计：

- **优点**：灵活性高，能处理任意领域的文本，不依赖预定义的正则模式
- **代价**：每次插入都需要 LLM 调用，成本较高；提取质量取决于 LLM 能力
- **缓解**：通过 LLM 响应缓存、并发控制、Gleaning 二次提取等机制优化效率和质量

---

## 关键文件索引

| 文件 | 行号 | 功能 |
|------|------|------|
| `lightrag/operate.py` | 2883-3161 | 实体提取主函数 `extract_entities()` |
| `lightrag/operate.py` | 937-1062 | 输出解析 `_process_extraction_result()` |
| `lightrag/operate.py` | 386-470 | 单实体解析 `_handle_single_entity_extraction()` |
| `lightrag/operate.py` | 473-557 | 单关系解析 `_handle_single_relationship_extraction()` |
| `lightrag/operate.py` | 1623-1943 | 实体合并 `_merge_nodes_then_upsert()` |
| `lightrag/operate.py` | 1948-2501 | 关系合并 `_merge_edges_then_upsert()` |
| `lightrag/operate.py` | 2501-2881 | 合并入口 `merge_nodes_and_edges()` |
| `lightrag/operate.py` | 167-383 | LLM 摘要 `_handle_entity_relation_summary()` |
| `lightrag/prompt.py` | 11-61 | 实体提取 System Prompt |
| `lightrag/prompt.py` | 63-82 | 实体提取 User Prompt |
| `lightrag/prompt.py` | 84-100 | Gleaning 追问 Prompt |
| `lightrag/prompt.py` | 102-183 | Few-shot 示例 |
| `lightrag/lightrag.py` | 1237 | 入口 `ainsert()` |
| `lightrag/lightrag.py` | 1740-2044 | 文档处理流水线 |
| `lightrag/lightrag.py` | 2339-2368 | 持久化 `_insert_done()` |
