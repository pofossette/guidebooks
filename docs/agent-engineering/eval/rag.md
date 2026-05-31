下面用“字符串流程图”把 **RAG 效果评测**讲清楚：评测通常不是只看最终答案，而是把 RAG 拆成 **检索质量 + 生成质量 + 端到端业务效果** 三层。

## 1. RAG 评测总流程图

```text
[准备评测集]
  ├─ 人工标注：question + ground_truth_answer + gold_docs
  ├─ 线上日志：真实用户问题 + 人工复核答案
  └─ 合成数据：从知识库自动生成问题/答案/证据

        ↓

[运行 RAG Pipeline]
  query
    ↓
  retriever 检索 Top-K 文档
    ↓
  reranker / filter / compression 可选
    ↓
  generator 基于 context 生成 answer
    ↓
  保存 trace: query、retrieved_context、answer、latency、cost

        ↓

[分层评测]
  ├─ 检索评测：有没有找对资料？
  │    ├─ Recall@K / Hit@K
  │    ├─ Precision@K
  │    ├─ MRR / nDCG
  │    └─ Context Relevance / Context Precision / Context Recall
  │
  ├─ 生成评测：答案是否可靠、有用？
  │    ├─ Faithfulness / Groundedness
  │    ├─ Answer Relevance
  │    ├─ Answer Correctness
  │    ├─ Semantic Similarity
  │    └─ 引用准确性 / 拒答正确性 / 安全合规
  │
  └─ 系统评测：上线是否好用？
       ├─ 延迟 P50/P95/P99
       ├─ 成本 / token 消耗
       ├─ 覆盖率 / 失败率
       ├─ 人工满意度
       └─ A/B test、线上反馈、回归测试

        ↓

[定位问题]
  ├─ 检索没召回 → 调 chunk、embedding、query rewrite、Top-K、hybrid search
  ├─ 召回了但排序差 → reranker、metadata filter、nDCG 优化
  ├─ 有资料但答错 → prompt、引用约束、模型、上下文压缩
  ├─ 答案幻觉 → faithfulness/groundedness、拒答策略
  └─ 成本/延迟高 → cache、batch、模型分层、Top-K 缩减

        ↓

[迭代优化 + 持续监控]
  离线基准集 → CI 回归 → 线上监控 → 人工抽检 → 数据集更新
```

## 2. 常见指标怎么理解

### A. 检索层指标：先问“资料找对了吗？”

| 指标                                           | 看什么              | 典型用途                 |
| -------------------------------------------- | ---------------- | -------------------- |
| **Recall@K / Hit@K**                         | Top-K 里是否包含正确文档  | 最重要的检索底线，没召回就不可能答对   |
| **Precision@K**                              | Top-K 里相关文档比例    | 控制噪声，避免无关 chunk 干扰生成 |
| **MRR**                                      | 第一个正确文档排得多靠前     | 问答场景常用               |
| **nDCG@K**                                   | 排序整体质量，越相关越靠前越好  | 多文档、多证据场景            |
| **Context Relevance / Contextual Relevancy** | 检索上下文是否与问题相关     | LLM-as-judge 常用      |
| **Context Recall**                           | 回答所需信息是否都在检索上下文里 | 判断“缺证据”问题            |
| **Context Precision**                        | 检索内容是否精准、少噪声     | 判断“塞了太多无关内容”问题       |

LlamaIndex 文档把评估分成 **Response Evaluation** 和 **Retrieval Evaluation**，其中检索评估可以使用 MRR、hit-rate、precision 等排序指标；响应评估则看正确性、语义相似度、忠实性、上下文相关性和答案相关性等。([LlamaIndex Python Documentation][1])

### B. 生成层指标：再问“答案写对了吗？”

| 指标                              | 看什么           | 说明              |
| ------------------------------- | ------------- | --------------- |
| **Faithfulness / Groundedness** | 答案是否能被检索上下文支持 | 主要衡量幻觉          |
| **Answer Relevance**            | 回答是否切题        | 防止答非所问          |
| **Answer Correctness**          | 与标准答案是否一致     | 需要 ground truth |
| **Semantic Similarity**         | 语义上是否接近参考答案   | 适合开放式问答         |
| **Citation Accuracy**           | 引用是否真的支持对应结论  | 企业知识库很重要        |
| **Refusal Accuracy**            | 知识库没答案时是否正确拒答 | 防止“硬编”          |

TruLens 的经典 **RAG Triad** 就是三件事：**Context Relevance、Groundedness、Answer Relevance**。它的思路是：检索内容要相关，答案要有上下文支撑，最终回答还要真正回答用户问题。([TruLens][2])

Ragas 也强调按 RAG 组件分开评估，提供 Faithfulness、Answer Relevancy、Context Recall、Context Precision、Context Utilization、Noise Sensitivity、Answer Correctness 等指标。([Ragas][3])

### C. 端到端业务指标：最后问“用户觉得有用吗？”

```text
业务可用性 = 正确率 + 可解释性 + 速度 + 成本 + 稳定性
```

常见包括：

| 指标                              | 说明                                 |
| ------------------------------- | ---------------------------------- |
| **Human Preference / Win Rate** | 人工对比 A/B 两个答案哪个更好                  |
| **Task Success Rate**           | 用户是否完成任务                           |
| **Deflection Rate**             | 客服/工单场景中是否减少人工介入                   |
| **Escalation Rate**             | 被转人工或失败的比例                         |
| **Latency P95/P99**             | 线上体验关键指标                           |
| **Cost per Query**              | 每次问答 token、embedding、rerank、LLM 成本 |
| **Regression Pass Rate**        | 新版本是否破坏旧问题表现                       |

## 3. 最常见的评测数据格式

一般一条样本长这样：

