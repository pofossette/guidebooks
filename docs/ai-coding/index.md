# AI 编码工作流工具速查

> 检索时间：2026-05-30。这里记录的是我对几类 AI 编码工作流工具的实用判断，不是完整评测。优先参考官方 README / 文档；社区评价只作为辅助印象。本次补查重点补上 2026 年仍活跃、且明确提供 spec / agent / automation 工作流的方案。

这一栏现在专门收拢“怎么用 AI Coding Agent 做开发”的内容，分成三部分：

- [编码 Agent 机制](./coding-agents/index.md)：Claude Code、Codex、OpenCode 一类工具的上下文、工具和 prompt 结构
- [GSD 暂停与恢复](./workflow/gsd-pause-and-resume.md)：针对长流程开发的中断与续跑机制
- 本页：各类规范驱动、计划驱动、交付驱动工作流工具的横向判断

## 扩展专题

- [编码 Agent 机制](./coding-agents/index.md)：如果你更关心 Claude Code / Codex / OpenCode 这类工具本身怎么工作，先从这里进入。
- [GSD 暂停与恢复](./workflow/gsd-pause-and-resume.md)：补充长流程开发里最关键的 handoff 与恢复问题。
- [代码图谱工具与技术路线](./code-graph-tools-and-technical-routes.md)：补充 `Graphify`、`CodeGraph`、`Understand Anything`、Meta `Glean` 与预计算上下文路线，重点看这类“图谱”到底在建什么中间层。
- [Coding Agent 的 LSP 方案与各方态度](./coding-agent-lsp-strategies.md)：补充 `Oh My OpenCode`、`OpenCode`、Anthropic、OpenAI、Meta 对 agent 配 LSP 的实现方案和公开态度。

## superpowers

特点：

- 本质是“技能驱动的软件开发方法学”，不是完整项目管理系统。
- 工作流主线是 `brainstorming -> writing-plans -> subagent-driven-development / executing-plans -> TDD -> code review -> finishing branch`。
- 强约束 agent 在写代码前先澄清需求、沉淀设计，再把设计拆成非常小的可执行任务。
- 对 TDD、代码评审、git worktree、分支收尾有明确流程，适合把工程纪律变成 agent 的默认行为。
- 支持 Claude Code、Codex CLI/App、Gemini CLI、OpenCode、Cursor、Copilot CLI 等多种宿主。

适用：

- 你已经大致知道要做什么，但希望 agent 不要直接开写。
- 中小改动、可测试的功能、修 bug、重构、需要严格代码评审的任务。
- 需要一个通用的“开发习惯层”：先问清楚、先写计划、先写测试、按任务推进。
- 想让 agent 按计划长时间执行，但仍希望人类在设计、计划和 review 节点把关。

问题：

- 流程摩擦比普通对话大，小改动会显得啰嗦。
- 对宿主 agent 的技能触发机制依赖较强；如果宿主不稳定，执行体验会打折。
- 它管的是方法，不管项目状态机；长期项目的 milestone、phase、跨会话状态需要自己补。
- TDD 强约束对脚手架、UI 原型、探索性 spike 可能过重。

注意事项：

- 适合当“默认开发纪律”，不适合当“大型项目编排器”。
- 对简单任务可以手动降低流程强度，但对非平凡改动最好保留 brainstorming 和 writing-plans。
- 如果要配合 GSD / OpenSpec，用 superpowers 做执行与 review 层，不要让它和上层规格系统同时争夺“需求来源”。

## OpenSpec

特点：

- 轻量级 spec-driven development 层，核心目标是把需求从聊天记录里移到可审计工件里。
- 新工作流围绕 `/opsx:propose`、`/opsx:apply`、`/opsx:archive` 展开。
- 每个变更生成独立目录，例如 `openspec/changes/<change>/`，里面包含 `proposal.md`、`specs/`、`design.md`、`tasks.md`。
- 哲学偏“fluid not rigid”：允许随时改 proposal / spec / design / tasks，不强调瀑布式 phase gate。
- 通过 slash commands / skills 适配多种 AI 编码工具，官方说明支持 20+ / 25+ 工具。

适用：

