# OSWorld

## 来源

- arXiv：https://arxiv.org/abs/2404.07972
- 项目：https://github.com/xlang-ai/OSWorld

## 结论

OSWorld 在真实计算机环境中评估多模态 Agent 的开放任务执行，覆盖 GUI 与跨应用工作流，但虚拟化、重置和版本使其运行与比较成本较高。

## 问题与设定

它基于真实 web 和 desktop app，在真实计算机环境里评估 open-ended task；评测需要 VMware、Fusion 等虚拟化环境。

## 核心基准设计

实现重点包括虚拟机镜像、桌面环境状态管理、多应用工作流，以及 GUI action 和 observation loop。2025-07-28 的更新引入 OSWorld-Verified，修复了多项 benchmark signal 和任务问题。

## 评估内容与使用方式

在虚拟化的真实桌面环境中运行待测多模态 Agent，观察其 GUI 操作、跨应用流程和开放任务执行表现。报告结果时应注明 benchmark 版本，并只在相同版本内比较。

## 局限与边界

- 运行成本高，环境搭建重。
- 并发与环境重置复杂。
- 分数高度依赖 benchmark 版本；OSWorld-Verified 的结果不能与其他版本直接比较。
