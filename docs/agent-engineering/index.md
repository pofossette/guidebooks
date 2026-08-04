# Agent 工程

这一栏只讨论“怎么把 Agent 系统做出来”，不再混放 Coding Agent 使用方法。现在按下面六条主线组织：

- `system-design/`：系统设计、工具描述、兼容 API、多 Agent 架构与记忆/缓存策略
- `memory-system/`：长期记忆、压缩、RAG 结合方式与相关项目审计
- `rag/`：RAG 基础、分块、召回优化与图结构检索
- `eval/`：Agent 与 RAG 的评测方法
- `recommendation-systems/`：搜索、推荐与内容理解的系统案例
- `self-evolve/`：Agent 自我演化相关记录
- `papers/`：按主题整理的论文索引，链接到已有逐篇详述
- `vendor-updates/`：Anthropic、OpenAI、Google、Meta 等官方博客的近期 AI / agent 动态速记

## 推荐阅读顺序

1. 先看 `system-design/`，建立 Agent 系统的整体骨架
2. 再读 `memory-system/` 与 `rag/`，理解上下文、记忆与检索如何协同
3. 然后进入 `eval/`，补齐离线评测与线上质量判断
4. 最后按需浏览 `recommendation-systems/` 和 `self-evolve/`

## 目录说明

- Coding Agent 机制与开发工作流已经迁移到 [AI 编码工作流](../ai-coding/index.md)
- 系统设计类文档单独收拢到 `system-design/`，不再和其他专题混在根目录
- 搜索/推荐专题单独收拢到 `recommendation-systems/`，避免符号化命名
