# OpenViking 记忆系统全景分析

> 基于源码深度分析，2026-05-16

---

## 一、记忆入库全流程 (Memory Ingestion Pipeline)

```mermaid
flowchart TD
    SESSION["用户会话 (Session)"] --> COMPRESS["会话压缩触发<br>SessionCompressor"]
    COMPRESS --> CTX["提取上下文准备<br>ContextProvider"]

    subgraph extract["ExtractLoop (ReAct 式编排器)"]
        subgraph step0["Step 0: 预取 (Pre-fetch)"]
            P1["ls 目录"]
            P2["读 .overview.md"]
            P3["语义搜索相关"]
        end

        subgraph step1["Step 1: LLM 工具调用 (最多 3 轮迭代)"]
            TOOLS["可用工具:<br>· MemoryReadTool → 读取单条记忆文件<br>· MemorySearchTool → 语义搜索已有记忆<br>· MemoryLsTool → 列出目录内容"]
            DECIDE["LLM 决策:<br>继续调用工具 ──或── 输出最终操作"]
            TOOLS --> DECIDE
        end
        step0 --> step1
    end

    CTX --> extract

    extract --> OPS

    subgraph ops["结构化记忆操作 (StructuredMemoryOps)"]
        OP1["write → 新建记忆文件"]
        OP2["edit → 修改已有记忆 (merge_op 决定策略)"]
        OP3["delete → 删除记忆"]
    end

    DECIDE --> OPS

    subgraph updater["MemoryUpdater (系统执行器)"]
        U1["1. 解析 MemoryTypeSchema (YAML 模板)"]
        U2["2. 渲染 Jinja2 模板 → 确定 URI 路径"]
        U3["3. 应用 MergeOp:<br>patch (增量编辑) · replace (全量替换)<br>sum (累加计数) · immutable (不可变)"]
        U4["4. 写入 VikingFS 文件系统"]
        U5["5. 生成/更新 .overview.md (L1 摘要)"]
        U1 --> U2 --> U3 --> U4 --> U5
    end

    OPS --> updater

    subgraph embed["向量化入库 (Embedding Pipeline)"]
        E1["1. 入队 EmbeddingMsg → EmbeddingQueue"]
        E2["2. TextEmbeddingHandler 消费队列"]
        E3["3. 调用 Embedder (dense + sparse)<br>支持 13 种提供商:<br>OpenAI / Jina / Voyage / Cohere /<br>Volcengine / Gemini / DashScope / ..."]
        E4["4. 写入向量数据库 (VectorIndexBackend)<br>L0(.abstract.md) → 向量 + 标量索引<br>L1(.overview.md) → 向量 + 标量索引<br>L2(内容文件) → 向量 + 标量索引"]
        E1 --> E2 --> E3 --> E4
    end

    updater --> embed

    subgraph dag["DAG 语义生成 (自底向上)"]
        D1["SemanticDagExecutor:"]
        D2["文件1 / 文件2 / 文件3 ← 并发 LLM 摘要"]
        D3["生成 .abstract.md (L0) / .overview.md (L1)"]
        D4["入队向量化任务"]
        D1 --> D2 --> D3 --> D4
    end

    embed --> dag

    style extract fill:#e8f4f8,stroke:#4a9
    style ops fill:#fff3cd,stroke:#ffc107
    style updater fill:#d4edda,stroke:#28a745
    style embed fill:#d1ecf1,stroke:#17a2b8
    style dag fill:#f8d7da,stroke:#dc3545
```

**关键设计决策**: ExtractLoop 使用 **ReAct 模式** (Reasoning + Acting)，让 LLM 自主决定需要读取哪些已有记忆，避免盲目覆盖。最多 3 轮迭代，平衡了探索深度与成本。

---

## 二、文件记忆的组织与管理

```
┌─────────────────────────────────────────────────────────────────────┐
│                   虚拟文件系统命名空间                                 │
│                   viking:// 协议                                     │
└─────────────────────────────────────────────────────────────────────┘

  viking://
  ├── user/{user_space}/                    ← 用户作用域 (跨会话持久)
  │   └── memories/
  │       ├── preferences/                  ← 偏好记忆
  │       │   └── {user}/{topic}.md
  │       ├── entities/                     ← 实体记忆 (Zettelkasten)
  │       │   └── {category}/{name}.md
  │       ├── events/                       ← 事件记忆 (不可变)
  │       │   └── {year}/{month}/{day}/{event}.md
  │       └── profile.md                    ← 用户画像
  │
  ├── agent/{agent_space}/                  ← Agent 作用域
  │   └── memories/
  │       ├── identity.md                   ← 身份认同
  │       ├── soul.md                       ← 核心价值观
  │       ├── experiences/                  ← 执行经验
  │       │   └── {name}.md
  │       ├── trajectories/                 ← 执行轨迹 (不可变)
  │       │   └── {name}_{timestamp}.md
  │       ├── skills/                       ← 技能记忆
  │       │   └── {skill_name}.md
  │       └── tools/                        ← 工具使用记忆
  │           └── {tool_name}.md
  │
  ├── session/{session_id}/                 ← 会话临时数据
  ├── resources/                            ← 共享知识库
  └── temp/                                 ← 临时文件
```

