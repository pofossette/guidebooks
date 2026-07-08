Task 4 review package

## verification
- mkdocs build: passed via `uv run mkdocs build -f mkdocs.yml` (site-wide warnings exist outside this task)
- mermaid check: passed via `pnpm run check:mermaid`

### docs/ai-coding/coding-agents/design-principles/context-management-and-compaction.md
     1	# 上下文管理与压缩：真正决定长任务稳定性的不是窗口大小，而是边界怎么切
     2	
     3	这一篇只讨论一件事：当 agent 面对长对话、长工具输出、长任务链路时，系统怎样决定哪些内容继续保留、哪些内容转写成摘要、哪些内容只能留在 durable 状态里而不再直接暴露给模型。
     4	
     5	先给结论：
     6	
     7	- `Claude Code` 最强调“压缩前后仍能维持会话链完整”，所以它在 `compact_boundary`、`preservedSegment`、`pre_compact/post_compact` hooks、session memory 之间做了很多边界修补。证据类型：本地源码。`claude-code-src/src/services/compact/compact.ts`、`src/QueryEngine.ts`、`src/Tool.ts`、`src/services/compact/sessionMemoryCompact.ts`
     8	- `OpenCode` 的 compaction 更像一次可回放的 durable checkpoint：旧前缀并没有被删掉，而是把模型可见表示切换成“结构化 summary + recent tail + fresh baseline”。证据类型：本地源码。`opencode/packages/core/src/session/compaction.ts`、`src/session/history.ts`、`src/session/context-epoch.ts`
     9	- `Codex` 当前公开材料里没有把“对话压缩算法”暴露成像前两家那样完整的单独模块；它更明显的是把 instruction source、thread/turn view、goal/runtime、audit/analytics 先协议化，再让 compaction 作为线程系统中的一类事件和限流手段出现。证据类型：本地源码。`codex/codex-rs/app-server-protocol/src/protocol/v2/thread.rs`、`thread_data.rs`、`codex-rs/analytics/src/client.rs`、`codex-rs/README.md`
    10	- 三家都不是“把旧消息直接截断”这么简单。真正的设计题是：前缀规则怎么定义、尾部要保留多少、工具输出能保留到什么粒度、压缩发生在 turn 之前还是 turn 中间，以及压缩后恢复时谁来承接语义连续性。证据类型：推断。依据前述源码和规格职责切分。
    11	
    12	## 先把五个压缩问题分开
    13	
    14	很多文档把 compaction 写成一句“上下文太长时做摘要”，这会掩盖真正的设计差异。更稳妥的拆法是：
    15	
    16	- `前缀规则`：哪些旧内容必须进入摘要，哪些内容要被完全剔除。
    17	- `尾部保留`：最近消息是否原样保留，保留到 token 上限还是按 turn 数保留。
    18	- `工具输出裁剪`：是先裁工具结果，再决定是否压缩，还是把完整工具结果交给压缩器处理。
    19	- `pre-turn compaction`：在下一轮请求发给模型之前判断预算是否超限。
    20	- `mid-turn compaction`：请求已经发出后，因 context overflow 或恢复路径再做一次压缩。
    21	
    22	```mermaid
    23	flowchart TD
    24	  A[历史消息与工具结果] --> B{请求预算是否超限}
    25	  B -- 否 --> C[直接组装下一轮上下文]
    26	  B -- 是 --> D[前缀归并]
    27	  D --> E[尾部保留]
    28	  E --> F[工具输出裁剪或替换]
    29	  F --> G[生成压缩边界/摘要]
    30	  G --> H[重建下一轮上下文]
    31	  H --> I{运行中仍溢出?}
    32	  I -- 否 --> J[继续执行]
    33	  I -- 是 --> K[mid-turn overflow recovery]
    34	```
    35	
    36	- 证据类型：推断。依据 `Claude Code` 的 `compact_boundary`、`OpenCode` 的 overflow compaction，以及 `Codex` 的 thread/turn/item 分层。
    37	
    38	## Claude Code：更像“带保留尾段和钩子的会话压缩器”
    39	
    40	### 前缀规则与尾部保留
    41	
    42	- `annotateBoundaryWithPreservedSegment()` 会把保留尾段写入 `compactMetadata.preservedSegment`，显式记录 `headUuid`、`anchorUuid`、`tailUuid`，说明 Claude Code 并不是只产一段 summary，而是要在压缩边界后重新接回一段原始尾部消息。证据类型：本地源码。`claude-code-src/src/services/compact/compact.ts`
    43	- `QueryEngine` 在写入 `compact_boundary` 前会先把 preserved tail 对应的 in-memory 消息刷入 transcript，避免恢复时找不到 `tailUuid`，说明它把“恢复链正确性”看得和“省 token”同样重要。证据类型：本地源码。`claude-code-src/src/QueryEngine.ts`
    44	
    45	这意味着 Claude Code 的默认思路不是“旧的都摘要，新的都保留”，而是：
    46	
    47	1. 先制造一个显式 boundary。
    48	2. 再把必须原样保留的 suffix 接回去。
    49	3. 恢复时按 metadata 重连链路。
    50	
    51	- 证据类型：推断。依据前述 `preservedSegment` 与 transcript flush 逻辑。
    52	
    53	### pre-turn 与 mid-turn compaction
    54	
    55	- `Tool.ts` 为 `pre_compact`、`post_compact`、`session_start` 暴露了专门进度事件，说明 compaction 被当作一类一等运行时阶段，而不是单纯内部优化。证据类型：本地源码。`claude-code-src/src/Tool.ts`
    56	- `compactConversation()` 在真正摘要前先执行 `PreCompact hooks`，再合并 hook 返回的自定义 instructions，说明 Claude Code 允许“压缩策略前插入额外规则”。证据类型：本地源码。`claude-code-src/src/services/compact/compact.ts`
    57	- `QueryEngine` 里有 `snipReplay`、`HISTORY_SNIP`、`projectSnippedView` 相关逻辑，说明它还存在“长会话 headless 模式下直接截短内存表示”的另一层策略。证据类型：本地源码。`claude-code-src/src/QueryEngine.ts`
    58	
    59	这里的 trade-off 很明确：
    60	
    61	- 好处：压缩既能被 hooks 定制，也能兼顾恢复链和 UI 会话体验。
    62	- 代价：压缩逻辑分散在 summary、transcript、boundary relink、session restore 多层，复杂度高。
    63	
    64	- 证据类型：推断。依据 `compact.ts`、`QueryEngine.ts`、`sessionRestore` 相关实现。
    65	
    66	### 工具输出裁剪与 session memory
    67	
    68	- `sessionMemoryCompact.ts` 会先等 session memory extraction 完成，再决定是否用 session memory 代替传统 compaction summary。证据类型：本地源码。`claude-code-src/src/services/compact/sessionMemoryCompact.ts`
    69	- 同一文件明确区分两种场景：已知 `lastSummarizedMessageId` 的正常压缩，以及 resumed session 下“不知道旧边界，只能拿 memory 当摘要”的恢复式压缩。证据类型：本地源码。`claude-code-src/src/services/compact/sessionMemoryCompact.ts`
    70	- `SessionMemory/sessionMemory.ts` 里 session memory extraction 只在 `main REPL thread` 运行，并用 `createSubagentContext()` 与 `runForkedAgent()` 隔离提炼过程，说明 Claude Code 把“长期会话摘要生成”当成后台子代理任务，而不是每轮都让主代理自己总结。证据类型：本地源码。`claude-code-src/src/services/SessionMemory/sessionMemory.ts`
    71	
    72	所以 Claude Code 的一个关键特征是：  
    73	`工具结果 -> 后台提炼 session memory -> 再反哺 compaction`。
    74	
    75	- 证据类型：推断。依据 `sessionMemory.ts` 与 `sessionMemoryCompact.ts` 的调用关系。
    76	
    77	## OpenCode：把 compaction 做成 durable checkpoint，而不是 transcript 修补术
    78	
    79	### 前缀规则
    80	
    81	- `SessionCompaction.select()` 会把会话分成 `head` 和 `recent` 两部分，并按 token 预算从尾部反向保留 recent；如果一条消息刚好跨边界，还会把它切成 `splitPrefix` 和 `splitSuffix`。证据类型：本地源码。`opencode/packages/core/src/session/compaction.ts`
    82	- `buildPrompt()` 不是盲目重写摘要，而是把 `previousSummary` 和新增 `context` 一起传给总结模型，说明 OpenCode 采用“锚定式滚动摘要”。证据类型：本地源码。`opencode/packages/core/src/session/compaction.ts`
    83	
    84	和 Claude Code 不同，OpenCode 没有把重点放在“如何把旧消息 parent uuid 接回来”，而是放在“如何稳定地产出下一次可继续更新的 summary”。  
    85	证据类型：推断。依据 `SessionCompaction.select/buildPrompt` 与 Claude 的 boundary relink 对比。
    86	
    87	### 尾部保留与工具输出裁剪
    88	
    89	- OpenCode 明确设置了 `DEFAULT_KEEP_TOKENS = 8000` 与 `TOOL_OUTPUT_MAX_CHARS = 2000`，先把工具输出序列化并裁到安全长度，再交给 summary pipeline。证据类型：本地源码。`opencode/packages/core/src/session/compaction.ts`
    90	- `serialize()` 里对 assistant tool call、tool result、tool error 都有不同文本化格式，说明它更强调“压缩时保留任务语义骨架”，不是保留 provider-native 原始对象。证据类型：本地源码。`opencode/packages/core/src/session/compaction.ts`
    91	
    92	这是一种更强的标准化路线：
    93	
    94	- 压缩前先把消息“降格”为稳定文本骨架。
    95	- recent tail 按 token 预算保留。
    96	- summary 更新保持模板结构不变。
    97	
    98	- 证据类型：推断。依据 `serialize()`、`SUMMARY_TEMPLATE`、`select()`。
    99	
   100	### pre-turn 与 mid-turn overflow compaction
   101	
   102	- `compactIfNeeded()` 在 provider turn 之前用请求大小和 `context - max(output, buffer)` 比较，属于典型 pre-turn compaction。证据类型：本地源码。`opencode/packages/core/src/session/compaction.ts`
   103	- `runner/llm.ts` 明确区分 `ContinueAfterCompaction` 与 `ContinueAfterOverflowCompaction`，而且只在“provider 因上下文溢出且还没有 durable assistant output”时允许一次 overflow-triggered compaction。证据类型：本地源码。`opencode/packages/core/src/session/runner/llm.ts`
   104	- 官方 `specs/v2/session.md` 也写明：第二次 overflow、compaction 不可用、或溢出发生在已有 durable 输出之后，都变成正常终止失败，不会无界重试。证据类型：官方文档。`opencode/specs/v2/session.md`
   105	
   106	这说明 OpenCode 在这条线上比 Claude Code 更保守：
   107	
   108	- 它允许 mid-turn recovery。
   109	- 但 recovery 只允许一个明确边界，避免重复重放副作用。
   110	
   111	- 证据类型：推断。依据 `runner/llm.ts` 和 `specs/v2/session.md`。
   112	
   113	## Codex：当前更突出“上下文来源协议化”，而不是公开完整 compaction 算法
   114	
   115	### 前缀规则不先体现在单个压缩器，而先体现在协议视图
   116	
   117	- `ThreadStartResponse` 会返回 `instruction_sources`，`Thread`/`Turn`/`TurnItemsView` 则区分 `NotLoaded`、`Summary`、`Full` 三种 item 视图，说明 Codex 先把“哪些上下文来源已加载、turn item 加载到什么程度”协议化。证据类型：本地源码。`codex/codex-rs/app-server-protocol/src/protocol/v2/thread.rs`、`thread_data.rs`
   118	- `README.md` 明确说 `workspace-write` 模式会把 `~/.codex/memories` 一并放进可写根，说明 memory 并不是纯提示词对象，而是被视作受权限约束的持久上下文资产。证据类型：官方文档。`codex/codex-rs/README.md`
   119	
   120	因此，Codex 当前更像先解决：
   121	
   122	- 指令来源如何声明；
   123	- 线程历史如何按 summary/full 视图读取；
   124	- memory 如何进入受控读写面；
   125	
   126	再把 compaction 作为 thread analytics 和 runtime 的一部分去演进。  
   127	证据类型：推断。依据 `thread.rs`、`thread_data.rs`、`README.md`、`analytics` 中的 compaction 事件。
   128	
   129	### memory 不是“会话摘要文件”，而是独立读写管线
   130	
   131	- `memories/README.md` 把 memory 分成 read path 和 write path，并明确 Phase 1/Phase 2：先按 rollout 提炼，再全局 consolidation。证据类型：官方文档。`codex/codex-rs/memories/README.md`
   132	- `ext/memories` 会把 memory read-path prompt 追加到 developer instructions，并对 `memory_summary.md` 做 token 限制。证据类型：本地源码。`codex/codex-rs/ext/memories/src/prompts.rs`、`src/extension.rs`
   133	
   134	这和 Claude Code 的 session memory 最大的差异在于：
   135	
   136	- Claude 的 session memory 更贴近单会话 compaction 辅助物。
   137	- Codex 的 memories 更像跨 rollout、跨线程的持久知识资产。
   138	
   139	- 证据类型：推断。依据 `sessionMemoryCompact.ts` 与 `memories/README.md` 的职责不同。
   140	
   141	## 并排比较：三家的“压缩”不在同一层
   142	
   143	| 维度 | Claude Code | OpenCode | Codex |
   144	|---|---|---|---|
   145	| 前缀处理主轴 | boundary + preserved tail relink | anchored summary + recent tail | thread/item/instruction source 视图先行 |
   146	| 尾部保留 | 显式 preserved segment | token 预算内 recent tail | 公开为 summary/full 读取视图 |
   147	| 工具输出处理 | session memory 与 compact 协同 | 先标准化序列化并裁剪 | 更偏 memory/turn asset 管理 |
   148	| pre-turn compaction | 有 | 有 | 未以同层算法公开 |
   149	| mid-turn overflow recovery | 有多路径恢复语义，但实现更分散 | 有且边界明确，只尝试一次 | 公开更强调 thread/runtime 恢复而非同层对话压缩 |
   150	
   151	- 证据类型：推断。依据前文本地源码与官方规格综合比较。
   152	
   153	## 设计启发
   154	
   155	1. 真正稳的 compaction 不是“会总结”，而是“压缩后还能恢复对”。Claude Code 说明 boundary relink 是一等问题。证据类型：推断。依据 `compact.ts` 与 `QueryEngine.ts`。
   156	2. 如果要做 durable runtime，最好把 compaction 产物设计成稳定 checkpoint，而不是只保留一段自由文本摘要。OpenCode 在这点上最清楚。证据类型：推断。依据 `session/compaction.ts`、`session/history.ts`、`specs/v2/session.md`。
   157	3. 长期 memory 与短期 compaction 不该混为一个对象。Codex 和 Claude Code 刚好代表了两种不同边界：一个偏跨线程 memory pipeline，一个偏单会话压缩辅助。证据类型：推断。依据 `memories/README.md` 与 `sessionMemoryCompact.ts`。
   158	4. mid-turn compaction 必须有重试边界，否则很容易演化成“溢出后反复压缩再重试”的副作用放大器。OpenCode 的一次性 overflow recovery 是更稳的设计。证据类型：官方文档 + 本地源码。`opencode/specs/v2/session.md`、`opencode/packages/core/src/session/runner/llm.ts`

