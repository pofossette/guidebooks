# PersonaMem

## 来源

- 项目：https://github.com/bowen-upenn/PersonaMem

## 结论

PersonaMem 将动态用户画像纳入长期记忆评测，要求回应既与历史事实一致，也体现对用户 persona 的理解。

## 问题与设定

它面向 dynamic user profiling 和 personalized responses，评估 Agent 能否从长期互动中建立变化的用户画像并据此回答当前问题。

## 核心基准设计

典型流程为：从历史对话推断用户偏好或 persona，生成当前问题的回应，再检查回应是否同时正确且符合用户画像。相较普通记忆问答，它增加了 persona 一致性这一层。

## 评估内容与使用方式

给系统提供长期对话历史并要求回答或生成个性化回应，评估其是否能保持对用户身份、偏好和变化的理解。它适合评估个性化 memory layer。

## 局限与边界

- 不直接评估真实工具调用、浏览器或桌面操作。
- 评分不仅是事实正确性，还涉及是否符合 persona；这与只验证环境状态的 benchmark 不同。
- 它聚焦长期个性化互动，不能代表通用 Agent 的完整能力。
