下面这篇不再侧重“框架谁支持什么”，而是侧重 **agent eval benchmark 是怎么做出来的**。同时也把 **EverOS 官方展示数据用到的测评** 单独拆出来讲清楚。

先给结论：**agent benchmark 的实现方式并不统一**。今天常见实现，大致分成 5 种：

1. **长程记忆 / 人设记忆型**：LoCoMo、LongMemEval、PersonaMem、EverMemBench
2. **有状态工具调用型**：τ-bench / τ³-bench、ToolSandbox
3. **浏览器 / GUI / OS 环境型**：WebArena、OSWorld
4. **代码仓库修复型**：SWE-bench
5. **多环境统一套件型**：AgentBench

如果再加上 EverOS 自己的方向，还要再补一类：

6. **自演化 / 长期成长型**：EvoAgentBench

## 1. 一个 agent benchmark 通常由哪几层组成

```text
任务定义
  ↓
环境 / 数据
  ├─ 静态历史
  ├─ 沙箱 API
  ├─ 自托管网站
  ├─ 虚拟机 / 桌面环境
  └─ 真实代码仓库
  ↓
agent 接口
  ├─ 文本输入输出
  ├─ function/tool calling
  ├─ browser / GUI action
  └─ patch / file diff
  ↓
执行循环
  ├─ 单轮
  ├─ 多轮
  ├─ 用户模拟器
  └─ 环境状态转移
  ↓
评分器 / verifier
  ├─ exact match
  ├─ hidden tests
  ├─ page / world state checks
  ├─ tool trajectory checks
  └─ LLM judge
  ↓
日志 / 复现 / 排行榜
```

换句话说，benchmark 不是只有“题库”，而是至少包括：

- **task corpus**
- **environment**
- **agent protocol**
- **verifier**
- **reproducibility layer**

## 2. 常见 benchmark 的 5 种实现模式

### A. 长程记忆 / 人设记忆型：先给长历史，再问问题

代表：

- **LoCoMo**
- **LongMemEval**
- **PersonaMem**
- **EverMemBench**

这类 benchmark 的核心不是让 agent 去操作环境，而是测试它能不能在 **长历史、多 session、时间演化、人物画像变化** 里记住、检索、推理、个性化生成。

#### 典型实现方式

```text
构造长历史
  ↓
把历史喂给 memory system / model
  ↓
提出问题 / 生成任务
  ↓
看回答是否正确
  ↓
必要时再看 evidence retrieval / persona consistency
```

#### 1. LoCoMo：长对话记忆 benchmark

LoCoMo 官方仓库说明，它发布的是 **very long-term conversational data**，基准由 **10 段长对话** 构成；每段对话都标注了 **question answering** 和 **event summarization**，对话本身还可用于 **multimodal dialog generation**。([LoCoMo][1])

这说明 LoCoMo 的实现重点是：

- 长对话数据构造
- 多任务标注
- 以 **QA / 总结 / 多模态生成** 作为评测出口

它更像 **long-history benchmark**，不是 interactive sandbox。

#### 2. LongMemEval：多 session 记忆 benchmark

LongMemEval 官方仓库说明，它有 **500 个问题**，覆盖 5 类长期记忆能力：

- Information Extraction
- Multi-Session Reasoning
- Knowledge Updates
- Temporal Reasoning
- Abstention ([LongMemEval][2])

更关键的是它的实现方式：官方明确说它用 **attribute-controlled pipeline** 来编排 **coherent、extensible、timestamped chat history**，即先生成和拼接时间化历史，再在历史全部发生后提问。([LongMemEval][2])

这类 benchmark 的实现重点通常是：

- 历史编排器
- session 时间轴
- 问题分类体系
- answer verifier

#### 3. PersonaMem：把“用户画像变化”引进 benchmark

PersonaMem 官方仓库就是论文和 benchmark 的正式实现。它的方向不是普通记忆问答，而是 **dynamic user profiling** 和 **personalized responses**。([PersonaMem][3])

这类 benchmark 的实现方式，通常比 LoCoMo / LongMemEval 多一层：

```text
历史对话
  ↓
推断用户偏好 / persona
  ↓
回答当前问题
  ↓
检查是否既正确又符合用户画像
```

也就是说，**评分不只看事实是否答对，还看是否“记住了这个人是谁”**。

#### 4. EverMemBench：EverOS 自己的三层记忆评测

EverMemBench 官方仓库把记忆系统拆成三层：

- **Factual Recall**
- **Applied Memory**
- **Personalization Generalization** ([EverMemBench Repo][4])

对应到实现上，它不再只做“找得到答案吗”，而是分层测：

