# CoEvolve: Training LLM Agents via Agent-Data Mutual Evolution

## 来源

- 论文：[arXiv 2604.15840](https://arxiv.org/abs/2604.15840)
- 本地综述：[Agent Self-Evolve 论文综述](../../../self-evolve/论文综述.md#410-coevolve-training-llm-agents-via-agent-data-mutual-evolution)

## 结论

CoEvolve 将 Agent 的 rollout 弱点转成可验证的新训练任务，让训练数据分布随 Agent 的当前能力演化。环境验证是数据进入训练集之前的关键门禁。

## 问题与设定

LLM Agent 的 RL 训练常依赖静态数据分布；人工专家轨迹昂贵，离线合成数据也不会跟随 Agent 能力变化。CoEvolve 在训练过程中根据当前 Agent 的 rollout 发现弱点，再生成并验证新任务，更新训练任务集。

## 核心方法

1. Agent 通过 GRPO 在当前任务集上训练。
2. 从 rollout 轨迹提取 forgetting、boundary、rare 三类弱点信号。
3. 用这些信号提示外部 LLM 回到环境重新探索，并将 action-observation triplets 抽象为新任务。
4. 新任务先经环境验证；通过后加入训练集，未通过则丢弃，随后进入下一轮训练。

## 实验/评估与使用方式

论文在 AppWorld 与 BFCL-V3 上评估三个 backbone，均报告稳定提升；本地综述记录的平均增益分别为 Qwen2.5-7B +19.43、Qwen3-4B +15.58、Qwen3-30B-A3B +18.14。与标准 GRPO 相比，Qwen3-4B 在 AppWorld TestN 从 28.57 提升到 35.71，在 BFCL 从 58.00 提升到 63.00。使用时可把 rollout 弱点信号作为任务再探索的输入，并将环境验证作为训练数据准入条件。

## 局限与边界

- 方法针对训练时的数据分布演化，而非推理时的 skill 或 prompt 自我进化。
- 环境验证不可省略：去除后，综述记录的 AppWorld 分数从 35.71 降至 27.38。
- 当前本地材料的实验范围是 AppWorld 与 BFCL-V3，不能据此概括所有 Agent 环境。
