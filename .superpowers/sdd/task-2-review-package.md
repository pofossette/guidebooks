Task 2 review package

## verification
- mkdocs build: passed via `uv run mkdocs build -f mkdocs.yml` (site-wide warnings exist outside this task)
- mermaid check: passed via `pnpm run check:mermaid`

### docs/ai-coding/coding-agents/design-principles/ui-runtime-decoupling.md
     1	# UI、Runtime 与状态边界：为什么解耦不是“前后端分层”这么简单
     2	
     3	这一篇只回答一个问题：AI 编码 agent 为什么必须把 `UI`、`runtime`、`provider`、`state` 拆开，而且三家为什么拆得不一样。
     4	
     5	结论先说在前面：
     6	
     7	- `Claude Code` 更像“交互壳 + 会话运行时”的解耦，重点是让同一套 query/tool/session 逻辑同时服务 REPL、SDK 和 bridge。
     8	  - 证据类型：本地源码。`claude-code-src/src/QueryEngine.ts`、`src/Tool.ts`、`src/bootstrap/state.ts`、`src/bridge/bridgeMessaging.ts`
     9	- `OpenCode` 更像“位置感知 runtime + 可替换 control plane”的解耦，UI 不是中心，`Location`、`SessionRunner`、`ToolRegistry`、`Context Epoch` 才是中心。
    10	  - 证据类型：官方文档。`opencode/specs/v2/session.md`
    11	  - 证据类型：本地源码。`opencode/packages/core/src/session/context-epoch.ts`、`src/tool/registry.ts`、`src/permission.ts`
    12	- `Codex` 更像“协议对象 + app-server + 状态数据库”的解耦，UI 只是某种 client，线程和回合状态才是一等公民。
    13	  - 证据类型：本地源码。`codex/codex-rs/app-server-protocol/src/protocol/v2/thread.rs`、`thread_data.rs`、`codex-rs/state/src/lib.rs`
    14	
    15	## 问题：为什么不能把 UI 直接绑死在 agent loop 上
    16	
    17	如果 UI 直接长在 agent loop 里，会立刻遇到四个问题：
    18	
    19	1. 同一套执行逻辑很难同时服务 CLI、桌面端、SDK、远程控制。
    20	2. provider 切换会把 UI 行为一起拖动，导致状态边界混乱。
    21	3. 恢复、续跑、审计只能依赖“聊天记录”，而不是稳定状态。
    22	4. 子 agent、后台任务、权限回调很容易沦为 UI 特判。
    23	
    24	下面这张图给出三家都在解决的抽象问题，但实现重点完全不同：
    25	
    26	```mermaid
    27	flowchart TD
    28	  UI[UI / Client] --> Runtime[Agent Runtime]
    29	  Runtime --> Provider[Model Provider]
    30	  Runtime --> ToolPlane[Tool Plane]
    31	  Runtime --> State[(State / Session / Thread)]
    32	  ToolPlane --> OS[OS / Filesystem / Network]
    33	  State --> Recover[恢复 / 续跑 / 审计]
    34	```
    35	
    36	## Claude Code：先把“会话运行时”从 REPL 中抽出来
    37	
    38	### 它怎么拆
    39	
    40	`Claude Code` 的核心不是把前端做得多薄，而是把 `query lifecycle` 从 REPL 中抽成 `QueryEngine`。源码直接写明：`QueryEngine owns the query lifecycle and session state for a conversation`，并强调它既服务 headless/SDK，也为未来 REPL 共用做准备。
    41	
    42	- `QueryEngine` 持有消息、权限拒绝、usage、文件缓存、技能发现等会话级状态。
    43	  - 证据类型：本地源码。`claude-code-src/src/QueryEngine.ts`
    44	- `ToolUseContext` 把 tool、permission、hook、notification、UI callback、state setter 放在同一个运行时接口里，但允许部分 UI 能力在 headless 模式缺席。
    45	  - 证据类型：本地源码。`claude-code-src/src/Tool.ts`
    46	- `bootstrap/state.ts` 持有大量 session-scoped runtime state，例如 hooks、系统提示词缓存、prompt cache、日志、telemetry、session-only flags。
    47	  - 证据类型：本地源码。`claude-code-src/src/bootstrap/state.ts`
    48	- bridge 层只转发“对远端有意义的消息”，明确过滤内部 REPL chatter、tool progress 等本地噪音。
    49	  - 证据类型：本地源码。`claude-code-src/src/bridge/bridgeMessaging.ts`
    50	
    51	### 这说明了什么
    52	
    53	`Claude Code` 的 UI/runtime 解耦不是“有个前端有个后端”，而是：
    54	
    55	- REPL、bridge、SDK 是不同外壳。
    56	- 真正共享的是 conversation runtime。
    57	- UI 层可以附加标题提取、状态显示、权限弹窗，但不拥有核心执行状态。
    58	
    59	### trade-off
    60	
    61	- 好处：同一套 agent loop 可以较快复用到 CLI、Remote Control、SDK。
    62	- 代价：`ToolUseContext` 和 bootstrap state 很肥，说明运行时虽然脱离了单一 UI，但仍然偏单体会话对象。
    63	- 推断：这类设计更容易快速演进交互体验，但要把状态进一步拆成严格协议对象会更难。
    64	  - 证据类型：推断。依据是 `QueryEngine`、`ToolUseContext`、`bootstrap/state.ts` 的高聚合状态形态。
    65	
    66	## OpenCode：UI 退后，Location-aware runtime 站到中间
    67	
    68	### 它怎么拆
    69	
    70	`OpenCode` 的 V2 设计文档几乎把“UI”降成次要问题，主叙事是：
    71	
    72	- `sessions.prompt` 先进入 durable `session_input` inbox，再由 `SessionExecution.resume(sessionID)` 驱动运行。
    73	  - 证据类型：官方文档。`opencode/specs/v2/session.md`
    74	- `SessionRunner`、catalog、model resolver、tool registry、permission、filesystem 都缓存并挂在 `Location` 上，而不是挂在某个页面组件上。
    75	  - 证据类型：官方文档。`opencode/specs/v2/session.md`
    76	- `Context Epoch` 把“给模型看的系统上下文”做成独立持久层，和普通 UI 会话状态分离。
    77	  - 证据类型：本地源码。`opencode/packages/core/src/session/context-epoch.ts`
    78	- `ToolRegistry` 负责工具物化和结算，权限过滤只影响广告出来的 catalog，不把 registry 自己和 UI 绑死。
    79	  - 证据类型：本地源码。`opencode/packages/core/src/tool/registry.ts`
    80	
    81	### 这说明了什么
    82	
    83	`OpenCode` 的边界更接近下面这张图：
    84	
    85	```mermaid
    86	flowchart LR
    87	  UI[Console / App / SDK] --> CP[Control Plane]
    88	  CP --> SessionExec[SessionExecution / SessionRunner]
    89	  SessionExec --> Ctx[Context Epoch]
    90	  SessionExec --> Registry[ToolRegistry]
    91	  SessionExec --> Perm[PermissionV2]
    92	  SessionExec --> Provider[llm.stream]
    93	  SessionExec --> Event[(EventV2 / Session History)]
    94	```
    95	
    96	它把“当前是什么界面”降级为入口差异，把“当前 Session 在哪个 Location、有哪些可用工具、上下文基线是什么、权限如何裁剪”升格为 runtime 的主角。
    97	
    98	### trade-off
    99	
   100	- 好处：provider、workspace、remote/local placement、权限和工具都能在 runtime 层组合，不必围着 UI 做特判。
   101	- 代价：抽象层明显更重，`Session`、`Location`、`Context Epoch`、`EventV2`、`ToolRegistry` 的理解门槛比交互式 CLI 高。
   102	- 推断：这类设计更适合做“可嵌入平台”或多前端承载，而不是只做一个终端代理。
   103	  - 证据类型：推断。依据是 `session.md` 对 `Location`、`SessionRunner`、`Context Epoch` 的中心化设计。
   104	
   105	## Codex：把 UI 彻底降格为协议客户端
   106	
   107	### 它怎么拆
   108	
   109	`Codex` 的第一观察点不是 TUI，而是 `thread` 协议对象：
   110	
   111	- `ThreadStartParams` 和 `ThreadStartResponse` 直接建模了 model、provider、cwd、workspace roots、approval policy、sandbox、dynamic tools、instruction sources。
   112	  - 证据类型：本地源码。`codex/codex-rs/app-server-protocol/src/protocol/v2/thread.rs`
   113	- `Thread`、`Turn`、`TurnItemsView` 把线程、回合、项目载荷的可见性做成稳定协议，而不是 UI 内部结构。
   114	  - 证据类型：本地源码。`codex/codex-rs/app-server-protocol/src/protocol/v2/thread_data.rs`
   115	- `state` crate 单独维护 SQLite-backed rollout metadata、goal、thread metadata、audit rows。
   116	  - 证据类型：本地源码。`codex/codex-rs/state/src/lib.rs`
   117	
   118	### 这说明了什么
   119	
   120	`Codex` 的典型形态更接近：
   121	
   122	```mermaid
   123	flowchart TD
   124	  Client[CLI / IDE / App Client] --> Protocol[App Server Protocol]
   125	  Protocol --> ThreadRuntime[Thread / Turn Runtime]
   126	  ThreadRuntime --> Goal[Goal Runtime]
   127	  ThreadRuntime --> Tools[Tool + Approval + Sandbox]
   128	  ThreadRuntime --> StateDB[(SQLite State / Audit / Logs)]
   129	  StateDB --> Resume[恢复 / Fork / Read / Review]
   130	```
   131	
   132	UI 在这里当然重要，但它的重要性主要体现在“协议消费者”，而不是“运行时宿主”。
   133	
   134	### trade-off
   135	
   136	- 好处：线程生命周期、设置更新、恢复、fork、review 都可以稳定落到协议和状态库上。
   137	- 代价：系统实现成本更高，很多能力必须经过 app-server 协议和状态持久化层才能落地。
   138	- 关键差异：它不是把 UI 和 runtime 稍微分开，而是把 runtime 先协议化、再让 UI 消费。
   139	  - 证据类型：本地源码。`thread.rs`、`thread_data.rs`、`state/src/lib.rs`
   140	
   141	## 并排比较：三家到底哪里不同
   142	
   143	| 维度 | Claude Code | OpenCode | Codex |
   144	|---|---|---|---|
   145	| UI 的相对地位 | 强交互外壳，但核心 loop 已抽离 | UI 只是 runtime 入口之一 | UI 更像协议 client |
   146	| runtime 的中心对象 | 会话 query engine | session runner + location | thread + turn |
   147	| provider 边界 | 嵌在 query/runtime 里 | 明确是 runner 的一层依赖 | 通过线程协议与 app-server 配置暴露 |
   148	| state 的主落点 | 会话内状态 + 恢复辅助 | inbox / event / context epoch / session history | thread state / goal / audit / logs |
   149	| 最容易误写的点 | 误写成“终端 UI 驱动一切” | 误写成“只是另一个 CLI” | 误写成“只是 prompt 更强” |
   150	
   151	## 设计启发
   152	
   153	1. 如果你先做的是交互式 CLI，至少也要尽早把 conversation runtime 从 UI 组件里抽出来。这是 `Claude Code` 给的最低门槛。
   154	2. 如果你要支持多宿主、多 workspace、远端/本地混跑，应该优先把 `Location / Session / ToolRegistry / Permission` 作为 runtime 主轴，而不是继续堆 UI 特判。这是 `OpenCode` 的启发。
   155	3. 如果你要做可恢复、可审计、可多客户端消费的系统，线程和回合必须先变成协议对象，状态必须脱离 UI 存活。这是 `Codex` 的启发。
   156	
   157	最后给一个稳妥判断：
   158	
   159	- `Claude Code` 的解耦重点是“把运行时从单一 REPL 抽出”。
   160	- `OpenCode` 的解耦重点是“把运行时提升为独立 control plane”。
   161	- `Codex` 的解耦重点是“把运行时协议化并持久化”。
   162	
   163	这三者不是同一种架构的轻微变体。

