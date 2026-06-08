# 07. RPC 框架

## 一、什么是 RPC

RPC 是 Remote Procedure Call，远程过程调用。

通俗理解：

**像调用本地函数一样调用远程服务。**

例如在订单服务里调用库存服务：

```ts
await inventoryClient.reserveStock({
  skuId: "sku_1",
  count: 2,
});
```

代码看起来像普通函数调用，但实际上背后发生了：

- 序列化请求
- 网络传输
- 远程服务处理
- 返回结果反序列化

## 二、RPC 和 HTTP REST 的区别

| 对比 | REST API | RPC |
|---|---|---|
| 关注点 | 资源 | 方法/动作 |
| 常见形式 | `GET /orders/1` | `OrderService.GetOrder` |
| 接口描述 | OpenAPI | Protobuf/IDL |
| 适用场景 | 对外 API、通用 Web API | 服务内部调用、高性能调用 |

REST 更像“访问资源”，RPC 更像“调用方法”。

## 三、RPC 框架解决什么问题

RPC 框架通常提供：

- 服务接口定义
- 客户端代码生成
- 序列化和反序列化
- 连接管理
- 超时控制
- 重试
- 负载均衡
- 服务发现集成
- 链路追踪

没有框架也能用 HTTP 调服务，但框架会把大量通用能力标准化。

## 四、gRPC

gRPC 是常见 RPC 框架。

它通常使用：

- Protocol Buffers 定义接口
- HTTP/2 作为传输基础
- 多语言代码生成
- 支持 unary、streaming 等调用方式

一个简单 proto 接口可能长这样：

```proto
service InventoryService {
  rpc ReserveStock (ReserveStockRequest) returns (ReserveStockResponse);
}

message ReserveStockRequest {
  string sku_id = 1;
  int32 count = 2;
}

message ReserveStockResponse {
  bool success = 1;
}
```

## 五、RPC 的最大坑：远程调用不是本地调用

RPC 最大的迷惑性是：代码看起来像本地函数，但本质是网络调用。

远程调用会遇到：

- 超时
- 失败
- 重试导致重复请求
- 服务不可用
- 版本不兼容
- 序列化成本

所以写 RPC 调用时必须考虑：

- 超时时间
- 幂等性
- 重试策略
- 降级方案
- 错误码约定

## 六、TS 生态里的选择

TS/Node 后端常见选择：

| 方案 | 说明 |
|---|---|
| REST + OpenAPI | 简单、通用、适合对外 API |
| gRPC | 多语言、高性能、适合内部服务 |
| tRPC | TS 全栈类型推导强，适合同语言栈 |
| GraphQL | 客户端灵活查询，适合复杂前端数据组合 |

不要只看“先进”，要看团队和系统边界：

- 对外开放 API：REST/OpenAPI 更通用
- 多语言内部服务：gRPC 常见
- 前后端都 TS：tRPC 可以提高开发效率

## 七、RPC 和服务治理

RPC 一旦进入生产，会自然牵出服务治理：

- 服务注册与发现
- 负载均衡
- 超时重试
- 熔断降级
- 限流
- 认证授权
- 链路追踪

所以 RPC 不是只选一个调用库，它背后是一整套服务间通信治理。

## 八、初学者建议

学习顺序建议：

1. 先熟悉 REST API
2. 理解 HTTP、状态码、超时和错误处理
3. 再学 gRPC 或 tRPC
4. 最后理解服务发现、负载均衡、熔断重试

对 0 基础转后端来说，先把“远程调用会失败”刻进脑子，比记住某个 RPC 框架 API 更重要。

