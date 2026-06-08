# Agent 后端基础

这一组文档面向已经熟悉 TypeScript、React/Vue、前端工程化，但希望转向 **Agent 开发** 的开发者。内容参考 JavaGuide 的后端知识体系，以及小林 coding 的图解网络、图解系统、图解数据库写法，目标是用尽量短的路径补齐后端基本功。

这组教程有三个取舍：

- 只讲做 Agent 后端真正常用的内容。
- 数据库以 **PostgreSQL** 为主，不再按 MySQL 作为主线。
- 多用 Mermaid 解释请求链路、状态流转和数据关系。

参考资料：

- JavaGuide: https://javaguide.cn/
- JavaGuide 数据库知识体系: https://javaguide.cn/database/
- JavaGuide Redis: https://javaguide.cn/database/redis/
- 小林 coding: https://xiaolincoding.com/
- 小林 coding 图解网络: https://xiaolincoding.com/network/
- 小林 coding 图解系统: https://www.xiaolincoding.com/os/
- 小林 coding 图解 MySQL: https://xiaolincoding.com/mysql/

## 章节

- [01. 请求生命周期与流式 API](./01-请求生命周期与流式%20API.md)
- [02. Node.js 后端分层与输入校验](./02-Node.js%20后端分层与输入校验.md)
- [03. PostgreSQL 表设计、SQL 与索引](./03-PostgreSQL%20表设计%20SQL%20与索引.md)
- [04. PostgreSQL 事务、锁与并发控制](./04-PostgreSQL%20事务%20锁与并发控制.md)
- [05. Redis 缓存、限流与幂等](./05-Redis%20缓存%20限流与幂等.md)
- [06. 队列、重试与异步任务](./06-队列%20重试与异步任务.md)
- [07. Agent 后端主链路、RAG 与可观测性](./07-Agent%20后端主链路%20RAG%20与可观测性.md)

## 推荐顺序

1. 先看请求生命周期，建立“后端在处理什么”的心智。
2. 再看 Node.js 分层和 PostgreSQL，补齐最核心的数据与服务结构。
3. 然后进入 Redis、队列和事务，理解稳定性问题。
4. 最后读 Agent 主链路，把前面几篇拼成一个完整系统。
