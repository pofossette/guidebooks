# OpenViking 深度源码审计报告

> Sub-Agent A (OpenViking Auditor) 审计成果
> 审计日期：2026-05-21
>
> **2026-05-30 验证更新**：本报告中的高层架构描述（VFS 范式、viking:// URI、L0/L1/L2 分层、FastAPI+RAGFS、13 种 embedding 提供商）已通过 volcengine/OpenViking 仓库验证为准确。但部分具体类名（如 HierarchicalRetriever、SemanticProcessor、SessionCompressor、MemoryExtractor、MemoryArchiver）和 RAGFS 插件命名方案基于源码审计推测，可能与当前版本不完全一致。MCP 端点工具数量已从 5 修正为 15。

---

## 1. 核心架构与设计哲学

OpenViking 是一个 AI Agent "上下文数据库"，用**虚拟文件系统 (VFS) 范式**替代传统的 flat vector-store RAG。所有记忆、资源和技能都组织在统一的 `viking://` URI 方案下，使用文件系统操作（`ls`、`tree`、`grep`、`find`、`mkdir`、`write`、`read`、`mv`、`rm`）管理。

### 系统组成

Python FastAPI 服务 + Rust RAGFS 存储引擎 + 可选 Rust CLI (`ov_cli`)。

### 核心入口

| 组件 | 文件 | 类/函数 | 行号 |
|------|------|---------|------|
| 服务主类 | `openviking/service/core.py` | `OpenVikingService` | 45 |
| FastAPI 应用 | `openviking/server/app.py` | `create_app()` | 146 |
| VFS 层 | `openviking/storage/viking_fs.py` | `VikingFS` | 202 |
| Python SDK | `openviking/client.py` | `SyncOpenViking` / `AsyncOpenViking` | - |

### `viking://` URI 命名空间

```
viking://
  resources/     — 共享知识库、项目文档、代码仓库
  user/          — 用户长期记忆（偏好、实体、事件）
  agent/         — Agent 记忆（轨迹、经验、技能、指令）
  session/       — 会话临时数据
```

**URI 规范化与解析** — `openviking/core/namespace.py`：
- `resolve_uri()` (line 205)：规范化 URI 并提取 owner 字段
- `canonical_user_root()` (line 162)：构建规范用户根，如 `viking://user/{user_id}`
- `canonical_agent_root()` (line 176)：构建规范 Agent 根
- `classify_uri()` (line 142)：返回 `UriClassification`，判断 URI 指向 memory/skill/resource

**URI 到物理路径映射** — `VikingFS._uri_to_path()` (`viking_fs.py:1688`)：
```python
def _uri_to_path(self, uri: str, ctx: ...) -> str:
    canonical_uri = canonicalize_uri(uri, real_ctx)
    _, parts = self._normalized_uri_parts(canonical_uri)
    return f"/local/{account_id}/{'/'.join(safe_parts)}"
```

反向映射 `_path_to_uri()` (line 1719)：去除 `/local/{account_id}/` 前缀，添加 `viking://`。

### 核心数据抽象：`Context` 类

**文件**：`openviking/core/context.py`

`Context` 类 (line 52) 是基础数据记录：

| 字段 | 类型 | 说明 |
|------|------|------|
| `uri` | str | viking:// URI 地址 |
| `parent_uri` | str | 父目录 URI |
| `is_leaf` | bool | 是否为文件 (True) / 目录 (False) |
| `context_type` | ContextType | `"memory"` / `"skill"` / `"resource"` |
| `level` | ContextLevel | 0 (L0 摘要) / 1 (L1 概览) / 2 (L2 全文) |
| `abstract` | str | 摘要文本 |
| `vectorize` | Vectorize | 用于 embedding 的文本 |
| `account_id` | str | 多租户归属 |

---

## 2. 分层加载机制 (L0/L1/L2)

### 层级定义

**文件**：`openviking/core/context.py:34-39`

```python
class ContextLevel(int, Enum):
    ABSTRACT = 0   # L0: 摘要，约 100 tokens
    OVERVIEW = 1   # L1: 概览，约 2000 tokens
    DETAIL = 2     # L2: 全文内容
```

