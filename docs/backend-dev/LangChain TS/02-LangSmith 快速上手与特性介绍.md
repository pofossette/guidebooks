# 02. LangSmith 快速上手与特性介绍

如果你已经能跑通 `LangChain createAgent`，下一步最应该补的不是“更多 prompt 技巧”，而是 **可观测性**。

LangSmith 在 LangChain 官方产品体系里的定位很明确：它是负责 **tracing、evaluation、prompts、deployment** 的平台层。对后端项目来说，最先落地的一般是 tracing。

## 它解决什么问题

LangSmith 官方 observability 文档把它定义为：

- 查看单次 trace
- 观察生产环境整体性能
- 过滤、导出、分享、比较 traces
- 建 dashboard 和 alert
- 配置 automations、webhook、online eval

你可以把它理解成：

> “我这个 Agent 到底做了什么，为什么慢，为什么错，哪一步出问题了”的统一排查面板。

## 对 LangChain 项目为什么特别顺手

官方 tracing 文档强调，LangSmith 和 LangChain 是无缝集成的。对 LangChain 应用来说，最小接入通常只要配环境变量，很多场景不需要额外埋点代码。

这意味着你可以先把下面这条链路跑通：

- `LangChain agent`
- `tool call`
- `model call`
- `trace UI`

然后再决定是否补：

- tags / metadata
- project 隔离
- evaluation
- prompt 管理

## 最小快速开始

官方 tracing quickstart 当前的最小环境配置是：

```bash
export LANGSMITH_TRACING=true
export LANGSMITH_API_KEY=<your-api-key>
export OPENAI_API_KEY=<your-openai-api-key>
export LANGSMITH_WORKSPACE_ID=<your-workspace-id>
```

如果你的账号不在默认的 US 区域，官方还要求配置对应 endpoint。例如 EU 区域：

```bash
export LANGSMITH_ENDPOINT="https://eu.api.smith.langchain.com"
```

对于非 serverless 的 LangChain.js 项目，官方还建议显式设置：

```bash
export LANGCHAIN_CALLBACKS_BACKGROUND=true
```

如果你在 serverless 环境里，反而建议设成 `false`，避免函数过早结束导致 trace 没来得及上报。

## 接入后的心智模型

LangSmith tracing 文档里有一句很重要：

> 对 LangChain 代码来说，很多情况下“像平时一样运行代码”就会自动记录 trace。

所以对你来说，第一步并不是学复杂 SDK，而是：

1. 配置环境变量
2. 正常运行已有 LangChain 代码
3. 去 LangSmith UI 看 trace 是否出现

如果 trace 出来了，说明你的最小可观测性链路已经成立。

## 生产里最有用的 4 个能力

### 1. Project 隔离

官方用 `Project` 来组织 traces。你可以用：

```bash
export LANGSMITH_PROJECT=my-project
```

把不同服务、环境或实验分开。

常见拆法：

- `agent-dev`
- `agent-staging`
- `agent-prod`
- `rag-eval`

### 2. Tags 和 Metadata

官方 tracing 文档明确支持在 `RunnableConfig` 里挂：

- `tags`
- `metadata`

这样你能给 trace 补上业务上下文，例如：

- `tenantId`
- `userId`
- `agentId`
- `releaseVersion`
- `experimentName`

这一步非常值钱，因为后面你排查线上问题时，几乎一定会按这些维度过滤。

### 3. Run Name 和 Run ID

官方支持自定义：

- `run_name`
- `run_id`

这让你可以把 LangSmith trace 和自己的：

- 请求日志
- 业务 run 表
- 队列 job id

串起来，而不是让两套系统各说各话。

### 4. 评测和自动化

根据 LangSmith observability 总览，平台后面还能继续接：

- dashboards
- alerts
- automations
- online evaluations
- feedback collection

也就是说它不只是“看 trace”，还能往“持续监控 Agent 质量”扩。

## 一个适合后端项目的接入顺序

建议按这个顺序：

### 第一步：先开 tracing

目标是先看到一次完整 trace。

### 第二步：补业务 metadata

至少把：

- `userId`
- `agentId`
- `requestId`
- `env`

挂进去。

### 第三步：拆 project

把 dev、staging、prod 分开，不然后面 trace 很快会混。

### 第四步：再上 eval

不要一开始就搭评测体系。没有稳定 trace，评测也很难站住。

## 它和 Langfuse 的区别怎么理解

一个实用判断是：

- 如果你已经深度使用 LangChain / LangGraph，想获得最顺滑的官方 tracing 与平台能力，优先看 `LangSmith`
- 如果你更看重开源、自托管、OpenTelemetry 兼容和多框架统一观测，`Langfuse` 很值得一起比较

两者都不是“只能二选一”的关系，但大多数团队最好先选一个主平台，不要早期同时铺两套。

## 什么时候该优先上 LangSmith

- 你已经在用 LangChain 或 LangGraph
- 你想最快看到 agent trace
- 你后面还想接 evaluation、prompt、deployment
- 你希望少写自定义 tracing glue code

## 这篇结束后你应该能回答

- 为什么 LangSmith 在 LangChain 生态里最先该接的是 tracing？
- `LANGSMITH_PROJECT`、`tags`、`metadata` 各自解决什么问题？
- 为什么 serverless 和常驻服务在 tracing 上报策略上不一样？

参考资料：

- LangSmith Observability: https://docs.langchain.com/langsmith/observability
- Trace LangChain applications: https://docs.langchain.com/langsmith/trace-with-langchain