### docs/ai-coding/coding-agents/design-principles/memory-rules-and-project-instructions.md
     1	# 记忆、规则与项目说明：不要把 AGENTS、长期记忆、会话上下文写成同一个东西
     2	
     3	这一篇要拆开的不是功能，而是四种经常被混写的“上下文来源”：
     4	
     5	1. 规则文件
     6	2. 长期记忆
     7	3. 会话上下文
     8	4. skills / instructions 注入
     9	
    10	如果不先分层，后面的 compaction、resume、subagent handoff、eval 都会被写乱。
    11	
    12	先给结论：
    13	
    14	- `Claude Code` 的核心是把 `CLAUDE.md`、nested memory、skills、session memory、turn messages 混合进一条会话组装链，但这些对象的生命周期并不相同。证据类型：本地源码。`claude-code-src/src/QueryEngine.ts`、`src/Tool.ts`、`src/bootstrap/state.ts`、`src/services/SessionMemory/sessionMemory.ts`
    15	- `OpenCode` 在三家里最明确地区分了 ambient instructions 与 session history：`AGENTS.md` 通过 `InstructionContext` 作为 System Context Source 注入，而 prompt admission / promoted history 走另一条 durable session 通道。证据类型：本地源码。`opencode/packages/core/src/instruction-context.ts`、`src/session/input.ts`、`src/session/context-epoch.ts`
    16	- `Codex` 把项目规则和长期记忆再拆得更开：`AGENTS.md` 以 `instruction_sources` 和官方 `agents-md` 语义出现，memories 则是单独的读写扩展与后台 consolidation 管线。证据类型：本地源码。`codex/codex-rs/app-server-protocol/src/protocol/v2/thread.rs`、`codex/docs/agents_md.md`、`codex/codex-rs/memories/README.md`
    17	
    18	```mermaid
    19	flowchart LR
    20	  A[规则文件<br/>AGENTS.md / CLAUDE.md] --> X[模型可见上下文]
    21	  B[长期记忆<br/>memory store / session memory] --> X
    22	  C[会话上下文<br/>thread turn history] --> X
    23	  D[skills / 指令注入] --> X
    24	  A --> A1[高优先级约束]
    25	  B --> B1[跨会话或跨线程]
    26	  C --> C1[当前任务过程态]
    27	  D --> D1[按需能力说明]
    28	```
    29	
    30	- 证据类型：推断。依据三家注入链路的不同职责。
    31	
    32	## 先把四类对象分清
    33	
    34	### 规则文件
    35	
    36	- 它们的作用是定义优先级较高、相对稳定的约束。
    37	- 典型例子：`CLAUDE.md`、`AGENTS.md`。
    38	- 问题不是“有没有读到”，而是“作用域、优先级、替换语义是什么”。
    39	
    40	### 长期记忆
    41	
    42	- 它们服务的是跨会话、跨线程、跨 rollout 的延续性。
    43	- 不一定每轮都注入全部内容。
    44	- 可能通过摘要、检索、引用或后台 consolidation 进入当前上下文。
    45	
    46	### 会话上下文
    47	
    48	- 它是当前任务的过程态：prompt、assistant 消息、工具调用、系统更新、todo/progress。
    49	- 它必须能被 resume、compact、audit 和 retry 正确消费。
    50	
    51	### skills / instructions 注入
    52	
    53	- 它们是按需能力说明，不等于项目规则，也不等于长期记忆。
    54	- 关键问题是：何时注入、是否跨 compaction 保留、是否对子代理重新加载。
    55	
    56	- 证据类型：推断。依据后文三家实现分层。
    57	
    58	## Claude Code：规则、技能、session memory 都能进 prompt，但生命周期不同
    59	
    60	### 规则文件
    61	
    62	- `bootstrap/state.ts` 里直接缓存 `cachedClaudeMdContent`，并记录 `additionalDirectoriesForClaudeMd`，说明 `CLAUDE.md` 是会在运行时被专门发现、缓存、重新装配的。证据类型：本地源码。`claude-code-src/src/bootstrap/state.ts`
    63	- `ToolUseContext` 里有 `loadedNestedMemoryPaths`、`nestedMemoryAttachmentTriggers`，并特别说明用来避免重复注入同一份 `CLAUDE.md`。证据类型：本地源码。`claude-code-src/src/Tool.ts`
    64	
    65	这说明 Claude Code 把规则文件当成“会进入模型上下文的高优先级文件”，但它仍受会话装配和缓存约束。  
    66	证据类型：推断。依据 `cachedClaudeMdContent` 与 nested memory 注入逻辑。
    67	
    68	### 长期记忆
    69	
    70	- `QueryEngine.ts` 在构造消息时存在 `memoryMechanicsPrompt` 与 `CLAUDE_COWORK_MEMORY_PATH_OVERRIDE` 分支，说明记忆并不是天生总在上下文里，而是通过额外 mechanics prompt 告诉模型如何使用 memory 目录。证据类型：本地源码。`claude-code-src/src/QueryEngine.ts`
    71	- session memory 是另一类对象：`SessionMemory/sessionMemory.ts` 只在主 REPL 线程后台提炼，并更新 `lastSummarizedMessageId`，更像“当前长会话的渐进摘要”。证据类型：本地源码。`claude-code-src/src/services/SessionMemory/sessionMemory.ts`
    72	
    73	因此 Claude Code 至少有两层 memory：
    74	
    75	- 面向工作流的 memory 目录/机制；
    76	- 面向长会话 compaction 的 session memory。
    77	
    78	- 证据类型：推断。依据 `memoryMechanicsPrompt` 与 session memory 子系统职责不同。
    79	
    80	### skills / instructions 注入
    81	
    82	- `QueryEngine.ts` 在 query 前显式加载 skills 和 plugins。证据类型：本地源码。`claude-code-src/src/QueryEngine.ts`
    83	- `bootstrap/state.ts` 维护 `invokedSkills`，注释直接写明“for preservation across compaction”。证据类型：本地源码。`claude-code-src/src/bootstrap/state.ts`
    84	
    85	这非常关键：  
    86	skills 在 Claude Code 里不是一次性读完就算了，而是被视为压缩后仍需保留的能力上下文。
    87	
    88	- 证据类型：本地源码。`claude-code-src/src/bootstrap/state.ts`
    89	
    90	## OpenCode：最清楚地把规则文件和会话历史拆成两条 durable 轨道
    91	
    92	### 规则文件
    93	
    94	- `InstructionContext.observe()` 会从全局 config 目录和当前项目向上查找 `AGENTS.md`，并把找到的文件渲染成 `Instructions from: <path>` 文本。证据类型：本地源码。`opencode/packages/core/src/instruction-context.ts`
    95	- `SystemContext.make()` 里的 `update()` 明确写着 “These instructions replace all previously loaded ambient instructions.”，说明 OpenCode 对规则文件变化采用替换语义，而不是增量追加语义。证据类型：本地源码。`opencode/packages/core/src/instruction-context.ts`
    96	
    97	这和“把规则文件内容直接塞进 transcript”是两回事。  
    98	证据类型：推断。依据 `InstructionContext` 作为 system context source 的实现。
    99	
   100	### 会话上下文
   101	
   102	- `SessionInput.admit()` 先写 durable inbox 并发布 `PromptAdmitted`；只有后续 promote 才发布 `Prompted` 让它进入模型可见历史。证据类型：本地源码。`opencode/packages/core/src/session/input.ts`
   103	- `SessionContextEpoch.prepare()` 会把当前 System Context 与历史 snapshot 比较，必要时发布 `ContextUpdated`，但不会把它和普通 user prompt 混成一条 admission 流。证据类型：本地源码。`opencode/packages/core/src/session/context-epoch.ts`
   104	
   105	所以 OpenCode 的层级非常分明：
   106	
   107	- 规则文件进入 Context Epoch。
   108	- prompt 进入 session inbox。
   109	- 两者在 safe boundary 处汇合成下一轮 request。
   110	
   111	- 证据类型：推断。依据 `instruction-context.ts`、`session/input.ts`、`session/context-epoch.ts`。
   112	
   113	### skills / instructions 注入
   114	
   115	- `specs/v2/session.md` 明确把“selected-agent available-skill guidance”写进 Context Source，而不是写进普通 transcript。证据类型：官方文档。`opencode/specs/v2/session.md`
   116	- 同一规格还把“configured, remote, and nested instruction sources”列为后续工作，说明 OpenCode 对 instruction injection 的边界是显式设计项，不是假定已经完备。证据类型：官方文档。`opencode/specs/v2/session.md`
   117	
   118	这代表一种很工程化的态度：  
   119	先把注入点协议化，再逐步增加来源。  
   120	证据类型：推断。依据 `specs/v2/session.md`。
   121	
   122	## Codex：AGENTS.md 与 memories 被明确拆成两套系统
   123	
   124	### 规则文件
   125	
   126	- `thread/start` 响应会返回 `instruction_sources`，说明 Codex 会把当前线程到底加载了哪些规则来源变成协议返回值。证据类型：本地源码。`codex/codex-rs/app-server-protocol/src/protocol/v2/thread.rs`
   127	- `docs/agents_md.md` 明确指出 `child_agents_md` feature 打开后，会为子代理追加 AGENTS.md 的作用域与优先级说明。证据类型：官方文档。`codex/docs/agents_md.md`
   128	
   129	这意味着 Codex 把规则文件至少当成两层问题：
   130	
   131	1. 主线程当前加载了什么。
   132	2. 子代理是否继承、如何解释层级作用域。
   133	
   134	- 证据类型：推断。依据 `instruction_sources` 与 `child_agents_md` 文档。
   135	
   136	### 长期记忆
   137	
   138	- `memories/README.md` 明确把 memories 分成 read path 与 write path，并说明只有根 session 启动且非 ephemeral、非 sub-agent、state DB 可用时才触发。证据类型：官方文档。`codex/codex-rs/memories/README.md`
   139	- Phase 2 会生成 `MEMORY.md`、`memory_summary.md`、`raw_memories.md` 等工件，并通过内部 consolidation sub-agent 维护。证据类型：官方文档。`codex/codex-rs/memories/README.md`
   140	
   141	这和“当前线程的 instruction sources”不是一个生命周期：
   142	
   143	- AGENTS.md 是线程启动时要遵守的规则。
   144	- memories 是后台更新、跨 rollout 聚合的长期资产。
   145	
   146	- 证据类型：推断。依据 `thread.rs` 与 `memories/README.md`。
   147	
   148	### skills / instructions 注入
   149	
   150	- memories read path 本身会向 developer instructions 追加“何时应该做 quick memory pass”的说明。证据类型：本地源码。`codex/codex-rs/ext/memories/src/prompts.rs`
   151	- 这说明在 Codex 里，某些扩展不只是暴露工具，还会修改开发者指令层。证据类型：本地源码。`codex/codex-rs/ext/memories/src/extension.rs`
   152	
   153	这类设计的 trade-off 是：
   154	
   155	- 好处：扩展能把“怎么用我”一起带进推理上下文。
   156	- 代价：如果不清楚区分 instruction injection 与 memory asset，就会误把扩展提示当成长期记忆本身。
   157	
   158	- 证据类型：推断。依据 memories extension 的 prompt contribution 设计。
   159	
   160	## 并排比较：四类对象在三家里的落点不同
   161	
   162	| 维度 | Claude Code | OpenCode | Codex |
   163	|---|---|---|---|
   164	| 规则文件 | `CLAUDE.md` 注入、缓存、nested memory 去重 | `AGENTS.md` 作为 `InstructionContext` | `instruction_sources` + AGENTS 层级文档 |
   165	| 长期记忆 | memory 目录机制 + session memory 双层 | 目前公开更偏 instructions / session，不突出独立 memory 管线 | 独立 memories read/write + consolidation |
   166	| 会话上下文 | conversation + transcript + compact boundary | durable inbox + projected history | thread / turn / item / goal / audit |
   167	| skills / 注入 | invoked skills 可跨 compaction 保留 | skill guidance 作为 Context Source | 扩展可贡献 developer instructions |
   168	
   169	- 证据类型：推断。依据前文源码与文档综合比较。
   170	
   171	## 设计启发
   172	
   173	1. 规则文件必须有明确的替换语义和作用域，否则它们会在 compaction、resume、subagent handoff 时变成幽灵约束。OpenCode 在这一点最清楚。证据类型：本地源码。`opencode/packages/core/src/instruction-context.ts`
   174	2. 长期记忆不该天然等于“每轮都要注入到 prompt”。Codex 的 memories pipeline 说明，很多长期资产更适合通过检索或后台 consolidation 进入当前任务。证据类型：官方文档。`codex/codex-rs/memories/README.md`
   175	3. 如果 skills 会影响执行边界，它们就应该像 Claude Code 那样有 compaction-preservation 策略，否则长任务后半程会丢掉能力约束。证据类型：本地源码。`claude-code-src/src/bootstrap/state.ts`
   176	4. 设计文档里最容易犯的错误，是把 “AGENTS.md 内容”“memory summary”“当前 thread history”“某个 skill 的说明”写成同一种上下文。三家实现都说明，这四类对象的生命周期和恢复语义不同。证据类型：推断。依据全文比较。

