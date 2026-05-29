# guidebooks

基于 MkDocs Material 的个人文档站，当前内容按主题分为：

- `docs/dev-study-path/`：学习路径与方向分析
- `docs/agent-dev/`：AI Agent 工程化、RAG、记忆系统、工作流
- `docs/project/`：具体项目调研文档，含两个保留原位的 submodule
- `docs/coding-strategy/`：编码与方法论
- `docs/algo/`：算法笔记

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