- 需求有一定不确定性，但希望在写代码前先和 agent 对齐范围、验收场景、技术方案和任务清单。
- brownfield 项目：不想上完整生命周期框架，只想给每个变更加一层轻量规格。
- 团队需要可 review 的变更工件，但不想引入重型项目管理或多代理编排。
- 功能、API、数据模型、交互流程等“先说清再做”的开发场景。

问题：

- 门禁较轻，执行质量依赖你是否认真 review spec / design / tasks。
- 对并发执行、跨 milestone 状态、复杂恢复、强验证闭环支持不如 GSD 这类完整编排工具。
- 如果每个小改动都开 change，会产生文档碎片；如果不开，又失去它的主要价值。
- 官方推荐使用高推理模型，低推理模型容易把 specs 写成泛泛描述。

注意事项：

- 把 OpenSpec 当“变更级规格层”最合适，不要期待它自动管理整个项目生命周期。
- 建议为每个 change 设定最小验收场景，避免 `tasks.md` 变成普通 TODO list。
- 实施前清理上下文窗口，让 agent 主要读取 OpenSpec 工件，而不是沿用旧聊天上下文。

## Spec Kit

特点：

- GitHub 官方的 spec-driven development 工具包，主线是 `specify -> plan -> tasks -> implement`。
- 除了生成 specs，还内置 `/speckit.clarify`、`/speckit.checklist`、`/speckit.analyze` 这类质量门禁，强调先补问题、先跑检查，再进入实现。
- 设计上是“可组合工具包”而不是单一 IDE：支持不同 agent、编辑器、CLI 和扩展。
- 和 OpenSpec 相比，它更像一套完整的 feature 级 SDD 流程，而不只是 change 工件模板。

适用：

- 你想要比 OpenSpec 更完整的 `spec -> task` 路径，但又不想直接上 GSD 这种 project-level 编排。
- 单个 feature 需要明确的澄清、设计、任务拆分和质量门禁。
- 希望 specs、tasks 和当前 feature / 分支绑定，而不是散在聊天记录里。

问题：

- 命令和概念比 OpenSpec 多，对轻量修改会显得偏重。
- 前置质量门禁会拉长启动时间；如果宿主模型推理弱，产出容易形式化。
- 主要聚焦 feature / change 级，不负责长期 roadmap、phase 状态或恢复编排。

注意事项：

- 如果你只想“先写个 proposal 再动手”，OpenSpec 更轻；如果你想把澄清和检查固定成门禁，Spec Kit 更合适。
- 最好和 feature branch 或 worktree 一起用，否则 active spec 容易混乱。
- 和 superpowers 搭配时，让 Spec Kit 管 specs / tasks / gates，superpowers 管 TDD、review 和小步执行。

## Kiro

特点：

- Kiro 把 specs、steering、hooks 做成 IDE 内建工作流，而不只是一个聊天面板。
- 官方 specs 流程会生成需求、设计、任务等工件，并支持按任务执行，独立任务还能并发跑成多波次。
- `steering` 用来沉淀项目长期规则和背景，`hooks` 用来在保存、提交、agent/tool 事件上挂自动化。
- 官方同时支持读取仓库里的 `AGENTS.md`，因此它可以把 repo 规则和 IDE 工作流接起来。

适用：

- 希望需求、设计、任务、执行都留在一个 IDE 里，不想自己拼 slash commands / skills。
- 需要 IDE 级自动化，例如保存时跑检查、任务切换时注入上下文、完成任务后自动验证。
- 想做多任务并发执行，但仍希望人类停留在编辑器里审阅和接管。

问题：

- 工作流明显绑定 Kiro 生态；迁移到其他宿主后，specs / steering / hooks 的使用方式会变。
- IDE 内闭环虽然顺手，但也更容易把长期工件留成本地状态，而不是仓库契约。
- 对非 Kiro 用户协作时，可见性不如纯 Markdown / repo-first 的约定。

注意事项：

- 把 `steering` 当作 repo-level memory，不要把一次性临时决策全塞进去。
- 先决定 `specs`、`steering`、`hooks` 哪些提交到 git，避免本地状态和团队状态分叉。
- 如果仓库里已经有 `AGENTS.md`，Kiro 更适合作为“执行壳层”，不要再维护另一套冲突规范。

## gstack

特点：

