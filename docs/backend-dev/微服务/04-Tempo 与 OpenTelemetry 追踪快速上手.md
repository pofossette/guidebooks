# 04. Tempo 与 OpenTelemetry 追踪快速上手

## 一、先分清 Tempo 和 OpenTelemetry

这两个很容易一起出现，但不是同一层东西。

- `Tempo` 是追踪后端，负责存储和查询 trace
- `OpenTelemetry` 是采集标准和 SDK / Collector 生态

所以更准确的说法是：

**用 OpenTelemetry 产生并传输 trace，用 Tempo 接收、存储和查询 trace。**

## 二、为什么 trace 很重要

指标告诉你“哪里有问题”，日志告诉你“报了什么错”，而 trace 回答：

- 一个请求依次经过了哪些服务
- 每一跳花了多久
- 最慢的 span 是谁
- 错误是在网关、服务、数据库还是外部 API

当系统开始跨网关、BFF、应用服务、数据库、MQ 时，trace 的价值会急剧上升。

## 三、最小接入链路

```text
应用接入 OpenTelemetry SDK
  -> 生成 trace / span
  -> 通过 OTLP 发给 Collector 或 Tempo
  -> Tempo 存储
  -> Grafana 查询链路
```

如果是团队第一次接入，推荐顺序是：

1. 先接应用侧 OTel SDK
2. 再统一接入 OTel Collector
3. 最后把数据汇到 Tempo

这样后面换追踪后端或加采样策略都更灵活。

## 四、你至少要理解的 4 个对象

### 1. Trace

一次完整请求链路。

### 2. Span

链路里的一段操作，比如：

- HTTP 请求
- 调数据库
- 调 Redis
- 发 MQ

### 3. Context Propagation

跨服务传递上下文，让下游 span 能挂到同一个 trace 下。

### 4. Sampling

不是所有请求都必须全量留 trace，否则成本会很高。

## 五、Node.js / TS 快速上手重点

Node 服务接 OTel 时，先保证三件事：

1. HTTP 服务被自动或手动埋点。
2. 常见客户端库有对应 instrumentation。
3. trace context 能跨服务传递。

优先埋的地方：

- HTTP server
- HTTP client / fetch / axios
- PostgreSQL / MySQL
- Redis
- MQ producer / consumer

## 六、Tempo vs Jaeger 怎么答

一句话版：

- `Tempo` 更适合 Grafana 生态一体化与对象存储型思路
- `Jaeger` 是更经典、认知更广的分布式追踪方案

常见取舍：

| 维度 | Tempo | Jaeger |
|---|---|---|
| 与 Grafana 集成 | 很强 | 需要组合 |
| 存储思路 | 常强调低索引、对象存储 | 传统认知更广 |
| 团队熟悉度 | 新一点但增长快 | 很多团队更熟 |
| 面试辨识度 | 云原生新栈感更强 | 经典方案更稳 |

## 七、OpenTelemetry 为什么面试价值高

因为它代表的不是单个产品，而是：

- 遥测数据的统一标准
- SDK 与 Collector 的统一接入方式
- 厂商与后端解耦的思路

你只会某个 APM 产品，和你理解 OTel，差距很大。

会讲 OTel，通常说明你知道：

- 应用如何埋点
- 上下文如何传播
- 数据如何经 Collector 转发
- 后端如何替换而不重写业务埋点

## 八、落地时最容易漏掉的点

### 1. 日志要带 trace_id

这样才能从 trace 跳日志，从日志反查 trace。

### 2. 指标、日志、trace 要用统一服务名

否则 Grafana 里很难联动查询。

### 3. 采样策略要按环境分开

- 开发环境可以更高
- 生产环境通常要控制成本

### 4. 异步链路要补传播

跨 MQ、定时任务、事件总线时，context propagation 很容易断。

## 九、面试回答模板

> 我会把 OpenTelemetry 当成遥测标准，把 Tempo 当成 trace 后端。服务里先接 OTel SDK，埋 HTTP、数据库、Redis、MQ 等关键 span，再通过 OTLP 发到 Collector 或 Tempo。这样 Grafana 里就能把指标、日志和 trace 串起来。相比直接绑死某个 APM，OTel 的价值在于标准统一、后端可替换、跨语言一致。

## 十、官方资料入口

- OpenTelemetry JS Node.js Getting Started：
  `https://opentelemetry.io/docs/languages/js/getting-started/nodejs/`
- OpenTelemetry 文档首页：
  `https://opentelemetry.io/docs/`
- Tempo Get Started：
  `https://grafana.com/docs/tempo/latest/getting-started/`
- Tempo 文档首页：
  `https://grafana.com/docs/tempo/latest/`
