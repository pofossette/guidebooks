# AI 编码 Agent 的任务、Todo 与目标策略

这一页专门订正一个常见混淆：`todo`、`task`、`/goal`、暂停与续跑，并不是同一种能力。

最容易写错的地方有两个：

- 把会话内任务清单误写成线程级目标状态机
- 把“自动继续跑”误写成“已经有完整持久化目标运行时”

这正是 `Claude Code`、`OpenCode`、`Codex` 的真实差异所在。

## 先给结论

三者里只有 `Codex` 明确把 `goal` 做成线程级持久化对象和状态机。

另外两者更接近：

- `Claude Code`：会话任务管理很强，`/goal` 是跨回合自动续跑的控制面，但公开证据不足以把它等同于 Codex 的线程级目标运行时
- `OpenCode`：有会话范围的 todo 持久化、`task/subagent` 和运行时控制，但当前不应把它描述成完整目标状态机

如果只记一句话：

- `Claude Code` 擅长“把当前任务分解出来并盯着做”
- `OpenCode` 擅长“把会话里的执行流和 todo 持久化起来”
- `Codex` 擅长“把长期目标建模成可暂停、可恢复、可计量的线程对象”

## 1. 先分清三层抽象

### 会话任务清单

目标是告诉模型“当前这轮开发要做哪几步”，通常包含：

- `pending / in_progress / completed`
- 是否需要验证步骤
- 当前正在做哪一项

这类东西最适合解决的是“别漏步骤、别忘验证、让用户看见进度”。

### 执行控制单元

目标是让一个大任务被拆成更小的执行片段，例如：

- 子 agent
- 后台任务
- `task create / task update`
- `plan mode` 里的任务节点

这类东西更像运行时编排，而不是用户可读的 todo 清单。

### 线程级目标

目标是把一个跨多回合、可暂停恢复、可计量的目标做成一等对象，通常包含：

- `objective`
- `status`
- `budget`
- `tokens / elapsed time accounting`
- `resume / clear / completion rules`

`Codex` 在这一层最完整。`Claude Code` 的 `/goal` 有这个方向，但公开证据还不够支撑“与 Codex 同级”的写法。`OpenCode` 目前则更不适合这样表述。

## 2. Claude Code：会话任务管理强，/goal 是续跑控制面

### 2.1 Todo 和 Task 才是它的第一层主角

`Claude Code` 的旧文最容易犯的错误，是只盯着 `TodoWrite`，或者反过来只盯着 `/goal`。

更准确的写法是：

- `TodoWriteTool` 是会话任务追踪工具
- `TaskCreateTool` / `TaskUpdateTool` 代表了更“结构化任务”方向的演进
- 这套系统的核心作用是把多步骤工作显式拆开，并要求状态及时更新

它解决的问题不是“长期目标建模”，而是：

- 多步骤任务别丢
- 执行中只保留少数活跃项
- 完成后及时更新状态
- 把验证纳入任务清单

所以描述 `Claude Code` 时，应该先写“会话任务管理”，再谈 `/goal`。

### 2.2 /goal 的更准确定位

基于本地材料和最新公开资料，截至 **2026-07-08**，`Claude Code /goal` 更准确的表述是：

- 它设置的是 completion condition，不只是普通文本目标
- Claude 会在回合结束后继续判断条件是否已满足
- 条件未满足时，会自动启动下一轮，而不是把控制权立刻交回用户
- 它依赖停止判定与编排收敛，因此会和后台 shell、委派子 agent、hooks 发生强耦合

官方公开文档已经把这一点说得更直白了：

- `/goal` 要求 `Claude Code v2.1.139` 或更高版本
- 每轮结束后会有一个更快的小模型检查条件是否成立
- 如果条件还不成立，就继续下一轮
- 文档现在明确把它和 `Stop hook`、`/loop` 并排比较

这意味着：

- 它已经不是简单的“命令别名”
- 也不只是“提示模型继续干活”
- 它确实是一个内建的自动续跑控制面

但仍然不该把它写成 `Codex` 式线程级目标运行时，因为公开证据里还缺：

- 完整公开可见的 goal 持久化对象
- 完整公开可见的状态枚举
- 类似 `create_goal / get_goal / update_goal` 的显式工具契约

### 2.3 公开证据说明了什么

这次订正后，`Claude Code /goal` 应该按“公开行为强、内部建模未完全公开”来写。

截至 **2026-07-08** 的公开资料至少支持这些判断：

- `Week 20 · May 11–15, 2026` 的官方周报明确宣布 `/goal`，并说明它在 interactive、`-p`、Remote Control 中工作
- 官方 `/goal` 文档明确说它在每轮结束后做条件评估，并在条件未满足时自动开始下一轮
- 官方最佳实践文档明确把 `/goal` 和 `Stop hook` 并列为“让 unattended run 正确结束”的机制
- 官方 hooks 文档和指南说明 `Stop` hook 是真实一等事件，并存在连续阻止上限

同时，公开 issue 也说明它还不是一个“边界已完全打磨好的黑盒”：

- Desktop Code tab 对 `/goal` 和 `/permissions` 的环境限制或回归仍存在争议
- Remote Control 与非交互环境之间的命令可用性仍有行为差异
- `/goal` 在 cancel、compaction、Stop hook 错误、529 过载等场景下仍有续跑一致性问题