- Garry Tan 开源的个人 AI 编码工作流配置，目标是把宿主 agent 组织成“虚拟工程团队”而不是单一聊天助手。官方 README 现在把它描述成 `23 specialists + 8 power tools`。
- 它已经不只是 Claude Code 技巧包，而是 `skills + 持久浏览器 + 本地状态 + team bootstrap` 的组合系统；支持 Claude Code，也支持 Codex、OpenCode、Cursor、Factory Droid、Kiro、Hermes、GBrain 等宿主。
- 官方主线强调 `office-hours -> plan -> implement -> review -> QA -> ship -> retro`，并且已经从“评审包”扩展到更完整的闭环。
- 角色层覆盖 CEO / founder、工程经理、设计、QA、安全、发布、技术文档、DX；工具层还补了 `/codex`、`/careful`、`/freeze`、`/guard` 等安全与第二意见能力。
- 规划层不仅有 `/office-hours`、`/plan-ceo-review`、`/plan-eng-review`、`/plan-design-review`，现在还有 `/spec` 和 `/autoplan`。`/autoplan` 会把 CEO -> Design -> Eng -> DX review 串成一条自动化 review pipeline，只把真正需要人拍板的 taste / scope 决策抛回来。
- 浏览器层是它和普通技能包差异最大的地方：官方架构是本地 long-lived Chromium daemon，首个调用大约几秒，之后多数调用是本地 HTTP + CDP 往返，常态在 100-200ms；cookies、tabs、login session 可跨命令复用。
- 它的状态并不只在聊天里。设计文档、计划评审结果、测试计划、设计稿批准结果、learnings、上下文保存等都会落到 `~/.gstack/projects/`，形成本地长期记忆和可恢复工件。
- 团队模式也比较成熟：官方 README 推荐 `team mode`，通过 repo 引导文件和静默 auto-update 让队友自动获得同一套 gstack，而不是把整套技能 vendoring 进仓库。

适用：

- 你想用不同“专家角色”反复挑战产品、架构、设计、QA、安全、发布方案。
- web app / SaaS / landing page / 需要真实浏览器 QA 的项目。
- founder / solo builder 想用固定的角色流程替代临时 prompt。
- 已经有计划或 PR，需要更强的 review、QA、ship、canary、benchmark 检查。
- 希望在本地 agent 之外，再获得一层持续状态：设计文档、learned preferences、context save/restore、ship queue、benchmark baseline。
- 需要真实登录态、真实浏览器、真实页面性能和真实控制台错误，而不是只靠静态代码推断问题。

问题：

- 很 opinionated，带有明显的 Garry Tan / YC / startup 产品视角，不一定适合所有工程组织。
- 工具体系比普通技能包重，尤其浏览器 daemon、Bun、cookie / session 状态都会增加环境复杂度。
- 角色很多，初用时容易不知道该从哪个命令开始。
- 虽然现在已经有 `/spec`、`/autoplan`、`/context-save`、`/learn`、`/health` 等功能，但很多核心价值仍围绕 Web、浏览器、PR、发布和运营节奏；对纯库、纯后端或离线工具项目的收益会下降。
- 状态大量保存在 `~/.gstack/projects/` 和本机浏览器环境里，不是天然 repo-first；多人协作时需要主动决定哪些结论要回写进仓库。
- `team mode` 解决的是“如何共享同一套技能和升级路径”，不是“如何统一产品规格来源”；如果同时叠加 OpenSpec、Spec Kit、GSD，很容易出现多套主文档。

注意事项：

- 现在不应只把它理解成“评审与验收层”。更准确的说法是：gstack 已经覆盖从 framing 到 ship，但它最强的差异化价值仍然在 `plan review + browser QA + release workflow + local memory`。
- 对新功能可按 `/office-hours -> /autoplan` 或 `/office-hours -> /plan-ceo-review -> /plan-design-review -> /plan-eng-review -> build -> /review -> /qa -> /ship -> /retro` 使用。
- 对已有 PR，直接用 `/review`、`/qa`、`/cso`、`/ship` 更高效；如果需要第二模型交叉质检，再跑 `/codex`。
- 如果你已经有明确 feature brief，但没有 spec，可直接从 `/spec` 起步；如果只是想快速做“计划全套 review”，直接跑 `/autoplan` 比手动串 3-4 个命令更省心。
- 如果需要登录态浏览，先用 `/setup-browser-cookies` 导入真实浏览器 cookies，再让 `/qa` 或 `/browse` 工作。
- 若项目有敏感登录态，要把浏览器 daemon 当作本地高权限组件对待。官方安全模型是 `127.0.0.1` 监听、Bearer token、状态文件 `0600`、隧道端口与本地端口分离，但你仍应明确谁能访问这台机器、哪些 cookie 可以导入。

