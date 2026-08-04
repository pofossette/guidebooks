# From Procedural Skills to Strategy Genes

## 来源

- 论文：[arXiv 2604.15097](https://arxiv.org/abs/2604.15097)，v1，2026-04-16，技术报告。
- 本库综述：[Agent Self-Evolve 论文综述](../../../self-evolve/论文综述.md)。

## 结论

论文主张把经验压缩为短小、结构化、可编辑的 Strategy Gene，使其作为测试时控制对象；综述报告这种表示比文档化、过程化的 Skill 更稳定。

## 问题与设定

传统经验复用常将经验写成长 Skill 文档，默认信息越完整越好。论文质疑其测试时控制效果：长文档对人可读，却未必是稳定的控制信号。它在执行中依据结果、失败历史和验证记录更新经验对象。

## 核心方法

- `Skill` 是说明书式、过程化经验包；`Gene` 是短小、控制导向策略对象。
- Gene 包括适用信号、策略摘要、执行策略、避免事项、可选约束和验证钩子等结构化字段。
- GEP 包含最小控制单元 `Gene`、带验证记录的任务级 `Capsule`、以及不可变 `Event` 演化日志。
- 回路为 `scan -> signal -> intent -> mutate -> validate -> solidify`。

## 实验/评估与使用方式

综述报告 4,590 次受控实验、45 个 scientific code-solving 场景。代表性长度为 Gene 约 230 tokens、Skill 约 2,500 tokens；将失败历史附着到 Gene 也优于附着到 Skill 或自由文本。在 CritPt 上，两套 gene-evolved 系统分别由 9.1% 提升至 18.57%、由 17.7% 提升至 27.14%。

使用时，可在任务前按信号选取或生成 Gene，执行后以验证记录和失败历史修订，只固化通过验证的版本。论文的证据面向测试时控制，而非将长篇知识文档一概替代。

## 局限与边界

- 已报告评估集中在 scientific code-solving 与 CritPt，不能直接推及所有 Agent 环境。
- 论文比较的是经验表示和测试时控制，不能单独证明任意长 Skill 都无效。
- Gene 的效果依赖适用信号和验证钩子质量；来源未给出跨场景固定字段或阈值。
