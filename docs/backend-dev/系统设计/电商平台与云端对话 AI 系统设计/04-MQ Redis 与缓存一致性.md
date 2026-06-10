# 04. MQ Redis 与缓存一致性

## MQ 负责什么

MQ 主要解决两类问题：

- 解耦
- 可靠异步

适合投递的事件：

- `run_started`
- `tool_call_dispatch`
- `tool_result_ready`
- `price_changed`
- `inventory_changed`
- `promotion_updated`
- `conversation_summary_requested`
- `audit_log_flush`

## MQ 选型

| 中间件 | 适合场景 |
|---|---|
| RabbitMQ / RocketMQ | Agent 工具调度、异步任务、补偿任务、死信队列 |
| Kafka | 价格变更流、行为日志、审计事件、高吞吐可回放事件 |

务实选型：中早期可以先用 RabbitMQ 或 RocketMQ 统一承载业务任务；当价格流、审计流、行为日志规模变大，再引入 Kafka。

## Redis 负责什么

| 用途 | 示例 key |
|---|---|
| API 幂等 | `idem:chat-run:{userId}:{idempotencyKey}` |
| 工具幂等 | `idem:tool-call:{toolDedupKey}` |
| 商品缓存 | `product:detail:{productId}` |
| 价格缓存 | `price:sku:{skuId}` |
| 库存缓存 | `inventory:sku:{skuId}` |
| 限流计数 | `rate:{tenantId}:{window}` |
| 运行态 | `run:cursor:{runId}` |
| 取消信号 | `run:cancel:{runId}` |

## Outbox 投递流程

```mermaid
sequenceDiagram
    participant API as Conversation API
    participant DB as DB
    participant OB as Outbox Dispatcher
    participant MQ as MQ
    participant W as Worker

    API->>DB: begin tx
    API->>DB: insert run/message
    API->>DB: insert outbox_events(run_started)
    API->>DB: commit
    OB->>DB: poll pending outbox
    OB->>MQ: publish event
    MQ-->>OB: ack
    OB->>DB: mark outbox sent
    W->>MQ: consume run_started
```

## 慢工具异步恢复执行

```mermaid
sequenceDiagram
    participant W as Agent Worker
    participant DB as Run DB
    participant MQ as MQ
    participant TW as Tool Worker
    participant EXT as External API

    W->>DB: insert tool_call(status=pending)
    W->>MQ: publish tool_call_dispatch
    W->>DB: update run(status=waiting_tool)
    TW->>MQ: consume tool_call_dispatch
    TW->>DB: mark tool_call running
    TW->>EXT: execute external query
    EXT-->>TW: result or timeout
    TW->>DB: persist tool result
    TW->>MQ: publish tool_result_ready
    W->>MQ: consume tool_result_ready
    W->>DB: load run and tool result
    W->>DB: update run(status=planning)
    W->>W: resume next ReAct step
```

## 价格缓存更新链路

```mermaid
sequenceDiagram
    participant PS as Pricing Service
    participant DB as Price DB
    participant MQ as MQ
    participant CW as Cache Worker
    participant R as Redis

    PS->>DB: update latest price
    PS->>MQ: publish price_changed
    CW->>MQ: consume price_changed
    CW->>R: delete price:sku:{skuId}
    CW->>R: optional preload latest snapshot
```

## 热点缓存回源保护

```mermaid
flowchart TD
    A[请求商品价格] --> B{Redis 命中?}
    B -->|是| C[直接返回]
    B -->|否| D{获取互斥锁成功?}
    D -->|否| E[短暂等待或返回旧值]
    D -->|是| F[查询数据库]
    F --> G[写入 Redis 含 TTL 抖动]
    G --> H[释放锁并返回]
```

## 缓存一致性原则

- 商品详情长 TTL + 主动失效。
- 价格和库存短 TTL + 变更消息删除缓存。
- 热点 SKU 用逻辑过期 + 后台刷新。
- Redis 故障时允许部分链路回源数据库，但必须限流。
