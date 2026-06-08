# 06. Redis 事务、Lua 与发布订阅

## 一、Redis 事务是什么

Redis 事务可以把多条命令放进队列，然后一次性按顺序执行。

常见命令：

- `MULTI`
- `EXEC`
- `DISCARD`
- `WATCH`

示例：

```text
MULTI
SET a 1
INCR count
EXEC
```

执行 `EXEC` 后，Redis 会按顺序执行队列里的命令。

## 二、Redis 事务和数据库事务不同

不要把 Redis 事务理解成 MySQL 或 PostgreSQL 的事务。

Redis 事务不提供完整的：

- 回滚
- 隔离级别
- 持久性保证
- 跨复杂业务逻辑的强一致事务

如果事务中某条命令运行时报错，其他命令可能仍然执行。

所以 Redis 事务在日常业务开发中使用并不多。

## 三、WATCH 的作用

`WATCH` 可以监视某些 key。

如果在事务执行前，被监视的 key 被其他客户端修改，`EXEC` 会失败。

它有点像乐观锁：

```text
WATCH stock:1001
GET stock:1001
MULTI
DECR stock:1001
EXEC
```

但真实秒杀、库存扣减通常不会只靠这种方式，还要结合数据库约束、消息队列、幂等和补偿。

## 四、Lua 脚本

Lua 脚本可以把多条 Redis 操作封装成一个脚本，在 Redis 服务端一次执行。

它的关键价值是：

**脚本执行期间不会被其他命令插入，因此可以保证脚本内部多个操作的原子性。**

典型场景：

- 分布式锁释放
- 限流判断和计数
- 库存判断和扣减
- 比较后删除

释放锁示例：

```lua
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
```

含义：

- 只有锁的 value 等于自己的 token
- 才能删除这个锁
- 避免误删别人后来获得的锁

## 五、Lua 不是万能方案

Lua 脚本要短小。

危险用法：

- 在脚本里遍历巨大集合
- 写复杂业务逻辑
- 做长时间循环
- 调用不确定耗时的命令

因为 Redis 执行命令的主路径是串行的。Lua 脚本执行太久，会阻塞其他请求。

## 六、发布订阅

Redis Pub/Sub 是发布订阅模型。

发送方发布消息：

```text
PUBLISH order-events "paid:1001"
```

订阅方订阅频道：

```text
SUBSCRIBE order-events
```

它适合做轻量通知，但不适合作为可靠消息队列。

原因：

- 消息不会持久保存给离线消费者
- 消费者断开期间会丢消息
- 缺少确认和重试机制
- 不适合复杂消费组语义

如果业务要求“消息必须被处理”，优先考虑 Kafka、RabbitMQ、RocketMQ，或 Redis Stream。

## 七、Redis Stream

Redis Stream 是 Redis 提供的日志型消息结构。

它支持：

- 消息追加
- 按 ID 读取
- 消费组
- 待确认消息
- 消费者恢复

常见命令：

```text
XADD order:stream * type paid orderId 1001
XREADGROUP GROUP workers c1 COUNT 10 STREAMS order:stream >
XACK order:stream workers messageId
```

Stream 比 Pub/Sub 更适合需要追踪消费进度的场景。

但它仍然不是所有消息队列场景的替代品。大规模消息堆积、复杂路由、跨服务治理、死信和重试策略仍然需要认真设计。

## 八、限流示例

Redis 常用于接口限流。

一个简单固定窗口限流：

```ts
const key = `rate:login:${ip}`;
const count = await redis.incr(key);

if (count === 1) {
  await redis.expire(key, 60);
}

if (count > 10) {
  throw new Error("请求过于频繁");
}
```

这个例子有竞态细节：`INCR` 成功后、`EXPIRE` 前应用崩溃，key 可能没有 TTL。

生产里可以用 Lua 把 `INCR` 和 `EXPIRE` 放进同一个脚本。

## 九、怎么选择

| 需求 | 推荐方案 |
|---|---|
| 批量命令减少网络往返 | Pipeline |
| 多命令原子判断和修改 | Lua |
| 乐观并发控制 | WATCH |
| 轻量实时通知 | Pub/Sub |
| 需要消费进度的轻量队列 | Stream |
| 强可靠复杂消息系统 | 专业消息队列 |

在后端业务中，Lua 通常比 Redis 事务更常用，但脚本必须保持简单、可测试、可观测。
