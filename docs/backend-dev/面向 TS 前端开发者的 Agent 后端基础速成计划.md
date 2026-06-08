# 面向 TS 前端开发者的 Agent 后端基础速成计划

这份计划面向已经熟悉 TypeScript、React/Vue、浏览器网络请求、前端工程化的开发者，目标不是转成传统 Java 后端，而是在较短时间内补齐 **Agent 应用开发所需的后端基础**：能设计 API、落库、接缓存、处理异步任务、做可观测性、理解并发与网络边界，并最终能独立实现一个可上线的 Agent 服务。

参考思路：

- JavaGuide：后端知识体系和面试通关计划强调 MySQL、Redis、系统设计、分布式、高并发、高可用等主线，适合用来建立后端知识地图。
- 小林 coding：图解网络、图解系统、图解 MySQL、图解 Redis 更适合补底层机制，尤其是 HTTP/TCP、进程线程、I/O、多路复用、事务、索引、缓存与高可用。

参考资料：

- JavaGuide: https://javaguide.cn/
- JavaGuide 后端面试通关计划: https://javaguide.cn/interview-preparation/backend-interview-plan.html
- JavaGuide 数据库知识体系: https://javaguide.cn/database/
- JavaGuide Redis: https://javaguide.cn/database/redis/
- 小林 coding: https://xiaolincoding.com/
- 小林 coding 图解 MySQL: https://xiaolincoding.com/mysql/
- 小林 coding 图解系统: https://www.xiaolincoding.com/os/

## 学习目标

完成后你应该能做到：

- 用 Node.js/NestJS、Hono、Fastify 或 Next.js Route Handler 设计稳定的后端 API。
- 解释一次 Agent 请求从 HTTP 入口、鉴权、限流、任务编排、模型调用、工具调用、检索、落库、流式返回到日志追踪的完整链路。
- 使用 PostgreSQL/MySQL 设计会话、消息、任务、工具调用记录、知识库文档等核心表。
- 使用 Redis 解决会话缓存、限流、幂等、任务状态、分布式锁和热点数据问题。
- 理解 HTTP、TCP、连接池、超时、重试、队列、事务、索引、锁、缓存一致性等后端高频问题。
- 做出一个可演示、可压测、可排查的 Agent 后端项目。

## 总体路线

建议周期：6 周。

如果每天只有 1 到 2 小时，可以拉长到 8 到 10 周；如果已有 Node 后端经验，可以压缩到 4 周。

| 阶段 | 时长 | 主题 | 核心产出 |
| --- | --- | --- | --- |
| 0 | 0.5 周 | 后端心智切换 | 画出 Agent 后端请求链路 |
| 1 | 1 周 | 网络、HTTP、API | 可流式返回的 Agent API |
| 2 | 1 周 | 数据库与事务 | Agent 会话与消息表设计 |
| 3 | 1 周 | Redis 与缓存 | 限流、幂等、任务状态缓存 |
| 4 | 1 周 | 异步任务与可靠性 | 后台任务队列与失败重试 |
| 5 | 1 周 | 系统设计与可观测性 | 可排查的 Agent 服务 |
| 6 | 0.5 周 | 项目整合 | 一个端到端 Agent 后端项目 |

## 阶段 0：从前端心智切到后端心智

前端开发通常关注组件状态、交互、渲染、请求封装和用户体验；Agent 后端更关注 **请求生命周期、资源边界、状态持久化、失败恢复、成本控制和可观测性**。

必须建立的后端问题意识：

- 请求不是函数调用：它有超时、取消、重试、并发、幂等和降级问题。
- 状态不能只放内存：多实例部署后，进程内状态会失效。
- 模型调用不是普通 RPC：它成本高、延迟大、失败模式多，还可能产生长时间流式响应。
- Agent 工具调用必须可审计：每次 tool call 的输入、输出、耗时、错误和用户上下文都要能追踪。
- 检索和记忆是数据系统问题：不是简单把文本塞进 prompt，而是要处理分块、索引、召回、权限、版本和评测。

本阶段产出：

- 画一张 Agent 请求链路图：`Client -> API -> Auth -> Rate Limit -> Agent Orchestrator -> LLM -> Tool/RAG -> DB/Redis -> Stream Response -> Trace/Log`。
- 写出 10 个你认为 Agent 后端必须处理的失败场景，例如模型超时、工具调用失败、用户重复提交、SSE 断连、Redis 短暂不可用。

