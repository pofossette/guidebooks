下面是联网整理后的概览：**Agent 系统评测**通常不是只看“最终回答对不对”，而是把 **任务完成、工具调用、轨迹/中间步骤、成本延迟、安全性、线上稳定性** 一起评估。MLflow、LangSmith、Ragas、DeepEval、Phoenix 等框架都强调 traces / trajectories / scorers / datasets 这套思路；AgentBench、Inspect AI 这类更偏基准环境与研究评测。([MLflow AI Platform][1])

## 1. 字符串流程图：Agent 评测的一般流程

```text
业务目标定义
  ↓
拆解 Agent 能力边界
  ├─ 能否完成任务？
  ├─ 是否会正确规划？
  ├─ 是否会正确调用工具？
  ├─ 是否能处理多轮上下文？
  ├─ 是否安全、稳定、低成本？
  ↓
构建评测集 Dataset
  ├─ 单轮任务样本
  ├─ 多轮对话样本
  ├─ 工具调用样本
  ├─ 长链路任务样本
  ├─ 边界/异常/攻击样本
  └─ 线上真实 case 回放
  ↓
定义 Ground Truth / Rubric / Reference
  ├─ 标准答案
  ├─ 期望工具调用序列
  ├─ 期望中间状态
  ├─ 评分规则 Rubric
  └─ 人工标注偏好
  ↓
运行 Agent
  ├─ 固定模型/提示词/工具版本
  ├─ 记录输入输出
  ├─ 记录 tool calls
  ├─ 记录 reasoning/trajectory trace
  └─ 记录 latency/token/cost/error
  ↓
打分 Evaluation
  ├─ 规则评分：exact match / JSON valid / schema check
  ├─ LLM-as-Judge：任务完成度、相关性、事实性
  ├─ 工具评分：tool accuracy / tool F1 / 参数正确性
  ├─ 轨迹评分：步骤是否合理、是否冗余、是否偏离
  ├─ 人工评审：高风险/主观/复杂任务
  └─ 线上指标：失败率、重试率、用户反馈
  ↓
误差分析 Error Analysis
  ├─ 规划失败
  ├─ 工具选择错误
  ├─ 工具参数错误
  ├─ 检索失败
  ├─ 幻觉/编造
  ├─ 多轮记忆丢失
  ├─ 安全策略失效
  └─ 成本/延迟不可接受
  ↓
迭代优化
  ├─ Prompt 改写
  ├─ Tool schema 改进
  ├─ Retrieval 改进
  ├─ Planner / Router 改进
  ├─ 模型替换
  ├─ Guardrail 增强
  └─ 缓存/并发/降级策略优化
  ↓
回归测试 + CI/CD + 线上监控
```

## 2. 最常见的评测维度与指标

### A. 任务结果层：最终有没有完成任务

这是最接近业务价值的一层。

```text
用户目标
  ↓
Agent 最终输出
  ↓
是否满足用户意图？
  ↓
任务完成度 / 正确率 / 用户满意度
```

常见指标：

| 指标                        | 含义               | 适用场景           |
| ------------------------- | ---------------- | -------------- |
| Task Success Rate         | 任务是否成功完成         | 订票、查数、写代码、客服处理 |
| Accuracy / Exact Match    | 输出是否与标准答案一致      | 问答、分类、结构化抽取    |
| Pass@k                    | 多次尝试中是否至少一次成功    | 代码生成、复杂推理      |
| Human Preference Win Rate | 人类更偏好哪个版本        | 开放式回答、文案、助手体验  |
| LLM-as-Judge Score        | 用评审模型按 Rubric 打分 | 主观或开放式任务       |

OpenAI 的 evals 文档也把评测理解为用测试集检查模型/系统输出是否符合预期，并常见地分为代码/规则检查与模型评分两类。([OpenAI开发者][2])

---

### B. 工具调用层：Agent 是否会正确使用工具

Agent 与普通 LLM 应用最大的区别之一是：它会调用搜索、数据库、API、代码执行器、浏览器、企业系统等工具。

```text
用户请求
  ↓
是否需要工具？
  ↓
选择哪个工具？
  ↓
参数是否正确？
  ↓
调用顺序是否正确？
  ↓
是否正确利用工具结果？
```

常见指标：

