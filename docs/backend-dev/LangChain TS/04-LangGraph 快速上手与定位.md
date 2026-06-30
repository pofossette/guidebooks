# 04. LangGraph 快速上手与定位

如果说 `LangChain createAgent` 解决的是“先把 agent 跑起来”，那 `LangGraph` 解决的是：

> 当 agent 需要长流程、状态、恢复、人工介入和更强控制时，怎么把它做成一个可靠运行时。

LangChain 官方对 LangGraph 的定位非常明确：它是一个 **低层 orchestration framework and runtime**，重点不是 prompt 抽象，而是长时、可恢复、可持久化的 agent 编排。

## 它和 LangChain 的关系

LangGraph overview 里官方给了一个非常清楚的产品分工：

- `Deep Agents`：agent harness
- `LangChain`：agent framework
- `LangGraph`：orchestration runtime
- `LangSmith`：tracing、evaluation、prompts、deployment 平台

这意味着：

- 想快速做一个常见工具调用 Agent：先用 `LangChain`
- 想控制图结构、状态推进、持久化恢复：再看 `LangGraph`

## 它最值得关注的能力

官方 overview 把核心收益总结为：

- `Persistence`
- `Human-in-the-loop`
- `Comprehensive memory`
- `Streaming`
- `Production-ready deployment`

把这些翻成工程语言，就是：

- 任务跑一半挂了，能不能继续
- 某个关键节点能不能人工审批
- 状态是不是只在内存里
- 前端能不能持续看到中间过程
- 生产里能不能部署长时 workflow

## 最小安装

官方当前给出的 TypeScript 安装命令是：

```bash
npm install @langchain/langgraph @langchain/core
```

## 最小 hello world

官方 overview 直接给了一个极简 graph：

```ts
import {
  StateSchema,
  MessagesValue,
  type GraphNode,
  StateGraph,
  START,
  END,
} from "@langchain/langgraph";

const State = new StateSchema({
  messages: MessagesValue,
});

const mockLlm: GraphNode<typeof State> = (state) => {
  return { messages: [{ role: "ai", content: "hello world" }] };
};

const graph = new StateGraph(State)
  .addNode("mock_llm", mockLlm)
  .addEdge(START, "mock_llm")
  .addEdge("mock_llm", END)
  .compile();

await graph.invoke({
  messages: [{ role: "user", content: "hi!" }],
});
```

这段代码的重点不是 `hello world`，而是让你先建立 LangGraph 的 3 个核心概念：

- `State`
- `Node`
- `Edge`

## 先这样理解它

### 1. `State`

所有节点共享和推进的状态容器。

### 2. `Node`

一次可执行步骤。可以是：

- 调模型
- 调工具
- 查数据库
- 写 checkpoint

### 3. `Edge`

定义步骤之间的流向。

所以 LangGraph 的本质不是“另一个 prompt 库”，而是：

> 把 Agent 运行过程显式建模成状态图。

## 什么时候该从 LangChain 升到 LangGraph

这些信号一出现，就说明你已经开始接近 LangGraph 的适用区间：

- 一个 agent 不再是简单单轮 tool calling
- 需要跨多个阶段推进状态
- 需要失败恢复和断点继续
- 需要人工审批或中断后再恢复
- 需要把不同子流程拆成可复用图节点

## 一个典型场景

比如一个知识库 Agent 后端可能不是单条链路，而是：

```text
接收问题 -> 检索 -> 重排 -> 决定是否继续检索 -> 生成回答 -> 人工审批 -> 写结果 -> 返回
```

这时如果全塞在一个 `agent.invoke()` 里，后面：

- 排查很难
- 恢复很难
- 插人工节点很难

LangGraph 的价值就开始变大。

## 它和 LangSmith 常常一起出现

官方 overview 里直接建议配合 `LangSmith` 做 tracing。因为图式编排一旦复杂，没有 trace 很难理解状态迁移和失败点。

所以一个实用搭配是：

- `LangChain`：快速原型
- `LangGraph`：编排升级
- `LangSmith`：调试和评测

## 什么时候不要急着上 LangGraph

- 你还没跑通最小 agent
- 你只有单轮模型调用
- 你还没分清 tool、prompt、state 的边界

对多数团队来说，先用 LangChain 把 MVP 做出来，再把复杂流程迁到 LangGraph，会更稳。

## 这篇结束后你应该能回答

- LangGraph 和 LangChain 的职责边界是什么？
- 为什么说 LangGraph 解决的是编排和运行时问题，而不只是模型调用问题？
- 哪些场景说明你该从 `createAgent` 升级到图式工作流？

参考资料：

- LangGraph Overview: https://docs.langchain.com/oss/javascript/langgraph/overview
