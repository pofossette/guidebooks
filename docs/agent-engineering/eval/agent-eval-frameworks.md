下面是截至 **2026-05-30** 的联网调研结论：今天常见的 **agent eval 框架** 已经明显分成两类。

- **平台型**：LangSmith、MLflow、OpenAI Evals、Phoenix、Braintrust、Langfuse。它们更强调 `traces + datasets + evaluators + experiments + online monitoring`。
- **库 / harness 型**：Ragas、DeepEval、Inspect。它们更强调 `metrics + CI + sandbox + benchmark runner`。

如果只问一句话的结论：**生产环境里的 agent eval，主流已经从“只比最终答案”转成“按 trace、tool call、trajectory、线上流量分层评测”**。而不同框架的真正差异，不在“能不能做 eval”，而在 **是否把 trace、dataset、online eval、CI、benchmark sandbox** 一起做成闭环。([LangSmith][1], [MLflow][2], [OpenAI][3])

## 1. 先看整体：agent eval 框架到底在支持什么

```text
测试集 / 线上回放 / 合成数据
  ↓
运行 agent
  ↓
记录 trace
  ├─ 最终回答
  ├─ tool calls
  ├─ 中间步骤 / trajectory
  ├─ latency / token / cost
  └─ 错误 / 重试 / 用户反馈
  ↓
打分
  ├─ 规则检查
  ├─ LLM-as-a-judge
  ├─ tool / trajectory 专项打分
  └─ 人工标注
  ↓
实验对比 / 回归测试 / CI
  ↓
线上自动评测 / 告警 / 数据回流
```

所以判断一个框架是否“支持 agent eval”，至少看 7 件事：

1. 是否有 **dataset / experiment** 的基本抽象。
2. 是否能评 **trace / trajectory**，而不只是最终输出。
3. 是否能评 **tool call**。
4. 是否支持 **代码规则 + LLM judge** 两类 evaluator。
5. 是否支持 **离线回归**。
6. 是否支持 **线上自动评测**。
7. 是否能把结果接回 **实验比较、错误分析、CI/CD**。

## 2. 常见框架支持情况总表

| 框架 | 形态 | 离线评测 | 在线评测 | trace / trajectory | tool call / agent 专项 | 数据集 / 实验对比 | 生产观测 | 更适合什么 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **LangSmith** | 平台 | 强 | 强 | 强 | 强 | 强 | 强 | LangChain / LangGraph 及任意有 trace 的 agent |
| **MLflow GenAI** | 平台 | 强 | 强 | 强 | 中到强 | 强 | 强 | 已有 MLflow / experiment tracking 体系的团队 |
| **OpenAI Evals** | 平台/API | 强 | 中到强 | 强 | 强 | 强 | 强 | OpenAI agent workflow、dataset、grader 闭环 |
| **Phoenix** | 平台 | 强 | 中 | 强 | 中到强 | 强 | 中到强 | 先做 tracing / debugging，再做 eval |
| **Braintrust** | 平台 | 强 | 强 | 中到强 | 中到强 | 强 | 强 | 想把实验、scorer、线上评分放一起 |
| **Langfuse** | 平台 | 强 | 强 | 强 | 中 | 强 | 强 | OpenTelemetry / 自定义埋点较重的团队 |
| **Ragas** | 库 | 强 | 弱 | 中 | 强 | 中 | 弱 | 想快速补 RAG / tool-use 指标 |
| **DeepEval** | 库 | 强 | 弱 | 中 | 强 | 中 | 弱 | 本地单测、CI、PyTest 风格 eval |
| **Inspect** | harness | 强 | 弱 | 强 | 强 | 强 | 弱 | benchmark、sandbox、安全/研究评测 |

这里的“强 / 中 / 弱”不是官方分级，而是基于截至 **2026-05-30** 的公开文档做的能力归纳。

## 3. 逐个看：这些框架现在分别强在哪

### A. LangSmith：今天最完整的“agent traces + eval + online”产品之一

LangSmith 官方把评测分成 **Offline Evaluation** 和 **Online Evaluation** 两套流程：离线侧从 dataset 建实验、定义 evaluator、跑 experiment、比较结果；在线侧则对生产 traces 自动跑 evaluator。它还明确支持 **human review、code rules、LLM-as-judge、pairwise comparison**。([LangSmith][1])

对 agent 来说，LangSmith 的优势在于它已经把 **trajectory** 当成一等公民。`agentevals` 可以直接评估 agent 的轨迹，也就是整条消息序列和 tool calls；支持 **strict / unordered / subset / superset** 等 trajectory match，也支持 LLM judge 去看路径是否合理。([LangSmith Trajectory][4])