### docs/ai-coding/coding-agents/design-principles/subagent-handoff-and-orchestration.md
     1	# 子代理交接与编排：handoff contract 比“会不会开分身”更重要
     2	
     3	这一篇讨论的不是“系统能不能起 subagent”，而是更难的部分：
     4	
     5	- 主代理交给子代理的最小契约是什么
     6	- 哪些上下文应该裁掉，哪些必须保留
     7	- 结果要以什么工件形式回传
     8	- 主代理和子代理的责任边界怎么防止漂移
     9	
    10	先给结论：
    11	
    12	- `Claude Code` 对 subagent 最激进，既支持 specialized subagent，也支持 fork yourself；它把 handoff contract 直接写进 Agent tool prompt 和 `createSubagentContext()` 的隔离策略里。证据类型：本地源码。`claude-code-src/src/tools/AgentTool/prompt.ts`、`src/tools/AgentTool/forkSubagent.ts`、`src/utils/forkedAgent.ts`
    13	- `OpenCode` 当前公开材料更强调 background job / background agent dispatch 的 durable status 与取消/续跑语义，说明它的重点先放在“编排一致性”，而不是大规模公开子代理 prompt contract。证据类型：官方文档。`opencode/specs/v2/todo.md`、`opencode/specs/v2/session.md`
    14	- `Codex` 已经把 subagent/thread spawn、parent/child 拓扑、approval routed through guardian thread、subagent analytics source 做进协议和状态层，所以它比前两家更像“线程编排系统”。证据类型：本地源码。`codex/codex-rs/agent-graph-store/src/store.rs`、`codex-rs/app-server-protocol/src/protocol/v2/thread_data.rs`、`codex-rs/analytics/src/events.rs`
    15	
    16	```mermaid
    17	sequenceDiagram
    18	  participant Main as 主代理
    19	  participant State as 状态/事件层
    20	  participant Sub as 子代理
    21	
    22	  Main->>State: 写入任务目标、边界、可用能力
    23	  Main->>Sub: 下发裁剪后的任务 brief
    24	  Sub->>Sub: 在独立上下文内执行
    25	  Sub->>State: 写入结果、失败、审批需求、工件
    26	  State->>Main: 返回可恢复的 handoff 结果
    27	  Main->>Main: 决定整合、追问或重派
    28	```
    29	
    30	- 证据类型：推断。依据三家对子代理状态隔离与回传方式的共同需求。
    31	
    32	## handoff contract 应该包含什么
    33	
    34	最小 contract 至少要有五项：
    35	
    36	1. `目标`：子代理要解决的具体问题。
    37	2. `边界`：能不能改文件、能不能联网、何时必须停。
    38	3. `上下文包`：给它哪些历史，哪些不该给。
    39	4. `结果格式`：是要报告、patch、状态变更、还是只返回结论。
    40	5. `失败回传`：失败时是直接终止、请求审批、还是要求主代理二次分派。
    41	
    42	如果缺其中任一项，系统就会出现典型故障：
    43	
    44	- 子代理复述大段无关上下文。
    45	- 主代理拿不到可整合工件。
    46	- 审批责任被子代理偷偷越权。
    47	- 失败后只剩一句“没成功”，无法恢复。
    48	
    49	- 证据类型：推断。依据后文三家实现中的显式设计边界。
    50	
    51	## Claude Code：把上下文裁剪和角色边界写进子代理上下文工厂
    52	
    53	### 主代理/子代理边界
    54	
    55	- `AgentTool/prompt.ts` 明确写了：有 `subagent_type` 时 fresh agent starts without context；fork path 则继承 full conversation context。证据类型：本地源码。`claude-code-src/src/tools/AgentTool/prompt.ts`
    56	- `forkSubagent.ts` 说明 omitted `subagent_type` 触发 implicit fork，child 继承完整对话上下文，而不是重新 briefing。证据类型：本地源码。`claude-code-src/src/tools/AgentTool/forkSubagent.ts`
    57	
    58	这已经暴露出 Claude Code 的第一条核心 trade-off：
    59	
    60	- specialized subagent：上下文小，但 briefing 成本高。
    61	- fork subagent：上下文大，但能减少 handoff 信息损失。
    62	
    63	- 证据类型：推断。依据 `prompt.ts` 与 `forkSubagent.ts`。
    64	
    65	### 上下文裁剪
    66	
    67	- `createSubagentContext()` 默认 clone `readFileState`、重建 `agentId`、新建 `queryTracking`，并把 `shouldAvoidPermissionPrompts` 设成 true，说明它默认假设子代理应在隔离上下文里工作，且尽量不弹交互 UI。证据类型：本地源码。`claude-code-src/src/utils/forkedAgent.ts`
    68	- 同一函数又会按需共享 `abortController`、`setAppState`、`setResponseLength`、`contentReplacementState`，说明 Claude Code 允许在隔离和共享之间做细粒度 handoff 配置。证据类型：本地源码。`claude-code-src/src/utils/forkedAgent.ts`
    69	
    70	换句话说，Claude Code 的 handoff contract 并不只是一段 prompt，而是：
    71	
    72	- 一段文字 briefing；
    73	- 一组上下文共享/隔离开关；
    74	- 一套 permission / cache / interrupt 继承策略。
    75	
    76	- 证据类型：推断。依据 `createSubagentContext()` 的字段设计。
    77	
    78	### 任务工件
    79	
    80	- 系统 prompt 明确要求非 trivial implementation 后必须做 adversarial verification，并把“原始用户请求、改动文件、方案、plan 文件路径”传给 verification subagent。证据类型：本地源码。`claude-code-src/src/constants/prompts.ts`
    81	- 这说明 Claude Code 不是让子代理只回一句“我看过了”，而是要求回传可核对工件。证据类型：本地源码。`claude-code-src/src/constants/prompts.ts`
    82	
    83	## OpenCode：公开重点先放在 durable orchestration，而不是 prompt 化的 subagent 协作剧本
    84	
    85	### 主代理/子代理边界
    86	
    87	- `specs/v2/todo.md` 把 “background bash jobs and background agent dispatch with durable status observation, completion delivery, and explicit cancellation / continuation semantics” 列为后续切片。证据类型：官方文档。`opencode/specs/v2/todo.md`
    88	- 同一 TODO 又强调 durable/clustered interruption、retries、stale-owner fencing 需要独立设计。证据类型：官方文档。`opencode/specs/v2/todo.md`
    89	
    90	这说明 OpenCode 当前更关心的是：
    91	
    92	- 子任务能否 durable 观察；
    93	- 是否能在取消、恢复、换 owner 后保持一致；
    94	
    95	而不是先定义一套花哨的子代理角色 prompt。  
    96	证据类型：推断。依据 `specs/v2/todo.md` 的优先级排序。
    97	
    98	### 上下文裁剪与工件回传
    99	
   100	- `specs/v2/session.md` 一直把 prompt admission、projected history、tool settlement、event cursor 作为编排骨架，说明未来无论 background agent 怎样落地，它也会被要求生成 durable 可观察事件，而不是只留在内存回调里。证据类型：官方文档。`opencode/specs/v2/session.md`
   101	- `background-job.ts` 中状态枚举已经区分 `running`、`completed`、`error`、`cancelled`。证据类型：本地源码。`opencode/packages/core/src/background-job.ts`
   102	
   103	因此 OpenCode 的 handoff contract 更可能是：
   104	
   105	- durable job identity
   106	- 状态观测
   107	- 明确 completion delivery
   108	
   109	而不只是 prompt brief。  
   110	证据类型：推断。依据 `background-job.ts` 与 `specs/v2/todo.md`。
   111	
   112	## Codex：把 subagent handoff 升级成 parent/child thread 协议
   113	
   114	### 主代理/子代理边界
   115	
   116	- `agent-graph-store` 明确提供 `upsert_thread_spawn_edge`、`set_thread_spawn_edge_status`、`list_thread_spawn_children/descendants`，说明 Codex 把 parent/child 关系持久化了。证据类型：本地源码。`codex/codex-rs/agent-graph-store/src/store.rs`
   117	- `thread_data.rs` 里 `SessionSource` 与 `ThreadSource` 直接区分 `SubAgent`、`MemoryConsolidation` 等来源。证据类型：本地源码。`codex/codex-rs/app-server-protocol/src/protocol/v2/thread_data.rs`
   118	
   119	这意味着在 Codex 里，subagent 不是“主线程里的一个特殊工具结果”，而是：
   120	
   121	- 可能拥有独立 thread；
   122	- 拥有可追踪来源；
   123	- 能进入 parent/child 图。
   124	
   125	- 证据类型：推断。依据 `agent-graph-store` 与 `thread_data.rs`。
   126	
   127	### 上下文裁剪
   128	
   129	- `analytics/events.rs` 专门记录 `subagent_source`、`parent_thread_id`，并有“approval requested by a delegated subagent and routed through the parent”这样的事件说明。证据类型：本地源码。`codex/codex-rs/analytics/src/events.rs`
   130	- 这表示 Codex 的关键上下文裁剪不是“子代理拿了几条消息”，而是“审批和归责是否仍回到父线程”。证据类型：本地源码。`codex/codex-rs/analytics/src/events.rs`
   131	
   132	### 任务工件
   133	
   134	- 因为 Codex 的线程、goal、audit 和 state DB 都是结构化对象，子代理结果更自然的交付物是线程状态、审批事件、goal 更新、审计行，而不是单段自由文本总结。证据类型：推断。依据 `thread.rs`、`thread_data.rs`、`state/src/audit.rs`、`analytics/events.rs`
   135	
   136	## 三种路线的差异
   137	
   138	| 维度 | Claude Code | OpenCode | Codex |
   139	|---|---|---|---|
   140	| handoff 主体 | prompt brief + context factory | durable job orchestration | parent/child thread protocol |
   141	| 子代理上下文 | fresh vs fork 两种模式 | 尚在收敛，更偏 runtime 状态 | 独立线程/来源/图关系 |
   142	| 结果工件 | transcript、verification report、tool result | durable status / completion delivery | thread state、audit、approval、goal 事件 |
   143	| 最大风险 | brief 不完整或共享过多上下文 | 取消/恢复/ownership 语义未完全收敛 | 协议复杂，父子线程归责链更难维护 |
   144	
   145	- 证据类型：推断。依据前文源码与规格比较。
   146	
   147	## 设计启发
   148	
   149	1. `handoff contract` 不应只是一段自然语言 prompt；至少还要包含权限、取消、回传格式和恢复边界。Claude Code 的 `createSubagentContext()` 已经证明这一点。证据类型：本地源码。`claude-code-src/src/utils/forkedAgent.ts`
   150	2. 若子代理会长期运行或后台运行，必须先把 durable status 与 completion delivery 设计清楚，否则恢复后主代理不知道该接什么。OpenCode 的 TODO 把这件事放在前面是对的。证据类型：官方文档。`opencode/specs/v2/todo.md`
   151	3. 一旦子代理涉及审批，最好像 Codex 一样让 parent/child 归责进入协议和事件层，而不是只靠 transcript 推断。证据类型：本地源码。`codex/codex-rs/analytics/src/events.rs`
   152	4. “子代理越独立越好”是错误直觉。真正要优化的是：给它最小充分上下文，并要求它返回主代理可消费的工件。否则只是在把复杂度搬出主线程。证据类型：推断。依据三家 trade-off。

