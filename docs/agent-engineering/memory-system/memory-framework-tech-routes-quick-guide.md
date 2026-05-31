# AI 记忆框架技术路线快速阅读指南

> 目标：不用先读完五份 deep audit，也能在 10 分钟内知道每个框架到底解决什么问题、基于什么路线、应该怎么选。
>
> 范围：OpenViking、Letta、ReMe、EverOS、GBrain。
>
> 更新时间：2026-05-30

---

## 先看结论

这五个项目不是同一层东西：

- **OpenViking**：文件系统 / VFS 型 RAG。
- **Letta**：Agent 进程型内存管理。
- **ReMe**：上下文压缩中间件。
- **EverOS**：多类型长期记忆操作系统。
- **GBrain**：Git-native 知识脑。

如果把它们都叫“memory framework”，很容易选错。真正应该先问的是：

1. 你要解决的是**当前对话上下文溢出**，还是**跨会话长期知识积累**？
2. 你要的是**Agent 自己可编辑的热记忆**，还是**系统自动抽取的长期记忆**？
3. 你要的是**数据库真相源**，还是**Markdown/Git 真相源**？
4. 你主要面对的是**个人/团队知识库**，还是**在线 Agent 服务**？

---

## 1. 按技术路线分

### 1.1 文件系统 / VFS 路线

代表：**OpenViking**

核心思想：

- 把知识组织成 `viking://` 语义树
- 用目录、文件、层级摘要替代 flat top-k
- 检索先看 L0/L1，再递归深入 L2

适合：

- 大规模文档/代码/资源库
- 需要层级导航而不是单次向量命中
- 你愿意围绕 VFS 思维组织知识

不适合：

- 只想加一点记忆，不想重构知识组织方式
- 主要问题是上下文压缩而不是检索

一句话：

**OpenViking 是“把 RAG 变成浏览文件系统”。**

### 1.2 Agent 进程 / OS 虚拟内存路线

代表：**Letta**

核心思想：

- Agent 像进程
- `Block` 是 RAM
- archival memory 是 disk
- context window 满了就像缺页一样重建

适合：

- 长生命周期有状态 Agent
- 需要 Agent 自己修改核心记忆
- 需要 persona / human / instructions 这种热记忆长期驻留

不适合：

- 无状态函数式调用
- 你不想接受 Agent loop 被框架接管

一句话：

**Letta 是“让 Agent 学会自己管热记忆”。**

### 1.3 压缩中间件路线

代表：**ReMe**

核心思想：

- 不重做框架
- 在推理前插一个检查-压缩 hook
- 尽量保住 turn 完整性和 tool-use/tool-result 配对

适合：

- 已有 AgentScope/兼容循环
- 痛点是长对话、tool result 膨胀
- 需要低侵入、快速见效

不适合：

- 你期待它顺便变成完整长期记忆系统
- 你需要 Agent skill evolution 或复杂多租户

一句话：

**ReMe 是“最容易插进现有 Agent 的上下文保险丝”。**

### 1.4 多类型长期记忆 / Agentic Retrieval 路线

代表：**EverOS**

核心思想：

- 自动从对话中提取多种记忆
- 不是只存 fact，还存 episode / foresight / profile / agent case / skill
- 检索不止搜一轮，而是做“是否足够”的 agentic loop

适合：

- 要做真正的长期记忆服务
- 需要自动抽取、结构化、检索、评测一整套
- 需要 SaaS / 多租户 / 生产级隔离

不适合：

- 你只有单机工具或轻量侧车场景
- 你不想运维 MongoDB + ES + Milvus + Redis

一句话：

**EverOS 是“最像生产级长程记忆后端”的那一个。**

### 1.5 Git-native 知识脑路线

代表：**GBrain**

核心思想：

- Markdown 才是真相源
- Git 负责审计、分叉、回滚
- PGLite / Supabase 只是索引层
- graph-query、think、Dream Cycle 负责让知识越来越可用

适合：

- 个人/团队长期知识沉淀
- 需要 Git 审计、review、版本治理
- 需要处理人物、公司、会议、关系链、研究笔记

不适合：

- 你要的是当前对话的临时 memory
- 你只想解决上下文窗口溢出

一句话：

**GBrain 是“知识脑”，不是“短时记忆层”。**

