# AI 编码 Agent 的架构、提示词与上下文策略

这一页只回答四个问题：

- 三类 AI 编码 agent 的主架构差别在哪里
- 它们怎样把系统提示词、项目规则、工具定义和环境信息拼到一起
- 它们怎样控制上下文膨胀、压缩历史和重排注意力
- 多 agent / 子 agent 在这些系统里分别扮演什么角色

如果你更关心任务管理、`todo`、`/goal`、暂停与续跑，直接看 [任务、Todo 与目标策略](./agent-task-and-goal-strategies.md)。

## 先给结论

三者都不是“一个会写代码的聊天框”，而是“模型 + 工具 + 状态管理 + 续跑控制”的组合系统，但优先级不同：

- `Claude Code` 更强调提示词结构、工具纪律、会话内上下文压缩，以及对宿主工作流的快速适配。
- `OpenCode` 更像一个可替换运行时：提示词层相对薄，但 `session`、`permission`、`event`、`tool registry` 和 `provider` 组合能力更强。
- `Codex` 更偏状态机和协议驱动：线程、回合、目标、工具权限、恢复与续跑都有更清晰的后端建模。

这会直接影响你怎么理解它们：

- 想研究“提示词怎么拼、上下文怎么控、工具怎么暴露”，`Claude Code` 和 `OpenCode` 更容易对照。
- 想研究“长任务如何被状态机托住、如何在恢复后继续跑”，`Codex` 的实现更完整。
- 想抄作业做自己的 agent，不要只抄系统提示词；真正决定行为稳定性的，是提示词之外的状态层和中断恢复层。

## 1. 三者的系统边界

| 维度 | Claude Code | OpenCode | Codex |
|---|---|---|---|
| 主实现风格 | TypeScript CLI / app runtime | TypeScript + Effect runtime | Rust 状态机 + 协议层 |
| 主要 API 形态 | Anthropic 风格消息与工具循环 | 多 provider + 自建 session runtime | OpenAI Responses API + 自建 thread runtime |
| 核心状态单位 | 当前 session 与其附属上下文 | session + event + permission + tool graph | thread + turn + goal + continuation |
| 强项 | prompt 组织、工具纪律、交互体验 | runtime 组合性、事件化、可扩展执行面 | 持久化状态、预算与恢复、边界清晰 |

一个实用判断是：

- `Claude Code` 的“行为感”很多来自系统提示词、工具提示词和宿主规则文件。
- `OpenCode` 的“行为感”来自 prompt 和 runtime 各占一半。
- `Codex` 的“行为感”更多来自 thread/turn/tool/goal 的后端控制面，而不是一大段静态 prompt。

## 2. Prompt 是怎么拼出来的

### Claude Code

`Claude Code` 的典型做法是把系统提示词拆成多段，然后在静态区和动态区之间划缓存边界。

重点不是“有一段很长的系统提示词”，而是：

- 身份、风格、工具使用纪律、任务规范尽量放在前面
- 会变化的 session guidance、memory、环境信息、MCP 指令放到后面
- 工具定义既出现在系统规则中，也会作为 `tools[]` 一起传给模型

这样做的好处是：

- 开头部分更稳定，更容易被缓存，也更吃到 U 形注意力前段
- 动态部分可以跟着 session 状态变化，而不用重建整块静态规则

### OpenCode

`OpenCode` 的系统提示词更像“provider 基础 prompt + 环境与说明层叠”：

- provider 自带的基底提示词先定角色和任务习惯
- 然后叠加 `input.system`
- 再叠加用户消息中的 system 片段
- 最后把环境信息、规则文件、技能列表拼上去

它的差异不在于“提示词更复杂”，而在于：

- prompt 本身更像 runtime 的一个输入层
- 很多真正的行为边界放在 `permission`、`session`、`tool registry` 和 `control-plane` 层

### Codex

`Codex` 更少把自己包装成一个“巨型系统提示词工程”。

更准确的说法是：

- `instructions` 当然仍然重要
- 但真正的系统性行为更多来自线程、回合、工具协议、目标运行时和续跑逻辑

所以如果你只看 prompt，很容易低估 `Codex` 的真实设计重点。它不是靠一段更会写的 system prompt 获胜，而是靠后端控制面减少模型随意性。

## 3. 项目规则和长期上下文怎么注入

| 维度 | Claude Code | OpenCode | Codex |
|---|---|---|---|
| 规则文件 | `CLAUDE.md` 为中心，可分层 | `AGENTS.md` / `CLAUDE.md` 首匹配 | `AGENTS.md` 向上收集并预算化 |
| 长期记忆 | 更偏规则注入和 session 恢复 | 更偏 session/runtime 持久化 | 更偏 thread state 与 runtime steering |
| 注入方式 | 作为系统或高优先级上下文片段 | 作为 instruction/system 输入层 | 作为 thread 级上下文的一部分 |

