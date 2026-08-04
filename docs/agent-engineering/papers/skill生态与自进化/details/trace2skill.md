# Trace2Skill

## 来源

- 论文：[arXiv 2603.25158](https://arxiv.org/abs/2603.25158)，v4，2026-04-27，进行中。
- 本库综述：[Agent Self-Evolve 论文综述](../../../self-evolve/论文综述.md)。

## 结论

Trace2Skill 先并行归纳大规模轨迹，再合并为统一 Skill，以避免顺序更新将局部经验过拟合成碎片。综述报告它在 spreadsheet、VisionQA、math reasoning 等域上优于顺序更新与 retrieval-based experience bank。

## 问题与设定

自动 Skill 生成可能只依赖模型参数知识而空泛，也可能因逐条轨迹在线更新而碎片化。论文把大量任务轨迹作为原材料，目标是提炼可迁移的综合 Skill 或技能目录。

## 核心方法

- 三阶段：轨迹生成、并行多 Agent 补丁提议、无冲突整合。
- `Deepening` 用于加深或完善既有 Skill；`Creation` 用于创建新 Skill。
- 通过并行分析和分层合并，先归纳经验，再形成技能成稿。

## 实验/评估与使用方式

评测覆盖 spreadsheet、VisionQA、math reasoning。综述报告，由 Qwen3.5-35B 演化出的 Skill 可将 Qwen3.5-122B 在 WikiTableQuestions 上的表现提高 57.65 个百分点；顺序 skill-bank 更新和 retrieval-based experience bank 均不如并行分析加分层合并稳定。

应积累一批轨迹后，对同主题轨迹并行提出局部补丁，再做冲突消解与合并；这不同于每次执行后立即重写技能库。

## 局限与边界

- 需要可批量收集与分析的轨迹，不适合只需一次即时响应的任务。
- 结论来自所列领域和 WikiTableQuestions，不能保证其他轨迹分布同样受益。
- 并行补丁和无冲突整合有额外协调成本；来源未报告通用批量大小或合并规则。
