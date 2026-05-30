# ReMe 记忆架构深度分析

> ReMe（Remember Me, Refine Me）—— 阿里巴巴 AgentScope 团队的 AI Agent 记忆管理框架
> 版本 0.3.1.9 | Apache 2.0

---

## 一、项目总览

ReMe 提供**两套独立的记忆系统**，服务于不同复杂度的场景：

| 系统 | 入口类 | 存储方式 | 适用场景 |
|------|--------|----------|----------|
| **文件记忆系统 (ReMeLight)** | `ReMeLight` | Markdown 文件 + 文件索引 | 轻量级、透明可读、低依赖 |
| **向量记忆系统 (ReMe)** | `ReMe` | 向量数据库 + 结构化元数据 | 多类型记忆、精准语义检索 |

项目结构：
```
reme/           # 核心框架（v2+ 架构）
reme_ai/        # 旧版 v1 架构（FlowLLM，向后兼容）
```

---

## 二、记忆入库流程

### 2.1 文件记忆系统（ReMeLight）—— 4 阶段流水线

文件记忆以 `pre_reasoning_hook` 为统一入口，在每次 Agent 推理前自动触发。

```mermaid
flowchart TD
    ENTRY["ReMeLight.pre_reasoning_hook<br>(统一入口)"] --> S1

    subgraph s1["Stage 1: compact_tool_result (工具结果压缩)"]
        direction TB
        S1I["输入: messages (包含 tool-result 的对话消息列表)"]
        S1P["处理:<br>· 识别尾部连续的 tool-result 消息<br>· 最近的 → 截断到 ~100KB，完整内容保存到 disk<br>· 更早的 → 激进截断到 ~3KB<br>· 过期文件自动清理（默认保留 3 天）"]
        S1O["输出: 截断后的消息列表 + 磁盘上的完整文件"]
        S1I --> S1P --> S1O
    end

    S1O --> S2

    subgraph s2["Stage 2: check_context (上下文检查)"]
        direction TB
        S2I["输入: messages, max_input_length, compact_ratio"]
        S2P["处理:<br>· HuggingFace TokenCounter 计数<br>· 阈值 = max_input_length × compact_ratio × 0.95<br>· 分为'待压缩'（旧）和'保留'（新）两组<br>· 保持完整的 user-assistant 轮次"]
        S2O["输出: (to_compact_messages, to_keep_messages)"]
        S2I --> S2P --> S2O
    end

    S2O --> S3

    subgraph s3["Stage 3: compact_memory (记忆压缩 — 同步)"]
        direction TB
        S3I["输入: to_compact_messages, 已有 compact_summary"]
        S3P["处理:<br>· 使用 ReActAgent 'reme_compactor' 生成结构化摘要<br>· 输出: Goal / Constraints / Progress / Key Decisions /<br>  Next Steps / Critical Context<br>· 增量更新: 新消息合并到已有摘要"]
        S3O["输出: context.compact_summary (内存中，不落盘)"]
        S3I --> S3P --> S3O
    end

    S3O --> S4

    subgraph s4["Stage 4: summary_memory (持久化记忆 — 异步后台)"]
        direction TB
        S4I["输入: messages, working_dir, memory_dir"]
        S4P["处理:<br>· 使用 ReActAgent 'reme_summarizer' (read/write/edit 工具)<br>· 提取 Persistent Memory + Experience Reflection<br>· 写入 memory/YYYY-MM-DD.md (当日日记文件)<br>· 合并策略: 不存在→创建 / 已存在→智能合并 / 大幅重构→覆盖"]
        S4O["输出: 持久化记忆文件"]
        S4I --> S4P --> S4O
    end

    style ENTRY fill:#e8f4f8,stroke:#4a9
    style s1 fill:#fff3cd,stroke:#ffc107
    style s2 fill:#d1ecf1,stroke:#17a2b8
    style s3 fill:#f8d7da,stroke:#dc3545
    style s4 fill:#d4edda,stroke:#28a745
```

### 2.2 向量记忆系统（ReMe）—— 分层代理委托模式

向量记忆以 `summarize_memory()` 为入口，采用层级 Agent 委托架构。

