# SWE-bench

## 来源

- arXiv：https://arxiv.org/abs/2310.06770
- 项目：https://github.com/SWE-bench/SWE-bench

## 结论

SWE-bench 通过真实仓库、真实 GitHub issue 和可执行的隐藏测试评估仓库级修复，使任务结果尽可能由可复现测试而非主观 judge 决定。

## 问题与设定

给定一个代码仓库和一个 GitHub issue，要求模型或 Agent 生成 patch 修复问题。

## 核心基准设计

评测由真实仓库快照、真实 issue、Agent 产出的 patch、Docker 复现环境以及测试或 hidden tests 组成。官方项目明确使用 Docker 实现可复现评测，并生成 build logs、evaluation logs 和 evaluation_results。

## 评估内容与使用方式

在指定仓库快照中让 Agent 根据 issue 生成 patch，并在 Docker 环境执行测试和 hidden tests 验证是否解决问题。它适合评估代码 Agent 对 repository state 负责的仓库级修复能力。

## 局限与边界

- 它聚焦代码仓库修复，不能替代工具调用、浏览器、桌面操作或长期记忆评测。
- 需要 Docker 复现环境和日志产物。
- 它偏向 outcome verifier；过程中的策略合理性仍需与 trajectory judge 类评测区分。