## 阶段 1：网络、HTTP 与 API 设计

重点参考小林 coding 的图解网络，以及 JavaGuide 的计算机网络和系统设计内容。前端开发者已经会调用 API，但转后端需要理解 API 背后的连接、协议和稳定性边界。

必须掌握：

- HTTP 方法、状态码、Header、Cookie、CORS、缓存语义。
- SSE、WebSocket、长轮询的差异，Agent 场景优先掌握 SSE。
- TCP 连接、三次握手、四次挥手、队头阻塞、Keep-Alive、连接池。
- 超时、重试、取消、幂等键、限流和错误码设计。
- REST 与 RPC 的取舍；Agent 服务中建议 API 对外稳定、内部编排清晰。

练习任务：

- 实现 `POST /api/agents/:agentId/runs`，创建一次 Agent 运行。
- 实现 `GET /api/runs/:runId/events`，用 SSE 返回 token、tool_call、tool_result、done、error 事件。
- 给所有外部模型调用加超时、重试上限和 request id。
- 设计统一错误结构：`code`、`message`、`requestId`、`retryable`。

自测标准：

- 能解释浏览器发起一次 SSE 请求后，服务端如何保持连接、如何 flush 数据、客户端断开后后端如何停止任务。
- 能说清楚哪些接口可以重试，哪些接口必须使用幂等键。

## 阶段 2：数据库、SQL、索引与事务

Agent 后端的核心状态通常在数据库里：用户、会话、消息、运行任务、工具调用、文件、知识库、向量索引元数据、计费记录。JavaGuide 的数据库知识体系适合建立范围，小林 coding 的图解 MySQL 适合补索引、事务、锁、MVCC 等机制。

必须掌握：

- 表设计：主键、外键、唯一约束、时间字段、软删除、状态字段。
- SQL 基础：增删改查、JOIN、聚合、分页、事务。
- 索引：B+ 树、联合索引、最左前缀、覆盖索引、索引失效。
- 事务：ACID、隔离级别、脏读、不可重复读、幻读、MVCC。
- 锁：行锁、间隙锁、乐观锁、悲观锁。

Agent 场景表设计建议：

| 表 | 用途 | 关键字段 |
| --- | --- | --- |
| `agents` | Agent 配置 | `id`、`owner_id`、`model`、`system_prompt`、`tool_policy` |
| `conversations` | 会话 | `id`、`user_id`、`agent_id`、`title` |
| `messages` | 对话消息 | `id`、`conversation_id`、`role`、`content`、`token_count` |
| `runs` | 一次 Agent 执行 | `id`、`conversation_id`、`status`、`idempotency_key`、`started_at`、`ended_at` |
| `tool_calls` | 工具调用记录 | `id`、`run_id`、`tool_name`、`input`、`output`、`status`、`latency_ms` |
| `documents` | 知识库文档 | `id`、`workspace_id`、`source_uri`、`version`、`checksum` |
| `chunks` | 文档分块 | `id`、`document_id`、`content`、`embedding_id`、`metadata` |

练习任务：

- 用 Prisma、Drizzle 或 TypeORM 建出上述核心表。
- 为 `messages(conversation_id, created_at)`、`runs(idempotency_key)`、`tool_calls(run_id, created_at)` 建索引。
- 实现“创建 run + 写入用户消息 + 初始化任务状态”的事务。
- 写一个 SQL 查询：按会话加载最近 30 条消息，按时间正序返回。

自测标准：

- 能解释为什么消息表不能只按 `created_at` 查。
- 能解释 `idempotency_key` 为什么需要唯一索引。
- 能说明一次 Agent run 状态更新应该放在事务内还是事务外。

## 阶段 3：Redis、缓存、限流与幂等

Redis 在 Agent 后端里非常常见：缓存模型配置、保存短期运行状态、实现限流、做幂等保护、存队列中间状态、处理分布式锁。JavaGuide 的 Redis 高频问题适合快速建立问题清单，小林 coding 的图解 Redis 适合理解数据结构、持久化和高可用。

必须掌握：