```mermaid
flowchart TD
    ENTRY["ReMe.summarize_memory() 入口方法<br>参数: messages, user_name/task_name/tool_name, retrieve_top_k"] --> SUM

    subgraph sum["ReMeSummarizer (顶层编排 Agent)"]
        S1["Step 1: 调用 AddHistory 工具<br>→ 存入向量库，类型为 HISTORY"]
        S2["Step 2: 通过 DelegateTask 分派任务给类型专属 Agent<br>→ 根据 user_name/task_name/tool_name 决定激活哪些 Agent"]
        S1 --> S2
    end

    SUM --> S1

    S2 --> PS["Personal Summarizer (个人记忆)"]
    S2 --> PRC["Procedural Summarizer (流程记忆)"]
    S2 --> TS["Tool Summarizer (工具使用记忆)"]

    subgraph personal["Personal Summarizer"]
        direction TB
        P1["Phase S1: 提取个人记忆"]
        P1D["Draft + Retrieve Similar Memory"]
        P1A["Add Memory (去重写入)"]
        P1 --> P1D --> P1A
        P1A --> P2["Phase S2: 更新用户画像"]
        P2R["Read/Retrieve Profiles"]
        P2U["Update Profiles"]
        P2 --> P2R --> P2U
    end

    subgraph procedural["Procedural Summarizer"]
        direction TB
        PR1["提取流程知识:<br>· how-to 知识 · 工作流步骤 · 成功/失败模式"]
        PRD["Draft + Retrieve Similar Memory"]
        PRA["Add Memory (去重写入)"]
        PR1 --> PRD --> PRA
    end

    subgraph tool_sum["Tool Summarizer"]
        direction TB
        T1["提取工具经验:<br>· 使用模式 · 参数调优经验 · 最佳实践"]
        TD["Draft + Retrieve Similar Memory"]
        TA["Add Memory (去重写入)"]
        T1 --> TD --> TA
    end

    PS --> personal
    PRC --> procedural
    TS --> tool_sum

    personal & procedural & tool_sum --> MH["MemoryHandler.add_batch()"]

    subgraph handler["MemoryHandler.add_batch()"]
        direction TB
        H1["1. 构建 MemoryNode (Pydantic Model)<br>memory_id=SHA256, memory_type, memory_target,<br>when_to_use, content, message_time, ref_memory_id"]
        H2["2. 内容去重: 相同 content 保留最后一条"]
        H3["3. to_vector_node() 转换<br>when_to_use 非空 → 用作嵌入文本<br>otherwise → 直接用 content 嵌入"]
        H4["4. vector_store.insert() 写入向量数据库"]
        H1 --> H2 --> H3 --> H4
    end

    MH --> handler

    style ENTRY fill:#e8f4f8,stroke:#4a9
    style sum fill:#fff3cd,stroke:#ffc107
    style personal fill:#d4edda,stroke:#28a745
    style procedural fill:#d1ecf1,stroke:#17a2b8
    style tool_sum fill:#f8d7da,stroke:#dc3545
    style handler fill:#e2e3e5,stroke:#6c757d
```

---

## 三、文件记忆的组织与管理

### 3.1 工作目录结构

由 `ReMeLight.__init__()` 自动创建（reme/reme_light.py:126-133）：

```
.reme/                              # working_dir 根目录
│
├── MEMORY.md                       # 长期持久记忆（手动或 Agent 写入）
├── memory.md                       # 备选记忆文件
│
├── memory/                         # 每日日记（Agent 自动写入）
│   ├── 2025-05-15.md               # 每个文件内部分区:
│   ├── 2025-05-16.md               #   "Factual Memory" (事实记忆)
│   └── ...                         #   "Reflections & Logic" (经验反思)
│
├── dialog/                         # 原始对话记录
│   ├── 2025-05-15.jsonl            # 每行一条 JSON 消息
│   └── ...
│
├── tool_result/                    # 大型工具输出缓存
│   ├── <uuid>.txt                  # TTL 自动清理（默认保留 3 天）
│   └── ...
│
├── embedding_cache/                # 嵌入模型缓存（加速重复计算）
│
├── file_store/                     # 文件存储索引持久化
│   ├── reme_chunks.jsonl           # 所有 chunk 的数据
│   └── reme_file_metadata.json     # 文件元数据（hash, mtime, size）
│
├── vector_store/                   # 向量存储持久化
│
└── profile/                        # 用户画像存储
    └── <collection_name>.jsonl     # 每个集合一个 JSONL 文件
```