所以最终判断应写成：

- `Claude Code /goal` 是一个比较成熟的自动续跑控制面
- 但它的公开可见实现边界更接近“完成条件循环 + 靠近 Stop hook 的编排层”
- 而不是“已完全公开的持久化目标状态机”

## 3. OpenCode：会话 todo 持久化明显，但不是 Codex 式目标运行时

### 3.1 它真正做强的是会话级 todo

`OpenCode` 里，`todowrite` 和 `SessionTodo` 都非常明确：

- todo 是会话范围数据
- 写入后会持久化
- 运行时可以从数据库里读回同一会话的 todo 列表

这使它和很多“只把 todo 临时塞进提示词”的系统不同。

但这里的重点仍然是：

- 它持久化的是 todo 清单
- 不是线程级目标对象

### 3.2 `task/subagent` 是执行控制，不是目标抽象

`OpenCode` 也有 `task`、subagent、permission、control-plane。

这说明它有较强的执行面，但不能直接推出“因此它也有 Codex 式 goal 系统”。

更准确的写法是：

- `todo` 负责进度可见性和步骤跟踪
- `task` 更偏子任务派发或执行控制
- `permission`、`workspace`、`control-plane` 决定这些任务怎样真正跑起来

所以它的能力形态更像：

- 持久化的会话任务层
- 组合式运行时控制层

而不是：

- 显式线程目标状态机

### 3.3 文档里不该再怎么写

重写后应避免以下表述：

- “`OpenCode` 也有 `/goal`”
- “`OpenCode` 和 `Codex` 一样都有持久化目标”
- “`OpenCode` 的 todo 就是目标”

更稳的说法是：

- `OpenCode` 在任务跟踪上比很多 agent 更持久化
- 但它当前公开出来的主能力仍然是会话 todo、`task/subagent`、`permission/runtime`
- 如果要比较目标运行时，它不应和 `Codex` 放在同一层

## 4. Codex：三者里唯一明确的线程级目标状态机

### 4.1 目标是一等线程对象

`Codex` 的 `goal` 不是提示词技巧，也不是会话内 checklist。

它是线程级对象，带有明确字段，例如：

- `objective`
- `status`
- `token budget`
- `tokens used`
- `elapsed time`

这意味着它不是“告诉模型去做什么”这么简单，而是把目标变成运行时可观察、可计量、可恢复的状态。

### 4.2 模型的权限是被刻意收紧的

`Codex` 允许模型接触 `goal`，但方式很克制：

- `get_goal`
- `create_goal`
- `update_goal`

关键不是“模型能用这几个工具”，而是：

- `create_goal` 只允许在用户明确要求时创建
- `update_goal` 只能把状态标成 `complete` 或 `blocked`
- `pause`、`resume`、`budget-limited`、`usage-limited` 不由模型自说自话

这说明 `Codex` 的设计重点不是“让模型更自由”，而是“让目标生命周期保持受控”。

### 4.3 为什么它和 todo list 不是一回事

todo list 主要回答：

- 现在有哪些步骤
- 哪一步在做
- 哪一步做完了

`Codex` 的目标主要回答：

- 这个线程当前追求什么目标
- 它是否处于 active / paused / blocked / budget-limited 等状态
- 它已经烧掉多少 token 和时间
- 在什么条件下还能继续跑

两者都和“任务推进”有关，但抽象层完全不同。

## 5. 并排对比

| 维度 | Claude Code | OpenCode | Codex |
|---|---|---|---|
| 会话 todo | 强 | 强且持久化明确 | 不是核心 |
| 结构化 task | 有 | 有 | 有，但主视角不同 |
| 自动续跑 | 有，`/goal` 很明确 | 可做，但不是同类公开抽象 | 有，goal continuation 明确 |
| 线程级 goal 对象 | 公开证据不足 | 当前不应这样写 | 明确存在 |
| 状态机公开度 | 中 | 低到中 | 高 |
| 预算/计量与 goal 绑定 | 公开可见度有限 | 不是主叙事 | 明确存在 |
| 最稳妥的定位 | 会话任务管理器 + 自动续跑控制面 | 持久化会话 todo + 运行时控制 | 持久化线程目标运行时 |

## 6. 这次订正后，应该怎样写它们

推荐用下面这组说法。

### Claude Code

`Claude Code` 的任务管理主轴是会话内 `todo/task` 跟踪；`/goal` 则是在此之上的自动续跑控制面，用完成条件驱动跨回合继续执行。它已经明显超出普通斜杠命令的范围，但公开证据仍不足以把它等同于完整线程级目标状态机。

### OpenCode

`OpenCode` 的强项是持久化会话 todo、`task/subagent` 执行控制，以及 `permission/runtime/control-plane` 的组合。它适合被描述成“会话任务层 + 运行时控制层”，不适合直接描述成 `Codex` 式目标运行时。

### Codex

`Codex` 把目标建模成线程级持久化对象，并通过受限的工具契约、状态枚举、预算与计量逻辑来管理其生命周期。它是三者里最接近“显式目标状态机”的实现。

## 7. 外部资料与检索日期

涉及 `Claude Code /goal` 的“最新公开情况”，本页基于 **2026-07-08** 的联网检索结果做了订正。对应链接见 [源码与证据索引](./source-evidence-and-code-index.md)。