### docs/ai-coding/coding-agents/design-principles/tool-protocol-and-control-plane.md
     1	# 工具协议与控制面：为什么真正决定 agent 上限的不是 prompt，而是执行边界
     2	
     3	这一篇讨论的不是“模型会不会调用工具”，而是另一个更关键的问题：工具怎样被定义、怎样被裁剪、谁能批准、谁来结算、哪些能力属于 tool plane，哪些能力属于 control plane。
     4	
     5	先给结论：
     6	
     7	- `Claude Code` 的工具系统仍然很强调 prompt discipline，但已经有明显的 permission、hooks、bridge control request 边界。
     8	  - 证据类型：本地源码。`claude-code-src/src/Tool.ts`、`src/QueryEngine.ts`、`src/bridge/bridgeMessaging.ts`
     9	- `OpenCode` 把工具定义、权限判断、结算与运行时调度拆得最清楚，`ToolRegistry` 本身甚至不依赖 `PermissionV2.Service`。
    10	  - 证据类型：本地源码。`opencode/packages/core/src/tool/registry.ts`、`src/permission.ts`
    11	  - 证据类型：官方文档。`opencode/specs/v2/tools.md`、`session.md`
    12	- `Codex` 把很多“控制面字段”直接塞进 thread/app-server 协议，例如 approval policy、sandbox、permissions profile、dynamic tools。
    13	  - 证据类型：本地源码。`codex/codex-rs/app-server-protocol/src/protocol/v2/thread.rs`
    14	  - 证据类型：本地源码。`codex/codex-rs/ext/goal/src/spec.rs`
    15	
    16	## 问题：为什么“有工具调用”不等于“有控制面”
    17	
    18	很多系统做到工具调用后，会停在下面这一层：
    19	
    20	- 给模型一个 JSON schema
    21	- 返回一个工具结果
    22	- 用 prompt 提醒“谨慎使用”
    23	
    24	但真正的生产级 agent 还必须回答：
    25	
    26	1. 工具 schema 谁拥有，运行时还是 UI？
    27	2. 权限是工具内部判断，还是统一 control plane 判断？
    28	3. 工具 catalog 会不会因为 agent、workspace、权限而变化？
    29	4. 工具调用失败时，返回的是普通文本，还是类型化失败？
    30	5. shell、file edit、background task、goal 更新这些到底是不是同一类工具？
    31	
    32	```mermaid
    33	flowchart LR
    34	  Model --> Schema[Tool Schema]
    35	  Schema --> ToolPlane[Tool Plane]
    36	  ToolPlane --> Exec[Executor / Settlement]
    37	  Control[Control Plane] --> ToolPlane
    38	  Control --> Approval[Approval / Permission]
    39	  Control --> Sandbox[Sandbox / Workspace Boundary]
    40	  Control --> Policy[Agent / Session / Thread Policy]
    41	```
    42	
    43	## Claude Code：工具纪律很强，但 control plane 更像会话运行时的一部分
    44	
    45	### 三家做法之一：Claude Code
    46	
    47	`Claude Code` 的工具面有两个明显特征：
    48	
    49	- `ToolUseContext` 把 permissions、hooks、tool decisions、requestPrompt、notification、read limits、glob limits、query tracking 等都塞进工具上下文。
    50	  - 证据类型：本地源码。`claude-code-src/src/Tool.ts`
    51	- `QueryEngine` 在提交消息时包裹 `canUseTool`，显式追踪 permission denials。
    52	  - 证据类型：本地源码。`claude-code-src/src/QueryEngine.ts`
    53	- bridge 能接收 `control_request`，包括 initialize、set_model、can_use_tool 等服务器控制请求。
    54	  - 证据类型：本地源码。`claude-code-src/src/bridge/bridgeMessaging.ts`
    55	
    56	### 它的控制面特点
    57	
    58	这意味着 `Claude Code` 并不是“只有 prompt 在约束工具”。更准确地说：
    59	
    60	- prompt 负责工具纪律和行为倾向；
    61	- `canUseTool`、permission mode、hooks、bridge control request 负责真实执行边界；
    62	- tool/use/result 与 UI 展示之间还有 bridge 过滤层。
    63	
    64	### trade-off
    65	
    66	- 好处：交互式体验强，工具纪律和会话上下文结合紧密。
    67	- 代价：tool plane 与 session runtime 耦合较高，不像独立 registry 那样容易被别的宿主复用。
    68	- 推断：Claude 的 control plane 更像“runtime 内核的一部分”，而不是单独公开的工具平台。
    69	  - 证据类型：推断。依据是 `ToolUseContext` 的宽接口与 `QueryEngine` 的集中包裹逻辑。
    70	
    71	## OpenCode：工具协议、权限、结算、广告目录是分开的
    72	
    73	### 三家做法之二：OpenCode
    74	
    75	`OpenCode` 在这条线上最值得抄的地方，是明确把几层边界拆开：
    76	
    77	- `ToolRegistry.materialize()` 根据 permissions 生成当前可广告给模型的 tool definitions。
    78	  - 证据类型：本地源码。`opencode/packages/core/src/tool/registry.ts`
    79	- `ToolRegistry.settle()` 负责 lookup、typed failure、输出边界化和结果结算。
    80	  - 证据类型：本地源码。`opencode/packages/core/src/tool/registry.ts`
    81	- `PermissionV2` 独立做 `evaluate / ask / assert / reply`，并通过 `EventV2` 发布 `Asked/Replied` 事件。
    82	  - 证据类型：本地源码。`opencode/packages/core/src/permission.ts`
    83	- `todowrite` 这种具体工具自己调用 `permission.assert(...)`，说明“registry 不做所有事情，执行器负责声明自己要触达哪些资源”。
    84	  - 证据类型：本地源码。`opencode/packages/core/src/tool/todowrite.ts`
    85	
    86	### 关键差异
    87	
    88	OpenCode 的 `tool/AGENTS.md` 甚至明确写了：`ToolRegistry` 不依赖 `PermissionV2.Service`，registry 负责 catalog 和 settle，权限在工具执行时由受信执行器自己断言。
    89	
    90	- 证据类型：本地源码。`opencode/packages/core/src/tool/AGENTS.md`
    91	
    92	这是一种非常刻意的设计：
    93	
    94	- registry 不充当万能中控；
    95	- permission 不隐藏在 UI 回调后面；
    96	- 具体工具必须显式说出自己需要什么边界；
    97	- 最终 control plane 由 session、permission、tool registry、location 一起构成。
    98	
    99	### trade-off
   100	
   101	- 好处：工具协议清楚，权限裁剪和执行结算都能独立演化。
   102	- 代价：实现者必须理解多层责任分配，写工具时不能偷懒依赖全局魔法。
   103	- 关键结论：OpenCode 的重点不是“工具很多”，而是“工具平面与控制平面分责明确”。
   104	  - 证据类型：本地源码。`tool/registry.ts`、`permission.ts`、`tool/todowrite.ts`
   105	
   106	## Codex：把控制面直接做进 thread 协议和 app-server
   107	
   108	### 三家做法之三：Codex
   109	
   110	`Codex` 的工具定义当然也有 schema，但更大的差异在于控制面很多时候先于工具存在：
   111	
   112	- thread 启动参数直接携带 `approval_policy`、`approvals_reviewer`、`sandbox`、`permissions`、`dynamic_tools`、`instruction_sources`。
   113	  - 证据类型：本地源码。`codex/codex-rs/app-server-protocol/src/protocol/v2/thread.rs`
   114	- `goal` 被公开成 `get_goal/create_goal/update_goal` 三个工具，但工具说明同时把“哪些状态不能由模型变更”写进契约。
   115	  - 证据类型：本地源码。`codex/codex-rs/ext/goal/src/spec.rs`
   116	- `GoalToolExecutor` 在处理 `update_goal` 时明确拒绝 pause/resume/budget-limit 之类状态，由系统或用户控制。
   117	  - 证据类型：本地源码。`codex/codex-rs/ext/goal/src/tool.rs`
   118	
   119	### 这说明了什么
   120	
   121	对 `Codex` 来说，tool plane 只是控制面的一个入口，不是全部：
   122	
   123	- 一部分边界在 thread 协议；
   124	- 一部分边界在 app-server 请求/通知；
   125	- 一部分边界在 sandbox/approval profile；
   126	- 一部分边界在具体工具契约。
   127	
   128	这也是为什么它更适合画成下面这样：
   129	
   130	```mermaid
   131	flowchart TD
   132	  ThreadProtocol[Thread Protocol] --> Policy[Approval / Sandbox / Permissions]
   133	  ThreadProtocol --> DynamicTools[Dynamic Tool Specs]
   134	  DynamicTools --> ToolExec[Tool Executors]
   135	  ToolExec --> Results[Typed Results / Events]
   136	  Policy --> ToolExec
   137	  Policy --> AppServer[App Server Requests / Notifications]
   138	```
   139	
   140	### trade-off
   141	
   142	- 好处：高风险能力可以先受协议控制，再受工具契约控制，模型自由度被主动压缩。
   143	- 代价：新增能力往往要同时动协议、执行器、状态层，迭代成本更高。
   144	- 关键结论：`Codex` 的控制面不是“工具之上的附属层”，而是系统主干。
   145	  - 证据类型：本地源码。`thread.rs`、`spec.rs`、`tool.rs`
   146	
   147	## 并排比较：三家并不是同一类“tool use”
   148	
   149	| 维度 | Claude Code | OpenCode | Codex |
   150	|---|---|---|---|
   151	| 工具 schema 的主载体 | 工具定义 + prompt discipline | registry materialization | 协议 + tool spec |
   152	| 权限判定位置 | runtime 包裹的 `canUseTool` 与 permission mode | `PermissionV2` 独立服务 | thread/app-server policy + tool 契约 |
   153	| 工具 catalog 是否动态裁剪 | 有，但更偏 runtime 内部 | 明确按 permissions materialize | 明确按 thread settings / dynamic tools / profiles |
   154	| 控制面最强的落点 | session runtime | permission + registry + location | thread protocol + app-server |
   155	| 最大风险 | 把工具纪律误当成全部控制面 | 抽象较重，难快速读懂 | 协议和执行层一起演进，成本高 |
   156	
   157	## 设计启发
   158	
   159	1. 工具 schema 只是入口，不是控制面本体。
   160	2. 需要把“可广告给模型的工具目录”和“真正执行时的权限判断”分开。`OpenCode` 在这点上最清楚。
   161	3. 高风险状态变更不要只靠 prompt 劝阻，应该像 `Codex goal` 一样在工具契约里明确禁止某些状态迁移。
   162	4. 如果你的系统以交互 CLI 起家，也至少要像 `Claude Code` 一样在 runtime 层留下 `canUseTool`、permission mode、hook、bridge request 这些硬边界。
   163	
   164	最后的稳妥判断是：
   165	
   166	- `Claude Code` 强在工具纪律和会话控制融合。
   167	- `OpenCode` 强在 tool plane 与 control plane 的分责。
   168	- `Codex` 强在把 control plane 升格为协议与状态的一部分。
   169	
   170	这三种路线各有上限，也各有成本。