| 指标                      | 含义                                          |
| ----------------------- | ------------------------------------------- |
| Tool Call Accuracy      | 工具名称、参数、顺序是否与参考调用一致                         |
| Tool Call F1            | 对工具调用做 precision / recall / F1，适合不要求严格顺序的情况 |
| Tool Selection Accuracy | 是否选择了正确工具                                   |
| Argument Accuracy       | 工具参数是否正确                                    |
| Tool Overuse Rate       | 是否不必要地调用工具                                  |
| Tool Underuse Rate      | 该调用工具时没调用                                   |
| Tool Error Rate         | 工具调用失败、超时、异常比例                              |

Ragas 的 Agent/tool-use 指标文档就提供了 ToolCallAccuracy 和 ToolCallF1；其中 ToolCallAccuracy 比较实际工具调用与 reference_tool_calls，ToolCallF1 则用精确率、召回率、F1 衡量工具调用接近期望的程度。([Ragas][3])

---

### C. 轨迹层：过程是否合理

Agent 评测通常会看 **trajectory / trace**，也就是中间步骤，而不只看最终答案。

```text
Input
  ↓
Plan
  ↓
Tool Call 1
  ↓
Observation 1
  ↓
Reason / Decide
  ↓
Tool Call 2
  ↓
Observation 2
  ↓
Final Answer
```

常见指标：

| 指标                      | 含义             |
| ----------------------- | -------------- |
| Trajectory Correctness  | 整体行动路径是否合理     |
| Step Relevance          | 每一步是否服务于目标     |
| Redundant Step Rate     | 是否有多余步骤        |
| Planning Quality        | 计划是否完整、可执行     |
| Recovery Ability        | 工具失败或信息不足时能否恢复 |
| State Tracking Accuracy | 多轮/多步中是否保持正确状态 |

LangSmith / agentevals 明确支持对 agent trajectories 做评测，MLflow 也强调用 traces 和 scorers 系统性评估 Agent 的多步行为。([LangChain 文档][4])

---

### D. RAG / 信息检索层：如果 Agent 依赖知识库

很多 Agent 实际是 “Agent + RAG + Tool Use”。

```text
用户问题
  ↓
查询改写 / 路由
  ↓
检索文档
  ↓
选择上下文
  ↓
生成答案
  ↓
引用证据
```

常见指标：

| 指标                 | 含义         |
| ------------------ | ---------- |
| Context Recall     | 关键证据是否被检索到 |
| Context Precision  | 检索结果是否少噪声  |
| Faithfulness       | 回答是否忠实于上下文 |
| Answer Relevancy   | 回答是否切题     |
| Citation Accuracy  | 引用是否支持对应结论 |
| Hallucination Rate | 幻觉率        |

Ragas、DeepEval、Phoenix 等框架都常被用于 RAG 与 Agent 结合场景的评测；Phoenix 也强调 tracing、evaluation、datasets、experiments 等能力。([GitHub][5])

---

### E. 多轮对话层：上下文、目标与用户体验

```text
Turn 1 用户目标
  ↓
Turn 2 补充约束
  ↓
Turn 3 工具调用
  ↓
Turn 4 澄清 / 修正
  ↓
最终完成
```

常见指标：

| 指标                        | 含义         |
| ------------------------- | ---------- |
| Conversation Completeness | 对话是否完整解决问题 |
| Context Retention         | 是否记住前文约束   |
| Dialogue Coherence        | 多轮是否连贯     |
| Clarification Quality     | 是否在必要时澄清   |
| User Frustration          | 是否导致用户反复纠正 |
| Turn Count to Success     | 完成任务需要多少轮  |

Databricks/MLflow 的 Agent 评测文档也提到多轮对话质量、conversation simulation、线上 traces 监控等方向。([Databricks 文档][6])

---

### F. 安全、鲁棒性与合规

```text
正常输入
  ↓
边界输入
  ↓
恶意输入 / Prompt Injection
  ↓
工具滥用风险
  ↓
隐私 / 权限 / 安全策略检查
```

常见指标：

| 指标                          | 含义                 |
| --------------------------- | ------------------ |
| Refusal Accuracy            | 该拒绝时是否拒绝，不该拒绝时是否误拒 |
| Prompt Injection Resistance | 抵抗提示注入能力           |
| Data Leakage Rate           | 是否泄露敏感信息           |
| Policy Violation Rate       | 是否违反安全策略           |
| Unauthorized Tool Use       | 是否越权调用工具           |
| Robustness Score            | 对扰动、噪声、异常输入的稳定性    |

Inspect AI 这类框架常用于更广泛的模型/Agent 能力与安全评估，覆盖 coding、agentic tasks、reasoning、knowledge、behavior、多模态等方向。([Inspect][7])

---

### G. 工程指标：成本、延迟、稳定性