- String、Hash、List、Set、Sorted Set 的使用场景。
- 过期时间、淘汰策略、缓存穿透、缓存击穿、缓存雪崩。
- 缓存一致性：旁路缓存、先写库再删缓存、延迟双删的适用边界。
- 分布式锁：`SET NX PX`、锁过期、误删、续期和 Redlock 争议。
- 限流：固定窗口、滑动窗口、令牌桶。
- Redis 持久化：RDB、AOF，以及它们对可靠性的影响。

Agent 场景用法：

- `run:{runId}:state`：保存当前 run 的临时状态，设置短 TTL。
- `rate:user:{userId}`：用户级限流。
- `idem:{userId}:{key}`：幂等键，防止重复提交。
- `model_config:{agentId}`：缓存 Agent 模型配置。
- `tool_result:{hash}`：缓存可复用、无副作用工具结果。

练习任务：

- 实现按用户和按 workspace 的双层限流。
- 实现幂等提交：相同用户、相同幂等键只能创建一个 run。
- 实现一个只缓存成功结果的 tool result cache。
- 模拟缓存击穿：热门 Agent 配置过期时，只允许一个请求回源数据库。

自测标准：

- 能解释为什么 Redis 不能当作 Agent run 的唯一可靠存储。
- 能解释缓存失效时如何避免所有请求同时打到数据库。
- 能说明分布式锁在哪些场景可以用，哪些场景应该改用数据库唯一约束或队列。

## 阶段 4：异步任务、队列与可靠性

Agent 后端不能把所有工作都塞在 HTTP 请求里。长任务、文件解析、embedding、索引构建、批量工具调用、评测任务都应该进入后台任务系统。

必须掌握：

- 同步请求、异步任务、事件驱动的边界。
- 队列基本概念：生产者、消费者、ack、重试、死信队列、延迟任务。
- 任务幂等：同一个 job 被执行多次也不会产生错误结果。
- 任务状态机：`pending`、`running`、`succeeded`、`failed`、`cancelled`。
- 背压：下游模型、数据库、向量库慢时如何保护系统。

推荐技术选型：

- Node.js：BullMQ、pg-boss、Temporal TypeScript SDK。
- 数据库简单队列：适合早期项目，但要处理锁和并发领取。
- 消息队列：RabbitMQ、Kafka、Redis Streams，按规模再引入。

练习任务：

- 用 BullMQ 或 pg-boss 实现 `embedding_document` 后台任务。
- 给任务加最大重试次数、指数退避和死信记录。
- 任务每处理一个 chunk 都写入进度，前端可以查询进度。
- 对同一个文档版本，重复提交 embedding 任务不会重复写入 chunk。

自测标准：

- 能解释 HTTP 请求超时后，后台任务是否应该继续跑。
- 能说明任务失败后用户能看到什么状态，开发者能查到什么日志。

## 阶段 5：系统设计、可观测性与安全

JavaGuide 的系统设计、高性能、高可用内容适合在这一阶段补齐。Agent 后端系统设计的重点不是背题，而是能说清楚容量、瓶颈、故障、数据一致性和成本控制。

必须掌握：

- 系统设计基本套路：需求、接口、数据模型、核心流程、瓶颈、扩展、故障处理。
- 高性能：连接池、缓存、批处理、流式响应、并发控制。
- 高可用：超时、重试、熔断、降级、限流、隔离。
- 可观测性：结构化日志、metrics、trace、request id、run id。
- 安全：鉴权、权限隔离、Prompt Injection、工具权限、敏感信息脱敏。
- 成本控制：token 预算、模型路由、缓存、任务取消、配额。

Agent 后端必须记录的事件：

- `run.created`
- `llm.request.started`
- `llm.request.completed`
- `tool.call.started`
- `tool.call.failed`
- `retrieval.query.completed`
- `stream.client.disconnected`
- `run.completed`

练习任务：

- 为每个请求生成 `requestId`，为每次 Agent 执行生成 `runId`。
- 所有日志必须带 `requestId`、`userId`、`agentId`、`runId`。
- 增加基础 metrics：请求耗时、模型耗时、token 数、工具调用次数、错误率。
- 设计一个“知识库问答 Agent”的系统设计文档，说明如何处理权限、召回、流式返回、失败重试和成本上限。

自测标准：

- 给你一个用户反馈“Agent 一直转圈”，你能从日志、任务状态、模型调用、SSE 连接四个角度排查。
- 能说清楚模型 API 故障时系统如何降级。

## 阶段 6：整合项目

最终项目建议做一个“团队知识库 Agent 后端”，它足够贴近真实 Agent 工程，又不会被复杂 UI 分散注意力。

