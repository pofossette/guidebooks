# Pi / OpenClaw / Hermes Agent / OpenHuman 长期记忆系统调研

> 调研日期：2026-05-30
>
> 范围说明：本文只使用公开的一手资料，包括官方文档、官方仓库 README、官方包市场页面。Pi 部分需要特别说明：截至 2026-05-30，我没有找到一页“Pi 核心内建长期记忆架构”的官方总览文档，因此该部分主要依据官方包市场中的代表性扩展来判断其长期记忆实践，这一点会在文中明确标注为“生态推断”。

---

## 一、快速结论

这四类工具对“长期记忆”有非常不同的设计取向：

- **Pi Agent**：更像“扩展生态驱动”的长期记忆，而不是一个固定内建记忆内核。当前可见的主流路线至少有三种：`pi-hermes-memory` 的策略注入 + 搜索 + 程序化技能、`pi-memory` 的 Markdown + qmd 语义搜索、`pi-observational-memory` 的后台观察/反思与抗 compaction 漂移。
- **OpenClaw**：核心哲学是“**没有隐藏状态，记忆就是工作区里的 Markdown 文件**”。长期记忆以 `MEMORY.md` 为核心，日记层与检索层解耦，再通过 memory plugin 扩展召回与知识编译。
- **Hermes Agent**：采用“**小而硬的内建记忆 + 大而软的外部 Provider**”双层设计。内建层强约束字符预算、强控制注入位置；更深的长期记忆交给 Honcho / OpenViking / Mem0 等外部 Provider。
- **OpenHuman**：走“**本地优先、外部数据持续汇入、层级摘要树**”路线。它不把长期记忆理解成几份手工整理的笔记，而是把邮箱、日历、GitHub、消息流等外部数据先 canonicalize，再压成 Memory Tree 与 Obsidian Wiki。

如果只看工程风格：

- **最可控、最可审计**：OpenClaw
- **内建层最克制、产品边界最清楚**：Hermes Agent
- **自动化最强、面向“个人数字分身”最彻底**：OpenHuman
- **实验路线最多、适合快速试错**：Pi Agent 扩展生态

---

## 二、Pi Agent：扩展生态驱动的长期记忆

### 2.1 生态判断

这是本文里唯一一个需要显式声明“推断”的结论：

- 从 Pi 官方包市场可见，长期记忆能力主要以 **extension/package** 形式交付，而不是以单一官方内建子系统统一暴露。
- 这个判断来自多个官方包页面的 README，而不是一篇 Pi 官方核心架构白皮书。

换句话说，Pi 当前更像是在提供一套可插拔宿主环境，然后让不同作者围绕同一 Agent 宿主去实现不同的长期记忆策略。

### 2.2 路线 A：`pi-hermes-memory`

`pi-hermes-memory` 是目前我看到最接近“完整长期记忆子系统”的 Pi 扩展之一。官方包页面直接把它定义为：

- 持久记忆
- 会话搜索
- SQLite FTS5 搜索
- 自动 consolidation
- procedural skills
- 后台学习

它的核心设计有几层：

### 热层：策略优先，而不是默认把所有记忆硬塞进 prompt

- 默认模式不是把完整 Markdown 记忆直接注入 system prompt。
- 注入的是一个完整的 `<memory-policy>`，告诉 Agent 何时调用 `memory_search`，以及如何把记忆视作“上下文”而非“指令”。
- 这样做的好处是首轮 token 成本更低，也避免把大量长期记忆常驻在 prompt 里。

### 温层：全局 + 项目双层记忆

- 全局记忆目录：`~/.pi/agent/pi-hermes-memory/`
- 项目记忆目录：`~/.pi/agent/projects-memory/<project>/`

这相当于把长期记忆拆成：

- 跨项目用户画像、偏好、工具习惯
- 单仓库架构约定、API 习惯、团队规范

这是一个非常实用的分层，尤其适合 coding agent。

### 冷层：Markdown 持久化 + SQLite 搜索镜像