### docs/ai-coding/coding-agents/design-principles/event-log-state-and-auditability.md
     1	# 事件、状态与可追溯：agent 为什么需要日志协议，而不是只靠聊天记录
     2	
     3	这一篇讨论的核心问题是：长任务为什么会恢复失败、为什么权限决策难审计、为什么“我记得刚才做过”在工程系统里不够用。
     4	
     5	结论先给：
     6	
     7	- `Claude Code` 已经有事件历史、session restore、bridge event 过滤和 transcript 恢复，但它的主叙事仍偏“会话恢复”而非完整事件溯源。
     8	  - 证据类型：本地源码。`claude-code-src/src/assistant/sessionHistory.ts`、`src/utils/sessionRestore.ts`、`src/bridge/bridgeMessaging.ts`
     9	- `OpenCode` 在三家里最明确地把 `event -> projection -> runner reload` 写成系统主线，`session_input`、`PromptAdmitted`、`Prompted`、`ContextUpdated`、`sessions.events/history` 都是为可追溯和恢复服务。
    10	  - 证据类型：官方文档。`opencode/specs/v2/session.md`
    11	  - 证据类型：本地源码。`opencode/packages/core/src/session/input.ts`、`session/history.ts`、`session/context-epoch.ts`
    12	- `Codex` 把 thread、goal、audit row、state SQLite、app-server notifications 串成了更明显的审计链，尤其适合恢复、review 与多 client 消费。
    13	  - 证据类型：本地源码。`codex/codex-rs/ext/goal/src/events.rs`、`state/src/lib.rs`、`app-server-protocol/src/protocol/v2/thread_data.rs`
    14	
    15	## 问题：为什么“聊天记录”不足以支撑恢复和审计
    16	
    17	只保留聊天记录，通常会丢掉下面这些信息：
    18	
    19	1. 哪些输入已经被接收，但还没进入模型可见历史。
    20	2. 哪些权限请求被 ask、被 reject、被 always allow。
    21	3. 哪些工具输出只是临时流式 delta，哪些才是 durable completion。
    22	4. 压缩、续跑、外部中断后，下一轮到底该从哪个状态继续。
    23	
    24	```mermaid
    25	sequenceDiagram
    26	  participant User
    27	  participant Runtime
    28	  participant EventLog
    29	  participant Projection
    30	  participant Model
    31	
    32	  User->>Runtime: 提交输入
    33	  Runtime->>EventLog: 记录 admission / permission / tool / state event
    34	  EventLog->>Projection: 投影为可见状态
    35	  Projection->>Model: 组装下一轮上下文
    36	  Runtime->>EventLog: 记录完成、压缩、恢复、审计事件
    37	```
    38	
    39	## Claude Code：重点是“会话恢复”，不是完整事件溯源
    40	
    41	### 三家做法之一：Claude Code
    42	
    43	`Claude Code` 至少已经做了三件重要的事：
    44	
    45	- `sessionHistory.ts` 可以从 `/v1/sessions/{sessionId}/events` 分页抓取事件历史。
    46	  - 证据类型：本地源码。`claude-code-src/src/assistant/sessionHistory.ts`
    47	- `sessionRestore.ts` 会从 transcript/log 中恢复 file history、attribution、todo、context collapse 快照等状态。
    48	  - 证据类型：本地源码。`claude-code-src/src/utils/sessionRestore.ts`
    49	- bridge 明确区分哪些消息值得转发，哪些只是本地 REPL chatter，不让所有中间噪音污染远端会话视图。
    50	  - 证据类型：本地源码。`claude-code-src/src/bridge/bridgeMessaging.ts`
    51	
    52	### 这类设计能解决什么
    53	
    54	- 允许 session resume 时恢复比纯聊天记录更多的运行时状态。
    55	- 允许远程桥接端只看到对外有意义的 user/assistant/system 事件。
    56	- 允许 todo、file history、attribution 等附加状态跨重启继续工作。
    57	
    58	### trade-off
    59	
    60	- 好处：对交互式产品很实用，恢复体验明显优于“只记消息数组”。
    61	- 代价：状态仍然较分散，事件日志更像恢复素材，而不是统一投影主轴。
    62	- 推断：Claude Code 当前最稳定的叙事仍是“session restore”，而不是 OpenCode/Codex 那种强事件溯源 runtime。
    63	  - 证据类型：推断。依据是 `sessionRestore.ts` 的恢复函数形态与 `sessionHistory.ts` 的分页拉取方式。
    64	
    65	## OpenCode：把 event log 当成 Session runtime 的骨架
    66	
    67	### 三家做法之二：OpenCode
    68	
    69	OpenCode 在这条线上最清楚，因为它直接把事件写进了 V2 规格和源码：
    70	
    71	- 输入先进入 durable `session_input` inbox，`PromptAdmitted` 表示已接收但还未成为模型可见历史。
    72	  - 证据类型：官方文档。`opencode/specs/v2/session.md`
    73	  - 证据类型：本地源码。`opencode/packages/core/src/session/input.ts`
    74	- `Prompted` 才表示输入被提升进 visible conversation history。
    75	  - 证据类型：本地源码。`opencode/packages/core/src/session/input.ts`
    76	- `SessionHistory.load/loadForRunner` 会按 compaction 和 baselineSeq 裁剪出 runner 该看到的历史，而不是粗暴重放全部聊天记录。
    77	  - 证据类型：本地源码。`opencode/packages/core/src/session/history.ts`
    78	- `ContextUpdated` 事件推动 `Context Epoch` 快照前进，让系统上下文变更也可追溯。
    79	  - 证据类型：本地源码。`opencode/packages/core/src/session/context-epoch.ts`
    80	
    81	### 关键差异
    82	
    83	OpenCode 不是“事件很多”，而是把这些事件用于三件硬事：
    84	
    85	1. 区分 admission、projection、model-visible history。
    86	2. 支撑 compaction 后的稳定重建。
    87	3. 给 `sessions.events(...)` 和 `sessions.history(...)` 这样的外部消费者稳定游标。
    88	
    89	### trade-off
    90	
    91	- 好处：恢复、重放、远程消费、UI 订阅都能建立在同一条 durable event 语义上。
    92	- 代价：系统实现更重，必须维护 event schema、projection、一致性和 safe boundary。
    93	- 关键结论：OpenCode 的可追溯不是“顺便记录日志”，而是 runtime 设计的基础。
    94	  - 证据类型：官方文档。`opencode/specs/v2/session.md`
    95	
    96	## Codex：把事件、状态库与审计行连起来
    97	
    98	### 三家做法之三：Codex
    99	
   100	`Codex` 的可追溯重点不止是 thread history，还包括状态库和审计接口：
   101	
   102	- `GoalEventEmitter` 会发出 `ThreadGoalUpdated` 事件，把 tool call、turn_id、goal 新状态挂到统一事件里。
   103	  - 证据类型：本地源码。`codex/codex-rs/ext/goal/src/events.rs`
   104	- `state` crate 明确暴露 `ThreadStateAuditRow`、`read_thread_state_audit_rows`、`StateRuntime`、`LogQuery`、`ThreadGoal` 等对象。
   105	  - 证据类型：本地源码。`codex/codex-rs/state/src/lib.rs`
   106	- `Thread`/`Turn`/`TurnItemsView` 协议让客户端能区分“没加载 item”“只看 summary”“完整持久化 turn item”。
   107	  - 证据类型：本地源码。`codex/codex-rs/app-server-protocol/src/protocol/v2/thread_data.rs`
   108	
   109	### 这说明了什么
   110	
   111	Codex 的恢复和审计链更像：
   112	
   113	```mermaid
   114	stateDiagram-v2
   115	  [*] --> Thread
   116	  Thread --> Turn: start
   117	  Turn --> ToolCall: invoke
   118	  ToolCall --> Approval: requires review
   119	  Approval --> ToolCall: approved
   120	  ToolCall --> GoalState: updates goal
   121	  GoalState --> AuditDB: persist
   122	  AuditDB --> Thread: resume/read/review
   123	```
   124	
   125	这里的重点不只是“能恢复”，而是：
   126	
   127	- 事件能驱动状态变化；
   128	- 状态变化进入 SQLite runtime；
   129	- 客户端再通过协议把它读出来；
   130	- 审计不是额外外挂，而是状态系统的一部分。
   131	
   132	### trade-off
   133	
   134	- 好处：长任务、review、thread read/fork/resume 的一致性更强。
   135	- 代价：系统更重，状态迁移、事件兼容和协议演进都要维护。
   136	- 关键结论：Codex 在三家里最像“以审计和恢复为先”的线程系统。
   137	  - 证据类型：本地源码。`events.rs`、`state/src/lib.rs`、`thread_data.rs`
   138	
   139	## 并排比较：三家的“可追溯”不是同义词
   140	
   141	| 维度 | Claude Code | OpenCode | Codex |
   142	|---|---|---|---|
   143	| 主叙事 | session restore | event-sourced session runtime | protocol + state db + audit |
   144	| 输入 admission 是否显式 | 相对弱 | 很强，`PromptAdmitted/Prompted` 明确 | 有 thread/turn/event 边界，但不走同名抽象 |
   145	| compaction 与历史重建 | 有，但更偏运行时恢复 | 明确写入 V2 规格 | 通过 thread/turn/state 体系承接 |
   146	| 审计接口 | 有事件历史与恢复素材 | 有 durable event cursor / history 语义 | 有 state audit row 与协议化读取 |
   147	| 最大优势 | 实用的会话恢复 | 最清晰的 event->projection 设计 | 最强的状态化审计能力 |
   148	
   149	## 设计启发
   150	
   151	1. 想做真正可恢复的 agent，必须把“输入已接收”和“输入已进入模型历史”分开。`OpenCode` 这一点最值得直接照抄。
   152	2. 如果高价值状态会影响自动续跑、预算和权限，应该把它们做成状态库和审计行，而不是只靠会话 transcript。`Codex` 在这点最完整。
   153	3. 交互式 CLI 也至少要把恢复所需的附加状态从纯消息数组里分离出来。`Claude Code` 的 session restore 给了一个实用下限。
   154	
   155	稳妥的总结是：
   156	
   157	- `Claude Code` 解决的是“如何把会话状态救回来”。
   158	- `OpenCode` 解决的是“如何让 event log 成为 runtime 主骨架”。
   159	- `Codex` 解决的是“如何把可追溯、可恢复、可审计做成线程系统能力”。
   160	
   161	这三种侧重点不该被写成同一个层级的“日志系统”。

