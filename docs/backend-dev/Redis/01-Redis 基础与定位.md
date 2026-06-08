# 01. Redis 基础与定位

## 一、Redis 是什么

Redis 是一个以内存为主要存储介质的 key-value 数据库。

它常被称为缓存，但不能只把它理解成缓存。Redis 还提供了：

- 多种数据结构
- 过期时间
- 原子命令
- Lua 脚本
- 持久化
- 主从复制
- 哨兵和集群能力
- 发布订阅和 Stream

对后端开发来说，Redis 更像是一个 **高性能的内存数据结构服务器**。

## 二、Redis 适合解决什么问题

Redis 最常见的价值是把高频访问、计算成本高、短期有效的数据放到内存里。

典型场景：

- 缓存用户信息、商品信息、配置项
- 保存登录态、验证码、短期 token
- 实现排行榜、计数器、点赞数
- 控制接口限流
- 做分布式锁
- 做简单延时队列或消息流
- 保存秒杀库存的临时扣减状态

它的优势是读写快、命令丰富、部署相对简单。

## 三、Redis 不适合解决什么问题

Redis 不是关系型数据库的替代品。

不适合直接放在 Redis 里的内容：

- 需要复杂查询的数据
- 需要强事务保证的数据
- 需要长期可靠保存的核心业务数据
- 数据量巨大但访问频率很低的冷数据
- 不能接受任何丢失风险的账务数据

例如订单、支付流水、余额变更这类核心数据，主存储通常仍然应该放在 MySQL、PostgreSQL 等数据库里。Redis 可以做缓存、加速和辅助控制，但不应该成为唯一事实来源。

## 四、Redis 和数据库的关系

常见后端系统里，Redis 和数据库通常这样分工：

| 组件 | 主要职责 |
|---|---|
| 数据库 | 保存权威数据，支持事务和复杂查询 |
| Redis | 加速高频读取，承接临时状态和轻量原子操作 |

一个常见读取流程：

1. 先查 Redis
2. Redis 命中，直接返回
3. Redis 未命中，查询数据库
4. 把数据库结果写回 Redis
5. 返回结果

这就是常说的 cache-aside 模式。

## 五、Redis 为什么快

Redis 快主要来自几个因素：

- 数据主要在内存中
- 常用命令的数据结构设计高效
- 单线程执行命令避免了复杂锁竞争
- 使用 I/O 多路复用处理网络连接
- 命令本身通常足够短小

但这不代表 Redis 永远快。

如果你执行 `KEYS *`、一次性 `HGETALL` 一个巨大 Hash、删除超大 key，Redis 也会阻塞，甚至拖慢整个实例。

## 六、Redis 的 key-value 模型

Redis 中每条数据可以简单理解成：

```text
key -> value
```

其中 key 通常是字符串，value 可以是 String、Hash、List、Set、Sorted Set 等不同结构。

例如：

```text
user:1001:name -> "Alice"
cart:1001 -> Hash
rank:daily:2026-06-07 -> Sorted Set
sms:code:13800000000 -> "593821"
```

key 的命名会直接影响维护体验。推荐使用有层级含义的格式：

```text
业务:对象:标识:字段
```

例如：

```text
user:profile:1001
order:lock:202606070001
article:like-count:9527
```

## 七、TS 后端如何使用 Redis

Node.js/TypeScript 后端通常会通过 Redis 客户端访问 Redis，例如 `ioredis` 或 `redis`。

伪代码：

```ts
const cached = await redis.get(`user:profile:${userId}`);

if (cached) {
  return JSON.parse(cached);
}

const user = await db.user.findUnique({ where: { id: userId } });

await redis.set(
  `user:profile:${userId}`,
  JSON.stringify(user),
  "EX",
  300,
);

return user;
```

这里要注意：

- Redis 里通常存字符串，需要序列化和反序列化
- 缓存要设置过期时间
- 数据库查不到时也要考虑空值缓存
- Redis 异常时，核心接口应该考虑降级策略

## 八、学习 Redis 的主线

初学者可以按这个顺序理解：

1. Redis 能存什么数据
2. 每种数据结构适合什么场景
3. 缓存和数据库如何保持一致
4. Redis 为什么会阻塞
5. Redis 如何持久化和高可用
6. 生产环境应该遵守哪些使用规范

不要一上来背大量命令。先建立场景，再理解命令为什么这样设计。
