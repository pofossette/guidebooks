Task 1 diff package

## git diff --stat
 docs/ai-coding/coding-agents/.pages   | 10 +++---
 docs/ai-coding/coding-agents/index.md | 58 +++++------------------------------
 2 files changed, 14 insertions(+), 54 deletions(-)

## git diff
diff --git a/docs/ai-coding/coding-agents/.pages b/docs/ai-coding/coding-agents/.pages
index d1a14b9..448fe97 100644
--- a/docs/ai-coding/coding-agents/.pages
+++ b/docs/ai-coding/coding-agents/.pages
@@ -1,6 +1,8 @@
-title: 编码 Agent 机制
+title: AI 编码 Agent 机制
 nav:
   - index.md
-  - agent-architecture-and-prompting.md
-  - agent-task-and-goal-strategies.md
-  - source-evidence-and-code-index.md
+  - 阅读地图: overview-and-reading-map.md
+  - 专题目录:
+      - 设计原则主线: design-principles
+      - 横向比较: comparative
+      - 证据索引: evidence
diff --git a/docs/ai-coding/coding-agents/index.md b/docs/ai-coding/coding-agents/index.md
index 1fddf18..3777124 100644
--- a/docs/ai-coding/coding-agents/index.md
+++ b/docs/ai-coding/coding-agents/index.md
@@ -1,55 +1,13 @@
 # AI 编码 Agent 机制总览
 
-这一组文档现在只保留一条主线，重点回答三件事：
+这一组文档已经改成“设计原则主线 + 阅读地图 + 比较区 + 证据区”的结构。
 
-- `Claude Code`、`OpenCode`、`Codex` 这类 AI 编码 agent 到底各自把重点放在哪一层
-- 提示词、上下文、工具、多 agent、todo、目标这些机制怎样拼成一套可持续运行的系统
-- 哪些旧结论需要订正，尤其是 `todo/task` 和 `goal` 的边界
+你可以把这里理解成新入口：
 
-## 推荐阅读顺序
+- `index.md` 负责总览和分流
+- `overview-and-reading-map.md` 负责告诉你先读什么、后读什么
+- `design-principles/` 负责承接主叙事
+- `comparative/` 负责横向对照
+- `evidence/` 负责放证据索引和可复核材料
 
-1. [架构、提示词与上下文策略](./agent-architecture-and-prompting.md)
-2. [任务、Todo 与目标策略](./agent-task-and-goal-strategies.md)
-3. [源码与证据索引](./source-evidence-and-code-index.md)
-
-## 这组文档现在怎么分工
-
-### 1. 架构、提示词与上下文策略
-
-看这一页，如果你关心的是：
-
-- 系统提示词怎么组装
-- 项目规则和环境信息怎么注入
-- 上下文为什么会压缩成不同形状
-- 多 agent / 子 agent 在三套系统里的角色差异
-
-入口： [架构、提示词与上下文策略](./agent-architecture-and-prompting.md)
-
-### 2. 任务、Todo 与目标策略
-
-看这一页，如果你关心的是：
-
-- `TodoWrite`、`task`、`/goal` 到底是不是一回事
-- `Claude Code` 的 `/goal` 现在应该怎样准确描述
-- `OpenCode` 为什么不该被写成 `Codex` 式目标运行时
-- `Codex` 的线程级 goal 状态机到底和 checklist 有什么区别
-
-入口： [任务、Todo 与目标策略](./agent-task-and-goal-strategies.md)
-
-### 3. 源码与证据索引
-
-看这一页，如果你需要：
-
-- 快速找到支撑结论的本地源码位置
-- 查看 `Claude Code /goal` 本次订正用到的最新公开资料
-- 对照本地实现和文档判断，继续补充或复核
-
-入口： [源码与证据索引](./source-evidence-and-code-index.md)
-
-## 先记住这三个判断
-
-- `Claude Code` 最强的是会话层 prompt 组织、工具纪律和任务追踪，`/goal` 是强自动续跑控制面，但不宜直接写成 Codex 式线程目标状态机。
-- `OpenCode` 最强的是持久化会话 todo、`task/subagent` 执行控制，以及 `permission/runtime/control-plane` 的组合。
-- `Codex` 最强的是 thread/turn/goal 的后端建模，它是三者里线程级 goal 状态机最明确的一家。
-
-如果你之前看过旧文，这一版最大的变化就是：不再把所有“任务推进能力”混写成同一种机制。
+如果你是从旧文进来的，先按新入口读；旧的三篇总述会在后续任务里拆回各专题区。

