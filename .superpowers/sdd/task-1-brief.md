### Task 1: 搭建专题目录、导航与阅读入口

**Files:**
- Create: `docs/ai-coding/coding-agents/design-principles/index.md`
- Create: `docs/ai-coding/coding-agents/overview-and-reading-map.md`
- Create: `docs/ai-coding/coding-agents/comparative/index.md`
- Create: `docs/ai-coding/coding-agents/evidence/index.md`
- Modify: `docs/ai-coding/coding-agents/.pages`
- Modify: `docs/ai-coding/coding-agents/index.md`

**Interfaces:**
- Consumes: 现有 `docs/ai-coding/coding-agents/` 页面与当前 `.pages` 导航
- Produces: 统一后的专题入口结构，供后续专题页挂载

- [ ] **Step 1: 设计新的专题导航结构**

```text
coding-agents/
  index.md
  overview-and-reading-map.md
  design-principles/
  comparative/
  evidence/
```

- [ ] **Step 2: 更新 `coding-agents/.pages` 以反映新导航**

Run: `sed -n '1,120p' docs/ai-coding/coding-agents/.pages`
Expected: 能看到新的 `nav` 结构包含 `overview-and-reading-map.md`、`design-principles`、`comparative`、`evidence`

- [ ] **Step 3: 改写 `coding-agents/index.md` 为新总览入口**

```md
# AI 编码 Agent 机制总览

这一组文档改为“设计原则主线 + 证据索引支撑”的结构。
```

- [ ] **Step 4: 创建阅读地图页与各分区索引页**

```md
# 阅读地图

按“先总览、再专题、后证据”的顺序组织阅读。
```

- [ ] **Step 5: 自检导航与链接关系**

Run: `rg -n "overview-and-reading-map|design-principles|comparative|evidence" docs/ai-coding/coding-agents`
Expected: 新入口文件与导航项均已落地


