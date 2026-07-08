# AI Coding Agent Prompt Construction Strategies

如果你是从 [AI 编码工作流](../index.md) 进入这个子栏目，这里更适合回答三个问题：

- Claude Code、Codex、OpenCode 这类工具的系统提示词是怎么拼出来的
- 它们怎么做上下文裁剪、工具描述和长期可扩展性设计
- 不同 Coding Agent 在文件编辑、多 Agent、沙箱和上下文管理上的差异是什么

Three AI coding agents analyzed for their prompt engineering architecture:

| Document | Project | Language | API |
|---|---|---|---|
| [Claude Code](./claude-code-prompt-strategy.md) | Anthropic Claude Code | TypeScript | Anthropic Messages API |
| [OpenCode](./opencode-prompt-strategy.md) | OpenCode (SST) | TypeScript | AI SDK (multi-provider) |
| [Codex](./codex-prompt-strategy.md) | OpenAI Codex CLI | Rust | OpenAI Responses API |

## Multi-Agent

- [Multi-Agent 协作模式分类总览](./multi-agent-collaboration-patterns.md)
- [AI 编码 Agent 多 Agent 机制对比（源码校对版）](./multi-agent.md)

## Cross-Cutting Comparison

### Context Budget Strategy

| Aspect | Claude Code | OpenCode | Codex |
|---|---|---|---|
| Safety buffer | 13K tokens (autocompact) + 20K (output) | 20K tokens (COMPACTION_BUFFER) | 5% of context window |
| Compact trigger | 95% effective context - buffer | `usable = input - reserved` | 90% of context window |
| Preserve recent | 5 files + plan + skills (token-budgeted) | 25% of usable (2K-8K tokens) | 20K tokens of recent user messages |
| Tool result cap | 50K chars per result, 200K per message | 50KB / 2000 lines per result | Per-model TruncationPolicy |

### Compression Layers

| Layer | Claude Code | OpenCode | Codex |
|---|---|---|---|
| 1 | Tool result disk persistence | Tool output truncation + file fallback | Middle-truncation of tool outputs |
| 2 | Snip compaction (history removal) | Pruning (40K protected, 20K min) | Context diff (only changed fragments resent) |
| 3 | Microcompact (clear old tool results) | Compaction with tail preservation | Pre-turn compaction |
| 4 | Context collapse | -- | Mid-turn compaction |
| 5 | Auto-compact (full summarization) | -- | Inline/Remote v1/v2 compaction |
| 6 | Reactive compact (413 error recovery) | -- | -- |

### U-Shaped Attention

| Approach | Claude Code | OpenCode | Codex |
|---|---|---|---|
| Beginning | Static system prompt (global cache) | Provider base prompt (cache-stable header) | Base instructions in `instructions` field |
| End | Recent messages + restored files/skills | Tail preservation (last 2 turns, 2K-8K tokens) | Recent user messages (20K token budget) |
| Middle | Compressed summary + cleared tool outputs | Summary + pruned tool outputs | Summary + dropped assistant/tool history |
| Unique | Post-compact attachments (files, MCP, skills) | `filterCompacted()` U-shape reordering | Mid-turn reinjection of initial context before last user message |

### System Prompt Architecture

| Aspect | Claude Code | OpenCode | Codex |
|---|---|---|---|
| Structure | `string[]` with cache boundary marker | Single string from layered join | `instructions` field on API request |
| Caching | Split into `global` scope blocks | 2-part: header (cache-stable) + body | Not explicitly managed (Responses API) |
| Project context | CLAUDE.md files (hierarchical, `@include`) | AGENTS.md / CLAUDE.md (first-match) | AGENTS.md (walk-up collection, budgeted) |
| Environment | Inline in system prompt | `<env>` block in system prompt | `EnvironmentContext` fragment (user role) |
| Tool descriptions | Inline in system prompt as function schemas | AI SDK `tool()` objects | Responses API `tools` array |