常用命令分层：

- 发现与产品定义：`/office-hours`、`/spec`、`/plan-ceo-review`。
- 工程与设计规划：`/plan-eng-review`、`/plan-design-review`、`/plan-devex-review`、`/autoplan`。
- 实现后质量把关：`/review`、`/qa`、`/qa-only`、`/cso`、`/codex`。
- 发布与运行验证：`/ship`、`/land-and-deploy`、`/canary`、`/benchmark`、`/document-release`、`/retro`。
- 状态与团队协作：`/learn`、`/context-save`、`/context-restore`、`team mode`、`/pair-agent`。

状态与工件：

- `office-hours` 产出的 design doc 会写到 `~/.gstack/projects/`，后续 `plan` 技能直接复用。
- `plan-eng-review` 会生成 test plan artifact，`/qa` 可自动接它，不需要手动复制测试清单。
- `/design-shotgun` 的批准设计会保存到 `~/.gstack/projects/$SLUG/designs/`，后续 `/design-html` 可直接接着转成代码。
- `/learn` 会把项目级偏好、坑点和架构决策沉淀到 `learnings.jsonl`，形成跨会话记忆。
- `/context-save` / `/context-restore` 适合中断后续跑，尤其是多 worktree、多 session 或人机接力的场景。

## get-shit-done

特点：

- 文档和计划驱动开发，大量使用文件化工件与 XML / Markdown 结构，最早适配 Claude Code，现在也适配 Codex、Gemini、OpenCode、Cursor、Windsurf 等。
- 当前维护线已迁移到 `open-gsd/get-shit-done-redux`，推荐使用 `@opengsd/get-shit-done-redux` 和 `@opengsd/gsd-sdk`。
- 主循环是 `/gsd-new-project -> /gsd-discuss-phase -> /gsd-plan-phase -> /gsd-execute-phase -> /gsd-verify-work -> /gsd-ship`。
- 核心资产是 `.planning/`：`PROJECT.md`、`REQUIREMENTS.md`、`ROADMAP.md`、`STATE.md`、`CONTEXT.md`、`config.json`、phase plans 等。
- 架构上强调 fresh-context subagents、thin orchestrator、文件化状态、phase / wave 并发执行、验证与恢复。
- 适合跨多次会话推进项目，因为状态不只存在于聊天上下文里。

适用：

- 对领域不太了解、知识储备不足、需求模糊，但要尽快把项目跑成可交付版本。
- 从 0 到 1 或多 phase 项目，需要 roadmap、milestone、planning artifacts、执行、验证、归档。
- 想让多个子代理并行执行，且希望每个 task 有独立上下文、独立提交和可恢复状态。
- 需要把“需求 -> 计划 -> 执行 -> 验证 -> ship”固化为仓库内可追踪工件。

问题：

- 速度慢，token 消耗多；质量代理、plan checker、verifier、research 都会增加成本。
- 心智负担和架构漂移之间要二选一：流程越完整，越要维护 `.planning/` 的一致性。
- 自由度低；当你已经很清楚实现路径时，GSD 会显得重。
- `.planning` 结构容易乱，尤其在中途改需求、手动移动计划、跨工具执行时。
- 对权限和宿主配置敏感；如果子代理没有运行测试、git、package manager 的权限，执行阶段容易卡住。

注意事项：

- 新项目或大阶段前用 GSD；小修小改不要默认上 GSD。
- `.planning/` 是否提交进 git 要提前决定。私有或敏感项目可本地保留，不进仓库。
- 每个 phase 结束后及时 verify / ship / archive，避免 STATE 和实际代码脱节。
- 和 superpowers 搭配时，GSD 管 lifecycle 和 artifacts，superpowers 管局部实现纪律。
- 和 OpenSpec 搭配时要避免重复建规格：OpenSpec 更适合 change-level，GSD 更适合 project / phase-level。

