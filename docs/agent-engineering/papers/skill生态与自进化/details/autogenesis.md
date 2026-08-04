# Autogenesis: A Self-Evolving Agent Protocol

## 来源

- 论文：[arXiv 2604.15034](https://arxiv.org/abs/2604.15034)，v4，2026-05-19。
- 本库综述：[Agent Self-Evolve 论文综述](../../../self-evolve/论文综述.md)。

## 结论

Autogenesis 的贡献在协议层：它把 Prompt、Agent、Tool、Environment、Memory 统一为可演化资源，并要求版本、评估、提交与回滚，不绑定某种具体优化器。

## 问题与设定

现有 A2A、MCP 等协议对跨实体生命周期、上下文管理、版本追踪和安全更新接口规定不足，self-evolving 系统容易成为单体组合和脆弱 glue code。论文将异构资源和演化器置于统一协议下，将演化设为对异构状态空间的优化。

## 核心方法

- 提出两层 AGP：`RSPL`（Resource Substrate Protocol Layer）和 `SEPL`（Self-Evolution Protocol Layer）。
- RSPL 注册 Prompt、Agent、Tool、Environment、Memory 等协议资源。
- SEPL 解耦资源 substrate 与 optimizer，将演化形式化为异构状态空间优化。
- 典型 reflection optimizer 包含 `REFLECT`、`SELECT`、`IMPROVE`、`EVALUATE`、`COMMIT`。

## 实验/评估与使用方式

综述报告，论文在科学推理、GAIA/HLE 和代码 Agent benchmark 上均有提升；弱模型和困难任务的收益更大，Prompt 与 Solution 联合演化优于单独演化。GAIA Test 平均提升 12.61%，Level 3 提升 33.34%。

使用时，先把可修改对象注册成可版本化资源，再选择 reflection、TextGrad 或 RL 等演化器；变更经评估后提交，失败保留回滚路径。该框架用于协调异构资源演化，而非限定某个 Skill 生成算法。

## 局限与边界

- 它提供协议与演化抽象，实际收益仍取决于资源、优化器和评估门禁。
- 结果来自科学推理、GAIA/HLE 和代码 Agent benchmark，不能直接外推到其他运行环境。
- 协议化增加资源注册、版本和回滚的系统复杂度；来源未报告统一部署成本或固定安全策略。
