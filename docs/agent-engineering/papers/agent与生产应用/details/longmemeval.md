# LongMemEval

## 来源

- 项目：https://github.com/xiaowu0162/LongMemEval

## 结论

LongMemEval 用多 session、带时间戳的历史和明确的问题分类，系统检验长期记忆中的抽取、更新、时序推理与拒答能力。

## 问题与设定

它包含 500 个问题，覆盖 Information Extraction、Multi-Session Reasoning、Knowledge Updates、Temporal Reasoning 和 Abstention 五类长期记忆能力。

## 核心基准设计

官方采用 attribute-controlled pipeline 编排 coherent、extensible、timestamped chat history：先生成并拼接时间化历史，再在全部历史发生后提问。实现重点包括历史编排器、session 时间轴、问题分类体系和 answer verifier。

## 评估内容与使用方式

向 memory system 或 model 提供多 session 历史，并按五类问题提问，使用答案验证器检查结果。它适合定位系统在信息抽取、跨 session 推理、知识更新、时序判断和应拒答情形上的表现。

## 局限与边界

- 它不直接评估真实工具调用、浏览器或 OS 操作。
- 评测出口仍是历史后的问题回答，而非环境状态的最终验证。
- 结果应与任务执行型 benchmark 区分解读。
