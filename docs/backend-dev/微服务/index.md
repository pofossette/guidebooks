# 微服务

这一组文档聚焦微服务里最容易一起出现、也最容易在面试里被连环追问的一条主线：

**服务注册与发现 + 指标监控 + 日志聚合 + 分布式追踪 + 遥测标准化**

面向对象仍然是已经会一点 TypeScript / Node.js、但想把“会写接口”升级成“能讲完整微服务治理链路”的开发者。

## 章节

- [00. 微服务可观测性与治理概念速览](./00-%E5%BE%AE%E6%9C%8D%E5%8A%A1%E5%8F%AF%E8%A7%82%E6%B5%8B%E6%80%A7%E4%B8%8E%E6%B2%BB%E7%90%86%E6%A6%82%E5%BF%B5%E9%80%9F%E8%A7%88.md)
- [01. Consul 服务注册与发现快速上手](./01-Consul%20%E6%9C%8D%E5%8A%A1%E6%B3%A8%E5%86%8C%E4%B8%8E%E5%8F%91%E7%8E%B0%E5%BF%AB%E9%80%9F%E4%B8%8A%E6%89%8B.md)
- [02. Prometheus 与 Grafana 快速上手](./02-Prometheus%20%E4%B8%8E%20Grafana%20%E5%BF%AB%E9%80%9F%E4%B8%8A%E6%89%8B.md)
- [03. Loki 日志聚合快速上手](./03-Loki%20%E6%97%A5%E5%BF%97%E8%81%9A%E5%90%88%E5%BF%AB%E9%80%9F%E4%B8%8A%E6%89%8B.md)
- [04. Tempo 与 OpenTelemetry 追踪快速上手](./04-Tempo%20%E4%B8%8E%20OpenTelemetry%20%E8%BF%BD%E8%B8%AA%E5%BF%AB%E9%80%9F%E4%B8%8A%E6%89%8B.md)
- [05. 选型对比与面试表达](./05-%E9%80%89%E5%9E%8B%E5%AF%B9%E6%AF%94%E4%B8%8E%E9%9D%A2%E8%AF%95%E8%A1%A8%E8%BE%BE.md)

## 推荐顺序

1. 先看概念速览，建立 metrics、logs、traces、registry 的位置感。
2. 再看 Consul，理解“服务实例在哪里”和“谁健康”。
3. 接着看 Prometheus + Grafana，再把指标监控主线补齐。
4. 然后看 Loki 与 Tempo，把日志和追踪补成完整闭环。
5. 最后看选型对比，把“会用工具”升级成“能做架构判断”。

## 学习提醒

- 不要把可观测性理解成“装个监控面板”，核心是排障、容量规划和 SLA 治理。
- 不要一上来追求全家桶，先跑通最小闭环：`metrics + logs + traces + dashboard + alert`。
- 不要只背产品名，面试更想听你为什么这样组合、为什么不选另一个。