## BMAD-METHOD

特点：

- BMAD 是一套偏 agile / product delivery 的 agent workflow，核心不是“自由对话编程”，而是把 PRD、架构、stories、实现串成固定链路。
- 官方 workflow map 明确区分 `Analysis`、`Planning`、`Solutioning`、`Implementation` 四段，并建议按角色 / 工作流切换新会话。
- 它提供 IDE bundles、命令包和模板，既能走简化路径，也能落到 `_bmad/`、`_bmad-output/` 这类工件目录。
- 和 superpowers 比，它更强调上游产品分析与故事拆分；和 GSD 比，它更像“agile 工件链”而不是 phase 状态机。

适用：

- 从模糊想法出发，需要先做 PRD、架构、stories，再进入开发。
- 你想要比 superpowers 更重的规划层，但又不一定需要 GSD 那种 verifier / phase 恢复编排。
- 团队希望把产品到工程的交接文档模板化、角色化。

问题：

- 术语、角色和工件都比较多，第一次上手的摩擦不低。
- scope 小或实现路径已知时，很容易把流程做成额外 ceremony。
- 质量依赖你是否真的 review PRD / 架构 / stories；如果都走过场，收益会快速下降。

注意事项：

- 小 bugfix、一次性脚本、简单重构都不适合默认上 BMAD。
- 最好提前决定 BMAD 是负责“上游产品文档”还是只负责“工程拆分”，不要和 OpenSpec / Spec Kit 重复建需求。
- 如果已经有 GSD，优先二选一；两者都当主流程会让工件和状态重复。

## GitHub Agentic Workflows

特点：

- 这是 GitHub 官方的仓库内 agent 工作流系统，用 Markdown 描述工作流，再编译成 `.lock.yml` 给 GitHub Actions 执行。
- 它把 AI 工作从“本地对话”扩展到“仓库自动化”：可以按 schedule、issue、PR、CI 事件触发。
- 工作流里可以声明工具白名单、审批、secrets、工件和输出目标，更像 agent 版 CI/CD。
- 最适合做持续性的 repo chores，例如日报、triage、文档补全、CI 失败分析、回归巡检。

适用：

- 你需要后台持续跑的 agent 任务，而不只是 IDE 里的即时协作。
- 团队想把 AI 输出绑定到 PR、issue、Actions 日志和仓库权限模型上。
- 有大量重复性的仓库分析、汇总、巡检或文档维护工作。

问题：

- 调试回路比本地聊天慢，权限、secrets 和 Actions 配置也更复杂。
- 更像 repo automation 层，不适合承担本地设计推演和精细编码协作。
- 仍然需要你控制成本、输出边界和写权限，不然容易把不稳定结果放进仓库事件流。

注意事项：

- 建议先从 read-only / report-only 工作流起步，再逐步开放 comment 或 write。
- 工具 allowlist 要尽量小，把确定性 CI 和开放式 agent 工作流分开。
- 它最适合叠加在 Spec Kit、OpenSpec、GSD 之上，而不是直接替代这些本地开发流程。

## general config

可复用轻量规则：