功能范围：

- 用户创建 Agent，配置模型、系统提示词和可用工具。
- 上传文档，后台解析、分块、生成 embedding。
- 创建会话，发送问题，服务端用 SSE 流式返回答案。
- Agent 能调用至少两个工具：知识库检索、当前时间或内部 HTTP 查询。
- 保存消息、run、tool call、retrieval trace。
- 支持用户级限流、幂等提交、任务重试和基础日志。

最低技术栈：

- Runtime：Node.js 20+。
- Framework：NestJS、Fastify、Hono 或 Next.js Route Handler。
- DB：PostgreSQL，ORM 可选 Prisma 或 Drizzle。
- Cache/Queue：Redis + BullMQ，或 PostgreSQL + pg-boss。
- Observability：Pino/Winston + OpenTelemetry 基础 trace。
- LLM：OpenAI API、兼容 OpenAI API 的模型服务，或本地模型网关。

验收清单：

- `pnpm test` 能跑核心单元测试。
- 本地能通过 Docker Compose 启动 DB、Redis 和服务。
- README 写清楚启动方式、环境变量和核心接口。
- 用 curl 可以完整跑通：创建 Agent -> 上传文档 -> 等待索引 -> 提问 -> SSE 返回 -> 查询 run 详情。
- 数据库里可以查到消息、run、tool call 和检索记录。
- Redis 宕机时，核心数据不丢；服务可以明确报错或降级。

## 每周节奏

建议每周按下面节奏推进：

- 第 1 天：读参考资料，整理概念。
- 第 2 天：画链路图或表结构。
- 第 3 到 4 天：编码实现最小功能。
- 第 5 天：补错误处理、日志和测试。
- 第 6 天：压测或故障演练。
- 第 7 天：复盘，写一页总结。

复盘问题：

- 这个模块解决了 Agent 后端的哪个真实问题？
- 它的状态存在哪里？丢了会怎样？
- 哪些操作可以重试？哪些不可以？
- 高并发下瓶颈在哪里？
- 线上出问题时，第一眼看哪个日志或指标？

## 重点取舍

TS 前端转 Agent 后端，不建议一开始深挖这些内容：

- JVM、Java 集合、Spring 全家桶细节。
- Kafka 深层源码。
- MySQL 内核源码。
- Kubernetes 大规模运维。
- 自研向量数据库。

应该优先掌握这些能力：

- API 设计和流式响应。
- SQL、事务、索引和表结构。
- Redis 缓存、限流、幂等。
- 异步任务和失败重试。
- 日志、trace、metrics。
- Agent 特有的工具调用、RAG、权限和成本控制。

## 推荐阅读映射

| 后端能力 | JavaGuide 参考 | 小林 coding 参考 | Agent 后端落点 |
| --- | --- | --- | --- |
| 网络基础 | 计算机网络常见面试题 | 图解网络 | SSE、超时、重试、连接管理 |
| 操作系统 | 操作系统常见面试题 | 图解系统 | 进程、线程、I/O、多路复用 |
| 数据库 | 数据库知识体系、MySQL 面试题 | 图解 MySQL | 会话、消息、run、tool call 落库 |
| Redis | Redis 专题 | 图解 Redis | 缓存、限流、幂等、任务状态 |
| 高性能 | 高性能系统设计 | 网络系统、Redis、MySQL 专题 | 缓存、连接池、批处理、背压 |
| 高可用 | 高可用、分布式专题 | 系统与网络专题 | 超时、重试、降级、故障隔离 |
| 系统设计 | 系统设计与场景题 | 图解底层机制 | Agent 服务整体架构 |

## 最小知识闭环

如果时间非常紧，只学下面 12 个主题：

1. HTTP、SSE、超时、重试、幂等。
2. API 错误码和 request id。
3. PostgreSQL/MySQL 表设计。
4. SQL 查询、索引和事务。
5. Redis String/Hash/Sorted Set。
6. 缓存穿透、击穿、雪崩。
7. 用户限流和分布式锁。
8. 后台任务队列、重试、死信。
9. 日志、metrics、trace。
10. Agent run 状态机。
11. Tool call 审计与权限。
12. RAG 文档、chunk、embedding 元数据设计。

学完这些，就已经具备从前端开发者转向 Agent 后端开发的最小可用基础。