### 物理存储

每个 VFS 目录包含隐藏元数据文件：
- `{dir}/.abstract.md` — L0 摘要
- `{dir}/.overview.md` — L1 概览
- 文件本身 — L2 全文

向量索引中，每个层级作为独立记录存储，包含 `level` 字段 (0/1/2)。

### L0/L1 读取

`VikingFS` 中 (`viking_fs.py`)：
- `abstract()` (line 1234)：读取 `{dir}/.abstract.md`
- `overview()` (line 1274)：读取 `{dir}/.overview.md`
- `read_batch()` (line 2073)：批量读取 L0 或 L1

### L0/L1 生成：SemanticProcessor

**文件**：`openviking/storage/queuefs/semantic_processor.py`

`SemanticProcessor` (line 70) 是生成 `.abstract.md` 和 `.overview.md` 的引擎。处理流程（类文档 lines 73-78）：

```
1. 并发生成目录下各文件摘要
2. 收集子目录的 .abstract.md
3. 生成本目录的 .abstract.md 和 .overview.md
4. 入队 EmbeddingQueue 进行向量化
```

主入口 `on_dequeue()` (line 274)，处理 `SemanticMsg`：

- **memory 目录**：`_process_memory_directory()` (line 489) — 用 VLM 生成文件摘要，再聚合
- **resource/skill 目录**：`SemanticDagExecutor` (line 369) — 自底向上 DAG 遍历

关键方法：

| 方法 | 行号 | 功能 |
|------|------|------|
| `_generate_single_file_summary()` | 1031 | 单文件摘要，代码文件用 AST 骨架提取 (`extract_skeleton`) 或 LLM 总结 |
| `_generate_overview()` | 1142 | 聚合文件摘要和子目录摘要，生成 L1 `.overview.md` |
| `_extract_abstract_from_overview()` | 1057 | 从 overview 中截取首个 `##` 之前的内容作为 L0 |
| `_enforce_size_limits()` | 1080 | 截断 overview/abstract 至配置上限 |
| `_parse_overview_md()` | 1089 | 解析现有 overview 以复用未变摘要（缓存优化） |

### L0/L1 向量化

`_vectorize_directory()` (line 1413) 委托给 `vectorize_directory_meta()` (`embedding_utils.py:238`)。

此函数创建**两条** Context 记录：
1. `level=ContextLevel.ABSTRACT` (L0) — embedding 输入为 `.abstract.md`
2. `level=ContextLevel.OVERVIEW` (L1) — embedding 输入为 `.overview.md`

`EmbeddingMsgConverter.from_context()` (`embedding_msg_converter.py:23`) 根据 URI 后缀解析 level：
```python
if uri.endswith("/.abstract.md"):
    resolved_level = ContextLevel.ABSTRACT   # 0
elif uri.endswith("/.overview.md"):
    resolved_level = ContextLevel.OVERVIEW   # 1
else:
    resolved_level = ContextLevel.DETAIL     # 2
```

---

## 3. 目录递归检索 (Directory Recursive Retrieval)

### 核心类

**文件**：`openviking/retrieve/hierarchical_retriever.py`

`HierarchicalRetriever` (line 45) 实现核心检索算法。

关键常量：
```python
MAX_CONVERGENCE_ROUNDS = 3        # line 48
DIRECTORY_DOMINANCE_RATIO = 1.2   # line 50
GLOBAL_SEARCH_TOPK = 10           # line 51
LEVEL_URI_SUFFIX = {0: ".abstract.md", 1: ".overview.md"}  # line 52
```

### `retrieve()` 方法 (line 92) — 五步算法

**Step 1 — 确定起始目录** (lines 141-145)：
根据 `context_type` 选择根 URI（`_get_root_uris_for_type()`, line 614）：
- resources → `viking://resources`
- memories → `{user_root}/memories`
- skills → `{agent_root}/skills`

