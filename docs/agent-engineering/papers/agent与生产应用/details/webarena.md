# WebArena

## 来源

- arXiv：https://arxiv.org/abs/2307.13854
- 项目：https://github.com/web-arena-x/webarena

## 结论

WebArena 以可自托管、可重置的网站环境和程序化验证器评估浏览器 Agent 的开放式任务完成能力，其可复现性依赖站点部署与环境重置。

## 问题与设定

它不是访问开放互联网，而是在自托管真实网站环境中让浏览器 Agent 完成开放式任务，以便控制页面内容和流程并复现实验。

## 核心基准设计

典型结构为自托管网站、统一 action space、程序化 task config、任务后环境 reset 和执行式 verifier。官方 README 说明，为正确评测需要自行搭建 WebArena sites；评完 812 examples 后还要将环境重置到初始状态。其 web navigation 基础设施也已由 AgentLab / BrowserGym 增强，用于并行实验、统一 benchmark 集成和统一 leaderboard。

## 评估内容与使用方式

部署站点后，将 Agent 接入统一动作接口执行任务，再由程序化验证器检查结果；完成一轮评测后重置环境。它适用于浏览器中的任务完成、网页状态处理和开放式流程执行评估。

## 局限与边界

- 需要自行搭建自托管站点。
- 环境重置是正确复现的必要条件。
- canonical implementation 与增强基础设施并存，使用结果时应说明所用基础设施与版本。