- 事实、偏好、纠错、经验先写入 Markdown
- 成功写入后同步到 SQLite，供 `memory_search` 使用

这意味着：

- **Markdown 是人类可编辑的真相源**
- **SQLite FTS5 是检索加速层**

### 程序化记忆：Skill 作为一等长期资产

`pi-hermes-memory` 不只记“事实”，还记“怎么做”：

- Skill 被存成 Pi-native `SKILL.md`
- 支持 `create/view/patch/update/delete`
- 要求显式区分 `global` 与 `project` scope

这本质上是在把“经验”沉淀成 procedural memory，而不是只做事实回忆。

### 后台学习与失败记忆

这个扩展很重视“失败”和“纠正”：

- `failure`
- `correction`
- `insight`
- `preference`
- `convention`
- `tool-quirk`

并且文档写得很明确：后台会定期 review，并把失败经验和纠错信息固化下来。这比“只记用户偏好”更接近真正的 agent memory。

### 2.3 路线 B：`pi-memory`

`pi-memory` 代表了另一条更轻、更工程化、更本地优先的路线。

它的核心是：

- `MEMORY.md`：长期记忆
- `SCRATCHPAD.md`：待办/检查项
- `daily/YYYY-MM-DD.md`：每日 append-only 日志
- `qmd`：可选语义搜索层

### 优点 1：文件布局极其透明

这套设计几乎没有黑盒：

- 长期事实在 `MEMORY.md`
- 工作中间态在 `daily/`
- 执行态 checklist 在 `SCRATCHPAD.md`

对于 coding agent，这是一个很自然的三分法：长期约束、短期工作流、会话流水。

### 优点 2：把 KV cache 稳定性作为第一原则

`pi-memory` 很强调 prefix cache：

- 默认不是每 turn 重新构造记忆上下文
- 而是做一个 **KV cache-stable snapshot**
- 只在少数检查点刷新：`session_start`、`session_before_compact`、长期记忆写入、跨天切换

这比很多“每轮都把 memory search 结果拼进去”的方案更工程化。它明确承认：**长期记忆系统不仅是 recall 问题，也是推理吞吐问题。**

### 优点 3：可选 selective injection

如果安装了 `qmd`，它可以支持：

- `keyword`
- `semantic`
- `deep`

三种搜索模式，并在 `per-turn` 模式下自动把 top 结果注入上下文。但默认稳定模式下，它更鼓励按需调用 `memory_search`，而不是每轮都打破缓存。

### 优点 4：把 compaction handoff 显式写回日志

在上下文压缩前，它会自动把 handoff 写进当天的 daily log。这个细节很关键：

- 压缩不是“丢历史”
- 而是“把进行中的状态外化到稳定介质”

这对长任务和跨 session 交接非常有价值。

### 2.4 路线 C：`pi-observational-memory`

`pi-observational-memory` 代表 Pi 生态里最像“认知层记忆”的一条路线。

它不把核心问题定义为“怎么保存更多文本”，而是定义为：

- 多轮 compaction 之后语义漂移
- compaction 时的长等待

因此它提出两类实体：

- **Observations**：会话里发生过的具体事实与事件
- **Reflections**：从 observation 蒸馏出来的持久事实

### 它解决的是“压缩链腐蚀”问题

文档对问题描述得很直接：summary 的 summary 的 summary 会让 rationale 丢失。它的解决方式不是在 compaction 时临时总结，而是在会话进行中就持续提取 observation 和 reflection。

结果是：

- compaction 时只需要快速渲染现成记忆
- 不是再临时跑一轮昂贵总结

### 它引入了证据 ID

每条 reflection / observation 都带 ID，Agent 可以用 `recall` 工具回到源证据。这意味着它并不满足于“压缩后留下一个模糊结论”，而是保留了一个“压缩结论 ↔ 原始证据”的可回溯链路。

这是非常值得借鉴的点：

- summary 要可回证
- durable memory 不应彻底切断 source trace

### 2.5 对 Pi Agent 的总体判断

Pi 不是单一记忆架构，而是一组可替换的记忆实验：

