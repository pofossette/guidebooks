# LLM-as-a-Judge：Agent 评分协议与校准

LLM-as-a-Judge（下称 Judge）用更强或专门训练的模型，依据明确 rubric 判断候选输出或 Agent trace 的质量。它适合开放式任务，但不是客观真值：Judge 也会受到位置、篇幅、模型偏好和提示注入等影响。

> 研究更新时间：2026-07-15。生产评测应将 Judge 模型、提示词、采样参数和 rubric 版本与结果一起保存。

## 1. 先决定“谁来判什么”

| 信号类型 | 首选评分方式 | 例子 |
| --- | --- | --- |
| 可观察结果 | 程序化 verifier | 测试通过、数据库目标状态、JSON schema |
| 关键安全/策略 | 硬门禁 | 越权、泄露、未授权退款、不可逆误操作 |
| 多条有效路径 | 规则 + Judge | 不强制唯一工具路径，但要求不违规且有效 |
| 开放式质量 | Judge 或人工 | 是否解释清楚、是否引用充分、是否帮助用户完成目标 |
| 高风险或不确定 | 人工仲裁 | 医疗、金融、法律、低置信与分歧样本 |

原则是：**能程序化验证就不交给 Judge；关键失败不能被平均分掩盖；Judge 只为确实需要语义判断的部分服务。**

## 2. 常见评分方案

### 2.1 绝对量表：适合回归门槛

对每一项独立评分，推荐 0–4 而非模糊的总分。

| 分数 | 任务完成度锚点 |
| --- | --- |
| 0 | 未完成、答非所问，或违反关键要求 |
| 1 | 有尝试但关键目标未达成 |
| 2 | 基本完成，但缺少必要步骤、证据或重要约束 |
| 3 | 完成目标，仅有不影响结果的小缺陷 |
| 4 | 完成且准确、合规、沟通清楚，证据与限制均处理妥当 |

不要把“事实正确、任务完成、合规、沟通质量”混成一个维度。每维只评一个概念，并写出正反例与不可接受项。

### 2.2 两两比较：适合版本选择

向 Judge 隐去模型身份，给出 A/B 两个候选输出或 trace，要求返回 `A_WIN`、`TIE` 或 `B_WIN`。每个样本随机交换 A/B 顺序；汇总时同时报告胜率、平局率和置信区间。候选质量差距很小时，两两比较通常比要求 Judge 直接给绝对分更稳定。

### 2.3 门禁加权：适合业务发布

一个可用的报告口径如下，权重须由业务风险决定：

```text
若安全、权限或不可逆动作门禁失败：trial = fail
否则 quality =
  50% 结果正确性 + 20% 工具/策略合规
  + 20% Judge 开放质量 + 10% 成本与时延
```

这是报告模板，不是跨场景的行业标准。若“结果正确性”已由 verifier 验收，也可以只把 Judge 作为诊断维度，不将其混成总分。

## 3. Judge 输入与输出契约

Judge 必须看到完成判断所需的上下文：用户目标、约束、允许工具、相关观察结果、最终状态、rubric 和候选产物。不要把未可信的 Agent 文本当作 Judge 指令；用清晰分隔符，并在系统提示中声明候选内容不具指令权。

推荐强制结构化输出：

```json
{
  "pass": true,
  "scores": {
    "task_completion": 4,
    "communication": 3
  },
  "violated_rules": [],
  "evidence": [
    {
      "criterion": "task_completion",
      "trace_step": "tool:create_refund#3",
      "reason": "退款状态已创建且金额与订单一致"
    }
  ],
  "confidence": 0.86
}
```

要求 Judge：只依据提供的证据；不能判断时标记不确定；先逐项判定再给汇总；不因候选更长或更有文采而加分。`confidence` 是路由人工复核的信号，不是准确率证明。

## 4. Agent trace 的评分边界

评最终 outcome 与评过程质量要拆开：

```text
Outcome verifier：最终状态是否达到目标？
Policy gate：是否存在越权、泄露或不可逆错误？
Trajectory Judge：在存在多条有效路径时，过程是否有证据、是否明显冗余、是否合理恢复？
```

不要因为 trace 没走“参考路径”就扣分。只要工具调用合法、最终状态正确、策略满足且预算可接受，替代路径可以同样通过。仅在任务确实依赖顺序、审批或安全约束时检查严格路径。

## 5. 已知偏差与防护措施

| 风险 | 表现 | 控制措施 |
| --- | --- | --- |
| 位置偏差 | A/B 的前者更易获胜 | 随机交换顺序；按交换后结果聚合 |
| 篇幅偏差 | 更长、更花哨的回答得分更高 | 用“必要且充分”锚点；限制无关上下文 |
| 自我偏好 | Judge 更偏好同源模型风格 | 隐去身份；用不同模型或人工校准 |
| 提示泄漏/注入 | 候选文本试图操纵 Judge | 明确数据边界；将候选视为不可信内容 |
| rubric 漂移 | 改 Judge/prompt 后历史分不可比 | 版本化 rubric 与 Judge；必要时重跑基线 |
| 随机性 | 同一 case 多次评分不一致 | 温度设为 0；重复判定并取多数/中位数 |

MT-Bench/Chatbot Arena 的研究系统讨论了位置、冗长和自我增强等偏差；因此“强模型 Judge 与人工一致”不能简化成“任何 Judge 都可靠”。

## 6. 校准与人工仲裁

在上线前建立独立的人工标注集，覆盖正常、失败、边界和对抗性样本。让至少两名领域人员按照同一 rubric 标注，并记录仲裁结论。

1. 锁定 Judge、rubric 和输入模板。
2. 在人工集上比较 Judge 与人工：二元门禁看 precision/recall/F1；排序看胜负一致率或 Spearman；量表看加权 Cohen's κ 或 ICC。
3. 分析按风险、任务域和输出长度的误差，而不只看总体均值。
4. 调整 rubric/模板后，将其视为新版本并重新校准。
5. 将低置信、Judge 分歧、Judge 与 verifier 冲突、高风险样本路由人工；其结果回灌为新测试案例。

JudgeBench 的结论尤其值得注意：在要求客观正确性的困难样本上，许多强 Judge 也只略优于随机猜测。因此不可用未校准的 Judge 代替事实验证。

## 7. Agent 评测运行清单

```text
定义业务 claim 与关键失败
  → 冻结任务、环境、工具和预算
  → 在干净环境中对每个 case 运行 N 次
  → 先执行 outcome verifier 与 policy gate
  → 对开放式部分运行已校准 Judge
  → 处理分歧、低置信和高风险人工仲裁
  → 按任务桶报告成功率、pass^k、违规、成本与延迟
  → 在 CI 中比较回归；线上抽样并将失败回灌任务集
```

## 8. 参考资料

- [Zheng et al., Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena](https://arxiv.org/abs/2306.05685)
- [JudgeBench: A Benchmark for Evaluating LLM-based Judges](https://arxiv.org/abs/2410.12784)
- [τ-bench: Tool-Agent-User Interaction](https://arxiv.org/abs/2406.12045)
- [WebArena: A Realistic Web Environment](https://arxiv.org/abs/2307.13854)
- [OSWorld: Open-Ended Computer Tasks](https://arxiv.org/abs/2404.07972)
- [SWE-bench: Real-World GitHub Issues](https://arxiv.org/abs/2310.06770)
- [Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
