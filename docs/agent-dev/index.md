# Agent 开发专题

这一部分聚焦 AI Agent 工程化实践，内容已经自然分成几条主线：

- `claude-code-learning/`：Claude Code 与同类编码 Agent 的机制、上下文与工具系统
- `memory-system/`：长期记忆、压缩、RAG 结合方式与相关项目审计
- `rag/`：RAG 基础、分块、召回优化与图结构检索
- `eval/`：Agent 与 RAG 的评测思路
- `workflow/`：编码工作流与任务执行方法
- `search&recommend/`：搜索与推荐相关个别专题
- `self-evolve/`：Agent 自我演化相关记录

## 推荐阅读顺序

1. 先看 `claude-code-learning/` 建立对编码 Agent 的工作方式认知
2. 再读 `memory-system/` 与 `rag/`，理解上下文、记忆与检索如何协同
3. 然后进入 `eval/` 与 `workflow/`，补齐评测与执行方法
4. 最后按需浏览目录根部的综合笔记

## 目录说明

- 根目录下的若干 `.md` 更像跨主题专题，暂不强行拆散
- 后续如果篇幅继续增长，适合把根目录文件继续拆到 `architecture/`、`tooling/`、`patterns/` 等子类
