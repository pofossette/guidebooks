# EverMemBench: Benchmarking Long-Term Interactive Memory in Large Language Models

## 来源

- 论文：[arXiv 2602.01313](https://arxiv.org/abs/2602.01313)
- 本地综述：[Agent 评测 benchmark](../../../eval/agent-eval-benchmarks.md#4-evermembencheveros-自己的三层记忆评测)

## 结论

EverMemBench 将长期交互记忆拆为事实回忆、应用记忆和个性化泛化三层，评估的不只是能否找回答案，也包括能否基于历史推理并维持稳定的人设理解与生成风格。

## 问题与设定

它属于长程记忆与人设记忆型 benchmark：给系统提供长历史、多 session、时间演化的互动内容，再提出问题或生成任务。该类评测关注系统能否记住、检索、推理并完成个性化生成，而非操作外部工具。

## 核心方法

1. 使用长期交互历史作为记忆输入。
2. 分层评估 Factual Recall、Applied Memory、Personalization Generalization。
3. 在回答正确性之外，检查证据检索或 persona 一致性。
4. 纳入 multi-person group chat、multi-role / multi-group / cross-context 与 temporal persona drift 等互动复杂性。

## 实验/评估与使用方式

评测时将长历史输入 memory system 或模型，随后提出问题或生成任务；结果可从回答是否正确、是否能结合历史推理、是否维持 persona 理解与风格等维度判断。它适合评估长期记忆或个性化 memory layer；本地 benchmark 综述也将其列为 memory agent 的推荐覆盖项之一。

## 局限与边界

- 不直接测真实工具调用、浏览器或桌面操作。
- 许多此类评测结果仍依赖 answer judge，而非环境状态验证。
- 它聚焦长期交互记忆与个性化，不能代表通用 Agent 的完整能力。