**每个目录三层语义结构**:

```
  memories/entities/projects/             ← 一个目录示例
  │
  ├── .abstract.md                        ← L0: 一行摘要 (~100 tokens)
  │   "用户的项目相关实体记忆"
  │
  ├── .overview.md                        ← L1: 详细概述 (~2k tokens)
  │   "包含以下项目: OpenViking, ..."
  │   "每个项目有详细的技术栈、状态..."
  │
  ├── .relations.json                     ← 关系图谱
  │   { "uris": ["viking://../events/..."],
  │     "reason": "该项目的决策记录" }
  │
  ├── OpenViking.md                       ← L2: 完整内容
  │   "## 项目概述\n..."
  │   "<!-- MEMORY_FIELDS\n{...} -->"      ← 结构化元数据嵌入
  │
  └── MyProject.md                        ← L2: 另一条记忆
```

**记忆生命周期管理**:

```mermaid
flowchart LR
    HOT["热记忆<br>(活跃使用)"] --> WARM["温记忆<br>(偶尔访问)"]
    WARM --> COLD["冷记忆<br>(归档)"]

    NOTE["hotness_score 公式:<br>score = sigmoid(log1p(active_count)) × exp(-decay_rate × age_days)<br>half_life = 7 天 (默认)<br>hotness &lt; 0.1 → 移入 _archive/<br>active_count++ 每次检索命中时递增"]

    HOT -.-> NOTE

    style HOT fill:#f8d7da,stroke:#dc3545
    style WARM fill:#fff3cd,stroke:#ffc107
    style COLD fill:#e2e3e5,stroke:#6c757d
```

---

## 三、语义化目录结构的形成机制

```
┌─────────────────────────────────────────────────────────────────────┐
│            语义化目录结构是如何形成的?                                  │
└─────────────────────────────────────────────────────────────────────┘

  层级 1: YAML Schema 定义记忆类型分类体系
  ──────────────────────────────────────────

  openviking/prompts/templates/memory/
  ├── entities.yaml        → 目录: entities/{category}/
  │   │                         文件: {name}.md
  │   │                         字段: category(不可变), content(patch)
  │   │                         操作: upsert
  │   │
  │   └── category 字段实现 Zettelkasten 分类法
  │       (如 "programming_tools", "colleagues", "concepts")
  │
  ├── events.yaml          → 目录: events/{year}/{month}/{day}/
  │                              文件: {event_name}.md
  │                              操作: add_only (不可变)
  │
  ├── preferences.yaml     → 目录: preferences/{user}/
  │                              文件: {topic}.md
  │                              字段: preference(patch), reason(patch)
  │
  └── experiences.yaml     → 目录: experiences/
                                 文件: {experience_name}.md
                                 字段: situation, approach, reflection

```mermaid
flowchart TD
    A["层级 2: Jinja2 模板动态渲染路径"] --> B["MemoryTypeRegistry 加载 YAML"]
    B --> C["directory: 'viking://user/\{\{ user_space \}\}/memories/entities'<br>filename_template: '\{\{ category \}\}/\{\{ name \}\}.md'"]
    C --> D["render_template(directory, context)"]
    D --> E["viking://user/abc123/memories/entities/programming_tools/vim.md"]

    style A fill:#e8f4f8,stroke:#4a9
    style E fill:#d4edda,stroke:#28a745
```
```

**层级 3: DAG 语义处理器自底向上构建摘要**

```mermaid
flowchart TD
    subgraph dag["SemanticDagExecutor (事件驱动懒分派)"]
        subgraph step1["Step 1: 遍历目录树, 构建 DirNode DAG"]
            TREE["memories/<br>├ entities/ (DirNode)<br>│  ├ programming_tools/ (DirNode)<br>│  │  ├ vim.md ← 并发 LLM 生成摘要<br>│  │  └ neovim.md ← 并发 LLM 生成摘要<br>│  └ colleagues/ (DirNode)<br>└ events/ (DirNode)"]
        end

        TREE --> STEP2["Step 2: 叶子节点完成 → 触发父节点<br>programming_tools/ 完成:<br>→ 生成 .abstract.md (L0)<br>→ 生成 .overview.md (L1)<br>→ 入队向量化任务<br>→ 通知父节点 entities/"]

        STEP2 --> STEP3["Step 3: 自底向上逐层聚合<br>最终: 每个目录都有 L0/L1 语义索引"]
    end

    style dag fill:#e8f4f8,stroke:#4a9
    style STEP3 fill:#d4edda,stroke:#28a745
```

