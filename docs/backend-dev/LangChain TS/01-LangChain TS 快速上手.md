# 01. LangChain TS 快速上手

如果你已经会 TypeScript，LangChain TS 最值得先记住的一句话是：

> Agent = 模型 + 工具 + prompt + 一层可配置的运行时外壳

LangChain 官方现在把这层“外壳”收敛到了 `createAgent`。这意味着你一开始不需要先理解一整套复杂抽象，先能把 **模型调用 + 工具调用 + 消息输入输出** 跑通，再逐步叠加记忆、流式输出、中间件和可观测性即可。

## 它现在在官方文档里的定位

根据 LangChain 官方 JS/TS 文档，LangChain 提供的是一个 **标准模型接口** 和一个 **高度可配置的 agent harness**。你可以用统一接口切换不同模型供应商，也可以从最小的 `createAgent` 开始，只按需要加工具、guardrails、路由和中间件。

这对后端开发很重要，因为 Agent 服务很少只有一次纯文本补全，更多是：

- 接收用户消息
- 选择模型
- 调工具
- 写日志和 trace
- 视情况做流式输出

LangChain 比“直接 SDK 调模型”的价值，主要就在这些外围能力的组织方式。

## 环境要求

LangChain 官方 quickstart 当前要求：

- `Node.js 22+`
- 一个可用的模型提供商 API Key

最小安装命令：

```bash
npm install deepagents langchain @langchain/core
```

如果你只想先体验最小 `createAgent` 示例，通常还会额外安装：

```bash
npm install zod @langchain/openai
```

其中：

- `langchain`：核心入口，包含 `createAgent`、`initChatModel`
- `@langchain/core`：更底层的工具与抽象
- `zod`：给工具参数定义 schema
- `@langchain/openai`：接 OpenAI 类模型时常用

## 第一个最小 Agent

官方 quickstart 的最小示例就是“一个天气工具 + 一个 agent”。它的重点不是天气，而是让你理解 tool calling 的结构。

```ts
import { createAgent, tool } from "langchain";
import * as z from "zod";

const getWeather = tool(
  (input) => `It's always sunny in ${input.city}!`,
  {
    name: "get_weather",
    description: "Get the weather for a given city",
    schema: z.object({
      city: z.string().describe("The city to get the weather for"),
    }),
  }
);

const agent = createAgent({
  model: "gpt-5.5",
  tools: [getWeather],
});

const result = await agent.invoke({
  messages: [
    { role: "user", content: "What's the weather in San Francisco?" },
  ],
});

console.log(result);
```

先看这段代码里最关键的 3 个概念：

### 1. `tool(...)`

工具本质上是一个函数，但不能只是普通函数。它还需要：

- `name`
- `description`
- `schema`

`schema` 很关键，因为模型不是 TypeScript 编译器。它要靠 schema 才知道工具能接收哪些参数，以及参数应该是什么格式。

### 2. `createAgent(...)`

这是官方当前推荐的最小入口。先给它：

- `model`
- `tools`

后面再逐步加：

- `systemPrompt`
- `checkpointer`
- middleware

### 3. `agent.invoke(...)`

输入不是一个裸字符串，而是一组 `messages`。这和 Chat Completions 风格一致，也更接近真实 Agent 后端的接口设计。

## 更实用的模型初始化方式

如果你不想把模型字符串直接写死在 `createAgent` 里，官方 quickstart 也给了更工程化的做法：

```ts
import { initChatModel } from "langchain";

