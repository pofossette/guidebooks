# SkillX

## 来源

- 论文：[arXiv 2604.04804](https://arxiv.org/abs/2604.04804)，v2，2026-04-19，进行中。
- 本库综述：[Agent Self-Evolve 论文综述](../../../self-evolve/论文综述.md)。

## 结论

SkillX 自动构建可插拔、可迁移的分层 Skill Knowledge Base（SkillKB），使强 Agent 的经验可被其他 base agent 复用。综述报告它在 AppWorld、BFCL-v3 与 tau^2-Bench 上均有增益。

## 问题与设定

论文针对单体学习的重复探索、相似经验反复总结和泛化不足。它将强 Agent 的成功轨迹、执行反馈和探索结果沉淀为外置 SkillKB，再注入其他 Agent 使用。

## 核心方法

- 多层技能设计，将经验组织为分层、轻量、可检索的 Skill。
- 迭代式技能精炼，用执行反馈更新既有资产。
- 探索式技能扩展，补齐 SkillKB 覆盖。
- SkillKB 可一次性注入不同 base agent，作为模型参数外的技能层。

## 实验/评估与使用方式

论文使用 GLM-4.6 构建 SkillKB，并在 AppWorld、BFCL-v3、tau^2-Bench 上评估注入其他 base agent 的效果。对 Qwen3-32B，BFCL-v3 `Avg@4` 由 53.67 提升至 63.67，AppWorld `Avg@4` 由 27.68 提升至 35.12。

可由较强的构建 Agent 离线或迭代产生 SkillKB，再为多个目标 Agent 提供检索与注入。该模式适合多模型、多 Agent 共用技能层，而非仅优化一条在线轨迹。

## 局限与边界

- 基准限于 AppWorld、BFCL-v3、tau^2-Bench，不能直接外推到其他工具和分布。
- 质量受构建 Agent、成功轨迹与探索反馈影响；来源未给出跨领域通用的库规模或检索参数。
- 外置 SkillKB 要求目标 Agent 的调用方式与 Skill 表示兼容。