| 路线 | 核心抽象 | 适合场景 |
|---|---|---|
| `pi-hermes-memory` | policy + search + skills + failure memory | 需要完整 Agent 学习闭环 |
| `pi-memory` | Markdown + daily log + qmd | 追求本地透明、低复杂度、缓存稳定 |
| `pi-observational-memory` | observations / reflections / recall IDs | 超长编码会话、频繁 compaction |

Pi 的优势是实验速度快、风格多样；弱点是官方统一内核不够明确，团队采用时需要自己选型和约束扩展组合。

---

## 三、OpenClaw：文件即记忆，插件即召回

OpenClaw 对长期记忆的态度非常鲜明：

> 记忆就是写进工作区里的 Markdown；模型没有隐藏状态。

这是它最关键的架构前提。

### 3.1 三层文件

官方文档给出的三类核心记忆文件是：

- `MEMORY.md`：长期记忆，保存 durable facts、preferences、decisions
- `memory/YYYY-MM-DD.md`：工作日记层，保存 running context、observations、session summaries
- `DREAMS.md`：可选梦境/回顾层，记录 dreaming sweep summaries

自动注入策略也很清楚：

- `MEMORY.md` 在主私聊 session 启动时加载
- 今天和昨天的 daily note 自动加载
- 详细 daily note 不常驻注入，但会被 `memory_search` / `memory_get` 索引

这是一套典型的：

- 热层：`MEMORY.md`
- 温层：近期 daily notes
- 冷层：完整历史日志

### 3.2 强调“动作边界”的记忆

OpenClaw 文档里有一个很成熟的观点：不是所有记忆都只是“事实”，有些记忆会改变将来的行为，因此必须记住它的**生效条件**。

它建议当记忆涉及这些内容时，必须记录 action boundary：

- 是否需要审批
- 是否是临时约束
- 是否与别的 session / 人交接有关
- 何时过期
- 什么条件会解除限制

这实际上是在把“长期记忆”从事实库提升为“行为约束库”。很多 Agent 系统会记住结论，却忘掉结论何时可执行，OpenClaw 在这点上很务实。

### 3.3 检索与插件层

OpenClaw 并不把 memory recall 固化成一套唯一后端，而是抽象为 active memory plugin：

- `memory_search`
- `memory_get`

默认插件是 `memory-core`。在此之上，官方还提供 `memory-wiki`，把 durable memory 编译成更像知识库的 wiki vault，附带：

- 结构化 claims / evidence
- contradiction / freshness tracking
- dashboard / digest
- `wiki_search` / `wiki_get` / `wiki_apply` / `wiki_lint`

这意味着 OpenClaw 把长期记忆系统拆成了两层：

- **recall layer**：让 Agent 找回记忆
- **knowledge compilation layer**：让长期记忆变得更可维护、更可审计

### 3.4 OpenClaw 的优劣

优势：

- 源数据是 Markdown，最容易审计和手工修复
- 不假装有“魔法记忆”，系统行为非常可解释
- action-sensitive memory 这个概念很成熟
- plugin 边界清晰，后续可替换性高

局限：

- 默认内核比较“朴素”，高级能力要靠 plugin 叠加
- 如果没有良好的 promotion / distillation 纪律，`MEMORY.md` 容易膨胀
- 相比 OpenHuman 这类系统，它对外部数据自动汇入做得更少

---

## 四、Hermes Agent：小型内建记忆 + 大型外部 Provider

Hermes Agent 的设计是本文里边界最清楚的之一。

### 4.1 内建记忆层：严格预算、严格注入

官方文档定义了两份内建记忆：

- `MEMORY.md`：Agent 的个人笔记
- `USER.md`：用户画像

默认预算很严格：

- `MEMORY.md`：2200 chars
- `USER.md`：1375 chars

并且它们会：

- 存在 `~/.hermes/memories/`
- 在 session start 时作为 **frozen snapshot** 注入 system prompt
- session 中写入会立即落盘，但不会在本 session 中再次刷新到 system prompt

这个设计非常像“prompt cache friendly memory”：

