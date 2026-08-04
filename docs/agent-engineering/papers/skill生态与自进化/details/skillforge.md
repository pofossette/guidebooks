# SkillForge

## 来源

- 论文：[arXiv 2604.08618](https://arxiv.org/abs/2604.08618)，v2，2026-04-29，SIGIR 2026 Industry Track。
- 本库综述：[Agent Self-Evolve 论文综述](../../../self-evolve/论文综述.md)。

## 结论

SkillForge 将真实生产支持的 bad case 变成领域 Skill 改进信号，重点是失败归因、聚合与最小修改。综述报告它在五个云技术支持场景持续提升 Strict CR。

## 问题与设定

通用 Skill creator 缺少企业私有知识、历史工单和真实工作流，冷启动质量不足；生产失败也缺少定向归因与修补的闭环。论文在云技术支持设定中使用历史工单、技术文档、工具说明和专家参考回复作为领域证据。

## 核心方法

- `Domain-Contextualized Skill Creator` 从领域材料生成 `Skill_v0`。
- `Failure Analyzer` 将 bad case 分为 `Knowledge`、`Tool`、`Clarification`、`Style` 四类。
- 先聚合系统性失败；`Skill Diagnostician` 再将其映射到 `SKILL.md` 和 `references/` 的具体章节。
- `Skill Optimizer` 做最小必要修改，提交为 `Skill_v_{n+1}`。

## 实验/评估与使用方式

评估来自某大型云厂商的五个场景、1,883 个匿名工单、3,737 个任务。`S_domain` 在全部场景优于 `S_generic`，平均 Strict CR 提升 4.3pp。三轮后，`S_manual`、`S_domain`、`S_generic` 分别累计提升 10.99pp、9.23pp、11.60pp；第三轮相对 legacy system 提升 13.76pp。

使用时，先按类型聚合线上失败，再定位 Skill 章节，进行小步版本化修改并验证。它尤其适用于有工单、文档和参考回复的领域支持闭环。

## 局限与边界

- 证据来自特定云技术支持场景，不能推断其他领域的同等提升。
- 初始 Skill 与失败归因依赖私有领域材料的可用性和质量。
- 来源仅报告三轮演化，未给出跨组织可直接复用的修补频率或阈值。