**Step 2 — 全局向量搜索** (lines 148-156)：
`_global_vector_search()` (line 234) 对所有 L0/L1/L2 记录做 flat vector search，获取初始候选集。调用 `vector_proxy.search_global_roots_in_tenant()`。

**Step 3 — 合并起始点** (lines 176-181)：
`_merge_starting_points()` (line 291) 将全局搜索中命中的目录（非 L2）与根 URI 合并，按向量分数排序为优先队列。

**Step 4 — 递归搜索** — `_recursive_search()` (line 360)：

核心算法：
```
初始化 min-heap dir_queue（按分数排序的起始目录）

while dir_queue 非空:
    pop 最高分目录 D
    
    search_children_in_tenant(D, depth=1)
      → 获取 D 的子节点向量记录（L0/L1 目录和 L2 文件）
    
    if rerank_client 可用:
        对子节点结果 rerank
    
    for each 子节点 C:
        final_score = alpha * child_score + (1 - alpha) * parent_score
                          ↑ line 466-468: 分数传播公式
        
        if C 是目录 (level != 2):
            push C 回 dir_queue
        if C 是 L2 文件:
            累积到 collected_by_uri（终止命中）
    
    收敛检测 (lines 494-516):
        if top-k 连续 MAX_CONVERGENCE_ROUNDS (3) 轮不变:
            停止搜索
        if 候选池大小停滞:
            停止搜索
```

**Step 5 — 结果转换** (line 214)：
`_convert_to_matched_contexts()` 将候选转为 `MatchedContext`，可选叠加**热度分数** (`memory_lifecycle.py:19`)：

```python
score = sigmoid(log1p(active_count)) * exp(-decay_rate * age_days)
```

### 颠覆性意义

这是 OpenViking 相比传统 flat vector RAG 的核心创新——不是一次性搜全部，而是沿文件系统目录树**逐层深入**，用父节点语义分数引导子节点搜索方向，模拟人类"先看目录概要，再深入感兴趣子文件夹"的认知检索过程。

---

## 4. 写入路径（数据生命周期）

完整写入路径：

1. **API 调用**：`VikingFS.write_context()` (`viking_fs.py:2438`) 或 `ContentWriteCoordinator.write()` (`content_write.py:54`)

2. **ContentWriteCoordinator** (`storage/content_write.py:40`)：
   - 验证 URI 和写入模式 (replace/append/create)
   - 通过 `VikingFS.write_file()` 写入文件
   - 通过 `_enqueue_semantic_refresh()` (line 382) 入队 `SemanticMsg`

3. **SemanticProcessor** 出队处理：
   - resources: `SemanticDagExecutor` 自底向上，生成每文件摘要 → 目录 L0/L1
   - memories: `_process_memory_directory()`，生成文件摘要 → 目录 L0/L1
   - 父目录刷新：`_enqueue_parent_refresh()` 向上传播

4. **EmbeddingQueue**：`vectorize_directory_meta()` 和 `vectorize_file()` 创建 `EmbeddingMsg` 入队

5. **Embedding Worker**：调用配置的 embedder (OpenAI/Volcengine/Jina) 生成向量，upsert Context 到向量数据库

---

## 5. 检索路径

1. **查询到达**：`VikingFS.find()` (line 1332) 或 `VikingFS.search()` (line 1437)
2. `find()`：简单直接，一次查询一次检索
3. `search()`：复杂搜索，用 `IntentAnalyzer` 将查询分解为多个类型化子查询（需要 session 上下文时），并发执行
4. **HierarchicalRetriever.retrieve()**：执行上述五步递归检索
5. **返回** `FindResult`，按 context_type 分组

---

## 6. 插件与扩展架构 (RAGFS)

Rust crate `crates/ragfs/` 实现插件式虚拟文件系统：

