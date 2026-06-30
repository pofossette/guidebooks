# 02. Prometheus 与 Grafana 快速上手

## 一、Prometheus 和 Grafana 分别负责什么

很多初学者会把这两个混成一个东西，其实职责很清楚：

- `Prometheus` 负责抓取、存储和查询指标
- `Grafana` 负责把指标展示成图表和面板

可以理解成：

```text
业务服务暴露 /metrics
    -> Prometheus 定时抓取
    -> PromQL 查询分析
    -> Grafana 展示与告警
```

## 二、为什么 Prometheus 常被当成默认方案

原因通常有 4 个：

- 云原生生态里非常通用
- Pull 模型简单直观
- PromQL 很适合时序指标查询
- 配合 Grafana 的可视化成本低

它最适合回答的问题是：

- 某服务 QPS 是多少
- 错误率有没有升高
- 延迟分位数有没有恶化
- 某个 worker 是否积压

## 三、快速上手时先暴露哪些指标

Node.js / TS 服务第一批就够了：

- 请求总数
- 请求耗时直方图
- 错误总数
- 进程 CPU / 内存
- 数据库或 MQ 调用耗时

如果你什么都还没做，先保证服务有一个 `/metrics` 端点。

## 四、推荐的最小指标集

### 1. HTTP 请求类

- `http_requests_total`
- `http_request_duration_seconds`
- `http_requests_in_flight`

### 2. 业务稳定性类

- `job_failures_total`
- `retry_total`
- `timeout_total`

### 3. 资源类

- `process_cpu_seconds_total`
- `process_resident_memory_bytes`

### 4. 中间件类

- `redis_operation_duration_seconds`
- `db_query_duration_seconds`
- `mq_consumer_lag`

## 五、Grafana 面板先做什么

一个服务最少准备 4 组图：

1. QPS
2. 错误率
3. P95 / P99 延迟
4. CPU / 内存 / 队列积压

这套图已经能覆盖绝大多数线上排障入口。

## 六、Prometheus 落地时的关键认知

### 1. 不要乱打高基数标签

比如下面这些就很危险：

- 用户 ID
- 订单 ID
- trace ID
- URL 原始路径里带动态参数

高基数会让指标爆炸，Prometheus 压力很快变大。

更合适的标签：

- `method`
- `route`
- `status_code`
- `service`

### 2. 指标是聚合视角，不是日志替代品

指标适合看趋势和告警，不适合还原单次异常细节。

要查单次错误，还是得看：

- 日志
- Trace

### 3. 告警不要只盯 CPU

业务里更值得盯的是：

- 错误率
- P95 / P99 延迟
- MQ 积压
- 下游超时率
- 任务失败率

## 七、Prometheus vs DataDog 怎么答

一句话版：

- `Prometheus` 更偏开源自建、灵活、成本可控
- `DataDog` 更偏托管平台、开箱即用、功能整合度高

典型权衡：

| 维度 | Prometheus | DataDog |
|---|---|---|
| 成本 | 自建可控 | 通常更贵 |
| 厂商锁定 | 低 | 相对更高 |
| 上手速度 | 需要自己搭 | 通常更快 |
| 自定义能力 | 高 | 也强，但受平台约束 |
| 运维投入 | 需要团队承担 | 托管较多 |

## 八、面试回答模板

> Prometheus 负责采集和存储时序指标，Grafana 负责展示和告警。我通常会先给服务暴露 `/metrics`，重点放请求量、错误率、延迟分位数和中间件耗时。指标主要用来看趋势、做 SLA 告警；查具体报错则要结合日志和 trace。

## 九、官方资料入口

- Prometheus Getting Started：
  `https://prometheus.io/docs/prometheus/latest/getting_started/`
- Prometheus 文档首页：
  `https://prometheus.io/docs/introduction/overview/`
- Grafana 文档首页：
  `https://grafana.com/docs/grafana/latest/`
