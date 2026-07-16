# Agent 评测实施流程

Agent 评测的对象是完整系统：**模型、提示词、编排、工具、权限、环境和重试策略**。因此不要只比较最终回答，也不要把一个 LLM Judge 分数当成唯一结论。

本页提供研发团队可直接采用的最小闭环；LLM Judge 的具体协议见 [LLM-as-a-Judge](./llm-as-a-judge.md)。

## 1. 先定义业务 claim

评测从可证伪的业务承诺开始，而不是从“模型看起来更聪明”开始。

| 不够具体的目标 | 可评测的 claim |
| --- | --- |
| 客服 Agent 很好用 | 在退款任务集上，策略合规的端到端完成率不低于 90% |
| 数据分析 Agent 会查数 | 在冻结数据快照中，结果集与 golden SQL 等价，且不越权读取 |
| 浏览器 Agent 很可靠 | 在指定网站版本与预算内完成任务，最终页面状态满足验收脚本 |

每个 claim 同时写清楚：目标用户、任务范围、允许工具、成功状态、禁止行为、成本/时延预算，以及对比的系统版本。

## 2. 构造版本化任务集

一条任务不只是一段 prompt。至少保存以下信息：

```yaml
id: refund_042
input: 用户请求取消订单并退款
initial_state: fixtures/refund_042.json
allowed_tools: [get_order, cancel_order, create_refund]
expected_outcome: order.cancelled && refund.created
policy_rules: [verify_identity_before_refund]
metadata:
  domain: support
  difficulty: multi_step
  risk: high
```

任务来源优先级通常是：线上失败与人工升级 case、真实人工工作流、历史缺陷、边界/攻击样本，最后才是合成样本。保留任务、环境和参考状态的版本；否则新旧分数不可比。

## 3. 在隔离环境中重复运行 trial

每个 trial 从干净状态启动并记录完整 trace：输入、模型与提示词版本、工具输入输出、重试、状态变更、最终答复、token、成本与延迟。对于带随机性的 Agent，同一 case 应重复运行，而不只跑一次。

```text
业务 claim
  → 版本化任务 + 初始环境
  → N 次隔离 trial
  → outcome verifier + policy gate + LLM Judge
  → 人工校准 / 仲裁
  → 分桶报告与回归门禁
  → 线上抽样、监控与任务集回灌
```

浏览器、桌面、数据库和代码仓库任务尤其需要可 reset 的环境。这是 WebArena、OSWorld、τ-bench 和 SWE-bench 等基准可复现的基础，而非实现细节。

## 4. 用分层评分而不是单一总分

### 4.1 第一层：确定性 outcome verifier

优先检验可观察的结果：单元测试、数据库状态、文件 diff、页面 DOM/后端状态、JSON schema、权限审计日志或精确答案。它稳定、廉价且可复现。

### 4.2 第二层：不可平均掉的安全与策略门禁

越权调用、敏感数据泄露、错误的不可逆动作、绕过审批等关键失败应直接判为失败，不能用其他维度高分抵消。对普通策略错误也应单独报违规率。

### 4.3 第三层：LLM Judge 与人工校准

LLM Judge 适合评估开放式沟通、证据使用、复杂任务的完成质量，以及“多条有效路径”中的过程质量。它补足 verifier，不能替代 verifier。高风险、低置信或 Judge 与规则冲突的样本进入人工仲裁。

## 5. 推荐指标与报告方式

| 维度 | 核心指标 | 说明 |
| --- | --- | --- |
| 结果 | end-to-end success rate | 由最终状态或测试验证的完成率 |
| 稳定性 | pass^k、失败重现率 | 重复运行后仍可靠，而非偶然成功 |
| 合规 | policy violation rate | 关键门禁失败应单列，不并入质量均分 |
| 工具 | tool/argument error rate | 工具选择、参数和结果使用错误 |
| 质量 | rubric score、pairwise win rate | 仅用于需要语义判断的部分 |
| 效率 | p50/p95 latency、cost/task | 在相同预算下比较 |
| 运营 | escalation rate、人工满意度 | 线上是否真正减少人工负担 |

分数应按业务域、难度、工具组合、风险等级和失败阶段分桶，并随结果附带：任务集版本、环境快照、Agent/harness、模型版本、token/时间预算、重试策略、trial 数与 Judge 配置。

## 6. 最小可行评测（MVE）

初次落地不必先搭排行榜。可以从 20–50 条高价值真实 case 开始：

1. 为每条任务定义最终状态与关键策略门禁。
2. 在可 reset 的测试环境跑当前版本，保留 trace。
3. 先计算成功率、违规率、成本与 p95 延迟。
4. 对不能程序化验证的部分应用已校准的 Judge rubric。
5. 人工复核低置信、分歧和高风险样本，形成 adjudication set。
6. 将修复过的线上失败持续加入回归集，并在发布前比较版本差异。

## 7. 何时阅读其他指南

- 需要设计 Judge 评分、对比、偏差控制和人工校准：见 [LLM-as-a-Judge](./llm-as-a-judge.md)。
- 需要选择 tracing、experiment、线上评分或测试库：见 [Agent Eval 框架](./agent-eval-frameworks.md)。
- 需要自建环境或选择公开基准：见 [Agent Eval Benchmark](./agent-eval-benchmarks.md)。
- Agent 以知识库检索为主：见 [RAG 评测](./rag.md)。

## 参考资料

- [Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [OpenAI: Evaluate agent workflows](https://developers.openai.com/api/docs/guides/agent-evals)
- [τ-bench](https://arxiv.org/abs/2406.12045)
- [WebArena](https://arxiv.org/abs/2307.13854)
- [OSWorld](https://arxiv.org/abs/2404.07972)
- [SWE-bench](https://arxiv.org/abs/2310.06770)