### docs/ai-coding/coding-agents/design-principles/evaluation-observability-and-regression.md
     1	# 评估、可观测性与回归：agent 系统不是“跑通一次”就算稳定
     2	
     3	这篇只回答一个问题：  
     4	对于会压缩、会恢复、会审批、会分派子代理的 coding agent，应该观察什么，才能知道系统没有静悄悄地退化。
     5	
     6	先给结论：
     7	
     8	- `Claude Code` 已经把 transcript、session history、bridge debug、subagent internal events、OpenTelemetry tracer provider 等观测点散布在运行时里，但主叙事仍偏“排障与恢复”。证据类型：本地源码。`claude-code-src/src/bootstrap/state.ts`、`src/assistant/sessionHistory.ts`、`src/cli/remoteIO.ts`、`src/bridge/bridgeDebug.ts`
     9	- `OpenCode` 的优势是 durable event cursor、projected history、context epoch、本地 runner checkpoint 都天然可以变成 eval 和 regression probe。证据类型：官方文档 + 本地源码。`opencode/specs/v2/session.md`、`opencode/packages/core/src/session/input.ts`、`src/session/context-epoch.ts`
    10	- `Codex` 则把 audit row、thread view、goal events、analytics compaction/subagent/approval 事件做成更明确的审计链，因此更适合做“恢复后是否重复执行”“子代理审批是否漏归责”这类系统级回归。证据类型：本地源码。`codex/codex-rs/state/src/audit.rs`、`codex-rs/analytics/src/events.rs`、`app-server-protocol/src/protocol/v2/thread_data.rs`
    11	
    12	## 先定义五类最重要的回归面
    13	
    14	用户已经点名的五个风险，基本也是这类系统的核心 regression surface：
    15	
    16	1. `恢复后重复执行`
    17	2. `压缩后丢目标`
    18	3. `审批绕过`
    19	4. `subagent 漏交接`
    20	5. `失败分类漂移`
    21	
    22	```mermaid
    23	flowchart TD
    24	  A[一次长任务] --> B[压缩]
    25	  A --> C[恢复]
    26	  A --> D[审批]
    27	  A --> E[子代理]
    28	  B --> B1[摘要是否丢目标]
    29	  C --> C1[是否重复执行副作用]
    30	  D --> D1[是否绕过 reviewer / policy]
    31	  E --> E1[是否丢失工件和归责]
    32	  A --> F[失败]
    33	  F --> F1[是否被错误分类为可重试]
    34	```
    35	
    36	- 证据类型：推断。依据三家公开失效面和设计边界。
    37	
    38	## Claude Code：观测点多，但要自己拼出完整回归故事
    39	
    40	### trace 与审计面
    41	
    42	- `bootstrap/state.ts` 维护 `tracerProvider`，说明它有接入 OpenTelemetry 级别 tracing 的基础设施。证据类型：本地源码。`claude-code-src/src/bootstrap/state.ts`
    43	- `sessionHistory.ts` 可以分页读取 `/v1/sessions/{sessionId}/events`，说明远程会话历史至少可作审计素材。证据类型：本地源码。`claude-code-src/src/assistant/sessionHistory.ts`
    44	- `remoteIO.ts` 注释直接说会读取 internal events 来重构 conversation state，其中包含 subagent internal events。证据类型：本地源码。`claude-code-src/src/cli/remoteIO.ts`
    45	
    46	所以 Claude Code 的问题不在“没有观测点”，而在“观测点比较分散，评估时要自己拼”。
    47	
    48	- 证据类型：推断。依据前述实现分布。
    49	
    50	### 重点回归面
    51	
    52	- `恢复后重复执行`：`QueryEngine` 会在 compact/replay/transcript 之间做 dedup 和 flush；如果 dedup 失效，就可能出现 resume 后链路分叉或重复操作。证据类型：本地源码。`claude-code-src/src/QueryEngine.ts`
    53	- `压缩后丢目标`：`invokedSkills` 被专门保留跨 compaction，说明团队已经把“压缩后丢技能上下文”视为真实风险。证据类型：本地源码。`claude-code-src/src/bootstrap/state.ts`
    54	- `subagent 漏交接`：verification prompt 明确要求把原始请求、改动文件、plan 路径传给 verifier，否则就是 contract 违例。证据类型：本地源码。`claude-code-src/src/constants/prompts.ts`
    55	
    56	### 公开失效面
    57	
    58	- `/goal` cancel 后仍继续跑。证据类型：公开 issue / discussion。`anthropics/claude-code#65099`
    59	- Stop hook 结果格式不符导致 auto-clear 失败。证据类型：公开 issue / discussion。`anthropics/claude-code#58558`
    60	
    61	这两类问题都说明：  
    62	Claude Code 的 eval 不能只看“最后任务是否完成”，还要看中间 stop/continue contract 是否被正确执行。  
    63	证据类型：推断。依据 issue 类型。
    64	
    65	## OpenCode：最适合做 replayable regression
    66	
    67	### 为什么它的评估面更干净
    68	
    69	- `PromptAdmitted` 与 `Prompted` 被严格分开，所以“输入已接收但未进入模型历史”的状态可以被单独断言。证据类型：本地源码。`opencode/packages/core/src/session/input.ts`
    70	- `ContextUpdated` 与 `Context Epoch` 独立存在，所以“压缩后/规则更新后是否丢目标”能在 baseline 与 chronological system update 层分别测。证据类型：本地源码。`opencode/packages/core/src/session/context-epoch.ts`
    71	- `sessions.events/history` 在规格里有 durable cursor 语义，天然适合做 replay-based regression。证据类型：官方文档。`opencode/specs/v2/session.md`
    72	
    73	### 重点回归面
    74	
    75	- `恢复后重复执行`：官方 TODO 明确说 post-crash continuation recovery 还未收敛，尤其涉及 provider-dispatch ambiguity 与 post-tool continuation。证据类型：官方文档。`opencode/specs/v2/todo.md`
    76	- `压缩后丢目标`：`SUMMARY_TEMPLATE` 要求保留 Goal、Constraints、Progress、Blocked、Next Steps，这其实就是在把“压缩后不可丢的任务骨架”显式模板化。证据类型：本地源码。`opencode/packages/core/src/session/compaction.ts`
    77	- `审批绕过`：`tools.md` 明确说 trusted executors 自己发起 permission assert，registry 不代劳，因此 eval 必须覆盖“工具有没有漏 assert”。证据类型：官方文档。`opencode/specs/v2/tools.md`
    78	- `subagent 漏交接`：虽然 background agent dispatch 还在推进，但 TODO 已把 completion delivery 和 explicit cancellation / continuation semantics 点出来，这些都应该成为将来的 regression 断言。证据类型：官方文档。`opencode/specs/v2/todo.md`
    79	
    80	### OpenCode 式的 eval 样板
    81	
    82	可以按事件流写测试，而不是按终态写测试：
    83	
    84	1. admit 一个 prompt。
    85	2. 触发一次 compaction。
    86	3. 注入一次 context update。
    87	4. 中断后 resume。
    88	5. 断言 `Prompted`、`Compaction.Ended`、`ContextUpdated` 的顺序和次数。
    89	
    90	- 证据类型：推断。依据 `session/input.ts`、`session/compaction.ts`、`session/context-epoch.ts` 的事件结构。
    91	
    92	## Codex：最适合做跨线程、跨审批、跨子代理的系统审计
    93	
    94	### 可观测面
    95	
    96	- `read_thread_state_audit_rows()` 提供了只读 state DB 审计入口。证据类型：本地源码。`codex/codex-rs/state/src/audit.rs`
    97	- `analytics/events.rs` 里有 compaction、subagent_thread_started、guardian approval routed through parent 等事件。证据类型：本地源码。`codex/codex-rs/analytics/src/events.rs`
    98	- `thread_data.rs` 的 `TurnItemsView` 允许客户端只读 summary 或 full items，这对大规模回归采样很重要。证据类型：本地源码。`codex/codex-rs/app-server-protocol/src/protocol/v2/thread_data.rs`
    99	
   100	### 重点回归面
   101	
   102	- `恢复后重复执行`：thread/resume 与 goal runtime 分层后，必须断言恢复不会重复触发已完成的 goal accounting。证据类型：推断。依据 `thread.rs`、`ext/goal/src/runtime.rs`
   103	- `压缩后丢目标`：analytics 里已有 compaction event，而 goal runtime 又会注入 steering item，因此 regression 应覆盖“compaction 后 active goal 是否仍能 steer 当前 turn”。证据类型：本地源码 + 推断。`codex/codex-rs/ext/goal/src/runtime.rs`、`codex-rs/analytics/src/events.rs`
   104	- `审批绕过`：analytics 明确记录 delegated subagent approval routed through parent，这是检查 guardian thread 责任链的天然探针。证据类型：本地源码。`codex/codex-rs/analytics/src/events.rs`
   105	- `subagent 漏交接`：如果 parent/child thread edge 存在，但 child 完成后没有对应状态关闭或工件可读，就是显式的 orchestration failure。证据类型：推断。依据 `agent-graph-store` 的 open/closed edge 设计。
   106	
   107	## 怎样组织这类系统的 eval
   108	
   109	### 1. 状态回归
   110	
   111	- 看 thread/session/goal 是否进入正确状态。
   112	- 典型断言：中断后没有 ghost running；完成后没有 active child edge。
   113	
   114	### 2. 事件回归
   115	
   116	- 看 durable event 序列是否缺失、重排、重复。
   117	- 典型断言：一次 compaction 只产生一次完成边界；一次审批请求只产生一条 reviewer routing 链。
   118	
   119	### 3. 工件回归
   120	
   121	- 看 summary、memory、verification report、state audit 是否可被主代理或外部工具重新消费。
   122	- 典型断言：subagent 完成后主代理拿到的不是一句自由文本，而是可验证工件。
   123	
   124	### 4. 权限回归
   125	
   126	- 看工具调用和子代理调用是否落在正确 reviewer / sandbox / permission profile 下。
   127	- 典型断言：恢复后 profile 不漂移；子代理审批不直接穿透到错误 reviewer。
   128	
   129	- 证据类型：推断。依据三家设计重点。
   130	
   131	## 设计启发
   132	
   133	1. 评估长任务 agent 时，只看最终答案会错过最关键的退化点；必须覆盖压缩、恢复、审批、子代理四条中间链。证据类型：推断。依据本文回归面拆分。
   134	2. 能 replay durable event 的系统，天然更适合做 regression。OpenCode 在这点上成本最低。证据类型：官方文档 + 本地源码。`opencode/specs/v2/session.md`、`opencode/packages/core/src/session/input.ts`
   135	3. 如果审批和子代理是高风险能力，就应像 Codex 一样把它们变成 analytics/audit first-class event，而不是只靠 transcript 事后猜。证据类型：本地源码。`codex/codex-rs/analytics/src/events.rs`
   136	4. Claude Code 的经验说明，交互式产品即使主打体验，也必须留下足够多的 debug 和 internal event 钩子，否则恢复类 regression 很难定位。证据类型：本地源码。`claude-code-src/src/bridge/bridgeDebug.ts`、`src/cli/remoteIO.ts`