**层级 4: 多租户隔离策略**

```
  ┌────────────────────────────────────────────────┐
  │  isolate_user_scope_by_agent:                  │
  │    user 记忆按 agent 隔离                       │
  │    viking://user/{space}/agent_{agent_id}/...   │
  │                                                │
  │  isolate_agent_scope_by_user:                  │
  │    agent 记忆按 user 隔离                       │
  │    viking://agent/{space}/user_{user_id}/...    │
  └────────────────────────────────────────────────┘
```

---

## 四、RAG 系统及其作用

**OpenViking 有完整的 RAG 系统**，且 RAG 是其核心能力之一，不是简单的 "embedding + 检索"，而是 **意图驱动的层级化检索**。

```mermaid
flowchart TD
    QUERY["用户查询:<br>'上次我们讨论的重构方案是什么?'"] --> STEP1

    subgraph step1["Step 1: 意图分析 (IntentAnalyzer)"]
        direction TB
        S1P["LLM 将查询分解为 QueryPlan"]
        Q1["TypedQuery[0]: type=MEMORY<br>query='重构方案决策记录' priority=1"]
        Q2["TypedQuery[1]: type=RESOURCE<br>query='重构技术方案文档' priority=2"]
        Q3["TypedQuery[2]: type=SKILL<br>query='重构相关技能' priority=3"]
        S1P --> Q1 & Q2 & Q3
    end

    step1 --> STEP2

    subgraph step2["Step 2: HierarchicalRetriever 层级检索"]
        direction TB
        R1["Round 1: 全局向量搜索 (L0 层)<br>query_embedding → dense + sparse 混合搜索<br>候选目录 (GLOBAL_SEARCH_TOPK = 10)"]
        R2["Round 2: 递归下钻子目录 (L1/L2 层)<br>· 搜索子目录 + 内容文件<br>· 分数传播: child_score += parent_score × alpha<br>· 混合热度: final = (1-a)×similarity + a×hotness<br>· 检测收敛 (top-k 不再变化则停止)"]
        R3["Round 3: 收敛检测 (最多 3 轮)<br>MAX_CONVERGENCE_ROUNDS = 3"]
        R1 --> R2 --> R3
    end

    step2 --> STEP3

    subgraph step3["Step 3: Rerank 重排序"]
        RR["可选的 Rerank 模型精排<br>支持: OpenAI / Volcengine / Cohere / LiteLLM<br>threshold: 最低相关性阈值 → 过滤低分结果"]
    end

    STEP3 --> STEP4

    subgraph step4["Step 4: 关系扩展 (Relation Expansion)"]
        RE["读取 .relations.json 扩展关联记忆<br>MAX_RELATIONS = 5"]
    end

    step4 --> RESULT["结果: FindResult<br>├ memories: [MatchedContext, ...]<br>├ resources: [MatchedContext, ...]<br>└ skills: [MatchedContext, ...]"]

    style step1 fill:#fff3cd,stroke:#ffc107
    style step2 fill:#d1ecf1,stroke:#17a2b8
    style step3 fill:#f8d7da,stroke:#dc3545
    style step4 fill:#d4edda,stroke:#28a745
```

**RAG 在 OpenViking 中的五个核心作用**:

```mermaid
flowchart TD
    subgraph r1["1. 记忆去重 (Memory Deduplication)"]
        R1A["新提取记忆"] --> R1B["search_similar_memories()"]
        R1B --> R1C{"向量相似度 > 阈值?"}
        R1C -->|"是"| R1D["MergeOp 合并而非新建"]
        R1C -->|"否"| R1E["新建记忆"]
    end

    subgraph r2["2. 记忆提取时的上下文预取 (Context Prefetch)"]
        R2A["ExtractLoop 的 Pre-fetch 阶段"] --> R2B["MemorySearchTool → 语义搜索已有记忆"]
        R2B --> R2C["让 LLM 看到已有记忆 → 避免重复/冲突"]
    end

    subgraph r3["3. 会话时的实时记忆召回 (Real-time Recall)"]
        R3A["Claude Code Plugin: auto-recall.mjs<br>UserPromptSubmit hook"] --> R3B["搜索 OpenViking"]
        R3B --> R3C["注入 openviking-context 到对话中"]
        R3C --> R3D["token 预算管理"]
    end

    subgraph r4["4. 层级化精确检索 (Hierarchical Retrieval)"]
        R4A["L0 全局定位"] --> R4B["L1 目录内细化"]
        R4B --> R4C["L2 精确命中"]
        R4C --> R4D["+ 分数传播 + 热度衰减 + Rerank"]
    end

    subgraph r5["5. 冷存储归档决策 (Archive Decision)"]
        R5A["MemoryArchiver 定期扫描"] --> R5B{"hotness_score &lt; 0.1?"}
        R5B -->|"是"| R5C["移入 _archive/<br>但向量索引保留 → 仍可被检索"]
    end

    style r1 fill:#fff3cd,stroke:#ffc107
    style r2 fill:#d1ecf1,stroke:#17a2b8
    style r3 fill:#d4edda,stroke:#28a745
    style r4 fill:#f8d7da,stroke:#dc3545
    style r5 fill:#e2e3e5,stroke:#6c757d
```

