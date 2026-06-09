# 03. SQL 查询基础与常见写法

学 PostgreSQL，不是为了背语法，而是为了能把业务问题翻译成正确、稳定、可维护的查询。

## 一、先抓住最常见的查询任务

后端开发里最常见的不是炫技 SQL，而是这些：

- 按主键或唯一键查一条
- 按条件分页查列表
- 按时间排序查最近记录
- 统计数量和聚合数据
- 联表补全展示信息
- 更新状态和批量处理任务

先把这些写稳，已经能解决大部分业务需求。

## 二、基础查询的核心写法

### 1. 单条查询

```sql
SELECT id, email, status
FROM users
WHERE id = $1;
```

原则：

- 不要无脑 `SELECT *`
- 只查需要的列

### 2. 列表查询

```sql
SELECT id, title, created_at
FROM posts
WHERE status = 'published'
ORDER BY created_at DESC
LIMIT 20 OFFSET 0;
```

这里要注意，`OFFSET` 越大越慢，深分页后面通常会转游标分页。

### 3. 条件聚合

```sql
SELECT status, count(*) AS total
FROM jobs
GROUP BY status;
```

## 三、联表查询要先想清楚关系

常见关系：

- 一对一
- 一对多
- 多对多

例如查询订单和用户信息：

```sql
SELECT o.id, o.amount, u.email
FROM orders o
JOIN users u ON u.id = o.user_id
WHERE o.id = $1;
```

写联表 SQL 时，先想清楚：

1. 主表是谁？
2. 关联关系是否唯一？
3. 会不会把结果集放大？

## 四、分页查询最值得先掌握什么

### 1. Offset 分页

简单，但数据量大时性能容易变差。

### 2. Keyset 分页

更适合时间线、消息流、任务列表。

```sql
SELECT id, created_at, content
FROM messages
WHERE conversation_id = $1
  AND created_at < $2
ORDER BY created_at DESC
LIMIT 20;
```

它的好处是：

- 更稳定
- 更容易走索引
- 大翻页成本更低

## 五、更新语句要避免哪些坑

### 1. 忘写条件

```sql
UPDATE jobs
SET status = 'done';
```

这会更新整张表。

### 2. 先查后改但没并发保护

例如额度扣减、库存更新，如果只是“先查再改”，并发下容易出错。

### 3. 批量更新太大

一次改太多行，会带来长事务、锁冲突和 WAL 压力。

## 六、删除语句为什么要谨慎

物理删除前要先想清楚：

- 业务是否需要恢复
- 是否有关联外键
- 是否会导致大事务

如果数据量很大，通常更适合：

- 分批删
- 归档后删
- 软删除

## 七、PostgreSQL 里常见又实用的 SQL 能力

### 1. `RETURNING`

```sql
UPDATE jobs
SET status = 'running'
WHERE id = $1
RETURNING id, status, updated_at;
```

这能少一次查询。

### 2. `ON CONFLICT`

```sql
INSERT INTO user_profiles (user_id, profile)
VALUES ($1, $2)
ON CONFLICT (user_id)
DO UPDATE SET profile = EXCLUDED.profile;
```

适合幂等写入和 upsert。

### 3. `WITH`

适合把复杂查询拆清楚，但不要为了“看起来高级”而滥用。

## 八、面向业务写 SQL 的三个原则

1. 先保证语义正确。
2. 再保证返回列最小化。
3. 最后结合索引和执行计划做优化。

## 这篇最重要的结论

SQL 学习不要停留在语法背诵。真正重要的是：你能不能把业务读写路径写成结构清晰、条件准确、可配合索引优化的查询。
