# Task 5 报告

## 结果

- 已完成比较页收束：
  - `docs/ai-coding/coding-agents/comparative/key-differences-and-design-choices.md`
  - `docs/ai-coding/coding-agents/comparative/what-to-copy-when-building-your-own-agent.md`
- 已完成证据区收束：
  - `docs/ai-coding/coding-agents/evidence/external-references-and-public-discussions.md`
  - `docs/ai-coding/coding-agents/source-evidence-and-code-index.md`
- 已补分区入口与阅读路径：
  - `docs/ai-coding/coding-agents/.pages`
  - `docs/ai-coding/coding-agents/comparative/index.md`
  - `docs/ai-coding/coding-agents/evidence/index.md`
  - `docs/ai-coding/coding-agents/overview-and-reading-map.md`

## 设计收口说明

- `key-differences-and-design-choices.md` 提供了三家总对比表，并把核心差异收束到系统主干、任务推进抽象、恢复/审批分层三个设计问题。
- `what-to-copy-when-building-your-own-agent.md` 明确区分了“值得抄”的稳定性来源与“不该照搬”的复杂度/抽象，并分别覆盖 `Claude Code`、`OpenCode`、`Codex`。
- `external-references-and-public-discussions.md` 按主题归档了官方文档、公开 issue/discussion 与经验/论文资料，不再是按厂商堆链接。
- `source-evidence-and-code-index.md` 已升级为整套专题的统一证据页，支持按设计问题和按系统两种入口。
- 阅读地图、比较分区和证据分区已接回导航，`source-evidence-and-code-index.md` 也已挂进根 `.pages`，不再是正文里孤立可达。

## 证据口径

- 每篇新页均同时覆盖 `Claude Code`、`OpenCode`、`Codex`。
- 每个关键判断均明确标注为：本地源码、官方文档、公开 issue / discussion、或推断。
- 对三家差异保持分层，不把 todo、continuation、goal 混写成同一种架构。

## 自检

- 运行：`rtk uv run mkdocs build -f /home/wunai/Disks/Data/my-project/guidebooks/mkdocs.yml`
- 结果：构建成功。
- 额外筛查：用 `rg` 过滤构建输出，已消除本次新增页面在 `coding-agents` 分区内产生的相对链接警告。

## 关注点

- 仓库中本来就存在大量与本任务无关的 MkDocs 警告，主要来自其他分区的未纳入 nav 页面、历史文档坏链和缺失 anchor；本次没有回收这些既有问题。
- 工作树本身已有其他未提交改动与未跟踪目录，例如 `docs/ai-coding/coding-agents/index.md`、`design-principles/`、`vendor-notes/` 等；本次未回退，也未改写它们的既有内容。
- 未创建 commit。