---

## 2. 按需求选

### 2.1 我只想先解决上下文爆炸

优先：

- **ReMe**

备选：

- Letta（如果你顺便要状态化 Agent）

不要直接上：

- GBrain
- OpenViking

原因：

- 你的问题是压缩，不是 durable knowledge。

### 2.2 我想让 Agent 自己记住并修改“关于用户/自己的核心记忆”

优先：

- **Letta**

备选：

- Letta + ReMe

原因：

- 这是 Letta 的主战场，Block 和 memory tools 就是为这个设计的。

### 2.3 我想做自动长期记忆平台，最好还能评测

优先：

- **EverOS**

备选：

- EverOS + ReMe

原因：

- 自动抽取、多类型 memory、agentic retrieval、多租户、benchmark 都在它的正面能力面里。

### 2.4 我有大量文档/代码/资源，希望检索更像“先看目录再深入”

优先：

- **OpenViking**

备选：

- OpenViking + ReMe

原因：

- 这是它的范式创新点，尤其适合层级结构明显的大知识库。

### 2.5 我想把知识库变成 Git 可审计资产

优先：

- **GBrain**

备选：

- GBrain + Letta
- GBrain + ReMe

原因：

- 如果“真相源要可 diff / 可 branch / 可 review”是核心要求，GBrain 的路线最对。

---

## 3. 按真相源选

### 数据库是真相源

更偏：

- Letta
- EverOS
- ReMe（混合）

特点：

- 写入快
- 服务化自然
- 对程序友好
- 人类审计弱一些

### 文件系统是真相源

更偏：

- OpenViking
- ReMeLight
- GBrain

区别：

- OpenViking：文件系统是**检索范式**
- ReMeLight：文件系统是**持久化与可读性手段**
- GBrain：文件系统/Git 是**治理与真相源核心**

---

## 4. 按侵入性选

### 最低侵入

- **ReMe**
- **GBrain**（当你接受 MCP/CLI 集成时）

### 中等侵入

- **EverOS**
- **Letta**

### 最高范式切换成本

- **OpenViking**

原因不是它难接，而是它的收益和“你是否真的接受 VFS 组织知识”强相关。

---

## 5. 最常见的组合方式

### Letta + ReMe

适合：

- 有状态 Agent
- 同时要热记忆和压缩

分工：

- Letta 管核心记忆
- ReMe 管上下文预算

### EverOS + ReMe

适合：

- 生产级长期记忆
- 同时要当前对话压缩

分工：

- EverOS 管长期抽取/检索
- ReMe 管当前会话

### GBrain + Letta

适合：

- Agent 既要会记住用户，也要把长期知识写进 Git 脑

分工：

- Letta 管 hot memory
- GBrain 管 durable knowledge

### GBrain + ReMe

适合：

- 已有 Agent，不想重构 loop
- 但想加长期知识脑

分工：

- ReMe 管压缩
- GBrain 管知识沉淀

### OpenViking + ReMe

适合：

- 大规模层级知识库
- 同时担心上下文爆炸

分工：

- OpenViking 管冷知识检索
- ReMe 管对话窗口

---

## 6. 一页决策树

如果你的第一问题是：

- **“上下文老是爆”** → 先看 **ReMe**
- **“Agent 要自己改记忆”** → 先看 **Letta**
- **“我需要自动长期记忆服务”** → 先看 **EverOS**
- **“我需要层级式知识检索”** → 先看 **OpenViking**
- **“我需要 Git 可审计知识脑”** → 先看 **GBrain**

如果你不知道是不是该上 GBrain，问自己一句：

**你要的是 memory，还是 brain？**

- 如果你要“最近几轮对话状态” → 不是 GBrain 主战场。
- 如果你要“半年后还要复用、审计、演化的知识资产” → GBrain 非常对。

---

## 7. 最后一句话

这五个项目最合理的理解方式不是“谁更强”，而是“谁处在哪一层”：

- **Letta** 管热记忆
- **ReMe** 管压缩
- **EverOS** 管自动长期记忆
- **OpenViking** 管层级冷知识检索
- **GBrain** 管 Git-native durable knowledge

选型错，大多不是能力不够，而是**把知识脑当成短时记忆，或者把压缩器当成长期记忆系统**。