### docs/ai-coding/coding-agents/vendor-notes/claude-code-source-map.md
     1	# Claude Code 源码地图
     2	
     3	这一页只列和本组专题直接相关的模块，不做长篇导读。
     4	
     5	## UI / Runtime / State
     6	
     7	- `claude-code-src/src/QueryEngine.ts`
     8	  - 职责：会话 query lifecycle 与 session state 核心。
     9	  - 为什么相关：`ui-runtime-decoupling` 的关键证据，说明 runtime 已从单一 REPL 抽出。
    10	- `claude-code-src/src/bootstrap/state.ts`
    11	  - 职责：session-scoped runtime state、hooks、prompt cache、telemetry、恢复辅助。
    12	  - 为什么相关：解释 state 为什么不是 UI 局部状态。
    13	- `claude-code-src/src/utils/sessionRestore.ts`
    14	  - 职责：从 transcript/log 恢复 todo、file history、attribution、context collapse。
    15	  - 为什么相关：支撑“事件、状态与可追溯”专题。
    16	
    17	## Tool Plane / Control Plane
    18	
    19	- `claude-code-src/src/Tool.ts`
    20	  - 职责：`ToolUseContext`、permission context、hook/progress/UI callback 边界。
    21	  - 为什么相关：说明工具执行边界不只是 prompt。
    22	- `claude-code-src/src/QueryEngine.ts`
    23	  - 职责：包裹 `canUseTool` 并追踪 permission denials。
    24	  - 为什么相关：control plane 在 runtime 内核中，而不是独立 registry。
    25	
    26	## Event / Bridge / Audit
    27	
    28	- `claude-code-src/src/bridge/bridgeMessaging.ts`
    29	  - 职责：筛选可转发消息、处理 control_request/control_response。
    30	  - 为什么相关：说明哪些事件会进入远端视图，哪些只是本地 chatter。
    31	- `claude-code-src/src/assistant/sessionHistory.ts`
    32	  - 职责：按页读取 `/v1/sessions/{id}/events`。
    33	  - 为什么相关：是可追溯与远端恢复的直接入口。
    34	
    35	## 使用提醒
    36	
    37	- 最容易写错的是把 `Claude Code` 描述成“终端 UI 直接驱动一切”。
    38	- 更稳的表述是：REPL 很强，但关键设计点是 `QueryEngine + ToolUseContext + session restore + bridge` 这条运行时链路。