### docs/ai-coding/coding-agents/design-principles/retry-recovery-and-failure-handling.md
     1	# 重试、恢复与失败处理：真正难的不是“再来一次”，而是知道什么时候绝不能再来一次
     2	
     3	这一篇讨论 retry boundary、recovery boundary 和 failure taxonomy。
     4	
     5	先给结论：
     6	
     7	- `Claude Code` 在 bridge / remote control / tool interrupt 路线上已经形成了比较细的失败分类，但它的重试、恢复和继续执行语义仍分散在 bridge、QueryEngine、session restore、/goal 这些层里。证据类型：本地源码。`claude-code-src/src/bridge/bridgeApi.ts`、`src/bridge/replBridge.ts`、`src/Tool.ts`、`src/QueryEngine.ts`
     8	- `OpenCode` 的规格最明确地写出了“哪些未知状态不能自动重试”，尤其是 provider-dispatch ambiguity、post-tool continuation、retry/abandon 决策。证据类型：官方文档。`opencode/specs/v2/todo.md`、`opencode/specs/v2/session.md`
     9	- `Codex` 的优势是 goal/runtime/thread/audit 都是结构化对象，因此 partial failure、approval routing failure、subagent parent-child failure 更容易被显式分类；但代价是恢复路径要同时考虑线程、目标、权限和 analytics 一致性。证据类型：本地源码。`codex/codex-rs/ext/goal/src/runtime.rs`、`state/src/audit.rs`、`analytics/src/events.rs`
    10	
    11	## 先定义 retry boundary
    12	
    13	不是所有失败都能自动重试。最常见的边界至少有五类：
    14	
    15	1. `纯传输失败`：请求没真正到达副作用边界。
    16	2. `provider 已接单但结果未知`：最危险，通常不能盲重试。
    17	3. `工具已开始副作用`：除非幂等，否则不能自动重试。
    18	4. `审批失败/被拒`：这不是 retry，而是策略终止。
    19	5. `取消或中断`：要优先判定为控制流事件，而不是普通错误。
    20	
    21	```mermaid
    22	stateDiagram-v2
    23	  [*] --> Ready
    24	  Ready --> Requesting
    25	  Requesting --> TransportFailed
    26	  Requesting --> ProviderAccepted
    27	  ProviderAccepted --> Interrupted
    28	  ProviderAccepted --> ToolSideEffect
    29	  ToolSideEffect --> PartialFailure
    30	  Interrupted --> RecoverableDecision
    31	  TransportFailed --> Retryable
    32	  PartialFailure --> ManualRecovery
    33	  ProviderAccepted --> UnknownOutcome
    34	  UnknownOutcome --> RetryBlocked
    35	```
    36	
    37	- 证据类型：推断。依据三家都显式区分 interruption、tool settlement、provider overflow/unknown outcome。
    38	
    39	## Claude Code：失败分类已经很细，但恢复逻辑跨多层
    40	
    41	### 工具失败与取消
    42	
    43	- `Tool.interruptBehavior()` 只允许 `cancel` 或 `block`，说明工具中断首先是一种控制流语义。证据类型：本地源码。`claude-code-src/src/Tool.ts`
    44	- 如果把 interruption 吃掉并包装成普通 tool failure，就会破坏上层恢复逻辑。证据类型：推断。依据 `interruptBehavior` 设计意图。
    45	
    46	### 远程桥接失败分类
    47	
    48	- `bridgeApi.ts` 对 401 会做一次 token refresh retry；403、404、429、其他状态码又分开报错。证据类型：本地源码。`claude-code-src/src/bridge/bridgeApi.ts`
    49	- `replBridge.ts` 和 `remoteBridgeCore.ts` 又进一步区分 reconnecting、failed、auth_failed、fatal，以及 crash-recovery pointer 的恢复路径。证据类型：本地源码。`claude-code-src/src/bridge/replBridge.ts`、`src/bridge/remoteBridgeCore.ts`
    50	
    51	这类实现说明 Claude Code 的 retry boundary 大概是：
    52	
    53	- 传输鉴权问题可以有限重试。
    54	- 环境过期、worker epoch 不匹配等进入恢复或重连。
    55	- 不是所有失败都往“重新跑一轮任务”收敛。
    56	
    57	- 证据类型：推断。依据 bridge 状态机。
    58	
    59	### 部分失败与取消 race
    60	
    61	- `QueryEngine` 会记录 `api_retry`、structured output retry limit、permission denials 等信息，说明模型输出失败和执行控制失败也被分层。证据类型：本地源码。`claude-code-src/src/QueryEngine.ts`
    62	- 公开 issue 里 `/goal` cancel 后继续跑，就是典型的 cancel race：控制面认为停止了，自动续跑层却还在推进。证据类型：公开 issue / discussion。`anthropics/claude-code#65099`
    63	
    64	这代表 Claude Code 的重点风险不是“没有重试”，而是“不同恢复层之间谁赢”。  
    65	证据类型：推断。依据 `/goal` issue 和 bridge/runtime 分层。
    66	
    67	## OpenCode：对“不能自动重试”的边界写得最明确
    68	
    69	### 什么时候不能重试
    70	
    71	- `specs/v2/todo.md` 明确写了：post-crash continuation recovery 必须显式建模 `provider-attempt preparation versus provider-dispatch ambiguity`、`required post-tool continuation`、`retry and abandon decisions for unknown outcomes`。证据类型：官方文档。`opencode/specs/v2/todo.md`
    72	- `specs/v2/session.md` 还写明 overflow compaction 只允许一次；第二次 overflow 或 compaction 不可用就变成 terminal failure。证据类型：官方文档。`opencode/specs/v2/session.md`
    73	
    74	这几乎就是 retry boundary 教科书：
    75	
    76	- 如果你不知道 provider 是否已经开始执行，就不要默认 safe retry。
    77	- 如果工具已经有副作用，也不要假装可以无害重放。
    78	
    79	- 证据类型：推断。依据 `specs/v2/todo.md` 与 `specs/v2/session.md`。
    80	
    81	### 部分失败
    82	
    83	- `runner/llm.ts` 在 provider turn 开始前会把先前仍标记为 `running` 的工具失败成 `Tool execution interrupted`。证据类型：本地源码。`opencode/packages/core/src/session/runner/llm.ts`
    84	- 这说明 OpenCode 对“工具半途死掉”不走静默恢复，而是先显式沉淀失败，再让后续 continuation 决定是否继续。证据类型：本地源码。`opencode/packages/core/src/session/runner/llm.ts`
    85	
    86	### 取消 race
    87	
    88	- `sessions.interrupt(sessionID)` 在规格里明确会等待 runner cleanup、清掉 follow-up wake，但保留 durable inbox rows 给之后 resume。证据类型：官方文档。`opencode/specs/v2/session.md`
    89	
    90	这个设计的关键优点是：
    91	
    92	- 中断不等于把未消费输入丢掉。
    93	- 但也不等于立刻自动继续。
    94	
    95	- 证据类型：官方文档。`opencode/specs/v2/session.md`
    96	
    97	## Codex：结构化线程系统更适合把失败归到正确层
    98	
    99	### 工具/目标/线程失败分层
   100	
   101	- `update_goal` 明确拒绝 pause/resume/budget-limited 等状态迁移，说明某些“失败后的状态变更”根本不允许模型自行重试修复。证据类型：本地源码。`codex/codex-rs/ext/goal/src/tool.rs`、`src/spec.rs`
   102	- `GoalRuntimeHandle` 会区分 `prepare_external_goal_mutation`、`apply_external_goal_set/clear`、`account_active_goal_progress`，说明恢复与失败处理需要在目标计量层先做结算。证据类型：本地源码。`codex/codex-rs/ext/goal/src/runtime.rs`
   103	
   104	### 部分失败
   105	
   106	- `state/src/audit.rs` 能读取线程状态审计行，说明部分失败后至少还能从状态库侧回答“线程落在什么状态”。证据类型：本地源码。`codex/codex-rs/state/src/audit.rs`
   107	- `analytics/events.rs` 对 delegated subagent approval 有单独事件，这意味着审批链部分失败不会只能靠 transcript 诊断。证据类型：本地源码。`codex/codex-rs/analytics/src/events.rs`
   108	
   109	### 什么时候不能重试
   110	
   111	- 如果失败已经穿过线程、goal、approval 三层之一的不可逆边界，盲目重试只会制造新的归责混乱。证据类型：推断。依据 Codex 的结构化分层。
   112	
   113	## 建议的失败分类
   114	
   115	可以把这类系统的 failure taxonomy 至少写成下面六类：
   116	
   117	1. `Transient transport failure`
   118	2. `Provider accepted, outcome unknown`
   119	3. `Tool execution interrupted before durable settlement`
   120	4. `Tool side effect partially applied`
   121	5. `Approval or policy denial`
   122	6. `State inconsistency / recovery mismatch`
   123	
   124	对应策略应该分别是：
   125	
   126	- 1 类：有限自动重试。
   127	- 2 类：默认阻止自动重试，等待显式恢复决策。
   128	- 3 类：先沉淀失败，再决定是否继续。
   129	- 4 类：要求人工或专门恢复逻辑。
   130	- 5 类：不重试，只升级或终止。
   131	- 6 类：优先审计和重建状态，不直接继续执行。
   132	
   133	- 证据类型：推断。依据三家公开设计边界。
   134	
   135	## 设计启发
   136	
   137	1. “可重试”应该是一种被证明的属性，不是默认值。OpenCode 的 TODO 在这点上最诚实。证据类型：官方文档。`opencode/specs/v2/todo.md`
   138	2. 取消和中断必须从普通错误里分离出来，否则会在恢复后制造重复执行。Claude Code 的 `interruptBehavior` 和 `/goal` 失效面都指向这一点。证据类型：本地源码 + 公开 issue / discussion。`claude-code-src/src/Tool.ts`、`anthropics/claude-code#65099`
   139	3. 部分失败必须可审计。Codex 的 thread/goal/audit 体系给出了更好的下限。证据类型：本地源码。`codex/codex-rs/state/src/audit.rs`、`ext/goal/src/runtime.rs`
   140	4. 自动恢复如果跨过了副作用边界，就不再是“retry”，而是在赌幂等性。生产系统不该默认做这种赌注。证据类型：推断。依据全文比较。