| 插件 | 目录 | 用途 | 验证状态 |
|------|------|------|----------|
| localfs | `crates/ragfs/src/plugins/localfs/` | 本地文件系统 | 源码级名称待确认 |
| kvfs | `crates/ragfs/src/plugins/kvfs/` | 键值存储 | 源码级名称待确认 |
| memfs | `crates/ragfs/src/plugins/memfs/` | 内存文件系统 | 源码级名称待确认 |
| sqlfs | `crates/ragfs/src/plugins/sqlfs/` | SQL 存储 | Cargo.toml 含 rusqlite/sqlx |
| s3fs | `crates/ragfs/src/plugins/s3fs/` | S3 对象存储 | Cargo.toml 含可选 S3 feature |
| queuefs | `crates/ragfs/src/plugins/queuefs/` | 队列文件系统（SemanticQueue/EmbeddingQueue） | 源码级名称待确认 |

> **注意**：上述插件命名方案基于源码审计推测，`crates/ragfs/Cargo.toml` 中未见以这些名称注册的模块。具体插件目录结构需与当前版本源码核实。

### 队列架构 (`openviking/storage/queuefs/`)

- `SemanticMsg` (`semantic_msg.py`)：语义处理消息
- `EmbeddingMsg` (`embedding_msg.py`)：向量化消息
- `SemanticDagExecutor` (`semantic_dag.py`)：DAG 执行器，带依赖追踪
- `QueueManager` (`queue_manager.py`)：管理语义和 embedding 队列

### 并发与锁

- 基于路径的锁：`LockManager` (`storage/transaction/`)
- `LockContext` (`lock_context.py`)：原子多路径操作
- `ContentWriteCoordinator` 在写入前获取路径锁
- `SemanticProcessor` 在长运行语义处理时获取生命周期锁

### 缓存与优化

- **分数传播**：递归检索中目录分数通过 alpha 权重混合传播到子节点
- **收敛早停**：连续 3 轮 top-k 不变则停止递归
- **批量 embedding**：`EmbeddingQueue` 并发处理多个向量
- **CJK 感知 token 估算**：`_truncate_embedding_input()` (`embedding_utils.py:62`) 在 embedding 前截断原始文本
- **热度评分**：`hotness_score()` 结合访问频率与时间衰减

### 多租户

- 所有向量记录包含 `account_id` 字段
- `_SingleAccountBackend` (`viking_vector_index_backend.py:87`) 自动过滤
- `AccountNamespacePolicy` 支持按 Agent 隔离用户作用域

### 加密

- 可选静态加密：`FileEncryptor` 传入 `VikingFS.__init__()`
- 所有读写经过 `_encrypt_content()` / `_decrypt_content()`
- 加密 grep：`_grep_encrypted()` 解密后匹配

### 内容类型支持

`openviking/parse/parsers/` 中的专用解析器：

| 类型 | 解析方式 |
|------|----------|
| 代码 (Python/JS/TS/Java/Go/Rust/C++/C#/Lua/PHP) | AST 骨架提取 |
| 文档 (Markdown/PDF/DOCX/PPTX/XLSX/EPUB/HTML) | 专用解析器 |
| 媒体 (图片/视频/音频) | VLM 摘要 |
| 归档 (ZIP) | ZIP 解析 |
| Git 仓库 | Git accessor |

### MCP 集成

`openviking/server/mcp_endpoint.py`：在 `/mcp` 暴露 MCP 端点，提供 **15 个工具**：

| 工具 | 用途 |
|------|------|
| `find` | 精确查找 |
| `search` | 语义搜索 |
| `read` | 读取内容 |
| `list` | 列出目录 |
| `remember` | 存储记忆 |
| `add_resource` | 添加资源 |
| `list_watches` | 列出监听 |
| `cancel_watch` | 取消监听 |
| `grep` | 内容搜索 |
| `glob` | 文件匹配 |
| `code_outline` | 代码大纲 |
| `code_search` | 代码搜索 |
| `code_expand` | 代码展开 |
| `forget` | 遗忘记忆 |
| `health` | 健康检查 |

### 会话与记忆管理 (`openviking/session/`)

- `SessionCompressor` / `SessionCompressorV2`：压缩对话历史
- `MemoryExtractor`：从对话中提取长期记忆
- `MemoryArchiver`：归档 session 数据到 user/agent 记忆目录
- `MemoryDeduplicator`：防止重复记忆
