# GBrain 技术深度审计

> 基于 `garrytan/gbrain` 官方 README、架构文档、教程与评测仓库整理。
>
> 核验日期：2026-05-30
>
> 说明：本报告优先复核官方公开能力面，不伪造未公开源码行号；因此它更接近“架构深审 + 产品面核验”，而不是逐函数 code walk。

---

## 目录

1. [项目定位：Brain 不是 Memory](#1-项目定位brain-不是-memory)
2. [核心架构：Git 真相源 + Split Engine](#2-核心架构git-真相源--split-engine)
3. [数据模型：少原语 + 强 Schema](#3-数据模型少原语--强-schema)
4. [写入路径：Page Write 即自布线](#4-写入路径page-write-即自布线)
5. [检索与综合：Search / Think / Graph Query](#5-检索与综合search--think--graph-query)
6. [Skill 与 MCP：薄运行时，厚技能层](#6-skill-与-mcp薄运行时厚技能层)
7. [Dream Cycle：夜间知识卫生与充实](#7-dream-cycle夜间知识卫生与充实)
8. [部署拓扑：个人脑到 Company Brain](#8-部署拓扑个人脑到-company-brain)
9. [架构优劣与适用边界](#9-架构优劣与适用边界)
10. [与 Letta / ReMe / EverOS / OpenViking 的对位](#10-与-letta--reme--everos--openviking-的对位)
11. [核验来源](#11-核验来源)

---

## 1. 项目定位：Brain 不是 Memory

GBrain 的核心观点不是“再做一个 agent memory 库”，而是把**长期知识脑**单独拿出来设计：

- **Brain**：可长期积累、可复用、可审计、可版本控制的 durable knowledge。
- **Memory**：对话期偏好、最近上下文、短时状态、临时工作集。

官方文档明确区分两者，并把 GBrain 主要放在前者。也就是说：

- 它很适合“我想让 Agent 长期懂我的项目、联系人、会议、交易、写作、观点演化”。
- 它不适合单独承担“记住刚刚这一轮对话的临时偏好 / 未完成中间状态 / 上下文压缩”。

这和 Letta、ReMe、EverOS 的默认问题设定非常不同。GBrain 不是对话内存管理器，而是**Git-native 的知识脑**。

---

## 2. 核心架构：Git 真相源 + Split Engine

GBrain 的稳定设计主轴可以概括为：

```text
Markdown Brain Repo
    ↓
Retrieval Engines
    ↓
Skill / MCP Surface
```

更准确地说，它是一个 **split-engine** 架构：

- **Brain repo**：Markdown 页面是真相源，Git 负责版本化、分叉、回滚、审计。
- **Retrieval engine**：本地默认用 `PGLite`；规模增大时迁移到 `Supabase/Postgres`。
- **Skill/MCP surface**：CLI、30+ MCP tools、43 个 curated skills 组成实际能力面。

这套设计的关键不是“把数据库拿掉”，而是把**数据库降级为索引层**，把**Markdown/Git 升级为 system of record**。

这与典型 RAG/agent memory 的默认假设相反：

- 传统做法：向量库/数据库是真相源，Markdown 只是导出物。
- GBrain：Markdown 才是真相源，数据库只是可重建的检索加速层。

这带来三个直接后果：

1. **人类可审计**：你可以 `git diff` 看到 Agent 学到了什么。
2. **知识可分叉**：可以做 branch、PR、review、merge。
3. **索引可重建**：数据库坏了，repo 还在；重建不是灾难。

---

## 3. 数据模型：少原语 + 强 Schema

GBrain 不走“先定义很多 memory types”的路线，而是走“**少量 durable primitives + schema packs**”路线。

稳定可见的核心对象包括：

- **Page**：知识的主承载体，Markdown 页面。
- **Timeline**：时间序列和事件线索。
- **Fact**：可归档、可验证的陈述。
- **Take**：观点、判断、立场。
- **Edge**：页面之间的关系边。

关键不是对象数，而是它们可以被更高层 schema pack 约束：

- `people`
- `companies`
- `concepts`
- `meetings`
- `deals`
- `originals`
- `writing`

官方文档中，`gbrain-base-v2` 已把 page types 推到更细颗粒度，说明作者的思路是：

- 核心存储层保持小而稳定。
- 领域建模能力通过 schema 演进，而不是把内核写死。

这个路线的收益是灵活，代价是你需要接受它的“knowledge modeling”思维，而不是把它当成无结构便签。

---

## 4. 写入路径：Page Write 即自布线

GBrain 最独特的地方之一，是**基础写入路径尽量不调用 LLM**。

### 4.1 Page 写入

Agent 或操作者写入一个 Markdown Page 后，系统会在写入路径上做几件确定性工作：

- 识别页面引用与链接
- 回填 backlink
- 补 typed edge
- 更新检索索引

这条链路的公开卖点是：

- **auto-link fires on every page write**
- **pure pattern matching**
- **zero-LLM self-wiring**

这和“每次写入都要走一轮抽取 prompt”的系统完全不同。它把成本从“写时 LLM”挪到“建模约束 + 检索后综合”。

### 4.2 为什么这很重要

如果知识库规模上来，写时 LLM 的成本和不确定性会快速放大：

- 成本高
- 速度慢
- 结构不稳定
- 难审计

GBrain 选择让**基础关系 wiring 确定化**，这是它比很多 memory/RAG 系统更适合长期知识库的根本原因。

---

## 5. 检索与综合：Search / Think / Graph Query

GBrain 不只是“搜 Markdown”。它的公开检索路线已经相当完整：

### 5.1 Hybrid Retrieval

基础检索走混合路线：

- dense retrieval
- BM25 / 关键词搜索
- RRF 融合
- source-tier boosts
- 图信号加权

这意味着它不是“纯向量派”，也不是“纯 wiki 搜索派”，而是把结构、稠密语义、来源权重一起算。

### 5.2 Graph Query Fast Path

GBrain 官方文档很强调这一点：**typed relationship query 不应该总退化成 dense search**。

对于下面这类问题：

- 谁投资了谁
- 谁参加了哪次会
- 某个决定最早在哪次 meeting 形成
- 某人和某公司之间的关系链

更合理的路径是直接走 `graph-query` 的 typed traversal fast path，而不是把所有问题都变成 embedding search。

这是它区别于 OpenViking/Letta/ReMe 的一个非常实用的点：**关系型问题可以直接结构化求解**。

### 5.3 `gbrain think`

`gbrain think` 是 GBrain 最“产品化”的能力之一：

- 先检索
- 再综合
- 输出引用化答案
- 同时指出知识缺口（gap analysis）

也就是说，它不是只返回 top-k 片段，而是试图回答：

- 目前最好的综合结论是什么
- 这个结论依赖哪些页面/事实
- 还缺什么信息

这比普通 memory search 更像“research assistant over your own brain”。

---

## 6. Skill 与 MCP：薄运行时，厚技能层

GBrain 的另一个鲜明选择是把大量能力下放到 **skills**：

- 官方 README 公开为 **43 curated skills**
- 公开 MCP surface 为 **30+ tools**
- 路由逻辑放在 `skills/RESOLVER` 一类文档中

这意味着：

- 运行时内核很薄
- 具体工作流很厚
- 能力升级常常体现为 skillpack 演化，而不是 core engine 改写

这和“框架里内置所有行为”的做法不同。优点是可组合、可替换、可按领域增减；缺点是能力面分散在 README / docs / skills 中，使用方需要接受这种组织方式。

---

## 7. Dream Cycle：夜间知识卫生与充实

Dream Cycle 不是一句口号，而是 GBrain 的持续知识维护策略：

- Fact 提取
- Edge 补全
- Page 合并
- 一致性检查
- 矛盾扫描
- schema/soul-audit 类任务

作者公开过大规模 cron 驱动的生产实践，这说明 GBrain 的目标不是“被动等用户来问”，而是让知识脑在后台继续整理自己。

这个理念很接近“长期知识卫生”而不是“即时对话记忆”：

- 白天写入原始材料
- 夜间批处理补关系、清噪音、找冲突
- 第二天检索质量变更好

这条路线在传统 agent memory 框架里并不常见。

---

## 8. 部署拓扑：个人脑到 Company Brain

GBrain 现在已经不是“只能单机单人玩具”的状态，官方文档公开了几类拓扑：

### 8.1 Personal Brain

- 本地 Markdown repo
- 本地 PGLite
- 最低运维复杂度

适合：

- 个人研究者
- 创始人/投资人知识管理
- 顾问/写作者项目脑

### 8.2 Local Brain + Cloud Retrieval

- 本地 repo 保持真相源
- 检索层迁移到 Supabase/Postgres

适合：

- 页面数超过本地舒适区
- 希望保留本地写作体验
- 需要更稳定的多端查询

### 8.3 Company Brain

- 组织级 repo / 访问作用域
- 团队共享 durable knowledge

这说明它已经开始进入 **institutional memory** 场景，而不再只是“单人第二大脑”。

### 8.4 Federated Personal Brain

- 保留个人脑自治
- 在需要时跨脑联合查询

这条路线很少见，代表 GBrain 在认真处理“个人知识主权”与“团队协作”之间的张力。

---

## 9. 架构优劣与适用边界

### 9.1 关键优势

- **真相源清晰**：Markdown/Git 而不是黑盒数据库。
- **写入便宜**：基础写入路径零 LLM。
- **关系问题强**：graph-query fast path 很实用。
- **长期卫生能力强**：Dream Cycle 让知识库不是越用越乱。
- **部署弹性好**：PGLite 本地起步，Supabase/Postgres 向上扩容。

### 9.2 关键代价

- **不是对话内存系统**：不负责当前窗口压缩，也不天然负责短期偏好。
- **需要知识建模习惯**：Page/schema/source discipline 是前提。
- **技术栈异构**：TypeScript/Bun 世界观和 Python agent infra 不同。
- **能力面文档化而非强 API 化**：落地前必须按当前 README/docs 复核。

### 9.3 最适合的场景

- 可审计知识库
- founder / investor / PM / researcher 的长期脑
- 组织级项目、会议、交易、人物关系图谱
- 需要 Git review / branch / diff 的知识治理流程

### 9.4 不适合单独承担的场景

- 只想解决长对话上下文溢出
- 只想记住用户最近几轮临时偏好
- 需要 Agent 自动从工具轨迹提炼 Skill
- 需要开箱即用的 SaaS 多租户 memory control plane

---

## 10. 与 Letta / ReMe / EverOS / OpenViking 的对位

最简明的定位差异如下：

- **对 Letta**：Letta 解决“Agent 怎样管理自己的热记忆”；GBrain 解决“长期知识怎样留在可审计真相源里”。
- **对 ReMe**：ReMe 解决“上下文怎样安全压缩”；GBrain 不做压缩，做 durable brain。
- **对 EverOS**：EverOS 解决“怎样自动从对话中抽多类型长期记忆并做 agentic retrieval”；GBrain 更强调 repo-first knowledge modeling 与 human auditability。
- **对 OpenViking**：OpenViking 强在 VFS 层级检索；GBrain 强在 Git truth source、schema packs、graph-query 与 synthesis。

因此，GBrain 最合理的使用方式通常不是“替代全部”，而是作为下面组合中的**知识层**：

- Letta + GBrain
- ReMe + GBrain
- EverOS + GBrain
- OpenViking + GBrain

如果一句话总结：

**GBrain 不是最好的“记忆”框架，但它很可能是五者里最像“长期知识操作系统”的那个。**

---

## 11. 核验来源

- 官方仓库：<https://github.com/garrytan/gbrain>
- README（项目定位、skills、MCP、Dream Cycle、PGLite/Supabase 路线）
- `docs/architecture/topologies.md`（personal brain / company brain / federated topologies）
- `docs/architecture/brains-and-sources.md`（brain vs source、system of record 设计）
- 教程与 brain 文档（graph-query、company brain、brain-vs-memory 相关说明）
- 评测仓库与 BrainBench 说明（检索提升与知识卫生方向）
