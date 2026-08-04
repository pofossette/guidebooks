# MUSE-Autoskill

## 来源

- 论文：[arXiv 2605.27366](https://arxiv.org/abs/2605.27366)，v1，2026-05-26，working in progress。
- 本库专文：[MUSE-Autoskill](../../../self-evolve/MUSE-Autoskill.md)。
- 本库综述：[Agent Self-Evolve 论文综述](../../../self-evolve/论文综述.md)。

## 结论

MUSE 将 Skill 定义为可创建、记忆、治理、测试和修补的长期资产，而非一次性提示词。论文显示成功轨迹可沉淀为可复用、可迁移的 Skill，但首次成功率仍是其生成覆盖率的约束。

## 问题与设定

现有系统常只回答“有没有 Skill”，却没有解决 Skill 如何在运行中持续演化：创建脱离上下文、缺少技能级记忆和验证、长任务难回放与归因。MUSE 让 Agent 在运行中创建或选择 Skill，再将经过测试的资产写入 Skill Bank。

## 核心方法

- 五段生命周期：`Creation`、`Memory`、`Management`、`Evaluation`、`Refinement`。
- Skill 目录包含 `SKILL.md`、`scripts/`、`resources/`、`tests/` 和记录局部运行经验的 `.memory.md`。
- Skill Bank 支持选择、合并、更新和遗忘。
- 准入回路为 `create -> test -> update_skill -> test -> register`；失败用错误日志与轨迹修补。
- 长任务用 `Plan / Action / Observation`、DAG 持久化和分层压缩处理历史。

## 实验/评估与使用方式

在 SkillsBench 的 51 个任务上，使用人工 Skill 时 MUSE 由 53.19% 提升至 68.40%；成功为 35/51 个任务生成 Skill，覆盖率约 68.6%。仅看这 35 个任务，Phase 2 为 87.94%；迁移给 Hermes 时结果由 47.89% 提升至 58.40%。

应将 Skill 作为带测试和局部记忆的目录资产，测试通过才入库，运行失败则修补后重验。单次生成约 383K tokens、164s；论文估计复用约三次可摊平成本，适合重复任务。

## 局限与边界

- 自动生成依赖先取得成功轨迹，论文覆盖率为 68.6%。
- 单条成功轨迹可能固化任务特定假设；`hvac-control` 出现过生成 Skill 弱于基线的回归。
- 仅评估 SkillsBench 94 个任务中的 51 个；跨 Agent 迁移只验证 MUSE 到 Hermes，且使用 GPT-5.5 backbone。
