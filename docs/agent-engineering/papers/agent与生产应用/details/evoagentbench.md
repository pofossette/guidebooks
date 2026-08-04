# EvoAgentBench

## 来源

- 项目入口：https://github.com/EverMind-AI/EverOS

## 结论

EvoAgentBench 面向长期成长与自演化，重点检验能力是否在持续交互中演进，而不是给出通用浏览器、桌面或代码 Agent 的总分。

## 问题与设定

它关注 Agent 的 self-evolution 和长期成长：经过持续交互后，能力是否产生可观察的变化。

## 核心基准设计

EverOS 将它列为独立的自演化能力评测组件，评价维度包括 longitudinal growth curves、transfer efficiency、error avoidance 和 skill-hit quality。

## 评估内容与使用方式

以持续交互下的能力变化为观察对象，报告成长曲线、迁移效率、错误规避及技能命中质量等指标，用于判断系统的自演化表现。

## 局限与边界

- 它衡量的是长期成长方向，不是通用 Agent 能力的全集。
- EverOS 当前公开展示的核心分数主要仍在长期记忆线，不能据此推断浏览器、电脑操作或代码修复能力。
- 结果应与工具调用、浏览器或 GUI、代码修复等专项 benchmark 结合解读。
