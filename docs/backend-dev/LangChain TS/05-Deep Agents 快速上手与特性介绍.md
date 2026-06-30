# 05. Deep Agents 快速上手与特性介绍

`Deep Agents` 是 LangChain 官方现在非常强调的一层。它不是在和 `LangChain`、`LangGraph` 竞争，而是站在它们之上，提供一个更“开箱可干活”的 agent harness。

官方 overview 的原话可以概括成：

> 用内建的任务规划、子代理、文件系统、长程记忆和上下文管理，去做复杂多步任务。

## 它的定位

官方把 Deep Agents 定位成最容易开始构建复杂 Agent 的方式，内建能力包括：

- task planning
- file systems for context management
- subagent spawning
- long-term memory
- human-in-the-loop
- streaming

这意味着它更像：

> 一个“带完整执行环境”的高级 Agent 外壳

而不是只有 `model + tools` 的轻量循环。

## 最小快速开始

官方 overview 当前给出的 TypeScript 最小示例是：

```ts
import * as z from "zod";
import { createDeepAgent } from "deepagents";
import { tool } from "langchain";

const getWeather = tool(
  ({ city }) => `It's always sunny in ${city}!`,
  {
    name: "get_weather",
    description: "Get the weather for a given city",
    schema: z.object({
      city: z.string(),
    }),
  }
);

const agent = createDeepAgent({
  tools: [getWeather],
  systemPrompt: "You are a helpful assistant",
});

console.log(
  await agent.invoke({
    messages: [{ role: "user", content: "What's the weather in Tokyo?" }],
  })
);
```

最小安装命令也很直接：

```bash
npm install deepagents langchain @langchain/core
```

## 它和普通 LangChain Agent 最大的区别

如果你只看最小代码，可能会觉得和 `createAgent` 差不多。但官方 overview 明确列出了它额外自带的几层能力。

### 1. Execution Environment

不仅有工具，还有：

- 虚拟文件系统
- 文件权限
- shell / sandbox 执行
- interpreter

这让 agent 不只是“会调函数”，而是能在受控环境里完成多步任务。

### 2. Context Management

官方把这块拆成：

- skills
- memory
- summarization / context offloading
- prompt caching

也就是说，它不是只把所有上下文都硬塞进 prompt，而是更关注“长任务里怎么管理上下文增长”。

### 3. Delegation

Deep Agents 原生支持：

- task planning
- subagents

所以当任务很复杂时，它可以把子任务拆出去，而不是全压在同一个上下文窗口里。

### 4. Steering

官方强调：

- human-in-the-loop
- interrupts

这对高风险任务很重要，比如：

- 写代码
- 改配置
- 调用有副作用的外部系统

## 它适合什么场景

Deep Agents 更适合这类任务：

- 长步骤、多轮、多工具
- 需要读写文件
- 需要子代理并行或分工
- 上下文可能很快膨胀
- 需要人工审批

如果你做的是：

- coding agent
- 数据分析 agent
- 文档处理与生成 agent
- 复杂业务操作 agent

它往往比最小 `createAgent` 更接近真实需求。

## 它和 LangGraph 的关系

官方 overview 说得很清楚：`deepagents` 是建立在 LangChain 核心构件之上，并使用 LangGraph 的 tooling 来支持生产运行。

你可以把关系理解成：

- `LangChain`：基础组件
- `LangGraph`：运行时和编排
- `Deep Agents`：带默认能力的高级 harness

## 一个很实用的选择原则

- 只需要简单 tool-calling：先 `LangChain createAgent`
- 需要复杂状态图但想自己掌控编排：`LangGraph`
- 需要一套较完整的复杂任务执行能力：`Deep Agents`

## 它为什么对工程团队有吸引力

很多团队的问题不是“不会调用模型”，而是：

- 长任务怎么拆
- 文件怎么给 agent 用
- 权限怎么限制
- 失败怎么恢复
- 人工审批插在哪里

Deep Agents 正是在这些地方提供默认能力，所以它更像是“Agent 工程框架”，而不只是一个模型调用封装。

## 这篇结束后你应该能回答

- Deep Agents 为什么不只是 `createAgent` 的另一个名字？
- 它内建的 execution environment 和 context management 分别解决什么问题？
- 什么时候应该选 Deep Agents，而不是普通 LangChain agent？

参考资料：

- Deep Agents Overview: https://docs.langchain.com/oss/javascript/deepagents/overview
- Deep Agents Quickstart: https://docs.langchain.com/oss/javascript/deepagents/quickstart
