# Continual Harness

## 来源

- 论文：[arXiv 2605.09998](https://arxiv.org/abs/2605.09998)，v1，2026-05-11。
- 本库综述：[Agent Self-Evolve 论文综述](../../../self-evolve/论文综述.md)。

## 结论

Continual Harness 将 Harness 自演化放进具身 Agent 的单次长运行：系统不重置环境，而是交替行动并精炼提示词、子代理、Skill、记忆，再用教师重标注形成 online process-reward co-learning。

## 问题与设定

具身 Agent 缺少类似 Claude Code、OpenHands 的 Harness 视角；长时程、部分可观测环境中的常规 prompt optimization 往往依赖 episode reset。论文从最小环境接口出发，研究 Agent 在 ongoing run 中的在线适应。

## 核心方法

- 在单次运行中交替行动、精炼提示词、子代理、Skill 与记忆。
- 不依赖 episode reset，直接使用运行中的在线反馈修正 Harness。
- 将精炼后的 Harness 生成轨迹交由前沿教师模型重标注，形成 online process-reward co-learning。

## 实验/评估与使用方式

论文在 Pokemon Red 和 Pokemon Emerald 上从相同的最小接口出发评估。综述报告它明显降低 button-press cost，并追回大部分 hand-engineered expert harness 的差距；来源未给出可在本页复述的具体分数。

适合有持续环境状态且不能或不应频繁重置的 Agent：在运行中保留反馈，逐步更新多个 Harness 层面，并将后续轨迹用于教师重标注和过程奖励协同学习。

## 局限与边界

- 结果来自 Pokemon Red / Emerald，不能直接推断到编码、浏览器或一般工具 Agent。
- 在线修改多个 Harness 层面会增加归因难度；来源未给出每类修改的独立数值贡献。
- 教师重标注是其 co-learning 流程的一部分，实际可行性受教师模型和长运行轨迹成本约束。
