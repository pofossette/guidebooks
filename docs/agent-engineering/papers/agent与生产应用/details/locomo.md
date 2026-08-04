# LoCoMo

## 来源

- 项目：https://github.com/snap-research/locomo

## 结论

LoCoMo 以超长对话及其问答、事件总结标注评估长期会话记忆，是 long-history benchmark，而不是可交互的工具沙箱。

## 问题与设定

基准发布 very long-term conversational data，由 10 段长对话构成；每段对话标注了 question answering 和 event summarization，对话本身还可用于 multimodal dialog generation。

## 核心基准设计

核心是长对话数据构造与多任务标注：将长历史提供给 memory system 或 model，再以 QA、总结和多模态生成作为评测出口。

## 评估内容与使用方式

把完整长对话喂给待测记忆系统或模型，提出问题或生成任务，再检查其问答、事件总结或多模态对话生成表现。它适合评估 memory layer 的长历史处理能力。

## 局限与边界

- 不直接测真实工具调用。
- 不直接测浏览器或 OS 操作。
- 结果侧重长历史中的回答与生成，不等同于有状态环境中的任务完成。
