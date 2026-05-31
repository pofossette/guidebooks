# guidebooks

基于 MkDocs Material 的个人文档站，当前内容按主题分为：

- `docs/learning-path/`：学习方向、技术路线与基础概念
- `docs/agent-engineering/`：AI Agent 系统设计、记忆、RAG、评测与演化
- `docs/ai-coding/`：Coding Agent、开发工作流与工程方法
- `docs/project/`：具体项目调研文档，含两个保留原位的 submodule
- `docs/algo/`：算法笔记
- `docs/drafts/`：待整理草稿与写作提示

## Quick Start

```bash
uv sync
uv run mkdocs serve
```

默认地址：`http://0.0.0.0:8000`

## Build

```bash
uv run mkdocs build
```

## Notes

- 站点导航由 `awesome-pages` 插件和各目录下的 `.pages` 文件控制
- `docs/project/archlinux-missionary/_repo` 与 `docs/project/trapmap/_repo` 是 submodule，不应移动
- 本次结构重点区分了“构建 Agent 系统”和“使用 Agent 做开发”两类内容
