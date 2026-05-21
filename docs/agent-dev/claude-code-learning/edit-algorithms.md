# Edit 工具算法对比

> 三个项目 Edit 工具的搜索替换算法详解

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

---

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

**倒序应用**（`apply_replacements()`，`lib.rs:784`）：
替换操作从后往前依次应用，避免前面的增删导致后面行号偏移。

**行级 splice**：
```
计算 (start_index, old_len, new_lines) 元组
按 start_index 排序
从后往前：删除 old_len 行，插入 new_lines
```

### 设计哲学

> 模型输出类 diff 的 patch，系统按行匹配应用。类似 `git apply` 的容错机制，适合大范围改动和多文件操作。

---

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

---

## 三者对比：容错性 vs 简洁性

```
容错性（高→低）：  OpenCode >>>>  Codex  >>  Claude Code
实现复杂度（高→低）：OpenCode >>>>  Codex  >>  Claude Code
对模型要求（高→低）：Claude Code >>  Codex  >>  OpenCode
```

- **Claude Code** 把复杂度放在模型侧（模型必须输出精确文本），自己保持代码简单
- **Codex** 用结构化 patch 格式平衡了两者，行级匹配天然容错
- **OpenCode** 把复杂度放在工具侧（8 级匹配），最大限度减少模型匹配失败的概率