**关键设计**:
- `MEMORY.md` / `memory.md`: 长期记忆文件，被 FileWatcher 监控
- `memory/*.md`: 日记文件，按日期命名，Summarizer Agent 自动写入
- `tool_result/`: 临时缓存，有 TTL 过期机制
- `file_store/`: 索引数据，由 FileWatcher 维护，支持增量更新

### 3.2 文件监控与增量索引系统

```mermaid
flowchart TD
    subgraph watcher["FileWatcher 文件监控系统"]
        direction TB
        W1["监控路径:<br>· .reme/MEMORY.md<br>· .reme/memory.md<br>· .reme/memory/ (整个目录)<br>过滤: .md 后缀<br>底层: watchfiles.awatch"]
    end

    watcher -->|"检测到文件变更"| DELTA

    subgraph delta["DeltaFileWatcher 增量同步逻辑"]
        direction TB
        subgraph ops["三种操作"]
            direction LR
            NEW["新增文件<br>1. 读取全文<br>2. chunk_md()<br>3. 生成嵌入<br>4. upsert 到索引"]
            MOD["修改文件 (追加型)<br>1. 检测 cutoff 行<br>2. 仅重新分块 cutoff 之后<br>3. 删除受影响旧 chunk<br>4. 插入新 chunk"]
            DEL["删除文件<br>1. 从索引中移除<br>   所有相关 chunk<br>2. 删除文件元数据"]
        end
        NOTE["增量策略核心: 检测 append-only 变更<br>避免全量重新计算嵌入 · overlap_lines=2"]
    end

    style watcher fill:#e8f4f8,stroke:#4a9
    style delta fill:#fff3cd,stroke:#ffc107
    style NEW fill:#d4edda,stroke:#28a745
    style MOD fill:#d1ecf1,stroke:#17a2b8
    style DEL fill:#f8d7da,stroke:#dc3545
```

### 3.3 Markdown 分块策略

代码: `reme/core/utils/chunking_utils.py`

```mermaid
flowchart TD
    INPUT["输入参数:<br>chunk_tokens: 每块最大 token 数 (×4 转字符)<br>overlap: 块间重叠 token 数 (默认 80)"] --> A

    A["原始 Markdown 文本"] --> B["按行拆分 (\\n 分割)"]
    B --> C["逐行累加字符数"]
    C --> D{"超过 max_chars?"}
    D -->|"未超限"| C
    D -->|"超过"| E["flush 当前 chunk"]
    E --> F["carry_overlap():<br>保留尾部 overlap 内容到下一块"]
    F --> C

    E --> CHUNK["每个 MemoryChunk 包含:<br>id = hash(source:path:start:end:content:index)<br>path · source (MEMORY|SESSIONS)<br>start_line · end_line · text · hash"]

    style INPUT fill:#e8f4f8,stroke:#4a9
    style D fill:#fff3cd,stroke:#ffc107
    style E fill:#d4edda,stroke:#28a745
    style CHUNK fill:#e2e3e5,stroke:#6c757d
```

---

## 四、语义化目录组织方式

ReMe **不生成**语义化目录树，而是通过**三层机制**实现逻辑分明的组织：

```mermaid
flowchart TD
    subgraph L1["Layer 1: 文件层面 — 按日期扁平命名"]
        L1P["memory/2025-05-15.md<br>memory/2025-05-16.md<br>每个文件内部分区:<br>├ 'Factual Memory' (事实记忆)<br>└ 'Reflections & Logic' (经验反思)<br>优点: 人类可读、可直接编辑、按时间自然归档"]
    end

    subgraph L2["Layer 2: 向量库层面 — 按类型 + 目标语义分类"]
        L2T["memory_type (记忆类型):<br>PERSONAL → 个人偏好<br>PROCEDURAL → 流程知识<br>TOOL → 工具经验<br>IDENTITY → 身份信息<br>SUMMARY → 摘要<br>HISTORY → 对话历史"]
        L2G["memory_target (记忆目标):<br>'alice' → 用户<br>'code_writing' → 任务<br>'search_api' → 工具<br>检索时按 type+target 过滤"]
        L2W["when_to_use (触发条件):<br>描述'何时应该检索这条记忆'<br>作为向量嵌入的文本"]
    end

    subgraph L3["Layer 3: 用户画像层面 — 结构化画像档案"]
        L3S["存储后端:<br>· filesystem (默认): profile/&lt;collection&gt;.jsonl<br>· vector: 专用向量 collection<br>容量控制: 50 条/目标，超限自动淘汰"]
    end

    style L1 fill:#fff3cd,stroke:#ffc107
    style L2 fill:#d1ecf1,stroke:#17a2b8
    style L3 fill:#d4edda,stroke:#28a745
```

