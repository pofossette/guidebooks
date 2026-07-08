Task 3 review package

## verification
- mkdocs build: passed via `uv run mkdocs build -f mkdocs.yml` (site-wide warnings exist outside this task)
- mermaid check: passed via `pnpm run check:mermaid`

### docs/ai-coding/coding-agents/design-principles/interrupt-resume-and-traceability.md
     1	# 中断、恢复与可追溯：为什么 agent 不能把“停一下再继续”写成一句话
     2	
     3	这一篇专门拆开五个经常被混写的词：`中断`、`暂停`、`恢复`、`续跑`、`可追溯`。
     4	
     5	文首状态图是跨系统概念图，用来帮助分层讨论，不代表三家都公开实现了同构的 `Paused` 状态。  
     6	证据类型：推断。依据 `Codex` 公开存在显式 `Paused` goal status，而 `Claude Code` 与 `OpenCode` 公开材料更多呈现会话恢复、停止钩子与 continuation 语义，而非同构暂停状态机。
     7	
     8	先给结论：
     9	
    10	- `Claude Code` 最强的是“会话被打断后怎样尽量把 transcript 和运行现场救回来”，以及 `/goal` 驱动的自动续跑；但它公开出来的主抽象仍更接近 `session restore + stop-hook orchestration`，不是完整线程状态机。
    11	  - 证据类型：本地源码。`claude-code-src/src/QueryEngine.ts`、`src/bootstrap/state.ts`、`src/Tool.ts`
    12	  - 证据类型：官方文档。`/goal`、hooks、best practices、Week 20 周报
    13	  - 证据类型：公开 issue / discussion。`anthropics/claude-code#65099`、`#58558`、`#59969`、`#63988`
    14	- `OpenCode` 的重点不是“自动续跑很多”，而是把 `session input -> event/projection -> local continuation reload` 写成 durable runtime，所以它更强的是可追溯和安全继续，而不是高度自治的 goal continuation。
    15	  - 证据类型：本地源码。`opencode/packages/core/src/session/todo.ts`
    16	  - 证据类型：官方文档。仓库内 `opencode/specs/v2/tools.md`、`opencode/specs/v2/todo.md`
    17	  - 证据类型：官方文档。仓库根 `TODO.md` 明确把 durable continuation recovery、interruption、retries 仍列为后续切片
    18	- `Codex` 在三家里最明确地区分“线程恢复”和“目标续跑”：`thread/resume` 负责把线程状态重新接上，`goal` runtime 负责在活动目标上继续推进，两者由协议、状态库和审计事件连接。
    19	  - 证据类型：本地源码。`codex/codex-rs/app-server-protocol/src/protocol/v2/thread.rs`、`thread_data.rs`、`ext/goal/src/spec.rs`、`tool.rs`、`runtime.rs`、`state/src/audit.rs`
    20	  - 证据类型：公开 issue / discussion。`openai/codex#24016`、`#25590`、`#28296`、`#28574`
    21	
    22	## 先把五个词分开
    23	
    24	- `中断`：当前 turn 或当前工具执行被外部打断，重点是“这一轮没自然结束”。
    25	  - 证据类型：推断。依据三家 runtime 都把 interrupt 视为 turn/tool 级事件，而非目标完成。
    26	- `暂停`：系统显式进入不继续推进的稳定状态，后续是否继续要等用户或系统再触发。
    27	  - 证据类型：本地源码 + 推断。`Codex` 的 `ThreadGoalStatus::Paused` 是显式状态；`Claude Code` 与 `OpenCode` 没有同层公开 goal pause 对象。
    28	- `恢复`：从已保存的会话、线程、history 或状态库重新接上。
    29	  - 证据类型：本地源码。`claude-code-src/src/bootstrap/state.ts`、`codex/.../thread.rs`
    30	- `续跑`：系统主动开启下一轮，不要求用户再发 prompt。
    31	  - 证据类型：官方文档。`Claude Code /goal`
    32	  - 证据类型：本地源码。`Codex` goal runtime/accounting/steering
    33	- `可追溯`：事后能回答“为什么继续了、为什么没停、恢复时用了什么状态、权限是谁批的”。
    34	  - 证据类型：本地源码。`Claude Code` transcript/session restore、`OpenCode` event-sourced runtime 主线、`Codex` state audit row
    35	
    36	如果把这五个词压成同一个“resume”，文档就一定会误判三家的设计重点。  
    37	证据类型：推断。依据前文对 `Claude Code session restore + /goal`、`OpenCode durable continuation`、`Codex thread/resume + goal runtime` 的分层对照。
    38	
    39	```mermaid
    40	stateDiagram-v2
    41	  [*] --> ActiveTurn
    42	  ActiveTurn --> Interrupted: 用户 Stop / 进程终止 / 外部取消
    43	  ActiveTurn --> WaitingStopCheck: 当前轮次自然结束
    44	  WaitingStopCheck --> AutoContinuation: 条件未满足，系统主动续跑
    45	  WaitingStopCheck --> Paused: 人工暂停/策略暂停
    46	  WaitingStopCheck --> Completed: 条件满足
    47	  Interrupted --> RestoredSession: 载入 transcript / state / history
    48	  RestoredSession --> ActiveTurn: 显式恢复
    49	  Paused --> ActiveTurn: 用户或系统恢复
    50	  AutoContinuation --> ActiveTurn
    51	```
    52	
    53	## Claude Code：中断恢复靠 transcript 与 session restore，续跑靠 `/goal + Stop hook`
    54	
    55	### 它的恢复主轴是什么
    56	
    57	- `QueryEngine` 在进入 query loop 之前先把用户消息写入 transcript，目的就是避免“请求刚发出就被杀掉，`--resume` 却找不到对话”的恢复失败。
    58	  - 证据类型：本地源码。`claude-code-src/src/QueryEngine.ts`
    59	- `Tool` 抽象显式区分可中断行为，`interruptBehavior()` 可以声明 `cancel` 或 `block`，说明中断首先是 tool/turn 级控制，而不是高层 goal 状态。
    60	  - 证据类型：本地源码。`claude-code-src/src/Tool.ts`
    61	- `bootstrap/state.ts` 维护 `switchSession()`、`sessionProjectDir`、`projectRoot` 等恢复辅助状态，支持跨项目、worktree、`/resume` 场景。
    62	  - 证据类型：本地源码。`claude-code-src/src/bootstrap/state.ts`
    63	
    64	### 它的续跑主轴是什么
    65	
    66	- 官方 `/goal` 文档写得很直接：设置 completion condition 后，每轮结束由一个更快的小模型判断条件是否成立；如果未成立，就自动开始下一轮。
    67	  - 证据类型：官方文档。`https://code.claude.com/docs/en/goal`
    68	- 官方 hooks 文档明确把 `/goal` 描述为 session-scoped prompt-based Stop hook 的内建捷径。
    69	  - 证据类型：官方文档。`https://docs.anthropic.com/en/docs/claude-code/hooks`
    70	- 官方 best practices 也明确说 unattended run 是否能自己结束，关键就在 `/goal` 和 Stop hook 版本。
    71	  - 证据类型：官方文档。`https://code.claude.com/docs/en/best-practices`
    72	
    73	### 这说明了什么
    74	
    75	`Claude Code` 的“恢复”与“续跑”并不来自同一层：
    76	
    77	- 恢复来自 transcript、session restore、bridge/session 状态。
    78	- 续跑来自 completion condition 循环和 stop 判定。
    79	
    80	这正是它和 `Codex` 最大的结构差异。`Codex` 把 goal 做成线程对象；`Claude Code` 目前公开出来的更像“会话恢复系统 + 自动续跑控制面”。  
    81	证据类型：推断。依据前述本地源码与官方 `/goal`/hooks 文档的职责切分。
    82	
    83	### 公开失效面
    84	
    85	- 显式 cancel 之后，旧 `/goal` 仍可能继续推 turn，尤其叠加 compaction 和多 session resume 时更明显。
    86	  - 证据类型：公开 issue / discussion。`anthropics/claude-code#65099`
    87	- Stop hook 返回 markdown fenced JSON 会触发校验失败，导致 `/goal` 无法 auto-clear。
    88	  - 证据类型：公开 issue / discussion。`anthropics/claude-code#58558`
    89	- Desktop Code tab 中 `/goal` 与 `/permissions` 可能报 “not available in this environment”，说明桌面嵌入环境与终端会话并不是同一个能力面。
    90	  - 证据类型：公开 issue / discussion。`anthropics/claude-code#59969`
    91	- `/remote-control` 在本地 agent 的非交互环境里被 denylist 拦住，说明交互与非交互恢复路径并不完全等价。
    92	  - 证据类型：公开 issue / discussion。`anthropics/claude-code#63988`
    93	- Stop hook 连续阻止八次后会被系统 override，继续工作并以 warning 结束 turn。
    94	  - 证据类型：官方文档。`https://docs.anthropic.com/en/docs/claude-code/hooks-guide`
    95	
    96	## OpenCode：强的是 durable continuation，不是 goal auto-loop
    97	
    98	### 它公开强调的是什么
    99	
   100	- `TODO.md` 明确写出 local continuation reload、queued input promotion、explicit cancellation / continuation semantics、durable/clustered interruption 仍在分阶段实现。
   101	  - 证据类型：官方文档。仓库根 `opencode/TODO.md`
   102	- `tools.md` 把“Effect interruption is the cancellation mechanism”写成工具执行契约的一部分，说明中断先是 effect/runtime 概念。
   103	  - 证据类型：官方文档。仓库内 `opencode/specs/v2/tools.md`
   104	- `SessionTodo` 会把 todo 写进数据库并按 session 读回，说明 OpenCode 至少把“这次会话做到哪一步”做成了 durable state，而不是纯提示词。
   105	  - 证据类型：本地源码。`opencode/packages/core/src/session/todo.ts`
   106	
   107	### 这意味着什么
   108	
   109	OpenCode 的恢复逻辑更接近：
   110	
   111	```mermaid
   112	sequenceDiagram
   113	  participant User
   114	  participant InputQueue as Session Input
   115	  participant Runner
   116	  participant EventStore
   117	  participant Reload as Local Continuation Reload
   118	
   119	  User->>InputQueue: 提交输入
   120	  InputQueue->>EventStore: durable admission
   121	  Runner->>EventStore: 记录 provider/tool/projection
   122	  Runner-->>Reload: 当前进程结束或需继续
   123	  Reload->>EventStore: 读取投影后的历史
   124	  Reload->>Runner: 从安全边界继续
   125	```
   126	
   127	它的关键词是：
   128	
   129	- `continue safely`
   130	- 不是 `loop until condition met`
   131	
   132	所以如果把 OpenCode 写成“也有和 Claude/Codex 同层的续跑目标系统”，就是把 durable runtime 误写成 goal runtime。  
   133	证据类型：推断。依据 `opencode/TODO.md`、`specs/v2/tools.md` 和 `session/todo.ts`。
   134	
   135	### 公开失效面与未完成边界
   136	
   137	- 官方 TODO 直接承认 durable continuation recovery 仍是显式待设计切片，尤其包括 provider-dispatch ambiguity、post-tool continuation、retry/abandon decision。
   138	  - 证据类型：官方文档。仓库根 `opencode/TODO.md`
   139	- 同一份 TODO 也把 background agent dispatch 的 explicit cancellation / continuation semantics 列为后续集成项，说明“后台任务取消后怎样继续”并非已经完全收敛。
   140	  - 证据类型：官方文档。仓库根 `opencode/TODO.md`
   141	- `Tool` 规范强调 interruption 不应被工具错误吞掉，这本身就暴露了一个设计风险：如果叶子工具滥用 broad catch，会把取消伪装成普通失败。
   142	  - 证据类型：官方文档。仓库内 `opencode/specs/v2/tools.md`
   143	
   144	## Codex：线程恢复与目标续跑被显式拆成两层
   145	
   146	### 恢复层
   147	
   148	- `ThreadResumeParams` 明确写出三种 resume 方式：按 `thread_id`、按 `history`、按 `path`；并定义了优先级和 running thread 的一致性校验。
   149	  - 证据类型：本地源码。`codex/codex-rs/app-server-protocol/src/protocol/v2/thread.rs`
   150	- `Thread`/`Turn`/`TurnItemsView` 说明 resume 不只是“拿回一串消息”，而是拿回线程、turn、item 是否完整加载的结构化状态。
   151	  - 证据类型：本地源码。`codex/codex-rs/app-server-protocol/src/protocol/v2/thread_data.rs`
   152	- `state/src/audit.rs` 直接提供 `read_thread_state_audit_rows`，说明恢复与审计本来就站在状态库上，而不只是 transcript 文件。
   153	  - 证据类型：本地源码。`codex/codex-rs/state/src/audit.rs`
   154	
   155	### 续跑层
   156	
   157	- `get_goal/create_goal/update_goal` 只开放读取、创建、完成/阻塞标记；pause、resume、budget-limited、usage-limited 明确不允许模型自行写。
   158	  - 证据类型：本地源码。`codex/codex-rs/ext/goal/src/spec.rs`
   159	- `GoalToolExecutor` 在 `update_goal` 里显式拒绝 pause/resume/budget-limited/usage-limited 状态迁移。
   160	  - 证据类型：本地源码。`codex/codex-rs/ext/goal/src/tool.rs`
   161	- `GoalRuntimeHandle` 负责 external goal mutation、active/idle accounting、objective steering 注入，说明 goal continuation 是 runtime 级行为，不只是工具返回值。
   162	  - 证据类型：本地源码。`codex/codex-rs/ext/goal/src/runtime.rs`
   163	
   164	### 关键差异
   165	
   166	`Codex` 的“恢复”和“续跑”是被刻意拆开的：
   167	
   168	1. `thread/resume` 解决线程重新接入。
   169	2. `goal runtime` 决定活跃目标是否继续推进。
   170	3. `audit/state` 负责事后解释恢复时发生了什么。
   171	
   172	这使它比 `Claude Code` 更接近完整状态机，但代价是协议、状态库、runtime 必须共同演进。  
   173	证据类型：推断。依据 `thread.rs`、`thread_data.rs`、`spec.rs`、`tool.rs`、`runtime.rs`。
   174	
   175	### 公开失效面
   176	
   177	- `codex exec resume` 目前仍要求 prompt 或 stdin，不能只“跟随已存在的 active goal continuation”。
   178	  - 证据类型：公开 issue / discussion。`openai/codex#24016`
   179	- 线程恢复后 sandbox/approval profile 可能与原线程不一致，尤其在 Desktop 与 goal continuation 重启/恢复时。
   180	  - 证据类型：公开 issue / discussion。`openai/codex#25590`、`#28296`
   181	- 5 小时 usage limit 之后的 goal resume 可能卡在 approval prompt，且 iOS 缺少对应 pause/resume 控件。
   182	  - 证据类型：公开 issue / discussion。`openai/codex#28574`
   183	
   184	## 并排比较：三家的“恢复”不是同一件事
   185	
   186	| 维度 | Claude Code | OpenCode | Codex |
   187	|---|---|---|---|
   188	| 中断主落点 | tool/turn + transcript | effect interruption + runner continuation | thread/turn + goal runtime |
   189	| 恢复主落点 | session restore / transcript | event/projection reload | thread/state/audit |
   190	| 自动续跑主轴 | `/goal` + Stop hook | durable continuation，但非同层 goal loop | goal runtime + thread protocol |
   191	| pause 是否公开成一等状态 | 不完整公开 | 未见同层公开 goal pause | 有，goal status 含 paused |
   192	| 最大失效面 | cancel 后继续跑、hook 失效、环境边界差异 | continuation recovery 尚在收敛 | resume 后权限/沙箱继承不一致 |
   193	
   194	- 证据类型：推断。依据前文本地源码、官方文档与公开 issue 的综合比较。
   195	
   196	## 设计启发
   197	
   198	1. 不要把“恢复对话”误当成“恢复目标运行时”。`Claude Code` 和 `Codex` 的差别正好说明这两层必须分开写。  
   199	   证据类型：推断。依据 `Claude Code /goal` 文档与 `Codex thread/goal` 协议的职责不同。
   200	2. 真正可续跑的系统，必须回答“取消是否能压过自动继续”。Claude Code 和 Codex 的公开 issue 都说明这是高风险边界。  
   201	   证据类型：公开 issue / discussion。`anthropics/claude-code#65099`、`openai/codex#28574`
   202	3. 如果 continuation 设计还没收敛，应该像 OpenCode 一样把 ambiguity 明说，而不是在文档里假装已经有完整恢复语义。  
   203	   证据类型：官方文档。仓库根 `opencode/TODO.md`

