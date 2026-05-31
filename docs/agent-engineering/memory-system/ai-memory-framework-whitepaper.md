# AI Agent 记忆框架架构深度对比白皮书

## 五大框架：OpenViking · Letta (MemGPT) · ReMe · EverOS (EverMemOS) · GBrain

> 由三路并行子 Agent 深度源码审计 + 主控 Agent 横向对齐合成，基于开源项目实际源码分析。
>
> 审计日期：2026-05-21
>
> **2026-05-30 验证更新**：已按各项目官方仓库与公开架构文档交叉复核。Letta（v0.16.8）与 ReMe（v0.3.1.9）核心机制保持准确；OpenViking 保留 VFS/L0-L2 主结论，但存储后端与 MCP tool surface 已按当前仓库修正；GBrain 已按 `garrytan/gbrain`（v0.41.22）README、架构文档与教程补齐独立审计，旧稿中关于“单人限定 / 34 skills / Calibration 稳定能力”的表述已更正。

---

## 目录

1. [设计哲学与技术流派](#1-设计哲学与技术流派)
2. [深度源码审计报告](#2-深度源码审计报告)
3. [数据流转与生命周期对比](#3-数据流转与生命周期对比)
4. [总架构师评 Verdict：架构折中与融合演进](#4-总架构师评-verdict架构折中与融合演进)

---

## 1. 设计哲学与技术流派

### 横向对比总表

| 维度 | OpenViking | Letta (MemGPT) | ReMe | EverOS (EverMemOS) | GBrain |
|---|---|---|---|---|---|
| **核心架构流派** | 虚拟文件系统驱动 (VFS-Driven) | OS 虚拟内存模型 (Virtual Memory Model) | 管道式上下文检查与压缩 (Pipeline Compression) | 生物印记式自组织记忆 (Self-Organizing Imprinting) | Markdown 知识图谱 + 自布线 (Self-Wiring Knowledge Graph) |
| **核心数据抽象** | `viking://` 树状 URI + `Context` 记录 (L0/L1/L2) | `Block` (RAM) + `Passage` (Disk) + `Memory` (Page Table) | `ReMeLight` 内存管理器 + `ContextChecker` / `Compactor` 管道 | `MemCell` (原子边界单元) + 8 种记忆类型（Episode/Fact/Foresight/AgentCase/Skill…） | Page (Markdown) + typed Edge (知识图谱边) + Fact/Take (可验证声明) |
| **隐喻模型** | 文件系统：目录/文件/层级摘要 | 操作系统：进程/虚拟内存/页表/缺页中断 | 工程师：上下文窗口是有限预算，按需压缩 | 生物学：印记/编码/巩固/提取 | **大脑**：知识图谱自布线 + Dream Cycle 自主充实 |
| **核心痛点** | **检索失真与 Token 浪费** — 向量 RAG 的 flat search 丢失层级语义 | **长生命周期智能体** — Agent 需要跨 Session 持久记忆与自我修正 | **长对话/工具返回膨胀** — 复杂对话中 tool_result 导致上下文迅速溢出 | **跨 Session 长程记忆** — Agent 需要从对话中自动提取、结构化并进化记忆 | **可审计的持久知识与团队脑** — durable knowledge 需要留在 Git/Markdown 真相源，而不是埋在黑盒向量库里 |
| **存储后端** | Rust RAGFS + VectorDB 抽象（local/LanceDB、HTTP、VikingDB/private vikingdb 等） | PostgreSQL / SQLite + pgvector 归档 Passage + Block/Message ORM | Local / Chroma / Qdrant / Elasticsearch / Obvec / Zvec / Hologres + Markdown / JSONL | MongoDB + Elasticsearch + Milvus + Redis（四存储联合） | **Markdown in Git** + PGLite / Supabase(Postgres) + dense/BM25/graph 索引 |
| **面向用户** | Agent 开发平台 / 上下文数据库 | 独立 Agent 服务（有状态进程） | 工具箱组件（嵌入 AgentScope 或兼容循环） | 记忆操作系统（EverCore）+ 评测/集成框架 | **个人优先，也支持 company brain / federated multi-user** |
| **侵入性** | 中高 — 采纳 `viking://` 语义树时收益最大，也可通过 SDK/MCP 局部接入 | 中 — Agent 必须使用 Letta 的 Agent Loop | **低** — 仅需接入 `pre_reasoning_hook` | 中 — 通过 REST API / SDK 集成 | **低** — CLI/MCP 接入 + 43 个 curated skills |
| **检索策略** | 层级递归（L0→L1→L2 分数传播） | archival_memory_search（向量） + conversation_search（recall） | 混合向量+BM25 (0.7/0.3) | **四种**：Keyword / Vector / Hybrid(Rerank) / Agentic(LLM多轮) | Hybrid (dense + BM25 + RRF) + **graph-query fast path** + Source-tier 信号 + Rerank |
| **Agent 自主编辑** | 无 | **是**（memory tools） | 无 | 无（全自动提取） | **是**（MCP tools 读写 Page/Edge/Fact） |
| **记忆类型丰富度** | 10 种（YAML Schema） | 自定义 Block label | 3 种（Personal/Procedural/Tool） | **8 种**（含 Foresight 预测 + Agent Skill 进化） | 少量 durable primitives（Page / Timeline / Fact / Take / Edge）+ schema packs |
| **多租户** | account_id 隔离 | 无 | 无 | **原生支持**（每层存储独立隔离） | 有限支持（personal-first；已支持 company brain / login-scoped federation） |

### 五种哲学的本质分歧

**OpenViking** — 记忆不是一堆 embedding 向量，而是一棵有层级的语义树。传统 RAG 的 "query → flat vector search → top-k" 模式丢失了人类组织知识的自然结构。OpenViking 用 `viking://` URI 把一切资源、记忆、技能组织成文件系统，用"目录递归检索"模拟人类翻阅文件夹的认知过程。

**Letta** — Agent 就是一个操作系统进程。上下文窗口是 RAM，数据库是 Disk，Memory Block 是进程的栈帧。Agent 必须像操作系统一样管理自己的内存——知道哪些放在"RAM"里（高频访问的 persona/human 块），哪些换出到"Disk"（archival passages），并在 RAM 满时触发"缺页中断"进行压缩。Agent 还应通过工具调用修改自己的核心记忆（自我修正）。

**ReMe** — 不要重建框架，只需要一个聪明的中间件。长对话的本质问题是 token 预算有限，而 tool_result 和多轮对话不断膨胀。在每次推理前插入一个"检查-压缩"管道，智能地判断哪些消息可以压缩、哪些必须保留，并严格保证 tool_use/tool_result 的配对完整性。

**EverOS** — 记忆是 Agent 的生物印记。对话不是数据，而是 Agent 的"经历"——系统应像生物大脑一样自动从经历中提取、结构化、巩固和进化记忆。EverCore 用 MemCell 切分对话边界，用 8 种记忆类型（从原子事实到预测性 Foresight 到可进化 Skill）全方位编码经历，并通过 Agentic 检索（LLM 引导多轮 + 充分性检查）确保提取质量。其独特之处在于 Agent 记忆管线——Agent 的 tool call 经验被压缩、聚类、进化为可复用的 Skill，带有成熟度追踪。

**GBrain** — 记忆是一个可 `git diff` 的知识大脑。Markdown 是真相源，Git 是版本控制，PGLite/Supabase 承担检索索引，知识图谱在 Page 写入时以 **零 LLM auto-link** 自布线。GBrain 更像 durable knowledge / institutional memory，而不是对话级 volatile memory；官方文档明确区分“brain”与“memory”。能力主要沉淀在 43 个 curated skills 与 30+ MCP tools 上。独特之处包括：Dream Cycle（夜间自主充实知识图谱）、Synthesis 层（`gbrain think` 生成带引用与知识缺口分析的综合答案）、split-engine topologies（本地脑 + 云检索、company brain、federated personal brain）、Schema Packs 与 soul-audit / contradiction checks。

---

## 2. 深度源码审计报告

> 各框架的完整源码级审计报告见同目录下的独立文档：
>
> - [OpenViking 深度审计](./openviking-deep-audit.md) — VFS 架构、L0/L1/L2 分层加载、目录递归检索
> - [Letta 深度审计](./letta-deep-audit.md) — OS 虚拟内存模型、Memory Block、状态同步与自我修正
> - [ReMe 深度审计](./reme-deep-audit.md) — ContextChecker/Compactor 协同、会话压缩与 Turn 完整性
> - [EverOS 深度解析](./everos-deep-audit.md) — 六层架构、8 种记忆类型、Agentic 检索、Agent Skill 进化
> - [GBrain 深度审计](./gbrain-deep-audit.md) — Git 原生知识库、split-engine 检索、graph-query、Dream Cycle
>
> 补充阅读：
>
> - [技术路线快速阅读指南](./memory-framework-tech-routes-quick-guide.md) — 按文件系统 / RAG / 图谱 / 压缩中间件路线快速选型

### 核心发现速览

#### OpenViking：分层加载与递归检索

- **`ContextLevel` 枚举** (`openviking/core/context.py:34`)：L0(ABSTRACT ~100 tokens)、L1(OVERVIEW ~2000 tokens)、L2(DETAIL 全文)
- **物理存储**：每个目录下隐藏文件 `.abstract.md` (L0)、`.overview.md` (L1)
- **语义处理引擎**：`SemanticProcessor` (`storage/queuefs/semantic_processor.py:70`) 通过 DAG 执行器自底向上生成摘要
- **递归检索核心**：`HierarchicalRetriever` (`retrieve/hierarchical_retriever.py:45`)，5 步算法——全局向量搜索 → 合并起始点 → 递归搜索（min-heap + 分数传播 `final_score = alpha * child_score + (1-alpha) * parent_score`）→ 收敛检测（连续 3 轮 top-k 不变则停止）
- **热度分数**：`score = sigmoid(log1p(active_count)) * exp(-decay_rate * age_days)`，结合访问频率与时间衰减

#### Letta：OS 虚拟内存管理

- **Block** (`schemas/block.py:67`)："A Block represents a reserved section of the LLM's context window"，含 `value`、`limit`、`label`、`read_only`
- **乐观锁** (`orm/block.py:56-61`)：`version` 列防止并发 lost update
- **Memory.compile()** (`schemas/memory.py:688`)：将 Block 渲染为 XML 注入 system prompt
- **缺页中断**：`_rebuild_context_window()` (`letta_agent.py:1576`) 在 `ContextWindowExceededError` 时强制 summarizer 压缩
- **Memory Tools** (`functions/function_sets/base.py`)：`core_memory_append/replace`、`memory_replace/insert`、`archival_memory_insert/search`
- **Sleeptime Agent**：记忆管理 offload 到后台独立 Agent（通过 `LETTA_SLEEPTIME_CORE` ToolType + `voice_sleeptime_agent.py` 实现）

#### ReMe：会话自适应压缩

- **四阶段管道** (`reme_light.py:563` `pre_reasoning_hook`)：Tool Result 截断 → 阈值计算 → 上下文检查与分割 → 压缩 + 异步总结
- **Turn 完整性保证** (`memory/file_based/utils/as_msg_handler.py:273-398`)：反向迭代 + tool_use/tool_result 依赖映射 + `validate_tool_ids_alignment()` 验证
- **三重安全机制**：依赖追踪 / Token 预算核算 / 完整性验证（不对齐则放弃压缩）
- **三级压缩**：Tool Result 截断（无损）→ LLM 结构化摘要（有损）→ 原始对话归档（无损）
- **混合检索**：向量相似度 (0.7) + BM25 关键词 (0.3)

#### EverOS：自组织记忆与 Agent Skill 进化

- **MemCell 边界检测** (`src/memory_layer/memcell_extractor/`)：LLM 驱动的流式话题边界检测，硬限制 65K tokens / 500 条消息
- **8 种记忆类型**：Profile / Episodic Memory / Foresight / Atomic Fact / Raw Message / Agent Memory / Agent Case / Agent Skill
- **Agentic 检索** (`memory_manager.py`)：LLM 引导多轮检索——Round 1 混合检索 + Rerank → 充分性检查 → 不足时生成互补 Query → 并行检索 → 合并。配置：`round1_rerank_top_n=10, num_queries=3, combined_total=40`
- **Agent Skill 进化**：AgentCase 提取（高门槛：具体问题+递进深化+可迁移方法论）→ 聚类 → AgentSkillExtractor 增量 `add/update/none` → maturity_score + confidence 追踪
- **Foresight 预测**：预测用户未来行为变化，带时间范围 + 证据锚定
- **原生多租户**：MongoDB(Interceptor) / ES(Field注入) / Milvus(Collection Proxy) / Redis(Key前缀) 四层隔离，ContextVar async 安全
- **工具轨迹压缩**：`AGENT_TOOL_PRE_COMPRESS_PROMPT` 将 tool call 轨迹压缩至 ~10%，保留因果链

#### GBrain：Markdown 知识图谱与自布线检索

- **split-engine 架构**：Brain Repo (Markdown in Git) ↔ Retrieval Engines（PGLite for local，Supabase/Postgres at scale）↔ Skills / MCP（43 curated skills，30+ tools）
- **auto-link / self-wiring**：Page 写入时用纯模式匹配补 backlinks 与 typed edges，基础写入路径**零 LLM**
- **检索与综合**：dense + BM25 + RRF + source-tier boosts；typed relationship query 走 `graph-query` fast path；`gbrain think` 产出引用化 synthesis + gap analysis
- **多拓扑**：官方文档明确支持单仓个人脑、本地脑 + 云检索、company brain、federated personal brain
- **Dream Cycle / 知识卫生**：cron 驱动的 Fact 提取、Edge 补全、Page 合并、schema/consistency 检查与矛盾扫描
- **Schema Packs**：基础原语很少，但 page types 可通过 schema packs 扩展，官方已提供 `people / companies / concepts / meetings / deals / originals / writing` 等 pack
- **边界条件**：GBrain 更擅长 durable knowledge，不是挥发性 user preference memory 的直接替代

---

## 3. 数据流转与生命周期对比

### 场景：Agent 经历 100 轮长对话 → 产生用户偏好 → Session 结束

```mermaid
flowchart TB
    subgraph "通用场景"
        START([对话开始]) --> CONV[100轮对话进行中]
        CONV --> PREF[第87轮：用户表达偏好<br/>"我喜欢用 Rust 写 CLI 工具"]
        PREF --> END([Session 结束])
    end

    subgraph OpenViking["OpenViking 数据流"]
        OV1[SessionCompressor 压缩对话] --> OV2[MemoryExtractor 提取记忆]
        OV2 --> OV3[MemoryArchiver 归档到<br/>viking://user/id/memories/]
        OV3 --> OV4[SemanticProcessor<br/>生成 .abstract.md + .overview.md]
        OV4 --> OV5[EmbeddingQueue 向量化 L0/L1/L2]
        OV5 --> OV6[(向量数据库)]
        PREF -.->|触发| OV1
    end

    subgraph Letta["Letta 数据流"]
        LT1[Agent 调用 core_memory_replace<br/>修改 Human Block] --> LT2[block_manager<br/>持久化到 PostgreSQL]
        LT2 --> LT3[rebuild_system_prompt<br/>重建系统提示]
        LT3 --> LT4[archival_memory_insert<br/>写入 archival_passages]
        LT4 --> LT5[(PostgreSQL + pgvector)]
        PREF -.->|Agent 主动调用工具| LT1
    end

    subgraph ReMe["ReMe 数据流"]
        RM1[pre_reasoning_hook<br/>触发上下文检查] --> RM2[ContextChecker<br/>反向迭代 + 依赖追踪]
        RM2 --> RM3[Compactor LLM 生成<br/>结构化摘要]
        RM3 --> RM4[写入 memory/YYYY-MM-DD.md]
        RM3 --> RM5[messages 归档到<br/>dialog/YYYY-MM-DD.jsonl]
        RM4 --> RM6[(ChromaDB 向量索引)]
        PREF -.->|随压缩流程捕获| RM1
    end

    subgraph EverOS["EverOS 数据流"]
        EV1[POST /api/v1/memories<br/>接收原始消息] --> EV2[ConvMemCellExtractor<br/>LLM 边界检测 → MemCell]
        EV2 --> EV3["并行提取 (asyncio.gather)<br/>Episode / Fact / Foresight / AgentCase"]
        EV3 --> EV4[MongoDB 持久化]
        EV4 --> EV5[ES + Milvus 索引]
        EV5 --> EV6[Profile 异步更新]
        EV5 --> EV7[AgentSkillExtractor<br/>Case 聚类 → Skill 进化]
        PREF -.->|API 写入自动提取| EV1
    end

    subgraph GBrain["GBrain 数据流"]
        GB1["Agent/操作者写入<br/>Page/Timeline/Fact"] --> GB2["auto-link / self-wiring<br/>(基础写入零 LLM)"]
        GB2 --> GB3["Markdown 写入磁盘<br/>(Git 版本控制)"]
        GB3 --> GB4["PGLite / Supabase 索引<br/>dense + BM25 + graph signals"]
        GB4 --> GB5["Dream Cycle / consistency jobs<br/>夜间充实与清洗"]
        PREF -.->|仅适合稳定偏好/持久知识| GB1
    end

    subgraph NewSession["新 Session 唤醒"]
        NS1[新对话开始] --> NS2{选择框架}
        NS2 -->|OpenViking| OV7[HierarchicalRetriever<br/>L0→L1→L2 递归检索]
        NS2 -->|Letta| LT6[refresh_memory_async<br/>自动加载 Block 到 system prompt]
        NS2 -->|ReMe| RM7[memory_search<br/>混合向量+BM25 搜索]
        NS2 -->|EverOS| EV8["MemoryManager.retrieve_mem()<br/>Agentic 多轮检索 + Rerank"]
        NS2 -->|GBrain| GB6["gbrain search / think / graph-query<br/>Hybrid + fast-path + Synthesis"]
        OV7 --> NS3[偏好信息注入上下文]
        LT6 --> NS3
        RM7 --> NS3
        EV8 --> NS3
        GB6 --> NS3
    end
```

### 唤醒阶段对比

| 维度 | OpenViking | Letta | ReMe | EverOS | GBrain |
|------|-----------|-------|------|--------|--------|
| **偏好捕获方式** | MemoryExtractor 从对话中抽取 | Agent **主动**调用 memory tools | Compactor 摘要中 "User Preferences" 段落 | API 写入 → 并行提取（Episode + Fact + Profile） | 需显式写入 durable Page/Timeline；不擅长捕获高频短期偏好 |
| **加工方式** | SemanticProcessor 生成 3 级摘要 | 直接写入 Block value + BlockHistory 快照 | LLM 结构化摘要 | LLM 驱动多路提取 → 8 种结构化记忆类型 | Page 写入触发 auto-link/self-wiring；查询阶段可选 LLM rewrite / rerank / synthesis |
| **持久化** | 向量数据库 3 级索引 + VFS 文件 | PostgreSQL blocks + archival_passages | memory/*.md + dialog/*.jsonl + ChromaDB/可插拔后端 | MongoDB + ES + Milvus（四存储联合） | **Markdown in Git** + PGLite / Supabase 索引 |
| **新 Session 唤醒** | HierarchicalRetriever 递归检索 | refresh_memory_async 自动加载 | memory_search 混合检索 | Agentic 多轮检索 + 充分性检查 + Rerank | `gbrain search` / `think` / `graph-query` |
| **Token 成本** | **极低**：仅命中 L0 摘要 (~100 tokens)，按需深入 | **零额外成本**：Block 始终在 system prompt | **低**：搜索返回 top 片段注入 | **中等**：Agentic 检索需 LLM 多轮调用 | **低**：基础写入零 LLM，仅 rewrite / rerank / think 等高级路径用模型 |
| **偏好精确度** | 中等 — 依赖摘要质量 | **最高** — 原文直接存储 | 中等 — 依赖摘要质量 | **高** — 多路提取 + Rerank，但非原文存储 | **高（针对 durable knowledge）**，但不是 volatile user prefs 最佳层 |
| **Agent 记忆** | 不支持 | 不支持（Block 通用） | 不支持 | **支持**：AgentCase + AgentSkill 进化 | 间接支持（可存 runbook/知识，但无原生 Case→Skill 进化） |

---

## 4. 总架构师评 Verdict：架构折中与融合演进

### 4.1 OpenViking 的架构得失

**颠覆性贡献**：
- 对 Flat Vector RAG 的范式革命——VFS + 递归检索把"搜索"变成"浏览"，在大规模知识库 (>10万文档) 下优势显著
- Token 效率极高：L0 (~100 tokens) → L1 (~2000 tokens) → L2 (全文) 渐进式加载

**局限与技术债**：
- 摘要质量是单点故障：L0/L1 摘要若不好，递归检索方向就会偏离
- 冷启动成本高：每个新资源需经过 SemanticProcessor + 向量化，写入延迟显著
- 架构重：Rust RAGFS + Python FastAPI + 向量数据库 + 多队列系统
- 缺乏 Agent 自主记忆编辑：更偏"被动检索服务"

### 4.2 Letta 的架构得失

**颠覆性贡献**：
- OS 隐喻的优雅抽象：Block = RAM 页帧、BlockHistory = swap journal、archival_passages = disk、message_ids = page table
- Agent 的"自我修正"能力——通过 memory tools 修改 Block，让 Agent 可以积累经验、自我进化
- Sleeptime Agent 模式：记忆管理 offload 到后台 Agent，优雅的关注点分离

**架构挑战**：
- 并发瓶颈：乐观锁在"多 Agent 协作 + 共享记忆"场景下会导致大量重试
- 模型切换风险：不同模型 system prompt 长度 / tool calling 能力不同，Block limit 是字符数而非 token 数
- 有状态 = 不可水平扩展：每个 Agent 是有状态进程，需要 Session affinity 或状态序列化
- PostgreSQL 单点依赖：所有状态集中于一个数据库

### 4.3 ReMe 的架构得失

**颠覆性贡献**：
- 极低侵入性：仅需在推理循环中插入 `pre_reasoning_hook()` 调用
- Turn 完整性的严谨保证：反向迭代 + 依赖追踪 + 完整性验证的三重机制
- 可读性与可调试性：所有持久化都是人类可读的 Markdown/JSONL

**架构挑战**：
- 依赖 AgentScope：深度绑定其 `Msg`/`ReActAgent` 抽象（工具系统使用自定义 `FileIO` 类而非 AgentScope 的 `Toolkit`）
- LLM 依赖：压缩本身需要调用 LLM，在 token 极度紧张时是"用 token 换 token"的悖论
- 检索能力相对弱：文件搜索相比 OpenViking 层级检索和 Letta 结构化 Block 检索精度较低

### 4.4 EverOS 的架构得失

**颠覆性贡献**：
- **最完整的记忆类型体系**：8 种类型覆盖从原始消息到 Foresight（预测性记忆）到 Agent Skill（自进化技能）的完整生命周期，其中 Foresight 和 Agent Skill 是四个框架中独有能力
- **生产级多租户架构**：MongoDB/ES/Milvus/Redis 四层存储均有原生租户隔离（Interceptor/Field注入/Collection Proxy/Key前缀），ContextVar 保证 async 安全
- **Agentic 检索**：唯一将"检索是否充分"纳入循环的框架——LLM 引导多轮 + 充分性检查 + Query 扩展
- **Agent 记忆管线**：Case 提取 → 聚类 → Skill 增量进化 → maturity_score 追踪，让 Agent 从自身经验中学习
- **Benchmark 驱动**：自建 EverMemBench + EvoAgentBench 评测体系

**架构挑战**：
- 基础设施重量：最小部署需 MongoDB + ES + Milvus + Redis 四个外部服务，冷启动和运维成本高
- 缺乏 Agent 自主编辑：所有记忆提取全自动，Agent 无法像 Letta 一样主动修改核心记忆
- 无上下文压缩能力：不参与当前对话的上下文管理，长对话压缩需与 ReMe 等工具配合
- LLM 依赖密集：边界检测 + 6 种提取器 + Agentic 充分性检查均需 LLM 调用，Token 成本显著
- 写入延迟：消息接收到记忆可检索需经过边界检测 + 多路提取 + 向量化 + 索引，端到端延迟较高

### 4.5 GBrain 的架构得失

**颠覆性贡献**：
- **Markdown 即真相源**：所有记忆都是 Git 版本控制的 Markdown 文件，操作者可以 `git diff` 看 Agent 学到了什么、`git branch` 分叉知识、从 repo 重建数据库——这是五个框架中唯一让记忆完全人类可审计的设计
- **零 LLM 基础写入成本**：auto-link / typed edge 自布线是确定性的（非 LLM 驱动），写 Page 本身不消耗 Token，在大规模知识库下成本优势显著
- **Synthesis + Gap Analysis**：`gbrain think` 不仅检索，还生成带引用的结构化答案并指出"大脑还不知道什么"——五个框架中唯一的综合推理层
- **Dream Cycle + split-engine**：夜间 cron 任务批量充实知识图谱（Fact 提取、Edge 补全、Page 合并），同时支持本地脑 + 云检索、company brain、federated personal brain 等拓扑
- **图信号检索**：邻接 boost / 跨源 boost / Session 降权，利用知识图谱拓扑增强检索精度（BrainBench +31.4 P@5）
- **Graph Query fast path**：关系型问题不必总走 dense search，可直接走 typed traversal，适合“谁认识谁 / 谁投资了谁 / 哪次会议决定了什么”这类查询

**架构挑战**：
- Brain != memory：官方明确区分 durable brain 与 volatile memory；如果需求是“记住这轮对话的临时偏好/上下文”，GBrain 不是第一选择
- Personal-first：虽然已经支持 company brain / login-scoped federation，但它仍不是通用 SaaS 记忆控制面
- TypeScript/Bun 技术栈：与其他框架的 Python 生态不互通，MCP 是唯一的集成点
- 无上下文压缩能力：不参与当前对话的上下文管理
- 无 Agent 自进化管线：不像 EverOS 有 Case→Skill 进化，聚焦知识图谱而非 Agent 经验
- 能力面分散：不少高级能力公开在 README / docs / skills 中，而不是单一稳定 API；版本演进快，落地前需要按当前文档复核

### 4.6 终极融合方案：生产级 AI 记忆系统

```
┌─────────────────────────────────────────────────────────────────┐
│                    融合架构：五层记忆系统                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Layer 0: 热记忆 (Hot Memory)  ← 取自 Letta                    │
│  ┌───────────────────────────────────┐                          │
│  │  Block-based Core Memory          │                          │
│  │  • persona / human / skills       │  ← 始终在 system prompt  │
│  │  • Agent 可通过 tools 自主编辑     │  ← 零检索成本            │
│  │  • BlockHistory + 乐观锁          │  ← 安全并发              │
│  └───────────────────────────────────┘                          │
│                       ↕ 同步                                     │
│  Layer 1: 温记忆 (Warm Memory)  ← 取自 ReMe + EverOS           │
│  ┌───────────────────────────────────┐                          │
│  │  Context Compression + Multi-Type │                          │
│  │  • ReMe: pre_reasoning_hook 管道  │  ← 当前对话压缩         │
│  │  • Turn 完整性保证 (依赖追踪)      │  ← 安全压缩              │
│  │  • EverOS: Episode + Fact +       │  ← 结构化长期记忆        │
│  │    Foresight 多类型提取           │                          │
│  │  • Foresight 预测性记忆           │  ← 前瞻性知识            │
│  └───────────────────────────────────┘                          │
│                       ↕ 索引                                     │
│  Layer 2: 知识记忆 (Knowledge Memory)  ← 取自 GBrain            │
│  ┌───────────────────────────────────┐                          │
│  │  Self-Wiring Knowledge Graph      │                          │
│  │  • Markdown in Git (真相源)        │  ← 人类可审计            │
│  │  • Typed Edge 自布线 (零 LLM)     │  ← Token 极致优化        │
│  │  • Synthesis + Gap Analysis       │  ← 综合推理 + 缺口发现   │
│  │  • Dream Cycle 夜间充实           │  ← 自主知识积累          │
│  │  • Schema packs / soul-audit      │  ← 知识卫生与演化        │
│  └───────────────────────────────────┘                          │
│                       ↕ 索引                                     │
│  Layer 3: 冷记忆 (Cold Memory)  ← 取自 OpenViking               │
│  ┌───────────────────────────────────┐                          │
│  │  VFS + Hierarchical Retrieval     │                          │
│  │  • viking:// URI 命名空间          │  ← 统一组织所有知识       │
│  │  • L0/L1/L2 渐进式加载            │  ← Token 极致优化        │
│  │  • 目录递归检索                    │  ← 语义层级导航          │
│  │  • 热度分数 + 向量分数混合排序     │  ← 精准召回              │
│  └───────────────────────────────────┘                          │
│                       ↕ 进化                                     │
│  Layer 4: 进化记忆 (Evolution Memory)  ← 取自 EverOS            │
│  ┌───────────────────────────────────┐                          │
│  │  Agent Skill Evolution            │                          │
│  │  • AgentCase 提取 (高门槛过滤)     │  ← 经验编码              │
│  │  • Case 聚类 → Skill 增量提取     │  ← 可迁移方法论          │
│  │  • maturity_score + confidence    │  ← 可靠度追踪            │
│  │  • 工具轨迹压缩 (~10%)            │  ← Token 效率            │
│  └───────────────────────────────────┘                          │
│                                                                 │
│  Agent Loop:  ← 取自 Letta 的进程模型                           │
│  • Agent 是有状态进程，可跨 Session 存活                         │
│  • Sleeptime Agent 异步整理记忆                                  │
│  • Memory Tools 让 Agent 自主管理热记忆                          │
│                                                                 │
│  压缩管道:  ← 取自 ReMe 的安全机制                               │
│  • 每步推理前检查上下文预算                                       │
│  • 反向迭代 + 依赖追踪保证 Turn 完整性                           │
│  • 压缩失败时 graceful degradation（跳过而非破坏）               │
│                                                                 │
│  检索引擎:  ← 取自 OpenViking + GBrain + EverOS                 │
│  • 冷记忆通过 VFS 组织，递归检索按需加载                         │
│  • 知识记忆通过 GBrain 图信号 + Synthesis 综合推理               │
│  • 温记忆通过 EverOS Agentic 检索（多轮+充分性检查+Rerank）      │
│  • 热记忆直接在 system prompt 中，零检索成本                     │
│                                                                 │
│  多租户:  ← 取自 EverOS 的四层隔离                               │
│  • MongoDB / ES / Milvus / Redis 每层原生租户隔离               │
│  • ContextVar 保证异步安全                                       │
│                                                                 │
│  知识审计:  ← 取自 GBrain 的 Git 真相源                          │
│  • 所有知识记忆 Git 版本控制，可 diff/branch/revert              │
│  • Dream Cycle 夜间自主充实                                      │
│  • Contradiction / soul-audit 检查                               │
└─────────────────────────────────────────────────────────────────┘
```

**融合的关键设计决策**：

1. **分层温度管理**：热记忆（Block，始终在 context）→ 温记忆（压缩摘要 + 多类型记忆，按需检索）→ 知识记忆（GBrain 图谱，综合推理）→ 冷记忆（VFS 全文，层级检索）→ 进化记忆（Agent Skill，持续成长）。Agent 自主决定什么信息放在哪一层。

2. **压缩与检索解耦**：ReMe 负责"把长对话压缩成结构化摘要"，EverOS 负责"从对话中提取多类型长期记忆并进化 Agent 技能"，GBrain 负责"知识图谱自布线与综合推理"，OpenViking 负责"在大量记忆中高效检索"，Letta 负责"让 Agent 有自主管理记忆的工具"。五者各司其职。

3. **优雅降级**：借鉴 ReMe 的 `is_valid` 安全机制——任何环节出错都不应破坏 Agent 正常运行，而是回退到更低精度但更安全的策略。

4. **人类可审计**：融合 ReMe 的"记忆即文件"和 GBrain 的"Markdown in Git"哲学——所有持久化记忆都应是人类可读、可编辑、可版本控制的。

5. **自进化闭环**：借鉴 EverOS 的 Agent Skill 进化——Agent 的每一次任务执行都是学习机会，经聚类和成熟度追踪形成可靠的方法论库。

6. **知识缺口感知**：借鉴 GBrain 的 Synthesis + Gap Analysis——不仅检索已知知识，还主动识别"大脑还不知道什么"，驱动 Dream Cycle 定向充实。
