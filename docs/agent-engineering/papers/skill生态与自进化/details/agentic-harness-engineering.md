# Agentic Harness Engineering

## 来源

- 论文：[arXiv 2604.25850](https://arxiv.org/abs/2604.25850)，v4，2026-05-18。
- 本库综述：[Agent Self-Evolve 论文综述](../../../self-evolve/论文综述.md)。

## 结论

Agentic Harness Engineering（AHE）将编码 Agent 的 Harness 视为主要优化对象，而非单个 system prompt。它先让组件、经验和决策可观测，再依据轨迹修改和验证 Harness；综述称主要增益来自 tools、middleware 与 long-term memory。

## 问题与设定

coding agent 的表现高度依赖 Harness，但工程通常靠人工设计。自动演化受异构动作空间、长轨迹和改动效果难归因的限制。论文将编码 Agent Harness 拆为可编辑、可审计组件，以任务轨迹和下一轮结果作为证据。

## 核心方法

- 建立组件可观测性、经验可观测性、决策可观测性三层机制。
- Harness 包含 system prompt、tool description、tool implementation、middleware、skill、sub-agent configuration、long-term memory 七类组件。
- 依据轨迹做可归因决策，对候选修改进行下一轮验证；综述将这一原则概括为可审计、可回滚、可 falsify。

## 实验/评估与使用方式

在 Terminal-Bench 2 上，10 轮 AHE 将 `pass@1` 从 69.7% 提升至 77.0%，高于人工设计的 Codex-CLI（71.9%）。论文还报告迁移到 SWE-bench-verified 和其他模型家族后仍有效；消融显示主要增益来自 tools、middleware、long-term memory，而非 system prompt。

实践中，先把 Harness 拆成可观测组件，记录每次编辑的轨迹证据和结果，在下一轮验证后才保留改动。这适用于可以执行、记录并回归验证的编码 Agent Harness。

## 局限与边界

- 证据重点是 coding-agent Harness，不能推断非代码任务有相同收益。
- 可归因和可回滚依赖完整观测与验证预算；长轨迹和异构动作空间仍是论文指出的困难。
- 10 轮 Terminal-Bench 2 的结果不保证任意轮数或任意组件编辑均有收益。