适合场景：

- 已经有 LangChain / LangGraph。
- 需要同时做 **final answer + single step + trajectory**。
- 需要线上线下闭环，而不是只跑一次离线脚本。

### B. MLflow GenAI：更偏“通用实验平台”，但 trace 评测能力已经很强

MLflow 现在的 GenAI 评测主线是 `mlflow.genai.evaluate()` + `Scorer`。它可以把 `search_traces()` 拉出来的 traces 直接送进评测，并且 scorer 能访问完整 trace 的 spans、attributes、outputs。官方文档明确提到这使它可以评 **tool call trajectory、sub-agent routing、retrieved document recall** 等中间行为。([MLflow Traces][2], [MLflow Scorers][5])

MLflow 也支持 **automatic evaluations**，即 traces 记录进来后异步自动评测，不阻塞应用。官方最近还补了 **multi-turn conversation scorers**，例如 `ConversationCompleteness`、`UserFrustration`。([MLflow Auto Eval][6], [MLflow Multi-turn][7])

适合场景：

- 你已经有 MLflow / experiment tracking / model registry。
- 想把 **agent eval** 和 **传统 ML / prompt / model experiment** 放进一个平台。
- 更重视自定义 scorer、数据资产、长期实验治理。

### C. OpenAI Evals：把 traces、datasets、graders、eval runs 直接做进平台

OpenAI 现在对 agent eval 的入口已经很明确：官方页直接写的是 **“Use traces, graders, datasets, and eval runs to improve agent quality.”** 它建议：

- 工作流级错误定位，用 **trace grading**。
- 快速搭建与迭代，用 **Datasets**。
- 更大规模、API 化和跨模型，用 **Evals**。([OpenAI Agent Evals][3])

OpenAI 的 grader 体系目前支持 **string check、text similarity、score model grader、python code execution**，而且 grader 模板可以引用 `sample.output_text`、`sample.output_json`、`sample.output_tools`，所以它不仅能评最终文本，也能直接评结构化输出与 tool calls。([OpenAI Graders][8])

额外一点很关键：OpenAI 文档还明确支持 **external models**，也就是不只能评 OpenAI 自家模型。([OpenAI External Models][9])

适合场景：

- 你的 agent workflow 本来就在 OpenAI 平台上。
- 想把 **trace grading + datasets + eval API** 直接串起来。
- 需要可视化地快速迭代 grader，而不是先搭自建平台。

### D. Phoenix：从 tracing / debugging 出发，逐步长成 eval 平台

Phoenix 的定位一直很清楚：**experimentation, evaluation, and troubleshooting**。最新文档中，Phoenix 支持两种评测方式：

- **Client-side evals**：SDK 跑在 traces / datasets / 任意数据源上。
- **Server-side evals**：在 UI 配 evaluator 并挂到 dataset。([Phoenix][10])

它支持 **code-based evaluators、LLM-as-a-judge、human labels**，并且 tracing 本身就覆盖 model calls、retrieval、tool use、custom logic。([Phoenix Overview][11])

需要注意的一点是：Phoenix OSS 很强在 **trace inspection + eval debugging**；如果要更完整的 **production traffic online eval + alerting + threshold trigger**，官方文档会把你引向 **Arize AX Online Evals**。([Phoenix][10])

适合场景：

- 你先要把 agent / RAG 链路看清楚，再谈评测。
- 想从 observability 切入，而不是先搭复杂 benchmark harness。

### E. Braintrust：实验和生产评分做得很统一

Braintrust 的核心概念非常直接：一条 eval 由 **Data + Task + Scores** 组成，运行后生成 **immutable experiment snapshots**，可以比较回归。([Braintrust Quickstart][12], [Braintrust Experiments][13])

它支持三类 scorer：

- **Autoevals**
- **LLM-as-a-judge**
- **Custom code** ([Braintrust Scorers][14])

在线上侧，Braintrust 还能对 **production traces 自动在线评分**，而且是异步后台跑，不影响应用延迟。([Braintrust Online Scoring][15])

适合场景：

- 想要明显的实验视角，而不是只做 observability。
- 希望线下/线上都共用 scorer 体系。

### F. Langfuse：现在已经从 tracing 明确扩展到了 eval

Langfuse 最新文档已经把 evaluation 独立成完整模块，主线是：

- dataset
- experiment
- live evaluator
- score analytics ([Langfuse Overview][16])

