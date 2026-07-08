### Task 5: 收束比较页、证据索引页与外部资料页

**Files:**
- Create: `docs/ai-coding/coding-agents/comparative/key-differences-and-design-choices.md`
- Create: `docs/ai-coding/coding-agents/comparative/what-to-copy-when-building-your-own-agent.md`
- Create: `docs/ai-coding/coding-agents/evidence/external-references-and-public-discussions.md`
- Modify: `docs/ai-coding/coding-agents/source-evidence-and-code-index.md`

**Interfaces:**
- Consumes: 前四个任务产出的专题结论、源码证据、官方文档与公开 issue
- Produces: 最终对比页、外部资料索引、统一证据页

- [ ] **Step 1: 输出一张三家对比总表**

```md
| 机制 | Claude Code | OpenCode | Codex |
|---|---|---|---|
```

- [ ] **Step 2: 写“自建 agent 应该抄什么、不该抄什么”**

```md
不要只抄 prompt；优先抄状态对象、审批边界、日志与恢复设计。
```

- [ ] **Step 3: 升级证据索引与外部资料页**

Run: `rg -n "检索日期|官方文档|issue|discussion|论文|源码" docs/ai-coding/coding-agents`
Expected: 每类证据都有清晰归档位置

- [ ] **Step 4: 最终检查导航、内部链接与重复叙述**

Run: `mkdocs build -f /home/wunai/Disks/Data/my-project/guidebooks/mkdocs.yml`
Expected: build 成功，无断链或明显导航错误
