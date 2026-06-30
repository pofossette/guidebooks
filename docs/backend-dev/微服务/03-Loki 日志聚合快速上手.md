# 03. Loki 日志聚合快速上手

## 一、Loki 的定位

Loki 是 Grafana 生态里的日志系统。

它最常被强调的一点不是“功能一定比 ELK 多”，而是：

**它更强调和 Prometheus 类似的标签化思路，索引成本通常更轻。**

所以很多团队会把它当成：

- 日志检索平台
- 与 Grafana 联动的日志入口
- 相对更轻量的日志聚合方案

## 二、Loki 适合解决什么问题

最典型的问题有：

- 某个服务在某个时间点具体报了什么错
- 某个 trace ID 对应的日志有哪些
- 某个 pod / instance 最近异常日志是否激增

它回答的是“具体发生了什么”，不是“整体趋势怎样”。

## 三、最小接入链路

可以把 Loki 理解成下面这条路：

```text
应用输出结构化日志
  -> Agent / Collector 收集
  -> Loki 存储与检索
  -> Grafana 查询与联动
```

今天更务实的做法通常是：

- 应用输出 JSON 结构化日志
- 用 `Grafana Alloy` 或 OpenTelemetry Collector 做采集转发
- 在 Grafana 中按标签、关键字、trace ID 查询

## 四、Node.js / TS 服务日志应该怎么打

第一原则：

**先把日志打规范，再谈聚合。**

建议至少包含：

- `timestamp`
- `level`
- `service`
- `message`
- `trace_id`
- `span_id`
- `request_id`

如果日志还是随手 `console.log("出错了", err)`，后面接 Loki 也只是把混乱集中起来。

## 五、标签该怎么选

更常见、也更安全的标签：

- `service`
- `env`
- `instance`
- `level`
- `region`

不要轻易把这些做成标签：

- 用户 ID
- 订单 ID
- trace ID 全量
- 随机 request body 字段

原因和指标一样：高基数会带来成本和性能问题。

## 六、Loki vs ELK 怎么理解

一句话版：

- `Loki` 更偏轻量、和 Grafana 生态结合紧、运维复杂度相对低
- `ELK` 功能更全面、生态更重、搜索和日志分析能力更强

典型取舍：

| 维度 | Loki | ELK |
|---|---|---|
| 运维复杂度 | 相对低 | 相对高 |
| 与 Grafana 集成 | 很强 | 需要额外组合 |
| 存储与索引成本 | 通常更轻 | 往往更重 |
| 复杂搜索分析 | 能做常见场景 | 往往更强 |
| 团队上手成本 | 较低 | 较高 |

## 七、落地时的几个实用建议

### 1. 强制结构化日志

不要让不同服务各写各的格式。

### 2. 把 trace_id 打进日志

这样日志和链路追踪才能串起来。

### 3. 日志分级要克制

- `info` 放关键业务事件
- `warn` 放可恢复异常
- `error` 放失败与告警入口

不要把一切都打成 `error`。

### 4. 敏感字段要脱敏

尤其是：

- 手机号
- 身份证号
- token
- 地址
- 支付信息

## 八、面试回答模板

> Loki 更适合做和 Grafana 生态配套的日志聚合，特点是标签模型相对统一、运维复杂度通常比 ELK 低一些。我的接入思路通常是先统一 JSON 结构化日志，再通过 Alloy 或 Collector 收集到 Loki，并把 trace_id 放进日志里，这样可以从 Grafana 面板直接跳日志和 trace。

## 九、官方资料入口

- Loki Get Started：
  `https://grafana.com/docs/loki/latest/get-started/overview/`
- Grafana Alloy 文档：
  `https://grafana.com/docs/alloy/latest/`
- Grafana Loki 文档首页：
  `https://grafana.com/docs/loki/latest/`
