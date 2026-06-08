# 02. Redis 数据类型与使用场景

## 一、为什么 Redis 不只是 String

Redis 的核心能力不是“把字符串放进内存”，而是提供了一组可直接在服务端执行的数据结构命令。

这些命令通常是原子的。多个后端实例同时对同一个 key 执行 `INCR`、`HINCRBY`、`ZINCRBY` 时，Redis 会按顺序处理，不会出现进程内变量那种竞态问题。

## 二、String

String 是最基础的数据类型。

适合：

- 缓存 JSON 字符串
- 保存验证码
- 保存短期 token
- 做计数器
- 做开关或简单配置

示例：

```text
SET sms:code:13800000000 593821 EX 300
INCR article:read-count:1001
SET user:profile:1001 '{"id":1001,"name":"Alice"}' EX 600
```

需要注意：

- 不要把特别大的 JSON 塞进一个 String
- 频繁局部修改的数据，不一定适合整体序列化成 String
- 计数器要考虑是否需要定期落库

## 三、Hash

Hash 可以理解为 Redis key 下面的一组 field-value。

适合：

- 用户资料
- 购物车
- 对象的局部字段更新
- 某个业务对象的多个计数字段

购物车示例：

```text
HSET cart:1001 sku:2001 2
HINCRBY cart:1001 sku:2001 1
HGETALL cart:1001
HDEL cart:1001 sku:2001
```

相比把购物车整体存成 JSON，Hash 的好处是可以只改某个商品数量，不必整体读出再写回。

但 Hash 也不是越大越好。一个 key 下 field 特别多时，`HGETALL` 会变成危险操作，应该改用 `HSCAN` 或拆分 key。

## 四、List

List 是有序列表，可以从两端插入和弹出。

适合：

- 简单队列
- 最新消息列表
- 最近访问记录

示例：

```text
LPUSH user:recent-view:1001 article:9527
LTRIM user:recent-view:1001 0 49
LRANGE user:recent-view:1001 0 9
```

List 可以做简单队列，但复杂消息场景更推荐使用专业消息队列，或使用 Redis Stream。

## 五、Set

Set 是无序不重复集合。

适合：

- 点赞用户集合
- 标签集合
- 去重
- 共同好友、共同关注

示例：

```text
SADD article:liked-users:9527 user:1001
SISMEMBER article:liked-users:9527 user:1001
SCARD article:liked-users:9527
```

集合交并差命令很方便，但对大集合执行 `SINTER`、`SUNION`、`SDIFF` 可能很重，要控制集合规模。

## 六、Sorted Set

Sorted Set 是带分数的有序集合。

适合：

- 排行榜
- 热度榜
- 延时任务
- 按时间排序的动态流

排行榜示例：

```text
ZINCRBY rank:article:daily 1 article:9527
ZREVRANGE rank:article:daily 0 9 WITHSCORES
ZRANK rank:article:daily article:9527
```

延时任务的基本思路：

- member 保存任务 ID
- score 保存应该执行的时间戳
- worker 扫描 score 小于当前时间的任务

但 Redis 不是完整消息系统。任务执行、失败重试、死信队列、消费确认都要额外设计。

## 七、Bitmap

Bitmap 适合用位来表示大量布尔状态。

典型场景：

- 用户签到
- 是否活跃
- 是否领取过某活动

示例：

```text
SETBIT signin:2026-06 userOffset 1
GETBIT signin:2026-06 userOffset
BITCOUNT signin:2026-06
```

Bitmap 的优势是省内存，但前提是你能把业务对象稳定映射到整数偏移量。

## 八、HyperLogLog

HyperLogLog 用来估算不重复元素数量。

典型场景：

- UV 统计
- 大规模去重计数

示例：

```text
PFADD uv:2026-06-07 user:1001
PFCOUNT uv:2026-06-07
```

它节省内存，但结果是估算值，不适合需要精确计数的业务。

## 九、GEO

GEO 用来保存地理位置并做附近查询。

典型场景：

- 查附近门店
- 查附近司机
- 查附近设备

示例：

```text
GEOADD shop:geo 116.397128 39.916527 shop:1001
GEOSEARCH shop:geo FROMLONLAT 116.40 39.91 BYRADIUS 3 km
```

GEO 背后基于 Sorted Set，因此也要注意集合规模和查询范围。

## 十、选型建议

| 场景 | 推荐类型 |
|---|---|
| 缓存整个对象 | String |
| 对象字段频繁局部更新 | Hash |
| 最新列表、简单队列 | List |
| 去重、关系集合 | Set |
| 排行榜、按分数排序 | Sorted Set |
| 签到、布尔状态 | Bitmap |
| UV 估算 | HyperLogLog |
| 附近位置查询 | GEO |

选择数据类型时不要只看命令是否方便，还要看数据规模、访问模式、是否需要局部更新、是否需要排序、是否能接受估算。
