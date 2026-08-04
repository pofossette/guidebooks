# Automatic Prompt Optimization with "Gradient Descent" and Beam Search

## 来源

- 论文：[arXiv 2305.03495](https://arxiv.org/abs/2305.03495)
- 本地综述：[Agent Self-Evolve 论文综述](../../../self-evolve/论文综述.md#42-automatic-prompt-optimization-with-gradient-descent-and-beam-search)

## 结论

APO 将错误案例产生的自然语言批评视为 textual gradient，再以候选搜索和评估保留更优 prompt。它表明在没有数值梯度的场景中，文本反馈也可以组织成迭代优化信号。

## 问题与设定

人工 prompt 调整需要反复试错，成本高且质量容易因撰写者而波动。APO 的设定是：给定当前 prompt 和一小批训练样本，自动根据错误结果改写 prompt，并通过候选评估决定下一轮版本。

## 核心方法

1. 用当前 prompt 在 minibatch 上执行，收集错误案例。
2. 让 LLM 对错误写出自然语言批评，指出指令中的模糊、遗漏或误导之处；该批评即 textual gradient。
3. 让 LLM 沿与批评相反的语义方向改写 prompt，例如补充更具体的定义或类别判别规则。
4. 用 beam search 保留多条候选改写路径，并以 bandit selection 将评估预算集中到更有希望的候选。

## 实验/评估与使用方式

论文在三个 benchmark NLP 任务和一个 jailbreak detection 任务上评测 APO。当地综述记录，其相对初始 prompt 的代表性性能提升最高可达 31%。实际使用时，可将错误样本、文本批评、候选改写和评估结果组成闭环，持续维护任务 prompt。

## 局限与边界

- 该方法的更新与候选质量依赖模型能否从错误案例写出有用批评。
- 候选搜索与评估需要额外预算；beam search 和 bandit selection 是为此设置的搜索与预算分配机制。
- 结论来自 NLP 与 jailbreak detection 的评测设定，不能据此直接推出对其他 Agent 任务或环境的效果。