## untracked files

### docs/ai-coding/coding-agents/overview-and-reading-map.md
     1	# 阅读地图
     2	
     3	按“先总览、再专题、后证据”的顺序组织阅读。
     4	
     5	1. 先看 [AI 编码 Agent 机制总览](./index.md)，确认这组文档的主线和分区。
     6	2. 再进入 [设计原则主线](./design-principles/)，先把 `Claude Code`、`OpenCode`、`Codex` 的差异放到同一把尺子上。
     7	3. 如果你需要横向判断，再看 [横向比较](./comparative/)，把差异和边界再压实一遍。
     8	4. 最后回到 [证据索引](./evidence/)，按系统复核源码、公开资料和推断依据。
     9	
    10	这版重构的目标很简单：先把阅读路径固定下来，再把后续专题内容逐步挂到对应分区里。

### docs/ai-coding/coding-agents/design-principles/index.md
     1	# 设计原则主线
     2	
     3	这里是本目录的主叙事入口，后续内容将围绕 `Claude Code`、`OpenCode`、`Codex` 三套系统展开，讨论它们在架构、提示词、上下文、工具纪律、任务推进和续跑控制上的设计原则。
     4	
     5	本页只负责把主线立住，不在这里展开长文；如果你想先对齐整体结构，先看 [阅读地图](../overview-and-reading-map.md)。
     6	
     7	如果你想延续旧文里的材料，可以先参考：
     8	
     9	- [架构、提示词与上下文策略](../agent-architecture-and-prompting.md)
    10	- [任务、Todo 与目标策略](../agent-task-and-goal-strategies.md)

### docs/ai-coding/coding-agents/comparative/index.md
     1	# 横向比较
     2	
     3	这里集中放 `Claude Code`、`OpenCode`、`Codex` 三套系统的横向对照，只负责比较，不负责主叙事。
     4	
     5	后续比较会围绕这些维度展开：
     6	
     7	- 提示词与上下文组织
     8	- 工具调用与权限边界
     9	- 任务、Todo 与目标模型
    10	- 续跑、恢复与中断处理
    11	
    12	如果你现在只是想建立目录感，先看 [阅读地图](../overview-and-reading-map.md)。

### docs/ai-coding/coding-agents/evidence/index.md
     1	# 证据索引
     2	
     3	这里集中放本专题的证据入口，只负责支撑后续判断，不重复论证。
     4	
     5	这里会分别为 `Claude Code`、`OpenCode`、`Codex` 提供证据索引，方便先按系统找材料，再回头复核结论。
     6	
     7	本区保留四类证据类型：本地源码、官方文档、公开 issue/discussion、推断；后续结论会按“结论 -> 证据类型 -> 具体来源”的方式标注，方便复核和追溯。
     8	
     9	## Claude Code
    10	
    11	这里汇总 `Claude Code` 的源码、官方说明、公开讨论和必要推断，供后续判断 `/goal`、任务管理与会话行为时回查。
    12	
    13	## OpenCode
    14	
    15	这里汇总 `OpenCode` 的源码、官方说明、公开讨论和必要推断，供后续判断 session todo、runtime 控制与 subagent 行为时回查。
    16	
    17	## Codex
    18	
    19	这里汇总 `Codex` 的源码、官方说明、公开讨论和必要推断，供后续判断 thread goal、预算和 continuation 时回查。
    20	
    21	如果你想先看现成材料，可以从旧的证据页入口开始：
    22	
    23	- [源码与证据索引](../source-evidence-and-code-index.md)
