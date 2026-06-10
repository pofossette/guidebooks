# 04. 日志、trace 与错误处理

很多团队会写接口，但线上一出问题就看不出来发生了什么。

这通常不是业务不会写，而是中间件层没有把日志、trace 和错误处理收住。

## 一、为什么这些逻辑适合放中间件层

因为它们天然是横切能力：

- 所有请求都要打日志
- 所有请求都应该带追踪信息
- 所有错误都应该收敛成一致格式

如果这些逻辑散落在每个 handler 里，最后一定不一致。

## 二、最小可用日志链路

```mermaid
flowchart LR
    A[request arrive] --> B[assign requestId]
    B --> C[log request start]
    C --> D[handler / service]
    D --> E[log success or error]
    E --> F[log response status and cost]
```

## 三、日志至少要带什么

最小建议：

- `requestId`
- 路由或接口名
- 用户 ID 或租户 ID
- 状态码
- 耗时
- 错误码

如果没有这些字段，排查跨服务问题会很吃力。

## 四、trace 和日志不是一回事

很多人会把它们混用。

可以先粗略记：

- 日志：看具体发生了什么
- trace：看一条请求跨服务经过了哪些节点

如果系统已经开始拆服务、调模型、查缓存、调数据库，trace 价值会越来越大。

## 五、错误处理为什么要统一

一个成熟系统不应该出现这种情况：

- 有的接口错误返回字符串
- 有的接口错误返回 `{ message }`
- 有的接口错误返回 HTML
- 有的接口直接把堆栈吐给前端

更合理的目标是统一成稳定结构，例如：

```ts
type ErrorResponse = {
  code: string;
  message: string;
  requestId: string;
};
```

## 六、哪几类错误要区分

至少区分这三类：

- 输入错误
- 权限或业务规则错误
- 下游依赖错误

这样你在日志、监控、报警里才能快速知道问题属于哪层。

## 七、在 Fastify 里常见放法

常见会这样组合：

- 前置 hook 生成 `requestId`
- `onResponse` 记录访问日志和耗时
- 全局错误处理统一返回格式
- logger 通过插件注册并注入上下文

## 八、一个很实际的坏味道

如果你看到项目里：

- 每个 handler 各自 `console.error`
- 日志字段命名不统一
- 错误没有稳定 `code`
- 前端只能看 `500 Internal Server Error`

那就说明中间件层还没承担起治理职责。

## 九、这篇最重要的结论

日志、trace 和错误处理的目标不是“多打点东西”，而是让请求在出问题时仍然可解释、可定位、可追踪。
