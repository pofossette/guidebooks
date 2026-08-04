# tau-bench / tau3-bench

## 来源

- 论文：https://arxiv.org/abs/2406.12045
- 当前项目：https://github.com/sierra-research/tau2-bench
- 原项目：https://github.com/sierra-research/tau-bench

## 结论

tau-bench 及其继任 tau3-bench 用用户模拟器、领域 API 和业务规则评估有状态交互，运行和比较结果时必须明确采用的任务版本。

## 问题与设定

它模拟由 LLM 扮演的用户与拥有 API 工具及 policy guidelines 的语言 Agent 之间的动态对话：用户提出需求，Agent 调用工具改变状态，随后可能发生追问或澄清。

## 核心基准设计

关键组成包括用户模拟器、领域 API 工具和策略约束或业务规则，并依据环境状态和轨迹进行评分。当前公开说明位于 tau2-bench 仓库 README，其中说明老 tau-bench 任务版本已过时，应使用 tau3-bench；tau3-bench 扩展到 multimodal、knowledge-aware evaluation 和 voice full-duplex，并包含 75+ task fixes。

## 评估内容与使用方式

将 Agent 放入用户模拟器和业务 API 构成的多轮环境，检查其工具选择、参数、调用顺序、状态依赖以及对 policy guidelines 的遵守情况。结果应记录具体 benchmark 版本。

## 局限与边界

- 环境与任务会持续漂移，版本号是 benchmark 的一部分。
- 用户模拟器会影响稳定性。
- 其评分与环境维护均比静态问答复杂，不能只按单一总分比较不同版本。
