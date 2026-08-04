# ToolSandbox

## 来源

- 项目：https://github.com/apple/ToolSandbox

## 结论

ToolSandbox 通过可快照和可复现的 world state 把工具调用放入有状态对话模拟器，适合评估工具选择、参数、顺序和状态依赖。

## 问题与设定

它不是给定历史后静态提问，而是让用户提出需求，Agent 选择工具，工具改变世界状态，用户可继续追问或澄清，最后依据状态和轨迹评分。

## 核心基准设计

内置 execution context 保存 tools、dialog history、world state 和每轮 state snapshot。world state 由 settings、contact book、messaging database、reminder database 等数据库构成，并显式区分 system、user、agent 和 execution environment 四种角色。

## 评估内容与使用方式

将 Agent 接入工具沙箱，在多轮对话中执行工具调用；可依据中间里程碑、最终状态和执行轨迹评分，并用于错误归因。它适合客服、运营和知识服务等有状态业务 Agent。

## 局限与边界

- 需要维护模拟环境。
- 用户模拟器会影响评测稳定性。
- 评分设计比静态 QA 更复杂。