const model = await initChatModel("gpt-5.5", {
  temperature: 0.5,
  timeout: 300,
  maxTokens: 25000,
});
```

这个方式适合后端服务，因为你通常还会统一注入：

- provider
- timeout
- token 上限
- streaming 开关

再把这个 `model` 传给 `createAgent`。

## 工具为什么建议一开始就用 Zod

官方文档同时给了 `zod schema` 和 `JSON schema` 两种写法，但对 TS 项目来说，优先用 `zod` 更顺手：

- 和 TypeScript 开发体验更接近
- 结构更清晰
- 更适合后续做输入校验复用

一个最小工具定义模板可以直接背下来：

```ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const fetchTextFromUrl = tool(
  async ({ url }: { url: string }) => {
    const resp = await fetch(url);
    if (!resp.ok) {
      return `Fetch failed: HTTP ${resp.status}`;
    }
    return await resp.text();
  },
  {
    name: "fetch_text_from_url",
    description: "Fetch the document from a URL.",
    schema: z.object({
      url: z.string().url(),
    }),
  }
);
```

## 从“能跑”到“能做事”的最短路径

官方 quickstart 后半段开始加入：

- `systemPrompt`
- 自定义工具
- `initChatModel`
- `MemorySaver`
- `createDeepAgent`

你不用一口气全学，按这个顺序就够了：

### 第一步：跑通最小 `createAgent`

目标：确认模型、API Key、基本依赖都没问题。

### 第二步：接一个真实工具

比如：

- 查数据库
- 发 HTTP 请求
- 查询内部配置

重点不是工具多，而是要把工具输入输出定义稳定。

### 第三步：补上超时和错误边界

官方示例里的取文档工具已经演示了 `AbortController` 超时控制。后端服务里这是必须项，因为工具调用本质就是外部依赖调用。

### 第四步：再考虑记忆

官方 quickstart 用的是：

```ts
import { MemorySaver } from "@langchain/langgraph";

const checkpointer = new MemorySaver();
```

这适合本地实验。生产环境不要把它当长期存储，正式项目应该把消息历史和 run 状态落到数据库或持久化 checkpointer。

## LangChain、Deep Agents、LangGraph 怎么选

官方 overview 现在给出的判断标准可以简化成：

- 想最快做出一个“能力比较全”的 Agent：先看 `Deep Agents`
- 想对工具、prompt、middleware 有更细控制：先用 `LangChain createAgent`
- 想把确定性流程和 agentic 流程混编得更深：再看 `LangGraph`

对大多数 TS 后端同学来说，起步建议是：

1. 先用 `LangChain createAgent`
2. 能跑通工具和 trace
3. 再决定是否需要更强编排

## 一个适合后端项目的最小目录思路

如果你准备把 LangChain 接进正式服务，建议一开始不要把所有逻辑塞进一个文件。

```text
src/
  agents/
    support-agent.ts
  tools/
    get-weather.ts
    fetch-text-from-url.ts
  llm/
    model.ts
  routes/
    chat.ts
```

职责可以这样拆：

- `llm/model.ts`：统一初始化模型
- `tools/`：一个文件一个工具
- `agents/`：装配 agent
- `routes/`：HTTP 或 SSE 接口

## 你最容易踩的坑

### 1. 把工具当成普通函数，不写 schema

这样模型很难稳定地产生正确参数。

### 2. 把 Agent 状态全放内存

本地 demo 没问题，多实例部署就会出问题。

### 3. 没有超时、重试和日志

工具调用失败时，你会不知道是模型没调用、工具参数错了，还是外部服务超时了。

### 4. 一上来就追求复杂编排

先把：

- 一次请求
- 一次工具调用
- 一次结果返回

这条链路跑顺，收益最高。

## 最小实践清单

你可以按这个顺序动手：

1. 配好 `OPENAI_API_KEY` 或其他 provider key。
2. 在 Node.js 22+ 环境里安装 `langchain`、`@langchain/core`、`zod`。
3. 跑通一个 `createAgent + tool + invoke` 示例。
4. 把天气工具替换成你项目里的真实工具。
5. 给工具加超时和错误返回。
6. 接入 LangSmith tracing，再开始做多工具场景。

## 这篇结束后你应该能回答

- LangChain TS 当前最小推荐入口为什么是 `createAgent`？
- tool 的 `schema` 为什么不是可有可无？
- 本地 demo 的 `MemorySaver` 为什么不能直接等同于生产记忆系统？