1. 细粒度事实回忆
2. 结合历史做上下文推理
3. 根据长期交互形成稳定的人设理解与生成风格

EverMemBench 还特别强调 **multi-person group chat**、**multi-role / multi-group / cross-context**、**temporal persona drift**。这说明它的 benchmark 实现比传统 dyadic chat 更复杂，更接近企业协作场景。([EverMemBench Paper][5], [EverMemBench Repo][4])

#### 这一类 benchmark 的共性

优点：

- 容易规模化
- 复现成本低于 GUI / VM benchmark
- 非常适合评估 memory layer

局限：

- 不直接测真实工具调用
- 不直接测 browser / OS 操作
- 很多结果仍依赖 answer judge，而不是环境状态验证

## 3. 有状态工具调用型：核心是 world state 和 user simulator

代表：

- **τ-bench / τ³-bench**
- **ToolSandbox**

这类 benchmark 和前一类最大的区别，是它们不是“给你一段历史然后提问”，而是：

```text
用户提出需求
  ↓
agent 选择工具
  ↓
工具改变世界状态
  ↓
用户继续追问 / 澄清
  ↓
最后根据环境状态和轨迹评分
```

### A. τ-bench / τ³-bench

τ-bench 论文和官方仓库都把它定义为：**模拟一个用户（由 LLM 扮演）与一个拥有 API 工具和 policy guidelines 的语言 agent 之间的动态对话**。([τ-bench][6])

这个定义里最关键的实现点有三个：

1. **用户模拟器**
2. **领域 API 工具**
3. **策略约束 / 业务规则**

到 2026 年，官方 README 已经明确写明：老的 `tau-bench` 任务版本过时，应该使用 **τ³-bench**。这里需要注意，当前公开说明放在 `tau2-bench` 仓库的 README 里。README 直接写了：

- 从 text-only 扩展到 **multimodal**
- 加入 **knowledge-aware** evaluation
- 增加 **voice full-duplex**
- 修了 **75+ task fixes** ([τ³-bench][7])

这说明这类 benchmark 的一个现实问题是：**环境和任务会持续漂移，版本号本身就是 benchmark 的一部分**。

### B. ToolSandbox

ToolSandbox 的实现方式非常典型，而且文档写得很清楚。它内置了一个 **execution context**，里面保存：

- tools
- dialog history
- world state
- 每一轮的 state snapshot ([ToolSandbox][8])

它的 world state 由若干数据库组成，例如：

- settings
- contact book
- messaging database
- reminder database ([ToolSandbox][8])

此外，ToolSandbox 显式区分四种角色：

- system
- user
- agent
- execution environment ([ToolSandbox][8])

这意味着 ToolSandbox 的 benchmark 不只是“工具列表 + 测试题”，而是一个真正的 **stateful conversational simulator**。这类 benchmark 通常还能做：

- 中间里程碑评分
- 最终状态评分
- 错误归因

#### 这一类 benchmark 的共性

优点：

- 更像真实业务 agent
- 可以测工具选择、参数、顺序、状态依赖
- 适合客服、运营、知识服务等 agent

局限：

- 需要自己维护模拟环境
- 用户模拟器会影响稳定性
- 评分设计比静态 QA 更复杂

## 4. 浏览器 / GUI / OS 环境型：核心是可复现环境和程序化验证

代表：

- **WebArena**
- **OSWorld**

### A. WebArena

WebArena 官方仓库把自己定义成 **standalone, self-hostable web environment for building autonomous agents**。([WebArena][9])

它的 benchmark 不是开放互联网，而是 **自托管网站环境**。这样做的好处是：

- 环境可复现
- 页面内容和流程可控
- 可以写程序化验证器

官方 README 还明确强调：要正确评测，需要自己搭建 WebArena sites；评完 **812 examples** 后还要把环境重置到初始状态。([WebArena][9])

这其实就暴露了 browser benchmark 的实现关键：

```text
自托管网站
  +
统一 action space
  +
程序化 task config
  +
任务后环境 reset
  +
执行式 verifier
```

另外，2024-12 的更新说明里，WebArena 也明确说现在 web navigation 基础设施已经被 **AgentLab / BrowserGym** 增强，支持并行实验、统一 benchmark 集成、统一 leaderboard。([WebArena][9])

所以 WebArena 的实现经验也说明：**benchmark 往往会演进成 environment + harness 两层结构**。

### B. OSWorld

OSWorld 的目标更进一步：它是 **真实计算机环境** 里的 open-ended task benchmark。官方 README 提到它基于真实 web 和 desktop app，评测需要 VMware / Fusion 等虚拟化环境。([OSWorld][10], [OSWorld Paper][11])