```text
请求进入
  ↓
模型调用
  ↓
工具调用
  ↓
重试 / 超时 / 错误处理
  ↓
返回结果
```

常见指标：

| 指标                        | 含义     |
| ------------------------- | ------ |
| Latency p50 / p95 / p99   | 响应延迟   |
| Token Cost / Request Cost | 单次请求成本 |
| Tool Latency              | 外部工具耗时 |
| Retry Rate                | 重试比例   |
| Timeout Rate              | 超时比例   |
| Crash / Exception Rate    | 系统异常比例 |
| Throughput                | 并发吞吐   |
| Cache Hit Rate            | 缓存命中率  |

这类指标一般通过 observability / tracing 平台做线上监控，比如 Phoenix、LangSmith、MLflow、Databricks Lakehouse Monitoring 等。([GitHub][5])

## 3. 常见评测方式

### 方式 1：规则评测

适合结构化、确定性任务。

```text
输出
  ↓
JSON schema 校验
  ↓
字段完整性校验
  ↓
正则 / exact match / 单元测试
  ↓
通过 / 失败
```

例子：

```text
“返回合法 JSON”
“SQL 是否能执行”
“工具参数是否包含 user_id”
“代码是否通过测试”
```

优点是稳定、便宜、可复现；缺点是覆盖不了开放式质量。

---

### 方式 2：LLM-as-Judge

适合开放式回答、复杂任务完成度、轨迹合理性。

```text
输入 + Agent 输出 + 参考答案/Rubric
  ↓
评审模型
  ↓
打分 + 理由
  ↓
聚合统计
```

常见 Rubric：

```text
1 分：完全错误或未完成
2 分：部分相关但关键信息缺失
3 分：基本完成但有小错误
4 分：完成良好
5 分：完全完成且表达清晰
```

但要注意：LLM-as-Judge 本身也会有偏差，所以高风险任务通常要抽样做人工复核。OpenAI evals 文档也提到模型评分适合开放式任务，但应通过人工评估验证评分器表现。([OpenAI开发者][2])

---

### 方式 3：人工评测

适合高价值、高风险、强主观任务。

```text
样本抽样
  ↓
多人标注
  ↓
一致性检查
  ↓
仲裁
  ↓
形成 gold set / preference data
```

常见于法律、医疗、金融、客服质检、品牌文案、安全策略等场景。

---

### 方式 4：仿真环境 / Benchmark

适合评估 Agent 在交互环境中的长期决策能力。

```text
Agent
  ↓
环境状态
  ↓
动作
  ↓
环境反馈
  ↓
下一步动作
  ↓
任务成功 / 失败
```

AgentBench 就是这种思路：它将 LLM 当作 Agent 放在多个交互环境中，评估推理与决策能力；论文指出常见失败原因包括长期推理、决策、指令遵循能力不足。([ICLR 会议录][8])

## 4. 常用框架与适用场景

| 框架                     | 适合做什么                                          | 特点                                                         |
| ---------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| LangSmith / agentevals | LangChain / LangGraph Agent 评测、trajectory eval | 支持 trace、trajectory、dataset、CI 集成                          |
| Ragas                  | RAG + Agent/tool-use 指标                        | ToolCallAccuracy、ToolCallF1、RAG 指标成熟                       |
| DeepEval               | 类 pytest 的 LLM/Agent 单测                        | 支持 G-Eval、task completion、answer relevancy、hallucination 等 |
| MLflow GenAI Eval      | 企业级实验、trace、scorer、版本对比                        | 适合把 Agent 评测接入 MLflow 体系                                   |
| Arize Phoenix          | Observability + tracing + eval                 | 适合排查线上 trace、RAG/LLM 质量问题                                  |
| OpenAI Evals           | 自定义 eval、模型/系统回归测试                             | 适合构建私有评测集与自动化评测                                            |
| Inspect AI             | 安全、能力、benchmark、agentic task 评测                | UK AI Security Institute 开源，偏通用评测框架                        |
| AgentBench             | 研究型 Agent benchmark                            | 多环境交互任务，评估长期推理和决策                                          |

LangSmith 强调将评测接入 pytest、Vitest、GitHub workflows，并可设置阈值让分数下降时自动失败；MLflow 则强调用 traces 和 scorers 评估复杂 Agent 行为；Inspect AI 提供可复用组件与大量预置评测。([LangChain][9])

## 5. 一个实用的 Agent 评测指标体系

可以按这 7 层建表：

