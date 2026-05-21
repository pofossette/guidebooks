# Claude Code 文件编辑实现

> Claude Code 的 FileEditTool、FileWriteTool、NotebookEditTool 完整分析

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

---

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

---

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

---

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