- [AGENTS.md](https://agents.md/)：正在变成跨工具共享仓库级指令的通用格式，适合把约束从聊天提示词迁移到 repo 内协议。
- [AGENT-ZERO](https://github.com/msitarzewski/AGENT-ZERO)：把 `AGENTS.md`、`TODO.md`、`STATE.md` 压成一套最小 contract，适合不想上完整 framework、但又想有稳定状态面的人。
- [andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills)：单文件 CLAUDE.md / skill 思路，强调四件事：编码前先想清楚、简单优先、外科手术式修改、以可验证目标驱动执行。
- [mattpocock/skills](https://github.com/mattpocock/skills)：偏工程师日常协作的小技能集，强调 grilling session、共享语言、ADR、ticket triage 等，比 GSD / Spec Kit 更轻、更可组合。
- [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills)：偏 slash commands + lifecycle steps，把 `analyze / architect / plan / parallel / review / ship` 这类动作做成轻量命令面板。
- [Gentle-AI](https://github.com/Gentleman-Programming/gentle-ai)：更像 ecosystem configurator，组合 memory、skills、SDD、model routing 和 workflow triggers，适合统一多宿主体验。

适用：

- 你不想安装完整 workflow framework，只想给 agent 加工程习惯、最小状态面或统一指令格式。
- 项目已成熟，有自己的 issue / PR / CI 流程，只缺少更好的 agent 行为约束。
- 想把规则写进 `AGENTS.md`、`CLAUDE.md`、`.cursor/rules`、技能目录或统一配置层，让不同工具共享同一套偏好。

问题：

- 轻量规则不会自动生成状态机，也不会替你维护 roadmap、spec、tasks。
- `AGENTS.md` 这类契约能解决行为一致性，但解决不了验证闭环和项目编排。
- 规则太多会互相冲突，尤其是“速度优先”和“TDD 优先”、“自主执行”和“每步确认”之间。

建议基线：

- 默认规则：先理解目标，列假设；只改必要文件；保留现有风格；不要顺手重构；用测试或命令验证。
- 单个 feature：`OpenSpec` 或 `Spec Kit` 管工件，`superpowers` 管执行纪律。
- IDE 内闭环：`Kiro + AGENTS.md`。
- 大型项目：`GSD` 或 `BMAD-METHOD` 建主流程，必要时叠加 `gstack` 做 review / QA / ship。
- 仓库自动化：`GitHub Agentic Workflows` 放到 repo / CI 层，不要和本地实现流程混用。

## 组合建议

| 目标 | 推荐组合 | 理由 |
|---|---|---|
| 小 bug / 小功能 | `superpowers` 或轻量 `AGENTS.md` / `AGENT-ZERO` | 不需要完整规格系统，但需要测试和 review 纪律 |
| 单个清晰 feature | `OpenSpec + superpowers` 或 `Spec Kit + superpowers` | 前者更轻，后者的澄清和检查门禁更强 |
| 需要 IDE 内闭环 | `Kiro + AGENTS.md` | specs、长期规则、hooks、任务执行都能留在同一 IDE |
| 从 0 到 1 项目 | `GSD` 或 `BMAD-METHOD` | 前者偏 lifecycle / phase 恢复，后者偏 PRD / 架构 / stories 链路 |
| 已有 PR 的质量把关 | `gstack /review + /qa + /cso` | 角色化评审和浏览器 QA 更直接 |
| 仓库级持续自动化 | `GitHub Agentic Workflows` | 适合定时巡检、triage、日报、CI 失败分析等后台 agent 任务 |
| Web 产品迭代 | `OpenSpec / Spec Kit / GSD + gstack` | 前者管需求和计划，gstack 管设计、QA、发布 |
| 只想改善 agent 行为 | `AGENTS.md + karpathy / mattpocock / addy agent-skills` | 低成本、少侵入、容易迁移 |

## 来源

- [obra/superpowers](https://github.com/obra/superpowers)
- [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec)
- [github/spec-kit](https://github.com/github/spec-kit)
- [Spec Kit 官方文档](https://github.github.com/spec-kit/)
- [Kiro Specs](https://kiro.dev/docs/specs/)
- [Kiro Steering](https://kiro.dev/docs/steering/)
- [Kiro Hooks](https://kiro.dev/docs/hooks/)
- [garrytan/gstack](https://github.com/garrytan/gstack)
- [gstack ARCHITECTURE.md](https://github.com/garrytan/gstack/blob/main/ARCHITECTURE.md)
- [gstack docs/skills.md](https://github.com/garrytan/gstack/blob/main/docs/skills.md)
- [open-gsd/get-shit-done-redux](https://github.com/open-gsd/get-shit-done-redux)
- [gsd-build/get-shit-done 迁移说明](https://github.com/gsd-build/get-shit-done)
- [bmad-code-org/BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD)
- [BMAD workflow map](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/docs/reference/workflow-map.md)
- [GitHub Agentic Workflows 文档](https://github.github.com/gh-aw/)
- [agents.md](https://agents.md/)
- [msitarzewski/AGENT-ZERO](https://github.com/msitarzewski/AGENT-ZERO)
- [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills)
- [mattpocock/skills](https://github.com/mattpocock/skills)
- [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills)
- [Gentleman-Programming/gentle-ai](https://github.com/Gentleman-Programming/gentle-ai)