### docs/ai-coding/coding-agents/design-principles/permission-approval-and-human-override.md
     1	# 权限审批与人工接管：approval policy 不是 sandbox，human override 也不是万能后门
     2	
     3	这一篇要拆开的四个词是：`approval policy`、`human override`、`permission scope`、`tool authority`。
     4	
     5	先给结论：
     6	
     7	- `Claude Code` 的审批设计更像“runtime 中的动态协商”：`canUseTool`、permission mode、hook、bridge control request 共同决定某次工具调用能不能继续；人工接管通常表现为用户显式批准、拒绝、Stop、Ctrl+C 或改变 permission mode。
     8	  - 证据类型：本地源码。`claude-code-src/src/Tool.ts`、`src/QueryEngine.ts`、`src/bridge/bridgeMessaging.ts`
     9	  - 证据类型：官方文档。hooks 文档
    10	- `OpenCode` 在三家里最清楚地区分了 `policy evaluation` 和 `tool authority`：`PermissionV2` 负责 ask/assert/reply，`ToolRegistry` 负责目录裁剪与结算，具体工具自己声明要访问什么资源。
    11	  - 证据类型：本地源码。`opencode/packages/core/src/permission.ts`、`src/tool/registry.ts`、`src/tool/AGENTS.md`
    12	  - 证据类型：官方文档。仓库内 `opencode/specs/v2/tools.md`
    13	- `Codex` 则把审批直接做进 thread protocol：`approval_policy` 决定何时请求批准，`approvals_reviewer` 决定由谁审，`permissions`/`sandbox` 决定能力边界，而 tool contract 再决定模型是否有权改写某类状态。
    14	  - 证据类型：本地源码。`codex/codex-rs/app-server-protocol/src/protocol/v2/shared.rs`、`thread.rs`、`permissions.rs`、`ext/goal/src/spec.rs`、`tool.rs`
    15	  - 证据类型：公开 issue / discussion。`openai/codex#24135`、`#29857`、`#23875`、`#29610`
    16	
    17	## 四个概念先分开
    18	
    19	- `approval policy`：什么时候必须把请求送去审批。
    20	- `human override`：人类显式覆盖当前自动决策，例如强制停止、批准一次、改 reviewer、切换模式。
    21	- `permission scope`：一次授权到底覆盖哪些资源、多久生效、是否可保存。
    22	- `tool authority`：某个工具在设计上被允许做什么，哪怕审批通过也不能越权。
    23	
    24	这四个概念如果混在一起，最常见的错误就是：
    25	
    26	1. 把“审批通过”误写成“工具什么都能做”。
    27	2. 把“全局全自动”误写成“没有人工接管入口”。
    28	3. 把“沙箱限制”误写成“审批策略”。
    29	
    30	```mermaid
    31	flowchart LR
    32	  Policy[approval policy<br/>何时送审] --> Reviewer[reviewer<br/>谁来审]
    33	  Reviewer --> Grant[grant scope<br/>批准到什么范围]
    34	  Grant --> Tool[tool authority<br/>工具本身能做什么]
    35	  Human[human override] --> Policy
    36	  Human --> Reviewer
    37	  Human --> Grant
    38	  Human --> Stop[显式停止/拒绝/改模式]
    39	```
    40	
    41	## Claude Code：审批像 runtime 协调，不像单独的 policy object
    42	
    43	### 它的边界在哪里
    44	
    45	- `ToolPermissionContext` 里同时存在 `mode`、`alwaysAllowRules`、`alwaysDenyRules`、`alwaysAskRules`、`shouldAvoidPermissionPrompts`、`awaitAutomatedChecksBeforeDialog` 等字段，说明审批并不只是一个 yes/no 弹窗。
    46	  - 证据类型：本地源码。`claude-code-src/src/Tool.ts`
    47	- `QueryEngine` 会包装 `canUseTool` 并记录 `permission_denials`，说明审批结果会回流到 turn 结果和后续决策里。
    48	  - 证据类型：本地源码。`claude-code-src/src/QueryEngine.ts`
    49	- bridge 控制消息里存在 `set_permission_mode`、`interrupt` 等可变请求，说明人工 override 也是控制面的一部分。
    50	  - 证据类型：本地源码。`claude-code-src/src/bridge/bridgeMessaging.ts`
    51	
    52	### approval policy 在 Claude Code 里更接近什么
    53	
    54	更准确地说，它更接近：
    55	
    56	- 一个运行时模式集合；
    57	- 再叠加 hook、classifier、UI prompt、remote control 回答；
    58	- 而不是 `Codex` 那种 thread 协议里显式写死的 `approval_policy` 字段。
    59	
    60	证据类型：推断。依据 `ToolPermissionContext`、`canUseTool` 包裹方式和 bridge 控制请求。
    61	
    62	### human override 在这里表现为什么
    63	
    64	- 用户在权限提示里批准/拒绝某个调用。
    65	- 用户显式 Stop 或 Ctrl+C 打断当前工具或 turn。
    66	- hook 以退出码 0/2 改写“继续、阻止、忽略”。
    67	- 会话切换到别的 permission mode。
    68	
    69	其中 Stop hook 甚至会在连续阻止过多次后被系统 override，说明“人工或脚本 override”本身也受系统上限约束。  
    70	证据类型：官方文档。`https://docs.anthropic.com/en/docs/claude-code/hooks-guide`
    71	
    72	### 真实边界风险
    73	
    74	- Desktop Code tab 里 `/permissions` 与 `/goal` 不可用，说明不是每个宿主都暴露同样的人类审批入口。
    75	  - 证据类型：公开 issue / discussion。`anthropics/claude-code#59969`
    76	- 非交互 local-agent 里 `/remote-control` 被 denylist 阻止，说明“把审批转移给别的界面”也有宿主边界。
    77	  - 证据类型：公开 issue / discussion。`anthropics/claude-code#63988`
    78	
    79	## OpenCode：policy evaluation、scope persistence、tool authority 分得最清楚
    80	
    81	### approval policy 由谁负责
    82	
    83	- `PermissionV2.evaluate()` 负责把 action/resource 与 ruleset 匹配成 `allow / ask / deny`。
    84	  - 证据类型：本地源码。`opencode/packages/core/src/permission.ts`
    85	- `PermissionV2.assert()` 在 `ask` 时创建 pending request，并等待 `reply()`。
    86	  - 证据类型：本地源码。`opencode/packages/core/src/permission.ts`
    87	- `reply(always)` 还可以把允许规则写进 `PermissionSaved`，说明 permission scope 可以持久化，而不只是一次性点击。
    88	  - 证据类型：本地源码。`opencode/packages/core/src/permission.ts`
    89	
    90	### tool authority 由谁负责
    91	
    92	- `ToolRegistry` 没有 `PermissionV2.Service` 依赖，它只做 materialize/settle，不替工具决定资源授权。
    93	  - 证据类型：本地源码。`opencode/packages/core/src/tool/registry.ts`
    94	- `tool/AGENTS.md` 直接写明 definition filtering 只是 catalog visibility，不是 execution authorization。
    95	  - 证据类型：本地源码。`opencode/packages/core/src/tool/AGENTS.md`
    96	- `tools.md` 规格明确要求 trusted tools 自己构造 permission request，registry 不注入万能 `assertPermission` 帮手。
    97	  - 证据类型：官方文档。仓库内 `opencode/specs/v2/tools.md`
    98	
    99	### 这说明了什么
   100	
   101	OpenCode 很明确地反对一种混写：
   102	
   103	- “出现在工具目录里” != “执行时已授权”
   104	- “用户保存过一次 allow” != “工具权限无限放大”
   105	- “registry 能看到全部工具” != “registry 有权替叶子工具审批”
   106	
   107	这套边界在三家里是最清楚的。  
   108	证据类型：推断。依据 `permission.ts`、`tool/registry.ts`、`tool/AGENTS.md` 与 `specs/v2/tools.md`。
   109	
   110	### 人工 override 在这里是什么
   111	
   112	- `reply(reject)` 会拒绝当前 pending request，还会把同 session 的其他 pending request 一并 reject。
   113	  - 证据类型：本地源码。`opencode/packages/core/src/permission.ts`
   114	- `reply(always)` 会把允许规则持久化成 saved permissions。
   115	  - 证据类型：本地源码。`opencode/packages/core/src/permission.ts`
   116	
   117	也就是说，人工 override 在 OpenCode 里不是“神奇大按钮”，而是明确地改写 request 的生命周期与持久化范围。  
   118	证据类型：本地源码 + 推断。依据 `permission.ts` 中 `reply(reject)` 对 pending request 的处置，以及 `reply(always)` 对 saved permissions 的持久化写入。
   119	
   120	## Codex：审批策略、审查者、权限配置、工具权限是分层协议
   121	
   122	### approval policy 的边界
   123	
   124	- `AskForApproval` 是显式枚举：`untrusted`、`on-failure`、`on-request`、`granular`、`never`。
   125	  - 证据类型：本地源码。`codex/codex-rs/app-server-protocol/src/protocol/v2/shared.rs`
   126	- `granular` 甚至继续拆成 `sandbox_approval`、`rules`、`skill_approval`、`request_permissions`、`mcp_elicitations`。
   127	  - 证据类型：本地源码。`codex/.../shared.rs`
   128	
   129	这说明 `approval policy` 在 Codex 里是“什么时候为哪类事情送审”，而不是批准后授予什么具体权限。
   130	
   131	### reviewer 的边界
   132	
   133	- `ApprovalsReviewer` 明确区分 `user` 与 `auto_review`/`guardian_subagent`。
   134	  - 证据类型：本地源码。`codex/.../shared.rs`
   135	
   136	也就是说：
   137	
   138	- `approval policy` 解决“要不要审”。
   139	- `approvals_reviewer` 解决“谁来审”。
   140	
   141	两者不是一个字段换个名字。  
   142	证据类型：本地源码。`codex/.../shared.rs`、`thread.rs`
   143	
   144	### permission scope 的边界
   145	
   146	- `ThreadStartParams` / `ThreadResumeParams` / `ThreadSettingsUpdateParams` 都允许设置 `sandbox` 或 `permissions`，并明确声明两者不能同时使用。
   147	  - 证据类型：本地源码。`codex/codex-rs/app-server-protocol/src/protocol/v2/thread.rs`
   148	- `ActivePermissionProfile` 明确记录当前生效的是哪个 profile，以及它是否继承了别的 profile。
   149	  - 证据类型：本地源码。`codex/codex-rs/app-server-protocol/src/protocol/v2/permissions.rs`
   150	- `AdditionalPermissionProfile` 又进一步支持 per-command 的 network / filesystem overlay。
   151	  - 证据类型：本地源码。`codex/.../permissions.rs`
   152	
   153	这说明 Codex 把 permission scope 做成了独立配置对象，而不是 approval policy 的副产品。
   154	
   155	### tool authority 的边界
   156	
   157	- `goal` 工具虽可见，但 `update_goal` 只能把状态设为 `complete` 或 `blocked`。
   158	  - 证据类型：本地源码。`codex/codex-rs/ext/goal/src/spec.rs`
   159	- `GoalToolExecutor` 明确拒绝 pause/resume/budget-limited/usage-limited。
   160	  - 证据类型：本地源码。`codex/codex-rs/ext/goal/src/tool.rs`
   161	
   162	这正是 tool authority 的典型例子：
   163	
   164	- 审批通过不意味着工具能任意改状态。
   165	- profile 允许 shell/file/network 也不意味着 `goal` 工具能越过其契约。
   166	
   167	```mermaid
   168	sequenceDiagram
   169	  participant Model
   170	  participant ThreadPolicy as Thread Policy
   171	  participant Reviewer
   172	  participant PermissionProfile
   173	  participant Tool
   174	
   175	  Model->>ThreadPolicy: 发起请求
   176	  ThreadPolicy->>Reviewer: 按 approval_policy 决定是否送审
   177	  Reviewer-->>ThreadPolicy: user / auto_review 决策
   178	  ThreadPolicy->>PermissionProfile: 合并 sandbox / permissions / overlays
   179	  PermissionProfile->>Tool: 授予具体资源范围
   180	  Tool-->>Model: 仍受自身 tool authority 约束
   181	```
   182	
   183	### 公开失效面
   184	
   185	- `codex exec` 非交互场景里，MCP tool call 会因为 stdin 关闭而被 auto-cancel；用户只能退回 `--dangerously-bypass-approvals-and-sandbox`，这暴露了 headless approval 边界。
   186	  - 证据类型：公开 issue / discussion。`openai/codex#24135`、`#29857`
   187	- compaction/resume 后 `approvals_reviewer=auto_review` 可能丢失，线程退回手工审批。
   188	  - 证据类型：公开 issue / discussion。`openai/codex#23875`
   189	- automation / goal resume 之后线程可能降级为更保守的 approval path。
   190	  - 证据类型：公开 issue / discussion。`openai/codex#29610`
   191	
   192	## 并排比较：别把四层边界压成一个“权限系统”
   193	
   194	| 维度 | Claude Code | OpenCode | Codex |
   195	|---|---|---|---|
   196	| approval policy 主落点 | runtime mode + hook + prompt | ruleset ask/allow/deny | protocol enum |
   197	| human override 形式 | prompt/Stop/hook/改 mode | reply reject/always | reviewer、人类批准、thread settings 更新 |
   198	| permission scope | 规则集与 session mode，公开对象较弱 | request/save/saved rules 很明确 | profile、additional permissions、sandbox overlays |
   199	| tool authority | 工具本身 + runtime discipline | 叶子工具自行声明 | tool contract 明写不可越权状态 |
   200	
   201	- 证据类型：推断。依据前文本地源码、官方文档与公开 issue 的综合比较。
   202	
   203	## 设计启发
   204	
   205	1. `approval policy` 应该回答“何时送审”，不要同时承担“批准到哪些资源”的职责。Codex 的字段拆法最清楚。  
   206	   证据类型：推断。依据 `AskForApproval`、`ApprovalsReviewer`、`ActivePermissionProfile` 的职责边界。
   207	2. `tool authority` 必须独立存在，否则审批一旦放宽，模型就会把高价值状态当成普通可写字段。Codex 的 `goal` 契约是一个很好的反例防护。  
   208	   证据类型：推断。依据 `ext/goal/src/spec.rs` 与 `tool.rs`。
   209	3. 人工 override 最好做成显式 request lifecycle 操作，而不是神秘 UI 按钮。OpenCode 的 `reply(reject/always)` 比较值得复用。  
   210	   证据类型：推断。依据 `opencode/packages/core/src/permission.ts`