它当前的在线评测重点还是 **LLM-as-a-Judge** 和人工/SDK 打分；而 **code evaluators** 在 **Fast Preview**，可跑在 observations 或 experiments 上，适合 exact match、schema、regex、tool-call checks 等确定性规则。([Langfuse Code Evals][17], [Langfuse Judge][18])

这意味着 Langfuse 的 agent eval 现在已经够用，但如果你特别依赖“代码评测器全面 GA、复杂 trajectory 专用 evaluator”，它仍然比 LangSmith / Braintrust / Inspect 更偏 **tracing-first**。

适合场景：

- 团队已经用 OpenTelemetry / Langfuse 做 tracing。
- 希望在现有 tracing 上叠加 evaluator，而不是换平台。

### G. Ragas：指标库很强，但它不是完整生产评测平台

Ragas 仍然是最常见的 **指标层** 方案之一。最新文档里，Ragas 明确列出 agent/tool use 指标：

- `Tool Call Accuracy`
- `Tool Call F1`
- `Agent Goal Accuracy` ([Ragas Metrics][19])

它的 `evaluate()` 仍然是围绕 dataset + metrics 的 Python 评测入口。([Ragas Evaluate][20])

所以对 agent eval 来说，Ragas 的定位很适合做：

- 工具调用是否正确
- goal 是否达成
- RAG / memory / rubric 打分

但它不等于一个完整的 **trace observability + online monitoring** 平台。

适合场景：

- 你已经有自己的 trace / dataset 流水线。
- 只是想快速补一层高质量 metrics。

### H. DeepEval：最适合“像写单测一样写 eval”

DeepEval 的风格非常鲜明，就是把 LLM / agent eval 写成 **测试**。它的 `ToolCorrectnessMetric` 专门评 agent 的工具调用能力，既可以只看工具名，也可以要求参数与输出一致，还可以结合 `available_tools` 用 LLM 判断是不是选了最优工具。([DeepEval Tool Correctness][21])

它的优势不是 observability，而是：

- 本地快速跑
- CI 好接
- 以测试用例为中心

适合场景：

- 想把 agent eval 变成 `pytest` 风格回归测试。
- 暂时不需要复杂的在线流量监控。

### I. Inspect：更像“研究/benchmark 评测操作系统”

Inspect 不是典型 SaaS 平台，而是一个开源 eval framework。官方首页强调它有：

- **200+ pre-built evaluations**
- 灵活的 **tool calling**
- **sandboxing**
- 内置 agent 与 multi-agent primitive
- **Agent Bridge**，可桥接 OpenAI Agents SDK、LangChain、Pydantic AI
- **Human Agent** 做人类 baseline ([Inspect][22])

这类能力对研究型 agent eval 很重要，因为你往往不只是要“评分”，还要：

- 搭 sandbox
- 接第三方 agent
- 运行复杂 benchmark
- 保留完整日志

适合场景：

- 想跑 benchmark、红队、安全、compute task。
- 需要 sandbox / human baseline / 自定义 tool environment。

## 4. 实际选型时，最关键的不是“谁最好”，而是你处在哪一层

### 情况 1：你在做生产 agent，已经有真实流量

优先看：

- **LangSmith**
- **Braintrust**
- **MLflow**
- **Phoenix**
- **Langfuse**
- **OpenAI**

因为这类平台都把 **trace、dataset、experiment、online eval** 串起来了。

### 情况 2：你已经有平台，只想补指标

优先看：

- **Ragas**
- **DeepEval**

因为它们更像“评测能力组件”，而不是“评测操作系统”。

### 情况 3：你在做 benchmark、研究、sandbox agent

优先看：

- **Inspect**

因为它能处理 **tools、sandbox、agents、human baseline、prebuilt evals** 这些研究任务里经常遇到的东西。([Inspect][22])

## 5. 一个很实用的判断标准：看它是“final-answer eval”还是“trace-native eval”

如果一个框架主要只能做：

```text
input -> final output -> score
```

那它更适合 prompt / model 评估。

如果它能做：

```text
input -> trajectory -> tool calls -> observations -> final output -> score
```

那它才真正适合 agent eval。

按这个标准看，当前更“trace-native”的是：

- LangSmith
- MLflow
- OpenAI
- Phoenix
- Langfuse
- Inspect

而更偏“指标库 / 测试库”的是：

- Ragas
- DeepEval

## 6. 我对当前格局的归纳

### A. 生产侧正在收敛到 `trace + evaluator + experiment + online monitor`

这在 LangSmith、MLflow、OpenAI、Braintrust、Langfuse、Phoenix 的产品设计里都很明显。([LangSmith][1], [MLflow][2], [OpenAI][3], [Braintrust Experiments][13], [Langfuse Overview][16], [Phoenix Overview][11])