---

## 五、RAG 在系统中的作用

ReMe 中 RAG 在**写入时**和**读取时**都发挥关键作用，贯穿记忆的完整生命周期。

### 5.1 写入时 RAG —— 去重与智能合并

```mermaid
flowchart TD
    MSG["对话内容 (messages)"] --> DRAFT["LLM 提取 draft memories<br>(候选记忆条目列表)"]
    DRAFT --> SEARCH["向量检索: 在已有记忆库中搜索相似记忆<br>· 按 memory_type + memory_target 过滤<br>· 返回 top_k 条相似记忆 (默认 20)"]
    SEARCH --> COMPARE["LLM 对比 draft memories vs 已有相似记忆"]

    COMPARE --> NEW["全新记忆<br>→ AddMemory 写入向量库"]
    COMPARE --> DUP["重复记忆<br>→ 跳过，不写入"]
    COMPARE --> UPDATE["补充/更新<br>→ 合并后 AddMemory"]

    PURPOSE["目的: 避免语义重复的记忆污染向量库，<br>保持记忆库质量"]

    NEW & DUP & UPDATE --> PURPOSE

    style MSG fill:#e8f4f8,stroke:#4a9
    style SEARCH fill:#fff3cd,stroke:#ffc107
    style NEW fill:#d4edda,stroke:#28a745
    style DUP fill:#e2e3e5,stroke:#6c757d
    style UPDATE fill:#d1ecf1,stroke:#17a2b8
```

### 5.2 读取时 RAG —— 两套检索系统

> **后端验证说明**：以下向量存储后端列表已与 agentscope-ai/ReMe 开源仓库核实。PostgreSQL+pgvector、Hologres 等后端在开源版本中未找到实现，可能为内部版本或计划扩展。

#### 文件记忆 RAG: MemorySearch (混合检索)

```mermaid
flowchart TD
    QUERY["用户查询 (query)"] --> VEC & KW

    VEC["向量检索 (语义相似度)<br>embed(query) + cosine_sim<br>权重: 0.7"]
    KW["关键词检索 (FTS/子串)<br>逐词匹配 + 短语加分<br>权重: 0.3"]

    VEC & KW --> MERGE["加权融合 + merge_key 去重<br>(path + start_line + end_line)<br>候选池 = max_results × 3<br>→ 融合排序 → 取 top-N<br>→ 过滤 min_score &lt; 0.1"]

    MERGE --> RESULT["MemorySearchResult<br>path / start_line / end_line<br>score / snippet / source"]

    RESULT --> BACKENDS["存储后端可选:<br>LocalFileStore (纯 Python, JSONL)<br>ChromaFileStore (ChromaDB)<br>SQLiteFileStore (SQLite + sqlite-vec)<br>ZvecFileStore (Zilliz/ZVector)"]

    style QUERY fill:#e8f4f8,stroke:#4a9
    style VEC fill:#d1ecf1,stroke:#17a2b8
    style KW fill:#fff3cd,stroke:#ffc107
    style MERGE fill:#f8d7da,stroke:#dc3545
    style RESULT fill:#d4edda,stroke:#28a745
```

#### 向量记忆 RAG: PersonalRetriever (两阶段检索)

```mermaid
flowchart TD
    INPUT["输入: query 或 messages + memory_target"] --> S1

    subgraph stage1["Stage 1: Profile 检索 (S1-profile)"]
        direction TB
        S1A["filesystem 后端 → ReadAllProfiles (读取全部画像)"]
        S1B["vector 后端 → RetrieveProfile (语义检索画像)"]
        S1C["获得 profile_context (用户画像上下文)"]
        S1A --> S1C
        S1B --> S1C
    end

    S1 --> stage1

    subgraph stage2["Stage 2: Memory 检索 (S2-memory) — 三阶段策略"]
        direction TB
        PH1["Phase 1: 语义搜索 (Semantic Search)<br>· 构造 3-5 个多角度查询:<br>  原始 / 改写 / 实体聚焦 / 关键词 / 宽泛主题<br>· 调用 RetrieveMemory 工具<br>· 无时间过滤"]
        PH2["Phase 2: 时间搜索 (Temporal Search) [可选]<br>· 带时间范围过滤的查询<br>· 补充语义搜索可能遗漏的时间敏感记忆"]
        PH3["Phase 3: 历史深挖 (History Deep Dive)<br>· 调用 ReadHistory 工具<br>· 读取最多 3 条完整对话历史<br>· 获得深层上下文 (完整对话，不只是摘要)"]
        PH1 --> PH2 --> PH3
    end

    stage1 --> stage2

    stage2 --> BACKENDS["向量存储后端可选:<br>LocalVectorStore (纯 Python + numpy)<br>ChromaVectorStore / QdrantVectorStore<br>ESVectorStore<br><i>(PGVectorStore / HologresStore 等为内部版本或计划扩展)</i>"]

    style INPUT fill:#e8f4f8,stroke:#4a9
    style stage1 fill:#fff3cd,stroke:#ffc107
    style stage2 fill:#d1ecf1,stroke:#17a2b8
    style PH1 fill:#d4edda,stroke:#28a745
    style PH2 fill:#f8d7da,stroke:#dc3545
    style PH3 fill:#e2e3e5,stroke:#6c757d
```

