# 三大 AI 编码工具文件编辑能力对比

> 对比对象：Claude Code、OpenAI Codex、OpenCode
> 分析日期：2025-05-21
> 基于 Claude Code 源码（`src/tools/FileEditTool/`、`src/tools/FileWriteTool/`）、Codex（Rust）源码、OpenCode（TypeScript）源码交叉验证

---

# 目录

- [一、总览与通俗解释](#一总览与通俗解释)
- [二、文件 I/O 实现细节](#二文件-io-实现细节)
- [三、Edit 工具搜索替换算法对比](#三edit-工具搜索替换算法对比)
- [四、Claude Code 文件编辑实现](#四claude-code-文件编辑实现)
- [五、Codex apply_patch 实现](#五codex-apply_patch-实现)
- [六、OpenCode 文件编辑实现](#六opencode-文件编辑实现)
- [七、三大工具特性对比总表](#七三大工具特性对比总表)

---

# 一、总览与通俗解释

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

### 一句话总结

三个工具的底层都是 **"读进内存 → 改字符串 → 写回硬盘"**，区别在于"改字符串"这一步的策略：Claude Code 要求精确匹配（简单但对模型要求高），Codex 用 patch 按行匹配应用（适合大范围改动），OpenCode 给模型 8 次容错机会（最宽容但实现最复杂）。

---

# 二、文件 I/O 实现细节

> 三个项目的底层文件读写机制分析

三个项目**都不使用外部命令**（cat、sed、patch 等），全部通过各自语言的标准库 API 直接操作文件系统。

## 读文件

### Claude Code

**调用链**：`FileEditTool.call()` → `readFileForEdit()` → `readFileSyncWithMetadata()`

`readFileSyncWithMetadata`（`src/utils/fileRead.ts:75`）的流程：

1. 调用 `safeResolvePath()` 解析符号链接（`fs.realpathSync()`）
2. 调用 `detectEncodingForResolvedPath()` 检测编码：用 `fs.openSync` + `fs.readSync(path, { length: 4096 })` 读前 4096 字节，检查 BOM 判断 UTF-16LE 还是 UTF-8
3. 调用 `fs.readFileSync(resolvedPath, { encoding })` 把整个文件读成一个 JavaScript 字符串
4. 将 `\r\n` 统一替换为 `\n`

验证阶段还有一条异步路径：`fs.readFileBytes(fullFilePath)` 使用 `fs.promises.readFile` 读取为 Buffer，用于检查文件是否被外部修改过。

### Codex

**调用链**：`apply_patch()` → `derive_new_contents_from_chunks()` → `fs.read_file_text()` → `fs.read_file()`

`DirectFileSystem::read_file`（`codex-rs/exec-server/src/local_file_system.rs:241`）的流程：

1. `tokio::fs::metadata(path)` — 异步 stat，检查文件大小不超过 512 MiB（`MAX_READ_FILE_BYTES`）
2. `tokio::fs::read(path)` — 异步读取整个文件到 `Vec<u8>`
3. `String::from_utf8(bytes)` — 将字节解码为 Rust String

通过 `ExecutorFileSystem` trait 抽象（`codex-rs/file-system/src/lib.rs:135`），支持不同的文件系统实现（本地/沙箱）。

### OpenCode

**调用链**：`edit.ts execute()` → `Bom.readFile(afs, filePath)` → `fs.readFile(filePath)`

`Bom.readFile`（`packages/opencode/src/util/bom.ts:18`）的流程：

1. 调用 Effect 框架的 `FileSystem.readFile(filePath)`（底层是 Node `fs/promises.readFile`）读取为 Buffer
2. 用 `new TextDecoder("utf-8", { ignoreBOM: true }).decode(buffer)` 解码为字符串
3. 检测并保留 BOM 信息

文件系统通过 `AppFileSystem`（`packages/core/src/filesystem.ts`）封装，基于 Effect 框架的 `NodeFileSystem`。

### 对比表

| 项目 | API | 同步/异步 | 编码检测 | 大小限制 |
|------|-----|----------|---------|---------|
| Claude Code | `fs.readFileSync()` | 同步 | BOM 检测（前 4096 字节） | 1 GiB |
| Codex | `tokio::fs::read()` | 异步 | `String::from_utf8` | 512 MiB |
| OpenCode | `fs/promises.readFile()` | 异步 | TextDecoder + BOM | 无 |

## 写文件

### Claude Code — 原子写入

**调用链**：`FileEditTool.call()` → `writeTextContent()` → `writeFileSyncAndFlush_DEPRECATED()`

`writeFileSyncAndFlush_DEPRECATED`（`src/utils/file.ts:362`）实现原子写入：

1. 解析符号链接得到真实路径
2. 生成临时文件路径：`` `${targetPath}.tmp.${process.pid}.${Date.now()}` ``
3. 用 `fs.statSync(targetPath)` 读取原文件权限
4. 写入临时文件：`fs.writeFileSync(tempPath, content, { encoding, flush: true })`
5. 复制权限：`fs.chmodSync(tempPath, targetMode)`
6. 原子重命名：`fs.renameSync(tempPath, targetPath)`（POSIX 上是原子操作）
7. 失败时清理临时文件，降级为直接 `fs.writeFileSync(targetPath, content)`

`writeTextContent` 还会处理 CRLF 行尾：如果原文件用 `\r\n`，写入前会把 `\n` 转回 `\r\n`。

### Codex — 直接覆写

**调用链**：`apply_patch()` → `fs.write_file(path, bytes)` → `tokio::fs::write(path, contents)`

```rust
tokio::fs::write(path.as_path(), contents).await
```

一步到位，直接覆盖目标文件。没有临时文件、没有原子操作。

如果父目录不存在，`write_file_with_missing_parent_retry()`（`lib.rs:616`）会捕获 `NotFound` 错误，递归创建目录后重试。

### OpenCode — 直接覆写

**调用链**：`edit.ts execute()` → `afs.writeWithDirs(filePath, content)` → `fs.writeFileString(path, content)`

```typescript
const write = typeof content === "string"
  ? fs.writeFileString(path, content)
  : fs.writeFile(path, content)
```

直接使用 Effect 框架的 `FileSystem.writeFileString`（底层是 Node `fs/promises.writeFile`）。

如果写入失败（目录不存在），会递归创建目录后重试。写入后还会运行格式化（formatter）并同步 BOM。

### 对比表

| 项目 | API | 原子写入 | 权限保留 | 目录自动创建 | 写后格式化 |
|------|-----|:-------:|:-------:|:-----------:|:---------:|
| Claude Code | `fs.writeFileSync` + `renameSync` | ✅ | ✅ | ❌ | ❌ |
| Codex | `tokio::fs::write` | ❌ | ❌ | ✅ | ❌ |
| OpenCode | `fs/promises.writeFile` | ❌ | ❌ | ✅ | ✅ |

## 内存中的修改模式

三个项目都是**读进内存 → 修改字符串 → 写回硬盘**：

| 项目 | 读入格式 | 修改方式 | 写出格式 |
|------|---------|---------|---------|
| Claude Code | JS `string` | `String.replace()` / `replaceAll()` | JS `string` |
| Codex | Rust `String` → `Vec<String>`（按行分割） | 行级 splice（从后往前应用） | `String`（行用 `\n` 拼接） |
| OpenCode | JS `string` | `substring()` 拼接（8 级匹配策略） | JS `string` |

---

# 三、Edit 工具搜索替换算法对比

## 概览

| 项目 | 匹配策略数 | 模糊匹配 | 核心算法 |
|------|:---------:|:-------:|---------|
| Claude Code | 1 | ❌ | JS `String.replace()` 精确子串 |
| Codex | 4 级 | ✅ | 行序列匹配 + 渐进模糊 |
| OpenCode | 8 级 | ✅ | 子串匹配 + Levenshtein 距离 |

## Claude Code — 精确匹配，简单直接

### 核心函数

`applyEditToFile()`（`src/tools/FileEditTool/utils.ts:206`）

### 算法

```
对文件内容调用 JS string.replace(old_string, new_string)
如果 old_string 为空（删除操作），额外尝试去掉尾部换行符再替换
```

### 唯一性检查

`validateInput()`（`FileEditTool.ts:137`）：

```typescript
const matches = file.split(actualOldString).length - 1
```

- 多处匹配且 `replace_all=false` → 报错
- 强制模型提供更多上下文来确保唯一

### 特殊处理

**弯引号标准化**（`findActualString()`，`utils.ts:73`）：
1. 先精确匹配
2. 失败则将弯引号（`''""`）转为直引号后重新匹配
3. 匹配成功后，将 `new_string` 中的直引号按原风格转回弯引号

**反净化**（`normalizeFileEditInput()`，`utils.ts:581`）：
模型看不到某些特殊字符串（如 `<function_results>`），输出的是占位符（如 `<fnr>`）。工具在匹配前会反向还原这些占位符。

**尾部空格处理**（`stripTrailingWhitespace()`，`utils.ts:44`）：
非 Markdown 文件自动去除 `new_string` 的尾部空格。Markdown 保留（双空格是硬换行）。

### 设计哲学

> 算法极简，把精确性要求推给模型。用弯引号标准化和反净化来兜底模型的常见输出错误。

## Codex — 行级匹配，四级模糊

### 核心函数

`seek_sequence()`（`codex-rs/apply-patch/src/seek_sequence.rs:12`）

### 算法：四级渐进匹配

```
Pass 1: 精确匹配 — 逐字节比较
Pass 2: trim trailing whitespace — 忽略行尾空格
Pass 3: full trim — 忽略首尾空格
Pass 4: Unicode 归一化 — 弯引号→直引号、长破折号→减号、不间断空格→普通空格
```

### 特殊机制

**EOF 锚定**：当 `eof=true` 时，从文件末尾开始搜索（而非从头），用于匹配文件尾部的内容。

**上下文定位**（`change_context`）：每个 chunk 可以带一个 `@@ context` 标记（如类名或方法名），先定位到上下文行，再从该位置开始搜索要替换的行。

**倒序应用**（`apply_replacements()`，`lib.rs:786`）：
替换操作从后往前依次应用，避免前面的增删导致后面行号偏移。

**行级 splice**：
```
计算 (start_index, old_len, new_lines) 元组
按 start_index 排序
从后往前：删除 old_len 行，插入 new_lines
```

### 设计哲学

> 模型输出类 diff 的 patch，系统按行匹配应用。类似 `git apply` 的容错机制，适合大范围改动和多文件操作。

## OpenCode — 最大容错，八级级联

### 核心函数

`replace()`（`packages/opencode/src/tool/edit.ts:674`）

### 算法：八级匹配策略级联

依次尝试，直到匹配成功：

| 级别 | 策略 | 容忍的差异 |
|:----:|------|-----------|
| 1 | **SimpleReplacer** | 无 — 精确匹配 |
| 2 | **LineTrimmedReplacer** | 每行首尾空格 |
| 3 | **BlockAnchorReplacer** | 用首尾行锚定 + Levenshtein 距离模糊匹配（阈值 0.3） |
| 4 | **WhitespaceNormalizedReplacer** | 所有多余空白归一为单空格 |
| 5 | **IndentationFlexibleReplacer** | 不同的缩进层级 |
| 6 | **EscapeNormalizedReplacer** | 转义字符差异（`\n`、`\t` 等） |
| 7 | **TrimmedBoundaryReplacer** | 整体首尾空白 |
| 8 | **ContextAwareReplacer** | 首尾行锚定 + 50% 中间行相似度 |

### Levenshtein 距离（第 3 级使用）

`BlockAnchorReplacer`（`edit.ts:284`）使用 Levenshtein 编辑距离做模糊匹配：

- 单候选时阈值 0.0（必须完全匹配）
- 多候选时阈值 0.3（允许 30% 的字符差异）
- 在候选区域中找与 `old_string` 编辑距离最小的位置

### 匹配成功后的替换

不在匹配到的级别做替换，而是用 `SimpleReplacer` 匹配到的**原始搜索文本**来执行实际替换：

```typescript
for (const replacer of [SimpleReplacer, LineTrimmedReplacer, ...]) {
  for (const search of replacer(content, oldString)) {
    const index = content.indexOf(search)
    if (index === -1) continue
    if (replaceAll) return content.replaceAll(search, newString)
    // 唯一性检查
    if (content.lastIndexOf(search) !== index) continue
    return content.substring(0, index) + newString + content.substring(index + search.length)
  }
}
```

### 并发保护

使用 per-file 信号量（semaphore）锁，防止同时编辑同一文件导致冲突。

### 设计哲学

> 对模型输出极度宽容，8 级匹配层层降级。即使模型提供的搜索文本和文件内容有出入，也尽量找到匹配位置。代价是实现最复杂。

## 三者对比：容错性 vs 简洁性

```
容错性（高→低）：  OpenCode >>>>  Codex  >>  Claude Code
实现复杂度（高→低）：OpenCode >>>>  Codex  >>  Claude Code
对模型要求（高→低）：Claude Code >>  Codex  >>  OpenCode
```

- **Claude Code** 把复杂度放在模型侧（模型必须输出精确文本），自己保持代码简单
- **Codex** 用结构化 patch 格式平衡了两者，行级匹配天然容错
- **OpenCode** 把复杂度放在工具侧（8 级匹配），最大限度减少模型匹配失败的概率

---

# 四、Claude Code 文件编辑实现

## 工具概览

| 工具名 | 目录 | 用途 |
|--------|------|------|
| **Edit** | `src/tools/FileEditTool/` | 对已有文件做精确字符串替换 |
| **Write** | `src/tools/FileWriteTool/` | 全文覆写或创建新文件 |
| **NotebookEdit** | `src/tools/NotebookEditTool/` | Jupyter Notebook 单元格级编辑 |

## Edit 工具

### 输入参数

```typescript
{
  file_path: string     // 绝对路径
  old_string: string    // 要查找的精确文本
  new_string: string    // 替换文本
  replace_all: boolean  // 默认 false，是否替换所有匹配
}
```

### 核心编辑算法

`applyEditToFile()`（`src/tools/FileEditTool/utils.ts:206`）：

```typescript
export function applyEditToFile(originalContent, oldString, newString, replaceAll = false) {
  const f = replaceAll
    ? (content, search, replace) => content.replaceAll(search, () => replace)
    : (content, search, replace) => content.replace(search, () => replace)

  if (newString !== '') {
    return f(originalContent, oldString, newString)
  }

  // 删除操作的特殊处理：额外尝试去掉尾部换行
  const stripTrailingNewline =
    !oldString.endsWith('\n') && originalContent.includes(oldString + '\n')

  return stripTrailingNewline
    ? f(originalContent, oldString + '\n', newString)
    : f(originalContent, oldString, newString)
}
```

核心就是 JavaScript 原生的 `String.prototype.replace()` / `replaceAll()`。

### 多编辑管线

`getPatchForEdits()`（`utils.ts:262`）支持一次调用应用多个编辑：

- 编辑按顺序依次应用到内存中的字符串
- 防循环检查：每个 `old_string` 不能是前面某个 `new_string` 的子串
- 任何单次编辑如果没产生变化 → 抛出 `"String not found in file"`
- 所有编辑后如果内容完全没变 → 抛出 `"Original and edited file match exactly"`

### 唯一性检查

`validateInput()`（`FileEditTool.ts:137`）：

```typescript
const matches = file.split(actualOldString).length - 1
```

- `matches > 1` 且 `replace_all=false` → 拒绝，错误码 9
- 强制模型要么提供更多上下文使匹配唯一，要么显式设置 `replace_all=true`

### 弯引号处理

`findActualString()`（`utils.ts:73`）+ `normalizeQuotes()`（`utils.ts:31`）：

1. 先用原始 `old_string` 精确匹配
2. 失败则将弯引号标准化为直引号后重试：`'`/`'` → `'`，`"`/`"` → `"`
3. 通过标准化后的位置从原文件提取实际子串
4. 将 `new_string` 的引号风格对齐到原文件风格

引号类型判定启发式规则：前一个字符是空白、`(`、`[`、`{`、em-dash、en-dash → 开引号，否则闭引号。字母间的撇号（如 don't）始终转为右单弯引号。

### 反净化处理

`normalizeFileEditInput()`（`utils.ts:581`）：

模型看不到某些被净化的特殊字符串，会输出占位符：

| 模型输出 | 实际内容 |
|---------|---------|
| `<fnr>` | `<function_results>` |
| `<n>` | `<name>` |
| `\n\nH:` | `\n\nHuman:` |
| `\n\nA:` | `\n\nAssistant:` |

工具在匹配前将占位符还原。如果还原后匹配成功，同样的替换也会应用到 `new_string`。

### 尾部空格处理

`stripTrailingWhitespace()`（`utils.ts:44`）：

非 Markdown 文件（`.md`、`.mdx` 除外）的 `new_string` 自动去除尾部空格。Markdown 保留是因为双空格 = 硬换行语法。

## Write 工具

### 输入参数

```typescript
{
  file_path: string // 绝对路径
  content: string   // 完整文件内容
}
```

### 核心流程

`call()` 方法（`FileWriteTool.ts`）：

1. 读取当前文件内容（如果存在）：`readFileSyncWithMetadata()`
2. 写入新内容：`writeTextContent(fullFilePath, content, encoding, 'LF')`
3. 如果文件已存在，生成 diff 用于显示

### 验证规则

`validateInput()` 强制三个条件：

- **先读后写**：文件必须在对话中先被 Read 工具读过（通过 `readFileState` Map 跟踪）
- **过期检查**：文件修改时间不能比上次读取时间更新（说明被外部修改过）
- **完整读取**：不能只读了文件的一部分（`isPartialView` 为 false）

### 行尾处理

Write 工具始终使用 `LF` 行尾。因为模型发送的 `content` 已经包含明确的换行符，工具信任它们。

## NotebookEdit 工具

### 输入参数

```typescript
{
  notebook_path: string                          // .ipynb 绝对路径
  cell_id?: string                               // 目标单元格 ID
  new_source: string                             // 新内容
  cell_type?: 'code' | 'markdown'                // 插入时必填
  edit_mode?: 'replace' | 'insert' | 'delete'    // 默认 replace
}
```

### 核心流程

1. 解析 `.ipynb` 为 JSON → `NotebookContent` 对象
2. 通过 `id` 字段定位目标单元格（或 `cell-N` 数字索引）
3. 执行操作：
   - **replace**：设置 `targetCell.source = new_source`，重置 `execution_count` 和 `outputs`
   - **insert**：`cells.splice(cellIndex, 0, new_cell)`
   - **delete**：`cells.splice(cellIndex, 1)`
4. 序列化回 JSON（1 空格缩进）写回文件

## 共享基础设施

### 先读后写保护

所有三个工具都通过 `readFileState`（以文件路径为 key 的 Map）实现：

1. 检查 `readFileState` 中有该路径的记录
2. 比较文件当前修改时间与记录的时间戳
3. Windows 上额外比较文件内容（避免云同步/杀毒软件导致的时间戳误报）

### 文件 I/O

| 函数 | 文件 | 用途 |
|------|------|------|
| `readFileSyncWithMetadata()` | `src/utils/fileRead.ts` | 读文件 + 检测编码 + 检测行尾 |
| `writeTextContent()` | `src/utils/file.ts` | 写文件 + CRLF 处理 |
| `writeFileSyncAndFlush_DEPRECATED()` | `src/utils/file.ts` | 原子写入（临时文件 + rename） |
| `getPatchForDisplay()` | `src/utils/diff.ts` | 生成 diff 用于显示 |

### 编码检测

`readFileSyncWithMetadata` 检查前 2 字节是否是 UTF-16 LE BOM（`0xFF 0xFE`），否则默认 UTF-8。检测到的编码在读-改-写周期中保持不变。

### Diff 生成

`src/utils/diff.ts` 使用 `diff` npm 库的 `structuredPatch` 函数：

- 默认 3 行上下文
- 5 秒超时
- Tab 转 2 空格（用于显示）
- `&` 和 `$` 在 diff 前转义、diff 后反转义（`diff` 库对这两个字符处理有 bug）

---

# 五、Codex apply_patch 实现

## 架构概览

Codex 的文件编辑围绕一个核心工具 `apply_patch` 构建，使用自定义 patch 格式（不是 unified diff），通过多阶段管道解析和应用。

### 分层架构

```
┌─────────────────────────────────────────────┐
│  Tool Handler (handlers/apply_patch.rs)      │  工具调度、权限、安全
├─────────────────────────────────────────────┤
│  Safety Assessment (safety.rs)               │  沙箱路径检查
├─────────────────────────────────────────────┤
│  Patch Engine (apply-patch/src/lib.rs)       │  核心编辑逻辑
│  ├── Parser (parser.rs)                      │  解析 patch 文本
│  ├── Seek Sequence (seek_sequence.rs)        │  模糊行匹配
│  └── Streaming Parser (streaming_parser.rs)  │  流式解析
├─────────────────────────────────────────────┤
│  Filesystem Abstraction (file-system/)       │  文件读写抽象
│  └── Local FS (exec-server/)                 │  本地 + 沙箱实现
└─────────────────────────────────────────────┘
```

## Patch 格式

自定义的文件级 diff 格式（`parser.rs:1-21`）：

```
*** Begin Patch
*** Add File: path/to/new.ts
+export function hello() {
+  return "world";
+}
*** Delete File: path/to/old.ts
*** Update File: path/to/existing.ts
*** Move to: path/to/renamed.ts
@@ functionName
  unchanged context line
- old line to remove
+ new line to add
*** End Patch
```

三种操作：
- **Add File** — 创建新文件，`+` 开头的行是内容
- **Delete File** — 删除文件
- **Update File** — 修改文件，可选 `Move to` 重命名。由一个或多个 chunk 组成，`@@` 分隔

每个 chunk 中：
- 行首空格 = 上下文行（不变）
- 行首 `-` = 删除行
- 行首 `+` = 新增行
- `@@ context` = 上下文标记，用于定位

## 解析器

### `parse_patch()`（`parser.rs:128`）

两种模式：
- **严格模式**：要求精确的 `*** Begin Patch` / `*** End Patch` 分隔符
- **宽松模式**（当前默认）：额外处理 heredoc 包裹的 patch（`<<EOF ... EOF`），兼容 GPT-4.1 的输出习惯

每个 UpdateFile chunk 解析为 `UpdateFileChunk`：

```rust
struct UpdateFileChunk {
    change_context: Option<String>,  // 上下文锚定（类名/方法名）
    old_lines: Vec<String>,          // 要找的旧行
    new_lines: Vec<String>,          // 替换后的新行
    is_end_of_file: bool,            // 是否锚定到文件末尾
}
```

### `StreamingPatchParser`（`streaming_parser.rs:22`）

逐字符增量解析器，通过 `push_delta()` 接受任意大小的输入块。用于模型还在流式输出 patch 时就实时解析，每 500ms 更新一次进度。

### 调用检测（`invocation.rs:134`）

`maybe_parse_apply_patch_verified()` 识别多种调用形式：

1. 直接调用：`["apply_patch", "<patch_text>"]`
2. Shell heredoc：`["bash", "-lc", "apply_patch <<'EOF'\n...\nEOF"]`
3. 带 cd：`["bash", "-lc", "cd path && apply_patch <<'EOF'\n...\nEOF"]`
4. PowerShell/Cmd：类似的 heredoc 形式

Heredoc 提取使用 **Tree-sitter** 的 Bash 语法解析 shell 脚本 AST，精确提取 heredoc body。

## 核心编辑算法

### 四级模糊匹配 — `seek_sequence()`（`seek_sequence.rs:12`）

用于在文件内容中定位 chunk 的目标位置：

```
Pass 1: 精确匹配 — 逐字节比较 pattern 和文件对应行
Pass 2: trim trailing — 两边都 trim_end() 后比较
Pass 3: full trim — 两边都 trim() 后比较
Pass 4: Unicode 归一化 — 弯引号→直引号、长破折号→减号、不间断空格→空格
```

特殊机制：
- `eof=true` 时从文件末尾开始搜索
- 空 pattern 始终匹配
- pattern 行数 > 文件行数时立即返回 None

### 替换计算 — `compute_replacements()`（`lib.rs:694`）

对每个 chunk：
1. 如果有 `change_context` → 先用 `seek_sequence()` 定位上下文行，然后跳过
2. 如果 `old_lines` 为空（纯插入）→ 在文件末尾插入
3. 否则用 `seek_sequence()` 找到 `old_lines` 序列的位置
4. 生成 `(start_index, old_len, new_lines)` 元组

所有替换按 `start_index` 升序排列。

### 替换应用 — `apply_replacements()`（`lib.rs:786`）

**关键设计：从后往前应用**

```rust
for (start_idx, old_len, new_lines) in replacements.iter().rev() {
    lines.splice(start_idx..start_idx + old_len, new_lines.clone());
}
```

从后往前可以避免前面的增删导致后面的索引偏移。最后确保文件有尾部换行。

### 文件写入 — `apply_hunks_to_files()`（`lib.rs:364`）

- **AddFile**：写入新内容，目录不存在时递归创建
- **DeleteFile**：读取内容（用于 delta 跟踪），验证不是目录，然后删除
- **UpdateFile**：计算新内容后写入；如果指定了 `move_path`，写到新路径后删除原文件

## 边界情况处理

**尾部换行**：按 `\n` split 后丢弃末尾空元素，替换完成后重新添加尾部换行。

**EOF 空行重试**：当 `old_lines` 末尾是空字符串（表示文件末尾换行哨兵），且搜索失败时，去掉末尾空元素重试。

**缺失父目录**：`write_file_with_missing_parent_retry()`（`lib.rs:616`）捕获 `NotFound`，递归创建目录后重试。

**部分失败跟踪**：`AppliedPatchDelta` 结构跟踪哪些变更已提交。`exact` 标志在写操作可能部分修改文件时设为 false。

## 安全与沙箱

### `assess_patch_safety()`（`safety.rs`）

检查所有受影响路径是否在可写根目录内（由沙箱策略定义）。路径在项目外的 patch 可以被自动拒绝或发送给用户审批。

### 权限合并

工具处理器合并会话级/轮次级的已授予权限与沙箱策略，计算有效权限。

---

# 六、OpenCode 文件编辑实现

## 工具概览

| 工具 | 文件 | 用途 |
|------|------|------|
| **Edit** | `packages/opencode/src/tool/edit.ts` | 精确字符串替换，8 级容错匹配 |
| **Write** | `packages/opencode/src/tool/write.ts` | 全文覆写或创建新文件 |
| **Apply Patch** | `packages/opencode/src/tool/apply_patch.ts` | 结构化 patch 应用（多文件操作） |

## Edit 工具

### 输入参数

```typescript
{
  filePath: string        // 绝对路径
  oldString: string       // 要查找的文本
  newString: string       // 替换文本
  replaceAll?: boolean    // 默认 false
}
```

### 核心算法 — 八级级联匹配

`replace()` 函数（`edit.ts:674`）的核心逻辑：

```typescript
for (const replacer of [SimpleReplacer, LineTrimmedReplacer, ...]) {
  for (const search of replacer(content, oldString)) {
    const index = content.indexOf(search)
    if (index === -1) continue
    notFound = false
    if (replaceAll) return content.replaceAll(search, newString)
    // 唯一性检查
    if (content.lastIndexOf(search) !== index) continue
    return content.substring(0, index) + newString + content.substring(index + search.length)
  }
}
```

依次尝试 8 种匹配策略，匹配成功后用 `substring` 拼接执行替换。

### 八级匹配策略详解

#### 1. SimpleReplacer（`edit.ts:240`）
直接精确字符串匹配，不做任何预处理。

#### 2. LineTrimmedReplacer（`edit.ts:244`）
逐行 trim 首尾空格后匹配。适合缩进不一致的情况。

#### 3. BlockAnchorReplacer（`edit.ts:284`）
使用首行和末行作为锚点，中间用 **Levenshtein 距离**做模糊匹配：
- 单候选时阈值 0.0（精确匹配）
- 多候选时阈值 0.3（允许 30% 差异）

Levenshtein 距离实现（`edit.ts:222`）：

```typescript
function levenshtein(a: string, b: string): number {
  // 标准动态规划实现
  // dp[i][j] = a[0..i] 变换到 b[0..j] 的最小编辑距离
}
```

#### 4. WhitespaceNormalizedReplacer（`edit.ts:419`）
所有连续空白字符归一化为单个空格后匹配。

#### 5. IndentationFlexibleReplacer（`edit.ts:463`）
移除公共缩进后匹配。适合不同缩进层级的代码。

#### 6. EscapeNormalizedReplacer（`edit.ts:491`）
处理转义字符差异，如 `\n`、`\t` 等。

#### 7. TrimmedBoundaryReplacer（`edit.ts:554`）
整体 trim 首尾空白后匹配。

#### 8. ContextAwareReplacer（`edit.ts:580`）
使用首尾行作为锚点，要求中间行有 50% 相似度。

### 并发保护

使用 per-file 信号量锁（`edit.ts:35-45`），防止同时编辑同一文件导致竞态条件。

### 行尾归一化

`edit.ts:22-33` 在匹配前将 `\r\n` 统一为 `\n`。

### 错误处理

- `oldString === newString` → 报错（无意义的替换）
- 匹配不到 → 报错（`notFound` 标志）
- 多处匹配且 `replaceAll=false` → 报错

## Write 工具

### 输入参数

```typescript
{
  filePath: string   // 绝对路径
  content: string    // 完整文件内容
}
```

### 核心流程（`write.ts:46-67`）

```typescript
const exists = yield* fs.existsSafe(filepath)
const source = exists ? yield* Bom.readFile(fs, filepath) : { bom: false, text: "" }
const next = Bom.split(params.content)
const desiredBom = source.bom || next.bom
yield* afs.writeWithDirs(filepath, Bom.join(contentNew, desiredBom))
```

1. 检查文件是否存在
2. 如果存在，读取原文件的 BOM 信息
3. 合并 BOM：保留原文件的 BOM，或使用新内容中的 BOM
4. 通过 `writeWithDirs` 写入（自动创建目录）
5. 写后自动格式化（如果配置了 formatter）

### BOM 处理

`Bom`（`packages/opencode/src/util/bom.ts`）处理字节序标记：
- `Bom.readFile()` — 读文件并检测 BOM
- `Bom.split()` — 从内容中分离 BOM
- `Bom.join()` — 将 BOM 加回内容

## Apply Patch 工具

### Patch 格式（与 Codex 类似）

```
*** Begin Patch
*** Add File: <path>
+content lines
*** Update File: <path>
*** Move to: <new_path>
@@ context line
-removed lines
+added lines
*** Delete File: <path>
*** End Patch
```

### 核心流程（`apply_patch.ts:30-299`）

1. 解析 patch 文本为结构化的 hunk 列表
2. 验证文件路径和权限
3. 对每个 hunk：
   - **Add**：写入新文件
   - **Delete**：删除文件
   - **Update**：通过 `deriveNewContentsFromChunks()` 计算新内容
   - **Move**：写到新路径后删除原文件
4. 应用变更到文件系统
5. 发布事件并返回诊断信息

### Patch 应用算法（`packages/opencode/src/patch/index.ts`）

#### 序列匹配 — `seekSequence()`（`patch/index.ts:467`）

四级渐进匹配：

```
Pass 1: 精确匹配
Pass 2: trim trailing whitespace
Pass 3: trim 两端空白
Pass 4: Unicode 标点标准化
```

这与 Codex 的 `seek_sequence()` 策略几乎相同。

#### 替换计算 — `computeReplacements()`（`patch/index.ts:349`）

```typescript
function computeReplacements(originalLines, filePath, chunks) {
  for (const chunk of chunks) {
    if (chunk.change_context) {
      const contextIdx = seekSequence(originalLines, [chunk.change_context], lineIndex)
      lineIndex = contextIdx + 1
    }
    let found = seekSequence(originalLines, pattern, lineIndex, chunk.is_end_of_file)
    replacements.push([found, pattern.length, newSlice])
  }
  return replacements.sort((a, b) => a[0] - b[0])
}
```

#### 应用替换（`patch/index.ts:405`）

计算出替换元组后，按位置应用。类似 Codex 的方式。

### 边界情况

- EOF 锚定支持
- Unicode 标点标准化（`patch/index.ts:424`）
- 尾部换行处理
- BOM 保留
- 文件移动/重命名支持

---

# 七、三大工具特性对比总表

| 特性 | Claude Code | Codex | OpenCode |
|------|:-----------:|:-----:|:--------:|
| Edit 匹配策略数 | 1 | 4 | **8** |
| Levenshtein 模糊匹配 | ❌ | ❌ | ✅ |
| 并发文件锁 | ❌ | ❌ | ✅ |
| 写后自动格式化 | ❌ | ❌ | ✅ |
| BOM 处理 | 编码检测 | ❌ | ✅ (保留) |
| 原子写入 | ✅ | ❌ | ❌ |
| Patch 工具 | ❌ | ✅ | ✅ |
| 多文件单次操作 | ❌ | ✅ | ✅ |
| 文件重命名/移动 | ❌ | ✅ | ✅ |
| 文件删除 | ❌ | ✅ | ✅ |
| Notebook 编辑 | ✅ | ❌ | ❌ |
| 流式 patch 解析 | ❌ | ✅ | ❌ |
| 沙箱安全 | ❌ | ✅ | ❌ |
| 先读后写保护 | ✅ | ❌ | ❌ |
| 弯引号处理 | ✅ | ✅ | ✅ |
| 反净化处理 | ✅ | ❌ | ❌ |
| 异步 I/O | ❌ (同步) | ✅ | ✅ |

## 关键源码路径汇总

```
claude-code-src/
├── src/tools/FileEditTool/
│   ├── FileEditTool.ts      # Edit 工具主逻辑 + 唯一性检查
│   └── utils.ts             # applyEditToFile() 弯引号/反净化/多编辑管线
├── src/tools/FileWriteTool/
│   └── FileWriteTool.ts     # Write 工具 + 先读后写验证
├── src/tools/NotebookEditTool/
│   └── NotebookEditTool.ts  # Notebook 单元格编辑
├── src/utils/
│   ├── file.ts              # writeTextContent(), 原子写入 (temp + rename)
│   ├── fileRead.ts          # readFileSyncWithMetadata() 编码检测
│   ├── diff.ts              # structuredPatch 生成 diff
│   └── fsOperations.ts      # NodeFsOperations 封装

codex/codex-rs/
├── apply-patch/src/
│   ├── lib.rs               # apply_patch() 入口, compute/apply replacements
│   ├── parser.rs            # patch 格式解析器 (严格/宽松模式)
│   ├── seek_sequence.rs     # 四级模糊匹配
│   ├── streaming_parser.rs  # 流式 patch 解析器
│   ├── invocation.rs        # Tree-sitter heredoc 提取
│   └── standalone_executable.rs  # 独立二进制入口
├── core/src/
│   ├── tools/handlers/apply_patch.rs  # ToolHandler 实现
│   ├── apply_patch.rs                 # 安全评估
│   └── safety.rs                      # 沙箱路径检查
├── file-system/src/lib.rs             # ExecutorFileSystem trait
└── exec-server/src/local_file_system.rs  # DirectFileSystem (tokio::fs)

opencode/packages/
├── opencode/src/
│   ├── tool/
│   │   ├── edit.ts           # Edit 工具 + 8 级匹配策略 + Levenshtein
│   │   ├── write.ts          # Write 工具 + BOM 处理
│   │   └── apply_patch.ts    # Patch 工具入口
│   ├── patch/
│   │   └── index.ts          # Patch 应用引擎 (seekSequence, computeReplacements)
│   └── util/
│       └── bom.ts            # BOM 检测和处理
└── core/src/
    └── filesystem.ts         # AppFileSystem (writeWithDirs, 自动创建目录)
```
