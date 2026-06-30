# 03. Langfuse 快速上手与特性介绍

`Langfuse` 不是 LangChain 官方自家产品，但它是目前和 LangChain、OpenAI SDK、Vercel AI SDK 等生态结合非常紧的一类平台，特别适合想要：

- 开源
- 自托管
- OpenTelemetry 兼容
- tracing、prompt、eval 一体化

的团队。

## 它的定位

Langfuse 官方 overview 把自己定义为一个开源 AI engineering platform，核心能力分成四块：

- `Observability`
- `Prompt Management`
- `Evaluation`
- `Platform`

对后端项目来说，可以把它先理解成：

> 一套围绕 LLM 应用开发全流程的工程平台，而不只是 trace 面板。

## 它和 LangChain 的关系

Langfuse 官方明确写了它支持 LangChain，并且提供：

- 原生 JS / Python SDK
- 100+ integrations
- OpenTelemetry 接入
- agent graph 可视化
- sessions / users / cost / latency 观测

所以如果你项目里不只用 LangChain，还混着：

- 原生 OpenAI SDK
- Vercel AI SDK
- 自己的业务 API

Langfuse 往往更容易做统一观测。

## 最小 tracing 快速开始

Langfuse 官方 JS/TS tracing quickstart 当前最短路径是基于 OpenAI SDK wrapper 和 OpenTelemetry。

先安装：

```bash
npm install @langfuse/openai
npm install @opentelemetry/sdk-node
```

再配置环境变量：

```bash
LANGFUSE_SECRET_KEY="sk-lf-..."
LANGFUSE_PUBLIC_KEY="pk-lf-..."
LANGFUSE_BASE_URL="https://cloud.langfuse.com"
```

官方还列出了其他区域：

- US: `https://us.cloud.langfuse.com`
- Japan: `https://jp.cloud.langfuse.com`
- HIPAA: `https://hipaa.cloud.langfuse.com`

然后初始化 OpenTelemetry：

```ts
import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";

const sdk = new NodeSDK({
  spanProcessors: [new LangfuseSpanProcessor()],
});

sdk.start();
```

接着包装 OpenAI client：

```ts
import OpenAI from "openai";
import { observeOpenAI } from "@langfuse/openai";

const openai = observeOpenAI(new OpenAI());
```

官方特别提醒的一点是：

> tracing 初始化要早于被追踪逻辑的 import 和执行。

这对 Node 服务尤其重要，否则你会遇到“明明接了 tracing，但有些调用没记录到”的问题。

## 如果你用 LangChain

Langfuse 文档也明确给了 LangChain 集成路线。它的思路不是“完全重做一套 LangChain runtime”，而是通过 callback handler 监听 LangChain 的 callback 系统，把：

- chain
- llm
- tool
- session

这些事件记录下来。

这意味着：

- 如果你主要跑 LangChain agent，可以直接从 LangChain integration 进
- 如果你同时还有非 LangChain 调用，用 OTEL 统一起来会更完整

## 它最有区分度的 3 个能力

### 1. Prompt Management

Langfuse 不只是存 prompt 文本，而是把 prompt 当成一个可版本化的资源。

官方 prompt management 文档强调了这些能力：

- 创建 prompt
- 版本控制
- labels 部署到生产
- playground 测试
- 和 traces 关联
- 比较不同版本的成本、延迟、评测指标

JS/TS 最小安装：

```bash
npm i @langfuse/client
```

拉取生产标签版本的 prompt：

```ts
import { LangfuseClient } from "@langfuse/client";

const langfuse = new LangfuseClient();
const prompt = await langfuse.prompt.get("movie-critic", {
  type: "text",
});

const compiledPrompt = prompt.compile({
  criticlevel: "expert",
  movie: "Dune 2",
});
```

这个模型很适合团队协作，因为 prompt 不再只是散落在代码里的字符串。

### 2. Evaluation

Langfuse 官方 evaluation 文档把评测拆成线上和线下两部分：

- 对生产 trace 打分
- 把案例沉淀成 dataset
- 跑 experiments 比较 prompt / model / code 变化
- 用人工标注或自动 judge 评估结果

它还明确支持：

- `LLM-as-a-judge`
- `Code Evaluators`
- `Annotation Queues`
- `Datasets`
- `Experiments`

对 Agent 项目来说，这比“肉眼看几个输出”强很多。

### 3. OpenTelemetry 兼容

Langfuse 官方反复强调它基于 OpenTelemetry。

这带来的工程好处是：

- 更容易和现有 tracing 体系整合
- 不容易被单一框架锁死
- 你可以把 LLM 调用和普通后端 span 放在同一条链路里看

## Langfuse 什么时候特别合适

- 你需要自托管
- 你不希望观测层太绑定单一 Agent 框架
- 你除了 LangChain 还在用原生 SDK、Vercel AI SDK 或其他框架
- 你希望 prompt 管理和 tracing 一起落地

## 一个务实的落地顺序

建议按这个顺序：

1. 先接 tracing
2. 把 `userId`、`sessionId`、`agentId` 这些业务维度带上
3. 再把核心 prompt 迁到 Langfuse Prompt Management
4. 最后建设 datasets 和 experiments

不要反过来。没有稳定 trace 的情况下，prompt 管理和 eval 很容易流于形式。

## 和 LangSmith 怎么选

一个简单判断：

- 更偏 LangChain 官方全家桶，优先看 `LangSmith`
- 更偏开源、自托管、OTEL、多框架统一，优先看 `Langfuse`

如果你团队本身已经有 OpenTelemetry 文化，Langfuse 往往会更容易融入现有体系。

## 这篇结束后你应该能回答

- Langfuse 为什么不只是 tracing 工具？
- Prompt Management 为什么对多人协作比“把 prompt 写死在代码里”更合适？
- 基于 OTEL 的 tracing 为什么更利于和普通后端链路打通？

参考资料：

- Langfuse Overview: https://langfuse.com/docs
- Langfuse Tracing Get Started: https://langfuse.com/docs/observability/get-started
- Langfuse Prompt Management Get Started: https://langfuse.com/docs/prompt-management/get-started
- Langfuse Evaluation Overview: https://langfuse.com/docs/evaluation/overview
