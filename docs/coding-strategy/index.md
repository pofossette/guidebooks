# AI 编码工作流工具速查

> 检索时间：2026-05-28。这里记录的是我对几类 AI 编码工作流工具的实用判断，不是完整评测。优先参考官方 README / 文档；社区评价只作为辅助印象。

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

## gstack

特点：

- Garry Tan 开源的个人 AI 编码工作流配置，定位是把 Claude Code / 其他 agent 变成“虚拟工程团队”。
- 核心不是 spec 仓库，而是一组带角色的 slash commands / skills：CEO、工程经理、设计师、QA、SRE、安全、Release Engineer、技术文档等。
- 官方主线强调 `Think -> Plan -> Build -> Review -> Test -> Ship -> Reflect`。
- 很多命令是“角色评审”而不是“执行任务”：如 `/office-hours`、`/plan-ceo-review`、`/plan-eng-review`、`/review`、`/qa`、`/ship`。
- 一个重要差异是内置持久浏览器能力：通过长期运行的 Chromium daemon 保留 cookies、tabs、login session，并让浏览器调用降到亚秒级。
- 现已扩展到 Codex、OpenCode、Cursor、Factory Droid、Kiro、Hermes、GBrain 等多个宿主，但 Claude Code 仍是最原生的使用场景。

适用：

- 你想用不同“专家角色”反复挑战产品、架构、设计、QA、安全、发布方案。
- web app / SaaS / landing page / 需要真实浏览器 QA 的项目。
- founder / solo builder 想用固定的角色流程替代临时 prompt。
- 已经有计划或 PR，需要更强的 review、QA、ship、canary、benchmark 检查。

问题：

- 很 opinionated，带有明显的 Garry Tan / YC / startup 产品视角，不一定适合所有工程组织。
- 工具体系比普通技能包重，尤其浏览器 daemon、Bun、cookie / session 状态都会增加环境复杂度。
- 角色很多，初用时容易不知道该从哪个命令开始。
- 对非 web 项目价值会下降，尤其是没有 UI、没有浏览器验收、没有发布链路的库项目。

注意事项：

- 更适合作为“评审与验收层”，而不是唯一的需求管理层。
- 对新功能可按 `/office-hours -> /plan-ceo-review -> /plan-eng-review -> build -> /review -> /qa -> /ship` 使用。
- 对已有 PR，直接用 `/review`、`/qa`、`/cso`、`/ship` 更高效。
- 若项目有敏感登录态，先搞清楚浏览器和 cookie 状态的本地存储方式，再给 agent 使用。

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

## general config

可复用轻量规则：

- [andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills)：单文件 CLAUDE.md / skill 思路，强调四件事：编码前先想清楚、简单优先、外科手术式修改、以可验证目标驱动执行。
- [mattpocock/skills](https://github.com/mattpocock/skills)：偏工程师日常协作的小技能集，强调 grilling session、共享语言、ADR、ticket triage 等，比 GSD / Spec Kit 更轻、更可组合。

适用：

- 你不想安装完整 workflow framework，只想给 agent 加工程习惯。
- 项目已成熟，有自己的 issue / PR / CI 流程，只缺少更好的 agent 行为约束。
- 想把规则写进 `AGENTS.md`、`CLAUDE.md`、`.cursor/rules` 或技能目录，让不同工具共享同一套偏好。

问题：

- 轻量规则不会自动生成状态机，也不会替你维护 roadmap、spec、tasks。
- 规则太多会互相冲突，尤其是“速度优先”和“TDD 优先”、“自主执行”和“每步确认”之间。

建议基线：

- 默认规则：先理解目标，列假设；只改必要文件；保留现有风格；不要顺手重构；用测试或命令验证。
- 中型任务：OpenSpec 或 superpowers 先写计划，再执行。
- 大型项目：GSD 建 lifecycle，必要时叠加 gstack 做 review / QA / ship。

## 组合建议

| 目标 | 推荐组合 | 理由 |
|---|---|---|
| 小 bug / 小功能 | `superpowers` 或轻量 `AGENTS.md` 规则 | 不需要完整规格系统，但需要测试和 review 纪律 |
| 单个清晰 feature | `OpenSpec + superpowers` | OpenSpec 管变更工件，superpowers 管执行质量 |
| 从 0 到 1 项目 | `GSD` | 需要 roadmap、phase、状态恢复和验证闭环 |
| 已有 PR 的质量把关 | `gstack /review + /qa + /cso` | 角色化评审和浏览器 QA 更直接 |
| Web 产品迭代 | `OpenSpec 或 GSD + gstack` | 前者管需求和计划，gstack 管设计、QA、发布 |
| 只想改善 agent 行为 | `andrej-karpathy-skills + mattpocock/skills` | 低成本、少侵入、容易迁移 |

## 来源

- [obra/superpowers](https://github.com/obra/superpowers)
- [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec)
- [garrytan/gstack](https://github.com/garrytan/gstack)
- [gstack ARCHITECTURE.md](https://github.com/garrytan/gstack/blob/main/ARCHITECTURE.md)
- [open-gsd/get-shit-done-redux](https://github.com/open-gsd/get-shit-done-redux)
- [gsd-build/get-shit-done 迁移说明](https://github.com/gsd-build/get-shit-done)
- [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills)
- [mattpocock/skills](https://github.com/mattpocock/skills)
