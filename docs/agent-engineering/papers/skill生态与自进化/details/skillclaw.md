# SkillClaw

## 来源

- 论文：[arXiv 2604.08377](https://arxiv.org/abs/2604.08377)，v1，2026-04-09，进行中。
- 本库综述：[Agent Self-Evolve 论文综述](../../../self-evolve/论文综述.md)。

## 结论

SkillClaw 将 Skill 进化扩展为多用户共享的集体过程：日间积累会话证据，夜间聚合、验证并发布共享 Skill。综述报告它在 WildClawBench 的四个类别均有提升。

## 问题与设定

多个用户会反复遇到相似 workflow、工具调用和失败模式，但经验常被困在各自 session，无法形成共享改进。论文设定多个用户并发使用同一系统，由共享 Skill 仓库吸收经验证的跨用户经验。

## 核心方法

- 白天收集多用户 session trajectory。
- 夜间由 evolver 聚合跨用户证据。
- 对既有 Skill 做 refine，或补出新 Skill。
- 将候选 Skill 放入真实环境验证，通过后同步到共享仓库。

## 实验/评估与使用方式

在 WildClawBench 上，论文模拟八个并发用户、六天的 day-night 演化。用户侧部署结果为：Social Interaction 54.01% 至 60.34%，Search & Retrieval 22.73% 至 34.55%，Creative Synthesis 11.57% 至 21.80%，Safety & Alignment 24.00% 至 32.00%。

使用时可把会话收集与 Skill 发布分为两个阶段：先聚合可复现证据，再验证候选改动，最后同步到共享库。它面向多用户产品的共同经验沉淀，不是单 Agent 的即时反思机制。

## 局限与边界

- 评估为八个并发用户、六天的模拟运行，不能代表真实用户规模或长期表现。
- 跨用户聚合不构成正确性的充分证据，候选改动仍需要环境验证。
- 提升只按 WildClawBench 四类任务报告，来源没有其他应用场景的外推依据。