这里最容易误判的一点是：规则文件不等于“记忆系统”。

- `Claude Code` 的 `CLAUDE.md` 更像可读、可维护、可层叠的项目规则入口。
- `OpenCode` 的规则文件只是 runtime 输入的一部分，真正的“持续性”更多靠 session/event 层。
- `Codex` 的长期约束感则更多由线程对象和运行时状态承接。

## 4. 上下文管理不是摘要，而是分层丢弃

三者都会压缩上下文，但压缩策略不同。

### Claude Code 的思路

核心是“先把能外置的东西外置，再在需要时压缩”：

- 工具结果可持久化，减少重复塞回 prompt
- 老的工具输出、历史片段会被清理
- 压缩后再把少量关键文件、skills、最近消息重新注入

这类策略非常适合交互式开发：用户在一个长会话里做很多轮操作，但不希望每轮都把全部历史重发。

### OpenCode 的思路

`OpenCode` 更像“保住尾部，把中间折叠掉”：

- 留出 provider 和输出缓冲
- 保护最近两轮或一定 token 预算的 tail
- 中间历史优先摘要化或修剪

这使它很适合多 provider 场景，因为它不把压缩策略写死成某一个模型习惯，而是做成较稳定的 runtime 手法。

### Codex 的思路

`Codex` 的压缩更像 thread runtime 的一部分，而不是一个附属技巧：

- pre-turn compaction
- mid-turn compaction
- 工具输出截断
- 只重发必要的上下文差异

它的目标不是“尽量保留聊天感”，而是“让线程在预算内继续可执行”。

## 5. U 形注意力在三者里怎么落地

一个简化判断：

- `Claude Code` 最明确地把高价值静态规则放在前部，把最近消息和重注入内容放在尾部。
- `OpenCode` 也明显利用了“前部基底 prompt + 后部 tail 保留”的结构。
- `Codex` 虽然不那么强调提示词工程术语，但在实际 runtime 中同样会优先保留最近用户意图和继续执行所需的关键上下文。

所以 U 形注意力不是某一家独有技巧，而是三家都在用，只是包装方式不同：

- `Claude Code` 和 `OpenCode` 更像“提示词布局”
- `Codex` 更像“状态驱动的上下文重建”

## 6. 工具系统怎么影响 Agent 风格

| 维度 | Claude Code | OpenCode | Codex |
|---|---|---|---|
| 工具提示词权重 | 很高 | 高 | 中 |
| 权限层 | 有，但更像交互约束 | 明确的 permission 服务 | 明确的 tool authority 与 runtime 约束 |
| 失败后的补救 | 交互与提示词并重 | runtime / permission / event 结合 | 状态机与协议收束 |

一个常见误解是：“模型会不会用工具，主要看系统提示词写得好不好。”

实际上：

- `Claude Code` 里，工具提示词和系统提示词确实影响很大
- `OpenCode` 里，工具是否成功更依赖 tool registry、session 和 permission 组合
- `Codex` 里，工具权力边界本身就是后端协议的一部分

这也是为什么 `Codex` 在 `goal` 这种高自治能力上会更克制地限制工具权限，而不是只靠提示词告诫模型“别乱来”。

## 7. 多 Agent / 子 Agent 是怎么分工的

### Claude Code

`Claude Code` 的多 agent 更偏执行辅助：

- 主 session 负责整体推进
- 子 agent 处理验证、并行子任务或特定技能流程
- 是否让子 agent 可见、如何呈现进度，和宿主体验绑定很深

### OpenCode

`OpenCode` 的 task / subagent 更容易和 runtime 控制面连起来看：

- 它不是单纯“再开一个聊天”
- 而是 session/runtime/permission/event 下的一种执行单元

### Codex

`Codex` 的多执行单元更像线程和 turn 状态机的自然外延。它的重点不是 UI 上有多少个 agent，而是：

- 当前线程是否空闲
- 当前 turn 是否结束
- continuation 是否允许继续
- 哪个工具或状态变更可以触发下一轮

这就是三者最大的区别之一：

- `Claude Code` 和 `OpenCode` 更容易从“agent 视角”理解
- `Codex` 更适合从“runtime 视角”理解

## 8. 实际启发

如果你是要自己做 agent，最值得抄的不是某一家的整套外观，而是下面这些分工：

1. 用 `Claude Code` 的思路组织静态规则、工具纪律和前后注意力布局。
2. 用 `OpenCode` 的思路把 session、permission、tool registry 和 provider 组合做薄耦合。
3. 用 `Codex` 的思路把长任务续跑、预算、状态切换和恢复逻辑放进明确的 runtime 对象。

把这三类能力混在一个大 prompt 里，通常做不稳。
