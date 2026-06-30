# 06. MCP 与 LangChain 工具生态

`MCP` 这两年几乎已经变成 Agent 工具接入的事实标准之一。LangChain 官方也已经把它纳入 TypeScript 文档主线。

如果你只记一句话，可以记这个：

> MCP 让“工具接入”从私有 SDK 适配，变成标准协议适配。

## MCP 在 LangChain 官方文档里的定位

官方把 MCP 定义为一个开放协议，用来标准化“应用怎样给 LLM 提供工具和上下文”。LangChain Agent 则通过 `@langchain/mcp-adapters`，把 MCP server 暴露的 tools 接进自己的 agent。

这意味着你不必每次都手写一层：

- API wrapper
- tool schema
- provider-specific glue code

而是可以优先把能力做成 MCP server。

## 最小快速开始

官方当前给出的安装命令是：

```bash
npm install @langchain/mcp-adapters
```

最小多服务器示例：

```ts
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { createAgent } from "langchain";

const client = new MultiServerMCPClient({
  math: {
    transport: "stdio",
    command: "node",
    args: ["/path/to/math_server.js"],
  },
  weather: {
    transport: "http",
    url: "http://localhost:8000/mcp",
  },
});

const tools = await client.getTools();

const agent = createAgent({
  model: "claude-sonnet-4-6",
  tools,
});
```

这段代码的重点是：

- `MultiServerMCPClient`
- `client.getTools()`
- `tools` 直接交给 `createAgent`

所以对 LangChain 来说，MCP server 最终就是一个标准化工具来源。

## 它的工程价值

### 1. 工具来源统一

无论工具背后是：

- 数据库
- 内部 HTTP API
- 文件系统
- 第三方服务

都可以先抽成 MCP server，再给 agent 使用。

### 2. 多服务组合自然

官方直接支持 `MultiServerMCPClient`。这很适合把不同领域工具拆开：

- `crm`
- `billing`
- `search`
- `analytics`

### 3. 更利于权限与边界治理

因为工具边界被协议化了，你可以更清楚地区分：

- 哪些能力暴露给 agent
- 哪些能力只留在内部服务层

## 两种常见 transport

官方文档重点展示了：

- `stdio`
- `http` / `sse`

你可以先这样选：

- 本地工具、本机子进程：`stdio`
- 远程服务、独立部署能力：`http` 或 `sse`

## 自己写一个 MCP server 是什么感觉

官方示例里用 `@modelcontextprotocol/sdk` 定义了：

- `ListToolsRequestSchema`
- `CallToolRequestSchema`

然后把 `add`、`multiply`、`get_weather` 这类能力注册成工具。

这说明 MCP server 的心智其实很朴素：

1. 列出自己有哪些工具
2. 定义输入 schema
3. 接到调用时执行并返回结果

## 一个非常实用的团队建议

如果你团队里已经有很多内部服务，优先不要直接把每个服务都糊成 LangChain tool。更稳的方式通常是：

1. 先把关键能力抽成 MCP server
2. 再用 LangChain 或 Deep Agents 去消费这些工具

这样后续无论你换 Agent 框架还是接入别的客户端，复用都更高。

## 你要注意的点

官方文档提到，TypeScript 的 MCP adapter 在工具调用失败时会抛出 `ToolException`，而不是像某些 Python 适配器那样自动把失败结果返回给模型继续处理。

这意味着你在 TS 项目里最好主动做：

- `try / catch`
- 失败日志
- 超时控制
- 降级策略

## 这篇结束后你应该能回答

- MCP 为什么会显著降低工具接入的耦合度？
- `client.getTools()` 在 LangChain 里扮演什么角色？
- 为什么复杂团队里优先把能力做成 MCP server，通常比直接写死在 Agent 里更稳？

参考资料：

- LangChain MCP: https://docs.langchain.com/oss/javascript/langchain/mcp
- Model Context Protocol: https://modelcontextprotocol.io/
