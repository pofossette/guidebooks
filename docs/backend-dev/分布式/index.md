# 分布式

这一组文档面向 **0 基础转后端**、但已经接触过 TypeScript/Node.js 的同学。内容参考 JavaGuide 的分布式系统整理，并按后端开发中常见专题拆分。

参考资料：

- JavaGuide: https://interview.javaguide.cn/distributed-system/distributed-system.html

## 基本思路

分布式这部分最适合先按 4 条主线理解：

### 1. 一致性与可用性的权衡

- CAP
- BASE
- 最终一致性
- 共识算法

### 2. 跨节点通信与治理

- RPC
- 注册与发现
- API 网关
- 配置中心

### 3. 分布式数据一致性问题

- 分布式 ID
- 分布式锁
- 分布式事务

### 4. 典型中间件与落地场景

- etcd / Consul
- APISIX / Kong / Envoy
- gRPC / Connect-RPC / tRPC
- RabbitMQ / Kafka / Redis Streams / BullMQ

先把这 4 条主线看顺，再去学具体协议和组件，会更容易建立系统感。

## 章节

- [01. 分布式基础理论](./01-分布式基础理论.md)
- [02. 分布式算法与共识](./02-分布式算法与共识.md)
- [03. 分布式锁](./03-分布式锁.md)
- [04. 分布式 ID](./04-分布式 ID.md)
- [05. 配置中心](./05-配置中心.md)
- [06. API 网关](./06-API 网关.md)
- [07. RPC 框架](./07-RPC 框架.md)
- [08. 服务注册与发现](./08-服务注册与发现.md)
- [09. 消息队列与最终一致性](./09-消息队列与最终一致性.md)
- [10. 分布式事务](./10-分布式事务.md)
