## Agent Eval 方法论一页报告

基于截至 **2026-05-30** 的联网调研，以及前两篇内部整理文档，我的判断是：

**Agent Eval 已经形成了“事实上的工程方法论”，但还没有形成统一的行业标准。**

这里的“已形成”，指的是 **Meta、Anthropic、OpenAI** 在公开博客 / 文档里的做法已经明显收敛；这里的“未统一”，指的是 **benchmark、harness、预算、有效性检查** 仍然高度依赖具体任务与组织目标。

## 一、已经形成的共识

### 1. 评测对象已经从“模型回答”变成“完整 agent 系统”

Anthropic 在 **2026-01-09** 的《Demystifying evals for AI agents》里，把 task、trial、grader、transcript、outcome、evaluation harness、agent harness 都拆开定义，明确评的是 **模型 + scaffold + 工具 + 环境** 的整体。OpenAI 在 agent eval 文档里也把重点放在 **traces、tool calls、handoffs、guardrails**。Meta 在 ARE 里进一步把 **rules、tools、content、verifiers、environment** 做成统一抽象。([Anthropic][1], [OpenAI Agent Evals][2], [Meta ARE][3])

### 2. 方法论起点不再是通用 benchmark，而是“业务 claim + 上下文任务”

OpenAI 在 **2025-11-21** 的《How evals drive the next chapter in AI for businesses》明确区分 **frontier evals** 和 **contextual evals**，强调企业需要围绕自己的 workflow 做上下文化评测。Anthropic则建议从 **手工测试、bug tracker、support queue** 直接抽任务。Meta 也在 Dynabench 和 ARE 里强调 **meaningful tasks** 和 **real-world applicability**。([OpenAI Business Evals][4], [Anthropic][5], [Meta Dynabench][6])

### 3. “环境与 harness”已经被视为评测结果的一部分

这是最近一年最清晰的共识之一。OpenAI 在 **2026-05-29** 的《A shared playbook for trustworthy third party evaluations》明确写出：**harness choices and validity checks are part of the evaluation result**，报告里应写清楚 claim、tested system、budget、elicitation methods、validity checks。Anthropic强调每次 trial 要在 **干净、隔离、稳定的环境** 中运行。Meta 的 ARE 则直接把 benchmark 做成环境平台，而不是只做题库。([OpenAI Playbook][7], [Anthropic][8], [Meta ARE][3])

### 4. 评分体系正在收敛到“三层混合”

当前主流不是单押一个总分，而是混合三层：

1. **确定性 / 可执行评分**：例如 unit tests、state checks、SQL/result checks。
2. **LLM-as-a-judge**：用于开放式质量、轨迹合理性、沟通质量。
3. **人工校准**：用于校验 rubric、纠正 judge 漂移、处理高风险样本。

Anthropic明确建议 **deterministic where possible, LLM graders where necessary, humans for validation**，并强调不要过度执着于 rigid tool path。OpenAI 也强调 human feedback 要持续校准 automated scoring；其内部 data agent 则用 **golden SQL + result comparison + grader** 做混合判分。([Anthropic][9], [OpenAI Best Practices][10], [OpenAI Data Agent][11])

### 5. Eval 已从“验收动作”变成“持续开发闭环”

OpenAI 文档直接把流程写成：**define objective -> collect dataset -> define metrics -> run/compare -> continuously evaluate**。Anthropic则更进一步，明确提出 **eval-driven development**，包括早期从 **20-50 条真实失败样本** 起步、持续读 transcripts、监控 benchmark saturation、让产品团队持续贡献任务。Meta Dynabench 的思想也说明 benchmark 本身需要持续迭代，否则很快饱和。([OpenAI Best Practices][10], [Anthropic][12], [Meta Dynabench][6])

## 二、还没有统一的地方

### 1. 还没有统一的 agent 安全 benchmark 标准

Anthropic 在 **2026-04-09** 的《Trustworthy agents in practice》明确说，目前还没有严谨、标准化、独立验证的方式来统一比较 agent 对 **prompt injection** 或 **uncertainty surfacing** 的能力。([Anthropic Trustworthy Agents][13])

### 2. 同一 benchmark，结果会被 harness 和预算显著改变

OpenAI 最新 playbook 把这个问题说得很直白：不同 harness、tool access、retry、context compaction、token budget，会显著改变测到的能力上界；因此“分数”必须连同 **budget / harness / elicitation** 一起解释。([OpenAI Playbook][7])

### 3. benchmark 饱和、污染、伪高分仍是现实问题

Anthropic提醒 capability eval 会饱和；Meta Dynabench 专门为 **benchmark saturation** 设计动态循环；Meta 也单独研究了 **benchmark contamination** 检测。说明行业已知道问题，但还没有彻底统一的解决方案。([Anthropic][12], [Meta Dynabench][6], [Meta Contamination][14])

## 三、可以落地的内部结论

如果把这些公开方法论压成一句内部执行原则，我建议写成：

```text
先定义业务 claim，
再构造真实任务与稳定环境，
先看 trace 再看总分，
优先用可执行 verifier，
必要时用 LLM judge + 人工校准，
并把 harness / budget / validity checks 一起写进结果。
```

所以，答案不是“行业还没有方法论”，而是：

**方法论已经形成，且已经从“比模型”升级为“比系统、比环境、比验证链路”；真正还没完全标准化的，是跨组织共享 benchmark 与结果解释规范。**

[1]: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents "Demystifying evals for AI agents"
[2]: https://developers.openai.com/api/docs/guides/agent-evals "Evaluate agent workflows | OpenAI API"
[3]: https://ai.meta.com/research/publications/are-scaling-up-agent-environments-and-evaluations/ "ARE: scaling up agent environments and evaluations"
[4]: https://openai.com/index/evals-drive-next-chapter-of-ai/ "How evals drive the next chapter in AI for businesses"
[5]: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents "Demystifying evals for AI agents"
[6]: https://ai.meta.com/blog/dynabench-rethinking-ai-benchmarking/ "Introducing Dynabench: Rethinking the way we benchmark AI"
[7]: https://openai.com/index/trustworthy-third-party-evaluations-foundations/ "A shared playbook for trustworthy third party evaluations"
[8]: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents "Demystifying evals for AI agents"
[9]: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents "Demystifying evals for AI agents"
[10]: https://developers.openai.com/api/docs/guides/evaluation-best-practices "Evaluation best practices | OpenAI API"
[11]: https://openai.com/index/inside-our-in-house-data-agent/ "Inside OpenAI’s in-house data agent"
[12]: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents "Demystifying evals for AI agents"
[13]: https://www.anthropic.com/research/trustworthy-agents "Trustworthy agents in practice"
[14]: https://ai.meta.com/research/publications/detecting-benchmark-detection-through-watermarking/ "Detecting Benchmark Detection Through Watermarking"