- 注入是稳定快照
- 避免每轮改写前缀
- live state 通过 tool response 体现

这和 `pi-memory` 的 snapshot 思路高度一致，只是 Hermes 把预算收得更紧。

### 4.2 记忆写入与容量管理

Hermes 用 `memory` tool 管理内建记忆：

- `add`
- `replace`
- `remove`

设计上有几件事很值得注意：

- `replace/remove` 用 substring matching，而不是要求整条精确匹配
- duplicate 会被自动拒绝
- 超预算时要求 agent 先 consolidation，再添加新内容
- 所有写入都会做安全扫描，防止 prompt injection / exfiltration 类内容进入长期记忆

这说明 Hermes 把内建记忆当成“高价值、常驻 prompt 的稀缺空间”，而不是通用知识库。

### 4.3 Session Search：把“过去对话”从“常驻记忆”中分出去

Hermes 的另一个关键点是 `session_search`：

- 所有 CLI / messaging sessions 进入 SQLite `state.db`
- FTS5 全文搜索
- 返回真实消息，不做 LLM summary，也不做截断式改写

这让 Hermes 的记忆体系自然分成两种：

- **persistent memory**：总量很小，但每次启动都在 prompt 里
- **session search**：无限历史，对话级事实按需查

这个切法很干净。它避免了把所有“也许以后会有用”的对话细节都塞进 `MEMORY.md` / `USER.md`。

### 4.4 外部 Memory Provider：把复杂长期记忆外包

Hermes 官方文档写明：它自带 **8 个 external memory provider plugins**，而且 built-in memory 始终和 external provider 并存，后者是 additive，而不是 replacement。

官方文档列出的统一行为包括：

1. 注入 provider context 到 system prompt
2. 每轮前后台 prefetch relevant memories
3. 每轮后同步 conversation turns
4. session 结束时抽取记忆（provider 支持时）
5. 把 built-in memory writes 镜像到 provider
6. 暴露 provider-specific tools

这说明 Hermes 对长期记忆的真正理解是：

- 本地小内存负责“绝对高频、绝对关键”的东西
- 深层长期记忆由专门后端负责

这是很成熟的产品分层。

### 4.5 Hermes 的优劣

优势：

- 产品边界极清晰，容易理解和运维
- 内建层 token 成本高度可控
- session search 与 persistent memory 职责分离明确
- provider 体系使其能接入更复杂的知识图谱/语义检索系统

局限：

- 内建层太小，不适合承载复杂长期知识
- 更强记忆能力基本依赖外部 provider 与额外基础设施
- 多层系统联调时，行为路径会比 OpenClaw 的纯文件体系更复杂

---

## 五、OpenHuman：自动汇入外部世界的 Memory Tree

OpenHuman 和前面三个 coding-agent 风格系统最大的不同，是它把长期记忆做成了一个“个人数据持续同化系统”。

### 5.1 Memory Tree：层级摘要树，而不是单一记忆文件

官方 README 对它的记忆系统描述得很具体：

- 外部数据会先被 canonicalize 成 **不超过 3k token 的 Markdown chunks**
- 再折叠进 **hierarchical summary trees**
- 树和本地运行状态一起存在用户机器上的 **SQLite**
- 同时这些 chunks 也会以 `.md` 文件形式落到 **Obsidian-compatible vault**

这里的架构关键词是：

- chunk
- summary tree
- SQLite
- Obsidian vault

也就是说，OpenHuman 的长期记忆不是“少量 curated notes”，而是一套本地知识压缩管线。

### 5.2 Auto-Fetch：记忆不是等用户说“请记住”

OpenHuman 最大的差异点在这里：

- 激活的连接会被核心层 **每 20 分钟巡检一次**
- 新数据会自动被拉入 memory tree
- 目标是让 agent 在“明天早上”已经拥有“昨晚外部系统里产生的新上下文”

这和 OpenClaw / Hermes / Pi 形成明显分野：

- 它们大多从“对话与工作过程”里长出记忆
- OpenHuman 则主动从 Gmail、Notion、GitHub、Slack、Calendar 等外部系统持续吸收记忆材料

