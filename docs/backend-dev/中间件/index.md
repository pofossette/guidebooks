# 中间件

这一组文档面向已经有一点 `Node.js / TypeScript` 基础、但希望把 `Fastify` 请求链路、中间件、`hook`、插件机制系统补齐的开发者。

这一专题的重点不是把所有生态插件列一遍，而是先把几个最容易混淆的问题讲清楚：

- `Express` 风格 `middleware` 和 `Fastify hook` 有什么区别
- 什么逻辑该写进 `plugin`，什么逻辑该写进 `preHandler`
- 鉴权、校验、日志、错误处理、限流这些横切逻辑应该怎么放

参考资料：

- Fastify Hooks: https://fastify.dev/docs/latest/Reference/Hooks/
- Fastify Plugins: https://fastify.dev/docs/latest/Reference/Plugins/
- Fastify Middleware: https://fastify.dev/docs/latest/Reference/Middleware/
- Fastify TypeScript: https://fastify.dev/docs/latest/Reference/TypeScript/

## 章节

- [00. 中间件概念速览](./00-中间件概念速览.md)
- [01. 请求链路与中间件定位](./01-请求链路与中间件定位.md)
- [02. Fastify 的 middleware、hook 与 plugin](./02-Fastify 的 middleware hook 与 plugin.md)
- [03. 鉴权、校验与上下文注入](./03-鉴权 校验与上下文注入.md)
- [04. 日志、trace 与错误处理](./04-日志 trace 与错误处理.md)
- [05. 限流、CORS 与安全头](./05-限流 CORS 与安全头.md)
- [06. 面向 TypeScript 的工程组织方式](./06-面向 TypeScript 的工程组织方式.md)

## 推荐顺序

1. 先看概念速览和请求链路，搞清中间件到底是在请求生命周期的哪一层工作。
2. 再看 `middleware / hook / plugin` 的区别，这是 `Fastify` 最核心的心智模型。
3. 接着看鉴权、校验、日志、错误处理和限流，把横切逻辑放到正确位置。
4. 最后看 TypeScript 工程组织方式，把这些概念落到可维护的目录结构上。

## 学习提醒

- 在 `Fastify` 里，不要把所有横切逻辑都习惯性理解成 `Express middleware`。
- 真正高频的工程动作通常是：注册插件、声明装饰器、挂 `hook`、做 schema 校验。
- 中间件专题最重要的不是“会调插件”，而是“知道某段逻辑为什么应该放在这一层，而不是另一层”。