这类 benchmark 的实现重点不是单纯点击网页，而是：

- 虚拟机镜像
- 桌面环境状态管理
- 多应用工作流
- GUI action observation loop

OSWorld 还有一个非常现实的点：**benchmark 版本更新会影响分数可比性**。README 在 2025-07-28 的更新里明确说，引入了 **OSWorld-Verified**，修了不少 benchmark signal 和任务问题，并提醒提交者“只和同版本结果比较”。([OSWorld][10])

#### 这一类 benchmark 的共性

优点：

- 最接近真实 computer-use agent
- 可评 GUI 操作、跨应用流程、多模态 grounding

局限：

- 运行成本高
- 环境搭建重
- 并发与重置复杂
- 分数高度依赖 benchmark 版本

## 5. 代码仓库修复型：核心不是 judge，而是 hidden tests

代表：

- **SWE-bench**

SWE-bench 的定义非常直接：给定一个代码仓库和一个 GitHub issue，让模型生成 patch 来修复问题。([SWE-bench][12])

它的 benchmark 实现方式非常成熟：

```text
真实仓库快照
  +
真实 issue
  +
agent 产出 patch
  +
Docker 复现环境
  +
运行测试 / hidden tests
  =
是否解决问题
```

官方仓库明确写了两点：

- `SWE-bench uses Docker for reproducible evaluations`
- 评测会生成 build logs、evaluation logs、evaluation_results ([SWE-bench][12])

这类 benchmark 的关键价值在于：

- 评分尽量交给 **可执行测试**
- 减少 LLM judge 主观性
- 让 agent 真正对 repo state 负责

这也是为什么 SWE-bench 会成为很多 coding agent 的核心 benchmark。

## 6. 多环境统一套件型：用统一 controller 跑异构世界

代表：

- **AgentBench**

AgentBench 的设计不是围绕一个环境，而是围绕 **多个环境统一评测**。官方把它定义成第一个系统性评估 LLM-as-Agent 的 benchmark，覆盖多种不同 environment。([AgentBench][13])

在原始版本里，它把 8 个环境放进同一个 suite；到 2025-10，仓库又引入了 **AgentBench FC**，强调 function-calling prompt 和更完整的容器化部署。([AgentBench][13])

这种 benchmark 的实现思路是：

```text
统一 controller / runner
  ↓
不同 task worker / environment
  ├─ OS
  ├─ DB
  ├─ KG
  ├─ Web
  └─ others
  ↓
统一日志和 leaderboard
```

优点：

- 能看“泛化的 agent 能力”
- 可横向比较不同环境

缺点：

- 每个子环境的 fidelity 不一定一样
- 维护成本高
- 环境异构会拉高 benchmark 工程复杂度

## 7. EverOS 官方展示数据，到底用的是哪些 benchmark

这个问题最容易混淆。

EverOS 官方 README 在 `Evaluation` 一节里写得很清楚：它当前公开展示和 runner 支持的 benchmark 主要是：

- **LoCoMo**
- **LongMemEval**
- **PersonaMem** ([EverOS README][14])

同时，README 展示了 EverCore 的公开结果中有：

- `LoCoMo 93.05%`
- `LongMemEval 83.00%` ([EverOS README][14])

另外，EverOS 还把两套自家 benchmark 作为独立组件列出来：

- **EverMemBench**：三层记忆质量评测
- **EvoAgentBench**：自演化能力评测（longitudinal growth curves、transfer efficiency、error avoidance、skill-hit quality）([EverOS README][14])

### 这意味着什么

EverOS 官方现在展示的数据，**核心仍然是“长期记忆”这条能力线**，而不是通用浏览器 agent、通用电脑操作 agent、或者代码修复 agent。

换成更直白的话：

```text
EverOS 公开分数
  ≠ 通用 agent 总分
  = 长期记忆 / 个性化记忆 / 多 session 记忆能力的公开结果
```

所以如果你要评一个“全能 agent”，只跑 EverOS 当前展示的这些 benchmark 还不够。你至少还要补：

- 工具调用 benchmark：τ³-bench / ToolSandbox
- 浏览器或电脑环境 benchmark：WebArena / OSWorld
- 代码 agent benchmark：SWE-bench

## 8. 如果你要自己实现一个 agent benchmark，应该怎么设计

### A. 先定“评什么能力”，不要先定题库

能力维度通常至少分成：

- final outcome
- tool use
- trajectory quality
- state tracking
- memory
- safety
- efficiency

### B. outcome verifier 和 trajectory judge 最好分开

```text
Outcome verifier:
  任务最后有没有完成

Trajectory judge:
  过程是否合理、是否违规、是否低效
```