因此 OpenHuman 的长期记忆不是 conversation-centric，而是 **life/workflow-centric**。

### 5.3 TokenJuice：把压缩做成总线级能力

README 还说明 OpenHuman 的 token compression 不是只针对聊天记录，而是针对：

- tool call
- scrape result
- email body
- search payload

统一做压缩与去重，再送入模型。

这意味着：

- 记忆压缩不是 session 结束后的补救动作
- 而是所有外部信息进入模型前的前置工序

这和 `pi-observational-memory` 的“提前做记忆工作”在思想上是一致的，但 OpenHuman 更进一步，把它推广到了所有输入通道。

### 5.4 可选 `agentmemory` 后端

README 明确提到：

- OpenHuman 可以把 `memory.backend` 设为 `agentmemory`
- 让同一 durable store 供 OpenHuman、Claude Code、Cursor、Codex、OpenCode 共同使用

这点非常重要，因为它意味着 OpenHuman 的长期记忆不只服务单一客户端，而是在尝试成为一个跨 Agent 的共享记忆底座。

### 5.5 OpenHuman 的优劣

优势：

- 自动化最强，天然适合个人知识中枢
- 本地 SQLite + Markdown vault 兼顾检索与可见性
- Memory Tree 的层级摘要比“平铺向量 Top-K”更接近长期知识组织
- 可选跨 Agent 共享后端，扩展潜力大

局限：

- 系统复杂度显著高于纯 coding-agent 记忆插件
- 对外部连接与后台同步更依赖
- 对“只想让 coding assistant 记住项目约定”的用户来说，可能偏重

---

## 六、横向对比

| 维度 | Pi Agent | OpenClaw | Hermes Agent | OpenHuman |
|---|---|---|---|---|
| **核心形态** | 扩展生态 | 工作区文件 + 插件 | 内建小记忆 + 外部 Provider | 本地 Memory Tree + 外部数据汇入 |
| **长期记忆主存** | Markdown / SQLite / skills / observation-reflection（依扩展而异） | `MEMORY.md` + daily notes + optional wiki | `MEMORY.md` + `USER.md` + provider store | SQLite summary tree + Obsidian vault |
| **默认注入方式** | 因扩展而异；有 policy-only、snapshot、selective injection 多路线 | `MEMORY.md` + 近期日记自动加载 | session start frozen snapshot | 压缩后的 memory tree / 外部数据上下文 |
| **检索方式** | FTS5 / qmd / recall / on-demand search（依扩展而异） | `memory_search` + `memory_get` | `session_search` + provider tools | 本地树摘要 + 数据源自动摄取 |
| **程序化记忆** | 强，尤其 `pi-hermes-memory` 的 skill 系统 | 可通过 wiki/工作区组织，但不是第一抽象 | 有“self-improving”倾向，但核心内建层仍以事实记忆为主 | 更偏用户/工作流/知识底座，不是 procedural skill 优先 |
| **抗 compaction 策略** | `pi-observational-memory` 最强；`pi-memory` 有 handoff + snapshot | 通过 daily note / dreams / promotion 维持 | frozen snapshot + session search 分流 | TokenJuice + summary tree 预压缩 |
| **可审计性** | 中到高，取决于扩展 | 很高 | 高 | 中，高层自动化更多 |
| **系统复杂度** | 中，生态分散 | 中 | 中到高 | 高 |

---

## 七、最值得借鉴的设计模式

如果目标是给 coding agent 设计一套长期记忆系统，我认为这几个模式最值得抽出来：

### 7.1 热/温/冷分层一定要显式

四个系统虽然实现不同，但都在某种意义上做了分层：

- 热层：常驻 prompt 的少量高价值事实
- 温层：近期会话、工作日志、局部摘要
- 冷层：完整历史、外部数据、可按需召回的档案

不要把所有长期记忆都塞成一个桶。

### 7.2 “写得下”不等于“该常驻”