```json
{
  "question": "公司报销政策中，差旅住宿上限是多少？",
  "ground_truth_answer": "一线城市每晚上限为 X 元，其他城市为 Y 元。",
  "gold_contexts": [
    "报销政策第 3.2 节：住宿标准..."
  ],
  "retrieved_contexts": [
    "系统实际检索出来的 chunk 1",
    "系统实际检索出来的 chunk 2"
  ],
  "answer": "模型最终生成的回答",
  "metadata": {
    "domain": "finance",
    "difficulty": "medium",
    "expected_behavior": "answer_with_citation"
  }
}
```

有 **gold_contexts** 时，可以做 Recall@K、MRR、nDCG。
有 **ground_truth_answer** 时，可以做 correctness、semantic similarity。
只有 **question + retrieved_contexts + answer** 时，也能用 LLM-as-judge 做 faithfulness、answer relevance、context relevance。

## 4. 常用评测框架

| 框架                  | 适合场景                      | 特点                                                                        |
| ------------------- | ------------------------- | ------------------------------------------------------------------------- |
| **Ragas**           | RAG 离线评测、自动指标             | 指标覆盖全面，常用于 faithfulness、answer relevancy、context precision/recall         |
| **LangSmith**       | LangChain/RAG 应用追踪、数据集、评估 | 强在 trace、dataset、evaluator、实验对比                                           |
| **LlamaIndex Eval** | LlamaIndex RAG 项目         | 同时支持 response evaluation 和 retrieval evaluation                           |
| **DeepEval**        | 类似 PyTest 的 LLM/RAG 单元测试  | 适合 CI/CD，支持阈值、strict mode、原因解释                                            |
| **TruLens**         | RAG Triad、可解释观测           | 强调 context relevance、groundedness、answer relevance                        |
| **Arize Phoenix**   | 可观测性 + RAG trace + eval   | 适合调试线上 RAG 链路                                                             |
| **ARES**            | 自动化 RAG 评估研究/实验           | 使用合成数据和轻量 judge，评估 context relevance、answer faithfulness、answer relevance |

LangSmith 官方教程把典型 RAG 评估流程概括为三步：创建包含问题和期望答案的数据集、运行 RAG 应用、用评估器衡量答案相关性、答案准确性和检索质量；同时它的评估技术不限定 LangChain 框架。([LangChain 文档][4])

DeepEval 的 RAG 指南重点给出检索侧的 Contextual Precision、Contextual Recall、Contextual Relevancy，并支持阈值、strict mode、include_reason 以及任意 LLM 作为评估器。([DeepEval][5])

Phoenix 的思路是先通过 tracing 捕获 RAG pipeline 所需数据，例如输入、检索文档、链路 span，再用 LLM evals 量化检索增强生成系统质量。([Arize AI][6])

ARES 论文则把自动评测目标定义为三类：context relevance、answer faithfulness、answer relevance，并通过合成训练数据和少量人工标注来减少评测成本。([arXiv][7])

## 5. 一个实用的 RAG 评测落地模板

```text
阶段 1：先做最小评测集
  50~200 条高频真实问题
  每条标注：
    - 标准答案
    - 支撑文档/段落
    - 是否必须拒答
    - 难度和业务类别

阶段 2：拆分评测
  检索：
    - Recall@5 >= 90%
    - MRR / nDCG 看排序
    - Context Precision 看噪声
  生成：
    - Faithfulness >= 0.85
    - Answer Correctness >= 0.8
    - 引用准确率 >= 0.9
  系统：
    - P95 latency
    - cost/query
    - fallback rate

阶段 3：错误归因
  Case A: 没检索到正确文档
    → 优化 chunk、embedding、query rewrite、hybrid search
  Case B: 检索到了但排后面
    → 加 reranker
  Case C: 文档有证据但答错
    → 优化 prompt / model / context packing
  Case D: 无答案但硬答
    → 加 no-answer 检测和拒答评测

阶段 4：持续评测
  每次改索引、embedding、prompt、模型、reranker 都跑回归集
  线上日志抽样进入评测集
  人工复核低分样本
```

## 6. 指标选择建议

做 RAG 评测时，不建议只看一个总分。更合理的是：

```text
最低配：
  Context Recall + Faithfulness + Answer Relevance + 人工抽检

标准版：
  Recall@K + MRR/nDCG
  Context Precision / Context Relevance
  Faithfulness / Groundedness
  Answer Correctness
  Citation Accuracy
  Latency + Cost

企业生产版：
  离线基准集 + 在线 A/B
  Trace 级监控
  按业务域分桶
  CI 回归测试
  人工仲裁集
  安全/合规/拒答专项集
```

一句话总结：**RAG 评测的核心不是“模型回答像不像”，而是拆开看：检索是否找到了正确证据、生成是否忠实于证据、最终是否解决用户问题。**

[1]: https://llamaindex.openml.io/python/framework/module_guides/evaluating/ "Evaluating | LlamaIndex Python Documentation"
[2]: https://www.trulens.org/getting_started/core_concepts/rag_triad/ "⟁ RAG Triad -  TruLens"
[3]: https://docs.ragas.io/en/v0.1.21/concepts/metrics/ "Metrics | Ragas"
[4]: https://docs.langchain.com/langsmith/evaluate-rag-tutorial "Evaluate a RAG application - Docs by LangChain"
[5]: https://deepeval.com/guides/guides-rag-evaluation "RAG Evaluation | DeepEval by Confident AI - The LLM Evaluation Framework"
[6]: https://arize.com/docs/phoenix/cookbook/evaluation/evaluate-rag "Evaluate RAG - Phoenix"
[7]: https://arxiv.org/abs/2311.09476 "[2311.09476] ARES: An Automated Evaluation Framework for Retrieval-Augmented Generation Systems"