### docs/ai-coding/coding-agents/vendor-notes/opencode-source-map.md
     1	# OpenCode 源码地图
     2	
     3	这一页只列和本组专题最相关的入口。
     4	
     5	## UI / Runtime / Provider / State
     6	
     7	- `opencode/specs/v2/session.md`
     8	  - 职责：V2 Session、inbox、runner、context epoch、history、compaction 规格。
     9	  - 为什么相关：三篇专题里最核心的官方设计依据。
    10	- `opencode/packages/core/src/session/context-epoch.ts`
    11	  - 职责：系统上下文基线与快照推进。
    12	  - 为什么相关：解释 runtime/state/provider 之间为什么要有单独上下文层。
    13	- `opencode/packages/core/src/session/history.ts`
    14	  - 职责：按 baseline 与 compaction 裁剪 runner 可见历史。
    15	  - 为什么相关：支撑恢复与可追溯主线。
    16	
    17	## Tool Plane / Control Plane
    18	
    19	- `opencode/packages/core/src/tool/registry.ts`
    20	  - 职责：工具注册、materialize、settle。
    21	  - 为什么相关：是“工具协议与控制面”专题的中心文件。
    22	- `opencode/packages/core/src/permission.ts`
    23	  - 职责：`evaluate / ask / assert / reply` 与权限事件发布。
    24	  - 为什么相关：展示 control plane 并不藏在 UI 层。
    25	- `opencode/packages/core/src/tool/todowrite.ts`
    26	  - 职责：具体 built-in 工具如何显式声明权限并更新 session todo。
    27	  - 为什么相关：说明 registry、permission、tool executor 如何分责。
    28	
    29	## Event / Inbox / Auditability
    30	
    31	- `opencode/packages/core/src/session/input.ts`
    32	  - 职责：`PromptAdmitted`、`Prompted`、steer/queue promotion。
    33	  - 为什么相关：是事件与恢复语义最直接的证据。
    34	- `opencode/packages/core/src/session/todo.ts`
    35	  - 职责：session-scope todo 持久化与事件发布。
    36	  - 为什么相关：补足“会话状态不是临时 prompt 片段”的论点。
    37	- `opencode/packages/opencode/src/control-plane/workspace.ts`
    38	  - 职责：workspace sync、remote target、SSE 事件桥接。
    39	  - 为什么相关：说明 runtime 不局限于本地 CLI。
    40	
    41	## 使用提醒
    42	
    43	- 最容易写错的是把 OpenCode 当成“另一个终端 agent”。
    44	- 更稳的表述是：它把 `Session + Location + EventV2 + ToolRegistry + PermissionV2` 组合成了 runtime/control plane。