### 5.3 RAG 核心作用总结

```mermaid
flowchart TD
    subgraph write["写入时 RAG — 记忆质量守门员"]
        WR1["问题: LLM 可能反复提取相同/相似的记忆"]
        WR2["解决: AddDraftAndRetrieveSimilarMemory"]
        WR3["流程: draft → 向量检索已有相似 → LLM 判断 → 决定写/跳/合并"]
        WR4["效果: 防止重复、智能合并、保持记忆库精简高质量"]
        WR1 --> WR2 --> WR3 --> WR4
    end

    subgraph read["读取时 RAG — 记忆精准召回"]
        RD1F["文件系统:<br>向量相似 (0.7) + 关键词匹配 (0.3) → 混合排序<br>搜索范围: MEMORY.md + memory/*.md"]
        RD1V["向量系统:<br>多角度语义查询 → 时间过滤 → 完整历史深挖<br>先画像后记忆，两阶段逐层深入"]
        RD2["效果: 高召回率、多维度覆盖、时间+语义双维度精准定位"]
        RD1F --> RD2
        RD1V --> RD2
    end

    style write fill:#fff3cd,stroke:#ffc107
    style read fill:#d1ecf1,stroke:#17a2b8
```

---

## 六、整体架构总览

```mermaid
flowchart TD
    AGENT["AI Agent 对话"] --> RL & RE

    subgraph rl["ReMeLight (文件记忆系统)"]
        RL1["Compactor (上下文压缩)"]
        RL2["Summarizer (写日记)"]
        RL3["FileWatcher (增量索引)"]
    end

    subgraph re["ReMe (向量记忆系统)"]
        RE1["Personal Summarizer"]
        RE2["Procedural Summarizer"]
        RE3["Tool Summarizer"]
    end

    RL3 --> FS["File Store<br>(chunks + embed)"]

    FS --> MS["MemorySearch<br>(混合检索 RAG)"]
    FS --> VS["VectorStore<br>(向量检索 RAG)"]

    style AGENT fill:#e8f4f8,stroke:#4a9
    style rl fill:#fff3cd,stroke:#ffc107
    style re fill:#d1ecf1,stroke:#17a2b8
    style FS fill:#e2e3e5,stroke:#6c757d
    style MS fill:#d4edda,stroke:#28a745
    style VS fill:#f8d7da,stroke:#dc3545
```

---

## 七、关键架构模式

| 模式 | 说明 | 实例 |
|------|------|------|
| **ReAct Agent** | 推理+行动循环，Agent 自主决定调用什么工具 | Compactor, Summarizer, 各类 Retriever |
| **层级委托** | 顶层编排 Agent 通过 DelegateTask 分派给类型专属 Agent | ReMeSummarizer → Personal/Procedural/Tool |
| **两阶段处理** | 先提取记忆，再更新画像 | PersonalSummarizer S1+S2 |
| **增量文件同步** | 检测追加型变更，仅重新计算新增部分 | DeltaFileWatcher |
| **混合检索融合** | 向量语义 + 关键词匹配加权融合 | MemorySearch (0.7 + 0.3) |
| **Registry 工厂** | 后端名 → 实现类的映射，支持热插拔 | R 注册 LLM/Embedding/VectorStore/FileStore |
| **YAML 配置** | 组件级 YAML 配置 + Pydantic 校验 | compactor.yaml, summarizer.yaml 等 |
