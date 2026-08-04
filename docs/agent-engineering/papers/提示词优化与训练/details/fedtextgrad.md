# Can Textual Gradient Work in Federated Learning?

## 来源

- 论文：[arXiv 2502.19980](https://arxiv.org/abs/2502.19980)
- 本地综述：[Agent Self-Evolve 论文综述](../../../self-evolve/论文综述.md#43-can-textual-gradient-work-in-federated-learning)

## 结论

FedTextGrad 说明 textual gradient 可以进入联邦场景，但服务器端的文本聚合是关键瓶颈。客户端本地优化有效不等于公共 prompt 能无损汇总，信息保真需要被作为主要问题处理。

## 问题与设定

既有 textual gradient 方法通常假定数据和 prompt 优化都在单机进行。联邦学习中，数据分散在客户端且不能直接上传原始数据；传统数值梯度可做参数平均，而文本更新需要形成可用的服务器聚合结果。

## 核心方法

1. 每个客户端用本地数据对 prompt 做 textual gradient 优化。
2. 客户端上传本地优化后的 prompt，服务器进行文本汇总而非数值平均。
3. 为减轻直接摘要压缩掉客户端特有重要修正的风险，服务器摘要提示加入更明确引导，并引入 Uniform Information Density 思路以保留高信息密度内容。
4. 论文同时考察本地更新步数等训练因素对结果的影响。

## 实验/评估与使用方式

论文实验确认 textual gradient 能在联邦设定中工作，并指出本地更新步数等设置会影响结果。它适用于数据留在多客户端、本地分别产生 prompt 更新、再由服务器维护公共 prompt 的场景；聚合后应评估是否保留了各客户端的重要修正规则。

## 局限与边界

- 文本更新不能像向量一样直接求平均，服务器汇总可能丢失关键信息。
- 聚合质量与本地训练设置都会影响结果，因此不是将单机 prompt 优化直接套入联邦流程即可。
- 本地材料仅支持其在联邦 prompt 优化实验设定中的结论，未覆盖其他分布式 Agent 组件的聚合效果。