SWE-bench 偏 outcome verifier。
ToolSandbox / LangSmith trajectory eval 更像 trajectory judge。
成熟 benchmark 往往两者都要有。

### C. 一定要设计可 reset 的环境

浏览器、VM、数据库、工具沙箱都一样：

- 环境状态必须能重置
- 每次运行最好可复现
- 版本和数据快照必须可追踪

WebArena、OSWorld、SWE-bench 都把这一点做得很重。([WebArena][9], [OSWorld][10], [SWE-bench][12])

### D. benchmark 版本必须写进结果里

这是 2025-2026 很明显的趋势：

- `tau-bench` 明确提示旧任务过时，应使用 `τ³-bench`。([τ-bench][6], [τ³-bench][7])
- WebArena 说明 canonical implementation 与 AgentLab 增强版基础设施并存。([WebArena][9])
- OSWorld-Verified 明确要求同版本内比较结果。([OSWorld][10])

**不写版本号，分数就经常不可比。**

### E. 最好保留完整执行日志，而不是只保存总分

因为 agent benchmark 最有价值的部分，往往不是 leaderboard，而是：

- 错在哪一步
- 用错了哪个工具
- 是否发生状态污染
- 是否因为用户模拟器偏差失败

## 9. 一个很实用的 benchmark 选型建议

### 如果你评的是“通用业务 agent”

建议覆盖：

- **工具调用**：τ³-bench / ToolSandbox
- **网页或 GUI**：WebArena / OSWorld
- **记忆**：LongMemEval / PersonaMem
- **代码能力**：SWE-bench

### 如果你评的是“memory agent”

建议覆盖：

- **LoCoMo**
- **LongMemEval**
- **PersonaMem**
- **EverMemBench**

### 如果你评的是“研究原型，想看跨环境泛化”

建议覆盖：

- **AgentBench**
- 再叠加一个更垂直的真实环境 benchmark

## 10. 我对当前 benchmark 实现格局的归纳

### A. 评测正在从“静态问答”走向“可执行环境”

ToolSandbox、τ³-bench、WebArena、OSWorld、SWE-bench 都体现了这一点。([ToolSandbox][8], [τ³-bench][7], [WebArena][9], [OSWorld][10], [SWE-bench][12])

### B. 但长程记忆 benchmark 仍然非常重要

因为很多 agent 真正难的，不是一次 tool call，而是 **跨 session 的长期记忆和 persona 维持**。这正是 LongMemEval、PersonaMem、EverMemBench、EverOS 当前展示 benchmark 的重点。([LongMemEval][2], [PersonaMem][3], [EverMemBench Paper][5], [EverOS README][14])

### C. benchmark 工程化已经和“环境维护”绑定在一起

今天很多 benchmark 不再只是一个 `jsonl` 数据集，而是：

```text
dataset
  +
simulator / sandbox / website / vm
  +
verifier
  +
runner
  +
versioned leaderboard
```

一句话总结：**agent eval benchmark 的实现方式，本质上是在“题目、环境、状态、验证器、复现层”之间做工程设计；而 EverOS 当前公开展示的数据，主要属于长期记忆 benchmark 这一支，而不是通用 agent benchmark 的全集。**

[1]: https://github.com/snap-research/locomo "snap-research/locomo"
[2]: https://github.com/xiaowu0162/longmemeval "xiaowu0162/LongMemEval"
[3]: https://github.com/bowen-upenn/PersonaMem "bowen-upenn/PersonaMem"
[4]: https://github.com/EverMind-AI/EverMemBench "EverMind-AI/EverMemBench"
[5]: https://arxiv.org/abs/2602.01313 "EverMemBench: Benchmarking Long-Term Interactive Memory in Large Language Models"
[6]: https://github.com/sierra-research/tau-bench "sierra-research/tau-bench"
[7]: https://github.com/sierra-research/tau2-bench/blob/main/README.md "tau2-bench README (introducing tau3-bench)"
[8]: https://github.com/apple/ToolSandbox "apple/ToolSandbox"
[9]: https://github.com/web-arena-x/webarena "web-arena-x/webarena"
[10]: https://github.com/xlang-ai/OSWorld "xlang-ai/OSWorld"
[11]: https://arxiv.org/abs/2404.07972 "OSWorld: Benchmarking Multimodal Agents for Open-Ended Tasks in Real Computer Environments"
[12]: https://github.com/SWE-bench/SWE-bench "SWE-bench/SWE-bench"
[13]: https://github.com/THUDM/AgentBench "THUDM/AgentBench"
[14]: https://github.com/EverMind-AI/EverOS "EverMind-AI/EverOS"
