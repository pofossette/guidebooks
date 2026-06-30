# 07. Retrieval Guardrails 与生产能力速览

当你把 `LangChain`、`LangSmith`、`Langfuse`、`LangGraph` 这些基础能力看过一遍之后，真正会决定 Agent 能不能进生产的，通常还有两块：

- `Retrieval`
- `Guardrails`

它们在 LangChain 官方 TS 文档里也已经是主线能力，不是附属话题。

## Retrieval 解决什么问题

LangChain 官方 retrieval 文档先点明了 LLM 的两个基础限制：

- context 是有限的
- 模型知识是静态的

Retrieval 的作用就是在查询时取回外部知识，把它作为上下文补给模型，也就是大家熟悉的 `RAG`。

## 先别把 Retrieval 只理解成“上向量库”

官方 retrieval 文档给了一个很实用的判断：

如果你已经有现成知识源，比如：

- SQL 数据库
- CRM
- 内部文档系统

你不一定非要重建一套知识库。可以直接：

- 把它接成 tool，走 Agentic RAG
- 查询后把结果作为上下文塞给模型，走 2-Step RAG

这对很多后端项目很重要，因为“重新建知识库”往往是成本最高的部分。

## Guardrails 解决什么问题

LangChain 官方 guardrails 文档把它定义为在 Agent 执行关键节点做验证和过滤，用来：

- 防止 PII 泄露
- 检测 prompt injection
- 拦截有害内容
- 执行业务规则和合规要求
- 检查输出质量

你可以把它理解成：

> 在 agent 开跑前、运行中、返回后，加一层安全和质量闸门。

## LangChain 官方对 Guardrails 的方法论

官方把 guardrails 分成两类：

### 1. Deterministic Guardrails

例如：

- regex
- 关键词规则
- 显式业务判断

优点是快、便宜、可预测。

### 2. Model-based Guardrails

用模型或分类器判定语义层面的风险。

优点是能抓住更复杂的问题，但更慢、更贵。

这个分类很实用，因为它直接决定你的成本和延迟策略。

## 在生产里怎么配合使用

一个比较稳的组合通常是：

1. 入口先做 deterministic 检查
2. 高风险场景再做 model-based 审查
3. 关键操作前再插 human-in-the-loop

这样能避免“所有请求都走最重的安全判断”，把延迟和成本打爆。

## 这几块能力怎么串起来

你可以把 LangChain 生态按生产链路理解成：

```text
LangChain / Deep Agents
  -> 组织 Agent 主执行逻辑

MCP / Tools / Retrieval
  -> 提供外部能力和知识

Guardrails / Human-in-the-loop
  -> 做安全与质量控制

LangSmith 或 Langfuse
  -> 做 tracing、评测、监控

LangGraph
  -> 承接更复杂的状态编排与恢复
```

## 一个很务实的建设顺序

如果你正在从 0 到 1 搭 Agent 后端，可以按这个顺序补能力：

1. 先跑通最小 `LangChain createAgent`
2. 接一个真实 tool 或 retrieval source
3. 接 tracing
4. 再补 deterministic guardrails
5. 复杂流程再迁到 LangGraph / Deep Agents
6. 最后建设 eval 和上线前实验

这通常比“一开始就把全家桶全接上”更稳。

## 这篇结束后你应该能回答

- Retrieval 为什么本质上是在解决模型的上下文和知识时效问题？
- 为什么 Guardrails 不能只靠 prompt 约束？
- LangChain 生态里，哪些组件更偏“执行”，哪些更偏“治理”和“生产化”？

参考资料：

- LangChain Retrieval: https://docs.langchain.com/oss/javascript/langchain/retrieval
- LangChain Guardrails: https://docs.langchain.com/oss/javascript/langchain/guardrails
