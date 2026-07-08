# AI Coding Agent Docs Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure `docs/ai-coding/coding-agents` into a smaller, judgment-first document set with corrected `todo` and `goal` strategy coverage for Claude Code, OpenCode, and Codex.

**Architecture:** Keep `ai-coding` as the mkdocs entrypoint, collapse `coding-agents` into one index page plus three focused documents, and migrate only the material that still contributes unique value. Treat old pages as source material: absorb their conclusions into the new docs, then remove them from navigation and delete the ones fully superseded.

**Tech Stack:** Markdown, mkdocs-material, awesome-nav, local source repositories (`claude-code-src`, `opencode`, `codex`)

## Global Constraints

- Work only under `docs/ai-coding/` and related `.pages` files.
- Keep the writing judgment-first: conclusions and boundaries first, code evidence second.
- Preserve mkdocs navigation coherence through `docs/ai-coding/.pages` and `docs/ai-coding/coding-agents/.pages`.
- Correctly distinguish session todo/task tracking from thread-level goal state machines.
- Any “latest” Claude Code `/goal` statement must explicitly reflect verification performed on `2026-07-08`.

---

### Task 1: Create the new core documents

**Files:**
- Create: `docs/ai-coding/coding-agents/agent-architecture-and-prompting.md`
- Create: `docs/ai-coding/coding-agents/agent-task-and-goal-strategies.md`
- Create: `docs/ai-coding/coding-agents/source-evidence-and-code-index.md`
- Modify: `docs/ai-coding/coding-agents/index.md`

**Interfaces:**
- Consumes: `docs/superpowers/specs/2026-07-08-ai-coding-agent-docs-restructure-design.md`
- Produces: New four-page `coding-agents` document set used by navigation and later cleanup tasks

- [ ] **Step 1: Review the current source pages that will feed the rewrite**

Run:

```bash
rtk sed -n '1,220p' docs/ai-coding/coding-agents/index.md
rtk sed -n '1,260p' docs/ai-coding/coding-agents/todo-system-analysis.md
rtk sed -n '1,260p' docs/ai-coding/coding-agents/goal-command-strategy-claude-code-vs-codex.md
rtk sed -n '1,220p' docs/ai-coding/coding-agents/prompt-construction-strategies.md
```

Expected: enough existing material is visible to rewrite the new pages without losing the key comparisons.

- [ ] **Step 2: Write the new architecture page**

Create `docs/ai-coding/coding-agents/agent-architecture-and-prompting.md` with sections for prompt assembly, context/compaction, tools, and multi-agent patterns. Keep the page comparative rather than product-by-product.

- [ ] **Step 3: Write the new task-and-goal page**

Create `docs/ai-coding/coding-agents/agent-task-and-goal-strategies.md` with corrected coverage for:

```text
- Claude Code: TodoWrite + TaskCreate/TaskUpdate + /goal as continuation/control surface
- OpenCode: session todo persistence + task/subagent control, not a Codex-style goal runtime
- Codex: persistent thread goal state machine with explicit tool authority and accounting
```

- [ ] **Step 4: Write the source evidence appendix**

Create `docs/ai-coding/coding-agents/source-evidence-and-code-index.md` listing the key local source files and the external Claude Code `/goal` references used to support the new conclusions.

- [ ] **Step 5: Rewrite the section index**

Update `docs/ai-coding/coding-agents/index.md` so it introduces the new three-page reading path and summarizes what each page answers.

- [ ] **Step 6: Verify the new pages exist and have the intended headings**

Run:

```bash
rtk rg -n "^# " docs/ai-coding/coding-agents/index.md docs/ai-coding/coding-agents/agent-architecture-and-prompting.md docs/ai-coding/coding-agents/agent-task-and-goal-strategies.md docs/ai-coding/coding-agents/source-evidence-and-code-index.md
```

Expected: four top-level headings, one per target page.

- [ ] **Step 7: Commit the core document set**

Run:

```bash
rtk git add docs/ai-coding/coding-agents/index.md docs/ai-coding/coding-agents/agent-architecture-and-prompting.md docs/ai-coding/coding-agents/agent-task-and-goal-strategies.md docs/ai-coding/coding-agents/source-evidence-and-code-index.md
rtk git commit -m "docs: add consolidated coding-agents pages"
```

### Task 2: Update navigation and retire the old doc sprawl

**Files:**
- Modify: `docs/ai-coding/coding-agents/.pages`
- Optionally modify: `docs/ai-coding/index.md`
- Delete: superseded files under `docs/ai-coding/coding-agents/` that no longer add unique value

**Interfaces:**
- Consumes: New four-page `coding-agents` set from Task 1
- Produces: A reduced navigation tree that points readers to the new structure only

- [ ] **Step 1: Update the coding-agents nav file**

Edit `docs/ai-coding/coding-agents/.pages` so its `nav` contains only:

```yaml
title: 编码 Agent 机制
nav:
  - index.md
  - agent-architecture-and-prompting.md
  - agent-task-and-goal-strategies.md
  - source-evidence-and-code-index.md
```

- [ ] **Step 2: Adjust the parent ai-coding landing page if its copy still points to the old page set**

Update `docs/ai-coding/index.md` so the `编码 Agent 机制` description reflects the new consolidated structure rather than a large pile of专题页.

- [ ] **Step 3: Remove superseded pages that are fully absorbed**

Delete the old `coding-agents` pages that were used only as source material and are no longer linked from navigation, especially the prompt, context, todo, goal, and comparison pages superseded by the new core set.

- [ ] **Step 4: Verify only the intended pages remain in navigation**

Run:

```bash
rtk sed -n '1,120p' docs/ai-coding/coding-agents/.pages
rtk rg -n "coding-agents/.+\\.md|todo-system-analysis|goal-command-strategy-claude-code-vs-codex|prompt-construction-strategies" docs/ai-coding
```

Expected: `.pages` shows only the four new entries, and any remaining references to deleted files are either gone or intentionally preserved outside navigation.

- [ ] **Step 5: Commit the navigation cleanup**

Run:

```bash
rtk git add docs/ai-coding/.pages docs/ai-coding/index.md docs/ai-coding/coding-agents/.pages docs/ai-coding/coding-agents
rtk git commit -m "docs: simplify coding-agents navigation"
```

### Task 3: Validate the docs build and final content boundaries

**Files:**
- Modify: any of the files above if validation reveals broken links or stale copy

**Interfaces:**
- Consumes: The restructured docs and updated navigation
- Produces: A validated docs set ready for review

- [ ] **Step 1: Build the mkdocs site**

Run:

```bash
cd /home/wunai/Disks/Data/my-project/guidebooks && rtk mkdocs build
```

Expected: build succeeds without broken-nav or markdown errors.

- [ ] **Step 2: Spot-check the key corrected statements**

Run:

```bash
rtk rg -n "Claude Code|OpenCode|Codex|/goal|TodoWrite|thread-level|session todo" docs/ai-coding/coding-agents/agent-task-and-goal-strategies.md
```

Expected: the new page explicitly distinguishes the three systems using the corrected terminology.

- [ ] **Step 3: Inspect git diff for accidental scope creep**

Run:

```bash
rtk git status --short
rtk git diff -- docs/ai-coding docs/superpowers/plans/2026-07-08-ai-coding-agent-docs-restructure.md
```

Expected: changes are limited to the intended docs restructure plus this plan file.

- [ ] **Step 4: Commit final validation fixes if needed**

Run:

```bash
rtk git add docs/ai-coding docs/superpowers/plans/2026-07-08-ai-coding-agent-docs-restructure.md
rtk git commit -m "docs: finalize ai-coding restructure"
```
