# 三大 AI 编码工具文件编辑能力对比

> 对比对象：Claude Code、OpenAI Codex、OpenCode
> 分析日期：2025-05-21

## 工具概览

| 项目 | 语言 | 编辑工具 | 核心策略 |
|------|------|----------|----------|
| **Claude Code** | TypeScript | `Edit` + `Write` + `NotebookEdit` | 精确字符串替换 + 全文覆写 |
| **Codex** | Rust | `apply_patch` | 自定义 patch 格式 + 模糊行匹配 |
| **OpenCode** | TypeScript | `Edit` + `Write` + `Apply Patch` | 8 级渐进式字符串替换 + patch 应用 |

## 通俗理解：它们怎么读文件、怎么改文件

### 读文件不是 cat，写文件也不是 sed

三个项目都没有调用任何外部命令（没有 `cat`、`sed`、`patch`）。它们做的事情本质上是一样的：

```
1. 把整个文件一次性读进内存（就像你用编辑器打开一个文件）
2. 在内存里对字符串做修改（就像你在编辑器里搜索替换）
3. 把内存里的新内容一次性写回硬盘（就像你在编辑器里按 Ctrl+S）
```

### 读文件 — 打开文件

| 项目 | 实际调用 | 通俗理解 |
|------|---------|---------|
| **Claude Code** | Node.js `fs.readFileSync()` | 同步读，程序暂停等读完再继续 |
| **Codex** | Rust `tokio::fs::read()` | 异步读，读的同时程序可以干别的事 |
| **OpenCode** | Node.js `fs/promises.readFile()` | 异步读，通过 Promise 回调通知读完 |

三者本质一样：**把整个文件内容一次性读到内存里，变成一个字符串**。不是一行一行读，不是流式读，就是整个文件"哗"一下全部加载。

Claude Code 多了一步：先读文件的前 4096 字节来检测编码（是 UTF-8 还是 UTF-16），然后再用正确的编码读全文。Codex 读之前会检查文件大小不能超过 512MB。

### 改文件 — 搜索替换

**不是用 sed，是在内存里改字符串。** 具体来说：

**Claude Code** 最简单粗暴：就是 JavaScript 的 `string.replace()`，要求模型提供精确的搜索文本。如果 `old_string` 在文件里出现了多次且没开 `replace_all`，会报错让模型提供更多上下文。

**Codex** 最不一样 — 它不是"搜索替换"，而是"应用补丁"。模型输出一段 patch 文本，系统解析后按行号定位到文件的对应位置，把旧行替换成新行。定位时使用四级递进模糊匹配（精确 → 忽略尾部空格 → 忽略所有空格 → 忽略 Unicode 差异），类似 `git apply` 的容错机制。替换完成后从后往前依次应用，避免前面的改动导致后面的行号错位。

**OpenCode** 兼具两者特点，既有精确替换工具也有 patch 工具。它的精确替换工具有 8 级匹配策略层层降级：精确匹配不行就试试忽略空格，再不行就用 Levenshtein 编辑距离做模糊匹配（允许最多 30% 的差异），再不行就试试归一化缩进……直到找到为止。

### 写文件 — 保存

| 项目 | 方式 | 安全性 |
|------|------|--------|
| **Claude Code** | 先写到临时文件 `.tmp.PID.timestamp`，再 `rename` 覆盖原文件 | **最安全** — 原子操作，写一半断电不会损坏原文件 |
| **Codex** | 直接 `tokio::fs::write()` 覆盖原文件 | 一般 — 写一半断电可能丢数据 |
| **OpenCode** | 直接 `fs/promises.writeFile()` 覆盖原文件 | 一般 — 同上 |

Claude Code 用的是"写临时文件 → 改权限 → 原子重命名"三步走，和 VS Code 等编辑器保存文件的方式一样。

## 一句话总结

三个工具的底层都是 **"读进内存 → 改字符串 → 写回硬盘"**，区别在于"改字符串"这一步的策略：Claude Code 要求精确匹配（简单但对模型要求高），Codex 用 patch 按行匹配应用（适合大范围改动），OpenCode 给模型 8 次容错机会（最宽容但实现最复杂）。

## 相关文档

- [文件 I/O 实现细节](./file-io-details.md) — 底层文件读写的具体函数调用和流程
- [Edit 工具算法对比](./edit-algorithms.md) — 三个项目 Edit 工具的搜索替换算法详解
- [Claude Code 文件编辑实现](./claude-code-edit-impl.md) — Claude Code 文件编辑工具的完整实现分析
- [Codex apply_patch 实现](./codex-apply-patch-impl.md) — Codex 自定义 patch 系统的完整实现分析
- [OpenCode 文件编辑实现](./opencode-edit-impl.md) — OpenCode 文件编辑工具的完整实现分析
