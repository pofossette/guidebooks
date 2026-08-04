# ARES: An Automated Evaluation Framework for Retrieval-Augmented Generation Systems

## 来源

- 论文：[arXiv 2311.09476](https://arxiv.org/abs/2311.09476)
- 本地综述：[RAG 评测](../../../eval/rag.md#4-常用评测框架)

## 结论

ARES 以合成训练数据和少量人工标注降低 RAG 自动评估成本，并将评估目标拆为 context relevance、answer faithfulness 与 answer relevance 三项。

## 问题与设定

RAG 评测不能只判断最终回答“像不像”，还需要区分检索到的上下文是否相关、回答是否忠实于上下文、以及回答是否与问题相关。ARES 面向这一自动化 RAG 评估设定。

## 核心方法

1. 用合成训练数据构建自动评估所需的训练材料。
2. 结合少量人工标注降低评估成本。
3. 使用轻量评估器分别评估 context relevance、answer faithfulness、answer relevance。

## 实验/评估与使用方式

可对每条 RAG 样本提供 question、retrieved contexts 和 answer，并分别检查三项指标。该框架适用于 RAG 离线评测或实验中的自动化质量比较；在没有 gold contexts 或 ground-truth answer 时，本地 RAG 综述也将 LLM-as-judge 作为评估上述相关性与忠实度指标的可用方式。

## 局限与边界

- 三项指标覆盖检索上下文相关性、回答忠实性和回答相关性，不等同于完整的检索排序或最终答案正确性评估。
- 合成数据与少量人工标注旨在控制成本，评估结论仍应结合业务数据和人工仲裁校验。
- ARES 聚焦 RAG 自动评估，不能替代 Agent 工具调用、浏览器或环境状态类 benchmark。
