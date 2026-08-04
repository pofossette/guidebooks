# AgentBench

## 来源

- 项目：https://github.com/THUDM/AgentBench

## 结论

AgentBench 用统一 controller 将多个异构环境纳入同一套件，适合观察 Agent 的跨环境泛化能力，但子环境保真度与维护成本仍是结果解释的边界。

## 问题与设定

它评估的不是单一任务，而是 LLM-as-Agent 在多种 environment 中完成任务的能力；原始版本将 8 个环境纳入同一 suite。

## 核心基准设计

其结构是统一的 controller 或 runner 连接不同的 task worker 与 environment，例如 OS、数据库、知识图谱和网页环境，并汇总日志和 leaderboard。2025-10 的仓库更新还引入 AgentBench FC，强调 function-calling prompt 与更完整的容器化部署。

## 评估内容与使用方式

将待测 Agent 接入统一 runner，在各子环境执行任务，再以统一日志和排行榜汇总结果。它适用于横向比较不同 Agent 在异构世界中的表现，也可在其基础上再叠加更垂直的真实环境 benchmark。

## 局限与边界

- 不同子环境的 fidelity 不一定相同。
- 环境异构会提高 benchmark 的工程维护复杂度。
- 总分应结合各子环境的结果解释，不能替代垂直真实环境的专项评测。
