可以。根据这篇文章《技术教科书：顶级开发团队设计的 Harness 工程项目源码什么样》里对 **Part 3 工具系统** 和 **Part 4 查询引擎** 的描述，我把“工具系统”整理成一张更适合快速理解的流程图。文章把它概括为：**工具系统是能力基座，查询引擎是大脑回路**；工具系统强调 **类型安全、fail-closed 安全默认、条件加载、工具池组装、流式并行执行**，并与查询主循环配合完成调用。([腾讯新闻][1])

```mermaid
flowchart TD
    A[用户请求 / 新任务] --> B[QueryEngine.submitMessage]
    B --> C[构建系统提示词<br/>解析附件/命令/上下文]
    C --> D[进入 query() 主循环]

    D --> E[预处理阶段<br/>技能预取 / 工具结果预算 / 上下文压缩]
    E --> F[刷新可用工具池]

    F --> G[getAllBaseTools()<br/>加载内建工具]
    G --> G1[编译期开关<br/>feature enabled]
    G --> G2[运行期开关<br/>环境变量 USER_TYPE]
    G --> G3[能力检测开关<br/>如 embedded search]
    F --> H[MCP Tools]
    H --> I[Deny Rules 过滤]
    G1 --> J[assembleToolPool()]
    G2 --> J
    G3 --> J
    I --> J

    J --> K[内建工具排序]
    J --> L[MCP 工具排序]
    K --> M[拼接 + 去重<br/>保证 prompt cache 稳定]
    L --> M

    M --> N[调用模型 API（流式）]
    N --> O{模型是否选择调用工具?}

    O -- 否 --> P[直接生成回复]
    O -- 是 --> Q[选中某个 Tool]

    Q --> R[Tool 接口校验<br/>inputSchema / validateInput]
    R --> S[工具自身权限检查<br/>checkPermissions]
    S --> T[通用权限系统]
    T --> U[Permission Mode]
    U --> V[Auto Classifier 兜底]
    V --> W{允许执行?}

    W -- 否 --> X[拒绝 / 需确认 / 改写输入]
    W -- 是 --> Y[StreamingToolExecutor]

    Y --> Z{isConcurrencySafe?}
    Z -- 是 --> AA[可与其他并发安全工具并行]
    Z -- 否 --> AB[独占执行]
    AA --> AC[输出进度 / 结果]
    AB --> AC

    AC --> AD[工具结果写回消息流]
    AD --> AE[后采样 Hooks / 中断处理 / Token 预算检查]
    AE --> AF{是否继续下一轮?}
    AF -- 是 --> D
    AF -- 否 --> P

    subgraph ToolDefinition[Tool 定义层]
        TD1[buildTool()]
        TD2[Fail-Closed 默认值]
        TD3[默认: isConcurrencySafe = false]
        TD4[默认: isReadOnly = false]
        TD5[默认: 漏配即走最保守路径]
        TD1 --> TD2 --> TD3
        TD2 --> TD4
        TD2 --> TD5
    end

    TD1 -. 统一生成 .-> G
    TD5 -. 安全基线 .-> R
```

你也可以把它理解成 5 层：

1. **工具定义层**：每个工具都实现统一 `Tool<Input, Output, Progress>` 接口，包含 `inputSchema`、`call`、`checkPermissions`、`isReadOnly`、`isConcurrencySafe` 等能力。([腾讯新闻][1])
2. **工具注册层**：`getAllBaseTools()` 统一注册内建工具，并通过编译期开关、环境变量和能力检测决定哪些工具实际可用。([腾讯新闻][1])
3. **工具池组装层**：`assembleToolPool()` 把内建工具和 MCP 工具合并，分别排序后再拼接，目的是保持 prompt cache 稳定，而不是简单混排。([腾讯新闻][1])
4. **权限与安全层**：文章明确给出了五层纵深防御：**Deny Rules → Tool-level Permissions → Generic Rules → Permission Mode → Auto Classifier**；同时 `buildTool()` 的默认值是 fail-closed，遗漏配置时按最保守策略处理。([腾讯新闻][1])
5. **执行层**：`StreamingToolExecutor` 根据 `isConcurrencySafe` 决定并行还是独占执行。像 `GlobTool`、`GrepTool`、`FileReadTool` 可并行，`BashTool`、`FileEditTool` 一类则要独占。([腾讯新闻][1])

这套系统和普通“模型直接调工具”的最大不同，在于它不是一条直线，而是嵌进了 `query()` 主循环里。文章说这个主循环有 **16 个步骤**，其中只有 **第 8 步** 是“调用模型”，其余大部分都是预算、压缩、验证、工具执行、恢复和继续条件判断，所以本质上它更像一个**受控状态机**，而不是一个简单的 ReAct 回路。([腾讯新闻][1])

一句话总结：

**这篇文章里的工具系统 = “保守默认的工具定义 + 条件化注册 + 稳定排序组装 + 五层权限防线 + 流式并发执行 + 嵌入 query 主循环的状态机式控制”。** ([腾讯新闻][1])

我还可以把这张图继续改成更适合汇报的版本，比如：

* “极简版 1 页图”
* “PPT 风格中文框图”
* “面向非技术同学的解释版”

[1]: https://news.qq.com/rain/a/20260409A06IGX00 "技术教科书：顶级开发团队设计的Harness工程项目源码什么样_腾讯新闻"