`pi-hermes-memory` 的 policy-only、`pi-memory` 的 stable snapshot、Hermes 的 frozen snapshot 都在强调同一件事：

- 长期记忆系统必须兼顾 recall 与 prefix cache
- “每轮自动注入更多”往往不是最优策略

这是很多记忆系统设计里最容易被忽略的工程现实。

### 7.3 Markdown 真相源 + 索引加速层 是很稳的折中

Pi 的多个扩展、OpenClaw、OpenHuman 都保留了 Markdown 或可见文件层。这一点很重要：

- 让人类能直接修
- 让 Git 能跟踪
- 让错误写入可回滚

而 SQLite / FTS5 / qmd / 向量索引则只做“检索加速层”，不要反客为主。

### 7.4 证据回溯链非常重要

`pi-observational-memory` 的 observation/reflection ID，OpenClaw 的 claims/evidence 倾向，都是在解决同一个问题：

- durable memory 不应只留下结论
- 应该尽量保留追溯原始依据的能力

否则长期记忆会逐渐变成“无法验证的二手总结”。

### 7.5 程序化记忆应该是一等能力

`pi-hermes-memory` 把 skill 作为长期资产，这一点很对。对 coding agent 来说：

- “用户喜欢 TypeScript”是事实记忆
- “这个 monorepo 出问题时先跑哪几个命令”是程序化记忆

后者往往更能直接提升任务表现。

### 7.6 外部世界自动摄取，是下一阶段记忆系统的分水岭

OpenHuman 的最大启发在于：

- 真正强的长期记忆，不只来自聊天记录
- 还来自邮箱、文档、日历、GitHub、Slack、任务系统

如果未来系统只做“会话记忆”，能力上限会很快碰到天花板。

---

## 八、结论

如果按产品哲学归类：

- **Pi Agent** 在探索“长期记忆插件市场”这条路，优点是灵活，缺点是统一性不足。
- **OpenClaw** 代表“记忆文件系统化、行为边界显式化”的极简工程路线。
- **Hermes Agent** 代表“把 prompt 常驻记忆压到最小，把复杂记忆交给外挂 provider”的成熟产品路线。
- **OpenHuman** 代表“把个人外部世界持续汇入本地知识树”的个人超级助理路线。

如果目标是做一个 **面向 coding agent 的可控长期记忆系统**，我会优先组合这些思想：

1. 用 OpenClaw / `pi-memory` 的文件真相源与透明分层。
2. 用 Hermes 的小型 frozen snapshot 作为热记忆层。
3. 用 `pi-hermes-memory` 的 failure/correction/skill 体系补 procedural memory。
4. 用 `pi-observational-memory` 的 observation/reflection/evidence id 解决 compaction 漂移。
5. 用 OpenHuman 的外部数据汇入和层级摘要树扩展到“项目之外的工作上下文”。

---

## 九、参考来源

### Pi Agent 官方包页面

- `pi-hermes-memory`：<https://pi.dev/packages/pi-hermes-memory>
- `pi-memory`：<https://pi.dev/packages/pi-memory>
- `pi-observational-memory`：<https://pi.dev/packages/pi-observational-memory>

### OpenClaw 官方文档 / 仓库

- Memory overview：<https://github.com/openclaw/openclaw/blob/main/docs/concepts/memory.md>
- Raw view：<https://raw.githubusercontent.com/openclaw/openclaw/main/docs/concepts/memory.md>

### Hermes Agent 官方文档 / 仓库

- Persistent Memory：<https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/memory.md>
- Raw view：<https://raw.githubusercontent.com/NousResearch/hermes-agent/main/website/docs/user-guide/features/memory.md>
- Memory Providers：<https://raw.githubusercontent.com/NousResearch/hermes-agent/main/website/docs/user-guide/features/memory-providers.md>
- README：<https://raw.githubusercontent.com/NousResearch/hermes-agent/main/README.md>

### OpenHuman 官方仓库

- README：<https://github.com/tinyhumansai/openhuman/blob/main/README.md>
- Raw view：<https://raw.githubusercontent.com/tinyhumansai/openhuman/main/README.md>