### docs/ai-coding/coding-agents/vendor-notes/codex-source-map.md
     1	# Codex 源码地图
     2	
     3	这一页只保留与“解耦、控制面、事件与可追溯”直接相关的模块。
     4	
     5	## Protocol / Runtime / State
     6	
     7	- `codex/codex-rs/app-server-protocol/src/protocol/v2/thread.rs`
     8	  - 职责：thread start/settings/update 的协议定义，包含 model、sandbox、approval、dynamic tools、instruction sources。
     9	  - 为什么相关：是 UI/runtime 解耦和 control plane 协议化的第一入口。
    10	- `codex/codex-rs/app-server-protocol/src/protocol/v2/thread_data.rs`
    11	  - 职责：`Thread`、`Turn`、`TurnItemsView` 等线程载荷结构。
    12	  - 为什么相关：解释为什么 UI 只是协议消费者。
    13	- `codex/codex-rs/state/src/lib.rs`
    14	  - 职责：SQLite-backed state、goal、log、audit row 的统一入口。
    15	  - 为什么相关：三篇专题都要用到的持久化支点。
    16	
    17	## Goal / Tool / Control Plane
    18	
    19	- `codex/codex-rs/ext/goal/src/spec.rs`
    20	  - 职责：`get_goal/create_goal/update_goal` 工具 schema 与说明。
    21	  - 为什么相关：展示工具契约如何直接携带控制面约束。
    22	- `codex/codex-rs/ext/goal/src/tool.rs`
    23	  - 职责：goal 工具执行、状态迁移限制、progress accounting。
    24	  - 为什么相关：说明哪些状态能由模型改，哪些不能。
    25	- `codex/codex-rs/ext/goal/src/runtime.rs`
    26	  - 职责：active turn steering、external mutation、idle/active goal accounting。
    27	  - 为什么相关：解释 goal 不只是静态对象，而是运行时的一部分。
    28	
    29	## Event / Auditability
    30	
    31	- `codex/codex-rs/ext/goal/src/events.rs`
    32	  - 职责：发出 `ThreadGoalUpdated` 事件。
    33	  - 为什么相关：把工具执行、turn、goal 状态与事件流连起来。
    34	- `codex/codex-rs/state/src/audit.rs`
    35	  - 职责：线程状态审计读取。
    36	  - 为什么相关：是“可审计”这一结论的直接落点。
    37	
    38	## 使用提醒
    39	
    40	- 最容易写错的是把 Codex 写成“prompt 更强的聊天工具”。
    41	- 更稳的表述是：它先有 `thread/turn/protocol/state/audit` 这条主干，再让 UI、goal tool、review 等能力挂上去。