### docs/ai-coding/coding-agents/design-principles/sandbox-and-execution-isolation.md
     1	# 沙箱与执行隔离：同样叫 sandbox，三家隔离的对象根本不是一回事
     2	
     3	这一篇讨论的是：文件系统、shell、网络、工作目录、权限升级、容器/进程隔离，到底分别落在哪一层。
     4	
     5	先给结论：
     6	
     7	- `Claude Code` 的隔离边界更像“会话运行时上的安全护栏”：有 permission mode、可选 sandbox、额外工作目录、remote/bridge 环境差异，但公开主叙事不是一个强协议化 sandbox profile。
     8	  - 证据类型：本地源码。`claude-code-src/src/Tool.ts`、`src/bridge/sessionRunner.ts`、`src/bridge/bridgeUI.ts`
     9	  - 证据类型：公开 issue / discussion。`anthropics/claude-code#59969`、`#63988`
    10	- `OpenCode` 当前更强调 `Location / workspace / permission / process boundary`，而不是对外暴露一组像 `read-only/workspace-write` 那样的统一 sandbox policy 名称。
    11	  - 证据类型：本地源码。`opencode/packages/core/src/filesystem.ts`、`src/cross-spawn-spawner.ts`、`src/permission.ts`
    12	  - 证据类型：官方文档。仓库内 `opencode/specs/v2/tools.md`、仓库根 `TODO.md`
    13	- `Codex` 在三家里把隔离面写得最显式：thread protocol 里有 `sandbox`/`permissions`，沙箱策略里明确区分 `read-only`、`workspace-write`、`danger-full-access`、`external-sandbox`，并继续分解 writable roots、network access、临时目录排除与独立命令执行。
    14	  - 证据类型：本地源码。`codex/codex-rs/app-server-protocol/src/protocol/v2/shared.rs`、`permissions.rs`、`thread.rs`、`command_exec.rs`
    15	  - 证据类型：官方文档。`codex/codex-rs/README.md`
    16	  - 证据类型：公开 issue / discussion。`openai/codex#14068`、`#5041`、`#12996`、`#28281`
    17	
    18	## 先把六层隔离分开
    19	
    20	- `文件系统隔离`：哪些路径可读、可写、可删除。
    21	- `shell 隔离`：shell 命令是否被包装、是否要额外审批、是否存在非 shell 的 exec 通道。
    22	- `网络隔离`：DNS、HTTP、socket 是否允许。
    23	- `工作目录隔离`：进程从哪个 cwd 启动，运行时是否能切换 cwd，切换后边界是否跟着变。
    24	- `权限升级`：本来不允许的操作能否通过人工或策略临时升级。
    25	- `容器/进程隔离`：命令是跑在当前宿主、受限子进程，还是外部环境/容器里。
    26	
    27	如果不先分层，最容易出现的错误是把“文件可写”写成“全权限”，或者把“允许网络”写成“没有 sandbox”。
    28	
    29	```mermaid
    30	flowchart TD
    31	  Policy[策略层<br/>approval / permissions / sandbox mode]
    32	  Runtime[运行时层<br/>session / thread / location]
    33	  Proc[进程层<br/>shell / exec / helper]
    34	  FS[文件系统]
    35	  Net[网络]
    36	  Cwd[工作目录]
    37	  Human[人工升级]
    38	
    39	  Policy --> Runtime
    40	  Runtime --> Proc
    41	  Proc --> FS
    42	  Proc --> Net
    43	  Runtime --> Cwd
    44	  Human --> Policy
    45	  Human --> Proc
    46	```
    47	
    48	## Claude Code：公开出来的是 permission runtime，不是强协议 sandbox
    49	
    50	### 文件系统与工作目录
    51	
    52	- `ToolPermissionContext` 里有 `additionalWorkingDirectories`，说明它允许在主 cwd 之外额外开放工作目录，但这更像运行时附加权限，而不是独立 profile 对象。
    53	  - 证据类型：本地源码。`claude-code-src/src/Tool.ts`
    54	- `bootstrap/state.ts` 区分 `originalCwd`、`projectRoot`、当前 `cwd`，并说明 worktree 启动与中途 EnterWorktreeTool 的行为不同。
    55	  - 证据类型：本地源码。`claude-code-src/src/bootstrap/state.ts`
    56	
    57	### shell 与进程
    58	
    59	- bridge `sessionRunner` 会以子进程方式启动 CLI，并把 `cwd`、`permissionMode`、`CLAUDE_CODE_FORCE_SANDBOX` 等环境注入 child process。
    60	  - 证据类型：本地源码。`claude-code-src/src/bridge/sessionRunner.ts`
    61	- 这说明它至少支持“在桥接/远程模式下强制把 child 会话放进 sandbox”。
    62	  - 证据类型：本地源码。`claude-code-src/src/bridge/sessionRunner.ts`
    63	
    64	### 网络与宿主差异
    65	
    66	- `remote-control`、Desktop、本地 REPL、headless/SDK 不是同一个执行环境；一些命令只在交互终端可用，一些在桌面 local-agent 被 denylist。
    67	  - 证据类型：公开 issue / discussion。`anthropics/claude-code#59969`、`#63988`
    68	
    69	### 权限升级边界
    70	
    71	- `Claude Code` 确实允许把本来不允许的操作临时放宽，但公开路径主要是 UI 审批、hook 返回结果、切换 permission mode，或在 bridge/remote 宿主里通过控制面改变本次会话的运行方式。
    72	  - 证据类型：本地源码 + 官方文档。`claude-code-src/src/Tool.ts`、`src/bridge/bridgeMessaging.ts`、hooks 文档
    73	- 这些放宽更像“对当前 runtime 规则和当前请求做协商式调整”，而不是像 `Codex` 那样显式叠加一个独立的 profile overlay 对象。
    74	  - 证据类型：本地源码 + 推断。依据 `Claude Code` 公开的是 `mode`、规则集、bridge 控制请求与 hook 结果，而 `Codex` 公开的是 `ActivePermissionProfile`、`AdditionalPermissionProfile` 与 thread-level `sandbox/permissions` 配置。
    75	- 如果进入 Desktop、本地 agent、remote-control 或非交互宿主，这些升级入口是否可见、由谁触发、能放宽到什么范围，还会继续受宿主能力面约束。
    76	  - 证据类型：公开 issue / discussion + 推断。`anthropics/claude-code#59969`、`#63988`
    77	
    78	### 关键 trade-off
    79	
    80	`Claude Code` 更像：
    81	
    82	- “先有交互式 runtime，再给它加权限和 sandbox 护栏”
    83	
    84	而不是：
    85	
    86	- “先定义统一 sandbox contract，再让所有宿主照着跑”
    87	
    88	证据类型：推断。依据 `ToolPermissionContext`、`sessionRunner` 和公开宿主边界 issue。
    89	
    90	## OpenCode：隔离主轴是 Location、workspace 与 trusted process leaf
    91	
    92	### 文件系统
    93	
    94	- `filesystem.ts` 会把输入解析为相对 `location.directory` 的绝对路径，并检查目标路径必须包含在 location 根内。
    95	  - 证据类型：本地源码。`opencode/packages/core/src/filesystem.ts`
    96	- 这说明 OpenCode 的第一层隔离单位是 `Location` 或 workspace 根，而不是一个对外宣传的“read-only / workspace-write”名字。  
    97	  证据类型：本地源码 + 推断。依据 `filesystem.ts` 的 location containment 实现，以及当前公开文档更强调 workspace/location 边界而非统一命名 sandbox mode。
    98	
    99	### shell / 进程
   100	
   101	- `cross-spawn-spawner.ts` 显式整理 `cwd`、`shell` 等子进程参数，说明 shell 执行是受统一进程启动器约束的。
   102	  - 证据类型：本地源码。`opencode/packages/core/src/cross-spawn-spawner.ts`
   103	- `tools.md` 明确说 interruption 是 cancellation 机制，并要求工具不要吞掉 interruption，说明 shell/process 隔离不仅是路径问题，也是 effect lifecycle 问题。
   104	  - 证据类型：官方文档。仓库内 `opencode/specs/v2/tools.md`
   105	
   106	### 权限升级与 scope
   107	
   108	- `PermissionV2` 把 action/resource 作为授权基本单位，还支持 `always` 持久化保存。
   109	  - 证据类型：本地源码。`opencode/packages/core/src/permission.ts`
   110	
   111	这意味着 OpenCode 的“升级”更像：
   112	
   113	- 扩大某个 action/resource scope
   114	
   115	而不是：
   116	
   117	- 直接切换到一个全新 sandbox mode
   118	
   119	### 容器/进程隔离与公开未完成面
   120	
   121	- 官方 TODO 里专门提到要重新审视 hostile external process 的 syscall-level mutation confinement，还没把 descriptor-relative mutation 之类硬边界完全做实。
   122	  - 证据类型：官方文档。仓库根 `opencode/TODO.md`
   123	- 同一份 TODO 也说明 clustered interruption、stale-owner fencing、background bash jobs 等隔离难题仍在切片化推进。
   124	  - 证据类型：官方文档。仓库根 `opencode/TODO.md`
   125	
   126	所以更稳的写法是：
   127	
   128	- OpenCode 已经有明确的 location/process/permission 边界；
   129	- 但它当前公开主叙事仍是 runtime decomposition，而不是统一命名的 sandbox 产品面。
   130	
   131	证据类型：推断。依据 `filesystem.ts`、`cross-spawn-spawner.ts`、`permission.ts`、`TODO.md`。
   132	
   133	## Codex：把隔离对象写进协议和 profile
   134	
   135	### sandbox mode 与 sandbox policy 是两层
   136	
   137	- `SandboxMode` 只有三种高层入口：`read-only`、`workspace-write`、`danger-full-access`。
   138	  - 证据类型：本地源码。`codex/codex-rs/app-server-protocol/src/protocol/v2/shared.rs`
   139	- 真正生效的 `SandboxPolicy` 继续细分为：
   140	  - `ReadOnly { network_access }`
   141	  - `WorkspaceWrite { writable_roots, network_access, exclude_tmpdir_env_var, exclude_slash_tmp }`
   142	  - `DangerFullAccess`
   143	  - `ExternalSandbox { network_access }`
   144	  - 证据类型：本地源码。`codex/.../permissions.rs`
   145	
   146	这说明 `sandbox mode` 是用户入口，`sandbox policy` 是运行时展开后的具体隔离对象。
   147	
   148	### 文件系统
   149	
   150	- `workspace-write` 不只是“当前目录可写”，还显式带 `writable_roots`。
   151	  - 证据类型：本地源码。`codex/.../permissions.rs`
   152	- 官方 README 还补充：在 `workspace-write` 下，`~/.codex/memories` 也会加入 writable roots。
   153	  - 证据类型：官方文档。`codex/codex-rs/README.md`
   154	
   155	### 网络
   156	
   157	- `ReadOnly` 和 `WorkspaceWrite` 都要单独声明 `network_access`。
   158	  - 证据类型：本地源码。`codex/.../permissions.rs`
   159	- `ExternalSandbox` 甚至把网络单独抽成 `Restricted/Enabled` 枚举。
   160	  - 证据类型：本地源码。`codex/.../permissions.rs`
   161	
   162	所以在 Codex 里：
   163	
   164	- 只读文件系统 != 禁网
   165	- 可写工作区 != 自动放开网络
   166	
   167	证据类型：本地源码 + 推断。依据 `ReadOnly { network_access }` 与 `WorkspaceWrite { ..., network_access, ... }` 是彼此独立的结构字段，因而文件系统写权限与网络权限不是同一个开关。
   168	
   169	### 工作目录
   170	
   171	- `ThreadStartParams`、`ThreadResumeParams`、`ThreadSettingsUpdateParams` 都带 `cwd` 和 `runtime_workspace_roots`。
   172	  - 证据类型：本地源码。`codex/codex-rs/app-server-protocol/src/protocol/v2/thread.rs`
   173	
   174	这意味着 cwd 不是一个隐式 shell 参数，而是 thread control plane 的一部分。
   175	
   176	### 权限升级
   177	
   178	- thread/turn/standalone command 都允许设置 `permissions` profile 或 `sandboxPolicy`，但明确不能同时使用。
   179	  - 证据类型：本地源码。`codex/.../thread.rs`、`command_exec.rs`
   180	- `ApprovalsReviewer` 与 `AskForApproval` 再决定升级请求由谁审、何时审。
   181	  - 证据类型：本地源码。`codex/.../shared.rs`
   182	
   183	### 容器与进程隔离
   184	
   185	- 官方 README 直接写出 `codex sandbox` 会按宿主平台使用 Seatbelt、Linux sandbox 或 Windows restricted token。
   186	  - 证据类型：官方文档。`codex/codex-rs/README.md`
   187	- `command_exec` 又提供“在 server sandbox 中运行 standalone command”的独立接口，而 `process.rs` 则是“不经过 Codex sandbox 的 host process”。
   188	  - 证据类型：本地源码。`codex/codex-rs/app-server-protocol/src/protocol/v2/command_exec.rs`、`process.rs`
   189	
   190	这在三家里是最明确的进程边界拆分。
   191	
   192	```mermaid
   193	flowchart LR
   194	  Thread[thread/start or resume] --> Policy[approval + permissions + sandbox]
   195	  Policy --> SandboxedExec[command_exec / tool exec in sandbox]
   196	  Policy --> HostExec[host process API]
   197	  SandboxedExec --> FS1[filesystem roots]
   198	  SandboxedExec --> Net1[network policy]
   199	  Thread --> Cwd[cwd + runtime workspace roots]
   200	  Human[reviewer / user] --> Policy
   201	```
   202	
   203	### 公开失效面
   204	
   205	- `app-server` 工具命令可能仍在 `read-only` sandbox 中执行，即使上层看起来已经 bypass 了 approvals/sandbox。
   206	  - 证据类型：公开 issue / discussion。`openai/codex#14068`
   207	- VS Code / Desktop 等宿主里曾出现 network policy 传播不一致，即便用户认为自己已经开了 full access。
   208	  - 证据类型：公开 issue / discussion。`openai/codex#5041`、`#12996`、`#28281`
   209	
   210	## 并排比较：三家的“沙箱”不是同一个抽象
   211	
   212	| 维度 | Claude Code | OpenCode | Codex |
   213	|---|---|---|---|
   214	| 公开主抽象 | permission runtime + 可选 sandbox | location/workspace/process boundary | protocolized sandbox mode/policy |
   215	| 文件系统边界 | cwd + additional working dirs + runtime rules | location.directory containment | writable_roots / permission profiles |
   216	| 网络边界 | 宿主相关，公开对象较弱 | 更多落在 permission/process 设计 | sandbox policy 显式字段 |
   217	| shell 边界 | child CLI / tool runtime / hooks | cross-spawn + trusted tools | sandboxed command_exec 与 host process 分离 |
   218	| 权限升级 | UI/hook/mode/remote control | request/reply/saved scope | approval_policy + reviewer + permission profile |
   219	| 容器/OS 隔离 | 公开细节较少 | 仍在持续硬化 | Seatbelt / Linux sandbox / Windows token 明示 |
   220	
   221	- 证据类型：推断。依据前文本地源码、官方文档与公开 issue 的综合比较。
   222	
   223	## 设计启发
   224	
   225	1. 不要用一个 `sandbox=true` 掩盖文件系统、网络、cwd、exec 通道四个不同问题。Codex 的 policy 拆法最值得借鉴。  
   226	   证据类型：推断。依据 `SandboxMode` 与 `SandboxPolicy` 的双层设计。
   227	2. 如果系统以 workspace/location 为核心，文档就应该像 OpenCode 一样把边界写成 location containment，而不是强行假装自己有统一产品化 sandbox mode。  
   228	   证据类型：推断。依据 `filesystem.ts` 与 `TODO.md`
   229	3. 交互式 runtime 的宿主差异必须单独写，不然用户会误以为桌面、终端、headless 是同一种隔离环境。Claude Code 的公开 issue 已经证明这点。  
   230	   证据类型：公开 issue / discussion。`anthropics/claude-code#59969`、`#63988`
