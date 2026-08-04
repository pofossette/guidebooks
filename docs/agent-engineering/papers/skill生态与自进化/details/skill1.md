# Skill1

## 来源

- 论文：[arXiv 2605.06130](https://arxiv.org/abs/2605.06130)，v3，2026-05-12。
- 本库综述：[Agent Self-Evolve 论文综述](../../../self-evolve/论文综述.md)。

## 结论

Skill1 将 Skill 选择、使用和从轨迹中的蒸馏置于同一个强化学习目标，避免分开优化时的演化方向不一致。综述报告它在 ALFWorld 与 WebShop 上优于此前的 skill-based 与 RL baseline。

## 问题与设定

带 Skill 库的 Agent 需要检索或选择 Skill、条件化使用 Skill 解题、再从新轨迹提炼 Skill。现有工作常分别优化三环节，可能使选择策略、使用行为与蒸馏方向脱节。论文使用统一任务结果奖励来训练这个闭环。

## 核心方法

- 训练统一策略生成查询，搜索 Skill 库。
- 对候选 Skill 重新排序，并条件化使用 Skill 完成任务。
- 从新轨迹蒸馏 Skill，回写到演化流程。
- 奖励归因将低频趋势分给技能选择，将高频波动分给技能蒸馏。

## 实验/评估与使用方式

论文在 ALFWorld 和 WebShop 上比较 Skill1 与此前 skill-based baseline、RL baseline；综述结论为 Skill1 更优，且消去任一种 credit signal 都会削弱效果。来源未给出可在本页复述的具体分数。

使用时，将检索、排序、条件化执行和蒸馏视为同一训练闭环，并保留不同时间尺度的 credit signal。它面向可用任务结果奖励进行训练的环境。

## 局限与边界

- 已报告评估集中在 ALFWorld 与 WebShop，不能视为所有工具或开放环境的保证。
- 方法依赖统一任务奖励及归因设计；来源未给出脱离该训练设定的独立效果。
- 来源未报告可供本页引用的具体数值，因此不对提升幅度作推断。
