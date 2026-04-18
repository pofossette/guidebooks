我先按文章里的实现，给你整理成两个流程图：一个看**多 Agent 编排**，一个看**任务状态机**。由于原始微信链接无法直接打开，我参考了两篇内容高度一致的公开镜像/转载来还原结构。([cnblogs.com][1])

## 1）整体多 Agent 编排流程图

```mermaid
flowchart TD
    A[定时触发 / 新事件进入] --> B[Skill 层<br/>读取 SKILL.md 规则]
    B --> C[主控 Agent / Orchestrator<br/>判断当前事件类型]
    C --> D[调用工具层 db.py<br/>读取今日热点 radar topics]
    D --> E[Spawn Strategist 子 Agent<br/>做选题筛选]

    E --> F[Strategist 输出<br/>3-5 个候选选题 + 评分 + 理由]
    F --> G{人工确认选题}
    G -- 否 / 退回 --> C
    G -- 是 --> H[创建 article 记录<br/>状态=topic_selected]

    H --> I[Spawn Architect 子 Agent<br/>深度调研 + 生成大纲]
    I --> J[Architect 输出<br/>带来源标注的大纲]
    J --> K{人工确认大纲}
    K -- 否 / 退回 --> C
    K -- 是 --> L[保存 outline<br/>状态=outline_confirmed]

    L --> M[Spawn Scribe 子 Agent<br/>撰写全文]
    M --> N[Scribe 输出<br/>Markdown 正文]
    N --> O{人工确认正文}
    O -- 否 / 退回 --> C
    O -- 是 --> P[自动发布 / 推送平台]
    P --> Q[状态更新为 published]
```

这套系统的主线是“**事件驱动 + 三次人工卡点**”：定时触发后，主控 Agent 依据 `SKILL.md` 中的事件规则编排流程，依次调用 Strategist、Architect、Scribe 三个执行 Agent；每个关键产出都需要人工确认后才能进入下一步，最后自动发布。([cnblogs.com][1])

---

## 2）三层架构图

```mermaid
flowchart TB
    S[Skill 层<br/>编排入口 / 事件规则<br/>SKILL.md 定义处理逻辑]
    A[Agent 层<br/>Strategist / Architect / Scribe<br/>负责判断、调研、写作]
    T[工具层<br/>db.py + config.py<br/>封装数据库与基础设施操作]

    S --> A
    A --> T
```

文章把系统拆成三层：
**Skill 层**负责“流程规则与编排入口”，**Agent 层**负责“思考与执行”，**工具层**负责“数据库和基础设施抽象”。这样做的原因是安全、可测、可维护：Agent 不直接接触数据库凭证或 SQL，而是通过 `db.py` 子命令间接操作 Supabase。([cnblogs.com][1])

---

## 3）Sub-Agent 接力机制流程图

这是文章里最关键的一段。

```mermaid
sequenceDiagram
    participant Main as 主 Session / 主控 Agent
    participant Skill as Skill 规则
    participant Sub as Sub-Agent
    participant Sys as 系统事件总线

    Main->>Skill: 读取当前事件处理规则
    Skill-->>Main: 应该 spawn 哪个子 Agent
    Main->>Sub: sessions_spawn(task, label, mode=run)
    Sub->>Sub: 执行具体任务（调研/大纲/写作）
    Sub-->>Sys: 完成任务
    Sys-->>Main: 推送完成事件
    Main->>Main: 根据 label 识别来源
    Main->>Skill: 匹配下一步处理规则
    Skill-->>Main: 决定继续 / 保存结果 / 等待人工确认
```

文章中明确说，主 Agent 并不自己完成所有任务，而是通过 `sessions_spawn(...)` 拉起子 Agent；子 Agent 完成后，系统会自动把“完成事件”推回主 Session，主 Agent 再根据 `label` 识别是哪个任务完成，并按照 Skill 规则决定下一步。这就是整条 Pipeline 能持续“接力”跑下去的关键。([cnblogs.com][1])

---

## 4）三个执行 Agent 的职责分工图

```mermaid
flowchart LR
    R[热点话题池<br/>radar_outbox] --> S1[Strategist<br/>选题筛选]
    S1 --> T1[候选选题列表<br/>评分 + 理由]

    T1 --> H1{人工确认}
    H1 -->|通过| S2[Architect<br/>深度调研 + 大纲]
    S2 --> T2[详细大纲<br/>含信息源标注]

    T2 --> H2{人工确认}
    H2 -->|通过| S3[Scribe<br/>撰写全文]
    S3 --> T3[Markdown 正文]

    T3 --> H3{人工确认}
    H3 -->|通过| P[发布]
```

三个 Agent 分工非常清晰：
Strategist 只做“选题判断”，输入是热点话题，输出是候选主题和评分；Architect 只做“调研 + 大纲”，且强调必须先调研再产出大纲；Scribe 则基于确认后的大纲与材料撰写完整文章。([cnblogs.com][1])

---

## 5）任务状态机流程图

```mermaid
stateDiagram-v2
    [*] --> topic_selected
    topic_selected --> outline_draft
    outline_draft --> outline_confirmed
    outline_confirmed --> writing
    writing --> review
    review --> published
    published --> [*]
```

文章的数据层使用 Supabase，并在 `articles` 表里通过 `status` 字段维护文章生命周期。文中给出的状态流转是：`topic_selected → outline_draft → outline_confirmed → writing → review → published`。这让系统在任何时刻都知道一篇文章处于哪一个阶段。([cnblogs.com][1])

---

## 6）你可以把这篇文章总结成一句话

它不是“一个万能 Agent 写到底”，而是：

**Skill 负责编排规则，主控 Agent 负责调度，Sub-Agent 负责单点执行，工具层负责安全落库，人类在关键节点做确认。** ([cnblogs.com][1])

## 7）如果你想拿去做分享，可以直接用这版极简图

```mermaid
flowchart LR
    A[事件触发] --> B[Skill 编排]
    B --> C[主控 Agent]
    C --> D1[Strategist]
    D1 --> E1[人工确认]
    E1 --> D2[Architect]
    D2 --> E2[人工确认]
    E2 --> D3[Scribe]
    D3 --> E3[人工确认]
    E3 --> F[自动发布]

    C --> G[db.py / config.py]
    G --> H[Supabase]
```

如果你要，我可以继续把它整理成一页更适合 PPT 的“架构图版”，或者改成 draw.io / PlantUML 风格。

[1]: https://www.cnblogs.com/jarvis-ai-lab/p/19838203 "用 AI Agent 搭建微信公众号全自动内容 Pipeline：从选题到发布的事件驱动架构实战 - xiaochuran_ai - 博客园"