### B. agent eval 已经不再是“只看最终答案”

LangSmith 直接支持 trajectory eval；MLflow scorer 可访问完整 trace；OpenAI 有 trace grading；Phoenix 和 Langfuse 都把 traces / observations 变成 evaluator 的输入。([LangSmith Trajectory][4], [MLflow Traces][2], [OpenAI Trace Grading][23], [Phoenix Overview][11], [Langfuse Judge][18])

### C. 工具调用评测已经成为独立能力面

Ragas、DeepEval、LangSmith/OpenAI 现在都把 tool call 当成显式评测对象，而不是隐藏在最终回答里。([Ragas Metrics][19], [DeepEval Tool Correctness][21], [LangSmith Trajectory][4], [OpenAI Graders][8])

### D. “完整框架”和“指标库”之间的边界越来越清楚

很多团队最后不是只选一个工具，而是：

```text
Tracing / experiments 平台
  +
指标库 / 自定义 scorer
  +
专项 benchmark harness
```

例如：

- Langfuse / Phoenix + Ragas
- MLflow + custom scorer
- LangSmith + agentevals
- Inspect + 自定义 scorer

## 7. 如果你现在要落地 agent eval，建议先这样选

### 最小可用组合

```text
平台：
  LangSmith / Braintrust / MLflow / Langfuse / Phoenix / OpenAI 任选其一

指标：
  Ragas 或自定义代码规则

专项测试：
  DeepEval 或 CI 脚本
```

### 如果你是研究型 / benchmark 型团队

```text
Inspect
  +
自建 benchmark 环境
  +
Ragas / 自定义 scorer
```

一句话总结：**截至 2026-05-30，agent eval 的“常见框架支持情况”已经不是比谁有更多指标，而是比谁能把 trace、tool calls、trajectory、datasets、experiments、online eval 串成闭环。**

[1]: https://docs.langchain.com/langsmith/evaluation "LangSmith Evaluation"
[2]: https://mlflow.org/docs/latest/genai/eval-monitor/running-evaluation/traces/ "Evaluating (Production) Traces | MLflow AI Platform"
[3]: https://developers.openai.com/api/docs/guides/agent-evals "Evaluate agent workflows | OpenAI API"
[4]: https://docs.langchain.com/langsmith/trajectory-evals "How to evaluate your agent with trajectory evaluations - Docs by LangChain"
[5]: https://mlflow.org/docs/latest/genai/eval-monitor/scorers/index.html "LLM Judges and Scorers | MLflow AI Platform"
[6]: https://mlflow.org/docs/latest/genai/eval-monitor/automatic-evaluations/ "Automatic Evaluation | MLflow AI Platform"
[7]: https://mlflow.org/docs/latest/genai/eval-monitor/running-evaluation/multi-turn/ "Evaluate Conversations | MLflow AI Platform"
[8]: https://platform.openai.com/docs/guides/graders "Graders | OpenAI API"
[9]: https://platform.openai.com/docs/guides/external-models "Evaluate external models | OpenAI API"
[10]: https://arize.com/docs/phoenix/evaluation/evals "Evaluation - Phoenix"
[11]: https://arize.com/docs/phoenix "What is Arize Phoenix?"
[12]: https://www.braintrust.dev/docs/evaluation "Evaluation quickstart - Braintrust"
[13]: https://www.braintrust.dev/docs/evaluate "Evaluate systematically - Braintrust"
[14]: https://www.braintrust.dev/docs/evaluate/write-scorers "Measure output quality with scorers - Braintrust"
[15]: https://www.braintrust.dev/docs/platform/logs/score "Score production traces - Braintrust"
[16]: https://langfuse.com/docs/evaluation/overview "Evaluation of LLM Applications - Langfuse"
[17]: https://langfuse.com/docs/evaluation/evaluation-methods/code-evaluators "Code evaluators - Langfuse"
[18]: https://langfuse.com/docs/scores/evals "LLM-as-a-Judge - Langfuse"
[19]: https://docs.ragas.io/en/latest/concepts/metrics/available_metrics/ "List of available metrics - Ragas"
[20]: https://docs.ragas.io/en/latest/references/evaluate/ "evaluate() - Ragas"
[21]: https://deepeval.com/docs/metrics-tool-correctness "Tool Correctness | DeepEval"
[22]: https://inspect.aisi.org.uk/ "Inspect"
[23]: https://platform.openai.com/docs/guides/trace-grading "Trace grading | OpenAI API"