---

## 五、整体架构总览

```mermaid
flowchart TD
    subgraph clients["客户端"]
        C1["Claude Code"]
        C2["VikingBot (飞书等)"]
        C3["LangChain Integration"]
        C4["Custom Agent"]
    end

    clients --> API["FastAPI Server<br>· /api/v1/fs/* ← 文件系统操作<br>· /api/v1/search/* ← 搜索检索<br>· /api/v1/session/* ← 会话管理"]

    API --> VFS["VikingFS 文件系统"]
    API --> HR["Hierarchical Retriever<br>(RAG 引擎)"]
    API --> SM["Session Manager<br>(记忆管理)"]

    VFS & HR & SM --> STORE

    subgraph store["存储层"]
        direction TB
        RAGFS["RAGFS (Rust) 文件存储<br>├ localfs · s3fs · sqlfs<br>├ memfs · kvfs · queuefs"]
        VEC["Vector Index Engine (C++)<br>├ dense · sparse · bitmap"]
        EMB["Embedder (13 providers)"]
    end

    VFS --> RAGFS
    HR --> VEC
    HR --> EMB

    style clients fill:#e8f4f8,stroke:#4a9
    style API fill:#fff3cd,stroke:#ffc107
    style store fill:#e2e3e5,stroke:#6c757d
```

---

## 六、总结

OpenViking 的核心创新点在于将 **"文件系统隐喻"** 应用于 AI Agent 记忆管理:

1. **记忆不是平铺的 key-value**，而是有层级的目录树 (Zettelkasten 思想 + 时间维度)
2. **不是简单的 embedding 检索**，而是 L0/L1/L2 三层语义 + 意图分解 + 递归下钻的层级 RAG
3. **不是写后即忘**，而是有完整的生命周期 (提取→去重→合并→向量化→归档→热度衰减)
4. **不是单一存储**，而是文件系统 (RAGFS) + 向量数据库 (C++ Index) + 语义生成 (DAG) 三层协同
5. **RAG 不仅用于检索**，还用于去重、上下文预取、归档决策等贯穿全流程

---

## 关键源码索引

| 模块 | 路径 | 职责 |
|------|------|------|
| 记忆提取循环 | `openviking/session/memory/extract_loop.py` | ReAct 式编排，LLM 自主决策读写 |
| 记忆更新器 | `openviking/session/memory/memory_updater.py` | 执行写入/合并操作 |
| 记忆类型注册 | `openviking/session/memory/memory_type_registry.py` | 加载 YAML Schema，解析 Jinja2 模板 |
| 合并策略 | `openviking/session/memory/merge_op/` | patch/replace/sum/immutable |
| 语义 DAG | `openviking/storage/queuefs/semantic_dag.py` | 自底向上摘要生成 |
| 层级检索器 | `openviking/retrieve/hierarchical_retriever.py` | 三级递归下钻 + 分数传播 |
| 意图分析 | `openviking/retrieve/intent_analyzer.py` | LLM 分解查询为多类型子查询 |
| 热度评分 | `openviking/retrieve/memory_lifecycle.py` | sigmoid + 指数衰减 |
| 虚拟文件系统 | `openviking/storage/viking_fs.py` | viking:// URI 协议，L0/L1/L2 层级 |
| 向量后端 | `openviking/storage/viking_vector_index_backend.py` | 多租户隔离，dense+sparse 混合搜索 |
| C++ 索引引擎 | `src/index/` | 高性能向量/标量索引 |
| RAGFS | `crates/ragfs/` | Rust 文件系统插件 (local/s3/sql/mem/queue) |
| 记忆归档 | `openviking/session/memory_archiver.py` | 冷存储迁移 |
| 记忆去重 | `openviking/session/memory_deduplicator.py` | 向量相似度去重 |
| 目录预设 | `openviking/core/directories.py` | 预定义目录树结构 |
| 上下文模型 | `openviking/core/context.py` | ContextType/ContextLevel 枚举 |
| 记忆 YAML 模板 | `openviking/prompts/templates/memory/*.yaml` | 10 种记忆类型定义 |