```text
L1 最终结果
  ├─ task_success_rate
  ├─ final_answer_accuracy
  └─ user_satisfaction

L2 工具调用
  ├─ tool_call_accuracy
  ├─ tool_call_f1
  ├─ argument_accuracy
  ├─ tool_error_rate
  └─ unnecessary_tool_call_rate

L3 轨迹过程
  ├─ trajectory_score
  ├─ step_relevance
  ├─ planning_quality
  ├─ recovery_score
  └─ redundant_steps

L4 检索与知识
  ├─ context_recall
  ├─ context_precision
  ├─ faithfulness
  ├─ citation_accuracy
  └─ hallucination_rate

L5 多轮对话
  ├─ context_retention
  ├─ dialogue_coherence
  ├─ clarification_quality
  └─ turn_count_to_success

L6 安全鲁棒
  ├─ prompt_injection_resistance
  ├─ policy_violation_rate
  ├─ data_leakage_rate
  └─ refusal_accuracy

L7 工程效率
  ├─ latency_p95
  ├─ cost_per_task
  ├─ token_usage
  ├─ retry_rate
  └─ timeout_rate
```

## 6. 一个最小可落地版本

如果你要从 0 开始评测一个 Agent，建议先这样做：

```text
准备 50~200 条真实任务样本
  ↓
每条样本标注：
  ├─ 用户输入
  ├─ 期望最终结果
  ├─ 是否需要工具
  ├─ 期望工具调用
  └─ 评分 Rubric
  ↓
跑当前 Agent
  ↓
记录完整 trace
  ↓
计算：
  ├─ 任务成功率
  ├─ 工具调用准确率
  ├─ 平均成本
  ├─ 平均延迟
  ├─ 幻觉率
  └─ 人工抽检通过率
  ↓
按失败类型归因
  ↓
每次改 prompt / tool / model 后做回归测试
```

一个简化的结果表可以长这样：

| Case     | Task Success | Tool Correct | Final Answer | Safety |  Cost | Latency | Failure Type |
| -------- | -----------: | -----------: | -----------: | -----: | ----: | ------: | ------------ |
| case_001 |            1 |            1 |          0.9 |   pass | ¥0.03 |    4.2s | -            |
| case_002 |            0 |            0 |          0.2 |   pass | ¥0.08 |   12.5s | 参数错误         |
| case_003 |            1 |            1 |          0.8 |   pass | ¥0.05 |    6.1s | 轻微冗余         |
| case_004 |            0 |            1 |          0.3 |   fail | ¥0.04 |    5.0s | 安全拒答失败       |

## 7. 总结一句话

Agent 评测一般是：

```text
不是只评“答案”，而是评：
输入 → 规划 → 工具调用 → 中间观察 → 状态管理 → 最终输出 → 成本/延迟/安全
整个链路是否可靠。
```

最核心的三类指标是：

```text
任务完成度
  +
工具/轨迹正确性
  +
线上工程指标
```

最实用的落地路径是：

```text
真实任务集
  → trace 记录
  → 规则评分 + LLM Judge + 人工抽检
  → 错误归因
  → 回归测试
  → 线上监控
```

[1]: https://mlflow.org/docs/latest/genai/eval-monitor/running-evaluation/agents/?utm_source=chatgpt.com "Evaluating Agents | MLflow AI Platform"
[2]: https://developers.openai.com/api/docs/guides/evals?utm_source=chatgpt.com "Working with evals | OpenAI API"
[3]: https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/agents/?utm_source=chatgpt.com "Agentic or Tool use - Ragas"
[4]: https://docs.langchain.com/langsmith/trajectory-evals?utm_source=chatgpt.com "How to evaluate your agent with trajectory evaluations"
[5]: https://github.com/Arize-ai/phoenix?utm_source=chatgpt.com "GitHub - Arize-ai/phoenix: AI Observability & Evaluation"
[6]: https://docs.databricks.com/gcp/en/mlflow3/genai/eval-monitor/?utm_source=chatgpt.com "Evaluate and monitor AI agents | Databricks on Google Cloud"
[7]: https://inspect.aisi.org.uk/?utm_source=chatgpt.com "Inspect"
[8]: https://proceedings.iclr.cc/paper_files/paper/2024/hash/e9df36b21ff4ee211a8b71ee8b7e9f57-Abstract-Conference.html?utm_source=chatgpt.com "AgentBench: Evaluating LLMs as Agents - proceedings.iclr.cc"
[9]: https://www.langchain.com/langsmith/evaluation?utm_source=chatgpt.com "LangSmith - LLM & AI Agent Evals Platform: Continuously ... - LangChain"
