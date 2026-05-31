# EverOS (EverMemOS) 技术深度解析

> 基于 EverOS 开源仓库（[GitHub](https://github.com/EverMind-AI/EverOS)）的实际源码与文档分析。
>
> 审计日期：2026-05-30

---

## 目录

1. [项目全景](#1-项目全景)
2. [EverCore：记忆操作系统](#2-evercore记忆操作系统)
3. [六大分层架构](#3-六大分层架构)
4. [记忆类型体系](#4-记忆类型体系)
5. [写入管线：从对话到结构化记忆](#5-写入管线从对话到结构化记忆)
6. [检索引擎：四种策略](#6-检索引擎四种策略)
7. [提示词工程](#7-提示词工程)
8. [存储与索引](#8-存储与索引)
9. [多租户设计](#9-多租户设计)
10. [Agent 记忆：EverCore 独有能力](#10-agent-记忆evercore-独有能力)
11. [HyperMem：超图记忆架构](#11-hypermem超图记忆架构)
12. [Benchmark 评测体系](#12-benchmark-评测体系)
13. [Use Cases：集成模式](#13-use-cases集成模式)
14. [与 OpenViking / Letta / ReMe 的对比定位](#14-与-openviking--letta--reme-的对比定位)
15. [架构得失总结](#15-架构得失总结)

---

## 1. 项目全景

EverOS 是 EverMind AI 推出的 **长程记忆操作系统**（Long-term Memory OS），为自进化 Agent 提供统一的记忆存储、提取、检索和评测框架。仓库分为三个核心部分：

| 模块 | 定位 | 关键指标 |
|------|------|---------|
| **EverCore** | 生产级记忆操作系统 | LoCoMo **93.05%** · LongMemEval **83.00%** |
| **HyperMem** | 超图层级记忆（研究阶段） | LoCoMo **92.73%** |
| **EverMemBench** | 多人群聊记忆质量评测 | 支持 EverCore / Mem0 / Memobase / Zep |
| **EvoAgentBench** | Agent 自进化评测 | 5 领域 · 5 种自进化方法对比 |

**技术栈**：Python 3.12 · FastAPI · MongoDB 7+ · Elasticsearch 8.x · Milvus 2.4+ · Redis 7.x · Beanie ODM · Docker Compose

**设计隐喻**：受生物"印记"（Imprinting）启发——记忆不是被动存储的数据，而是 Agent 从对话中自动"习得"并持续巩固的知识。双轨架构（**记忆构建** + **记忆感知**）映射认知科学中的"编码 + 提取"。

---

## 2. EverCore：记忆操作系统

### 核心入口

| 入口 | 路径 | 职责 |
|------|------|------|
| 应用启动 | `methods/EverCore/src/run.py` | FastAPI 服务启动，监听 `:1995` |
| 记忆管理器 | `methods/EverCore/src/agentic_layer/memory_manager.py` | 统一读写接口 |
| REST API | `methods/EverCore/src/infra_layer/adapters/input/api/memory/` | HTTP 端点 |
| 提示词 | `methods/EverCore/src/memory_layer/prompts/` | EN/ZH 双语 Prompt |
| 评测 | `methods/EverCore/evaluation/` | 评测运行器与报告 |

### Quick Start

```bash
cd methods/EverCore
docker compose up -d          # MongoDB + ES + Milvus + Redis
uv sync                       # 安装依赖
cp env.template .env          # 配置 LLM_API_KEY + VECTORIZE_API_KEY
uv run python src/run.py      # 启动服务
curl http://localhost:1995/health  # 验证
```

---

## 3. 六大分层架构

EverCore 采用六层分层设计，每层职责清晰：

```
┌────────────────────────────────────────────────────────────┐
│  Agentic Layer — 统一记忆接口                               │
│  MemoryManager: memorize() / get_mem() / retrieve_mem()    │
├────────────────────────────────────────────────────────────┤
│  Memory Layer — LLM 驱动的记忆提取                          │
│  MemCell Extractor → Episode/Fact/Foresight/Agent Extractor│
├────────────────────────────────────────────────────────────┤
│  Business Layer — 核心业务逻辑                               │
│  mem_memorize.py: 管线编排 · mem_sync.py: 跨系统同步        │
├────────────────────────────────────────────────────────────┤
│  Infrastructure Layer — 外部服务适配器                       │
│  REST Controllers · Persistence Repos · Search Repos       │
├────────────────────────────────────────────────────────────┤
│  Core Framework — 基础设施                                   │
│  DI 容器 · 生命周期 · 中间件 · 事件 · 限流 · 分布式锁       │
├────────────────────────────────────────────────────────────┤
│  Common Utilities — 工具函数                                 │
│  时间处理 · JSON · 文本 · 语言检测 · Base62 ID              │
└────────────────────────────────────────────────────────────┘
```

### 3.1 Agentic Layer

`MemoryManager` 是记忆系统的统一入口，三个主方法：

- **`memorize()`** — 写入路径：接收原始消息，触发提取管线
- **`get_mem()`** — 结构化查询：支持 AND/OR 过滤 DSL、分页、时间范围
- **`retrieve_mem()`** — 检索路径：基于 prompt 的智能检索，支持四种策略

协调向量化（`vectorize_service`）、重排序（`rerank_service`）和 Profile 搜索。

### 3.2 Memory Layer

所有 LLM 驱动的提取逻辑：

- **`ConvMemCellExtractor`** — 流式对话边界检测，硬限制 65K tokens / 500 条消息
- **`EpisodeMemoryExtractor`** — 叙事性 episode 记忆提取
- **`AtomicFactExtractor`** — 原子事实提取（每个事实只表达一个语义单元）
- **`ForesightExtractor`** — 预测性记忆（带时间范围和证据链）
- **`ProfileExtractor`** — 用户画像（显式信息 + 隐式特征）
- **`AgentCaseExtractor`** — Agent 任务经验提取
- **`AgentSkillExtractor`** — 从 Case 聚类中增量提取可复用 Skill

### 3.3 Business Layer

`mem_memorize.py` 编排完整写入管线：

```
原始消息 → 边界检测 → MemCell 创建 → 并行提取（Episode/Fact/Foresight/AgentCase）
       → MongoDB 持久化 → ES + Milvus 索引 → Profile 异步更新 → 事件发布
```

### 3.4 Infrastructure Layer

- **REST 控制器** — `adapters/input/api/memory/`
- **持久化适配器** — `adapters/out/persistence/`（每种记忆类型一个 Repository）
- **搜索适配器** — `adapters/out/search/`（ES + Milvus 双 Repository）

### 3.5 Core Framework

- **DI 容器** — 自定义 bean 扫描与注入
- **生命周期** — DB / ES / Milvus / Redis 启停管理
- **中间件** — 租户、鉴权、指标、HMAC
- **队列/事件/限流/分布式锁** — Redis 驱动

---

## 4. 记忆类型体系

EverCore 定义了 8 种记忆类型，覆盖从原始消息到高阶 Skill 的完整生命周期：

| 类型 | 枚举 | 描述 | 关键字段 |
|------|------|------|---------|
| **Profile** | `profile` | 用户画像 | `explicit_info`（事实属性）+ `implicit_traits`（推断特征） |
| **Episodic Memory** | `episodic_memory` | 叙事性 episode 记忆 | `subject` + `summary` + `episode`（第三人称总结） |
| **Foresight** | `foresight` | 预测性记忆 | `start_time` + `end_time` + `duration_days` + 证据链 |
| **Atomic Fact** | `atomic_fact` | 原子事实 | 每个只表达一个语义单元，带归属信息 |
| **Raw Message** | `raw_message` | 未处理消息 | 等待提取的原始数据 |
| **Agent Memory** | `agent_memory` | Agent Case + Skill 总称 | 伞类型 |
| **Agent Case** | `agent_case` | Agent 任务经验 | `task_intent` + `approach_steps` + `quality_score`(0-1) + `key_insight` |
| **Agent Skill** | `agent_skill` | 可复用技能 | `name` + `description` + `confidence` + `maturity_score` + `cluster_id` |

### MemCell：原子边界单元

`MemCell` 是对话切分的最小单位，包含：

- `user_id_list` — 参与用户
- `original_data` — 原始消息
- `timestamp` — 时间戳
- `group_id` / `participants` / `sender_ids` — 会话元数据
- `type` — `CONVERSATION`（人类对话）或 `AGENTCONVERSATION`（Agent 对话）

对于 Agent 对话，`conversation_data` 属性会自动过滤 tool call/response 消息。

---

## 5. 写入管线：从对话到结构化记忆

### 完整流程

```
Step 1: 边界检测
  ConvMemCellExtractor (LLM) → 检测话题边界 → 创建 MemCell
  硬限制: 65K tokens / 500 条消息

Step 2: 并行提取（asyncio.gather）
  ├── EpisodeMemoryExtractor → 叙事性总结
  ├── AtomicFactExtractor → 原子事实
  ├── ForesightExtractor → 预测性记忆
  └── AgentCaseExtractor → Agent 经验（仅 Agent 对话）

Step 3: 持久化
  MongoDB (Beanie ODM) → ES (BM25 索引) → Milvus (向量索引)

Step 4: 后处理
  ├── ProfileExtractor → 异步更新用户画像
  ├── AgentSkillExtractor → 增量 Skill 提取（仅 Agent 对话）
  └── Event Publishing → 下游处理
```

### Agent Skill 增量提取

Agent 对话有独特的 Skill 提取管线：

1. `AgentCaseExtractor` 从单个 MemCell 提取 Case（高门槛：必须有具体问题 + 递进深化 + 可迁移方法论）
2. `AgentSkillExtractor` 对已有 Cluster 执行 LLM 引导的 `add/update/none` 操作
3. Skill 跟踪 `maturity_score` 和 `confidence`，识别哪些经验已被验证可靠

### Prompt 工程关键模式

所有提取 Prompt 共享以下设计模式：

- **语言镜像**：`CRITICAL LANGUAGE RULE` — 输出必须与输入同语言
- **结构化 JSON**：所有输出必须是合法 JSON
- **双格式时间**：`"相对时间（绝对日期）"` 支持时间推理
- **细节保留**：12 条规则包括保留全名、精确数量、特定活动、频率模式、代词消解
- **高质量过滤**：Agent Case 过滤要求具体问题 + 递进深化 + 非平凡推理 + 可迁移方法论，显式跳过闲聊和简单问答

---

## 6. 检索引擎：四种策略

`MemoryManager` 通过 Python `match` 语句分派四种检索策略：

### 6.1 Keyword（BM25）

- **后端**：Elasticsearch
- **延迟**：50-100ms
- **特点**：中文使用 jieba 分词 + 停用词过滤
- **适用**：精确关键词匹配

### 6.2 Vector（语义搜索）

- **后端**：Milvus
- **延迟**：200-500ms
- **特点**：Query 向量化 → 相似度搜索，支持阈值和半径参数
- **适用**：语义相似但措辞不同的查询

### 6.3 Hybrid（推荐默认）

- **后端**：ES + Milvus 并发（`asyncio.gather`）
- **延迟**：200-600ms
- **流程**：Keyword + Vector 并发 → ID 去重 → Reranking
- **适用**：大多数场景的最佳选择

### 6.4 Agentic（LLM 引导多轮检索）

- **后端**：Hybrid + LLM
- **延迟**：2-5s
- **流程**：
  1. Round 1：Hybrid 检索 → Rerank → **LLM 充分性检查**
  2. 若不充分：LLM 生成 2-3 个互补 Query → 并行 Hybrid 检索 → 合并 → 最终 Rerank
- **配置**：`AgenticConfig(round1_rerank_top_n=10, num_queries=3, combined_total=40)`
- **适用**：高精度场景（LoCoMo F1 0.90）

### Reranking 策略

`rerank_service` 采用混合策略 + 自动降级：

- **主提供商**：vLLM（自托管 Qwen3-Reranker-4B）
- **降级**：DeepInfra
- **故障追踪**：失败计数 + 5 分钟自动重置
- **并发控制**：批量大小 10，并发请求 5

### 向量化策略

`vectorize_service` 同样采用 vLLM 主 + DeepInfra 降级的混合模式。

---

## 7. 提示词工程

所有 Prompt 文件位于 `src/memory_layer/prompts/`，EN/ZH 双语变体。

### Episode Memory Prompt — 12 条细节保留规则

1. 保留完整姓名（不缩写）
2. 保留精确数量和日期
3. 保留特定活动和事件
4. 保留频率模式
5. 代词消解为具体人名
6. 保留偏好和意见的精确表述
7. 保留地理信息
8. 保留职业和角色信息
9. 保留技术术语
10. 保留因果关系
11. 保留条件和约束
12. 保留情感和态度

### Agent Case Filter — 高门槛过滤

必须同时满足：
- **具体问题**：非泛泛而谈
- **递进深化**：多轮推理链
- **非平凡推理**：需要创造性或分析性思考
- **可迁移方法论**：经验可应用于其他场景

显式跳过：闲聊、生活建议、简单问答。

### Foresight Generation — 预测性记忆

- 预测用户未来行为变化
- 带时间范围（`start_time` / `end_time` / `duration_days`）
- 证据锚定（基于历史对话）
- 区分生活场景（口语化）和工作场景（专业化）

### Tool Compression — Agent 轨迹压缩

`AGENT_TOOL_PRE_COMPRESS_PROMPT` 将 Agent tool call 轨迹压缩至原始长度的 ~10%，同时保留问题解决的因果链。

---

## 8. 存储与索引

### 四层存储架构

```
┌─────────────┬─────────────────────────────────────────────────────┐
│ 存储层       │ 职责                                               │
├─────────────┼─────────────────────────────────────────────────────┤
│ MongoDB     │ 主存储：MemCell / Episode / Fact / Foresight /      │
│ (Beanie)    │ AgentCase / AgentSkill / Profile / Group / Session  │
├─────────────┼─────────────────────────────────────────────────────┤
│ Elasticsearch│ BM25 关键词索引：每种记忆类型独立 Repository        │
│             │ 自定义 Analyzer（jieba 中文分词 + 停用词）           │
├─────────────┼─────────────────────────────────────────────────────┤
│ Milvus      │ 向量索引：每种记忆类型独立 Collection                │
│             │ 租户级 Collection Proxy                             │
├─────────────┼─────────────────────────────────────────────────────┤
│ Redis       │ 缓存（长度缓存/窗口缓存）+ 分布式锁 + 限流 + 队列   │
│             │ 租户 Key 前缀                                       │
└─────────────┴─────────────────────────────────────────────────────┘
```

### 数据模型

MongoDB Document 定义在 `src/infra_layer/adapters/out/persistence/document/memory/`，使用 Beanie ODM 映射。每种记忆类型有独立 Document，包含创建时间、租户 ID、向量化状态等元字段。

---

## 9. 多租户设计

多租户是 EverCore 的一等公民，而非事后补丁：

### 租户上下文传播

```python
# src/core/tenants/tenant_contextvar.py
tenant_ctx: ContextVar[str] = ContextVar('tenant_id')
# Python ContextVar 保证 async 安全
```

每层存储的租户隔离：

| 存储层 | 隔离方式 | 实现 |
|--------|---------|------|
| MongoDB | Command Interceptor 注入租户过滤 | `tenant_aware_document.py` |
| Elasticsearch | 所有 Query 注入租户字段 | `tenant_field_es_interceptor.py` |
| Milvus | Collection 后缀或字段级 Proxy | `tenant_field_collection_proxy.py` |
| Redis | Key 前缀 | `tenant_key_utils.py` |

单租户模式通过 `SINGLE_TENANT_ID` 环境变量启用，简化部署。

---

## 10. Agent 记忆：EverCore 独有能力

这是 EverCore 区别于其他记忆框架的**核心差异点**。

### Agent 对话 vs 人类对话

| 维度 | 人类对话 | Agent 对话 |
|------|---------|-----------|
| 边界单元 | MemCell (CONVERSATION) | MemCell (AGENTCONVERSATION) |
| 消息过滤 | 无 | 自动过滤 tool call/response |
| 提取产物 | Episode + Fact + Foresight | Episode + Fact + Foresight + **AgentCase** |
| 后处理 | Profile 更新 | Profile 更新 + **Skill 提取** |
| 质量过滤 | 标准 | **高门槛**（具体问题+递进+可迁移） |

### AgentCase 提取

每个 MemCell 最多提取一个 AgentCase，包含：

- `task_intent` — 任务意图
- `approach_steps` — 解决步骤
- `quality_score` (0.0-1.0) — 质量评分
- `key_insight` — 关键洞察

### AgentSkill 进化

```
AgentCase 1 ─┐
AgentCase 2 ─┼─ Cluster ─→ AgentSkillExtractor ─→ Skill
AgentCase 3 ─┘              (add/update/none)

Skill {
  name, description, content,
  confidence,        // 置信度
  maturity_score,    // 成熟度（经验证的经验更高）
  cluster_id         // 所属聚类
}
```

Skill 的成熟度机制让系统能识别哪些经验已经过验证、哪些还处于探索阶段。

### 工具轨迹压缩

`AGENT_TOOL_PRE_COMPRESS_PROMPT` 将冗长的 tool call 轨迹压缩至 ~10%，保留：

- 问题解决的因果链
- 关键决策点
- 错误与修正过程
- 最终方案

丢弃：中间状态、重复尝试、调试输出。

---

## 11. HyperMem：超图记忆架构

HyperMem 是 EverOS 中的研究组件（ACL 2026 论文），采用超图结构组织记忆。

### 三层超图

```
L3 Topic Layer ─── TopicNode
    │               title / summary / keywords / episode_ids
    │
    └── EpisodeHyperedge (连接同一主题的多个 Episode)
        │   角色: INITIATING / DEVELOPING / CLIMAX / CONCLUDING /
        │         RECURRING / BACKGROUND / KEY_MOMENT / TRANSITION
        │
L2 Episode Layer ── EpisodeNode
        │
        └── FactHyperedge (连接同一 Episode 中的事实)
            │   角色: CORE / CONTEXT / DETAIL / TEMPORAL / CAUSAL
            │
L1 Fact Layer ───── FactNode
```

### 超图嵌入传播

节点嵌入通过超边聚合精化：

- **超边嵌入**：成员节点的注意力加权和（使用边权重）
- **节点更新**：`h'_v = h_v + λ · Agg(h_e)`，λ = 0.5
- 存储在 `HypergraphEmbedding` 容器中（numpy 数组）

### 构建管线（6 阶段）

1. **Episode Detection** — LLM 流式边界检测
2. **Hypergraph Extraction** — 主题聚合 + 事实提取 + 超图构建
3. **Hypergraph Index** — BM25 + 密集向量索引
4. **Hypergraph Retrieval** — 粗到精自顶向下遍历
5. **Response** — LLM 答案生成
6. **Evaluation** — LLM-as-judge（GPT-4o-mini），3 轮取平均

### 粗到精检索

```
Stage 1: 检索 top-k^T 主题（BM25 + Dense + RRF 融合）
Stage 2: 在主题子图中检索 top-k^E Episode
Stage 3: 在保留的 Episode 中检索 top-k^F Fact

默认: (k^T, k^E, k^F) = (15, 20, 30)
自适应: 按问题类型（factual/temporal/reasoning/commonsense）调整
```

### EverCore vs HyperMem

| 维度 | EverCore | HyperMem |
|------|----------|----------|
| 数据结构 | 扁平记忆类型 | 三层超图 + 超边 |
| 关系建模 | 隐式（group_id / parent_id） | 显式超边（角色 + 权重） |
| 向量 | 每文档独立，存 Milvus | 每节点，经超图传播精化 |
| 检索 | 并行 Keyword + Vector + Rerank | 顺序粗到精（Topic → Episode → Fact） |
| 生产就绪度 | 完整 REST API + 多租户 + Docker | 研究代码，仅评测管线 |
| Benchmark | LoCoMo 93.05% | LoCoMo 92.73% |

---

## 12. Benchmark 评测体系

### EverMemBench — 多人群聊记忆质量评测

**评测管线**：Add → Search → Answer → Evaluate

| 阶段 | 功能 |
|------|------|
| Add | 将对话数据写入记忆系统 |
| Search | 为 QA 问题检索相关记忆 |
| Answer | 用 LLM + 检索上下文生成答案 |
| Evaluate | 评估答案质量（选择题直接对比 / 开放题 LLM Judge） |

**支持系统**：EverCore · Memos · Mem0 · Memobase · Zep + LLM 长上下文基线

**数据集**：EverMemBench-Dynamic（HuggingFace），包含 user 004/005/010/011/016 的多批次数据

**分析工具**：`tools/analyze_results.py` 按问题类别（major/minor/hierarchical）分析

### EvoAgentBench — Agent 自进化评测

**五大评测领域**：

| 领域 | 数据源 | 训练/测试 |
|------|--------|----------|
| 信息检索 | BrowseCompPlus | 154 / 65（10 主题聚类） |
| 推理 | OmniMath | 478 / 100（按子学科） |
| 软件工程 | SWE-Bench | 101 / 26（19 仓库聚类） |
| 代码实现 | LiveCodeBench | 97 / 39（39 类型聚类） |
| 知识工作 | GDPVal | 87 / 58（29 职业聚类） |

**自进化协议**：

- **离线**：Agent 在训练集上运行 → 批量提取 Skill → 在测试集上注入 Skill 评测
- **在线**：Agent 在任务执行中实时提取 Skill，持续更新知识库

**支持方法**：EverCore（基于记忆）· EvoSkill · Memento · OpenSpace · Reasoning Bank

---

## 13. Use Cases：集成模式

### Claude Code Plugin

位于 `use-cases/claude-code-plugin/`，通过 Claude Code Hooks 系统实现持久记忆：

**四个 Hook 点**：

| Hook | 触发时机 | 行为 |
|------|---------|------|
| SessionStart | 会话开始 | 拉取最近记忆 + 加载上次会话摘要 → 注入 system prompt |
| UserPromptSubmit | 用户发送消息 | 搜索相关记忆 → 注入上下文 |
| Stop | Agent 回答完成 | 提取最后一轮对话 → 上传 `/api/v1/memories/group` |
| SessionEnd | 会话结束 | 提取首个用户消息作为会话摘要 → 保存到本地 `sessions.jsonl` |

**Memory Hub**：本地代理服务器（localhost:3456）提供 Dashboard，含 GitHub 风格热力图、统计卡片、项目分组、时间线视图。

**关键设计**：
- "延迟显示模式" — SessionEnd 保存，SessionStart 显示
- 本地优先架构 — 会话数据本地存储，记忆云端存储
- 无 AI 摘要 — 首个用户消息即为会话摘要

### 其他 Use Cases（~20 个）

| Use Case | 类型 | 特点 |
|----------|------|------|
| Hive Orchestrator | 多 Agent 协作 | 浏览器原生 hive-mind，CLI 编码 Agent 协作 |
| EverMem MCP | 编码助手记忆 | MCP 协议集成 |
| Rokid AI Assistant | AR 眼镜 | 可穿戴设备记忆 |
| Ruminer | 浏览器 Agent | 跨 Web 任务的持久记忆 |
| MemoCare | 医疗辅助 | 阿尔茨海默记忆辅助 |
| Live2D Character | 虚拟角色 | 实时 Live2D 角色长期记忆 |
| Earth Online | 生产力游戏 | 记忆感知的任务管理游戏 |
| OpenHer | 人格引擎 | 神经驱动的 AI 人格 |

---

## 14. 与 OpenViking / Letta / ReMe 的对比定位

### 定位矩阵

| 维度 | EverOS | OpenViking | Letta | ReMe |
|------|--------|-----------|-------|------|
| **核心隐喻** | 生物印记 | 文件系统 | 操作系统 | 工程预算 |
| **核心抽象** | MemCell + 记忆类型 | `viking://` URI + Context | Block + Passage | ContextChecker + Compactor |
| **记忆类型** | 8 种（含 Foresight、Agent Skill） | 10 种（YAML Schema） | Block（自定义 label） | Profile + Procedural + Tool |
| **检索策略** | 4 种（Keyword/Vector/Hybrid/Agentic） | 层级递归（L0→L1→L2） | archival_memory_search | 混合向量+BM25 |
| **写入触发** | API 接收 → 自动管线 | 文件写入 → SemanticProcessor | Agent 主动调用 tools | pre_reasoning_hook |
| **Agent 自主编辑** | 无（全自动提取） | 无（被动检索） | **是**（memory tools） | 无 |
| **上下文压缩** | 无（独立系统） | 无 | 缺页中断触发 summarizer | **是**（四阶段管道） |
| **多租户** | **原生支持** | account_id 隔离 | 无 | 无 |
| **生产就绪度** | **高**（REST API + Docker + 多租户） | 中（SaaS 平台） | 中（有状态进程） | 低（工具箱组件） |
| **侵入性** | 中（API 接口） | 高（VFS 重构） | 中（Agent Loop 绑定） | **低**（hook 调用） |
| **Benchmark** | LoCoMo 93.05% | — | — | — |

### 关键差异

**EverOS vs OpenViking**：
- OpenViking 用 VFS 层级组织知识，EverOS 用扁平但丰富的记忆类型
- OpenViking 的 L0/L1/L2 渐进加载在 Token 效率上更优
- EverOS 的 Agentic 检索（LLM 引导多轮）比 OpenViking 的层级递归更灵活
- EverOS 原生支持 Agent 记忆（Case + Skill），OpenViking 不支持

**EverOS vs Letta**：
- Letta 让 Agent 通过 tools 主动管理记忆（自我修正），EverOS 全自动提取
- Letta 的 Block 始终在 system prompt（零检索成本），EverOS 需要检索
- EverOS 的 Foresight（预测性记忆）和 Agent Skill 进化是 Letta 没有的
- EverOS 原生多租户，Letta 无租户隔离

**EverOS vs ReMe**：
- ReMe 聚焦上下文压缩（解决对话膨胀），EverOS 聚焦长期记忆（解决跨 Session 遗忘）
- ReMe 侵入性最低（一个 hook 调用），EverOS 需要 API 集成
- EverOS 的检索能力远强于 ReMe（4 种策略 vs 1 种混合检索）
- 两者可以互补：ReMe 管"当前对话压缩"，EverOS 管"跨对话记忆"

---

## 15. 架构得失总结

### 颠覆性贡献

1. **最完整的记忆类型体系**：8 种类型覆盖从原始消息到高阶 Skill 的完整生命周期，特别是 Foresight（预测性记忆）和 Agent Skill（自进化技能）是独有能力

2. **生产级多租户架构**：每一层存储（MongoDB/ES/Milvus/Redis）都有原生租户隔离，ContextVar 保证 async 安全，是四个框架中唯一真正面向 SaaS 的设计

3. **Agentic 检索**：LLM 引导的多轮检索 + 充分性检查 + Query 扩展，是唯一将"检索是否充分"纳入循环的框架

4. **Agent 记忆管线**：Case 提取 → 聚类 → Skill 进化 → 成熟度追踪，让 Agent 能从自己的经验中学习并识别可靠的方法论

5. **Benchmark 驱动**：自建 EverMemBench + EvoAgentBench，提供可复现的评测标准

### 架构挑战

1. **基础设施重量**：MongoDB + ES + Milvus + Redis + Docker，最小部署需要 4 个外部服务，冷启动和运维成本高

2. **缺乏 Agent 自主编辑**：所有记忆提取都是自动化的，Agent 无法像 Letta 一样主动修改自己的核心记忆（如 persona/human 块）

3. **无上下文压缩能力**：EverCore 是独立的记忆系统，不参与当前对话的上下文管理。长对话压缩需要与 ReMe 等工具配合

4. **LLM 依赖密集**：边界检测、6 种提取器、Agentic 检索的充分性检查都需要 LLM 调用，Token 成本显著

5. **写入延迟**：从消息接收到记忆可检索，需经过边界检测 + 多路提取 + 向量化 + 索引，端到端延迟较高

### 最佳适用场景

- **多租户 SaaS 平台**：需要为大量用户提供隔离的记忆服务
- **Agent 编码助手**：需要从 Agent 对话中提取经验和可复用技能
- **长周期对话系统**：需要跨数十个 Session 的用户记忆（如客服、教育、健康）
- **评测驱动开发**：需要标准化的记忆系统评测框架
